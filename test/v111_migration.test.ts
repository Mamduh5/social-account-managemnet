import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { calendarSchemaReady } from '../server/src/db/calendar-schema.js';
import { migrateV110Database } from '../server/src/db/v110-migration.js';
import { migrateV111Database, snapshotOriginalTables, assertOriginalTablesPreserved } from '../server/src/db/v111-migration.js';

const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function makeV110(file = ':memory:') {
  const database = new Database(file);
  database.pragma('foreign_keys=ON');
  database.exec(`
    CREATE TABLE accounts(id TEXT PRIMARY KEY,name TEXT,access_token TEXT,external_id TEXT,brand_kit_json TEXT);
    INSERT INTO accounts VALUES ('a','Original Page','ciphertext-never-log','trusted-page-id','{"signatureText":"Saved brand"}');
    CREATE TABLE videos(id TEXT PRIMARY KEY,file_path TEXT);
    INSERT INTO videos VALUES ('v','immutable-master.mp4');
    CREATE TABLE branded_videos(id TEXT PRIMARY KEY,video_id TEXT REFERENCES videos(id),file_path TEXT,sha256 TEXT);
    INSERT INTO branded_videos VALUES ('b','v','historical-variant.mp4','original-digest');
    CREATE TABLE publishing_posts(id TEXT PRIMARY KEY,video_id TEXT NOT NULL REFERENCES videos(id),title TEXT,status TEXT);
    INSERT INTO publishing_posts VALUES ('p','v','original title','completed');
    CREATE TABLE publishing_destinations(id TEXT PRIMARY KEY,post_id TEXT REFERENCES publishing_posts(id),account_id TEXT REFERENCES accounts(id),caption TEXT,status TEXT,remote_post_id TEXT,confirmation_source TEXT);
    INSERT INTO publishing_destinations VALUES ('dest-mvf5hdwf-19hi','p','a','hold one','awaiting_confirmation',NULL,'manual');
    INSERT INTO publishing_destinations VALUES ('dest-mvf5j24q-ub0y','p','a','hold two','awaiting_confirmation',NULL,'manual');
    INSERT INTO publishing_destinations VALUES ('dest-mvf5j24r-rw4x','p','a','hold three','awaiting_confirmation',NULL,'manual');
    INSERT INTO publishing_destinations VALUES ('published','p','a','published original','published','remote-preserved','api');
    CREATE TABLE account_identities(platform TEXT,identity_key TEXT,account_id TEXT REFERENCES accounts(id),PRIMARY KEY(platform,identity_key)) WITHOUT ROWID;
    INSERT INTO account_identities VALUES ('facebook','trusted-alias','a');
  `);
  migrateV110Database(database);
  assert.equal(calendarSchemaReady(database), false, 'V1.10 maintenance must not silently include V1.11');
  database.prepare("INSERT INTO publishing_drafts(id,payload_json,status) VALUES ('seven-day-unapproved','{}','draft')").run();
  return database;
}

test('V1.11 migration preserves every original row, protected holds, credentials, aliases and historical variants', () => {
  const database = makeV110();
  const before = snapshotOriginalTables(database);
  const result = migrateV111Database(database);
  assert.equal(result.calendarReady, true); assert.equal(result.alreadyReady, false);
  assert.equal(result.protectedManualDestinationCount, 3); assert.equal(result.campaignCount, 0);
  assertOriginalTablesPreserved(database, before);
  assert.equal((database.prepare("SELECT status FROM publishing_drafts WHERE id='seven-day-unapproved'").get() as any).status, 'draft');
  for (const table of ['publishing_posts', 'publishing_destinations', 'publishing_drafts']) {
    const defaults = database.prepare('SELECT campaign_id,origin FROM ' + table).all() as any[];
    assert.ok(defaults.every(row => row.campaign_id === null && row.origin === 'manual'));
  }
  assert.equal((database.pragma('foreign_key_check') as any[]).length, 0);
  assert.equal(database.pragma('foreign_keys', { simple: true }), 1);
  database.close();
});

test('V1.11 migration validation failure rolls back all DDL and row changes atomically', () => {
  const database = makeV110();
  const before = snapshotOriginalTables(database);
  assert.throws(() => migrateV111Database(database, current => {
    current.prepare("UPDATE accounts SET access_token='changed'").run();
  }), /changed original rows/);
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE name='publishing_campaigns'").get(), undefined);
  assert.equal((database.prepare('PRAGMA table_info(publishing_posts)').all() as any[]).some(column => column.name === 'campaign_id'), false);
  assertOriginalTablesPreserved(database, before);
  assert.equal(database.inTransaction, false);
  database.close();
});

