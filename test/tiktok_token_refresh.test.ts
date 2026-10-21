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
import { seal, unseal } from '../server/src/services/token-protection.js';
import {
  refreshConnection,
  ensureFreshToken,
} from '../server/src/services/connections.service.js';
import { syncService } from '../server/src/services/sync.service.js';
import { OAuthFailure, authorizationFailure } from '../server/src/services/oauth-diagnostics.js';
import express from 'express';
import { accountsRouter } from '../server/src/routes/accounts.routes.js';
import { connectionsRouter } from '../server/src/routes/connections.routes.js';
import { hasActiveApiAuthorization } from '../server/src/connectors/registry.js';

let testAccountId: string;
let testDestId: string;
const originalFetch = globalThis.fetch;

before(() => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.TIKTOK_CLIENT_KEY = 'test-tt-client-key';
  process.env.TIKTOK_CLIENT_SECRET = 'test-tt-client-secret';
  process.env.TIKTOK_REDIRECT_URI = 'https://localhost:3001/api/connections/callback/tiktok';

  initializeDatabase();
  seedInitialData();

  testAccountId = `acc-tt-${randomUUID()}`;
  const now = Date.now();
  // Expired 1 hour ago
  const expiredAt = new Date(now - 3600 * 1000).toISOString();
  // Refresh token valid for 1 year
  const refreshExpiresAt = new Date(now + 365 * 24 * 3600 * 1000).toISOString();

  // Create real TikTok personal account with expired access token and valid refresh token
  db.prepare(`
    INSERT INTO accounts (
      id, name, handle, platform, account_type, status, connector_mode,
      connection_status, external_id, access_token, refresh_token,
      token_expires_at, refresh_expires_at, identity_verified_at,
      granted_scopes_json, health_status, is_demo, connection_revision
    ) VALUES (?, ?, ?, 'tiktok', 'personal', 'connected', 'official_api',
      'limited', 'open-id-maroon-refresh-test', ?, ?, ?, ?, datetime('now'),
      '["user.info.basic","user.info.profile","video.list"]', 'Authorized identity', 0, 1)
  `).run(
    testAccountId,
    'Maroon 16 Test',
    '@maroooooooooooon16',
    seal('act.initial-expired-token-111'),
    seal('rft.initial-valid-refresh-token-222'),
    expiredAt,
    refreshExpiresAt
  );

  // Create a published destination with an initial confirmed metrics snapshot
  const postId = `post-tt-${randomUUID()}`;
  testDestId = `dest-tt-${randomUUID()}`;
  const videoId = `vid-tt-${randomUUID()}`;

  db.prepare(`INSERT INTO videos (id, title, source_type, original_filename, file_path, duration) VALUES (?, 'Test Video', 'manual_upload', 'fake.mp4', 'fake.mp4', 30)`).run(videoId);
  db.prepare(`INSERT INTO publishing_posts (id, video_id, title, status, created_at, updated_at) VALUES (?, ?, 'Post Title', 'completed', datetime('now'), datetime('now'))`).run(postId, videoId);
  db.prepare(`
    INSERT INTO publishing_destinations (
      id, post_id, account_id, status, caption, remote_post_id,
      remote_post_url, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, 'published', 'Caption #test', '7697115798170782983',
      'https://www.tiktok.com/@maroooooooooooon16/video/7697115798170782983', 'synced', datetime('now'), datetime('now'))
  `).run(testDestId, postId, testAccountId);

  // Baseline initial confirmed snapshot with 25 views
  analyticsRepo.recordPostMetricSnapshot({
    destination_id: testDestId,
    account_id: testAccountId,
    platform: 'tiktok',
    remote_post_id: '7697115798170782983',
    observed_at: new Date(now - 1800 * 1000).toISOString(),
    view_count: 25,
    like_count: 3,
    comment_count: 1,
    share_count: 0,
    source: 'tiktok_display_api',
    provenance_status: 'confirmed',
    status_detail: 'Initial baseline snapshot',
  });
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('1. Proactive token refresh when token_expires_at is expired or expiring within 30m', async () => {
  let tokenEndpointCalls = 0;
  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/oauth/token/')) {
      tokenEndpointCalls++;
      const body = String(opts?.body || '');
      assert.ok(body.includes('grant_type=refresh_token'), 'Body must specify grant_type=refresh_token');
      assert.ok(body.includes('rft.initial-valid-refresh-token-222'), 'Body must provide unsealed refresh token');
      assert.equal(opts?.headers?.['Content-Type'], 'application/x-www-form-urlencoded', 'Must send explicit Content-Type');
      return new Response(
        JSON.stringify({
          access_token: 'act.refreshed-token-33333',
          expires_in: 86400,
          open_id: 'open-id-maroon-refresh-test',
          refresh_expires_in: 31536000,
          refresh_token: 'rft.rotated-refresh-token-44444',
          scope: 'user.info.basic,user.info.profile,video.list',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const accountBefore = accountsRepo.getAccountById(testAccountId) as any;
  assert.ok(Date.parse(accountBefore.token_expires_at) < Date.now(), 'Token must be initially expired');

  const refreshed = await ensureFreshToken(accountBefore);

  assert.equal(tokenEndpointCalls, 1, 'Token endpoint must be called exactly once');
  assert.equal(unseal(refreshed.access_token), 'act.refreshed-token-33333');
  assert.equal(unseal(refreshed.refresh_token), 'rft.rotated-refresh-token-44444');
  assert.notEqual(refreshed.access_token, 'act.refreshed-token-33333', 'Access token is encrypted at rest');
  assert.notEqual(refreshed.refresh_token, 'rft.rotated-refresh-token-44444', 'Rotated refresh token is encrypted at rest');
  assert.equal(refreshed.connection_revision, accountBefore.connection_revision + 1);
  assert.ok(Date.parse(refreshed.token_expires_at) > Date.now() + 80000 * 1000, 'Expiry must be ~24h ahead');
  assert.equal(refreshed.status, 'connected');

  // Calling ensureFreshToken again immediately should NOT make another call because it is fresh
  const again = await ensureFreshToken(refreshed);
  assert.equal(tokenEndpointCalls, 1, 'Subsequent call within fresh window must not trigger network call');
  assert.equal(unseal(again.access_token), 'act.refreshed-token-33333');
});

test('2. Refresh token rotation updates refresh_token and refresh_expires_at in SQLite', async () => {
  let tokenEndpointCalls = 0;
  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/oauth/token/')) {
      tokenEndpointCalls++;
      const body = String(opts?.body || '');
      // Verify that it sent the ROTATED token from test 1!
      assert.ok(body.includes('rft.rotated-refresh-token-44444'), 'Must supply the newly rotated refresh token');
      return new Response(
        JSON.stringify({
          access_token: 'act.rotated-second-55555',
          expires_in: 86400,
          open_id: 'open-id-maroon-refresh-test',
          refresh_expires_in: 31536000,
          refresh_token: 'rft.rotated-third-66666',
          scope: 'user.info.basic,video.list',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  // Force token_expires_at into past to simulate expiry
  db.prepare(`UPDATE accounts SET token_expires_at = datetime('now', '-10 minutes') WHERE id = ?`).run(testAccountId);

  await refreshConnection(testAccountId);

  const updated = accountsRepo.getAccountById(testAccountId) as any;
  assert.equal(tokenEndpointCalls, 1);
  assert.equal(unseal(updated.access_token), 'act.rotated-second-55555');
  assert.equal(unseal(updated.refresh_token), 'rft.rotated-third-66666');
  assert.ok(Date.parse(updated.refresh_expires_at) > Date.now() + 360 * 24 * 3600 * 1000);
});

test('3. Concurrent refresh requests are deduplicated (single flight mutex)', async () => {
  let networkCalls = 0;
  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/oauth/token/')) {
      networkCalls++;
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 40));
      return new Response(
        JSON.stringify({
          access_token: 'act.concurrent-success-777',
          expires_in: 86400,
          open_id: 'open-id-maroon-refresh-test',
          refresh_expires_in: 31536000,
          refresh_token: 'rft.concurrent-rft-888',
          scope: 'user.info.basic,video.list',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  // Set token to expired
  db.prepare(`UPDATE accounts SET token_expires_at = datetime('now', '-5 minutes') WHERE id = ?`).run(testAccountId);

  // Launch 3 simultaneous refreshes
  const results = await Promise.all([
    refreshConnection(testAccountId),
    refreshConnection(testAccountId),
    refreshConnection(testAccountId),
  ]);

  assert.equal(networkCalls, 1, 'Only one HTTP request must be sent across concurrent callers');
  assert.equal(results.length, 3);
  for (const res of results) {
    assert.equal(unseal(res.access_token), 'act.concurrent-success-777');
    assert.equal(unseal(res.refresh_token), 'rft.concurrent-rft-888');
  }
});

test('4. Permanent auth failure (invalid_grant / revoked) sets connection_status to expired without wiping metrics', async () => {
  globalThis.fetch = async (inputUrl: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/oauth/token/')) {
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'The refresh token was revoked by user or expired',
          log_id: '20261021_revoked_log_id',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  // Expire token
  db.prepare(`UPDATE accounts SET token_expires_at = datetime('now', '-5 minutes') WHERE id = ?`).run(testAccountId);

  let failed = false;
  try {
    await refreshConnection(testAccountId);
  } catch (err: any) {
    failed = true;
    assert.ok(err.message.includes('expired or revoked'), 'Error message must clearly explain revoked status');
  }
  assert.ok(failed, 'refreshConnection must throw on revoked grant');

  const account = accountsRepo.getAccountById(testAccountId) as any;
  assert.equal(account.connection_status, 'expired', 'Connection status must be set to expired');

  // Verify historical post metrics snapshot is completely intact and never wiped
  const snapshots = db.prepare(`SELECT * FROM post_metrics_snapshots WHERE destination_id = ?`).all(testDestId) as any[];
  assert.ok(snapshots.length >= 1, 'Snapshots must survive auth failure');
  const latest = snapshots[snapshots.length - 1];
  assert.equal(latest.view_count, 25, 'Confirmed view count (25) must not be replaced by 0');
});

test('5. Temporary network outage preserves credentials and does not mark connection as expired', async () => {
  // Restore connection status to connected with valid credentials
  db.prepare(`
    UPDATE accounts SET
      connection_status = 'limited',
      status = 'connected',
      token_expires_at = datetime('now', '-5 minutes')
    WHERE id = ?
  `).run(testAccountId);

  globalThis.fetch = async () => {
    // Simulate connection reset / timeout / offline
    throw new TypeError('fetch failed: network is unreachable');
  };

  let caught = false;
  try {
    await refreshConnection(testAccountId);
  } catch (err: any) {
    caught = true;
    assert.ok(err.message.includes('network') || err.message.includes('fetch failed'));
  }
  assert.ok(caught, 'Must throw network failure');

  const account = accountsRepo.getAccountById(testAccountId) as any;
  // Crucial requirement: temporary network outage must NOT mark connection as expired
  assert.notEqual(account.connection_status, 'expired', 'Network error must not mark connection as expired');
  assert.equal(account.status, 'connected', 'Account remains connected');
  assert.ok(account.refresh_token, 'Refresh token must remain safely stored');
});

test('6. Automatic background sync proactive refresh and genuine metric capture', async () => {
  let refreshCalls = 0;
  let videoQueryCalls = 0;

  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/oauth/token/')) {
      refreshCalls++;
      return new Response(
        JSON.stringify({
          access_token: 'act.valid-fresh-for-sync-999',
          expires_in: 86400,
          open_id: 'open-id-maroon-refresh-test',
          refresh_expires_in: 31536000,
          refresh_token: 'rft.valid-fresh-for-sync-999',
          scope: 'user.info.basic,user.info.profile,video.list',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/video/query/')) {
      videoQueryCalls++;
      // Verify authorization bearer header sent the freshly renewed token
      assert.equal(opts?.headers?.Authorization, 'Bearer act.valid-fresh-for-sync-999');
      return new Response(
        JSON.stringify({
          data: {
            videos: [
              {
                id: '7697115798170782983',
                title: 'Phuket Shortcut Part 1',
                view_count: 50,
                like_count: 8,
                comment_count: 2,
                share_count: 1,
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
              open_id: 'open-id-maroon-refresh-test',
              display_name: 'Maroon 16',
              follower_count: 120,
              following_count: 45,
              likes_count: 310,
            },
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  // Set token to expired
  db.prepare(`UPDATE accounts SET token_expires_at = datetime('now', '-10 minutes'), connection_status = 'limited' WHERE id = ?`).run(testAccountId);

  const syncResult = await syncService.syncAccount(testAccountId);

  assert.equal(refreshCalls, 1, 'Sync must proactively refresh the expired token before querying Display API');
  assert.equal(videoQueryCalls, 1, 'Display API video query must be called');
  assert.equal(syncResult.success, true);
  assert.equal(syncResult.metricsSynced, 1);

  // Verify new snapshot recorded with genuine 50 views
  const snapshots = db.prepare(`SELECT * FROM post_metrics_snapshots WHERE destination_id = ? ORDER BY observed_at DESC`).all(testDestId) as any[];
  assert.ok(snapshots.length >= 2);
  const latest = snapshots[0];
  assert.equal(latest.view_count, 50);
  assert.equal(latest.like_count, 8);
  assert.equal(latest.source, 'tiktok_display_api');
  assert.equal(latest.provenance_status, 'confirmed');

  // Verify sync state
  const syncStates = analyticsRepo.getSyncStates();
  const accountSyncState = syncStates.find((s) => s.account_id === testAccountId && s.target === 'all');
  assert.ok(accountSyncState);
  assert.equal(accountSyncState.status, 'success');
  assert.ok(accountSyncState.last_success_at);
});

test('7. Zero-metric honesty: failed sync attempts preserve last_success_at and never overwrite confirmed metrics with fabricated zeroes', async () => {
  // Capture existing latest snapshot before failure test
  const beforeSnapshots = db.prepare(`SELECT * FROM post_metrics_snapshots WHERE destination_id = ? ORDER BY observed_at DESC`).all(testDestId) as any[];
  const initialLatest = beforeSnapshots[0];
  assert.equal(initialLatest.view_count, 50, 'Baseline view count is 50');

  // Capture existing last_success_at
  const beforeSyncState = analyticsRepo.getSyncStates().find((s) => s.account_id === testAccountId && s.target === 'all')!;
  const originalSuccessAt = beforeSyncState.last_success_at;
  assert.ok(originalSuccessAt, 'Initial success timestamp exists');

  // Mock Display API returning HTTP 429 rate limit error
  globalThis.fetch = async (inputUrl: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/video/query/')) {
      return new Response(
        JSON.stringify({
          error: { code: 'rate_limit_exceeded', message: 'Rate limit reached, please slow down' },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const syncResult = await syncService.syncAccount(testAccountId);
  assert.equal(syncResult.success, false);

  // Crucial check: post_metrics_snapshots must NOT have a new 0-view snapshot recorded
  const afterSnapshots = db.prepare(`SELECT * FROM post_metrics_snapshots WHERE destination_id = ? ORDER BY observed_at DESC`).all(testDestId) as any[];
  assert.equal(afterSnapshots.length, beforeSnapshots.length, 'No snapshot must be added for failed sync');
  assert.equal(afterSnapshots[0].view_count, 50, 'Confirmed view count remains 50, never fabricated 0');

  // Sync state must preserve previous last_success_at
  const afterSyncState = analyticsRepo.getSyncStates().find((s) => s.account_id === testAccountId && s.target === 'all')!;
  assert.equal(afterSyncState.last_success_at, originalSuccessAt, 'last_success_at must not be wiped on failure');
});

test('8. Configurable synchronization interval respects environment variable', () => {
  const previousMs = process.env.SCC_SYNC_INTERVAL_MS;
  const previousMin = process.env.SCC_SYNC_INTERVAL_MINUTES;

  try {
    process.env.SCC_SYNC_INTERVAL_MINUTES = '20';
    syncService.start();
    // Stop immediately
    syncService.stop();

    process.env.SCC_SYNC_INTERVAL_MS = '60000';
    delete process.env.SCC_SYNC_INTERVAL_MINUTES;
    syncService.start();
    syncService.stop();
  } finally {
    if (previousMs) process.env.SCC_SYNC_INTERVAL_MS = previousMs;
    else delete process.env.SCC_SYNC_INTERVAL_MS;
    if (previousMin) process.env.SCC_SYNC_INTERVAL_MINUTES = previousMin;
    else delete process.env.SCC_SYNC_INTERVAL_MINUTES;
  }
});

function resetRefreshFixture(minutesUntilExpiry = -5) {
  db.prepare(`UPDATE accounts SET status='connected', connection_status='limited',
    access_token=?, refresh_token=?, token_expires_at=?, refresh_expires_at=?,
    identity_verified_at=datetime('now'), connection_revision=connection_revision+1,
    granted_scopes_json='["user.info.basic","user.info.profile","user.info.stats","video.list"]'
    WHERE id=?`).run(
    seal('act.refresh-regression-before'), seal('rft.refresh-regression-before'),
    new Date(Date.now() + minutesUntilExpiry * 60_000).toISOString(),
    new Date(Date.now() + 10 * 24 * 60 * 60_000).toISOString(), testAccountId,
  );
  return accountsRepo.getAccountById(testAccountId) as any;
}

function connectionEvidence() {
  const account = accountsRepo.getAccountById(testAccountId) as any;
  return Object.fromEntries([
    'status', 'connection_status', 'connection_revision', 'health_status',
    'access_token', 'refresh_token', 'token_expires_at', 'refresh_expires_at',
    'identity_verified_at', 'granted_scopes_json',
  ].map(key => [key, account[key]]));
}

function metricEvidence() {
  return {
    posts: db.prepare('SELECT * FROM post_metrics_snapshots WHERE account_id=? ORDER BY id').all(testAccountId),
    account: db.prepare('SELECT * FROM analytics_snapshots WHERE account_id=? ORDER BY id').all(testAccountId),
    lastSuccess: analyticsRepo.getSyncStates().find(s => s.account_id === testAccountId && s.target === 'all')?.last_success_at,
  };
}

function refreshedTokenResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    access_token: 'act.refresh-regression-after', expires_in: 86_400,
    refresh_token: 'rft.refresh-regression-after', refresh_expires_in: 864_000,
    open_id: 'open-id-maroon-refresh-test',
    scope: 'user.info.basic,user.info.profile,user.info.stats,video.list', ...overrides,
  }), { status: 200 });
}

test('9. Proactive refresh renews a still-valid token inside the window and skips tokens outside it', async () => {
  const before = resetRefreshFixture(10);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return refreshedTokenResponse(); };
  const refreshed = await ensureFreshToken(before);
  assert.equal(calls, 1);
  assert.equal(unseal(refreshed.access_token), 'act.refresh-regression-after');
  assert.equal(refreshed.connection_revision, before.connection_revision + 1);

  const outsideWindow = resetRefreshFixture(60);
  assert.deepEqual(await ensureFreshToken(outsideWindow), outsideWindow);
  assert.equal(calls, 1, 'No request outside the 30-minute refresh window');
});

test('10. Temporary and unclassified token endpoint errors preserve connection, credentials and metrics', async (t) => {
  const cases: Array<{ name: string; response: () => Promise<Response>; reason: string }> = [
    { name: 'HTTP 503 temporarily_unavailable', response: async () => new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503 }), reason: 'provider_rejected' },
    { name: 'HTTP 503 overrides invalid_grant body', response: async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 503 }), reason: 'provider_rejected' },
    { name: 'HTTP 429 rate limit', response: async () => new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), { status: 429 }), reason: 'provider_rejected' },
    { name: 'HTTP 429 overrides invalid_grant body', response: async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 429 }), reason: 'provider_rejected' },
    { name: 'HTTP 500 server_error', response: async () => new Response(JSON.stringify({ error: 'server_error' }), { status: 500 }), reason: 'provider_rejected' },
    { name: 'HTTP 400 invalid_request configuration failure', response: async () => new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 }), reason: 'provider_rejected' },
    { name: 'HTTP 401 invalid_client configuration failure', response: async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }), reason: 'provider_rejected' },
    { name: 'HTTP 400 unknown provider code', response: async () => new Response(JSON.stringify({ error: 'unexpected_error' }), { status: 400 }), reason: 'provider_rejected' },
    { name: 'network reset', response: async () => { throw new TypeError('fetch failed'); }, reason: 'network_failure' },
    { name: 'request timeout', response: async () => { throw new DOMException('Request timed out', 'TimeoutError'); }, reason: 'network_timeout' },
    { name: 'unreadable HTTP 503 body', response: async () => new Response('<html>Unavailable</html>', { status: 503 }), reason: 'invalid_json' },
    { name: 'null JSON response', response: async () => new Response('null'), reason: 'invalid_json' },
    { name: 'array JSON response', response: async () => new Response('[]'), reason: 'invalid_json' },
    { name: 'primitive JSON response', response: async () => new Response('12'), reason: 'invalid_json' },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      resetRefreshFixture();
      const beforeConnection = connectionEvidence();
      const beforeMetrics = metricEvidence();
      globalThis.fetch = scenario.response;
      await assert.rejects(refreshConnection(testAccountId), (error: unknown) =>
        error instanceof OAuthFailure && error.reason === scenario.reason);
      assert.deepEqual(connectionEvidence(), beforeConnection);
      assert.deepEqual(metricEvidence(), beforeMetrics);
    });
  }
});

test('11. A temporary proactive failure retains a still-valid access token without mutating its connection', async () => {
  const account = resetRefreshFixture(10);
  const before = connectionEvidence();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503 });
  const usable = await ensureFreshToken(account);
  assert.equal(usable.id, account.id);
  assert.deepEqual(connectionEvidence(), before);
});

