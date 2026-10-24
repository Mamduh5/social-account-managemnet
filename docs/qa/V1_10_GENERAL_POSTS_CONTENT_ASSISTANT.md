# V1.10 — General Page Posts and Draft-First Content Assistant

## Current recovery update — 24 October 2026

The owner application is restored on port 3001 from pinned owner revision 12ae5d8, with HTTPS on 3443. Automatic Facebook/TikTok boot and subsequent 15-minute sync cycles succeeded. The owner database was not migrated or replaced, and its three protected manual destinations remain exactly unchanged.

Real gemini_api_free / gemini-3.5-flash-lite text generation is now explicitly configured in the separate review app on 3195, using the existing approved Free-tier configuration. Five real requests demonstrated the requested four scenarios; the first caption was creatively rejected and corrected with a task-specific grounding fix. Original outputs and explicit manual review edits are preserved. The latest full suite passed 223/223 tests across 19 isolated files; the composer browser rerun passed 8/8. Default generation remains unavailable without explicit real-provider configuration, and fixtures remain separately labeled.

See [runtime investigation, actual provider/model outcomes, screenshots, request limits and current operational instructions](V1_10_RUNTIME_RECOVERY_REAL_GENERATION.md). This update supersedes the initial unavailable-provider/missing-runtime status below. New V1.10 functionality remains review-only until owner-approved schema/runtime rollout. No live publication, production migration, deployment, commit or push occurred.

## Initial implementation validation snapshot

Engineering review completed 24 October 2026, Asia/Bangkok. **Ready for isolated owner review; live rollout and live general-post publishing acceptance have NOT been performed.** No commit, push, deployment, OAuth/account change, live upload, new live schedule, public post, comment, reply or reaction was performed.

## Implemented behavior

- Facebook Page text-only, single-image, ordered multi-image and link drafts share the existing publishing records, independent destinations and local due-time queue. Text needs no video ID or dummy file. Images bypass branding/FFmpeg publishing paths. Existing Reel upload, authorization, revalidation, variants and scheduling remain intact.
- General composer: per-account Unicode/Thai text and hashtags, explicit post type, public link, JPEG/PNG upload/library/preview, per-destination removal/order/alternative text, save/reload, rejection, exact-revision approval, atomic batch approval and separate queue action. Registered but unconnected Pages can prepare drafts; API capability is required for approval/dispatch. TikTok general-post actions remain disabled.
- Draft approval binds serialized content, selected account IDs, schedule, image IDs/order/alternative text and revision with a SHA256 digest. Edits clear approval. Stale edits/approvals fail, batch approval rolls back if any item is stale, and an approved draft queues once. A blank/invalid selected schedule also disables local dispatch. Queued drafts cannot be edited through draft endpoints.
- Image originals are stored separately in uploads/images with immutable content hashes. JPEG/PNG signatures, actual decoder/codec, dimensions, size, managed real path and checksum are validated. App limits: 4 MB each, at most 10 images, dimensions at most 10,000 per axis and 40 million pixels. No silent crop, watermark or image URL fetch is introduced. Preview responses serve verified original bytes and preserve full dimensions.
- General Page posting uses local photo bytes, durable per-photo upload intent/IDs, then one ordered feed submission. Feed intent and remote post ID persist before follow-up requests. Success requires exact Page/post identity, published status and a valid Facebook permalink. An upload response is insufficient. Saved remote IDs reconcile with GET requests; unknown photo/feed outcomes remain held rather than replayed. Native investigation is required when an uncertain request returned no usable ID.
- Published general posts remain visible in normal history/queue and eligible for the existing metric synchronization. Missing video joins no longer discard those posts. Existing metric provenance, nullable counters and historical values are preserved.
- Content Assistant: provider interface, unavailable-provider default, explicit test fixtures, manual drafts, idea-to-post, rewrite, caption from supplied description/verified metadata, grounded Page-comment reply suggestion, small batches, owner voice profiles, editable review/reject/batch approval, audit, daily/batch limits and pause. Generation cannot execute outbound APIs or approve itself. No automatic public reply or new autonomous outbound mode is enabled.
- Owner voice stores language, tone, length, humor, emoji/hashtags, phrase preferences, owner-approved examples/facts/FAQ. Without examples it is provisional. Adding examples/facts requires explicit owner approval. Integration-test captions are not imported as writing examples.
- Reply suggestions require current authorized Page identity/token/status and both comment-read scopes through the existing capability registry. Official comment provenance and exact-account post/thread context are checked. Unrelated threads are excluded; missing context is explicit. Comments are untrusted data. Token columns never enter provider requests; credential-like text in context, voice, titles, outputs and provider diagnostics is redacted. Complaints, commitments, questions and suspicious instructions produce review flags.
- An approved non-reply assistant revision transfers into a new **unapproved** publishing draft. The source ID/revision, context/output hashes and provider provenance are audit-linked atomically. Text/account/revision mismatches are rejected. Subsequent edits preserve origin and require fresh publishing approval. Reply copying remains a manual review action.
- Groups Planning: owner-entered group/URL/identity/membership/category/notes/rules/date registry, prepared posts/reply drafts, native links, copy/export packages and explicit owner-entered receipts. Membership/permissions and receipts remain unverified. Opening a handoff never creates a Page API destination or marks publication. No joining, scraping or Group API dispatch exists.

