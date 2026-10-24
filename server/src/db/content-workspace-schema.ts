import type Database from 'better-sqlite3';

/** Additive workspace tables only. The owner database is never opened by a migration tool here. */
export function initializeContentWorkspaceSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS owner_voice_profiles (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id), profile_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS assistant_drafts (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), kind TEXT NOT NULL,
      content TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft', source TEXT NOT NULL, provider TEXT NOT NULL,
      context_json TEXT NOT NULL, flags_json TEXT NOT NULL DEFAULT '[]',
      approved_revision INTEGER, destination_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS content_workspace_audit (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, action TEXT NOT NULL,
      revision INTEGER, detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS content_operating_limits (
      id INTEGER PRIMARY KEY CHECK(id=1), paused INTEGER NOT NULL DEFAULT 0,
      max_batch_size INTEGER NOT NULL DEFAULT 5, daily_draft_limit INTEGER NOT NULL DEFAULT 30
    );
    INSERT OR IGNORE INTO content_operating_limits(id) VALUES (1);
    CREATE TABLE IF NOT EXISTS facebook_group_plans (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
      identity_type TEXT NOT NULL, account_id TEXT REFERENCES accounts(id), membership TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', rules TEXT NOT NULL DEFAULT '',
      rules_reviewed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS group_prepared_content (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES facebook_group_plans(id),
      kind TEXT NOT NULL, content TEXT NOT NULL, thread_url TEXT,
      status TEXT NOT NULL DEFAULT 'prepared', receipt_url TEXT, receipt_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_drafts_account ON assistant_drafts(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_audit_entity ON content_workspace_audit(entity_id, created_at);
  `);
}
