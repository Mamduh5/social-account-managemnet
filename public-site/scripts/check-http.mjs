import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:4177';
let count = 0;
for (const [route, status, type] of [
  ['/', 200, 'text/html'], ['/privacy', 200, 'text/html'], ['/terms', 200, 'text/html'],
  ['/support', 200, 'text/html'], ['/privacy/', 200, 'text/html'],
  ['/styles.css', 200, 'text/css'], ['/favicon.svg', 200, 'image/svg+xml'],
  ['/robots.txt', 200, 'text/plain'], ['/not-a-page', 404, 'text/html'],
  ['/api/health', 404, 'text/html'], ['/.env', 404, 'text/html'], ['/.git/config', 404, 'text/html'],
  ['/README.md', 404, 'text/html'], ['/scripts/content.mjs', 404, 'text/html'],
  ['/uploads', 404, 'text/html'], ['/.data/social_command_center.db', 404, 'text/html']
]) {
  const res = await fetch(origin + route);
  assert.equal(res.status, status, route);
  assert(res.headers.get('content-type')?.startsWith(type), route);
  assert(res.headers.get('content-security-policy')?.includes("connect-src 'none'"), route);
  assert.equal(res.headers.get('x-frame-options'), 'DENY', route);
  assert(!res.headers.has('set-cookie'), `${route}: no preview cookies`);
  count++;
}
assert.equal((await fetch(origin + '/privacy', { method: 'HEAD' })).status, 200);
assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 405);
console.log(`PASS: ${count} static route/asset/isolation checks, HEAD 200 and POST 405. Preview sets no cookies; security headers present.`);
