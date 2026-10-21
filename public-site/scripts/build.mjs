import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pages, email } from './content.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const out = path.join(root, 'dist');
const mark = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor"/><path d="M12 16h16M12 24h16M16 12v16M24 12v16" stroke="#fffaf2" stroke-width="2"/><circle cx="20" cy="20" r="5" fill="#fffaf2"/></svg>`;
const nav = (route) => `<a href="/"${route === '/' ? ' aria-current="page"' : ''}>Overview</a><a href="/#workflow">How it works</a><a href="/support"${route === '/support' ? ' aria-current="page"' : ''}>Support</a>`;
function document(page) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title}</title><meta name="description" content="${page.description}"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f8f5ef"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"></head><body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="wrap site-header"><a class="brand" href="/" aria-label="Social Command Center home">${mark}<span>Social Command Center<span class="brand-sub">A COZY CREATIVE WORKSPACE</span></span></a><nav aria-label="Main navigation">${nav(page.route)}</nav></header>
<main id="main">${page.heading ? `<div class="document-heading wrap"><p class="eyebrow">${page.kicker}</p><h1>${page.heading}</h1><p class="lede">${page.intro}</p><p class="document-meta">EFFECTIVE: 20 OCTOBER 2026</p></div><div class="document-layout wrap"><aside><nav aria-label="Information pages"><a href="/privacy"${page.route === '/privacy' ? ' aria-current="page"' : ''}>Privacy Policy</a><a href="/terms"${page.route === '/terms' ? ' aria-current="page"' : ''}>Terms of Service</a><a href="/support"${page.route === '/support' ? ' aria-current="page"' : ''}>Support &amp; Data Deletion</a></nav><p>Clear information.<br>Deliberate choices.</p></aside><article class="prose">${page.body}</article></div>` : page.body}</main>
<footer class="wrap site-footer"><div><a class="footer-brand" href="/">Social Command Center</a><p>A quieter space for the work behind your content.</p><p class="fine-print">Independent, self-hosted software · Active development</p></div><nav aria-label="Footer navigation"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/support">Support &amp; Data Deletion</a><a href="mailto:${email}">Contact</a></nav><p class="footer-bottom">© 2026 Social Command Center · No platform affiliation or endorsement.</p></footer>
</body></html>\n`;
}
await mkdir(out, { recursive: true });
// Deliberately copy only public assets. Never copy the repository or application build.
for (const page of pages) await writeFile(path.join(out, page.file), document(page));
await writeFile(path.join(out, '404.html'), document({ route: '/404', title: 'Page not found — Social Command Center', description: 'This information page could not be found.', heading: 'A small detour.', kicker: 'PAGE NOT FOUND', intro: 'The page you are looking for is not here.', body: '<p><a href="/">Return to the overview</a> or visit <a href="/support">Support &amp; Data Deletion</a>.</p>' }));
for (const file of ['styles.css', 'favicon.svg', '_headers', 'robots.txt', '_worker.js']) await copyFile(path.join(root, 'src', file), path.join(out, file));
await copyFile(path.join(root, '.assetsignore'), path.join(out, '.assetsignore'));
console.log('Built 4 information pages, a 404 page, _worker.js, .assetsignore and 4 public assets in public-site/dist. Static release with OAuth relay ready.');
