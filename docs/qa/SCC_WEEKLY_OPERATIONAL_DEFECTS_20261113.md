# Weekly workflow stabilization — 13 November 2026

This final stabilization pass repairs the existing Research-First weekly workflow. It does not add publication authority, renew an image trial, increase quotas or change Group destination schedules. Pilot 01 remains on its original owner database. The starting verified release is `475c881bdd80ff4180ac019b1d4da70a321a35b4`.

## Confirmed defects and corrections

| Defect reproduced | Correction and retained boundary |
| --- | --- |
| Offset image expiry accepted by weekly authorization but rejected by the image-plan parser | Image scopes accept explicit offsets and normalize the same instant to UTC. New weekly image policies use canonical timestamps. Equivalent historical timestamps reconcile without rewriting original grant/scope inputs. |
| Saved image authorization intent becomes stranded after a local failure or lost response | The existing weekly advance reconciles the same idempotent local authorization until its result is recorded. It reuses saved scopes and creates only missing scopes. Revoked grants, changed concepts, charged attempts and uncertain originals remain protected. Authorization never submits an image. |
| `page-editorial-supersede` uses an uninitialized CLI store | The command opens the existing selected store through `local()`. The real CLI test saves one routing hold, repeats idempotently and rejects a queued original without changing the draft. |
| Queued drafts keep filling the preparation backlog | Read-only exact-draft queue proof removes completed preparation from the backlog. Unavailable, ambiguous, unqueued and wrong-account results continue to count. New enqueues check the existing pending bound atomically; daily accounting is retained. |
| Active weekly campaign blocks later prepared slots | Newly materialized slots enter a deterministic incremental campaign through the existing approval workflow. Authorized campaigns, their queued destinations and their approval hashes remain unchanged. New items require separate exact approval. |
| Schedule metadata edits invalidate the preparation revision binding | Preparation content identity comes from the immutable successful draft-save response and excludes only scheduling metadata. Content, Page, type, hashtags and ordered media must still match. Schedule edits continue to increment revisions and clear approval; final campaign approval binds the complete current payload and reviewed weekly time. Missing original proof retains the revision hold. |
| Bodyless `POST /api/analytics/sync` returns HTTP 500 | The route handles an absent JSON body as the existing all-account request and validates supplied account IDs. Explicit provider permission failures remain unsuccessful results with their original status/message. No token refresh or provider call was used as a test fixture. |

The original CLI, analytics, offset, lost-intent, active-campaign and schedule-revision failures were reproduced against an isolated archive of the starting commit. A separate before/after fixture demonstrated the queued-draft backlog error using the original and corrected implementations.

## Validation

Clean full regression: **1,143/1,143 tests, 109/109 suites passed**. Final affected-workflow rerun: **89/89 passed**, including the additional concurrent image-scope reconciliation regression added after the full run read that suite. The final insert guard rechecks an existing scope inside the transaction, preserving active-task progress and a single scope index entry. Exact totals and sequence are recorded in `validation-summary.json`.

Backend and agent typechecks and the matching client build pass. The complete focused coverage includes concurrent preparation admission, legacy over-cap stores, partial multi-concept scope saves, equivalent offset timestamps, revoked scopes, uncertain attempts, changed content/media and fresh final approval.

The real loopback Express/browser/AgentRunner test passes research collection and analysis, original preparation recovery, text draft scheduling, exact-concept image authorization, real FFmpeg image decode/upload/readback, a schedule-only draft edit and incremental image campaign materialization after the text campaign is active. The original queued destination remains byte-identical. Queued drafts release preparation capacity and future schedules pass restart-safety checks. Outputs are explicitly synthetic fixtures; workers do not publish and no live model/provider quota is consumed.

Existing Group regressions exercise the shared native UI adapter at a controlled due boundary, exact account/profile binding, one charged click, pending/uncertain outcomes and no replay after restart. Fixture acceptance does not establish the future live Group publication result.

Two test corrections preserve their original safeguards: the historical seven-item image fixture now also checks early enqueue rejection, and the estimated-metric sentinel is checked in research prose rather than accidentally matching `777` inside a random plan UUID. Private-author/content markers are still checked across the entire exported plan.

## Pilot preservation and release boundary

Before/after checks cover both confirmed 13 November publications, seven scheduled Page posts, both original Group destinations, original grants and queue identities, draft/attachment order, historical receipts, media hashes, four protected AgentRunner recoveries and the unresolved Gemini provider claim. Normal analytics may advance only observed `last_synced_at` fields on already published destinations; this does not authorize any content or schedule change.

Private evidence is under `.data/weekly-stabilization-20261113/`: original baselines and supplemental asset/receipt fingerprints, baseline reproductions, full/focused logs, `loopback-integration.json`, `preservation.json`, `supplement-preservation.json` and the final activation/completion receipts. Credentials and owner data remain untracked.

Activation uses the existing owner updater and its verified backup/integrity/rollback gates. The exact existing recurring AgentRunner trigger must be idle, refreshed to the same scoped frozen release and restored with its original configuration and Group activation hashes. No due Group execution may be interrupted. If any idle, imminence, backup or binding check fails, retain the verified release and record a deployment hold. No schema migration or database replacement is required.

Remaining operational boundaries are unchanged: live Group receipts await their original due times and native preflight; protected Gemini recovery and the four original runner recoveries are not retried or cleared. Live read-only observations during this pass show all three Facebook Pages synchronizing successfully and an existing TikTok authorization failure retained as a hold.
