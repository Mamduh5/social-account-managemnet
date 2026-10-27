async function main() {
  const baseUrl = 'http://127.0.0.1:3001';
  const accountId = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';
  const commentId = 'cmt-87435c66-002f-4e6c-9ced-4f2b71354105';

  console.log('Fetching reply context for comment:', commentId);
  const res = await fetch(`${baseUrl}/api/assistant/reply-context?accountId=${accountId}&commentId=${commentId}`);
  const json = await res.json();
  console.log('Status code:', res.status);
  console.log('Response:', JSON.stringify(json, null, 2));
}

main().catch(console.error);
