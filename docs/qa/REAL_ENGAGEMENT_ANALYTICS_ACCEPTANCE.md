# V1.5 Real Engagement & Analytics Integration Acceptance Report

> **Social Command Center V1.5**  
> **Status:** PASS  
> **Date:** 2026-10-16  
> **Environment:** Node v22.23.1, SQLite 3 (WAL mode), Express 5, React 19, Playwright, Microsoft Edge  
> **Test Target:** Facebook Page `แก้บัคยาวๆๆ` (`61563944843401`) & TikTok Personal Account `@maroooooooooooon16`

---

## 1. Executive Summary

Social Command Center V1.5 successfully integrates **real engagement monitoring, unified comment synchronization, and genuine social media analytics** across connected social accounts without fabricated metrics or synthetic inflation.

### Key Achievements:
1. **Live Platform Metric Retrieval**: Inspected the four published test videos across Facebook and TikTok using authenticated browser sessions. Baseline engagement was accurately captured into timestamped SQLite snapshots with full provenance tracking.
2. **Honest Capability & Provenance Architecture**: All metric cards, leaderboard rows, and post performance entries display their exact origin (`browser_verified`, `meta_graph_api`, `tiktok_api`, `manual`). Missing values are distinguished from confirmed zero (`0 (Confirmed)`).
3. **Meta June 2026 Deprecation Compliance**: Handled Meta Graph API insights evolution by querying post-level metrics (`views`, `likes.summary(true)`, `comments.summary(true)`, `shares`) rather than deprecated legacy page-level counters.
4. **TikTok Personal Account Preservation**: Preserved the Personal account type for `@maroooooooooooon16`. Handled the TikTok API split between Display API (video counters) and Accounts API (business/partner comment moderation), providing direct native links when API reply actions are restricted.
5. **Unified Engagement Inbox with Threading & Deduplication**: Implemented comment synchronization with stable platform ID deduplication (`account_id` + `external_comment_id`), parent/reply hierarchy support, and explicit reply sending.
6. **Automated Test Coverage**: 4 independent test suites totaling 37 automated tests passed at 100% (`npm test`), along with Playwright headless UI acceptance tests.

---

## 2. Target Posts Baseline Engagement Matrix

The following table documents the four verified test posts published in V1.4 and their confirmed baseline metrics recorded in V1.5:

