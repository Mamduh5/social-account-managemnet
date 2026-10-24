# AGENTS.md — Developer & AI Agent Operating Guide

> **Social Command Center**: Self-hosted command center for multi-account AI video distribution, dynamic moving watermark branding, engagement inbox triage, and cross-platform analytics across Facebook Pages and TikTok accounts.

---

## Controlled owner rollout and current-user startup (24 October 2026)

The owner explicitly authorized a local Git checkpoint, verified WAL-safe backup, the documented V1.10 migration and current-user startup for this assignment. These instructions supersede older owner-away restrictions on local commit/migration/restart. Read [the production rollout and rollback procedure](docs/qa/V1_10_PRODUCTION_ROLLOUT.md) for release and runtime evidence. The verified owner release is cccf9390542199fb18ae442753eba87088c9b255; migration and installed-entry startup checks passed. Normal automatic sync is enabled; the owner remains on its original database. No Git push, Cloudflare deployment, public posting/upload/reply/reaction/new schedule, account reauthorization, paid service or AI Video Pipeline change is authorized.

Use the frozen release referenced by .data/runtime/owner-config.json with npm run owner:start / owner:stop / owner:status / owner:startup / owner:disable. Never replace the owner database with a review copy. scripts/apply-v110-migration.ts requires the original database, idle queue, exact protected holds, reserved loopback ports, an integrity-verified backup and the rollback document before applying the atomic migration. Preserve the original .env/encryption key/certificates. Current-user Startup starts only the owner on 3001/3443, with no administrator/UAC/firewall change. Managed boot holds interrupted, uncertain or overdue jobs before recovery; no reset/replay is permitted. Do not bypass the managed controller with a watcher.

## V1.10 general posts and draft-first content workspace (24 October 2026)

Read [V1.10 acceptance and review instructions](docs/qa/V1_10_GENERAL_POSTS_CONTENT_ASSISTANT.md). General Facebook Page text, JPEG/PNG image, ordered multi-image and link posts share the existing publishing destinations and queue; Reels retain their existing path. New content is saved as drafts. Approval binds the exact revision, destination, schedule and attachment order; edits clear approval. A separate explicit queue action is required. Saved remote IDs and submission intents block blind replay; reconciliation reads the saved remote post without uploading again.

Existing databases require the explicit offline, copy-first V1.10 migration. Startup does not rebuild publishing history or silently add this workspace to a legacy database. The copy-only preparation tool is scripts/prepare-general-posts-migration.ts; it cannot apply to or replace the source. V1.9 nullable-statistics maintenance remains a separate prerequisite when applicable. Do not replace a running database or roll a prepared copy over newer owner observations.

Use npm run review:v110 -- --fixtures for a separate loopback review instance on 3195. Its database and client bundle live under .data/v110-review. Social provider fetches are always blocked; fixture mode blocks all external calls and explicit real-provider mode permits only the pinned Gemini text endpoint. Only review workers are paused. Keep the owner backend/proxy/scheduler/analytics running. Read [runtime recovery and real generation](docs/qa/V1_10_RUNTIME_RECOVERY_REAL_GENERATION.md) for the current state. The 12ae5d8 recovery was the previous baseline; see the production rollout report for the newly pinned V1.10 release and current synchronization state. The separate review app can use the explicitly configured gemini_api_free / gemini-3.5-flash-lite adapter; default generation remains unavailable without SCC_ASSISTANT_PROVIDER_CONFIG. Reuse the existing billing-disabled attestation/source fingerprint, exact free model/key selector and durable request cap; no retry, key rotation or paid fallback. The current demonstration used five of six allowed requests. Fixtures require both SCC_ISOLATED_TEST=true and SCC_ASSISTANT_FIXTURES=true and are labeled NOT AI OUTPUT. No automatic replies or autonomous outbound behavior is enabled. Group records and receipts are owner-entered/unverified; opening/copying a handoff never proves publication.

