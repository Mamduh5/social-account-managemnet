# Quota-aware Gemini production and bounded pilot — 4 November 2026

> **Later owner update:** Sponge audio accepted, a watermarked unpublished draft prepared, and enduring revocable production authorization implemented. See [the standing-production handoff](GEMINI_STANDING_PRODUCTION_20261104.md). The bounded-pilot gates below preserve the earlier checkpoint.

The Gemini-only controller is implemented and committed locally. The explicitly authorized live pilot produced one usable technical result, then stopped at the existing pinned-account application cap. A second bounded request was rejected before provider submission; no third request was sent. The new master is awaiting audio/creative acceptance. Recurring production/publication remains disabled. This is a bounded foreground pilot, not a claim of complete unattended or live multi-generation acceptance.

## Source checkpoints and behavior

- Initial implementation: 281a2037116384bce79403dce520afdfed66d79b.
- Account-aware admission correction found by the live pilot: d4fe126322299313d60a3e9ca986b7b0b516a9d4.
- No push or external deployment. Existing unrelated QA working files were preserved.

The optional GeminiProduction step uses the existing AgentRunner trigger and existing Pipeline worker. It adds no timer, second generation worker, browser-refresh loop, CAPTCHA handling, account rotation or quota-reset action. Text-model invocation budgets are separate from progressing already-authorized video work. Independent preparation can continue during provider waits. No engagement threshold gates production.

New production remains single-scene, native ten seconds, portrait 9:16, Dense 2x, text-only and native audio. New projects are review-first standalone_10s_v1 and pinned to the named Gemini account. The global Gemini scheduler stays disabled so historical queued projects cannot start accidentally. Before dispatch, the controller verifies both saved project and scene-request contracts, fresh supported readiness, global and account application limits, the project's native admission status, storage/backlog capacity and the still-valid owner scope. Dispatch accounting and its immutable operation claim are committed together; a concurrent stop revokes unclaimed dispatches.

Creation, dispatch, recovery, import, render and draft uncertainties retain their original identities and never blindly repeat a POST. Known originals can be read back. Recovery is exact-turn and import-only, with bounded checks. Definitive errors hold the cycle. A native blocked request with the same project/request identity, no run and no submission intent/ack is recorded as a pre-provider admission outcome. Closing that scope does not clear native reservations or change accounting.

Defaults: five-hour fallback observation assumption, target three bounded dispatch attempts (configurable 1–5), eight backlog items, 512 MiB backlog budget, 64 MiB reservation per pending master, 1 GiB minimum free storage, five-minute recovery/readiness spacing and at most two original-turn recovery checks. The five-hour planning assumption is not a guarantee of video allowance. Google documents general usage limits separately from feature availability: https://support.google.com/gemini/answer/16275805?hl=en . Explicit native restrictions and recorded boundaries take precedence.

Production imports verified completed media as immutable SCC masters, then holds actual creative QA. An accepted exact SHA can use the existing moving-watermark renderer and unapproved unscheduled Reel draft workflow. Metadata and a model's proposed concept are not audiovisual acceptance.

Publication stays independent through existing SCC approval/queue services. The read-only production-publication-plan checks the exact ready draft's Page/master/variant and saved publication history against separately configured hours/rolling-day cadence. Default proposal is one per 24 hours; it is not an enabled schedule or standing authorization. No automatic approval/publication was added or enabled. Recurring operation and any standing per-Page policy still need deliberate scope/volume authorization; the completed pilot is not authority for more generations.

## Validation

- Full SCC gate before the live pilot: 74 isolated suites, 711 tests passed, zero failures. It ran against disposable per-suite storage, never the owner database.
- Following the live admission correction: 99 focused production/Pipeline/SCC/runner/schedule tests passed. After the final status-copy correction, 67 production/runner tests passed. Agent and backend TypeScript checks passed. git diff --check passed.
- Focused native Pipeline isolation: six packages, 73 passing top-level tests, 319 passing test/subtest events, zero failures, three opt-in skips. Existing Flow/frozen/review-first/standalone regressions were included. No live Flow call was made.
- Fixtures cover three sequential completed generations, early/weekly limits, manual-security holds, exact original recovery, process restart, lost creation/dispatch responses, concurrent ticks, stop during readiness, request-level image/duration/settings deviations, failed QA/capacity, independent publication admission and UTC checkpoint timestamps. New regressions reproduce low global usage alongside an exhausted account ledger and a blocked native request with no run.

