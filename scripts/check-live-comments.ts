import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { tokenProtection } from '../server/src/services/token-protection.js';

async function main() {
  const accountId = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';
  const account = accountsRepo.getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  const token = tokenProtection.decrypt(account.access_token_encrypted!);
  const posts = [
    { name: 'Post 1 (Text)', id: '409347032254077_122196967694464828' },
    { name: 'Post 2 (Photo)', id: '409347032254077_122196968060464828' }
  ];

  for (const p of posts) {
    console.log(`\nChecking comments for ${p.name} (${p.id})...`);
    const url = `https://graph.facebook.com/v26.0/${p.id}/comments?fields=id,message,created_time,from,comments{id,message,from,created_time}&access_token=${token}`;
    const res = await fetch(url);
    const json = await res.json();
    console.log('Comments result:', JSON.stringify(json, null, 2));
  }
}

main().catch(console.error);
