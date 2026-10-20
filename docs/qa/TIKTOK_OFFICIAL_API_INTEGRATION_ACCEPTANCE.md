# V1.7 TikTok Official API Integration & Eligibility Acceptance

**Date:** 20 October 2026 (Asia/Bangkok).  
**Milestone Focus:** TikTok Official API Integration Foundation, Accounts API for Business vs Content Posting API Eligibility Audit, Login Kit Authorization, Display API Analytics, and Secure OAuth Callback Architecture.

---

## 1. Executive Summary & Capabilities Status

| Capability / Workflow | Status | Evidence & Boundary Summary |
| :--- | :--- | :--- |
| **TikTok OAuth State & CSRF Validation** | **IMPLEMENTED & ISOLATED-TESTED (LIVE AUTHORIZATION UNVERIFIED)** | Cryptographically random 32-byte state with browser hash cookie binding, atomic compare-and-set exchange, 10-minute TTL, tamper prevention. Validated in isolated suite (`test/tiktok_official_integration.test.ts`). Live authorization pending developer credentials. |
| **Personal Account Identity Linking** | **IMPLEMENTED & ISOLATED-TESTED (LIVE UNVERIFIED)** | Preserves `personal` account type. Links verified `open_id` as external identity. Enforces single-account ownership claim; prevents duplicate identity hijacking. |
| **Token Refresh & Rotation** | **IMPLEMENTED & ISOLATED-TESTED (LIVE UNVERIFIED)** | Automated refresh via `POST /v2/oauth/token/` (`grant_type: 'refresh_token'`). Rotates access token and refresh token; encrypts tokens via AES-256-GCM (`SCC_TOKEN_ENCRYPTION_KEY`). |
| **Display API Metric Synchronization** | **IMPLEMENTED & ISOLATED-TESTED (LIVE UNVERIFIED — PENDING DEVELOPER APP & OAUTH)** | Implemented `fetchPostMetrics` querying `POST /v2/video/query/` for existing published videos (`7697115798170782983`, `7697147128375725320`). Distinguishes confirmed 0 from missing data. Strict provenance `tiktok_display_api`. Append-only snapshot history. |
| **Display API Video List Retrieval** | **IMPLEMENTED & ISOLATED-TESTED (LIVE UNVERIFIED)** | Implemented `fetchVideoList` querying `POST /v2/video/list/` with pagination (`cursor`, `has_more`, `max_count`). |
| **Account Statistics Scope Fallback** | **IMPLEMENTED & ISOLATED-TESTED (LIVE UNVERIFIED)** | Requests `user.info.stats`. If ungranted, gracefully falls back to basic user info (`user.info.basic`), recording `followersTotal: null` without failing synchronization. |
| **Rate Limit & Network Resilience** | **IMPLEMENTED & ISOLATED-TESTED** | Graceful handling of HTTP 429 (`rate_limit_exceeded`) and socket timeouts. Never deletes or corrupts historical snapshots. |
| **Independent Provider Failure Isolation** | **IMPLEMENTED & ISOLATED-TESTED** | Provider errors on TikTok never block Facebook synchronization or vice versa. Verified across isolated mock suites. |
| **Content Posting API: Direct Post (`video.publish`)** | **BLOCKED BY POLICY (Anti-Utility Tool Guideline & Watermark Restriction)** | Prohibited by TikTok Open Platform Developer Guidelines for internal/personal tools: *"Not acceptable: A utility tool to help upload contents to the account(s) you or your team manages. ❌"*. Third-party watermarks/logos are also prohibited on uploaded content. |
| **Content Posting API: Upload to Draft (`video.upload`)** | **BLOCKED BY POLICY / AUDIT REQUIRED** | Requires official App Review audit and creator-audience compliance. Only routes media to TikTok inbox drafts for manual mobile app completion; does not perform unattended publishing. |
| **TikTok for Business Accounts API (Owned Account Publishing, Insights & Moderation)** | **APPLICATION & APPROVAL REQUIRED (Supports Personal & Business Accounts)** | TikTok's separate Accounts API for Business officially supports both Personal and Business Accounts for owned account management, including video publishing, insights, and comment moderation (`comment.list`, `comment.list.manage`). Access requires business onboarding and partner approval. |
| **Native Browser Handoff & Manual Confirmation** | **LIVE VERIFIED** | Established manual publishing workflow: pre-rendered branded MP4 download, caption copying, native platform navigation, and exact-destination confirmation receipt. |

---

## 2. Pre-existing Working-Tree Modification Review

