# Research and draft operations for compatible agents

Business workflows use the same SCC CLI, separate shared sidecar, exact task claims, dated research and API draft saver for every executor. Provider login, tool policy, output decoding and process supervision belong in the executor adapter. Never put provider-specific commands in reusable task payloads.

## Contracts and one task example

- [Typed result](schemas/agent-content-result.v1.schema.json): return the object directly, including content, dated research, interpretations, creative decision and a compact handoff. `hashtags` is a string; use `""` for none. Do not double-encode JSON or line breaks. The object contains no destination override, approval, schedule or tool command.
- [Dated findings](schemas/agent-research-finding.v1.schema.json): public HTTPS URLs, source titles, retrieval dates, uncertainty and at most seven-day freshness. The bounded experiment requests 24 hours. Rechecking unchanged evidence does not silently renew it. Source statements remain agent-attributed; tool traces are separate evidence.
- [Compact receipt](schemas/agent-content-receipt.v1.schema.json): resource ID, claim release, result, source provenance, measured usage and invocation state. A reconciled draft is distinct from the original OS host's terminal result.
- [Self-contained task request](examples/agent-research-task.json): supply the actual Page ID and shared `--state`. The example chooses no predetermined topic or sources.

## Efficient flow

Configure an executor and authorize it separately under [runner controls](AGENT_RUNNER.md). `liveResearch` defaults to false. A live-research task requires an executor whose capability check reports authenticated hosted research, structured output and unattended execution; help/login checks establish prerequisites, not successful browsing.

```powershell
node --import tsx scripts/agent.ts content-run-prepare --account PAGE_ID --input docs/examples/agent-research-task.json --state SHARED_SIDECAR
```

This combines capability checking, cached compact account/voice/analytics context and idempotent task creation. It reuses sufficiently fresh account-scoped findings; the research brief decides relevance, and an explicitly independent-research task still verifies live. It does not invoke a model. Repeating the exact ID/input returns the saved task without repeating HTTP or help probes. Capability probes are cached for one hour against executor configuration, resolved binary/launcher modification time and path. Actual execution still fails closed if login or tools become unavailable.

Use one explicit dated, windowless Windows trigger through the existing export/install commands. Never install recurring automation for a one-time experiment. On result, the deterministic adapter validates the typed fields and dates, preserves research/handoff, checks the Page fingerprint again, journals draft intent and saves through SCC. Lost write responses stay pending/uncertain and must be reconciled against the original ID; no model or POST replay.

```powershell
node --import tsx scripts/agent.ts content-run-receipt --task TASK_ID --state SHARED_SIDECAR
node --import tsx scripts/agent.ts content-validate --input result.json
node --import tsx scripts/agent.ts content-schema
```

The receipt is local and compact; it performs zero HTTP. `content-validate` reports exact field paths before any write. Schema-constrained results remove the older nested-JSON formatting failure. For a validated original process that exited zero but was held by a local parser defect, `runner-result-reconcile --run INVOCATION_ID --state SHARED_SIDECAR --owner-authorized` re-parses only its exact saved trace. It refuses an active process, changed task, foreign log path or existing content-write intent. It never runs a model and cannot be repeated after completion. An uncertain write uses existing `content-reconcile`, not this operation.

A compatible external agent can read `work-show`, claim the task with `work-claim`, prepare the documented typed object, validate it, and save it as `work-save.result` under the exact owner/token/revision protocol. Then `content-persist` uses the shared deterministic saver. Read `knowledge` and the compact receipt in another process for handoff. Generated interpretations remain assumptions; missing analytics are unavailable rather than zero.

## Capability boundaries

| Environment | Research | Structured output | Local file/tool policy | Unattended execution |
| --- | --- | --- | --- | --- |
| Installed Codex 0.155.1 | Explicit opt-in hosted live search; actual events audited | Typed JSON Schema | Temporary workspace; shell/apps/hooks/subagents/skill search disabled; read-only sandbox | Existing bounded scheduled host |
| Existing Gemini CLI adapter | Supplied-evidence preparation; live research not enabled | Legacy JSON envelope | Tools/extensions/MCP/hooks disabled | Requires installed authenticated CLI; not verified here |
| Installed Antigravity CLI 1.3.2 (`agy.exe`) | Capability and authenticated research still require verification | Local help exposes `--json-schema`, JSON and streaming JSON | Local help exposes `--sandbox` and permission controls; effective isolation not reviewed | Local help and [Google's headless documentation](https://antigravity.google/docs/cli/headless/) expose `--print` and `--print-timeout`; authentication/model execution not tested |

Antigravity is installed at `C:/Users/mamdu/AppData/Local/agy/bin/agy.exe`; the graphical app alone would not prove this CLI exists. No adapter, login, model call or settings change was made for Antigravity. Its headless envelope differs from both Codex and Gemini CLI. Future integration must verify its actual auth, browsing, timeout/exit behavior and isolation before an adapter is enabled. Google documents that a headless timeout may return partial output successfully, so exit zero alone must never establish a complete valid result. No bypass-permissions flag is recommended.

## Live evidence, 3 November 2026

The bounded Codex run independently chose a Chrome site-data topic and recorded one search and one URL visit. Its initial host exited 1 because Codex represented that visit as `web_search` / `other` plus a URL. The parser now handles that native form, with an isolated regression. Its exact stopped output was reconciled and one real SCC draft saved without another model call. The second cited page was checked by the supervising agent; its independent open is not proven by the available trace. Retrieval timestamps set to midnight by the model are explicitly approximate dates, not measured per-call times.

This demonstrates independent topic discovery and live research, typed content generation and deterministic recovery/save. A completely clean scheduled end-to-end exit after the parser correction remains a live acceptance gate; no second model run was authorized for this assignment. Total reported tokens increased with live research; fewer calls or cached-token savings must not be reported as a reduction in total reported tokens.
