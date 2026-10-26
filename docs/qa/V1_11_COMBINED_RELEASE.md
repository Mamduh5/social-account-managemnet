# V1.11 calendar and text-only branding: combined local release

26 October 2026, Asia/Bangkok. Preparation only. **Owner restart/deployment and campaign approval are not authorized.** No push, social upload/post/comment/reply/new schedule, application Gemini generation or owner database migration was performed.

## Current readiness

**READY FOR CONTROLLED-UPGRADE APPROVAL.** Source, regressions, actual FFmpeg exports, isolated browser acceptance, verified online backup, copy-only migration rehearsal and frozen managed startup checks are complete. The exact candidate and receipts are recorded below. Owner remains on V1.10 `cccf9390542199fb18ae442753eba87088c9b255` at loopback 3001/3443 with normal synchronization enabled.

The local commits separate calendar functionality, text-only branding, final calendar safety guards and release tooling. The incoming 42 dirty/untracked files were copied and hashed in `.data/v111-integration/20261026/preparation-baseline/` before edits. An unused npm parent-package self-link introduced by installation was preserved in that snapshot and removed from client dependencies; no client source imported it. No original V1.11 or watermark implementation was reset or discarded.

## Combined behavior and safety fixes

- Calendar supports Page-scoped 7/14/30-day views, saved plans, exact-payload batch approval, pause/resume and audit-linked queue records. There is no embedded generation or autonomous campaign approval. Page selection uses registered account capabilities, without a hardcoded test Page identity/name.
- Material edits to safely unsubmitted queued campaign items preserve original rows as cancelled history, recreate pending content as unapproved drafts and clear campaign approval atomically. Published, manual, in-flight and uncertain submissions remain immutable. Reapproval does not replay cancelled history.
- Overdue paused work acquires the existing review hold before a campaign becomes active again. Queue reads and per-job dispatch checks require an active campaign. Explicit immediate overrides reject uncertain/failed/held work and shared multi-destination parents. A valid single-destination override records the new time and rebinds campaign approval; scheduled draft payloads cannot be silently rewritten, and campaign drafts cannot bypass batch attribution. Cancellation is restricted to safe unsubmitted schedules and confirmed success.
- All four branding modes remain independent. Moving and fixed bottom text have no black, orange, filled or translucent panels. Glyph outline/shadow provide contrast. The caption is slightly lower (70px in default portrait, 20px in default landscape at 1080p). Account defaults, per-video overrides, Thai/English glyphs and exact owner-entered text remain intact. No-watermark is byte-identical passthrough; historical files remain accessible. The cache separates new text-only outputs from earlier variants.

## Verification evidence

Private artifacts: `.data/v111-integration/20261026/`.

| Gate | Result |
| --- | --- |
| Complete regression | **259/259 PASS across 23 isolated files**, zero failures/cancelled/skipped; `regression-final.log` and `test-summary.json` |
| Calendar safety suite | **16/16 PASS**, including overdue holds, cancelled-history revision, unsafe immediate/cancel refusals and attribution guard |
| V1.11 atomic/copy migration | **6/6 PASS**, including DDL rollback, original projections, explicit readiness and no source replacement |
| Server and operations typechecks | PASS; `server-typecheck.log`, `operations-typecheck.log` |
| Client typecheck/build | PASS; isolated `client-candidate/`, `client-build.log`, captured `client-input.json` |
| Calendar browser | **7/7 stages PASS** on isolated3196: 7/30-day drafts, batch approval in fixtures, pause/resume, material edit -> draft and unapproved immediate-publication refusal; `calendar-browser.log` |
| Calendar + Branding browser | **12/12 checks PASS** on isolated3197; no page errors/prohibited requests; `branding-browser.log`; screenshots and same-frame preview/export proof in `branding/browser-runs/run-BLscEE/` |
| Actual video rendering | Eight current 1080p mode samples plus two orange-before references completely decoded; **8/8 complete browser playback PASS**; Tahoma Thai/English; all96frames per aspect have unchanged caption-only upper region; no-watermark SHA equals master |
| Owner preservation | 98 existing media files, 23 videos, 19 variants, saved presets, all existing publication content/status/remote identifiers, 8 accounts, 5 identity aliases, environment/certificates/config/process state and provider ledgers unchanged in read-only recheck |

