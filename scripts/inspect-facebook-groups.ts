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
    console.log('Navigating to facebook.com...');
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    const url = page.url();
    console.log('Current URL:', url);
    console.log('Page Title:', title);

    await page.screenshot({ path: path.join(outDir, 'fb-home.png'), fullPage: true });

    // Check if logged in
    const isLogin = url.includes('login') || (await page.locator('input[name="email"], input[name="pass"]').count()) > 0;
    console.log('Is Login Page:', isLogin);

    if (isLogin) {
      console.log('Facebook session is not logged in or session expired.');
      fs.writeFileSync(path.join(outDir, 'session-state.json'), JSON.stringify({ loggedIn: false, url, title }, null, 2));
      return;
    }

    // If logged in, navigate to groups create page
    console.log('Navigating to /groups/create/ ...');
    await page.goto('https://www.facebook.com/groups/create/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(outDir, 'fb-groups-create.png'), fullPage: true });

    const createUrl = page.url();
    const createTitle = await page.title();
    console.log('Groups Create URL:', createUrl);
    console.log('Groups Create Title:', createTitle);

    // Check active identity on the page (Page vs Personal profile)
    const profileMenu = await page.locator('[aria-label*="Your profile"], [aria-label*="โปรไฟล์ของคุณ"]').first().getAttribute('aria-label');
    console.log('Observed Profile Indicator:', profileMenu);

    fs.writeFileSync(path.join(outDir, 'session-state.json'), JSON.stringify({
      loggedIn: true,
      url: createUrl,
      title: createTitle,
      profileIndicator: profileMenu
    }, null, 2));

  } finally {
    await context.close();
  }
}

main().catch(console.error);
