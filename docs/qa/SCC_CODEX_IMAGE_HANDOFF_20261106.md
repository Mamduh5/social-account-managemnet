# Unattended Codex image handoff — completed 5 November, finalized 6 November 2026

**PASS for the authorized one-time scope.** The automatic Windows trigger generated one PNG, verified it, uploaded it to SCC, verified the downloaded bytes and saved completion receipts. No manual import, reconciliation or second generation was needed. Recurring image generation remains disabled. No draft or public post was created.

## Cause and correction

The previous test's successful `codex exec --json` turn returned a saved PNG path but no native image-tool completion item. The importer required that item and therefore stopped before upload. The previous test and its blocked result remain preserved; they are not relabeled successful.

The test-only `scripts/agent/codex-image-once.cjs` now prefers verified native completion items. When none exists, it permits a strict final JSON object containing only `file`, bound to the original saved generation intent, successful process receipt and single completed thread/turn. It records `evidenceMode=verified_final_result_path` and `nativeImageEventObserved=false` truthfully.

The fallback requires the expected `$CODEX_HOME/generated_images/<thread>/exec-*.png` location, a matching thread and intent hash, fresh creation/modification times inside the original execution interval, and exactly one PNG candidate. Unrelated or missing files, traversal, symlinks/junctions, duplicate candidates, failed processes, changed intent and unexpected tool evidence fail closed. Signature, upload size, dimensions, SHA256 and FFmpeg full decode are checked before upload. Original bytes remain unchanged.

Upload uses the existing SCC `/api/publishing/images` service. A write-once intent saves a deterministic operation ID, exact filename/hash and pre-upload image inventory before POST. Existing intents can only read back the saved response or find the unique original by exact operation filename and metadata. No unique match means a hold, never another POST. The verified asset gets an immutable completion receipt. Concurrent claims admit at most one POST. `--import-only` cannot submit a new Codex generation.

The initial test's arbitrary 80%-used Codex guard was replaced by actual provider admission: current usage below 100%, no explicit restriction, available ordinary usage when exposed, subscription authentication, native image capability and no purchased/unlimited credit fallback. This changes only the disposable Codex test, not Gemini application limits or accounting. API keys and provider URL overrides are excluded from the subprocess environment. The scheduled run also checks for conflicting Codex exec processes and holds an exclusive test-generation lock.

## Original-artifact verification without generation

The exact previous JSON stream, intent/process receipt and existing lantern PNG were replayed on isolated state. The expected SHA remained `97030fa62290c152f2318a94a9b08f2fe6c85b5b498fb1ba37534f5bf2ba70b5`.

Both the focused fixture and the actual existing SCC image HTTP route on disposable storage passed. The route replay stored one image, performed one upload, verified identical read-back bytes and reused the same asset on a repeated import check. It created zero drafts and made **zero generation invocations**. Lost-response, interrupted-read-back, ambiguity, corruption and duplicate-claim regressions are separate fixture evidence, not claims of live interruptions.

## Actual one-time scheduled run

All times below are **5 November 2026, Asia/Bangkok**.

| Event | Time/result |
| --- | --- |
| Registration | 19:36:22.713 |
| Requested one-time trigger | **19:41:22**, five minutes ahead |
| Automatic scheduled-host start | **19:41:23.566** |
| Original Codex process | 19:41:27.900–19:42:09.708, exit 0 |
| Automatic verified import | **19:42:11.596** |
| Host completion | 19:42:12.157, exit 0 |
| Disable/remove disposable task | **19:43:02.205** |

- Task: `SCC-Agent-e19293004fba`; schedule `19a0256b-2996-49e6-b8ea-ac88f41cea7f`.
- Isolated AgentStore: `.data/agent/codex-image-final-20261105/agent.db`.
- Original work: `codex-image-final-20261105-v1`, durably `prepared`.
- Single completed runner session: `a0da4d95-a388-4e68-8e7d-89b1ef908f25`.
- Codex thread: `01a1abba-7e10-70a1-ab86-d629ae1c80e5`, one started/completed turn and one output PNG. Native image-tool count was not exposed; no native completion event is claimed.
- Import operation: `codex-image-import-81104353b00f297acddc89fb8e6f73680fcc7278b55995a935be9e28126e8102`.

