import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.resolve('.data/social_command_center.db');
const db = new Database(dbPath, { readonly: true });

console.log('--- 1. Protected Destinations ---');
const protectedDests = db.prepare(`SELECT id, post_id, account_id, status, confirmation_source FROM publishing_destinations WHERE id IN ('dest-mvf5hdwf-19hi', 'dest-mvf5j24q-ub0y', 'dest-mvf5j24r-rw4x')`).all();
console.log(protectedDests);

console.log('--- 2. Page B Drafts ---');
const pageBDrafts = db.prepare(`SELECT id, campaign_id, status FROM publishing_drafts WHERE campaign_id = 'camp-v112-codex-page-b-concepts-20261027'`).all();
console.log(`Page B Drafts Count: ${pageBDrafts.length}, statuses:`, pageBDrafts.map(d => d.status));

console.log('--- 3. Page A Live Test Posts ---');
const livePosts = db.prepare(`SELECT p.id, p.content_type, p.status, p.scheduled_at, d.id as dest_id, d.status as dest_status, d.confirmation_source, d.remote_post_id FROM publishing_posts p JOIN publishing_destinations d ON p.id = d.post_id WHERE d.account_id = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5' AND p.id IN ('post-2feb599d-a067-45c7-b202-8c2d99c28460', 'post-2abe7162-cde1-483c-bc64-0fdd6f84b124')`).all();
console.log(livePosts);

console.log('--- 4. Groups & Handoffs ---');
const groups = db.prepare(`SELECT id, name, url, identity_type, membership FROM facebook_group_plans`).all();
console.log('Groups:', groups);
const prepared = db.prepare(`SELECT id, group_id, kind, status, receipt_url, receipt_note FROM group_prepared_content`).all();
console.log('Prepared Group Content:', prepared);

console.log('--- 5. Destination Summary ---');
const destSummary = db.prepare(`SELECT status, count(*) as count FROM publishing_destinations GROUP BY status`).all();
console.log(destSummary);

console.log('--- 6. PRAGMA integrity_check & foreign_key_check ---');
const integrity = db.pragma('integrity_check');
const fk = db.pragma('foreign_key_check');
console.log('Integrity:', integrity);
console.log('Foreign Keys:', fk);
