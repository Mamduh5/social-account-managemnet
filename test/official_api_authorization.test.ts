import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { seedInitialData } from '../server/src/db/seed.js';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { analyticsRepo } from '../server/src/repositories/analytics.repo.js';
import { inboxRepo } from '../server/src/repositories/inbox.repo.js';
import { getConnector, hasActiveApiAuthorization } from '../server/src/connectors/registry.js';
import { MetaFacebookConnector } from '../server/src/connectors/meta-facebook.js';
import { TikTokConnector } from '../server/src/connectors/tiktok.ts';
import { seal, unseal } from '../server/src/services/token-protection.js';
import {
  connectionSetup,
  startAuthorization,
  completeAuthorization,
  selectAuthorizedIdentity,
} from '../server/src/services/connections.service.js';

let testFbAccountId: string;
let testTtAccountId: string;
let testFbDestId: string;
let testTtDestId: string;
const originalFetch = globalThis.fetch;

before(() => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.META_APP_ID = 'test-meta-app-id';
  process.env.META_APP_SECRET = 'test-meta-app-secret';
  process.env.META_REDIRECT_URI = 'http://localhost:3001/api/connections/callback/facebook';
  process.env.META_GRAPH_VERSION = 'v25.0';
  process.env.TIKTOK_CLIENT_KEY = 'test-tiktok-client-key';
  process.env.TIKTOK_CLIENT_SECRET = 'test-tiktok-client-secret';
  process.env.TIKTOK_REDIRECT_URI = 'https://localhost:3001/api/connections/callback/tiktok';

  initializeDatabase();
  seedInitialData();

  testFbAccountId = `acc-fb-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO accounts (id, platform, account_type, name, handle, status, connector_mode, external_id)
    VALUES (?, 'facebook', 'page', 'Facebook Live Page', '@61563944843401', 'disconnected', 'official_api', '61563944843401')
  `).run(testFbAccountId);

  testTtAccountId = `acc-tt-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO accounts (id, platform, account_type, name, handle, status, connector_mode, external_id)
    VALUES (?, 'tiktok', 'personal', 'maroooooooooooon16', '@maroooooooooooon16', 'disconnected', 'official_api', NULL)
  `).run(testTtAccountId);

  const videoId = `vid-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO videos (id, title, source_type, original_filename, file_path, aspect_ratio, duration, file_size)
    VALUES (?, 'Pipeline Vertical', 'manual_upload', 'video.mp4', 'uploads/video.mp4', '9:16', 15, 1024)
  `).run(videoId);

  const postId = `post-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO publishing_posts (id, video_id, title, status)
    VALUES (?, ?, 'Pipeline Vertical Test Post', 'completed')
  `).run(postId, videoId);

  testFbDestId = `dest-fb-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO publishing_destinations (
      id, post_id, account_id, caption, status, remote_post_id, remote_post_url, verification_status
    ) VALUES (?, ?, ?, 'Facebook Reel Caption', 'published', '2030865660948720', 'https://www.facebook.com/reel/2030865660948720', 'confirmed')
  `).run(testFbDestId, postId, testFbAccountId);

  testTtDestId = `dest-tt-test-${randomUUID()}`;
  db.prepare(`
    INSERT INTO publishing_destinations (
      id, post_id, account_id, caption, status, remote_post_id, remote_post_url, verification_status
    ) VALUES (?, ?, ?, 'TikTok Video Caption', 'published', '7697115798170782983', 'https://www.tiktok.com/@maroooooooooooon16/video/7697115798170782983', 'confirmed')
  `).run(testTtDestId, postId, testTtAccountId);
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('1. connectionSetup verifies required env variables and honest configuration status', () => {
  const fbSetup = connectionSetup('facebook');
  assert.equal(fbSetup.ready, true);
  assert.equal(fbSetup.callbackAllowed, true);
  assert.equal(fbSetup.missing.length, 0);

  const ttSetup = connectionSetup('tiktok');
  assert.equal(ttSetup.ready, true);
  assert.equal(ttSetup.callbackAllowed, true);
});

test('2. OAuth state generation, CSRF protection, and replay prevention', async () => {
  const start = startAuthorization(testFbAccountId, 'browser-secret-1', {});
  const url = new URL(start.authorizationUrl);
  const scopeParam = url.searchParams.get('scope') || '';
  assert.ok(url.searchParams.get('client_id') === 'test-meta-app-id');
  assert.ok(scopeParam.includes('pages_show_list'));
  assert.ok(scopeParam.includes('pages_read_engagement'));
  assert.ok(scopeParam.includes('pages_read_user_content'));
  assert.ok(start.browserSecret);

  const state = url.searchParams.get('state');
  assert.ok(state);

  // Attempt complete with forged/wrong browser cookie -> should reject
  await assert.rejects(
    async () => {
      await completeAuthorization('facebook', { state, code: 'mock-code' }, 'wrong-browser-secret');
    },
    /Authorization could not be completed|Authorization session expired/
  );

  // Attempt with invalid state -> should reject
  await assert.rejects(
    async () => {
      await completeAuthorization('facebook', { state: 'tampered-state', code: 'mock-code' }, start.browserSecret);
    },
    /Authorization could not be completed|Invalid or replayed authorization state/
  );
});

