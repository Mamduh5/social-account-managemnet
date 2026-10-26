# Social Command Center V1.11 — Gemini-Operated Content Calendar

> Integration update (26 October 2026): this is historical fixture evidence. The owner remains on frozen V1.10; no campaign approval or publication is authorized. See [combined local release readiness](V1_11_COMBINED_RELEASE.md) for current safeguards, copy-migration evidence and rollout gates.

> **Acceptance & Verification Report**: Implementation of the external Gemini-operated content calendar, 7–30-day planning view, one-time campaign approval, local loop scheduling, and authorized Facebook Page content routing.

---

## 1. Executive Summary & Architectural Role Boundary

| Component | Role | Operational Boundary |
| :--- | :--- | :--- |
| **Gemini (via Antigravity)** | Creative Operator | Prepares multi-day plans, writes Page-specific captions, selects existing media, structures schedules, and interacts via UI or local batch API. |
| **Social Command Center** | Publishing & Queue System | Enforces draft-first boundaries, cryptographically binds batch approvals, handles durable SQLite scheduling, manages restart holds, and audits outcomes. |
| **Owner (User)** | Final Gatekeeper | Reviews complete campaigns in one action, holds pause/resume authority, can manually override individual posts, and controls live dispatch. |

> [!IMPORTANT]
> **Zero Embedded Generation Consumption**: This milestone preserves the application's existing Gemini generation allowance (1 request remaining on durable cap). No additional embedded LLM provider was added, and no requests were consumed. Gemini operates strictly from the outside through Antigravity.

---

## 2. Implementation Map & Key Changes

### A. Database Schema & Additive Persistence
- [`server/src/db/calendar-schema.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/db/calendar-schema.ts):
  - Created `publishing_campaigns` table:
    - `id` (`camp-...`), `account_id`, `name`, `editorial_scope`, `start_date`, `end_date`, `days`, `max_publications`.
    - `status` (`draft`, `awaiting_approval`, `approved`, `active`, `paused`, `completed`, `cancelled`).
    - `origin` (`manual`, `gemini_prepared`).
    - `approved_revision`, `approved_hash`, `approved_at`, timestamps.
  - Added additive columns without altering legacy table constraints:
    - `publishing_drafts.campaign_id`, `publishing_drafts.origin`.
    - `publishing_posts.campaign_id`, `publishing_posts.origin`.
    - `publishing_destinations.campaign_id`, `publishing_destinations.origin`.
- [`server/src/db/schema.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/db/schema.ts):
  - Idempotently invokes `initializeCalendarSchema(db)` when `generalPostsReady(db)` is verified.

### B. Pure Domain Logic & Cryptographic Approval Binding
- [`server/src/domain/content-calendar.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/domain/content-calendar.ts):
  - Pure domain rules: `planItemSchema`, `campaignPlanSchema`, `normalizePlanItems`.
  - Bangkok wall-time conversion: `parseBangkokScheduledTime` (parses ISO or local datetime into UTC ISO), `formatBangkokDateTime` (formats UTC ISO into Asia/Bangkok UTC+7).
  - Cryptographic approval binding:
    - `calculateCampaignApprovalHash(...)` computes a deterministic SHA-256 fingerprint binding `campaignId`, `accountId`, item IDs, revisions, payload hashes, and scheduled times.
    - Any material edit to a post invalidates the approval hash and resets the campaign/item to draft.

### C. Data Access & Service Layer
- [`server/src/repositories/calendar.repo.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/repositories/calendar.repo.ts):
  - `getCalendarItems(...)`: Unifies un-queued drafts and active/published queue destinations into a sorted list of `CalendarItem`.
  - `getCampaigns(...)`, `getCampaignById(...)`: Provides campaign summaries with aggregated post counts.
  - `isCampaignPaused(...)`, `getPausedCampaignIds(...)`: Real-time pause state checks for worker dispatch.
- [`server/src/repositories/publishing.repo.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/repositories/publishing.repo.ts):
  - `getDueScheduledDestinations()` and `getPendingQueueJobs()` filter out destinations belonging to paused campaigns (`c.status != 'paused'`).
- [`server/src/services/calendar.service.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/services/calendar.service.ts):
  - `createCampaignPlan(...)`: Validates plan, creates campaign, saves normalized drafts, sets origin (`gemini_prepared` vs `manual`).
  - `approveCampaign(...)`: One-time campaign approval; verifies max publication limits, computes approval hash, approves all drafts in the batch, queues them into `publishing_destinations` with status `scheduled`.
  - `pauseCampaign(...)` / `resumeCampaign(...)`: Controls campaign execution. On resume, checks for overdue jobs and marks them for review rather than auto-firing.
  - `publishItemNow(...)`: Manual override to immediately publish a scheduled item or approved draft.
  - `editItem(...)`: Material changes to approved items clear approval and return to draft.

