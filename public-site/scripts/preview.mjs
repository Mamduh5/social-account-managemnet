import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../dist/', import.meta.url));
const routes = new Map([
  ['/', 'index.html'], ['/privacy', 'privacy.html'], ['/terms', 'terms.html'],
  ['/support', 'support.html'], ['/404.html', '404.html'],
  ['/styles.css', 'styles.css'], ['/favicon.svg', 'favicon.svg'], ['/robots.txt', 'robots.txt']
]);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const headersText = await readFile(path.join(out, '_headers'), 'utf8');
const securityHeaders = Object.fromEntries(headersText.split('\n').filter(s => /^\s+\S/.test(s)).map(s => { const i = s.indexOf(':'); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; }));
const port = Number(process.env.PUBLIC_SITE_PORT || 4177);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3001, 5180, 3192, 3193].includes(port)) throw new Error('Choose an independent preview port (default 4177).');
const server = http.createServer(async (req, res) => {
  // No filesystem path comes from a request. Only the explicit static route map is served.
  const url = new URL(req.url, 'http://127.0.0.1');
  const route = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
  const file = routes.get(route) || '404.html';
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD', ...securityHeaders }); return res.end(); }
  try {
    const bytes = await readFile(path.join(out, file));
    res.writeHead(routes.has(route) ? 200 : 404, { ...securityHeaders, 'Content-Type': mime[path.extname(file)], 'Content-Length': bytes.length });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(500); res.end('Build the public site before previewing.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Owner-review preview: http://127.0.0.1:${port} (static files only; Ctrl+C stops only this preview)`));
server.on('error', err => { console.error(err.message); process.exitCode = 1; });
