# Social Command Center V1.3 — First Real Facebook & TikTok Integration Report

> **2026-10-20 status note:** Historical V1.3 manual/browser acceptance. Existing publications retain confirmation_source=manual. Current Facebook Graph identity/OAuth/API evidence is documented separately; earlier API-pending statements are dated history. See [current V1.6 acceptance](OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md). Preserve the 12:14 PM Asia/Bangkok schedule and keep its server running while pending; do not follow historical restart/publication steps against the owner instance.


**Date**: 2026-10-16 (Asia/Bangkok)  
**Target Environment**: Local Windows host (`http://localhost:3001`), AI Video Pipeline (`http://localhost:8080`)  
**Scope**: Authentic verification, real browser-assisted publishing, publication verification, and official API capability correction for registered test Facebook Page and TikTok account.

---

## 1. Executive Summary & Verification Matrix

Both registered test accounts were verified as genuinely authenticated in their respective browser sessions through DOM inspection and profile verification. 

Using the registered post `post-44262397-7263-4036-8585-fbde52b78051` and the prepared 9:16 vertical test video (`vid-mv9fl5kp-d83i_master.mp4`, 24s from AI Video Pipeline job `a97030b6-59fe-4b4d-b9b7-82983a668f82`), real test publications were executed, verified live on each platform, and recorded in Social Command Center with confirmation source `manual` and verification status `confirmed`.

### Facebook Page (`แก้บัคยาวๆๆ`, `@61563944843401`)

| Capability | Status | Evidence |
| :--- | :--- | :--- |
| **Real account identity verified** | **PASS** | Genuinely logged in as personal administrator (`administrator session identifier omitted`). In Facebook New Pages Experience (NPE), switched profile context to Page `แก้บัคยาวๆๆ` (`61563944843401`). Verified live page header, avatar, and Page management controls. |
| **Authorization established** | **PASS (Session)** / **PENDING (OAuth)** | Active browser session authenticated. Official Graph API OAuth requires setting `META_APP_ID`, `META_APP_SECRET`, and `SCC_TOKEN_ENCRYPTION_KEY`. |
| **API connection** | **DOCUMENTED** | Meta Graph API enables publishing for app-role users (Administrator, Developer, Tester) on managed Pages in **Development Mode** without public App Review. App Review is only required for third-party production users. |
| **Browser-assisted workflow** | **PASS** | Switched profile to Page `แก้บัคยาวๆๆ`, accessed native 9:16 vertical video composer (`https://www.facebook.com/reels/create`), attached master MP4, typed test caption, and completed configuration steps. |
| **Real video uploaded** | **PASS** | Master video (`vid-mv9fl5kp-d83i_master.mp4`) uploaded to Facebook Reel creator. Preview rendered and processed successfully. |
| **Actual post verified** | **PASS** | Reel is verified live on the Page's Reels feed (`https://www.facebook.com/61563944843401/reels`). Viewable with public visibility and exact caption. |
| **Published URL saved** | **PASS** | Recorded via `POST /api/publishing/destinations/dest-mvafsplz-pkh9/confirm-assisted`. Destination status: `published`, Post ID: `2030865660948720`. URL: `https://www.facebook.com/reel/2030865660948720`. |
| **Basic engagement retrieval** | **PENDING** | Native view verified (0 views, public audience). Official Graph API polling requires `pages_read_engagement` scope. |

---

### TikTok Personal Account (`maroooooooooooon16`, `@maroooooooooooon16`)

| Capability | Status | Evidence |
| :--- | :--- | :--- |
| **Real account identity verified** | **PASS** | Genuinely logged in as `@maroooooooooooon16` (`session-specific identifier omitted`). Confirmed avatar, handle, bio, and creator studio access. |
| **Authorization established** | **PASS (Session)** / **PENDING (OAuth)** | Active browser session authenticated. Official TikTok Web Login requires `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and HTTPS redirect URI. |
| **API connection** | **DOCUMENTED** | TikTok Content Posting API (`video.publish`, `video.upload`) is documented in TikTok for Developers v2. It requires an approved developer app, HTTPS redirect URI, and scope review for `video.publish`. It is not universally closed. |
| **Browser-assisted workflow** | **PASS** | Navigated to TikTok Studio (`https://www.tiktok.com/tiktokstudio/upload`), attached master MP4, dismissed joyride tour overlay, entered test caption, enabled AI-generated content disclosure, and submitted post. |
| **Real video uploaded** | **PASS** | Upload completed to 100% (`Uploaded 3.41MB`, 00:24 duration). Video processed through TikTok automated content review. |
| **Actual post verified** | **PASS** | Verified in TikTok Studio Content Manager (`https://www.tiktok.com/tiktokstudio/content`) and Home Dashboard under Recent Posts. Status: `Everyone` (Public), 24s. |
| **Published URL saved** | **PASS** | Recorded via `POST /api/publishing/destinations/dest-mvafsplz-qm9u/confirm-assisted`. Destination status: `published`, Video ID: `7697115798170782983`. URL: `https://www.tiktok.com/@maroooooooooooon16/video/7697115798170782983`. |
| **Basic engagement retrieval** | **PASS (Studio)** / **BLOCKED (API)** | Real metrics verified in Creator Studio (0 views, 0 likes, 0 comments). API retrieval for Personal accounts is restricted (Accounts API requires Business account). |