The existing hidden launcher and `scheduled-host.ts` called the existing `scripts/agent.ts runner-tick --state <isolated AgentStore> --schedule <schedule ID>`. That runner invoked the test-only JSON executor, which used the installed official Codex CLI's built-in image-generation capability. Exact Node executable, argument array, prompt and hashes are retained in `generation-intent.json`. No new provider, production scheduler or API integration was introduced. The trigger had no repetition and no late catch-up. It was never manually launched.

## Artifact, import and usage evidence

- Local PNG: `.data/agent/codex-image-final-20261105/scheduled-candidate.png`.
- Original: `C:/Users/mamdu/.codex/generated_images/01a1abba-7e10-70a1-ab86-d629ae1c80e5/exec-cb14da51-97f7-4ac0-842e-e7ed8a2e8c3b.png`.
- **1199 × 1312 PNG; 2,177,374 bytes; full decode passed.**
- SHA256: **`e00347adaff55512fe83a6393b9a1e7799e5db0044c7d6d9197a5770e8313fb7`**.
- SCC asset: **`img-ee9b9cf2-8e9a-4aa1-a8ce-c78e9f93fe66`**.
- SCC downloaded bytes matched the local original exactly. No draft, approval, schedule or publication was created.

Actual visual inspection showed the requested small clay wind-up bird beside a fern in a readable sunlit scene. It remains a disposable review candidate, not owner creative acceptance.

Runtime admission recorded `authType=chatgpt`, plan `team`, primary usage **96%**, weekly usage **30%**, native `imageGeneration=true`, no explicit rate-limit restriction, `credits.hasCredits=false` and `credits.unlimited=false`. No API key, paid image API, purchased credit, billing activation or quota reset was used. No conflicting Codex exec process was active. These are timestamped admission observations, not current remaining usage guarantees.

The completed turn reported **48,488 input tokens**, **21,632 cached input tokens** and **244 output tokens**. Exact image-only cost/usage was not exposed. Standard SCC session usage remains null because this generic JSON executor does not map those counters; the original Codex usage is retained in its result/trace, rather than represented as zero usage.

## Validation, preservation and finalization

- Final isolated gate on 6 November: **48 tests passed, zero failures/skips**, across image handoff, existing one-time scheduling and Page-content suites. Agent TypeScript check passed. No model or provider invocation occurred during these tests.
- The actual original-artifact HTTP replay described above used the existing service with disposable storage and no generation.
- Source scope is only `scripts/agent/codex-image-once.cjs`, `test/agent_codex_image_once.test.ts` and this report. No shared production source was changed or deployed.
- Same-task preservation at 19:43 on 5 November verified identical Flow state, policies, production controls, text drafts and original The Rules concept/history/assets. Gemini native state was identical except its server timestamp: protected original, history, application accounting and scheduling were preserved. No active video workflow was operated on.
- Existing production task `SCC-Agent-e4f4629dae62` was left unchanged. The test runner is disabled, with zero active sessions; its consumed once-only receipt and all history remain saved. The disposable OS task is removed.

After successful automatic completion and cleanup, the final duplicate-claim test/commit step was interrupted by an automatic approval-review availability error. This was not a failed image generation or import. On the owner's 6 November resume, final tests/typecheck completed, the task was independently confirmed absent, and at **09:17:37 Bangkok** a fresh read-only SCC download again matched the exact PNG. The saved AgentStore still contained one completed session, `prepared` work, disabled runner and host exit 0. No generation or import was repeated on resumption.

No manual step remains for this one-time technical acceptance. This does not activate recurring image production, approve the image or authorize publication. No service restart, external deployment, Git push, quota/account reset or new Page policy occurred. Unrelated working changes and prior reports were preserved.

Private evidence: `.data/agent/codex-image-final-20261105/`, including isolated-route replay, test/typecheck logs, integrity-checked pre-test AgentStore backup, registration/XML, runtime subscription/concurrency admission, exact prompt/intent, Codex events/process receipt, artifact handoff, upload intent/response/completion, original PNG, completed scheduled-host/session receipts, cleanup, preservation and resumed-verification receipts. Private evidence/media are ignored and not staged.
