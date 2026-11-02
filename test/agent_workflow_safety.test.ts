import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AgentStore } from '../scripts/agent/store.js';
import { ApiError } from '../scripts/agent/http.js';
import { AgentWorkflow, WorkflowError, type WorkflowInput } from '../scripts/agent/workflow.js';

const targets = { pipeline: 'http://127.0.0.1:18080', scc: 'http://127.0.0.1:13001' };
const generation = { title: 'Roof repair', idea: 'A robot repairs the roof.', sceneCount: 2, aspectRatio: '9:16' };
const content = { accountId: 'page-fixture', caption: 'A useful repair.', hashtags: '#robot', applyBranding: true };
const input: WorkflowInput = { title: generation.title, generation, content };
const exact = { revision: 1, accountId: content.accountId, payloadHash: 'a'.repeat(64) };

function setup(t: { after: (action: () => void) => void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'scc-agent-safety-'));
  const store = new AgentStore(path.join(dir, 'agent.db'));
  const calls = { create: 0, reconcile: 0, status: 0, source: 0, import: 0, prepare: 0, review: 0, approve: 0, queue: 0, reconcileDraft: 0 };
  const controls: { create?: () => Promise<unknown>; prepare?: (value: any) => Promise<unknown>; source?: string; preparedInput?: any; reconciledInput?: any } = {};
  let draft: any = { id: 'draft-fixture', revision: 1, accountId: content.accountId, payloadHash: exact.payloadHash, status: 'draft', approvedRevision: null, queuedPostId: null };
  const pipeline = {
    async create() { calls.create++; return controls.create ? controls.create() : { projectId: 'project-fixture' }; },
    async reconcile() { calls.reconcile++; return { projectId: 'project-fixture', state: 'completed' }; },
    async status() { calls.status++; return { projectId: 'project-fixture', state: 'completed', media: { videoUrl: targets.pipeline + '/scene-video-jobs/project-fixture/artifacts/video' } }; },
  };
  const scc = {
    async pipelineOrigin() { calls.source++; return controls.source ?? targets.pipeline; },
    async importVideo() { calls.import++; return { videoId: 'video-fixture', alreadyExisted: false }; },
    async prepare(value: unknown) { calls.prepare++; controls.preparedInput = value; return controls.prepare ? controls.prepare(value) : { draft: { ...draft } }; },
    async review() { calls.review++; return { draft: { ...draft } }; },
    async approve() { calls.approve++; draft = { ...draft, status: 'approved', approvedRevision: 1 }; return { draft: { ...draft } }; },
    async queue() { calls.queue++; draft = { ...draft, status: 'queued', queuedPostId: 'post-fixture' }; return { postId: 'post-fixture', draft: { ...draft } }; },
    async reconcileDraft(id: string, expected: unknown) { calls.reconcileDraft++; controls.reconciledInput = expected; return { draft: { ...draft, id } }; },
  };
  const workflow = new AgentWorkflow(store, pipeline as any, scc as any, targets);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, workflow, pipeline, scc, calls, controls, dir };
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof WorkflowError && error.code === code;
}

test('a concurrent pending Gemini start is fenced and cannot submit twice', async t => {
  const { workflow, controls, calls } = setup(t);
  let complete!: (value: unknown) => void;
  controls.create = () => new Promise(resolve => { complete = resolve; });
  const first = workflow.start('pending-run', input, true);
  await assert.rejects(workflow.start('pending-run', input, true), hasCode('reconciliation_required'));
  assert.equal(calls.create, 1);
  complete({ projectId: 'project-fixture' });
  assert.equal((await first).projectId, 'project-fixture');
  assert.equal((await workflow.start('pending-run', input, true)).projectId, 'project-fixture');
  assert.equal(calls.create, 1);
});

test('an uncertain Gemini response survives resume and requires exact read-only attachment', async t => {
  const { workflow, calls, controls } = setup(t);
  controls.create = async () => { throw new ApiError(null, 'request_timeout', true); };
  await assert.rejects(workflow.start('uncertain-run', input, true), ApiError);
  await assert.rejects(workflow.start('uncertain-run', input, true), hasCode('reconciliation_required'));
  assert.equal(calls.create, 1);
  assert.equal(workflow.summary('uncertain-run').next, 'reconcile');
  const resumed = await workflow.reconcile('uncertain-run', { projectId: 'project-fixture' });
  assert.equal(resumed.projectId, 'project-fixture');
  assert.equal(calls.reconcile, 1);
  await workflow.start('uncertain-run', input, true);
  assert.equal(calls.create, 1);
});

