import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { seedInitialData } from '../server/src/db/seed.js';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { analyticsRepo } from '../server/src/repositories/analytics.repo.js';
import { activityRepo } from '../server/src/repositories/activity.repo.js';
import { TikTokConnector } from '../server/src/connectors/tiktok.js';
import { getConnector, hasActiveApiAuthorization } from '../server/src/connectors/registry.js';
import { seal, unseal } from '../server/src/services/token-protection.js';
import {
  connectionSetup,
  startAuthorization,
  completeAuthorization,
  selectAuthorizedIdentity,
  refreshConnection,
} from '../server/src/services/connections.service.js';
import { syncService } from '../server/src/services/sync.service.js';

let testTtAccountId: string;
let testFbAccountId: string;
let testTtDest1Id: string;
let testTtDest2Id: string;
let testFbDestId: string;
let dummyVideoPath: string;
const originalFetch = globalThis.fetch;

before(() => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.META_APP_ID = 'test-meta-app-id';
  process.env.META_APP_SECRET = 'test-meta-app-secret';
  process.env.META_REDIRECT_URI = 'http://localhost:3001/api/connections/callback/facebook';
  process.env.META_GRAPH_VERSION = 'v26.0';
  process.env.TIKTOK_CLIENT_KEY = 'test-tiktok-client-key';
  process.env.TIKTOK_CLIENT_SECRET = 'test-tiktok-client-secret';
  process.env.TIKTOK_REDIRECT_URI = 'https://localhost:3001/api/connections/callback/tiktok';

  initializeDatabase();
  seedInitialData();

  // Create temporary video file for upload tests
  dummyVideoPath = path.join(process.env.SCC_DATA_DIR, 'test-dummy.mp4');
  fs.writeFileSync(dummyVideoPath, Buffer.from('FAKE_MP4_VIDEO_CONTENT_FOR_TIKTOK_TESTING'));

  // 1. TikTok Personal Account (@maroooooooooooon16)
  testTtAccountId = 'acc-e0d55bef-1976-4213-92d8-4f949ee3e5f7';
  db.prepare(`
    INSERT OR REPLACE INTO accounts (
      id, platform, account_type, name, handle, status, connector_mode, external_id, connection_status
    ) VALUES (?, 'tiktok', 'personal', 'maroooooooooooon16', '@maroooooooooooon16', 'disconnected', 'official_api', NULL, 'limited')
  `).run(testTtAccountId);

  // 2. Facebook Page account for independent failure testing
  testFbAccountId = `acc-fb-${randomUUID()}`;
  db.prepare(`
    INSERT INTO accounts (
      id, platform, account_type, name, handle, status, connector_mode, external_id, identity_verified_at, access_token, token_expires_at, granted_scopes_json
    ) VALUES (?, 'facebook', 'page', 'Facebook Verified Page', '@verified_page', 'connected', 'official_api', '409347032254077', datetime('now'), ?, datetime('now', '+1 day'), ?)
  `).run(testFbAccountId, seal('mock-fb-token'), JSON.stringify(['pages_show_list', 'pages_read_engagement']));

  const videoId = `vid-tt-${randomUUID()}`;
  db.prepare(`
    INSERT INTO videos (id, title, source_type, original_filename, file_path, aspect_ratio, duration, file_size)
    VALUES (?, 'Phuket VIP Shortcut', 'manual_upload', 'phuket.mp4', ?, '9:16', 10, 1024)
  `).run(videoId, dummyVideoPath);

  const postId = `post-tt-${randomUUID()}`;
  db.prepare(`
    INSERT INTO publishing_posts (id, video_id, title, status)
    VALUES (?, ?, 'Tesla Phuket Test', 'completed')
  `).run(postId, videoId);

  // Existing published video 1: 7697115798170782983
  testTtDest1Id = 'dest-mvafsplz-qm9u';
  db.prepare(`
    INSERT OR REPLACE INTO publishing_destinations (
      id, post_id, account_id, caption, status, remote_post_id, remote_post_url, confirmation_source, verification_status
    ) VALUES (?, ?, ?, 'Tesla VIP Parking #1', 'published', '7697115798170782983', 'https://www.tiktok.com/@maroooooooooooon16/video/7697115798170782983', 'manual', 'confirmed')
  `).run(testTtDest1Id, postId, testTtAccountId);

  // Existing published video 2: 7697147128375725320
  testTtDest2Id = 'dest-mvakp9bi-jb87';
  db.prepare(`
    INSERT OR REPLACE INTO publishing_destinations (
      id, post_id, account_id, caption, status, remote_post_id, remote_post_url, confirmation_source, verification_status
    ) VALUES (?, ?, ?, 'Tesla VIP Parking #2', 'published', '7697147128375725320', 'https://www.tiktok.com/@maroooooooooooon16/video/7697147128375725320', 'manual', 'confirmed')
  `).run(testTtDest2Id, postId, testTtAccountId);

  testFbDestId = `dest-fb-${randomUUID()}`;
  db.prepare(`
    INSERT INTO publishing_destinations (
      id, post_id, account_id, caption, status, remote_post_id, remote_post_url, confirmation_source, verification_status
    ) VALUES (?, ?, ?, 'FB Reel Post', 'published', '2657809668013982', 'https://www.facebook.com/reel/2657809668013982', 'api', 'confirmed')
  `).run(testFbDestId, postId, testFbAccountId);
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('1. TikTok OAuth setup validates HTTPS requirement and developer configuration', () => {
  const setup = connectionSetup('tiktok');
  assert.equal(setup.ready, true);
  assert.equal(setup.callbackAllowed, true);
  assert.equal(setup.missing.length, 0);

  // Plain HTTP must be rejected for TikTok
  const prevUri = process.env.TIKTOK_REDIRECT_URI;
  try {
    process.env.TIKTOK_REDIRECT_URI = 'http://localhost:3001/api/connections/callback/tiktok';
    const badSetup = connectionSetup('tiktok');
    assert.equal(badSetup.callbackAllowed, false);
    assert.equal(badSetup.ready, false);
  } finally {
    process.env.TIKTOK_REDIRECT_URI = prevUri;
  }
});

test('2. TikTok OAuth session start enforces requested scopes and CSRF validation', () => {
  const start = startAuthorization(testTtAccountId, 'browser-tt-secret', { stats: true });
  assert.ok(start.authorizationUrl);
  assert.ok(start.browserSecret);
  assert.equal(start.secure, true);

  const url = new URL(start.authorizationUrl);
  assert.equal(url.origin, 'https://www.tiktok.com');
  assert.equal(url.pathname, '/v2/auth/authorize/');
  assert.equal(url.searchParams.get('client_key'), 'test-tiktok-client-key');
  assert.equal(url.searchParams.get('response_type'), 'code');

  const scopes = (url.searchParams.get('scope') || '').split(',');
  assert.ok(scopes.includes('user.info.basic'), 'Must include user.info.basic');
  assert.ok(scopes.includes('user.info.profile'), 'Must include user.info.profile');
  assert.ok(scopes.includes('video.list'), 'Must include video.list');
  assert.ok(scopes.includes('user.info.stats'), 'Must include user.info.stats when requested');
});

test('3. TikTok OAuth code exchange, identity matching, and open_id binding', async () => {
  const start = startAuthorization(testTtAccountId, 'browser-tt-exchange', { stats: false });
  const url = new URL(start.authorizationUrl);
  const state = url.searchParams.get('state');

  // Mock TikTok code exchange and user info endpoints
  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/oauth/token/')) {
      return new Response(
        JSON.stringify({
          access_token: 'act.test-tiktok-access-token-12345',
          expires_in: 86400,
          open_id: 'open-id-maroon-16-canonical',
          refresh_expires_in: 31536000,
          refresh_token: 'rft.test-tiktok-refresh-token-67890',
          scope: 'user.info.basic,user.info.profile,video.list',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/user/info/')) {
      return new Response(
        JSON.stringify({
          data: {
            user: {
              open_id: 'open-id-maroon-16-canonical',
              display_name: 'maroooooooooooon16',
              username: 'maroooooooooooon16',
              avatar_url: 'https://example.com/avatar.jpg',
            },
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const accountId = await completeAuthorization('tiktok', { code: 'valid-test-code', state }, start.browserSecret);
  assert.equal(accountId, testTtAccountId);

  // Link selected candidate
  selectAuthorizedIdentity(testTtAccountId, start.browserSecret, {
    externalId: 'open-id-maroon-16-canonical',
    confirmIdentity: true,
  });

  const updatedAccount = accountsRepo.getAccountById(testTtAccountId) as any;
  assert.equal(updatedAccount.external_id, 'open-id-maroon-16-canonical');
  assert.equal(updatedAccount.status, 'connected');
  assert.equal(updatedAccount.account_type, 'personal', 'Account type must remain personal');
  assert.ok(updatedAccount.identity_verified_at);
  assert.equal(unseal(updatedAccount.access_token), 'act.test-tiktok-access-token-12345');
  assert.equal(unseal(updatedAccount.refresh_token), 'rft.test-tiktok-refresh-token-67890');
});

test('4. Token refresh and rotation maintains account continuity', async () => {
  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/oauth/token/')) {
      const body = String(opts?.body || '');
      assert.ok(body.includes('grant_type=refresh_token'));
      assert.ok(body.includes('rft.test-tiktok-refresh-token-67890'));
      return new Response(
        JSON.stringify({
          access_token: 'act.rotated-new-token-99999',
          expires_in: 86400,
          open_id: 'open-id-maroon-16-canonical',
          refresh_expires_in: 31536000,
          refresh_token: 'rft.rotated-new-refresh-token-88888',
          scope: 'user.info.basic,user.info.profile,video.list',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  await refreshConnection(testTtAccountId);

  const refreshedAccount = accountsRepo.getAccountById(testTtAccountId) as any;
  assert.equal(unseal(refreshedAccount.access_token), 'act.rotated-new-token-99999');
  assert.equal(unseal(refreshedAccount.refresh_token), 'rft.rotated-new-refresh-token-88888');
  assert.equal(refreshedAccount.external_id, 'open-id-maroon-16-canonical');
});

test('5. Real metric synchronization via Display API retrieves video counters and distinguishes confirmed 0 from missing data', async () => {
  const connector = new TikTokConnector();

  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/video/query/')) {
      const body = JSON.parse(opts?.body || '{}');
      const videoId = body.filters?.video_ids?.[0];
      // Video 1 has zero counters; Video 2 has positive views
      if (videoId === '7697115798170782983') {
        return new Response(
          JSON.stringify({
            data: {
              videos: [
                {
                  id: videoId,
                  title: 'Phuket Shortcut Part 1',
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
      if (videoId === '7697147128375725320') {
        return new Response(
          JSON.stringify({
            data: {
              videos: [
                {
                  id: videoId,
                  title: 'Phuket Shortcut Part 2',
                  view_count: 42,
                  like_count: 5,
                  comment_count: 1,
                  share_count: 2,
                },
              ],
            },
            error: { code: 'ok', message: '' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    if (urlStr.includes('/user/info/')) {
      return new Response(
        JSON.stringify({
          data: {
            user: {
              open_id: 'open-id-maroon-16-canonical',
              display_name: 'maroooooooooooon16',
              follower_count: 12,
              following_count: 34,
              likes_count: 56,
            },
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const account = accountsRepo.getAccountById(testTtAccountId) as any;
  const authorizedAccount = { ...account, access_token: unseal(account.access_token) };

  // 1. Video 1: Confirmed zero counts
  const m1 = await connector.fetchPostMetrics(authorizedAccount, '7697115798170782983');
  assert.equal(m1.status, 'confirmed');
  assert.equal(m1.viewCount, 0, '0 view count must be preserved as number 0, not converted to null');
  assert.equal(m1.likeCount, 0);
  assert.equal(m1.source, 'tiktok_display_api');

  // 2. Video 2: Positive counts
  const m2 = await connector.fetchPostMetrics(authorizedAccount, '7697147128375725320');
  assert.equal(m2.status, 'confirmed');
  assert.equal(m2.viewCount, 42);
  assert.equal(m2.likeCount, 5);
  assert.equal(m2.source, 'tiktok_display_api');

  // 3. Full syncAccount run
  const syncRes = await syncService.syncAccount(testTtAccountId);
  assert.equal(syncRes.success, true);
  assert.equal(syncRes.status, 'success');
  assert.equal(syncRes.metricsSynced, 2);

  // Verify snapshots persisted with strict provenance
  const snaps = db.prepare(`
    SELECT * FROM post_metrics_snapshots WHERE account_id = ? ORDER BY observed_at DESC
  `).all(testTtAccountId) as any[];

  assert.ok(snaps.length >= 2);
  const snap1 = snaps.find((s) => s.remote_post_id === '7697115798170782983');
  assert.equal(snap1.view_count, 0);
  assert.equal(snap1.source, 'tiktok_display_api');
  assert.equal(snap1.provenance_status, 'confirmed');

  const snap2 = snaps.find((s) => s.remote_post_id === '7697147128375725320');
  assert.equal(snap2.view_count, 42);
  assert.equal(snap2.source, 'tiktok_display_api');
  assert.equal(snap2.provenance_status, 'confirmed');
});

test('6. POST /v2/video/list/ retrieval retrieves paginated user media', async () => {
  const connector = new TikTokConnector();

  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/video/list/')) {
      return new Response(
        JSON.stringify({
          data: {
            videos: [
              { id: '7697115798170782983', title: 'Phuket Shortcut Part 1', view_count: 0, like_count: 0 },
              { id: '7697147128375725320', title: 'Phuket Shortcut Part 2', view_count: 42, like_count: 5 },
            ],
            cursor: 1729420000000,
            has_more: false,
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const listRes = await connector.fetchVideoList({ access_token: 'mock-token' }, { maxCount: 20 });
  assert.equal(listRes.videos.length, 2);
  assert.equal(listRes.videos[0].id, '7697115798170782983');
  assert.equal(listRes.videos[1].id, '7697147128375725320');
  assert.equal(listRes.hasMore, false);
});

test('7. Account statistics fallback gracefully handles ungranted user.info.stats scope', async () => {
  const connector = new TikTokConnector();

  globalThis.fetch = async (inputUrl: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('follower_count')) {
      // First call with stats fields returns scope error
      return new Response(
        JSON.stringify({
          error: { code: 'scope_not_authorized', message: 'Scope user.info.stats is not authorized' },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('fields=open_id,display_name')) {
      // Fallback call returns basic user info
      return new Response(
        JSON.stringify({
          data: {
            user: {
              open_id: 'open-id-maroon-16-canonical',
              display_name: 'maroooooooooooon16',
            },
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const res = await connector.fetchAccountMetrics({ access_token: 'mock-token' });
  assert.equal(res.status, 'confirmed');
  assert.equal(res.followersTotal, null, 'Followers total must be null when stats scope is not granted');
  assert.equal(res.likesTotal, null);
  assert.equal(res.source, 'tiktok_display_api');
});

test('8. Rate limit (HTTP 429) and network resilience does not corrupt historical snapshots', async () => {
  const connector = new TikTokConnector();

  // Snapshot count before failure
  const countBefore = (db.prepare('SELECT COUNT(*) as c FROM post_metrics_snapshots').get() as any).c;

  // 1. Simulate HTTP 429
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: { code: 'rate_limit_exceeded', message: 'Rate limit exceeded: please slow down' },
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const res429 = await connector.fetchPostMetrics({ access_token: 'mock-token' }, '7697115798170782983');
  assert.equal(res429.status, 'failed');
  assert.ok(res429.errorMessage?.toLowerCase().includes('rate limit'));

  // 2. Simulate network exception
  globalThis.fetch = async () => {
    throw new Error('ETIMEDOUT');
  };

  const resTimeout = await connector.fetchPostMetrics({ access_token: 'mock-token' }, '7697115798170782983');
  assert.equal(resTimeout.status, 'failed');
  assert.equal(resTimeout.errorMessage, 'ETIMEDOUT');

  // Verify historical snapshots were not deleted or overwritten
  const countAfter = (db.prepare('SELECT COUNT(*) as c FROM post_metrics_snapshots').get() as any).c;
  assert.equal(countAfter, countBefore, 'Failed sync attempts must never delete historical snapshots');
});

test('9. Independent provider failure isolation: TikTok failure does not affect Facebook synchronization', async () => {
  globalThis.fetch = async (inputUrl: any) => {
    const urlStr = String(inputUrl);
    // TikTok fails with 500 server error
    if (urlStr.includes('open.tiktokapis.com')) {
      return new Response(
        JSON.stringify({ error: { code: 'server_error', message: 'TikTok internal error' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Facebook succeeds
    if (urlStr.includes('graph.facebook.com')) {
      if (urlStr.includes('/video_insights')) {
        return new Response(
          JSON.stringify({
            data: [{ name: 'blue_reels_play_count', values: [{ value: 999 }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          id: '2657809668013982',
          likes: { summary: { total_count: 10 } },
          comments: { summary: { total_count: 2 } },
          shares: { count: 3 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const allRes = await syncService.syncAllAccounts();
  // Facebook must have succeeded even though TikTok failed
  assert.equal(allRes.results[testFbAccountId]?.success, true);
  assert.ok(allRes.results[testFbAccountId]?.metricsSynced > 0);
  assert.equal(allRes.results[testTtAccountId]?.success, false);
});

test('10. TikTok Content Posting API policy and privacy checks enforce compliance', async () => {
  const connector = new TikTokConnector();

  // 1. Account without video.publish scope is rejected with honest policy explanation
  const accountWithoutPublish = {
    id: testTtAccountId,
    handle: '@maroooooooooooon16',
    access_token: 'mock-token',
    granted_scopes_json: JSON.stringify(['user.info.basic', 'video.list']),
  };

  await assert.rejects(
    async () => {
      await connector.publishVideo(accountWithoutPublish, {
        destinationId: 'dest-1',
        postId: 'post-1',
        accountId: testTtAccountId,
        videoPath: dummyVideoPath,
        title: 'Title',
        caption: 'Caption',
        hashtags: '#test',
        applyBranding: false,
      });
    },
    /TikTok Direct Post requires official video.publish scope approval/
  );

  // 2. Creator info query fetches valid privacy options
  globalThis.fetch = async (inputUrl: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/creator_info/query/')) {
      return new Response(
        JSON.stringify({
          data: {
            privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
            max_video_post_duration_sec: 600,
            comment_disabled: false,
            duet_disabled: false,
            stitch_disabled: false,
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const creatorInfo = await connector.queryCreatorInfo({ access_token: 'mock-token' });
  assert.equal(creatorInfo.success, true);
  assert.ok(creatorInfo.privacyLevelOptions?.includes('PUBLIC_TO_EVERYONE'));
  assert.ok(creatorInfo.privacyLevelOptions?.includes('SELF_ONLY'));

  // 3. Status polling handles async PUBLISH_COMPLETE and FAILED
  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const body = JSON.parse(opts?.body || '{}');
    if (body.publish_id === 'pub-success') {
      return new Response(
        JSON.stringify({
          data: { status: 'PUBLISH_COMPLETE', publicly_available_post_id: ['7699999999999999999'] },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (body.publish_id === 'pub-failed') {
      return new Response(
        JSON.stringify({
          data: { status: 'FAILED', fail_reason: 'Video aspect ratio unsupported' },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const successStatus = await connector.pollPublishStatus({ access_token: 'mock-token' }, 'pub-success', 2);
  assert.equal(successStatus.success, true);
  assert.equal(successStatus.remotePostId, '7699999999999999999');

  const failedStatus = await connector.pollPublishStatus({ access_token: 'mock-token' }, 'pub-failed', 2);
  assert.equal(failedStatus.success, false);
  assert.ok(failedStatus.errorMessage?.includes('aspect ratio unsupported'));
});
