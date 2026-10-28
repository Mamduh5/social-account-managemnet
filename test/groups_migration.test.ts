import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { groupsSchemaReady, migrateGroupsDatabase } from '../server/src/db/groups-schema.js';
import { initializeContentWorkspaceSchema } from '../server/src/db/content-workspace-schema.js';
import { snapshotOriginalTables, assertOriginalTablesPreserved } from '../server/src/db/v111-migration.js';

function legacyDatabase(file = ':memory:') {
  const db = new Database(file); db.pragma('foreign_keys=ON');
  db.exec(`
    CREATE TABLE accounts(id TEXT PRIMARY KEY, protected_value TEXT);
    INSERT INTO accounts VALUES ('page-a','opaque-owner-data'),('page-b','opaque-other-data');
    CREATE TABLE facebook_group_plans(id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL,identity_type TEXT NOT NULL,account_id TEXT REFERENCES accounts(id),membership TEXT NOT NULL,category TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',rules TEXT NOT NULL DEFAULT '',rules_reviewed_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO facebook_group_plans VALUES ('original','Private test Group','https://www.facebook.com/groups/123/','page','page-a','member','private','historical note','historical rules','2026-10-26','2026-10-26 10:00:00','2026-10-26 10:00:01');
    INSERT INTO facebook_group_plans VALUES ('duplicate','Legacy duplicate','https://m.facebook.com/groups/123/?ref=share','page','page-a','not_member','','','','','2026-10-26 11:00:00','2026-10-26 11:00:00');
    INSERT INTO facebook_group_plans VALUES ('other-page','Same Group, other Page','https://facebook.com/groups/123/','page','page-b','admin','','','','','2026-10-26 12:00:00','2026-10-26 12:00:00');
    INSERT INTO facebook_group_plans VALUES ('personal','Legacy personal handoff','https://facebook.com/groups/123/','personal',NULL,'unknown','','','','','2026-10-26 13:00:00','2026-10-26 13:00:00');
    INSERT INTO facebook_group_plans VALUES ('unresolved','Legacy unsupported URL','https://facebook.com/groups/search','page','page-a','unknown','','','','','2026-10-26 14:00:00','2026-10-26 14:00:00');
    CREATE TABLE group_prepared_content(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES facebook_group_plans(id),kind TEXT NOT NULL,content TEXT NOT NULL,thread_url TEXT,status TEXT NOT NULL DEFAULT 'prepared',receipt_url TEXT,receipt_note TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO group_prepared_content VALUES ('historic-handoff','original','reply','Original saved prepared text','https://facebook.com/groups/123/posts/456?comment_id=7','receipt_recorded_unverified','https://facebook.com/groups/123/posts/456?comment_id=7&reply_comment_id=8','original owner receipt','2026-10-26 15:00:00','2026-10-26 15:10:00');
    CREATE TABLE content_workspace_audit(id TEXT PRIMARY KEY,entity_id TEXT NOT NULL,action TEXT NOT NULL,revision INTEGER,detail_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO content_workspace_audit VALUES ('original-audit','historic-handoff','group_handoff_context_saved',NULL,'{"version":1,"group":{"membership":"member","url":"https://facebook.com/groups/123/"}}','2026-10-26 15:00:00');
    CREATE TABLE publishing_destinations(id TEXT PRIMARY KEY,status TEXT,remote_post_id TEXT);
    INSERT INTO publishing_destinations VALUES ('protected','awaiting_confirmation',NULL),('published','published','remote-keep');
  `);
  return db;
}

test('Groups migration preserves every legacy table, ID, receipt, snapshot, audit and Page publication byte value', () => {
  const db = legacyDatabase(); const before = snapshotOriginalTables(db);
  const result = migrateGroupsDatabase(db);
  assert.equal(result.groupsReady, true); assert.equal(result.alreadyReady, false);
  assert.equal(result.planCount, 5); assert.equal(result.legacyDuplicateCount, 2); assert.equal(result.legacyUnresolvedIdentityCount, 1);
  assertOriginalTablesPreserved(db, before); assert.equal(groupsSchemaReady(db), true);
  assert.equal((db.prepare("SELECT original_url FROM group_plan_extensions WHERE group_id='duplicate'").get() as any).original_url, 'https://m.facebook.com/groups/123/?ref=share');
  assert.equal((db.pragma('foreign_key_check') as unknown[]).length, 0); db.close();
});

test('Legacy membership import is unverified with unknown observation date and never invents personal identities', () => {
  const db = legacyDatabase(); migrateGroupsDatabase(db);
  const observations = db.prepare('SELECT * FROM group_membership_observations').all() as any[];
  assert.equal(observations.length, 4); assert.ok(observations.every(row => row.observed_at === null && row.source === 'owner_entered' && row.verified === 0));
  assert.equal(observations.some(row => row.group_id === 'personal'), false);
  assert.equal(observations.find(row => row.group_id === 'other-page').account_id, 'page-b');
  assert.equal(observations.find(row => row.group_id === 'original').status, 'member');
  db.close();
});

