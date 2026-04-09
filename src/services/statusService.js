/**
 * Status fetching service for all monitored systems.
 *
 * Each fetcher returns a normalised object:
 *   { status: 'operational' | 'degraded' | 'outage' | 'unknown', description: string }
 *
 * All requests use CORS-friendly public status APIs where available.
 * On any network or parse error the system falls back to { status: 'unknown' }.
 */

/** Map a statuspage.io `indicator` string to a normalised status. */
function indicatorToStatus(indicator) {
  if (!indicator) return 'unknown';
  switch (indicator.toLowerCase()) {
    case 'none':
      return 'operational';
    case 'minor':
      return 'degraded';
    case 'major':
    case 'critical':
      return 'outage';
    default:
      return 'unknown';
  }
}

// ── Status cache (failsafe) ───────────────────────────────────────────────────
// When a live fetch returns unknown/fails, the last successful result is used.
// This ensures the page remains useful even if one or more APIs are unreachable
// (e.g. if GitHub itself goes down, its last known status is shown).
const CACHE_KEY = 'status_cache_v1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(map) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch { /* storage full – silently skip */ }
}

export function getCachedStatus(serviceId) {
  const cache = readCache();
  const entry = cache[serviceId];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_MAX_AGE_MS) return null;
  return { ...entry.data, fromCache: true, cachedAt: entry.ts };
}

function updateCache(serviceId, data) {
  const cache = readCache();
  cache[serviceId] = { ts: Date.now(), data: { status: data.status, description: data.description } };
  writeCache(cache);
}

async function safeFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ── GitHub ──────────────────────────────────────────────────────────────────
async function fetchGitHub() {
  const data = await safeFetch('https://www.githubstatus.com/api/v2/summary.json');
  if (!data) return { status: 'unknown', description: 'Unable to reach GitHub status API' };
  const status = indicatorToStatus(data.status?.indicator);
  return { status, description: data.status?.description ?? '' };
}

// ── Salesforce (per-instance) ─────────────────────────────────────────────────
async function fetchSalesforceInstance(instanceId) {
  const data = await safeFetch(`https://api.status.salesforce.com/v1/instances/${instanceId}/status`);
  if (!data) return { status: 'unknown', description: 'Unable to reach Salesforce status API' };
  if (data.status === 'OK') return { status: 'operational', description: 'All systems operational' };
  const active = Array.isArray(data.Incidents) ? data.Incidents.filter((i) => i.isActive) : [];
  if (active.length === 0) return { status: 'operational', description: 'All systems operational' };
  const severity = active.some((i) => i.severity === 'HIGH') ? 'outage' : 'degraded';
  return { status: severity, description: active.map((i) => i.message?.maintenanceMessage ?? i.id).join('; ') };
}

// ── NetSuite (Oracle) ────────────────────────────────────────────────────────
async function fetchNetSuite() {
  const data = await safeFetch('https://status.netsuite.com/api/v2/summary.json');
  if (!data) return { status: 'unknown', description: 'Unable to reach NetSuite status API' };
  const status = indicatorToStatus(data.status?.indicator);
  return { status, description: data.status?.description ?? '' };
}

// ── Slack ────────────────────────────────────────────────────────────────────
async function fetchSlack() {
  // status.slack.com redirects to slack-status.com — hit the canonical URL directly
  const data = await safeFetch('https://slack-status.com/api/v2.0.0/current');
  if (!data) return { status: 'unknown', description: 'Unable to reach Slack status API' };
  // Handle statuspage.io-style format: { status: { indicator: '...', description: '...' } }
  if (data.status && typeof data.status === 'object') {
    return {
      status: indicatorToStatus(data.status.indicator),
      description: data.status.description ?? '',
    };
  }
  // Handle Slack's own API format: { status: 'ok' | 'active' | 'warning' }
  const raw = typeof data.status === 'string' ? data.status.toLowerCase() : '';
  if (raw === 'ok') {
    return { status: 'operational', description: 'All systems operational' };
  }
  if (raw === 'warning') {
    return { status: 'degraded', description: data.active_incidents?.[0]?.title ?? 'Service degraded' };
  }
  if (raw === 'active') {
    return { status: 'outage', description: data.active_incidents?.[0]?.title ?? 'Active incident' };
  }
  return { status: 'unknown', description: '' };
}

