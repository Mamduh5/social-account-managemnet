# Continue useful agent work while Gemini runs

Pipeline already performs planning, generation, bounded waiting/recovery and assembly in its durable `AutopilotWorker`. The agent CLI submits a queue request and exits. Do not keep an LLM session polling or taking screenshots of an unchanged generating screen. The earlier delay was caused by agent orchestration waiting on that already-asynchronous worker.

```powershell
npm --silent run agent -- start --run YOUR_RUN --input request.json --allow-generation
npm --silent run agent -- handoff
npm --silent run agent -- work-next
# Continue an independent task now. Inspect generation in a later invocation:
npm --silent run agent -- refresh --run YOUR_RUN
```

`start` returns the durable project ID, `agentShouldWait:false`, and `next:"work-next"`. Its original request and receipt survive session termination. No new generation worker, browser controller, polling daemon, scheduler or background LLM is added. Explicit generation authorization remains required. These examples are instructions for future authorized work, not commands run against the protected interrupted project during implementation.

## Durable independent preparation

Save `task.json`:

```json
{"id":"rain-followup-plan","kind":"story_plan","title":"Prepare an original visual story","priority":60,"payload":{"ownerIdea":"A desk lamp guides a lost paper moth home","generationMode":"dense_performance","requirements":["Immediate action","Connected consequences","Clear ending","No claims of measured performance"]}}
```

```powershell
npm --silent run agent -- work-add --input task.json
npm --silent run agent -- work-list
npm --silent run agent -- work-next
```

Kinds: `analyze_performance`, `research_concept`, `story_plan`, `scene_prompt`, `opening_image`, `review_video`, `caption`, `record_lesson`. A task stores context and a result; it does not execute a model or an external action. Prioritize useful needed work. Opening-image tasks require an independently available, authorized image capability; never reuse the locked Gemini video session. Story plans/prompts remain operator-authored preparation until validated by the existing Pipeline contracts.

Claim the next task using `claim.json`:

```json
{"owner":"codex-session-a","commandId":"rain-plan-claim-1","leaseSeconds":900}
```

```powershell
npm --silent run agent -- work-next --input claim.json
# To select a particular task instead:
npm --silent run agent -- work-claim --task rain-followup-plan --input claim.json
```

Use a different command ID for a different action. A claim returns the full task/context, current revision, claim token and expiry. Save the work in `result.json`, copying the exact revision/token:

```json
{"id":"rain-followup-plan","owner":"codex-session-a","commandId":"rain-plan-save-1","claimToken":"COPY_RETURNED_TOKEN","revision":2,"status":"prepared","result":{"idea":"An original complete story","scenePrompts":["Complete opening actions and consequences","Continuous payoff and resolution"],"caption":"A proposed caption grounded in the plan","assumptions":["Creative potential is unproven"]}}
```

```powershell
npm --silent run agent -- work-save --input result.json
npm --silent run agent -- work-show --task rain-followup-plan
npm --silent run agent -- work-history --task rain-followup-plan
npm --silent run agent -- handoff
```

Use `prepared`, `done`, `blocked` or `ready` when saving. Prepared/done requires a result. Save useful partial work before leaving the session. Task IDs deduplicate creation; command IDs deduplicate claims/saves; changed input with the same ID fails. SQLite transactions exclude concurrent claimers. Task leases are 30–3600 seconds (900 default); an expired owner cannot overwrite a newer claim. Reclaim with a new command ID after inspecting current work. Task lease expiry **never** releases a Gemini reservation. Previous task revisions and generation observations remain available. Results/context are capped at 64 KiB per field; list/handoff responses omit full prompts, while `work-show` retrieves them explicitly.

`runId` optionally associates work with an existing run without blocking it. `waitForRunId` makes a task available only after confirmed cached completion—for example, actual-video review. Other tasks remain available while that generation is slow or held. A prepared story never automatically becomes another video request.

## Generation status and recovery