test('target pinning rejects a resumed run aimed at different applications before any request', async t => {
  const { store, workflow, pipeline, scc, calls } = setup(t);
  await workflow.start('pinned-run', { title: input.title, projectId: 'project-fixture' });
  const different = new AgentWorkflow(store, pipeline as any, scc as any, { ...targets, pipeline: 'http://127.0.0.1:28080' });
  assert.throws(() => different.summary('pinned-run'), hasCode('target_changed'));
  await assert.rejects(different.status('pinned-run'), hasCode('target_changed'));
  await assert.rejects(different.advance('pinned-run', content), hasCode('target_changed'));
  assert.equal(calls.status, 0);
  assert.equal(calls.import, 0);
  assert.equal(calls.prepare, 0);
});

test('successful receipts recover all IDs after cached state loss and replays never regress queued work', async t => {
  const { workflow, store, calls } = setup(t);
  await workflow.start('receipt-run', input, true);
  await workflow.advance('receipt-run');
  await workflow.approve('receipt-run', exact, true);
  await workflow.schedule('receipt-run', exact, true);
  store.updateState('receipt-run', {}); // A process can end between durable receipt and state update.
  const recovered = workflow.summary('receipt-run');
  assert.equal(recovered.phase, 'queued');
  assert.equal(recovered.projectId, 'project-fixture');
  assert.equal(recovered.videoId, 'video-fixture');
  assert.equal(recovered.draftId, 'draft-fixture');
  assert.equal(recovered.postId, 'post-fixture');
  assert.equal((await workflow.start('receipt-run', input, true)).phase, 'queued');
  assert.equal((await workflow.advance('receipt-run')).phase, 'queued');
  await workflow.approve('receipt-run', exact, true);
  await workflow.schedule('receipt-run', exact, true);
  assert.equal(workflow.summary('receipt-run').phase, 'queued');
  assert.deepEqual({ create: calls.create, import: calls.import, prepare: calls.prepare, approve: calls.approve, queue: calls.queue }, { create: 1, import: 1, prepare: 1, approve: 1, queue: 1 });
});

test('held original draft payload cannot be replaced by changed advance content', async t => {
  const { workflow, controls, store, calls } = setup(t);
  controls.prepare = async () => { throw new ApiError(null, 'request_timeout', true); };
  await workflow.start('held-run', input, true);
  await assert.rejects(workflow.advance('held-run'), ApiError);
  const original = structuredClone(controls.preparedInput);
  const held = store.getOperation('held-run', 'prepare');
  await assert.rejects(workflow.advance('held-run', { ...content, caption: 'An unrelated replacement caption.' }));
  assert.equal(calls.prepare, 1);
  assert.equal(store.getOperation('held-run', 'prepare')?.requestHash, held?.requestHash);
  await workflow.reconcile('held-run', { draftId: 'original-draft-fixture' });
  assert.deepEqual(controls.reconciledInput, original);
  assert.equal(calls.prepare, 1);
  assert.equal(workflow.summary('held-run').draftId, 'original-draft-fixture');
});

test('a crash after approval or queue completion recovers by exact readback without another mutation', async t => {
  const {workflow,store,scc,calls} = setup(t);
  await workflow.start('receipt-crash',input,true);
  await workflow.advance('receipt-crash');
  const draftId = workflow.summary('receipt-crash').draftId;
  // The application committed, then the caller ended before saving its receipt.
  store.claimOperation('receipt-crash','approve',{draftId,...exact});
  await scc.approve();
  await workflow.approve('receipt-crash',exact,true);
  assert.equal(calls.approve,1);
  assert.equal(store.getOperation('receipt-crash','approve')?.status,'succeeded');
  store.claimOperation('receipt-crash','queue',{draftId,...exact});
  await scc.queue();
  await workflow.schedule('receipt-crash',exact,true);
  assert.equal(calls.queue,1);
  assert.equal(workflow.summary('receipt-crash').postId,'post-fixture');
});

