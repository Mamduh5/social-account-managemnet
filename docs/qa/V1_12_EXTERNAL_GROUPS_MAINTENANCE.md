# V1.12 external Groups: explicit owner maintenance

27 October 2026. **Procedure prepared only. No production migration, release preparation, activation, stop/start, or Facebook action was performed for this implementation.**

The source baseline is `a425c1ac1b6c65c0013babc334ade3a73e9669b4`. The implementation was uncommitted when this procedure was prepared. The owner's subsequent 28 October authorization covers a local Git checkpoint only. The commands below remain for a later, separately approved maintenance window; they must not be run as part of source review or checkpoint creation.

## Corrected source checkpoint status — 28 October 2026

The [implementation report's correction record](V1_12_EXTERNAL_GROUPS_IMPLEMENTATION.md#authorized-blocker-corrections--28-october-2026) documents F1–F3, their regression evidence and the freshly rerun 183/183 offline tests. Reply receipts now require a distinct resulting comment/reply; identity changes clear context-dependent approval data; delayed responses preserve newer edits. These source corrections do not migrate or activate the owner.

F4 remains a known backward-compatibility risk: supported legacy callers omit revisions, so mandatory enforcement is deferred to a separately scoped caller/contract migration. The broader operations TypeScript check still has seven pre-existing diagnostics in six unchanged scripts; server, client and focused correction checks pass. Production database compatibility/migration, concrete Windows maintenance and recovery, owner browser visual acceptance and live Facebook acceptance remain pending. The mocked, network-blocked component checks do not satisfy those gates. A local source commit does not authorize any command below.

## Contract and prerequisites

Ordinary `owner:update -- --apply` and `owner:rollback -- --apply` still compare every `server/src/db/` hash and reject this cross-schema update. Do not edit manifests, disable that check, replace a pinned bundle, use `--configure-owner`, or point the owner at a review database.

The dedicated `apply-groups-maintenance.ts` command is a separate migration and promotion operation. It requires an exact current revision, a clean committed candidate, its verified immutable bundle and preparation receipt, and a successful disposable-copy rehearsal executed with that bundle's migration code. It never builds, stops, starts, restores a database, or calls a provider. It reserves owner ports only during the approved maintenance execution; its offline tests use injected operations and start no listeners.

The owner must separately approve the local checkpoint, release preparation/build, maintenance (including graceful shutdown, backup, original-database migration and pointer promotion), and subsequent startup/visual verification. Publishing, membership requests, connected-account changes and other Facebook actions require their own explicit approval.

Required gates before maintenance:

- Review the diff, offline results and [implementation report](V1_12_EXTERNAL_GROUPS_IMPLEMENTATION.md), then create the separately approved local Git checkpoint. No commit is supplied by this assignment.
- Use installed dependencies; do not introduce an install or dependency upgrade into maintenance. Server and client no-emit checks must pass. Seven existing diagnostic-script errors in the broader operations check remain documented separately; they are not a runtime build requirement.
- Confirm the three existing protected manual destinations remain exactly `dest-mvf5hdwf-19hi`, `dest-mvf5j24q-ub0y`, `dest-mvf5j24r-rw4x`. The maintenance tool checks this and fails closed if the owner has changed them; reconcile/review any legitimate change rather than editing the guard.
- Establish an idle publishing and synchronization boundary. In-flight, overdue, uncertain-submission or unfinished-sync work blocks maintenance. Do not reset or replay jobs to clear a blocker.
- Preserve the original `.env`, token encryption key, provider configuration, `.data/certs`, original database and existing release bundles. No OAuth/session reconfiguration is involved.

## Exact later procedure

Run in PowerShell at the original project root. Stop at any failed command; do not continue to a later step. Commands here are instructions, not evidence that deployment has occurred.

### 1. Prepare an immutable candidate after checkpoint approval

```powershell
Set-Location -LiteralPath 'D:\Mamduh\Personal\social-account-managemnet'
$groupsWorkspace = (Get-Location).Path
$groupsCandidate = (git rev-parse HEAD).Trim()
git status --short
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node client/node_modules/typescript/bin/tsc --noEmit --incremental false -p client/tsconfig.app.json
npm run owner:update -- --revision $groupsCandidate
```

`owner:update` with no `--apply` prepares or verifies a separate immutable release and leaves the running owner alone. Record the exact `receiptFile` printed by this command; set it below. Do not pick an unrelated preparation receipt or run ordinary activation.

```powershell
$groupsPreparation = 'ABSOLUTE_RECEIPT_FILE_PRINTED_ABOVE'
$groupsPrepared = Get-Content -LiteralPath $groupsPreparation -Raw | ConvertFrom-Json
$groupsCurrentRevision = $groupsPrepared.previousRevision
$groupsReleaseRoot = $groupsPrepared.candidateConfiguration.releaseRoot
if ($groupsPrepared.revision -ne $groupsCandidate) { throw 'Wrong preparation receipt' }
```

### 2. Gracefully stop only during the approved maintenance window

```powershell
npm run owner:stop
if ($LASTEXITCODE -ne 0) { throw 'Owner stop failed; investigate without forcing termination' }
```

This uses the managed idle-only stop. The dedicated apply command later checks process identities, takes owned update/maintenance markers, and reserves 3001/3443 before it can write to the original database. It fails if another owner/proxy is present. Do not run a development watcher or another review server on these ports.

### 3. Make a WAL-safe isolated rehearsal input

This explicit backup command opens the configured original database read-only and uses SQLite's backup API. It does not copy a bare database file while omitting WAL, checkpoint the owner, or replace the owner with a review copy. Artifact storage uses the existing current-user private-directory helper. The copied database contains private data and stays ignored under `.data`.

```powershell
$groupsRun = Join-Path $groupsWorkspace ('.data\groups-maintenance\review-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '-' + [Guid]::NewGuid().ToString('N'))
$groupsSourceCopy = Join-Path $groupsRun 'isolated-source.db'
@'
const fs=require('node:fs'), path=require('node:path'), Database=require('better-sqlite3');
const {readJson,validateOwnerConfiguration,privateDirectory}=require('./scripts/lib/owner-runtime-core.ts');
(async()=>{
  const root=process.cwd(), config=readJson(path.join(root,'.data/runtime/owner-config.json'));
  validateOwnerConfiguration(config);
  if(config.workspaceRoot!==root) throw Error('Wrong workspace');
  const target=path.resolve(process.argv[2]);
  const {groupsArtifactPath,assertDatabaseIntegrity}=require('./scripts/lib/groups-maintenance.ts');
  groupsArtifactPath(root,target,false); privateDirectory(path.dirname(target));
  const fd=fs.openSync(target,'wx'); fs.closeSync(fd);
  const source=new Database(path.join(config.dataDir,'social_command_center.db'),{readonly:true,fileMustExist:true});
  try{assertDatabaseIntegrity(source);await source.backup(target);}finally{source.close();}
  const saved=new Database(target,{readonly:true,fileMustExist:true});
  try{assertDatabaseIntegrity(saved);}finally{saved.close();}
  console.log('Isolated rehearsal backup created; owner database was not replaced.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
'@ | node --import tsx - $groupsSourceCopy
if ($LASTEXITCODE -ne 0) { throw 'Rehearsal backup failed; do not continue' }
```

### 4. Rehearse using the exact frozen candidate code

```powershell
$groupsRehearsal = Join-Path $groupsRun 'rehearsal.json'
node --import tsx (Join-Path $groupsReleaseRoot 'scripts\prepare-groups-migration.ts') --workspace $groupsWorkspace --source $groupsSourceCopy --target (Join-Path $groupsRun 'prepared.db') --report $groupsRehearsal
if ($LASTEXITCODE -ne 0) { throw 'Migration rehearsal failed; do not continue' }
```

Review `originalTablesUnchanged:true`, `integrity:ok`, `foreignKeyViolations:0`, `migration.groupsReady:true`, and any nonzero `legacyDuplicateCount`/`legacyUnresolvedIdentityCount`. The source remains unmigrated. Repeat tests use new target/report names; existing artifacts are never overwritten. `--workspace` chooses artifact storage only, while migration code and its nine source hashes come from the frozen candidate. This avoids working-tree line-ending differences weakening or breaking provenance.

### 5. Explicit original-database migration and release promotion

After the owner has reviewed the candidate and rehearsal and explicitly approved migration/promotion:

```powershell
node --import tsx scripts/apply-groups-maintenance.ts --apply --expect-current $groupsCurrentRevision --preparation $groupsPreparation --rehearsal $groupsRehearsal
if ($LASTEXITCODE -ne 0) { throw 'Maintenance failed; inspect its private recovery receipt before any startup' }
```

The command re-verifies committed source, both release manifests, the preparation/base configuration, every required rehearsal input hash, the rehearsed database hash/schema/integrity, and protected runtime paths. Its separate schema allowance is limited to the reviewed Groups schema files; changes to other database sources require a new maintenance review. The ordinary updater's gate remains unchanged.

Under owned exclusion and reserved ports, it makes a **fresh** WAL-safe backup of the then-current original database in a new `.data/groups-maintenance/apply-*/` directory. It checks integrity/foreign keys, exact protected holds, uncertain work and sync state, and compares every original table's columns, row count and sorted row hash. It applies the additive migration atomically to the original database, validates original-table preservation and Group readiness, records the result, then atomically changes only `releaseRoot`, `releaseRevision` and `clientDist`. An already enabled owned Startup entry is refreshed; a disabled entry stays disabled. The old configuration, Startup contents, bundles and backup survive.

The prepared/rehearsed copy is **never** copied over production. The original `.env`, provider configuration and TLS certificate bytes are hash-checked without printing secrets. No account token, permission, publication, schedule or persistent media is rewritten by the migration. It does not start the application or mark live acceptance passed.

### 6. Separate startup and owner acceptance

Only after the successful maintenance receipt and separate startup approval:

```powershell
npm run owner:start
npm run owner:status
```

Owner-controlled browser checks then follow the implementation report's acceptance checklist. New native Group search/open buttons are explicit user actions; do not use them for joining or posting without separate authorization.

## Rollback and failure recovery

- Before original-database migration begins, a failed preflight/backup leaves the original pointer/database intact and releases only owned maintenance markers. Fix the cause and prepare/rehearse again as needed. Preserve failed artifacts for diagnosis.
- After migration is attempted, any error retains the owned maintenance markers and records `owner_recovery_required`; cleanup failures also report retained exclusion. Do not delete markers or start either release just to get past this state. Review the private `maintenance.json`, `backup.json`, previous owner configuration/Startup files and process/port ownership first. A failure receipt may be unavailable if storage itself failed; the retained markers still block managed startup.
- Do not run ordinary rollback across this database-source boundary: it remains intentionally blocked. A source-only rollback is not promised after new membership states/history have been written. Older code does not understand the new lifecycle or append-only receipt presentation.
- If migration committed but promotion or Startup refresh failed, prefer completing the already verified candidate promotion under a separately reviewed recovery operation while keeping the original database. Do not replay the migration or restore a stale backup automatically.
- A full pre-maintenance restore is a separate owner-approved recovery: keep all processes stopped, preserve the current database **and WAL/SHM** plus all later observations, verify the backup/integrity, reconcile any post-backup writes, and restore the matching old pointer/Startup/database together. This document deliberately provides no one-line destructive restore command. Never overwrite newer owner observations with a rehearsal copy.

No production maintenance or rollback was exercised in this implementation. Disposable migration/restart fixtures and injected maintenance orchestration tests are source-level evidence; Windows process shutdown, port reservation, filesystem promotion, Startup refresh, live database compatibility and browser appearance remain owner-controlled deployment acceptance gates.
