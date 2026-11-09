# Weekly content operating contract

Owner decision: **9 November 2026, Asia/Bangkok**. Autonomous implementation is closed conditionally; normal production remains operational. The owner returns each week to authorize a seven-day content plan. This contract defines that meeting and subsequent operation; it is not this week's generation grant, exact-content approval or a new schedule.

## Weekly owner record

Record a stable week ID, explicit Bangkok start/end (seven days, end exclusive), exact three SCC account/Graph identities, and the per-Page text/image/Reel slot list. Each slot records its intended time, format, topic, source/provenance, current preparation grant, original task/media/draft IDs, revision/hash, approval state, queue/destination identity, remote receipt and any hold. Use one existing seven-day campaign per Page for concrete publishable items; retain concepts and media preparation in the existing AgentStore. Link these IDs in the weekly meeting record; do not duplicate content to build a separate scheduler.

| Page | Graph ID | Existing publication boundaries to respect |
| --- | --- | --- |
| World / โลกจริงหลุดบท | 1428270437036294 | Reels: up to 5/rolling 24h, at least 3h apart, mandatory owner review. Text/image: separate grants, up to 1 per format/24h with 24h spacing and exact owner approval. |
| Rai | 1313185685220741 | Reels: up to 2/rolling 24h, at least 6h apart, preferred 12h; retain the existing technical/factual acceptance policy. Text/image: separate grants, up to 1 per format/24h with 24h spacing and exact owner approval. |
| Developer / แก้บัคยาวๆๆ | 409347032254077 | Same 2-Reel/24h, 6h minimum, 12h preferred policy. Text: separate existing grant and exact owner approval. Image publication remains disabled. |

These are ceilings, not weekly targets or permission to fill every slot. Check current durable policy inputs/charges before each plan. Generation dispatch ceilings, provider limits, media capacity and publication ceilings remain separate. Preserve World's review requirement and the accepted Rai/Developer Reel policy.

## Weekly sequence

1. Read existing calendar, queue, receipts, current grants and holds. Retain already scheduled eligible work, original operations and media. Plan around existing commitments and remaining allowance.
2. Agree the three Pages' seven-day slots and editorial/source requirements. Research freshness must cover actual preparation/publication; a plan date cannot refresh a source. Missing source, imagery or video remains a named hold.
3. Obtain a **separate explicit bounded Codex image-preparation authorization**: exact Page IDs, start/expiry, concepts/images per rolling day and total, pending/active bounds, included provider only, and no automatic renewal. Preserve all previously charged/uncertain attempts. This does not approve the resulting images or posts.
4. Prepare or queue eligible existing Gemini video work, captions, concepts, images and drafts through existing mechanisms. Do not regenerate an original with uncertain outcome. Every item keeps Page, slot, provenance and approval state, including held items.
5. Present exact final revisions/media/order/destinations/schedules for owner approval. Use existing campaign review hashes and exact draft approvals, then the explicit existing queue action. Existing separate Reel standing authority remains in effect; this meeting does not broaden it.
6. Let existing workers execute eligible approved work without needing another chat session. Report item-specific source, approval, context, quota and verification holds. A held item does not revoke unrelated standing grants or justify pausing the whole runner.
7. On return/restart, reconcile saved remote IDs and original operations. Preserve completed and future work; hold interrupted/uncertain/overdue work. Do not replay missed weekly slots, accelerate cadence, reset rolling counters or flood a backlog after downtime. The machine, signed-in session and relevant local processes must be available; no cloud scheduling guarantee is made.

## Existing capability and precise gaps

