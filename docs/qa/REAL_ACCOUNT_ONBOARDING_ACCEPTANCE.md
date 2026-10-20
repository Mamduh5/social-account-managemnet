# V1.2 Real Account Onboarding Acceptance

> **2026-10-20 status note:** Historical V1.2 report. Facebook OAuth and direct Reels publishing subsequently passed live acceptance on 20 October; the actual scheduled publication still awaits owner verification. Its older pending-API statements and restart instructions are historical. See [current V1.6 acceptance](OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md). Preserve the 12:14 PM Asia/Bangkok schedule and keep its server running while pending; do not follow historical restart/publication steps against the owner instance.


Date: 2026-10-15 (Asia/Bangkok). Local implementation and isolated acceptance: PASS. Real Facebook/TikTok authorization and live operations: PENDING. No real social accounts were created and no live posts, comments or reactions were submitted. No commit or push was performed.

## Register a real account now

1. Restart only Social Command Center after updating the backend; the additive migration runs on boot. Build with `npm run build:client` and launch with `npm start` or the existing server script. Default URL: `http://localhost:3001`.
2. Open **Accounts & Categories > Add Social Account**. The legacy **Connect Account** entry opens the same registration form.
3. Choose **Facebook Page** or **TikTok Account**. Facebook personal profiles are outside scope. For TikTok, choose the actual **Personal** or **Business** type; Personal is the default and no conversion is performed.
4. Enter the public profile URL or username, a display name and an optional category. Facebook numeric Page URLs (`profile.php?id=...` and `/pages/name/id`) are supported. Post/video, off-platform and credential-bearing URLs are rejected. A syntactically valid Facebook URL does not establish Page type or ownership.
5. Optionally enter an HTTPS avatar URL or upload PNG/JPEG/WebP (up to 2 MB), description, notes, default caption/hashtags and branding preference. Uploaded avatars stay under ignored `.data/uploads/avatars`.
6. **Save Account**. It appears immediately as **Registered / Not Connected**, with an unverified public identity and no API publishing capability. No credentials, followers or ownership claims are invented.

Use **Edit Account** to change the name, public identity, type, category, notes, avatar or preferences without replacing the internal ID. Categories can be cleared. **New Category** creates a workspace shared by any practical number of accounts. Search and 20-record UI pagination handle growth; there is no six-account limit. Name similarity never merges accounts.

Duplicate checks use platform-specific case/URL normalization, Facebook username period normalization, numeric IDs and authoritative external IDs. Prior identity aliases remain reserved when a handle changes, including while archived, to prevent accidental duplicate registration. A reused historical handle may need deliberate identity reconciliation; there is no automatic merge or destructive alias release.

A read-only check of the existing owner database confirmed 6 accounts, all 6 in simulator mode; no owner records were changed by acceptance testing. These existing simulator accounts are preserved and labeled DEMO after the V1.2 migration. They are hidden from the real dashboard by default. **Show demo accounts** exposes them, and **Archive Demo Accounts** safely archives them. **Show archived accounts** plus the demo filter permits restoration. **Archive Account** preserves posts, destinations, branding presets, media metadata and original/derived files. Restore returns the account disconnected.

## Configure branding and prepare a publication

From the account card choose **Configure Branding**, enter its watermark text, choose a movement preset and **Save Brand Kit**. Presets remain keyed to the internal account ID. Existing safe-area math, FFmpeg output, deterministic render caching and master-video storage remain in place. Select an existing MP4 in the Video Library, import an existing upstream pipeline output, or upload a local MP4. Pipeline import downloads a separate Command Center copy.

**Prepare Publication** opens the existing composer with that account selected. Captions, hashtags and branding preferences default from the account. Select **Original Master (Unbranded)** or a rendered branded variant and enqueue. Disconnected/limited accounts prepare through the manual package path; they never reach the simulator. Demo publishing remains available only through the explicit **Show demo publishing targets (simulated only)** checkbox.

In **Publishing Queue > Open Prepared Package**:

1. Check the account name, platform and handle.
2. Download the prepared MP4 and copy the provided caption/hashtags.
3. Open the native account/publisher. Check the signed-in native identity and, for Facebook, the selected Page. An unverified Page ID or an isolated browser profile does not prove which account is signed in.
4. Complete the upload and publication yourself through the official platform interface.
5. Paste the actual published post URL and check the account-confirmation box, then **Record Published URL**.

