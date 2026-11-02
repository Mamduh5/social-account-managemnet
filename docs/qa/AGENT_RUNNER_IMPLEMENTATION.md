# Autonomous agent runner implementation — 2 November 2026

The runner adds bounded unattended preparation to the existing API-first agent CLI. Production activation was explicitly excluded: no production config was enabled, no real OS task was registered, no real model session was invoked, and no owner application or Pipeline process was restarted. [Operational commands and configuration](../AGENT_RUNNER.md) cover activation as a separate future owner decision.

## Implementation and contracts

| Area | Source | Result |
| --- | --- | --- |
| Entry/control | `scripts/agent.ts`, `scripts/agent/runner-config.ts` | `runner-config`, `runner-status`, `runner-show`, `runner-detect`, `runner-tick`, `runner-control`, `runner-recover`, `runner-schedule`; validated disabled defaults; authorization bound to exact execution settings |
| Selection/execution | `scripts/agent/runner.ts` | Existing task priorities, eligibility, exact claims/revisions, compact saved context, capability fallback, validated results and assumption lessons |
| Persistence | `scripts/agent/store.ts` | Two additive execution/config tables in the identified agent sidecar; existing task/receipt/knowledge tables retained; atomic admission/claim/budget transactions |
| Existing queue | `scripts/agent/work-queue.ts` | Backlog admission limit, durable wake on useful work, and active/uncertain runner fences across ordinary claim commands |
| Handoff | `scripts/agent/workflow.ts` | Runner configuration and timestamped schedule observation visible alongside existing cached generation/recovery and prepared work; no HTTP added |
| Executors | `scripts/agent/executors.ts`, `scripts/agent/executor-host.ts` | Shell-free native/known npm launchers; distinct Codex JSONL, Gemini JSON and compatible wrapper adapters; bounded child supervisor and parent-death handling; UTF-8 safe output |
| Automatic trigger | `scripts/agent/runner-schedule.ts` | One deterministic per-user Windows Task Scheduler task; preview export disabled; install/remove separately owner-gated; no persistent service |
| Coverage | `test/agent_runner.test.ts` | Isolated stores, mock adapters, actual Node fixture executables, distinct CLI sessions, mocked OS registration and a crashing-parent fixture |

Codex `0.155.1` was found locally and its actual `exec --help` flags and safety feature names inspected without launching a model. `runner-detect` also verified it through the npm JS entry point from the isolated verification sidecar. Gemini CLI and Claude were absent from PATH. Gemini is implemented from its distinct official headless contract and tested with mocks; it is not claimed as locally authenticated or live-accepted. Other agents require an audited `agent-result.v1` JSON wrapper and explicit output-only isolation review. No installation, login, key change or paid fallback was attempted.

## Task lifecycle and recovery

Only existing eligible useful tasks are selected. The runner never creates filler ideas. Default adapters prepare supplied-evidence text; image generation and actual video/audio inspection require separately configured capable wrappers. Missing evidence/capability leaves work queued or returns a saved blocked answer. Page creative rules must be supplied for account creative work. Results remain preparation; no generation, import, approval, schedule or publication command is delegated to the model.

Admission checks settings, authorization, interval/wake marker, cooldown, total attempts, daily invocations, concurrency and optional token threshold. A shared SQLite transaction rechecks and records the original work claim plus invocation intent. Another invocation cannot claim the same task or spend the same remaining budget. Each process receives only the selected payload, at most three scoped knowledge excerpts and compact cached generation metadata. Full histories and logs are excluded.

Validated output is durably saved before the exact result/knowledge transaction. On restart, that saved result can finish its original unchanged claim without a new model invocation. Known prelaunch failure safely releases a task with zero measured tokens and a consumed attempt. Nonzero exit, interruption, timeout, invalid output, expired invocation or uncertain persistence becomes a hold. A stale/changed claim cannot overwrite its successor. An unknown surviving process retains its concurrency slot until owner reconciliation; age alone never frees it. Ordinary work claim commands also respect these holds. `runner-show` exposes saved receipts/results without claim tokens.

The separate supervisor has its own duration timer and parent-liveness check. Deadline/stop shuts down only the spawned child tree; failed OS termination returns an explicit unknown and a retained slot. No SCC/Pipeline/browser process is targeted. SIGINT/SIGTERM and durable `stop` interrupt current execution and leave reviewable state; pause/disable prevent future launches. Manual release requires explicit owner authorization, process-stopped and external-operation-reconciled attestations plus a reason; it does not erase attempts or repair unknown accounting.