test('12. Failed automatic refresh records no synthetic snapshots and recovers on the next synchronization', async (t) => {
  for (const failure of ['http_503', 'network_failure', 'timeout', 'invalid_grant']) {
    await t.test(failure, async () => {
      resetRefreshFixture();
      const beforeConnection = connectionEvidence();
      const beforeMetrics = metricEvidence();
      let refreshCalls = 0;
      globalThis.fetch = async (url) => {
        assert.ok(String(url).includes('/oauth/token/'), 'Failed preflight must not call metrics APIs with the expired access token');
        refreshCalls++;
        if (failure === 'network_failure') throw new TypeError('fetch failed');
        if (failure === 'timeout') throw new DOMException('Request timed out', 'TimeoutError');
        return new Response(JSON.stringify({ error: failure === 'invalid_grant' ? 'invalid_grant' : 'temporarily_unavailable' }), { status: failure === 'invalid_grant' ? 400 : 503 });
      };
      const failed = await syncService.syncAccount(testAccountId);
      assert.equal(refreshCalls, 1, 'No immediate duplicate refresh within the failed synchronization');
      assert.equal(failed.success, false);
      assert.equal(failed.status, failure === 'invalid_grant' ? 'auth_required' : 'failed');
      assert.deepEqual(metricEvidence(), beforeMetrics, 'History and last_success_at survive the failed cycle');
      if (failure !== 'invalid_grant') assert.deepEqual(connectionEvidence(), beforeConnection);
      else {
        const after = connectionEvidence();
        assert.equal(after.connection_status, 'expired');
        for (const key of ['access_token', 'refresh_token', 'connection_revision', 'token_expires_at', 'refresh_expires_at'])
          assert.equal(after[key], beforeConnection[key]);
      }

      // A revoked grant requires a new owner authorization; transient failures recover automatically.
      if (failure === 'invalid_grant') {
        const requestsBefore = refreshCalls;
        const revoked = accountsRepo.getAccountById(testAccountId) as any;
        assert.equal(hasActiveApiAuthorization({ ...revoked, token_expires_at: new Date(Date.now() + 86_400_000).toISOString() }), false);
        await assert.rejects(ensureFreshToken(revoked), (error: unknown) => error instanceof OAuthFailure && error.reason === 'invalid_grant');
        const repeated = await syncService.syncAccount(testAccountId);
        assert.equal(repeated.status, 'auth_required');
        assert.equal(repeated.success, false);
        assert.equal(refreshCalls, requestsBefore, 'A known revoked grant is not replayed on subsequent scheduled cycles');
        assert.deepEqual(metricEvidence(), beforeMetrics);
        return;
      }
      globalThis.fetch = async (url, options) => {
        if (String(url).includes('/oauth/token/')) { refreshCalls++; return refreshedTokenResponse(); }
        assert.equal((options?.headers as any)?.Authorization, 'Bearer act.refresh-regression-after');
        if (String(url).includes('/user/info/')) return new Response(JSON.stringify({
          data: { user: { open_id: 'open-id-maroon-refresh-test', follower_count: 120, following_count: 45, likes_count: 310 } }, error: { code: 'ok' },
        }));
        if (String(url).includes('/video/query/')) return new Response(JSON.stringify({
          data: { videos: [{ id: '7697115798170782983', view_count: 51, like_count: 8, comment_count: 2, share_count: 1 }] }, error: { code: 'ok' },
        }));
        throw new Error('Unexpected mocked endpoint');
      };
      const recovered = await syncService.syncAccount(testAccountId);
      assert.equal(recovered.success, true);
      assert.equal(recovered.metricsSynced, 1);
      assert.equal(refreshCalls, 2, 'The next synchronization makes one new successful refresh');
      const metrics = metricEvidence();
      assert.equal(metrics.posts.length, beforeMetrics.posts.length + 1);
      assert.equal((metrics.posts.find((p: any) => !beforeMetrics.posts.some((b: any) => b.id === p.id)) as any).view_count, 51);
      assert.notEqual(metrics.lastSuccess, beforeMetrics.lastSuccess);
    });
  }
});

