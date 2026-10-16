# AGENTS.md — Developer & AI Agent Operating Guide

> **Social Command Center**: Self-hosted command center for multi-account AI video distribution, dynamic moving watermark branding, engagement inbox triage, and cross-platform analytics across Facebook Pages and TikTok accounts.

---

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
# Requires backend running on http://localhost:3001
npx tsx test/e2e/autonomous_acceptance.ts
```

### Run Real Pipeline & Branding Studio Acceptance Test
```powershell
# Requires backend running on port 3001 and AI Video Pipeline running on port 8080
npx tsx test/e2e/real_pipeline_acceptance.ts
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
   - Jobs in `processing` or `queued` state when the server terminates are safely reset to `preparing` on boot.
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
- **Meta June 2026 Deprecations**: Meta Graph API has deprecated legacy page-level insights (`page_video_views`). The Facebook connector strictly queries post-level summaries (`views`, `likes.summary(true)`, `comments.summary(true)`, `shares`) and Video Insights (`total_video_views`).
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
  - `npm test` runs 4 test suites in isolated temporary directories: `test/analytics.test.ts`, `test/domain.test.ts`, `test/real_accounts.test.ts`, `test/social_command_center.test.ts`. All 37 tests must remain 100% green.
  - Baseline real snapshots are persisted in SQLite (`post_metrics_snapshots` and `analytics_snapshots`) and never overwritten.

