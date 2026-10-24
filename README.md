# Social Command Center

Self-hosted multi-account Page and video publishing preparation, video distribution, moving-watermark branding, engagement triage and provenance-aware analytics for Facebook Pages and TikTok accounts.

The separate [informational website](public-site/README.md) serves Terms, Privacy and Support pages plus a narrowly scoped TikTok OAuth redirect relay. It has no access to the management API, database, credentials or media. The existing owner-managed deployment and legal review boundaries are described in its [deployment guide](public-site/DEPLOYMENT.md) and [owner review](public-site/OWNER_REVIEW.md). This validation performs no deployment.

## Current runtime and real text generation — 24 October 2026

The controlled owner rollout uses a frozen local Git release, the original owner database and private configuration on **http://127.0.0.1:3001** and **https://localhost:3443**. The authorized maintenance procedure creates and verifies a consistent backup before the atomic V1.10 migration. Current release, migration, synchronization and browser evidence are recorded in [V1.10 production rollout](docs/qa/V1_10_PRODUCTION_ROLLOUT.md).

Use `npm run owner:start`, `owner:status`, `owner:stop`, `owner:startup` and `owner:disable` for the managed owner runtime. Startup is current-user only and runs the owner backend/proxy; it never starts review port 3195. Stop refuses active work. Startup holds ambiguous, interrupted or overdue publishing without resetting jobs. No administrator, firewall or public listener changes are required.

The isolated V1.10 review evidence includes real **gemini_api_free / gemini-3.5-flash-lite** generation through the approved billing-disabled configuration. Five of six authorized requests were used; rollout retains that limit and does not import demonstration voices into the owner's database. All generation requires an explicit action and produces editable, unapproved drafts. Missing configuration remains unavailable. The earlier 12ae5d8 recovery evidence is historical: [runtime recovery report](docs/qa/V1_10_RUNTIME_RECOVERY_REAL_GENERATION.md).

## V1.10: general Page posts and content workspace

The Publishing Center now prepares text-only, single-image, ordered multi-image and link drafts for Facebook Pages alongside the existing Reel composer. Thai text, per-account captions, image order/alternative text and Bangkok schedules survive save/reload. Review and exact-revision approval precede a separate queue action. Uploads and feed submission use durable remote IDs/intents; uncertain outcomes require reconciliation.

Content Assistant provides editable manual drafts, per-Page owner voice, revision review, batch preparation, audit-linked transfer to Publishing Center and grounded Page-comment reply suggestions. The default is unconfigured; an explicit Gemini Free-tier text adapter is now verified in the separate review instance (see current operation above). Optional isolated fixtures are explicitly labeled as test output. Automatic replies and autonomous publishing are disabled. Groups Planning is an owner-entered registry and manual handoff/receipt workspace; permissions and receipts remain unverified.

For local review without touching the owner instance:

```powershell
npm run review:v110 -- --fixtures
# Open http://127.0.0.1:3195 (if already running, use that instance).
# Omit --fixtures to review the default unavailable-provider/manual-draft mode.
```

The launcher uses a separate .data/v110-review database and bundle and ignores owner dotenv credentials. It always blocks social provider calls and pauses only review workers; explicit real-provider mode allows only its pinned Gemini text endpoint, while fixture mode blocks all external calls. It does not replace client/dist. Production rollout uses the explicitly authorized maintenance and verified-backup procedure; review databases are never copied into production. **No live general-post publishing acceptance was performed.** See [implementation, exact test evidence, screenshots and rollout requirements](docs/qa/V1_10_GENERAL_POSTS_CONTENT_ASSISTANT.md).

## V1.9 reliability baseline: validation and automatic synchronization

Status as of **21 October 2026, Asia/Bangkok**. See [V1.9 final validation](docs/qa/V1_9_FINAL_VALIDATION.md) for fixes, exact regression results, historical snapshot handling and runtime boundaries. Natural token renewal remains a separate live acceptance gate; do not restart the backend, HTTPS proxy or collector while that observation is running.

Prior and current evidence:

