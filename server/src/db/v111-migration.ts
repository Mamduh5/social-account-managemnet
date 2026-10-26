import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { calendarSchemaReady, initializeCalendarSchema } from './calendar-schema.js';
import { generalPostsReady } from './general-posts-schema.js';

export interface TableProjection {
  name: string;
  columns: string[];
  count: number;
  sha256: string;
}
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const digestRows = (rows: unknown[]) => createHash('sha256').update(rows.map(row => JSON.stringify(row)).sort().join('\n')).digest('hex');

/** A secret-free receipt of every original column and row, independent of rowid. */
export function snapshotOriginalTables(database: Database.Database): TableProjection[] {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  return tables.map(({ name }) => {
    const columns = (database.prepare('PRAGMA table_info(' + quote(name) + ')').all() as { name: string }[]).map(column => column.name);
    const rows = database.prepare('SELECT ' + columns.map(quote).join(',') + ' FROM ' + quote(name)).all();
    return { name, columns, count: rows.length, sha256: digestRows(rows) };
  });
}

export function assertOriginalTablesPreserved(database: Database.Database, before: TableProjection[]): void {
  for (const table of before) {
    const rows = database.prepare('SELECT ' + table.columns.map(quote).join(',') + ' FROM ' + quote(table.name)).all();
    if (rows.length !== table.count || digestRows(rows) !== table.sha256) throw new Error('V1.11 migration changed original rows in ' + table.name);
  }
}
function assertIntegrity(database: Database.Database) {
  if (database.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Database integrity validation failed');
  if ((database.pragma('foreign_key_check') as unknown[]).length) throw new Error('Database foreign-key validation failed');
}
export interface V111MigrationResult {
  alreadyReady: boolean;
  calendarReady: boolean;
  integrity: 'ok';
  foreignKeyViolations: number;
  allOriginalRowsPreserved: true;
  originalTables: TableProjection[];
  protectedManualDestinationCount: number;
  campaignCount: number;
}

/** Explicit offline migration. Its caller owns backup, maintenance and deployment gates. */
export function migrateV111Database(database: Database.Database, validateBeforeCommit?: (database: Database.Database) => void): V111MigrationResult {
  if (database.inTransaction) throw new Error('V1.11 migration requires its own transaction');
  if (!generalPostsReady(database)) throw new Error('V1.10 general-post migration is required before V1.11');
  assertIntegrity(database);
  return database.transaction(() => {
    const before = snapshotOriginalTables(database);
    const alreadyReady = calendarSchemaReady(database);
    if (!alreadyReady) initializeCalendarSchema(database);
    validateBeforeCommit?.(database);
    assertOriginalTablesPreserved(database, before);
    if (!calendarSchemaReady(database)) throw new Error('V1.11 calendar schema is incomplete');
    const campaignCount = (database.prepare('SELECT count(*) n FROM publishing_campaigns').get() as { n: number }).n;
    if (!before.some(table => table.name === 'publishing_campaigns') && campaignCount !== 0) throw new Error('V1.11 migration must not create campaign content');
    assertIntegrity(database);
    return {
      alreadyReady, calendarReady: true, integrity: 'ok' as const,
      foreignKeyViolations: 0, allOriginalRowsPreserved: true as const, originalTables: before,
      protectedManualDestinationCount: (database.prepare("SELECT count(*) n FROM publishing_destinations WHERE status='awaiting_confirmation'").get() as { n: number }).n,
      campaignCount,
    };
  })();
}
