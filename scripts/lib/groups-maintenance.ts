import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrateGroupsDatabase, groupsSchemaReady } from '../../server/src/db/groups-schema.js';
import { fingerprint } from './owner-runtime-core.js';
import type { OwnerReleaseManifest } from './owner-release-core.js';

const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
export interface TableFingerprint { name: string; columns: string[]; count: number; sha256: string }

/** Hash rows locally; never include row values, credentials or owner text in receipts. */
export function databaseFingerprints(database: Database.Database): TableFingerprint[] {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name: string}[];
  return tables.map(({name}) => {
    const columns = (database.prepare('PRAGMA table_info(' + quote(name) + ')').all() as {name: string}[]).map(column => column.name);
    const rows = database.prepare('SELECT * FROM ' + quote(name)).all();
    // Independent of rowid, including WITHOUT ROWID tables. Identical duplicate
    // rows retain their multiplicity in the sorted projection.
    const canonical = rows.map(row => JSON.stringify(row)).sort();
    return {name, columns, count: rows.length, sha256: fingerprint(JSON.stringify(canonical))};
  });
}

export function assertLegacyTablesPreserved(database: Database.Database, before: TableFingerprint[]) {
  const current = new Map(databaseFingerprints(database).map(table => [table.name, table]));
  for (const table of before) {
    if (JSON.stringify(current.get(table.name)) !== JSON.stringify(table)) {
      throw new Error('Original table changed during Groups migration: ' + table.name);
    }
  }
}

export function assertDatabaseIntegrity(database: Database.Database) {
  if (database.pragma('integrity_check', {simple: true}) !== 'ok' || (database.pragma('foreign_key_check') as unknown[]).length) {
    throw new Error('Database integrity or foreign-key validation failed');
  }
}

/** Dedicated Groups maintenance only; ordinary activation retains its stricter gate. */
export function assertGroupsMaintenanceRelease(previous: OwnerReleaseManifest, candidate: OwnerReleaseManifest) {
  const allowed = new Set(['server/src/db/groups-schema.ts', 'server/src/db/content-workspace-schema.ts', 'server/src/db/schema.ts']);
  const names = new Set([...Object.keys(previous.hashes), ...Object.keys(candidate.hashes)]);
  const changed = [...names].filter(name => name.startsWith('server/src/db/') && previous.hashes[name] !== candidate.hashes[name]);
  if (!candidate.hashes['server/src/db/groups-schema.ts'] || !candidate.hashes['server/src/domain/groups.ts'] || !changed.length || changed.some(name => !allowed.has(name))) {
    throw new Error('This maintenance supports only the reviewed additive Groups schema changes');
  }
}

/** Rehearsal artifacts must be copies in this workspace, never its original DB. */
export function groupsArtifactPath(workspace: string, input: string, existing: boolean) {
  const root = path.resolve(workspace, '.data', 'groups-maintenance');
  const absolute = path.resolve(input);
  const inside = (candidate: string) => {
    const relative = path.relative(root, candidate);
    return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  };
  if (!inside(absolute)) throw new Error('Groups migration artifacts must be inside .data/groups-maintenance');
  if (existing) {
    const actual = fs.realpathSync(absolute);
    if (!inside(actual) || fs.lstatSync(absolute).isSymbolicLink() || !fs.statSync(actual).isFile()) {
      throw new Error('Groups rehearsal source must be an ordinary isolated copy');
    }
    return actual;
  }
  if (fs.existsSync(absolute)) throw new Error('Groups artifact already exists; existing files are never replaced');
  let ancestor = path.dirname(absolute);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const resolved = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute));
  if (!inside(resolved)) throw new Error('Groups artifact resolves outside its private directory');
  return absolute;
}

/** Operates only on a disposable copy supplied by the rehearsal command/tests. */
export function migrateCheckedGroupsDatabase(database: Database.Database) {
  assertDatabaseIntegrity(database);
  const before = databaseFingerprints(database);
  // The migration is atomic; preservation failure must roll back its DDL and seeds.
  const migration = migrateGroupsDatabase(database, () => assertLegacyTablesPreserved(database, before));
  assertDatabaseIntegrity(database);
  assertLegacyTablesPreserved(database, before);
  if (!groupsSchemaReady(database)) throw new Error('Groups schema validation failed after migration');
  return {migration, originalTables: before, originalTablesUnchanged: true, integrity: 'ok', foreignKeyViolations: 0};
}
