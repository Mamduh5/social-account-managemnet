# Social Command Center

Self-hosted multi-account video distribution, moving-watermark branding, engagement triage and provenance-aware analytics for Facebook Pages and TikTok accounts.

## Current milestone: Facebook API integration

Status as of **20 October 2026, Asia/Bangkok**:

| Capability | Evidence and boundary |
| --- | --- |
| Registration, categories, archive/restore, immutable masters and separate variants | Implemented; automated and earlier browser acceptance |
| Facebook OAuth and existing-Page reauthorization | **Live verified**, including actual grants and encrypted token storage |
| Official Facebook Reels API publishing | **Live verified**: [public acceptance Reel](https://www.facebook.com/reel/2657809668013982/) |
| Automatic queue completion | **Live verified**: Published with `confirmation_source=api`; confirmed processing/permalink, no manual confirmation |
| Local scheduling and Bangkok-to-UTC handling | Automated due-time/dispatch tests pass; a real schedule is saved and held until due |
| Scheduled Reel's actual public publication | **Pending owner verification**, not a live scheduled-publication PASS |
| Engagement and analytics | Scope-gated connectors, background sync, SSE and append-only snapshots; API, browser and manual evidence remain distinct |
| TikTok official authorization and automatic publishing | **Pending next milestone**; existing Personal Account and manual history preserved |

The authoritative evidence is [Official API Authorization Acceptance](docs/qa/OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md). Older QA reports describe dated simulator, fixture or manual-browser runs; they do not establish current OAuth/API acceptance.

**Protected job:** the Tesla derivative is scheduled for **20 October 2026, 12:14 PM Asia/Bangkok** (`05:14 UTC`). Keep the existing server running while pending. Do not cancel, reschedule, duplicate, change its content/destination, or manually publish it. The owner will verify its actual public result. A saved schedule is not a published Reel.

## Setup and startup

Use Node.js 22 LTS (verified host: 22.23.1), npm, and FFmpeg/FFprobe on `PATH`. SQLite is supplied by `better-sqlite3`. For a fresh checkout or deliberate maintenance window:

```powershell
npm install
npm --prefix client install
npm run build:client
npm start
```

Alternatively run `powershell -ExecutionPolicy Bypass -File .\run_server.ps1`. Open **http://localhost:3001**. The API serves the built frontend, SSE and media; `GET /api/health` checks liveness. Its legacy version string does not identify the acceptance milestone.

`npm run dev` starts the API watcher and Vite on 5180. Use the stable server for scheduled operations. **Do not restart, stop or switch the running instance to development mode while the protected publication is pending.** Start Facebook OAuth from port 3001 to match the callback origin.

This instance is loopback-only. Existing Docker files are packaging scaffolding, not a reviewed LAN/public deployment. Public callbacks, tunnels, proxies and TLS require a separate authentication/access-control review.

## Register first, connect separately

In **Accounts & Categories > Add Social Account**, enter the public identity and display name, then save. Registration needs no credentials. Preserve the actual TikTok **Personal** or Business type; do not convert Personal to bypass an API limitation. Categories, avatars, preferences and brand kits are independent of authorization.

Archive is reversible and retains history/media. Identity aliases stay reserved, including while archived. Demo records are explicitly marked and hidden by default. Simulator dispatch requires persisted `is_demo`; real accounts never fall back to simulated success.

## Facebook OAuth setup

Keep credentials in the server environment or ignored `.env`, never the client, Git, screenshots or QA reports.

| Variable | Purpose/value |
| --- | --- |
| `META_APP_ID` | Owner's Meta developer app ID |
| `META_APP_SECRET` | Private app secret |
| `META_GRAPH_VERSION` | Explicit app-supported version; **`v26.0` was used for live acceptance**, not a claim about the latest version |
| `META_REDIRECT_URI` | **`http://localhost:3001/api/connections/callback/facebook`** |
| `SCC_TOKEN_ENCRYPTION_KEY` | Server-owned base64 encoding of 32 random bytes; retain the existing private key for saved credentials |
| `PORT` | `3001` for the accepted callback |
| `SCC_DATA_DIR` | Optional separate data directory; leave unchanged on the owner instance |
| `SCC_SEED_DEMOS=false` | Disable initial demo seeding on a fresh instance |

The Meta app's Facebook Login OAuth redirect configuration must match `META_REDIRECT_URI` exactly: HTTP, `localhost`, port 3001, full path, **no trailing slash**. `127.0.0.1` is a different cookie hostname. The start route validates the callback origin; the callback validates its exact URL. The resolved live failure was an application expiry-handling bug, not a confirmed Meta dashboard misconfiguration.

Configure the Meta products, app roles and permission access for the intended account. The app checks actual grants; it does not provision approvals.

| Permission | Application use |
| --- | --- |
| `pages_show_list` | Page discovery/profile capability |
| `pages_read_engagement` | Publishing capability prerequisite and engagement reads |
| `pages_read_user_content` | Comment reads with engagement permission |
| **`pages_manage_posts`** | **Direct Page Reels publishing** |
| `pages_manage_engagement` | Optional moderation/replies with engagement permission |

The UI currently selects publishing and moderation requests by default; deselect unneeded operations. The service always requests the three read/discovery scopes and adds selected operation scopes, using `auth_type=rerequest`. It checks `/me/permissions` and filters effective grants by Page tasks when provided. Requested publishing/moderation scopes that were not granted produce a specific failure. Requesting a permission does not grant it.

### Connect/reconnect the existing Page

1. Open the existing account's **Connect API** or **Reconnect** at `http://localhost:3001`.
2. Complete official Meta consent in the same browser.
3. Select the correct Page, review its returned grants, and explicitly **Link Authorized Identity**.
4. Check account capabilities and **Check Health** before API publishing.

The original public/registered identity **`61563944843401`** and verified Graph Page ID **`409347032254077`** belong to the same existing internal account. Preserve the original alias; use the verified Graph ID for API requests. Names alone do not establish identity. Initial reconciliation requires a trusted same-account alias or Meta resolution; previously verified IDs remain strict, and another account's identity claim is rejected. Do not hardcode these owner IDs into general logic or create a duplicate account.

OAuth uses hashed random state, an HttpOnly/SameSite=Lax cookie, account/revision binding, ten-minute expiry and single-exchange compare-and-set protection. The pending redirect/scopes and candidate payload are encrypted. Disconnect/archive/configuration changes invalidate in-flight completion.

Tokens use AES-256-GCM. Privately back up the existing encryption key; changing/losing it prevents decryption. Failed reauthorization preserves credential bytes. The prior callback rejected valid token responses without `expires_in`. The fix verifies missing expiry using `/debug_token`, including validity/app ownership. Explicit `expires_at=0` gets a conservative **24-hour local revalidation window**, bounded by data-access expiry; invalid/unknown metadata fails closed. Long-lived exchange is attempted, not a guarantee of 60-day/permanent tokens.

Safe `[OAuth]` diagnostics report stage, reference, HTTP status and numeric provider codes. Never log raw state, authorization codes, cookies, tokens, secrets or arbitrary provider exception text. Use fresh consent after expiry/error; do not replay a consumed callback.

## Direct Reels versus manual handoff

Review the selected master/variant, destination and caption before deliberate publication. The official Facebook connector:

1. Starts `POST /{page-id}/video_reels` with `upload_phase=start`.
2. Saves the remote video ID on the destination **before** uploading the binary to HTTPS `rupload.facebook.com`.
3. Finishes through `video_reels` with `upload_phase=finish`, `video_state=PUBLISHED`.
4. Polls `/{video-id}?fields=status,permalink_url`; requires `video_status=ready`, publishing phase `complete`, and an accepted Facebook permalink.

Only confirmed completion makes the worker set **Published**, progress 100, `confirmation_source=api`, and update the parent. An upload ID or FINISH `success:true` alone is insufficient. No manual confirmation is required for a verified API result.

There is **no automatic standard-video fallback** after a Reels error. Real failures are not automatically resubmitted. Saved remote IDs block blind explicit retry until reconciliation. Published/manual-confirmed jobs and restart review holds are excluded; succeeded sibling destinations are never retried. This protects destination replay; separately created posts still require a content/history duplicate check.

Disconnected/unsupported real destinations prepare MP4/caption packages under **Awaiting Manual Confirmation**. Open the exact native account, publish manually, then record the URL with explicit account confirmation. Opening a site/preparing a file never proves publication. Manual receipts keep `confirmation_source=manual`, separate from API verification.

## Scheduling and recovery

Choose **Schedule for Later**, enter a future time labeled **Asia/Bangkok**, then **Schedule Post**. The frontend treats the value as UTC+07:00 and sends UTC ISO. The schedule API (`POST /api/publishing/posts`, `scheduledAt`) requires an explicit `Z`/numeric offset and rejects blank, invalid, past and timezone-free values.

Scheduling belongs to the **local persistent queue**, not Meta. Destinations stay `scheduled`. Every two seconds the worker compares dates with SQLite `julianday`, releases due jobs, then publishes immediately without sending the elapsed schedule time back to Meta. The queue shows Bangkok time and allows cancellation before dispatch. Keep the PC awake and server running; no cloud timer exists. An offline service cannot publish on time.

Future schedules persist across restart, but the protected instance must remain running. Interrupted preparing/branding/uploading jobs return with a review hold. Reconcile saved remote uploads before explicit retry. Expired/revoked authorization at dispatch can prevent direct API publication; manual preparation or an unknown outcome must never become a fabricated success.

The real one-hour job was saved through the scheduling API after a browser date-entry attempt created no job. The saved data and queue display were verified. **Browser form submission and the scheduled Reel's public outcome are not claimed as live PASS.**

## Media, analytics and TikTok limits

Master MP4s are immutable. FFmpeg outputs go to `.data/renders` with separate `branded_videos` metadata and SHA256 checks. The Tesla derivative preserves the full scene over a blurred 9:16 background, 10 seconds/300 frames and identical AAC payload. No AI generation credits were used; generated files and runtime records are untracked.

Pipeline import reads/downloads completed outputs via configured `PIPELINE_API_URL`/Settings (default API 8080), watched directory, webhook or manual upload. Importing/branding is separate from generating a video.

SyncService checks active real accounts after boot and every 15 minutes, supports on-demand sync, appends snapshots and broadcasts `analytics:synced`. Sources/statuses distinguish API, browser and manual observations. Valid zero differs from missing data. Review per-account/provider results; aggregate sync success is not proof of every metric or operation.

TikTok Login Kit identity/renewal and Display API parsing have fixture coverage. Real official authorization remains pending approved app configuration and accepted HTTPS (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`). The built-in HTTP server does not establish HTTPS. Direct Post is disabled by the registry pending product access, creator/privacy UX, submission/status reconciliation and live acceptance. Display API does not provide comment moderation/replies; separate API access is required. Preserve the existing Personal Account, manual publications and history. Do not begin the next TikTok milestone without owner instruction.

## Verification and private storage

```powershell
npm test                         # Isolated SCC_DATA_DIR per suite
npx tsc --noEmit                  # Backend types
npm run build:client              # Client types and production bundle
```

Current suite: **66 tests in eight files**, covering reauthorization, safe diagnostics, Reels failure/polling, automatic queue completion, replay/restart protection, schedule validation and due dispatch. Fixtures are not live provider proof. Optional browser/upstream suites have separate ports/data and were not rerun for this finalization.

Keep `.env*`, keys, `.data/` databases/WAL files/backups, tokens, profiles, MP4s, thumbnails, logs, test artifacts, dependencies and `client/dist/` out of Git. Use SQLite's backup API for a consistent live WAL snapshot; copying only the `.db` while running is unreliable. Restore only in an approved maintenance window, with the matching key and remote-outcome reconciliation.

See [AGENTS.md](AGENTS.md), [Project Map](docs/PROJECT_MAP.md), [current API acceptance](docs/qa/OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md) and the dated [onboarding](docs/qa/REAL_ACCOUNT_ONBOARDING_ACCEPTANCE.md) / [engagement](docs/qa/REAL_ENGAGEMENT_ANALYTICS_ACCEPTANCE.md) reports.
