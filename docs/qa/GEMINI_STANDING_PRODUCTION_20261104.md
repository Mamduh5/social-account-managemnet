# Standing Gemini authorization and accepted sponge Reel draft — 4 November 2026

The owner accepted the sponge video's audio. Its original master is unchanged, its moving-watermark variant passed sampled visual checks and exact decoded-audio comparison, and its Thai Reel draft remains unapproved/unpublished. Enduring production authorization is implemented and installed on the existing AgentRunner. A genuine browser/security interruption on its first new turn is currently awaiting owner handling; routine quota-window approval is no longer required.

## Authorization clocks and actual limits

The active production policy is gemini-standing-20261104-v1, version gemini-production-policy.v1, restricted to gemini_web-main and โลกจริงหลุดบท (SCC acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978, verified Graph Page 1428270437036294).

- Authorization expiry: none; valid until explicitly revoked. Expiry remains configurable as an ISO timestamp or null. The earlier thirty-day example described authorization validity, never a monthly Gemini quota/reset.
- Initial local planning target: three dispatch attempts per estimated five-hour planning window, configurable 3–5.
- Rolling 24-hour safety budget: twelve dispatch attempts. Lifetime budget: no additional total limit; configurable.
- Backlog: eight items, 512 MiB budget, 64 MiB reservation per pending master and 1 GiB minimum free storage.
- Eligibility/recovery observation spacing: five minutes; at most two original-turn recovery checks.

These are owner-controlled application/planning budgets, not provider allowances. The owner-observed five/six-hour refresh is an estimate; explicit account/weekly/provider boundaries take precedence. A date passing authorizes only a fresh eligibility check. Every submission still requires the pinned-account and global native admission checks, fresh video capability, the exact project's authoritative native admission, and no unresolved competing original. No native cap/counter, accounting-release endpoint or account rotation was used.

The durable policy and dispatch ledger survive restarts and span multiple windows. A single policy does not terminate after one clip or three total attempts. Revocation blocks new dispatch atomically while original submitted media can still be recovered/imported. Security, unknown operations and generic provider failures retain human/reconciliation holds. Definitively quota-rejected no-video runs can resume with a new durably counted sequence after fresh supported eligibility; runless native admission blocks similarly retain their project. Generic/uncertain failures are not blindly replayed.

Production remains one native ten-second portrait scene, text-only/no starting image, native audio and Dense Performance. Image/multi-scene Gemini remains experimental. Analytics do not gate production. QA/backlog/storage limits continue to apply; generated media is not automatically creatively accepted.

## Accepted sponge master and draft

Owner listening acceptance is bound to immutable master vid-f20f16b3-7a1c-4b95-8988-6577ea2c9b23, SHA256 3bab6640138d9c2d50cb6a2a422a04290f4747b1685c925f8b56890c91b66b3d. The durable agent QA entry is production-qa:gemini-production:item:73a4e1b72f1769574e576025cc62b943. Existing technical gates passed; twenty ordered samples show the complete sponge/sugar-cube/saucer payoff. No regeneration or audio repair/normalization was performed.

Moving-watermark variant: brnd-mw1uf09p-kqwt, SHA256 9cb860810cf253a862616ba6a33e90f7c6466c4dab5e970f2131136829ddbcf6, 720×1280, ten seconds. Twenty ordered variant samples show distinct safe watermark positions without losing the visible action/payoff. Both master and variant decoded audio SHA256 are 03af99d4ba639e448435123c44ad8b2aa19a750896d91868756e12a67daba558. This proves the accepted audio was retained exactly; it is not a new model listening claim. Final variant QA and draft fingerprint are durably recorded.

Draft draft-e28bcc30-95c3-4df4-81e0-abe1775f78d7, revision 1, status draft, approvedRevision null, queuedPostId null, no schedule. Correct destination: โลกจริงหลุดบท only. Thai caption:

> ฮีโร่ตัวจิ๋ว บางทีก็มาในรูปฟองน้ำ 🧽
> เรื่องสมมติสร้างสรรค์ด้วย AI
>
> #โลกจริงหลุดบท #เรื่องสมมติ

Draft payload fingerprint: 00a9522ac1424029d227d55b24c861127d1515adca624e24076aaeca13e6c949. Audio acceptance did not authorize publication.

## Separate standing Page publication support

PagePublicationPolicies uses a separately authorized page-publication-policy.v1 grant pinned to exact Page/Graph identity, with expiry/revocation, rolling-day volume, minimum spacing and optional lifetime budget. No Page grant was recorded or enabled in this assignment. Its optional step reuses the same AgentRunner trigger and existing SCC approval/queue services; no publisher daemon or second scheduler was introduced.

Its gates require accepted master/audio, final variant/audio-identity QA, exact reviewed caption/revision/Page/media, complete saved history, cadence and duplicate checks across Pages. Approval and queue intents are durable; a lost result holds the grant and only original-receipt reconciliation can release it. The existing official Meta queue remains authoritative for remote processing, IDs and permalinks. No new Page/Group publication, recurring public schedule or TikTok action occurred.

## Tests and local source

