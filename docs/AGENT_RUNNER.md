# Autonomous preparation runner

The optional runner invokes command-line agents for existing independent work. It reuses the agent sidecar, `AgentWorkQueue` claims, immutable task revisions, knowledge and handoff. It does not run a server or a generation scheduler. Production is **disabled by default**. This implementation does not install an OS task, enable production execution, sign in, or invoke a real model.

Run commands from the SCC repository. Every command retains the `agent-workflow.v1` JSON envelope. Add `--state PATH` consistently to use a separate sidecar. All scheduled invocations and cooperating agents must share that same sidecar; separate databases cannot coordinate concurrency or budgets.

## Inspect and configure

```powershell
npm --silent run agent -- runner-config
npm --silent run agent -- runner-status
npm --silent run agent -- runner-detect
npm --silent run agent -- work-list
npm --silent run agent -- handoff
```

`runner-detect` probes help with a ten-second bound; it never probes billing, authentication or a model. A successful probe verifies invocation syntax, not account readiness or successful production execution. Built-in adapters resolve native executables and known npm JS launchers without invoking `.cmd`, `.ps1` or a shell. Nothing is installed automatically.

| Adapter | Non-interactive contract | Current local evidence |
| --- | --- | --- |
| Codex | `codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox read-only --json --output-schema FILE -`, compact context on stdin | Installed `codex-cli 0.155.1`; required help flags verified; real model not invoked |
| Gemini CLI | `gemini --prompt "Return only the requested agent-result.v1 JSON for the supplied task." --output-format json --extensions none`, context on stdin | Not installed on PATH; parser and invocation verified with mocks |
| Compatible JSON wrapper | Configured native executable/JS entry and argument array; stdin context, one JSON result on stdout; help must advertise `agent-result.v1` | Verified with an actual isolated Node fixture executable |

Codex also receives `approval_policy="never"`, disabled shell/apps/hooks/subagents/skill search, and disabled web search. It ignores the user config. Built-in executors work in temporary directories outside the repository so project configuration is not inherited. Gemini receives a per-process system settings override with no core tools, an MCP allowlist matching only a fresh nonexistent server name, disabled hooks/skills/IDE and ignored local dotenv. Gemini treats an empty MCP allowlist as unrestricted, so the runner deliberately uses a nonempty deny sentinel. The runner does not edit an installed CLI's settings or credentials. It passes only OS/path/home settings needed for normal CLI authentication, not SCC secrets or API-key environment variables. Existing CLI login must already work; no automated login or paid fallback is supplied.

Executor preferences are ordered, not interchangeable. A task is matched against its configured `kinds`, then the first available compatible executor is selected. Defaults allow supplied-evidence text preparation: `analyze_performance`, `research_concept`, `story_plan`, `scene_prompt`, `caption`, `record_lesson`. Independent image generation and actual audiovisual review require a separately reviewed capable wrapper and explicit kind configuration. The default text agents cannot perform those actions. Research here means reasoning from supplied sources; live web research is not enabled.

Save a config file, for example `runner-config.json`:

```json
{
  "version": "agent-runner.v1",
  "enabled": false,
  "paused": false,
  "intervalSeconds": 300,
  "cooldownSeconds": 60,
  "maxConcurrent": 1,
  "maxTasksPerRun": 1,
  "maxInvocationsPerDay": 6,
  "maxDurationSeconds": 180,
  "maxAttempts": 1,
  "maxBacklog": 200,
  "maxContextBytes": 16000,
  "maxOutputBytes": 262144,
  "dailyTokenBudget": null,
  "tokenReservation": 12000,
  "executors": [
    {"id":"codex","adapter":"codex","command":"codex"},
    {"id":"gemini","adapter":"gemini","command":"gemini"}
  ]
}
```

```powershell
npm --silent run agent -- runner-config --input runner-config.json
```

Configuration is a validated replacement with defaults for omitted fields. Preferences, capabilities and budget changes invalidate prior activation authorization. `--owner-authorized` records an actual separately granted authorization; the flag itself does not grant permission. No activation was performed for this assignment.