test('13. Concurrent failed refreshes deduplicate and release their mutex for a later successful attempt', async () => {
  resetRefreshFixture();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503 });
  };
  const failures = await Promise.allSettled([refreshConnection(testAccountId), refreshConnection(testAccountId), refreshConnection(testAccountId)]);
  assert.equal(calls, 1);
  assert.ok(failures.every(result => result.status === 'rejected'));
  globalThis.fetch = async () => { calls++; return refreshedTokenResponse(); };
  assert.equal(unseal((await refreshConnection(testAccountId)).access_token), 'act.refresh-regression-after');
  assert.equal(calls, 2);
});

test('14. A stale successful refresh cannot overwrite a newer connection revision', async () => {
  const account = resetRefreshFixture();
  let expected: Record<string, unknown>;
  globalThis.fetch = async () => {
    db.prepare(`UPDATE accounts SET access_token=?, refresh_token=?, token_expires_at=?, connection_revision=connection_revision+1 WHERE id=?`).run(
      seal('act.newer-authorization'), seal('rft.newer-authorization'), new Date(Date.now() + 86_400_000).toISOString(), testAccountId,
    );
    expected = connectionEvidence();
    return refreshedTokenResponse();
  };
  const current = await refreshConnection(testAccountId);
  assert.equal(current.connection_revision, account.connection_revision + 1);
  assert.equal(unseal(current.access_token), 'act.newer-authorization');
  assert.deepEqual(connectionEvidence(), expected!);
});

