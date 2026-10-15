# Social Command Center — Multi-Account Social Media Management Hub

> **Self-hosted command center for automated & semi-automated AI video distribution, brand identity preservation, engagement triage, and cross-platform analytics across Facebook Pages and TikTok accounts.**

---

## 1. Overview & Architecture

The **Social Command Center** is purpose-built for AI video producers managing multiple branded channels. It links directly with your upstream AI video production pipeline (Flow, Gemini, FFmpeg) to ingest finished MP4s, apply account-specific moving watermarks and digital signatures, schedule multi-destination publishing, triage incoming viewer comments, and evaluate genre performance.

### Key Capabilities

- **Multi-Account & Category Workspaces**: Manage 6+ accounts organized into content production themes (*Object to Life*, *Screen to Life*, *Cinematic AI / Commercials*).
- **Flexible Connector Architecture**:
  1. **High-Fidelity Simulator**: Full offline testing of 6 accounts with realistic publishing, comment threads, and latency.
  2. **Official Meta Graph API (v20.0)**: Direct Page video publishing, comments, and insights.
  3. **Official TikTok Content Posting API**: Creator video publishing.
  4. **Browser Bridge (Playwright/Chromium)**: Authorized browser-assisted publishing fallback when official API permissions are restricted.
- **Branding Studio**:
  - Pre-renders dynamic moving watermarks using FFmpeg trigonometric expressions (`smooth_sine`, `corner_jump`, `diagonal_bounce`, `static_corner`).
  - Adheres strictly to **TikTok 9:16 safe areas** (top $\ge 120\text{px}$, bottom $\ge 280\text{px}$, right $\ge 120\text{px}$) and Facebook 16:9 landscape.
  - Interactive live HTML5 canvas simulator + one-click test render with backend FFmpeg.
  - Deterministic SHA256 caching preserving master MP4s without redundant re-encoding.
- **Durable Multi-Destination Publishing Queue**:
  - Independent per-account publishing records, error states, and retries.
  - If 5 destinations succeed and 1 fails, **Retry Failed** re-queues *only* the failed account without duplicating successful posts.
  - Automatic restart recovery: interrupted publishing jobs reset safely to `preparing` on server reboot.
- **Unified Engagement Inbox**: Cross-network comment stream with threaded replies, reaction toggles, and 1-click **Native Platform Handoff** for platforms restricting third-party comment replies.
- **Comparative Analytics**: Discovers which AI video genre performs best (views, likes, comments, shares, engagement rate, retention), with honest labeling of simulated vs verified platform data.
- **Timezone Native**: Configured for `Asia/Bangkok` (UTC+7).

---

## 2. Prerequisites

- **Operating System**: Windows 10/11 or Linux.
- **Node.js**: v20+ or v22 LTS (Windows host or Docker).
- **FFmpeg**: Version 6.x, 7.x, or 8.x in system `PATH` (used for moving watermark rendering and thumbnail generation).
- **Docker & Docker Compose** (Optional, for containerized self-hosting).

---

## 3. Quick Start (Local Windows PC)

### A. Clone and Install

```powershell
git clone https://github.com/Mamduh5/social-account-managemnet.git
cd social-account-managemnet

# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### B. Build Client & Run Application

To build the client bundle and start the full server on port `3001`:

```powershell
# 1. Build frontend client
powershell -ExecutionPolicy Bypass -File .\build_client.ps1

# 2. Start server (serves API, SSE, video streaming, and built frontend)
powershell -ExecutionPolicy Bypass -File .\run_server.ps1
```

Open your browser to:
```
http://localhost:3001
```

### C. Development Mode (Hot Reloading)

To run the backend with live reloading and Vite dev server concurrently:

```powershell
npm run dev
```

- Frontend: `http://localhost:5180` (automatically proxies `/api` and `/uploads` to backend)
- Backend API: `http://localhost:3001`

---

## 4. Docker Deployment

The application includes a production-ready, multi-stage `Dockerfile` (installing Node 22, FFmpeg, and fonts) and `docker-compose.yml`.

### Start Container
```bash
docker compose up -d --build
```

### View Logs
```bash
docker compose logs -f
```

### Stop Container
```bash
docker compose down
```

The SQLite database (`social_command_center.db`), video uploads, and rendered branded videos are persistently mounted to `./.data` on your host machine.

---

## 5. Integration with AI Video Pipeline

The Social Command Center bridges with your running upstream pipeline (`ai-video-pipeline`) using decoupled, robust integration methods:

