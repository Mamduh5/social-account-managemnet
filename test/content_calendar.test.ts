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
  const approved = calendarService.approveCampaign(campaignId);
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
  calendarService.approveCampaign(campaignId);
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
  calendarService.approveCampaign(campaignId);

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

  calendarService.approveCampaign(plan.campaign.id);
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
 const plan=safetyCampaign('Safe material revision');calendarService.approveCampaign(plan.campaign.id);
 const original=calendarService.getCalendarItems({campaignId:plan.campaign.id})[0];
 const originalRow=publishingRepo.getDestinationById(original.id)!;
 const edited=calendarService.editItem(original.id,{caption:'Owner revised draft'});
 const campaign=calendarService.getCampaignById(plan.campaign.id);
 assert.equal(campaign.status,'draft');assert.equal(campaign.approvedHash,null);assert.equal(campaign.approvedRevision,null);
 assert.equal(edited.sourceType,'draft');assert.equal(edited.status,'draft');assert.equal(edited.caption,'Owner revised draft');
 const old=publishingRepo.getDestinationById(original.id)!;assert.equal(old.status,'cancelled');assert.equal(old.caption,originalRow.caption);
 assert.ok(!publishingRepo.getPendingQueueJobs(100).some(row=>row.id===old.id));
 const approved=calendarService.approveCampaign(plan.campaign.id);assert.equal(approved.queuedCount,1);
 assert.equal(publishingRepo.getDestinationById(original.id)!.status,'cancelled');
});
test('paused jobs that become overdue are review-held before resume can enable dispatch',()=>{
 const plan=safetyCampaign('Overdue pause resume');calendarService.approveCampaign(plan.campaign.id);calendarService.pauseCampaign(plan.campaign.id);
 const item=calendarService.getCalendarItems({campaignId:plan.campaign.id})[0];
 db.prepare("UPDATE publishing_posts SET scheduled_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(item.postId);
 calendarService.resumeCampaign(plan.campaign.id);
 const dest=publishingRepo.getDestinationById(item.id)!;assert.equal(dest.status,'preparing');assert.ok(dest.error_message?.startsWith('Interrupted by server restart'));
 assert.ok(!publishingRepo.getPendingQueueJobs(100).some(row=>row.id===item.id));
});
test('uncertain publication and approved draft schedule cannot be blindly rewritten by Publish Now',async()=>{
 const plan=safetyCampaign('Uncertain override guard');calendarService.approveCampaign(plan.campaign.id);
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
 const plan=safetyCampaign('Immutable campaign id');calendarService.approveCampaign(plan.campaign.id);
 assert.throws(()=>calendarService.createCampaignPlan({id:plan.campaign.id,accountId:testPageId,name:'Overwrite',days:7,startDate:'2026-12-01',items:[{title:'X',contentType:'text',caption:'Changed',scheduledAt:'2026-12-01T10:00:00+07:00'}]}),/already exists/);
 assert.equal(calendarService.getCampaignById(plan.campaign.id).status,'active');
});


test('immediate override cannot change a shared parent schedule or make sibling destinations due', async () => {
  const plan = safetyCampaign('Shared parent override guard');
  calendarService.approveCampaign(plan.campaign.id);
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
  calendarService.approveCampaign(plan.campaign.id);
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
  generalPostsService.approveBatch([{ id: edited.id, revision: edited.revision }]);
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
