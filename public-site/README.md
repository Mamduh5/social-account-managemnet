# Social Command Center informational website

Current source and validation status: **21 October 2026, Asia/Bangkok**. The existing Cloudflare Worker hosts the informational pages and a narrow TikTok OAuth redirect relay. The management dashboard, APIs, media, database and credentials remain on the operator's computer. This finalization makes local source/documentation changes only; no redeployment is authorized.

The owner's existing V1.8 Sandbox OAuth acceptance and the 21 October morning public-route checks are prior live evidence. The morning checks found the four pages and fixed callback redirect working after the owner's manual redeployment. Natural TikTok token renewal remains under observation; isolated refresh tests do not establish live renewal. Production App Review, TikTok API publishing and comment moderation remain unavailable.

## Source and artifact conventions

- `scripts/content.mjs` and `scripts/build.mjs` maintain four pages, their shared shell and the custom 404.
- `src/worker.js` is the executable selected by `wrangler.jsonc`. `src/_worker.js` is a matching packaging copy. The checker enforces equality with the executable and generated copy. A ZIP containing `_worker.js` alone does not install a Worker on Workers Static Assets.
- `_headers`, styles, favicon and robots directives are public assets. No browser scripts, forms, tracking or third-party embeds are generated.
- `dist/`, `.release/`, `.preview/`, `.wrangler/` and dependencies are ignored. Commit source, configuration, scripts and sanitized documentation; keep archives, manifests, screenshots and runtime evidence local.
- `scripts/package-upload.ps1` verifies every entry's size and SHA256 in an eleven-entry archive. Its policy effective date matches the pages: 20 October 2026. Packaging is not deployment proof.

Policies retain the confirmed public operator description and mailbox, and describe unresolved controller identity/address, legal bases, retention and deletion procedures. Earlier review documents remain historical gap assessments. Current source corrects the unsupported live-refresh claim, describes callback processing, and acknowledges the local database safety copy created during maintenance. These corrections await a separate authorized redeployment.

## Isolated local validation

Node.js 22 or newer is sufficient; no public-site dependencies are required:

~~~powershell
npm --prefix public-site run build
npm --prefix public-site run check
npm --prefix public-site run preview
~~~

The preview binds only to `127.0.0.1:4177`, serves an explicit static route map and does not execute or proxy the relay. In a separate terminal:

~~~powershell
node public-site/scripts/check-http.mjs
npm --prefix public-site run package:upload
node --check public-site/src/worker.js
node --check public-site/src/_worker.js
~~~

Stop only a preview created for the check. Preserve the backend, HTTPS proxy and live observer. Relay tests generate disposable certificates in each suite directory using OpenSSL (including the Git for Windows copy), validate the certificate and hostname explicitly, and bind both listeners to ephemeral loopback ports. They do not read the owner's certificate/key or disable global TLS verification.

Static preview checks prove static routes and headers. Relay fixtures prove handler and local OAuth contracts. Neither proves a new live consent, deployed source, token renewal or social publication. See [VERIFICATION.md](VERIFICATION.md) for dated evidence and [DEPLOYMENT.md](DEPLOYMENT.md) for executable deployment requirements.

## Callback processing and operational boundary

The Worker accepts only GET on the exact TikTok callback path, validates bounded allowlisted fields, and redirects to a fixed local HTTPS callback. It does not proxy local management APIs or receive the local binding cookie. The backend retains state, cookie, expiry, account/revision, identity and single-use exchange checks. Tokens and developer secrets remain in the server-side exchange.

The authorization code and state pass through Cloudflare in the request and redirect. Worker source does not log them and sends no-store/no-referrer headers. Cloudflare still processes the request; application-level silence does not establish that platform telemetry has no request data. Review provider logging/redaction and retention separately. No telemetry configuration changes are made here.

No push, deployment, live authorization or social publication is performed by these local scripts.
