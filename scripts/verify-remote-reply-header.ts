import 'dotenv/config';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { unseal } from '../server/src/services/token-protection.js';

async function main() {
  const account = accountsRepo.getAccountById('acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5')!;
  const token = unseal(account.access_token_encrypted!);

  const replyId = '122196967694464828_1150546540984562';
  const parentCommentId = '122196967694464828_2217010995880398';

  console.log('1. Direct Graph API GET for Reply ID with Bearer header:', replyId);
  const replyRes = await fetch(`https://graph.facebook.com/v26.0/${replyId}?fields=id,message,created_time,from,parent`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const replyJson = await replyRes.json();
  console.log('Graph API Reply Data:', JSON.stringify(replyJson, null, 2));

  console.log('\n2. Direct Graph API GET for Parent Comment with replies:');
  const parentRes = await fetch(`https://graph.facebook.com/v26.0/${parentCommentId}?fields=id,message,from,comments{id,message,from,created_time}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const parentJson = await parentRes.json();
  console.log('Parent Thread Data:', JSON.stringify(parentJson, null, 2));
}

main().catch(console.error);
