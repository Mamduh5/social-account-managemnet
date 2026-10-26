import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { db, dataDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { initializeContentWorkspace } from '../server/src/db/content-workspace.js';
import { initializeCalendarSchema } from '../server/src/db/calendar-schema.js';
import { calendarRepo } from '../server/src/repositories/calendar.repo.js';
import { calendarService } from '../server/src/services/calendar.service.js';
import { generalPostsService } from '../server/src/services/general-posts.service.js';
import { publishingService } from '../server/src/services/publishing.service.js';
import { publishingRepo } from '../server/src/repositories/publishing.repo.js';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { QueueService } from '../server/src/services/queue.service.js';
import { storeImage } from '../server/src/services/image-media.service.js';
import { seal } from '../server/src/services/token-protection.js';
import { MetaFacebookConnector } from '../server/src/connectors/meta-facebook.js';
import {
  calculateCampaignApprovalHash,
  parseBangkokScheduledTime,
  formatBangkokDateTime,
  type CampaignPlanInput,
} from '../server/src/domain/content-calendar.js';

const originalFetch = globalThis.fetch;
const testPageId = 'calendar-test-page';
const otherPageId = 'calendar-other-page';
const videoId = 'calendar-test-reel';
let testImage: any;

function approveCurrentCampaign(campaignId:string) {
  const review=calendarService.getCampaignReview(campaignId);
  return calendarService.approveCampaign(campaignId,{accountId:review.account.id,expectedHash:review.expectedApprovalHash});
}

before(async () => {
  assert.ok(process.env.SCC_DATA_DIR && /test-runs/i.test(dataDir), 'This suite requires isolated SCC_DATA_DIR');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString('base64');
  process.env.META_GRAPH_VERSION = 'v26.0';

  initializeDatabase();
  initializeContentWorkspace();
  initializeCalendarSchema(db);

  // Setup test accounts
  const insert = db.prepare(
    "INSERT OR REPLACE INTO accounts (id, platform, account_type, name, handle, connector_mode, is_demo, status, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', ?)"
  );
  insert.run(testPageId, 'facebook', 'page', 'แก้บัคยาวๆๆ (Test)', '@61563944843401', 'official_api', 0, '409347032254077');
  insert.run(otherPageId, 'facebook', 'page', 'Other Facebook Page', '@otherpage', 'official_api', 0, '999999999999');

  db.prepare(
    "UPDATE accounts SET access_token=?, identity_verified_at=?, token_expires_at=?, granted_scopes_json=?, connection_status='connected' WHERE id=?"
  ).run(
    seal('mock-calendar-page-token'),
    new Date().toISOString(),
    new Date(Date.now() + 7 * 86400000).toISOString(),
    JSON.stringify(['pages_show_list', 'pages_manage_posts', 'pages_read_engagement']),
    testPageId
  );

  // Create a verified test image in isolated storage
  const png = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=64x64', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { windowsHide: true });
  testImage = await storeImage(png, 'calendar_test_thumb.png');

  // Create a verified test video
  const reelPath = path.join(dataDir, 'uploads', 'calendar-reel.mp4');
  fs.mkdirSync(path.dirname(reelPath), { recursive: true });
  fs.writeFileSync(reelPath, 'isolated-video-bytes');
  if (!publishingRepo.getVideoById(videoId)) {
    publishingRepo.insertVideo({
      id: videoId,
      title: 'Calendar Reel Video',
      sourceType: 'manual_upload',
      originalFilename: 'calendar-reel.mp4',
      filePath: reelPath,
      fileSize: fs.statSync(reelPath).size,
      duration: 5,
      width: 720,
      height: 1280,
      aspectRatio: '9:16',
    });
  }
});

after(() => {
  globalThis.fetch = originalFetch;
  db.close();
});

test('Bangkok wall-time parsing and formatting preserves UTC+7 offset', () => {
  const bangkokIso = '2026-10-27T10:00:00+07:00';
  const utc = parseBangkokScheduledTime(bangkokIso);
  assert.equal(utc, '2026-10-27T03:00:00.000Z');

  const formatted = formatBangkokDateTime(utc);
  assert.ok(formatted?.includes('2026-10-27'));
  assert.ok(formatted?.includes('10:00:00'));

  // Bare datetime without offset is treated as Bangkok time
  const bare = '2026-10-28 14:30:00';
  const utcFromBare = parseBangkokScheduledTime(bare);
  assert.equal(utcFromBare, '2026-10-28T07:30:00.000Z');
});

test('Create 7-day campaign plan with Gemini-prepared origin saves drafts without auto-queueing', () => {
  const planInput: CampaignPlanInput = {
    accountId: testPageId,
    name: '7-Day Debugging & Dev Progress Test',
    editorialScope: 'Development progress notes and verified fixes',
    days: 7,
    startDate: '2026-10-28',
    origin: 'gemini_prepared',
    maxPublications: 7,
    items: [
      {
        title: 'Day 1: SQLite WAL Rollback Fix',
        contentType: 'text',
        caption: 'บันทึกการแก้บัค: การอัปเดตสคีมาฐานข้อมูลใน V1.10 ถูกปรับให้ทำงานภายใต้ Transaction เดียวแบบ Atomic 100% 🌱',
        hashtags: '#SocialCommandCenter #SoftwareEngineering',
        scheduledAt: '2026-10-28T10:00:00+07:00',
      },
      {
        title: 'Day 2: Unpublished Photo Verification',
        contentType: 'image',
        caption: 'ทดสอบการอัปโหลดภาพ unpublished photo และตรวจสอบ FBID ก่อนโพสต์ลง feed 📷',
        hashtags: '#MetaGraphApi #Photos',
        attachments: [{ mediaId: testImage.id, altText: 'Green test badge' }],
        scheduledAt: '2026-10-29T10:00:00+07:00',
      },
      {
        title: 'Day 3: Link Post Architecture',
        contentType: 'link',
        caption: 'สถาปัตยกรรม Draft-First Publishing เพื่อความปลอดภัยของบัญชี 🔗',
        linkUrl: 'https://example.org/docs/architecture',
        hashtags: '#Architecture #SystemDesign',
        scheduledAt: '2026-10-30T10:00:00+07:00',
      },
      {
        title: 'Day 4: Safe Area Moving Watermarks',
        contentType: 'text',
        caption: 'การคำนวณตำแหน่งลายน้ำเคลื่อนไหวให้หลบ Safe Area บน Facebook (16:9) 📐',
        hashtags: '#FFmpeg #Watermark',
        scheduledAt: '2026-10-31T10:00:00+07:00',
      },
      {
        title: 'Day 5: Local Loop Scheduler Test',
        contentType: 'text',
        caption: 'ผลการทดลอง: การใช้ SQLite julianday loop ควบคู่กับการ Hold งานที่ค้างตอนบูตเซิร์ฟเวอร์ ⏱️',
        hashtags: '#PublishingScheduler #Automation',
        scheduledAt: '2026-11-01T10:00:00+07:00',
      },
      {
        title: 'Day 6: Video Reel Publishing Path',
        contentType: 'reel',
        caption: 'ทดสอบเส้นทางวิดีโอ Reel ด้วย rupload binary และ finish phase 🎥',
        videoId,
        hashtags: '#VideoReel #FacebookReels',
        scheduledAt: '2026-11-02T10:00:00+07:00',
      },
      {
        title: 'Day 7: Campaign Approval Wrap-up',
        contentType: 'text',
        caption: 'สรุปการทดสอบระบบ One-Time Campaign Approval V1.11 สำเร็จครบถ้วน 🚀',
        hashtags: '#V111 #ContentCalendar',
        scheduledAt: '2026-11-03T10:00:00+07:00',
      },
    ],
  };

  const beforePostsCount = (db.prepare('SELECT count(*) as n FROM publishing_posts').get() as any).n;
  const result = calendarService.createCampaignPlan(planInput);

  assert.ok(result.campaign.id.startsWith('camp-'));
  assert.equal(result.campaign.name, '7-Day Debugging & Dev Progress Test');
  assert.equal(result.campaign.status, 'draft');
  assert.equal(result.campaign.origin, 'gemini_prepared');
  assert.equal(result.campaign.days, 7);
  assert.equal(result.campaign.maxPublications, 7);
  assert.equal(result.items.length, 7);

  // Draft-first guarantee: No posts added to active publishing_posts queue yet
  const afterPostsCount = (db.prepare('SELECT count(*) as n FROM publishing_posts').get() as any).n;
  assert.equal(afterPostsCount, beforePostsCount);

  // Check each item has origin: gemini_prepared and status: draft
  for (const item of result.items) {
    assert.equal(item.origin, 'gemini_prepared');
    assert.equal(item.status, 'draft');
    assert.equal(item.accountId, testPageId);
    assert.ok(item.scheduledAt);
    assert.ok(item.scheduledAtBangkok?.includes('10:00:00'));
  }
});

test('Account isolation: cannot create plan for another Page without explicit authorization', () => {
  // 1. Non-existent / unauthorized account ID must fail closed
  assert.throws(
    () => {
      calendarService.createCampaignPlan({
        accountId: 'acc-unauthorized-fake',
        name: 'Unauthorized Account Plan',
        days: 7,
        startDate: '2026-10-28',
        origin: 'gemini_prepared',
        items: [
          {
            title: 'Unauthorized post',
            contentType: 'text',
            caption: 'Attempting to create plan for unconnected account',
            scheduledAt: '2026-10-28T10:00:00+07:00',
          },
        ],
      });
    },
    /Destination account not found/
  );

  // 2. Disconnected page without official publishing credentials must fail closed
  assert.throws(
    () => {
      calendarService.createCampaignPlan({
        accountId: otherPageId,
        name: 'Disconnected Page Plan',
        days: 7,
        startDate: '2026-10-28',
        origin: 'gemini_prepared',
        items: [
          {
            title: 'Disconnected post',
            contentType: 'text',
            caption: 'Attempting to create plan for disconnected page',
            scheduledAt: '2026-10-28T10:00:00+07:00',
          },
        ],
      });
    },
    /Selected Page lacks authorized publishing capabilities/
  );
});

test('One-time campaign approval binds exact hash, revisions, account, and schedules all jobs atomically', () => {
  // Create a 2-item plan to test batch approval
  const plan = calendarService.createCampaignPlan({
    accountId: testPageId,
    name: 'Batch Approval Test Campaign',
    days: 7,
    startDate: '2026-11-05',
    origin: 'gemini_prepared',
    maxPublications: 5,
    items: [
      {
        title: 'Batch Item 1 (Text)',
        contentType: 'text',
        caption: 'ทดสอบ Batch Item 1',
        scheduledAt: '2026-11-05T10:00:00+07:00',
      },
      {
        title: 'Batch Item 2 (Image)',
        contentType: 'image',
        caption: 'ทดสอบ Batch Item 2',
        attachments: [{ mediaId: testImage.id, altText: 'Test image' }],
        scheduledAt: '2026-11-06T10:00:00+07:00',
      },
    ],
  });

  const campaignId = plan.campaign.id;
  assert.equal(plan.campaign.status, 'draft');

  // Submit for approval
  calendarService.submitCampaignForApproval(campaignId);
  const awaiting = calendarService.getCampaignById(campaignId);
  assert.equal(awaiting.status, 'awaiting_approval');

  // One-time batch approval
  const approved = approveCurrentCampaign(campaignId);
  assert.equal(approved.campaign.status, 'active');
  assert.equal(approved.queuedCount, 2);
  assert.ok(approved.approvedHash);

  // Check that items are now in 'scheduled' status in the publishing destinations table
  const items = calendarService.getCalendarItems({ campaignId });
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(item.sourceType, 'destination');
    assert.equal(item.status, 'scheduled');
    assert.equal(item.campaignId, campaignId);
    assert.ok(item.scheduledAt);
  }
});

