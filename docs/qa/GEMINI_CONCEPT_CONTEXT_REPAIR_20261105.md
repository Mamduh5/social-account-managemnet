# Gemini concept input admission repair — 5 November 2026

The failure was SCC's local UTF-8 input-size admission guard, not an observed model context-capacity, output-limit or execution-budget failure. Gemini-only source `795fb88a8935422caaabd7b7daaf7af4f24c020a` is locally active through the existing AgentRunner. The owner application remains on `fc5acf1`; no backend, Pipeline or UI restart was needed.

## Exact cause and affected original

Original task: `gemini-concept-standing-0da61654d61c28f45a599331063668dc-4-creators-v1`, `prepare_video`, initially ready at revision 1 with no runner invocation. The saved task was not recreated or rewritten. Old scheduled-host receipts repeatedly returned `context_limit`, launched zero, with no executor capability probe. The day's one earlier invocation belonged to a different, completed concept.

`AgentRunner.context` serialized 16,280 UTF-8 bytes against the configured 16,000-byte input limit. Its sections were task 10,699 bytes, generic knowledge 1,437, instructions 4,062 and null generation 4, plus JSON structure. The task payload included six previous title/idea records (2,777 bytes), creator learning (4,155), Page identity/rules/voice (2,866), brief (452), production/multilingual tags (139) and empty research (2).

Three latest generic QA observations duplicated the task's cached `creatorLearning.localFeedback`: watering-can sampled visual/audio-identity observations and technical-review limitations. One generic observation extended an already cached excerpt; it was not an additional authority or listening acceptance. This duplicate section contributed 1,435 avoidable bytes. No excessive model output or consumed model attempt caused this admission failure. Output cap 262,144 bytes, duration 300 seconds, one attempt and twelve invocations per UTC day were unchanged.

## Scoped correction

`scripts/agent/gemini-concept-context.ts` creates a model-input view only for tasks explicitly tagged `gemini-concept.v1`. The first selection removes duplicated generic QA notes. For this exact original, the selected input is **14,845 bytes**, preserving the entire task payload and full instructions byte-for-byte. Its original payload SHA256 is `5b4034a8c588603a750742320f9531340bbe0ae062c5241ce340e015b6ff9f8b`.

If future histories remain too large, optional sections are bounded structurally: recent titles and idea excerpts, short local feedback, and compact cached research principles. Finding IDs, source links, dates, verification flags, limitations and uncertainty remain available; omitted evidence is explicitly unavailable. Page identity/rules/voice, task requirements, multilingual and originality instructions are retained. Irreducible mandatory context fails closed before an invocation. Saved tasks, research reports and durable knowledge are never shortened or migrated.

`runner.ts` records a deduplicated `context-admission:<taskId>` diagnostic with original/selected bytes, source hash, limit and selection profile. An unchanged rejected input does not append another observation each tick. Existing candidate selection can continue to independent work after a context rejection, and the production/backlog callback still runs before text-model admission. No task retry, wider cap, new scheduler, quota rule, recovery or publication behavior was added. Flow and Page A continue through their original context path.

## Verification and activation

- Six focused isolated SCC suites: **140 tests passed, zero failures**. Five new tests cover duplicate QA, 300 durable observations with multilingual history, mandatory overflow across repeated ticks, independent work/backlog progress, restart recovery and concurrent original-task claims. They assert no model/probe/budget charge for rejected context, one invocation on resume and preservation of the saved payload.
- Agent TypeScript check and `git diff --check` passed.
- Existing native Flow/frozen regressions: **two packages, 64 top-level tests, 302 passing test/subtest events, zero failures, three opt-in skips**. Native source and runtime were untouched.
- The existing client build and immutable packager prepared the release; independent verification matched all **199** packaged files to committed source and build provenance. The build was not promoted to the owner application. Initial PowerShell stderr handling interrupted preparation after a completed client build; that same fingerprinted build was reused through the supported packager rather than rebuilt blindly.
- At the idle switch, a WAL-safe AgentStore backup passed `integrity_check`, SHA256 `6e399f277dcda19d9bb305660ad08f5a3c56543217f6023ef2bb827ff41e76a9`. The runner was paused briefly, its old task removed, and the same original sidecar/configuration resumed with only the frozen executor source changed. There was no database restoration.
- Production task is **`SCC-Agent-d46fa3603a08`**, pinned to `795fb88a8935422caaabd7b7daaf7af4f24c020a`. The unrelated isolated validation task is preserved. Five-minute interval, concurrency, budgets, grant, quota/account admission and backlog limits are unchanged.

