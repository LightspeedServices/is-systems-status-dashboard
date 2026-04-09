import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'node:https'
import { URL } from 'node:url'

/**
 * Vite dev-only plugin: proxies /sf-proxy/* → Salesforce server-side.
 * Bypasses browser CORS. Token never touches the browser bundle or network tab.
 * Credentials resolved in order: .env.local vars first, then client headers.
 *
 * Env vars (in .env.local):
 *   SF_ACCESS_TOKEN   – Salesforce session ID / access token
 *   SF_INSTANCE_URL   – e.g. https://yourorg.my.salesforce.com
 */
function salesforceProxyPlugin(envToken, envInstanceUrl) {
  return {
    name: 'salesforce-proxy',
    configureServer(server) {
      server.middlewares.use('/sf-proxy', (req, res) => {

        // ── Config-check ping (/sf-proxy/ping) ──────────────────────────────
        if (req.method === 'GET' && req.url === '/ping') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            hasEnvToken: !!envToken,
            hasEnvInstanceUrl: !!envInstanceUrl,
            instanceUrl: envInstanceUrl || null,
          }));
          return;
        }

        // Security: read-only – only GET is permitted
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        // Resolve credentials: .env.local values take precedence
        const rawInstanceUrl = envInstanceUrl || req.headers['x-sf-instance-url'];
        const rawToken = envToken || (req.headers['authorization'] || '').replace(/^Bearer /i, '');

        if (!rawInstanceUrl || !rawToken) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          const missing = !rawInstanceUrl
            ? 'instance URL — set SF_INSTANCE_URL in .env.local or send X-SF-Instance-Url header'
            : 'access token — set SF_ACCESS_TOKEN in .env.local or send Authorization header';
          res.end(JSON.stringify({ error: `Missing ${missing}` }));
          return;
        }

        // Security: only allow Salesforce-owned domains
        let parsed;
        try { parsed = new URL(rawInstanceUrl); }
        catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid instance URL' }));
          return;
        }

        const host = parsed.hostname.toLowerCase();
        const allowedDomain =
          host.endsWith('.salesforce.com') ||
          host.endsWith('.force.com') ||
          host.endsWith('.cloudforce.com');

        if (!allowedDomain) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Instance URL must be a Salesforce domain' }));
          return;
        }

        // Security: restrict path to /services/data/vNN.N/limits/ only
        const targetPath = req.url || '/';
        if (!/^\/services\/data\/v\d+\.\d+\/limits\/?$/.test(targetPath)) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Only /services/data/vX.X/limits/ is accessible via this proxy' }));
          return;
        }

        const instanceUrl = rawInstanceUrl.replace(/\/$/, '');
        const targetParsed = new URL(`${instanceUrl}${targetPath}`);

        const proxyReq = https.request({
          hostname: targetParsed.hostname,
          path: targetParsed.pathname + targetParsed.search,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${rawToken}`,
            Accept: 'application/json',
          },
        }, (proxyRes) => {
          res.statusCode = proxyRes.statusCode;
          res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
        });

        proxyReq.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      salesforceProxyPlugin(
        env.SF_ACCESS_TOKEN || null,
        env.SF_INSTANCE_URL ? env.SF_INSTANCE_URL.replace(/\/$/, '') : null,
      ),
    ],
    base: env.VITE_BASE_URL ?? '/is-systems-status-dashboard/',
  };
});