test('a prepared run can resume from receipts while Pipeline is offline without another status request', async t => {
  const {workflow,pipeline,calls} = setup(t);
  await workflow.start('offline-resume',input,true);
  await workflow.advance('offline-resume');
  const reads = calls.status;
  pipeline.status = async () => { throw new Error('Pipeline is offline after preparation'); };
  const resumed = await workflow.advance('offline-resume');
  assert.equal(resumed.draftId,'draft-fixture');
  assert.equal(resumed.cached,true);
  assert.equal(calls.status,reads);
  assert.equal(calls.prepare,1);
  await assert.rejects(workflow.advance('offline-resume',{...content,caption:'Changed content'}),hasCode('request_changed'));
});

test('unknown workflow and content fields reject before generation or import', async t => {
  const { workflow, calls, store } = setup(t);
  await assert.rejects(workflow.start('unknown-start', { ...input, autoPublish: true } as any, true), hasCode('invalid_input'));
  await assert.rejects(workflow.start('unknown-generation', { ...input, generation: { ...generation, provider: 'flow_web' } } as any, true));
  await assert.rejects(workflow.start('unknown-content', { ...input, content: { ...content, bypassApproval: true } } as any, true), hasCode('invalid_content'));
  assert.equal(store.listJobs().length, 0);
  assert.equal(calls.create, 0);
  await workflow.start('known-run', { title: input.title, projectId: 'project-fixture' });
  await assert.rejects(workflow.advance('known-run', { ...content, autoQueue: true } as any), hasCode('invalid_content'));
  assert.equal(calls.import, 0);
  assert.equal(calls.prepare, 0);
});

test('generation and each publication step require the exact boolean authorization', async t => {
  const { workflow, calls } = setup(t);
  for (const flag of [false, undefined, 'false', 1]) {
    await assert.rejects(workflow.start('flag-run', input, flag as any), hasCode('generation_authorization_required'));
  }
  assert.equal(calls.create, 0);
  await workflow.start('flag-run', input, true);
  await workflow.advance('flag-run');
  for (const flag of [false, undefined, 'false', 1]) await assert.rejects(workflow.approve('flag-run', exact, flag as any), hasCode('owner_authorization_required'));
  assert.equal(calls.approve, 0);
  await workflow.approve('flag-run', exact, true);
  for (const flag of [false, undefined, 'false', 1]) await assert.rejects(workflow.schedule('flag-run', exact, flag as any), hasCode('owner_authorization_required'));
  assert.equal(calls.queue, 0);
  await workflow.schedule('flag-run', exact, true);
  assert.equal(calls.queue, 1);
});

test('unknown authorization and reconciliation fields cannot be silently ignored', async t => {
  const { workflow, calls, controls } = setup(t);
  await workflow.start('exact-run', input, true);
  await workflow.advance('exact-run');
  await assert.rejects(workflow.approve('exact-run', { ...exact, bypassApproval: true } as any, true));
  assert.equal(calls.approve, 0);
  await workflow.approve('exact-run', exact, true);
  await assert.rejects(workflow.schedule('exact-run', { ...exact, publishNow: true } as any, true));
  assert.equal(calls.queue, 0);
  controls.create = async () => { throw new ApiError(null, 'request_timeout', true); };
  await assert.rejects(workflow.start('reconcile-fields', input, true));
  await assert.rejects(workflow.reconcile('reconcile-fields', { projectId: 'project-fixture', provider: 'flow_web' } as any));
  assert.equal(calls.reconcile, 0);
});

test('SCC source mismatch prevents import and draft writes', async t => {
  const { workflow, calls, controls } = setup(t);
  controls.source = 'http://127.0.0.1:38080';
  await workflow.start('source-run', input, true);
  await assert.rejects(workflow.advance('source-run'), hasCode('pipeline_source_mismatch'));
  assert.equal(calls.import, 0);
  assert.equal(calls.prepare, 0);
});

test('CLI rejects false-valued and unknown permission flags before opening a state file or network', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scc-agent-cli-safety-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = path.resolve(__dirname, '../scripts/agent.ts');
  const args = [
    ['start', '--allow-generation', 'false'],
    ['approve', '--owner-authorized', 'false'],
    ['schedule', '--owner-authorized=false'],
    ['start', '--allow-generation', '--allow-generation'],
    ['schedule', '--bypass-approval'],
  ];
  for (const invalid of args) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cli, ...invalid, '--state', path.join(dir, 'state.db')], { encoding: 'utf8', cwd: path.resolve(__dirname, '..'), timeout: 10000 });
    assert.equal(result.status, 1, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.ok, false);
    assert.equal(output.error.code, 'invalid_arguments');
  }
});
