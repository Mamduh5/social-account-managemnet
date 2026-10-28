import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { db, uploadsDir, rendersDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { saveRegisteredAccount } from '../server/src/services/accounts.service.js';
import { publishingService } from '../server/src/services/publishing.service.js';
import { publishingRepo } from '../server/src/repositories/publishing.repo.js';
import { QueueService } from '../server/src/services/queue.service.js';
import { ffmpegService } from '../server/src/services/ffmpeg.service.js';
import { MetaFacebookConnector } from '../server/src/connectors/meta-facebook.js';
import { seal } from '../server/src/services/token-protection.js';
import { describeDispatchBranding } from '../client/src/hooks/usePublishing.js';

let pageAId: string;
let pageBId: string;
let pageCId: string;
let masterPath: string;
let secondMasterPath: string;
let savedVariantAPath: string;
let savedVariantBPath: string;

const realFetch = globalThis.fetch;
const realPublishVideo = MetaFacebookConnector.prototype.publishVideo;
const realRenderBrandedVideo = ffmpegService.renderBrandedVideo;

const dispatchedUploads: Array<{
  destinationId: string;
  accountId: string;
  videoPath: string;
  applyBranding: boolean;
}> = [];

const renderedJobs: Array<{
  inputPath: string;
  brandKit: any;
  outputPath: string;
}> = [];

before(() => {
  assert.ok(process.env.SCC_DATA_DIR, 'SCC_DATA_DIR must be set for isolated testing');
  assert.notEqual(
    path.resolve(process.env.SCC_DATA_DIR),
    path.resolve(__dirname, '../.data'),
    'SCC_DATA_DIR must never point to production .data',
  );
  process.env.SCC_ISOLATED_TEST = 'true';
  initializeDatabase();
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');

  pageAId = saveRegisteredAccount({
    platform: 'facebook',
    name: 'Media Contract Page A',
    handle: 'media.contract.a',
    externalId: '100000000000001',
  });
  pageBId = saveRegisteredAccount({
    platform: 'facebook',
    name: 'Media Contract Page B',
    handle: 'media.contract.b',
    externalId: '100000000000002',
  });
  pageCId = saveRegisteredAccount({
    platform: 'facebook',
    name: 'Media Contract Page C',
    handle: 'media.contract.c',
    externalId: '100000000000003',
  });

  const scopes = JSON.stringify(['pages_show_list', 'pages_manage_posts', 'pages_read_engagement']);
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();

  for (const [id, brandKit] of [
    [pageAId, { watermarkType: 'moving_text', text: '@page.a.brand', movementPreset: 'smooth_sine', opacity: 0.85 }],
    [pageBId, { watermarkType: 'moving_text', text: '@page.b.brand', movementPreset: 'corner_jump', opacity: 0.9 }],
    [pageCId, { watermarkType: 'moving_text', text: '@page.c.brand', movementPreset: 'diagonal_bounce', opacity: 0.8 }],
  ] as const) {
    db.prepare(
      `UPDATE accounts
       SET connector_mode = 'official_api',
           status = 'connected',
           connection_status = 'connected',
           identity_verified_at = datetime('now'),
           access_token = ?,
           token_expires_at = ?,
           granted_scopes_json = ?,
           brand_kit_json = ?
       WHERE id = ?`
    ).run(seal(`token-${id}`), expires, scopes, JSON.stringify(brandKit), id);
  }

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(rendersDir, { recursive: true });

  masterPath = path.join(uploadsDir, 'master-contract-1.mp4');
  secondMasterPath = path.join(uploadsDir, 'master-contract-2.mp4');
  savedVariantAPath = path.join(rendersDir, 'saved-variant-a.mp4');
  savedVariantBPath = path.join(rendersDir, 'saved-variant-b.mp4');

  fs.writeFileSync(masterPath, 'immutable-master-video-1');
  fs.writeFileSync(secondMasterPath, 'immutable-master-video-2');
  fs.writeFileSync(savedVariantAPath, 'pre-rendered-branded-variant-a');
  fs.writeFileSync(savedVariantBPath, 'pre-rendered-branded-variant-b');

  publishingRepo.insertVideo({
    id: 'video-master-1',
    title: 'Contract Master 1',
    sourceType: 'manual_upload',
    originalFilename: 'master-contract-1.mp4',
    filePath: masterPath,
    fileSize: 24,
    duration: 15,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
  });

  publishingRepo.insertVideo({
    id: 'video-master-2',
    title: 'Contract Master 2',
    sourceType: 'manual_upload',
    originalFilename: 'master-contract-2.mp4',
    filePath: secondMasterPath,
    fileSize: 24,
    duration: 20,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
  });

  publishingRepo.insertBrandedVideo({
    id: 'variant-master-1-a',
    videoId: 'video-master-1',
    presetName: 'Smooth Sine Brand A',
    movementPreset: 'smooth_sine',
    watermarkText: '@saved.variant.a',
    filePath: savedVariantAPath,
    fileSize: 30,
    duration: 15,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    brandKitJson: JSON.stringify({ watermarkType: 'moving_text', text: '@saved.variant.a', movementPreset: 'smooth_sine' }),
  });

  publishingRepo.insertBrandedVideo({
    id: 'variant-master-2-b',
    videoId: 'video-master-2',
    presetName: 'Corner Jump Brand B',
    movementPreset: 'corner_jump',
    watermarkText: '@saved.variant.b',
    filePath: savedVariantBPath,
    fileSize: 30,
    duration: 20,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    brandKitJson: JSON.stringify({ watermarkType: 'moving_text', text: '@saved.variant.b', movementPreset: 'corner_jump' }),
  });

  globalThis.fetch = (async () => {
    throw new Error('External network calls are blocked in isolated media contract tests');
  }) as typeof fetch;

  ffmpegService.renderBrandedVideo = async (inputPath: string, brandKit: any, onProgress?: (pct: number) => void) => {
    if (onProgress) onProgress(100);
    const slug = String(brandKit?.text || 'brand').replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath = path.join(rendersDir, `dynamic-render-${slug}-${renderedJobs.length + 1}.mp4`);
    fs.writeFileSync(outPath, `dynamically-rendered:${inputPath}:${JSON.stringify(brandKit)}`);
    renderedJobs.push({ inputPath, brandKit, outputPath: outPath });
    return outPath;
  };

  MetaFacebookConnector.prototype.publishVideo = async (_account: any, payload: any) => {
    dispatchedUploads.push({
      destinationId: payload.destinationId,
      accountId: payload.accountId,
      videoPath: payload.videoPath,
      applyBranding: payload.applyBranding,
    });
    return {
      success: true,
      remotePostId: `remote-${payload.destinationId}`,
      remotePostUrl: `https://www.facebook.com/reel/remote-${payload.destinationId}`,
      verificationStatus: 'confirmed',
    };
  };
});

after(() => {
  globalThis.fetch = realFetch;
  MetaFacebookConnector.prototype.publishVideo = realPublishVideo;
  ffmpegService.renderBrandedVideo = realRenderBrandedVideo;
  db.close();
});

test('Mode 1 (Original — Unbranded Master): persists selected_variant_id="original", apply_branding=0 and dispatches exact original file', async () => {
  dispatchedUploads.length = 0;
  renderedJobs.length = 0;

  const created = publishingService.createPost({
    videoId: 'video-master-1',
    title: 'Mode 1 Original Test',
    destinations: [
      {
        accountId: pageAId,
        caption: 'Unbranded master post',
        hashtags: '#original',
        selectedVariantId: 'original',
        applyBranding: false,
      },
    ],
  });

  const destRow = publishingRepo.getPostDestinationRows(created.postId)[0] as any;
  assert.equal(destRow.selected_variant_id, 'original');
  assert.equal(destRow.apply_branding, 0);
  assert.equal(destRow.branded_video_path, null);

  const queue = new QueueService();
  const job = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === destRow.id);
  assert.ok(job, 'Job should be pending in queue');
  await (queue as any).executeDestinationJob(job);

  assert.equal(renderedJobs.length, 0, 'Original mode must not invoke FFmpeg dynamic rendering');
  assert.equal(dispatchedUploads.length, 1);
  assert.equal(dispatchedUploads[0].videoPath, masterPath);
  assert.equal(dispatchedUploads[0].applyBranding, false);

  const completed = publishingRepo.getDestinationById(destRow.id) as any;
  assert.equal(completed.status, 'published');
  assert.equal(completed.branded_video_path, masterPath);
});