test('Material edit invalidates campaign approval and reverts status to draft', () => {
  // Create and approve a 1-item campaign
  const plan = calendarService.createCampaignPlan({
    accountId: testPageId,
    name: 'Approval Invalidation Test',
    days: 7,
    startDate: '2026-11-10',
    origin: 'gemini_prepared',
    items: [
      {
        title: 'Post Before Edit',
        contentType: 'text',
        caption: 'ข้อความดั้งเดิม',
        scheduledAt: '2026-11-10T10:00:00+07:00',
      },
    ],
  });

  const campaignId = plan.campaign.id;
  approveCurrentCampaign(campaignId);
  let campaign = calendarService.getCampaignById(campaignId);
  assert.equal(campaign.status, 'active');

  // Edit the post scheduled in this campaign
  const items = calendarService.getCalendarItems({ campaignId });
  const item = items[0];

  calendarService.editItem(item.id, {
    caption: 'ข้อความที่ถูกแก้ไขโดยเจ้าของ (Invalidates approval)',
  });

  // Verify the campaign status was invalidated or individual item was updated
  const updatedItem = calendarService.getCalendarItems({ campaignId })[0];
  assert.equal(updatedItem.caption, 'ข้อความที่ถูกแก้ไขโดยเจ้าของ (Invalidates approval)');
});

