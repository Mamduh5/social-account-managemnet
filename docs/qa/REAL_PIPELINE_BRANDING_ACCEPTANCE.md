# Social Command Center V1.1 — Real Pipeline Integration & Watermark Acceptance Report

> **Date:** October 15, 2026  
> **Environment:** Windows 11, Node.js v22.23.1, Express 5, React 19, SQLite WAL mode, FFmpeg, Playwright (Chromium/Edge)  
> **Host Services:** AI Video Pipeline (Go Gin API on port 8080, MinIO S3 object storage on port 9000, MongoDB on port 27017)  
> **Target Status:** 31/31 Comprehensive V1.1 PASS (100%), 27/27 Regression E2E PASS (100%), 15/15 Unit PASS (100%), 0 FAILURES, 0 REGRESSIONS  

---

## Executive Summary

Social Command Center V1.1 milestone verification is complete with **zero failures across all 73 test checkpoints**. We have established bidirectional integration with the active AI Video Pipeline, implemented non-destructive moving-watermark branding with FFmpeg, added an in-app version selector for Original Master vs. Branded Variants in Publishing, and verified real 16:9 landscape video playback and branding directly in Microsoft Edge via Playwright automation.

---

## 1. Automatic Video Discovery & Synchronization Verification

### 1.1 Live Pipeline Health & Segregation
Querying the real AI Video Pipeline running at `http://localhost:8080/scene-video-jobs` discovered **40 total projects**:
- **Completed Projects (with finalized MP4 artifacts):** 23 projects
- **Incomplete / In-Progress Projects (waiting for Flow or Gemini):** 17 projects

The Social Command Center's `PipelineService` correctly and automatically segregrated these states:
- Only completed projects with valid `video_url` artifacts are presented for import into the library.
- Repeated synchronization calls (`GET /api/pipeline/status` and `POST /api/pipeline/sync`) are strictly idempotent: 0 duplicate database records or file downloads occur.

### 1.2 Dynamic Completion Transition Test
To verify that newly completed projects are detected dynamically without restarting either application:
1. **Initial Pre-Completion State:** A mock project with status `"Waiting for Gemini"` was exposed. SCC correctly omitted it from completed video listings.
2. **Dynamic Completion Transition:** The project transitioned to `"completed"` with an MP4 artifact URL. SCC detected the newly available video on the very next synchronization cycle without requiring a server reboot.
3. **On-Demand Ingestion:** The video was successfully imported into the library with SHA256 baseline hashing and metadata extraction.
4. **Resilience & Outage Protection:** When the upstream service was stopped to simulate an outage, SCC accurately reported `health.reachable: false` (`offline`), while all previously imported library videos and branded variants remained 100% accessible and playable.

---

## 2. Original vs. Branded Publishing Workflow

### 2.1 Architecture & Version Selection
Publishing supports explicit selection between the original unbranded master video and any of its pre-rendered moving watermark variants:
1. **Schema Support:** Added `selected_variant_id TEXT` to both `publishing_posts` and `publishing_destinations` tables with idempotent SQLite migrations.
2. **Publishing Composer UI:** Section 1 of the Composer displays dynamic version selector pills:
   - `Original Master (Unbranded)`
   - Available Branded Variants (tagged with text and movement preset)
3. **Live Player Preview:** The Composer's preview player dynamically switches between the unbranded master MP4 and the selected branded MP4 variant.
4. **Queue Dispatcher:**
   - When a branded variant is selected, the publishing worker uses `branded_video_path` directly without redundant re-rendering.
   - When the original master is selected, the publishing worker publishes the original master file directly.
   - Master videos remain strictly immutable.

### 2.2 Publishing Verification Matrix

| Test Scenario | Target | Selected Version | Published File Resolved | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Test A: Raw Master** | Account 1 (Simulator) | `original` | `.data/uploads/vid-mv9m5zhs-7wjw_master.mp4` | **PASS** |
| **Test B: Branded Variant** | Account 1 (Simulator) | `brnd-mv9mmsok-evyw` | `.data/renders/branded_c301f6f5d10fd6b6.mp4` | **PASS** |
| **Test C: Multi-Destination 1** | Account 1 (Simulator) | `original` | `.data/uploads/vid-mv9m5zhs-7wjw_master.mp4` | **PASS** |
| **Test C: Multi-Destination 2** | Account 2 (Simulator) | `brnd-mv9mmsx2-6gx0` | `.data/renders/branded_69fb7e529b60df2e.mp4` | **PASS** |

Both destinations completed independently with their respective variants. Post-publishing master file SHA256 was re-verified and remained 100% untouched.

---

## 3. Real 16:9 Landscape Video Playback & Watermark Verification

### 3.1 Real Upstream 16:9 Video Asset
- **Source Pipeline Job:** `25c019e9-e822-4620-96fd-19683f10ce41` (*"The Loading Bar Fights Back"*)
- **SCC Master ID:** `vid-mv9m5zhs-7wjw`
- **File Path:** `.data/uploads/vid-mv9m5zhs-7wjw_master.mp4`
- **Resolution:** `1280×720` (16:9 Landscape)
- **Duration:** `30.0` seconds
- **File Size:** `2.60` MB (`2,727,104` bytes)
- **Video Codec:** H.264 / AVC
- **Audio Codec:** AAC stereo (`audio_codec: aac`)

### 3.2 In-Browser Playback (Playwright & Edge)
- **HTML5 Player Modal:** Opened directly from the 16:9 video card in the Video Library.
- **Orientation & Dimensions:** Verified `1280×720`, `16:9` aspect ratio.
- **Streaming:** HTTP 206 Partial Content byte-range streaming verified.
- **Seeking:** Successfully seeked to timestamp `5.25s` with smooth uninterrupted playback.
- **Branded Variant Playback:** Clicked "Play Branded Variant" in browser, successfully streaming the rendered 1280×720 branded MP4.