The earlier owner-away assignment prohibited migration and commit; the later controlled rollout authorization above permits only its documented local checkpoint/migration/startup. No live uploads/posts/replies/new schedules, OAuth/account changes, public deployment or push. Preserve the three existing awaiting_confirmation destinations. New source is ready for isolated review, not live production acceptance.

## V1.9 validation and protected live observation (21 October 2026)

Read [docs/qa/V1_9_FINAL_VALIDATION.md](docs/qa/V1_9_FINAL_VALIDATION.md) for current engineering results and live boundaries. Temporary TikTok refresh/health failures preserve authorization; missing account statistics remain unavailable rather than confirmed zeros. New account snapshots require the versioned nullable schema. Existing databases require the explicit [later maintenance migration](docs/qa/V19_ACCOUNT_STATISTICS_MIGRATION.md); startup does not rebuild them or rewrite historical observations.

Preserve the running non-watcher backend, local HTTPS proxy and read-only natural-renewal collector until its 21 October 2026 19:20 Asia/Bangkok closeout. Do not stop/restart them, edit live expiry/revision/credentials, trigger refresh, change .env or write/migrate the owner database during observation. These source fixes are not loaded in that protected process. Natural renewal remains a separate live gate; code-complete does not mean live rollout complete. Local commits are authorized for this final-validation task; push, deployment and social publication are not.

## V1.7 milestone status: TikTok Integration & Facebook Scheduling Verification (20 October 2026)

Read `docs/qa/OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md` for current evidence. Facebook OAuth, existing-Page reauthorization, official Reels upload, remote processing/permalink verification and automatic queue completion have **passed live acceptance**. Scheduling has automated lifecycle coverage and a saved real job; its actual public publication remains **PENDING OWNER VERIFICATION**. Browser schedule-form submission is not live-verified. Historical manual/browser or fixture PASS must not be relabeled as official API PASS.

**Protected schedule:** destination `dest-mvg66513-ttjf`, post `post-74051364-849a-4195-b132-d76c19fa10ca`, Facebook Page `409347032254077`, **20 October 2026 at 12:14 PM Asia/Bangkok** (`2026-10-20T05:14:00.000Z`). Preserve its caption, hashtags, derivative, destination and time. Do not cancel, reschedule, duplicate or manually publish it. Keep the current server running; no restart, stop, development watcher, database replacement or migration while publication is pending. Check status read-only and leave public verification to the owner. Do not mark it successful merely because the deadline passes.

Current implementation map:

