# REAL_BRANDED_PUBLISHING_ACCEPTANCE.md — Social Command Center V1.4

> **2026-10-20 status note:** Historical V1.4 manual/browser publishing acceptance. These branded publications retain manual confirmation provenance; they are not the subsequent direct API acceptance or the pending scheduled Tesla Reel. See [current V1.6 acceptance](OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md). Preserve the 12:14 PM Asia/Bangkok schedule and keep its server running while pending; do not follow historical restart/publication steps against the owner instance.


> **Acceptance Report: Real Branded Video Publishing with Account-Specific Dynamic Moving Watermarks**  
> **Date**: October 16, 2026  
> **Status**: **PASS (VERIFIED ON LIVE PLATFORMS)**  
> **Target Accounts**: Facebook Page `แก้บัคยาวๆๆ` & TikTok Personal Account `@maroooooooooooon16`  

---

## 1. Executive Summary

Social Command Center V1.4 has successfully generated, verified, and published **account-specific moving-watermark branded videos** to both registered real test accounts.

1. **Master Video Invariance (Zero-Corruption Guarantee)**:
   - Selected vertical 9:16 completed video from AI Video Pipeline (`NULLCASE`, 24s duration, 720x1280, H.264/AAC with audio).
   - Ingested as `vid-mvahu7u6-29y4`.
   - Master SHA256 before rendering: `c293d4cb48b5cdee0e67cd248aaa74bc1b626e706f741dacddaead79c7ca531c`.
   - Master SHA256 after rendering both variants: `c293d4cb48b5cdee0e67cd248aaa74bc1b626e706f741dacddaead79c7ca531c` (**STRICTLY UNCHANGED**).

2. **Thai Typography & Dynamic Moving Watermarks**:
   - Resolved Windows FFmpeg font limitation by dynamically binding `C:\Windows\Fonts\tahoma.ttf` when Thai unicode characters (`/[ก-๙]/`) are detected in the watermark text.
   - Facebook Page watermark (`แก้บัคยาวๆๆ`) rendered with sharp Thai glyphs and proper vowel/tone stacking without clipping or tofu boxes.
   - TikTok watermark (`@maroooooooooooon16`) rendered in account-specific cyan (`#00F2FE`) with `smooth_sine` movement.

3. **Live Platform Publishing & Online Motion Verification**:
   - Both branded variants were published through the assisted workflow and verified directly on the live platform players.
   - **Facebook Page Reel**: Successfully published at `https://www.facebook.com/reel/1456974179666566`. Multi-timestamp frame inspection from the live Facebook player confirmed that the moving watermark `แก้บัคยาวๆๆ` survived Facebook transcoding and moved dynamically across safe boundaries.
   - **TikTok Video**: Successfully published at `https://www.tiktok.com/@maroooooooooooon16/video/7697147128375725320` with AI-generated content disclosure enabled. Multi-timestamp frame inspection from the live TikTok player confirmed `@maroooooooooooon16` smoothly traversing the video in its sinusoidal trajectory.
   - Both destinations were confirmed via exact-account authorization (`POST /api/publishing/destinations/:id/confirm-assisted`) and transitioned to `published`, with parent post `post-0c630d82-b07b-4f69-a3bb-4e9a571449af` reaching `completed`.

---

## 2. Verification Matrix