| Capability | Evidence and boundary |
| --- | --- |
| Registration, categories, archive/restore, immutable masters and separate variants | Implemented; automated and earlier browser acceptance |
| Facebook OAuth and existing-Page reauthorization | **Live verified**, including actual grants and encrypted token storage |
| Official Facebook Reels API publishing | **Live verified**: Acceptance Reel [2657809668013982](https://www.facebook.com/reel/2657809668013982/) |
| Scheduled Facebook Reels due dispatch | **Dispatched via API**: Scheduled Reel [2100761720535236](https://www.facebook.com/reel/2100761720535236/) dispatched at 12:14 PM Bangkok time (`05:14 UTC`); status `published`, `confirmation_source=api`, `verification_status=confirmed`. Public result pending owner review. |
| Automatic queue completion | **Live verified**: Published with `confirmation_source=api`; confirmed processing/permalink, no manual confirmation |
| TikTok Login Kit & Token Rotation | **Existing live OAuth accepted in V1.8**. Hashed state, cookie/account/revision binding and encrypted tokens remain required. Automatic renewal, rotation, races and failure recovery are isolated-tested; natural live renewal is pending the read-only observation. |
| TikTok Display API Real Analytics | **Existing live periodic post synchronization verified**. Genuine post counters and provenance are preserved. Missing account statistics require nullable values; historical zero snapshots are not accepted as proof of zero. |
| TikTok Stats Scope Fallback | Basic-profile fallback preserves unavailable statistics as null through connector, synchronization, persistence and analytics responses. Explicit API numeric zero remains zero. |
| TikTok Content Posting API Direct Post (`video.publish`) | **Blocked by Policy**: Prohibited by TikTok Open Platform Developer Guidelines for internal utility tools managing one's own accounts: *"Not acceptable: A utility tool to help upload contents to the account(s) you or your team manages. ❌"*. Third-party watermarks/branding also prohibited on API uploads. Full workflow (`queryCreatorInfo`, `initDirectPost`, `pollPublishStatus`) implemented and gated. |
| TikTok Upload to Draft (`video.upload`) | **Blocked by Policy / App Review Required**: Subject to same creator-audience review policies; only routes video to mobile inbox drafts for manual completion. |
| TikTok for Business Accounts API (Owned Publishing, Insights & Moderation) | **Application & Approval Required**: TikTok's separate Accounts API for Business explicitly supports both Personal and Business Accounts for owned account management, video publishing, insights, and comment moderation (`comment.list`, `comment.list.manage`). Access requires business developer registration and partner approval. Native Platform Handoff retained. |
| Engagement and analytics | Scope-gated connectors, background sync, SSE and append-only snapshots; API, browser and manual evidence remain distinct. |

The current engineering evidence is [V1.9 Final Validation](docs/qa/V1_9_FINAL_VALIDATION.md). Historical milestone evidence is [TikTok Official API Integration Acceptance](docs/qa/TIKTOK_OFFICIAL_API_INTEGRATION_ACCEPTANCE.md) and [Official API Authorization Acceptance](docs/qa/OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md).

---

## Setup and startup

Use Node.js 22 LTS (verified host: 22.23.1), npm, and FFmpeg/FFprobe on `PATH`. SQLite is supplied by `better-sqlite3`. For a fresh checkout or deliberate maintenance window:

```powershell
npm install
npm --prefix client install
npm run build:client
npm start
```

Alternatively run `powershell -ExecutionPolicy Bypass -File .\run_server.ps1`. Open **http://localhost:3001**. The API serves the built frontend, SSE and media; `GET /api/health` checks liveness.

`npm run dev` starts the API watcher and Vite on 5180. Start Facebook OAuth from port 3001 to match the callback origin.

This management instance is loopback-only. The reviewed callback relay redirects allowlisted OAuth fields to the fixed local HTTPS callback; it does not expose the management server through a tunnel. Existing Docker files are packaging scaffolding, not a reviewed LAN/public deployment.

---

## Register first, connect separately

In **Accounts & Categories > Add Social Account**, enter the public identity and display name, then save. Registration needs no credentials. Preserve the actual TikTok **Personal** or Business type; do not convert Personal to bypass an API limitation. Categories, avatars, preferences and brand kits are independent of authorization.

Archive is reversible and retains history/media. Identity aliases stay reserved, including while archived. Demo records are explicitly marked and hidden by default. Simulator dispatch requires persisted `is_demo`; real accounts never fall back to simulated success.

---

## TikTok Developer Setup & Configuration

Keep credentials in the server environment or ignored `.env`:

| Variable | Purpose/value |
| --- | --- |
| `TIKTOK_CLIENT_KEY` | Owner's TikTok developer app client key |
| `TIKTOK_CLIENT_SECRET` | Private TikTok developer client secret |
| `TIKTOK_REDIRECT_URI` | Registered HTTPS callback URL (e.g. `https://<your-secure-domain>/api/connections/callback/tiktok`) |
| `SCC_TOKEN_ENCRYPTION_KEY` | Server-owned base64 encoding of 32 random bytes for AES-256-GCM token protection |

### Portal Steps to Connect `@maroooooooooooon16`:
1. Log in to [developers.tiktok.com](https://developers.tiktok.com/).
2. Create/manage app: Add **Login Kit (Web)** and **Display API**.
3. Request scopes: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`.
4. Register the exact HTTPS redirect URI matching `TIKTOK_REDIRECT_URI`.
5. Under Roles / Test Users, add `@maroooooooooooon16` so it can authorize in Sandbox mode before public review.
6. In Command Center, navigate to Accounts -> `@maroooooooooooon16` -> **Connect API** -> **Start Official Authorization**.

---

## Verification and Private Storage

```powershell
npm test                         # Isolated SCC_DATA_DIR per suite; exact results in V1.9 report
npx tsc --noEmit                  # Backend types
npm run build:client              # Client types and production bundle
```

The full suite covers OAuth and relay isolation, token encryption/rotation and failure recovery, missing statistics, Display API metrics and rate limiting, content-posting capability gates, Facebook Reels, independent destinations and scheduling. See the dated V1.9 report for current counts; fixtures are separate from live acceptance.

Keep `.env*`, keys, `.data/` databases/WAL files/backups, tokens, profiles, MP4s, thumbnails, logs, test artifacts, dependencies and `client/dist/` out of Git.