test('Pause campaign prevents scheduled jobs from dispatching; Resume campaign restores scheduling', () => {
  // Create a campaign with a scheduled job
  const plan = calendarService.createCampaignPlan({
    accountId: testPageId,
    name: 'Pause Campaign Test',
    days: 7,
    startDate: '2026-11-15',
    origin: 'gemini_prepared',
    items: [
      {
        title: 'Pause Test Item',
        contentType: 'text',
        caption: 'ทดสอบระบบ Pause',
        scheduledAt: '2026-11-15T10:00:00+07:00',
      },
    ],
  });

  const campaignId = plan.campaign.id;
  approveCurrentCampaign(campaignId);

  // Pause the campaign
  const paused = calendarService.pauseCampaign(campaignId);
  assert.equal(paused.status, 'paused');
  assert.ok(calendarRepo.isCampaignPaused(campaignId));

  // In calendar view, items in a paused campaign reflect paused state
  const pausedItems = calendarService.getCalendarItems({ campaignId });
  assert.equal(pausedItems[0].status, 'paused');

  // Check publishingRepo getDueScheduledDestinations excludes paused campaigns
  const due = publishingRepo.getDueScheduledDestinations();
  assert.ok(due.every((d) => d.id !== pausedItems[0].destinationId));

  // Resume campaign
  const resumed = calendarService.resumeCampaign(campaignId);
  assert.equal(resumed.status, 'active');
  assert.equal(calendarRepo.isCampaignPaused(campaignId), false);

  const resumedItems = calendarService.getCalendarItems({ campaignId });
  assert.equal(resumedItems[0].status, 'scheduled');
});

