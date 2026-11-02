# API-first agent workflow

The shared TypeScript CLI lets Codex, Gemini, shell scripts and other agents use the existing Gemini Autopilot and SCC APIs. Agents supply creative decisions, captions and hashtags. Existing application workers generate, assemble, brand and dispatch. This CLI adds no provider, server, polling daemon, publishing engine or UI.

For asynchronous generation, independent preparation tasks and compact recovery handoff, follow [non-blocking agent work](AGENT_NONBLOCKING_WORK.md). After `start`, continue useful work with `work-next`; inspect results in a later invocation using one `refresh`. Do not wait in an LLM session for Gemini.

Use Node and the repository's installed dependencies. Run from the SCC repository:

```powershell
npm --silent run agent -- help
npm --silent run agent -- context
npm --silent run agent -- context --account ACCOUNT_ID
npm --silent run agent -- discover
```

Every command writes one compact `agent-workflow.v1` JSON object. Use `--silent` to suppress npm's own banner. Success has `{version,ok:true,command,data}`; failure has `{version,ok:false,command,error:{code,message,uncertain}}` and exits nonzero. Input is UTF-8 JSON from `--input file.json` or `--input -` (stdin); no shell-escaped JSON is needed. Read commands do not request a social sync or model call.

Defaults are SCC `http://localhost:3001`, Pipeline `http://localhost:8080`, and the separate `.data/agent/agent.db` receipt/knowledge database. Override with `--scc`, `--pipeline`, `--state`, or `SCC_AGENT_SCC_URL`, `SCC_AGENT_PIPELINE_URL`, `SCC_AGENT_STATE`. Only HTTP(S) loopback origins without credentials or paths are accepted. Credentials and dotenv files are never loaded. Existing applications must already be running through their supported controllers; this CLI never starts, restarts or resumes them. Source changes here do not activate a frozen owner release.

Context and analytics return 20 records by default; use `--limit 1..100 --offset N` for bounded pages. Their existing SCC endpoints still read full lists internally. Pipeline discovery returns its native cursor for subsequent pages. `summary` reads only saved IDs, step outcomes and the latest five related notes; `jobs` lists compact runs and their pinned targets.

## Generate, import and prepare

First retrieve context and choose an exact account ID, its category and existing brand kit. The optional Page context includes the existing sanitized voice, rules and branding fingerprint. Follow the [Page A creative playbook](content/PAGE_A_CREATIVE_PLAYBOOK.md) when preparing that Page's content. Library presence and technical acceptance do not establish creative suitability.

Save `request.json`:

```json
{
  "title": "A robot rescues a seedling",
  "generation": {
    "title": "A robot rescues a seedling",
    "idea": "A small garden robot notices a seedling bending in rain and builds a tiny shelter. Clear cause and effect, expressive physical action, native sound.",
    "sceneCount": 2,
    "aspectRatio": "9:16"
  },
  "content": {
    "accountId": "ACCOUNT_ID",
    "caption": "Small acts can protect a new beginning.",
    "hashtags": "#ShortStory #GardenRobot",
    "scheduledAt": "2099-01-01T18:30:00+07:00",
    "applyBranding": true
  }
}
```

Choose a real future time when authorized. The timestamp must include a timezone; SCC normalizes it to UTC and keeps its Asia/Bangkok scheduling semantics. Omitting it prepares an immediate-publication draft, which still requires separate approval and queue actions. `categoryId` and `selectedVariantId` are optional content fields. `applyBranding:true` uses the destination's existing brand kit and queue renderer; it creates no new preset and never edits the master. Agents author the caption/hashtags using account context and prior knowledge; no additional text-model request is invoked.

Only after explicit authorization for generation:

```powershell
npm --silent run agent -- start --run garden-001 --input request.json --allow-generation
```

