import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MetaFacebookConnector } from '../server/src/connectors/meta-facebook.js';
import type { PagePostPayload } from '../server/src/connectors/types.js';

const originalFetch = globalThis.fetch;
const originalVersion = process.env.META_GRAPH_VERSION;
process.env.META_GRAPH_VERSION = 'v26.0';
const fixtureDir = mkdtempSync(join(tmpdir(), 'scc-meta-general-'));
const imagePath = join(fixtureDir, 'test.png');
writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64'));
const account = { external_id: '1234', account_type: 'page', access_token: 'fixture-token-do-not-reflect' };
const connector = () => new MetaFacebookConnector({ attempts: 1, intervalMs: 0 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const confirmed = () => json({ id: '1234_5678', from: { id: '1234' }, is_published: true, permalink_url: 'https://www.facebook.com/1234/posts/5678' });
function payload(changes: Partial<PagePostPayload> = {}, audit: string[] = []): PagePostPayload {
  return {
    destinationId: 'dest-fixture', postId: 'post-fixture', accountId: 'account-fixture', contentType: 'text',
    caption: 'สวัสดีชาวโลก 🌿', hashtags: '#ทดสอบ', attachments: [],
    onSubmissionStarted: (stage, id) => { audit.push(`intent:${stage}:${id || ''}`); },
    onAttachmentUploaded: (id, remoteId) => { audit.push(`photo:${id}:${remoteId}`); },
    onRemoteCreated: id => { audit.push(`post:${id}`); },
    ...changes,
  };
}
after(() => { globalThis.fetch = originalFetch; if (originalVersion === undefined) delete process.env.META_GRAPH_VERSION; else process.env.META_GRAPH_VERSION = originalVersion; rmSync(fixtureDir, { recursive: true, force: true }); });

test('Page text publishes without video through feed and confirms exact Page/permalink', async () => {
  const audit: string[] = [];
  const requests: string[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push(String(url));
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${account.access_token}`);
    if (init?.method === 'POST') {
      assert.equal(audit.at(-1), 'intent:feed_publish:');
      assert.deepEqual(JSON.parse(String(init.body)), { message: 'สวัสดีชาวโลก 🌿\n#ทดสอบ', published: true });
      assert.ok(String(url).endsWith('/v26.0/1234/feed'));
      return json({ id: '1234_5678' });
    }
    assert.equal(audit.at(-1), 'post:1234_5678');
    return confirmed();
  };
  const result = await connector().publishPost(account, payload({}, audit));
  assert.equal(result.verificationStatus, 'confirmed');
  assert.equal(result.remotePostUrl, 'https://www.facebook.com/1234/posts/5678');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(url => !url.includes('/video_reels') && !url.includes(account.access_token)));
});

test('link post sends link as feed data and never fetches that link', async () => {
  const requests: string[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push(String(url));
    if (init?.method === 'POST') { assert.equal(JSON.parse(String(init.body)).link, 'https://example.org/เรื่องราว'); return json({ id: '1234_5678' }); }
    return confirmed();
  };
  await connector().publishPost(account, payload({ contentType: 'link', linkUrl: 'https://example.org/เรื่องราว' }));
  assert.ok(requests.every(url => new URL(url).hostname === 'graph.facebook.com'));
});

test('single image uploads local bytes unpublished with optional alt text then verifies feed', async () => {
  const audit: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/photos')) {
      assert.equal(audit.at(-1), 'intent:photo_upload:image-one');
      const body = init?.body as FormData;
      assert.equal(body.get('published'), 'false');
      assert.equal(body.get('alt_text_custom'), 'ภาพทดสอบ');
      assert.ok(body.get('source') instanceof Blob);
      return json({ id: '901' });
    }
    if (init?.method === 'POST') {
      assert.ok(audit.includes('photo:image-one:901'));
      assert.deepEqual(JSON.parse(String(init.body)).attached_media, [{ media_fbid: '901' }]);
      return json({ id: '1234_5678' });
    }
    return confirmed();
  };
  await connector().publishPost(account, payload({ contentType: 'image', attachments: [{ id: 'image-one', path: imagePath, mimeType: 'image/png', altText: 'ภาพทดสอบ' }] }, audit));
});

test('ordered multi-image upload persists each ID before next upload or feed operation', async () => {
  const audit: string[] = [];
  let photos = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/photos')) {
      photos++;
      if (photos === 2) assert.ok(audit.includes('photo:second-in-library:901'));
      return json({ id: String(900 + photos) });
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body.attached_media, [{ media_fbid: '901' }, { media_fbid: '902' }]);
      assert.equal(body.multi_share_optimized, false);
      assert.ok(audit.includes('photo:first-in-library:902'));
      return json({ id: '1234_5678' });
    }
    return confirmed();
  };
  await connector().publishPost(account, payload({ contentType: 'multi_image', attachments: ['second-in-library', 'first-in-library'].map(id => ({ id, path: imagePath, mimeType: 'image/png' })) }, audit));
  assert.equal(photos, 2);
});

test('persisted photo IDs are reused after exact Page ownership verification', async () => {
  let uploads = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/901?')) return json({ id: '901', from: { id: '1234' } });
    if (String(url).endsWith('/photos')) { uploads++; return json({ id: 'unexpected' }); }
    if (init?.method === 'POST') return json({ id: '1234_5678' });
    return confirmed();
  };
  await connector().publishPost(account, payload({ contentType: 'image', attachments: [{ id: 'saved', path: '', mimeType: 'image/png', remoteId: '901' }] }));
  assert.equal(uploads, 0);
});

test('existing remote post reconciles with GET only even after a prior uncertain response', async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => { calls++; assert.equal(init?.method, 'GET'); return confirmed(); };
  const result = await connector().publishPost(account, payload({ remotePostId: '1234_5678' }));
  assert.equal(calls, 1);
  assert.equal(result.success, true);
});

test('unconfirmed feed outcomes have one mutation, saved intent and no fallback replay', async () => {
  const audit: string[] = [];
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error(`network response contains ${account.access_token}`); };
  await assert.rejects(connector().publishPost(account, payload({}, audit)), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /reconcile/);
    assert.ok(!error.message.includes(account.access_token));
    return true;
  });
  assert.equal(calls, 1);
  assert.deepEqual(audit, ['intent:feed_publish:']);
});

test('unconfirmed photo upload leaves attachment intent and never creates a feed post', async () => {
  const audit: string[] = [];
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}, 200); };
  await assert.rejects(connector().publishPost(account, payload({ contentType: 'image', attachments: [{ id: 'photo', path: imagePath, mimeType: 'image/png' }] }, audit)), /no valid ID/);
  assert.equal(calls, 1);
  assert.deepEqual(audit, ['intent:photo_upload:photo']);
});

test('upload response alone never marks Published', async () => {
  globalThis.fetch = async (_url, init) => init?.method === 'POST' ? json({ id: '1234_5678' }) : json({ id: '1234_5678', from: { id: '1234' }, is_published: false, permalink_url: 'https://www.facebook.com/1234/posts/5678' });
  await assert.rejects(connector().publishPost(account, payload()), /unconfirmed/);
});

test('identity mismatch and unsafe permalinks fail closed during reconciliation', async () => {
  globalThis.fetch = async () => json({ id: '1234_5678', from: { id: '9999' }, is_published: true, permalink_url: 'https://www.facebook.com/1234/posts/5678' });
  await assert.rejects(connector().publishPost(account, payload({ remotePostId: '1234_5678' })), /identity is unverified/);
  globalThis.fetch = async () => json({ id: '1234_5678', from: { id: '1234' }, is_published: true, permalink_url: 'https://facebook.com.evil.invalid/post' });
  await assert.rejects(connector().publishPost(account, payload({ remotePostId: '1234_5678' })), /unexpected post permalink/);
});

test('invalid media/type/Page input fails before any remote action', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No remote action allowed'); };
  await assert.rejects(connector().publishPost({ ...account, account_type: 'group' }, payload()), /Page identity/);
  await assert.rejects(connector().publishPost(account, payload({ contentType: 'text', caption: '', hashtags: '' })), /requires text/);
  await assert.rejects(connector().publishPost(account, payload({ contentType: 'link', linkUrl: 'javascript:alert(1)' })), /HTTP\(S\)/);
  await assert.rejects(connector().publishPost(account, payload({ contentType: 'multi_image', attachments: [{ id: 'one', path: imagePath, mimeType: 'image/png' }, { id: 'two', path: 'missing', mimeType: 'image/png' }] })), /unavailable/);
  assert.equal(calls, 0);
});

test('failed durable tracking aborts before remote mutation', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No remote action allowed'); };
  await assert.rejects(connector().publishPost(account, payload({ onSubmissionStarted: () => { throw new Error('Database transaction rejected'); } })), /transaction rejected/);
  assert.equal(calls, 0);
});
