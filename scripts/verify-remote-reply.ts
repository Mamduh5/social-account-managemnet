import 'dotenv/config';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { unseal } from '../server/src/services/token-protection.js';

async function main() {
  const account = accountsRepo.getAccountById('acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5')!;
  const token = unseal(account.access_token_encrypted!);

  const replyId = '122196967694464828_1150546540984562';
  const parentCommentId = '122196967694464828_2217010995880398';

  console.log('1. Direct Graph API GET for Reply ID:', replyId);
  const replyRes = await fetch(`https://graph.facebook.com/v26.0/${replyId}?fields=id,message,created_time,from,parent&access_token=${token}`);
  const replyJson = await replyRes.json();
  console.log('Graph API Reply Data:', JSON.stringify(replyJson, null, 2));

  console.log('\n2. Direct Graph API GET for Parent Comment Replies:', parentCommentId);
  const parentRes = await fetch(`https://graph.facebook.com/v26.0/${parentCommentId}/comments?fields=id,message,created_time,from&access_token=${token}`);
  const parentJson = await parentRes.json();
  console.log('Parent Thread Replies:', JSON.stringify(parentJson, null, 2));

  console.log('\n3. Re-attempting duplicate reply send (Must be blocked)...');
  const baseUrl = 'http://127.0.0.1:3001';
  const dupRes = await fetch(`${baseUrl}/api/inbox/comments/cmt-87435c66-002f-4e6c-9ced-4f2b71354105/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Duplicate test attempt' })
  });
  const dupJson = await dupRes.json();
  console.log('Duplicate Attempt Status:', dupRes.status);
  console.log('Duplicate Attempt Response:', JSON.stringify(dupJson, null, 2));
}

main().catch(console.error);