## Initial provider availability and external API research

**At the initial implementation snapshot, live content generation was UNAVAILABLE.** No approved application LLM backend was found, and none was purchased, called or silently substituted. The coding-agent session is not an application provider. AssistantProvider, UnavailableAssistantProvider and FixtureAssistantProvider are implemented/tested. A deliberately approved live adapter/configuration is a later integration gate.

Fixture output requires BOTH SCC_ISOLATED_TEST=true and SCC_ASSISTANT_FIXTURES=true, and is labeled TEST FIXTURE — NOT AI OUTPUT. Default application startup uses the unavailable provider. Neither included provider claims image/video understanding; caption input is supplied description and verified metadata only. Test voice examples are fixtures, not the owner's accepted voice.

Configured Meta version was verified as v26.0 without exposing credentials. The official hosted docs returned HTTP 429/inaccessible responses; endpoint/field research used Meta's own generated v26.0 SDK source. See [Meta contract evidence and primary sources](V1_10_META_PAGE_CONTRACT.md). This verifies engineering contracts, not actual app permission/media acceptance. Ten-image/4-MB bounds are conservative application limits. Native presentation/order, alt text, link previews and account-specific field availability still need deliberately authorized live acceptance.

## Actual validation results

| Gate | Result |
| --- | --- |
| npm test | **207/207 PASS across 17 isolated test files**, zero failed/skipped/cancelled |
| npx tsc --noEmit | **PASS**, exit 0 |
| npm run build:client, separate SCC_CLIENT_BUILD_DIR | **PASS**, 1,956 modules; client typecheck included |
| General composer real browser | **8/8 PASS**, desktop/mobile, zero page errors |
| Assistant and Groups real Edge browser | **9/9 PASS** |
| Legacy migration fixture | **PASS**, exact history/index/trigger retention, rollback, idempotence and incomplete-schema refusal |
| Owner database copy migration | **PASS**: 30 posts, 60 destinations; integrity ok; zero foreign-key violations; every original row/column across 14 source tables equals source |
| Protected manual queue records | **PASS**: exact before/after rows unchanged; all three still awaiting_confirmation |
| Owner environment | **PASS**: before/after file digest unchanged |
| Live schema | **UNCHANGED**: owner publishing table still lacks V1.10 columns; no live migration applied |
| Review launcher configuration | **PASS**, --check --no-build starts no server |
| git diff --check | **PASS**, exit 0 |
| Live general-post publication / live AI generation | **NOT PERFORMED / UNAVAILABLE** |

New focused suites are general_posts.test.ts (16), meta_general_posts.test.ts (12), and content_workspace.test.ts (14). The full run also includes existing OAuth/revalidation/Reels/scheduling, independent destinations, TikTok token renewal/rotation/races/transient failures, Display API and nullable-statistics coverage. Provider calls are mocked; every automated suite receives its own SCC_DATA_DIR. The initial sandbox-only attempt could not spawn some local media/dependency tools; the complete final suite passed with authorized local subprocess access. No fixture pass is being presented as live acceptance.

Browser publishing checks exercised media-free Thai draft save/reload, exact approval invalidation and blank-schedule guard, Bangkok wall-time conversion and saved destination, decoded image previews and original SHA256 equality, single-image alt text, multi-image reorder/remove/re-add, link/TikTok gating, batch approval without queuing, mobile layout and existing Reel composer. Assistant/Groups checks exercised draft-only flags, fixture labels, revision edits, batch drafts, hostile comment handling without a reply, provisional voice settings, pause/resume, unverified registry and unpublished manual packages. Screenshots were visually inspected.

## Local review and unpublished demonstration

The initial fixture review ran at **http://127.0.0.1:3195**; its current explicit real-provider mode is described in the recovery report above. Its data is .data/v110-review/app and its client bundle is .data/v110-review/app-client-dist. The harness blocks every server-side provider fetch and pauses only its own fixture publishing/sync workers. The owner database and environment are not used. The displayed fixture Page identity is synthetic, including its encrypted test credential; it cannot call a live platform from this harness.

If the review instance is no longer running, use npm run review:v110 -- --fixtures. The launcher builds only the separate review bundle, strips owner provider environment values and ignores owner dotenv credentials. Omit --fixtures for unavailable-provider/manual-draft review. Do not launch another copy while port 3195 is in use. This command neither restarts the owner instance nor applies a migration.

In Publishing Center enable Show demo publishing targets and select a general post type. The review batch uses title suffix **mvm0bsea**:

