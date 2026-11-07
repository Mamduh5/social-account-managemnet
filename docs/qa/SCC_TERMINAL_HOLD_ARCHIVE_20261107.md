# Non-destructive terminal Reel archive — 7 November 2026

The previous eight-slot inventory mixed pending work and completed machine-quality failures. There was no supported capacity-only archive. This change introduces one terminal read-only lifecycle, using the existing AgentStore, review leases and AgentRunner backlog callback. It creates no scheduler, provider, generation retry, acceptance or publication authority.

## Actual initial inventory

| Item | Classification | Archive decision |
| --- | --- | --- |
| World woven coaster, `vid-5aaee8e9-77ee-419a-87ac-cba36b6c3ce3` | Awaiting mandatory owner review | Protected; retained active |
| World pebble/paper boat, `vid-ad1c15f4-fa97-450b-ba60-83c22f505938` | Awaiting mandatory owner review | Protected; retained active |
| World thimble/button, `vid-46684339-4fbf-4992-b870-b577b026329b` | Awaiting mandatory owner review | Protected; retained active |
| World recovered eraser/pencil, `vid-d12ffebd-3853-4c1d-8268-61e93010c491` | Awaiting mandatory owner review | Protected; retained active |
| Rai strange-rules notebook, `vid-3f5d6c32-2c2d-48b9-bdec-13c8ec6b82da` | Completed terminal machine-quality hold | Eligible after exact native/SCC read-back |
| Developer freshness illustration, `vid-b821b6e7-5083-442b-93a7-d0d9413b11e6` | Completed terminal machine-quality hold | Eligible after exact native/SCC read-back |
| Developer recovered cached response, `vid-fcb29c57-6570-4ac1-b7a1-7ce9a27dc3b7` | Completed terminal machine-quality hold | Eligible after exact native/SCC read-back |
| Rai admitted item `8be0ca4fdc96958256781cc525372a76`, project `fa1f6b0c-b044-45cd-9b25-238bd952f164` | Queued/preparing, waiting on its existing dispatch allowance | Protected; retained active |

There was no active generation, unresolved provider original, pending automatic review or accepted publication candidate among these eight at the baseline. Published history and the historical failed no-asset admission are retained separately and were already excluded from active slots.

## Lifecycle and safeguards

`terminal-reel-archive.ts` classifies only completed valid machine holds on the separately authorized sourced Page Reel lanes. World, owner decisions, accepted media, incomplete technical QA, changed/superseded review results, active model work and pending/uncertain operations are excluded. Malformed results and missing evidence fail closed rather than becoming proof of a completed quality review.

`OwnerVideoReviews.archiveTerminalHolds` takes the existing production and publication leases. It checks native scheduling is disabled and no active/unresolved/observing/in-progress original exists, then reads the exact completed project/run and current SCC master/variant/draft. The draft must remain unapproved, unqueued, unscheduled and exactly bound to the failed review scope. Changed content, identity or unavailable reads prevent archival.

The deterministic `terminal_archive_v1` operation, append-only knowledge receipt and `phase: archived` / `terminalArchive` state commit in one SQLite transaction after revalidation. A crash before commit leaves no partial receipt or slot release. A restart after commit does not create another archive or re-run review. Original media, draft revision, all previous operations, result bytes/hashes, holds and dispatch charges remain untouched. There is no implicit restore, deletion or retry.

Production and owner-review inventory share `productionInventory`: archived failures release active slots but retain all previously counted master/variant/analysis bytes. The byte ceiling and filesystem free-space admission remain independent constraints. Publication-history byte treatment remains unchanged; archival itself removes no bytes. Unknown archived media accounting fails closed. No storage refund or quota refund is granted.

Archived candidates remain accessible in **Video Review → Archived failures** and **All videos**, with original/moving-watermark playback, caption, identities, recorded findings and audit history. They are read-only: approval/edit/re-review and automatic publication are guarded in the backend as well as disabled in the UI. They cannot become publication-ready merely through a changed phase field. Existing ordinary acceptance/publication behavior remains intact for other content.

The existing Page backlog callback performs bounded archival automatically; the next normal callback can use the released slots. Neither Page's maximum two charged generation dispatches or two published Reels per rolling day, six-hour minimum publication spacing, automatic QA contract or optional owner-review mode changes. Future concepts continue using the previously activated presentation instructions. No failed video is regenerated.

## Validation

The isolated real-state check used a WAL-safe copy and GET-only provider/SCC adapters. Exactly the three candidates above archived: **8 → 5 active slots**, **3 archived**, **119,322,426 bytes unchanged**, including **31,660,171 archived bytes**. All other item states and inputs matched. The copied owner's archive list retained all three exact draft/media identities and disabled edit/approval. No owner database or provider mutation occurred in this check.

