import { useState, useEffect, useCallback } from 'react';
import GaugeChart from './GaugeChart';
import { fetchSalesforceLimits } from '../services/statusService';

const STORAGE_KEY = 'sf_limits_config';
// New multi-org key — migrates automatically from old single-org key
const ORGS_KEY = 'sf_limits_orgs';
const API_VERSIONS = ['v69.0','v68.0','v67.0','v66.0','v65.0','v64.0','v63.0','v62.0','v61.0','v60.0'];

// Gauge grid uses minmax(155px, 1fr); assume ~6 columns on a typical wide screen.
// 2 rows × 6 cols = 12 items shown when collapsed.
const COLLAPSED_COUNT = 12;

/** Convert camelCase API key to human-readable label */
function formatKey(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function loadOrgs() {
  try {
    const raw = localStorage.getItem(ORGS_KEY);
    if (raw) return JSON.parse(raw);
    // Migrate from old single-org storage
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      const cfg = JSON.parse(legacy);
      const migrated = [{ ...cfg, id: crypto.randomUUID(), label: 'My Org' }];
      localStorage.setItem(ORGS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

function saveOrgs(orgs) {
  try { localStorage.setItem(ORGS_KEY, JSON.stringify(orgs)); } catch {}
}

const BLANK_FORM = { label: '', instanceUrl: '', accessToken: '', apiVersion: 'v66.0' };

// ── Mock data ────────────────────────────────────────────────────────────────
const MOCK_LIMITS = {
  DataStorageMB:                        { Max: 546059,      Remaining: -36182     },
  DailyDurableStreamingApiEvents:       { Max: 1000000,     Remaining: 307684     },
  PermissionSets:                       { Max: 1500,        Remaining: 647        },
  DailyApiBatches:                      { Max: 15000,       Remaining: 7865       },
  DailyAsyncApexExecutions:             { Max: 2904600,     Remaining: 2234060    },
  DailyStandardVolumePlatformEvents:    { Max: 50000,       Remaining: 39044      },
  DailyApiRequests:                     { Max: 9688400,     Remaining: 7822824    },
  FileStorageMB:                        { Max: 4251888,     Remaining: 3604852    },
  HourlyAsyncReportRuns:                { Max: 1200,        Remaining: 1077       },
  MonthlyPlatformEventsUsageEntitlement:{ Max: 4500000,     Remaining: 4167550    },
  MaxContentDocumentsLimit:             { Max: 30000000,    Remaining: 28233868   },
  DurableStreamingApiConcurrentClients: { Max: 2000,        Remaining: 1913       },
  DailyBulkV2QueryJobs:                 { Max: 10000,       Remaining: 9667       },
  DailyDeliveredPlatformEvents:         { Max: 550000,      Remaining: 535930     },
  DailyAnalyticsDataflowJobExecutions:  { Max: 60,          Remaining: 59         },
  ActiveOrgSnapshots:                   { Max: 100,         Remaining: 99         },
  ExternalServicesRegistrations:        { Max: 700,         Remaining: 694        },
  ContentPublicationLimit:              { Max: 200000,      Remaining: 198524     },
  ExternalServicesObjects:              { Max: 10000,       Remaining: 9944       },
  DailyDurableGenericStreamingApiEvents:{ Max: 1000000,     Remaining: 995435     },
  DailyApexCursorLimit:                 { Max: 10000,       Remaining: 9962       },
  ExternalServicesOperations:           { Max: 10000,       Remaining: 9975       },
  HourlyPublishedPlatformEvents:        { Max: 275000,      Remaining: 274432     },
  ExternalServicesActiveObjects:        { Max: 3000,        Remaining: 2996       },
  SingleEmail:                          { Max: 15000,       Remaining: 14987      },
  DailyBulkV2QueryFileStorageMB:        { Max: 976562,      Remaining: 975935     },
  HourlyPublishedStandardVolumePlatformEvents: { Max: 100000, Remaining: 99952   },
  ExternalServicesActiveOperations:     { Max: 3000,        Remaining: 2999       },
  ExternalServicesObjectProperties:     { Max: 400000,      Remaining: 399944     },
  ScheduledPathRunLimit:                { Max: 2904700,     Remaining: 2504452    },
  DailyWorkflowEmails:                  { Max: 2000000,     Remaining: 1999940    },
  ActiveScratchOrgs:                    { Max: 100,         Remaining: 100        },
  ConcurrentAsyncGetReportInstances:    { Max: 200,         Remaining: 200        },
};

const PLACEHOLDER_KEYS = Array.from({ length: 12 }, (_, i) => `placeholder-${i}`);

// ── Diagnostic panel (unchanged) ─────────────────────────────────────────────
const DIAGNOSTIC_STEPS = {
  CORS_OR_NETWORK: {
    title: 'Request blocked – likely a CORS restriction',
    summary: 'The browser blocked this request. This almost always means your dashboard origin is not in the Salesforce CORS allowlist.',
    steps: [
      { label: 'Add your origin to Salesforce CORS', detail: (origin) => `Setup → Security → CORS → New. Add "${origin}" as an Allowed Origin. Save, then retry.` },
      { label: 'Check Remote Site Settings', detail: (instanceUrl) => `Setup → Security → Remote Site Settings. Make sure "${instanceUrl}" is in the list and Active.` },
      { label: 'Verify the Instance URL format', detail: () => 'Must start with https:// and be your exact My Domain URL — no trailing slash.' },
      { label: 'Open the endpoint in this browser', detail: (_, limitsUrl) => `Try opening ${limitsUrl} in a new tab to verify the URL is correct.` },
    ],
  },
  UNAUTHORIZED: {
    title: 'Access token expired or invalid (HTTP 401)',
    summary: 'Salesforce rejected the token. Session IDs from Salesforce Inspector expire when the session ends.',
    steps: [
      { label: 'Get a fresh access token', detail: () => 'Open Salesforce Inspector Reloaded → click your name → copy the Session ID. Paste it and retry.' },
      { label: 'Check token format', detail: () => 'The token should start with "00D" and be a long string with no leading/trailing spaces.' },
    ],
  },
  FORBIDDEN: {
    title: 'Access forbidden (HTTP 403)',
    summary: 'The request reached Salesforce but was rejected.',
    steps: [
      { label: 'Check IP Restrictions', detail: () => 'Setup → Security → Network Access. Add your current IP to the trusted range if missing.' },
      { label: 'Verify API Access', detail: () => 'Setup → Users → your profile → check "API Enabled" is ticked.' },
    ],
  },
  NOT_FOUND: {
    title: 'API endpoint not found (HTTP 404)',
    summary: 'The API version you selected may not be enabled on this org.',
    steps: [
      { label: 'Try a lower API version', detail: () => 'Open ⚙ Configure and select a lower API version such as v60.0, then retry.' },
      { label: 'Verify the Instance URL', detail: () => 'Must be the My Domain URL as shown in Salesforce Inspector.' },
    ],
  },
  TIMEOUT: {
    title: 'Request timed out',
    summary: 'No response received within 12 seconds.',
    steps: [
      { label: 'Check your network connection', detail: () => 'Make sure you can reach the Salesforce org from your current network.' },
      { label: 'Verify the Instance URL is reachable', detail: (_, limitsUrl) => `Try opening ${limitsUrl} in a new tab.` },
    ],
  },
  UNKNOWN: {
    title: 'Unexpected error',
    summary: 'An unknown error occurred.',
    steps: [{ label: 'Check the browser console', detail: () => 'Open DevTools (F12) → Console tab for the full error message.' }],
  },
};

function DiagnosticPanel({ error, config, onRetry, onDemo }) {
  const [copied, setCopied] = useState(false);
  const limitsUrl = config
    ? `${config.instanceUrl.replace(/\/$/, '')}/services/data/${config.apiVersion}/limits/`
    : '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const info = DIAGNOSTIC_STEPS[error.code] ?? DIAGNOSTIC_STEPS.UNKNOWN;

  function copyCurl() {
    const cmd = `curl -s -H "Authorization: Bearer <YOUR_TOKEN>" "${limitsUrl}"`;
    navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="sf-diag" role="alert" aria-label="Diagnostic information">
      <div className="sf-diag__header">
        <span className="sf-diag__icon" aria-hidden="true">⚠</span>
        <div>
          <p className="sf-diag__title">{info.title}</p>
          <p className="sf-diag__summary">{info.summary}</p>
        </div>
      </div>
      {limitsUrl && (
        <div className="sf-diag__url-row">
          <span className="sf-diag__url-label">Endpoint attempted:</span>
          <code className="sf-diag__url">{limitsUrl}</code>
          {navigator.clipboard && (
            <button className="sf-diag__copy-btn" onClick={copyCurl} type="button">
              {copied ? '✓ Copied' : 'Copy curl'}
            </button>
          )}
        </div>
      )}
      <ol className="sf-diag__steps">
        {info.steps.map((s, i) => (
          <li key={i} className="sf-diag__step">
            <span className="sf-diag__step-label">{s.label}</span>
            <span className="sf-diag__step-detail">{s.detail(origin || limitsUrl, limitsUrl)}</span>
          </li>
        ))}
      </ol>
      <div className="sf-diag__actions">
        <button className="btn-refresh" onClick={onRetry} type="button">⟳ Retry</button>
        <button className="btn-config btn-config--demo" onClick={onDemo} type="button">▶ Load Demo Data</button>
        <a className="sf-diag__link" href="https://help.salesforce.com/s/articleView?id=sf.extend_code_cors.htm" target="_blank" rel="noopener noreferrer">Salesforce CORS docs ↗</a>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SalesforceOrgLimits() {
  const [orgs, setOrgs] = useState(loadOrgs);
  const [activeOrgId, setActiveOrgId] = useState(() => loadOrgs()[0]?.id ?? null);
  const [showConfig, setShowConfig] = useState(() => loadOrgs().length === 0);
  // 'add' | 'edit' | null
  const [configMode, setConfigMode] = useState(() => loadOrgs().length === 0 ? 'add' : null);
  const [form, setForm] = useState(BLANK_FORM);

  const [limitsMap, setLimitsMap] = useState({}); // orgId → limits data
  const [loadingId, setLoadingId] = useState(null);
  const [errorMap, setErrorMap] = useState({});   // orgId → error
  const [demoId, setDemoId] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');
  const [expanded, setExpanded] = useState(false);

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null;

  const doFetch = useCallback(async (org) => {
    if (!org?.instanceUrl || !org?.accessToken) return;
    setLoadingId(org.id);
    setErrorMap((m) => { const n = { ...m }; delete n[org.id]; return n; });
    setDemoId(null);
    try {
      const data = await fetchSalesforceLimits(org.instanceUrl, org.accessToken, org.apiVersion);
      setLimitsMap((m) => ({ ...m, [org.id]: data }));
    } catch (e) {
      setErrorMap((m) => ({ ...m, [org.id]: { message: e.message ?? 'Failed to fetch.', code: e.code ?? 'UNKNOWN' } }));
    } finally {
      setLoadingId(null);
    }
  }, []);

  function loadDemo() {
    if (!activeOrg) return;
    setLimitsMap((m) => ({ ...m, [activeOrg.id]: MOCK_LIMITS }));
    setDemoId(activeOrg.id);
    setErrorMap((m) => { const n = { ...m }; delete n[activeOrg.id]; return n; });
    setShowConfig(false);
    setConfigMode(null);
  }

  // Auto-fetch all saved orgs on mount
  useEffect(() => {
    orgs.forEach((o) => doFetch(o));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openAddForm() {
    setForm(BLANK_FORM);
    setConfigMode('add');
    setShowConfig(true);
  }

  function openEditForm() {
    if (!activeOrg) return;
    setForm({ label: activeOrg.label, instanceUrl: activeOrg.instanceUrl, accessToken: activeOrg.accessToken, apiVersion: activeOrg.apiVersion });
    setConfigMode('edit');
    setShowConfig(true);
  }

  function handleSave(e) {
    e.preventDefault();
    const trimmed = {
      label: form.label.trim() || 'Org',
      instanceUrl: form.instanceUrl.replace(/\/$/, '').trim(),
      accessToken: form.accessToken.trim(),
      apiVersion: form.apiVersion,
    };
    let updatedOrgs;
    if (configMode === 'add') {
      const newOrg = { ...trimmed, id: crypto.randomUUID() };
      updatedOrgs = [...orgs, newOrg];
      setOrgs(updatedOrgs);
      setActiveOrgId(newOrg.id);
      saveOrgs(updatedOrgs);
      setShowConfig(false);
      setConfigMode(null);
      doFetch(newOrg);
    } else {
      updatedOrgs = orgs.map((o) => o.id === activeOrg.id ? { ...o, ...trimmed } : o);
      setOrgs(updatedOrgs);
      saveOrgs(updatedOrgs);
      setShowConfig(false);
      setConfigMode(null);
      doFetch({ ...activeOrg, ...trimmed });
    }
  }

  function handleRemoveOrg() {
    if (!activeOrg) return;
    const updated = orgs.filter((o) => o.id !== activeOrg.id);
    setOrgs(updated);
    saveOrgs(updated);
    setLimitsMap((m) => { const n = { ...m }; delete n[activeOrg.id]; return n; });
    setErrorMap((m) => { const n = { ...m }; delete n[activeOrg.id]; return n; });
    setActiveOrgId(updated[0]?.id ?? null);
    setShowConfig(updated.length === 0);
    setConfigMode(updated.length === 0 ? 'add' : null);
  }

  const activeLimits = activeOrg ? limitsMap[activeOrg.id] ?? null : null;
  const activeError  = activeOrg ? errorMap[activeOrg.id]  ?? null : null;
  const isLoading    = activeOrg ? loadingId === activeOrg.id : false;
  const isDemo       = activeOrg ? demoId === activeOrg.id : false;

  const limitEntries = activeLimits
    ? Object.entries(activeLimits)
        .filter(([, v]) => v && typeof v.Max === 'number' && v.Max > 0)
        .sort(([keyA, a], [keyB, b]) => {
          if (sortOrder === 'alpha') return keyA.localeCompare(keyB);
          const pctA = (a.Max - a.Remaining) / a.Max;
          const pctB = (b.Max - b.Remaining) / b.Max;
          return sortOrder === 'desc' ? pctB - pctA : pctA - pctB;
        })
    : [];

  const visibleEntries = expanded ? limitEntries : limitEntries.slice(0, COLLAPSED_COUNT);
  const hiddenCount = limitEntries.length - COLLAPSED_COUNT;

  return (
    <section className="sf-limits" aria-label="Salesforce Org Limits">
      {/* ── Section header ── */}
      <div className="sf-limits__header">
        <div>
          <h2 className="sf-limits__title">
            <span className="sf-limits__title-icon" aria-hidden="true">☁</span>
            Salesforce Org Limits
          </h2>
          <p className="sf-limits__subtitle">
            {activeOrg
              ? `${activeOrg.instanceUrl} · API ${activeOrg.apiVersion}`
              : 'Add an org to view limits'}
          </p>
        </div>
        <div className="sf-limits__actions">
          {activeOrg && !showConfig && (
            <button className="btn-refresh" onClick={() => doFetch(activeOrg)} disabled={isLoading} aria-label="Refresh limits">
              {isLoading ? '⟳ Refreshing…' : '⟳ Refresh'}
            </button>
          )}
          <button className="btn-config btn-config--demo" onClick={loadDemo} type="button">▶ Demo</button>
          <button className="btn-config" onClick={openAddForm} type="button">＋ Add Org</button>
          {activeOrg && (
            <button className="btn-config" onClick={showConfig && configMode === 'edit' ? () => { setShowConfig(false); setConfigMode(null); } : openEditForm} type="button">
              {showConfig && configMode === 'edit' ? '✕ Close' : '⚙ Edit'}
            </button>
          )}
        </div>
      </div>

      {/* ── Org tabs ── */}
      {orgs.length > 0 && (
        <div className="sf-org-tabs" role="tablist" aria-label="Salesforce orgs">
          {orgs.map((org) => (
            <button
              key={org.id}
              role="tab"
              aria-selected={org.id === activeOrg?.id}
              className={`sf-org-tab${org.id === activeOrg?.id ? ' sf-org-tab--active' : ''}`}
              onClick={() => { setActiveOrgId(org.id); setShowConfig(false); setConfigMode(null); }}
              type="button"
            >
              {org.label}
              {loadingId === org.id && <span className="sf-org-tab__spinner" aria-hidden="true"> ⟳</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── Config form ── */}
      {showConfig && (
        <form className="sf-config" onSubmit={handleSave} autoComplete="off" noValidate>
          <h3 className="sf-config__title">{configMode === 'add' ? 'Add Salesforce Org' : `Edit: ${activeOrg?.label}`}</h3>
          <div className="sf-config__fields">
            <div className="sf-config__field">
              <label className="sf-config__label" htmlFor="sf-org-label">Org Label</label>
              <input id="sf-org-label" type="text" className="sf-config__input" placeholder="e.g. LSCORE PROD" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
            </div>
            <div className="sf-config__field">
              <label className="sf-config__label" htmlFor="sf-instance-url">Instance URL</label>
              <input id="sf-instance-url" type="url" className="sf-config__input" placeholder="https://yourorg.my.salesforce.com" value={form.instanceUrl} onChange={(e) => setForm((f) => ({ ...f, instanceUrl: e.target.value }))} required />
            </div>
            <div className="sf-config__field">
              <label className="sf-config__label" htmlFor="sf-access-token">Access Token / Session ID</label>
              <input id="sf-access-token" type="password" className="sf-config__input" placeholder="00D…" value={form.accessToken} onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} required />
            </div>
            <div className="sf-config__field">
              <label className="sf-config__label" htmlFor="sf-api-version">API Version</label>
              <select id="sf-api-version" className="sf-config__input" value={form.apiVersion} onChange={(e) => setForm((f) => ({ ...f, apiVersion: e.target.value }))}>
                {API_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="sf-config__actions">
            <button type="submit" className="btn-refresh">Save &amp; Fetch Limits</button>
            <button type="button" className="btn-config" onClick={() => { setShowConfig(false); setConfigMode(null); }}>Cancel</button>
            {configMode === 'edit' && activeOrg && (
              <button type="button" className="btn-config btn-config--danger" onClick={handleRemoveOrg}>Remove Org</button>
            )}
            <p className="sf-config__note">
              <strong>Dev mode:</strong> Requests route through the local Vite proxy — token travels <em>localhost → Salesforce</em> only. Credentials stored in browser local storage.
            </p>
          </div>
        </form>
      )}

      {/* ── Error panel ── */}
      {activeError && <DiagnosticPanel error={activeError} config={activeOrg} onRetry={() => doFetch(activeOrg)} onDemo={loadDemo} />}

      {/* ── Demo banner ── */}
      {isDemo && (
        <div className="sf-demo-banner" role="status">
          <span aria-hidden="true">🧪</span>
          Demo mode — showing sample data.
          {activeOrg && <button className="sf-demo-banner__btn" onClick={() => doFetch(activeOrg)} type="button">Load real data ↗</button>}
        </div>
      )}

      {/* ── Empty prompt ── */}
      {orgs.length === 0 && !showConfig && (
        <div className="sf-limits__empty">
          <p>No orgs configured yet.</p>
          <p className="sf-limits__empty-hint">
            <button className="sf-limits__demo-link" onClick={openAddForm} type="button">Add your first org</button>
            {' or '}
            <button className="sf-limits__demo-link" onClick={loadDemo} type="button">load demo data</button>.
          </p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {isLoading && !activeLimits && (
        <div className="gauge-grid">
          {PLACEHOLDER_KEYS.map((k) => <GaugeChart key={k} label="Loading…" max={100} remaining={100} loading />)}
        </div>
      )}

      {/* ── Gauge grid ── */}
      {limitEntries.length > 0 && (
        <>
          <div className="sf-limits__sort-bar">
            <span className="sf-limits__sort-label">Sort:</span>
            <button className={`btn-sort${sortOrder === 'desc' ? ' btn-sort--active' : ''}`} onClick={() => setSortOrder('desc')} type="button">↓ Highest</button>
            <button className={`btn-sort${sortOrder === 'asc'  ? ' btn-sort--active' : ''}`} onClick={() => setSortOrder('asc')}  type="button">↑ Lowest</button>
            <button className={`btn-sort${sortOrder === 'alpha' ? ' btn-sort--active' : ''}`} onClick={() => setSortOrder('alpha')} type="button">A–Z</button>
            <span className="sf-limits__sort-count">{limitEntries.length} limits</span>
          </div>

          <div className="gauge-grid">
            {visibleEntries.map(([key, val]) => (
              <GaugeChart key={key} label={formatKey(key)} max={val.Max} remaining={val.Remaining} />
            ))}
          </div>

          {limitEntries.length > COLLAPSED_COUNT && (
            <button
              className="sf-limits__expand-btn"
              onClick={() => setExpanded((v) => !v)}
              type="button"
            >
              {expanded
                ? '▲ Show less'
                : `▼ Show ${hiddenCount} more limit${hiddenCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