| Demonstration | Draft ID | Saved state |
| --- | --- | --- |
| Thai text and Bangkok schedule preparation | draft-1793b040-b7d8-468f-9a95-7203e91177bc | Draft, revision 3 |
| Single PNG, caption and alt text | draft-8e0b1ce9-9e96-4067-8b51-e58653cec3fc | Approved, unqueued |
| Ordered orange/blue PNGs and caption | draft-dc2b7ae7-da24-4d79-b928-bcf040a6012d | Approved, unqueued |
| Public link and Thai text | draft-7c818d4e-4206-4c8f-b6ef-6624537e8ae5 | Draft |

All four have queuedPostId=null. Approval alone did not enqueue or publish anything. The local demonstration manifest also selects three labeled fixture reply suggestions; their source comments have has_replied=0. Earlier diagnostic batches and historical seeded simulator comments remain separate fixture artifacts. No owner writing samples or private discussions were mined.

Local artifacts are ignored/untracked:

- .data/v110-review/demonstration-batch.json — exact four drafts and three reply suggestions.
- .data/v110-review/test-totals.json and tests-final.log — final full test run.
- .data/v110-review/browser/report.json — eight publishing browser results.
- .data/v110-review/assistant-groups-browser.log — nine Edge checks.
- [Ordered images desktop](../../.data/v110-review/browser/multi-image-ordered-desktop.png), [single image desktop](../../.data/v110-review/browser/single-image-draft-desktop.png), [scheduled text desktop](../../.data/v110-review/browser/text-scheduled-draft-desktop.png), [link mobile](../../.data/v110-review/browser/link-draft-mobile.png), [existing Reel composer](../../.data/v110-review/browser/existing-reel-composer.png).
- [Content Assistant](screenshots/v110-content-assistant.png) and [Groups Planning](screenshots/v110-groups-planning.png).
- .data/v110-review/live-preservation.json and migration-copy-validation.json — preservation/copy checks. Keys, database copies and runtime media remain local and ignored; the two new documentation screenshots are untracked review evidence.

## Migration and rollout requirements

Existing publishing_posts.video_id was NOT NULL. V1.10 needs a nullable video reference, explicit content types, image records, per-destination ordered attachments/upload state, revisioned drafts/audit and content-workspace tables. Fresh isolated databases initialize these; legacy startup does not rebuild the owner publishing table. Missing workspace schema returns a maintenance-required response. Old video publications retain content_type=reel and every historical value. V1.9 nullable-statistics maintenance remains separate when applicable; this migration does not reinterpret or rewrite analytics history.

Use scripts/prepare-general-posts-migration.ts with --database PATH for read-only inspection. Adding --copy-to NEW_PATH creates and migrates a new consistent SQLite backup only; existing targets are refused. Example: npx tsx scripts/prepare-general-posts-migration.ts --database .data/social_command_center.db --copy-to .data/v110-review/new-maintenance-copy.db. The command has **no in-place/live apply mode**. The copy rebuild is transactional, preserves original columns/values and auxiliary indexes/triggers, and validates foreign keys/integrity. It also initializes the new content workspace on the copy.

Production rollout requires explicit later owner maintenance authorization: reconcile historical live gates/protected items, take a fresh consistent verified backup, stop only the authorized instance during that window, prepare/validate a fresh copy, perform any separate V1.9 maintenance, preserve encryption/environment/media/identity state, then deliberately activate the validated schema/source and restart. Never replace a running SQLite database, reuse this aging review copy over newer observations, copy WAL files piecemeal, or treat a restart-held destination as replay permission. A rollback must account for any new writes after activation; retain the pre-rollout backup and original media.

## Preservation and practical limits

The three protected destination IDs are dest-mvf5hdwf-19hi, dest-mvf5j24q-ub0y and dest-mvf5j24r-rw4x. They were read-only snapshotted and compared byte-for-byte as row objects after work; no retry/cancel/confirm/edit action was issued for them. The owner environment digest and live schema are unchanged. Migrated-copy comparison preserved all original values, including credentials/identity aliases, media metadata, observations and publishing history, without printing sensitive values.

At the initial implementation snapshot no owner process was stopped or restarted. That initial read-only inventory found **no listener on port 3001 and no loopback-proxy.ts process**; their current availability/continuity cannot be certified from older milestone notes, and this assignment did not start them. Only known isolated review processes and this task's test runners were stopped/restarted. Existing owner scheduler/sync behavior was not disabled or reconfigured.

The first ordinary client build wrote ignored client/dist. Before browser acceptance that bundle was rebuilt from unchanged owner HEAD 12ae5d8; all later builds used the separate review output. Exact pre-task generated asset bytes were not captured, so byte-for-byte preservation of that ignored bundle is not claimed. No source rollback, owner database replacement or environment change accompanied this build handling.

Initial remaining gates (provider setup and owner runtime recovery are now resolved as documented above): complete the deliberate schema/runtime maintenance; review the currently reachable Meta documentation and actual grants; perform separately authorized live general Page post/media/schedule acceptance. Group automation and TikTok publishing remain unsupported/disabled. No live general-post publishing acceptance, live AI quality/owner-voice acceptance or public rollout is claimed. No commit or push was made.
