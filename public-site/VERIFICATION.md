# Local owner-review verification

> 21 October 2026 addendum: [README.md](README.md) distinguishes the existing Worker/relay and prior live evidence from this local finalization. Earlier not-deployed/no-relay statements below are superseded. Current static check/package pass with 11 entries; HTTP checks pass 16 cases plus HEAD/POST. Executable/package equality is enforced. These are local checks, not new deployment, consent or natural renewal.

**20 October 2026, Asia/Bangkok. Result: local preview ready; public deployment not performed.**

## Static output and HTTP

| Check | Recorded result |
| --- | --- |
| `node public-site/scripts/build.mjs` | PASS; four information pages, custom 404 and four static support assets |
| `node public-site/scripts/check.mjs` | PASS; nine allowlisted regular files, 93 link/asset references, 51,336 bytes total (uncompressed) |
| `node public-site/scripts/check-http.mjs` | PASS; 16 route/asset/isolation cases, HEAD 200 and POST 405 |
| Expected routes | Home, Privacy, Terms and Support all HTTP 200; CSS and SVG return appropriate MIME types |
| Unknown/private paths | 404 for nonexistent page, API health, environment, Git config, README, content source, uploads and database paths on the **static preview** |
| Browser network controls | CSP blocks scripts, connections, forms, objects and framing; no client scripts/forms/iframes or external fonts in generated output |
| Cookies | No `Set-Cookie` response in local preview cases; hosted security behavior remains unverified |
| Public artifact inspection | Exact output allowlist; no local endpoints, private paths, actual account identifiers, token fields or secret variable names detected; only approved external link destinations permitted |

The artifact check is a bounded inspection and content allowlist, not a general secret-detection guarantee for future edits. No real screenshot, uploaded video, account identity, source map, dependency or repository source is copied. Preview serves only an explicit static route map. `dist/` and `.preview/` are ignored. No database connection exists in any public-site script.

## Browser evidence

Chrome preview at `http://127.0.0.1:4177`. Each of `/`, `/privacy`, `/terms` and `/support` was rendered at **320, 390, 768 and 1440 px** viewport widths. All 16 combinations had document scroll width equal to client width (scrollbar width excluded): no page-level horizontal overflow. Each had the expected primary heading and no client script elements.

The home-page Privacy link was clicked and reached `/privacy`. The information-page Terms link reached `/terms`. The workflow link reached `/#workflow` with the workflow heading at the viewport top after scrolling completed. The keyboard-operated Skip to content link reached `/#main`. Policy and support links are present directly in the homepage and footer, without a collapsible menu. Contact links point to the owner-confirmed mailbox. No support message was sent.

Rendered text contrast was checked against resolved solid ancestor backgrounds using WCAG contrast thresholds (4.5:1 ordinary text, 3:1 large text): Home 98 elements, Privacy 64, Terms 54 and Support 56, with no failures after two illustration-text corrections. This is a focused DOM/style check, not a complete accessibility audit or assistive-technology certification. Representative desktop/mobile screenshots were visually inspected. Browser error log was empty at the final check. A full-page mobile capture hit the browser capture timeout; viewport captures were used successfully instead.

Ignored local evidence under `.preview/`:

- `home-desktop.jpg`, `home-mobile.jpg`, `support-mobile.jpg`
- `privacy-desktop.jpg`, `terms-desktop.jpg`, `support-desktop.jpg`, `workflow-desktop.jpg`
- `mobile-layouts.json`, `wide-layouts.json`, `contrast.json`

The recorded viewport-layout JSON predates the final color-only fix and CSS formatting; no dimensions or layout rules changed afterward. Final contrast checks and the desktop homepage capture use the final build.

## Existing application checks and preservation

| Check | Result and scope |
| --- | --- |
| `npm test` | PASS, exit 0; all nine isolated test files completed successfully using the runner's separate `SCC_DATA_DIR` per suite |
| `npx tsc --noEmit` | PASS, no type diagnostics |
| `npm run build:client` | PASS; existing client production assets rebuilt from unchanged application source |
| Application liveness | `GET http://localhost:3001/api/health` returned HTTP 200 before and after website work |
| Application source/config | No changes to server/client code, package files, credentials or existing infrastructure; only the root README gained a two-line website pointer, plus the new `public-site/` tree |
| Running server/protected queue | No stop, restart, watcher, migration, manual dispatch, cancellation, schedule edit, authorization, provider submission or owner-database write was performed |

Tests write only their disposable test directories; normal application background work may continue independently. Health proves liveness, not a new live-provider/publishing acceptance. No claim of a byte-identical live database, complete application browser regression, or owner verification of the protected scheduled post is made.

## Facts checked against current source/documentation

- Current `README.md`, `AGENTS.md`, `docs/PROJECT_MAP.md` and `docs/qa/OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md`: Facebook live API acceptance versus scheduled-post public verification; TikTok live authorization pending.
- `server/src/services/token-protection.ts`: AES-256-GCM protection for tokens, not whole-database/media encryption.
- `server/src/repositories/account-connections.repo.ts:disconnect`, account archive workflow and account UI controls: local token removal and session invalidation versus preserved history and lack of complete erasure.
- `server/src/index.ts`: loopback server binding and health route. Existing architecture does not expose a public multi-user SaaS service.
- Current official Cloudflare and TikTok requirements: linked and qualified in [HOSTING_AND_TIKTOK.md](HOSTING_AND_TIKTOK.md).

## Pending gates

Owner design/content/legal review; operator identity/jurisdiction and actual retention/deletion/support practices; approved effective date; free-hosting/publication approval; real Cloudflare account/project/HTTPS route and header checks; actual TikTok URL ownership file and Portal acceptance. TikTok Sandbox/live OAuth and a safe callback handoff remain separate future tasks. No Cloudflare project, public URL, legal publication, callback forwarder, account signup, purchase, commit or push occurred.

