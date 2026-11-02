# API-first agent integration — 2 November 2026

Implemented a shared CLI in SCC that orchestrates existing Gemini Autopilot and SCC HTTP APIs. No Pipeline backend/frontend change, database migration, new service or worker is required. [Usage and JSON examples](../AGENT_WORKFLOW.md).

```powershell
npm --silent run agent -- help
```

| Delivered | Existing execution reused |
| --- | --- |
| JSON commands for creative agents | Gemini queue, project detail and SCC public API contracts |
| Idea/prompt submission with explicit Dense Mode | `/gemini-autopilot/queue`; existing Gemini worker/planner/assembly |
| Completed-video discovery and provenance | `scene-video-library.v1` through SCC discovery/import services |
| Import once, keep originals, inspect metadata | SCC source fingerprint, project ID, SHA verification, media library |
| Agent-authored captions/hashtags and saved brand kit | Existing Page voice/context, draft schema and branding renderer |
| Draft, exact revision approval, separate scheduling | SCC general publishing approval and existing queue/scheduler |
| Saved performance and compact knowledge | SCC provenance-aware snapshots plus separate operator-authored sidecar observations/assumptions |
| Resume without session logs | Durable job IDs, original requests, atomic operation claims and immutable receipts |

The CLI supports `context`, `discover`, `import`, `start`, `advance`, `status`, `media`, `review`, `approve`, `schedule`, `analytics`, `history`, `remember`, `knowledge`, `summary`, `jobs`, `reconcile`. Responses use the versioned `agent-workflow.v1` envelope. Context and analytics default to 20 records with limit/offset; Pipeline discovery uses its existing cursor contract. Prepared runs reuse local receipts without another Pipeline status request. Standalone `import` accepts completed artifacts from the existing library without invoking any provider; the generation workflow stays Gemini-only.

Safety decisions:

- Gemini text-only creation and SCC draft creation do not implement effective server request idempotency. Persist intent before POST; hold lost/malformed responses and interrupted claims for exact read-only resource reconciliation. Never blindly recreate a project or draft.
- SCC's import endpoint already deduplicates by source/project and coalesces concurrent imports. Interrupted import recovery reuses it. Approval and queue recovery read back the exact draft's revision/hash/remote queue receipt.
- The sidecar is independent of SCC's database. It uses SQLite WAL/FULL synchronization, identifies its own database before opening for writes, saves original operation inputs, and rejects changed run/step payloads. Old sidecar requests missing original inputs remain held.
- Target URLs are pinned per run, SCC's configured Pipeline source must match, HTTP is loopback-only, redirects/retries are disabled, and transport errors omit raw provider bodies. No credentials or dotenv files are loaded by the CLI.
- Separate explicit authorization is required for generation, exact approval and queueing. No Flow/global-resume/retry/cancel/reply/OAuth controls are exposed. A CLI flag records operator authorization and never substitutes for owner consent.
- Confirmed numeric zero survives; unavailable/unconfirmed aggregate metrics stay null. Ranking is descriptive cumulative performance, not a causal lesson. Knowledge labels observations and assumptions separately and remains operator-authored.

Validation:

| Check | Result |
| --- | --- |
| Full isolated regression suite (`npm test`) | **564/564 tests; 64/64 suites; zero failures/skips** |
| New agent suites | **46/46: foundation 11, Pipeline 7, SCC 11, workflow safety 12, representative integration 5** |
| Agent strict TypeScript (`npm run typecheck:agent`) | PASS |
| Backend TypeScript (`npx tsc --noEmit`) | PASS |
| Client build (`npm run build:client`) | PASS; existing >500 kB bundle warning |
| Actual CLI help/remember/knowledge/jobs JSON smoke | PASS; synthetic sidecar, zero application calls |
| Git whitespace check | PASS |

The five new test suites cover sidecar/HTTP safety, exact Pipeline request compatibility, SCC projections/receipts, workflow recovery/authorization, and representative HTTP integration. The integration uses fake loopback Pipeline queue/library/detail/download responses with SCC's real routers, isolated database, import/download verification, ffprobe, branding render, future-time exclusion and QueueService dispatch. Publication is an overridden fixture connector receipt. It confirms one simulated dispatch, immutable originals, preserved source lineage, duplicate prevention after restart, lost-create/lost-draft recovery, stale-review rejection, source mismatch and failed-generation exclusion. An outbound guard verifies zero external network attempts.

Limits and acceptance:

- Pipeline API compatibility is source-inspected and contract-fixture tested; no real Gemini generation, browser/provider readiness, quota consumption, human audiovisual review or live social publication was performed.
- Existing application availability, paused state, provider/account permissions and platform restrictions remain authoritative. The CLI does not resume blocked workers or authorize unsupported TikTok publishing.
- Generation and queued schedules run in existing workers after the agent disconnects. Import/draft preparation happens on explicit `advance`; no new completion watcher was added.
- Captions/hashtags are authored by the calling agent using existing context and knowledge. No additional text-model adapter or paid fallback was added.
- Context/analytics output is bounded locally; their existing SCC endpoints still read the full underlying list. Exact publication status filters the existing posts list locally and reports each destination's receipt independently. Destination analytics retains snapshot provenance. Knowledge lives in the agent sidecar, not a new SCC analytics table.
- SCC import preserves only its existing persisted metadata. Missing creative/conformance information remains unknown. Identical project content cannot prove which submission produced it: uncertain attachment requires the operator's original exact ID.
- No production records, social accounts, credentials, `.env`, owner configuration or running application controllers were modified. No owner release activation, live generation/publication, commit, push or deployment occurred.

All 16 uncommitted Git changes are confined to SCC: six CLI modules, five test suites, one agent typecheck configuration, two documentation files, plus the README link and package scripts. Both sibling Pipeline repositories remained clean under read-only `git status --short` verification.

Private fixture log: `.data/agent-validation/npm-test-complete.log`; untracked/ignored. Automated results are fixture evidence, not live-platform acceptance.