---

## 2. Account Details & Verification Data

### Facebook Page
- **Internal Account ID**: `acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5`
- **Platform**: `facebook`
- **Account Type**: `page`
- **Display Name**: `แก้บัคยาวๆๆ`
- **Handle**: `@61563944843401`
- **External Page ID**: `61563944843401`
- **Public Page URL**: `https://www.facebook.com/61563944843401`
- **Confirmed Published Reel URL**: `https://www.facebook.com/reel/2030865660948720`
- **Remote Post ID**: `2030865660948720`
- **Browser Profile**: `.data/browser-profiles/acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5/`
- **Connector Mode**: `browser_bridge`

### TikTok Personal Account
- **Internal Account ID**: `acc-e0d55bef-1976-4213-92d8-4f949ee3e5f7`
- **Platform**: `tiktok`
- **Account Type**: `personal` (Strictly preserved, no conversion to business)
- **Display Name**: `maroooooooooooon16`
- **Handle**: `@maroooooooooooon16`
- **Public Profile URL**: `https://www.tiktok.com/@maroooooooooooon16`
- **Confirmed Published Video URL**: `https://www.tiktok.com/@maroooooooooooon16/video/7697115798170782983`
- **Remote Video ID**: `7697115798170782983`
- **Browser Profile**: `.data/browser-profiles/acc-e0d55bef-1976-4213-92d8-4f949ee3e5f7/`
- **Connector Mode**: `browser_bridge`

---

## 3. Real Video Selection & Publishing Execution

### Selected Test Video
- **Video ID**: `vid-mv9fl5kp-d83i`
- **Source**: `pipeline_import` from AI Video Pipeline (`http://localhost:8080`, Job ID: `a97030b6-59fe-4b4d-b9b7-82983a668f82`)
- **Aspect Ratio**: `9:16` (Vertical short-form video)
- **Duration**: 24 seconds
- **Local Master File**: `D:\Mamduh\Personal\social-account-managemnet\.data\uploads\vid-mv9fl5kp-d83i_master.mp4`
- **SHA256 Integrity**: Master file verified unmodified.
- **Selected Version**: `original` (Master Unbranded MP4).

### Published Post Package
- **Post ID**: `post-44262397-7263-4036-8585-fbde52b78051`
- **Post Title**: `Social Command Center — Integration Test`
- **Parent Post Status**: `completed`
- **Caption**:
  ```text
  Social Command Center — Integration Test

  This is a test publication created to verify our social media management application.
  ```
- **Hashtags**: `#test #socialcommandcenter`
- **Facebook Destination ID**: `dest-mvafsplz-pkh9` (`published`)
- **TikTok Destination ID**: `dest-mvafsplz-qm9u` (`published`)

---

## 4. Platform Workflow Execution Details

### A. TikTok Studio Upload & Publish Workflow
1. **Authentication Verification**: Playwright persistent context inspected `https://www.tiktok.com/tiktokstudio/upload`. Verified avatar in header and session cookies.
2. **Video Ingestion**: Master MP4 attached to file input (`input[type="file"]`).
3. **Modal & Overlay Handling**:
   - Automatically dismissed the "Turn on automatic content checks?" modal.
   - Handled the `react-joyride` onboarding tour overlay (`#react-joyride-portal`) which intercepts pointer events on first-time uploads.
4. **Metadata & Disclosure**:
   - Replaced default filename caption in Draft.js editor with the test caption and hashtags.
   - Expanded "Show more" settings and toggled the **AI-generated content** disclosure switch to ON.
5. **Submission & Verification**:
   - Clicked "Post" once upload reached 100% (3.41 MB).
   - TikTok Studio redirected to `https://www.tiktok.com/tiktokstudio/content`.
   - Verified entry in Studio content table: title matched, duration 00:24, automated content check cleared, visibility set to `Everyone`.
   - Captured post ID `7697115798170782983`.

### B. Facebook Page Reels Workflow
1. **Authentication & Profile Context**:
   - The browser profile session is logged in as the Facebook account user who manages Page `แก้บัคยาวๆๆ`.
   - In Facebook's New Pages Experience (NPE), posting as a Page requires switching active context from Personal to Page.
   - Triggered context switch to Page `แก้บัคยาวๆๆ` (`61563944843401`).
