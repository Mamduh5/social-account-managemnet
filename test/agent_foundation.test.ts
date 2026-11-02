import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AgentStore, stableHash } from '../scripts/agent/store.js';
import { ApiError, JsonClient } from '../scripts/agent/http.js';

function isolated(run: (filename: string) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scc-agent-foundation-'));
  try { run(path.join(dir, 'agent.db')); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('stable JSON hashes ignore object key order and distinguish changed intent', () => {
  assert.equal(stableHash({ b: 2, a: [1, { z: null }] }), stableHash({ a: [1, { z: null }], b: 2 }));
  assert.notEqual(stableHash({ schedule: '2026-11-03' }), stableHash({ schedule: '2026-11-04' }));
  assert.equal(stableHash({ input: undefined, id: 'a' }), stableHash({ id: 'a' }));
  assert.throws(() => stableHash([undefined]), /JSON/);
});

test('sidecar jobs survive restart and stable IDs reject different input', () => isolated(filename => {
  let store = new AgentStore(filename);
  store.createJob('workflow-a', { idea: 'test' });
  store.updateState('workflow-a', { pipelineId: 'project-a' });
  store.close();
  store = new AgentStore(filename);
  try {
    assert.deepEqual(store.createJob('workflow-a', { idea: 'test' }).state, { pipelineId: 'project-a' });
    assert.throws(() => store.createJob('workflow-a', { idea: 'different' }), /different input/);
    assert.equal(store.listJobs().length, 1);
  } finally { store.close(); }
}));

test('concurrent sidecar connections cannot both claim an operation', () => isolated(filename => {
  const first = new AgentStore(filename);
  first.createJob('job', {});
  const second = new AgentStore(filename);
  try {
    assert.equal(first.claimOperation('job', 'generate', { prompt: 'scene' }).claimed, true);
    const duplicate = second.claimOperation('job', 'generate', { prompt: 'scene' });
    assert.equal(duplicate.claimed, false);
    assert.equal(duplicate.operation.status, 'pending');
    assert.throws(() => second.claimOperation('job', 'generate', { prompt: 'changed' }), /different request/);
    first.patchState('job', { pipelineId: 'pipeline' });
    second.patchState('job', { draftId: 'draft' });
    assert.deepEqual(first.getJob('job')!.state, { pipelineId: 'pipeline', draftId: 'draft' });
  } finally { first.close(); second.close(); }
}));

test('interrupted and uncertain writes remain held after restart; successful receipts are immutable', () => isolated(filename => {
  let store = new AgentStore(filename);
  store.createJob('job', {});
  const originalRequest = { prompt: 'original scene', destinations: ['page-a'], revision: 1 };
  store.claimOperation('job', 'generate', originalRequest);
  store.finishOperation('job', 'generate', 'uncertain', { code: 'request_timeout' });
  store.close();
  store = new AgentStore(filename);
  try {
    assert.equal(store.claimOperation('job', 'generate', originalRequest).claimed, false);
    assert.equal(store.getOperation('job', 'generate')!.status, 'uncertain');
    assert.deepEqual(store.getOperation('job', 'generate')!.request, originalRequest);
    assert.throws(() => store.claimOperation('job', 'generate', { ...originalRequest, revision: 2 }), /different request/);
    // Read-only reconciliation can record an exact recovered resource; no replay occurs here.
    store.finishOperation('job', 'generate', 'succeeded', { projectId: 'existing-project' });
    assert.equal(store.claimOperation('job', 'generate', originalRequest).operation.status, 'succeeded');
    assert.deepEqual(store.getOperation('job', 'generate')!.request, originalRequest);
    assert.throws(() => store.finishOperation('job', 'generate', 'succeeded', { projectId: 'replacement' }), /immutable/);
  } finally { store.close(); }
}));

test('older marked sidecars add request storage without guessing historical requests or replaying', () => isolated(filename => {
  const previous = new Database(filename);
  previous.exec(`
    PRAGMA application_id = ${0x53434147};
    CREATE TABLE jobs (id TEXT PRIMARY KEY,input_hash TEXT NOT NULL,input_json TEXT NOT NULL,state_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE operations (job_id TEXT NOT NULL REFERENCES jobs(id),step TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL,response_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(job_id,step));
  `);
  const now = new Date().toISOString();
  previous.prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?)').run('old-job', stableHash({}), '{}', '{}', now, now);
  previous.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?,?)').run('old-job', 'draft', stableHash({ draft: 'old' }), 'uncertain', null, now, now);
  previous.close();
  const store = new AgentStore(filename);
  try {
    const receipt = store.claimOperation('old-job', 'draft', { draft: 'old' });
    assert.equal(receipt.claimed, false);
    assert.equal(receipt.operation.status, 'uncertain');
    assert.equal(receipt.operation.request, null);
    const newer = store.claimOperation('old-job', 'new-step', { draft: 'known' });
    assert.deepEqual(newer.operation.request, { draft: 'known' });
  } finally { store.close(); }
}));