test('Mode 2 (Saved Branded Version): validates master ownership, persists pre-rendered path with apply_branding=0, and dispatches exact saved variant', async () => {
  dispatchedUploads.length = 0;
  renderedJobs.length = 0;

  // Rejects variant belonging to a different master video
  assert.throws(
    () =>
      publishingService.createPost({
        videoId: 'video-master-1',
        title: 'Mismatched Variant Test',
        destinations: [
          {
            accountId: pageAId,
            selectedVariantId: 'variant-master-2-b',
            applyBranding: false,
          },
        ],
      }),
    /Branded variant does not belong to the selected master video/
  );

  const created = publishingService.createPost({
    videoId: 'video-master-1',
    title: 'Mode 2 Saved Variant Test',
    destinations: [
      {
        accountId: pageAId,
        caption: 'Saved branded post',
        selectedVariantId: 'variant-master-1-a',
        applyBranding: false,
      },
    ],
  });

  const destRow = publishingRepo.getPostDestinationRows(created.postId)[0] as any;
  assert.equal(destRow.selected_variant_id, 'variant-master-1-a');
  assert.equal(destRow.apply_branding, 0);
  assert.equal(destRow.branded_video_path, savedVariantAPath);

  const queue = new QueueService();
  const job = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === destRow.id);
  await (queue as any).executeDestinationJob(job);

  assert.equal(renderedJobs.length, 0, 'Saved variant mode must not re-render via FFmpeg');
  assert.equal(dispatchedUploads.length, 1);
  assert.equal(dispatchedUploads[0].videoPath, savedVariantAPath);
});

