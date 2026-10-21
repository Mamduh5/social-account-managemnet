import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { db } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { inspectAccountMetricsMigration, migrateAccountMetricsNullability } from '../server/src/db/account-metrics-migration.js';
import { TikTokConnector } from '../server/src/connectors/tiktok.js';
import { MetaFacebookConnector } from '../server/src/connectors/meta-facebook.js';
import { analyticsRepo } from '../server/src/repositories/analytics.repo.js';
import { syncService } from '../server/src/services/sync.service.js';
import { seal } from '../server/src/services/token-protection.js';

const originalFetch = globalThis.fetch;
const connector = new TikTokConnector();
const response = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const profile = (statistics: any = {}) => ({ data: { user: { open_id: 'statistics-fixture', display_name: 'Fixture', ...statistics } }, error: { code: 'ok' } });
before(() => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use isolated test storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  initializeDatabase();
});
after(() => { globalThis.fetch = originalFetch; syncService.stop(); });

function accountFixture() {
  const id = `acc-statistics-${randomUUID()}`;
  db.prepare(`INSERT INTO accounts (id, platform, account_type, name, handle, status, connector_mode,
    external_id, access_token, token_expires_at, identity_verified_at, granted_scopes_json, connection_status)
    VALUES (?, 'tiktok', 'personal', 'Statistics fixture', ?, 'connected', 'official_api',
    'statistics-fixture', ?, ?, ?, '["user.info.basic","video.list"]', 'limited')`)
    .run(id, `@fixture${randomUUID().slice(0, 8)}`, seal('fixture-access-token'), new Date(Date.now() + 86400000).toISOString(), new Date().toISOString());
  return id;
}

test('TikTok account statistics preserve numeric zero and distinguish missing/null/invalid values', async () => {
  globalThis.fetch = async () => response(profile({ follower_count: 0, likes_count: null, following_count: '0' }));
  const metrics = await connector.fetchAccountMetrics({ access_token: 'fixture', external_id: 'statistics-fixture' });
  assert.equal(metrics.status, 'confirmed');
  assert.equal(metrics.followersTotal, 0);
  assert.equal(metrics.likesTotal, null);
  assert.equal(metrics.followingTotal, null);
  assert.equal(metrics.viewsTotal, undefined);
  globalThis.fetch = async () => response(profile({ follower_count: null, likes_count: null }));
  assert.equal((await connector.fetchAccountMetrics({ access_token: 'fixture' })).status, 'unsupported');
});

test('Basic-profile fallback never confirms unsupported account statistics', async () => {
  let calls = 0;
  globalThis.fetch = async (url: any) => {
    calls++;
    return String(url).includes('follower_count')
      ? response({ error: { code: 'scope_not_authorized', message: 'Statistics scope missing' } }, 403)
      : response(profile());
  };
  const metrics = await connector.fetchAccountMetrics({ access_token: 'fixture' });
  assert.equal(calls, 2);
  assert.equal(metrics.status, 'unsupported');
  assert.equal(metrics.followersTotal, null);
});

test('Failed, incomplete, mismatched and HTTP-error account responses cannot become confirmed metrics', async () => {
  for (const mocked of [
    () => response({}, 200),
    () => response({ data: {} }, 200),
    () => response(profile({ follower_count: 0 }), 503),
    () => response({ error: { code: 'internal_error', message: 'Unavailable' } }, 503),
    () => response({ error: { code: 'rate_limit_exceeded', message: 'Rate limited' } }, 429),
    () => response({ data: { user: { open_id: 'different-account', follower_count: 1 } } }),
    () => { throw new TypeError('fetch failed'); },
    () => { throw new DOMException('Timeout', 'TimeoutError'); },
  ]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return mocked(); };
    const metrics = await connector.fetchAccountMetrics({ access_token: 'fixture', external_id: 'statistics-fixture' });
    assert.equal(metrics.status, 'failed');
    assert.equal(metrics.followersTotal, null);
    assert.equal(calls, 1, 'Outages must not trigger profile fallback');
  }
});

test('Meta account statistics require a successful response and numeric fields', async () => {
  const meta = new MetaFacebookConnector();
  for (const [body, status, expected] of [[{}, 200, 'unsupported'], [{ followers_count: null }, 200, 'unsupported'], [{ followers_count: 0 }, 503, 'failed'], [{ followers_count: 0 }, 200, 'confirmed']] as const) {
    globalThis.fetch = async () => response(body, status);
    const metrics = await meta.fetchAccountMetrics({ access_token: 'fixture' });
    assert.equal(metrics.status, expected);
    assert.equal(metrics.followersTotal, expected === 'confirmed' ? 0 : null);
  }
});

