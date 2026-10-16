import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { seedInitialData } from '../server/src/db/seed.js';
import { analyticsRepo } from '../server/src/repositories/analytics.repo.js';
import { inboxRepo } from '../server/src/repositories/inbox.repo.js';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { syncService } from '../server/src/services/sync.service.js';
import { getConnector } from '../server/src/connectors/registry.js';
import { seal } from '../server/src/services/token-protection.js';

let testAccountId: string;
let testDestId: string;
let testPostId: string;
let testVideoId: string;

before(() => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  initializeDatabase();
  seedInitialData();

  // Create isolated real account fixture
  testAccountId = `acc-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO accounts (id, platform, account_type, name, handle, status, connector_mode)
    VALUES (?, 'facebook', 'page', 'Test Analytics Page', '@testpage', 'connected', 'browser_bridge')
  `).run(testAccountId);

  testVideoId = `vid-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO videos (id, title, source_type, original_filename, file_path, aspect_ratio, duration, file_size)
    VALUES (?, 'Test Reel', 'manual_upload', 'test.mp4', 'uploads/test.mp4', '9:16', 15, 1024)
  `).run(testVideoId);

  testPostId = `post-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO publishing_posts (id, video_id, title, status)
    VALUES (?, ?, 'Test Post Title', 'completed')
  `).run(testPostId, testVideoId);

  testDestId = `dest-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO publishing_destinations (
      id, post_id, account_id, caption, status, remote_post_id, remote_post_url, verification_status
    ) VALUES (?, ?, ?, 'Test Caption', 'published', '1234567890', 'https://facebook.com/reel/1234567890', 'confirmed')
  `).run(testDestId, testPostId, testAccountId);
});

test('1. recordPostMetricSnapshot stores snapshots and maintains historical records', () => {
  const snap1 = analyticsRepo.recordPostMetricSnapshot({
    destination_id: testDestId,
    account_id: testAccountId,
    platform: 'facebook',
    remote_post_id: '1234567890',
    view_count: 100,
    like_count: 10,
    comment_count: 2,
    share_count: 1,
    source: 'browser_verified',
    provenance_status: 'confirmed',
    status_detail: 'Initial verified view',
  });

  assert.ok(snap1.id);
  assert.equal(snap1.view_count, 100);
  assert.equal(snap1.source, 'browser_verified');

  // Verify historical retrieval
  const history1 = analyticsRepo.getPostHistory(testDestId);
  assert.equal(history1.length, 1);
  assert.equal(history1[0].view_count, 100);

  // Add a second observation with higher views
  const snap2 = analyticsRepo.recordPostMetricSnapshot({
    destination_id: testDestId,
    account_id: testAccountId,
    platform: 'facebook',
    remote_post_id: '1234567890',
    view_count: 250,
    like_count: 25,
    comment_count: 5,
    share_count: 3,
    source: 'meta_graph_api',
    provenance_status: 'confirmed',
    status_detail: 'Updated via API',
  });

  assert.notEqual(snap1.id, snap2.id);

  // Verify both historical snapshots survive in chronological order
  const history2 = analyticsRepo.getPostHistory(testDestId);
  assert.equal(history2.length, 2);
  assert.equal(history2[0].view_count, 100);
  assert.equal(history2[1].view_count, 250);
});

test('2. getVideoPerformanceList returns latest metric values with provenance badges', () => {
  const videos = analyticsRepo.getVideoPerformanceList({ accountId: testAccountId });
  assert.equal(videos.length, 1);
  assert.equal(videos[0].destination_id, testDestId);
  assert.equal(videos[0].views, 250);
  assert.equal(videos[0].likes, 25);
  assert.equal(videos[0].source, 'meta_graph_api');
  assert.equal(videos[0].provenance_status, 'confirmed');
});

test('3. getOverviewTotals aggregates confirmed metrics and isolates real accounts', () => {
  const totals = analyticsRepo.getOverviewTotals({ accountId: testAccountId });
  assert.equal(totals.total_views, 250);
  assert.equal(totals.total_likes, 25);
  assert.equal(totals.total_comments, 5);
  assert.equal(totals.total_shares, 3);
  assert.equal(totals.total_synced_videos, 1);
});

test('4. syncService.recordObservation detects increases and logs activity events', () => {
  const newSnapshot = syncService.recordObservation({
    destinationId: testDestId,
    viewCount: 300,
    likeCount: 30,
    commentCount: 6,
    shareCount: 4,
    source: 'browser_verified',
    notes: 'View count increased from 250 to 300',
  });

  assert.equal(newSnapshot.view_count, 300);

  // Check activity events for engagement_increased
  const event = db.prepare(`
    SELECT * FROM activity_events
    WHERE account_id = ? AND type = 'engagement_increased'
    ORDER BY created_at DESC LIMIT 1
  `).get(testAccountId) as any;

  assert.ok(event);
  assert.match(event.message, /views increased from 250 to 300/);
});

