import type Database from 'better-sqlite3';

const numericColumns = ['views', 'likes', 'comments', 'shares', 'followers_total', 'followers_gain', 'watch_time_seconds', 'engagement_rate'];

export function inspectAccountMetricsMigration(database: Database.Database) {
  const columns = database.prepare('PRAGMA table_info(analytics_snapshots)').all() as any[];
  if (!columns.length) throw new Error('analytics_snapshots does not exist. Initialize a new isolated database instead.');
  return {
    required: columns.some((column) => numericColumns.includes(column.name) && column.notnull) ||
      !columns.some((column) => column.name === 'metric_contract_version') ||
      !columns.some((column) => column.name === 'following_total'),
    rowCount: (database.prepare('SELECT count(*) AS count FROM analytics_snapshots').get() as any).count as number,
    // Candidate identification is reliable; original field presence for followers
    // and likes is not. Never turn this candidate list into a destructive UPDATE.
    historicalCandidates: database.prepare(`SELECT id, account_id, observed_at, source,
      followers_total, likes, views, comments, shares, provenance_status
      FROM analytics_snapshots WHERE source IN ('tiktok_display_api', 'meta_graph_api')
      ${columns.some((column) => column.name === 'metric_contract_version') ? 'AND metric_contract_version IS NULL' : ''}
      ORDER BY observed_at, id`).all(),
  };
}

// Explicit maintenance only. Nothing calls this function during server startup.
// Existing rows, notes, sources, timestamps, indexes and triggers survive unchanged.
export function migrateAccountMetricsNullability(database: Database.Database): boolean {
  if (!inspectAccountMetricsMigration(database).required) return false;
  if (database.inTransaction) throw new Error('Migration requires its own maintenance transaction.');
  const columns = database.prepare('PRAGMA table_info(analytics_snapshots)').all() as any[];
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as any[];
  for (const table of tables) {
    const foreignKeys = database.prepare(`PRAGMA foreign_key_list("${table.name.replaceAll('"', '""')}")`).all() as any[];
    if (foreignKeys.some((key) => key.table === 'analytics_snapshots')) {
      throw new Error('Unexpected foreign key references analytics_snapshots; review the migration before applying.');
    }
  }
  const original = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'analytics_snapshots'").get() as any;
  let sql = original.sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?analytics_snapshots["`\]]?/i, 'CREATE TABLE analytics_snapshots_v19_nullable');
  for (const column of numericColumns) {
    sql = sql.replace(new RegExp(`(\\b${column}\\s+(?:INTEGER|REAL))\\s+NOT\\s+NULL(?:\\s+DEFAULT\\s+[0-9.]+)?`, 'i'), '$1');
  }
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('following_total')) sql = sql.replace(/\)\s*$/, ', following_total INTEGER)');
  if (!names.has('metric_contract_version')) sql = sql.replace(/\)\s*$/, ', metric_contract_version INTEGER)');
  const dependents = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'analytics_snapshots' AND type IN ('index', 'trigger') AND sql IS NOT NULL").all() as any[];
  const quotedColumns = columns.map((column) => `"${column.name.replaceAll('"', '""')}"`).join(', ');
  database.transaction(() => {
    database.exec(sql);
    database.exec(`INSERT INTO analytics_snapshots_v19_nullable (${quotedColumns}) SELECT ${quotedColumns} FROM analytics_snapshots`);
    database.exec('DROP TABLE analytics_snapshots');
    database.exec('ALTER TABLE analytics_snapshots_v19_nullable RENAME TO analytics_snapshots');
    for (const dependent of dependents) database.exec(dependent.sql);
    if ((database.pragma('foreign_key_check') as any[]).length) throw new Error('Foreign key verification failed; migration rolled back.');
    if (inspectAccountMetricsMigration(database).required) throw new Error('Unexpected historical schema; migration rolled back.');
  }).immediate();
  return true;
}