test('15. A late revoked-grant failure cannot expire a newer authorization revision', async () => {
  resetRefreshFixture();
  let expected: Record<string, unknown>;
  globalThis.fetch = async () => {
    db.prepare(`UPDATE accounts SET access_token=?, refresh_token=?, token_expires_at=?, connection_revision=connection_revision+1 WHERE id=?`).run(
      seal('act.newer-authorization'), seal('rft.newer-authorization'), new Date(Date.now() + 86_400_000).toISOString(), testAccountId,
    );
    expected = connectionEvidence();
    return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
  };
  await assert.rejects(refreshConnection(testAccountId), (error: unknown) => error instanceof OAuthFailure && error.reason === 'connection_changed');
  assert.deepEqual(connectionEvidence(), expected!);
});

test('16. A refresh finishing after disconnect cannot restore credentials or overwrite the disconnect revision', async () => {
  resetRefreshFixture();
  let expected: Record<string, unknown>;
  globalThis.fetch = async () => {
    db.prepare(`UPDATE accounts SET status='disconnected', connection_status='disconnected', access_token=NULL,
      refresh_token=NULL, token_expires_at=NULL, connection_revision=connection_revision+1 WHERE id=?`).run(testAccountId);
    expected = connectionEvidence();
    return refreshedTokenResponse();
  };
  await assert.rejects(refreshConnection(testAccountId), /connection changed/);
  assert.deepEqual(connectionEvidence(), expected!);
});