A destination stays **Awaiting Manual Confirmation** after preparation, download or opening a native link. Confirmation requires the exact destination account and an HTTPS post/video URL on the correct platform; TikTok URLs must match the registered handle. A profile/homepage or another TikTok account is rejected. Confirmation applies only once to an awaiting destination. The receipt stores `confirmation_source=manual`; this is an operator assertion, not independent API verification. Facebook opaque post ownership still requires the operator's check.

The Browser Bridge keeps its per-account profile/manifest architecture. Merely finding cookies/profile files never creates a verified connection. Opening a native site, file delivery and manual post receipts are distinct from API operations. No stealth automation, CAPTCHA bypass, scraping or live engagement was added.

## Official API setup and current limits

Configuration is server-side, via environment variables or ignored `.env`. The frontend never receives access/refresh tokens, secrets or encrypted OAuth candidate payloads. New credentials and candidate payloads use AES-256-GCM with a separately managed base64 32-byte `SCC_TOKEN_ENCRYPTION_KEY`. Generate/store this key privately and back it up; changing or losing it prevents decryption. Registration does not require this key. Legacy plaintext credentials are withheld from responses and cannot authorize operations; reauthorize to replace them with encrypted credentials. Existing credential/history data is not silently discarded during migration.

| Variable | Purpose |
| --- | --- |
| `SCC_TOKEN_ENCRYPTION_KEY` | Private base64 encoding of 32 random bytes; required before storing OAuth credentials |
| `META_APP_ID`, `META_APP_SECRET` | Official Meta developer app credentials |
| `META_GRAPH_VERSION` | Explicit supported Graph version chosen from the current developer app documentation; no guessed production default |
| `META_REDIRECT_URI` | Exact registered loopback callback ending `/api/connections/callback/facebook` |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Official TikTok Login Kit developer app credentials |
| `TIKTOK_REDIRECT_URI` | Exact registered HTTPS loopback callback ending `/api/connections/callback/tiktok` |
| `SCC_DATA_DIR` | Optional separate data directory for SQLite, uploads, avatars, profiles and renders |
| `SCC_SEED_DEMOS=false` | Disable initial demo seeding for a fresh database |

The built-in server serves HTTP on loopback. TikTok Web Login therefore remains blocked until an acceptable registered HTTPS redirect and a reviewed local HTTPS/certificate/proxy setup exist. The start endpoint explicitly rejects HTTP TikTok authorization and mismatched callback hostnames. Use the same hostname for the UI and callback so the HttpOnly cookie is returned; do not mix `localhost` and `127.0.0.1`. A loopback HTTPS proxy must preserve the expected host/origin. This work does not establish a public callback, tunnel, LAN deployment or developer-app approval. Public callbacks require a separate authentication, TLS and proxy review.

OAuth state is random, hashed server-side, browser-cookie bound, account/revision bound, expires after ten minutes and cannot be replayed. Disconnect/archive invalidates pending authorization. Only one browser authorization flow is active at a time; different saved accounts and connections remain independent. Callback responses suppress referrers and caching. Foreign hosts/origins and cross-site mutation requests are rejected by the local service boundary.

### Facebook Pages

Create/configure an official Meta developer app and Facebook Login setup accepted for your use case, register the exact redirect, choose a supported Graph version, add app roles/test users while in development and obtain necessary app review/advanced access for accounts outside those roles. Business verification or other approval may be required by the selected product/access level. This application does not assume approval.

Choose **Connect API** and select only the operations you need. Discovery requests `pages_show_list`; the publishing option adds `pages_read_engagement,pages_manage_posts`; engagement adds `pages_read_engagement,pages_read_user_content,pages_manage_engagement`. Unrelated permissions are not requested. `read_insights` and webhook subscriptions are not requested because analytics/event ingestion is not implemented here.

After official consent, the server exchanges the authorization code, checks granted permissions and paginates manageable Pages with their Page tokens/tasks. Return to the connection modal, choose the correct Page by name/ID and explicitly confirm the identity. The existing registered row is updated; it is not replaced. A conflicting manually entered/previously verified external ID or another registered account's ID is rejected. Page tasks further restrict publishing and moderation grants.