- Source commit 9ecf9ad4b0116f6301c3869e37b578427dbfc6d4: standing production policy, boundary-based checks, revocation, separate Page policies, final variant QA and tests.
- Runtime-loader commit a174a9a4f1b8ab39bab284d88d1b3274ac982258: scheduled host resolves the existing installed tsx dependency when source runs from a frozen local release.
- Full SCC gate: 75 isolated suites and 736 tests passed, zero failures. Final focused gates: 98 production/publication/runner/scheduler tests, 46 policy tests after status-label cleanup, and 18 frozen-host/scheduling tests passed. Agent/backend TypeScript checks and git diff --check passed. Native Flow gate: six packages, 73 top-level passes, zero failures; opt-in live fixtures stayed skipped.
- Tests demonstrate six sequential generations across two planning windows plus restart under one grant; account/weekly boundaries; no-expiry authorization; daily/total budgets; concurrent stop/revocation; original recovery; uncertain dispatch; conclusive runless blocks; security holds; failed QA/capacity; separate publication authority; daily cadence; duplicate prevention; lost approval/queue receipt reconciliation; and revocation before queueing. Fixture results do not prove long-running live reliability or numeric provider allowance.

No push or external deployment occurred. Unrelated historical QA working files were preserved.

## Safe local activation and actual execution

A WAL-safe sidecar backup was verified before QA/policy writes: integrity ok, SHA256 2018fef94fc3b38f93580f1fdef240342d1e308757162b57ae350801665f9da2. The original owner database, credentials, keys and TLS configuration were retained.

The established owner release preparer built and verified immutable source/client artifacts at .data/releases/a174a9a4f1b8ab39bab284d88d1b3274ac982258. This was prepare-only; SCC backend/API was not promoted or restarted. Its existing managed revision remains 5ce50da336c29a8255f7593919a35d38d1c290cc. Pipeline remains d87948aa97f8834946207476e951c51f8e5d145a and its UI remains 44f15f97e1a3d3ff23013dcaeae4aa418c6d2c4a. No Flow/native worker restart was needed.

The existing AgentRunner was authorized with one model/task at a time, one task per invocation, twelve maximum model invocations per day, five-minute interval and no automatic content-draft saving outside production QA. The initial current-user task SCC-Agent-8cb08fc859aa invoked the hidden existing scheduled host from that immutable release, using the original .data/agent/agent.db. Windows IgnoreNew prevents overlapping task hosts. Old same-database tasks were removed while the runner was paused and idle. The final current-user task is SCC-Agent-c585e08587a6, using frozen agent source 111c20e97f85895586248884f18d549b3010e9cf and its pinned wrapper. No second production scheduler exists. The separate pre-existing November 2 validation task uses a different isolated sidecar and was preserved.

Actual hidden-host receipts show successful execution at 15:57:42 Bangkok (planning) and the normal 16:00 scheduled invocation (bounded request queued). No new owner approval occurred between those invocations. First new enduring-policy project: 07011793-872d-4528-a333-d1a6abe4cc59, โดนัทล้อเดียว. Run 2a449679-271a-4972-a131-64b5900653be, request scc-production-047fee4c34f6ba1f3ea89e1960972c623ce04811. Provider intent/acknowledgment were recorded. The native worker advanced its account application window normally; the agent did not reset it. Global count read two, current account count one; neither is a numeric remaining Gemini allowance.

The exact conversation is https://gemini.google.com/app/e8e3f8c6921262d1 . The owner completed manual refresh/security and confirmed the existing video visible. Supported import-only recovery of run 2a449679-271a-4972-a131-64b5900653be returned HTTP 200; Pipeline completed the original and SCC imported immutable master vid-b928ff0a-c653-4a24-a916-652649e12502. No duplicate generation occurred. A supported reconcile_recovery action cleared only the proven completed stale global hold, followed by a fresh readiness check. The same standing grant resumed. This donut clip remains awaiting actual creative/audio QA; visibility alone is not acceptance.

Local commits 1dc8dc1 and 34be205 make that security-resume path and serialized concept result handling durable. Later creator-learning commits 9fbf863, a6c7660, ccb26dc and 111c20e add bounded external research, compact cached principles, reuse of original formatting-only reports and completed concept compatibility. See GEMINI_CREATOR_RESEARCH_20261104.md for current source/runtime and access evidence. No automated refresh, CAPTCHA interaction or extra provider diagnostic was added.

## Rollback and preservation

For rollback/revocation, use production-policy-revoke to stop new intents, keep any original active submission protected, and disable/remove the recorded runner task after its host is idle. Retain the immutable release, AgentStore and owner databases, media and receipts. The old service releases remain unchanged; no database restore, quota reset or native lock clear is part of rollback.

Final read-back retained identical Flow enabled/scheduler/projects/credit snapshots, the accepted Scene 1 clip hash, the unapproved sponge draft and the resolved original recovery. No original two-scene film content was replaced. Existing publication 1992352785227220 remains separate from the new unpublished sponge draft.

Private evidence: .data/agent/gemini-standing-20261104/ contains backups, owner QA/final variant receipts, media/audio hashes and frame sheet, policy/runner configuration, immutable-release preparation, schedule/host receipts, tests and exact original-turn handoff. No private artifacts are tracked.