test('Mode 3 (Apply Account Branding at Dispatch): persists selected_variant_id=null, apply_branding=1 and renders account brand kit at dispatch', async () => {
  dispatchedUploads.length = 0;
  renderedJobs.length = 0;

  const created = publishingService.createPost({
    videoId: 'video-master-1',
    title: 'Mode 3 Dispatch Branding Test',
    destinations: [
      {
        accountId: pageBId,
        caption: 'Dynamic branded post',
        selectedVariantId: null,
        applyBranding: true,
      },
    ],
  });

  const destRow = publishingRepo.getPostDestinationRows(created.postId)[0] as any;
  assert.equal(destRow.selected_variant_id, null);
  assert.equal(destRow.apply_branding, 1);
  assert.equal(destRow.branded_video_path, null, 'Final branded file is not generated before queue dispatch');

  const queue = new QueueService();
  const job = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === destRow.id);
  await (queue as any).executeDestinationJob(job);

  assert.equal(renderedJobs.length, 1, 'Dispatch branding mode must invoke FFmpeg rendering during dispatch');
  assert.equal(renderedJobs[0].inputPath, masterPath);
  assert.equal(renderedJobs[0].brandKit.text, '@page.b.brand');
  assert.equal(renderedJobs[0].brandKit.movementPreset, 'corner_jump');

  assert.equal(dispatchedUploads.length, 1);
  assert.equal(dispatchedUploads[0].videoPath, renderedJobs[0].outputPath);
  assert.equal(dispatchedUploads[0].applyBranding, true);

  const completed = publishingRepo.getDestinationById(destRow.id) as any;
  assert.equal(completed.status, 'published');
  assert.equal(completed.branded_video_path, renderedJobs[0].outputPath);
});

test('Multiple destinations on a single post resolve independent media modes without cross-contamination', async () => {
  dispatchedUploads.length = 0;
  renderedJobs.length = 0;

  const created = publishingService.createPost({
    videoId: 'video-master-1',
    title: 'Multi-Destination Independent Modes',
    destinations: [
      {
        accountId: pageAId,
        caption: 'Page A gets Original Master',
        selectedVariantId: 'original',
        applyBranding: false,
      },
      {
        accountId: pageBId,
        caption: 'Page B gets Saved Branded Variant A',
        selectedVariantId: 'variant-master-1-a',
        applyBranding: false,
      },
      {
        accountId: pageCId,
        caption: 'Page C gets Dynamic Account Branding at Dispatch',
        selectedVariantId: null,
        applyBranding: true,
      },
    ],
  });

  const rows = publishingRepo.getPostDestinationRows(created.postId) as any[];
  assert.equal(rows.length, 3);

  const rowA = rows.find((r) => r.account_id === pageAId)!;
  const rowB = rows.find((r) => r.account_id === pageBId)!;
  const rowC = rows.find((r) => r.account_id === pageCId)!;

  assert.equal(rowA.selected_variant_id, 'original');
  assert.equal(rowA.apply_branding, 0);
  assert.equal(rowA.branded_video_path, null);

  assert.equal(rowB.selected_variant_id, 'variant-master-1-a');
  assert.equal(rowB.apply_branding, 0);
  assert.equal(rowB.branded_video_path, savedVariantAPath);

  assert.equal(rowC.selected_variant_id, null);
  assert.equal(rowC.apply_branding, 1);
  assert.equal(rowC.branded_video_path, null);

  const queue = new QueueService();
  for (const row of [rowA, rowB, rowC]) {
    const job = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === row.id);
    assert.ok(job);
    await (queue as any).executeDestinationJob(job);
  }

  assert.equal(renderedJobs.length, 1, 'Only Page C should trigger dynamic FFmpeg rendering');
  assert.equal(renderedJobs[0].brandKit.text, '@page.c.brand');

  const uploadA = dispatchedUploads.find((u) => u.accountId === pageAId)!;
  const uploadB = dispatchedUploads.find((u) => u.accountId === pageBId)!;
  const uploadC = dispatchedUploads.find((u) => u.accountId === pageCId)!;

  assert.equal(uploadA.videoPath, masterPath);
  assert.equal(uploadB.videoPath, savedVariantAPath);
  assert.equal(uploadC.videoPath, renderedJobs[0].outputPath);
});

