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
    await page.goto('https://www.facebook.com/groups/create/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get current user / page name shown in UI
    const bodyText = await page.innerText('body');
    const labels = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('input, button, select, [role="button"], [role="combobox"], [role="listbox"], [aria-label]'));
      return elements.map(el => ({
        tag: el.tagName,
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        text: el.textContent?.trim().slice(0, 100),
        name: (el as HTMLInputElement).name,
        type: (el as HTMLInputElement).type
      })).filter(x => x.ariaLabel || x.role || x.text);
    });

    // Check account switcher
    console.log('--- Relevant Interactive Elements on /groups/create/ ---');
    console.log(JSON.stringify(labels.slice(0, 40), null, 2));

    await page.screenshot({ path: path.join(outDir, 'create-group-detailed.png'), fullPage: true });

    // Look specifically for Privacy options
    const privacyCombos = await page.evaluate(() => {
      const combos = Array.from(document.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"], [role="button"]'));
      return combos.map(c => ({
        ariaLabel: c.getAttribute('aria-label'),
        text: c.textContent?.trim()
      }));
    });
    console.log('Combos / Buttons:', privacyCombos);

    fs.writeFileSync(path.join(outDir, 'elements.json'), JSON.stringify({ labels, privacyCombos }, null, 2));
  } finally {
    await context.close();
  }
}

main().catch(console.error);
