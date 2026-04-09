# Developer Reference — Systems Status Dashboard

This document covers the technical internals of the project: what each file does, the functions it contains, and the language/framework it uses.

For the user-facing overview, setup, and monitor-display instructions see [README.md](README.md).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI framework | React 19 (JSX) |
| Build tool / dev server | Vite |
| Styling | Plain CSS (custom properties, no framework) |
| Language | JavaScript (ES2022+) |
| Runtime | Browser (SPA) + Node.js (Vite dev server only) |
| Package manager | npm |

---

## File-by-File Reference

### `index.html`
**Language:** HTML  
**Role:** Single-page app shell and security boundary.

The only HTML file in the project. It mounts the React app via `<div id="root">` and the `src/main.jsx` module script.

**Notable content:**
- `<meta http-equiv="Content-Security-Policy" ...>` — hard-codes an allowlist of trusted origins:
  - `script-src 'self'` — no inline scripts, no CDN scripts
  - `connect-src` — restricted to the exact external API domains the dashboard contacts (GitHub, Salesforce, NetSuite, Slack, Atlassian, GCP). Any domain not listed is blocked by the browser.
- No external stylesheet or font CDN links — all styles are bundled by Vite.

---

### `vite.config.js`
**Language:** JavaScript (Node.js, CommonJS-compatible ESM)  
**Role:** Vite build configuration + development-only Salesforce reverse proxy.

#### `salesforceProxyPlugin(envToken, envInstanceUrl)` → Vite plugin object
A custom Vite plugin that adds an Express-style middleware on the dev server under `/sf-proxy/*`. This routes Salesforce API calls through Node.js so the browser never has to make a cross-origin request, bypassing CORS entirely.

| Route | Behaviour |
|-------|-----------|
| `GET /sf-proxy/ping` | Returns a JSON config-check: whether `SF_ACCESS_TOKEN` and `SF_INSTANCE_URL` are set in `.env.local`, and what the resolved instance URL is. |
| `GET /sf-proxy/services/data/vX.X/limits/` | Validates instance URL domain, constructs the outbound HTTPS request to Salesforce, streams the response back. |
| Any other path | Returns `403 Forbidden`. |
| Any non-GET method | Returns `405 Method Not Allowed`. |

**Security controls built into the proxy:**

| Control | Implementation |
|---------|----------------|
| GET-only | `req.method !== 'GET'` guard at the top of the middleware |
| Path allow-list | Regex `/^\/services\/data\/v\d+\.\d+\/limits\/$/` — only the Org Limits endpoint is reachable |
| Domain allow-list | Parsed hostname checked against `*.salesforce.com`, `*.force.com`, `*.cloudforce.com` — any other domain returns 403 |
| Credentials never in browser | `loadEnv` is called with `'SF'` prefix stripped — vars without `VITE_` prefix are not injected into the client bundle |

**Credential resolution order:**
1. `SF_ACCESS_TOKEN` / `SF_INSTANCE_URL` from `.env.local` (read at Vite startup via `loadEnv`)
2. `Authorization` / `X-SF-Instance-Url` request headers sent from the browser form as fallback

#### `defineConfig` export
Standard Vite config. Applies `react()` plugin for JSX transform and registers `salesforceProxyPlugin` with the resolved env vars.

---

### `.env.local.example`
**Language:** `.env` (shell variable syntax)  
**Role:** Template showing which environment variables are needed for local development.

Copy to `.env.local` (which is gitignored) and fill in:

```
SF_INSTANCE_URL=https://yourorg.my.salesforce.com
SF_ACCESS_TOKEN=00D...
```

Variables prefixed `SF_` (no `VITE_` prefix) are read only by the Node.js Vite process. They are never embedded into the browser bundle, even if the build command is run.

---

### `package.json`
**Language:** JSON  
**Role:** npm manifest — dependency declarations and script shortcuts.

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Start dev server with HMR and Salesforce proxy |
| `build` | `vite build` | Produce optimised production bundle in `dist/` |
| `preview` | `vite preview` | Serve the `dist/` bundle locally to verify the build |
| `lint` | `eslint .` | Run ESLint across all source files |

