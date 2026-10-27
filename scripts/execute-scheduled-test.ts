import 'dotenv/config';
import Database from 'better-sqlite3';
import { unseal } from '../server/src/services/token-protection.js';

async function main() {
  const base = 'http://127.0.0.1:3001';
  const pageA = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';
  const mediaId = 'img-744803c9-e90d-4ba6-a0b0-2b84c55ace97';

  // Schedule for 75 seconds from now
  const scheduledTime = new Date(Date.now() + 75000).toISOString();
  console.log('Current time (UTC):', new Date().toISOString());
  console.log('Target schedule time (UTC):', scheduledTime);

  const draftPayload = {
    title: '[SCHEDULED TEST] แก้บัคยาวๆๆ — ภาพทดสอบระบบพร้อมกำหนดเวลา',
    contentType: 'image',
    scheduledAt: scheduledTime,
    destinations: [
      {
        accountId: pageA,
        caption: 'ทดสอบการตั้งเวลาเผยแพร่พร้อมรูปภาพ ⏱️📷\n\nระบบ Social Command Center กำลังทดสอบการเผยแพร่ตามกำหนดเวลาอัตโนมัติไปยังเพจ แก้บัคยาวๆๆ',
        hashtags: '#SocialCommandCenter #ตั้งเวลาทดสอบ #แก้บัคยาวๆๆ',
        attachments: [
          {
            mediaId,
            altText: 'ภาพตัวอย่างสำหรับการทดสอบระบบกำหนดเวลา'
          }
        ],
        applyBranding: false
      }
    ]
  };

  // 1. Create Draft
  console.log('Step 1: Saving draft...');
  const saveRes = await fetch(`${base}/api/publishing/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draftPayload)
  });
  const saved = await saveRes.json();
  if (!saveRes.ok) throw new Error('Save draft failed: ' + JSON.stringify(saved));
  const draftId = saved.draft.id;
  console.log('Draft saved:', draftId, 'revision:', saved.draft.revision);

  // 2. Approve Draft
  console.log('Step 2: Approving draft...');
  const appRes = await fetch(`${base}/api/publishing/drafts/${draftId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: saved.draft.revision })
  });
  const approved = await appRes.json();
  if (!appRes.ok) throw new Error('Approve draft failed: ' + JSON.stringify(approved));
  console.log('Draft approved:', approved.draft.status);

  // 3. Queue Draft
  console.log('Step 3: Queuing draft for scheduled dispatch...');
  const queueRes = await fetch(`${base}/api/publishing/drafts/${draftId}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: saved.draft.revision })
  });
  const queued = await queueRes.json();
  if (!queueRes.ok) throw new Error('Queue draft failed: ' + JSON.stringify(queued));
  console.log('Draft queued. Post ID:', queued.postId);

  // 4. Verify initial destination status in SQLite
  const db = new Database('.data/social_command_center.db', { readonly: true });
  let dest = db.prepare('SELECT * FROM publishing_destinations WHERE post_id=?').get(queued.postId) as any;
  console.log('Initial Destination State:', {
    id: dest.id,
    status: dest.status,
    progress: dest.progress,
    scheduledAt: scheduledTime
  });

  if (dest.status !== 'scheduled') {
    throw new Error(`Expected initial status 'scheduled', but got '${dest.status}'`);
  }

  // 5. Wait for scheduled dispatch
  console.log('Step 4: Waiting for scheduled time to arrive and dispatch...');
  const waitMs = Date.parse(scheduledTime) - Date.now() + 10000; // wait until 10s past schedule
  if (waitMs > 0) {
    console.log(`Sleeping for ${Math.round(waitMs / 1000)} seconds...`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  // 6. Poll for completion (up to 30 seconds)
  let publishedDest: any = null;
  for (let i = 0; i < 15; i++) {
    const checkDb = new Database('.data/social_command_center.db', { readonly: true });
    try {
      publishedDest = checkDb.prepare('SELECT * FROM publishing_destinations WHERE post_id=?').get(queued.postId);
      console.log(`Poll ${i + 1}: status = ${publishedDest?.status}, progress = ${publishedDest?.progress}`);
      if (publishedDest?.status === 'published' || publishedDest?.status === 'failed') break;
    } finally {
      checkDb.close();
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Final Destination State:', {
    id: publishedDest.id,
    status: publishedDest.status,
    remote_post_id: publishedDest.remote_post_id,
    remote_post_url: publishedDest.remote_post_url,
    published_at: publishedDest.published_at,
    confirmation_source: publishedDest.confirmation_source,
    error_message: publishedDest.error_message
  });

  if (publishedDest.status !== 'published') {
    throw new Error('Destination did not reach published state: ' + publishedDest.error_message);
  }

  // 7. Verify Remote Facebook Post via Graph API
  const acc = db.prepare('SELECT access_token FROM accounts WHERE id=?').get(pageA) as { access_token: string };
  const token = unseal(acc.access_token);
  const version = process.env.META_GRAPH_VERSION || 'v25.0';

  const remoteUrl = `https://graph.facebook.com/${version}/${publishedDest.remote_post_id}?fields=id,message,created_time,permalink_url,from,attachments{media_type,media,subattachments}`;
  const remoteRes = await fetch(remoteUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const remoteData = await remoteRes.json();
  console.log('Remote Facebook Verification:', JSON.stringify(remoteData, null, 2));

  db.close();
}

main().catch(err => {
  console.error('Scheduled test execution failed:', err);
  process.exitCode = 1;
});
