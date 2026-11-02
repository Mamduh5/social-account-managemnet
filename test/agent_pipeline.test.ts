import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, JsonClient } from '../scripts/agent/http.js';
import { PipelineAdapter, geminiQueueRequest } from '../scripts/agent/pipeline.js';

const input = { title: 'Rain robot', idea: 'A small robot repairs a leaking roof.', sceneCount: 2, aspectRatio: '9:16' };
const project = {
  id: 'gemini-fixture', title: input.title, topic: input.idea, status: 'running', provider: 'gemini_web',
  autopilot: { provider: 'gemini_web', review_status: 'not_reviewed' }, scene_count: 2, accepted_count: 1,
  scene_seconds: 10, aspect_ratio: '9:16', generation_settings: geminiQueueRequest(input).generation_settings,
  next_action: { type: 'autopilot', background: true },
};
function fixture(handler: (url: URL, init?: RequestInit) => unknown | Promise<unknown>) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const client = new JsonClient('http://127.0.0.1:18080', { fetch: (async (url, init) => {
    const parsed = new URL(String(url)); calls.push({ url: parsed, init });
    const result = await handler(parsed, init);
    return result instanceof Response ? result : new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch });
  return { adapter: new PipelineAdapter(client), calls };
}

test('Gemini create submits one existing queue operation with native Dense snapshot and no provider switching', async () => {
  const { adapter, calls } = fixture(() => ({ job_id: 'gemini-fixture' }));
  assert.deepEqual(await adapter.create(input), { projectId: 'gemini-fixture' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/gemini-autopilot/queue');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    title: input.title, idea: input.idea, scene_count: 2, aspect_ratio: '9:16',
    generation_settings: { version: 'generation_settings.v1', mode: 'dense_performance', performance_tempo: 2 },
  });
  assert.equal(new Headers(calls[0].init?.headers).has('idempotency-key'), false, 'text creation must not imply upstream deduplication');
});

test('Gemini prompt uses the same creation boundary and invalid/provider fields fail before HTTP', async () => {
  assert.deepEqual(geminiQueueRequest({ title: ' A title ', prompt: ' Story ' }), {
    title: 'A title', idea: 'Story', scene_count: 2, aspect_ratio: '9:16',
    generation_settings: { version: 'generation_settings.v1', mode: 'dense_performance', performance_tempo: 2 },
  });
  const { adapter, calls } = fixture(() => { throw new Error('HTTP should not run'); });
  for (const invalid of [
    { ...input, prompt: 'ambiguous' }, { ...input, idea: '' }, { ...input, idea: 'ก'.repeat(4001) },
    { ...input, sceneCount: 0 }, { ...input, sceneCount: 1.5 }, { ...input, sceneCount: 21 },
    { ...input, aspectRatio: '1:1' }, { ...input, provider: 'flow_web' },
    { ...input, gemini_workflow: 'review_first_v1' }, { ...input, title: '' },
  ]) await assert.rejects(adapter.create(invalid));
  assert.equal(calls.length, 0);
});

test('uncertain create and malformed successful result are never automatically retried', async () => {
  const transport = fixture(() => { throw new Error('secret network details'); });
  await assert.rejects(transport.adapter.create(input), (error: unknown) => error instanceof ApiError && error.uncertain && error.message === 'transport_failed');
  assert.equal(transport.calls.length, 1);
  const malformed = fixture(() => ({ job_id: '../wrong' }));
  await assert.rejects(malformed.adapter.create(input), (error: unknown) => error instanceof ApiError && error.uncertain && error.code === 'invalid_pipeline_create_response');
  assert.equal(malformed.calls.length, 1);
});

test('status projects bounded progress, blockers and unavailable media without raw provider histories', async () => {
  const { adapter, calls } = fixture(() => ({ ...project, diagnostic: { code: 'planner_timeout', message: 'Planning timed out.' }, blockers: [{ code: 'quota_wait', message: 'Waiting for the provider.', next_retry_at: '2026-11-03T01:00:00Z' }, { code: 'quota_wait' }], next_automatic_at: '2026-11-03T01:00:00Z', raw_secret: 'do not expose', scene_clip_object_keys: ['private-file'] }));
  const result = await adapter.status('gemini-fixture');
  assert.equal(result.state, 'running');
  assert.deepEqual(result.progress, { accepted: 1, total: 2 });
  assert.deepEqual(result.blockers.map(item => item.code), ['quota_wait', 'planner_timeout']);
  assert.equal(result.media.videoUrl, null);
  assert.equal(result.media.durationSeconds, null);
  assert.equal(result.media.creativeReview, 'not_reviewed');
  assert.equal(result.background, true);
  assert.equal(JSON.stringify(result).includes('private-file'), false);
  assert.equal(JSON.stringify(result).includes('do not expose'), false);
  assert.equal(calls[0].init?.method, 'GET');
  assert.equal(calls[0].url.pathname, '/scene-video-jobs/gemini-fixture');
});

test('completed status keeps original artifact identity and rejects cross-origin/cross-project media', async () => {
  const good = fixture(() => ({ ...project, status: 'completed', accepted_count: 2, duration_seconds: 20, video_url: '/scene-video-jobs/gemini-fixture/artifacts/video', acceptance_type: 'autopilot' }));
  const result = await good.adapter.status('gemini-fixture');
  assert.equal(result.media.videoUrl, 'http://127.0.0.1:18080/scene-video-jobs/gemini-fixture/artifacts/video');
  assert.equal(result.media.durationSeconds, 20);
  for (const url of ['https://external.test/file.mp4', '/scene-video-jobs/another/artifacts/video', '/scene-video-jobs/gemini-fixture/artifacts/video?token=secret']) {
    const other = fixture(() => ({ ...project, status: 'completed', video_url: url }));
    assert.equal((await other.adapter.status('gemini-fixture')).media.videoUrl, null);
  }
});

test('recovery checks exact Gemini ID, full idea and immutable Dense snapshot using only reads', async () => {
  const good = fixture(() => project);
  assert.equal((await good.adapter.reconcile('gemini-fixture', input)).projectId, 'gemini-fixture');
  assert.equal(good.calls.every(call => call.init?.method === 'GET'), true);
  for (const changed of [
    { ...project, id: 'another' }, { ...project, autopilot: { provider: 'flow_web' } },
    { ...project, provider: 'flow_web' }, { ...project, topic: 'another story' },
    { ...project, scene_count: 3 }, { ...project, scene_seconds: 8 }, { ...project, aspect_ratio: '16:9' },
    { ...project, generation_settings: { version: 'generation_settings.v1', mode: 'standard', performance_tempo: 1 } },
  ]) {
    const invalid = fixture(() => changed);
    await assert.rejects(invalid.adapter.reconcile('gemini-fixture', input));
    assert.equal(invalid.calls.length, 1);
  }
  await assert.rejects(good.adapter.status('../settings'));
  assert.equal(good.calls.length, 1, 'invalid project IDs fail before HTTP');
});

test('failed and incomplete status remains explicit and never fabricates a completed artifact', async () => {
  for (const status of ['failed', 'awaiting_external_generation', 'conformance_attention_required']) {
    const { adapter, calls } = fixture(() => ({ ...project, status, video_url: '/scene-video-jobs/gemini-fixture/artifacts/video' }));
    const result = await adapter.status('gemini-fixture');
    assert.equal(result.state, status);
    assert.equal(result.media.videoUrl, null);
    assert.equal(calls.length, 1);
  }
});