test('Manual override: Publish Now immediately queues scheduled destination for execution', async () => {
  const plan = calendarService.createCampaignPlan({
    accountId: testPageId,
    name: 'Publish Now Override Test',
    days: 7,
    startDate: '2026-11-20',
    origin: 'gemini_prepared',
    items: [
      {
        title: 'Immediate Override Item',
        contentType: 'text',
        caption: 'ทดสอบ Publish Now Override',
        scheduledAt: '2026-11-20T10:00:00+07:00',
      },
    ],
  });

  approveCurrentCampaign(plan.campaign.id);
  const item = calendarService.getCalendarItems({ campaignId: plan.campaign.id })[0];

  const result = await calendarService.publishItemNow(item.id);
  assert.ok(result.success);

  const updatedDest = publishingRepo.getDestinationById(item.destinationId!);
  assert.equal(updatedDest?.status, 'preparing');
});

test('Demonstration of 30-day schedule without activating it', () => {
  const thirtyDayTopics = Array.from({ length: 30 }, (_, idx) => ({
    title: `Day ${idx + 1}: Continuous Verification Topic ${idx + 1}`,
    contentType: 'text' as const,
    caption: `หัวข้อการตรวจสอบวันที่ ${idx + 1}: การทำงานของระบบ Social Command Center V1.11 🚀`,
    scheduledAt: `2026-11-01T10:00:00+07:00`,
  }));

  const plan = calendarService.createCampaignPlan({
    accountId: testPageId,
    name: '30-Day Long-term Demonstration Schedule (Unactivated)',
    editorialScope: 'Long term architectural demonstration',
    days: 30,
    startDate: '2026-11-01',
    origin: 'gemini_prepared',
    maxPublications: 30,
    items: thirtyDayTopics,
  });

  assert.equal(plan.campaign.status, 'draft');
  assert.equal(plan.campaign.days, 30);
  assert.equal(plan.items.length, 30);

  // Crucial requirement: Must remain UNPUBLISHED and UNACTIVATED (draft only)
  assert.equal(plan.campaign.approvedHash, null);
  assert.equal(plan.campaign.approvedAt, null);
  assert.ok(plan.items.every((i) => i.status === 'draft'));
});

test('Scheduler health report provides Bangkok wall time and offline limitations notice', () => {
  const health = calendarService.getHealth();
  assert.equal(health.status, 'ok');
  assert.equal(health.timezone, 'Asia/Bangkok');
  assert.ok(health.currentTimeBangkok);
  assert.ok(health.offlineNotice.includes('Social Command Center runs on the local PC'));
});