test('Scheduled publishing and historical scheduled destinations preserve branding_override_json, account brand kit, and fail-closed variant checks', async () => {
  dispatchedUploads.length = 0;
  renderedJobs.length = 0;

  const futureIso = new Date(Date.now() + 3600_000).toISOString();
  const created = publishingService.createPost({
    videoId: 'video-master-1',
    title: 'Scheduled Branding Resolution',
    scheduledAt: futureIso,
    destinations: [
      {
        accountId: pageAId,
        caption: 'Scheduled with frozen override',
        selectedVariantId: null,
        applyBranding: true,
        brandingOverride: {
          watermarkType: 'moving_text',
          text: '@frozen.schedule.brand',
          movementPreset: 'diagonal_bounce',
        },
      },
      {
        accountId: pageBId,
        caption: 'Scheduled with account brand kit resolved at due time',
        selectedVariantId: null,
        applyBranding: true,
      },
    ],
  });

  // Simulate historical scheduled destination with selected_variant_id = null but pre-assigned branded_video_path
  const legacyMissingVariantPath = path.join(rendersDir, 'legacy-deleted-variant.mp4');
  db.prepare(
    `INSERT INTO publishing_destinations
      (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status)
     VALUES (?, ?, ?, ?, '', 0, ?, NULL, 'scheduled')`
  ).run('dest-legacy-scheduled-missing', created.postId, pageCId, 'Legacy scheduled variant', legacyMissingVariantPath);

  // Advance schedule to become due
  db.prepare('UPDATE publishing_posts SET scheduled_at = ? WHERE id = ?').run(
    new Date(Date.now() - 5000).toISOString(),
    created.postId
  );

  const due = publishingRepo.getDueScheduledDestinations().filter((d) => d.post_id === created.postId);
  assert.equal(due.length, 3);
  for (const d of due) {
    publishingRepo.updateDestinationStatus(d.id, 'preparing', 0);
    publishingRepo.updateParentPostStatus(d.post_id, 'processing');
  }

  const queue = new QueueService();
  for (const d of due) {
    const job = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === d.id);
    assert.ok(job);
    await (queue as any).executeDestinationJob(job);
  }

  // 1. Frozen brandingOverride was respected
  const uploadA = dispatchedUploads.find((u) => u.accountId === pageAId)!;
  assert.ok(uploadA);
  assert.ok(renderedJobs.some((r) => r.outputPath === uploadA.videoPath && r.brandKit.text === '@frozen.schedule.brand'));

  // 2. Account brand_kit_json was resolved for Page B
  const uploadB = dispatchedUploads.find((u) => u.accountId === pageBId)!;
  assert.ok(uploadB);
  assert.ok(renderedJobs.some((r) => r.outputPath === uploadB.videoPath && r.brandKit.text === '@page.b.brand'));

  // 3. Legacy scheduled destination with missing branded_video_path failed closed and did NOT fall back to masterPath
  const legacyDest = publishingRepo.getDestinationById('dest-legacy-scheduled-missing') as any;
  assert.equal(legacyDest.status, 'failed');
  assert.match(legacyDest.error_message || '', /Selected branded variant is unavailable/);
  assert.equal(
    dispatchedUploads.some((u) => u.destinationId === 'dest-legacy-scheduled-missing'),
    false,
    'Missing legacy branded file must never silently fall back to original master'
  );
});

test('Retries preserve exact media selection and re-verify missing variant files before upload', async () => {
  dispatchedUploads.length = 0;
  renderedJobs.length = 0;

  const transientVariantPath = path.join(rendersDir, 'transient-retry-variant.mp4');
  publishingRepo.insertBrandedVideo({
    id: 'variant-transient-retry',
    videoId: 'video-master-1',
    presetName: 'Transient Retry Variant',
    movementPreset: 'smooth_sine',
    watermarkText: '@transient.retry',
    filePath: transientVariantPath,
    fileSize: 28,
    duration: 15,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    brandKitJson: '{}',
  });

  // Ensure file is absent on first attempt
  if (fs.existsSync(transientVariantPath)) fs.unlinkSync(transientVariantPath);

  const created = publishingService.createPost({
    videoId: 'video-master-1',
    title: 'Retry Media Preservation Test',
    destinations: [
      {
        accountId: pageAId,
        caption: 'Retry saved variant destination',
        selectedVariantId: 'variant-transient-retry',
        applyBranding: false,
      },
    ],
  });

  const destId = publishingRepo.getPostDestinationRows(created.postId)[0].id;
  const queue = new QueueService();

  // First dispatch fails closed because variant file is missing
  const firstJob = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === destId)!;
  await (queue as any).executeDestinationJob(firstJob);

  const afterFirst = publishingRepo.getDestinationById(destId) as any;
  assert.equal(afterFirst.status, 'failed');
  assert.match(afterFirst.error_message || '', /Selected branded variant is unavailable/);
  assert.equal(dispatchedUploads.length, 0);

  // Restore the branded file on disk and trigger explicit retryDestination
  fs.writeFileSync(transientVariantPath, 'restored-branded-variant-file');
  publishingService.retryDestination(destId);

  const retryJob = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === destId)!;
  assert.equal(retryJob.selected_variant_id, 'variant-transient-retry');
  assert.equal(retryJob.branded_video_path, transientVariantPath);

  await (queue as any).executeDestinationJob(retryJob);

  const afterRetry = publishingRepo.getDestinationById(destId) as any;
  assert.equal(afterRetry.status, 'published');
  assert.equal(afterRetry.status, 'published');
  assert.equal(dispatchedUploads.length, 1);
  assert.equal(dispatchedUploads[0].videoPath, transientVariantPath);
});

