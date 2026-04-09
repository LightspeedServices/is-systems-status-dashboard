import { useState, useEffect, useCallback } from 'react';
import { SERVICES, fetchAllStatuses } from './services/statusService';
import StatusCard from './components/StatusCard';
import SalesforceOrgLimits from './components/SalesforceOrgLimits';
import './App.css';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function buildLoadingState() {
  return SERVICES.map((s) => ({ ...s, status: 'unknown', description: '', loading: true }));
}

function formatTimestamp(date) {
  if (!date) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatAge(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

function CacheBanner({ services }) {
  const stale = services.filter((s) => s.fromCache);
  if (!stale.length) return null;
  const oldest = Math.min(...stale.map((s) => s.cachedAt));
  return (
    <div className="banner banner--cache" role="status">
      <span className="banner__icon">⏱</span>
      {stale.length === 1 ? stale[0].name : `${stale.length} services`} unreachable — showing
      last known status from {formatAge(oldest)}.
    </div>
  );
}

function OverallBanner({ services }) {
  const hasOutage = services.some((s) => s.status === 'outage');
  const hasDegraded = services.some((s) => s.status === 'degraded');
  const allLoading = services.every((s) => s.loading);

  if (allLoading) return null;

  if (hasOutage) {
    return (
      <div className="banner banner--outage" role="alert">
        <span className="banner__icon">⚠</span>
        One or more systems are experiencing an outage.
      </div>
    );
  }
  if (hasDegraded) {
    return (
      <div className="banner banner--degraded" role="alert">
        <span className="banner__icon">⚠</span>
        One or more systems are experiencing degraded performance.
      </div>
    );
  }
  return (
    <div className="banner banner--operational" role="status">
      <span className="banner__icon">✓</span>
      All systems operational.
    </div>
  );
}

export default function App() {
  const [services, setServices] = useState(buildLoadingState);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Incrementing this value triggers the fetch effect to re-run.
  const [refreshKey, setRefreshKey] = useState(0);

  // Manual refresh: reset cards to loading, then bump the key to re-trigger the effect.
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setServices(buildLoadingState());
    setRefreshKey((k) => k + 1);
  }, []);

  // Fetch statuses whenever refreshKey changes (initial load + manual/auto refresh).
  // setState calls here are intentionally deferred to the async .then() callback,
  // not in the synchronous effect body, which keeps renders predictable.
  useEffect(() => {
    let cancelled = false;

    fetchAllStatuses().then((results) => {
      if (!cancelled) {
        setServices(results.map((r) => ({ ...r, loading: false })));
        setLastUpdated(new Date());
        setRefreshing(false);
      }
    });

    // Auto-refresh by bumping the key on an interval; the state update is minimal.
    const timer = setInterval(
      () => setRefreshKey((k) => k + 1),
      REFRESH_INTERVAL_MS,
    );

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshKey]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__title-row">
            <div className="app-header__icon" aria-hidden="true">🖥</div>
            <div>
              <h1 className="app-header__title">Systems Status Dashboard</h1>
              <p className="app-header__subtitle">Real-time status of core business systems</p>
            </div>
          </div>
          <div className="app-header__meta">
            <span className="app-header__updated">
              Last updated: <strong>{formatTimestamp(lastUpdated)}</strong>
            </span>
            <button
              className="btn-refresh"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh all statuses"
            >
              {refreshing ? '⟳ Refreshing…' : '⟳ Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <OverallBanner services={services} />
        <CacheBanner services={services} />
        <div className="status-grid" role="list" aria-label="System statuses">
          {services.map((service) => (
            <div key={service.id} role="listitem">
              <StatusCard service={service} />
            </div>
          ))}
        </div>

        <SalesforceOrgLimits />
      </main>

      <footer className="app-footer">
        <p>
          Status data is fetched directly from each service&apos;s official public status API.
          Auto-refreshes every 5 minutes.
        </p>
      </footer>
    </div>
  );
}