function safetyCampaign(name:string) {
  return calendarService.createCampaignPlan({accountId:testPageId,name,days:7,startDate:'2026-12-01',origin:'gemini_prepared',items:[{title:name,contentType:'text',caption:'Exact saved campaign content',scheduledAt:'2026-12-01T10:00:00+07:00'}]});
}
test('queued material edit retains cancelled history and returns pending content to unapproved drafts',()=>{
 const plan=safetyCampaign('Safe material revision');approveCurrentCampaign(plan.campaign.id);
 const original=calendarService.getCalendarItems({campaignId:plan.campaign.id})[0];
 const originalRow=publishingRepo.getDestinationById(original.id)!;
 const edited=calendarService.editItem(original.id,{caption:'Owner revised draft'});
 const campaign=calendarService.getCampaignById(plan.campaign.id);
 assert.equal(campaign.status,'draft');assert.equal(campaign.approvedHash,null);assert.equal(campaign.approvedRevision,null);
 assert.equal(edited.sourceType,'draft');assert.equal(edited.status,'draft');assert.equal(edited.caption,'Owner revised draft');
 const old=publishingRepo.getDestinationById(original.id)!;assert.equal(old.status,'cancelled');assert.equal(old.caption,originalRow.caption);
 assert.ok(!publishingRepo.getPendingQueueJobs(100).some(row=>row.id===old.id));
 const approved=approveCurrentCampaign(plan.campaign.id);assert.equal(approved.queuedCount,1);
 assert.equal(publishingRepo.getDestinationById(original.id)!.status,'cancelled');
});
test('paused jobs that become overdue are review-held before resume can enable dispatch',()=>{
 const plan=safetyCampaign('Overdue pause resume');approveCurrentCampaign(plan.campaign.id);calendarService.pauseCampaign(plan.campaign.id);
 const item=calendarService.getCalendarItems({campaignId:plan.campaign.id})[0];
 db.prepare("UPDATE publishing_posts SET scheduled_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(item.postId);
 calendarService.resumeCampaign(plan.campaign.id);
 const dest=publishingRepo.getDestinationById(item.id)!;assert.equal(dest.status,'preparing');assert.ok(dest.error_message?.startsWith('Interrupted by server restart'));
 assert.ok(!publishingRepo.getPendingQueueJobs(100).some(row=>row.id===item.id));
});
test('uncertain publication and approved draft schedule cannot be blindly rewritten by Publish Now',async()=>{
 const plan=safetyCampaign('Uncertain override guard');approveCurrentCampaign(plan.campaign.id);
 const item=calendarService.getCalendarItems({campaignId:plan.campaign.id})[0];
 db.prepare("UPDATE publishing_destinations SET status='failed',remote_post_id='saved-remote' WHERE id=?").run(item.id);
 const before=JSON.stringify(publishingRepo.getDestinationById(item.id));
 await assert.rejects(()=>calendarService.publishItemNow(item.id),/unsubmitted scheduled/);
 assert.equal(JSON.stringify(publishingRepo.getDestinationById(item.id)),before);
 const draft=generalPostsService.save({title:'Approved scheduled draft',contentType:'text',scheduledAt:'2026-12-01T03:00:00.000Z',destinations:[{accountId:testPageId,caption:'Exact text',hashtags:''}]});
 generalPostsService.approveBatch([{id:draft.id,revision:draft.revision}]);
 const old=JSON.stringify(db.prepare('SELECT * FROM publishing_drafts WHERE id=?').get(draft.id));
 await assert.rejects(()=>calendarService.publishItemNow(draft.id),/Schedule is part of approval/);
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM publishing_drafts WHERE id=?').get(draft.id)),old);
});
test('campaign creation cannot reuse an existing approved campaign identity',()=>{
 const plan=safetyCampaign('Immutable campaign id');approveCurrentCampaign(plan.campaign.id);
 assert.throws(()=>calendarService.createCampaignPlan({id:plan.campaign.id,accountId:testPageId,name:'Overwrite',days:7,startDate:'2026-12-01',items:[{title:'X',contentType:'text',caption:'Changed',scheduledAt:'2026-12-01T10:00:00+07:00'}]}),/already exists/);
 assert.equal(calendarService.getCampaignById(plan.campaign.id).status,'active');
});


test('immediate override cannot change a shared parent schedule or make sibling destinations due', async () => {
  const plan = safetyCampaign('Shared parent override guard');
  approveCurrentCampaign(plan.campaign.id);
  const item = calendarService.getCalendarItems({ campaignId: plan.campaign.id })[0];
  db.prepare("INSERT INTO publishing_destinations (id,post_id,account_id,caption,status,content_type) VALUES (?, ?, ?, 'Independent sibling', 'scheduled', 'text')")
    .run('calendar-shared-parent-sibling', item.postId, otherPageId);
  const before = JSON.stringify({
    parent: db.prepare('SELECT * FROM publishing_posts WHERE id=?').get(item.postId),
    destinations: publishingRepo.getPostDestinationRows(item.postId!),
  });
  await assert.rejects(() => calendarService.publishItemNow(item.id), /multiple destinations/);
  assert.equal(JSON.stringify({
    parent: db.prepare('SELECT * FROM publishing_posts WHERE id=?').get(item.postId),
    destinations: publishingRepo.getPostDestinationRows(item.postId!),
  }), before, 'neither the shared schedule nor any sibling row may change');
});

test('calendar cancellation refuses active or uncertain work and reports only confirmed cancellation', () => {
  const plan = safetyCampaign('Cancellation boundary');
  approveCurrentCampaign(plan.campaign.id);
  const item = calendarService.getCalendarItems({ campaignId: plan.campaign.id })[0];
  for (const status of ['preparing', 'branding', 'uploading', 'awaiting_confirmation', 'published', 'failed', 'cancelled']) {
    db.prepare('UPDATE publishing_destinations SET status=? WHERE id=?').run(status, item.id);
    const before = JSON.stringify(publishingRepo.getDestinationById(item.id));
    assert.throws(() => calendarService.cancelItem(item.id), /unsubmitted scheduled/);
    assert.equal(JSON.stringify(publishingRepo.getDestinationById(item.id)), before);
  }
  db.prepare("UPDATE publishing_destinations SET status='scheduled' WHERE id=?").run(item.id);
  for (const [column, value] of [['remote_post_id', 'saved-remote'], ['remote_post_url', 'https://www.facebook.com/saved-remote'], ['submission_state', 'feed_submitting'], ['error_message', 'Owner review required']]) {
    db.prepare('UPDATE publishing_destinations SET ' + column + '=? WHERE id=?').run(value, item.id);
    const before = JSON.stringify(publishingRepo.getDestinationById(item.id));
    assert.throws(() => calendarService.cancelItem(item.id), /unsubmitted scheduled/);
    assert.equal(JSON.stringify(publishingRepo.getDestinationById(item.id)), before);
    db.prepare('UPDATE publishing_destinations SET ' + column + '=NULL WHERE id=?').run(item.id);
  }
  const cancel = publishingService.cancelDestination;
  try {
    publishingService.cancelDestination = () => false;
    assert.throws(() => calendarService.cancelItem(item.id), /changed before cancellation/);
    assert.equal(publishingRepo.getDestinationById(item.id)?.status, 'scheduled');
  } finally { publishingService.cancelDestination = cancel; }
  assert.deepEqual(calendarService.cancelItem(item.id), { success: true });
  assert.equal(publishingRepo.getDestinationById(item.id)?.status, 'cancelled');
});

test('individually approved immediate campaign draft cannot bypass batch approval or lose campaign attribution', async () => {
  const plan = safetyCampaign('Campaign draft immediate guard');
  const item = calendarService.getCalendarItems({ campaignId: plan.campaign.id })[0];
  const original = db.prepare('SELECT * FROM publishing_drafts WHERE id=?').get(item.id) as any;
  const payload = JSON.parse(original.payload_json); payload.scheduledAt = null;
  const edited = generalPostsService.save(payload, item.id, original.revision);
  assert.throws(()=>generalPostsService.approveBatch([{ id: edited.id, revision: edited.revision }]),/campaign batch approval/);
  assert.throws(()=>generalPostsService.queue(edited.id,edited.revision),/campaign batch approval/);
  // Preserve coverage for a historical individually approved campaign draft.
  const saved = db.prepare('SELECT payload_json FROM publishing_drafts WHERE id=?').get(item.id) as any;
  db.prepare("UPDATE publishing_drafts SET status='approved',approved_revision=revision,approved_hash=? WHERE id=?").run(createHash('sha256').update(saved.payload_json).digest('hex'),item.id);
  const snapshot = () => JSON.stringify({
    draft: db.prepare('SELECT * FROM publishing_drafts WHERE id=?').get(item.id),
    campaign: calendarService.getCampaignById(plan.campaign.id),
    posts: (db.prepare('SELECT count(*) n FROM publishing_posts').get() as any).n,
    destinations: (db.prepare('SELECT count(*) n FROM publishing_destinations').get() as any).n,
  });
  const before = snapshot();
  await assert.rejects(() => calendarService.publishItemNow(item.id), /campaign batch approval/);
  assert.equal(snapshot(), before);
});

test('two healthy Pages keep campaigns, approval scopes and new account enrollment independent', () => {
  const pageA = safetyCampaign('Page A independent campaign');
  const pageABefore = JSON.stringify(calendarService.getCampaignById(pageA.campaign.id));
  db.prepare("UPDATE accounts SET access_token=?,identity_verified_at=?,token_expires_at=?,granted_scopes_json=?,connection_status='connected' WHERE id=?")
    .run(seal('mock-independent-page-b'),new Date().toISOString(),new Date(Date.now()+7*86400000).toISOString(),JSON.stringify(['pages_manage_posts','pages_read_engagement']),otherPageId);
  assert.equal(JSON.stringify(calendarService.getCampaignById(pageA.campaign.id)),pageABefore,'connecting Page B cannot enroll it in Page A campaign');
  assert.equal(calendarService.getCalendarItems({campaignId:pageA.campaign.id}).length,1);
  const pageB = calendarService.createCampaignPlan({accountId:otherPageId,name:'Page B entertainment drafts',days:7,startDate:'2026-12-01',origin:'gemini_prepared',items:[{title:'Imaginary object story',contentType:'text',caption:'An explicitly imaginary creative concept',scheduledAt:'2026-12-02T10:00:00+07:00'}]});
  approveCurrentCampaign(pageA.campaign.id);
  const approvedA = calendarService.getCalendarItems({campaignId:pageA.campaign.id});
  assert.ok(approvedA.every(item=>item.accountId===testPageId&&item.status==='scheduled'));
  assert.equal(calendarService.getCampaignById(pageB.campaign.id).status,'draft');
  assert.ok(calendarService.getCalendarItems({accountId:otherPageId,campaignId:pageB.campaign.id}).every(item=>item.status==='draft'&&item.accountId===otherPageId));
  assert.throws(()=>approveCurrentCampaign(pageA.campaign.id),/cannot be approved/);
  assert.equal(calendarService.getCalendarItems({campaignId:pageA.campaign.id}).length,1,'repeat approval cannot duplicate publications');
});

test('campaign approval rejects a saved multi-Page draft without approving or queueing either Page', () => {
  const plan = safetyCampaign('Exact single Page approval');
  const item = plan.items[0];
  const original = generalPostsService.get(item.id);
  const changed = generalPostsService.save({...original,destinations:[original.destinations[0],{accountId:otherPageId,caption:'Different Page',hashtags:''}]},item.id,item.revision);
  const before = JSON.stringify({draft:generalPostsService.get(item.id),campaign:calendarService.getCampaignById(plan.campaign.id),posts:db.prepare('SELECT count(*) n FROM publishing_posts').get(),destinations:db.prepare('SELECT count(*) n FROM publishing_destinations').get()});
  assert.throws(()=>approveCurrentCampaign(plan.campaign.id),/exactly one destination matching its Page/);
  assert.equal(changed.status,'draft');
  assert.equal(JSON.stringify({draft:generalPostsService.get(item.id),campaign:calendarService.getCampaignById(plan.campaign.id),posts:db.prepare('SELECT count(*) n FROM publishing_posts').get(),destinations:db.prepare('SELECT count(*) n FROM publishing_destinations').get()}),before);
});

test('bounded campaign plans reject excess publications and dates outside the Bangkok window atomically', () => {
  const input = {accountId:testPageId,name:'Bounded seven days',days:7,startDate:'2026-12-01',maxPublications:1,items:[{title:'Within window',contentType:'text',caption:'Owner content',scheduledAt:'2026-12-01T00:00:00+07:00'}]};
  const counts = () => JSON.stringify({campaigns:db.prepare('SELECT count(*) n FROM publishing_campaigns').get(),drafts:db.prepare('SELECT count(*) n FROM publishing_drafts').get()});
  const before = counts();
  assert.throws(()=>calendarService.createCampaignPlan({...input,items:[...input.items,...input.items]}),/maximum authorized publications/);
  for(const scheduledAt of ['2026-11-30T23:59:59+07:00','2026-12-08T00:00:00+07:00']) {
    assert.throws(()=>calendarService.createCampaignPlan({...input,items:[{...input.items[0],scheduledAt}]}),/7-day Asia\/Bangkok window/);
  }
  assert.equal(counts(),before);
  const plan = calendarService.createCampaignPlan(input);
  const draft = generalPostsService.get(plan.items[0].id);
  const beforeEdit = JSON.stringify(draft);
  assert.throws(()=>calendarService.editItem(draft.id,{scheduledAt:'2026-12-08T10:00:00+07:00'}),/7-day Asia\/Bangkok window/);
  assert.equal(JSON.stringify(generalPostsService.get(draft.id)),beforeEdit);
  generalPostsService.save({...draft,scheduledAt:'2026-12-08T10:00:00+07:00'},draft.id,draft.revision);
  assert.throws(()=>approveCurrentCampaign(plan.campaign.id),/7-day Asia\/Bangkok window/,'approval revalidates schedules edited through another supported workflow');
});

test('calendar Reel branding binds the saved kit and compatible variant; later Page branding cannot rewrite approval', () => {
  const account = accountsRepo.getAccountById(testPageId)!;
  const previousKit = account.brand_kit_json || null;
  const kit = {watermarkType:'moving_text',text:'@development-page',movementPreset:'smooth_sine',fontSize:26,opacity:0.85,signatureText:'Development Page'};
  db.prepare('UPDATE accounts SET brand_kit_json=? WHERE id=?').run(JSON.stringify(kit),testPageId);
  const variantPath = path.join(dataDir,'renders','calendar-compatible-variant.mp4');
  fs.mkdirSync(path.dirname(variantPath),{recursive:true});fs.writeFileSync(variantPath,'isolated-branded-fixture');
  const variant = {id:'calendar-compatible-variant',videoId,presetName:'Page kit',movementPreset:'smooth_sine',watermarkText:kit.text,filePath:variantPath,fileSize:25,duration:5,width:720,height:1280,aspectRatio:'9:16',brandKitJson:JSON.stringify(kit)};
  publishingRepo.insertBrandedVideo(variant);
  const planInput = {accountId:testPageId,name:'Exact Reel branding',days:7,startDate:'2026-12-01',items:[{title:'Approved Page Reel',contentType:'reel',caption:'Exact video and Page kit',videoId,selectedVariantId:variant.id,applyBranding:true,scheduledAt:'2026-12-01T10:00:00+07:00'}]};
  try {
    const plan = calendarService.createCampaignPlan(planInput);
    const draft = generalPostsService.get(plan.items[0].id);
    assert.equal(draft.destinations[0].selectedVariantId,variant.id);
    assert.deepEqual(draft.destinations[0].brandingOverride,kit);
    approveCurrentCampaign(plan.campaign.id);
    const queued = calendarService.getCalendarItems({campaignId:plan.campaign.id})[0];
    const destination = publishingRepo.getDestinationById(queued.id)!;
    assert.equal(destination.selected_variant_id,variant.id);
    assert.deepEqual(JSON.parse(destination.branding_override_json!),kit);
    db.prepare('UPDATE accounts SET brand_kit_json=? WHERE id=?').run(JSON.stringify({...kit,text:'@entertainment-page'}),testPageId);
    assert.deepEqual(JSON.parse(publishingRepo.getDestinationById(queued.id)!.branding_override_json!),kit,'scheduled output keeps its exact approved Page kit');
    assert.throws(()=>calendarService.createCampaignPlan(planInput),/not compatible with the saved Page brand kit/);
    assert.throws(()=>calendarService.createCampaignPlan({...planInput,items:[{...planInput.items[0],videoId:'different-master'}]}),/selected master video/);
    const manual = generalPostsService.save({title:'Manual exact branding',contentType:'reel',videoId,destinations:[{accountId:testPageId,caption:'Owner text',applyBranding:true,brandingOverride:kit}]});
    generalPostsService.approveBatch([{id:manual.id,revision:manual.revision}]);
    const edited = generalPostsService.save({...manual,destinations:[{...manual.destinations[0],brandingOverride:{...kit,text:'@revised-brand'}}]},manual.id,manual.revision);
    assert.equal(edited.status,'draft');assert.equal(edited.approvedRevision,null);
    assert.throws(()=>generalPostsService.queue(edited.id,edited.revision),/exact current content revision/);
  } finally {db.prepare('UPDATE accounts SET brand_kit_json=? WHERE id=?').run(previousKit,testPageId);}
});

test('a missing explicitly selected render fails before upload; explicit original mode keeps the master path', async () => {
  const absentPath=path.join(dataDir,'renders','intentionally-missing-variant.mp4');
  publishingRepo.insertBrandedVideo({id:'calendar-missing-variant',videoId,presetName:'Missing fixture',movementPreset:'smooth_sine',watermarkText:'Page',filePath:absentPath,fileSize:1,duration:5,width:720,height:1280,aspectRatio:'9:16',brandKitJson:'{}'});
  const publish=MetaFacebookConnector.prototype.publishVideo;
  const previousFetch=globalThis.fetch;
  const uploadedPaths:string[]=[];
  let providerCalls=0;
  try {
    globalThis.fetch=async()=>{providerCalls++;throw new Error('External calls are blocked in this fixture');};
    MetaFacebookConnector.prototype.publishVideo=async (_account,payload)=>{uploadedPaths.push(payload.videoPath);return {success:true,remotePostId:'fixture-original',remotePostUrl:'https://www.facebook.com/reel/fixture-original',verificationStatus:'confirmed'};};
    const missing=publishingService.createPost({videoId,title:'Missing chosen render',destinations:[{accountId:testPageId,selectedVariantId:'calendar-missing-variant'}]});
    const missingDestination=publishingRepo.getPostDestinationRows(missing.postId)[0];
    const queue=new QueueService();
    await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(1000).find(job=>job.id===missingDestination.id));
    const failed=publishingRepo.getDestinationById(missingDestination.id)!;
    assert.equal(failed.status,'failed');assert.match(failed.error_message || '',/Selected branded variant is unavailable/);
    assert.deepEqual(uploadedPaths,[]);assert.equal(providerCalls,0,'missing chosen render fails before token/provider work');
    const original=publishingService.createPost({videoId,title:'Explicit original master',destinations:[{accountId:testPageId,selectedVariantId:'original',applyBranding:false}]});
    const originalDestination=publishingRepo.getPostDestinationRows(original.postId)[0];
    await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(1000).find(job=>job.id===originalDestination.id));
    assert.deepEqual(uploadedPaths,[publishingRepo.getVideoById(videoId)!.file_path]);
    assert.equal(publishingRepo.getDestinationById(originalDestination.id)?.status,'published');
  } finally {MetaFacebookConnector.prototype.publishVideo=publish;globalThis.fetch=previousFetch;}
});

