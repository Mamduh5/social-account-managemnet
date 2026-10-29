import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readTestDataInventory} from '../server/src/repositories/test-data-inventory.repo.js';

test('inventory is bounded, conservative, searchable, and read-only', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE accounts(id TEXT, name TEXT, updated_at TEXT, is_demo INTEGER, connector_mode TEXT, external_id TEXT, identity_verified_at TEXT, connection_status TEXT, category_id TEXT);
    CREATE TABLE categories(id TEXT, name TEXT, created_at TEXT);
    CREATE TABLE videos(id TEXT, title TEXT, created_at TEXT, category_id TEXT);
    CREATE TABLE branded_videos(id TEXT, preset_name TEXT, created_at TEXT, video_id TEXT);
    CREATE TABLE publishing_posts(id TEXT, title TEXT, updated_at TEXT, video_id TEXT);
    CREATE TABLE publishing_destinations(id TEXT, account_id TEXT, post_id TEXT);
    CREATE TABLE publishing_drafts(id TEXT, updated_at TEXT, queued_post_id TEXT);
    CREATE TABLE assistant_drafts(id TEXT, kind TEXT, updated_at TEXT, account_id TEXT);
    CREATE TABLE publishing_campaigns(id TEXT, name TEXT, updated_at TEXT, account_id TEXT);
    CREATE TABLE facebook_group_plans(id TEXT, name TEXT, updated_at TEXT, account_id TEXT);
    CREATE TABLE group_prepared_content(id TEXT, kind TEXT, updated_at TEXT, group_id TEXT);
    INSERT INTO accounts VALUES ('a','Demo 100%','now',1,'simulator',NULL,NULL,'registered',NULL), ('b','Externally linked','now',1,'simulator','remote',NULL,'registered',NULL);
    INSERT INTO categories VALUES ('cat','Referenced category','now');
    UPDATE accounts SET category_id='cat' WHERE id='a';
    INSERT INTO videos VALUES ('v','Master','now',NULL);
    INSERT INTO publishing_posts VALUES ('p','Schedule','now','v');
    INSERT INTO publishing_destinations VALUES ('d','b','p');
  `);
  const read = (type='all', search='', limit=20, offset=0) => readTestDataInventory(db,{type,search,limit,offset});
  const before = db.serialize();
  const first = read('all','',2,0);
  assert.equal(first.records.length,2); assert.equal(first.hasMore,true);
  assert.equal(first.records[0].classification,'unknown');
  assert.equal(first.records[1].classification,'protected');
  assert.match(first.records[1].protection,/externally identified/i);
  assert.match(first.records[1].dependencies[0],/Publishing destinations/);
  assert.ok(first.records[1].dependencies.some((value: string) => value.includes('publishing_destinations ID d (account_id)')));
  assert.equal(read('account','100%').records.length,1);
  assert.equal(read('account','100_').records.length,0);
  const category = read('category').records[0];
  assert.equal(category.eligible, false);
  assert.ok(category.dependencies.some((value: string) => value.includes('accounts ID a (category_id)')));
  assert.equal(read('video').records[0].classification,'protected');
  assert.equal(read('publishing_post').records[0].classification,'protected');
  assert.deepEqual(db.serialize(),before);
  db.exec('DROP TABLE publishing_campaigns');
  assert.throws(() => read('all'));
  db.close();
});

test('all inventory projections work against an initialized disposable schema', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'scc-inventory-'));
  process.env.SCC_DATA_DIR = directory;
  const {db} = await import('../server/src/db/database.js');
  const {initializeDatabase} = await import('../server/src/db/schema.js');
  try {
    initializeDatabase();
    db.prepare("INSERT INTO categories(id,name,slug) VALUES ('cat','Category','category')").run();
    const result = readTestDataInventory(db, {type:'all',search:'',limit:20,offset:0});
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].id, 'cat');
    assert.equal(result.hasMore, false);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); rmSync(directory, {recursive:true,force:true,maxRetries:10,retryDelay:25}); }
});
