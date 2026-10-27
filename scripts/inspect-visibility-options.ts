import { chromium } from 'playwright';
import path from 'node:path';

async function main() {
  const profileDir = path.resolve('.data/browser-profiles/acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5');
  const installed = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win', 'chrome.exe');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    ...(fs_exists(installed) ? { executablePath: installed } : { channel: 'msedge' }),
    viewport: { width: 1440, height: 900 }
  });

  function fs_exists(p: string) {
    try { return require('node:fs').existsSync(p); } catch { return false; }
  }

  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto('https://www.facebook.com/groups/create/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click privacy combo
    await page.locator('label:has-text("เลือกความเป็นส่วนตัว")').click();
    await page.waitForTimeout(500);

    // Click Private
    await page.locator('[role="listbox"] [role="option"]').nth(1).click();
    await page.waitForTimeout(1000);

    // Click Visibility combo
    const visCombo = page.locator('label:has-text("การแสดงตัว")');
    await visCombo.click();
    await page.waitForTimeout(500);

    const visOptions = await page.locator('[role="listbox"] [role="option"]').allInnerTexts();
    console.log('Visibility Options:', visOptions);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