## Policy revision after owner review — 20 October 2026

This revision supersedes the initial policy/static-output results above where content changed. Earlier application test results remain historical; the private application was not rebuilt, restarted, modified or retested during this document-only revision.

- **Owner-confirmed scheduling:** Terms section 4 and the homepage now state that scheduled Facebook Reel publishing passed live verification on 20 October 2026. The local server/computer availability requirement remains. No provider request or protected schedule mutation was performed to obtain that statement.
- **Storage/backup clarification:** Privacy section 7 and Support now reflect no owner-created manual/external backups, no automatic backup mechanism found in the reviewed application code/scripts, and no configured application cloud/off-site backup or automatic backup retention. Working SQLite files, media imports/variants and metric history are not called backups. Future PC migration is planned only. The audit is source-based, not an inventory of every OS/third-party service; see [PDPA_REVIEW.md](PDPA_REVIEW.md).
- **Privacy revisions:** separate website/support/private-app data flows; conditional rights, complaints and statutory timing; purpose/basis gaps; exact proposed operator description with confirmation pending; actual controller disclosures and retention/deletion/provider decisions remain open. The approved mailbox is unchanged. All three documents explicitly keep their effective date pending actual deployment approval.
- **Final static build/check:** PASS; nine allowlisted files, **96 link/asset references**, **57,611 bytes** uncompressed. No private-account identifiers, credentials, local endpoints, scripts, forms, embeds, source files or internal management functionality detected in the public output.
- **HTTP check:** PASS; 16 static route/asset/isolation checks plus HEAD 200 and POST 405. This targeted loopback static-server check never contacted the management application.
- **Navigation:** generated policy/support links were already relative; no public localhost link required replacement. The checker now enforces root-relative/anchor internal links and additional loopback exclusions. HTTPS Pages-shaped URL resolution maps the three routes to the intended `.html` files. The file structure matches official Pages extensionless routing and keeps a real `404.html`. This is **Pages-compatible configuration evidence, not live Cloudflare-hosted verification**; no site has been deployed.
- **Browser check:** all three revised documents rendered and their information-navigation links were clicked at **390 and 1440 px**. All six combinations had equal document scroll/client widths, correct route, pending operator description and pending effective date. Saved ignored evidence: `.preview/revision-layouts.json` and `.preview/privacy-storage-revised.jpg`. The updated storage disclosure was visually inspected; no design/CSS or shared-shell change was made.

Only `public-site/` content, its static checker and review documentation were changed during this revision. The root README pointer from the earlier task was preserved. No deployment, account setup, public verification, backup, migration, erasure, commit or push occurred. Final revised documents remain at `/privacy`, `/terms`, `/support` in the local preview. Remaining owner decisions are in [OWNER_REVIEW.md](OWNER_REVIEW.md).

## Deployment preparation after operator confirmation — 20 October 2026

- **Confirmed public operator:** all three documents now state `Independent developer based in Thailand` with no pending-confirmation qualifier. The approved email remains `mamduh2542@gmail.com`. Actual controller identity/address disclosures remain clearly unresolved.
- **Actual correspondence practice:** the owner personally checks support emails. Source search found no website/application mailbox integration or email-retention automation. No fixed correspondence-retention period or Gmail automatic-deletion rule was confirmed or inspected. Privacy and Support describe those limits and keep applicable legal requirements and the required retention/deletion decisions visible. Personal review was not reinterpreted as a deletion schedule.
- **Preservation:** no stylesheet, shared layout, private-app source/config/data, server process, account, publishing queue, retention job, backup or PC migration change was made. Current storage/no-expiry/operator-managed-deletion and no-existing-backup statements remain intact. Earlier application's test/build results are historical; no private-app build or tests were run for this static-only revision.
- **Production-format candidate:** `npm --prefix public-site run package:upload` passed. The dependency-free static site has nine allowlisted files, 96 link/asset references and **58,426 bytes** uncompressed. The ignored `.release/social-command-center-pages.zip` has exactly those nine files at its root. Every decompressed entry's SHA256 and size matched the validated build. The matching archive/per-file manifest and review-required note are outside the ZIP.
- **Static integrity and routing:** content/link checks passed, including confirmed operator text, pending effective date and no obsolete operator qualifier. HTTP checks passed all 16 route/asset/isolation cases plus HEAD 200/POST 405. All four public routes work locally; API, database, environment, source and media paths return static 404s. No scripts, forms, credentials, private account identifiers, private files or management functionality were detected in the public output or package. The archive contains no functions or Worker runtime.
- **Browser review:** all three legal/support pages were navigated at 390 and 1440 px; all six checks showed the confirmed operator, pending effective date, no obsolete qualifier, zero scripts and no horizontal overflow. Ignored evidence: `.preview/deployment-preparation-layouts.json` and `.preview/operator-confirmed.jpg`.
- **Hosting evidence:** current official Cloudflare Direct Upload and Serving Pages documentation checked. Extensionless file layout/relative links are compatible. No live Cloudflare deployment/HTTPS claim is made.

**Readiness:** technical static upload candidate prepared and verified; legal/publication readiness remains conditional. The package retains review markers, noindex directives and a pending effective date. The remaining controller, purpose/basis, retention/correspondence and provider/transfer decisions must be resolved for the applicable notice before final publication approval. See [DEPLOYMENT.md](DEPLOYMENT.md) for exact regeneration/upload/post-deployment verification steps and [OWNER_REVIEW.md](OWNER_REVIEW.md) for decisions. No deployment, commit or push occurred.
