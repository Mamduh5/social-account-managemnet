import Database from 'better-sqlite3';

const db = new Database('.data/social_command_center.db', { readonly: true });

console.log('--- 1. Comment in DB ---');
const comment = db.prepare(`SELECT id, external_comment_id, author_name, content, status, has_replied, reply_id, reply_text FROM comments WHERE id = 'cmt-87435c66-002f-4e6c-9ced-4f2b71354105'`).get();
console.log(comment);

console.log('--- 2. Reply Draft in DB ---');
const draft = db.prepare(`SELECT id, kind, status, approved_revision, content FROM assistant_drafts WHERE kind = 'reply' ORDER BY rowid DESC LIMIT 1`).get();
console.log(draft);

console.log('--- 3. Audit Trail for Reply ---');
const audit = db.prepare(`SELECT action, revision, detail_json, created_at FROM content_workspace_audit WHERE entity_id LIKE '%cmt-87435c66-002f-4e6c-9ced-4f2b71354105%'`).all();
console.log(audit);

console.log('--- 4. Protected Destinations ---');
const protectedDests = db.prepare(`SELECT id, status, confirmation_source FROM publishing_destinations WHERE id IN ('dest-mvf5hdwf-19hi', 'dest-mvf5j24q-ub0y', 'dest-mvf5j24r-rw4x')`).all();
console.log(protectedDests);

console.log('--- 5. PRAGMA integrity_check & foreign_key_check ---');
console.log('Integrity:', db.pragma('integrity_check'));
console.log('Foreign Keys:', db.pragma('foreign_key_check'));
