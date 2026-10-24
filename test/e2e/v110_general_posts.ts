/** Connects ONLY to the explicitly isolated V1.10 review app on 3195. Never queues or publishes. */
import { chromium, Browser } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const base = 'http://127.0.0.1:3195';
const artifactDir = path.resolve('.data/v110-review/browser');
fs.mkdirSync(artifactDir, { recursive: true });
const runTag = Date.now().toString(36);
const results: any[] = [];
const browserErrors: string[] = [];
let browser: Browser | undefined;
let pageForFailure: any;
async function request(route: string) { const response = await fetch(base + route); const body: any = await response.json(); assert.ok(response.ok, JSON.stringify(body)); return body; }
async function until(check: () => Promise<boolean>, description: string) { const end = Date.now() + 15000; while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Timeout: ' + description); }
async function step(name: string, work: () => Promise<void>) { await work(); results.push({ name, status: 'PASS' }); console.log('PASS: ' + name); }
async function main() {
  const accounts = (await request('/api/accounts')).accounts;
  const account = accounts.find((a: any) => a.id === 'acc-fb-1' && a.is_demo && a.platform === 'facebook');
  const tiktok = accounts.find((a: any) => a.is_demo && a.platform === 'tiktok');
  assert.ok(account && tiktok, 'Requires the isolated seeded demo app; no real account is used.');
  const baselineQueue = (await request('/api/publishing/queue')).queue;
  const baselinePosts = (await request('/api/publishing/posts')).posts;
  const fixtures = ['blue', 'orange'].map(color => {
    const image = path.join(artifactDir, 'fixture-' + color + '.png');
    const made = spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'color=c=' + color + ':s=320x240', '-frames:v', '1', '-update', '1', '-y', image], { windowsHide: true });
    assert.equal(made.status, 0, made.stderr?.toString()); return image;
  });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(); pageForFailure = page;
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Publishing Center', exact: true }).click();
  await page.getByLabel('Show demo publishing targets (simulated only)').check();
  const selectType = async (type: string) => page.getByLabel('Post type', { exact: true }).selectOption(type);
  const selectAccount = async () => page.getByLabel('Select Page destination ' + account.name, { exact: true }).check();
  const caption = () => page.getByLabel('Caption for ' + account.name, { exact: true });
  const save = async () => {
    const response = page.waitForResponse(r => /\/api\/publishing\/drafts(?:\/[^/]+)?$/.test(r.url()) && ['POST', 'PUT'].includes(r.request().method()));
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    const received = await response; const data: any = await received.json();
    assert.ok(received.ok(), JSON.stringify(data));
    await until(async () => await page.getByRole('button', { name: 'Save Draft', exact: true }).isEnabled(), 'save settled');
    return data.draft;
  };
  const fresh = async (type: string, title: string) => {
    await page.getByRole('button', { name: 'New Draft', exact: true }).click();
    await selectType(type); await page.getByLabel('Draft title', { exact: true }).fill(title + ' ' + runTag); await selectAccount();
  };
  let textDraft: any, singleDraft: any, multiDraft: any, linkDraft: any;
  await step('Save a Thai text-only draft without video/media, reload it and invalidate exact-revision approval after an edit', async () => {
    await selectType('text'); await selectAccount();
    await page.getByLabel('Draft title', { exact: true }).fill('[DEMO] Thai text — unpublished ' + runTag);
    await caption().fill('สวัสดีจากชุดทดสอบ — ข้อความนี้ยังไม่ได้เผยแพร่ 🌿');
    textDraft = await save(); assert.equal(textDraft.contentType, 'text'); assert.ok(!textDraft.videoId); assert.deepEqual(textDraft.destinations[0].attachments, []);
    const approved = page.waitForResponse(r => r.url().endsWith('/drafts/' + textDraft.id + '/approve'));
    await page.getByRole('button', { name: 'Approve Exact Revision', exact: true }).click(); assert.ok((await approved).ok());
    await until(async () => await page.getByRole('button', { name: 'Queue Approved Draft', exact: true }).isEnabled(), 'approved draft state');
    await page.getByLabel('Prepare scheduled draft', { exact: true }).check();
    assert.ok(await page.getByRole('button', { name: 'Queue Approved Draft', exact: true }).isDisabled(), 'Blank schedule mode invalidates immediate dispatch');
    await page.getByLabel('Prepare scheduled draft', { exact: true }).uncheck();
    await caption().fill('สวัสดีจากชุดทดสอบ — แก้ไขเพื่อทบทวนอีกครั้ง 🌿');
    assert.ok(await page.getByRole('button', { name: 'Queue Approved Draft', exact: true }).isDisabled());
    const previousRevision = textDraft.revision; textDraft = await save(); assert.ok(textDraft.revision > previousRevision); assert.equal(textDraft.status, 'draft');
    await page.getByRole('button', { name: 'Load draft ' + textDraft.title, exact: true }).click(); assert.equal(await caption().inputValue(), textDraft.destinations[0].caption);
  });
  await step('Prepare a Bangkok schedule while retaining draft state and destination', async () => {
    await page.getByLabel('Prepare scheduled draft', { exact: true }).check();
    const wall = new Date(Date.now() + 2 * 86400000 + 7 * 3600000).toISOString().slice(0, 16);
    await page.getByLabel('Draft schedule Asia/Bangkok', { exact: true }).fill(wall);
    textDraft = await save(); assert.equal(textDraft.scheduledAt, new Date(wall + '+07:00').toISOString()); assert.equal(textDraft.destinations[0].accountId, account.id); assert.equal(textDraft.status, 'draft');
    await page.screenshot({ path: path.join(artifactDir, 'text-scheduled-draft-desktop.png'), fullPage: true });
  });
  await step('Upload a PNG original, save single-image caption and alternative text, and reload without cropping', async () => {
    await fresh('image', '[DEMO] Single image — unpublished'); await caption().fill('ภาพสีน้ำเงินสำหรับทบทวนเท่านั้น');
    await page.getByLabel('Upload images', { exact: true }).setInputFiles(fixtures[0]);
    await until(async () => await page.locator('[data-draft-account-id] [data-media-id]').count() === 1, 'single image uploaded');
    await until(async () => await page.locator('[data-draft-account-id] [data-media-id] img').first().evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 320 && el.naturalHeight === 240), 'image preview decoded');
    await page.getByLabel('Alternative text image 1 for ' + account.name, { exact: true }).fill('ภาพทดสอบสีน้ำเงิน');
    singleDraft = await save(); assert.equal(singleDraft.destinations[0].attachments.length, 1); assert.equal(singleDraft.destinations[0].attachments[0].altText, 'ภาพทดสอบสีน้ำเงิน');
    await page.getByRole('button', { name: 'Load draft ' + singleDraft.title, exact: true }).click(); assert.equal(await caption().inputValue(), 'ภาพสีน้ำเงินสำหรับทบทวนเท่านั้น');
    await page.screenshot({ path: path.join(artifactDir, 'single-image-draft-desktop.png'), fullPage: true });
  });
  await step('Save multi-image caption, remove/re-add an image, and preserve explicit image ordering', async () => {
    await fresh('multi_image', '[DEMO] Multiple images — unpublished'); await caption().fill('เรียงภาพสองภาพ — ยังไม่เผยแพร่');
    await page.getByLabel('Upload images', { exact: true }).setInputFiles(fixtures);
    await until(async () => await page.locator('[data-draft-account-id] [data-media-id]').count() === 2, 'multiple images uploaded');
    const original = await page.locator('[data-draft-account-id] [data-media-id]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-media-id')));
    await page.getByLabel('Move image 2 up for ' + account.name, { exact: true }).click();
    await page.getByLabel('Remove image 2 for ' + account.name, { exact: true }).click();
    assert.equal(await page.locator('[data-draft-account-id] [data-media-id]').count(), 1);
    await page.locator('[data-library-media-id="' + original[0] + '"]').click();
    multiDraft = await save(); assert.deepEqual(multiDraft.destinations[0].attachments.map((a: any) => a.mediaId), [original[1], original[0]]);
    await page.getByRole('button', { name: 'Load draft ' + multiDraft.title, exact: true }).click();
    const reloaded = await page.locator('[data-draft-account-id] [data-media-id]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-media-id')));
    assert.deepEqual(reloaded, [original[1], original[0]]); assert.equal(await caption().inputValue(), 'เรียงภาพสองภาพ — ยังไม่เผยแพร่');
    await page.screenshot({ path: path.join(artifactDir, 'multi-image-ordered-desktop.png'), fullPage: true });
  });
  await step('Save and reload a link draft; keep unsupported TikTok actions disabled', async () => {
    await fresh('link', '[DEMO] Link post — unpublished'); await caption().fill('ลิงก์ประกอบร่างสำหรับเจ้าของตรวจทาน');
    await page.getByLabel('Link for ' + account.name, { exact: true }).fill('https://example.com/review');
    linkDraft = await save(); assert.equal(linkDraft.contentType, 'link'); assert.equal(linkDraft.destinations[0].linkUrl, 'https://example.com/review'); assert.deepEqual(linkDraft.destinations[0].attachments, []);
    assert.ok(await page.getByLabel('Select Page destination ' + tiktok.name, { exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Load draft ' + linkDraft.title, exact: true }).click(); assert.equal(await page.getByLabel('Link for ' + account.name, { exact: true }).inputValue(), 'https://example.com/review');
  });
  await step('Batch approval changes review state without queueing or publishing', async () => {
    await page.getByLabel('Select draft for batch approval ' + singleDraft.title, { exact: true }).check();
    await page.getByLabel('Select draft for batch approval ' + multiDraft.title, { exact: true }).check();
    const response = page.waitForResponse(r => r.url().endsWith('/drafts/batch-approve'));
    await page.getByRole('button', { name: 'Batch Approve Selected (2)', exact: true }).click(); assert.ok((await response).ok());
    await until(async () => (await request('/api/publishing/drafts')).drafts.filter((d: any) => [singleDraft.id, multiDraft.id].includes(d.id)).every((d: any) => d.status === 'approved'), 'batch approved');
  });
  await step('General draft layout stays usable on mobile and existing Reel composer remains available', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: path.join(artifactDir, 'link-draft-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1050 }); await selectType('reel');
    await page.getByLabel('Campaign / Post Title', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifactDir, 'existing-reel-composer.png'), fullPage: true });
  });
  await step('All demonstration drafts remain unpublished and existing queue/post records stay unchanged', async () => {
    const all = (await request('/api/publishing/drafts')).drafts;
    const ids = [textDraft.id, singleDraft.id, multiDraft.id, linkDraft.id];
    assert.ok(all.filter((d: any) => ids.includes(d.id)).every((d: any) => d.status !== 'queued' && !d.queuedPostId));
    assert.deepEqual((await request('/api/publishing/queue')).queue, baselineQueue);
    assert.deepEqual((await request('/api/publishing/posts')).posts, baselinePosts);
    for (const image of (await request('/api/publishing/images')).images) {
      assert.equal(image.width, 320); assert.equal(image.height, 240);
      const content = await fetch(base + image.previewUrl); assert.equal(content.status, 200, 'Managed image preview must serve original bytes');
      const downloaded = Buffer.from(await content.arrayBuffer());
      assert.equal(createHash('sha256').update(downloaded).digest('hex'), image.sha256, 'Original image checksum retained');
    }
    assert.deepEqual(browserErrors, []);
  });
}
main().catch(async error => { await pageForFailure?.screenshot({ path: path.join(artifactDir, 'failure.png'), fullPage: true }).catch(() => {}); results.push({ name: 'Browser acceptance', status: 'FAIL', error: error.message }); console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify({ results, browserErrors, base, livePublishing: 'NOT PERFORMED', unpublishedDemonstrationBatch: true }, null, 2));
  console.log('Browser report: ' + path.join(artifactDir, 'report.json'));
});
