# Gemini multilingual policy refinement — 4 November 2026

Implemented and locally activated source `2c338b29fcd9981e09e2e0c4453d12310c07b485`. This refinement submitted no new Gemini generation, model research invocation or public post. Existing creative assets and draft copy were not translated or regenerated. The standing production grant, safeguards and existing `human_action_required` hold remain in place.

## Policy and metadata

Gemini creator research now explicitly studies relevant creators internationally, including ordinary comparators across languages. A Thai Page name does not restrict its language or audience. For Gemini, this owner direction supersedes inherited Thai-only/default language preferences; other Page rules still apply. Page A technical writing and Flow are outside this policy.

New preparation tasks carry `gemini-multilingual.v1` and require concept `languageStrategy` metadata:

- `spokenLanguage`: `none` or a language tag, including regional variants.
- `dialogue`: empty for no speech; otherwise the exact short intended speech.
- `intendedAudience` and `rationale`.
- `evidenceBasis`: `hypothesis` or `verified_research`, with supplied `findingIds`.
- `captionLanguages` and `hashtagLanguages`; hashtags may be omitted.

Dialogue-free stories retain native ambience and foley. No dialogue, narration or subtitles are forced into a visually complete concept. When brief speech helps, the selected language and exact wording reach the Gemini Pipeline planning brief with consistency instructions. Caption/hashtag metadata does not request in-video subtitles or narration.

Research may retain an optional `languageObservation` with unknown speech/audience as null. Caption language and Page names do not establish spoken language, viewer location or reach. Language choices based on absent, stale or independently unverified research remain hypotheses. A claim of verified research requires fresh independently verified supplied findings; the existing model-reported creator cache does not meet that bar. Neither English nor Thai carries an assumed performance advantage or penalty. No new creator-performance research was claimed by this implementation.

Social captions and hashtags follow the intended audience and actual reviewed video. English, Thai, other-language and multilingual copy are accepted unchanged by the existing unpublished-draft path. The actual owner QA caption remains authoritative. Concept language metadata is durable, exposed in production status and retained with QA evidence; it grants no audiovisual PASS or publication authority.

Historical concepts without language metadata remain valid. Their saved fields, idea bytes and durable identities are unchanged, and replay remains idempotent after originally valid research expires. Existing projects, prompts, results, drafts and recovery receipts were not migrated. The change adds no shared generation default, planner architecture, image handling, quota rule, recovery action or publishing permission.

## Source and validation

New `scripts/agent/gemini-language.ts` defines the scoped metadata, evidence validation, instructions and Gemini idea builder. `production.ts`, `creator-research.ts` and the explicitly tagged branches in `runner.ts` integrate it. `docs/AGENT_WORKFLOW.md` documents the contract.

- Agent TypeScript check passed.
- Eight focused SCC suites: 140 tests passed, zero failures. Coverage includes no speech, English/Thai/Japanese/Spanish/Chinese/Portuguese speech, exact wording, independent caption languages, durable metadata, missing/unsupported evidence, original replay, cache use, generation/recovery/quota/publication fences and unchanged Flow/Page A routing.
- Existing native Flow/frozen regressions: two packages, 65 top-level tests and 303 passing test/subtest events; zero failures, three skips. No live Flow generation was invoked.
- Five actual saved research/concept payloads were inspected on an isolated AgentStore copy without invoking a model: all received the multilingual policy and fit the existing 16,000-byte context limit (8,045–15,197 bytes). These context checks and synthetic language cases do not certify live multilingual speech quality; normal audiovisual QA remains required.
- Immutable release preparation completed and its 194-file manifest was independently verified through the existing release verifier. A PowerShell stderr-capture error obscured the initial console receipt; the completed preparation receipt was inspected and verified rather than repeating the build. No backend/UI promotion occurred.
- `git diff --check` passed. No push or external deployment occurred.

## Actual local activation and preservation

Before activation, a WAL-safe AgentStore backup passed integrity checking, SHA256 `4d7f570fc1c388d32c6da9595f92855844163a65d7189c104503ed45f61764a6`. The existing runner was paused and verified idle. Its old task `SCC-Agent-c585e08587a6` was removed; the same runner/state was restored with the wrapper pinned inside frozen release `2c338b29fcd9981e09e2e0c4453d12310c07b485` and task `SCC-Agent-f77423701e92`.

Runner is enabled, unpaused and authorized with the same budgets, interval, concurrency and preparation kinds. No second production scheduler exists. The unrelated isolated November 2 validation task remains untouched. The new scheduled host completed with zero model launches; no manual production tick, recovery, availability probe, CAPTCHA interaction or generation submission was used to validate this refinement. The standing grant's saved human-action hold was not cleared.

No new native job was created during the task. Account/global application accounting and standing dispatch counts are unchanged. All 50 same-task run-array captures match structurally. The initial PowerShell captures used ANSI encoding, so their false comparison against live Unicode objects was corrected and retained with that limitation. Against the retained UTF-8 baseline, all 47 historical run arrays and the full Flow enabled/scheduler/projects/credit snapshot match exactly. Flow still has 53 projects and unchanged credit totals. Companion Pipeline/UI worktrees remain clean.

Existing owner services were not restarted or replaced. Publication policies remain empty. Original media, watermark variants, captions, approvals and the incomplete original film were not modified.

Rollback retains the previous frozen source and backups: pause the same runner at idle, restore its previous wrapper/release/task through the existing controls, and retain the standing grant, protected original operations and saved hold. Do not restore an older database, reset accounting or replay a submission.

Private evidence is under `.data/agent/gemini-multilingual-20261104/`: backup, test logs, real-context checks on the isolated copy, preparation/verification receipts, runner/task configuration and before/after preservation checks. No private evidence is tracked.
