import { chromium, Browser } from 'playwright';
import { spawn, ChildProcess, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { seal } from '../../server/src/services/token-protection.js';

const runDir = path.resolve('.data/v111-integration/20261026/calendar', `run-${Date.now()}`);
fs.mkdirSync(runDir, { recursive: true });
const port = 3196;
const base = `http://127.0.0.1:${port}`;
const testPageId = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';
let backend: ChildProcess;
let browser: Browser;
let serverLogs = '';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function seedIsolatedData() {
  const uploadsDir = path.join(runDir, 'uploads');
  const rendersDir = path.join(runDir, 'renders');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(rendersDir, { recursive: true });

  // Set env vars before any server modules are imported
  process.env.SCC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 99).toString('base64');
  process.env.SCC_DATA_DIR = runDir;

  const { db } = await import('../../server/src/db/database.js');
  const { initializeDatabase } = await import('../../server/src/db/schema.js');
  const { initializeContentWorkspace } = await import('../../server/src/db/content-workspace.js');
  const { initializeCalendarSchema } = await import('../../server/src/db/calendar-schema.js');
  const { initializeGeneralPublishingSchema } = await import('../../server/src/db/general-posts-schema.js');

  const { storeImage } = await import('../../server/src/services/image-media.service.js');

  // Copy or generate sample media images using storeImage
  const png = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=indigo:s=320x240', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'],
    { windowsHide: true }
  );

  // Initialize schema
  initializeDatabase();
  initializeGeneralPublishingSchema(db);
  initializeContentWorkspace();
  initializeCalendarSchema(db);

  // Store image cleanly through storeImage so integrity and directory match
  const stored = await storeImage(png, 'test_media_1.png');

  // Seed authorized Facebook Page (แก้บัคยาวๆๆ)
  const token = seal('mock-v111-page-token');
  db.prepare(`
    INSERT INTO accounts (
      id, platform, account_type, name, handle, status, connector_mode,
      external_id, is_demo, connection_status, access_token, identity_verified_at,
      token_expires_at, granted_scopes_json, created_at, updated_at
    ) VALUES (
      ?, 'facebook', 'page', 'แก้บัคยาวๆๆ', '@61563944843401', 'connected', 'official_api',
      '409347032254077', 0, 'connected', ?, datetime('now'),
      datetime('now', '+60 days'), ?, datetime('now'), datetime('now')
    )
  `).run(
    testPageId,
    token,
    JSON.stringify(['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'public_profile'])
  );

  db.close();
  return stored.id;
}

async function startServer(): Promise<void> {
  backend = spawn(process.execPath, ['--import', 'tsx', 'test/e2e/v111_review_server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      SCC_DATA_DIR: runDir,
      SCC_SEED_DEMOS: 'false',
      SCC_ISOLATED_TEST:'true', SCC_PAUSE_WORKERS:'true',
      SCC_ASSISTANT_PROVIDER_CONFIG:'', SCC_ASSISTANT_FIXTURES:'false',
      SCC_CLIENT_DIST:path.resolve('.data/v111-integration/20261026/client-candidate'),
      SCC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 99).toString('base64'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backend.stdout?.on('data', (d) => (serverLogs += d.toString()));
  backend.stderr?.on('data', (d) => (serverLogs += d.toString()));

  for (let i = 0; i < 60; i++) {
    if (backend.exitCode !== null) {
      throw new Error(`Server failed to start:\n${serverLogs}`);
    }
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) {
        const body = (await res.json()) as any;
        if (body.ready) return;
      }
    } catch {}
    await wait(300);
  }
  throw new Error('Server boot timed out');
}

async function runAcceptance() {
  console.log('--- Social Command Center V1.11 Acceptance Test ---');
  console.log(`Isolated Data Dir: ${runDir}`);

  // Step 1: Seed isolated test database
  console.log('[1/7] Seeding isolated database with authorized Page and media...');
  const storedImageId = await seedIsolatedData();

  // Step 2: Start server
  console.log('[2/7] Starting isolated Command Center on port ' + port + '...');
  await startServer();
  console.log('Server is healthy on ' + base);

  // Step 3: Agent prepares 7-day plan via API
  console.log('[3/7] Agent preparing 7-day content calendar plan via POST /api/calendar/plan...');
  const plan7DayRes = await fetch(`${base}/api/calendar/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: testPageId,
      name: '7-Day Debugging & Dev Progress (แก้บัคยาวๆๆ)',
      editorialScope: 'Genuine development updates, bug fixes, and architectural notes for Social Command Center',
      days: 7,
      startDate: '2026-10-28',
      origin: 'gemini_prepared',
      maxPublications: 7,
      items: [
        {
          title: 'Day 1: SQLite WAL Rollback Fix',
          contentType: 'text',
          caption: 'บันทึกการแก้บัค: การอัปเดตสคีมาฐานข้อมูลใน V1.10 ถูกปรับให้ทำงานภายใต้ Transaction เดียวแบบ Atomic 100% เพื่อป้องกันปัญหา Foreign Key และรับรองความสมบูรณ์ของประวัติการเผยแพร่เดิม 🌱 #SocialCommandCenter #SoftwareEngineering #Sqlite',
          hashtags: '#SocialCommandCenter #SoftwareEngineering #BugFix',
          scheduledAt: '2026-10-28T10:00:00+07:00',
        },
        {
          title: 'Day 2: Unpublished Photo Verification',
          contentType: 'image',
          caption: 'ทดสอบการอัปโหลดภาพ unpublished photo และตรวจสอบ FBID ก่อนโพสต์ลง feed เพื่อป้องกันภาพหลุดหรือล้มเหลวระหว่างทาง 📷 #MetaGraphApi #Photos #ContentWorkflow',
          hashtags: '#MetaGraphApi #Photos #Security',
          attachments: [{ mediaId: storedImageId, altText: 'Technical diagram' }],
          scheduledAt: '2026-10-29T10:00:00+07:00',
        },
        {
          title: 'Day 3: Draft-First Publishing Architecture',
          contentType: 'link',
          caption: 'สถาปัตยกรรม Draft-First Publishing เพื่อความปลอดภัยของบัญชี: ทำไมทุกโพสต์ต้องบันทึกเป็นร่างและอนุมัติอย่างชัดเจนก่อนส่งเข้าคิว 🔗 #DraftFirst #Architecture #ContentSafety',
          linkUrl: 'https://github.com/facebook/graph-api',
          hashtags: '#DraftFirst #Architecture #ContentSafety',
          scheduledAt: '2026-10-30T10:00:00+07:00',
        },
        {
          title: 'Day 4: Safe Area Moving Watermarks',
          contentType: 'text',
          caption: 'สูตรคณิตศาสตร์ใน Branding Engine: การคำนวณตำแหน่งลายน้ำเคลื่อนไหวให้หลบ Safe Area บน Facebook (16:9) และ TikTok (9:16) ป้องกันไม่ให้ข้อความไปทับกับ UI ปุ่ม Like และ Comment ของแอป 📐 #FFmpeg #Watermark #BrandingEngine',
          hashtags: '#FFmpeg #Branding #VideoEngineering',
          scheduledAt: '2026-10-31T10:00:00+07:00',
        },
        {
          title: 'Day 5: Local Loop Scheduler Test',
          contentType: 'text',
          caption: 'ผลการทดลอง: การใช้ SQLite julianday loop ควบคู่กับการ Hold งานที่ค้างตอนบูตเซิร์ฟเวอร์ ช่วยป้องกันการส่งโพสต์ซ้ำได้อย่างน่าเชื่อถือเมื่อเครื่องพีซีปิดอยู่ ⏱️ #PublishingScheduler #SelfHosted #Reliability',
          hashtags: '#PublishingScheduler #Automation #Reliability',
          scheduledAt: '2026-11-01T10:00:00+07:00',
        },
        {
          title: 'Day 6: TikTok Personal Account Scope Observations',
          contentType: 'text',
          caption: 'บันทึกการตรวจสอบสิทธิ์ TikTok Display API บน Personal Account: ดึงสถิติและรายการวิดีโอได้จริง พร้อมการจัดการ Scope Fallback อย่างโปร่งใส 📊 #TikTokApi #DisplayApi #Analytics',
          hashtags: '#TikTokApi #SocialMediaAnalytics',
          scheduledAt: '2026-11-02T10:00:00+07:00',
        },
        {
          title: 'Day 7: Campaign Approval Wrap-up',
          contentType: 'text',
          caption: 'สรุปการทดสอบระบบ One-Time Campaign Approval V1.11: เจ้าของระบบสามารถตรวจสอบแคมเปญทั้งหมด 7-30 วัน และอนุมัติพร้อมกันในคลิกเดียว พร้อมปุ่ม Pause และระบบ Audit Hash ตรวจจับการแก้ไขเนื้อหา 🚀 #Milestone #V111 #EngineeringProgress',
          hashtags: '#V111 #ContentCalendar #EngineeringProgress',
          scheduledAt: '2026-11-03T10:00:00+07:00',
        },
      ],
    }),
  });

  if (!plan7DayRes.ok) {
    console.error('Plan 7 day error:', await plan7DayRes.text());
  }
  assert.equal(plan7DayRes.status, 200);
  const plan7Day = (await plan7DayRes.json()) as any;
  console.log(`Created 7-day plan: ${plan7Day.campaign.id} (${plan7Day.items.length} items)`);
  assert.equal(plan7Day.items.length, 7);
  assert.equal(plan7Day.campaign.status, 'draft');

  // Step 4: Agent prepares 30-day demonstration plan (kept unactivated)
  console.log('[4/7] Agent preparing 30-day schedule demonstration (unactivated)...');
  const thirtyDayItems = Array.from({ length: 30 }, (_, idx) => ({
    title: `Day ${idx + 1}: Continuous Verification Topic ${idx + 1}`,
    contentType: 'text' as const,
    caption: `หัวข้อการตรวจสอบวันที่ ${idx + 1}: การทำงานของระบบ Social Command Center V1.11 🚀`,
    scheduledAt: `2026-11-05T10:00:00+07:00`,
  }));

  const plan30DayRes = await fetch(`${base}/api/calendar/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: testPageId,
      name: '30-Day Long-term Demonstration Schedule (Unactivated)',
      editorialScope: 'Long term architectural demonstration kept in draft status',
      days: 30,
      startDate: '2026-11-05',
      origin: 'gemini_prepared',
      maxPublications: 30,
      items: thirtyDayItems,
    }),
  });

  assert.equal(plan30DayRes.status, 200);
  const plan30Day = (await plan30DayRes.json()) as any;
  console.log(`Created 30-day demonstration plan: ${plan30Day.campaign.id} (${plan30Day.items.length} items)`);
  assert.equal(plan30Day.campaign.status, 'draft');

  // Step 5: Playwright UI Testing
  console.log('[5/7] Launching Playwright browser for UI testing & screenshots...');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const screenshotDir = path.resolve('.data/v111-integration/20261026/calendar/browser');
  fs.mkdirSync(screenshotDir, { recursive: true });

  // Navigate to Dashboard
  await page.goto(base);
  await page.waitForLoadState('networkidle');

  // Navigate to Content Calendar tab
  console.log('Navigating to Content Calendar view...');
  await page.click('button:has-text("Content Calendar")');
  await page.waitForSelector('text=Content Calendar & Planner');
  await wait(500);

  // Take screenshot: 7-day calendar overview
  const shot1 = path.join(screenshotDir, 'v111_01_calendar_7day_overview.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log(`Saved screenshot: ${shot1}`);

  // Switch to 30-day view
  console.log('Testing 30-day view switch...');
  await page.click('button:has-text("30 Days")');
  await wait(500);
  const shot2 = path.join(screenshotDir, 'v111_02_calendar_30day_overview.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log(`Saved screenshot: ${shot2}`);

  // Switch back to 7-day view
  await page.click('button:has-text("7 Days")');
  await wait(300);

  // Step 6: Test Campaign Batch Approval in UI
  console.log('[6/7] Testing One-Time Campaign Approval...');
  // Verify button exists
  const approveButton = page.locator('button:has-text("Approve Entire Campaign (Batch)")');
  assert.ok(await approveButton.isVisible());

  // Click batch approval
  await approveButton.click();
  await page.getByRole('dialog',{name:'Review Exact Campaign'}).waitFor();
  await page.getByRole('button',{name:'Approve Reviewed Campaign',exact:true}).click();
  await wait(1000);

  // Verify status changed to active and Pause button appears
  const pauseButton = page.locator('button:has-text("Pause Campaign")');
  assert.ok(await pauseButton.isVisible());
  console.log('Campaign successfully approved in one action!');

  const shot3 = path.join(screenshotDir, 'v111_03_campaign_approved_batch.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log(`Saved screenshot: ${shot3}`);

  // Test Pause Campaign
  console.log('Testing Pause Campaign...');
  await pauseButton.click();
  await wait(1000);

  const resumeButton = page.locator('button:has-text("Resume Campaign")');
  assert.ok(await resumeButton.isVisible());
  console.log('Campaign successfully paused!');

  const shot4 = path.join(screenshotDir, 'v111_04_campaign_paused.png');
  await page.screenshot({ path: shot4, fullPage: true });
  console.log(`Saved screenshot: ${shot4}`);

  // Resume campaign
  await resumeButton.click();
  await wait(1000);
  assert.ok(await page.locator('button:has-text("Pause Campaign")').isVisible());
  console.log('Campaign resumed successfully!');

  // Test Material Edit Invalidation
  console.log('Testing Material Edit and approval invalidation...');
  // Click edit on the first post card
  const editButtons = page.locator('button[title="Edit Post"]');
  await editButtons.first().click();
  await page.waitForSelector('text=Edit Planned Post');

  // Edit caption
  const captionTextarea = page.locator('label:has-text("Caption") + textarea');
  await captionTextarea.fill('ข้อความที่ถูกแก้ไขเพื่อทดสอบ Material Edit Invalidation 🌿');
  await page.click('button:has-text("Save Changes")');
  await wait(1000);

  const checkedCampaign = await (await fetch(`${base}/api/calendar/campaigns/${plan7Day.campaign.id}`)).json() as any;
  assert.equal(checkedCampaign.campaign.status,'draft');
  assert.equal(checkedCampaign.campaign.approvedHash,null);
  const shot5 = path.join(screenshotDir, 'v111_05_material_edit_invalidation.png');
  await page.screenshot({ path: shot5, fullPage: true });
  console.log(`Saved screenshot: ${shot5}`);

  // Step 7: editing requires new approval; Publish Now must not bypass it.
  console.log('[7/7] Verifying unapproved draft rejects immediate publication...');
  const remainingItems = await (await fetch(`${base}/api/calendar/items?campaignId=${plan7Day.campaign.id}`)).json() as any;
  const unapproved = remainingItems.items.find((item:any)=>item.sourceType==='draft');
  assert.ok(unapproved);
  const refused = await fetch(`${base}/api/calendar/items/${unapproved.id}/publish-now`,{method:'POST'});
  assert.equal(refused.status,400);
  assert.match((await refused.json() as any).error,/approved/);
  console.log('Unapproved campaign remains draft; immediate publication refused.');

  // Cleanup browser and server
  await browser.close();
  backend.kill();

  console.log('\n======================================================');
  console.log('✅ ALL V1.11 ACCEPTANCE TESTS COMPLETED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runAcceptance().catch((err) => {
  console.error('Acceptance test failed:', err);
  if (browser) browser.close();
  if (backend) backend.kill();
  process.exit(1);
});