test('sidecar refuses an existing application database without changing it', () => isolated(filename => {
  const owner = new Database(filename);
  owner.exec('CREATE TABLE owner_data(value TEXT); INSERT INTO owner_data VALUES (\'preserve\')');
  owner.close();
  assert.throws(() => new AgentStore(filename), /not an agent sidecar/);
  const verify = new Database(filename, { readonly: true });
  try {
    assert.equal(verify.pragma('application_id', { simple: true }), 0);
    assert.deepEqual(verify.prepare('SELECT * FROM owner_data').all(), [{ value: 'preserve' }]);
    assert.equal((verify.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as unknown[]).length, 1);
  } finally { verify.close(); }
}));

test('knowledge keeps observations and assumptions distinct, with scope and idempotent IDs', () => isolated(filename => {
  const store = new AgentStore(filename);
  try {
    assert.throws(() => store.recordKnowledge({ kind: 'observation', text: 'Missing views are zero' }), /source/);
    store.recordKnowledge({ id: 'observed', kind: 'observation', accountId: 'page-a', resourceId: 'post-a', text: 'Views unavailable', source: 'scc_analytics', evidence: { views: null, status: 'unavailable' } });
    store.recordKnowledge({ id: 'hypothesis', kind: 'assumption', accountId: 'page-a', text: 'Try a shorter opening' });
    store.recordKnowledge({ id: 'observed', kind: 'observation', accountId: 'page-a', resourceId: 'post-a', text: 'Views unavailable', source: 'scc_analytics', evidence: { status: 'unavailable', views: null } });
    assert.equal(store.listKnowledge({ accountId: 'page-a' }).length, 2);
    assert.equal(store.listKnowledge({ resourceId: 'post-a' })[0].kind, 'observation');
    assert.equal(store.listKnowledge({ accountId: 'page-b' }).length, 0);
    assert.throws(() => store.recordKnowledge({ id: 'observed', kind: 'assumption', text: 'Replacement' }), /different entry/);
  } finally { store.close(); }
}));

test('HTTP origins and resources stay on loopback without credentials or redirects', async () => {
  for (const origin of ['https://example.com', 'http://127.0.0.1/path', 'http://user:secret@localhost', 'file:///tmp/state', 'http://localhost?token=secret']) {
    assert.throws(() => new JsonClient(origin), /loopback/);
  }
  const seen: { url: string; options: RequestInit }[] = [];
  const client = new JsonClient('http://127.0.0.1:3199', { fetch: async (url, options) => {
    seen.push({ url: String(url), options: options! });
    return new Response(JSON.stringify({ id: 'result' }), { status: 200 });
  } });
  assert.deepEqual(await client.post('/api/drafts', { caption: 'idea' }, { idempotencyKey: 'job-1:draft' }), { id: 'result' });
  assert.equal(seen[0].options.redirect, 'error');
  assert.equal((seen[0].options.headers as Record<string, string>)['idempotency-key'], 'job-1:draft');
  await assert.rejects(client.get('//example.com/api'), /API path/);
  await assert.rejects(client.get('/\\example.com'), /API path/);
  assert.equal(seen.length, 1);
});

test('HTTP transport failures are uncertain for POST and are never retried or echoed', async () => {
  let requests = 0;
  const client = new JsonClient('http://localhost:3199', { fetch: async () => { requests++; throw new Error('provider token=secret'); } });
  await assert.rejects(client.post('/generate', {}), error => error instanceof ApiError && error.status === null && error.code === 'transport_failed' && error.uncertain && !error.message.includes('secret'));
  assert.equal(requests, 1);
  await assert.rejects(client.get('/status'), error => error instanceof ApiError && !error.uncertain);
});

test('HTTP failed writes distinguish server uncertainty from rejected input', async () => {
  const client = (status: number) => new JsonClient('http://localhost:3199', { fetch: async () => new Response('token=secret', { status }) });
  await assert.rejects(client(503).post('/queue', {}), error => error instanceof ApiError && error.status === 503 && error.uncertain && error.message === 'http_503');
  await assert.rejects(client(400).post('/queue', {}), error => error instanceof ApiError && error.status === 400 && !error.uncertain);
  const malformed = new JsonClient('http://localhost:3199', { fetch: async () => new Response('not json', { status: 200 }) });
  await assert.rejects(malformed.post('/queue', {}), error => error instanceof ApiError && error.uncertain && error.code === 'invalid_json_response');
});

test('HTTP timeout aborts one request and preserves submission uncertainty', async () => {
  let requests = 0;
  const client = new JsonClient('http://localhost:3199', { timeoutMs: 5, fetch: async (_url, options) => {
    requests++;
    return await new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  await assert.rejects(client.post('/generate', {}), error => error instanceof ApiError && error.uncertain && error.code === 'request_timeout');
  assert.equal(requests, 1);
});