Key dependencies: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`.

---

### `src/main.jsx`
**Language:** JavaScript + JSX  
**Role:** React entry point.

Calls `ReactDOM.createRoot` on `#root` and renders `<App />` wrapped in `<React.StrictMode>`. Imports `index.css` to inject global CSS variables.

No application logic lives here.

---

### `src/index.css`
**Language:** CSS  
**Role:** Global CSS custom properties (design tokens) and base resets.

Defines the light theme via `:root` variables:

| Variable | Value | Usage |
|----------|-------|-------|
| `--color-bg` | `#f0f4f9` | Page background |
| `--color-surface` | `#ffffff` | Card / panel background |
| `--color-text-primary` | `#1a1d2e` | Body text, card headings |
| `--color-text-secondary` | `#5c6370` | Subtitles, labels |
| `--color-text-muted` | `#8b95a3` | Timestamps, meta text |
| `--color-border` | `#e2e8f0` | Card borders, dividers |
| `--color-accent` | `#0176d3` | Salesforce blue — links, interactive accent |

Also sets `box-sizing: border-box`, removes default margin on `body`, and sets base font to the system font stack.

---

### `src/App.css`
**Language:** CSS  
**Role:** All component-level styles for the app shell, header, cards, badges, banners, and gauges.

Key sections:

| Section | Classes | Notes |
|---------|---------|-------|
| Header | `.app-header`, `.app-header__title`, `.app-header__subtitle`, `.app-header__updated` | Dark navy gradient background; title/subtitle text forced to white regardless of CSS vars |
| Refresh button | `.btn-refresh` | Circular icon button in the header meta area |
| Grid | `.status-grid` | CSS `auto-fill` grid, min column width 260 px |
| Cards | `.status-card`, `.status-card--prod` | White surface, subtle border; prod variant adds warm amber tint |
| Badges | `.badge`, `.badge--operational`, `.badge--degraded`, `.badge--outage`, `.badge--unknown` | Coloured pill with dot indicator |
| PROD badge | `.prod-badge` | Amber chip shown next to the name on production instances |
| Banners | `.banner`, `.banner--outage`, `.banner--degraded`, `.banner--ok`, `.banner--cache` | Full-width alert strips at the top of the page content |
| Gauge grid | `.gauge-grid` | CSS grid for Org Limits gauge tiles |
| Sort bar | `.sort-bar` | Row of sort buttons above the gauge grid |

---

### `src/App.jsx`
**Language:** JavaScript + JSX  
**Role:** Root React component. Owns the global refresh cycle, banner state, and top-level layout.

#### Internal functions

| Function | Type | Purpose |
|----------|------|---------|
| `buildLoadingState()` | Helper | Maps the `SERVICES` array to initial objects with `status: 'unknown'` and `loading: true` |
| `formatTimestamp(date)` | Helper | Formats a `Date` object as `HH:MM:SS` using `toLocaleTimeString` |
| `formatAge(ts)` | Helper | Converts a Unix ms timestamp to a human string: `"just now"`, `"4m ago"`, `"2h ago"` |
| `CacheBanner({ services })` | Component | Renders a stale-data warning strip when any service has `fromCache: true`. Shows how many services are affected and the age of the oldest cached entry |
| `OverallBanner({ services })` | Component | Renders an outage or degraded banner based on the worst status across all services. Returns `null` while data is still loading |
| `App()` | Root component | Manages `services` state, `lastUpdated` timestamp, and the 5-minute `setInterval` refresh cycle. Calls `fetchAllStatuses()` on mount and on manual refresh. Renders header, banners, grid, and `SalesforceOrgLimits` section |

**Refresh cycle:**  
`useEffect` sets a 5-minute interval (`REFRESH_INTERVAL_MS = 300 000 ms`). The `useCallback`-memoised `refresh()` function calls `fetchAllStatuses()` and merges results with the previous state — preserving `fromCache` and `cachedAt` fields from the service layer.

---

### `src/services/statusService.js`
**Language:** JavaScript (ES modules)  
**Role:** All external data fetching, the SERVICES registry, and the localStorage cache system.

#### Cache system

