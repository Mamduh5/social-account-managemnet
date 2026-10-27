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
    const groupUrl = 'https://www.facebook.com/groups/1830083181521795/';
    await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const buttonsAndInputs = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="button"], input, textarea, [contenteditable="true"], [aria-label]'));
      return els.map(el => ({
        tag: el.tagName,
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        text: el.textContent?.trim().slice(0, 100)
      })).filter(x => x.ariaLabel || x.text);
    });

    console.log('--- Buttons and inputs on group page ---');
    console.log(JSON.stringify(buttonsAndInputs.slice(0, 40), null, 2));

    await page.screenshot({ path: path.join(outDir, 'group-page-full.png'), fullPage: true });
  } finally {
    await context.close();
  }
}

main().catch(console.error);
