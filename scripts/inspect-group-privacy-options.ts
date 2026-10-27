import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const profileDir = path.resolve('.data/browser-profiles/acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5');
  const outDir = path.resolve('.data/v112-owner/group-inspection');

  const installed = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win', 'chrome.exe');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    ...(fs.existsSync(installed) ? { executablePath: installed } : { channel: 'msedge' }),
    viewport: { width: 1440, height: 900 }
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto('https://www.facebook.com/groups/create/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Look at privacy combobox
    const privacyCombo = page.locator('label:has-text("เลือกความเป็นส่วนตัว")');
    console.log('Clicking privacy combo...');
    await privacyCombo.click();
    await page.waitForTimeout(1000);

    // Capture listbox options
    const options = await page.locator('[role="listbox"] [role="option"], [role="menuitem"]').allInnerTexts();
    console.log('Privacy Options:', options);

    await page.screenshot({ path: path.join(outDir, 'privacy-options.png') });
  } finally {
    await context.close();
  }
}

main().catch(console.error);