Prior to V1.7 work, `server/src/connectors/tiktok.ts` contained an uncommitted modification in `fetchAccountMetrics`:
- **Content:** When calling `${this.baseUrl}/user/info/?fields=open_id,display_name,follower_count,following_count,likes_count`, if TikTok returns an error (`data.error && data.error.code !== 'ok'`), it executes a fallback query requesting only basic profile fields: `${this.baseUrl}/user/info/?fields=open_id,display_name`.
- **Purpose:** Prevents account-level synchronization from failing when the `user.info.stats` permission is ungranted or unauthorized by the creator, allowing the connector to confirm the connected user identity without fabricating missing metrics counters.
- **Preservation:** This modification was preserved in its entirety, integrated with strict type contracts (`AccountMetricsResult`), and validated across automated test suites.

---

## 3. Official API Eligibility & Architectural Audit

An in-depth investigation was conducted against official TikTok documentation across both developer ecosystems: **TikTok for Developers (Open Platform)** and **TikTok for Business (Marketing / Accounts API)**.

### 3.1 Consumer Content Posting API (`video.publish` & `video.upload`)
1. **Audience Requirement (Fatal Policy Blocker for Internal Management):**
   TikTok Open Platform's Direct Post developer guidelines explicitly restrict eligible API clients:
   > *"API clients should be intended for a wider creator audience, not merely internal tools managing accounts owned by an individual or team."*  
   > *"Not acceptable: A utility tool to help upload contents to the account(s) you or your team manages. ❌"*
   
   Social Command Center is a self-hosted command center for user-owned social accounts. Submitting it for Direct Post production review would require falsely declaring it as a public creator platform, violating developer policy.
2. **Unaudited / Sandbox Limitations:**
   Unaudited apps in development mode are restricted by TikTok:
   - Posts are limited strictly to private viewing mode (`SELF_ONLY`).
   - Capped at maximum 5 test users, whose accounts must be set to Private.
   - Public posting is impossible without completing the official compliance audit.
3. **Watermark and Promotional Branding Prohibition:**
   TikTok Developer Guidelines explicitly prohibit promotional branding:
   > *"Third-party apps and integrations are strictly prohibited from superimposing or otherwise including any brand name, logo, watermark, promotional branding, link, or promotional text on or in any content shared to TikTok."*
   
   Social Command Center's moving watermark engine produces custom account branding. Exporting these branded MP4s through Content Posting API violates TikTok guidelines unless branding is disabled for TikTok exports.

### 3.2 Display API (`video.list`, `video.query`, `user.info.*`)
- **Eligibility:** **FULLY ELIGIBLE** for Personal/Creator accounts (`@maroooooooooooon16`).
- **Supported Capabilities:**
  - Profile identity: `user.info.basic` (`open_id`, `union_id`, `avatar_url`, `display_name`).
  - Extended profile: `user.info.profile` (`username`, `bio_description`).
  - Metrics statistics: `user.info.stats` (`follower_count`, `following_count`, `likes_count`).
  - Video metrics & query: `video.list` (`POST /v2/video/query/` for views, likes, comments, shares on specific video IDs, and `POST /v2/video/list/` for recent media).
- **Sandbox Testing:** In Development/Sandbox mode, up to 10 designated test accounts can authenticate and synchronize metrics without submitting a public app review.

### 3.3 TikTok for Business Accounts API (Owned Account Management)
- **Scope & Applicability:**
  Unlike the consumer Content Posting API, TikTok's separate **Accounts API for Business** is specifically engineered for businesses, agencies, and teams managing their **owned accounts**.
- **Account Type Support:**
  Official TikTok for Business documentation explicitly confirms that the Accounts API supports **both Personal and Business Accounts** when linked as authorized owned assets.
- **Supported Features Under Accounts API:**
  - **Video Management & Publishing:** Programmatic publishing and video management on owned accounts.
  - **Insights & Performance:** Comprehensive video and profile analytics edges.
  - **Comment Moderation:** Reading comments on owned videos (`comment.list`) and posting replies / hiding comments (`comment.list.manage`).
- **Eligibility & Access Requirements:**
  - Requires registration in the **TikTok for Business Developer Platform** (distinct from standard TikTok for Developers).
  - Requires creating a Business App and submitting an application for Accounts API access for owned accounts.
  - Access is granted upon commercial/partner approval.
- **Accurate Boundary:**
  Comment management and owned-account posting on Personal accounts are **not categorically impossible**; rather, they require TikTok for Business Accounts API approval rather than standard consumer Display API scopes. In the absence of an approved business application, Social Command Center directs users to Native Platform Handoff.

---

## 4. Secure HTTPS OAuth Callback Architecture

