# V1.12 external Groups implementation

27 October 2026. Baseline `a425c1ac1b6c65c0013babc334ade3a73e9669b4`.

**Source-level implementation and offline verification completed. Ready for owner source review. Browser visual acceptance, owner-data migration, deployment and live Facebook acceptance remain pending.** No application/browser was opened, no server was started/stopped, and no owner database, connected permissions, release pointer, Facebook state or AI Video Pipeline was changed. Nothing was committed or pushed.

## Authorized blocker corrections — 28 October 2026

**READY FOR OWNER CHECKPOINT for the focused F1–F3 corrections.** At correction closeout, the complete existing 28-file changeset was unstaged and uncommitted. This follow-up changed nine files within that inventory; it did not change the four-table migration architecture or managed release safeguards. No owner database, production migration/rehearsal, runtime, account, provider or release operation was performed.

The owner's subsequent 28 October authorization permits a local Git checkpoint only, after exact-inventory, full-diff, sensitive-artifact and staged-content checks. It does not authorize release preparation, activation/rollback, production migration, runtime control or Facebook actions. The maintenance and owner browser acceptance gates below remain pending after a source commit.

### Root causes and corrections

- **F1 — reply receipts:** `groupReceiptMatchesThread` previously accepted a bare post or unchanged parent because comment checks were conditional on captured references. It now requires a resulting comment/reply on the same canonical Group and post. A post-target handoff accepts a top-level `comment_id` or explicit nested result. A captured comment target requires its parent plus a distinct `reply_comment_id`; a saved nested target accepts a distinct result under the saved root or explicitly named target. Bare posts, unchanged parents/targets, orphan/duplicate references and unrelated contexts fail. A flattened comment-only link cannot establish a captured parent relationship and fails closed. This is URL evidence only, never Facebook verification. Existing receipt events, snapshots and historical completion states are not revalidated or rewritten.
- **F2 — identity isolation:** `save` previously reused full supplied/previous eligibility after changing identity. An acting-Page change, including Page/personal transitions, now clears participation approval and membership answers. A canonical Group change clears all eligibility, rules and rules-review date. Both always reset membership/review and require a subsequent review, even if the same request supplies a new completion timestamp. Canonical URL variants and ordinary edits preserve valid current context. Reset events retain the prior context in the existing audit. New observation identity bindings also use that audit; earlier explicit observation keys remain available, and uncaptured historical Group identity is labeled unknown rather than inferred from the current plan. Existing observation, snapshot and audit rows remain unchanged. Groups Planning shows the reset/re-review requirement and historical Group attribution.
- **F3 — delayed response edits:** selection tokens previously checked only which Group was selected. Form/draft edit generations and registry request generations now preserve edits made after request start while refreshing untouched fields and server revisions. Nested eligibility and question/answer rebasing retains server resets for untouched fields. Preparation only clears a draft if no newer draft edit exists. Stale mutation errors cannot replace the new selection's error state. Question insertion/removal is temporarily disabled while requests run to keep row matching stable; observation and receipt controls are also temporarily disabled during requests that clear/remount them. Registry and handoff text remain editable, and controls re-enable after success/failure.

### Files changed by this follow-up

| File | Correction |
| --- | --- |
| `server/src/domain/groups.ts` | F1 matcher/reference validation; optional observation identity DTO |
| `server/src/services/groups-workspace.service.ts` | F2 context resets and transactional audit bindings |
| `server/src/repositories/groups-registry.repo.ts` | Historical observation identity enrichment |
| `client/src/hooks/useGroupsWorkspace.ts` | F3 edit/request generation and response rebasing |
| `client/src/views/GroupsWorkspaceView.tsx` | Re-review/history labels and temporary local-editor guards |
| `test/groups_domain.test.ts` | Four new receipt regression tests |
| `test/groups_external.test.ts` | Seven new service/history regressions |
| `test/groups_selection.test.ts` | Twelve actual editable-component regressions; original four tests retained |
| `docs/qa/V1_12_EXTERNAL_GROUPS_IMPLEMENTATION.md` | This correction and compatibility record |

### Fresh verification

The previous 14-suite selection was rerun successfully with **183/183 passing, zero failures, cancellations or skips**, including 23 additional tests. The earlier 160/160 result below is retained as dated history rather than assumed current proof.