Only after owner authorization to activate, these are the start/check/control commands. Save each action as a JSON file containing the shown object:

| File | Content | Command |
| --- | --- | --- |
| `enable.json` | `{"action":"enable"}` | `npm --silent run agent -- runner-control --input enable.json --owner-authorized` |
| `pause.json` | `{"action":"pause"}` | `npm --silent run agent -- runner-control --input pause.json` |
| `resume.json` | `{"action":"resume"}` | `npm --silent run agent -- runner-control --input resume.json` |
| `stop.json` | `{"action":"stop"}` | `npm --silent run agent -- runner-control --input stop.json` |
| `disable.json` | `{"action":"disable"}` | `npm --silent run agent -- runner-control --input disable.json` |
| `wake.json` | `{"action":"wake"}` | `npm --silent run agent -- runner-control --input wake.json` |

```powershell
npm --silent run agent -- runner-tick
npm --silent run agent -- runner-status
```

`runner-tick` is a short-lived invocation. It honors enabled/paused state, authorization, due time, cooldown, budgets and shared concurrency. Pause/disable prevent future launches and let current work finish; stop also interrupts active children through a durable stop epoch. SIGINT/SIGTERM stop the current invocation safely. Resume never grants a new authorization or removes recovery holds.

## Automatic wake-up

Windows Task Scheduler is the sole automatic trigger. One task, identified by repository and state path, invokes `node --import <tsx loader URL> scripts/agent.ts runner-tick --state <absolute sidecar>`. It repeats at the configured interval, ignores overlapping scheduled instances, uses the signed-in current user at least privilege, and catches up after missed triggers. It requires the PC and signed-in user session; it does not install a service, request UAC/firewall changes, or restart SCC/Pipeline. Tasks per tick are sequential; independently invoked ticks share the configurable concurrency cap.

Export an inert XML preview first using `export.json` containing `{"action":"export","file":".data/agent/runner-task.xml"}`:

```powershell
npm --silent run agent -- runner-schedule --input export.json
```

Export creates a new UTF-16 XML file with `<Enabled>false</Enabled>` and does not register it. After activation is separately authorized and the runner is enabled, use `install.json` containing `{"action":"install"}`:

```powershell
npm --silent run agent -- runner-schedule --input install.json --owner-authorized
```

Use `{"action":"status"}` with `runner-schedule --input FILE` to query the OS task; use `{"action":"remove"}` with `--owner-authorized` to unregister this runner's task. Changing the interval requires reinstalling the task. `runner-status` and `handoff` show saved scheduler observations with timestamps, which can become stale; neither proves a currently running process. No OS registration or real scheduled invocation was performed during implementation.

`work-add` records a durable wake marker. `runner-control wake` can also make the next check eligible before its saved due time; neither starts an agent directly or bypasses cooldown/budgets. The next OS tick consumes the marker. Idle ticks do not probe executors, start models, fabricate tasks, or poll Gemini. Generation-dependent tasks require confirmed cached completion. An operator or authorized existing caller must run one `refresh --run ID` to bring external progress into the local cache; the runner never repeatedly refreshes or waits for generation.

## Execution and accounting

Each launch atomically rechecks configuration, attempts, budget and concurrency, claims the existing task by priority, and writes its invocation intent in one SQLite transaction. Missing executors and unsupported/oversized tasks stay queued. Expired manual claims remain for deliberate inspection. Context contains only that task's payload, at most three scoped knowledge excerpts, and a compact cached generation observation. Supply relevant analytics, source excerpts and Page creative rules in the task payload using the existing deterministic CLI reads. Missing evidence should produce `blocked`, not invented analytics or unverified creative claims.

The executor returns exactly:

```json
{"version":"agent-result.v1","status":"prepared","result":"The useful task output","lessons":["A proposed lesson, still unverified"]}
```

Allowed statuses are `prepared`, `done`, `blocked`. Only validated results are committed to the existing task; lessons are persisted as assumptions, linked to the task/run/account and invocation. No generated answer can approve, schedule, import, submit a video, change native recovery, or instruct the runner to run a command. Task payload is data, not authority. Page creative work still requires the permanent playbook; every public publication still requires its own exact owner authorization.