[Combined visual contact sheet](../../.data/v111-integration/20261026/branding/visual/comparison-contact-sheet.png), [all four modes in both aspect ratios](../../.data/v111-integration/20261026/branding/visual/index.html), [exact filters and source/output hashes](../../.data/v111-integration/20261026/branding/visual/manifest.json), [same-frame preview/export](../../.data/v111-integration/20261026/branding/browser-runs/run-BLscEE/preview-export-comparison.png).

Samples reuse the prior prepared actual bright/dark footage. Portrait originated at720x1280 and was upscaled once during earlier QA preparation; landscape is native1920x1080. No production renderer scaling/cropping is introduced. Browser approvals and immediate-publication rejection tests used isolated fake credentials, paused workers and blocked provider fetches; these are not live-platform acceptance.

## Owner baseline and backup

The original database was opened read-only for observation and SQLite online backup. Backup: `.data/v111-integration/20261026/owner/owner-pre-v111.db`. SHA256: `1be4339bd7c786c7e4823b51d34a80dcb8a5325cad25fab50bf301623e716747`. Integrity is `ok`; zero foreign-key violations; 25 table projections saved. Backup/control preparation directories permit the current user and SYSTEM only. The original `.env`, encryption key and localhost certificate/key remain in their original paths.

Observed queue: **48 published, 9 failed, 3 awaiting_confirmation**. No active, overdue, scheduled or uncertain-submission job was found. Both Facebook and TikTok sync rows reported success; automatic synchronization remains enabled. No manual refresh, health mutation, token revision/expiry edit or provider probe was performed. Natural synchronization can continue adding observations; a new read-only/idle check and fresh online backup are mandatory at actual maintenance.

Protected manual destinations remain exact row matches: `dest-mvf5hdwf-19hi`, `dest-mvf5j24q-ub0y`, `dest-mvf5j24r-rw4x`. No retry, reset, cancellation or confirmation was applied to them. `owner/baseline.json` and subsequent verification receipts contain the private comparison evidence. Historical video/variant records and bytes remain unchanged; new branding proof outputs live only in isolated review data.

## V1.11 schema finding and migration preparation

The live database already has the complete calendar table, columns and indexes, despite the frozen owner backend remaining V1.10. This is an observed baseline, not a migration performed by this assignment. It contains **zero campaigns**. No prepared seven-day campaign was imported, approved, queued or published in the owner app.

The rehearsal starts from the verified backup and uses `scripts/prepare-v111-migration.ts` to make a new isolated copy. It reports `alreadyReady=true`; the copy SHA equals the backup SHA. All original columns/rows and all three holds remain exact, integrity/FKs pass, and campaign count remains zero. Receipt: `rehearsal/migration-report.json`. This copy is evidence only and must never replace the newer owner database.

For a genuinely legacy V1.10 schema, the explicit `migrateV111Database()` adds only the calendar schema in one transaction, checks every original column/row and rolls back on validation failure. Startup no longer silently adds calendar to an existing database. Managed startup refuses an incomplete calendar schema before initialization with `OWNER_V111_SCHEMA_MAINTENANCE_REQUIRED`. The preparation CLI has no live apply/replacement mode and rejects existing output files.

## Frozen package and activation plan

`package-owner-release.ts --prepare-only` creates the immutable commit-keyed release and a separate candidate configuration, without writing `.data/runtime/owner-config.json`. Packaging now requires an explicit preparation or separately authorized configure mode. Build provenance includes `server/src/domain/branding-layout.ts`, because the browser imports that shared source; a mixed client/backend cannot pass the source fingerprint check. The candidate preserves the original database, environment, provider configuration, Node executable and runtime paths.

