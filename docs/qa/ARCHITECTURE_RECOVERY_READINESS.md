# Architecture migration recovery verification

1 November 2026, Asia/Bangkok. Engineering checkpoint and preparation only; owner activation/startup requires separate approval. The original database, configuration and maintenance markers remain in place.

The legacy comparator omitted `publishing_commands` before migration, then included the new empty table afterward. `retainedFingerprint` now represents an absent legacy command table as empty. A separate strict inventory validates every existing record and column, all original schema objects, and only the exact command table/three History indexes as additions. A newly added command table must be empty; existing command receipts remain exact. Migration performs these checks inside its transaction, with integrity and foreign-key validation. The regression no longer drops the new table to hide the discrepancy.

Recovery verification opens both original backups and the owner database read-only. The backup SHA256 values, 29 existing tables, preserved accounts/credentials/settings/accounting and retired-handoff receipt must match. Disposable copies of both verified backups passed migration, idempotency and deliberate credential-corruption rejection. All 124 retained media files match their original hashes.

`owner:update --check --maintenance-run ABSOLUTE_RUN_DIRECTORY` verifies the prepared immutable candidate against its exact clean Git source and client provenance. The compatibility exception permits only the reviewed architecture module and fresh-database initializer; all other database source changes stay blocked. Preparation does not change the owner pointer, markers, Startup entry or processes.

During a later approved apply, the recovery claim requires the original inactive controller and exact matching run/nonce markers. Verification, backup, promotion, Startup-refresh or receipt failures retain the hold. Only completed promotion plus unchanged evidence/candidate configuration permits release, with the Startup exclusion removed last. An originally stopped owner stays stopped. Ordinary update/rollback safety remains strict. The pre-reset release cannot protect safety receipts/remote-comment replay and is blocked as a rollback target; keep the forward database and use a verified corrective release instead.

The three manual handoffs remain unresolved, with original IDs/outcomes/evidence in the checksummed safety receipt and pre-reset backup. They have no dispatchable queue rows. No production reset, migration, database replacement, provider request or social submission was repeated.

## Seven pre-existing operations diagnostics

These six ad hoc helpers are not imported or invoked by the managed runtime, migration, release preparation, activation or rollback paths. Per the mission's scope rule, all seven are documented/deferred; none was run against the owner/provider or hidden by changing compiler settings.

| Location | Diagnostic | Effect and disposition |
| --- | --- | --- |
| `scripts/capture-inbox-reply-screenshot.ts:13` | TS2353: `viewport` is not a browser launch option | Screenshot helper only; move to a context/page option in a separate capture repair. |
| `scripts/capture-owner-ui-evidence.ts:13` | TS2353: same invalid `viewport` option | Screenshot helper only; same disposition. |
| `scripts/check-live-comments.ts:2` | TS2724: `tokenProtection` is not exported | Stale live Graph helper; current token API is `unseal`. Separate live-tool repair. |
| `scripts/check-live-comments.ts:9` | TS2339: missing `access_token_encrypted` | Stale account field; repository model uses `access_token`. Separate live-tool repair. |
| `scripts/verify-db-final-state.ts:13` | TS18046: unknown query row `d` | Historical V1.12 snapshot helper with fixed IDs; type its selected projection if reused. Not a migration/readiness gate. |
| `scripts/verify-remote-reply-header.ts:7` | TS2339: missing `access_token_encrypted` | Historical live-reply inspection helper; separate live-tool repair. |
| `scripts/verify-remote-reply.ts:7` | TS2339: same missing field | Historical live-reply helper also contains an outbound duplicate-send probe. Excluded from this non-submitting assignment. |

No diagnostic affects owner lifecycle, migration preparation/checking, release compatibility/preparation, activation, rollback or recovery. Broad operations typecheck therefore still exits 1 with exactly these seven known diagnostics. Strict compilation of all relevant entry points and their transitive dependencies passes without unsafe casts or configuration changes.

## Validation evidence

- Final full isolated runner: **518/518 tests across 59 suites**, zero failures/skips. Final maintenance/recovery/activation focused checks: **31/31**, including every transaction failure phase and the successful stopped-owner transition. One combined focused invocation shared a fixture directory incorrectly; rerunning each suite with its own disposable directory and the complete canonical runner passed. No owner database was used by these tests.
- Backend TypeScript, frontend TypeScript and strict release/maintenance operations compilation: PASS. Broad operations: exactly the seven unrelated diagnostics above.
- Client production build: PASS; existing approximately 652 kB bundle-size warning remains nonblocking.
- Both original backup hashes/integrity/FKs: PASS. Backup-copy migrations/idempotency/corruption rejection: PASS. Owner read-only verification and media preservation: PASS.
- `git diff --check`: PASS. Only scoped source, tests and these operational documents belong in the checkpoint; all private owner evidence stays ignored.

Private current-run evidence lives under `.data/architecture-recovery-work/evidence/`; original maintenance evidence remains under `.data/owner-content-maintenance/2026-10-29T11-06-33-828Z-04c85afc-bef2-46ab-97f8-c6bfeb959874/`. The exact candidate preparation/manifest and final read-only readiness result must be checked after the local commit. No owner activation is part of this report.