test('TASK 06: Worker fails closed on contradictory media configurations and unreadable/empty/directory files before any connector invocation', async () => {
  dispatchedUploads.length = 0;
  renderedJobs.length = 0;

  const created = publishingService.createPost({
    videoId: 'video-master-1',
    title: 'Contradictory & Preflight Guard Test',
    destinations: [
      {
        accountId: pageAId,
        caption: 'Base destination',
        selectedVariantId: 'original',
        applyBranding: false,
      },
    ],
  });

  const postId = created.postId;
  const queue = new QueueService();

  // Case 1: selected_variant_id = 'original' AND branded_video_path points to a non-original file
  db.prepare(
    `INSERT INTO publishing_destinations
      (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status)
     VALUES (?, ?, ?, 'Contradictory original + branded path', '', 0, ?, 'original', 'preparing')`
  ).run('dest-contra-orig-branded-path', postId, pageAId, savedVariantAPath);

  const job1 = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === 'dest-contra-orig-branded-path')!;
  await (queue as any).executeDestinationJob(job1);
  const res1 = publishingRepo.getDestinationById('dest-contra-orig-branded-path') as any;
  assert.equal(res1.status, 'failed');
  assert.match(res1.error_message || '', /Contradictory media configuration: destination is set to Original Master/);
  assert.equal(dispatchedUploads.length, 0, 'Connector must never be called on contradictory media configuration');

  // Case 2: selected_variant_id = 'original' AND apply_branding = 1
  db.prepare(
    `INSERT INTO publishing_destinations
      (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status)
     VALUES (?, ?, ?, 'Contradictory original + apply_branding', '', 1, NULL, 'original', 'preparing')`
  ).run('dest-contra-orig-apply', postId, pageAId);

  const job2 = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === 'dest-contra-orig-apply')!;
  await (queue as any).executeDestinationJob(job2);
  const res2 = publishingRepo.getDestinationById('dest-contra-orig-apply') as any;
  assert.equal(res2.status, 'failed');
  assert.match(res2.error_message || '', /Contradictory media configuration: destination is set to Original Master/);
  assert.equal(dispatchedUploads.length, 0);

  // Case 3: selected_variant_id is a saved variant ID AND apply_branding = 1
  db.prepare(
    `INSERT INTO publishing_destinations
      (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status)
     VALUES (?, ?, ?, 'Contradictory saved variant + apply_branding', '', 1, ?, 'variant-master-1-a', 'preparing')`
  ).run('dest-contra-variant-apply', postId, pageAId, savedVariantAPath);

  const job3 = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === 'dest-contra-variant-apply')!;
  await (queue as any).executeDestinationJob(job3);
  const res3 = publishingRepo.getDestinationById('dest-contra-variant-apply') as any;
  assert.equal(res3.status, 'failed');
  assert.match(res3.error_message || '', /Contradictory media configuration/);
  assert.equal(dispatchedUploads.length, 0);

  // Case 4: apply_branding = 1 with pre-populated branded_video_path on retry_count = 0
  db.prepare(
    `INSERT INTO publishing_destinations
      (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status, retry_count)
     VALUES (?, ?, ?, 'Contradictory dispatch branding + prefilled path', '', 1, ?, NULL, 'preparing', 0)`
  ).run('dest-contra-dispatch-prefilled', postId, pageAId, savedVariantAPath);

  const job4 = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === 'dest-contra-dispatch-prefilled')!;
  await (queue as any).executeDestinationJob(job4);
  const res4 = publishingRepo.getDestinationById('dest-contra-dispatch-prefilled') as any;
  assert.equal(res4.status, 'failed');
  assert.match(res4.error_message || '', /Contradictory media configuration/);
  assert.equal(dispatchedUploads.length, 0);

  // Case 5: 0-byte empty file preflight failure
  const emptyVariantPath = path.join(rendersDir, 'zero-byte-variant.mp4');
  fs.writeFileSync(emptyVariantPath, '');
  publishingRepo.insertBrandedVideo({
    id: 'variant-zero-byte',
    videoId: 'video-master-1',
    presetName: 'Zero Byte Variant',
    movementPreset: 'smooth_sine',
    watermarkText: '@zero',
    filePath: emptyVariantPath,
    fileSize: 0,
    duration: 15,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    brandKitJson: '{}',
  });

  db.prepare(
    `INSERT INTO publishing_destinations
      (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status)
     VALUES (?, ?, ?, 'Zero byte variant', '', 0, ?, 'variant-zero-byte', 'preparing')`
  ).run('dest-zero-byte-file', postId, pageAId, emptyVariantPath);

  const job5 = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === 'dest-zero-byte-file')!;
  await (queue as any).executeDestinationJob(job5);
  const res5 = publishingRepo.getDestinationById('dest-zero-byte-file') as any;
  assert.equal(res5.status, 'failed');
  assert.match(res5.error_message || '', /empty/i);
  assert.equal(dispatchedUploads.length, 0);

  // Case 6: Directory path preflight failure
  const dirVariantPath = path.join(rendersDir, 'dir-instead-of-file');
  fs.mkdirSync(dirVariantPath, { recursive: true });
  db.prepare(
    `INSERT INTO publishing_destinations
      (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status)
     VALUES (?, ?, ?, 'Directory path', '', 0, ?, NULL, 'preparing')`
  ).run('dest-dir-path', postId, pageAId, dirVariantPath);

  const job6 = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === 'dest-dir-path')!;
  await (queue as any).executeDestinationJob(job6);
  const res6 = publishingRepo.getDestinationById('dest-dir-path') as any;
  assert.equal(res6.status, 'failed');
  assert.match(res6.error_message || '', /not a regular file/i);
  assert.equal(dispatchedUploads.length, 0);
});