| Function | Exported | Purpose |
|----------|----------|---------|
| `readCache()` | No | Reads and JSON-parses `status_cache_v1` from `localStorage`. Returns `{}` on any error |
| `writeCache(map)` | No | JSON-stringifies the full cache map and writes it to `localStorage`. Silently ignores storage-full errors |
| `getCachedStatus(serviceId)` | **Yes** | Returns the last cached result for a service if it exists and is younger than 24 hours. Attaches `fromCache: true` and `cachedAt` timestamp. Returns `null` if missing or expired |
| `updateCache(serviceId, data)` | No | Saves a `{ ts, data }` entry for a service into the cache map |

Cache key: `status_cache_v1`. Max age: `24 * 60 * 60 * 1000` ms (24 hours).

#### Utility

| Function | Purpose |
|----------|---------|
| `indicatorToStatus(indicator)` | Maps a statuspage.io `indicator` string (`none`, `minor`, `major`, `critical`) to a normalised `'operational' \| 'degraded' \| 'outage' \| 'unknown'` value |
| `safeFetch(url)` | Wraps `fetch` with an 8-second `AbortController` timeout. Returns the parsed JSON on success or `null` on any error (network, HTTP error, timeout). Never throws |

#### Status fetchers (all private, all `async`)

| Function | API called | Notes |
|----------|-----------|-------|
| `fetchGitHub()` | `githubstatus.com/api/v2/summary.json` | statuspage.io v2 — uses `indicatorToStatus` |
| `fetchSalesforceInstance(instanceId)` | `status.salesforce.com/api/v1/instances/{id}/summary` | Returns maintenance/incident status for a single instance ID (e.g. `CAN50`) |
| `fetchNetSuite()` | `status.netsuite.com/api/v2/summary.json` | statuspage.io v2 |
| `fetchSlack()` | `status.slack.com/api/v2.0.0/current` | Slack's own format — maps `ok`, `active`, `active_incident` to normalised values |
| `fetchMuleSoftInstance(instanceId)` | Same endpoint as Salesforce Trust | Re-uses `fetchSalesforceInstance` since MuleSoft instances appear in the Salesforce Trust API |
| `fetchJira()` | `jira-software.status.atlassian.com/api/v2/summary.json` | statuspage.io v2 |
| `fetchConfluence()` | `confluence.status.atlassian.com/api/v2/summary.json` | statuspage.io v2 |
| `fetchGCP()` | `status.cloud.google.com/incidents.json` | GCP's own incidents feed. Scans for open incidents (no `end` date); maps high-severity → `outage`, others → `degraded` |

#### Public exports

| Export | Type | Purpose |
|--------|------|---------|
| `SERVICES` | `Array` | Registry of all monitored services. Each entry: `{ id, name, logo, statusPageUrl, fetch, isProd? }`. Order determines card order in the grid |
| `fetchAllStatuses()` | `async function` | Runs all service `fetch` functions in parallel via `Promise.allSettled`. For successful results: writes to cache. For failed/unknown results: attempts cache fallback. Returns an array of merged results |
| `fetchSalesforceLimits(instanceUrl, accessToken, apiVersion)` | `async function` | Calls `/services/data/{version}/limits/` — via `/sf-proxy/` in `import.meta.env.DEV`, directly otherwise. Sends `Authorization: Bearer {token}` header. Returns the raw JSON object on success or throws on HTTP error |
| `getCachedStatus(serviceId)` | `function` | See cache system above |

---

### `src/components/StatusCard.jsx`
**Language:** JavaScript + JSX  
**Role:** Renders a single service's status card.

**Props:** `service` object (spread from the SERVICES array merged with live status data).

**Key fields consumed:** `name`, `logo`, `status`, `description`, `statusPageUrl`, `loading`, `isProd`.

**Behaviour:**
- While `loading` is `true`, shows a spinner badge ("Checking…") instead of a status badge
- When `isProd` is `true`, adds the CSS class `status-card--prod` (warm amber background tint) and renders a `<span class="prod-badge">PROD</span>` chip next to the name
- The card is an `<article>` element with `aria-label="{name} status"` for screen reader accessibility
- External link opens in a new tab with `rel="noopener noreferrer"`