| Requirement | Current capability / remaining gap |
| --- | --- |
| Seven-day planning and individual times | Existing `campaignPlanSchema` supports 7/14/30-day per-Page campaigns, explicit Bangkok conversion, text/images/ordered multi-image/Reels, revisions and saved receipts. No replacement calendar is needed. |
| Exact owner review and queue | Existing campaign review hashes, exact draft approvals, edit invalidation and separate queue action. Neither preparation nor weekly authorization replaces these. |
| Durable execution independent of planning | Existing publishing DB/worker, separate standing publication controller and original-store five-minute AgentRunner. Normal work survives chat sessions and ordinary process restarts; protected holds remain intentional. |
| Downtime | Managed startup rejects in-flight, uncertain or overdue queue state; paused campaigns hold overdue items on resume. Standing streams retain rolling cadence and budgets. Do not add a missed-slot replay loop. No forced restart was performed for this assessment. |
| Weekly consolidated record | No combined three-Page weekly authorization object exists. Minimum current solution: the dated owner meeting record linked to the three existing campaigns and sidecar grant/task IDs. No new database or scheduler is necessary. |
| Repeatable weekly image authority | **GAP:** `StandingPageImages.authorize` permits only one immutable trial; another policy ID is rejected (`cannot rearm`). The current shared World/Rai trial ends **13 Nov 2026 11:58:18 Bangkok** and keeps its combined 1 concept/day, 3 images/day, 9 total, 1 active and 6 pending bounds. Do not represent it as recurring weekly support. |
| Future explicit image week | Existing exact-concept `page-image-scope` can bound fresh, eligible concepts without editing the old grant. Repeated standing weekly authorization would need a small explicit successor-grant transition retaining all history/cross-week rolling charges and exact Page scope. Defer that addition until an actual week/limits are authorized; never renew this trial as a side effect of closure. |
| Complete current seven-day inventory | The live read found two historical World campaigns (1–7 and 2–8 Nov), rather than a newly authorized three-Page week. No current weekly slot list or new image authorization was inferred or issued. |

Source map: `server/src/domain/content-calendar.ts`, `server/src/services/calendar.service.ts`, `server/src/domain/runtime-recovery.ts`, `scripts/agent/runner.ts`, `scripts/agent/page-content.ts`, `scripts/agent/page-content-images.ts`, `scripts/agent/page-image-policy.ts`, `scripts/agent/page-publication-policy.ts`. This is an operating agreement and source/live-state assessment, not a new end-to-end weekly runtime acceptance or permission to publish additional content.

## Groups original text — later 9 November owner instruction

The subsequent [shared execution acceptance](../qa/SCC_GROUPS_AGENT_INDEPENDENT_20261109.md) supersedes the missing-callable-executor limitation below: a dedicated signed-in SCC Chrome and common native CLI are now live-verified, and the exact original discussion has its [published receipt](https://www.facebook.com/groups/2214946398974915/posts/2568574890278729/). All agents invoke the same preparation/claim/dispatch/outcome boundary. No new timer, recurring schedule, weekly grant or automatic window renewal was added; future weekly Group slots still need actual bounded authority and eligible invocation through the existing operating workflow.

Include the selected joined Group as a separate destination in weekly planning. The first exact World Reel share has its own [published receipt](https://www.facebook.com/groups/2214946398974915/posts/2568461086956776/) and supplies no future authority. Original text handoffs already exist in Groups Workspace; the [new minimal text lane](../qa/FACEBOOK_GROUPS_ORIGINAL_TEXT_V1_20261109.md) adds independent durable slots and distinct exact-post/weekly grants in the existing agent store. No new weekly Group grant or actual Group slot has been activated.

Record the numeric Group, joined Page/profile, fresh rules/permission evidence, prepared text, time window, per-Group totals/rolling cadence/lateness and explicit moderation uncertainty acknowledgment when applicable. Images/memes need their own included preparation authority and supported publication format; a Group text grant supplies neither. Queue only under matching actual authority. Do not ask again for an unchanged eligible operation already covered by its grant.

Group local slots persist across ordinary restarts, but **unattended native execution remains unavailable**: the existing Browser Bridge cannot publish or schedule and the frozen AgentRunner has not gained a callable supported Group executor. An authorized interactive agent can use the current visible Facebook UI after a fresh observation and atomic intent/charge. Save actual outcomes and the existing SCC receipt; pending moderation is charged and reconciled, never retried. Overdue slots hold rather than flood the Group after downtime. All three Page streams keep their existing independent workers and grants.