test('Additive migration is repeatable without modifying extension or historical rows', () => {
  const db = legacyDatabase(); migrateGroupsDatabase(db); const before = snapshotOriginalTables(db);
  assert.equal(migrateGroupsDatabase(db).alreadyReady, true); assertOriginalTablesPreserved(db, before); db.close();
});

test('Migration validation failure atomically rolls back DDL, imports and accidental original-row changes', () => {
  const db = legacyDatabase(); const before = snapshotOriginalTables(db);
  assert.throws(() => migrateGroupsDatabase(db, current => { current.prepare("UPDATE accounts SET protected_value='changed' WHERE id='page-a'").run(); }), /changed original rows/);
  assertOriginalTablesPreserved(db, before); assert.equal(groupsSchemaReady(db), false);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='group_plan_extensions'").get(), undefined);
  assert.equal(db.inTransaction, false); db.close();
});

test('Active canonical identities are isolated per Page while archived plans and legacy duplicates survive', () => {
  const db = legacyDatabase(); migrateGroupsDatabase(db);
  const add = db.prepare("INSERT INTO facebook_group_plans(id,name,url,identity_type,account_id,membership) VALUES (?,?,'https://facebook.com/groups/999/','page',?,'unknown')");
  for (const [id, actor] of [['new-a', 'page-a'], ['duplicate-a', 'page-a'], ['new-b', 'page-b']]) add.run(id, id, actor);
  const extension = db.prepare("INSERT INTO group_plan_extensions(group_id,canonical_key,canonical_url,original_url,acting_page_id) VALUES (?,'id:999','https://www.facebook.com/groups/999/','https://facebook.com/groups/999/',?)");
  extension.run('new-a', 'page-a'); assert.throws(() => extension.run('duplicate-a', 'page-a'), /UNIQUE/);
  extension.run('new-b', 'page-b');
  db.prepare("UPDATE group_plan_extensions SET archived_at='2026-10-27' WHERE group_id='new-a'").run(); extension.run('duplicate-a', 'page-a');
  assert.equal((db.prepare('SELECT count(*) n FROM facebook_group_plans').get() as any).n, 8); db.close();
});

test('Membership and receipt events are append-only; corrections preserve original receipt and legacy handoff', () => {
  const db = legacyDatabase(); migrateGroupsDatabase(db);
  const original = db.prepare('SELECT * FROM group_receipt_events').get() as any;
  assert.equal(original.id, 'legacy-receipt:historic-handoff'); assert.equal(original.supersedes_id, null);
  assert.throws(() => db.prepare("UPDATE group_receipt_events SET note='rewrite'").run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM group_receipt_events').run(), /append-only/);
  assert.throws(() => db.prepare("UPDATE group_membership_observations SET status='admin'").run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM group_membership_observations').run(), /append-only/);
  db.prepare('INSERT INTO group_receipt_events(id,prepared_id,url,note,supersedes_id) VALUES (?,?,?,?,?)').run('correction', 'historic-handoff', 'https://facebook.com/groups/123/posts/456?comment_id=7&reply_comment_id=9', 'Corrected owner entry, still unverified', original.id);
  assert.deepEqual(db.prepare('SELECT * FROM group_receipt_events WHERE id=?').get(original.id), original);
  assert.equal((db.prepare("SELECT receipt_note FROM group_prepared_content WHERE id='historic-handoff'").get() as any).receipt_note, 'original owner receipt'); db.close();
});

test('Readiness requires complete columns, active-identity uniqueness and append-only guards', () => {
  const db = legacyDatabase(); migrateGroupsDatabase(db); db.exec('DROP INDEX idx_group_active_page_identity');
  assert.equal(groupsSchemaReady(db), false); db.close();
  const other = legacyDatabase(); migrateGroupsDatabase(other); other.exec('DROP TRIGGER group_receipts_no_update');
  assert.equal(groupsSchemaReady(other), false); other.close();
});

test('Fresh workspace gets extensions but initializing a legacy workspace never silently migrates it', () => {
  const fresh = new Database(':memory:'); fresh.exec('CREATE TABLE accounts(id TEXT PRIMARY KEY)');
  initializeContentWorkspaceSchema(fresh); assert.equal(groupsSchemaReady(fresh), true); fresh.close();
  const legacy = legacyDatabase(); initializeContentWorkspaceSchema(legacy); assert.equal(groupsSchemaReady(legacy), false); legacy.close();
});

test('Additive records and reminder state survive a disposable database close and reopen', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-groups-migration-')); const file = path.join(directory, 'fixture.db');
  try {
    const db = legacyDatabase(file); migrateGroupsDatabase(db);
    db.prepare("INSERT INTO group_reminder_states(prepared_id,state,note) VALUES ('historic-handoff','dismissed','No publication claimed')").run(); db.close();
    const reopened = new Database(file); assert.equal(groupsSchemaReady(reopened), true);
    assert.equal((reopened.prepare('SELECT state FROM group_reminder_states').get() as any).state, 'dismissed');
    assert.equal((reopened.prepare('SELECT count(*) n FROM group_receipt_events').get() as any).n, 1);
    assert.equal((reopened.prepare("SELECT status FROM publishing_destinations WHERE id='protected'").get() as any).status, 'awaiting_confirmation'); reopened.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