Only after owner approval, perform the existing managed maintenance procedure:

1. Recheck exact protected holds, original media/presets/credentials/identities and provider ledger; require no active/uncertain/due publication or active sync/generation/mutation. Do not approve the seven-day campaign as part of maintenance.
2. Stop only the verified owner backend/proxy through `owner:stop`; refuse busy/unowned processes. Reserve loopback3001/3443, obtain a new WAL-safe integrity-verified backup and recheck schema. If calendar readiness remains true, do not run DDL. Otherwise apply only the tested additive migration transaction to the original database and verify exact original rows. Never use the prepared review/rehearsal database as a replacement.
3. Verify every frozen source/client hash and atomically activate only the reviewed candidate pointer. Preserve original database/env/key/cert/provider paths. Refresh the current-user Startup entry through the managed controller if needed; no UAC/service/firewall change.
4. Start the matched frozen release with `owner:start`, verify HTTP/strict localhost HTTPS, exact1.11.0/revision/client hashes, startup safety holds and normal read-only sync. Keep every campaign unapproved. Any publication, schedule, reply or generation is a separate owner decision.

## Rollback

Rollback is prepared before activation. Retain the untouched V1.10 release, original key/certificates, current-user startup and `.data/v111-integration/20261026/rollback/owner-config-v110.json`. If readiness fails after a later authorized upgrade, stop only verified owned processes at a safe idle boundary; preserve new observations and take a new backup. Prefer a source/config pointer rollback while leaving the original forward-compatible database in place. Do not restore old process state or replay jobs. Restore a database backup only after proving that no newer token/identity/analytics/comment/publication/draft/campaign observation would be lost; otherwise reconcile instead. The three manual holds and uncertain-intent blocks always remain enforced.

## Final preparation receipt

Candidate release: **`7ed0860969885d96bd44c55f1ec33274e6d1b906`**, frozen under `.data/releases/7ed0860969885d96bd44c55f1ec33274e6d1b906/`. All **93** source/client manifest files match. The captured client source tree, including the shared branding layout, matches that commit. Package receipt says `prepareOnly=true`, `ownerConfigured=false`.

Local engineering commits:

- `28c18a3` - V1.11 calendar and explicit schema gate/migration.
- `017639a` - text-only branding, lower customizable captions and visual acceptance.
- `3a22930` - shared-parent, cancellation and campaign-attribution safety guards; copy-only preparation CLI.
- `7ed0860` - guarded packaging, owner backup/verification, frozen smoke and rollout/rollback documentation.

The final documentation receipt is a later documentation-only commit; it does not change the packaged source or client.

Frozen smoke: `.data/v111-integration/20261026/frozen-smoke/run-iqULfh/receipt.json`. Exact1.11.0/revision, calendar/capability/branding APIs and every served client asset passed on disposable3198. The managed legacyV1.10 fixture correctly refused startup before calendar DDL. No provider fetch, campaign approval or queue action occurred. Both owned test processes stopped; the offline rehearsal database hash remained unchanged.

Final owner checks: `owner/final-verification.json` and `running-owner-verification.json` under the preparation directory. HTTP and strict certificate-validated localhost HTTPS are ready; the original owner instance, V1.10 pointer and all82 old frozen manifest files are unchanged. Automatic synchronization remains enabled. Existing publication history, all19 variant records/files,23 master records,98 media files, saved presets, credentials, identities and the three manual rows pass preservation checks. Provider config and generation ledger fingerprints are unchanged. Candidate configuration differs only in `releaseRoot`, `releaseRevision` and `clientDist`; it has not replaced the owner config.

Machine-readable final readiness: `.data/v111-integration/20261026/final-readiness.json`. No owner migration, restart/deployment, public social action, Gemini request or Git push was performed. **Stop here for owner upgrade approval; campaign approval remains a separate decision.**
