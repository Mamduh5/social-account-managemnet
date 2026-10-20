import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, uploadsDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { seedInitialData } from '../server/src/db/seed.js';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import {
  saveRegisteredAccount,
  publicAccount,
  archiveAccount,
  indexExistingIdentities,
  disconnectAccount,
} from '../server/src/services/accounts.service.js';
import {
  normalizeIdentity,
  validatePublishedUrl,
} from '../server/src/domain/account-identity.js';
import { getConnector } from '../server/src/connectors/registry.js';
import { seal, unseal } from '../server/src/services/token-protection.js';
import { publishingService } from '../server/src/services/publishing.service.js';
import { publishingRepo } from '../server/src/repositories/publishing.repo.js';
import { queueService } from '../server/src/services/queue.service.js';
import { accountsRouter } from '../server/src/routes/accounts.routes.js';
import { connectionsRouter } from '../server/src/routes/connections.routes.js';
import { bridgeRouter } from '../server/src/routes/bridge.routes.js';
import { localAccess } from '../server/src/local-access.js';
import { analyticsRepo } from '../server/src/repositories/analytics.repo.js';
import { inboxRepo } from '../server/src/repositories/inbox.repo.js';

let server: any;
let base = '';
let fb = '';
let tt = '';
let video = 'fixture-video';
const realFetch = globalThis.fetch;
let providerHandler: (url: string, options: any) => any;
let called: string[] = [];
before(async () => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.META_APP_ID = 'fixture-app';
  process.env.META_APP_SECRET = 'fixture-secret';
  process.env.META_GRAPH_VERSION = 'v25.0';
  process.env.META_REDIRECT_URI =
    'http://127.0.0.1:3999/api/connections/callback/facebook';
  process.env.TIKTOK_CLIENT_KEY = 'fixture-key';
  process.env.TIKTOK_CLIENT_SECRET = 'fixture-secret';
  process.env.TIKTOK_REDIRECT_URI =
    'https://localhost/api/connections/callback/tiktok';
  initializeDatabase();
  seedInitialData();
  indexExistingIdentities();
  const app = express();
  app.use(localAccess);
  app.use(express.json());
  app.use('/api/accounts', accountsRouter);
  app.use('/api/connections', connectionsRouter);
  app.use('/api/bridge', bridgeRouter);
  server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.META_REDIRECT_URI = `${base}/api/connections/callback/facebook`;
  process.env.TIKTOK_REDIRECT_URI = `https://127.0.0.1:${server.address().port}/api/connections/callback/tiktok`;
  globalThis.fetch = (async (url: any, options: any = {}) => {
    if (String(url).startsWith(base)) return realFetch(url, options);
    called.push(String(url));
    if (!providerHandler)
      throw new Error('Unexpected external request in isolated tests');
    return new Response(
      JSON.stringify(await providerHandler(String(url), options)),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as any;
});
after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
});
async function api(route: string, data?: any, cookie = '', method?: string) {
  return fetch(base + route, {
    method: method || (data === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(route === `/api/connections/${tt}/start`
        ? { Origin: `https://127.0.0.1:${server.address().port}` }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    redirect: 'manual',
  });
}
async function start(id: string, data: any = {}) {
  const r = await api(`/api/connections/${id}/start`, data);
  assert.equal(r.status, 200);
  const body = (await r.json()) as any;
  return {
    cookie: r.headers.get('set-cookie')!.split(';')[0],
    state: new URL(body.authorizationUrl).searchParams.get('state')!,
    url: body.authorizationUrl,
  };
}
function facebookProvider(url: string) {
  if (url.includes('/oauth/access_token'))
    return { access_token: 'fixture-user-token', expires_in: 3600 };
  if (url.includes('/me/permissions'))
    return {
      data: [
        'pages_show_list',
        'pages_manage_posts',
        'pages_read_engagement',
      ].map((permission) => ({ permission, status: 'granted' })),
    };
  if (url.includes('/me/accounts'))
    return {
      data: [
        {
          id: '123456789',
          name: 'Fixture Page',
          access_token: 'fixture-page-token',
          tasks: ['CREATE_CONTENT'],
        },
      ],
    };
  throw new Error('Unexpected provider URL');
}
test('Register Facebook Pages and TikTok Personal/Business without credentials, with no six-account cap', () => {
  fb = saveRegisteredAccount({
    platform: 'facebook',
    name: 'Same display name',
    handle: 'https://m.facebook.com/Fixture.Page/?ref=share',
    categoryId: 'cat-obj-life',
  });
  tt = saveRegisteredAccount({
    platform: 'tiktok',
    name: 'Same display name',
    handle: '@fixture.personal',
    accountType: 'personal',
    categoryId: 'cat-obj-life',
  });
  for (let i = 0; i < 12; i++)
    saveRegisteredAccount({
      platform: 'tiktok',
      name: 'More accounts',
      handle: `@fixture.extra${i}`,
      accountType: i % 2 ? 'personal' : 'business',
      categoryId: 'cat-obj-life',
    });
  const a = accountsRepo.getAccountById(fb) as any;
  assert.equal(a.status, 'disconnected');
  assert.equal(a.connection_status, 'registered');
  assert.equal(a.is_demo, 0);
  assert.equal(accountsRepo.getAccountById(tt)?.account_type, 'personal');
  assert.equal(accountsRepo.getAllAccounts().length, 20);
  assert.equal(getConnector(a).getCapabilities().canPublish, false);
});
test('Normalize identities and reject duplicate aliases, URLs, external IDs, and unsafe URLs', () => {
  assert.equal(
    normalizeIdentity('facebook', '@FixturePage').key,
    normalizeIdentity('facebook', 'https://www.facebook.com/fixture.page/').key
  );
  assert.equal(
    normalizeIdentity(
      'facebook',
      'https://www.facebook.com/profile.php?id=12345'
    ).numericId,
    '12345'
  );
  assert.equal(
    normalizeIdentity('facebook', 'https://www.facebook.com/pages/name/12345')
      .key,
    'id:12345'
  );
  assert.throws(
    () =>
      saveRegisteredAccount({
        platform: 'facebook',
        name: 'Different name',
        handle: '@fixturepage',
      }),
    /already registered/
  );
  assert.throws(
    () =>
      saveRegisteredAccount({
        platform: 'tiktok',
        name: 'Other',
        handle: '@FIXTURE.PERSONAL',
      }),
    /already registered/
  );
  for (const input of [
    'https://tiktok.com.evil.test/@fixture.personal',
    'https://evil.test/@fixture.personal',
    'https://www.tiktok.com/@fixture.personal/video/123',
    'javascript:alert(1)',
    'https://user:pass@tiktok.com/@fixture.personal',
  ])
    assert.throws(() => normalizeIdentity('tiktok', input));
  assert.throws(() =>
    saveRegisteredAccount({
      platform: 'facebook',
      name: 'Profile',
      handle: 'profiletest',
      accountType: 'personal',
    })
  );
  assert.throws(() =>
    validatePublishedUrl('tiktok', 'https://www.tiktok.com/@fixture.personal')
  );
});
test('Edit identity and category without changing internal ID; clear category and save independent preferences/branding', () => {
  saveRegisteredAccount(
    {
      name: 'Renamed',
      handle: 'fixture.renamed',
      categoryId: null,
      publishingPreferences: {
        defaultCaption: 'Caption',
        defaultHashtags: '#tag',
        applyBranding: false,
      },
    },
    tt
  );
  assert.equal(accountsRepo.getAccountById(tt)?.category_id, null);
  assert.throws(
    () =>
      saveRegisteredAccount({
        platform: 'tiktok',
        name: 'Old alias',
        handle: 'fixture.personal',
      }),
    /already registered/
  );
  saveRegisteredAccount(
    { handle: 'fixture.personal', categoryId: 'cat-scr-life' },
    tt
  );
  accountsRepo.updateBrandKit(
    fb,
    JSON.stringify({ text: 'PAGE', movementPreset: 'smooth_sine' })
  );
  accountsRepo.updateBrandKit(
    tt,
    JSON.stringify({ text: 'TIKTOK', movementPreset: 'corner_jump' })
  );
  assert.notEqual(
    accountsRepo.getAccountById(fb)?.brand_kit_json,
    accountsRepo.getAccountById(tt)?.brand_kit_json
  );
  assert.equal(
    publicAccount(accountsRepo.getAccountById(tt)).settings.defaultCaption,
    'Caption'
  );
});
test('Never return tokens, invent a connection, or allow client privilege escalation', async () => {
  db.prepare(
    'UPDATE accounts SET access_token=?,refresh_token=? WHERE id=?'
  ).run('legacy-secret', 'legacy-refresh', tt);
  const r = await api(`/api/accounts/${tt}`);
  const raw = await r.text();
  assert.ok(!raw.includes('legacy-secret'));
  assert.ok(!raw.includes('legacy-refresh'));
  assert.ok(!raw.includes('access_token'));
  db.prepare("UPDATE accounts SET status='connected' WHERE id=?").run(tt);
  assert.equal(
    publicAccount(accountsRepo.getAccountById(tt)).status,
    'disconnected'
  );
  assert.equal(
    (
      await api(
        `/api/accounts/${tt}`,
        { status: 'connected', connectorMode: 'simulator' },
        '',
        'PUT'
      )
    ).status,
    400
  );
  assert.equal((await api(`/api/accounts/${tt}/reconnect`, {})).status, 409);
  assert.equal((await api(`/api/accounts/${tt}/test-health`, {})).status, 200);
  assert.equal(accountsRepo.getAccountById(tt)?.status, 'disconnected');
  disconnectAccount(tt);
});
test('Demo-only metrics and engagement never appear as real data', () => {
  assert.equal(analyticsRepo.getAccountRankings().length, 0);
  assert.equal(analyticsRepo.getOverviewTotals().total_views, null);
  assert.equal(inboxRepo.getComments({}).length, 0);
  assert.equal(inboxRepo.getInboxStats().total, 0);
  assert.equal(inboxRepo.getInboxStats(true).total, 6);
  assert.ok(inboxRepo.getComments({ includeDemos: true }).length > 0);
  const demos = accountsRepo.getAllAccounts().filter((a: any) => a.is_demo);
  assert.equal(demos.length, 6);
  assert.ok(demos.every((a) => publicAccount(a).connection_status === 'demo'));
});
test('Missing developer setup preserves registration, and cross-site mutation is rejected', async () => {
  const saved = process.env.META_APP_SECRET;
  delete process.env.META_APP_SECRET;
  assert.equal((await api(`/api/connections/${fb}/start`, {})).status, 409);
  assert.equal(accountsRepo.getAccountById(fb)?.status, 'disconnected');
  process.env.META_APP_SECRET = saved;
  const r = await fetch(base + '/api/accounts', {
    method: 'POST',
    headers: {
      Origin: 'https://evil.test',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(r.status, 403);
});
test('OAuth rejects wrong state, browser binding, denied consent, and replay', async () => {
  let flow = await start(fb);
  called = [];
  assert.equal(
    (
      await api(
        `/api/connections/callback/facebook?state=${flow.state}&code=fixture`,
        undefined,
        'scc_oauth=wrong'
      )
    ).status,
    400
  );
  assert.equal(called.length, 0);
  assert.equal(
    (
      await api(
        `/api/connections/callback/facebook?state=wrong&code=fixture`,
        undefined,
        flow.cookie
      )
    ).status,
    400
  );
  assert.equal(called.length, 0);
  flow = await start(fb);
  assert.equal(
    (
      await api(
        `/api/connections/callback/facebook?state=${flow.state}&error=access_denied`,
        undefined,
        flow.cookie
      )
    ).status,
    400
  );
  assert.equal(accountsRepo.getAccountById(fb)?.status, 'disconnected');
});
test('Meta Page discovery and explicit selection bind verified ID to the original record with encrypted tokens and scope gates', async () => {
  providerHandler = facebookProvider;
  const flow = await start(fb, { publishing: true });
  assert.ok(
    new URL(flow.url).searchParams.get('scope')?.includes('pages_manage_posts')
  );
  const callback = `/api/connections/callback/facebook?state=${flow.state}&code=fixture`;
  assert.equal((await api(callback, undefined, flow.cookie)).status, 302);
  const candidates = await (
    await api(`/api/connections/${fb}/candidates`, undefined, flow.cookie)
  ).text();
  assert.ok(candidates.includes('123456789'));
  assert.ok(!candidates.includes('fixture-page-token'));
  assert.equal(
    (
      await api(
        `/api/connections/${fb}/select`,
        { externalId: '123456789', confirmIdentity: true },
        flow.cookie
      )
    ).status,
    200
  );
  const account = accountsRepo.getAccountById(fb) as any;
  assert.equal(account.id, fb);
  assert.equal(account.external_id, '123456789');
  assert.ok(account.identity_verified_at);
  assert.ok(account.access_token.startsWith('enc1:'));
  assert.equal(unseal(account.access_token), 'fixture-page-token');
  assert.equal(getConnector(account).getCapabilities().canPublish, true);
  assert.equal(getConnector(account).getCapabilities().requiresManualConfirmation, true);
  assert.equal(getConnector(account).getCapabilities().canReply, false);
  assert.equal((await api(callback, undefined, flow.cookie)).status, 400);
  assert.throws(
    () =>
      saveRegisteredAccount({
        platform: 'facebook',
        name: 'Duplicate external',
        handle: 'differentpage',
        externalId: '123456789',
      }),
    /already registered/
  );
});
test('Expired token disables publishing independently; disconnect invalidates pending OAuth', async () => {
  db.prepare('UPDATE accounts SET token_expires_at=? WHERE id=?').run(
    new Date(Date.now() - 1000).toISOString(),
    fb
  );
  assert.equal(
    getConnector(accountsRepo.getAccountById(fb)).getCapabilities().canPublish,
    false
  );
  assert.equal(
    publicAccount(accountsRepo.getAccountById(fb)).connection_status,
    'expired'
  );
  const flow = await start(fb);
  disconnectAccount(fb);
  assert.equal(
    (
      await api(
        `/api/connections/callback/facebook?state=${flow.state}&code=fixture`,
        undefined,
        flow.cookie
      )
    ).status,
    400
  );
  assert.equal(accountsRepo.getAccountById(tt)?.account_type, 'personal');
});
test('TikTok username mismatch is rejected; authorized identity, rotated refresh tokens, and Personal type survive', async () => {
  let username = 'wrong.user';
  providerHandler = (url, options) =>
    url.includes('/oauth/token/')
      ? {
          access_token: 'fixture-tt-token',
          refresh_token: 'rotated-refresh',
          expires_in: 86400,
          refresh_expires_in: 31536000,
          open_id: 'fixture-openid',
          scope: 'user.info.basic,user.info.profile',
        }
      : {
          data: {
            user: {
              open_id: 'fixture-openid',
              display_name: 'TikTok fixture',
              username,
            },
          },
          error: { code: 'ok' },
        };
  let flow = await start(tt);
  assert.equal(
    (
      await api(
        `/api/connections/callback/tiktok?state=${flow.state}&code=fixture`,
        undefined,
        flow.cookie
      )
    ).status,
    302
  );
  assert.equal(
    (
      await api(
        `/api/connections/${tt}/select`,
        { externalId: 'fixture-openid', confirmIdentity: true },
        flow.cookie
      )
    ).status,
    400
  );
  username = 'fixture.personal';
  flow = await start(tt);
  await api(
    `/api/connections/callback/tiktok?state=${flow.state}&code=fixture`,
    undefined,
    flow.cookie
  );
  assert.equal(
    (
      await api(
        `/api/connections/${tt}/select`,
        { externalId: 'fixture-openid', confirmIdentity: true },
        flow.cookie
      )
    ).status,
    200
  );
  assert.equal(accountsRepo.getAccountById(tt)?.account_type, 'personal');
  assert.equal(
    getConnector(accountsRepo.getAccountById(tt)).getCapabilities().canPublish,
    false
  );
  assert.equal((await api(`/api/connections/${tt}/refresh`, {})).status, 200);
  assert.equal(
    unseal((accountsRepo.getAccountById(tt) as any).refresh_token),
    'rotated-refresh'
  );
});
test('Token encryption detects tampering and refuses plaintext credentials', () => {
  assert.equal(unseal(seal('fixture-secret')), 'fixture-secret');
  assert.throws(() => unseal('plaintext'));
  const token = seal('secret');
  assert.throws(() => unseal(token.slice(0, -4) + 'AAAA'));
});
test('Real disconnected jobs prepare original/branded files, never call simulator or publish on site open', async () => {
  disconnectAccount(fb);
  disconnectAccount(tt);
  const original = path.join(uploadsDir, 'fixture.mp4');
  const branded = path.join(uploadsDir, 'fixture-branded.mp4');
  fs.writeFileSync(original, 'fixture master');
  fs.writeFileSync(branded, 'fixture branded');
  db.prepare(
    "INSERT INTO videos(id,title,source_type,original_filename,file_path) VALUES (?,'Fixture','manual_upload','fixture.mp4',?)"
  ).run(video, original);
  db.prepare(
    "INSERT INTO branded_videos(id,video_id,preset_name,movement_preset,watermark_text,file_path) VALUES ('fixture-variant',?,'Fixture','smooth_sine','TEST',?)"
  ).run(video, branded);
  const result = publishingService.createPost({
    videoId: video,
    title: 'Fixture',
    destinations: [
      { accountId: fb, selectedVariantId: 'original' },
      { accountId: tt, selectedVariantId: 'fixture-variant' },
    ],
  });
  const jobs = publishingRepo
    .getPendingQueueJobs(20)
    .filter((j) => j.post_id === result.postId);
  const before = called.length;
  await Promise.all(
    jobs.map((j) => (queueService as any).executeDestinationJob(j))
  );
  assert.equal(called.length, before);
  for (const job of jobs) {
    const d = publishingRepo.getDestinationById(job.id)!;
    assert.equal(d.status, 'awaiting_confirmation');
    assert.equal(d.published_at, null);
    assert.equal(d.remote_post_id, null);
    const pkg = (await (
      await api(`/api/bridge/destinations/${job.id}/package`)
    ).json()) as any;
    assert.equal(pkg.accountId, job.account_id);
    assert.ok(pkg.caption);
    const bytes = await (await api(pkg.downloadUrl)).text();
    assert.equal(
      bytes,
      job.account_id === fb ? 'fixture master' : 'fixture branded'
    );
    assert.throws(() =>
      publishingService.confirmAssistedPublish(
        job.id,
        'https://evil.test/post',
        undefined,
        job.account_id
      )
    );
    assert.throws(() =>
      publishingService.confirmAssistedPublish(
        job.id,
        'https://www.tiktok.com/@wrong/video/123',
        undefined,
        job.account_id
      )
    );
  }
  const ttJob = jobs.find((j) => j.account_id === tt)!;
  publishingService.confirmAssistedPublish(
    ttJob.id,
    'https://www.tiktok.com/@fixture.personal/video/123456',
    undefined,
    tt
  );
  assert.equal(
    publishingRepo.getDestinationById(ttJob.id)?.status,
    'published'
  );
  assert.equal(
    (publishingRepo.getDestinationById(ttJob.id) as any).confirmation_source,
    'manual'
  );
  assert.throws(() =>
    publishingService.confirmAssistedPublish(
      ttJob.id,
      'https://www.tiktok.com/@fixture.personal/video/123456',
      undefined,
      tt
    )
  );
  assert.equal(
    publishingRepo.getDestinationById(jobs.find((j) => j.account_id === fb)!.id)
      ?.status,
    'awaiting_confirmation'
  );
  assert.equal(fs.readFileSync(original, 'utf8'), 'fixture master');
});
test('Archive preserves publication history, variants and master records; restore does not reconnect', () => {
  const before = (
    db
      .prepare(
        'SELECT count(*) n FROM publishing_destinations WHERE account_id=?'
      )
      .get(tt) as any
  ).n;
  archiveAccount(tt);
  assert.ok((accountsRepo.getAccountById(tt) as any).archived_at);
  assert.equal(
    (
      db
        .prepare(
          'SELECT count(*) n FROM publishing_destinations WHERE account_id=?'
        )
        .get(tt) as any
    ).n,
    before
  );
  assert.ok(publishingRepo.getVideoById(video));
  assert.ok(publishingRepo.getBrandedVideoById('fixture-variant'));
  assert.throws(
    () =>
      saveRegisteredAccount({
        platform: 'tiktok',
        name: 'Archive duplicate',
        handle: 'fixture.personal',
      }),
    /already registered/
  );
  archiveAccount(tt, false);
  assert.equal(accountsRepo.getAccountById(tt)?.status, 'disconnected');
});
test('Migrations are idempotent and restart recovery holds interrupted jobs until explicit retry', () => {
  initializeDatabase();
  initializeDatabase();
  assert.ok(accountsRepo.getAccountById(tt));
  const post = publishingService.createPost({
    videoId: video,
    title: 'Restart',
    destinations: [{ accountId: fb, selectedVariantId: 'original' }],
  });
  const job = publishingRepo
    .getPendingQueueJobs(20)
    .find((j) => j.post_id === post.postId)!;
  publishingRepo.updateDestinationStatus(job.id, 'uploading', 50);
  queueService.recoverInterruptedJobs();
  assert.equal(publishingRepo.getDestinationById(job.id)?.status, 'preparing');
  assert.ok(
    !publishingRepo.getPendingQueueJobs(20).some((j) => j.id === job.id)
  );
  publishingService.retryDestination(job.id);
  assert.ok(
    publishingRepo.getPendingQueueJobs(20).some((j) => j.id === job.id)
  );
});

test('Avatar upload accepts bounded raster files and rejects SVG or arbitrary paths', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU8sAAAAASUVORK5CYII=',
    'base64'
  );
  const form = new FormData();
  form.append('avatar', new Blob([png], { type: 'image/png' }), 'fixture.png');
  const r = await fetch(base + '/api/accounts/avatar', {
    method: 'POST',
    body: form,
  });
  assert.equal(r.status, 200);
  const image = (await r.json()) as any;
  assert.match(image.avatarUrl, /^\/uploads\/avatars\/[\w-]+\.png$/);
  saveRegisteredAccount({ avatarUrl: image.avatarUrl }, fb);
  assert.equal(accountsRepo.getAccountById(fb)?.avatar_url, image.avatarUrl);
  const invalid = new FormData();
  invalid.append(
    'avatar',
    new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' }),
    'unsafe.svg'
  );
  assert.equal(
    (
      await fetch(base + '/api/accounts/avatar', {
        method: 'POST',
        body: invalid,
      })
    ).status,
    400
  );
  assert.throws(() =>
    saveRegisteredAccount(
      { avatarUrl: '/uploads/avatars/../../outside.png' },
      fb
    )
  );
});
