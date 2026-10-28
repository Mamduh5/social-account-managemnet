import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { groupsArtifactPath, databaseFingerprints, assertLegacyTablesPreserved, migrateCheckedGroupsDatabase, type TableFingerprint } from './lib/groups-maintenance.js';
import { fingerprint, privateDirectory, redactRuntimeLog } from './lib/owner-runtime-core.js';

export const groupsMigrationSourceFiles = [
  'server/src/domain/groups.ts',
  'server/src/db/groups-schema.ts',
  'server/src/db/content-workspace-schema.ts',
  'server/src/db/v111-migration.ts',
  'server/src/db/calendar-schema.ts',
  'server/src/db/general-posts-schema.ts',
  'scripts/lib/groups-maintenance.ts',
  'scripts/lib/owner-runtime-core.ts',
  'scripts/prepare-groups-migration.ts',
] as const;
const help = 'Copy-only Groups rehearsal: node --import tsx scripts/prepare-groups-migration.ts [--workspace WORKSPACE] --source .data/groups-maintenance/INPUT.db --target .data/groups-maintenance/NEW.db --report .data/groups-maintenance/NEW.json\nAll three artifact paths are required. The source must already be a disposable copy. --workspace selects artifact storage only; migration code and hashes always come from this script\'s own source root. No owner configuration, live migration, activation or in-place replacement is supported.';
export interface GroupsPreparationOptions { workspaceRoot: string; source: string; target: string; report: string }

export function parseGroupsPreparationArguments(args: string[], workspaceRoot = path.resolve(__dirname, '..')): GroupsPreparationOptions | null {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return null;
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--workspace', '--source', '--target', '--report'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options.has(args[i])) throw new Error('Provide --source PATH --target NEW_PATH --report NEW_JSON and optional --workspace PATH; live apply is unavailable');
    options.set(args[i], args[i + 1]);
  }
  if (!['--source', '--target', '--report'].every(name => options.has(name))) throw new Error('Provide all of --source, --target and --report; no defaults open the owner database');
  return { workspaceRoot: options.get('--workspace') || workspaceRoot, source: options.get('--source')!, target: options.get('--target')!, report: options.get('--report')! };
}

const hashFile = (file: string) => fingerprint(fs.readFileSync(file));
const samePath = (first: string, second: string) => process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;

/** Rehearse only on an already isolated copy; importing this module performs no I/O. */
export async function prepareGroupsMigration(options: GroupsPreparationOptions) {
  const workspaceRoot = fs.realpathSync(path.resolve(options.workspaceRoot));
  // An artifact workspace cannot choose code. Frozen-release invocation binds its own exact bytes.
  const sourceRoot = fs.realpathSync(path.resolve(__dirname, '..'));
  const fromWorkspace = (input: string) => path.resolve(workspaceRoot, input);
  const sourcePath = groupsArtifactPath(workspaceRoot, fromWorkspace(options.source), true);
  const targetPath = groupsArtifactPath(workspaceRoot, fromWorkspace(options.target), false);
  const reportPath = groupsArtifactPath(workspaceRoot, fromWorkspace(options.report), false);
  if (samePath(sourcePath, targetPath) || samePath(sourcePath, reportPath) || samePath(targetPath, reportPath)) throw new Error('Source, new target and new report must be different files');
  const migrationSourceHashes: Record<string, string> = {};
  for (const name of groupsMigrationSourceFiles) migrationSourceHashes[name] = hashFile(path.join(sourceRoot, name));
  const migrationSourceFingerprint = fingerprint(JSON.stringify(migrationSourceHashes));
  const sourceSha256 = hashFile(sourcePath);
  const reserved: string[] = [];
  const reserve = (file: string) => {
    privateDirectory(path.dirname(file));
    groupsArtifactPath(workspaceRoot, file, false);
    const descriptor = fs.openSync(file, 'wx'); fs.closeSync(descriptor); reserved.push(file);
  };
  let source: Database.Database | undefined;
  try {
    // Reserve every new artifact before opening any database. Existing files are never replaced.
    reserve(targetPath); reserve(reportPath);
    source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    const originalSourceTables: TableFingerprint[] = databaseFingerprints(source);
    await source.backup(targetPath);
    const copy = new Database(targetPath, { fileMustExist: true });
    let checked: ReturnType<typeof migrateCheckedGroupsDatabase>;
    try {
      copy.pragma('foreign_keys=ON'); copy.pragma('journal_mode=DELETE');
      assertLegacyTablesPreserved(copy, originalSourceTables);
      checked = migrateCheckedGroupsDatabase(copy);
    } finally { copy.close(); }
    // A changed isolated input invalidates the rehearsal, including changes still held in WAL.
    if (JSON.stringify(databaseFingerprints(source)) !== JSON.stringify(originalSourceTables)) throw new Error('Groups rehearsal source changed during preparation');
    if (hashFile(sourcePath) !== sourceSha256) throw new Error('Groups rehearsal source changed during preparation');
    for (const name of groupsMigrationSourceFiles) if (hashFile(path.join(sourceRoot, name)) !== migrationSourceHashes[name]) throw new Error('Groups migration source changed during preparation');
    const report = { version: 1, kind: 'groups_migration_rehearsal', createdAt: new Date().toISOString(), workspaceRoot, sourceRoot,
      sourcePath, targetPath, sourceReadOnly: true, sourceReplaced: false, liveApplyPerformed: false,
      sourceSha256, targetSha256: hashFile(targetPath), migrationSourceHashes, migrationSourceFingerprint, ...checked };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    // Only these just-created disposable output files are eligible for cleanup.
    for (const file of reserved.reverse()) fs.rmSync(file, { force: true });
    throw error;
  } finally { source?.close(); }
}

async function main() {
  const options = parseGroupsPreparationArguments(process.argv.slice(2));
  if (!options) { console.log(help); return; }
  console.log(JSON.stringify(await prepareGroupsMigration(options), null, 2));
}
if (require.main === module) void main().catch(error => { console.error(redactRuntimeLog(error.message)); process.exitCode = 1; });
