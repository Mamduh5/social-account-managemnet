async function main() {
  const baseUrl = 'http://127.0.0.1:3001';
  const accountId = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';

  console.log('1. Triggering Inbox Sync for Page แก้บัคยาวๆๆ...');
  const syncRes = await fetch(`${baseUrl}/api/inbox/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId })
  });

  const syncJson = await syncRes.json();
  console.log('Sync Result:', JSON.stringify(syncJson, null, 2));

  console.log('\n2. Fetching Comments from Inbox API...');
  const commentsRes = await fetch(`${baseUrl}/api/inbox/comments?accountId=${accountId}`);
  const commentsJson = await commentsRes.json();
  console.log('Comments Count:', commentsJson.comments?.length);
  console.log('Comments:', JSON.stringify(commentsJson.comments, null, 2));
}

main().catch(console.error);