Profile-only/partial grants remain **Limited Capabilities**. A verified fresh token plus publishing scopes/tasks permits the Meta adapter to submit video; returned upload IDs alone are not treated as final publication proof and remain awaiting confirmation. Live consent, submission, remote status and real engagement acceptance are PENDING. Comment methods are scope-gated; automatic inbox synchronization and Insights ingestion are not implemented. Capabilities for those unimplemented ingestion paths remain unavailable.

Primary research: [Meta's official Facebook Postman collection](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api) confirms manageable-Page discovery and per-Page tokens/tasks. [Pages API getting started](https://developers.facebook.com/docs/pages-api/getting-started/), [permissions](https://developers.facebook.com/docs/permissions/) and [Graph changelog](https://developers.facebook.com/docs/graph-api/changelog/) were consulted as official references; their direct fetches returned HTTP 429 during this run. Current app-specific permission eligibility/version must be confirmed in the developer dashboard before live acceptance. This limitation is not a PASS for current Meta approval requirements.

### TikTok Personal and Business

The implemented general creator path is **TikTok for Developers Web Login Kit**, with `user.info.basic,user.info.profile` for identity matching. After consent, the server reads the authorized identity and granted scopes, presents it for confirmation and matches the authorized username (or previously bound `open_id`) to the registered account. Personal/Business type is retained; the basic identity response is not claimed to independently certify account type. The server stores encrypted access/refresh tokens and expiries. **Renew API Token** uses the refresh token and saves the returned replacement; **Reconnect** restarts consent if renewal is unavailable/expired.

TikTok's separate **API for Business Accounts API** requires its own onboarding/access application. The official gateway currently states that new apps/scope increases including TikTok Accounts require the Accounts API Access Application Form from March 20, 2026. That product is researched but not implemented or claimed authorized here. General Login Kit does not confer Accounts API, comments, Business analytics or partner permissions.

Direct Post is deliberately unavailable in the adapter/registry. Completion requires product/scope approval, the required creator-information and privacy-choice UI, upload/status reconciliation and live verification. There is no forced public privacy default or fabricated upload/post ID. `video.publish` is for direct posting; `video.upload` delivers a draft for further native completion. Neither is requested by this profile-only flow. Unaudited Direct Post clients have restricted visibility. Use manual handoff until the necessary product workflow is implemented and accepted.

Official references: [Web Login Kit](https://developers.tiktok.com/doc/login-kit-web/), [User Info fields/scopes](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info), [token lifecycle/rotation](https://developers.tiktok.com/doc/oauth-user-access-token-management/), [Direct Post prerequisites](https://developers.tiktok.com/doc/content-posting-api-get-started/), [scope reference](https://developers.tiktok.com/docs/en/tiktok-api-scopes), [API for Business Accounts onboarding](https://business-api.tiktok.com/gateway/docs/index?doc_id=1740304387032066&language=ENGLISH).

## Failure and recovery behavior

| Condition | Behavior / recovery |
| --- | --- |
| Missing app configuration, key or accepted callback | Setup guidance; registration, branding and manual preparation remain available |
| Denied consent, wrong/replayed state, wrong browser, expired session | No new connection; restart official authorization |
| Wrong authorized account or duplicate external ID | Selection rejected; use the correct native account/Page; existing associations remain intact |
| Expired access token | API capabilities disabled for that account only; renew TikTok token or reconnect |
| Lost encryption key / legacy plaintext token | No API dispatch; restore the original key or reauthorize |
| Browser profile exists | No verified authorization inferred; verify native identity manually |
| Server restart during upload/render | Reset to `preparing` with a review hold, excluded from automatic dispatch; reconcile native publication before explicit Retry Destination |
| Successful sibling destination | Never requeued by retrying another destination |
| Archive / restore | Credentials/pending OAuth invalidated; history/media preserved; explicit reconnect required |
| No authorized engagement/analytics data | Clear unavailable/native shortcut state; demo data excluded, no generated performance for real accounts |

## Verification evidence

Commands are run from the repository root. Test storage and media remain ignored under `.data`; the owner's database and upstream service are not test fixtures.

| Check | Result |
| --- | --- |
| `npm test` | PASS: 30 tests (5 domain, 15 registry/OAuth/security/media fixtures, 10 existing integration tests) |
| `npx tsc --noEmit` | PASS |
| `npm run build:client` | PASS |
| `npm run test:onboarding` | PASS: 19 browser workflows, Edge headless, zero page exceptions or local API 5xx responses; final artifact path recorded below |
| `npx tsx test/e2e/run_pipeline_regression.ts` | PASS: existing real-pipeline acceptance, 27 PASS / 0 WARN / 0 FAIL |
| Live Facebook/TikTok consent / API publishing / engagement / analytics | PENDING: no owner accounts/app authorization used; no live actions performed |

Browser coverage: credential-free Page/TikTok creation, optional avatar upload, same-category accounts, edit/preferences, normalized duplicate error, 24 real fixture accounts with pagination, missing setup, manual setup, isolated expired state, native profile links, real MP4 upload, two distinct branding presets, FFmpeg render/play/seek/master checksum, original/branded composer preparation for separate accounts, download/native publisher links, explicit fixture post confirmation with wrong-account rejection, archive/restore/history, demo archival, 390px mobile layout and an actual server stop/start retaining records/presets/preferences/manual states. Native external pages are intercepted HTML fixtures to verify browser popup targets without contacting logged-in social platforms. Fixture confirmation URLs are local test records, not real publications.

OAuth tests mock official network responses and cover state/browser binding, denial/replay, scope/task filtering, existing-ID Page selection, encrypted token/candidate storage, TikTok username mismatch, refresh rotation, expiry and disconnect invalidation. These are contract/security evidence, not live-platform approval.

The upstream regression contacted the existing pipeline at `http://localhost:8080` using discovery/download requests only: 40 projects, 23 completed video artifacts in that run. A separate Command Center on port 3193 imported 9:16 and 16:9 media, played/seeked the vertical MP4 with observed HTTP 206 responses, rendered a separate moving-watermark output, and deleted only that isolated render. Master SHA256 before rendering and after render/delete: `897abdfc763dcef6f0e7f33df26fe6bab6ce855a03397e6ea73fb0d9aad616cd`. That older suite's final persistence check is a reread; the new onboarding suite separately performs a real server restart.

Artifacts:

- Real-pipeline regression: `.data/pipeline-regression-ZbFYkd/acceptance.log`, `server.log`, `screenshots/`.
- Browser final report/screenshots: `.data/onboarding-browser-tonWxG/report.json`, `accounts-desktop.png`, `onboarding-mobile.png`, `server.log` (screenshots inspected at desktop 1440x1000 and mobile 390x844)..
- Unit/integration fixtures: `.data/test-runs/`; each suite gets a unique directory.

## Next-agent navigation

- Forms/UX: `AccountsView.tsx`, `ConnectAccountModal.tsx`, `AccountCard.tsx`, `ConnectionModal.tsx`.
- Typed HTTP client: `client/src/api/client.ts`; DTOs: `client/src/types/index.ts`.
- Identity and URL rules: `server/src/domain/account-identity.ts`.
- Registry workflows: `services/accounts.service.ts`; persistence: `repositories/account-connections.repo.ts`, `accounts.repo.ts`.
- OAuth: `routes/connections.routes.ts` -> `services/connections.service.ts`; crypto: `services/token-protection.ts`; local boundary: `server/src/local-access.ts`.
- Platform adapters and account capability gates: `server/src/connectors/`; use the registry for execution, not adapter-wide declarations.
- Handoff: `routes/bridge.routes.ts`, `HandoffModal.tsx`, `QueueTable.tsx`, `publishing.service.ts`.
- Queue/recovery: `queue.service.ts`, `publishing.repo.ts`; additive migration: `db/schema.ts`; demo labeling: `db/seed.ts`.
- Tests: `test/real_accounts.test.ts`, `test/e2e/real_account_onboarding.ts`, `test/e2e/run_pipeline_regression.ts`.

Remaining live work requires the owner's first real accounts plus developer-app configuration/approval, not another registration redesign. Do not create accounts, change TikTok type, expose callbacks, publish or perform engagement actions to clear these pending gates automatically.
