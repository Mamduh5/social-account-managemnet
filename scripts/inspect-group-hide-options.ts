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

    // Click privacy combo
    await page.locator('label:has-text("เลือกความเป็นส่วนตัว")').click();
    await page.waitForTimeout(500);

    // Click Private (the option starting with ส่วนตัว)
    const options = page.locator('[role="listbox"] [role="option"]');
    await options.nth(1).click();
    await page.waitForTimeout(1000);

    // Check what new fields appeared (e.g. Hide Group / ซ่อนกลุ่ม)
    const newLabels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label, [role="combobox"]')).map(el => el.textContent?.trim());
    });
    console.log('Labels after selecting Private:', newLabels);

    // Check visibility dropdown if present
    const hideCombo = page.locator('label:has-text("ซ่อนกลุ่ม")');
    const hasHideCombo = await hideCombo.count();
    console.log('Has Hide Group Combo:', hasHideCombo);

    if (hasHideCombo > 0) {
      await hideCombo.click();
      await page.waitForTimeout(500);
      const hideOptions = await page.locator('[role="listbox"] [role="option"]').allInnerTexts();
      console.log('Hide Group Options:', hideOptions);
    }

    await page.screenshot({ path: path.join(outDir, 'after-private-selection.png') });
  } finally {
    await context.close();
  }
}

main().catch(console.error);