| Suite | Passed / total |
| --- | ---: |
| `groups_domain` | 13 / 13 |
| `groups_migration` | 9 / 9 |
| `groups_maintenance` | 6 / 6 |
| `groups_maintenance_activation` | 11 / 11 |
| `groups_external` | 20 / 20 |
| `groups_selection` | 16 / 16 |
| `groups_handoffs` | 3 / 3 |
| `content_workspace` | 14 / 14 |
| `general_posts` | 17 / 17 |
| `meta_general_posts` | 12 / 12 |
| `content_calendar` | 22 / 22 |
| `owner_release_core` | 17 / 17 |
| `owner_release_prepare` | 8 / 8 |
| `owner_release_activation` | 15 / 15 |

- F1 new assertions reproduced the pre-fix failures: 8 passed / 5 failed before correction; 13/13 passed afterward.
- F2 nondefault approval/transition assertions reproduced three failures: 14 passed / 3 failed before correction; the final expanded service suite passed 20/20. Cases include Page A/B, Page/personal transitions, Group changes, same-canonical variants, reminder completion, unchanged historical receipts, snapshots/audit preservation and uncaptured history.
- F3 uses the actual `GroupsWorkspaceView` and ReactDOM with deferred mocked APIs, bundled entirely in memory (`write:false`). One disposable headless Edge process uses fresh contexts, blocks all requests and asserts no outbound requests or page errors. No application server/listener or owner endpoint is involved. Twelve component cases cover newer edits, legitimate refreshes, preparation clearing, overlapping selections, stale/current errors, approval-reset preservation and observation-control recovery. Replaying the former unconditional overwrite/clear writes only in an in-memory bundle produced three targeted failures; working source was never reverted. This is behavioral component evidence, not browser visual or live-platform acceptance.
- Server and client no-emit typechecks pass. A strict no-emit check of all three changed test suites and their imports passes with `--module ESNext --moduleResolution Bundler --jsx react-jsx`, matching client import conventions. An initial ad hoc NodeNext invocation was incompatible with those conventions and was replaced; no import-contract rewrite was made.
- The broader operations check still reports exactly the seven baseline diagnostics in the six unchanged operational scripts listed below. No new correction/maintenance diagnostic is present. `git diff --check` passes.

Each service suite used a separate new `.data/test-runs` directory with `SCC_SEED_DEMOS=false` and `SCC_ISOLATED_TEST=true`. Database/migration/activation tests use disposable fixtures or injected operations only. Current logs and consolidated counts: `.data/test-runs/groups-blocker-corrections-8b90d00b74154d4ba4e98ce3d34ad1e0/verification-summary.json`. F3 failure replay: `.data/test-runs/groups-selection-red-7a8035e58d6b43a58e8a8e62c46e0702/red-replay.log`. Artifacts remain local and ignored.

### F4 compatibility disposition — assessed, not changed

`checkRevision` still validates a supplied revision and accepts omission. Mandatory enforcement would break supported legacy callers:

| Caller | Current behavior |
| --- | --- |
| Typed `useGroupsWorkspace` client | Supplies revisions for save, observe and prepare |
| Generic `contentWorkspaceApi.groups` wrapper | Accepts arbitrary legacy bodies |
| Baseline `GroupsWorkspaceView` at `a425c1a` | Omitted revision on save and prepare |
| `scripts/test-group-handoff-api.ts` | Omits revision on preparation |
| `scripts/apply-creative-quality-pilot.ts` | Omits revision on preparation |
| `test/groups_handoffs.test.ts`, `test/content_workspace.test.ts` | Preserve revision-free compatibility cases |
| `test/e2e/v112_autopilot_acceptance.ts` | Omits revision on existing-plan update |
| `test/groups_external.test.ts` | Exercises both supplied revisions and legacy omission |

Without the caller's original read revision, the server cannot transparently detect its stale input. Reading the latest revision server-side would conceal the same conflict. Keep the present optional contract for this correction; migrate callers and introduce required revisions through a separately scoped versioned/opt-in contract. Revision-free callers retain the known stale-write/preparation risk. This does not block the current typed UI path or the focused F1–F3 checkpoint.

### Remaining boundaries

