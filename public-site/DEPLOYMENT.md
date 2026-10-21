# Existing Cloudflare Worker: release and deployment boundary

Updated **21 October 2026, Asia/Bangkok**. This supersedes earlier Pages-only instructions. The existing service is Worker `billowing-leaf-7ccd` at `https://billowing-leaf-7ccd.mamduh2542.workers.dev/`. The owner's prior manual deployment and 21 October morning read-only route checks are recorded locally. This finalization performs no deployment or upload.

## Executable and asset packaging

`wrangler.jsonc` selects `src/worker.js` as the executable and binds generated `dist/` assets as `ASSETS`. `run_worker_first: ["/api/*"]` sends the callback through the Worker before static assets. Other paths delegate to the asset binding. Unrelated management paths must resolve to a true 404; no local API tunnel exists.

The eleven-entry build contains `.assetsignore`, `_worker.js`, `404.html`, `index.html`, `privacy.html`, `terms.html`, `support.html`, `styles.css`, `favicon.svg`, `_headers` and `robots.txt`. `.assetsignore` excludes `_worker.js` from public asset serving. The checker enforces equality between executable, packaging source and generated Worker copies.

**Uploading static assets alone does not establish that executable Worker code changed.** Use the existing configured Worker workflow to deploy the executable and assets together. Do not create a new Pages project, upload the repository or assume Pages advanced-mode conventions apply to Workers.

## Local gates

~~~powershell
npm --prefix public-site run build
npm --prefix public-site run check
npm --prefix public-site run package:upload
node --check public-site/src/worker.js
~~~

Run the independent preview/HTTP check described in [README.md](README.md). Backend relay fixtures use isolated providers, certificates, ports and databases. Build output and ZIP/manifest files remain ignored.

The prior local audit used cached Wrangler **4.151.3** with `deploy --dry-run`, compiled the executable, reported `env.ASSETS` and exited without upload. The repository does not pin/install Wrangler. Use the reviewed CLI version and inspect its help/schema before a later release; do not silently install or upgrade it during validation. A dry run proves compilation/packaging, not deployed routing or authorization.

References: [Worker static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) and [asset binding](https://developers.cloudflare.com/workers/static-assets/binding/).

## Later deployment requirements

Deployment requires a separate owner instruction. Review exact public-content corrections, policy disclosures, target account/service and bundle/assets. Preserve the fixed relay target and local OAuth protections. Never upload environment files, tokens, keys, databases, media, private source or runtime evidence as public assets.

After authorized deployment, read-only HTTPS checks should verify pages/assets, true 404s for management/source paths, security headers, unexpected cookies, missing-state rejection and a synthetic denied-consent redirect without following it. Do not record real codes, state, cookies or tokens. Live consent and publication need separate authorization.

Policies carry an effective date of 20 October 2026 and disclose unresolved controller identity/address, processing bases, retention and deletion procedures. Local edits do not change deployed policy. Review Cloudflare telemetry separately: handler code omits callback logging, but the hosting provider processes request URLs.
