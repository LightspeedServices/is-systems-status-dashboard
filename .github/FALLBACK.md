# Fallback & Disaster Recovery

This document covers what to do if any part of the dashboard infrastructure goes down.

---

## Hosting Fallback — GitHub Pages + Local Machine

The dashboard is deployed to **GitHub Pages** as the primary host. A local machine on the same network acts as the fallback — if GitHub Pages is unreachable for any reason, one command brings the dashboard up locally.

| Host | URL | When to use |
|------|-----|-------------|
| GitHub Pages (primary) | `https://lightspeedservices.github.io/is-systems-status-dashboard/` | Normal operation |
| Local machine (fallback) | `http://<your-machine-ip>:4000` | GitHub Pages down |

---

## Local Fallback — Quick Start

On any machine that has Node.js and a copy of this repo:

```bash
npm run serve
```

This single command:
1. Installs dependencies (if needed)
2. Builds the production bundle
3. Starts a static file server on port **4000**
4. Prints both `localhost` and the machine's network IP so you can point the monitor at it immediately

**If the `dist/` folder is already up to date**, skip the build:

```bash
npm run serve:quick
```

**Point the monitor at the network URL printed in the terminal**, e.g.:
```
http://192.168.1.42:4000
```

---

## Keeping Local Hosting Running Permanently (macOS)

To have the dashboard start automatically when the Mac boots and stay running:

### 1. Build once

```bash
npm run build
```

### 2. Create a launchd service

Save the file below to `~/Library/LaunchAgents/com.status-dashboard.plist`, replacing `/path/to/repo` with the actual path to this folder:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.status-dashboard</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npx</string>
    <string>serve</string>
    <string>/path/to/repo/dist</string>
    <string>--listen</string>
    <string>4000</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/status-dashboard.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/status-dashboard.err</string>
</dict>
</plist>
```

### 3. Load and start it

```bash
launchctl load ~/Library/LaunchAgents/com.status-dashboard.plist
launchctl start com.status-dashboard
```

The server now starts automatically on boot and restarts if it crashes. To stop it:

```bash
launchctl stop com.status-dashboard
launchctl unload ~/Library/LaunchAgents/com.status-dashboard.plist
```

---

## Chrome Kiosk Mode (dedicated monitor, no browser UI)

```bash
# macOS — point at local fallback
open -a "Google Chrome" --args --kiosk http://localhost:4000

# macOS — point at GitHub Pages
open -a "Google Chrome" --args --kiosk https://lightspeedservices.github.io/is-systems-status-dashboard/
```

---

## Status Data Failsafe (API outages)

If one or more status APIs are unreachable (including if GitHub itself goes down):

- The last successful result is read from **`localStorage`** (`status_cache_v1`)
- Data up to **24 hours old** is used automatically with no manual action
- A **⏱ stale-data banner** identifies which services are using cached data and how old it is

---

## Logo CDN Failsafe (cdn.simpleicons.org unreachable)

Logos are loaded from `cdn.simpleicons.org`. If that CDN is unreachable, each `<img>` has an `onError` handler that swaps the broken image for a **text badge** automatically (e.g. `GH` for GitHub, `SF` for Salesforce).

---

## Summary — Failure Scenarios

| Failure | Impact | Recovery |
|---------|--------|----------|
| GitHub status API unreachable | GitHub card shows stale data | Auto — localStorage cache (24 h) |
| Any other status API unreachable | That service card shows stale data | Auto — localStorage cache (24 h) |
| `cdn.simpleicons.org` unreachable | Logo images replaced with text badges | Auto — `onError` fallback |
| GitHub Pages down | Primary URL inaccessible | Run `npm run serve` on local machine |