No F1–F3 blocker remains in the verified offline paths. The seven baseline operations diagnostics, F4 contract decision, owner-data compatibility, concrete Windows maintenance/recovery behavior and owner visual/live acceptance remain separate gates. Source readiness does not authorize staging, committing, preparing a release, migration, startup, maintenance, publication or deployment.

## Implemented behavior

- Register a Facebook Group URL manually; preserve its original URL/record ID and derive a canonical numeric or vanity key. Bare/www/mobile Facebook hosts, Group root, posts/permalink, trailing slash and tracking parameters normalize safely. Numeric IDs and vanity slugs remain separate identities; unsupported/ambiguous URLs are rejected. Active Page + Group duplicates are blocked transactionally and by a partial unique index. Legacy duplicates survive with a review warning and still block a new conflicting active plan.
- Maintain shortlist, category, notes, archive status, review timestamps and saved-Group filters for query/Page/membership/category/shortlist/archive. The explicit native search link performs no automatic discovery. Group open/search links never update membership.
- Record all eight per-Page statuses: Unknown, Not a member, Request pending, Member, Admin, Request rejected, Request withdrawn and Participation restricted. Observations append acting Page, owner observation date, notes, recorded time, `source:owner_entered` and `verified:false`. Changing the acting Page or canonical Group resets current membership to Unknown and clears review while preserving previous observations and handoffs.
- Record Pages-can-join eligibility, rules/review date, promotional restrictions, membership questions/owner answers, participation approval and post moderation. Readiness is informational and always reports `publishingPermission:owner_review_required`, `verified:false`. Member/Admin status never implies permission to publish. Resume Review reloads/focuses local review; completion requires an explicit save.
- Preserve personal manual handoffs without creating personal-profile accounts or claiming a verified personal identity. Existing source-Page/media handoffs remain supported.
- Invalidate stale selection/package requests and reset draft, media and thread state on selection/New/save. Revision checks reject stale writes/preparations. Reply receipts must match the captured Group, post and any saved comment/reply target. Opening a package is read-only. Receipts/corrections append superseding events, retain the first legacy receipt fields, and remain unverified.
- New handoff snapshots include membership-observation identity and eligibility. Drift warnings cover identity/Page, status/new observations, rules/review dates, eligibility/questions/approval/moderation, archive state and unavailable source Pages. Version-1 snapshots remain readable and gain a warning about uncaptured fields.
- Cancel/dismiss reminders locally without changing publication status or recording a receipt. Due labels refresh in the open view; no background notifications or automated native actions were added.

## Additive migration and compatibility

Four sidecars extend existing Groups Planning:

| Table | Purpose |
| --- | --- |
| `group_plan_extensions` | Canonical/original identity, Page, shortlist/archive/review, eligibility, revision, legacy-duplicate flag |
| `group_membership_observations` | Append-only owner-entered per-Page lifecycle history |
| `group_receipt_events` | Append-only original receipt and superseding corrections |
| `group_reminder_states` | Active/cancelled/dismissed state independent of publication |

No existing table is rebuilt or altered by migration. All original table columns, row counts and sorted row hashes are checked inside the migration transaction. Existing Group IDs, prepared text, legacy snapshots, receipts, audit events, accounts, Page queue and calendar rows survive. Unsupported legacy URLs are preserved with unresolved canonical identity; duplicate legacy rows are flagged rather than merged/deleted. Imported membership observations have an unknown actual observation date (`NULL`) and an explicit legacy note. Personal handoffs create no fabricated Page/profile observations. Original receipt timestamps/notes are retained in imported events. DB triggers prevent observation/receipt updates and deletes.

Fresh workspaces initialize the extensions. Existing workspaces do not silently migrate at startup: Groups routes return 503 until explicit maintenance; Content Assistant/global workspace readiness is unchanged. Repeat migrations add no duplicate imports. Fixtures cover atomic rollback and closing/reopening an on-disk database. An incomplete/partially populated extension is not assumed ready.

Ordinary managed update/rollback still rejects any changed database source. A separate maintenance command validates a frozen candidate, copy rehearsal, fresh backup, protected work and original-table preservation before migration/promotion; it never starts/stops the app. Shared Group domain inputs are included in frontend build provenance so a frozen client cannot silently come from different shared contracts. See [exact future commands, approval gates and rollback limits](V1_12_EXTERNAL_GROUPS_MAINTENANCE.md).

