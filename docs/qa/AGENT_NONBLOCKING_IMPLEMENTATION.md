# Non-blocking agent work — 2 November 2026

Implemented in the existing SCC CLI and identified agent SQLite sidecar. [Commands and JSON examples](../AGENT_NONBLOCKING_WORK.md).

The earlier session waited because the agent kept observing Gemini and waiting for an output. Pipeline already runs independently: `AutopilotWorker.Run` starts its existing planning/observation loops and scheduler; queue creation returns HTTP 202 with a durable project ID. No second generation system, worker, browser automation or background LLM is needed or added.

Changes:

- `scripts/agent/workflow.ts`: submission returns immediately with `agentShouldWait:false` / `next:work-next`; existing exact receipts still prevent replay. Before a new submission, read native Gemini locks/recovery/capacity and acquire an atomic shared-sidecar admission claim. Busy ideas remain unsent and durable. Existing successful receipts require no new HTTP call.
- `scripts/agent/work-queue.ts` and additive sidecar tables: independent tasks, priorities, original contexts, prepared prompts/results, exclusive owner/token/revision claims, bounded leases, immutable revisions and idempotent command receipts. No task is automatically executed or submitted to a provider.
- `scripts/agent/generation-status.ts` plus the read-only Pipeline adapter: five-minute cached generation observations, one-shot explicit refresh, elapsed-time slow/stall heuristics, conclusive-failure distinction and recovery visibility. Original project/scene/run/account/conversation, first turn, progress, native lock indicators and recovery details survive restart. Unchanged generating messages and repeated check timestamps do not count as progress. Old delayed responses cannot overwrite a newer observation.
- CLI: `handoff`, `refresh`, `intent`, `recovery-note`, `work-add`, `work-list`, `work-next`, `work-claim`, `work-save`, `work-show`, `work-history`. Existing import/preparation/approval/queue commands retain their separate explicit actions.

Useful continuation: submit once; claim independent analysis, research, story-plan, scene-prompt, caption, review or lesson work; save a prepared result before leaving; later run `handoff` and one explicit `refresh`. Conditional video-review tasks become available after cached native completion. Opening-image tasks require an independent supported image capability and explicit authorization; no image API or generation is added here. Task payloads/results are data, not authority to submit, publish, unlock reservations or bypass browser policy.

Recovery policy:

- Normal, slow and suspected-stall states remain distinct from confirmed failure. Five/fifteen-minute thresholds are heuristics, not claims about Gemini success or failure.
- A timeout/uncertain original turn remains held for reconciliation. No replacement/retry/global resume/unlock endpoint is called by this feature.
- Ended/unavailable browser control can be marked locally and surfaced to another agent. The CLI never attempts browser interaction or circumvents Computer Use restrictions.
- Native worker/session/accounting locks remain authoritative. Local task-lease expiry cannot release them. Local generation admission is released only after explicit observed completion with a final artifact and resolved native submission state.
- Eventual completion retains the same ID and enables explicit inspect/import/prepare; it does not automatically publish, schedule or start another generation.

Validation:

| Gate | Result |
| --- | --- |
| New non-blocking isolated fixture suite | 19/19 passed |
| Full isolated regression suite (`npm test`) | **583/583 tests; 65/65 suites; zero failures/skips** |
| Agent and backend TypeScript | Passed |
| Client build | Passed; existing >500 kB bundle warning |
| CLI work/claim/save/restart/handoff smoke | Passed against temporary sidecar and unreachable loopback application URLs |
| Git whitespace | Passed |

Fixtures prove early submission return, useful independent planning while generation remains pending, cached reads with no repeated HTTP, durable slow/recovery observations, exact conversation/account preservation, task-claim concurrency and expiry, native and local provider-lock exclusion, restart handoff, eventual completion of the original project, no duplicate generation after response loss, capacity fail-closed behavior, browser-control-ended handling and out-of-order observation safety. The fixture transport rejects every endpoint outside the pinned fake Pipeline and rejects Flow/protected-project paths. Existing SCC integration tests still exercise actual isolated import/branding/draft/queue services with simulated provider results.

Protected live boundary: project `330aaf23-17d6-4982-96c6-93ef3792673c` and conversation `https://gemini.google.com/app/9cf695a4c3db1cca` were not fetched, resubmitted, replaced, abandoned, edited or recovered during this implementation. Only the prior local snapshot was read for context; its last stored state was recovery-required, not a fresh live status assertion. No real generation, production-sidecar update, production account/credential change, queue reset, provider/browser action, social publication/schedule, service restart, commit, push or deployment was performed.

Git scope: 13 uncommitted SCC files covering agent source, isolated fixtures and documentation only. Pipeline's pre-existing Gemini-only startup edits (`Readme.md`, `cmd/api/main.go`, `scripts/start-video-studio.ps1`, `internal/http/gemini_runtime{,_test}.go`) were left unchanged. No Pipeline worker or AI Video UI code change was needed for this request.

Limits: agent work is durable but requires an agent to be invoked to perform it. This integration configures no external autonomous-agent trigger and no polling monitor. `handoff` is local cached evidence; refresh explicitly when needed. Existing upstream scheduler responses remain full HTTP payloads, though CLI projections are compact. Agents using different sidecar files do not share local claims; native Pipeline locks still protect the browser. No token-saving percentage or live-provider acceptance is claimed. Private test logs are under `.data/nonblocking-validation/` and remain ignored.
