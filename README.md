# Social Command Center

Self-hosted multi-account video distribution, moving-watermark branding, engagement triage and provenance-aware analytics for Facebook Pages and TikTok accounts.

## Current milestone: V1.7 TikTok Official API Integration

Status as of **20 October 2026, Asia/Bangkok**:

| Capability | Evidence and boundary |
| --- | --- |
| Registration, categories, archive/restore, immutable masters and separate variants | Implemented; automated and earlier browser acceptance |
| Facebook OAuth and existing-Page reauthorization | **Live verified**, including actual grants and encrypted token storage |
| Official Facebook Reels API publishing | **Live verified**: Acceptance Reel [2657809668013982](https://www.facebook.com/reel/2657809668013982/) |
| Scheduled Facebook Reels due dispatch | **Dispatched via API**: Scheduled Reel [2100761720535236](https://www.facebook.com/reel/2100761720535236/) dispatched at 12:14 PM Bangkok time (`05:14 UTC`); status `published`, `confirmation_source=api`, `verification_status=confirmed`. Public result pending owner review. |
| Automatic queue completion | **Live verified**: Published with `confirmation_source=api`; confirmed processing/permalink, no manual confirmation |
| TikTok Login Kit & Token Rotation | **Implemented & Isolated-Tested (Live OAuth Unverified)**: CSRF state, compare-and-set code exchange, AES-256-GCM token storage, and refresh-token rotation tested. Live authorization pending owner developer app registration and secure HTTPS callback forwarder. |
| TikTok Display API Real Analytics | **Implemented & Isolated-Tested (Live Unverified)**: Queries `POST /v2/video/query/` for existing videos (`7697115798170782983`, `7697147128375725320`). Distinguishes confirmed 0 from missing data. Paginated `fetchVideoList` (`POST /v2/video/list/`). Strict provenance `tiktok_display_api`. Live sync unverified until owner connects account. |
| TikTok Stats Scope Fallback | **Implemented & Isolated-Tested (Live Unverified)**: When `user.info.stats` is ungranted, connector falls back to basic user info and records `followersTotal: null` without failing sync. |
| TikTok Content Posting API Direct Post (`video.publish`) | **Blocked by Policy**: Prohibited by TikTok Open Platform Developer Guidelines for internal utility tools managing one's own accounts: *"Not acceptable: A utility tool to help upload contents to the account(s) you or your team manages. ❌"*. Third-party watermarks/branding also prohibited on API uploads. Full workflow (`queryCreatorInfo`, `initDirectPost`, `pollPublishStatus`) implemented and gated. |
| TikTok Upload to Draft (`video.upload`) | **Blocked by Policy / App Review Required**: Subject to same creator-audience review policies; only routes video to mobile inbox drafts for manual completion. |
| TikTok for Business Accounts API (Owned Publishing, Insights & Moderation) | **Application & Approval Required**: TikTok's separate Accounts API for Business explicitly supports both Personal and Business Accounts for owned account management, video publishing, insights, and comment moderation (`comment.list`, `comment.list.manage`). Access requires business developer registration and partner approval. Native Platform Handoff retained. |
| Engagement and analytics | Scope-gated connectors, background sync, SSE and append-only snapshots; API, browser and manual evidence remain distinct. |

The authoritative evidence is [TikTok Official API Integration Acceptance](docs/qa/TIKTOK_OFFICIAL_API_INTEGRATION_ACCEPTANCE.md) and [Official API Authorization Acceptance](docs/qa/OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md).

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

This instance is loopback-only. Existing Docker files are packaging scaffolding, not a reviewed LAN/public deployment. Public callbacks, tunnels, proxies and TLS require a separate authentication/access-control review.

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
npm test                         # 9 test suites, 76 tests (isolated SCC_DATA_DIR per suite)
npx tsc --noEmit                  # Backend types
npm run build:client              # Client types and production bundle
```

Current test suite: **76 tests in nine files**, covering TikTok OAuth, state CSRF, token encryption, Display API metric synchronization, confirmed 0 vs missing data, rate limiting (HTTP 429), scope fallback, Content Posting API policy compliance, Reels API publishing, and scheduling.

Keep `.env*`, keys, `.data/` databases/WAL files/backups, tokens, profiles, MP4s, thumbnails, logs, test artifacts, dependencies and `client/dist/` out of Git.