---

### `src/components/StatusBadge.jsx`
**Language:** JavaScript + JSX  
**Role:** Displays a coloured pill badge for a normalised status value.

**Props:** `status` — one of `'operational'`, `'degraded'`, `'outage'`, `'unknown'`.

A `STATUS_CONFIG` lookup object maps each status to its display label and CSS class. Unknown or unexpected values fall back to the `unknown` config. The badge includes an `aria-label` (`Status: Operational` etc.) for screen reader support.

---

### `src/components/ServiceLogo.jsx`
**Language:** JavaScript + JSX  
**Role:** Provides an SVG or `<img>` logo for each monitored service, keyed by the `logo` string set on each SERVICES entry.

**Export:** `ServiceLogo({ name })` — looks up `name` in the `LOGOS` map and renders the matched component inside a `<span class="service-logo">`.

| Logo key | Implementation | Notes |
|----------|---------------|-------|
| `github` | Inline SVG | Octocat path, `fill="currentColor"` |
| `salesforce` | `<img>` | Hosted image (GitHub user-attachments CDN) |
| `netsuite` | `<img>` | Hosted image (GitHub user-attachments CDN) |
| `slack` | Inline SVG | 8-path Slack grid in official brand colours |
| `mulesoft` | `<img>` | Hosted image (GitHub user-attachments CDN) |
| `jira` | Inline SVG | Jira staircase icon, solid `#2684FF` |
| `confluence` | Inline SVG | Confluence double-chevron arrows, solid `#2684FF` |
| `gcp` | Inline SVG | Google Cloud icon shape as a CSS `clipPath` over four coloured rectangles (blue/red/yellow/green quadrants) — no `fill="white"` that would be invisible on a white card |

---

### `src/components/GaugeChart.jsx`
**Language:** JavaScript + JSX + inline SVG  
**Role:** Reusable semi-circular gauge for displaying a consumed-vs-max metric.

**Props:** `label` (string), `max` (number), `remaining` (number), `loading` (boolean, default `false`).

**SVG geometry:**
- `viewBox="0 0 120 70"` — landscape rectangle
- Circle centre `(60, 62)`, radius `46`, stroke width `10`
- Arc sweeps exactly 180° from 9 o'clock (left) through 12 o'clock to 3 o'clock (right)

**Internal functions:**

| Function | Purpose |
|----------|---------|
| `progressPath(pct)` | Returns an SVG `A` arc path string covering `pct` (0–1) of the 180° sweep. Uses the large-arc flag when `pct > 0.5`. Returns `null` at 0% |
| `gaugeColor(pct)` | Returns `#0176d3` (blue) below 75%, `#f59e0b` (amber) at 75–90%, `#ef4444` (red) at 90%+ or over limit |
| `fmt(n)` | Formats a number with locale-aware thousands separators, returns `'—'` for null/NaN |

Rendered output: background track path (grey), foreground arc (coloured), percentage text centred below the arc apex, and consumed/remaining counts below that.

---

### `src/components/SalesforceOrgLimits.jsx`
**Language:** JavaScript + JSX  
**Role:** Full Org Limits section — credential form, gauge grid, sort controls, demo mode, and diagnostic error panel.

#### State

| State variable | Initial value | Purpose |
|----------------|---------------|---------|
| `instanceUrl` | From `localStorage` or `''` | Salesforce org URL (controlled input) |
| `accessToken` | From `localStorage` or `''` | Bearer token (controlled input) |
| `apiVersion` | From `localStorage` or `'v66.0'` | Selected API version (controlled select) |
| `limits` | `null` | Raw limits object from the API or demo data |
| `loading` | `false` | True while a fetch is in progress |
| `error` | `null` | Error object with `type` and `message` for the diagnostic panel |
| `showConfig` | `false` | Whether the credential form is expanded |
| `isDemo` | `false` | Whether demo mock data is currently displayed |
| `sortOrder` | `'desc'` | Active sort: `'desc'` (highest %), `'asc'` (lowest %), `'alpha'` (A–Z) |

#### Constants and helpers