test('V1.11 readiness and repeated migration are idempotent and retain existing unapproved campaign content', () => {
  const database = makeV110();
  migrateV111Database(database);
  database.prepare("INSERT INTO publishing_campaigns(id,account_id,name,start_date,end_date,status,origin) VALUES ('seven-day','a','Owner draft','2026-11-01','2026-11-07','awaiting_approval','gemini_prepared')").run();
  const before = snapshotOriginalTables(database);
  const again = migrateV111Database(database);
  assert.equal(again.alreadyReady, true); assert.equal(again.campaignCount, 1);
  assertOriginalTablesPreserved(database, before);
  assert.equal((database.prepare("SELECT status,approved_hash FROM publishing_campaigns WHERE id='seven-day'").get() as any).status, 'awaiting_approval');
  assert.equal((database.prepare("SELECT approved_hash FROM publishing_campaigns WHERE id='seven-day'").get() as any).approved_hash, null);
  database.close();
});

test('V1.11 rejects incomplete prerequisites and bad foreign keys before creating calendar data', () => {
  const empty = new Database(':memory:');
  assert.throws(() => migrateV111Database(empty), /V1.10 general-post migration/);
  empty.close();
  const database = makeV110();
  database.pragma('foreign_keys=OFF');
  database.prepare("INSERT INTO publishing_destinations(id,post_id,account_id,caption,status) VALUES ('broken','missing','a','bad','failed')").run();
  assert.throws(() => migrateV111Database(database), /foreign-key validation/);
  assert.equal(calendarSchemaReady(database), false);
  database.close();
});

test('copy-only CLI creates a new migrated database and never replaces its V1.10 source or existing output', () => {
  const root = path.resolve('.data/v111-integration/test-runs'); fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'migration-'));
  const source = path.join(directory, 'original-v110.db'); const copy = path.join(directory, 'prepared-v111.db');
  makeV110(source).close();
  const originalHash = hash(source);
  const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prepare-v111-migration.ts', ...args], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const result = run(['--database', source, '--copy-to', copy]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(hash(source), originalHash);
  const original = new Database(source, { readonly: true }); assert.equal(calendarSchemaReady(original), false); original.close();
  const prepared = new Database(copy, { readonly: true }); assert.equal(calendarSchemaReady(prepared), true); prepared.close();
  const preparedHash = hash(copy);
  assert.notEqual(run(['--database', source, '--copy-to', copy]).status, 0);
  assert.notEqual(run(['--database', source, '--copy-to', source]).status, 0);
  assert.notEqual(run(['--database', source, '--apply']).status, 0);
  assert.equal(hash(source), originalHash); assert.equal(hash(copy), preparedHash);
  assert.doesNotMatch(result.stdout, /ciphertext-never-log|trusted-page-id/);
});

test('initializing an existing V1.10 database does not silently add the calendar', () => {
  const directory = fs.mkdtempSync(path.join(path.resolve(process.env.SCC_DATA_DIR!), 'startup-'));
  // Use an actual full fresh schema, remove only its calendar to model V1.10,
  // then call startup initialization again in a separate isolated process.
  const child = spawnSync(process.execPath, ['--import', 'tsx', '-e', `
    const {db}=require('./server/src/db/database.ts');
    const {initializeDatabase}=require('./server/src/db/schema.ts');
    initializeDatabase();
    db.exec('DROP INDEX idx_drafts_campaign; DROP INDEX idx_posts_campaign; DROP INDEX idx_dest_campaign;');
    for(const table of ['publishing_drafts','publishing_posts','publishing_destinations']) {
      db.exec('ALTER TABLE '+table+' DROP COLUMN campaign_id');
      db.exec('ALTER TABLE '+table+' DROP COLUMN origin');
    }
    db.exec('DROP TABLE publishing_campaigns');
    initializeDatabase();
    if(db.prepare("SELECT name FROM sqlite_master WHERE name='publishing_campaigns'").get())throw Error('silent calendar migration');
    db.close();
  `], { cwd: process.cwd(), env: { ...process.env, SCC_DATA_DIR: directory }, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
});
