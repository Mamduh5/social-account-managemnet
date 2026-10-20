import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MetaFacebookConnector } from '../server/src/connectors/meta-facebook.js';
import { getConnector } from '../server/src/connectors/registry.js';
import { seal } from '../server/src/services/token-protection.js';
import { createHash } from 'node:crypto';

let tempDir: string;
let dummyVideoPath: string;
const originalFetch = globalThis.fetch;

before(() => {
  tempDir = path.resolve('.data', 'test-runs', `meta-reels-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  dummyVideoPath = path.join(tempDir, 'dummy.mp4');
  fs.writeFileSync(dummyVideoPath, Buffer.from('fake-mp4-video-data-for-testing'));
  process.env.SCC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.META_GRAPH_VERSION = 'v25.0';
});

after(() => {
  globalThis.fetch = originalFetch;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

test('1. Meta connector capabilities correctly reflect pages_manage_posts scope', () => {
  const accountWithoutPublish = {
    id: 'test-fb-acc-1',
    platform: 'facebook',
    connector_mode: 'official_api',
    is_demo: 0,
    status: 'connected',
    identity_verified_at: new Date().toISOString(),
    access_token: seal('token-without-publish'),
    token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    granted_scopes_json: JSON.stringify(['pages_show_list', 'pages_read_engagement']),
  };

  const conn1 = getConnector(accountWithoutPublish);
  const caps1 = conn1.getCapabilities();
  assert.equal(caps1.canPublish, false, 'Cannot publish without pages_manage_posts');

  const accountWithPublish = {
    ...accountWithoutPublish,
    id: 'test-fb-acc-2',
    granted_scopes_json: JSON.stringify(['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']),
  };

  const conn2 = getConnector(accountWithPublish);
  const caps2 = conn2.getCapabilities();
  assert.equal(caps2.canPublish, true, 'Can publish when pages_manage_posts is present');
});

test('2. MetaFacebookConnector.publishVideo executes 3-phase Reels upload and returns confirmed status', async () => {
  const connector = new MetaFacebookConnector();
  const calls: { url: string; method: string; body?: any; headers?: any }[] = [];

  globalThis.fetch = (async (url: any, options: any = {}) => {
    const urlStr = url.toString();
    calls.push({
      url: urlStr,
      method: options.method || 'GET',
      headers: options.headers,
    });

    // Phase 1: START video_reels
    if (urlStr.includes('/video_reels') && options.body && JSON.parse(options.body).upload_phase === 'start') {
      return new Response(JSON.stringify({
        video_id: '999111222333',
        upload_url: 'https://rupload.facebook.com/video-upload/v25.0/999111222333',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Phase 2: Binary upload to rupload
    if (urlStr.includes('rupload.facebook.com')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Phase 3: FINISH video_reels
    if (urlStr.includes('/video_reels') && options.body && JSON.parse(options.body).upload_phase === 'finish') {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Phase 4: Status check
    if (urlStr.includes('/999111222333?fields=status,permalink_url')) {
      return new Response(JSON.stringify({
        id: '999111222333',
        status: { video_status: 'ready', publishing_phase: { status: 'complete' } },
        permalink_url: '/reel/999111222333',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: { message: 'Unexpected call' } }), { status: 400 });
  }) as any;

  const progressUpdates: { pct: number; stage: string }[] = [];
  const result = await connector.publishVideo(
    { name: 'Test Page', external_id: 'page-12345', access_token: 'valid-token' },
    {
      destinationId: 'dest-1',
      postId: 'post-1',
      accountId: 'acc-1',
      videoPath: dummyVideoPath,
      title: 'Awesome Reel',
      caption: 'Testing Reels API',
      hashtags: '#reels #ai',
      applyBranding: false,
    },
    (pct, stage) => progressUpdates.push({ pct, stage })
  );

  assert.equal(result.success, true);
  assert.equal(result.remotePostId, '999111222333');
  assert.equal(result.remotePostUrl, 'https://www.facebook.com/reel/999111222333');
  assert.equal(result.verificationStatus, 'confirmed');

  // Verify phase progression
  assert.ok(calls.some(c => c.url.includes('/video_reels') && c.method === 'POST'), 'Phase 1 & 3 called');
  assert.ok(calls.some(c => c.url.includes('rupload.facebook.com') && c.method === 'POST'), 'Phase 2 rupload called');
  assert.ok(calls.some(c => c.url.includes('/999111222333?fields=status')), 'Phase 4 status query called');
  assert.ok(progressUpdates.some(p => p.stage === 'published' && p.pct === 100), 'Final progress is published 100%');
});

test('3. MetaFacebookConnector.publishVideo detects missing pages_manage_posts and throws clean error', async () => {
  const connector = new MetaFacebookConnector();

  globalThis.fetch = (async (url: any) => {
    if (url.toString().includes('/video_reels')) {
      return new Response(JSON.stringify({
        error: {
          message: '(#200) Subject does not have permission to post videos on this target, due to lack of pages_manage_posts permission.',
          type: 'OAuthException',
          code: 200,
          fbtrace_id: 'TestTraceId',
        },
      }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 200 });
  }) as any;

  await assert.rejects(
    async () => {
      await connector.publishVideo(
        { name: 'Test Page', external_id: 'page-12345', access_token: 'token-missing-perm' },
        {
          destinationId: 'dest-2',
          postId: 'post-2',
          accountId: 'acc-2',
          videoPath: dummyVideoPath,
          title: 'Fail Reel',
          caption: 'Caption',
          hashtags: '',
          applyBranding: false,
        }
      );
    },
    (err: Error) => {
      assert.ok(err.message.includes('pages_manage_posts'), 'Error must explicitly mention pages_manage_posts');
      assert.ok(err.message.includes('Error 200'), 'Error must preserve Meta code 200');
      return true;
    }
  );
});

test('4. Reels errors and uncertain processing never trigger a second upload or a false Published result', async () => {
  const payload = { destinationId: 'guarded', postId: 'post', accountId: 'account', videoPath: dummyVideoPath, title: 'Test', caption: 'Caption', hashtags: '', applyBranding: false };
  const originalHash = createHash('sha256').update(fs.readFileSync(dummyVideoPath)).digest('hex');
  for (const failure of ['upload', 'finish', 'status_error', 'processing', 'publishing_pending']) {
    const calls: string[] = [];
    let savedRemote = '';
    let published = false;
    globalThis.fetch = (async (url: any, options: any = {}) => {
      calls.push(String(url));
      const phase = typeof options.body === 'string' ? JSON.parse(options.body).upload_phase : '';
      if (phase === 'start') return new Response(JSON.stringify({ video_id: '12345', upload_url: 'https://rupload.facebook.com/video-upload/v25.0/12345' }));
      if (String(url).includes('rupload')) return new Response(JSON.stringify(failure === 'upload' ? {} : { success: true }), { status: failure === 'upload' ? 503 : 200 });
      if (phase === 'finish') return new Response(JSON.stringify({ success: failure !== 'finish' }));
      if (failure === 'status_error') return new Response(JSON.stringify({ error: { message: 'private-provider-message' } }), { status: 400 });
      return new Response(JSON.stringify({ status: { video_status: failure === 'processing' ? 'processing' : 'ready', publishing_phase: { status: 'in_progress' } }, permalink_url: '/reel/12345' }));
    }) as typeof fetch;
    await assert.rejects(new MetaFacebookConnector({ attempts: 2, intervalMs: 0 }).publishVideo(
      { external_id: 'page', access_token: 'secret' }, { ...payload, onRemoteCreated: id => { savedRemote = id; } },
      (_pct, stage) => { if (stage === 'published') published = true; },
    ));
    assert.equal(savedRemote, '12345');
    assert.equal(published, false);
    assert.equal(calls.some(url => url.endsWith('/videos')), false);
    assert.equal(calls.filter(url => url.includes('/video_reels')).length, failure === 'upload' ? 1 : 2);
  }
  assert.equal(createHash('sha256').update(fs.readFileSync(dummyVideoPath)).digest('hex'), originalHash);
});

test('5. Reels polls read-only status until processing and publishing complete, then uses the API permalink', async () => {
  let polls = 0;
  globalThis.fetch = (async (url: any, options: any = {}) => {
    const phase = typeof options.body === 'string' ? JSON.parse(options.body).upload_phase : '';
    if (phase === 'start') return new Response(JSON.stringify({ video_id: '56789', upload_url: 'https://rupload.facebook.com/video-upload/v25.0/56789' }));
    if (phase === 'finish' || String(url).includes('rupload')) return new Response('{"success":true}');
    polls++;
    assert.equal(String(url).includes('access_token='), false);
    assert.equal(options.headers.Authorization, 'Bearer secret');
    return new Response(JSON.stringify({ status: { video_status: polls === 1 ? 'processing' : 'ready', publishing_phase: { status: polls === 1 ? 'in_progress' : 'complete' } }, permalink_url: '/reel/56789' }));
  }) as typeof fetch;
  const result = await new MetaFacebookConnector({ attempts: 3, intervalMs: 0 }).publishVideo({ external_id: 'page', access_token: 'secret' }, { destinationId: 'polling', postId: 'post', accountId: 'account', videoPath: dummyVideoPath, title: 'Test', caption: 'Caption', hashtags: '', applyBranding: false });
  assert.equal(polls, 2);
  assert.equal(result.verificationStatus, 'confirmed');
  assert.equal(result.remotePostUrl, 'https://www.facebook.com/reel/56789');
});