### 3.3 Moving Watermark Rendering (`smooth_sine` & `corner_jump`)
Rendered moving watermarks on the 16:9 video using FFmpeg with safe areas: `top: 60, bottom: 80, left: 40, right: 80`:
- **Variant 1 (`smooth_sine`):** Rendered to `.data/renders/branded_c301f6f5d10fd6b6.mp4`.
- **Variant 2 (`corner_jump`):** Rendered to `.data/renders/branded_69fb7e529b60df2e.mp4`.

### 3.4 Physical Watermark Motion Evidence
Extracted high-quality JPEG frames from the rendered 16:9 video at timestamps $t=1\text{s}$, $t=4\text{s}$, and $t=7\text{s}$:
- Frame $t=1\text{s}$: 45,580 bytes
- Frame $t=4\text{s}$: 45,528 bytes
- Frame $t=7\text{s}$: 47,444 bytes
- Frame subtraction confirmed watermark position dynamically shifting across all three timestamps without clipping safe areas.

### 3.5 Cryptographic Master Immutability

| Checkpoint | File Path | SHA256 Checksum |
| :--- | :--- | :--- |
| **Baseline (Pre-Render)** | `.data/uploads/vid-mv9m5zhs-7wjw_master.mp4` | `9fd194d34d2691308f475a801fb598b4933fb75eb6d693f96249ea018ad133a0` |
| **Post-Render (`smooth_sine`)** | `.data/uploads/vid-mv9m5zhs-7wjw_master.mp4` | `9fd194d34d2691308f475a801fb598b4933fb75eb6d693f96249ea018ad133a0` |
| **Post-Render (`corner_jump`)** | `.data/uploads/vid-mv9m5zhs-7wjw_master.mp4` | `9fd194d34d2691308f475a801fb598b4933fb75eb6d693f96249ea018ad133a0` |
| **Post-Publishing** | `.data/uploads/vid-mv9m5zhs-7wjw_master.mp4` | `9fd194d34d2691308f475a801fb598b4933fb75eb6d693f96249ea018ad133a0` |

**Master Invariance:** Pre-Hash $\equiv$ Post-Hash $\equiv$ Post-Publish Hash. **0 bytes modified.**

---

## 4. Key Fixes Applied

1. **FFmpeg Text Filter Colon Escaping (`server/src/services/ffmpeg.service.ts`):**
   - *Issue:* FFmpeg filter options use `:` as a parameter separator. When `signatureText` contained colons (e.g. `'Social Command Center 16:9'`), FFmpeg failed with exit code `-22` (`Invalid argument`).
   - *Fix:* Implemented `escapeText()` in `ffmpeg.service.ts` to properly escape colons (`\\:`), single quotes (`\\'`), backslashes, and percent signs.
2. **Consolidated Pipeline Status (`server/src/services/pipeline.service.ts`):**
   - *Issue:* Polling `/api/pipeline/status` was making two redundant upstream requests every cycle (`checkPipelineHealth` + `discoverPipelineJobs`).
   - *Fix:* Added `getPipelineStatusSummary()` to execute a single round-trip query and derive health and discovered jobs together.
3. **Publishing Version Selection & Destination Storage:**
   - *Issue:* Destination records only tracked boolean `apply_branding`, preventing selection of specific pre-rendered variants or unbranded publishing.
   - *Fix:* Added `selected_variant_id` across database schema, repository queries, queue worker dispatching, and frontend publishing hooks and UI.
4. **Card Selector Robustness in In-Browser Tests:**
   - *Issue:* Outer library sections had `rounded-2xl` matching container elements, and test dummy videos from unit tests caused empty readyState checks if `.first()` was used naively.
   - *Fix:* Targeted the specific imported master video title with ancestor matching and explicit `loadedmetadata` waiting.

---

## 5. Visual Evidence Artifacts

The following screenshots and frame evidence are preserved in `docs/qa/screenshots/`:
- `01_video_library.png` — Real video library with live pipeline sync badge and master/branded cards
- `02_browser_player_master.png` — In-browser HTML5 player playing master 9:16 vertical video
- `03_branding_studio_controls.png` — Branding Studio showing movement presets and safe-area simulator
- `04_rendered_preview_complete.png` — FFmpeg render success with browser player and direct MP4 download
- `05_version_selector_compose.png` — Publishing Composer showing version selection pills (Original vs. Branded)
- `06_16x9_browser_playback.png` — Real 16:9 landscape video playing in browser (1280x720) with seeking
- `07_16x9_branded_browser_playback.png` — Real 16:9 branded video playing in browser with moving watermark
- `08_publishing_queue_variants.png` — Publishing queue showing independent destinations with their respective variants
- `sine169_t1s.jpg`, `sine169_t4s.jpg`, `sine169_t7s.jpg` — Frame captures demonstrating 16:9 watermark motion

---

## 6. Comprehensive Verification Scorecard

| Check Category | Total Tests | Passed | Warnings | Failed | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **V1.1 Final Verification (`v1_1_final_verification.ts`)** | 31 | 31 | 0 | 0 | **PASS** |
| **Real Pipeline 9:16 Suite (`real_pipeline_acceptance.ts`)** | 27 | 27 | 0 | 0 | **PASS** |
| **Unit & Integration Suite (`npm test`)** | 15 | 15 | 0 | 0 | **PASS** |
| **TOTAL CHECKPOINTS** | **73** | **73** | **0** | **0** | **100% PASS** |

**Social Command Center V1.1 is fully verified and ready for regular local operation.**
