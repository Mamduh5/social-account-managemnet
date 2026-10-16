import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function verify() {
  console.log('Starting V1.5 UI verification acceptance script...');

  const screenshotsDir = path.resolve('.data', 'qa-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Load Application
    console.log('Navigating to http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 2. Navigate to Analytics View
    console.log('Navigating to Analytics view...');
    const analyticsNav = page.locator('button:has-text("Analytics")');
    await analyticsNav.click();
    await page.waitForTimeout(2000);

    // Verify Title & Overview Cards
    const totalViews = await page.locator('p:has-text("Total Views") + h3').innerText();
    console.log(`Verified Total Views: "${totalViews}"`);

    const noticeBanner = await page.locator('text=Real data only').isVisible();
    console.log(`Notice Banner "Real data only" visible: ${noticeBanner}`);

    // Verify Published Videos Table
    const tableHeader = await page.locator('text=Published Videos Performance & Engagement').isVisible();
    console.log(`Published Videos table visible: ${tableHeader}`);

    const postRows = page.locator('table tbody tr');
    const rowCount = await postRows.count();
    console.log(`Total video rows in table: ${rowCount}`);

    // Check specific destinations
    const fbReel1 = await page.locator('tr:has-text("2030865660948720")').innerText();
    console.log(`FB Reel 1 Row: ${fbReel1.replace(/\s+/g, ' ')}`);

    const ttVideo1 = await page.locator('tr:has-text("7697115798170782983")').innerText();
    console.log(`TikTok Video 1 Row: ${ttVideo1.replace(/\s+/g, ' ')}`);

    // Capture Analytics Overview Screenshot
    const analyticsScreenshot = path.join(screenshotsDir, 'v15-analytics-view.png');
    await page.screenshot({ path: analyticsScreenshot, fullPage: true });
    console.log(`Captured Analytics View screenshot: ${analyticsScreenshot}`);

    // 3. Test Observation Modal
    console.log('Opening Record Observation modal...');
    const recordBtn = page.locator('tr:has-text("1456974179666566") button:has-text("Record Observation")');
    await recordBtn.click();
    await page.waitForTimeout(1000);

    const modalTitle = await page.locator('h3:has-text("Record Verified Observation")').isVisible();
    console.log(`Observation modal open: ${modalTitle}`);

    // Capture Modal Screenshot
    const modalScreenshot = path.join(screenshotsDir, 'v15-observation-modal.png');
    await page.screenshot({ path: modalScreenshot });
    console.log(`Captured Observation Modal screenshot: ${modalScreenshot}`);

    // Update observation
    console.log('Submitting updated observation...');
    await page.fill('input[placeholder="e.g. Verified via Facebook Page Insights modal"]', 'Automated QA verification test');
    await page.click('button:has-text("Save Observation")');
    await page.waitForTimeout(2000);

    // 4. Test Synchronize Now
    console.log('Testing Synchronize Now button...');
    const syncNowBtn = page.locator('button:has-text("Synchronize Now")');
    await syncNowBtn.click();
    await page.waitForTimeout(2000);
    const syncFeedbackEl = page.locator('span:has-text("Official API authorization required")').first();
    const syncFeedbackText = await syncFeedbackEl.innerText();
    console.log(`Sync Feedback Text: "${syncFeedbackText}"`);

    // 5. Navigate to Engagement Inbox
    console.log('Navigating to Engagement Inbox...');
    const inboxNav = page.locator('button:has-text("Engagement Inbox")');
    await inboxNav.click();
    await page.waitForTimeout(2000);

    const inboxTitle = await page.locator('text=Unified Engagement Inbox').isVisible();
    console.log(`Unified Engagement Inbox visible: ${inboxTitle}`);

    const syncCommentsBtn = page.locator('button:has-text("Synchronize Comments")');
    const syncCommentsVisible = await syncCommentsBtn.isVisible();
    console.log(`Synchronize Comments button visible: ${syncCommentsVisible}`);

    // Click Synchronize Comments
    await syncCommentsBtn.click();
    await page.waitForTimeout(2000);
    const syncCommentsFeedbackEl = page.locator('span:has-text("Official API authorization required")').first();
    const syncCommentsFeedbackText = await syncCommentsFeedbackEl.innerText();
    console.log(`Sync Comments Feedback Text: "${syncCommentsFeedbackText}"`);

    // Capture Inbox Screenshot
    const inboxScreenshot = path.join(screenshotsDir, 'v15-inbox-view.png');
    await page.screenshot({ path: inboxScreenshot, fullPage: true });
    console.log(`Captured Inbox View screenshot: ${inboxScreenshot}`);

    console.log('V1.5 UI verification completed successfully!');
  } finally {
    await browser.close();
  }
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
