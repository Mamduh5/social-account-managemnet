/**
 * Visual review harness.
 * Captures every major screen at desktop (1440x900), tablet (768x1024) and mobile (390x844)
 * and reports console errors and horizontal overflow for each capture.
 *
 * Usage (backend must be running on http://localhost:3001):
 *   npx tsx test/e2e/visual_review.ts <label> [--theme=light|dark] [--viewports=desktop,tablet,mobile]
 * Output: docs/qa/ui-redesign/<label>/<viewport>_<nn>_<screen>.png
 */
import { chromium, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const label = process.argv[2] || 'review';
const themeArg = process.argv.find(a => a.startsWith('--theme='))?.split('=')[1];
const vpArg = process.argv.find(a => a.startsWith('--viewports='))?.split('=')[1];
const OUT_DIR = path.resolve(process.cwd(), 'docs/qa/ui-redesign', label);

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const SCREENS = [
  { key: 'dashboard', nav: 'Dashboard' },
  { key: 'accounts', nav: 'Accounts & Categories' },
  { key: 'publishing', nav: 'Publishing Center' },
  { key: 'branding', nav: 'Branding Studio' },
  { key: 'inbox', nav: 'Engagement Inbox' },
  { key: 'activity', nav: 'Activity Feed' },
  { key: 'analytics', nav: 'Analytics' },
  { key: 'settings', nav: 'Settings & Bridge' },
];

async function goTo(page: Page, navLabel: string) {
  const navBtn = page.locator(`nav button:has-text("${navLabel}")`).first();
  if (!(await navBtn.isVisible())) {
    const toggle = page.locator('button[aria-label="Toggle navigation menu"]');
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(300);
    }
  }
  await navBtn.click();
  await page.waitForTimeout(900);
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const report: any[] = [];
  const vps = vpArg ? vpArg.split(',') : Object.keys(VIEWPORTS);

  for (const vpName of vps) {
    const context = await browser.newContext({ viewport: VIEWPORTS[vpName] });
    if (themeArg) {
      await context.addInitScript((t) => localStorage.setItem('scc-theme', t), themeArg);
    }
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    for (let i = 0; i < SCREENS.length; i++) {
      const s = SCREENS[i];
      const before = errors.length;
      await goTo(page, s.nav);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const file = `${vpName}_${String(i + 1).padStart(2, '0')}_${s.key}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
      report.push({ viewport: vpName, screen: s.key, file, horizontalOverflowPx: overflow, newConsoleErrors: errors.slice(before) });
      console.log(`[${vpName}] ${s.key.padEnd(11)} overflow=${overflow}px errors=${errors.length - before}`);
    }
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  const bad = report.filter(r => r.horizontalOverflowPx > 0 || r.newConsoleErrors.length > 0);
  console.log(`\nSaved ${report.length} screenshots to ${OUT_DIR}. Issues: ${bad.length}`);
}

run();
