import 'dotenv/config';
import Database from 'better-sqlite3';
import { unseal } from '../server/src/services/token-protection.js';

async function main() {
  const db = new Database('.data/social_command_center.db', { readonly: true });
  const acc = db.prepare('SELECT access_token FROM accounts WHERE id=?').get('acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5') as { access_token: string };
  const token = unseal(acc.access_token);
  const version = process.env.META_GRAPH_VERSION || 'v25.0';

  const posts = [
    '409347032254077_122196967694464828',
    '409347032254077_122196968060464828',
    '1636270773663086',
    '1636151757008321'
  ];

  for (const post of posts) {
    const url = `https://graph.facebook.com/${version}/${post}/comments?fields=id,message,from,created_time,parent`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    console.log(`Post ${post}:`, JSON.stringify(data));
  }

  // Also check local database comments table
  const localComments = db.prepare('SELECT * FROM comments WHERE account_id=?').all('acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5');
  console.log('Local comments in DB:', JSON.stringify(localComments));

  db.close();
}

main().catch(console.error);
