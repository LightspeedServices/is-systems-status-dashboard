# Systems Status Dashboard

A real-time status dashboard for core business systems, built with React + Vite.

> For a full technical breakdown of each file, function, and configuration option see [DEV.md](.github/DEV.md).  
> For hosting failover and disaster recovery procedures see [FALLBACK.md](.github/FALLBACK.md).

---

## Monitored Systems

| System | Instances | Status Source |
|--------|-----------|---------------|
| Salesforce | LSCORE PROD (CAN50), LSCORE FULL (CAN6S), ShopKeep Prod (USA606), Upserve Prod (USA746), NuOrder Prod (USA570), Gastrofix Prod (DEU86) | [status.salesforce.com](https://status.salesforce.com) |
| NetSuite | — | [status.netsuite.com](https://status.netsuite.com) |
| MuleSoft | Anypoint Mgmt Center (US), Anypoint Automation Suite (US), Runtime Plane (US) | [status.salesforce.com](https://status.salesforce.com) |
| Google Cloud | — | [status.cloud.google.com](https://status.cloud.google.com) |
| GitHub | — | [githubstatus.com](https://www.githubstatus.com) |
| Slack | — | [status.slack.com](https://status.slack.com) |
| Jira | — | [jira-software.status.atlassian.com](https://jira-software.status.atlassian.com) |
| Confluence | — | [confluence.status.atlassian.com](https://confluence.status.atlassian.com) |
| Salesforce Org Limits | Any org (via Vite proxy) | Salesforce REST API `/limits/` |

Cards marked **PROD** are production instances and are shown with an amber highlight.

---

## Features

- Colour-coded status badges: **Operational**, **Degraded**, **Outage**, **Unknown**
- **PROD badge** on production instances
- Auto-refreshes every 5 minutes with a manual refresh button
- Top-level banner summarising overall system health
- **Salesforce Org Limits** section — semi-circular gauges for all API/storage limits
- **Offline failsafe** — last known statuses cached in `localStorage`; stale-data banner shown if a fetch fails
- Responsive grid layout with accessible markup (ARIA roles and labels)

---

## Project Structure

```
systems-status-dashboard/
├── index.html              # App entry point + Content-Security-Policy meta tag
├── vite.config.js          # Vite config + dev-only Salesforce proxy plugin
├── package.json            # Dependencies and npm scripts
├── eslint.config.js        # ESLint configuration
├── .env.local.example      # Template for local Salesforce credentials
├── README.md               # User-facing overview
├── DEV.md                  # Developer reference (file-by-file breakdown)
├── FALLBACK.md             # Hosting failover and disaster recovery
│
├── public/
│   └── favicon.svg         # Browser tab icon
│
├── scripts/
│   └── serve-local.sh      # Build + serve on local network (fallback hosting)
│
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages auto-deploy on push to main
│
└── src/
    ├── main.jsx            # React root mount
    ├── App.jsx             # Root component — grid, banners, refresh cycle
    ├── App.css             # All layout and component styles
    ├── index.css           # CSS custom properties (colours, typography)
    ├── components/
    │   ├── StatusCard.jsx          # Service card with PROD/SBX badge support
    │   ├── StatusBadge.jsx         # Coloured status pill
    │   ├── ServiceLogo.jsx         # Logos via cdn.simpleicons.org with text fallbacks
    │   ├── GaugeChart.jsx          # Semi-circular SVG gauge
    │   └── SalesforceOrgLimits.jsx # Org Limits: multi-org tabs, expand/collapse
    └── services/
        └── statusService.js        # All data fetching, SERVICES array, cache system
```

---

## Displaying on a Monitor

### Option 1 — GitHub Pages (recommended, no server needed)

This repository includes a GitHub Actions workflow that automatically builds and publishes the dashboard to **GitHub Pages** on every push to `main`.

#### One-time setup

1. Go to your repository on GitHub → **Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` — the workflow runs automatically

Your dashboard will be live at:

```
https://lightspeedservices.github.io/is-systems-status-dashboard/
```

Open it on the monitor and press **F11** (or **⌘ Ctrl F** on macOS) for full-screen kiosk mode. The page auto-refreshes every 5 minutes.

---

### Option 2 — Run locally on the monitor's machine

```bash
git clone https://github.com/LightspeedServices/is-systems-status-dashboard.git
cd is-systems-status-dashboard
npm install
npm run build
npx serve dist
```

Open `http://localhost:3000` in a browser and press **F11** for full-screen mode.

**Chrome/Chromium kiosk mode (no browser UI):**

```bash
# macOS
open -a "Google Chrome" --args --kiosk http://localhost:3000

# Linux
chromium-browser --kiosk http://localhost:3000
```

---

## Quick Start (development)

```bash
npm install
npm run dev
```

See [DEV.md](.github/DEV.md) for Salesforce Org Limits setup, proxy configuration, and credential management.

## Tech Stack

- [React 19](https://react.dev)
- [Vite](https://vite.dev)
- Public status APIs (no API keys required)
- GitHub Actions + GitHub Pages for zero-cost hosting
