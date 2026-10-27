import 'dotenv/config';
import Database from 'better-sqlite3';
import { unseal } from '../server/src/services/token-protection.js';

async function main() {
  const postId = process.argv[2] || '409347032254077_122196967694464828';
  const db = new Database('.data/social_command_center.db', { readonly: true });
  const acc = db.prepare('SELECT access_token FROM accounts WHERE id=?').get('acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5') as { access_token: string };
  const token = unseal(acc.access_token);
  const version = process.env.META_GRAPH_VERSION || 'v25.0';

  const url = `https://graph.facebook.com/${version}/${postId}?fields=id,message,created_time,permalink_url,from`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
  db.close();
}

main().catch(console.error);