Social Command Center operates locally at `http://localhost:3001`.

### 4.1 Security Risks of Generic Public Tunnels
Exposing `localhost:3001` via a generic public tunnel (e.g. `ngrok http 3001`) without path restrictions is unsafe:
- The Command Center is a local, single-user management tool containing SQLite data, unpublished master video files, brand kits, queue controls, and internal API endpoints (`/api/accounts`, `/api/publishing`, `/api/inbox`).
- A broad public tunnel exposes the entire management application to the public internet.

### 4.2 Recommended Narrowly Scoped Callback Design
For legitimate TikTok Web OAuth, TikTok requires an absolute `https://` redirect URI and rejects `localhost` or raw IP addresses.

A secure callback architecture must adhere to the following principles:
1. **Narrow Path Forwarding / Dedicated Edge Reverse Proxy:**
   - Public HTTPS exposure must be strictly restricted to a single endpoint:  
     `GET /api/connections/callback/tiktok`
   - All other routes (`/`, `/api/accounts`, `/api/publishing/*`, `/api/inbox/*`) are rejected or dropped at the ingress layer (returning HTTP 403 Forbidden or 404 Not Found).
   - This can be implemented using Cloudflare Tunnel with route access rules, or a lightweight Cloudflare Worker on a custom subdomain that proxies only the callback request.
2. **CSRF State & Session Cookie Binding:**
   - When OAuth starts (`POST /api/connections/:id/start`), the server generates a cryptographically random 32-byte `state` value.
   - A SHA-256 hash of this state is stored in SQLite with a 10-minute expiration window.
   - The browser receives an `httpOnly`, `SameSite=Lax`, `Secure` session cookie (`scc_oauth_session`).
   - Upon redirect from TikTok, the server validates `hash(query.state) === row.state_hash` using atomic compare-and-set (`exchanging(row.state_hash)`), preventing replay attacks and cross-site injection.
   - The state is immediately retired upon token exchange.
3. **Domain Ownership Requirements:**
   - TikTok Developer Portal requires registering the Redirect Domain under App Settings -> Web.
   - In Sandbox / Development mode, whitelisted test accounts (such as `@maroooooooooooon16`) can authorize via registered HTTPS domains.
   - Production approval requires proving domain ownership via DNS TXT record or HTML verification file (`tiktok-developer-verification.txt`).
4. **Safety Enforcement:**
   - **No tunnels or external listeners are deployed at this stage.** The system remains purely local until the owner explicitly configures credentials and the preferred callback forwarder.

---

## 5. Automated Verification Results

Automated regression and acceptance tests were executed via `npm test` across isolated test databases (`.data/test-runs/`):
- **Suites Executed:** 9 suites (including dedicated `test/tiktok_official_integration.test.ts`).
- **Tests Passed:** **76 of 76 tests (100% green)**.
- **Full Quality Checks:**
  - Backend TypeScript: `npx tsc --noEmit` -> **PASS (0 errors)**.
  - Frontend Production Build: `npm run build:client` -> **PASS (0 errors, 1951 modules transformed)**.

---

## 6. Checkpoint for Owner Action (Live TikTok Authorization)

To connect `@maroooooooooooon16` (`acc-e0d55bef-1976-4213-92d8-4f949ee3e5f7`) for live Display API analytics:

1. **Log in to TikTok for Developers:** Navigate to [developers.tiktok.com](https://developers.tiktok.com/).
2. **Create / Select Application:** Click **Manage apps** -> **Connect an app**. Name: `Social Command Center`.
3. **Add Products:**
   - Add **Login Kit** (Web).
   - Add **Display API**.
4. **Configure Scopes:** Request `user.info.basic`, `user.info.profile`, `user.info.stats`, and `video.list`.
5. **Configure Redirect URI:** Under Login Kit, register your chosen HTTPS callback URL (e.g., `https://<your-secure-domain>/api/connections/callback/tiktok`).
6. **Add Test User:** In the app dashboard under **Roles / Test Users**, add `@maroooooooooooon16` so the account can authorize in Sandbox mode before public review.
7. **Populate Environment Variables in `.env`:**
   ```text
   TIKTOK_CLIENT_KEY=<Your TikTok Client Key>
   TIKTOK_CLIENT_SECRET=<Your TikTok Client Secret>
   TIKTOK_REDIRECT_URI=https://<your-secure-domain>/api/connections/callback/tiktok
   ```
8. **Start Authorization:** Open Command Center, navigate to Accounts -> `@maroooooooooooon16` -> **Connect API** -> **Start Official Authorization**.
