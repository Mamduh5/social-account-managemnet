import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const profileDir = path.resolve('.data/browser-profiles/acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5');
  const outDir = path.resolve('.data/v112-owner/group-inspection');
  fs.mkdirSync(outDir, { recursive: true });

  const installed = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win', 'chrome.exe');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    ...(fs.existsSync(installed) ? { executablePath: installed } : { channel: 'msedge' }),
    viewport: { width: 1440, height: 900 }
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    console.log('Navigating to /groups/create/ ...');
    await page.goto('https://www.facebook.com/groups/create/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify Admin is แก้บัคยาวๆๆ
    const adminCheck = await page.locator('[aria-label*="แก้บัคยาวๆๆ"]').first().isVisible();
    console.log('Admin แก้บัคยาวๆๆ visible:', adminCheck);
    if (!adminCheck) {
      throw new Error('Admin แก้บัคยาวๆๆ is not active!');
    }

    // Fill Group Name
    const nameInput = page.locator('input[type="text"]').first();
    const groupName = 'แก้บัคยาวๆๆ — กลุ่มทดสอบระบบ';
    console.log('Filling group name:', groupName);
    await nameInput.fill(groupName);
    await page.waitForTimeout(500);

    // Click Privacy Combobox
    console.log('Selecting Privacy: ส่วนตัว (Private)...');
    await page.locator('label:has-text("เลือกความเป็นส่วนตัว")').click();
    await page.waitForTimeout(500);
    // Click option 1 (Private)
    await page.locator('[role="listbox"] [role="option"]').nth(1).click();
    await page.waitForTimeout(1000);

    // Click Visibility Combobox
    console.log('Selecting Visibility: ซ่อนอยู่ (Hidden)...');
    const visCombo = page.locator('label:has-text("การแสดงตัว")');
    await visCombo.click();
    await page.waitForTimeout(500);
    // Click option 1 (Hidden)
    await page.locator('[role="listbox"] [role="option"]').nth(1).click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(outDir, 'before-create-click.png') });

    // Click "สร้าง" (Create) button
    console.log('Clicking "สร้าง" button...');
    const createBtn = page.locator('div[role="button"][aria-label="สร้าง"]');
    await createBtn.click();

    // Wait for navigation
    console.log('Waiting for group creation and navigation...');
    await page.waitForTimeout(7000);

    const currentUrl = page.url();
    const pageTitle = await page.title();
    console.log('Current URL after create:', currentUrl);
    console.log('Current Title after create:', pageTitle);

    await page.screenshot({ path: path.join(outDir, 'group-created.png'), fullPage: true });

    const result = {
      groupName,
      privacy: 'Private (ส่วนตัว)',
      visibility: 'Hidden (ซ่อนอยู่)',
      admin: 'แก้บัคยาวๆๆ',
      url: currentUrl,
      title: pageTitle,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(path.join(outDir, 'created-group.json'), JSON.stringify(result, null, 2));
    console.log('Result saved:', result);

  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('Group creation failed:', err);
  process.exit(1);
});
