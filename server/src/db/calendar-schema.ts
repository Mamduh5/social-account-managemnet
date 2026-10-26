import type Database from 'better-sqlite3';

/** Read-only readiness check; startup never repairs an existing owner schema. */
export function calendarSchemaReady(db: Database.Database): boolean {
  const required: Record<string, string[]> = {
    publishing_campaigns: ['id', 'account_id', 'name', 'editorial_scope', 'start_date', 'end_date', 'days', 'max_publications', 'status', 'origin', 'approved_revision', 'approved_hash', 'approved_at', 'created_at', 'updated_at'],
    publishing_drafts: ['campaign_id', 'origin'],
    publishing_posts: ['campaign_id', 'origin'],
    publishing_destinations: ['campaign_id', 'origin'],
  };
  for (const [table, columns] of Object.entries(required)) {
    const actual = new Set((db.prepare('PRAGMA table_info("' + table + '")').all() as { name: string }[]).map(column => column.name));
    if (!columns.every(column => actual.has(column))) return false;
  }
  return ['idx_campaigns_account', 'idx_campaigns_status', 'idx_posts_campaign', 'idx_dest_campaign', 'idx_drafts_campaign']
    .every(name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name));
}

export function initializeCalendarSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS publishing_campaigns (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      name TEXT NOT NULL,
      editorial_scope TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER NOT NULL DEFAULT 7,
      max_publications INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'awaiting_approval', 'approved', 'active', 'paused', 'completed', 'cancelled')),
      origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual', 'gemini_prepared')),
      approved_revision INTEGER,
      approved_hash TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_account ON publishing_campaigns(account_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON publishing_campaigns(status);
  `);

  // Additive columns for publishing_drafts, publishing_posts, publishing_destinations
  const draftCols = new Set((db.prepare('PRAGMA table_info(publishing_drafts)').all() as any[]).map(c => c.name));
  if (!draftCols.has('campaign_id')) db.exec('ALTER TABLE publishing_drafts ADD COLUMN campaign_id TEXT REFERENCES publishing_campaigns(id)');
  if (!draftCols.has('origin')) db.exec("ALTER TABLE publishing_drafts ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'");

  const postCols = new Set((db.prepare('PRAGMA table_info(publishing_posts)').all() as any[]).map(c => c.name));
  if (!postCols.has('campaign_id')) db.exec('ALTER TABLE publishing_posts ADD COLUMN campaign_id TEXT REFERENCES publishing_campaigns(id)');
  if (!postCols.has('origin')) db.exec("ALTER TABLE publishing_posts ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'");

  const destCols = new Set((db.prepare('PRAGMA table_info(publishing_destinations)').all() as any[]).map(c => c.name));
  if (!destCols.has('campaign_id')) db.exec('ALTER TABLE publishing_destinations ADD COLUMN campaign_id TEXT REFERENCES publishing_campaigns(id)');
  if (!destCols.has('origin')) db.exec("ALTER TABLE publishing_destinations ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posts_campaign ON publishing_posts(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_dest_campaign ON publishing_destinations(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_campaign ON publishing_drafts(campaign_id);
  `);
}