`status` uses a saved generation observation for five minutes. Known completion remains cached until an explicit refresh. `refresh --run` performs one bounded observation through two existing GETs (project detail and Gemini scheduler/recovery), saves it, and returns. It never polls, opens a browser, checks provider availability through UI, retries a turn, or resumes a scheduler. `advance` also uses the cached observation; refresh in a later invocation when needed, then inspect actual media before explicitly importing/preparing it. Publishing approval/queue actions remain separate.

| Condition | Meaning |
| --- | --- |
| `in_progress` | No confirmed failure/recovery requirement; recent confirmed progress |
| `slow` | At least five minutes since last confirmed progress; timing heuristic |
| `suspected_stall` | At least fifteen minutes without confirmed progress; still not proof of failure |
| `technical_failure` | Native failed state with an explicit conclusive technical cause and no unresolved submission |
| `recovery_required` | Native recovery/uncertainty, missing final artifact, or recorded unavailable/ended browser control |
| `completed` | Native completed state with a valid final artifact URL |
| `unknown` | No usable observation yet; do not infer success or failure |

Confirmed progress means new planning/clip evidence, an acknowledged new scene turn, more accepted scenes, or a final artifact. Poll timestamps, unchanged generating text, repeated recovery checks and generic `updated_at` changes do not reset the progress clock. Stale evidence is labeled. Transport failure retains the last confirmed evidence and a refresh error; it does not invent a provider failure. Older delayed observations cannot replace a newer result.

Observations retain original project/scene/run/account IDs, exact verified conversation URL, first-submission anchor, last confirmed progress, native reservation/lock indicators, timeout/failure details, recovery attempts/outcomes and next native retry time. The CLI never changes or clears Pipeline locks, accounting, queue state or recovery information. It never blindly substitutes a turn.

If browser control has ended, save `browser-ended.json`:

```json
{"state":"ended","reason":"Computer Use could not verify the current browser URL confidently enough to enforce policy."}
```

```powershell
npm --silent run agent -- recovery-note --run YOUR_RUN --input browser-ended.json
```

This is a local marker only. It records recovery-required visibility and no permission to interact with the browser. It does not bypass Computer Use policy, run recovery, modify the native project or treat an uncertain result as failed. Supported original-turn recovery remains Pipeline/owner work. `intent --run` retrieves the exact saved creation/preparation context if needed.

Before a new project submission, the CLI checks native Gemini locks, unresolved submissions, pending work and capacity/accounting. Unknown admission metadata fails closed. A shared-sidecar claim excludes simultaneous agents even when preflight reads race. Pending/uncertain submissions never release that claim just because time elapsed. A completed artifact with resolved native submission state releases only that run's local claim after explicit refresh. Existing successful `start` receipts are reused without another HTTP submission. When busy, the unsent idea stays local and appears under prepared work waiting for generation; use independent tasks instead of another project.

## Resume and practical limits

`handoff` performs zero HTTP requests and reports bounded cached active/completed/recovery generations, unsent intents, prepared work, available tasks, and recent decisions/observations. `summary`, `intent`, `work-show`, `work-history` and `knowledge` supply details only when needed. Continue using `remember` with explicit observation/assumption labels; storing a task does not verify its claims.

All queue/observation tables are additive in the existing identified agent sidecar, not SCC's owner database. No application database migration is needed. All agents sharing the default sidecar share task claims and local admission; separate sidecars cannot coordinate local claims, so Pipeline's native session locks remain authoritative.

The agent must be invoked again to perform more agent work or refresh an outcome. No external autonomous-agent trigger is configured or claimed. Existing Pipeline workers continue their authorized work without an agent connected. The native scheduler response is still a full existing HTTP payload; this adapter projects a compact result but does not change that upstream API. No token-saving percentage is asserted.

Validation and protected-project boundary: [implementation report](qa/AGENT_NONBLOCKING_IMPLEMENTATION.md).