// ── MuleSoft (per-instance via Salesforce Trust API) ─────────────────────────
async function fetchMuleSoftInstance(instanceId) {
  return fetchSalesforceInstance(instanceId);
}

// ── Jira ─────────────────────────────────────────────────────────────────────
async function fetchJira() {
  const data = await safeFetch('https://jira-software.status.atlassian.com/api/v2/summary.json');
  if (!data) return { status: 'unknown', description: 'Unable to reach Jira status API' };
  const status = indicatorToStatus(data.status?.indicator);
  return { status, description: data.status?.description ?? '' };
}

// ── Confluence ───────────────────────────────────────────────────────────────
async function fetchConfluence() {
  const data = await safeFetch('https://confluence.status.atlassian.com/api/v2/summary.json');
  if (!data) return { status: 'unknown', description: 'Unable to reach Confluence status API' };
  const status = indicatorToStatus(data.status?.indicator);
  return { status, description: data.status?.description ?? '' };
}

// ── Google Cloud Platform ────────────────────────────────────────────────────
async function fetchGCP() {
  // GCP exposes a public JSON feed of incidents.
  const data = await safeFetch('https://status.cloud.google.com/incidents.json');
  if (!data) return { status: 'unknown', description: 'Unable to reach GCP status API' };
  const active = Array.isArray(data) ? data.filter((i) => !i.end) : [];
  if (active.length === 0) return { status: 'operational', description: 'All systems operational' };
  const severity = active.some((i) => (i.severity ?? '').toLowerCase() === 'high') ? 'outage' : 'degraded';
  const desc = active[0]?.external_desc ?? active[0]?.id ?? 'Active incident';
  return { status: severity, description: desc };
}

// ── Public API ───────────────────────────────────────────────────────────────
export const SERVICES = [
  {
    id: 'salesforce-can50',
    name: 'LSCORE (CAN50)',
    statusPageUrl: 'https://status.salesforce.com/instances/CAN50',
    fetch: () => fetchSalesforceInstance('CAN50'),
    logo: 'salesforce',
    isProd: true,
  },
  {
    id: 'salesforce-can6s',
    name: 'LSCORE FULL (CAN6S)',
    statusPageUrl: 'https://status.salesforce.com/instances/CAN6S',
    fetch: () => fetchSalesforceInstance('CAN6S'),
    logo: 'salesforce',
    isSandbox: true,
  },
  {
    id: 'salesforce-usa606',
    name: 'ShopKeep (USA606)',
    statusPageUrl: 'https://status.salesforce.com/instances/USA606',
    fetch: () => fetchSalesforceInstance('USA606'),
    logo: 'salesforce',
    isProd: true,
  },
  {
    id: 'salesforce-usa746',
    name: 'Upserve (USA746)',
    statusPageUrl: 'https://status.salesforce.com/instances/USA746',
    fetch: () => fetchSalesforceInstance('USA746'),
    logo: 'salesforce',
    isProd: true,
  },
  {
    id: 'salesforce-usa570',
    name: 'NuOrder (USA570)',
    statusPageUrl: 'https://status.salesforce.com/instances/USA570',
    fetch: () => fetchSalesforceInstance('USA570'),
    logo: 'salesforce',
    isProd: true,
  },
  {
    id: 'salesforce-deu86',
    name: 'Gastrofix (DEU86)',
    statusPageUrl: 'https://status.salesforce.com/instances/DEU86',
    fetch: () => fetchSalesforceInstance('DEU86'),
    logo: 'salesforce',
    isProd: true,
  },
  {
    id: 'netsuite',
    name: 'NetSuite',
    statusPageUrl: 'https://status.netsuite.com',
    fetch: fetchNetSuite,
    logo: 'netsuite',
  },
  {
    id: 'mulesoft-anypoint-mgmt',
    name: 'Anypoint Mgmt Center (US)',
    statusPageUrl: 'https://status.salesforce.com/instances/ANYPOINTMANAGEMENTCENTER-US',
    fetch: () => fetchMuleSoftInstance('ANYPOINTMANAGEMENTCENTER-US'),
    logo: 'mulesoft',
  },
  {
    id: 'mulesoft-anypoint-automation',
    name: 'Anypoint Automation Suite (US)',
    statusPageUrl: 'https://status.salesforce.com/instances/ANYPOINTAUTOMATIONSUITE-US',
    fetch: () => fetchMuleSoftInstance('ANYPOINTAUTOMATIONSUITE-US'),
    logo: 'mulesoft',
  },
  {
    id: 'mulesoft-runtime-plane',
    name: 'Runtime Plane (US)',
    statusPageUrl: 'https://status.salesforce.com/instances/RUNTIMEPLANE-US',
    fetch: () => fetchMuleSoftInstance('RUNTIMEPLANE-US'),
    logo: 'mulesoft',
  },
  {
    id: 'gcp',
    name: 'Google Cloud',
    statusPageUrl: 'https://status.cloud.google.com',
    fetch: fetchGCP,
    logo: 'gcp',
  },
  {
    id: 'github',
    name: 'GitHub',
    statusPageUrl: 'https://www.githubstatus.com',
    fetch: fetchGitHub,
    logo: 'github',
  },
  {
    id: 'slack',
    name: 'Slack',
    statusPageUrl: 'https://status.slack.com',
    fetch: fetchSlack,
    logo: 'slack',
  },
  {
    id: 'jira',
    name: 'Jira',
    statusPageUrl: 'https://jira-software.status.atlassian.com',
    fetch: fetchJira,
    logo: 'jira',
  },
  {
    id: 'confluence',
    name: 'Confluence',
    statusPageUrl: 'https://confluence.status.atlassian.com',
    fetch: fetchConfluence,
    logo: 'confluence',
  },
];

