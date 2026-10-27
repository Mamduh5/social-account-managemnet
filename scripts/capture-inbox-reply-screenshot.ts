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
    console.log('Navigating to Inbox...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const inboxNav = page.locator('button:has-text("Inbox"), [data-view="inbox"]').first();
    await inboxNav.click();
    await page.waitForTimeout(2000);

    // Filter by Handled or All if needed
    await page.screenshot({ path: path.join(outDir, '12-inbox-comment-replied.png'), fullPage: true });

    // Click on the comment card if interactive
    const commentCard = page.locator('text=Mamduh Palas').first();
    if (await commentCard.count() > 0) {
      await commentCard.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(outDir, '13-inbox-comment-thread-expanded.png'), fullPage: true });
    }

    console.log('Inbox screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