## Changed files

| Area | Files and principal responsibilities |
| --- | --- |
| Client | `client/src/views/GroupsWorkspaceView.tsx` (controls/manual handoffs); `client/src/hooks/useGroupsWorkspace.ts` (workflow state); `client/src/hooks/groups-selection.ts` (request guards/reset); `client/src/api/content-workspace.ts` (typed Groups contracts; assistant compatibility) |
| Domain/schema | `server/src/domain/groups.ts` (DTOs, canonical identity, receipt matching, readiness); `server/src/db/groups-schema.ts` (sidecars/readiness/migration); `server/src/db/content-workspace-schema.ts` (fresh-only initialization) |
| Backend | `server/src/repositories/groups-registry.repo.ts` (metadata/history); `server/src/repositories/groups-handoff.repo.ts` (typed immutable contexts); `server/src/repositories/content-workspace.repo.ts` (preserve first receipt); `server/src/services/groups-workspace.service.ts` (local workflows); `server/src/routes/groups-workspace.routes.ts` (typed endpoints/schema gate) |
| Maintenance | `scripts/prepare-groups-migration.ts` (copy-only rehearsal); `scripts/apply-groups-maintenance.ts` (future explicit maintenance/promotion); `scripts/lib/groups-maintenance.ts` (artifact/preservation gates); `scripts/lib/groups-maintenance-activation.ts` (testable phase/recovery/provenance guards) |
| Release provenance | `scripts/package-owner-release.ts`; `scripts/lib/owner-release-prepare.ts`; `test/owner_release_prepare.test.ts` |
| New regression suites | `test/groups_domain.test.ts`; `test/groups_migration.test.ts`; `test/groups_maintenance.test.ts`; `test/groups_maintenance_activation.test.ts`; `test/groups_external.test.ts`; `test/groups_selection.test.ts` |
| Documentation | `README.md`; this report; `docs/qa/V1_12_EXTERNAL_GROUPS_MAINTENANCE.md` |

No publishing connector, queue/scheduler, calendar implementation, account permissions, OAuth/session configuration, media library or AI generation implementation changed. `.data` artifacts are ignored and untracked.

## Offline verification

Every service suite used its own newly created `.data/test-runs/<suite>-integration-*/` directory and `SCC_SEED_DEMOS=false`. Tests used mocked provider responses; no application/Express listener, browser, live provider or production migration was run. The static React render is not visual acceptance.

| Suite | Passed / total |
| --- | ---: |
| `groups_domain` | 9 / 9 |
| `groups_migration` | 9 / 9 |
| `groups_maintenance` | 6 / 6 |
| `groups_maintenance_activation` | 11 / 11 |
| `groups_external` | 13 / 13 |
| `groups_selection` | 4 / 4 |
| Existing `groups_handoffs` | 3 / 3 |
| Existing `content_workspace` | 14 / 14 |
| Existing `general_posts` | 17 / 17 |
| Existing `meta_general_posts` | 12 / 12 |
| Existing `content_calendar` | 22 / 22 |
| Existing `owner_release_core` | 17 / 17 |
| Updated `owner_release_prepare` | 8 / 8 |
| Existing `owner_release_activation` | 15 / 15 |
| **Total** | **160 / 160; zero final failures** |

There are 52 tests across the six new suites. They cover canonical identity/no guessed alias merge, Page A/B isolation, all membership states, membership versus posting permission, legacy private-workflow preservation, wrong-thread rejection, append-only corrections, reminder status, delayed selection/package responses, copy-only path guards, restart/idempotence, release gate preservation and fail-closed maintenance cleanup. Existing suites cover Page publishing and Content Calendar behavior. An initial agent test invocation shared one disposable DB between concurrent suites and hit SQLite locking; corrected per-suite isolation passed. An initial static-render import error was corrected. These were not live-runtime failures.

Commands (already installed tools only):

