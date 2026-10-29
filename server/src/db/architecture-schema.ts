import type Database from 'better-sqlite3';

const historyIndexes = {
  idx_dest_history_created:'CREATE INDEX idx_dest_history_created ON publishing_destinations(julianday(created_at) DESC, id DESC)',
  idx_dest_history_updated:'CREATE INDEX idx_dest_history_updated ON publishing_destinations(julianday(updated_at) DESC, id DESC)',
  idx_post_history_scheduled:'CREATE INDEX idx_post_history_scheduled ON publishing_posts(julianday(scheduled_at), id)',
};
const normalizedSql=(sql:string)=>sql.replace(/IF NOT EXISTS\s+/i,'').replace(/\s+/g,' ').trim().toLowerCase();

export function architectureSchemaReady(db: Database.Database): boolean {
  const columns = db.prepare('PRAGMA table_info(publishing_commands)').all() as { name: string; pk:number; notnull:number }[];
  return columns.some(column=>column.name==='command_id'&&column.pk===1) &&
    ['payload_hash', 'post_id', 'result_json', 'created_at'].every(name => columns.some(column => column.name === name && column.notnull===1)) &&
    Object.entries(historyIndexes).every(([name,sql])=>{
      const row=db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(name) as {sql:string}|undefined;
      return !!row && normalizedSql(row.sql)===normalizedSql(sql);
    });
}

/** Fresh databases or an explicitly rehearsed offline migration only. Never boot-migrate an owner DB. */
export function initializeArchitectureSchema(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS publishing_commands (
    command_id TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    post_id TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_dest_history_created ON publishing_destinations(julianday(created_at) DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_dest_history_updated ON publishing_destinations(julianday(updated_at) DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_post_history_scheduled ON publishing_posts(julianday(scheduled_at), id);
  `);
}

export function migrateArchitectureDatabase(db: Database.Database) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='publishing_destinations'").get()) throw new Error('An initialized SCC database is required.');
  return db.transaction(() => {
    initializeArchitectureSchema(db);
    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length || !architectureSchemaReady(db)) throw new Error('Architecture maintenance validation failed.');
    return { schemaReady: true, existingContentChanged: false, commandReceiptsCreated: 0 };
  })();
}