Limits are enforced in the shared sidecar: 1–4 concurrent sessions, 1–10 tasks/tick, 1–500 launch attempts per UTC day, 5–1800 seconds/model invocation, 1–5 total attempts/task, bounded context/output, and 1–10000 unfinished tasks. Defaults are deliberately small. All unfinished statuses, including prepared/blocked, count toward backlog; existing tasks remain readable when a lower cap is configured. Idempotent re-adds still work at the cap. Uncertain failures never automatically use remaining attempts. Safe prelaunch failures may be reconsidered on a later eligible tick within the attempt/day/cooldown limits.

Codex reports actual `turn.completed` input+output tokens (cached input is not added twice). Gemini reports actual model `tokens.total` when present. Custom JSON wrappers currently report usage as unavailable. Token accounting is only the executor-reported quantity, not a billing/currency claim. A configured `dailyTokenBudget` admits a call only when measured usage plus outstanding reservations plus its configured `tokenReservation` fit. Reservations are estimates, explicitly separate from actuals. **This is not a provider-enforced hard token ceiling:** a single bounded session can exceed its reservation/budget. Missing usage after a session holds further token-budgeted sessions for that UTC start day; the runner does not invent totals. Without a token budget, duration/invocation/concurrency/attempt limits still apply. CLI-internal provider retries, subscription entitlements and provider billing remain outside runner control; no usage-reduction percentage is claimed.

## Recovery

Every execution runs under a separate bounded supervisor, which stops its child on deadline, parent death or interrupted I/O. Windows child trees are terminated by their exact spawned PID; the runner never stops SCC, Pipeline or unrelated processes. Stderr is counted for output bounds but never saved. A surviving unknown process conservatively retains its concurrency slot until reviewed. Hard shutdown of the OS task may leave an uncertain receipt; subsequent ticks detect the expired durable deadline and hold it.

A validated result is persisted before the completion transaction. Restart can finish its exact saved claim and deterministic knowledge IDs without invoking an agent again. Expired/changed claims cannot be overwritten; they require inspection. Crashes, malformed output, timeout, nonzero exit or ambiguous persistence become recovery holds, not replay. A proven failure to spawn releases the task safely, with a zero-token receipt and a consumed attempt. A blocked answer is a failed task with saved useful explanation.

Inspect `runner-status`, `runner-show --run INVOCATION_ID` (including a validated saved result when present, without its claim token), `work-show --task ID`, `work-history --task ID`, and `handoff`. After reconciling actual external operations and confirming the process stopped, an owner can release a held invocation with `runner-recover --owner-authorized --input recovery.json`:

```json
{"id":"INVOCATION_ID","processStopped":true,"externalOperationsReconciled":true,"reason":"Exact review evidence and the decision to make this task ready again"}
```

Release preserves the original invocation/result/usage and appends a task revision. It does not reset attempts, repair unknown token accounting, unlock Gemini, or execute anything. If no attempts remain, the task stays ready for manual handling; changing limits requires reauthorization. There is no automatic retry of uncertain external operations.

For custom executors, set `adapter:"json"`, an executable path, an argument array and `isolationReviewed:true`. Supply an audited output-only wrapper and enable only the task kinds its capability actually supports. The runner cannot sandbox an arbitrary third-party program; that review is an explicit trust requirement, not inferred from model output or a prompt. No graphical automation or browser-control workaround is used.

Implementation and acceptance evidence: [runner report](qa/AGENT_RUNNER_IMPLEMENTATION.md). Existing generation protections: [non-blocking work](AGENT_NONBLOCKING_WORK.md).

Adapter references: [official OpenAI non-interactive command documentation](https://learn.chatgpt.com/docs/developer-commands#codex-exec), [Gemini headless contract](https://geminicli.com/docs/cli/headless/), [Gemini settings precedence and tool controls](https://geminicli.com/docs/reference/configuration/).
