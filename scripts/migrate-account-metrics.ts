import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { inspectAccountMetricsMigration, migrateAccountMetricsNullability } from '../server/src/db/account-metrics-migration.js';

// No application imports, dotenv, worker startup or provider requests.
async function main(): Promise<void> {
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const databasePath = option('--database');
if (!databasePath) throw new Error('Specify --database <absolute SQLite path>. Default mode is read-only.');
if (!path.isAbsolute(databasePath)) throw new Error('--database must be absolute.');
const apply = args.includes('--apply');
// Even an apply invocation begins read-only. SQLite may recover journals when a
// writable database is opened, so defer that open until every maintenance guard
// and the consistent backup have passed.
const database = new Database(databasePath, { readonly: true, fileMustExist: true });
let writableDatabase: Database.Database | undefined;
try {
  const inspection = inspectAccountMetricsMigration(database);
  if (apply && inspection.required) {
    const observationPath = option('--observation');
    const backupPath = option('--backup');
    if (!observationPath || !backupPath || !path.isAbsolute(backupPath) || !args.includes('--backend-stopped') || !args.includes('--collector-finished')) {
      throw new Error('Apply requires --observation <collector JSON>, --backup <new absolute path>, --backend-stopped and --collector-finished after maintenance begins.');
    }
    const observation = JSON.parse(fs.readFileSync(observationPath, 'utf8'));
    if (!Number.isFinite(Date.parse(observation.observer?.stopAt)) || Date.now() <= Date.parse(observation.observer.stopAt)) {
      throw new Error('The protected live observation window has not finished.');
    }
    const assertProtectedProcessesStopped = () => {
      for (const pid of [observation.observer?.pid, observation.runtime?.pid]) {
        if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Observation is missing a valid protected process ID.');
        let running = false;
        try { process.kill(pid, 0); running = true; } catch (error: any) { if (error.code !== 'ESRCH') throw error; }
        if (running) throw new Error(`Protected process ${pid} is still running. No migration was performed.`);
      }
    };
    assertProtectedProcessesStopped();
    if (path.resolve(backupPath) === path.resolve(databasePath) || fs.existsSync(backupPath)) throw new Error('Backup path must be new and separate from the database.');
    await database.backup(backupPath);
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (backup.pragma('integrity_check', { simple: true }) !== 'ok' || inspectAccountMetricsMigration(backup).rowCount !== inspection.rowCount) {
        throw new Error('Backup verification failed. No migration was performed.');
      }
    } finally { backup.close(); }
    assertProtectedProcessesStopped();
    writableDatabase = new Database(databasePath, { fileMustExist: true });
    migrateAccountMetricsNullability(writableDatabase);
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'read-only', ...inspectAccountMetricsMigration(writableDatabase || database) }, null, 2));
} finally { writableDatabase?.close(); database.close(); }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
