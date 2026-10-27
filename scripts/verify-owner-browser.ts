import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

async function main() {
  const url = 'http://127.0.0.1:3001';
  const outDir = path.resolve('.data', 'v112-owner');
  fs.mkdirSync(outDir, { recursive: true });

  const installed = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win', 'chrome.exe');
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(installed) ? { executablePath: installed } : { channel: 'msedge' })
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors: string[] = [];
  const prohibitedRequests: string[] = [];

  page.on('pageerror', err => pageErrors.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[Browser Console Error]', msg.text());
    }
  });

  // Block any non-GET requests to prevent accidental mutations
  await page.route('**/*', async route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      prohibitedRequests.push(`${req.method()} ${req.url()}`);
      return route.abort();
    }
    return route.continue();
  });

  try {
    console.log('Navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // 1. Verify app shell
    const title = await page.title();
    console.log('Page Title:', title);

    // 2. Take dashboard screenshot
    await page.screenshot({ path: path.join(outDir, 'browser-dashboard.png'), fullPage: true });

    // 3. Navigate to Accounts View
    const accountsNav = page.locator('button:has-text("Accounts"), a:has-text("Accounts"), [data-view="accounts"]').first();
    if (await accountsNav.isVisible()) {
      await accountsNav.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(outDir, 'browser-accounts.png'), fullPage: true });
      console.log('Accounts view captured');
    }

    // 4. Navigate to Publishing / Drafts View
    const pubNav = page.locator('button:has-text("Publishing"), a:has-text("Publishing"), [data-view="publishing"]').first();
    if (await pubNav.isVisible()) {
      await pubNav.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(outDir, 'browser-publishing.png'), fullPage: true });
      console.log('Publishing view captured');
    }

    // 5. Navigate to Calendar View
    const calNav = page.locator('button:has-text("Calendar"), a:has-text("Calendar"), [data-view="calendar"]').first();
    if (await calNav.isVisible()) {
      await calNav.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(outDir, 'browser-calendar.png'), fullPage: true });
      console.log('Calendar view captured');
    }

    // 6. Check Groups / Inbox if available
    const inboxNav = page.locator('button:has-text("Inbox"), a:has-text("Inbox"), [data-view="inbox"]').first();
    if (await inboxNav.isVisible()) {
      await inboxNav.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(outDir, 'browser-inbox.png'), fullPage: true });
      console.log('Inbox view captured');
    }

    const report = {
      verifiedAt: new Date().toISOString(),
      url,
      title,
      pageErrors,
      prohibitedRequests,
      screenshots: [
        'browser-dashboard.png',
        'browser-accounts.png',
        'browser-publishing.png',
        'browser-calendar.png',
        'browser-inbox.png'
      ]
    };

    fs.writeFileSync(path.join(outDir, 'browser-owner-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));

    assert.equal(pageErrors.length, 0, 'No uncaught page errors allowed');
    assert.equal(prohibitedRequests.length, 0, 'No non-GET requests were attempted');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Owner browser verification failed:', err);
  process.exitCode = 1;
});