test('Queue validates persisted variant ownership through the actual pending-job query', async () => {
  const post = publishingService.createPost({ videoId: 'video-master-1', title: 'Ownership', destinations: [{ accountId: pageAId, selectedVariantId: 'original', applyBranding: false }] });
  const queue = new QueueService();
  for (const [id, variant, file] of [['wrong-master', 'variant-master-2-b', savedVariantBPath], ['missing-record', 'deleted-variant', savedVariantAPath], ['wrong-path', 'variant-master-1-a', savedVariantBPath]] as const) {
    db.prepare("INSERT INTO publishing_destinations (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status) VALUES (?, ?, ?, '', '', 0, ?, ?, 'preparing')").run(id, post.postId, pageAId, file, variant);
    const job = publishingRepo.getPendingQueueJobs(100).find(j => j.id === id);
    assert.equal(job.video_id, 'video-master-1');
    dispatchedUploads.length = 0;
    await (queue as any).executeDestinationJob(job);
    assert.equal((publishingRepo.getDestinationById(id) as any).status, 'failed');
    assert.equal(dispatchedUploads.length, 0);
  }
  db.prepare("INSERT INTO publishing_destinations (id, post_id, account_id, caption, hashtags, apply_branding, branded_video_path, selected_variant_id, status) VALUES (?, ?, ?, '', '', 1, ?, NULL, 'preparing')").run('dynamic-original-path', post.postId, pageAId, masterPath);
  dispatchedUploads.length = 0;
  await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find(j => j.id === 'dynamic-original-path'));
  assert.match((publishingRepo.getDestinationById('dynamic-original-path') as any).error_message, /points to the original master/i);
  assert.equal(dispatchedUploads.length, 0);
});

test('Queue blocks a modified imported master before connector invocation', async () => {
  const file = path.join(uploadsDir, 'verified-master.mp4');
  const expected = Buffer.from('verified-master-content');
  fs.writeFileSync(file, expected);
  publishingRepo.insertVideo({ id: 'verified-master', title: 'Verified', sourceType: 'pipeline_import', originalFilename: 'verified.mp4', filePath: file, fileSize: expected.length, duration: 10, width: 1080, height: 1920, aspectRatio: '9:16', metadataJson: JSON.stringify({ sha256: createHash('sha256').update(expected).digest('hex') }) });
  const post = publishingService.createPost({ videoId: 'verified-master', title: 'Changed master', destinations: [{ accountId: pageAId, selectedVariantId: 'original', applyBranding: false }] });
  const dest = publishingRepo.getPostDestinationRows(post.postId)[0];
  fs.writeFileSync(file, 'tampered-master-content');
  dispatchedUploads.length = 0;
  await (new QueueService() as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find(j => j.id === dest.id));
  assert.equal(dispatchedUploads.length, 0);
  assert.match((publishingRepo.getDestinationById(dest.id) as any).error_message, /identity cannot be verified/i);
});

test('Dispatch descriptions respect renderer movement and zero opacity', () => {
  const account: any = { name: 'Page', handle: 'page', brandKit: { mode: 'moving', watermarkType: 'static_text', movementPreset: 'smooth_sine', text: 'mark', opacity: 1 } };
  assert.equal(describeDispatchBranding(account).rendersMovingWatermark, true);
  account.brandKit.opacity = 0;
  assert.equal(describeDispatchBranding(account).hasVisibleBranding, false);
  const invalid = describeDispatchBranding(account, { brandingOverride: '{invalid' });
  assert.match(invalid.reviewSummary, /invalid/i);
});

test('Dynamic render is pinned and reused after explicit retry despite account changes', async () => {
  const post = publishingService.createPost({ videoId: 'video-master-1', title: 'Pinned retry', destinations: [{ accountId: pageAId, selectedVariantId: null, applyBranding: true }] });
  const destination = publishingRepo.getPostDestinationRows(post.postId)[0];
  const queue = new QueueService();
  const savedPublish = MetaFacebookConnector.prototype.publishVideo;
  let attempts = 0;
  MetaFacebookConnector.prototype.publishVideo = async (_account: any, payload: any) => {
    attempts++;
    if (attempts === 1) return { success: false, errorMessage: 'fixture failure' } as any;
    dispatchedUploads.push({ destinationId: payload.destinationId, accountId: payload.accountId, videoPath: payload.videoPath, applyBranding: payload.applyBranding });
    return { success: true, remotePostId: 'retry-fixture', remotePostUrl: 'https://www.facebook.com/reel/retry-fixture', verificationStatus: 'confirmed' } as any;
  };
  try {
    renderedJobs.length = 0; dispatchedUploads.length = 0;
    await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find(j => j.id === destination.id));
    assert.equal((publishingRepo.getDestinationById(destination.id) as any).status, 'failed');
    const pinned = renderedJobs[0].outputPath;
    db.prepare('UPDATE accounts SET brand_kit_json = ? WHERE id = ?').run(JSON.stringify({ text: 'changed', movementPreset: 'corner_jump' }), pageAId);
    publishingService.retryDestination(destination.id);
    await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find(j => j.id === destination.id));
    assert.equal(renderedJobs.length, 1);
    assert.equal(dispatchedUploads[0].videoPath, pinned);
  } finally { MetaFacebookConnector.prototype.publishVideo = savedPublish; }
});