These fixture results do not prove three successful live generations. Actual live capacity achieved in this pilot is one successful provider submission and clip.

## Explicit owner scope and actual pilot

At 14:32 Bangkok the owner authorized up to three sequential submissions within six hours on gemini_web-main, using the three prepared concepts for โลกจริงหลุดบท, backlog only. Stop conditions included quota/security/provider errors/uncertainty. The persisted scope expires 20:32:40 Bangkok; it was stopped and closed early, and its consumed identity cannot be rearmed.

| Result | Count |
| --- | ---: |
| New paused/review-first Pipeline projects | 2 |
| Durable bounded-request dispatch records | 2 |
| Actual provider submission intents and acknowledgments | 1 |
| Completed/imported clips | 1 |
| Provider generation errors during this pilot | 0 |
| Pre-provider account/application admission blocks | 1 |
| New public publications | 0 |

**Successful first concept — ฟองน้ำฮีโร่**

- Project b039001c-f34e-4077-b598-b5b2f4e4fc22.
- Run ce3f7877-cfc7-4e3b-9fab-51ea37caad36.
- Request scc-production-1870626bdf0402e70356a554c384d892ba2734d3.
- Exact conversation: https://gemini.google.com/app/e6435a15bebb4a0b .
- Completed at 14:35:10.611 Bangkok. No security intervention or result recovery was needed.
- Saved effective prompt: 2,382 UTF-8 bytes, SHA256 0159bc920766363f24232beb8bd953dfd7ac16b9b65538c2047cdbe020d247ca.
- SCC immutable master vid-f20f16b3-7a1c-4b95-8988-6577ea2c9b23, 1,654,559 bytes, SHA256 3bab6640138d9c2d50cb6a2a422a04290f4747b1685c925f8b56890c91b66b3d. Exact final-artifact hash/size matched the imported master.
- FFprobe/full decode: 10.000 seconds, 720×1280, H.264 30 fps, stereo AAC 48 kHz. Native audio policy and text-only/no-image request were verified.

**Second concept — คลิปหนีบตัวจิ๋วกับดินสอยักษ์**

Project 2558dfb3-3701-42d9-82fa-cfe8b591a1d2 and request scc-production-18f5ca85f44af3fe36a27aabcc6abcefd54cf6de are preserved. The API initially accepted the bounded worker request. The worker then returned blocked: the original account's application submission safety cap had been reached. No GeminiRun, provider submission intent or acknowledgment was created. The project was paused through the supported item action; HTTP 200 and its native blocked receipt are saved. No replacement/retry was requested.

**Accounting distinction and source correction**

At the block, the global application ledger read 1/4 while gemini_web-main read 4/4, with its separate application window starting 10:43:26.440 Bangkok. Before this pilot the account ledger was 3/4; the successful first clip used its last available application slot. The worker's existing account guard prevented the second provider submission. This is not evidence that Gemini itself had no remaining video allowance.

The first controller version checked the global count but omitted the pinned account ledger. The correction now checks both and the exact project's own native admission result. It mirrors the native account-window eligibility predicate without changing any counter. A fresh enabled video control does not bypass an account/application hold. No accounting release, cap increase, account rotation or reset was performed.

The native account-selection wait recorded 15:43:26.440 Bangkok as the next application recheck boundary. This is neither confirmed Gemini quota nor authority to resume the closed pilot. Future generation needs a new deliberate scope plus fresh complete admission. Numeric provider/video/weekly remaining allowance remains UNKNOWN. Old provider-reset display dates were not used as current allowance evidence.

## Actual creative review and backlog

Twenty ordered samples at two frames per second show a stable expressive sponge reacting to a coffee spill, absorbing the wave, carrying an intact sugar cube and settling on a dry saucer. The rescue and payoff read within this standalone clip. This is sampled visual review, not every-frame artifact certification.

The track is present and numerically quiet: -33.7 LUFS integrated, approximately -6.4 dBFS true peak and -39.17 dBFS RMS, with no NaN/Inf samples. Signal headroom does not establish listening quality or absence of unwanted speech. The session has no audio-listening tool. No clean-audio/creative PASS was invented and no repair or normalization was applied.

The clip remains awaiting_qa. Its review evidence is saved both privately and in durable agent knowledge. A Thai caption candidate explicitly marks the scene as AI-created fiction. No moving-watermark variant or new SCC Reel draft was prepared because final creative/audio acceptance remains pending.