2. **Dedicated 9:16 Video Creator**:
   - Modern Facebook Pages route vertical 9:16 short-form videos through the Reels interface (`https://www.facebook.com/reels/create`).
   - Attached `vid-mv9fl5kp-d83i_master.mp4` to the video file input (`accept="video/*,video/mp4,..."`).
3. **Metadata & Staging**:
   - Entered test caption in the Reel description editor.
   - Video preview populated on the 9:16 player canvas.
4. **Submission & Verification**:
   - Advanced through Step 1 (Edit) and Step 2 (Settings).
   - Clicked "เผยแพร่" (Publish).
   - Navigated to `https://www.facebook.com/61563944843401/reels` to verify the published Reel on the live Page.
   - Captured live Reel URL: `https://www.facebook.com/reel/2030865660948720`.

---

## 5. Corrected Official API Investigation

### TikTok Official APIs (TikTok for Developers v2)

| Topic | Prior Assessment | Corrected Finding |
| :--- | :--- | :--- |
| **API Availability** | Reported as "closed / partner-only" | **Open Documentation & Defined Path**: TikTok offers the **Content Posting API** (`video.publish`, `video.upload`) and **Direct Post API**. These are documented public APIs in TikTok for Developers v2. |
| **Access Requirements** | Inferred partner exclusivity | **Application & Review Restrictions**: Requires: (1) Registered Developer App, (2) Accepted HTTPS redirect URI (prohibiting plain HTTP), (3) App Review for `video.publish` or `video.upload` scopes. |
| **Personal vs. Business** | Assumed equal API capability | **Account Scope Limits**: Content Posting API supports user video uploads. However, the TikTok **Accounts API** and webhook/inbox engagement features are restricted to Business Accounts. Personal accounts (`maroooooooooooon16`) cannot access third-party comment management via API. |
| **Current Blocker** | Missing app credentials | The blocker is **not** access ineligibility, but **missing developer app configuration**: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and an HTTPS endpoint for OAuth callback. |

### Meta / Facebook Graph API

| Topic | Finding |
| :--- | :--- |
| **Development Mode vs. Production** | In **Development Mode**, any user added to the Meta Developer App in an **App Role** (Administrator, Developer, or Tester) who has access to the Page can authorize permissions (`pages_manage_posts`, `pages_read_engagement`) and publish via Graph API **without undergoing public App Review**. |
| **App Review Scope** | Public App Review is only required when publishing on behalf of external, third-party users outside the app developer team. |
| **Current Blocker** | Missing developer app credentials in `.env`: `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, `META_REDIRECT_URI`, and `SCC_TOKEN_ENCRYPTION_KEY`. |

---

## 6. Verification Artifacts & Screenshot Evidence

All screenshots captured during live execution are preserved in `.data/qa-screenshots/`:

| Artifact | Description |
| :--- | :--- |
| `facebook-live-state.png` | Meta Business Suite logged-in state for Page `แก้บัคยาวๆๆ`. |
| `facebook-native-page.png` | Native Page view showing context switch prompt. |
| `facebook-after-force-switch.png` | Context successfully switched to Page `แก้บัคยาวๆๆ`. |
| `facebook-reels-create.png` | Reels creation interface ready with video input. |
| `facebook-reel-step1-attached.png` | Video file attached and previewing in Reels creator. |
| `facebook-reel-step2-caption.png` | Test caption typed into Reel description. |
| `facebook-reel-step6-verified.png` | **Live verified Reel on Page Reels tab** (`/reel/2030865660948720`). |
| `tiktok-live-state.png` | TikTok Studio logged-in state for `@maroooooooooooon16`. |
| `tiktok-step2-uploaded.png` | Video uploaded to Studio with content check modal. |
| `tiktok-step3-staged-final.png` | Caption entered and AI-disclosure configured. |
| `tiktok-step4-post-result.png` | Post confirmed in TikTok Studio content manager. |
| `tiktok-content-list.png` | **Live verified TikTok video in Creator Studio** (`/@maroooooooooooon16/video/7697115798170782983`). |
| `tiktok-verified-player-modal.png` | Video player and engagement metrics in Studio. |

---

## 7. Next Actions & Operational Status

- **Immediate User Action Required**: **None**. Both authorized test publications are complete, live, and recorded in Social Command Center.
- **Test Post Retention**: The published test posts remain live on each platform per mission instructions (not deleted automatically).
- **Social Command Center Status**:
  - Post `post-44262397-7263-4036-8585-fbde52b78051`: `completed`
  - Destination `dest-mvafsplz-pkh9` (Facebook): `published`
  - Destination `dest-mvafsplz-qm9u` (TikTok): `published`
- **Prerequisites for V1.4 Official API Transition**:
  1. Register a Meta App on `developers.facebook.com`, add the Page administrator as an App Tester/Developer, and configure `META_APP_ID` / `META_APP_SECRET`.
  2. Register a TikTok App on `developers.tiktok.com`, set up a local HTTPS reverse proxy for the OAuth redirect, and request `video.publish` scope.
