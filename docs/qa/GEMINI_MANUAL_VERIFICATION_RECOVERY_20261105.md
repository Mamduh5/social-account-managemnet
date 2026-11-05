# Exact-turn recovery after manual Google verification — 5 November 2026

Recovered the existing watering-can video, imported its immutable SCC master and prepared a held moving-watermark Reel draft. No new generation, Retry, Regenerate, automated refresh, CAPTCHA interaction, publication or Git push was performed. Flow remains unchanged.

## Identified original and recovery

- Concept: บัวรดน้ำจิ๋วกับต้นอ่อนขี้เซา.
- Project: `d34e2262-c44c-4dfd-9014-aa3d69a82052`.
- Run: **`3062b1dc-403e-4111-a827-49f83ab7f5f3`**.
- Exact conversation: https://gemini.google.com/app/394854415ae65a91.
- Original counted request: `scc-production-e6313a6c73e13ceec34f0d14e2409f57a417d73d`.

Live state at approximately 10:01 Bangkok showed an acknowledged submission from 09:25, `provider_timeout` at result detection and an unresolved original. Its earlier bounded recovery observations had seen Gemini's generating notice. The runner was temporarily paused, its active model list was empty, and a WAL-safe AgentStore backup passed integrity checking before recovery.

The supported `production-resume --owner-authorized` action used import-only exact-run recovery. Its durable `owner_security_recovery_0` receipt succeeded and records `provider_correlated_original`; the native recovery ledger completed at approximately 10:02. Correlation used the saved original conversation/prompt, not a replacement turn or owner-attributed upload. The original run history was retained.

Recovered scene clip SHA256: `e680076671fa3c0d25f010340ee170c921e4b0118449e6e6b77c7c2966d3c3fc`.

SCC master: **`vid-fb153a83-d1ba-4755-91f9-296f8b547e7e`**, 982,448 bytes, SHA256 **`8450547dff11d2a2c459f86aaf04253e0233c91adcd6aed8e263af047f31bda7`**. This hash matches the verified completed Pipeline final artifact. The recovered scene clip and assembled final artifact are distinct containers; their hashes are recorded separately. No duplicate import was made.

## Demonstrated continuation defect and correction

The first resume command returned HTTP 409 only after exact recovery, final-artifact verification and SCC import had already succeeded. Durable operations were read back before any further action. The stale native `reconciliation_required` hold was still present, although the recovered result was durable and no submission or recovery claim remained active.

The Gemini production adapter read `scheduler.block_reason`, while the actual native response uses **`scheduler.provider_block_reason`**. Consequently its `recoveryHold` flag was false and it skipped supported stale-hold reconciliation before fresh readiness. This was reproduced with the real response shape, not inferred from the generic conflict.

Local source commit **`0af74134e6b23ae84d43dfca51f8143e5ec6cbab`** changes only `scripts/agent/pipeline.ts` and its focused production tests. The Gemini-only adapter now reads the native field, retaining the legacy alias for compatibility. Recovery/security/accounting classifications use the same selected value. Tests require native-field precedence and prove exact-turn recovery/import reconciles the hold before fresh readiness, with no additional video request.

The supported audited `reconcile_recovery` action returned HTTP 200 after independent checks of completed media and no active/uncertain submission. Fresh supported readiness then passed with `video_available`; the original was not recovered or imported again. These observations establish that the manual security interruption no longer blocked recovery/readiness. No reason for Google's original challenge was inferred.

## Media QA and draft

Pipeline recovery performed MP4 integrity, full-decode and R3 conformance checks. SCC's existing technical backlog step independently verified the immutable master hash/size, full video/audio decode, ten-second duration, 720×1280 portrait 9:16, H.264 and stereo AAC. Normalized 48 kHz PCM had no nonfinite or full-scale samples; sample peak/RMS were approximately -5.41/-38.00 dBFS. Signal measurements do not establish perceptual audio quality or absence of unwanted speech.

Twenty ordered master samples were actually inspected: the mint-green watering can tips toward a drooping sprout, water reaches the pot and the sprout straightens. The complete visual payoff reads within the scene. This is qualified sampled review, not every-frame motion certification or proof of an exact droplet count. No listening PASS was invented.

The existing Branding Studio produced variant **`brnd-mw2yy1ud-dx0w`**, SHA256 `4db889347416bc20a75ccce018fb939254615867bb3ea1b28d4f3f50cb5dbb92`. Its decoded PCM hash is identical to the master (`b71aa36e7f2e0b996d96ef4e39b9b12ec29a5d4b34673290b20557ff842a0442`). Twenty watermarked samples were inspected; the correct Page label moves without obscuring the main action. No audio change was applied.

Draft **`draft-b9dd43ab-99fa-40cc-86cb-04fdaa700d54`** is revision 1, status `draft`, approval null, queue null and unscheduled. Its only destination is โลกจริงหลุดบท, using the exact variant above. Caption: “หยดเล็ก ๆ ก็ช่วยให้สดใสขึ้นได้ 🌱” followed by “เรื่องสมมติสร้างสรรค์ด้วย AI”; no hashtags. Thai copy follows the saved multilingual concept's th/en audience hypothesis. The item remains `needs_review` with `creative_and_listening_review_required`; preparation grants no publication authority.

## Validation, activation and final state

- Focused SCC production/Pipeline/runner/schedule gate: **109 tests passed**, zero failures. Agent TypeScript check passed.
- Native Flow/frozen regressions: **two packages, 64 top-level tests, 302 passing test/subtest events, zero failures, three opt-in skips**. No native source or live Flow generation changed.
- Immutable release preparation and independent source/manifest verification passed. Existing build-size/timing notices were nonblocking. No SCC backend, Pipeline or UI service was restarted or promoted.
- A fresh integrity-checked AgentStore backup preceded activation. The paused idle task `SCC-Agent-3b8c67e16d03` was replaced through established controls by **`SCC-Agent-19497b34ee3f`**, pinned to frozen source **`0af74134e6b23ae84d43dfca51f8143e5ec6cbab`**. The unrelated isolated validation task was preserved. No second production scheduler was added.
- At **10:14 Bangkok**, the runner was enabled, unpaused and authorized, with zero active model tasks. Native global scheduling stayed disabled. The standing grant and all budgets/limits were unchanged; ordinary scoped eligible work can continue without a new routine approval. No diagnostic trigger or generation was used to test activation.
- Native security/reconciliation holds were clear, readiness was `video_available`, and no active/uncertain original remained at that observation. Publication policies remained empty.
- Backlog: **five of eight items, 22,200,416 bytes** against 512 MiB; one ready owner-accepted draft and four listening/creative-review candidates. The historical failed no-asset admission remains preserved.
- All **51 existing Gemini run arrays** matched their pre-recovery snapshots; no new job/run or counted dispatch was created by this task. Global/account application counters remained two of four, with the same native window start. Actual remaining Gemini video allowance is unknown. No reset/refund/lock clear occurred.
- Flow's entire enabled/scheduler/projects/credit snapshot matched exactly; companion Pipeline/UI worktrees remained clean. Original media and other drafts were preserved. `git diff --check` passed; unrelated QA work was not staged.

Private evidence: `.data/agent/gemini-security-recovery-20261105/` contains live snapshots, original durable operations, successful import-only recovery receipt, audited reconciliation, strict QA/contact samples, variant audio identity, draft read-back, regression logs, backups, immutable release verification, scheduler activation and `final-verification.json`. Future Google verification remains manual; uncertain originals must still be reconciled before any further submission.