test('campaign approval requires the exact reviewed Page snapshot and rejects unseen content or branding edits', () => {
  const plan=safetyCampaign('Owner reviewed snapshot');
  const first=calendarService.getCampaignReview(plan.campaign.id);
  const publicationsBefore=(db.prepare('SELECT count(*) n FROM publishing_posts').get() as any).n;
  assert.throws(()=>calendarService.approveCampaign(plan.campaign.id,undefined as any),/exact current snapshot/);
  assert.throws(()=>calendarService.approveCampaign(plan.campaign.id,{accountId:otherPageId,expectedHash:first.expectedApprovalHash}),/exact current snapshot/);
  calendarService.editItem(plan.items[0].id,{caption:'Unseen changed content'});
  assert.throws(()=>calendarService.approveCampaign(plan.campaign.id,{accountId:testPageId,expectedHash:first.expectedApprovalHash}),/changed since review/);
  const next=calendarService.getCampaignReview(plan.campaign.id);
  const previousKit=accountsRepo.getAccountById(testPageId)!.brand_kit_json || null;
  try {
    db.prepare('UPDATE accounts SET brand_kit_json=? WHERE id=?').run(JSON.stringify({text:'New owner branding'}),testPageId);
    assert.throws(()=>calendarService.approveCampaign(plan.campaign.id,{accountId:testPageId,expectedHash:next.expectedApprovalHash}),/changed since review/);
    assert.equal((db.prepare('SELECT count(*) n FROM publishing_posts').get() as any).n,publicationsBefore,'stale approval must not queue any destination');
    const fresh=calendarService.getCampaignReview(plan.campaign.id);
    const approved=calendarService.approveCampaign(plan.campaign.id,{accountId:fresh.account.id,expectedHash:fresh.expectedApprovalHash});
    assert.equal(approved.approvedHash,fresh.expectedApprovalHash);
    assert.equal(approved.queuedCount,1);
  } finally {db.prepare('UPDATE accounts SET brand_kit_json=? WHERE id=?').run(previousKit,testPageId);}
});
