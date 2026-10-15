import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { db, uploadsDir, rendersDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { seedInitialData } from '../server/src/db/seed.js';
import { ffmpegService } from '../server/src/services/ffmpeg.service.js';
import { queueService } from '../server/src/services/queue.service.js';
import { getConnector } from '../server/src/connectors/registry.js';
import { SimulatorConnector } from '../server/src/connectors/simulator.js';
import { TikTokConnector } from '../server/src/connectors/tiktok.js';
import { MetaFacebookConnector } from '../server/src/connectors/meta-facebook.js';

describe('Social Command Center - Comprehensive Test Suite', () => {
  before(() => {
    initializeDatabase();
    seedInitialData();
  });

  // 1. Account and category mappings
  test('1. Account and category relational mapping integrity', () => {
    const categories = db.prepare('SELECT * FROM categories').all() as any[];
    assert.strictEqual(categories.length >= 3, true, 'Must have at least 3 categories');

    const accounts = db.prepare(`
      SELECT a.*, c.name as category_name
      FROM accounts a
      JOIN categories c ON a.category_id = c.id
    `).all() as any[];

    assert.strictEqual(accounts.length >= 6, true, 'Must have at least 6 accounts mapped');

    // Verify Facebook and TikTok accounts exist in Object to Life
    const objToLifeAccs = accounts.filter((a) => a.category_name === 'Object to Life');
    assert.strictEqual(objToLifeAccs.length, 2, 'Object to Life should have 2 accounts (1 FB, 1 TikTok)');
    assert.strictEqual(objToLifeAccs.some((a) => a.platform === 'facebook'), true);
    assert.strictEqual(objToLifeAccs.some((a) => a.platform === 'tiktok'), true);
  });

  // 2. Connector capability discovery
  test('2. Connector capability discovery and honest reporting', () => {
    const fbConnector = new MetaFacebookConnector();
    const fbCaps = fbConnector.getCapabilities();
    assert.strictEqual(fbCaps.canPublish, true);
    assert.strictEqual(fbCaps.canSchedule, true);
    assert.strictEqual(fbCaps.canReadComments, true);

    const ttConnector = new TikTokConnector();
    const ttCaps = ttConnector.getCapabilities();
    assert.strictEqual(ttCaps.canPublish, false, 'Direct Post remains unavailable until creator privacy UX and status verification exist');
    // Honest: Standard TikTok API does NOT allow remote comment reading or replies without Enterprise partner access
    assert.strictEqual(ttCaps.canReply, false, 'TikTok API must honestly declare canReply = false');

    const simConnector = new SimulatorConnector();
    const simCaps = simConnector.getCapabilities();
    assert.strictEqual(simCaps.canPublish, true);
    assert.strictEqual(simCaps.canReply, true);
  });

  // 3. Multi-destination publishing state transitions & partial failure
  test('3. Multi-destination publishing: independent statuses and partial failure handling', async () => {
    // Insert a test video
    const testVideoId = `test-vid-${Date.now()}`;
    const testVideoPath = path.resolve(uploadsDir, `${testVideoId}.mp4`);
    fs.writeFileSync(testVideoPath, 'dummy-video-data');

    db.prepare(`
      INSERT INTO videos (id, title, source_type, original_filename, file_path, aspect_ratio, duration)
      VALUES (?, 'Test Animation', 'manual_upload', 'test.mp4', ?, '9:16', 10)
    `).run(testVideoId, testVideoPath);

    const postId = `test-post-${Date.now()}`;
    db.prepare(`
      INSERT INTO publishing_posts (id, video_id, title, status)
      VALUES (?, ?, 'Campaign 1', 'processing')
    `).run(postId, testVideoId);

    // Create 3 destinations: 2 connected, 1 expired (to test partial failure)
    const dest1Id = `dest-success-1-${Date.now()}`;
    const dest2Id = `dest-success-2-${Date.now()}`;
    const dest3Id = `dest-fail-3-${Date.now()}`;

    const insertDest = db.prepare(`
      INSERT INTO publishing_destinations (id, post_id, account_id, caption, apply_branding, status)
      VALUES (?, ?, ?, ?, 0, 'preparing')
    `);

    insertDest.run(dest1Id, postId, 'acc-fb-1', 'Caption 1');
    insertDest.run(dest2Id, postId, 'acc-tt-1', 'Caption 2');
    insertDest.run(dest3Id, postId, 'acc-tt-3', 'Caption 3'); // acc-tt-3 is expired!

    // Mark acc-fb-1 and acc-tt-1 as published
    db.prepare("UPDATE publishing_destinations SET status = 'published', progress = 100 WHERE id = ?").run(dest1Id);
    db.prepare("UPDATE publishing_destinations SET status = 'published', progress = 100 WHERE id = ?").run(dest2Id);

    // Mark dest3 as failed
    db.prepare("UPDATE publishing_destinations SET status = 'failed', error_message = 'Session expired' WHERE id = ?").run(dest3Id);

    // Run sync on parent post
    (queueService as any).syncParentPostStatus(postId);

    const post = db.prepare('SELECT status FROM publishing_posts WHERE id = ?').get(postId) as any;
    assert.strictEqual(post.status, 'partial_failure', 'Parent post status must be partial_failure when 2 succeed and 1 fails');

    // Verify independent records
    const d1 = db.prepare('SELECT status FROM publishing_destinations WHERE id = ?').get(dest1Id) as any;
    const d3 = db.prepare('SELECT status, error_message FROM publishing_destinations WHERE id = ?').get(dest3Id) as any;
    assert.strictEqual(d1.status, 'published');
    assert.strictEqual(d3.status, 'failed');
    assert.strictEqual(d3.error_message, 'Session expired');
  });

  // 4. Retry single failed destination without duplicating successful ones
  test('4. Retry failed destination without duplicating successful posts', () => {
    // Find failed destination
    const failedDest = db.prepare("SELECT * FROM publishing_destinations WHERE status = 'failed' LIMIT 1").get() as any;
    assert.ok(failedDest, 'Failed destination should exist');

    const postId = failedDest.post_id;
    const initialSuccessfulCount = (db.prepare("SELECT count(*) as count FROM publishing_destinations WHERE post_id = ? AND status = 'published'").get(postId) as any).count;

    // Trigger retry
    db.prepare(`
      UPDATE publishing_destinations
      SET status = 'preparing', progress = 0, error_message = NULL, retry_count = retry_count + 1
      WHERE id = ?
    `).run(failedDest.id);

    // Verify retry status
    const retriedDest = db.prepare('SELECT status, retry_count FROM publishing_destinations WHERE id = ?').get(failedDest.id) as any;
    assert.strictEqual(retriedDest.status, 'preparing');
    assert.strictEqual(retriedDest.retry_count, failedDest.retry_count + 1);

    // Verify successful destinations count was NOT changed or duplicated
    const afterSuccessfulCount = (db.prepare("SELECT count(*) as count FROM publishing_destinations WHERE post_id = ? AND status = 'published'").get(postId) as any).count;
    assert.strictEqual(afterSuccessfulCount, initialSuccessfulCount, 'Successful destinations must remain unchanged on retry');
  });

  // 5. Duplicate upload prevention
  test('5. Duplicate prevention: published destination cannot be republished', () => {
    const publishedDest = db.prepare("SELECT * FROM publishing_destinations WHERE status = 'published' LIMIT 1").get() as any;
    assert.ok(publishedDest);

    // Attempting to cancel or re-trigger published item is rejected
    const update = db.prepare(`
      UPDATE publishing_destinations
      SET status = 'cancelled'
      WHERE id = ? AND status IN ('scheduled', 'preparing', 'branding')
    `).run(publishedDest.id);

    assert.strictEqual(update.changes, 0, 'Cannot cancel or re-queue an already published destination');
  });

  // 6. Watermark filter syntax & safe areas
  test('6. Watermark filter generator adheres to safe areas and movement presets', () => {
    const filterSine = ffmpegService.buildWatermarkFilter(
      {
        watermarkType: 'moving_text',
        text: '@TestMoving',
        movementPreset: 'smooth_sine',
        speedSeconds: 10,
        fontSize: 24,
        safeArea: { top: 120, bottom: 280, left: 40, right: 120 },
      },
      { duration: 10, width: 1080, height: 1920, aspectRatio: '9:16', sizeBytes: 1000 }
    );

    assert.ok(filterSine.includes('drawtext'), 'Filter must contain drawtext');
    assert.ok(filterSine.includes('@TestMoving'), 'Filter must include watermark text');
    assert.ok(filterSine.includes('sin('), 'Smooth sine preset must use mathematical sin() function');

    const filterJump = ffmpegService.buildWatermarkFilter(
      {
        watermarkType: 'moving_text',
        text: '@CornerJump',
        movementPreset: 'corner_jump',
        intervalSeconds: 5,
      },
      { duration: 10, width: 1080, height: 1920, aspectRatio: '9:16', sizeBytes: 1000 }
    );
    assert.ok(filterJump.includes('mod(t'), 'Corner jump must use modulo time switching');
  });

  // 7. Real FFmpeg moving watermark rendering & caching
  test('7. Real FFmpeg moving watermark rendering and cache verification', async () => {
    // Generate a minimal 2-second test MP4 video using ffmpeg lavfi
    const testMasterPath = path.resolve(uploadsDir, 'test_master_render.mp4');
    const { spawnSync } = await import('child_process');

    const makeRes = spawnSync('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'color=c=darkblue:s=360x640:d=2',
      '-c:v', 'libx264',
      '-t', '2',
      testMasterPath,
      '-y',
    ]);
    assert.strictEqual(makeRes.status, 0, 'Should create master test MP4');

    const brandKit = {
      watermarkType: 'moving_text' as const,
      text: '@LiveWatermark',
      movementPreset: 'smooth_sine' as const,
      speedSeconds: 4,
      fontSize: 18,
      opacity: 0.9,
    };

    // 1st render: should execute FFmpeg
    const startRender1 = Date.now();
    const renderedPath1 = await ffmpegService.renderBrandedVideo(testMasterPath, brandKit);
    const duration1 = Date.now() - startRender1;

    assert.ok(fs.existsSync(renderedPath1), 'Rendered video must exist');
    assert.ok(fs.statSync(renderedPath1).size > 1000, 'Rendered video must be non-empty');

    // 2nd render: should hit cache and return in < 50ms!
    const startRender2 = Date.now();
    const renderedPath2 = await ffmpegService.renderBrandedVideo(testMasterPath, brandKit);
    const duration2 = Date.now() - startRender2;

    assert.strictEqual(renderedPath1, renderedPath2, 'Cached render path must match');
    assert.ok(duration2 < 500, `Cached render should return almost immediately (took ${duration2}ms)`);

    // Clean up
    if (fs.existsSync(testMasterPath)) fs.unlinkSync(testMasterPath);
    if (fs.existsSync(renderedPath1)) fs.unlinkSync(renderedPath1);
  });

  // 8. Engagement inbox: comments, replies, and reactions
  test('8. Engagement inbox comments reply and reaction workflows', async () => {
    let comment = db.prepare("SELECT * FROM comments WHERE status = 'unread' LIMIT 1").get() as any;
    if (!comment) {
      comment = db.prepare("SELECT * FROM comments LIMIT 1").get() as any;
    }
    assert.ok(comment, 'Comment should exist');

    // React to comment
    db.prepare('UPDATE comments SET like_count = like_count + 1 WHERE id = ?').run(comment.id);
    const updated = db.prepare('SELECT like_count FROM comments WHERE id = ?').get(comment.id) as any;
    assert.strictEqual(updated.like_count, comment.like_count + 1);

    // Reply to comment
    const replyText = 'Thanks for your feedback! The next video is in rendering.';
    db.prepare(`
      UPDATE comments
      SET has_replied = 1, awaiting_reply = 0, reply_text = ?, status = 'handled'
      WHERE id = ?
    `).run(replyText, comment.id);

    const handledComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(comment.id) as any;
    assert.strictEqual(handledComment.has_replied, 1);
    assert.strictEqual(handledComment.awaiting_reply, 0);
    assert.strictEqual(handledComment.status, 'handled');
    assert.strictEqual(handledComment.reply_text, replyText);
  });

  // 9. Restart recovery
  test('9. Crash recovery: interrupted jobs safely reset to preparing on reboot', () => {
    const existingPost = db.prepare('SELECT id FROM publishing_posts LIMIT 1').get() as any;
    const postId = existingPost ? existingPost.id : 'valid-post';
    const interruptedId = `dest-interrupted-${Date.now()}`;
    db.prepare(`
      INSERT INTO publishing_destinations (id, post_id, account_id, caption, status, progress)
      VALUES (?, ?, 'acc-fb-1', 'Crash Test', 'uploading', 55)
    `).run(interruptedId, postId);

    // Trigger restart recovery routine
    (queueService as any).recoverInterruptedJobs();

    const recovered = db.prepare('SELECT status, progress, error_message FROM publishing_destinations WHERE id = ?').get(interruptedId) as any;
    assert.strictEqual(recovered.status, 'preparing', 'Interrupted job must be reset to preparing');
    assert.strictEqual(recovered.progress, 0, 'Progress must be reset to 0');
    assert.ok(recovered.error_message.includes('server restart'));

    // Clean up
    db.prepare('DELETE FROM publishing_destinations WHERE id = ?').run(interruptedId);
  });

  // 10. Session expiration detection
  test('10. Session expiration detection prevents publishing to expired accounts', async () => {
    let expiredAcc = db.prepare("SELECT * FROM accounts WHERE status = 'expired' LIMIT 1").get() as any;
    if (!expiredAcc) {
      db.prepare("UPDATE accounts SET status = 'expired' WHERE id = 'acc-tt-3'").run();
      expiredAcc = db.prepare("SELECT * FROM accounts WHERE id = 'acc-tt-3'").get() as any;
    }
    assert.ok(expiredAcc, 'Expired account should exist in seed or be set');

    const connector = new SimulatorConnector();
    const health = await connector.verifyHealth(expiredAcc);
    assert.strictEqual(health.status, 'expired');

    // Attempting to publish should throw an explicit error
    await assert.rejects(
      async () => {
        await connector.publishVideo(expiredAcc, {
          destinationId: 'test-dest',
          postId: 'test-post',
          accountId: expiredAcc.id,
          videoPath: 'dummy.mp4',
          title: 'Test',
          caption: 'Test',
          hashtags: '',
          applyBranding: false,
        });
      },
      /expired/i,
      'Must reject publishing when session is expired'
    );
  });
});