// ── Salesforce Org Limits ────────────────────────────────────────────────────
/**
 * Fetches all Salesforce org limits via the REST API.
 * Requires a valid access token and the org's instance URL.
 * The org must have the dashboard's origin added to its CORS allowed-origins list
 * (Setup → Security → CORS).
 *
 * @param {string} instanceUrl  e.g. "https://myorg.my.salesforce.com"
 * @param {string} accessToken  Bearer token / session ID
 * @param {string} apiVersion   e.g. "v63.0"
 * @returns {Promise<Record<string, { Max: number, Remaining: number }>>}
 */
export async function fetchSalesforceLimits(instanceUrl, accessToken, apiVersion = 'v66.0') {
  const isDev = import.meta.env.DEV;
  const sfPath = `/services/data/${apiVersion}/limits/`;
  const url = isDev
    ? `/sf-proxy${sfPath}`
    : `${instanceUrl.replace(/\/$/, '')}${sfPath}`;

  const headers = { Accept: 'application/json' };
  if (isDev) {
    // Proxy resolves credentials from .env.local; only add headers when values exist
    if (instanceUrl) headers['X-SF-Instance-Url'] = instanceUrl.replace(/\/$/, '');
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  } else {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (res.status === 401) {
      const err = new Error('Your access token has expired or is invalid. Please update it.');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    if (res.status === 403) {
      const err = new Error('Request was forbidden (HTTP 403).');
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (res.status === 404) {
      const err = new Error(`API version ${apiVersion} was not found on this org. Try a different API version.`);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`Unexpected response: HTTP ${res.status}.`);
      err.code = 'HTTP_ERROR';
      err.httpStatus = res.status;
      throw err;
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      const err = new Error('Request timed out after 12 seconds.');
      err.code = 'TIMEOUT';
      throw err;
    }
    // TypeError: Failed to fetch — in dev this shouldn't happen (proxy is local),
    // in production it means CORS or network.
    if (e instanceof TypeError && e.message.toLowerCase().includes('fetch')) {
      const err = new Error(
        isDev
          ? 'Could not reach the local Vite proxy. Make sure the dev server is running.'
          : 'Network request blocked – likely a CORS restriction.',
      );
      err.code = isDev ? 'PROXY_DOWN' : 'CORS_OR_NETWORK';
      throw err;
    }
    throw e;
  }
}

export async function fetchAllStatuses() {
  const results = await Promise.allSettled(SERVICES.map((s) => s.fetch()));
  return SERVICES.map((service, i) => {
    const result = results[i];
    let data =
      result.status === 'fulfilled'
        ? result.value
        : { status: 'unknown', description: 'Failed to fetch status' };

    if (data.status !== 'unknown') {
      // Persist successful results so they can be used as a fallback
      updateCache(service.id, data);
    } else {
      // Live fetch failed — try the cache
      const cached = getCachedStatus(service.id);
      if (cached) data = cached;
    }

    return { ...service, ...data };
  });
}
