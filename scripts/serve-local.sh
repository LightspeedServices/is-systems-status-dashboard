#!/usr/bin/env bash
# serve-local.sh
# Builds the dashboard and serves it on the local network.
# Run this on any machine connected to the same network as the monitor.
#
# Usage:
#   bash scripts/serve-local.sh          # build + serve on port 4000
#   bash scripts/serve-local.sh --no-build  # skip build, serve existing dist/

set -e

PORT=4000
SKIP_BUILD=false

for arg in "$@"; do
  [[ "$arg" == "--no-build" ]] && SKIP_BUILD=true
done

# ── Ensure dependencies are installed ────────────────────────────────────────
if [[ ! -d node_modules ]]; then
  echo "→ Installing dependencies..."
  npm ci
fi

# ── Build ─────────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo "→ Building dashboard..."
  npm run build
fi

if [[ ! -d dist ]]; then
  echo "Error: dist/ not found. Run without --no-build first." >&2
  exit 1
fi

# ── Serve ─────────────────────────────────────────────────────────────────────
echo ""
echo "Dashboard running at:"
echo "  Local:   http://localhost:${PORT}"

# Print all non-loopback IPv4 addresses so the monitor URL is immediately visible
if command -v ipconfig &>/dev/null; then
  # macOS
  ipconfig getifaddr en0 2>/dev/null | awk -v port="$PORT" '{print "  Network: http://" $1 ":" port}'
elif command -v hostname &>/dev/null; then
  hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' | head -3 \
    | awk -v port="$PORT" '{print "  Network: http://" $1 ":" port}'
fi

echo ""
echo "Press Ctrl+C to stop."
echo ""

npx serve dist --listen "$PORT" --no-clipboard
