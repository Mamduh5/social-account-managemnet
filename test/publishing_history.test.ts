import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { parsePublishingHistoryQuery as parse } from '../server/src/domain/publishing-history.js';
import { readActivePublishingQueue, readPublishingHistory } from '../server/src/repositories/publishing-history.repo.js';

function fixture() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE categories(id TEXT PRIMARY KEY,name TEXT,color TEXT);
    CREATE TABLE accounts(id TEXT PRIMARY KEY,name TEXT,handle TEXT,platform TEXT,avatar_url TEXT,is_demo INTEGER,category_id TEXT);
    CREATE TABLE publishing_posts(id TEXT PRIMARY KEY,title TEXT,scheduled_at TEXT);
    CREATE TABLE publishing_destinations(id TEXT PRIMARY KEY,post_id TEXT,account_id TEXT,caption TEXT DEFAULT '',hashtags TEXT DEFAULT '',apply_branding INTEGER DEFAULT 0,
      selected_variant_id TEXT,status TEXT DEFAULT 'published',progress INTEGER DEFAULT 100,error_message TEXT,retry_count INTEGER DEFAULT 0,max_retries INTEGER DEFAULT 3,
      remote_post_id TEXT,remote_post_url TEXT,published_at TEXT,verification_status TEXT DEFAULT 'confirmed',confirmation_source TEXT,submission_state TEXT,
      content_type TEXT DEFAULT 'text',created_at TEXT,updated_at TEXT);
    CREATE TABLE publishing_queue(id TEXT PRIMARY KEY,destination_id TEXT);
    INSERT INTO accounts(id,name,handle,platform,is_demo) VALUES('fb','Facebook','fb','facebook',0),('tt','TikTok','tt','tiktok',1);
    INSERT INTO publishing_posts VALUES('post','Shared multi-destination post','2026-10-29T10:00:00+07:00');`);
  const add = (id: string, created: string, options: { status?: string; account?: string; updated?: string; post?: string } = {}) => db.prepare(`INSERT INTO publishing_destinations(id,post_id,account_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run(id, options.post || 'post', options.account || 'fb', options.status || 'published', created, options.updated || created);
  return { db, add };
}

test('Bangkok dates use half-open UTC boundaries and distinguish week, rolling days and calendar month', () => {
  const now = Date.parse('2026-10-28T18:30:00Z'); // October 29 in Bangkok.
  const today = parse({ period: 'today' }, now);
  assert.equal(today.startAt, '2026-10-28T17:00:00.000Z'); assert.equal(today.endAt, '2026-10-29T17:00:00.000Z');
  const week = parse({ period: 'week', date: '2026-11-01' }, now);
  assert.equal(week.startAt, '2026-10-25T17:00:00.000Z'); assert.equal(week.endAt, '2026-11-01T17:00:00.000Z');
  const month = parse({ period: 'month', date: '2026-12-20' }, now);
  assert.equal(month.startAt, '2026-11-30T17:00:00.000Z'); assert.equal(month.endAt, '2026-12-31T17:00:00.000Z');
  const rolling = parse({ period: 'last7' }, now);
  assert.equal(rolling.startAt, '2026-10-22T17:00:00.000Z'); assert.equal(rolling.endAt, today.endAt);
  const range = parse({ period: 'custom', fromDate: '2026-10-01', toDate: '2026-10-01' }, now);
  assert.equal(range.startAt, '2026-09-30T17:00:00.000Z'); assert.equal(range.endAt, '2026-10-01T17:00:00.000Z');
});

test('history filters reject malformed dates, ranges, repeated parameters, SQL inputs and unbounded pages', () => {
  for (const input of [{ period: 'date', date: '2026-02-30' }, { period: 'custom', fromDate: '2026-10-03', toDate: '2026-10-02' }, { period: 'custom' }, { timestamp: 'created; DROP TABLE accounts' }, { limit: '101' }, { offset: '-1' }, { status: ['failed', 'published'] }, { platform: 'other' }, { outcome: 'failed', status: 'published' }]) assert.throws(() => parse(input));
});

