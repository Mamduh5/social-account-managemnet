import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const outDir = path.resolve('docs/qa/screenshots/v112');
  fs.mkdirSync(outDir, { recursive: true });

  const installed = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win', 'chrome.exe');
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(installed) ? { executablePath: installed } : { channel: 'msedge' }),
    viewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  const baseUrl = 'http://127.0.0.1:3001';

  try {
    console.log('1. Navigating to Dashboard...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, '01-dashboard.png'), fullPage: true });

    console.log('2. Navigating to Publishing View...');
    const pubNav = page.locator('button:has-text("Publishing"), [data-view="publishing"]').first();
    if (await pubNav.count() > 0) {
      await pubNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, '02-publishing-queue.png'), fullPage: true });
    }

    console.log('3. Checking Calendar View / Modal...');
    const calBtn = page.locator('button:has-text("Calendar"), button:has-text("ปฏิทิน")').first();
    if (await calBtn.count() > 0) {
      await calBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, '03-content-calendar.png'), fullPage: true });
      // close calendar if modal
      const closeBtn = page.locator('button:has-text("Close"), button:has-text("ปิด")').first();
      if (await closeBtn.count() > 0) await closeBtn.click();
    }

    console.log('4. Navigating to Accounts View...');
    const accNav = page.locator('button:has-text("Accounts"), [data-view="accounts"]').first();
    if (await accNav.count() > 0) {
      await accNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, '04-accounts.png'), fullPage: true });
    }

    console.log('5. Navigating to Inbox / Comments View...');
    const inboxNav = page.locator('button:has-text("Inbox"), [data-view="inbox"]').first();
    if (await inboxNav.count() > 0) {
      await inboxNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, '05-inbox-comments.png'), fullPage: true });
    }

    console.log('6. Checking Groups Workspace (if visible in UI)...');
    const groupNav = page.locator('button:has-text("Group"), button:has-text("กลุ่ม")').first();
    if (await groupNav.count() > 0) {
      await groupNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, '06-groups-workspace.png'), fullPage: true });
    }

    console.log('All owner UI screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Failed to capture screenshots:', err);
  process.exit(1);
});