## Scheduling, resource bounds and limits

Windows Task Scheduler invokes the existing CLI at the configured interval as the signed-in current user. It ignores overlapping OS instances; shared sidecar admission also protects independently invoked ticks. `work-add`, newly recorded confirmed generation completion, and `runner-control wake` set a durable local wake marker for the next tick. Idle ticks launch neither models nor executor probes. Generation refresh remains an explicit deterministic caller operation; no Gemini polling was added.

Defaults: disabled, one concurrent session, one task/tick, six launch attempts/UTC day, 180 seconds/session, one total attempt/task, 60-second cooldown, five-minute checks, 200 unfinished tasks, 16,000-byte context and 262,144-byte process output. Configuration supports up to four simultaneous agents and ten sequential tasks/tick. Attempt and budget receipts survive process/application restarts. Backlog checks exclude completed `done` tasks while preserving old records and idempotent adds.

Codex input+output tokens and Gemini model totals are saved as actual executor-reported usage when available. Reservations and unavailable usage remain explicitly separate. Optional token budgeting is an **admission threshold, not a provider hard cap**; an individual bounded session can exceed its reservation. Unknown post-session usage holds further token-budgeted sessions for its UTC start day. Custom wrappers currently have unavailable usage. CLI internal retries, model/account billing and provider entitlements remain outside the runner's accounting guarantees.

Unattended production remains pending separate owner configuration/authorization, existing executor authentication and actual OS-task acceptance. Windows scheduling requires the machine and signed-in user session. No actual scheduled model execution or live Gemini CLI acceptance was performed. The supported built-in agents are restricted to preparation from supplied context; live browsing, file editing, image creation and native audiovisual review are not enabled by default. The protected Gemini project `330aaf23-17d6-4982-96c6-93ef3792673c`, its original turn and uncertain submission state were not queried or mutated by this implementation. Flow source and runtime were untouched.

## Verification

The complete regression run passed **620/620 tests across 66/66 suites**, including 37 runner tests. Subsequent primary-source review corrected Gemini's empty MCP allowlist semantics: the final nonempty deny sentinel passed all 37 runner tests again and the agent type check. The verification-only sidecar is `.data/runner-verification-20261102-180739/agent.db`; its CLI check returned `state:disabled, launched:0`. No default production agent sidecar was opened for writes.

| Gate | Result |
| --- | --- |
| `npm test` | PASS: 620/620 tests; 66/66 suites; no failures/skips |
| Final focused runner suite | PASS: 37/37 after Gemini MCP deny-sentinel correction |
| `npm run typecheck:agent` | PASS on final source |
| `npx tsc --noEmit` | PASS |
| `npm run build:client` | PASS; existing Vite warning about a bundle above 500 kB |
| `git diff --check` | PASS |
| Actual installed capability probe | Codex available; Gemini not installed; authentication/model usage not probed |
| Scheduler export/install/remove | Disabled XML export and mocked registration/removal passed; no real OS task installed |
| Multi-session continuation | Actual separate CLI fixture sessions completed useful tasks once each; repeated tick did not duplicate execution |

Local ignored evidence: `.data/runner-verification-20261102-180739/tests-release.log` and `.data/runner-targeted-final.log`. Tests use their own temporary sidecars; full-suite SCC data uses the established isolated `SCC_DATA_DIR`/paused-workers harness. No real social account or live provider operation is used.

The Gemini correction follows the provider's actual [MCP allowlist implementation](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/mcp-client-manager.ts): an empty allowlist is unrestricted, so a fresh nonexistent server name is required to exclude configured servers. This was verified in source and fixture settings, not by connecting to an installed Gemini account.

## Git scope

The workspace was clean at the start of this assignment. All changes below are left uncommitted; no staging, commit, push or deployment was performed.

Modified: `README.md`, `docs/AGENT_WORKFLOW.md`, `docs/AGENT_NONBLOCKING_WORK.md`, `scripts/agent.ts`, `scripts/agent/store.ts`, `scripts/agent/work-queue.ts`, `scripts/agent/workflow.ts`.

New: `docs/AGENT_RUNNER.md`, this report, `scripts/agent/runner-config.ts`, `scripts/agent/runner.ts`, `scripts/agent/executors.ts`, `scripts/agent/executor-host.ts`, `scripts/agent/runner-schedule.ts`, `test/agent_runner.test.ts`.

Runtime verification files remain ignored under `.data`; no application database schema, production data, credentials, frontend source, upstream generation code, protected schedule or public content was changed.