- OAuth: `routes/connections.routes.ts`, `services/connections.service.ts`, `services/oauth-diagnostics.ts`, `repositories/account-connections.repo.ts` (paths relative to `server/src`). Hashed state, cookie/account/revision/expiry binding, compare-and-set exchange, encrypted request/candidate payloads and AES-256-GCM tokens remain required. Never expose codes, raw state, cookies, secrets or token bodies.
- Callback: `http://localhost:3001/api/connections/callback/facebook`, exact origin/path, no trailing slash. Acceptance used configured `META_GRAPH_VERSION=v26.0`; do not assume this means latest. Publishing needs actual `pages_manage_posts` and `pages_read_engagement`; discovery/read scopes and optional moderation are separate. `/me/permissions` verifies grants.
- Identity: original registered/public ID `61563944843401` and verified Graph Page ID `409347032254077` belong to the same existing owner account. The trusted alias is runtime data, not hardcoded production behavior. Preserve aliases/internal ID/history; no display-name matching, account duplication or cross-account identity claim bypass. Initial reconciliation accepts a trusted same-account alias or Meta resolution; an already verified ID stays strict.
- Missing Meta `expires_in` is not automatically failure: verify validity, app ownership and expiry through `/debug_token`. Explicit nonexpiring metadata uses a bounded 24-hour local revalidation window; unknown/invalid metadata fails closed. Preserve the existing encryption key and credentials on failed reauthorization. Do not promise a 60-day/permanent token lifetime.
- Reels: `connectors/meta-facebook.ts` performs start -> persist remote ID -> HTTPS rupload binary -> finish -> bounded read-only processing/permalink polling. Require ready video, complete publishing phase and a valid permalink before confirmed success. No standard-video fallback or real-account automatic replay after an uncertain submission. `onRemoteCreated` persists the ID through the queue/repository before upload/finish.
- Queue: `services/queue.service.ts` sets confirmed API results to `published` with `confirmation_source=api`; manual packages keep `awaiting_confirmation` until an explicit exact-account receipt (`confirmation_source=manual`). The legacy capability-level `requiresManualConfirmation` flag is conservative; actual API completion uses the verified result, not that flag.
- Scheduling: composer input is Bangkok wall time -> UTC ISO; server requires explicit timezone/future validity. SQLite `julianday` comparisons release due jobs on a two-second local loop. Do not re-send an elapsed schedule to Meta: due dispatch uses immediate `PUBLISHED`. Future jobs, terminal jobs and restart holds are excluded; retry must not bypass the due time. PC/server availability is required; no cloud scheduler exists.
- Tests: `npm test` runs **76 tests across nine isolated suites** at this milestone. `npx tsc --noEmit` and `npm run build:client` are required checks. Do not run tests or legacy E2E scripts against the owner's data or pending queue. Fixtures do not authorize live publishing.
- TikTok V1.7: Personal Account preserved. Display API real analytics query, video list pagination, confirmed 0 vs missing data, rate limiting, and scope fallback implemented and verified across 76 tests; live OAuth and public publication remain unverified pending owner developer credentials. Content Posting API Direct Post is blocked by TikTok Developer Policy for internal utilities managing personal/team accounts, and application watermarks are prohibited on API uploads. TikTok's separate Accounts API for Business explicitly supports both Personal and Business Accounts for owned account publishing, insights, and comment moderation, but requires business partner application and review. Secure OAuth callback design restricts exposure strictly to `/api/connections/callback/tiktok`, prohibiting open public tunnels to `localhost:3001`.

## 1. Quick Navigation: Read This First!

Depending on your role and task, choose the designated entry point:

