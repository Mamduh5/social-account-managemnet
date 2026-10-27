import Database from 'better-sqlite3';

const db = new Database('.data/social_command_center.db', { readonly: true });
console.log('=== ACCOUNTS TABLE ===');
const accounts = db.prepare('SELECT id, platform, name, handle, is_demo, created_at FROM accounts').all();
console.log(JSON.stringify(accounts, null, 2));

const cols = db.prepare('PRAGMA table_info(accounts)').all();
console.log('Columns in accounts:', cols.map((c: any) => c.name));
const accDetails = db.prepare('SELECT * FROM accounts').all();
console.log('Account Details:');
console.log(JSON.stringify(accDetails.map((a: any) => ({
  id: a.id,
  platform: a.platform,
  name: a.name,
  handle: a.handle,
  is_demo: a.is_demo,
  account_type: a.account_type,
  created_at: a.created_at
})), null, 2));

console.log('\n=== PROTECTED DESTINATIONS ===');
const dests = db.prepare(`SELECT id, post_id, account_id, status, confirmation_source, remote_post_id, remote_post_url FROM publishing_destinations WHERE id IN ('dest-mvf5hdwf-19hi', 'dest-mvf5j24q-ub0y', 'dest-mvf5j24r-rw4x')`).all();
console.log(JSON.stringify(dests, null, 2));

db.close();