test('Account snapshots store real zero, nullable unsupported fields and per-snapshot contract version', async () => {
  const id = accountFixture();
  globalThis.fetch = async () => response(profile({ follower_count: 0, likes_count: 0 }));
  const result = await syncService.syncAccount(id);
  assert.equal(result.success, true);
  const snapshot = db.prepare('SELECT * FROM analytics_snapshots WHERE account_id = ?').get(id) as any;
  assert.equal(snapshot.followers_total, 0);
  assert.equal(snapshot.likes, 0);
  for (const key of ['views', 'comments', 'shares', 'followers_gain', 'engagement_rate', 'watch_time_seconds', 'following_total']) assert.equal(snapshot[key], null, key);
  assert.equal(snapshot.metric_contract_version, 1);
  assert.equal(snapshot.source, 'tiktok_display_api');
  assert.equal(snapshot.provenance_status, 'confirmed');
  assert.equal(analyticsRepo.getOverviewTotals({ accountId: id }).total_followers, 0);
});

test('Unsupported/failing statistics add no synthetic account snapshot and preserve last successful sync', async () => {
  const id = accountFixture();
  assert.equal(analyticsRepo.getOverviewTotals({ accountId: id }).total_followers, null, 'Account default zero is unavailable');
  globalThis.fetch = async () => response(profile());
  const unavailable = await syncService.syncAccount(id);
  assert.equal(unavailable.success, false);
  assert.equal(unavailable.status, 'failed');
  assert.match(unavailable.message!, /unavailable/i);
  assert.equal(analyticsRepo.getSyncStates().find((state) => state.account_id === id)!.last_success_at, null);
  assert.equal((db.prepare('SELECT count(*) AS c FROM analytics_snapshots WHERE account_id = ?').get(id) as any).c, 0);
  globalThis.fetch = async () => response(profile({ follower_count: 8 }));
  await syncService.syncAccount(id);
  const successAt = analyticsRepo.getSyncStates().find((state) => state.account_id === id)!.last_success_at;
  globalThis.fetch = async () => response(profile());
  assert.equal((await syncService.syncAccount(id)).success, false);
  assert.equal(analyticsRepo.getSyncStates().find((state) => state.account_id === id)!.last_success_at, successAt);
  globalThis.fetch = async () => response({}, 503);
  const result = await syncService.syncAccount(id);
  assert.equal(result.success, false);
  assert.equal(result.status, 'failed');
  assert.equal((db.prepare('SELECT count(*) AS c FROM analytics_snapshots WHERE account_id = ?').get(id) as any).c, 1);
  assert.equal(analyticsRepo.getSyncStates().find((state) => state.account_id === id)!.last_success_at, successAt);
  assert.equal(analyticsRepo.getOverviewTotals({ accountId: id }).total_followers, 8);
});

test('Unsupported account statistics preserve genuine post counters and provenance', async () => {
  const id = accountFixture();
  const videoId = `video-${randomUUID()}`, postId = `post-${randomUUID()}`, destinationId = `destination-${randomUUID()}`;
  db.prepare("INSERT INTO videos (id, title, source_type, original_filename, file_path) VALUES (?, 'Fixture', 'manual_upload', 'fixture.mp4', 'fixture.mp4')").run(videoId);
  db.prepare("INSERT INTO publishing_posts (id, video_id, title) VALUES (?, ?, 'Fixture')").run(postId, videoId);
  db.prepare("INSERT INTO publishing_destinations (id, post_id, account_id, caption, status, remote_post_id) VALUES (?, ?, ?, 'Fixture', 'published', '12345')").run(destinationId, postId, id);
  globalThis.fetch = async (url: any) => String(url).includes('/video/query/')
    ? response({ data: { videos: [{ id: '12345', view_count: 1, like_count: 0, comment_count: 0, share_count: 0 }] }, error: { code: 'ok' } })
    : response(profile());
  const result = await syncService.syncAccount(id);
  assert.equal(result.metricsSynced, 1);
  assert.equal(result.success, true);
  assert.equal((db.prepare('SELECT count(*) AS c FROM analytics_snapshots WHERE account_id = ?').get(id) as any).c, 0);
  const snapshot = db.prepare('SELECT * FROM post_metrics_snapshots WHERE destination_id = ?').get(destinationId) as any;
  assert.equal(snapshot.view_count, 1);
  assert.equal(snapshot.like_count, 0);
  assert.equal(snapshot.source, 'tiktok_display_api');
  assert.equal(snapshot.provenance_status, 'confirmed');
});