| If your task is... | Start Here | Then Read |
| :--- | :--- | :--- |
| **Frontend UI/UX Redesign** | [`docs/UI_REDESIGN_HANDOFF.md`](file:///d:/Mamduh/Personal/social-account-managemnet/docs/UI_REDESIGN_HANDOFF.md) | [`docs/PROJECT_MAP.md`](file:///d:/Mamduh/Personal/social-account-managemnet/docs/PROJECT_MAP.md) |
| **Backend / Queue / Database** | [`docs/PROJECT_MAP.md`](file:///d:/Mamduh/Personal/social-account-managemnet/docs/PROJECT_MAP.md) | [`docs/qa/REFACTOR_REPORT.md`](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/REFACTOR_REPORT.md) |
| **Branding / FFmpeg / Canvas** | [`server/src/domain/branding.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/domain/branding.ts) | [`client/src/components/branding/WatermarkCanvas.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/components/branding/WatermarkCanvas.tsx) |
| **Engagement & Analytics (V1.5)** | [`docs/qa/REAL_ENGAGEMENT_ANALYTICS_ACCEPTANCE.md`](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/REAL_ENGAGEMENT_ANALYTICS_ACCEPTANCE.md) | [`server/src/services/sync.service.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/services/sync.service.ts) |
| **Testing & QA Verification** | [`docs/qa/REFACTOR_REPORT.md`](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/REFACTOR_REPORT.md) | [`test/social_command_center.test.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/test/social_command_center.test.ts) |

---

## 2. Essential Commands

### Install Dependencies
```powershell
# Root dependencies
npm install

# Client dependencies
cd client
npm install
cd ..
```

### Build Client
```powershell
# Production client build (Vite + TypeScript)
npm run build:client
# Or via powershell script:
powershell -ExecutionPolicy Bypass -File .\build_client.ps1
```

### Start Server
```powershell
# Production-like server (serves built client on port 3001)
powershell -ExecutionPolicy Bypass -File .\run_server.ps1
# Or directly with tsx:
npx tsx server/src/index.ts
```

### Development Mode (Concurrent Hot Reload)
```powershell
# Vite dev server (port 5180) + API server (port 3001)
npm run dev
```

### Run Automated Tests
```powershell
# Unit & Integration Tests (isolated databases; includes real-account and OAuth fixtures)
npm test
```

### Run End-to-End Autonomous Acceptance Test
```powershell
# Starts its own isolated database/server on port 3192
npm run test:onboarding
```

### Run Real Pipeline & Branding Studio Acceptance Test
```powershell
# Isolated Command Center on 3193; reads/downloads existing upstream outputs
npx tsx test/e2e/run_pipeline_regression.ts
```

---

## 3. Entry Points

- **Backend Entry Point**: [`server/src/index.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/index.ts)
  - Boots Express 5 server, sets up database schema in WAL mode, mounts routes, starts SSE streams, and initializes the publishing queue background worker.
- **Frontend Entry Point**: [`client/src/main.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/main.tsx) and [`client/src/App.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/App.tsx)
  - Single-page application using state-based navigation (`activeView`), top navigation bar, quick status indicators, and view switching.

---

## 4. Key Architectural Boundaries

The application is structured into clear layers:
1. **Domain Layer** (`server/src/domain/`): Pure rules and math without I/O or database dependencies.
   - `publishing.ts`: Destination state transitions, composite post status, retry eligibility, cancellation logic.
   - `branding.ts`: TikTok 9:16 & Facebook 16:9 safe-area boundaries, watermark coordinate calculations, movement presets.
   - `types.ts`: Pure domain models.
2. **Repository Layer** (`server/src/repositories/`): Data access layer encapsulating SQLite queries with `better-sqlite3`.
   - `accounts.repo.ts`, `publishing.repo.ts`, `inbox.repo.ts`, `activity.repo.ts`, `analytics.repo.ts`.
3. **Service Layer** (`server/src/services/`): Application workflows and external integrations.
   - `queue.service.ts`: Background publishing dispatcher, retry orchestrator, restart recovery.
   - `branding.service.ts`: FFmpeg moving watermark rendering, thumbnail generation, aspect ratio normalization, SHA256 caching.
   - `connectors/`: Meta Graph API, TikTok API, Simulator, Browser Bridge.
   - `pipeline.service.ts`: Ingestion from upstream AI video generation folder.
4. **Presentation & UI Layer** (`client/src/`):
   - `views/`: Composed screens (`DashboardView`, `AccountsView`, `PublishingView`, `BrandingStudioView`, `InboxView`, `ActivityView`, `AnalyticsView`, `SettingsView`).
   - `components/`: Modular feature components and shared primitives (`common/`).
   - `hooks/`: Extracted stateful logic (`useAccounts`, `usePublishing`, `useInbox`).
   - `theme/tokens.ts`: Semantic styling and design tokens.
   - `api/client.ts`: Typed API client.

---

## 5. Critical Behavioral Constraints (DO NOT BREAK)

1. **Independent Destination Publishing**:
   - A multi-platform post creates independent destination records.
   - A failure on one destination (e.g. TikTok) must **never** republish already-succeeded destinations (e.g. Facebook).
   - "Retry Failed" strictly re-queues only failed/cancelled destinations.
2. **Safe Restart Recovery**:
   - Destinations interrupted in `preparing`, `branding` or `uploading` reset to `preparing` with an explicit review hold on boot.
   - They are never assumed to have safely published; human review or explicit retry is required.
3. **Master Video Invariance**:
   - Original master video files in `.data/uploads` or incoming pipeline directories are strictly immutable.
   - Branded videos are generated into `.data/renders` with deterministic SHA256 cache keys.
4. **Watermark Safe Areas**:
   - 9:16 safe areas: top $\ge 120\text{px}$, bottom $\ge 280\text{px}$, right $\ge 120\text{px}$.
   - Movement presets (`smooth_sine`, `corner_jump`, `diagonal_bounce`, `static_corner`) must stay inside safe areas in both Canvas preview and FFmpeg output.
5. **Connector Capability Honesty**:
   - Always expose platform capabilities accurately via `GET /api/connectors/capabilities`.
   - Do not simulate success for unsupported operations.
6. **Accessible DOM Labels & Test Selectors**:
   - Acceptance tests depend on text matches like `button:has-text("Accounts & Categories")`, `"Connect Account"`, `"New Category"`, `"Cancel"`, `"Save Category"`, `"Publish Now"`, `"Retry Destination"`, `"Check Health"`, `"Reconnect"`, `"Render Preview"`.
   - Preserve these accessible button labels and form inputs during any styling or UI rework.

---

## 6. Sensitive & Ignored Paths (Never Commit or Track)

- `.data/` — SQLite database (`social_command_center.db`), uploaded master videos, branded renders, log files, session data.
- `.env`, `.env.local` — API tokens, app secrets.
- `client/dist/` — Compiled frontend assets.
- `node_modules/` — Node.js packages.
- Browser profiles / cookies in `.data/browser_sessions/`.
- Test artifacts and screenshots in `docs/qa/screenshots/` (unless documenting verification runs).

---

## 7. How to Choose Relevant Files Without Scanning the Entire Repo

- **Need to edit the Dashboard or Shell?**
  👉 [`client/src/App.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/App.tsx), [`client/src/views/DashboardView.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/views/DashboardView.tsx)
- **Need to restyle Account cards or Category lists?**
  👉 [`client/src/components/accounts/AccountCard.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/components/accounts/AccountCard.tsx), [`client/src/components/accounts/CategoryCard.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/components/accounts/CategoryCard.tsx)
- **Need to redesign the Publishing Composer, Queue, or Library?**
  👉 [`client/src/views/PublishingView.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/views/PublishingView.tsx), [`client/src/components/publishing/QueueTable.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/components/publishing/QueueTable.tsx), [`client/src/components/publishing/DestinationConfigCard.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/components/publishing/DestinationConfigCard.tsx)
- **Need to tweak Watermark Canvas Preview or Controls?**
  👉 [`client/src/components/branding/WatermarkCanvas.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/components/branding/WatermarkCanvas.tsx), [`client/src/components/branding/WatermarkControls.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/components/branding/WatermarkControls.tsx)
- **Need to adjust colors, padding, surfaces, typography?**
  👉 [`client/src/theme/tokens.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/theme/tokens.ts), [`client/src/index.css`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/index.css)
- **Need to modify database tables or queries?**
  👉 [`server/src/repositories/`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/repositories/)
- **Need to change background publishing rules or retry behavior?**
  👉 [`server/src/domain/publishing.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/domain/publishing.ts), [`server/src/services/queue.service.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/services/queue.service.ts)


## V1.2: Real account registration and connections

Start with `docs/qa/REAL_ACCOUNT_ONBOARDING_ACCEPTANCE.md` for setup, current evidence and pending live-platform gates. Do not infer live verification from older QA reports.

- Forms/cards: `client/src/views/AccountsView.tsx`, `client/src/components/accounts/{ConnectAccountModal,AccountCard,ConnectionModal}.tsx`.
- Identity rules: `server/src/domain/account-identity.ts`; workflows: `server/src/services/{accounts,connections,avatars}.service.ts`.
- Persistence: `server/src/repositories/{accounts,account-connections}.repo.ts`; additive migrations: `server/src/db/schema.ts`.
- OAuth endpoints: `server/src/routes/connections.routes.ts`; encrypted server tokens: `server/src/services/token-protection.ts`.
- Native prepared packages: `server/src/routes/bridge.routes.ts`, `client/src/components/publishing/HandoffModal.tsx`; exact-destination confirmation: `publishing.service.ts`.
- Account capabilities: `server/src/connectors/registry.ts`. Unknown/disconnected real accounts NEVER fall back to simulator. Simulator dispatch requires an explicit persisted `is_demo` flag.
- Register first, authorize separately. Never accept client-supplied connection status, verification, tokens or simulator mode. Preserve TikTok Personal/Business type.
- DELETE accounts archives; historical publications, video metadata, variants and master files survive. Do not add a destructive account-delete route.
- Manual preparation and opening a native site never imply publication. Keep `awaiting_confirmation` until an explicit account-confirmed post URL is recorded; retain `confirmation_source=manual` separately from external verification.
- Interrupted queue jobs reset to `preparing` with a review hold. The worker excludes this hold until explicit Retry Destination after native reconciliation. Do not restore automatic replay.
- `npm test` creates separate `.data/test-runs` directories for each suite. `npm run test:onboarding` starts its own server on port 3192 and tests browser workflows with isolated data. Never point these tests at the owner's database.
- `npx tsx test/e2e/run_pipeline_regression.ts` runs the existing real-pipeline acceptance against an isolated Command Center on 3193. It reads/downloads existing pipeline outputs and never modifies or restarts the upstream pipeline.
- `SCC_DATA_DIR` isolates SQLite and all uploads/renders. `SCC_SEED_DEMOS=false` disables initial demo seeding. Account UI pagination is 20 records per page; no platform-count cap.
- Keep `.data`, OAuth sessions, tokens, avatar uploads, test artifacts and encryption keys untracked. Tokens require a server-owned base64 32-byte `SCC_TOKEN_ENCRYPTION_KEY`; do not print it.
- Live Facebook/TikTok authorization, publishing and engagement acceptance require owner accounts, approved app products/scopes and deliberate verification. Fixture PASS is not live-platform PASS. TikTok Direct Post and Accounts API integration remain pending.

## V1.5: Genuine Engagement & Social Analytics Integration

Start with [`docs/qa/REAL_ENGAGEMENT_ANALYTICS_ACCEPTANCE.md`](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/REAL_ENGAGEMENT_ANALYTICS_ACCEPTANCE.md) for live baselines, capability matrices, and verification evidence.

- **Zero Engagement Honesty**: Zero engagement on newly published posts or newly registered accounts is a valid result. Never invent synthetic counters or fabricate simulated metrics for real accounts. Missing data must be rendered as `Unavailable (Authorization Required)`, not converted to zero.
- **Provenance Transparency**: Every metric value (post-level or account-level) carries an explicit source badge (`meta_graph_api`, `tiktok_api`, `browser_verified`, `manual`) and status (`confirmed`, `estimated`, `unavailable`, `auth_required`, `stale`).
- **Provider field availability**: The Facebook connector queries post summaries and separate shares/video-insights edges. It parses available Reel/video counters without inventing missing values. Do not assume every field/metric is available for every Graph version or account; verify live responses and provenance.
- **TikTok API Segregation**:
  - TikTok Display API (`video.list`, `video.query`): video metadata and metrics counters.
  - TikTok Accounts API: comment moderation and remote replies.
  - Personal account type is strictly preserved. Remote replies are restricted on Personal accounts without partner approval; render direct native platform links.
- **Comment Deduplication & Threading**:
  - `inboxRepo.upsertComment`: stable deduplication on `(account_id, external_comment_id)`.
  - Replies are nested under `parent_comment_id` in top-level comment threads.
  - Replying requires an explicit user action ("Send Reply") and displays sending account identity ("Replying as ...").
- **Background Synchronization**:
  - `SyncService` runs on a conservative 15-minute background polling cadence with rate-limit compliance, change detection, and activity event logging (`engagement_increased`, `observation_recorded`).
  - Broadcasts live updates via SSE (`analytics:synced`).
- **Testing & Storage Isolation**:
  - `npm test` discovers eight `test/*.test.ts` suites, each with an isolated `SCC_DATA_DIR`. All 66 tests must remain green at this milestone; update counts only from a new run.
  - Baseline real snapshots are persisted in SQLite (`post_metrics_snapshots` and `analytics_snapshots`) and never overwritten.