test('17. Incomplete or invalid refresh responses never persist credentials or invent token expiry', async (t) => {
  for (const response of [{ access_token: '' }, { expires_in: -1 }, { expires_in: '86400' }, { refresh_expires_in: -1 }, { open_id: 'wrong-account' }]) {
    await t.test(JSON.stringify(response), async () => {
      resetRefreshFixture();
      const before = connectionEvidence();
      globalThis.fetch = async () => refreshedTokenResponse(response);
      await assert.rejects(refreshConnection(testAccountId), /identity mismatch or incomplete/);
      assert.deepEqual(connectionEvidence(), before);
    });
  }
  const account = resetRefreshFixture();
  globalThis.fetch = async () => refreshedTokenResponse({ refresh_expires_in: undefined });
  const refreshed = await refreshConnection(testAccountId);
  assert.equal(refreshed.refresh_expires_at, account.refresh_expires_at, 'Missing expiry metadata retains the previous conservative expiry');
});

test('18. Invalid access expiry refreshes safely; unavailable local refresh metadata and encryption failures preserve connection', async (t) => {
  resetRefreshFixture();
  db.prepare('UPDATE accounts SET token_expires_at=? WHERE id=?').run('invalid-date', testAccountId);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return refreshedTokenResponse(); };
  await ensureFreshToken(accountsRepo.getAccountById(testAccountId));
  assert.equal(calls, 1, 'An invalid access expiry must not be treated as fresh');

  for (const change of ['missing_identity', 'invalid_refresh_expiry', 'missing_refresh_token', 'invalid_encryption']) {
    await t.test(change, async () => {
      resetRefreshFixture(10);
      if (change === 'missing_identity') db.prepare('UPDATE accounts SET identity_verified_at=NULL WHERE id=?').run(testAccountId);
      if (change === 'invalid_refresh_expiry') db.prepare('UPDATE accounts SET refresh_expires_at=? WHERE id=?').run('invalid-date', testAccountId);
      if (change === 'missing_refresh_token') db.prepare('UPDATE accounts SET refresh_token=NULL WHERE id=?').run(testAccountId);
      if (change === 'invalid_encryption') db.prepare('UPDATE accounts SET refresh_token=? WHERE id=?').run('corrupted-ciphertext', testAccountId);
      const before = connectionEvidence();
      globalThis.fetch = async () => { throw new Error('Invalid local metadata must not call the provider'); };
      await assert.rejects(refreshConnection(testAccountId), (error: unknown) => error instanceof OAuthFailure);
      assert.deepEqual(connectionEvidence(), before);
    });
  }
});