## Live scheduled-host result

The actual Windows scheduled host admitted the original task at **12:05:32 Bangkok** and completed at **12:06:24**, OS exit 0, `executed`, one model launch. Its diagnostic confirms **16,280 → 14,845 bytes**, three duplicates removed and the original payload preserved. Invocation: `9905f358-fb1f-4d84-8ca8-629145c6817b`; reported usage: 16,578 tokens. The model output is durably saved against the same original task, not a replacement. Day usage is two of twelve invocations including the unrelated earlier call; no budget was reset.

The new concept is **ที่รองแก้วสานจอมไว**: a small woven coaster notices a condensation drop, slides under the glass and catches it, then wiggles proudly. It specifies one ten-second portrait scene, native foley, no dialogue and no text. Language metadata chooses visual/no-speech storytelling, Thai social copy and a Thai/international audience as a hypothesis. Its subject/action differ from the saved six prior concepts. This is concept validation, not audiovisual acceptance of a generated clip.

The result initially mistyped the long supplied research hash in `researchUse.findingIds` and `languageStrategy.findingIds`. The existing evidence validator correctly rejected that ID. After checking the sole supplied finding and its exact `simple-readable-motion` principle, Codex corrected **only those two metadata references** through supported claim/save commands, retaining both work revisions and the original executor result. Revision 3 is the original result; revision 5 is the reviewed correction. Append-only knowledge and `reference-review-receipt.json` record both result hashes, exact IDs and review provenance. Creative text, language choice, hypothesis classification and input payload are unchanged. No fuzzy reference resolver or weaker source validation was introduced; no additional model call was used.

The corrected saved original passes the existing full concept/language/source admission on a WAL-safe isolated AgentStore copy. Repeated `enqueuePrepared` admission returns the same item identity with **zero HTTP calls**. That verification does not enqueue or generate against the owner state. The runner was briefly paused during the editorial revision and resumed afterward; subsequent eligible standing work remains controlled by its existing schedule and grant. No replacement task or diagnostic video request was created.

## Preservation and operations

Independent post-activation checks rehashed all five original masters and moving-watermark variants and verified their unchanged drafts/review states: one ready and four requiring genuine owner review. Standing policy and owner QA records match the backup; Page publication policies remain empty. Full Flow state and all 51 existing Gemini run arrays match the pre-task snapshot. Native application ledgers remain two of four globally and on `gemini_web-main`; numerical provider allowance remains unknown. No active or unresolved provider original was recorded during these checks.

SCC backend/proxy remain PIDs 18408/15808 on `fc5acf1`, Pipeline PID 3088 on `d87948a`, UI PID 19376 on `44f15f9`. Normal sync and Startup remain enabled. The agent is enabled, unpaused and authorized on its single five-minute production task, with no active model invocation or uncertain native submission at final inspection. Backlog is still five of eight, 22,200,416 bytes. Genuine review holds on four existing videos remain. No publication, new Page policy, security interaction, accounting reset, diagnostic video, Git push or external deployment occurred.

Rollback retains the prior frozen release and verified backups: pause the same runner while idle, preserve protected originals, restore the prior frozen wrapper/task using the established controls and resume the original sidecar. Never restore an older database over newer receipts or replay an uncertain operation.

Private evidence: `.data/agent/concept-context-20261105/` contains the exact original input, size analysis, selection receipt, focused/native tests, release/backup receipts, scheduled-host and concept result snapshots and preservation checks. Unrelated QA files were not staged.