### Option 1: Live HTTP & MinIO Service Integration (Primary / Recommended)
The Command Center connects directly to your running Go Gin pipeline server and MinIO S3 storage:
- **Pipeline API URL:** `http://localhost:8080` (configured via `PIPELINE_API_URL` or Settings)
- **MinIO S3 Gateway:** Streams completed MP4 artifacts from the `ai-video` bucket via `GET /scene-video-jobs/:id/artifacts/video`
- **1-Click Import:** Open **Publishing** > **Video Library** tab. Click **Import** on any completed project to ingest it into the Command Center.
- **Auto-Sync:** Real-time polling detects newly finished videos without server restart.

### Option 2: Live Watched Directory Scanner
The application can also monitor a local output directory for standalone or offline renders:
```
D:\Mamduh\Personal\ai-video-pipeline\.tmp-live-validation
```
- Open **Publishing Center** > **Video Library** tab.
- Click **Import** on any discovered video to ingest it into the Command Center.
- You can change the watched path at any time in **Settings & Bridge**.

### Option 3: REST / Webhook Ingestion Endpoint
Upstream pipeline jobs can notify the Command Center automatically on completion:
```bash
curl -X POST http://localhost:3001/api/pipeline/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "scene-job-123",
    "title": "Morning Espresso Wakes Up",
    "finalVideoPath": "D:\\Mamduh\\Personal\\ai-video-pipeline\\.tmp-live-validation\\r82-final.mp4"
  }'
```

### Option 4: Manual Direct Upload
Drag and drop any MP4 video directly from your desktop into the **Publishing Center**.

---

## 5.1 Critical Master Video Immutability & Brand Variant Tracking

- **Strict Invariance:** Original master videos in `.data/uploads/` are immutable source artifacts.
- **Pre/Post-Render SHA256 Assertions:** Before any FFmpeg watermark rendering occurs, the master video's SHA256 is recorded. The output is strictly written to a separate file in `.data/renders/`. Upon completion, the master video's SHA256 is re-verified to ensure zero byte alteration.
- **Independent Variant Storage:** Each branded version is tracked in the `branded_videos` database table with its own aspect ratio, movement preset, watermark text, and SHA256.
- **Safe Variant Deletion:** Deleting a branded version only removes the rendered file in `.data/renders/`; the master video is protected and remains untouched.

---

## 6. Social Media Accounts & Connector Modes

Each connected account can be toggled between three connector modes in **Accounts & Categories**:

| Mode | Use Case | Behavior |
| :--- | :--- | :--- |
| **Simulator (Demo)** | Offline testing & demoing | Simulates realistic upload latency, comment interactions, and analytics. Pre-loaded with 6 sample accounts across 3 categories. |
| **Official API** | Production publishing via Meta / TikTok | Requires Page Access Token (Meta) or Creator Access Token (TikTok). Directly publishes via official endpoints. |
| **Browser Bridge** | Fallback when API permissions are restricted | Uses persistent Chromium profiles (`.data/browser-profiles/{account_id}`). Launches authenticated session with prefilled video & caption for 1-click confirmation. |

### Connecting Real Meta Facebook Pages
1. Obtain a Page Access Token with `pages_manage_posts`, `pages_read_engagement`, and `pages_manage_engagement`.
2. In **Accounts**, click **Edit** on your Facebook Page.
3. Switch Connector Mode to **Official API** and paste your Page Access Token.
4. Click **Check Health** to verify connection.

### Connecting TikTok Accounts
1. Switch Connector Mode to **Official API** and paste your Creator OAuth token.
2. If API app review is pending, switch to **Browser Bridge** mode to publish through authenticated Creator Center web sessions.

---

## 7. Branding Studio & Moving Watermark Engine

Every account maintains an independent, persistent **Brand Kit**.

### Watermark Animation Presets:
1. **Smooth Sine Wave**:
   Moves smoothly across screen using sinusoidal trigonometric oscillation:
   $$x = \text{left} + (\text{width} - \text{margin}) \cdot \frac{1 + \sin(2\pi \cdot t / T)}{2}$$
2. **Corner Interval Jump**:
   Hops between safe quadrants every $N$ seconds (e.g. top-left $\to$ top-right $\to$ bottom-right $\to$ bottom-left).
3. **Diagonal Bounce**:
   Bounces continuously off safe boundaries.
4. **Static Corner**:
   Fixed positioning with safe-margin padding.

### Safe Areas:
- Vertical 9:16 (TikTok): Automatically enforces top margin ($\ge 120\text{px}$) and bottom margin ($\ge 280\text{px}$) to avoid obstructing TikTok sound titles, captions, and side action icons.
- Horizontal 16:9 (Facebook): Balanced corner padding.

### Testing & Verification:
- Use the **Live Canvas Simulator** in Branding Studio to preview the motion in real time.
- Click **Render Preview** to trigger the backend FFmpeg engine and verify the rendered MP4.

---