function oldDatabase(likesType = 'INTEGER') {
  const legacy = new Database(':memory:');
  legacy.pragma('foreign_keys = ON');
  legacy.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY); INSERT INTO accounts VALUES ('old-account');
    CREATE TABLE analytics_snapshots (id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id), date TEXT,
      views INTEGER NOT NULL DEFAULT 0, likes ${likesType} NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0, followers_total INTEGER NOT NULL DEFAULT 0, followers_gain INTEGER NOT NULL DEFAULT 0,
      watch_time_seconds INTEGER NOT NULL DEFAULT 0, engagement_rate REAL NOT NULL DEFAULT 0.0, is_simulated INTEGER DEFAULT 0,
      observed_at TEXT, source TEXT, provenance_status TEXT, notes TEXT);
    CREATE INDEX idx_analytics_account_date ON analytics_snapshots(account_id, date);
    INSERT INTO analytics_snapshots (id, account_id, date, source, provenance_status, notes) VALUES
      ('ambiguous-zero', 'old-account', '2026-10-20', 'tiktok_display_api', 'confirmed', 'Original audit note');`);
  return legacy;
}

test('Explicit nullable migration preserves historical rows exactly, indexes and idempotence', () => {
  const legacy = oldDatabase();
  try {
    legacy.exec(`INSERT INTO analytics_snapshots (id, account_id, date, source, provenance_status)
      VALUES ('legacy-meta', 'old-account', '2026-10-20', 'meta_graph_api', 'confirmed')`);
    legacy.exec(`CREATE TABLE snapshot_audit (snapshot_id TEXT);
      CREATE TRIGGER snapshot_insert_audit AFTER INSERT ON analytics_snapshots BEGIN
        INSERT INTO snapshot_audit VALUES (NEW.id);
      END;`);
    const originalRows = legacy.prepare('SELECT * FROM analytics_snapshots ORDER BY id').all() as any[];
    assert.equal(inspectAccountMetricsMigration(legacy).historicalCandidates.length, 2);
    assert.equal(migrateAccountMetricsNullability(legacy), true);
    const migratedRows = legacy.prepare('SELECT * FROM analytics_snapshots ORDER BY id').all() as any[];
    assert.equal(migratedRows.length, originalRows.length);
    for (const [index, original] of originalRows.entries()) {
      for (const key of Object.keys(original)) assert.equal(migratedRows[index][key], original[key], key);
      assert.equal(migratedRows[index].metric_contract_version, null, 'Old zeros must not become newly certified');
    }
    assert.equal(inspectAccountMetricsMigration(legacy).historicalCandidates.length, 2);
    assert.equal(migrateAccountMetricsNullability(legacy), false);
    assert.ok(legacy.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_analytics_account_date'").get());
    legacy.prepare('INSERT INTO analytics_snapshots (id, account_id, views, likes) VALUES (?, ?, ?, ?)').run('new-null', 'old-account', null, 0);
    assert.deepEqual(legacy.prepare("SELECT views, likes FROM analytics_snapshots WHERE id='new-null'").get(), { views: null, likes: 0 });
    assert.deepEqual(legacy.prepare('SELECT snapshot_id FROM snapshot_audit').all(), [{ snapshot_id: 'new-null' }], 'Recreated trigger runs for new writes; copying history does not create extra audit events');
  } finally { legacy.close(); }
});

test('Unexpected old schema fails transactionally with original history and table intact', () => {
  const legacy = oldDatabase('TEXT');
  try {
    const before = legacy.prepare('SELECT * FROM analytics_snapshots').all();
    assert.throws(() => migrateAccountMetricsNullability(legacy), /rolled back/);
    assert.deepEqual(legacy.prepare('SELECT * FROM analytics_snapshots').all(), before);
    assert.equal(legacy.prepare("SELECT name FROM sqlite_master WHERE name='analytics_snapshots_v19_nullable'").get(), undefined);
  } finally { legacy.close(); }
});

test('Legacy API zero followers are excluded from current totals without rewriting audit rows', () => {
  const id = accountFixture();
  db.prepare(`INSERT INTO analytics_snapshots (id, account_id, date, views, likes, comments, shares, followers_total, source,
    provenance_status, is_simulated, notes) VALUES (?, ?, '2026-10-20', 0, 0, 0, 0, 0, 'tiktok_display_api', 'confirmed', 0, 'Retain this audit row')`).run(`old-${id}`, id);
  assert.equal(analyticsRepo.getOverviewTotals({ accountId: id }).total_followers, null);
  const interpreted = analyticsRepo.getAccountMetricHistory(id)[0];
  assert.equal(interpreted.followers_total, null);
  assert.equal(interpreted.views, null);
  assert.equal(interpreted.likes, null);
  assert.match(interpreted.historical_warning, /field availability/);
  const raw = db.prepare('SELECT * FROM analytics_snapshots WHERE account_id = ?').get(id) as any;
  assert.equal(raw.followers_total, 0);
  assert.equal(raw.views, 0);
  assert.equal(raw.notes, 'Retain this audit row');
});

test('Unmigrated NOT NULL account schema refuses writes instead of coercing unavailable metrics', () => {
  const id = accountFixture();
  db.transaction(() => {
    db.exec('ALTER TABLE analytics_snapshots RENAME TO analytics_snapshots_original');
    try {
      db.exec('CREATE TABLE analytics_snapshots (id TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0)');
      assert.throws(() => analyticsRepo.recordAccountMetricSnapshot({
        account_id: id, date: '2026-10-21', observed_at: '2026-10-21T00:00:00Z', followers_total: null,
        followers_gain: null, views_total: null, likes_total: null, comments_total: null, shares_total: null,
        engagement_rate: null, source: 'tiktok_display_api', provenance_status: 'confirmed', is_simulated: 0,
      }), /maintenance migration/);
      assert.equal((db.prepare('SELECT count(*) AS c FROM analytics_snapshots').get() as any).c, 0);
    } finally {
      db.exec('DROP TABLE analytics_snapshots');
      db.exec('ALTER TABLE analytics_snapshots_original RENAME TO analytics_snapshots');
    }
  })();
});
