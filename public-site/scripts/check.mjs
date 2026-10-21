import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages } from './content.mjs';

const out = fileURLToPath(new URL('../dist/', import.meta.url));
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
assert.equal(await readFile(new URL('../src/_worker.js', import.meta.url), 'utf8'), workerSource, 'Executable and legacy Worker sources must match');
assert.equal(await readFile(path.join(out, '_worker.js'), 'utf8'), workerSource, 'Packaged Worker must match the executable source');
const allowed = ['.assetsignore', '404.html', '_headers', '_worker.js', 'favicon.svg', 'index.html', 'privacy.html', 'robots.txt', 'styles.css', 'support.html', 'terms.html'].sort();
assert.deepEqual((await readdir(out)).sort(), allowed, 'Deployment directory must contain only approved static files');
const routeFiles = new Map(pages.map(p => [p.route, p.file]));
const external = new Set(['mailto:mamduh2542@gmail.com', 'https://www.cloudflare.com/privacypolicy/', 'https://www.facebook.com/settings?tab=business_tools', 'https://support.tiktok.com/en/safety-hc/account-and-user-safety/connect-to-third-party-apps', 'https://www.pdpc.or.th/']);
let total = 0, linkCount = 0;
for (const file of allowed) {
  const stat = await lstat(path.join(out, file));
  assert(stat.isFile() && !stat.isSymbolicLink(), `${file}: must be a regular file`);
  total += stat.size;
  const text = await readFile(path.join(out, file), 'utf8');
  if (file === '_worker.js') {
    assert(!/(?:access|refresh)_token|client_secret|SCC_TOKEN_ENCRYPTION_KEY|\.data|\.env|409347032254077|maroooooooooooon16|\b[A-Z]:[\\/]/i.test(text), '_worker.js: secret or private detail detected');
    assert(text.includes('https://localhost:3443') && text.includes('/api/connections/callback/tiktok'), '_worker.js: missing expected callback relay configuration');
  } else if (file === '.assetsignore') {
    assert(text.includes('_worker.js'), '.assetsignore must exclude _worker.js from static asset serving');
  } else {
    assert(!/localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0|:3001|\/api\/|\.data|\.env|409347032254077|maroooooooooooon16|(?:access|refresh)_token|client_secret|SCC_TOKEN_ENCRYPTION_KEY|\b[A-Z]:[\\/]/i.test(text), `${file}: private/application detail detected`);
    assert(!/<script\b|<iframe\b|<form\b|<input\b|@import|https?:\/\/[^\s"']+\.(?:js|css|woff)/i.test(text), `${file}: active or third-party resource detected`);
  }
  if (!file.endsWith('.html')) continue;
  assert(text.includes('noindex,nofollow'), `${file}: missing robots metadata`);
  assert(!/OWNER REVIEW|not publicly deployed/i.test(text), `${file}: obsolete review/deployment marker found`);
  assert.equal((text.match(/<h1\b/g) || []).length, 1, `${file}: one primary heading required`);
  assert(text.includes('lang="en"') && text.includes('name="viewport"'), `${file}: missing document basics`);
  for (const match of text.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1].replaceAll('&amp;', '&');
    linkCount++;
    if (/^(https:|mailto:)/.test(href)) { assert(external.has(href), `Unexpected external destination: ${href}`); continue; }
    assert(/^\/(?!\/)|^#/.test(href), `${file}: internal links must use same-origin relative routes or anchors: ${href}`);
    const [route, fragment] = href.split('#');
    const target = !route ? file : routeFiles.get(route) || (allowed.includes(route.slice(1)) ? route.slice(1) : null);
    assert(target, `${file}: broken link ${href}`);
    if (fragment) assert((await readFile(path.join(out, target), 'utf8')).includes(`id="${fragment}"`), `${file}: missing anchor ${href}`);
  }
}
assert(total < 150_000, 'Static payload exceeds expected lightweight budget');
for (const page of pages) {
  const html = await readFile(path.join(out, page.file), 'utf8');
  for (const route of ['/privacy', '/terms', '/support']) assert(html.includes(`href="${route}"`));
  if (['/privacy', '/terms', '/support'].includes(page.route)) {
    assert(html.includes('Operator: <strong>Independent developer based in Thailand</strong>.'), `${page.file}: confirmed operator description missing`);
    assert(!/Proposed operator description|subject to owner confirmation/i.test(html), `${page.file}: obsolete operator confirmation wording`);
    assert(/Effective:?\s*20 October 2026/i.test(html), `${page.file}: effective date missing`);
    assert(!/pending actual deployment approval|owner-review draft/i.test(html), `${page.file}: obsolete pending deployment wording`);
  }
  // Resolve policy links on the live Cloudflare Workers origin.
  for (const route of ['/privacy', '/terms', '/support']) {
    const resolved = new URL(route, 'https://billowing-leaf-7ccd.mamduh2542.workers.dev/current-page');
    assert.equal(resolved.origin, 'https://billowing-leaf-7ccd.mamduh2542.workers.dev');
    assert.equal(routeFiles.get(resolved.pathname), `${route.slice(1)}.html`);
  }
}
console.log(`PASS: ${allowed.length} allowlisted static files, ${linkCount} link/asset references, ${total.toLocaleString()} bytes. No scripts, forms, embeds, private endpoints or account identifiers detected. External destination allowlist checked; external availability requires a separate check.`);
