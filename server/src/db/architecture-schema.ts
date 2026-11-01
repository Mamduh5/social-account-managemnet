import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

const commandTable = `CREATE TABLE publishing_commands (
    command_id TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    post_id TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;
const historyIndexes = {
  idx_dest_history_created:'CREATE INDEX idx_dest_history_created ON publishing_destinations(julianday(created_at) DESC, id DESC)',
  idx_dest_history_updated:'CREATE INDEX idx_dest_history_updated ON publishing_destinations(julianday(updated_at) DESC, id DESC)',
  idx_post_history_scheduled:'CREATE INDEX idx_post_history_scheduled ON publishing_posts(julianday(scheduled_at), id)',
};
const normalizedSql=(sql:string)=>sql.replace(/IF NOT EXISTS\s+/i,'').replace(/\s+/g,' ').trim().toLowerCase();
const expectedObjects: Record<string, {type:string; tbl_name:string; sql:string}> = {
  publishing_commands: {type:'table',tbl_name:'publishing_commands',sql:commandTable},
  ...Object.fromEntries(Object.entries(historyIndexes).map(([name,sql])=>[name,{type:'index',tbl_name:name.startsWith('idx_dest_')?'publishing_destinations':'publishing_posts',sql}])),
};
const digest = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote = (name:string) => '"'+name.replaceAll('"','""')+'"';

/** Read-only inventory. Hashes include every original record, including encrypted credentials and receipts. */
export function captureArchitectureDatabase(db:Database.Database) {
  if(db.pragma('integrity_check',{simple:true})!=='ok'||(db.pragma('foreign_key_check') as unknown[]).length)throw new Error('SQLite integrity or foreign-key verification failed');
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all() as {type:string;name:string;tbl_name:string;sql:string}[];
  const tables=Object.fromEntries(schema.filter(object=>object.type==='table').map(({name})=>{
    const rows=db.prepare('SELECT * FROM '+quote(name)+' ORDER BY rowid').all();
    return [name,{count:rows.length,hash:digest(rows),columns:digest(db.prepare('PRAGMA table_xinfo('+quote(name)+')').all())}];
  }));
  return {schema,tables};
}

/** Permit only the exact command table (empty when newly added) and three History indexes. */
export function verifyArchitectureMigration(before:ReturnType<typeof captureArchitectureDatabase>,db:Database.Database) {
  const after=captureArchitectureDatabase(db);
  for(const original of before.schema){
    const current=after.schema.find(object=>object.type===original.type&&object.name===original.name);
    if(JSON.stringify(current)!==JSON.stringify(original))throw new Error('Original schema object changed: '+original.name);
  }
  for(const object of after.schema){
    if(before.schema.some(original=>original.type===object.type&&original.name===object.name))continue;
    const expected=expectedObjects[object.name];
    if(!expected||expected.type!==object.type||expected.tbl_name!==object.tbl_name||normalizedSql(expected.sql)!==normalizedSql(object.sql))throw new Error('Unexpected additive schema object: '+object.name);
    if(object.type==='table'&&after.tables[object.name].count!==0)throw new Error('New command table must be empty');
  }
  for(const [name,original] of Object.entries(before.tables)){
    if(JSON.stringify(after.tables[name])!==JSON.stringify(original))throw new Error('Original records or columns changed: '+name);
  }
  if(!architectureSchemaReady(db))throw new Error('Architecture schema prerequisites differ');
  return {existingTablesVerified:Object.keys(before.tables).length,schemaReady:true as const,existingContentChanged:false as const};
}

export function architectureSchemaReady(db: Database.Database): boolean {
  return Object.entries(expectedObjects).every(([name,expected])=>{
      const row=db.prepare('SELECT type,tbl_name,sql FROM sqlite_master WHERE name=?').get(name) as {type:string;tbl_name:string;sql:string}|undefined;
      return !!row && row.type===expected.type && row.tbl_name===expected.tbl_name && normalizedSql(row.sql)===normalizedSql(expected.sql);
    });
}

/** Fresh databases or an explicitly rehearsed offline migration only. Never boot-migrate an owner DB. */
export function initializeArchitectureSchema(db: Database.Database) {
  for(const {sql} of Object.values(expectedObjects))db.exec(sql.replace(/^CREATE (TABLE|INDEX) /,'CREATE $1 IF NOT EXISTS '));
}

export function migrateArchitectureDatabase(db: Database.Database) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='publishing_destinations'").get()) throw new Error('An initialized SCC database is required.');
  return db.transaction(() => {
    const before=captureArchitectureDatabase(db);
    initializeArchitectureSchema(db);
    verifyArchitectureMigration(before,db);
    return { schemaReady: true, existingContentChanged: false, commandReceiptsCreated: 0 };
  })();
}