Final local index: one imported clip awaiting QA, one unsubmitted failed-admission project preserved/paused, and one queued concept (โดนัทล้อเดียว) with no Pipeline project or provider request. The active backlog counts two items: the clip and queued concept; the failed no-asset admission record remains in history. No content was substituted into the unfinished original film.

## Publication, observations and Groups

The earlier owner-approved repaired/watermarked Reel remains the sole publication discussed here: Facebook ID 1992352785227220, https://www.facebook.com/reel/1992352785227220/ , published 4 November 2026 at 13:29:05 Bangkok for โลกจริงหลุดบท. It was not uploaded again or changed. There was no additional Page/Group post, recurring publication or TikTok action.

The existing SyncService continues its normal observations. The new lightweight tracker reads saved confirmed receipts and metrics at 1/24/72-hour checkpoints on the existing trigger; observation errors do not gate production. Actual source/observation timestamps and unknown values are retained; follower attribution remains unavailable. One initial checkpoint was premature because SQLite UTC text was parsed as local time. The source fix interprets that format explicitly as UTC, preserves and labels the premature record invalid, and records the later valid first-hour checkpoint. It does not rewrite SCC's original analytics history. Confirmed reactions/comments are zero in the observed snapshots; unavailable views/shares were not converted to zero.

ร้อยละคนไทย remains a flexible experimental Page, with no permanent category scheme imposed and no new publication in this pilot. Advanced analytics learning and TikTok expansion remain on hold.

The stored external Group group-aa9a94da-d2a9-4ad1-9078-f41c4b19ad8c remains member / needs_review / permissionVerified=false. Its current record requires review of whether Pages may participate, current owner review, participation approval and post moderation. Rules were last recorded 3 November; these are saved owner-entered records, not a new native verification. Its original prepared discussion and blocked handoff remain intact. No automatic Group publication was enabled.

## Runtime and preservation

- SCC managed backend remains 5ce50da336c29a8255f7593919a35d38d1c290cc, PID 4880; proxy PID 14560; ready, normal sync and existing Startup enabled; original owner database retained. No backend/client changes required restart.
- Pipeline remains d87948aa97f8834946207476e951c51f8e5d145a, PID 3088, --gemini-only. UI remains 44f15f97e1a3d3ff23013dcaeae4aa418c6d2c4a, PID 19376 at 5173. Neither was rebuilt/restarted in this assignment.
- New controller commands ran from the local SCC source checkpoints above. No persistent production process or recurring trigger was installed. AgentRunner remains disabled, zero active invocations, schedule installed=false.
- The bounded cycle is finished/closed, production enabled=false. A final production-tick returned disabled with zero actions. Native Gemini scheduler remains disabled; active run null, zero in-progress bounded requests and submission_unresolved=false.
- Flow's complete enabled/scheduler/projects/credit_totals snapshots hash-identically to the pre-task baseline: 53 projects, paused, 12 authorized/12 spent/zero reserved/zero remaining. No Flow source, prompt, image, model, default, continuity, scheduler or generation change occurred.
- All historical Gemini run arrays match their pre-task hashes. Exactly one new GeminiRun exists. Original film 330aaf23-17d6-4982-96c6-93ef3792673c remains 1/2 accepted; Scene 1 was downloaded again and retains SHA256 77cb4c547d48140b7fadf9c2463b696f0c0833cf7ff41545eab2123d74bb8783.
- Agent sidecar backup integrity ok, SHA256 dcd9ac9b0bf4f940ec8755081acc4f53eae7540f5519b8cce00611bb1551c2ff. No owner database replacement/migration, credential change or destructive operation occurred.

## Remaining gates

1. Listen to and accept/reject the exact new sponge master before creative approval, branding and a ready Reel draft. No publication is authorized by the pilot.
2. Treat the native account-window boundary as a recheck only. A new bounded production scope is required after the stopped pilot; do not reuse either dispatch ID or raise/reset a cap.
3. Do not enable recurring production/publication yet. Live sequential throughput above one remains unproven, and standing account/expiry/budget and per-Page volume/cadence authority have not been established. The current controller is bounded, not an unlimited window-rearming service.
4. Verify current native Group rules/participation/moderation and the exact discussion handoff before any separate Group publication.

Private evidence: .data/agent/quota-production-20261104/ contains scope/owner authorization, backups, all pilot operation receipts, exact project/request snapshots, native account-cap evidence, stopped/closed/paused receipts, the immutable QA copy/contact sheet/audio/FFprobe results, durable review receipt, valid/invalid checkpoint evidence, test logs and final preservation/runtime snapshots. No private artifacts were staged or committed.