test('19. TikTok health-route provider failures report unavailable without changing persisted connection or metrics', async (t) => {
  const app = express();
  app.use('/api/accounts', accountsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const healthUrl = `http://127.0.0.1:${address.port}/api/accounts/${testAccountId}/test-health`;
  const scenarios = [
    { name: '503', response: async () => new Response(JSON.stringify({ error: { code: 'internal_error' } }), { status: 503 }) },
    { name: '429', response: async () => new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), { status: 429 }) },
    { name: 'network failure', response: async (): Promise<Response> => { throw new TypeError('fetch failed'); } },
    { name: 'timeout', response: async (): Promise<Response> => { throw new DOMException('Request timed out', 'TimeoutError'); } },
    { name: 'invalid JSON', response: async () => new Response('<html>Bad gateway</html>', { status: 502 }) },
    { name: 'incomplete success response', response: async () => new Response(JSON.stringify({ data: {}, error: { code: 'ok' } })) },
    { name: 'refreshable access token rejection', response: async () => new Response(JSON.stringify({ error: { code: 'access_token_invalid' } }), { status: 401 }) },
  ];
  try {
    for (const scenario of scenarios) {
      await t.test(scenario.name, async () => {
        resetRefreshFixture(60);
        const beforeConnection = connectionEvidence();
        const beforeMetrics = metricEvidence();
        let calls = 0;
        globalThis.fetch = async (url) => {
          assert.ok(String(url).includes('/user/info/'), 'A fresh access token must not trigger an OAuth refresh');
          calls++;
          return scenario.response();
        };
        const response = await originalFetch(healthUrl, { method: 'POST' });
        assert.equal(response.status, 200);
        const payload = await response.json() as any;
        assert.equal(payload.success, false);
        assert.equal(payload.health.status, 'failed');
        assert.equal(calls, 1);
        assert.deepEqual(connectionEvidence(), beforeConnection);
        assert.deepEqual(metricEvidence(), beforeMetrics);
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('20. Untrusted provider details, diagnostic strings and log IDs never enter public refresh errors or OAuth logs', async () => {
  const sensitive = 'fixture-sensitive-provider-payload-DO-NOT-REFLECT';
  const app = express();
  app.use('/api/connections', connectionsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const warnings: string[] = [];
  const previousWarn = console.warn;
  console.warn = (...values) => { warnings.push(values.map(String).join(' ')); };
  try {
    const account = resetRefreshFixture();
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: sensitive, error_description: `${sensitive} access_token=fixture-sensitive-token`,
      message: sensitive, log_id: sensitive,
    }), { status: 503 });
    const publicResponse = await originalFetch(`http://127.0.0.1:${address.port}/api/connections/${testAccountId}/refresh`, { method: 'POST' });
    assert.equal(publicResponse.status, 409);
    const publicBody = await publicResponse.text();
    assert.equal(publicBody.includes(sensitive), false);
    assert.equal(publicBody.includes('fixture-sensitive-token'), false);
    await assert.rejects(ensureFreshToken(account), (error: unknown) => error instanceof OAuthFailure && error.reason === 'provider_rejected');

    const failure = authorizationFailure(new OAuthFailure('provider_response', 'provider_rejected', sensitive,
      { httpStatus: 503, code: sensitive, logId: sensitive, subcode: 123 }), 'code_exchange');
    assert.equal(failure.message.includes(sensitive), false);
    assert.deepEqual(failure.provider, { httpStatus: 503, subcode: 123 });
    const safeCode = authorizationFailure(new OAuthFailure('provider_response', 'provider_rejected', sensitive,
      { httpStatus: 400, code: 'invalid_grant', logId: sensitive }), 'code_exchange');
    assert.equal(safeCode.provider.code, 'invalid_grant', 'Documented grant code remains available for safe classification');
    assert.equal(safeCode.message.includes(sensitive), false);
    assert.equal(warnings.join('\n').includes(sensitive), false);
    assert.equal(warnings.join('\n').includes('fixture-sensitive-token'), false);
  } finally {
    console.warn = previousWarn;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