test('destination pages are newest-first with stable ID ties, totals, independent statuses and no retry-attempt duplicates', t => {
  const { db, add } = fixture(); t.after(() => db.close());
  add('dest-a', '2026-10-28 12:00:00'); add('dest-b', '2026-10-28T12:00:00.000Z');
  add('dest-c', '2026-10-29T00:00:00Z', { status: 'failed', account: 'tt' });
  db.prepare("INSERT INTO publishing_queue VALUES('try-1','dest-c'),('try-2','dest-c')").run();
  const first = readPublishingHistory(db, parse({ limit: '2' }));
  assert.deepEqual(first.items.map((row: any) => row.id), ['dest-c','dest-b']); assert.equal(first.total, 3); assert.equal(first.hasMore, true);
  const second = readPublishingHistory(db, parse({ limit: '2', offset: '2' }));
  assert.deepEqual(second.items.map((row: any) => row.id), ['dest-a']); assert.equal(second.hasMore, false);
  assert.deepEqual(readPublishingHistory(db, parse({ direction: 'asc' })).items.map((row: any) => row.id), ['dest-a','dest-b','dest-c']);
  assert.deepEqual(readPublishingHistory(db, parse({ outcome: 'failed', platform: 'tiktok' })).items.map((row: any) => row.id), ['dest-c']);
  assert.equal(readPublishingHistory(db, parse({ outcome: 'completed' })).total, 2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM publishing_destinations').get().n, 3);
});

test('date comparisons normalize SQLite UTC and offset timestamps and exclude the exact upper boundary', t => {
  const { db, add } = fixture(); t.after(() => db.close());
  add('before', '2026-10-28T16:59:59.999Z'); add('start', '2026-10-29T00:00:00+07:00');
  add('inside', '2026-10-29 16:59:59'); add('end', '2026-10-29T17:00:00Z');
  const result = readPublishingHistory(db, parse({ period: 'date', date: '2026-10-29' }));
  assert.deepEqual(result.items.map((row: any) => row.id), ['inside','start']);
});

test('Created, Scheduled and Updated select their own clocks; null schedules remain last', t => {
  const { db, add } = fixture(); t.after(() => db.close());
  db.exec("INSERT INTO publishing_posts VALUES('unscheduled','No planned time',NULL),('earlier','Earlier planned time','2026-10-28T10:00:00+07:00')");
  add('recent-created', '2026-10-29 10:00:00', { updated: '2026-10-29 10:01:00', post: 'earlier' });
  add('recent-updated', '2026-10-28 10:00:00', { updated: '2026-10-30 10:00:00' });
  add('no-schedule', '2026-10-27 10:00:00', { post: 'unscheduled' });
  assert.equal((readPublishingHistory(db, parse({ timestamp: 'created' })).items[0] as any).id, 'recent-created');
  assert.equal((readPublishingHistory(db, parse({ timestamp: 'updated' })).items[0] as any).id, 'recent-updated');
  assert.deepEqual(readPublishingHistory(db, parse({ timestamp: 'scheduled' })).items.map((row: any) => row.id), ['recent-updated','recent-created','no-schedule']);
  assert.deepEqual(readPublishingHistory(db, parse({ timestamp: 'scheduled', direction: 'asc' })).items.map((row: any) => row.id), ['recent-created','recent-updated','no-schedule']);
  assert.equal(readPublishingHistory(db, parse({ timestamp: 'scheduled', period: 'date', date: '2026-10-29' })).total, 1);
});

test('active queue is bounded, preserves manual holds and never includes published or failed history', t => {
  const { db, add } = fixture(); t.after(() => db.close());
  for (let i = 0; i < 105; i++) add(`pending-${String(i).padStart(3,'0')}`, '2026-10-29 10:00:00', { status: 'awaiting_confirmation' });
  add('uploading', '2026-10-29 10:00:00', { status: 'uploading' }); add('published', '2026-10-29 10:00:00'); add('failed', '2026-10-29 10:00:00', { status: 'failed' });
  const active = readActivePublishingQueue(db);
  assert.equal(active.total, 106); assert.equal(active.queue.length, 100); assert.equal(active.hasMore, true);
  assert.equal((active.queue[0] as any).id, 'uploading'); assert.ok(active.queue.every((row: any) => !['published','failed'].includes(row.status)));
  assert.equal(readPublishingHistory(db, parse({ status: 'awaiting_confirmation', limit: '100', offset: '100' })).items.length, 5);
});

test('read-only history remains available without additive general-post columns and omits credential payloads', t => {
  const { db, add } = fixture(); t.after(() => db.close()); add('legacy', '2026-10-29 10:00:00');
  db.exec('ALTER TABLE publishing_destinations DROP COLUMN content_type; ALTER TABLE publishing_destinations DROP COLUMN submission_state; ALTER TABLE publishing_destinations DROP COLUMN confirmation_source; ALTER TABLE accounts ADD COLUMN access_token TEXT;');
  db.prepare("UPDATE accounts SET access_token='never-return-this'").run();
  const row = readPublishingHistory(db, parse({})).items[0] as any;
  assert.equal(row.content_type, 'reel'); assert.equal(row.submission_state, null); assert.equal(row.access_token, undefined);
});