This journals intent and submits one text-only `POST /gemini-autopilot/queue`. `prompt` can replace `idea`, with exactly one supplied. Dense Mode is explicit: `generation_settings.v1`, `dense_performance`, `performance_tempo:2`; Gemini retains its native 10-second scene duration. Existing provider limits, readiness, paused state and scheduler remain authoritative. A submitted project can remain pending or blocked. The CLI never changes global settings, resumes the scheduler, forces a scene, switches providers or touches Flow. A flag records an authorization supplied by the operator; it does not authorize the agent to generate on its own.

Generation continues through existing workers after the CLI exits. Continue independent work now; inspect once in a later invocation:

```powershell
npm --silent run agent -- work-next
npm --silent run agent -- refresh --run garden-001
npm --silent run agent -- advance --run garden-001
```

`status` and `advance` reuse generation observations for five minutes; `refresh` explicitly reads current project/recovery evidence once. Incomplete work returns progress/blockers and `next:work-next`, with no import or draft creation. Completed work with a final video imports through SCC's existing source-aware, checksum-verified import service, then saves a single unapproved Reel draft. Original Pipeline project ID and source metadata remain on the SCC master. No auto approval or publication occurs. Import/preparation requires this explicit later `advance`; it is not a new background worker. SCC continues queued schedules independently after explicit queueing, while the PC and application remain available.

For an existing Gemini project, avoid generation entirely:

```json
{"title":"Existing completed film","projectId":"EXISTING_GEMINI_PROJECT_ID"}
```

Use that as `--input` to `start` without `--allow-generation`, then `advance --input content.json` using just the content object shown above. `discover` lists existing completed videos through SCC's `scene-video-library.v1` adapter, with pagination, import eligibility and incomplete-history information. `media --run garden-001` reads imported metadata and available quality/provenance information. Unknown quality remains unknown. This Gemini workflow refuses to attach a Flow project; Flow remains under manual owner control.

To import a selected completed library video from any existing provider, use `import --input selected-video.json` with `{"projectId":"COMPLETED_PROJECT_ID","categoryId":"CATEGORY_ID","title":"Library title"}` (category/title optional). SCC validates availability and deduplicates by source/project. This invokes no generation or publication. A completed Flow artifact can be imported while Flow generation remains manual; the Gemini `start`/`advance` workflow still requires a Gemini project.

For different destination accounts or times, use distinct stable run IDs with the same existing `projectId` and separate content. SCC reuses the imported master and owns independent destinations/schedules. Do not create extra runs to retry an uncertain generation or publication.

## Review and separately queue

```powershell
npm --silent run agent -- review --run garden-001
```

Review returns the exact title, media, destination, caption, hashtags, branding selection, normalized schedule, revision and `payloadHash`. Save these exact fields in `approval.json`:

```json
{"revision":1,"accountId":"ACCOUNT_ID","payloadHash":"COPY_THE_64_CHARACTER_HASH_FROM_REVIEW"}
```

After separate owner authorization for each action:

```powershell
npm --silent run agent -- approve --run garden-001 --input approval.json --owner-authorized
npm --silent run agent -- schedule --run garden-001 --input approval.json --owner-authorized
```

Approval is not dispatch. `schedule` queues the already approved exact draft in SCC's existing scheduler; with no scheduled time it queues immediate publication. No new or conflicting scheduler is added. Edits invalidate review hashes and revisions. Do not run either action without actual owner authorization of that content, destination and time. During implementation these commands are tested only against isolated fixtures.

Read outcomes with `status` and `history`. Status reads the saved post's independent destination outcomes, remote receipt and confirmation/verification fields; a queued draft is not labeled published. History accepts the existing `status`, `outcome`, `platform`, `timestamp`, `period`, `date`, `fromDate`, `toDate`, `direction`, `limit`, `offset` filters in an input JSON object. Manual handoffs remain awaiting exact confirmation; an elapsed deadline or remote ID alone does not prove publication. No retry/cancel/confirmation/public reply operation is exposed here.

