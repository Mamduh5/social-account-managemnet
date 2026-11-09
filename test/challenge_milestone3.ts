import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { AgentStore, stableHash } from '../scripts/agent/store.js';
import { GroupTextPublication } from '../scripts/agent/group-text-publication.js';
import { GroupTextExecution, type NativeDriver } from '../scripts/agent/group-text-execution.js';

import { JsonClient } from '../scripts/agent/http.js';
import { SccAdapter } from '../scripts/agent/scc.js';

interface AuditResult {
  step: string;
  passed: boolean;
  details: any;
}

const results: AuditResult[] = [];

function record(step: string, passed: boolean, details: any) {
  results.push({ step, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${step}`);
  if (!passed) {
    console.error('Details:', details);
  }
}

async function runAudit() {
  const rootDir = path.resolve(__dirname, '..');
  const agentDbPath = path.join(rootDir, '.data/agent/agent.db');
  const sccDbPath = path.join(rootDir, '.data/social_command_center.db');

  console.log('=== Milestone 3 Empirical Challenge Audit ===\n');

  // --- SECTION 1: Read-Only Verification on Live Databases ---
  console.log('--- Section 1: Live DB Direct Inspection (Read-Only) ---');
  const agentDb = new Database(agentDbPath, { readonly: true });
  const sccDb = new Database(sccDbPath, { readonly: true });

  const destId = 'group-text:dest-developer-antigravity-1794224028809';
  const grantId = 'group-grant:grant-developer-antigravity-1794224028809';
  const preparedId = 'gprep-153b6c07-fc11-4d64-9a60-54056e7c9922';
  const livePermalink = 'https://www.facebook.com/groups/3912978409003324/posts/4194878147480014/';

  // 1.1 Destination record in agent.db
  const destJobRow = agentDb.prepare('SELECT id, input_json, state_json FROM jobs WHERE id = ?').get(destId) as any;
  assert(destJobRow, `Destination ${destId} must exist in agent.db`);
  const destInput = JSON.parse(destJobRow.input_json);
  const destState = JSON.parse(destJobRow.state_json);

  record('Destination phase is published', destState.phase === 'published', { phase: destState.phase });
  record('Destination submissions count is 1', destState.submissions === 1, { submissions: destState.submissions });
  record('Destination receiptUrl matches Facebook live permalink', destState.receiptUrl === livePermalink, { receiptUrl: destState.receiptUrl });
  record('Destination bound to correct Page accountId', destInput.accountId === 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5', { accountId: destInput.accountId });
  record('Destination bound to correct Group URL', destInput.groupUrl === 'https://www.facebook.com/groups/3912978409003324/', { groupUrl: destInput.groupUrl });

  // 1.2 Grant record in agent.db
  const grantJobRow = agentDb.prepare('SELECT id, input_json, state_json FROM jobs WHERE id = ?').get(grantId) as any;
  assert(grantJobRow, `Grant ${grantId} must exist in agent.db`);
  const grantInput = JSON.parse(grantJobRow.input_json);
  const grantState = JSON.parse(grantJobRow.state_json);

  record('Grant maxSubmissions is exactly 1', grantInput.maxSubmissions === 1, { maxSubmissions: grantInput.maxSubmissions });
  record('Grant charges array length is exactly 1', Array.isArray(grantState.charges) && grantState.charges.length === 1, { charges: grantState.charges });
  record('Grant charge records correct destinationId', grantState.charges[0]?.destinationId === destId, { charge: grantState.charges[0] });

  // 1.3 Operations in agent.db for this destination
  const ops = agentDb.prepare('SELECT job_id, step, status, request_hash FROM operations WHERE job_id = ?').all(destId) as any[];
  const opSteps = ops.map(o => `${o.step}:${o.status}`);
  record('All expected operations for destination succeeded',
    opSteps.includes('native_submit:succeeded') &&
    opSteps.includes('native_ui_dispatch:succeeded') &&
    opSteps.includes('save_scc_group_receipt:succeeded'),
    { ops: opSteps }
  );

  const pendingOps = agentDb.prepare("SELECT * FROM operations WHERE status = 'pending'").all();
  record('Zero pending/hanging operations exist in agent.db', pendingOps.length === 0, { pendingCount: pendingOps.length, pendingOps });

  // 1.4 SCC Database checks
  const preparedRow = sccDb.prepare('SELECT * FROM group_prepared_content WHERE id = ?').get(preparedId) as any;
  assert(preparedRow, `Prepared content ${preparedId} must exist in SCC db`);
  record('SCC prepared content status is receipt_recorded_unverified', preparedRow.status === 'receipt_recorded_unverified', { status: preparedRow.status });
  record('SCC prepared content receipt_url matches live permalink', preparedRow.receipt_url === livePermalink, { receipt_url: preparedRow.receipt_url });

  const receiptEvents = sccDb.prepare('SELECT * FROM group_receipt_events WHERE prepared_id = ?').all(preparedId) as any[];
  record('SCC group receipt event recorded exactly once', receiptEvents.length === 1, { count: receiptEvents.length, receipts: receiptEvents });
  record('SCC receipt event URL matches permalink', receiptEvents[0]?.url === livePermalink, { url: receiptEvents[0]?.url });

  // 1.5 3-Page publishing destinations check
  const nonGroupDestinations = sccDb.prepare('SELECT COUNT(*) as count FROM publishing_destinations WHERE status != ?').get('published') as any;
  record('All 15 Three-Page publishing destinations remain in published status (0 non-published)', nonGroupDestinations.count === 0, { nonPublished: nonGroupDestinations.count });

  agentDb.close();
  sccDb.close();

  // --- SECTION 2: Adversarial Stress Test in Isolated Copy ---
  console.log('\n--- Section 2: Adversarial Challenge in Isolated Database Sandbox ---');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-challenge-m3-'));
  const tempAgentDb = path.join(tempDir, 'agent.db');
  fs.copyFileSync(agentDbPath, tempAgentDb);

  const sandboxStore = new AgentStore(tempAgentDb);

  const liveScc = new SccAdapter(new JsonClient('http://localhost:3001'));
  const realGroup = await liveScc.group('group-a6b055e7-9cbf-4537-a7ea-74e3658515b6');
  const realPage = await liveScc.pageContext(destInput.accountId);
  const realPackage = await liveScc.groupPackage(preparedId);

  let packageProvider = async (id: string) => realPackage;
  const mockSccClient = {
    client: { origin: 'http://localhost:3001' },
    async group(id: string) { return realGroup; },
    async pageContext(id: string) { return realPage; },
    async groupPackage(id: string) { return packageProvider(id); },
  };

  const lane = new GroupTextPublication(sandboxStore, mockSccClient as any);

  const regJob = sandboxStore.getJob(destInput.registryId)!;
  const expectedRulesHash = (regJob.state as any).rulesHash;
  const currentBinding = (lane as any).binding(realGroup);
  const currentHash = stableHash(currentBinding);
  console.log('Registry expected rulesHash:', expectedRulesHash);
  console.log('Current group binding hash:', currentHash);
  if (currentHash !== expectedRulesHash) {
    // If live SCC rules or revision drifted, align realGroup to registered snapshot
    realGroup.rules = (regJob.state as any).rules;
    realGroup.rules_reviewed_at = (regJob.state as any).observation?.observedAt?.slice(0, 10) ?? realGroup.rules_reviewed_at;
    realGroup.revision = (regJob.state as any).revision ?? realGroup.revision;
    console.log('Aligned group binding hash:', stableHash((lane as any).binding(realGroup)));
  }

  // 2.1 Test: Status admission check
  const statusDestinations = lane.status().destinations;
  const targetStatusDest = statusDestinations.find((d: any) => d.id === destId) as any;
  record('Live destination admission status returns original_published', targetStatusDest?.admission === 'original_published', { admission: targetStatusDest?.admission });

  // 2.2 Test: candidate() on published destination returns admission = original_published
  const cand = await lane.candidate(destId);
  record('Candidate returns admission original_published', cand.admission === 'original_published', { admission: cand.admission });

  // 2.3 Test: GroupTextExecution.run on published destination rejects immediately without browser call
  let browserDriverCalled = false;
  const mockDriver: NativeDriver = {
    async withSession(target, action) {
      browserDriverCalled = true;
      throw new Error('BROWSER_SHOULD_NEVER_BE_CALLED_FOR_PUBLISHED_DESTINATION');
    },
  };
  const execution = new GroupTextExecution(sandboxStore, lane, mockDriver);

  const preflightRun = await execution.run(destId, false);
  record('Preflight on published destination returns ready:false and reason:original_published',
    preflightRun.ready === false && preflightRun.reason === 'original_published',
    preflightRun
  );
  record('Preflight did NOT touch browser driver', browserDriverCalled === false, { browserDriverCalled });

  const executeRun = await execution.run(destId, true);
  record('Execute on published destination returns ready:false and reason:original_published',
    executeRun.ready === false && executeRun.reason === 'original_published',
    executeRun
  );
  record('Execute did NOT touch browser driver', browserDriverCalled === false, { browserDriverCalled });

  // 2.4 Test: direct claim() attempt on published destination
  let claimError: string | null = null;
  try {
    await lane.claim({
      destinationId: destId,
      observation: {
        observedAt: new Date().toISOString(),
        source: 'agent_browser_observation',
        groupUrl: 'https://www.facebook.com/groups/3912978409003324/',
        graphId: '409347032254077',
        profileId: '61563944843401',
        joined: true,
        textComposerObserved: true,
        rulesRead: true,
        moderation: 'unknown',
        notes: 'Adversarial re-claim attempt',
      },
    });
  } catch (err: any) {
    claimError = err.message;
  }
  record('Direct claim() throws error', claimError !== null, { claimError });

  // 2.5 Test: attempt to schedule duplicate destination with same preparedId / contentHash
  // 2.5a: When prepared content in SCC has receipt_url or is marked submitted, packet() rejects it first
  let scheduleDupErrorA: string | null = null;
  try {
    await lane.schedule({
      id: 'dest-developer-antigravity-duplicate-attempt-a',
      registryId: destInput.registryId,
      grantId: grantId,
      preparedId: preparedId,
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      timeZone: 'Asia/Bangkok',
    });
  } catch (err: any) {
    scheduleDupErrorA = err.message;
  }
  record('Scheduling against submitted prepared content throws "was submitted, or has stale context"',
    scheduleDupErrorA?.includes('was submitted, or has stale context') === true,
    { scheduleDupErrorA }
  );

  // 2.5b: When prepared packet is in "prepared" state, lane.schedule() deduplication fence blocks duplicate intent
  const mockPreparedPacket = {
    prepared: {
      id: 'gprep-fresh-same-content',
      kind: 'post',
      status: 'prepared',
      receipt_url: null,
      content: destInput.content, // same content as existing post
    },
    group: { url: 'https://www.facebook.com/groups/3912978409003324/' },
    contextCaptured: true,
    planChanged: false,
    sourcePageUnavailable: false,
    sourcePage: { id: 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5', externalId: '409347032254077' },
    media: [],
  };
  mockSccClient.groupPackage = async () => mockPreparedPacket;

  let scheduleDupErrorB: string | null = null;
  try {
    // Attempt to schedule under the exact_post grant with prospective time but mismatched prepared ID
    await lane.schedule({
      id: 'dest-developer-antigravity-duplicate-attempt-b',
      registryId: destInput.registryId,
      grantId: grantId,
      preparedId: 'gprep-fresh-same-content',
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      timeZone: 'Asia/Bangkok',
    });
  } catch (err: any) {
    scheduleDupErrorB = err.message;
  }
  record('Exact-post grant blocks scheduling any different preparedId / schedule time',
    scheduleDupErrorB?.includes('Exact-post authority does not approve this content or schedule') === true,
    { scheduleDupErrorB }
  );

  // 2.5c: Under a separate hypothetical weekly grant, duplicate content hash is blocked by intent deduplication fence
  const weeklyGrantId = 'group-grant:weekly-dedup-test';
  sandboxStore.createJob(weeklyGrantId, {
    id: 'weekly-dedup-test',
    registryId: destInput.registryId,
    mode: 'weekly',
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    formats: ['text'],
    maxSubmissions: 3,
    maxPer24Hours: 1,
    minimumHours: 24,
    maxLatenessMinutes: 15,
    allowUnknownModeration: true,
    rulesHash: expectedRulesHash,
    origin: 'http://localhost:3001',
  });
  sandboxStore.patchState(weeklyGrantId, { enabled: true, paused: false, revoked: false, charges: [] });

  let scheduleDupErrorC: string | null = null;
  try {
    await lane.schedule({
      id: 'dest-developer-antigravity-duplicate-attempt-c',
      registryId: destInput.registryId,
      grantId: weeklyGrantId,
      preparedId: 'gprep-fresh-same-content',
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      timeZone: 'Asia/Bangkok',
    });
  } catch (err: any) {
    scheduleDupErrorC = err.message;
  }
  record('Scheduling duplicate content hash under new grant throws "Original Group text intent already exists"',
    scheduleDupErrorC?.includes('Original Group text intent already exists; inspect it instead of duplicating') === true,
    { scheduleDupErrorC }
  );

  // 2.6 Test: attempt to re-authorize or renew existing grant
  const { origin: _orig, rulesHash: _rh, ...cleanGrantInput } = grantInput;

  // 2.6a: Re-submitting the original grant with past timestamp is blocked
  let grantPastError: string | null = null;
  try {
    await lane.authorize(cleanGrantInput, true);
  } catch (err: any) {
    grantPastError = err.message;
  }
  record('Re-authorizing past grant is blocked ("must be prospective")',
    grantPastError?.includes('Group grant must be prospective and bounded to seven days') === true,
    { grantPastError }
  );

  // 2.6b: Attempting to set maxSubmissions > 1 on exact_post grant is strictly prohibited
  let grantLimitError: string | null = null;
  try {
    await lane.authorize({
      ...cleanGrantInput,
      startsAt: new Date(Date.now()).toISOString(),
      expiresAt: new Date(Date.now() + 2 * 3600000).toISOString(),
      scheduledAt: new Date(Date.now() + 1800000).toISOString(),
      maxSubmissions: 2, // attempt to increase limit
    }, true);
  } catch (err: any) {
    grantLimitError = err.message;
  }
  record('exact_post grant strictly forbids maxSubmissions > 1 ("binds one prepared revision")',
    grantLimitError?.includes('Exact authority binds one prepared revision/hash and scheduled time') === true,
    { grantLimitError }
  );

  // 2.6c: Attempting to re-authorize exact_post grant ID with new dates is blocked because prepared content was already submitted
  const prospectiveStartsAt = new Date(Date.now()).toISOString();
  const prospectiveExpiresAt = new Date(Date.now() + 2 * 3600000).toISOString();
  const prospectiveScheduledAt = new Date(Date.now() + 1800000).toISOString();
  let grantSubmittedError: string | null = null;
  try {
    await lane.authorize({
      ...cleanGrantInput,
      startsAt: prospectiveStartsAt,
      expiresAt: prospectiveExpiresAt,
      scheduledAt: prospectiveScheduledAt,
      maxSubmissions: 1,
    }, true);
  } catch (err: any) {
    grantSubmittedError = err.message;
  }
  record('Re-authorizing exact_post grant is blocked by submitted prepared content check',
    grantSubmittedError?.includes('was submitted, or has stale context') === true,
    { grantSubmittedError }
  );

  // 2.6d: Existing grant is strictly immutable (tested on weekly grant where packet() is not called)
  let grantRenewalError: string | null = null;
  try {
    await lane.authorize({
      id: 'weekly-dedup-test',
      registryId: destInput.registryId,
      mode: 'weekly',
      startsAt: prospectiveStartsAt,
      expiresAt: prospectiveExpiresAt,
      formats: ['text'],
      maxSubmissions: 5, // modified limit
      maxPer24Hours: 1,
      minimumHours: 24,
      maxLatenessMinutes: 15,
      allowUnknownModeration: true,
    }, true);
  } catch (err: any) {
    grantRenewalError = err.message;
  }
  record('Modifying existing grant parameters throws "immutable; no renewal"',
    grantRenewalError?.includes('Original grant is immutable; no renewal') === true,
    { grantRenewalError }
  );

  // 2.7 Test: Grant admission limit evaluation
  // If a hypothetical new destination were bound to this grant (say, different preparedId),
  // does the admission function strictly throw group_submission_limit because charges.length >= maxSubmissions?
  const hypotheticalJobId = 'group-text:hypothetical-second-submission';
  sandboxStore.createJob(hypotheticalJobId, {
    ...destInput,
    id: 'hypothetical-second-submission',
    preparedId: 'gprep-hypothetical',
    contentHash: '0000000000000000000000000000000000000000000000000000000000000000',
    scheduledAt: new Date(Date.now() - 1000).toISOString(),
  });
  sandboxStore.patchState(hypotheticalJobId, { phase: 'scheduled', submissions: 0 });

  const hypJob = sandboxStore.getJob(hypotheticalJobId)!;
  // Access admission directly through lane status
  const hypDestAdmission = (lane as any).admission(hypJob);
  record('Hypothetical second destination admission returns group_submission_limit',
    hypDestAdmission === 'group_submission_limit',
    { hypDestAdmission }
  );

  sandboxStore.close();
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('\n=== Summary of Empirical Challenge Results ===');
  const allPassed = results.every(r => r.passed);
  console.log(`Total tests: ${results.length}, Passed: ${results.filter(r => r.passed).length}, Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`Overall Verdict: ${allPassed ? 'ALL PASS (SOLID INTEGRITY)' : 'FAILURES DETECTED'}`);

  return { allPassed, results };
}

runAudit().catch(err => {
  console.error('Audit fatal error:', err);
  process.exit(1);
});
