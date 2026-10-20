import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { db, uploadsDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { saveRegisteredAccount } from '../server/src/services/accounts.service.js';
import { publishingService } from '../server/src/services/publishing.service.js';
import { publishingRepo } from '../server/src/repositories/publishing.repo.js';
import { queueService } from '../server/src/services/queue.service.js';
import { seal } from '../server/src/services/token-protection.js';

let accountId: string;
let master: string;
let requests: string[] = [];
let failFinish = false;
let serial = 0;
let finishBodies: any[] = [];
const realFetch = globalThis.fetch;
const digest = () => createHash('sha256').update(fs.readFileSync(master)).digest('hex');
before(() => {
  assert.ok(process.env.SCC_DATA_DIR);
  initializeDatabase();
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  accountId = saveRegisteredAccount({ platform: 'facebook', name: 'Fixture Page', handle: 'fixture.page', externalId: '409347032254077' });
  db.prepare("UPDATE accounts SET connector_mode='official_api',status='connected',identity_verified_at=datetime('now'),access_token=?,token_expires_at=?,granted_scopes_json=? WHERE id=?").run(seal('fixture-token'), new Date(Date.now() + 86400000).toISOString(), JSON.stringify(['pages_show_list', 'pages_manage_posts', 'pages_read_engagement']), accountId);
  master = path.join(uploadsDir, 'queue-fixture.mp4'); fs.writeFileSync(master, 'isolated queue fixture');
  db.prepare("INSERT INTO videos(id,title,source_type,original_filename,file_path) VALUES ('queue-video','Fixture','manual_upload','queue-fixture.mp4',?)").run(master);
  globalThis.fetch = (async (url: any, options: any = {}) => {
    requests.push(String(url));
    const phase = typeof options.body === 'string' ? JSON.parse(options.body).upload_phase : '';
    if (phase === 'start') return new Response('{"video_id":"123456789","upload_url":"https://rupload.facebook.com/video-upload/v25.0/123456789"}');
    // The remote ID must already be durable before upload/finish.
    assert.ok(db.prepare("SELECT id FROM publishing_destinations WHERE remote_post_id='123456789' AND status='uploading'").get());
    if (String(url).includes('rupload')) return new Response('{"success":true}');
    if (phase === 'finish') { finishBodies.push(JSON.parse(options.body)); return new Response(JSON.stringify({ success: !failFinish })); }
    return new Response('{"status":{"video_status":"ready","publishing_phase":{"status":"complete"}},"permalink_url":"/reel/123456789"}');
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; db.close(); });
function createJob() {
  const p = publishingService.createPost({ videoId: 'queue-video', title: `Fixture ${++serial}`, destinations: [{ accountId, caption: 'Caption', hashtags: '', applyBranding: false, selectedVariantId: 'original' }] });
  return publishingRepo.getPendingQueueJobs(100).find(j => j.post_id === p.postId)!;
}

test('verified Reels API publication automatically becomes Published with api provenance and no manual confirmation', async () => {
  const hash = digest(); const job = createJob();
  await (queueService as any).executeDestinationJob(job);
  const result = publishingRepo.getDestinationById(job.id) as any;
  assert.equal(result.status, 'published'); assert.equal(result.confirmation_source, 'api');
  assert.equal(result.verification_status, 'confirmed'); assert.equal(result.remote_post_url, 'https://www.facebook.com/reel/123456789');
  assert.equal(digest(), hash);
  const count = requests.length;
  await (queueService as any).executeDestinationJob(job);
  assert.equal(requests.length, count);
  assert.throws(() => publishingService.retryDestination(job.id), /cannot be retried/);
});

test('a manually confirmed job and a restart review hold are excluded, even from a stale dispatch', async () => {
  const job = createJob();
  db.prepare("UPDATE publishing_destinations SET status='awaiting_confirmation' WHERE id=?").run(job.id);
  publishingService.confirmAssistedPublish(job.id, 'https://www.facebook.com/reel/444444444', '444444444', accountId);
  const held = createJob(); queueService.recoverInterruptedJobs();
  const count = requests.length;
  await (queueService as any).executeDestinationJob(job);
  await (queueService as any).executeDestinationJob(held);
  assert.equal(requests.length, count);
  assert.equal(publishingRepo.getPendingQueueJobs(100).length, 0);
  assert.equal((publishingRepo.getDestinationById(job.id) as any).confirmation_source, 'manual');
});

test('an uncertain finish keeps the remote ID, performs no automatic replay, and blocks blind explicit retry', async () => {
  failFinish = true; const job = createJob();
  await (queueService as any).executeDestinationJob(job);
  const result = publishingRepo.getDestinationById(job.id)!;
  assert.equal(result.status, 'failed'); assert.equal(result.remote_post_id, '123456789');
  assert.throws(() => publishingService.retryDestination(job.id), /Reconcile the existing remote upload/);
  const count = requests.length;
  await (queueService as any).executeDestinationJob(job);
  assert.equal(requests.length, count);
  assert.equal(requests.some(url => url.endsWith('/videos') || url.includes('tiktok')), false);
});

test('schedule rejects invalid, timezone-free and past timestamps instead of publishing immediately', () => {
  for (const scheduledAt of ['', 'invalid', '2026-12-01T12:00', new Date(Date.now() - 1000).toISOString()]) {
    assert.throws(() => publishingService.createPost({ videoId: 'queue-video', title: 'Invalid schedule', scheduledAt, destinations: [{ accountId, applyBranding: false }] }), /Scheduled time/);
  }
});

test('one-hour schedule stays idle, then dispatches once at due time with immediate Meta publication and api confirmation', async () => {
  failFinish = false;
  const when = new Date(Date.now() + 3600000).toISOString();
  const bangkok = new Date(Date.parse(when) + 7 * 3600000).toISOString().replace('Z', '+07:00');
  const p = publishingService.createPost({ videoId: 'queue-video', title: 'Scheduled fixture', scheduledAt: bangkok, destinations: [{ accountId, caption: 'Scheduled caption', hashtags: '', selectedVariantId: 'original', applyBranding: false }] });
  const dest = (db.prepare('SELECT * FROM publishing_destinations WHERE post_id=?').get(p.postId) as any);
  assert.equal((db.prepare('SELECT scheduled_at FROM publishing_posts WHERE id=?').get(p.postId) as any).scheduled_at, when);
  assert.equal(dest.status, 'scheduled');
  assert.equal(publishingRepo.getDueScheduledDestinations().some(d => d.id === dest.id), false);
  const before = requests.length;
  await queueService.processNextJobs();
  assert.equal(requests.length, before);
  assert.throws(() => publishingService.retryDestination(dest.id), /cannot be retried/);
  // Advance only the isolated fixture's saved time; no live job or real API.
  db.prepare('UPDATE publishing_posts SET scheduled_at=? WHERE id=?').run(new Date(Date.now() - 2000).toISOString(), p.postId);
  assert.equal(publishingRepo.getDueScheduledDestinations().some(d => d.id === dest.id), true);
  await queueService.processNextJobs();
  for (let i = 0; i < 50 && publishingRepo.getDestinationById(dest.id)?.status !== 'published'; i++) await new Promise(resolve => setTimeout(resolve, 10));
  const published = publishingRepo.getDestinationById(dest.id) as any;
  assert.equal(published.status, 'published');
  assert.equal(published.confirmation_source, 'api');
  assert.equal(finishBodies.at(-1).video_state, 'PUBLISHED');
  assert.equal('scheduled_publish_time' in finishBodies.at(-1), false);
  const after = requests.length;
  await queueService.processNextJobs();
  assert.equal(requests.length, after);
});
