import type Database from 'better-sqlite3';

export function generalPostsReady(db: Database.Database): boolean {
  const posts=db.prepare('PRAGMA table_info(publishing_posts)').all() as any[];
  const destinations=db.prepare('PRAGMA table_info(publishing_destinations)').all() as any[];
  return posts.some(c=>c.name==='content_type') && posts.some(c=>c.name==='video_id'&&!c.notnull)
    && ['content_type','link_url','submission_state','approval_draft_id','approval_revision'].every(n=>destinations.some(c=>c.name===n))
    && ['publishing_drafts','publishing_draft_audit','media_images','publishing_attachments'].every(name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

/** Called for a fresh database, or explicitly by the offline maintenance migration. */
export function initializeGeneralPublishingSchema(db: Database.Database) {
  const additions: Record<string, Record<string,string>> = {
    publishing_posts: { content_type: "TEXT NOT NULL DEFAULT 'reel'" },
    publishing_destinations: {content_type: "TEXT NOT NULL DEFAULT 'reel'", link_url:'TEXT', submission_state:'TEXT', approval_draft_id:'TEXT', approval_revision:'INTEGER'}
  };
  for (const [table, fields] of Object.entries(additions)) {
    const cols = new Set((db.prepare('PRAGMA table_info('+table+')').all() as any[]).map(c=>c.name));
    for (const [name, def] of Object.entries(fields)) if (!cols.has(name)) db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+def);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_images (
      id TEXT PRIMARY KEY, original_filename TEXT NOT NULL, file_path TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL, file_size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
      sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS publishing_drafts (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected','queued')),
      approved_revision INTEGER, approved_hash TEXT, queued_post_id TEXT REFERENCES publishing_posts(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS publishing_draft_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, draft_id TEXT NOT NULL REFERENCES publishing_drafts(id),
      revision INTEGER NOT NULL, action TEXT NOT NULL, payload_hash TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS publishing_attachments (
      destination_id TEXT NOT NULL REFERENCES publishing_destinations(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, media_id TEXT NOT NULL REFERENCES media_images(id), alt_text TEXT NOT NULL DEFAULT '',
      remote_id TEXT, upload_state TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY(destination_id,position)
    );
  `);
}

/** Offline only. The caller must provide a verified backup and a stopped instance. */
export function migrateGeneralPublishing(db: Database.Database, initializeWorkspace?: (database: Database.Database) => void) {
  if (db.inTransaction) throw new Error('Migration requires its own transaction');
  const priorForeignKeys = db.pragma('foreign_keys', {simple:true});
  const videoColumn = (db.prepare('PRAGMA table_info(publishing_posts)').all() as any[]).find(c=>c.name==='video_id');
  if (!videoColumn) throw new Error('Unknown publishing schema');
  const before = db.prepare('SELECT * FROM publishing_posts ORDER BY id').all();
  const destinations = db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all();
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(()=> {
      if (videoColumn.notnull) {
        const schema = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='publishing_posts'").get() as any).sql as string;
        const nextSchema = schema.replace(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"publishing_posts"|`publishing_posts`|\[publishing_posts\]|publishing_posts)(?=\s*\()/i,'CREATE TABLE publishing_posts_v110').replace(/video_id\s+TEXT\s+NOT NULL/i,'video_id TEXT');
        if (nextSchema === schema || /video_id\s+TEXT\s+NOT NULL/i.test(nextSchema)) throw new Error('Unsupported publishing schema');
        const auxiliary = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='publishing_posts' AND type IN ('index','trigger') AND sql IS NOT NULL").all() as any[];
        const cols = (db.prepare('PRAGMA table_info(publishing_posts)').all() as any[]).map(c=>'"'+c.name+'"').join(',');
        db.exec(nextSchema);
        db.exec('INSERT INTO publishing_posts_v110 ('+cols+') SELECT '+cols+' FROM publishing_posts');
        db.exec('DROP TABLE publishing_posts');
        db.exec('ALTER TABLE publishing_posts_v110 RENAME TO publishing_posts');
        for(const row of auxiliary) db.exec(row.sql);
      }
      initializeGeneralPublishingSchema(db);
      initializeWorkspace?.(db);
      const after = db.prepare('SELECT * FROM publishing_posts ORDER BY id').all() as any[];
      const originalKeys = Object.keys((before as any[])[0] || {});
      if (JSON.stringify(before) !== JSON.stringify(after.map(row=>Object.fromEntries(originalKeys.map(k=>[k,row[k]]))))) {
        if (before.length || after.length) throw new Error('Publication history changed');
      }
      const afterDests = db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all() as any[];
      const destKeys = Object.keys((destinations as any[])[0] || {});
      if (JSON.stringify(destinations) !== JSON.stringify(afterDests.map(row=>Object.fromEntries(destKeys.map(k=>[k,row[k]]))))) {
        if (destinations.length || afterDests.length) throw new Error('Destination history changed');
      }
      if ((db.pragma('foreign_key_check') as any[]).length) throw new Error('Foreign-key validation failed');
    })();
  } finally { db.pragma('foreign_keys = '+(priorForeignKeys ? 'ON':'OFF')); }
}