## 8. Running Automated Tests

The application includes an automated test suite covering all 10 core architectural requirements:

```powershell
powershell -ExecutionPolicy Bypass -File .\run_tests.ps1
```

### Verified Test Cases:
1. Account and category relational mapping integrity.
2. Connector capability discovery and honest reporting.
3. Multi-destination publishing: independent statuses and partial failure handling.
4. Retry failed destination without duplicating successful posts.
5. Duplicate upload prevention on published records.
6. Watermark filter generator adherence to safe areas and presets.
7. Real FFmpeg moving watermark rendering and SHA256 cache verification.
8. Engagement inbox comments reply and reaction workflows.
9. Crash recovery: interrupted jobs safely reset to `preparing` on reboot.
10. Session expiration detection preventing unauthorized publishing.

---

## 9. Data Persistence & Backup Runbook

All state is stored locally inside the `.data/` directory:

- **Database**: `.data/social_command_center.db` (SQLite in WAL mode)
- **Master Uploads**: `.data/uploads/`
- **Branded Video Renders**: `.data/renders/`
- **Browser Profiles**: `.data/browser-profiles/`

### Creating a Snapshot Backup:
```powershell
Copy-Item -Path .data\social_command_center.db -Destination .data\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db
```

### Restoring from Backup:
1. Stop the application or Docker container.
2. Replace `.data/social_command_center.db` with your backup copy.
3. Restart the application. Crash recovery will automatically re-verify all active queue states.

---

## 10. Diagnostics & Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `Fontconfig error` in FFmpeg | Missing Windows font escape | Built-in FFmpeg service escapes drive letter syntax (e.g. `C\:/Windows/Fonts/arial.ttf`) automatically. |
| `Token Expired` badge on Account | Remote OAuth token reached expiry | Click **Reconnect** on the account card or update token in Account Settings. |
| TikTok comment reply disabled | Platform policy restriction | Standard TikTok Content Posting API restricts comments. Use the **Native Platform Handoff** button to open the exact thread on TikTok. |
| Destination failed during publishing | Network failure or session disconnect | Click **Retry Destination**. Only the failed destination will be re-attempted; previously published destinations are protected. |

---

## 11. Project Structure & Architecture

```
social-account-managemnet/
├── AGENTS.md                        # Quickstart operating guide for developers & AI agents
├── docs/
│   ├── PROJECT_MAP.md               # Architectural reference & task-to-file guide
│   ├── UI_REDESIGN_HANDOFF.md       # Dedicated guide for the UI/UX redesign agent
│   └── qa/
│       ├── REFACTOR_REPORT.md       # Architecture refactor & QA test report
│       └── screenshots/             # 25+ visual regression & acceptance screenshots
├── server/
│   ├── src/
│   │   ├── domain/                  # Pure domain rules (publishing states, safe area math)
│   │   ├── repositories/            # Data access layer (SQLite queries via better-sqlite3)
│   │   ├── services/                # Application services (FFmpeg, Durable Queue, Pipeline)
│   │   │   └── connectors/          # Meta Graph, TikTok, Simulator, and Browser Bridge
│   │   ├── routes/                  # Express REST API endpoints (decoupled from raw SQL)
│   │   └── index.ts                 # Server entrypoint with Range MP4 streaming & SSE
├── client/                          # React + Vite + Tailwind CSS Frontend
│   ├── src/
│   │   ├── api/                     # Typed API client
│   │   ├── components/              # Modular UI components (common/, accounts/, publishing/, etc.)
│   │   ├── hooks/                   # Custom stateful hooks (useAccounts, usePublishing, useInbox)
│   │   ├── theme/                   # Centralized design tokens (surfaces, platforms, safe areas)
│   │   ├── types/                   # Full TypeScript interface definitions
│   │   ├── views/                   # Composed views (Dashboard, Accounts, Publishing, Branding, etc.)
│   │   └── App.tsx                  # App shell and active view router
├── test/                            # Unit, integration, and Playwright E2E test suites
├── Dockerfile                       # Multi-stage production container
├── docker-compose.yml               # Self-hosted Docker stack
└── README.md                        # Product documentation
```

---

## 12. Developer & Agent Guides

For detailed architectural maps, task navigation, and redesign instructions, consult:
- **Developer & Agent Guide**: [`AGENTS.md`](AGENTS.md)
- **Architecture & Task-to-File Reference**: [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md)
- **UI/UX Cozy Redesign Handoff**: [`docs/UI_REDESIGN_HANDOFF.md`](docs/UI_REDESIGN_HANDOFF.md)
- **Refactoring & QA Test Report**: [`docs/qa/REFACTOR_REPORT.md`](docs/qa/REFACTOR_REPORT.md)