## Analytics, lessons and handoff

```powershell
npm --silent run agent -- analytics --account ACCOUNT_ID
npm --silent run agent -- analytics --destination DESTINATION_ID
npm --silent run agent -- knowledge --account ACCOUNT_ID --limit 10
npm --silent run agent -- summary --run garden-001
npm --silent run agent -- jobs --limit 10
```

Analytics reads existing SCC snapshots; it does not contact a social provider or trigger refresh. Confirmed cumulative views are ranked relative to other confirmed observations. Missing or unconfirmed statistics remain null, and confirmed numeric zero remains zero. Rank is descriptive, not causal evidence. Destination history retains source, observation time and provenance status.

Record an observation using `remember --input lesson.json`:

```json
{
  "id":"garden-001-observation-1",
  "kind":"observation",
  "accountId":"ACCOUNT_ID",
  "resourceId":"garden-001",
  "text":"The latest saved snapshot has confirmed views but no available share count.",
  "source":"scc_saved_analytics",
  "evidence":{"destinationId":"DESTINATION_ID","observedAt":"COPY_OBSERVATION_TIME","views":0,"shares":null}
}
```

Use `kind:"assumption"` for unproven lessons such as an explanation for performance. Observations require an explicit source; all entries remain operator-authored and are not independently verified by the CLI. Stable entry IDs prevent duplicate notes. These compact records live in the shared agent sidecar, separate from immutable SCC analytics and its existing Page context/audits. A new agent can read `summary`, `knowledge` and `review` instead of full logs. Retain/backup the sidecar for cross-session recovery. Store no credentials in input or notes.

## Duplicate handling and recovery

Keep the same `--run` and exact input until its outcome is known. Repeated successful commands reuse receipts. A run ID with changed input or a completed step with changed content is rejected. Known IDs and request payloads are durably recorded with SQLite WAL/FULL synchronization before returning. Atomic operation claims exclude concurrent submissions; successful/rejected receipts are immutable. The database is identified as an agent sidecar before writable access; existing owner databases are refused.

Gemini text queue and SCC draft creation do not accept an effective server idempotency key. A timeout, lost response, malformed success or interrupted pending intent therefore holds the step. There is no blind POST retry. Find the original exact project/draft in the application, then supply its known ID:

```json
{"projectId":"ORIGINAL_PROJECT_ID"}
```

```powershell
npm --silent run agent -- reconcile --run garden-001 --input recovered-project.json
```

For uncertain draft creation, use `{"draftId":"ORIGINAL_DRAFT_ID"}`. Reconciliation performs reads, validates the original request (including the saved Gemini generation snapshot or complete draft content), and attaches that resource without resubmission. An identical story in another project cannot be automatically distinguished: the operator must identify the original resource. Pending generation/draft creation stays held until explicit reconciliation. An interrupted/uncertain import can safely reuse SCC's source/project deduplication; an interrupted/uncertain approval or queue can read back the exact draft receipt. Definitively rejected requests remain recorded; inspect the cause and prepare a corrected, separately identified run attached to the existing project instead of resubmitting generation.

The run pins both application URLs. SCC's configured Pipeline source must exactly match the CLI Pipeline URL, including hostname spelling; use `--pipeline` to match it. The integration never rewrites application configuration. Transport errors expose status codes instead of raw provider bodies, and follow no redirects.

## Validation and implementation scope

```powershell
npm run typecheck:agent
npm test
npx tsc --noEmit
npm run build:client
```

`npm test` provisions separate databases per suite. Agent integration tests use a fake loopback Gemini/Pipeline contract, real SCC import/draft/queue services, local fixture media, and simulated provider results. They do not load owner credentials, run real generation, publish social content, migrate production data or activate a release. Backend and UI repositories of AI Video Pipeline are inspected for compatibility and remain unchanged. See [implementation report](qa/AGENT_WORKFLOW_IMPLEMENTATION.md) for results and limits.