test('Changed pinned render is rejected before retry connector invocation', async () => {
  const post = publishingService.createPost({ videoId: 'video-master-1', title: 'Changed pin', destinations: [{ accountId: pageBId, selectedVariantId: null, applyBranding: true }] });
  const destination = publishingRepo.getPostDestinationRows(post.postId)[0];
  const queue = new QueueService();
  const savedPublish = MetaFacebookConnector.prototype.publishVideo;
  let calls = 0;
  MetaFacebookConnector.prototype.publishVideo = async () => { calls++; return { success: false, errorMessage: 'fixture failure' } as any; };
  try {
    renderedJobs.length = 0;
    await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find(j => j.id === destination.id));
    fs.writeFileSync(renderedJobs[0].outputPath, 'modified-render');
    publishingService.retryDestination(destination.id);
    await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find(j => j.id === destination.id));
    assert.equal(calls, 1);
    assert.match((publishingRepo.getDestinationById(destination.id) as any).error_message, /changed/i);
  } finally { MetaFacebookConnector.prototype.publishVideo = savedPublish; }
});

test('A missing pinned render is held before retry can contact the connector', async () => {
  const post = publishingService.createPost({ videoId: 'video-master-1', title: 'Missing pin', destinations: [{ accountId: pageBId, selectedVariantId: null, applyBranding: true }] });
  const destination = publishingRepo.getPostDestinationRows(post.postId)[0];
  const queue = new QueueService();
  const savedPublish = MetaFacebookConnector.prototype.publishVideo;
  let calls = 0;
  MetaFacebookConnector.prototype.publishVideo = async () => { calls++; return { success: false, errorMessage: 'fixture failure' } as any; };
  try {
    renderedJobs.length = 0;
    await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find(j => j.id === destination.id));
    fs.unlinkSync(renderedJobs[0].outputPath);
    publishingService.retryDestination(destination.id);
    await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find(j => j.id === destination.id));
    assert.equal(calls, 1);
    assert.match((publishingRepo.getDestinationById(destination.id) as any).error_message, /unavailable/i);
  } finally { MetaFacebookConnector.prototype.publishVideo = savedPublish; }
});