- Full isolated SCC gate: **94 suites / 956 tests passed**, zero failed suites. Final focused production/review/multi-Page/publication/archive gate: **139 tests passed**, zero failures. Seven archive tests cover scope classification, pending/uncertain operations and model tasks, World/owner/accepted exclusions, original mismatch, atomic rollback, restart/idempotency, unchanged charges, retained bytes and ordinary publication beside an archive. Agent/backend TypeScript and production client build passed; existing bundle-size notices were nonblocking.
- Actual compiled UI in isolated Chrome verified all three archived rows, recorded findings, disabled decisions/edits, preserved original/variant playback and mobile layout, with zero browser JavaScript errors and zero mutation requests. Initial harness failures were an incomplete status fixture and missing relative media routes; the corrected GET-only fixture passed. These were not owner acceptance or provider/publication actions.
- The immutable packager and independent verifier checked **216 packaged files** from local source commit **`1279a9ea6daebe1ef8f768ef838c4168bd4a669d`**. No schema change or extra dependency was introduced.

## Actual activation and normal scheduled outcome

At an idle boundary the original runner was paused and backed up; the guarded owner updater activated the verified backend/UI on the original owner database. Owner backup `.data/owner-updates/activate-f4uS3r/owner-before-update.db` passed integrity and zero foreign-key violations, SHA256 `5e9401c7f2b666b3d03fa2ef5e24f73754018b5c37b1f5ed0be0538b57e57ca1`. The final AgentStore activation backup passed integrity, SHA256 `9e32827baf9b0beb34ace610718ff47f63a4920abb376f0fadb2597337c8e540`.

At **14:03:49 Bangkok**, task **`SCC-Agent-0905fe76c088`** resumed on frozen `1279a9e`, enabled/unpaused/authorized, with the same original AgentStore, five-minute cadence, concurrency and limits. The prior same-store task was removed; the unrelated isolated validation task was preserved. Pipeline `66d4153` and its UI `44f15f9` were not restarted. Owner SCC is now `1279a9e` (backend PID 21804 / proxy 21084 at this checkpoint), with its normal managed startup/sync retained.

The **normal 14:05 Bangkok scheduled host** completed with OS exit zero and zero model launches. Its initial production result still says `backlog_full` because that step ran before archival. The independent backlog callback then committed exactly these successful `terminal_archive_v1` receipts:

| Item suffix | Bangkok commit time | Preserved exact revision-1 draft |
| --- | --- | --- |
| `19d225676b2e32e0a58ffe63c8e1acce` | 14:05:09.522 | `draft-ce8c878c-8704-4961-9a51-12ae56d1c7a8` |
| `795a956a8aed76e8fa37661481fd6993` | 14:05:12.012 | `draft-fb348c81-3c48-406f-8a4b-14bffb20f47b` |
| `7de72ede0d45194d7166ed76c1727d25` | 14:05:14.283 | `draft-9b1acfeb-1676-4819-84c1-51fcca42794c` |

No manual archive/advancement tick or provider request was used on owner state. Final live inventory is **5/8 active**, **3 archived**, **119,322,426 retained/reserved bytes** against 512 MiB, including **31,660,171 archived bytes**. `full:false`. The remaining five are four protected World owner-review candidates and the original queued Rai project. Technical/creative holds remain recorded; archival is not a QA PASS.

Rai and Developer each retain **two charged dispatches / zero remaining** in their rolling day. Their normal policy rechecks remain **17:55:21** and **18:50:17 Bangkok**, respectively. At read-back Rai had one fresh fact and Developer three; current source/native admission must still pass at future execution. The shared provider claim is empty and no unresolved original is recorded. The last saved native capability is `video_available`, explicitly stale; no diagnostic availability check was forced and numeric provider allowance is unknown.

Backlog cleanup no longer requires a manual action for eligible terminal failures. Existing admitted Rai work can advance and new stock can be prepared when ordinary Page, source, native and storage admission allow; free capacity is not permission for early submissions or proof that Google will remain available. Genuine World owner-review work can still occupy capacity. Model accounting remains **4/18 UTC-day calls / 77,935 tokens**, no unknown usage or reset.

At **14:05:24**, independent preservation verified **60 existing inputs**, **all 124 previous operation rows**, **12 policy-bearing job states/charges**, **139 prior native runs**, and the exact full Flow snapshot. Fourteen served master/variant files across all seven imported active/archived candidates were rehashed successfully; all seven drafts remained revision 1, unapproved, unqueued and unscheduled. All previous fields of archived items match after excluding only their new archive receipt and lifecycle phase; all World production states match exactly. No existing video, caption, approval, media identity, recovery receipt or consumed dispatch was changed.

**New machine acceptances: zero. New Meta-confirmed Reel publications: zero. Item 3 remains incomplete; Item 4 was not started.** Existing machine acceptance and Page publication authority remain enabled. No generation, publication, billing, quota reset, Git push, Group or Deep Analysis action was added for validation.

Previous binaries/releases and backups remain retained. Recovery/rollback must preserve newer archive receipts, media and operations; do not restore an older database or replay a request. An older release without archive-aware review/publication guards requires compatibility review before reuse; do not silently make archived failures editable or publishable.

Private evidence: `.data/agent/terminal-hold-archive-20261107/`. The pre-work AgentStore backup passed WAL-safe copying; SHA256 `ba539f3669a5c5e381939db7b647d4a1edec4e74104f8af4f7c77dec11595acf`. Private artifacts are ignored and not staged.