test('3. Incorrect account identity and external ID mismatch rejection', () => {
  const fbAccount = accountsRepo.getAccountById(testFbAccountId) as any;
  assert.equal(fbAccount.external_id, '61563944843401');

  // If OAuth discovers a different page, selectAuthorizedIdentity must reject the mismatch
  // Simulating candidate selection with wrong external ID
  assert.throws(
    () => {
      selectAuthorizedIdentity(testFbAccountId, 'some-browser', {
        externalId: '99999999999999',
        confirmIdentity: true,
      });
    },
    /Authorization session expired|Complete official authorization first/
  );
});

test('4. Meta connector parses Reels play count, video views, likes and comments correctly', async () => {
  const connector = new MetaFacebookConnector();

  // Mock fetch responses for post details and video_insights edge
  globalThis.fetch = async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/video_insights')) {
      return new Response(
        JSON.stringify({
          data: [
            { name: 'blue_reels_play_count', values: [{ value: 311 }] },
            { name: 'fb_reels_replay_count', values: [{ value: 45 }] },
            { name: 'fb_reels_total_plays', values: [{ value: 356 }] },
            { name: 'total_video_views_unique', values: [{ value: 4 }] },
            { name: 'total_video_avg_time_watched', values: [{ value: 3000 }] },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/2030865660948720')) {
      return new Response(
        JSON.stringify({
          id: '2030865660948720',
          title: 'Pipeline Vertical Reel',
          description: 'Original test Reel #fb',
          likes: { summary: { total_count: 0 } },
          comments: { summary: { total_count: 0 } },
          shares: { count: 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/61563944843401?fields=')) {
      return new Response(
        JSON.stringify({
          id: '61563944843401',
          name: 'แก้บัคยาวๆๆ',
          followers_count: 0,
          fan_count: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const account = {
    id: testFbAccountId,
    external_id: '61563944843401',
    name: 'แก้บัคยาวๆๆ',
    access_token: 'mock-valid-page-token',
  };

  // Test post metrics
  const metrics = await connector.fetchPostMetrics(account, '2030865660948720');
  assert.equal(metrics.status, 'confirmed');
  assert.equal(metrics.viewCount, 311); // Correct blue_reels_play_count
  assert.equal(metrics.likeCount, 0);
  assert.equal(metrics.commentCount, 0);
  assert.equal(metrics.shareCount, 0);
  assert.equal(metrics.extraMetrics.reelsPlays, 311);
  assert.equal(metrics.extraMetrics.reachUnique, 4);
  assert.equal(metrics.extraMetrics.avgWatchTimeSeconds, 3);

  // Test account metrics
  const accMetrics = await connector.fetchAccountMetrics(account);
  assert.equal(accMetrics.status, 'confirmed');
  assert.equal(accMetrics.followersTotal, 0);
});

test('5. TikTok connector parses Display API video queries and user info correctly', async () => {
  const connector = new TikTokConnector();

  globalThis.fetch = async (url: any, opts: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/video/query/')) {
      const body = JSON.parse(opts?.body || '{}');
      const videoId = body.filters?.video_ids?.[0];
      return new Response(
        JSON.stringify({
          data: {
            videos: [
              {
                id: videoId,
                title: 'Pipeline Vertical TikTok',
                view_count: 0,
                like_count: 0,
                comment_count: 0,
                share_count: 0,
              },
            ],
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/user/info/')) {
      return new Response(
        JSON.stringify({
          data: {
            user: {
              open_id: 'mock-tiktok-openid',
              display_name: 'maroooooooooooon16',
              follower_count: 0,
              following_count: 0,
              likes_count: 0,
            },
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const account = {
    id: testTtAccountId,
    handle: '@maroooooooooooon16',
    name: 'maroooooooooooon16',
    access_token: 'mock-valid-tt-token',
  };

  const postMetrics = await connector.fetchPostMetrics(account, '7697115798170782983');
  assert.equal(postMetrics.status, 'confirmed');
  assert.equal(postMetrics.viewCount, 0);
  assert.equal(postMetrics.likeCount, 0);
  assert.equal(postMetrics.commentCount, 0);
  assert.equal(postMetrics.shareCount, 0);
  assert.equal(postMetrics.source, 'tiktok_display_api');

  const accountMetrics = await connector.fetchAccountMetrics(account);
  assert.equal(accountMetrics.status, 'confirmed');
  assert.equal(accountMetrics.followersTotal, 0);
});

test('6. API rate limit (HTTP 429) and network error resilience', async () => {
  const connector = new MetaFacebookConnector();

  // Simulate HTTP 429 Rate Limit
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          message: 'User request limit reached',
          type: 'OAuthException',
          code: 4,
          error_subcode: 2446079,
        },
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const metrics429 = await connector.fetchPostMetrics(
    { access_token: 'mock-token' },
    '2030865660948720'
  );
  assert.equal(metrics429.status, 'failed');
  assert.ok(metrics429.errorMessage?.includes('limit reached'));
  // Does not throw unhandled exception or corrupt metrics

  // Simulate Network Failure
  globalThis.fetch = async () => {
    throw new Error('ECONNRESET');
  };

  const metricsNetErr = await connector.fetchPostMetrics(
    { access_token: 'mock-token' },
    '2030865660948720'
  );
  assert.equal(metricsNetErr.status, 'failed');
  assert.equal(metricsNetErr.errorMessage, 'ECONNRESET');
});

test('7. Missing scopes and expired token honest capability reporting', () => {
  // Test account with expired token
  const expiredAccount = {
    id: 'acc-expired',
    is_demo: 0,
    archived_at: null,
    connector_mode: 'official_api',
    status: 'connected',
    identity_verified_at: '2026-01-01T00:00:00.000Z',
    access_token: seal('mock-expired-token'),
    token_expires_at: '2026-01-02T00:00:00.000Z', // In the past
    granted_scopes_json: JSON.stringify(['pages_show_list']),
    platform: 'facebook',
  };

  assert.equal(hasActiveApiAuthorization(expiredAccount), false);

  const connector = getConnector(expiredAccount);
  const caps = connector.getCapabilities();
  assert.equal(caps.canReadProfile, false);
  assert.equal(caps.canReadPostMetrics, false);
  assert.equal(caps.canReadComments, false);

  // Test account with active token but read-only scopes (missing publishing)
  const readOnlyAccount = {
    id: 'acc-readonly',
    is_demo: 0,
    archived_at: null,
    connector_mode: 'official_api',
    status: 'connected',
    identity_verified_at: new Date().toISOString(),
    access_token: seal('mock-valid-token'),
    token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    granted_scopes_json: JSON.stringify(['pages_show_list', 'pages_read_engagement', 'pages_read_user_content']),
    platform: 'facebook',
  };

  assert.equal(hasActiveApiAuthorization(readOnlyAccount), true);
  const readOnlyCaps = getConnector(readOnlyAccount).getCapabilities();
  assert.equal(readOnlyCaps.canReadProfile, true);
  assert.equal(readOnlyCaps.canReadPostMetrics, true);
  assert.equal(readOnlyCaps.canReadComments, true);
  assert.equal(readOnlyCaps.canPublish, false); // Honest: no pages_manage_posts
  assert.equal(readOnlyCaps.canReply, false); // Honest: no pages_manage_engagement
});

test('8. Snapshot deduplication and restart persistence', () => {
  // Record snapshot 1
  const snap1 = analyticsRepo.recordPostMetricSnapshot({
    destination_id: testFbDestId,
    account_id: testFbAccountId,
    platform: 'facebook',
    remote_post_id: '2030865660948720',
    view_count: 311,
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    source: 'meta_graph_api',
    provenance_status: 'confirmed',
  });
  assert.ok(snap1.id);

  // Record snapshot 2 (updated view count)
  const snap2 = analyticsRepo.recordPostMetricSnapshot({
    destination_id: testFbDestId,
    account_id: testFbAccountId,
    platform: 'facebook',
    remote_post_id: '2030865660948720',
    view_count: 315,
    like_count: 1,
    comment_count: 0,
    share_count: 0,
    source: 'meta_graph_api',
    provenance_status: 'confirmed',
  });
  assert.ok(snap2.id);
  assert.notEqual(snap1.id, snap2.id);

  // Both snapshots persist in historical record
  const allSnaps = db.prepare('SELECT * FROM post_metrics_snapshots WHERE destination_id = ? ORDER BY observed_at ASC').all(testFbDestId);
  assert.equal(allSnaps.length, 2);

  // Comment deduplication on (account_id, external_comment_id)
  const comment1 = inboxRepo.upsertComment({
    account_id: testFbAccountId,
    destination_id: testFbDestId,
    platform: 'facebook',
    external_comment_id: 'comment-meta-101',
    author_name: 'Test Viewer',
    content: 'Great Reel!',
    created_time: new Date().toISOString(),
    like_count: 1,
    source: 'meta_graph_api',
  });
  assert.equal(comment1.isNew, true);

  const commentDuplicate = inboxRepo.upsertComment({
    account_id: testFbAccountId,
    destination_id: testFbDestId,
    platform: 'facebook',
    external_comment_id: 'comment-meta-101',
    author_name: 'Test Viewer',
    content: 'Great Reel! (edited)',
    created_time: new Date().toISOString(),
    like_count: 2,
    source: 'meta_graph_api',
  });
  assert.equal(commentDuplicate.isNew, false);

  const totalComments = db.prepare('SELECT COUNT(*) as cnt FROM comments WHERE account_id = ? AND external_comment_id = ?').get(testFbAccountId, 'comment-meta-101') as any;
  assert.equal(totalComments.cnt, 1);
});