| Video Title | Platform | Account | Remote Post ID / URL | Views / Plays | Likes | Comments | Shares | Provenance & Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Pipeline Vertical - ไฟหน้าร้าน (Original)** | Facebook | `แก้บัคยาวๆๆ` (`61563944843401`) | `2030865660948720`<br>[View Reel](https://www.facebook.com/reel/2030865660948720) | **311** | 0 | 0 | 0 | `browser_verified`<br>Page Insights modal (311 plays, 4 reach, 3s avg watch) |
| **Pipeline Vertical - ไฟหน้าร้าน (Branded)** | Facebook | `แก้บัคยาวๆๆ` (`61563944843401`) | `1456974179666566`<br>[View Reel](https://www.facebook.com/reel/1456974179666566) | **16** | 0 | 0 | 0 | `browser_verified`<br>Page Insights modal (16 plays, 0 reach, 1s avg watch) |
| **Pipeline Vertical - ไฟหน้าร้าน (Original)** | TikTok | `@maroooooooooooon16` (`acc-e0d55bef`) | `7697115798170782983`<br>[View Video](https://www.tiktok.com/@maroooooooooooon16/video/7697115798170782983) | **0** | 0 | 0 | 0 | `browser_verified`<br>0 views (Confirmed, newly published Personal account) |
| **Pipeline Vertical - ไฟหน้าร้าน (Branded)** | TikTok | `@maroooooooooooon16` (`acc-e0d55bef`) | `7697147128375725320`<br>[View Video](https://www.tiktok.com/@maroooooooooooon16/video/7697147128375725320) | **0** | 0 | 0 | 0 | `browser_verified`<br>0 views (Confirmed, newly published Personal account) |

### Account-Level Engagement Baselines:
- **Facebook Page (`แก้บัคยาวๆๆ`)**:
  - Followers: `0`
  - Total Views: `327`
  - Likes: `0`, Comments: `0`, Shares: `0`
- **TikTok Account (`@maroooooooooooon16`)**:
  - Followers: `0`
  - Total Views: `0`
  - Likes: `0`, Comments: `0`, Shares: `0`

---

## 3. Platform API Investigation & Capability Matrix

### Meta Graph API (Facebook)
- **Post & Reel Metrics**: Meta Graph API `v25.0` allows retrieving post metrics via `/{post-id}?fields=views,likes.summary(true),comments.summary(true),shares`.
- **June 2026 Deprecations Handled**: Meta is deprecating legacy page-level insights (`page_video_views`). The connector relies on post-level engagement summaries and Video Insights (`total_video_views`) rather than deprecated batch counters.
- **Comments & Replies**: Full threading supported via `/{post-id}/comments?fields=id,from,message,created_time,like_count,comments{id,from,message,created_time}`.
- **Required Scopes**: `pages_read_engagement`, `pages_read_user_content`, `pages_manage_posts`, `pages_manage_engagement`.
- **Current Status**: Without owner OAuth credentials configured, the connector reports status `auth_required` and defaults to the native browser bridge fallback.

### TikTok API
- **Display API**: The `video.list` and `video.query` endpoints support querying video metadata and performance counters (`view_count`, `like_count`, `comment_count`, `share_count`).
- **Accounts API**: Comment moderation and remote replies require partner application review.
- **Personal Account Preservation**: The Personal account type is preserved. TikTok Personal accounts do not support remote comment replies via API; the app renders direct native links for comment management.
- **Required Scopes**: `user.info.basic`, `video.list`, `video.query` (Display API).
- **Current Status**: `auth_required` when unauthenticated; Display API metrics supported upon authorization; comment replies honest fall back to native web app.

### Capability Matrix:

| Capability | Facebook Page (Official API) | Facebook Page (Browser Bridge) | TikTok Personal (Official API) | TikTok Personal (Browser Bridge) | Simulator (Demo Only) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `canPublish` | Scope Gated | Supported (Assisted) | Pending Direct Post | Supported (Assisted) | Simulated |
| `canReadPostMetrics` | Yes (`pages_read_engagement`) | Native Links Only | Yes (`video.list`) | Native Links Only | Simulated |
| `canReadComments` | Yes (`pages_read_user_content`) | No | Partner Required | No | Simulated |
| `canReply` | Yes (`pages_manage_engagement`) | Native Link Fallback | Restricted (Personal) | Native Link Fallback | Simulated |
| `requiresManualConfirmation` | False | True | True | True | False |

---

## 4. Database Schema Migrations

Additive, idempotent SQLite migrations were implemented in `server/src/db/schema.ts`:

1. **`post_metrics_snapshots`**:
   - `id TEXT PRIMARY KEY`
   - `destination_id TEXT REFERENCES publishing_destinations(id)`
   - `account_id TEXT REFERENCES accounts(id)`
   - `platform TEXT CHECK(platform IN ('facebook', 'tiktok'))`
   - `remote_post_id TEXT NOT NULL`
   - `observed_at TEXT NOT NULL`
   - `view_count INTEGER, like_count INTEGER, comment_count INTEGER, share_count INTEGER`
   - `extra_metrics_json TEXT DEFAULT '{}'`
   - `source TEXT NOT NULL` (`browser_verified`, `meta_graph_api`, `tiktok_api`, `manual`)
   - `provenance_status TEXT DEFAULT 'confirmed'` (`confirmed`, `estimated`, `unavailable`, `auth_required`, `stale`)
   - `status_detail TEXT`

2. **`sync_states`**:
   - `id TEXT PRIMARY KEY` (`sync-{accountId}-{target}`)
   - `account_id TEXT REFERENCES accounts(id)`
   - `target TEXT CHECK(target IN ('metrics', 'comments', 'all'))`
   - `last_attempt_at TEXT, last_success_at TEXT`
   - `status TEXT DEFAULT 'idle'` (`idle`, `syncing`, `success`, `failed`, `auth_required`)
   - `error_message TEXT, records_synced INTEGER`

3. **Additive Columns**:
   - `publishing_destinations`: `last_synced_at`, `sync_status`, `sync_error`.
   - `accounts`: `followers_count`, `following_count`, `sync_status`, `sync_error`, `last_synced_at`.
   - `comments`: `parent_comment_id`, `reply_id`, `source`, `last_synced_at`.

---

## 5. UI Features & Design Verification

The user interface strictly maintains Cozy Creative Studio design tokens:

1. **Analytics View (`AnalyticsView.tsx`)**:
   - **Provenance Badge & Notice**: "Real data only" notice banner with last sync time indicator.
   - **Filters**: Platform filter (All / Facebook / TikTok), Account filter, Category filter.
   - **"Synchronize Now"**: Dedicated button that triggers background sync across connected accounts with visual spinner and status message.
   - **Aggregate Cards**: Views (327), Likes (0), Comments (0), Shares (0), Followers (0), Engagement Rate (0%).
   - **Published Videos Performance Table**:
     - Columns: Video, Account/Platform, Views, Likes, Comments, Shares, Provenance & Verification, Actions.
     - Confirmed zero views rendered as `0 (Confirmed)`.
     - Direct links to native posts.
     - "Record Observation" action button opening modal.
   - **Record Observation Modal (`RecordObservationModal.tsx`)**:
     - Form to input view count, like count, comment count, share count, provenance source, and verification notes.
     - Persists new snapshots to SQLite without mutating historical records.
   - **Platform & Category Comparison**: Facebook vs TikTok reach comparison and AI Video Category rankings.

2. **Unified Engagement Inbox (`InboxView.tsx`)**:
   - **"Synchronize Comments"**: On-demand sync button with visual progress indicator.
   - **Threaded Comment Cards (`CommentItem.tsx`)**:
     - Nested reply rendering with author avatars, timestamps, and quotes.
     - "Replying as [Account Name]" identity confirmation.
     - Explicit send action ("Send Reply").
     - Honest restriction banner with direct native platform links when API reply is restricted.

---

## 6. Verification Evidence & Screenshots

All verification screenshots are saved in `docs/qa/screenshots/`:

| Screenshot File | Description |
| :--- | :--- |
| `v15-analytics-view.png` | Genuine Analytics Dashboard showing 327 views, Published Videos table, Facebook & TikTok rows |
| `v15-observation-modal.png` | Record Observation modal for Reel `1456974179666566` with provenance selection |
| `v15-inbox-view.png` | Unified Engagement Inbox with "Synchronize Comments" button and "Real Dialogue" banner |
| `v15-facebook-reel-2030865660948720-insights-modal.png` | Facebook Page Reel 1 live insights: 311 plays, 4 reach, 3s watch time |
| `v15-facebook-reel-1456974179666566-insights-modal.png` | Facebook Page Reel 2 live insights: 16 plays, 0 reach, 1s watch time |
| `v15-facebook-page-reels.png` | Facebook Page Reels grid with published test videos |
| `v15-tiktok-studio-content.png` | TikTok Creator Studio content table showing `@maroooooooooooon16` posts |
| `v15-tiktok-video-7697115798170782983.png` | TikTok Video 1 native player inspection |
| `v15-tiktok-video-7697147128375725320.png` | TikTok Video 2 native player inspection |

---

## 7. Automated Test Results

```
TAP version 13
# test/analytics.test.ts
ok 1 - 1. recordPostMetricSnapshot stores snapshots and maintains historical records
ok 2 - 2. getVideoPerformanceList returns latest metric values with provenance badges
ok 3 - 3. getOverviewTotals aggregates confirmed metrics and isolates real accounts
ok 4 - 4. syncService.recordObservation detects increases and logs activity events
ok 5 - 5. inboxRepo.upsertComment deduplicates comments and handles threaded replies
ok 6 - 6. inboxRepo.markReplied persists explicit replies accurately
ok 7 - 7. TikTok Personal Account reports honest reply capability restrictions
# tests 7, pass 7, fail 0

# test/domain.test.ts
ok 1 - resolveParentPostStatus: correctly evaluates composite publication states
ok 2 - canRetryDestination: enforces retry limits and prevents retrying published items
ok 3 - canCancelDestination: only allows cancellation before upload begins
ok 4 - resolveSafeArea: defaults to platform specifications for 9:16 and 16:9
ok 5 - calculateWatermarkPosition: keeps watermark strictly within safe bounds across presets
# tests 5, pass 5, fail 0

# test/real_accounts.test.ts
ok 1 - Register Facebook Pages and TikTok Personal/Business without credentials, with no six-account cap
ok 2 - Normalize identities and reject duplicate aliases, URLs, external IDs, and unsafe URLs
ok 3 - Edit identity and category without changing internal ID; clear category and save independent preferences/branding
ok 4 - Never return tokens, invent a connection, or allow client privilege escalation
ok 5 - Demo-only metrics and engagement never appear as real data
ok 6 - Missing developer setup preserves registration, and cross-site mutation is rejected
ok 7 - OAuth rejects wrong state, browser binding, denied consent, and replay
ok 8 - Meta Page discovery and explicit selection bind verified ID to the original record with encrypted tokens and scope gates
ok 9 - Expired token disables publishing independently; disconnect invalidates pending OAuth
ok 10 - TikTok username mismatch is rejected; authorized identity, rotated refresh tokens, and Personal type survive
ok 11 - Token encryption detects tampering and refuses plaintext credentials
ok 12 - Real disconnected jobs prepare original/branded files, never call simulator or publish on site open
ok 13 - Archive preserves publication history, variants and master records; restore does not reconnect
ok 14 - Migrations are idempotent and restart recovery holds interrupted jobs until explicit retry
ok 15 - Avatar upload accepts bounded raster files and rejects SVG or arbitrary paths
# tests 15, pass 15, fail 0

# test/social_command_center.test.ts
ok 1 - 1. Account and category relational mapping integrity
ok 2 - 2. Connector capability discovery and honest reporting
ok 3 - 3. Multi-destination publishing: independent statuses and partial failure handling
ok 4 - 4. Retry failed destination without duplicating successful posts
ok 5 - 5. Duplicate prevention: published destination cannot be republished
ok 6 - 6. Watermark filter generator adheres to safe areas and movement presets
ok 7 - 7. Real FFmpeg moving watermark rendering and cache verification
ok 8 - 8. Engagement inbox comments reply and reaction workflows
ok 9 - 9. Crash recovery: interrupted jobs safely reset to preparing on reboot
ok 10 - 10. Session expiration detection prevents publishing to expired accounts
# tests 10, pass 10, fail 0

TOTAL: 37 tests, 37 passed, 0 failed (100% GREEN)
```

---

## 8. Completed Functionality vs. External API Blockers

To ensure absolute transparency and compliance with architectural principles, this milestone demarcates operational code readiness from external platform prerequisites:

### ✅ Completed & Fully Operational in Social Command Center V1.5:
1. **Zero-Engagement Honesty & Non-Fabrication**:
   - Zero views/comments on newly created test accounts are confirmed and rendered as `0 (Confirmed)`.
   - Missing values are never silently converted to zero; they are rendered as `Unavailable` or `—`.
2. **Full Provenance Transparency**:
   - Every metric observation carries its origin (`browser_verified`, `meta_graph_api`, `tiktok_api`, `manual`) and status (`confirmed`, `estimated`, `unavailable`, `auth_required`, `stale`).
   - Manual observations recorded via the UI modal are explicitly stamped as `browser_verified` or `manual` with timestamped notes.
3. **Honest Synchronization Feedback**:
   - Clicking "Synchronize Now" or "Synchronize Comments" when live API access tokens are unconfigured clearly reports `auth_required` status with amber badge notifications ("Official API authorization required for automated synchronization...").
   - It **never** displays a false or misleading synchronization success.
4. **Unified Inbox Deduplication & Threading**:
   - `inboxRepo.upsertComment` uses stable unique indexing on `(account_id, external_comment_id)`.
   - Parent/reply hierarchy nesting supported for discussion threads.
   - Reply composing explicitly shows the sending identity ("Replying as ...") and persists replies accurately.
   - Demo/simulator comments are strictly isolated from real accounts (`WHERE a.is_demo = 0`).
5. **Historical Observations Engine**:
   - Snapshots in `post_metrics_snapshots` and `analytics_snapshots` preserve complete history over time.
   - Increases in views trigger genuine `engagement_increased` activity events.
6. **Master Video & Publishing Invariance**:
   - Master videos and branded variant renders remain strictly immutable.

---

### ⏳ External Platform Blockers (Pending Live Authorization):
The underlying Command Center code and connectors are fully ready to ingest live data once the following external developer prerequisites are configured:

1. **Meta (Facebook Graph API)**:
   - **Page Insights & Metrics**: Requires Meta App Review approval for `pages_read_engagement` and `pages_read_user_content` to read Page Reel metrics via Graph API `v25.0`.
   - **Comment Moderation & Reply**: Requires `pages_manage_engagement` permission.
   - **Current Fallback**: Command Center displays verified browser observations and provides 1-click links to native Facebook Page Insights.

2. **TikTok (Display & Accounts APIs)**:
   - **Video Metrics Counters**: Requires TikTok App setup with `video.list` and `video.query` scopes approved in the TikTok Developer Portal.
   - **Comment Moderation**: Comment retrieval and moderation for Personal accounts via API requires TikTok Accounts API access approval (partner review).
   - **Current Fallback**: Personal account type is strictly preserved; comments and analytics provide direct links to TikTok Studio native dashboards.

