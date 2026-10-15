import { chromium, Browser } from 'playwright';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
const runDir = fs.mkdtempSync(path.resolve('.data', 'onboarding-browser-'));
const base = 'http://127.0.0.1:3192';
const results: any[] = [];
const errors: string[] = [];
let backend: ChildProcess;
let browser: Browser;
let serverOutput = '';
let fbId = '';
let ttId = '';
let masterId = '';
let variantId = '';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function startServer() {
  backend = spawn(
    process.execPath,
    ['--import', 'tsx', 'server/src/index.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: '3192',
        SCC_DATA_DIR: runDir,
        SCC_SEED_DEMOS: 'true',
        META_APP_ID: '',
        META_APP_SECRET: '',
        META_REDIRECT_URI: '',
        TIKTOK_CLIENT_KEY: '',
        TIKTOK_CLIENT_SECRET: '',
        TIKTOK_REDIRECT_URI: '',
        SCC_TOKEN_ENCRYPTION_KEY: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );
  backend.stdout!.on('data', (b) => (serverOutput += b.toString()));
  backend.stderr!.on('data', (b) => (serverOutput += b.toString()));
  for (let i = 0; i < 150; i++) {
    if (backend.exitCode !== null) throw new Error('Test backend exited');
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) return;
    } catch {}
    await wait(100);
  }
  throw new Error('Test backend startup timeout');
}
async function stopServer() {
  if (backend && backend.exitCode === null) {
    const exited = new Promise((r) => backend.once('exit', r));
    backend.kill();
    await exited;
  }
}
async function request(route: string, body?: any, method?: string) {
  const r = await fetch(base + route, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await r.json()) as any;
  if (!r.ok) throw new Error(data.error);
  return data;
}
async function until(fn: () => Promise<boolean>, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await wait(150);
  }
  throw new Error('Condition timed out');
}
async function step(name: string, fn: () => Promise<void>) {
  await fn();
  results.push({ name, status: 'PASS' });
  console.log('PASS: ' + name);
}
async function main() {
  await startServer();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(base + '/api/') && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  // Native destination links open a real browser tab with an intercepted fixture response. No platform actions.
  await context.route(
    /https:\/\/(www\.)?(facebook\.com|tiktok\.com)\//,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: 'Native account destination fixture',
      })
  );
  await context.route('https://business.facebook.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: 'Native publisher destination fixture',
    })
  );
  await page.goto(base);
  await page
    .getByRole('button', { name: 'Accounts & Categories', exact: true })
    .click();
  async function add(platform: string, name: string, handle: string) {
    await page
      .getByRole('button', { name: 'Add Social Account', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Platform', { exact: true }).selectOption(platform);
    await dialog.getByLabel('Public profile URL or username').fill(handle);
    await dialog.getByLabel('Account Display Name').fill(name);
    if (platform === 'facebook') {
      const avatarUploaded = page.waitForResponse(
        (r) => r.url().endsWith('/api/accounts/avatar') && r.status() === 200
      );
      await dialog
        .getByLabel('Upload avatar (optional PNG, JPEG, WebP, up to 2 MB)', {
          exact: true,
        })
        .setInputFiles({
          name: 'avatar.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU8sAAAAASUVORK5CYII=',
            'base64'
          ),
        });
      await avatarUploaded;
    }

    await dialog.getByLabel('Category Workspace').selectOption('cat-obj-life');
    await dialog
      .getByRole('button', { name: 'Save Account', exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
  }
  await step(
    'Register Facebook Page without credentials and assign category',
    async () => {
      await add(
        'facebook',
        'Browser Page',
        'https://www.facebook.com/browser.fixture.page'
      );
      await page
        .getByRole('heading', { name: 'Browser Page', exact: true })
        .waitFor();
      const a = (await request('/api/accounts')).accounts.find(
        (a: any) => a.name === 'Browser Page'
      );
      fbId = a.id;
      assert.equal(a.status, 'disconnected');
      assert.equal(a.category_id, 'cat-obj-life');
    }
  );
  await step(
    'Register TikTok Personal account in the same category without conversion',
    async () => {
      await add('tiktok', 'Browser TikTok', '@browser.fixture');
      await page
        .getByRole('heading', { name: 'Browser TikTok', exact: true })
        .waitFor();
      const a = (await request('/api/accounts')).accounts.find(
        (a: any) => a.name === 'Browser TikTok'
      );
      ttId = a.id;
      assert.equal(a.account_type, 'personal');
      assert.equal(a.category_id, 'cat-obj-life');
    }
  );
  const card = (id: string) => page.locator(`[data-account-id="${id}"]`);
  await step('Edit account details and publishing preferences', async () => {
    await card(fbId)
      .getByRole('button', { name: 'Edit Account', exact: true })
      .click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Account Display Name').fill('Browser Page Updated');
    await d
      .getByLabel('Description (optional)', { exact: true })
      .fill('Fixture only');
    await d
      .getByLabel('Default caption', { exact: true })
      .fill('My per-account caption');
    await d.getByLabel('Default hashtags', { exact: true }).fill('#fixture');
    await d.getByRole('button', { name: 'Save Account', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    await card(fbId)
      .getByRole('heading', { name: 'Browser Page Updated', exact: true })
      .waitFor();
  });
  await step(
    'Reject normalized duplicate in the registration form with visible error',
    async () => {
      await page
        .getByRole('button', { name: 'Add Social Account', exact: true })
        .click();
      const d = page.getByRole('dialog');
      await d
        .getByLabel('Public profile URL or username')
        .fill('@BROWSERFIXTUREPAGE');
      await d.getByLabel('Account Display Name').fill('Duplicate');
      await d
        .getByRole('button', { name: 'Save Account', exact: true })
        .click();
      await d
        .getByRole('alert')
        .filter({ hasText: 'already registered' })
        .waitFor();
      await d.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
  );
  await step(
    'Add accounts beyond six and verify dynamic list and pagination',
    async () => {
      for (let i = 0; i < 22; i++)
        await request('/api/accounts', {
          platform: 'tiktok',
          name: `Extra ${i}`,
          handle: `@browser.extra${i}`,
          categoryId: 'cat-obj-life',
        });
      await page.reload();
      await page
        .getByRole('button', { name: 'Accounts & Categories', exact: true })
        .click();
      await page.getByText('Page 1 of 2', { exact: false }).waitFor();
      assert.equal(await page.locator('[data-account-id]').count(), 20);
      await page
        .getByRole('button', { name: 'Next accounts', exact: true })
        .click();
      assert.equal(await page.locator('[data-account-id]').count(), 4);
      await page
        .getByRole('button', { name: 'Previous accounts', exact: true })
        .click();
    }
  );
  await step(
    'Show truthful API authorization/setup state and configure manual browser handoff',
    async () => {
      await card(fbId)
        .getByRole('button', { name: 'Connect API', exact: true })
        .click();
      const d = page.getByRole('dialog');
      await d
        .getByText('Authorization Required - Developer-app setup pending', {
          exact: true,
        })
        .waitFor();
      assert.ok(
        await d
          .getByRole('button', {
            name: 'Start Official Authorization',
            exact: true,
          })
          .isDisabled()
      );
      await d
        .getByRole('button', { name: 'Set Up Browser Handoff', exact: true })
        .click();
      await d.waitFor({ state: 'hidden' });
      await card(fbId)
        .getByText('Limited Capabilities', { exact: true })
        .waitFor();
      assert.equal(
        (await request(`/api/accounts/${fbId}`)).account.capabilities
          .canPublish,
        false
      );
    }
  );
  await step(
    'Missing authorization health check remains disconnected',
    async () => {
      await card(ttId)
        .getByRole('button', { name: 'Check Health', exact: true })
        .click();
      await until(
        async () =>
          (await request(`/api/accounts/${ttId}`)).account.connection_status ===
          'authorization_required'
      );
      assert.equal(
        (await request(`/api/accounts/${ttId}`)).account.status,
        'disconnected'
      );
    }
  );
  await step(
    'Expired authorization is visible and isolated from other accounts',
    async () => {
      const fixtureDb = new Database(
        path.join(runDir, 'social_command_center.db')
      );
      fixtureDb
        .prepare(
          "UPDATE accounts SET token_expires_at=?,status='expired',connection_status='expired' WHERE id=?"
        )
        .run(new Date(Date.now() - 1000).toISOString(), ttId);
      fixtureDb.close();
      await page.reload();
      await page
        .getByRole('button', { name: 'Accounts & Categories', exact: true })
        .click();
      await card(ttId).getByText('Expired', { exact: true }).waitFor();
      assert.equal(
        (await request(`/api/accounts/${fbId}`)).account.connection_status,
        'limited'
      );
      await request(`/api/connections/${ttId}/disconnect`, {});
    }
  );
  await step(
    'Open native profile in a new browser tab with the correct normalized URL',
    async () => {
      const popup = page.waitForEvent('popup');
      await card(fbId)
        .getByRole('link', { name: 'Open Native Account', exact: true })
        .click();
      const p = await popup;
      await p.waitForLoadState();
      assert.equal(p.url(), 'https://www.facebook.com/browser.fixture.page');
      await p.close();
    }
  );
  const fixture = path.join(runDir, 'browser-master.mp4');
  const made = spawnSync(
    'ffmpeg',
    [
      '-f',
      'lavfi',
      '-i',
      'color=c=darkblue:s=360x640:d=2',
      '-c:v',
      'libx264',
      '-t',
      '2',
      fixture,
      '-y',
    ],
    { windowsHide: true }
  );
  assert.equal(made.status, 0);
  const masterHash = createHash('sha256')
    .update(fs.readFileSync(fixture))
    .digest('hex');
  await step(
    'Upload and inspect a real H.264 MP4 through the browser',
    async () => {
      await page
        .getByRole('button', { name: 'Publishing Center', exact: true })
        .click();
      await page.locator('input[type=file]').setInputFiles(fixture);
      await until(async () => {
        const a = await request('/api/publishing/videos');
        masterId = a.videos.find((v: any) => v.title === 'browser-master')?.id;
        return !!masterId;
      });
    }
  );
  async function branding(id: string, text: string) {
    await page
      .getByRole('button', { name: 'Accounts & Categories', exact: true })
      .click();
    await card(id)
      .getByRole('button', { name: 'Configure Branding', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Save Brand Kit', exact: true })
      .waitFor();
    await page
      .getByRole('button', {
        name:
          id === fbId
            ? 'Browser Page Updated facebook'
            : 'Browser TikTok tiktok',
        exact: false,
      })
      .click();
    await page
      .getByLabel('Watermark Handle / Text', { exact: true })
      .fill(text);
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/branding/kits/${id}`) &&
        r.request().method() === 'PUT'
    );
    await page
      .getByRole('button', { name: 'Save Brand Kit', exact: true })
      .click();
    assert.ok((await saved).ok());
  }
  await step(
    'Save distinct per-account branding presets through Branding Studio',
    async () => {
      await branding(fbId, '@BrowserPageBrand');
      await branding(ttId, '@BrowserTikTokBrand');
      assert.notEqual(
        (await request(`/api/accounts/${fbId}`)).account.brandKit.text,
        (await request(`/api/accounts/${ttId}`)).account.brandKit.text
      );
    }
  );
  await step(
    'Render real moving watermark, play and seek the branded MP4, preserve master checksum',
    async () => {
      await page
        .getByRole('button', { name: 'Render Preview', exact: true })
        .click();
      await page
        .getByText('FFmpeg Render Complete!', { exact: false })
        .waitFor({ timeout: 60000 });
      const v = page.locator('video').first();
      await v.waitFor();
      await v.evaluate(async (el: HTMLVideoElement) => {
        el.muted = true;
        await el.play();
        el.currentTime = 0.7;
      });
      await page.waitForFunction(() => {
        const v = document.querySelector('video');
        return v && v.videoWidth === 360 && v.currentTime >= 0.7;
      });
      const variants = await request(`/api/branding/variants/${masterId}`);
      variantId = variants.variants[0].id;
      assert.ok(variantId);
      const original = (await request('/api/publishing/videos')).videos.find(
        (v: any) => v.id === masterId
      );
      assert.equal(
        createHash('sha256')
          .update(fs.readFileSync(original.file_path))
          .digest('hex'),
        masterHash
      );
    }
  );
  await step(
    'Prepare original and branded MP4s for separate real accounts without simulated success',
    async () => {
      for (const [id, isBranded] of [
        [fbId, false],
        [ttId, true],
      ] as const) {
        await page
          .getByRole('button', { name: 'Accounts & Categories', exact: true })
          .click();
        await card(id)
          .getByRole('button', { name: 'Prepare Publication', exact: true })
          .click();
        await page
          .getByLabel('Campaign / Post Title', { exact: true })
          .fill('Browser manual package');
        await page
          .getByRole('button', {
            name: isBranded
              ? /Branded: @BrowserTikTokBrand/
              : 'Original Master (Unbranded)',
            exact: !isBranded,
          })
          .click();
        assert.equal(
          await page
            .getByRole('button', {
              name:
                id === fbId
                  ? 'Select destination Browser Page Updated'
                  : 'Select destination Browser TikTok',
              exact: true,
            })
            .getAttribute('aria-pressed'),
          'true'
        );
        await page
          .getByRole('button', {
            name: 'Prepare for Manual Publishing',
            exact: true,
          })
          .click();
        await page
          .getByRole('button', { name: 'Refresh Queue', exact: true })
          .waitFor();
      }
      await until(async () => {
        const q = (await request('/api/publishing/queue')).queue.filter(
          (q: any) => q.post_title === 'Browser manual package'
        );
        return (
          q.length === 2 &&
          q.every(
            (q: any) =>
              q.status === 'awaiting_confirmation' &&
              !q.published_at &&
              !q.remote_post_id
          )
        );
      }, 30000);
      await page
        .getByRole('button', { name: 'Publishing Center', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Publishing Queue', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Open Prepared Package', exact: true })
        .first()
        .waitFor();
    }
  );
  await step(
    'Download destination package, open native publisher, require explicit post confirmation',
    async () => {
      await page
        .getByRole('button', { name: 'Open Prepared Package', exact: true })
        .first()
        .click();
      const d = page.getByRole('dialog');
      await d
        .getByText(/Browser Page Updated|Browser TikTok/)
        .first()
        .waitFor();
      assert.ok(
        await d
          .getByRole('button', { name: 'Record Published URL', exact: true })
          .isDisabled()
      );
      const downloaded = page.waitForEvent('download');
      await d
        .getByRole('link', { name: 'Download Prepared MP4', exact: true })
        .click();
      const download = await downloaded;
      assert.ok(download.suggestedFilename().endsWith('.mp4'));
      const popup = page.waitForEvent('popup');
      await d
        .getByRole('link', { name: 'Open Native Publisher', exact: true })
        .click();
      const native = await popup;
      await native.waitForURL(
        /https:\/\/(business.facebook.com|www.tiktok.com)\//
      );
      assert.ok(
        native.url().includes('facebook.com/latest/composer') ||
          native.url().includes('tiktok.com/tiktokstudio/upload')
      );
      await native.close();
      await d.getByRole('button', { name: 'Close modal', exact: true }).click();
      const q = (await request('/api/publishing/queue')).queue.filter(
        (q: any) => q.post_title === 'Browser manual package'
      );
      assert.ok(q.every((q: any) => q.status === 'awaiting_confirmation'));
    }
  );
  await step(
    'Record a fixture post URL only after explicit account confirmation; reject a different account',
    async () => {
      const ttJob = (await request('/api/publishing/queue')).queue.find(
        (q: any) => q.account_id === ttId
      );
      await page
        .locator(`[data-destination-id="${ttJob.id}"]`)
        .getByRole('button', { name: 'Open Prepared Package', exact: true })
        .click();
      const d = page.getByRole('dialog');
      await d
        .getByLabel('Published post URL', { exact: true })
        .fill('https://www.tiktok.com/@different.account/video/123456');
      await d.getByRole('checkbox').check();
      await d
        .getByRole('button', { name: 'Record Published URL', exact: true })
        .click();
      await d
        .getByRole('alert')
        .filter({ hasText: 'different TikTok account' })
        .waitFor();
      await d
        .getByLabel('Published post URL', { exact: true })
        .fill('https://www.tiktok.com/@browser.fixture/video/123456');
      await d
        .getByRole('button', { name: 'Record Published URL', exact: true })
        .click();
      await d.waitFor({ state: 'hidden' });
      const jobs = (await request('/api/publishing/queue')).queue;
      assert.equal(
        jobs.find((q: any) => q.account_id === ttId).confirmation_source,
        'manual'
      );
      assert.equal(
        jobs.find((q: any) => q.account_id === ttId).status,
        'published'
      );
      assert.equal(
        jobs.find((q: any) => q.account_id === fbId).status,
        'awaiting_confirmation'
      );
    }
  );
  await step(
    'Archive and restore from UI while publication history survives',
    async () => {
      await page
        .getByRole('button', { name: 'Accounts & Categories', exact: true })
        .click();
      await card(ttId)
        .getByRole('button', { name: 'Archive Account', exact: true })
        .click();
      await card(ttId).waitFor({ state: 'hidden' });
      await page.getByLabel('Show archived accounts', { exact: true }).check();
      await card(ttId)
        .getByRole('button', { name: 'Restore Account', exact: true })
        .click();
      await card(ttId)
        .getByRole('button', { name: 'Edit Account', exact: true })
        .waitFor();
      assert.equal(
        (await request('/api/publishing/queue')).queue.filter(
          (q: any) => q.account_id === ttId
        ).length,
        1
      );
    }
  );
  await step(
    'Hide and safely archive simulator accounts without deleting data',
    async () => {
      await page.getByLabel('Show demo accounts', { exact: true }).check();
      await page
        .getByRole('button', { name: 'Archive Demo Accounts', exact: true })
        .click();
      await until(async () => {
        const all = (await request('/api/accounts?includeArchived=true'))
          .accounts;
        return all
          .filter((a: any) => a.is_demo)
          .every((a: any) => a.archived_at);
      });
      await page.getByLabel('Show demo accounts', { exact: true }).uncheck();
      await page
        .getByLabel('Show archived accounts', { exact: true })
        .uncheck();
    }
  );
  await page.screenshot({
    path: path.join(runDir, 'accounts-desktop.png'),
    fullPage: false,
  });
  await step(
    'Mobile registration layout remains usable without horizontal overflow',
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole('button', { name: 'Add Social Account', exact: true })
        .click();
      await page.getByRole('dialog').waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      );
      await page.screenshot({
        path: path.join(runDir, 'onboarding-mobile.png'),
        fullPage: false,
      });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  );
  await step(
    'Restart server and restore account identities, categories, branding, preferences and unconfirmed packages',
    async () => {
      await stopServer();
      await startServer();
      await page.reload();
      await page
        .getByRole('button', { name: 'Accounts & Categories', exact: true })
        .click();
      await card(fbId)
        .getByRole('heading', { name: 'Browser Page Updated', exact: true })
        .waitFor();
      const a = (await request(`/api/accounts/${fbId}`)).account;
      assert.equal(a.category_id, 'cat-obj-life');
      assert.equal(a.brandKit.text, '@BrowserPageBrand');
      assert.equal(a.settings.defaultCaption, 'My per-account caption');
      const q = (await request('/api/publishing/queue')).queue.filter(
        (q: any) => q.post_title === 'Browser manual package'
      );
      assert.equal(
        q.find((q: any) => q.account_id === fbId).status,
        'awaiting_confirmation'
      );
      assert.equal(
        q.find((q: any) => q.account_id === ttId).status,
        'published'
      );
    }
  );
  assert.deepEqual(errors, []);
  console.log('Browser page errors: 0');
}
main()
  .catch((e) => {
    results.push({
      name: 'Browser acceptance',
      status: 'FAIL',
      error: e.message,
    });
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await stopServer();
    fs.writeFileSync(path.join(runDir, 'server.log'), serverOutput);
    const report = {
      runDirectory: runDir,
      results,
      browserErrors: errors,
      livePlatformAuthorization:
        'PENDING - no real credentials or accounts used',
      nativeLinks:
        'Browser popup targets verified with intercepted platform fixture responses',
    };
    fs.writeFileSync(
      path.join(runDir, 'report.json'),
      JSON.stringify(report, null, 2)
    );
    console.log('Report: ' + path.join(runDir, 'report.json'));
  });