```powershell
$groupsSuites = @('groups_domain','groups_migration','groups_maintenance','groups_maintenance_activation','groups_external','groups_selection','groups_handoffs','content_workspace','general_posts','meta_general_posts','content_calendar','owner_release_core','owner_release_prepare','owner_release_activation')
$groupsOldData = $env:SCC_DATA_DIR
$groupsOldSeed = $env:SCC_SEED_DEMOS
try {
  foreach ($suite in $groupsSuites) {
    $env:SCC_DATA_DIR = Join-Path (Get-Location).Path ('.data\test-runs\' + $suite + '-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $env:SCC_DATA_DIR -Force | Out-Null
    $env:SCC_SEED_DEMOS = 'false'
    node --import tsx --test (Join-Path 'test' ($suite + '.test.ts'))
    if ($LASTEXITCODE -ne 0) { throw "Offline regression failed: $suite" }
  }
} finally {
  $env:SCC_DATA_DIR = $groupsOldData
  $env:SCC_SEED_DEMOS = $groupsOldSeed
}
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node client/node_modules/typescript/bin/tsc --noEmit --incremental false -p client/tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.operations.json
git diff --check
```

Server and client no-emit checks pass. A focused strict no-emit check of the new maintenance scripts/helpers and domain/migration/maintenance fixture suites also passes (`--ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop`). `git diff --check` passes. The broader operations check fails with **seven unchanged baseline diagnostics across six existing scripts**: `capture-inbox-reply-screenshot.ts` and `capture-owner-ui-evidence.ts` (`LaunchOptions.viewport`), `check-live-comments.ts` (obsolete token export/property), `verify-db-final-state.ts` (unknown row type), `verify-remote-reply-header.ts` and `verify-remote-reply.ts` (obsolete token property). No new implementation diagnostic is present; `git diff --exit-code HEAD -- <six diagnostic scripts>` confirms they are unchanged. They do not block source review or the existing client-build/release-preparation path; the broader operations gate is not green. They were left unchanged. Full builds, full test runner/E2E suites, Playwright and browser/runtime checks were intentionally not run.

## Owner acceptance after separate maintenance/startup approval

1. Verify the configured/runtime revision and served client are the new immutable candidate, with the original database and connected accounts intact. Check the existing private test Group and its old prepared content/snapshots/receipt before new testing; historical acceptance alone is not current proof.
2. Register a disposable Group plan for Page A using a supported URL; try www/mobile/tracking variants and verify a second active Page-A entry is rejected. Register the same Group for Page B and verify independent status/history. Confirm numeric and vanity identities are not automatically merged.
3. Apply shortlist/category/membership/Page/archive filters. Archive/reopen/restore a plan; conflicting restores fail safely. Original URLs, IDs and history survive reload/restart.
4. Record pending -> member and rejected/withdrawn/restricted observations with dates/notes. Verify all history/source labels remain owner entered/unverified. Confirm a Page or canonical Group change resets status/review. Merely opening Facebook must not change anything.
5. Record Page eligibility, rules, questions/answers, promotional restrictions, participation approval and moderation. Member status alone must still require review. Resume Review performs no external action; explicit completion saves a review timestamp.
6. Switch Groups rapidly while package/review requests are delayed. The final selected Group owns the visible form/package; previous thread/content/media cannot carry into a new handoff.
7. Prepare post/reply drafts, check media/source Page/reminder and export/copy. Change rules/membership/eligibility and inspect drift warnings. Attempt a wrong-post/wrong-comment receipt and confirm rejection with no event. Record a valid owner receipt, then a correction; both events and the original snapshot remain.
8. Cancel/dismiss a reminder and verify no publication/receipt is recorded. Inspect desktop/narrow layouts, long rules/history/URLs, focus/disabled states, and Midnight Dark/Cozy Light readability. Separately regression-check existing Page drafts/approvals, queue and calendar without authorizing publication.

## Remaining limits

This is manual URL discovery/registration and owner-observed lifecycle management, not independent Facebook verification. There is no API Group search, scraping, join request submission, membership polling, bulk operation or Group publishing. Alias reconciliation requires reliable future evidence. Native Facebook decides whether a Page may join/participate and whether posts require approval. Local review cannot establish Facebook permission or successful publication. Reminder notifications outside the open view, automated discovery/verification, remote post monitoring and unsupported API automation are not implemented.

The maintenance command's destructive boundary was exercised only through disposable migrations and injected orchestration fixtures. Real Windows process/port/filesystem/Startup operations and actual owner-data migration require the later reviewed maintenance window. All browser layout and live acceptance remain pending. Do not start another feature or release milestone automatically.