| Name | Purpose |
|------|---------|
| `STORAGE_KEY` | `'sf_limits_config'` — localStorage key for persisting credentials |
| `API_VERSIONS` | Array of `v69.0` … `v60.0` — options for the API version dropdown |
| `MOCK_LIMITS` | Static object matching LSCORE org data (Salesforce Inspector screenshot). Used in demo mode |
| `formatKey(key)` | Splits `camelCase` keys into space-separated words for gauge labels |
| `loadConfig()` | Reads and JSON-parses saved credentials from `localStorage` |

#### Key functions

| Function | Purpose |
|----------|---------|
| `handleSave()` | Validates that both fields are non-empty, persists credentials to `localStorage`, closes the config form, triggers `fetchLimits()` |
| `handleClear()` | Removes saved credentials from `localStorage`, resets all state, hides gauge grid |
| `fetchLimits()` | Calls `fetchSalesforceLimits()` from the service layer. Sets `loading`, clears previous errors. On success: stores result in `limits` state, sets `isDemo: false`. On failure: classifies the error type (`CORS_OR_NETWORK`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TIMEOUT`, `UNKNOWN`) and sets `error` state to trigger the diagnostic panel |
| `loadDemo()` | Loads `MOCK_LIMITS` directly into `limits` state without a network call; sets `isDemo: true` |
| `sortedLimits` | Derived value (computed from `limits` and `sortOrder`) — sorts gauge entries by consumed percentage (desc/asc) or label (alpha) |

#### `DiagnosticPanel({ error, instanceUrl, accessToken, apiVersion })`
Private sub-component rendered when `error` is non-null. Shows:
- A classified error heading (e.g. "CORS / Network Error", "Unauthorized — 401")
- Numbered fix steps tailored to the error type
- A "Copy curl" button that writes a ready-to-run `curl` command to the clipboard so the user can test the API call independently from the terminal

---

## Data Flow

```
SERVICES array
    │
    ▼
fetchAllStatuses()          ←── runs in parallel via Promise.allSettled
    │
    ├── success → updateCache(serviceId, result)
    │
    └── failure/unknown → getCachedStatus(serviceId) → attach fromCache flag
    │
    ▼
App.jsx state (services[])
    │
    ├── OverallBanner  (worst status)
    ├── CacheBanner    (any stale entries)
    └── StatusCard ×N  (one per service)

SalesforceOrgLimits.jsx (independent section)
    │
    └── fetchSalesforceLimits()
            │
            └── via /sf-proxy/ (dev) or direct fetch (prod)
                    │
                    ▼
                GaugeChart ×N  (one per limit metric)
```

---

## Security Reference

| Control | File | Detail |
|---------|------|--------|
| Content-Security-Policy | `index.html` | `script-src 'self'`; `connect-src` locked to known API domains only |
| Proxy GET-only | `vite.config.js` | `req.method !== 'GET'` → 405 |
| Proxy path restriction | `vite.config.js` | Regex only allows `/services/data/vX.X/limits/` → 403 for all other paths |
| Proxy domain allowlist | `vite.config.js` | Hostname checked against `*.salesforce.com`, `*.force.com`, `*.cloudforce.com` |
| No token in browser bundle | `vite.config.js` | `loadEnv` called with `'SF'` prefix — vars without `VITE_` are excluded from client build |
| XSS prevention | All JSX files | React auto-escapes rendered values; no `dangerouslySetInnerHTML` used anywhere |
| `.env.local` gitignored | `.gitignore` | Credentials never committed to version control |
| Open redirect prevention | `vite.config.js` | Instance URL domain is validated against the allowlist before any outbound request is made |

---

## Adding a New Service

1. **Write a fetcher** in `src/services/statusService.js` returning `{ status, description }`.
2. **Add an entry** to the `SERVICES` array with the correct `id`, `name`, `logo`, `statusPageUrl`, and `fetch` reference.
3. **Add a logo** to `src/components/ServiceLogo.jsx` — either an inline SVG function or an `<img>` — and register it in the `LOGOS` map.
4. Done. No changes needed in `App.jsx` or `StatusCard.jsx`.