| Metric / Requirement | Target / Constraint | Facebook Page Result | TikTok Account Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Account Identity** | Pre-registered real test accounts | `แก้บัคยาวๆๆ` (ID: `61563944843401`) | `maroooooooooooon16` (`@maroooooooooooon16`) | **PASS** |
| **Account Type** | Preserve native platform account type | Facebook Page (New Pages Experience) | Personal Account (Preserved) | **PASS** |
| **Source Video** | Distinct 9:16 video from real pipeline | `vid-mvahu7u6-29y4` (`NULLCASE`, 24s) | `vid-mvahu7u6-29y4` (`NULLCASE`, 24s) | **PASS** |
| **Master SHA256** | Strict invariance before and after | `c293d4cb48b5...` (Invariant) | `c293d4cb48b5...` (Invariant) | **PASS** |
| **Brand Variant ID** | Dedicated branded MP4 in `.data/renders` | `brnd-mvai1cf5-ju00` | `brnd-mvai1p1u-3jmf` | **PASS** |
| **Watermark Text** | Account-identifying overlay | `แก้บัคยาวๆๆ` (Thai script Tahoma) | `@maroooooooooooon16` (Cyan `#00F2FE`) | **PASS** |
| **Movement Preset** | Dynamic motion staying in safe area | `smooth_sine` (Speed: 12s) | `smooth_sine` (Speed: 14s) | **PASS** |
| **Safe Area Bounds** | Top $\ge 120\text{px}$, Bottom $\ge 260\text{px}$ | Kept inside bounds (No clipping) | Kept inside bounds (No clipping) | **PASS** |
| **Post ID** | Unified multi-destination publication | `post-0c630d82-b07b-4f69-a3bb-4e9a571449af` | `post-0c630d82-b07b-4f69-a3bb-4e9a571449af` | **PASS** |
| **Destination ID** | Independent destination entity | `dest-mvakp9bi-3sdo` | `dest-mvakp9bi-jb87` | **PASS** |
| **Remote Post URL** | Confirmed live platform post | [`facebook.com/reel/1456974179666566`](https://www.facebook.com/reel/1456974179666566) | [`tiktok.com/@maroooooooooooon16/video/7697147128375725320`](https://www.tiktok.com/@maroooooooooooon16/video/7697147128375725320) | **PASS** |
| **Online Transcoding** | Watermark visibly survives platform player | Confirmed visible in live player | Confirmed visible in live player | **PASS** |
| **Online Motion** | Watermark visibly moves across timestamps | Verified at t = 2s, 8s, 14s | Verified at t = 2s, 8s, 14s | **PASS** |
| **Destination State** | Stored in SQLite & confirmed | `published` (Progress: 100%) | `published` (Progress: 100%) | **PASS** |

---

## 3. Video Assets & Hash Integrity

### 3.1 Master Video Invariance
```text
File Path: D:\Mamduh\Personal\social-account-managemnet\.data\uploads\vid-mvahu7u6-29y4_master.mp4
Duration: 24.0 seconds | Dimensions: 720x1280 (9:16 vertical)
SHA256 Before Renders: c293d4cb48b5cdee0e67cd248aaa74bc1b626e706f741dacddaead79c7ca531c
SHA256 After Renders:  c293d4cb48b5cdee0e67cd248aaa74bc1b626e706f741dacddaead79c7ca531c
Verification: STRICTLY INVARIANT (Byte-for-byte identical, 0 modifications to master)
```

### 3.2 Rendered Branded Variants
1. **Facebook Branded Variant**:
   - **Variant ID**: `brnd-mvai1cf5-ju00`
   - **Render Path**: `D:\Mamduh\Personal\social-account-managemnet\.data\renders\branded_dc0c6b16f589a838.mp4`
   - **File Size**: 4,750,745 bytes
   - **SHA256**: `3372de2d8d7347c9d158d6ee2653178fea92055f2bf328c865048f9fbed92495`
   - **Typography**: Tahoma (`C:\Windows\Fonts\tahoma.ttf`), Font Size: 26, Color: `#FFFFFF`, Opacity: 0.9, Box Bg: `#000000` @ 0.5
   - **Signature**: `FB: แก้บัคยาวๆๆ` (Bottom safe zone)

2. **TikTok Branded Variant**:
   - **Variant ID**: `brnd-mvai1p1u-3jmf`
   - **Render Path**: `D:\Mamduh\Personal\social-account-managemnet\.data\renders\branded_cdd215471ffb1654.mp4`
   - **File Size**: 4,920,678 bytes
   - **SHA256**: `e3dde1183ef7365d53af3cb8c50482e3a7f1eeac23a09e42f595b14cb552a58b`
   - **Typography**: Arial, Font Size: 24, Color: `#00F2FE` (Cyan), Opacity: 0.9, Box Bg: `#000000` @ 0.5
   - **Signature**: `TikTok @maroooooooooooon16` (Bottom safe zone)

---

## 4. Multi-Timestamp Online Motion Verification

### 4.1 Facebook Live Reel (`https://www.facebook.com/reel/1456974179666566`)
The live Facebook Reel player was recorded across playback timestamps:
- **Timestamp $t \approx 2\text{s}$** (`v14-fb-live-frame-1.png`):
  - Watermark `แก้บัคยาวๆๆ` is located at the top-left quadrant ($y \approx 220\text{px}$) above the bicycle.
  - Thai text is crisp with zero missing glyphs.
- **Timestamp $t \approx 8\text{s}$** (`v14-fb-live-frame-2.png`):
  - Watermark has smoothly traversed diagonally downwards to the middle-right quadrant ($y \approx 700\text{px}$), positioned directly over the bicycle handlebar.
  - Safe area clearance maintained on right margin ($> 120\text{px}$) away from Facebook engagement action buttons (Like, Comment, Share).
- **Timestamp $t \approx 14\text{s}$** (`v14-fb-live-frame-3.png`):
  - Watermark continues its sinusoidal path, reversing direction upwards and returning toward the upper boundary ($y \approx 280\text{px}$) while the bicycle folds into the suitcase.

### 4.2 TikTok Live Video (`https://www.tiktok.com/@maroooooooooooon16/video/7697147128375725320`)
The live TikTok video player was recorded across playback timestamps:
- **Timestamp $t \approx 2\text{s}$** (`v14-tt-live-motion-1.png`):
  - Cyan watermark `@maroooooooooooon16` floats in the middle area across the suitcase illumination beam.
- **Timestamp $t \approx 8\text{s}$** (`v14-tt-live-motion-2.png`):
  - Watermark has translated upward and leftward ($y \approx 320\text{px}$), floating beside the popping umbrella canopy.
- **Timestamp $t \approx 14\text{s}$** (`v14-tt-live-motion-3.png`):
  - Watermark has moved downward and rightward ($y \approx 640\text{px}$) over the bicycle frame, clearly separated from the bottom caption and creator handle.

---

## 5. Architectural & Security Safeguards Verified

1. **Independent Multi-Destination Publishing**:
   - Single unified publication `post-0c630d82-b07b-4f69-a3bb-4e9a571449af` created two independent destination records:
     - Facebook: `dest-mvakp9bi-3sdo`
     - TikTok: `dest-mvakp9bi-jb87`
   - Each destination independently tracked its own branded video variant path, progress, retry eligibility, and confirmation status.
2. **Account Confirmation Integrity Gate**:
   - `confirmAssistedPublish()` strictly enforces that the caller provides `confirmAccount: true` with the exact matching `accountId`. Requests omitting this validation are rejected with HTTP 404 (`Confirm the exact destination account`), preventing accidental cross-account state contamination.
3. **Safe Area Discipline**:
   - Watermarks for 9:16 vertical videos strictly adhere to safe margins:
     - Top margin $\ge 120\text{px}$ (avoids platform top bars / navigation).
     - Bottom margin $\ge 260\text{px}$ (avoids TikTok/Reel descriptions and audio credits).
     - Right margin $\ge 120\text{px}$ (avoids platform sidebars for Like, Comment, Share, Bookmark).
4. **Offline and Regression Verification**:
   - Automated test suite passed 30/30 tests (`npm test`).
   - Production frontend build passed with zero compilation errors (`npm run build:client`).
