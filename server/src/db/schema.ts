import { db } from './database.js';

export function initializeDatabase() {
  db.exec(`
    -- Categories
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#6366F1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Accounts
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      platform TEXT NOT NULL CHECK(platform IN ('facebook', 'tiktok')),
      account_type TEXT NOT NULL DEFAULT 'page' CHECK(account_type IN ('page', 'personal', 'business')),
      name TEXT NOT NULL,
      handle TEXT NOT NULL,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected', 'expired', 'failed', 'disconnected')),
      connector_mode TEXT NOT NULL DEFAULT 'simulator' CHECK(connector_mode IN ('official_api', 'browser_bridge', 'simulator')),
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TEXT,
      external_id TEXT,
      settings_json TEXT DEFAULT '{}',
      brand_kit_json TEXT DEFAULT '{}',
      last_health_check TEXT,
      health_status TEXT DEFAULT 'Healthy',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Videos Library
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('manual_upload', 'pipeline_import', 'webhook')),
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      duration REAL DEFAULT 0,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      aspect_ratio TEXT DEFAULT '9:16',
      thumbnail_path TEXT,
      pipeline_job_id TEXT,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Branded Video Variants (Preserves master video immutability)
    CREATE TABLE IF NOT EXISTS branded_videos (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      preset_name TEXT NOT NULL,
      movement_preset TEXT NOT NULL,
      watermark_text TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      duration REAL DEFAULT 0,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      aspect_ratio TEXT DEFAULT '9:16',
      thumbnail_path TEXT,
      brand_kit_json TEXT NOT NULL DEFAULT '{}',
      sha256 TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Publishing Posts (Group of multi-destination publishing)
    CREATE TABLE IF NOT EXISTS publishing_posts (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      scheduled_at TEXT,
      timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'processing', 'completed', 'partial_failure', 'failed', 'cancelled')),
      selected_variant_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Publishing Destinations (Per-Account Target with Independent Status)
    CREATE TABLE IF NOT EXISTS publishing_destinations (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES publishing_posts(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      caption TEXT NOT NULL,
      hashtags TEXT NOT NULL DEFAULT '',
      apply_branding INTEGER NOT NULL DEFAULT 1,
      branding_override_json TEXT,
      branded_video_path TEXT,
      selected_variant_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'preparing', 'branding', 'uploading', 'awaiting_confirmation', 'published', 'failed', 'cancelled')),
      progress INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      remote_post_id TEXT,
      remote_post_url TEXT,
      published_at TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK(verification_status IN ('unverified', 'confirmed', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Engagement Comments
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      destination_id TEXT REFERENCES publishing_destinations(id) ON DELETE SET NULL,
      platform TEXT NOT NULL CHECK(platform IN ('facebook', 'tiktok')),
      external_comment_id TEXT NOT NULL,
      parent_comment_id TEXT,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      author_id TEXT,
      content TEXT NOT NULL,
      created_time TEXT NOT NULL,
      like_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'pending', 'handled', 'hidden')),
      awaiting_reply INTEGER NOT NULL DEFAULT 1,
      has_replied INTEGER NOT NULL DEFAULT 0,
      reply_text TEXT,
      video_title TEXT,
      native_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Activity & Notifications
    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'success', 'warning', 'error')),
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Analytics Snapshots
    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      followers_total INTEGER NOT NULL DEFAULT 0,
      followers_gain INTEGER NOT NULL DEFAULT 0,
      watch_time_seconds INTEGER NOT NULL DEFAULT 0,
      engagement_rate REAL NOT NULL DEFAULT 0.0,
      is_simulated INTEGER NOT NULL DEFAULT 1
    );

    -- Application Settings
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_accounts_category ON accounts(category_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
    CREATE INDEX IF NOT EXISTS idx_pub_dest_post ON publishing_destinations(post_id);
    CREATE INDEX IF NOT EXISTS idx_pub_dest_account ON publishing_destinations(account_id);
    CREATE INDEX IF NOT EXISTS idx_pub_dest_status ON publishing_destinations(status);
    CREATE INDEX IF NOT EXISTS idx_comments_account ON comments(account_id);
    CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
    CREATE INDEX IF NOT EXISTS idx_comments_awaiting ON comments(awaiting_reply);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_account_date ON analytics_snapshots(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_branded_videos_vid ON branded_videos(video_id);
  `);

  // Additive V1.2 migration: never rebuild accounts or cascade historical records.
  const columns = new Set((db.prepare('PRAGMA table_info(accounts)').all() as any[]).map(c => c.name));
  const additions: Record<string, string> = {
    public_url: "TEXT NOT NULL DEFAULT ''", description: "TEXT NOT NULL DEFAULT ''",
    notes: "TEXT NOT NULL DEFAULT ''", is_demo: 'INTEGER NOT NULL DEFAULT 0', archived_at: 'TEXT',
    identity_verified_at: 'TEXT', connection_status: "TEXT NOT NULL DEFAULT 'registered'",
    granted_scopes_json: "TEXT NOT NULL DEFAULT '[]'", connection_revision: 'INTEGER NOT NULL DEFAULT 0',
    refresh_expires_at: 'TEXT'
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns.has(name)) db.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${definition}`);
  }
  if (!columns.has('is_demo')) db.exec("UPDATE accounts SET is_demo = 1 WHERE connector_mode = 'simulator'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_identities (
      platform TEXT NOT NULL, identity_key TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id), PRIMARY KEY(platform, identity_key)
    );
    CREATE TABLE IF NOT EXISTS oauth_sessions (
      state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
      revision INTEGER NOT NULL, expires_at INTEGER NOT NULL, payload TEXT, phase TEXT NOT NULL DEFAULT 'started'
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(archived_at, is_demo, category_id);
  `);

  const destinationColumns = new Set((db.prepare('PRAGMA table_info(publishing_destinations)').all() as any[]).map(c => c.name));
  if (!destinationColumns.has('confirmation_source')) db.exec('ALTER TABLE publishing_destinations ADD COLUMN confirmation_source TEXT');
  if (!destinationColumns.has('last_synced_at')) db.exec('ALTER TABLE publishing_destinations ADD COLUMN last_synced_at TEXT');
  if (!destinationColumns.has('sync_status')) db.exec("ALTER TABLE publishing_destinations ADD COLUMN sync_status TEXT DEFAULT 'idle'");

  // Idempotent column migrations for existing SQLite databases
  try { db.exec('ALTER TABLE publishing_destinations ADD COLUMN selected_variant_id TEXT'); } catch {}
  try { db.exec('ALTER TABLE publishing_posts ADD COLUMN selected_variant_id TEXT'); } catch {}

  // Additive V1.5 migrations: Post metric snapshots, sync checkpoints, comment deduplication & threading
  const accountCols = new Set((db.prepare('PRAGMA table_info(accounts)').all() as any[]).map(c => c.name));
  if (!accountCols.has('last_synced_at')) db.exec('ALTER TABLE accounts ADD COLUMN last_synced_at TEXT');
  if (!accountCols.has('sync_status')) db.exec("ALTER TABLE accounts ADD COLUMN sync_status TEXT DEFAULT 'idle'");
  if (!accountCols.has('sync_error')) db.exec('ALTER TABLE accounts ADD COLUMN sync_error TEXT');
  if (!accountCols.has('followers_count')) db.exec('ALTER TABLE accounts ADD COLUMN followers_count INTEGER DEFAULT 0');
  if (!accountCols.has('following_count')) db.exec('ALTER TABLE accounts ADD COLUMN following_count INTEGER DEFAULT 0');

  const commentCols = new Set((db.prepare('PRAGMA table_info(comments)').all() as any[]).map(c => c.name));
  if (!commentCols.has('source')) db.exec("ALTER TABLE comments ADD COLUMN source TEXT DEFAULT 'api'");
  if (!commentCols.has('last_synced_at')) db.exec('ALTER TABLE comments ADD COLUMN last_synced_at TEXT');
  if (!commentCols.has('reply_id')) db.exec('ALTER TABLE comments ADD COLUMN reply_id TEXT');

  const analyticsCols = new Set((db.prepare('PRAGMA table_info(analytics_snapshots)').all() as any[]).map(c => c.name));
  if (!analyticsCols.has('observed_at')) db.exec('ALTER TABLE analytics_snapshots ADD COLUMN observed_at TEXT');
  if (!analyticsCols.has('source')) db.exec("ALTER TABLE analytics_snapshots ADD COLUMN source TEXT DEFAULT 'api'");
  if (!analyticsCols.has('provenance_status')) db.exec("ALTER TABLE analytics_snapshots ADD COLUMN provenance_status TEXT DEFAULT 'confirmed'");
  if (!analyticsCols.has('notes')) db.exec('ALTER TABLE analytics_snapshots ADD COLUMN notes TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS post_metrics_snapshots (
      id TEXT PRIMARY KEY,
      destination_id TEXT REFERENCES publishing_destinations(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL CHECK(platform IN ('facebook', 'tiktok')),
      remote_post_id TEXT NOT NULL,
      observed_at TEXT NOT NULL DEFAULT (datetime('now')),
      view_count INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      share_count INTEGER,
      extra_metrics_json TEXT DEFAULT '{}',
      source TEXT NOT NULL,
      provenance_status TEXT NOT NULL DEFAULT 'confirmed' CHECK(provenance_status IN ('confirmed', 'estimated', 'unavailable', 'auth_required', 'stale')),
      status_detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_states (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      target TEXT NOT NULL CHECK(target IN ('metrics', 'comments', 'all')),
      last_attempt_at TEXT,
      last_success_at TEXT,
      status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'syncing', 'success', 'failed', 'auth_required')),
      error_message TEXT,
      records_synced INTEGER NOT NULL DEFAULT 0,
      cursor_data TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_post_metrics_dest ON post_metrics_snapshots(destination_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_post_metrics_account ON post_metrics_snapshots(account_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_post_metrics_remote ON post_metrics_snapshots(remote_post_id);
    CREATE INDEX IF NOT EXISTS idx_sync_states_acc ON sync_states(account_id);
  `);
}

