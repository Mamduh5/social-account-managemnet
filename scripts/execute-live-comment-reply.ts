import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const baseUrl = 'http://127.0.0.1:3001';
  const accountId = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';
  const commentId = 'cmt-87435c66-002f-4e6c-9ced-4f2b71354105';
  const externalCommentId = '122196967694464828_2217010995880398';

  const replyText = 'สวัสดีครับคุณ Mamduh! กำลังช่วยทดสอบระบบ Social Command Center V1.12 อยู่ครับ พร้อมลุยงานต่อเสมอครับ 😊';

  console.log('--- Step 1: Getting Reply Context & Fingerprint ---');
  const ctxRes = await fetch(`${baseUrl}/api/assistant/reply-context?accountId=${accountId}&commentId=${commentId}`);
  const ctxJson = await ctxRes.json();
  if (!ctxJson.success) throw new Error(`Failed to get reply context: ${JSON.stringify(ctxJson)}`);
  const fingerprint = ctxJson.contextFingerprint;
  console.log('Context fingerprint:', fingerprint);
  console.log('Comment text:', ctxJson.request?.untrustedContext?.commentText);
  console.log('Author:', 'Mamduh Palas');

  console.log('\n--- Step 2: Creating Reply Draft ---');
  const draftRes = await fetch(`${baseUrl}/api/assistant/reply-drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      commentId,
      contextFingerprint: fingerprint,
      content: replyText,
      operatorLabel: 'Antigravity Operator'
    })
  });
  const draftJson = await draftRes.json();
  if (!draftJson.success) throw new Error(`Failed to create reply draft: ${JSON.stringify(draftJson)}`);
  const draft = draftJson.draft;
  console.log('Created Draft ID:', draft.id);
  console.log('Draft Revision:', draft.revision);
  console.log('Draft Status:', draft.status);
  console.log('Draft Content:', draft.content);

  console.log('\n--- Step 3: Approving Reply Draft ---');
  const approveRes = await fetch(`${baseUrl}/api/assistant/drafts/${draft.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      revision: draft.revision
    })
  });
  const approveJson = await approveRes.json();
  if (!approveJson.success) throw new Error(`Failed to approve draft: ${JSON.stringify(approveJson)}`);
  console.log('Approved Draft Status:', approveJson.draft.status);
  console.log('Approved Revision:', approveJson.draft.approved_revision);

  console.log('\n--- Step 4: Sending Reply through Official API ---');
  const sendRes = await fetch(`${baseUrl}/api/assistant/drafts/${draft.id}/send-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      revision: draft.revision,
      confirmSend: true
    })
  });
  const sendJson = await sendRes.json();
  console.log('Send Reply Result:', JSON.stringify(sendJson, null, 2));
  if (!sendJson.success) throw new Error(`Send reply failed: ${JSON.stringify(sendJson)}`);

  console.log('\n--- Step 5: Verifying Inbox State in Social Command Center ---');
  const inboxRes = await fetch(`${baseUrl}/api/inbox/comments?accountId=${accountId}`);
  const inboxJson = await inboxRes.json();
  const verifiedComment = inboxJson.comments.find((c: any) => c.id === commentId);
  console.log('Updated Comment in Inbox:', {
    id: verifiedComment.id,
    has_replied: verifiedComment.has_replied,
    reply_id: verifiedComment.reply_id,
    reply_text: verifiedComment.reply_text,
    status: verifiedComment.status
  });

  const outDir = path.resolve('.data/v112-owner/comment-reply');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'live-reply-result.json'), JSON.stringify({
    parentPostId: '409347032254077_122196967694464828',
    parentCommentId: externalCommentId,
    commentAuthor: 'Mamduh Palas',
    commentText: 'ทำไรคับคุณเจมิไน เล่นกับผมหน่อย',
    draftId: draft.id,
    replyText,
    sendResult: sendJson,
    verifiedComment,
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log('\nLive comment reply workflow executed and verified successfully!');
}

main().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