test('TASK 02: Dispatch branding descriptions, null-vs-empty watermark semantics, supported branding modes, and account branding changed before scheduled dispatch', async () => {
  dispatchedUploads.length = 0;
  renderedJobs.length = 0;

  const sampleMeta = {
    duration: 15,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    sizeBytes: 1024,
  };

  // 1. Verify UI helper (describeDispatchBranding) and backend FFmpeg filter (buildWatermarkFilter) agree across all modes
  const baseAcc: any = {
    id: 'acc-test-modes',
    platform: 'facebook',
    account_type: 'page',
    name: 'Branding Modes Test Page',
    handle: 'modes.test.handle',
    status: 'connected',
    connector_mode: 'official_api',
    health_status: 'healthy',
  };

  // 1a. Explicitly empty watermark text ("") must NOT be replaced with @handle
  const emptyTextAcc = {
    ...baseAcc,
    brandKit: { mode: 'moving', text: '', movementPreset: 'smooth_sine', opacity: 0.85 },
  };
  const emptyDesc = describeDispatchBranding(emptyTextAcc);
  assert.equal(emptyDesc.effectiveWatermarkText, '');
  assert.equal(emptyDesc.isWatermarkTextExplicitlyEmpty, true);
  assert.equal(emptyDesc.hasVisibleBranding, false);
  assert.match(emptyDesc.warningMessage || '', /explicitly empty/i);
  const emptyFilter = ffmpegService.buildWatermarkFilter(
    { watermarkType: 'moving_text', text: '', mode: 'moving', movementPreset: 'smooth_sine' },
    sampleMeta
  );
  assert.equal(emptyFilter, '', 'Explicitly empty text must not produce a drawtext filter');

  // 1b. Null / undefined watermark text falls back to account.handle
  const nullTextAcc = {
    ...baseAcc,
    brandKit: { mode: 'moving', text: null as any, movementPreset: 'corner_jump', opacity: 0.9 },
  };
  const nullDesc = describeDispatchBranding(nullTextAcc);
  assert.equal(nullDesc.effectiveWatermarkText, 'modes.test.handle');
  assert.equal(nullDesc.isWatermarkTextExplicitlyEmpty, false);
  assert.equal(nullDesc.hasVisibleBranding, true);
  assert.equal(nullDesc.rendersMovingWatermark, true);
  assert.equal(nullDesc.warningMessage, undefined);
  const nullFilter = ffmpegService.buildWatermarkFilter(
    { watermarkType: 'moving_text', text: 'modes.test.handle', mode: 'moving', movementPreset: 'corner_jump' },
    sampleMeta
  );
  assert.match(nullFilter, /drawtext=/);

  // 1c. mode: 'none' (No watermark)
  const noneAcc = {
    ...baseAcc,
    brandKit: { mode: 'none', text: '@ignored.text', movementPreset: 'smooth_sine' },
  };
  const noneDesc = describeDispatchBranding(noneAcc);
  assert.equal(noneDesc.mode, 'none');
  assert.equal(noneDesc.hasVisibleBranding, false);
  assert.match(noneDesc.warningMessage || '', /No Watermark/);
  const noneFilter = ffmpegService.buildWatermarkFilter(
    { watermarkType: 'moving_text', mode: 'none', text: '@ignored.text', movementPreset: 'smooth_sine' },
    sampleMeta
  );
  assert.equal(noneFilter, '');

  // 1d. mode: 'caption' (Caption-only branding using signatureText)
  const captionAcc = {
    ...baseAcc,
    brandKit: { mode: 'caption', text: '@ignored.moving', signatureText: 'Breaking Tech Story', opacity: 0.8 },
  };
  const captionDesc = describeDispatchBranding(captionAcc);
  assert.equal(captionDesc.mode, 'caption');
  assert.equal(captionDesc.rendersBottomCaption, true);
  assert.equal(captionDesc.rendersMovingWatermark, false);
  assert.equal(captionDesc.hasVisibleBranding, true);
  assert.match(captionDesc.reviewSummary, /Bottom caption only: "Breaking Tech Story"/);
  const captionFilter = ffmpegService.buildWatermarkFilter(
    { watermarkType: 'moving_text', mode: 'caption', text: '@ignored.moving', signatureText: 'Breaking Tech Story', movementPreset: 'smooth_sine' },
    sampleMeta
  );
  assert.match(captionFilter, /Breaking Tech Story/);
  assert.equal(captionFilter.includes('@ignored.moving'), false);

  // 1e. mode: 'moving_and_caption'
  const bothAcc = {
    ...baseAcc,
    brandKit: {
      mode: 'moving_and_caption',
      text: '@both.brand',
      signatureText: 'Subscribe for Tech',
      movementPreset: 'diagonal_bounce',
    },
  };
  const bothDesc = describeDispatchBranding(bothAcc, { isScheduled: true });
  assert.equal(bothDesc.mode, 'moving_and_caption');
  assert.equal(bothDesc.rendersMovingWatermark, true);
  assert.equal(bothDesc.rendersBottomCaption, true);
  assert.match(bothDesc.scheduleResolutionNote, /when the scheduled time arrives/);

  // 1f. Frozen brandingOverride note when scheduled
  const frozenDesc = describeDispatchBranding(bothAcc, {
    isScheduled: true,
    brandingOverride: { mode: 'moving', text: '@frozen.override', movementPreset: 'static_corner' },
  });
  assert.equal(frozenDesc.configSource, 'frozen_override');
  assert.equal(frozenDesc.effectiveWatermarkText, '@frozen.override');
  assert.equal(frozenDesc.rendersStaticWatermark, true);
  assert.match(frozenDesc.scheduleResolutionNote, /Frozen branding override/);

  // 2. Runtime verification: account branding changed AFTER scheduling (without override) uses the NEW account brand kit at dispatch
  const futureIso = new Date(Date.now() + 3600_000).toISOString();
  const created = publishingService.createPost({
    videoId: 'video-master-1',
    title: 'Account Branding Changed Before Scheduled Dispatch',
    scheduledAt: futureIso,
    destinations: [
      {
        accountId: pageBId,
        caption: 'Live account brand kit at dispatch',
        selectedVariantId: null,
        applyBranding: true,
      },
    ],
  });

  // Update Page B's brand_kit_json BEFORE the scheduled job runs (including empty text vs caption mode)
  db.prepare(`UPDATE accounts SET brand_kit_json = ? WHERE id = ?`).run(
    JSON.stringify({ mode: 'caption', text: 'Updated Scheduled Caption Banner', captionPosition: 'top', opacity: 0.95 }),
    pageBId
  );

  db.prepare('UPDATE publishing_posts SET scheduled_at = ? WHERE id = ?').run(
    new Date(Date.now() - 5000).toISOString(),
    created.postId
  );

  const due = publishingRepo.getDueScheduledDestinations().filter((d) => d.post_id === created.postId);
  assert.equal(due.length, 1);
  publishingRepo.updateDestinationStatus(due[0].id, 'preparing', 0);

  const queue = new QueueService();
  const job = publishingRepo.getPendingQueueJobs(100).find((j) => j.id === due[0].id)!;
  await (queue as any).executeDestinationJob(job);

  assert.equal(renderedJobs.length, 1);
  assert.equal(renderedJobs[0].brandKit.mode, 'caption');
  assert.equal(renderedJobs[0].brandKit.text, 'Updated Scheduled Caption Banner');
});