### D. REST Endpoints & UI Presentation
- [`server/src/routes/calendar.routes.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/server/src/routes/calendar.routes.ts):
  - Loopback-protected endpoints: `GET /api/calendar/health`, `GET /api/calendar/campaigns`, `GET /api/calendar/items`, `POST /api/calendar/plan`, `POST /api/calendar/campaigns/:id/approve`, `POST /api/calendar/campaigns/:id/pause`, `POST /api/calendar/campaigns/:id/resume`, `POST /api/calendar/items/:id/publish-now`, `PATCH /api/calendar/items/:id`, `DELETE /api/calendar/items/:id`.
- [`client/src/views/CalendarView.tsx`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/views/CalendarView.tsx):
  - Interactive multi-day content planning view (7, 14, 30 days).
  - Page selector (bound to authorized Page).
  - Campaign summary banner with One-Click "Approve Entire Campaign" and "Pause / Resume Campaign" buttons.
  - Scheduler Health Banner with real-time Bangkok time and offline PC limitations notice.
  - Day-by-day publication timeline with origin badges (`Gemini Prepared` vs `Manual`), content type icons, media previews, and live publication receipts.
- [`client/src/hooks/useCalendar.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/hooks/useCalendar.ts) and [`client/src/types/calendar.ts`](file:///d:/Mamduh/Personal/social-account-managemnet/client/src/types/calendar.ts).

---

## 3. Analysis: Meta-Native vs Local Loop Scheduling

As required by milestone Section 6, we evaluated Meta Graph API native scheduled feed posts vs Social Command Center local scheduling:

| Evaluation Factor | Meta-Native Scheduled Post (`scheduled_publish_time`) | Social Command Center Local Loop (SQLite WAL) | Verdict |
| :--- | :--- | :--- | :--- |
| **Time Horizon** | Restricted: 10 minutes to 30–75 days in advance. | Unrestricted: Any valid future date. | **Local Loop Superior** |
| **Media Attachments** | Unpublished photo uploads (`photos?published=false`) expire if not published within a brief window, risking orphaned errors. | Original master images stored safely locally; unpublished photo created and verified at exact dispatch time. | **Local Loop Superior** |
| **Reels Availability** | Video Reels API (`/video_reels`) has inconsistent scheduling support across app tiers and permissions. | Unified scheduling engine across all post types (text, single/multi image, link, and reels). | **Local Loop Superior** |
| **Campaign Pause Control** | If scheduled natively on Meta, pausing a campaign offline is impossible without active API calls for every post. | Instant local campaign pause blocks dispatch loop without contacting Meta. | **Local Loop Superior** |
| **Crash & Overdue Safety** | An offline PC cannot cancel an accidental native schedule. | If PC restarts after being offline, `publishingStartupHold` holds overdue work for owner review rather than flooding the Page. | **Local Loop Superior** |

> [!NOTE]
> **Offline PC Notice**: Because scheduling is managed locally, the server must be active at the scheduled time. When the PC starts up after being off, any due jobs are held for explicit review rather than immediately blasted into the feed.

---

## 4. Test Page Content Routing (**แก้บัคยาวๆๆ**)

The connected Facebook Page **แก้บัคยาวๆๆ** (`acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5`, external ID `409347032254077`) is the verified development/test destination.

### Genuine Technical Topics Prepared in Page Voice:
1. **Day 1 (Text)**: *แก้บัค SQLite WAL-safe Atomic Rollback ใน V1.10* — Explanation of transactional rollback protecting foreign keys.
2. **Day 2 (Single Image)**: *ทดสอบการแนบภาพเดี่ยวและตรวจสอบ Unpublished Photo ID* — Photo verification before feed publication.
3. **Day 3 (Link)**: *สถาปัตยกรรม Draft-First Publishing เพื่อความปลอดภัยของบัญชี* — Architectural rationale for draft-first workflows.
4. **Day 4 (Text)**: *การคำนวณ Safe-Area สำหรับ Moving Watermark 9:16 vs 16:9* — Mathematical boundaries avoiding platform UI buttons.
5. **Day 5 (Text)**: *การทดลองระบบตั้งเวลา Local Loop vs Meta-Native Schedule* — Reliability findings comparing local loop to native scheduling.
6. **Day 6 (Text)**: *บันทึกการตรวจสอบสิทธิ์ TikTok Display API บน Personal Account* — Scope boundaries and Display API observations.
7. **Day 7 (Text)**: *สรุปการทดสอบระบบ One-Time Campaign Approval V1.11* — Milestone summary and approval binding demonstration.

### Disconnected Pages Boundary:
- The data model (`CalendarService` and `campaignPlanSchema`) dynamically resolves account identities.
- Any attempt to target an unverified or disconnected Page fails closed (`Selected Page lacks authorized publishing capabilities`).
- New Pages connected in the future will never be automatically enrolled into any campaign plan.

---

## 5. Automated Verification Evidence

### Isolated Unit & Integration Tests:
- Ran `npm test` across **21 isolated test suites**:
  - `account_statistics.test.ts` — PASS
  - `analytics.test.ts` — PASS
  - `assistant_provider.test.ts` — PASS
  - `content_calendar.test.ts` — **9/9 PASS** (Bangkok time parsing, 7-day plan, account isolation, batch approval, material edit invalidation, pause/resume, publish now, 30-day unactivated schedule, scheduler health)
  - `content_workspace.test.ts` — PASS
  - `domain_and_repositories.test.ts` — PASS
  - `facebook_reauthorization.test.ts` — PASS
  - `facebook_revalidation.test.ts` — PASS
  - `general_posts.test.ts` — PASS
  - `loopback_proxy_callback.test.ts` — PASS
  - `meta_general_posts.test.ts` — PASS
  - `meta_reels_publishing.test.ts` — PASS
  - `official_api_authorization.test.ts` — PASS
  - `real_accounts.test.ts` — PASS
  - `reels_queue_acceptance.test.ts` — PASS
  - `runtime_recovery.test.ts` — PASS
  - `social_command_center.test.ts` — PASS
  - `tiktok_oauth_relay.test.ts` — PASS
  - `tiktok_official_integration.test.ts` — PASS
  - `tiktok_token_refresh.test.ts` — PASS
  - `v110_rollout.test.ts` — PASS

### Static Typing & Build Verification:
- `npx tsc --noEmit` — **PASS** (Zero errors)
- `npx tsc --project tsconfig.operations.json` — **PASS** (Zero errors)
- `npm run build:client` — **PASS** (Built in 1.47s, client assets bundled into `client/dist`)

### Browser Acceptance Test (`test/e2e/v111_calendar_acceptance.ts`):
- Executed on isolated port `3196` with Microsoft Edge headless shell.
- **7/7 Stages Passed**:
  1. Seeded isolated database with authorized Page and media image.
  2. Booted isolated server instance.
  3. Created 7-day content plan via `POST /api/calendar/plan` (all 7 drafts saved).
  4. Created 30-day demonstration plan (kept unactivated in draft state).
  5. Navigated to Content Calendar UI; verified Bangkok dates, Gemini Prepared badges, and post cards.
  6. Tested Batch Approval in UI: clicked "Approve Entire Campaign (Batch)", confirmed cryptographic hash binding, verified transition to active, tested Pause Campaign and Resume Campaign.
  7. Tested Material Edit: updated caption on post, confirmed approval invalidation.

---

## 6. Captured Acceptance Screenshots

The following verification screenshots were recorded during the autonomous browser acceptance test:

````carousel
![7-Day Content Calendar Overview](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/screenshots/v111_01_calendar_7day_overview.png)
<!-- slide -->
![30-Day Demonstration Schedule Overview](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/screenshots/v111_02_calendar_30day_overview.png)
<!-- slide -->
![One-Time Campaign Batch Approved](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/screenshots/v111_03_campaign_approved_batch.png)
<!-- slide -->
![Campaign Paused State](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/screenshots/v111_04_campaign_paused.png)
<!-- slide -->
![Material Edit Approval Invalidation](file:///d:/Mamduh/Personal/social-account-managemnet/docs/qa/screenshots/v111_05_material_edit_invalidation.png)
````

---

## 7. Protected Safety Boundaries Maintained

1. **Owner Database Preservation**:
   - The production SQLite database (`.data/social_command_center.db`) was not modified directly.
   - All tests were executed in isolated test directories under `.data/test-runs/`.
2. **Three Protected Manual Destinations**:
   - `dest-mvf5hdwf-19hi`, `dest-mvf5j24q-ub0y`, and `dest-mvf5j24r-rw4x` remain in `awaiting_confirmation` status with zero resets, replays, or modifications.
3. **No Unapproved Live Publishing**:
   - The 7-day campaign and 30-day demonstration are prepared and verified in isolated environments.
   - Live publication to Facebook was stopped at the first campaign-approval checkpoint as required.
4. **No Git Push or External Deployment**:
   - All development is local.

---

## 8. Instructions for Reviewing and Approving the First Campaign

To review the newly prepared Content Calendar in the owner application:

1. **Open the Dashboard**:
   - Navigate to the local command center (`http://localhost:3001` or `https://localhost:3443`).
2. **Select Content Calendar**:
   - Click **Content Calendar** in the sidebar navigation.
3. **Review the Planned Items**:
   - Inspect the 7 planned posts for **แก้บัคยาวๆๆ**.
   - Note the **Gemini Prepared** provenance badges and scheduled Bangkok publication times.
4. **One-Time Batch Approval**:
   - Click the green **Approve Entire Campaign (Batch)** button.
   - Social Command Center will compute the cryptographic revision hash and queue the posts into the durable publishing scheduler.
5. **Campaign Controls**:
   - Use **Pause Campaign** at any time to temporarily suspend scheduled publishing.
   - Click the **Publish Now** icon on any individual post to immediately dispatch it ahead of schedule.