test('5. inboxRepo.upsertComment deduplicates comments and handles threaded replies', () => {
  const extCommentId = 'fb-comment-101';
  const cmtId1 = inboxRepo.upsertComment({
    account_id: testAccountId,
    destination_id: testDestId,
    platform: 'facebook',
    external_comment_id: extCommentId,
    author_name: 'Alice Fan',
    content: 'Love this AI video!',
    created_time: '2026-10-16T12:00:00Z',
    like_count: 1,
    video_title: 'Test Reel',
    source: 'meta_graph_api',
  });

  assert.ok(cmtId1);

  // Upsert the same external comment with updated likes
  const cmtId2 = inboxRepo.upsertComment({
    account_id: testAccountId,
    destination_id: testDestId,
    platform: 'facebook',
    external_comment_id: extCommentId,
    author_name: 'Alice Fan',
    content: 'Love this AI video!',
    created_time: '2026-10-16T12:00:00Z',
    like_count: 5,
    video_title: 'Test Reel',
    source: 'meta_graph_api',
  });

  // Must not insert a duplicate row
  assert.equal(cmtId1.id, cmtId2.id);
  assert.equal(cmtId1.isNew, true);
  assert.equal(cmtId2.isNew, false);

  const count = db.prepare(`
    SELECT COUNT(*) as cnt FROM comments WHERE account_id = ? AND external_comment_id = ?
  `).get(testAccountId, extCommentId) as any;
  assert.equal(count.cnt, 1);

  // Add a threaded reply to this comment
  const replyId = inboxRepo.upsertComment({
    account_id: testAccountId,
    destination_id: testDestId,
    platform: 'facebook',
    external_comment_id: 'fb-reply-202',
    parent_comment_id: extCommentId,
    author_name: 'Bob Viewer',
    content: 'Me too, the watermark animation is great!',
    created_time: '2026-10-16T12:05:00Z',
    like_count: 0,
    video_title: 'Test Reel',
    source: 'meta_graph_api',
  });

  assert.ok(replyId);

  // Fetch comments and verify threaded reply hierarchy
  const res = inboxRepo.getComments({ accountId: testAccountId });
  assert.equal(res.length, 1); // Only 1 top-level comment
  assert.equal(res[0].id, cmtId1.id);
  assert.ok(res[0].replies);
  assert.equal(res[0].replies.length, 1);
  assert.equal(res[0].replies[0].content, 'Me too, the watermark animation is great!');
});

test('6. inboxRepo.markReplied persists explicit replies accurately', () => {
  const comment = db.prepare(`SELECT * FROM comments WHERE external_comment_id = 'fb-comment-101'`).get() as any;
  assert.ok(comment);

  inboxRepo.markReplied(comment.id, 'Thank you so much!', 'fb-official-reply-303');

  const updated = db.prepare(`SELECT * FROM comments WHERE id = ?`).get(comment.id) as any;
  assert.equal(updated.has_replied, 1);
  assert.equal(updated.awaiting_reply, 0);
  assert.equal(updated.reply_text, 'Thank you so much!');
  assert.equal(updated.reply_id, 'fb-official-reply-303');
  assert.equal(updated.status, 'handled');
});

test('7. TikTok Personal Account reports honest reply capability restrictions', () => {
  const ttPersonalUnauth = {
    id: 'acc-tt-personal-fixture',
    platform: 'tiktok' as const,
    account_type: 'personal' as const,
    name: 'TikTok Creator',
    handle: '@ttcreator',
    status: 'connected' as const,
    connector_mode: 'official_api' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1. Without active OAuth tokens, capabilities are honestly restricted
  const unauthCaps = getConnector(ttPersonalUnauth).getCapabilities();
  assert.equal(unauthCaps.canReply, false, 'Unauthenticated account cannot reply');
  assert.equal(unauthCaps.canReadPostMetrics, false, 'Unauthenticated account cannot read metrics via API');

  // 2. With active authorization and video.list scope, post metrics are enabled but comments remain restricted
  const ttPersonalAuth = {
    ...ttPersonalUnauth,
    access_token: seal('valid-token'),
    identity_verified_at: new Date().toISOString(),
    token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    granted_scopes_json: JSON.stringify(['user.info.basic', 'video.list', 'video.query']),
  };

  const authCaps = getConnector(ttPersonalAuth).getCapabilities();
  assert.equal(authCaps.canReadPostMetrics, true, 'Authorized TikTok account can read post metrics via video.list/query');
  assert.equal(authCaps.canReply, false, 'TikTok Personal account cannot reply remotely without comment.list.manage');
});
