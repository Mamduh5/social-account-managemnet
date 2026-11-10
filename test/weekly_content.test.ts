import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, dataDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { initializeContentWorkspace } from '../server/src/db/content-workspace.js';
import { initializeCalendarSchema } from '../server/src/db/calendar-schema.js';
import { WeeklyContentService } from '../server/src/services/weekly-content.service.js';
import type { WeeklyAgentBridge, WeeklyAgentAction } from '../server/src/services/weekly-agent-bridge.js';
import { groupsWorkspaceService } from '../server/src/services/groups-workspace.service.js';
import { generalPostsService } from '../server/src/services/general-posts.service.js';
import { calendarService } from '../server/src/services/calendar.service.js';
import { seal } from '../server/src/services/token-protection.js';
import { weeklyContentRepo } from '../server/src/repositories/weekly-content.repo.js';
import {WeeklyBatchService} from '../server/src/services/weekly-batch.service.js';
import { weekWindow, evidenceInput, ideaInput, slotInput, validateEvidence, validateIdeasAndSlots, slotEvidenceHold, type WeeklyPlan } from '../server/src/domain/weekly-content.js';

assert.ok(process.env.SCC_DATA_DIR && /test-runs/i.test(dataDir), 'Weekly tests require isolated SCC_DATA_DIR');
initializeDatabase();
initializeContentWorkspace();
initializeCalendarSchema(db);
after(() => db.close());

const now = new Date('2026-11-10T00:00:00.000Z');
const developer = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';
const world = 'acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978';
const rai = 'acc-3523ffaf-a345-4868-b274-0e2269d34c34';
const insertAccount = db.prepare("INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,is_demo,connection_status,external_id) VALUES (?,'facebook','page',?,?,'connected','official_api',0,'connected',?)");
insertAccount.run(developer, 'แก้บัคยาวๆๆ', '@weekly-developer', '409347032254077');
insertAccount.run(world, 'โลกจริงหลุดบท', '@weekly-world', '1428270437036294');
insertAccount.run(rai, 'ร้อยละคนไทย', '@weekly-rai', '1313185685220741');
db.prepare('UPDATE accounts SET identity_verified_at=? WHERE id IN (?,?,?)').run(now.toISOString(), developer, world, rai);
process.env.SCC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 61).toString('base64');
db.prepare("UPDATE accounts SET access_token=?,token_expires_at='2026-11-20T00:00:00Z',granted_scopes_json=? WHERE id IN (?,?,?)")
  .run(seal('OFFLINE_WEEKLY_FIXTURE_TOKEN'), JSON.stringify(['pages_show_list', 'pages_manage_posts', 'pages_read_engagement']), developer, world, rai);
let sequence = 0;
const unique = (prefix: string) => `${prefix}-${++sequence}`;
function evidence(overrides: Record<string, unknown> = {}) {
  return evidenceInput.parse({ kind: 'owner_reference', summary: 'Owner asks for a practical explanation of isolated development directories.',
    sourceRef: 'owner:weekly-note', observedAt: now.toISOString(), validUntil: '2026-11-17T00:00:00.000Z',
    accountId: developer, limitations: 'One supplied reference; no audience-trend or causal conclusion.', privacy: 'owner_supplied', relevanceConfirmed: true, ...overrides });
}
function idea(evidenceId: string, overrides: Record<string, unknown> = {}) {
  return ideaInput.parse({ id: unique('idea'), accountId: developer, topic: 'Practical workflow isolation', intendedAudience: 'Developers using two coding tools',
    evidenceIds: [evidenceId], interestReason: 'A specific owner-provided question can be answered usefully.', originalContribution: 'An original worked example and its limits.',
    recommendedFormat: 'text', formatReason: 'The useful steps fit concise ordinary text; no motion or native background is needed.',
    factualRequirements: ['Verify commands in primary documentation before publication.'], confidence: 'low', limitations: ['A single request does not establish broad demand.'], ...overrides });
}
function planFixture(): WeeklyPlan {
  const e = { ...evidence(), id: 'evidence-domain', provenance: 'owner_supplied', independentlyVerified: false };
  const i = idea(e.id);
  return { version: 'weekly-content.v1', id: unique('week-domain'), name: 'Offline weekly fixture', revision: 1,
    startDate: '2026-11-10', endDate: '2026-11-17', timeZone: 'Asia/Bangkok', targetAccountIds: [developer, world], groupIds: ['group-a', 'group-b'],
    evidence: [e], ideas: [i], slots: [{ id: unique('slot'), ideaId: i.id, format: 'text', scheduledAt: '2026-11-11T10:00:00+07:00' }],
    planningApproval: null, analysisTasks: [], limitations: ['Offline synthetic test.'], createdAt: now.toISOString(), updatedAt: now.toISOString() };
}

function serviceFixture(handler?: (action: WeeklyAgentAction, input: any) => Promise<any>) {
  const calls: { action: WeeklyAgentAction; input: any }[] = [];
  const bridge: WeeklyAgentBridge = { async run(action, input) { calls.push({ action, input }); if (handler) return handler(action, input); throw new Error('No provider or external operation is available in this offline fixture'); } };
  const service = new WeeklyContentService(bridge, () => new Date(now));
  return { service, bridge, calls, create: () => service.create({ name: unique('Research-backed week'), startDate: '2026-11-10', targetAccountIds: [developer, world, rai], groupIds: [] }) };
}

function selectedPlan(f: ReturnType<typeof serviceFixture>, lanes = [developer]) {
  let p = f.create();
  const ideas = [];
  const slots = [];
  for (const accountId of lanes) {
    p = f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence({ accountId }) });
    const e = p.evidence.find(row => row.accountId === accountId)!;
    const candidate = idea(e.id, { accountId });
    ideas.push(candidate);
    slots.push({ id: unique('slot'), ideaId: candidate.id, format: 'text' as const, scheduledAt: '2026-11-11T10:00:00+07:00' });
  }
  p = f.service.edit(p.id, { revision: p.revision, ideas, slots });
  return f.service.approvePlanning(p.id, { revision: p.revision });
}

function savedPublication(accountId: string, caption: string, status = 'published') {
  const postId = unique('weekly-post'), destinationId = unique('weekly-dest');
  db.prepare("INSERT INTO publishing_posts(id,title,content_type) VALUES (?,?,'text')").run(postId, caption);
  db.prepare("INSERT INTO publishing_destinations(id,post_id,account_id,caption,status,remote_post_id,remote_post_url,published_at,content_type,confirmation_source,verification_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(destinationId, postId, accountId, caption, status, status === 'published' ? unique('remote') : null, status === 'published' ? 'https://www.facebook.com/123/posts/456' : null,
      status === 'published' ? '2026-11-09T02:00:00Z' : null, 'text', 'api', 'confirmed');
  return { postId, destinationId };
}

test('weekly windows use Bangkok midnight, seven days and an exclusive end across month/year rollovers', () => {
  assert.deepEqual(weekWindow('2026-12-29'), { start: Date.parse('2026-12-28T17:00:00Z'), end: Date.parse('2027-01-04T17:00:00Z'), endDate: '2027-01-05' });
  for (const date of ['2026-02-30', '2026-11-31', '11/10/2026', '2026-11-10T00:00:00Z']) assert.throws(() => weekWindow(date));
  const p = planFixture();
  p.slots[0].scheduledAt = '2026-11-10T00:00:00+07:00';
  validateIdeasAndSlots(p, +now);
  assert.equal(p.slots[0].scheduledAt, '2026-11-09T17:00:00.000Z');
  p.slots[0].scheduledAt = '2026-11-17T00:00:00+07:00';
  assert.throws(() => validateIdeasAndSlots(p, +now), /seven-day|exclusive/);
});

test('evidence validates freshness, explicit provenance notes and supported references without accepting private URLs', () => {
  validateEvidence(evidence(), +now);
  for (const change of [
    { observedAt: '2026-11-10T00:02:00.000Z' },
    { validUntil: '2026-11-18T00:00:00.000Z' },
    { validUntil: now.toISOString() },
    { sourceRef: 'http://example.com/source' },
    { sourceRef: 'https://user:secret@example.com/source' },
    { sourceRef: 'https://127.0.0.1/source' },
    { sourceRef: 'https://example.com/source?access_token=secret' },
    { kind: 'verified_fact' },
    { groupId: 'group-a', privacy: 'public' },
  ]) assert.throws(() => validateEvidence(evidence(change), +now));
  validateEvidence(evidence({ kind: 'verified_fact', sourceRef: 'https://git-scm.com/docs/git-worktree', verificationNote: 'Owner inspected the primary documentation; attribution remains explicit.' }), +now);
  assert.throws(() => evidenceInput.parse({ ...evidence(), authorName: 'Private identity must not enter the schema' }));
});

test('ideas retain exact evidence-to-Page and Group traceability and reject unsupported format claims', () => {
  const p = planFixture();
  validateIdeasAndSlots(p, +now);
  p.ideas[0].accountId = world;
  assert.throws(() => validateIdeasAndSlots(p, +now), /exact Page|supporting evidence/);
  p.ideas[0].accountId = developer;
  p.ideas[0].evidenceIds = ['unknown'];
  assert.throws(() => validateIdeasAndSlots(p, +now), /supporting evidence/);
  p.ideas[0].evidenceIds = [p.evidence[0].id];
  p.evidence[0].groupId = 'group-a';
  p.ideas[0].groupId = 'group-b';
  assert.throws(() => validateIdeasAndSlots(p, +now), /exact Page|supporting evidence/);
  assert.throws(() => slotInput.parse({ id: 'unsupported', ideaId: p.ideas[0].id, format: 'colored_background', scheduledAt: '2026-11-11T10:00:00+07:00' }));
  assert.throws(() => ideaInput.parse({ ...p.ideas[0], approved: true }));
});

test('slot admission holds stale evidence and missed windows without replaying or converting every idea to video', () => {
  const p = planFixture(), slot = p.slots[0];
  validateIdeasAndSlots(p, +now);
  assert.equal(slotEvidenceHold(p, slot, +now), null);
  assert.equal(slot.format, 'text');
  p.evidence[0].validUntil = '2026-11-11T00:00:00Z';
  assert.match(slotEvidenceHold(p, slot, +now)!, /fresh_evidence/);
  p.evidence[0].validUntil = '2026-11-17T00:00:00Z';
  assert.match(slotEvidenceHold(p, slot, Date.parse(slot.scheduledAt))!, /missed_publication_window/);
  p.ideas[0].groupId = 'group-a';
  slot.format = 'image';
  assert.match(slotEvidenceHold(p, slot, +now)!, /group_v1_text_only/);
});

test('weekly records persist revisions across service recreation and planning approval never approves publications', async () => {
  const f = serviceFixture();
  let p = f.create();
  assert.equal(p.timeZone, 'Asia/Bangkok');
  assert.equal(p.endDate, '2026-11-17');
  assert.equal(p.planningApproval, null);
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence() });
  const i = idea(p.evidence[0].id);
  p = f.service.edit(p.id, { revision: p.revision, ideas: [i], slots: [{ id: unique('slot'), ideaId: i.id, format: 'text', scheduledAt: '2026-11-11T10:00:00+07:00' }] });
  const originalRevision = p.revision;
  const beforeDestinations = db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all();
  p = f.service.approvePlanning(p.id, { revision: p.revision });
  assert.ok(p.planningApproval);
  assert.deepEqual(db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all(), beforeDestinations);
  assert.equal(f.calls.length, 0);
  const reopened = new WeeklyContentService(undefined, () => new Date(now));
  assert.deepEqual(reopened.get(p.id), p);
  await assert.rejects(async () => f.service.edit(p.id, { revision: originalRevision, name: 'Stale edit' }), /revision|changed/i);
  p = f.service.edit(p.id, { revision: p.revision, name: 'Owner-adjusted week' });
  assert.equal(p.planningApproval, null);
  assert.equal(p.name, 'Owner-adjusted week');
});

test('manual evidence retains unverified provenance and identical evidence cannot be refreshed by changing its timestamp', () => {
  const f = serviceFixture();
  let p = f.create();
  const original = evidence({ observedAt: '2026-11-09T00:00:00Z', validUntil: '2026-11-16T00:00:00Z' });
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: original });
  const first = p.evidence[0];
  assert.equal(first.independentlyVerified, false);
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: { ...original, observedAt: now.toISOString(), validUntil: '2026-11-17T00:00:00Z' } });
  assert.equal(p.evidence.length, 1);
  assert.equal(p.evidence[0].id, first.id);
  assert.equal(p.evidence[0].observedAt, first.observedAt);
  assert.equal(p.evidence[0].validUntil, first.validUntil);
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence({ kind: 'verified_fact', summary: 'Primary documentation describes independent working directories.',
    sourceRef: 'https://git-scm.com/docs/git-worktree', privacy: 'public', verificationNote: 'Owner-reported primary-source inspection; no automated verification claimed.' }) });
  assert.equal(p.evidence.at(-1)!.kind, 'verified_fact');
  assert.equal(p.evidence.at(-1)!.independentlyVerified, false);
});

test('registered Group ideas need exact acting-Page context and cannot reuse unrelated Group research', async () => {
  const g = groupsWorkspaceService.save(undefined, { name: unique('Developer Group'), url: `https://www.facebook.com/groups/${10000 + sequence}/`, identityType: 'page', accountId: developer,
    membership: 'member', category: 'developer_workflow', rules: 'Original developer discussion only; no repeated promotional posts.', rulesReviewedAt: '2026-11-10', reviewedAt: now.toISOString(),
    eligibility: { pagesCanJoin: 'yes', participationApproval: 'not_required', postModeration: 'not_required', promotionalRestrictions: 'No promotions', questions: [] } });
  const f = serviceFixture();
  let p = f.service.create({ name: unique('Group research week'), startDate: '2026-11-10', targetAccountIds: [developer], groupIds: [g.id] });
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence({ groupId: g.id, privacy: 'authorized_group', sourceRef: g.url, kind: 'audience_opinion' }) });
  const i = idea(p.evidence[0].id, { groupId: g.id });
  p = f.service.edit(p.id, { revision: p.revision, ideas: [i], slots: [] });
  assert.equal(p.ideas[0].groupId, g.id);
  await assert.rejects(async () => f.service.edit(p.id, { revision: p.revision, ideas: [{ ...i, groupId: undefined }], slots: [] }), /exact Page|Group|supporting evidence/i);
  await assert.rejects(async () => f.service.edit(p.id, { revision: p.revision, ideas: [{ ...i, accountId: world }], slots: [] }), /destination|Page|Group|evidence/i);
  assert.equal(f.calls.length, 0);
});

test('saved research collection preserves confirmed zero and unknown metrics and excludes personal or irrelevant comments', async () => {
  const own = savedPublication(developer, 'PUBLIC_OWNER_POST_ABOUT_WORKFLOW');
  const other = savedPublication(world, 'OTHER_PAGE_POST_MUST_NOT_ENTER_SINGLE_PAGE_RESEARCH');
  const draft = savedPublication(developer, 'UNPUBLISHED_CAPTION_MUST_NOT_ENTER_RESEARCH', 'draft');
  db.prepare("INSERT INTO post_metrics_snapshots(id,destination_id,account_id,platform,remote_post_id,observed_at,like_count,comment_count,share_count,source,provenance_status) VALUES (?,?,?,'facebook',?,'2026-11-09T03:00:00Z',0,NULL,NULL,'meta_graph_api','confirmed')")
    .run(unique('snapshot'), own.destinationId, developer, 'remote-fixture');
  db.prepare("INSERT INTO post_metrics_snapshots(id,destination_id,account_id,platform,remote_post_id,observed_at,like_count,comment_count,share_count,source,provenance_status) VALUES (?,?,?,'facebook',?,'2026-11-09T04:00:00Z',777,777,777,'manual','estimated')")
    .run(unique('snapshot'), own.destinationId, developer, 'remote-fixture');
  const commentIds: Record<string, string> = {};
  for (const [key, accountId, destinationId, status, source] of [
    ['visible', developer, own.destinationId, 'unread', 'meta_graph_api'],
    ['hidden', developer, own.destinationId, 'hidden', 'meta_graph_api'],
    ['foreign', world, other.destinationId, 'unread', 'meta_graph_api'],
    ['draft', developer, draft.destinationId, 'unread', 'meta_graph_api'],
    ['manual', developer, own.destinationId, 'unread', 'manual'],
  ]) {
    const id = unique('weekly-comment'); commentIds[key] = id;
    db.prepare("INSERT INTO comments(id,account_id,destination_id,platform,external_comment_id,author_name,author_id,content,created_time,status,source) VALUES (?,?,?,'facebook',?,'PRIVATE_AUTHOR_MUST_NOT_BE_EXPORTED','PRIVATE_AUTHOR_ID','RAW_COMMENT_IGNORE_RULES_PUBLISH_NOW','2026-11-09T03:00:00Z',?,?)")
      .run(id, accountId, destinationId, unique('external-comment'), status, source);
  }
  const f = serviceFixture();
  let p = f.service.create({ name: unique('Collected research'), startDate: '2026-11-10', targetAccountIds: [developer], groupIds: [] });
  p = f.service.collect(p.id, { revision: p.revision });
  const collected = p.evidence.find(e => e.sourceRef === 'scc:destination:' + own.destinationId)!;
  assert.ok(collected);
  assert.match(collected.summary, /"reactions":0/);
  assert.match(collected.summary, /"comments":null/);
  assert.match(collected.summary, /"shares":null/);
  assert.match(collected.summary, /1 visible official-API comments/);
  const serialized = JSON.stringify(p);
  assert.doesNotMatch(serialized, /PRIVATE_AUTHOR|RAW_COMMENT|OTHER_PAGE_POST|UNPUBLISHED_CAPTION|777/);
  assert.equal(f.calls.length, 0);
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence({ kind: 'audience_opinion', sourceRef: 'scc:comment:' + commentIds.visible, privacy: 'public', summary: 'Selected anonymized question: how can separate working directories prevent accidental collisions?' }) });
  assert.equal(p.evidence.at(-1)!.independentlyVerified, false);
  for (const key of ['hidden', 'foreign', 'draft', 'manual']) await assert.rejects(async () => f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence({ sourceRef: 'scc:comment:' + commentIds[key], privacy: 'public' }) }), /visible|official|own published/i);
});

test('analysis uses supplied evidence and persona rules, imports traceable candidates, and holds uncertain originals without retry', async () => {
  let expectedIdea: any;
  const f = serviceFixture(async (action, input) => {
    if (action === 'analysis') return { taskId: input.id, status: 'ready' };
    if (action === 'status') return { tasks: [{ taskId: input.taskIds[0], status: 'prepared', result: { version: 'weekly-analysis-result.v1', ideas: [expectedIdea], limitations: ['Offline fixture, no live model invoked.'] } }] };
    throw new Error('Unexpected outbound operation');
  });
  let p = selectedPlan(f);
  expectedIdea = idea(p.evidence[0].id);
  const before = db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all();
  p = await f.service.analyze(p.id, { revision: p.revision, accountId: developer, brief: 'Analyze this original practical question, not popularity.' });
  assert.equal(p.analysisTasks.length, 1);
  const analysis = f.calls.find(c => c.action === 'analysis')!;
  assert.equal(analysis.input.accountId, developer);
  assert.match(JSON.stringify(analysis.input.editorialRules), /developer|curiosity|humility/i);
  assert.equal(analysis.input.evidence[0].id, p.evidence[0].id);
  p = await f.service.importAnalysis(p.id, { revision: p.revision, taskId: p.analysisTasks[0].taskId });
  assert.equal(p.analysisTasks[0].status, 'imported');
  assert.equal(p.ideas.at(-1)!.recommendedFormat, 'text');
  assert.deepEqual(p.ideas.at(-1)!.evidenceIds, [p.evidence[0].id]);
  assert.deepEqual(db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all(), before);

  const failed = serviceFixture();
  let held = selectedPlan(failed);
  held = await failed.service.analyze(held.id, { revision: held.revision, accountId: developer, brief: 'One bounded analysis' });
  assert.equal(held.analysisTasks[0].status, 'reconciliation_required');
  held = await failed.service.analyze(held.id, { revision: held.revision, accountId: developer, brief: 'One bounded analysis' });
  assert.equal(failed.calls.length, 1);
  assert.equal(held.analysisTasks.length, 1);
});

test('separate preparation authorization isolates Page failures and durable intents prevent duplicate dispatch after recreation', async () => {
  const f = serviceFixture(async (action, input) => {
    assert.equal(action, 'prepare');
    if (input.accountId === developer) throw new Error('Quota unavailable; retain original intent, no fallback.');
    return { taskId: 'task-' + input.slotId, jobId: 'job-' + input.slotId, status: 'ready' };
  });
  let p = selectedPlan(f, [developer, world]);
  await assert.rejects(async () => f.service.prepare(p.id, { revision: p.revision, slotIds: p.slots.map(s => s.id), confirmPreparation: false }), /true|Invalid/i);
  p = await f.service.prepare(p.id, { revision: p.revision, slotIds: p.slots.map(s => s.id), confirmPreparation: true });
  assert.equal(p.slots[0].preparation!.status, 'reconciliation_required');
  assert.equal(p.slots[1].preparation!.status, 'ready');
  assert.equal(f.calls.length, 2);
  assert.ok(p.slots.every(s => s.preparation?.intentAt));
  assert.match(String(p.slots[0].preparation!.hold), /Quota/);
  const recreated = new WeeklyContentService(f.bridge, () => new Date(now));
  p = await recreated.prepare(p.id, { revision: p.revision, slotIds: p.slots.map(s => s.id), confirmPreparation: true });
  assert.equal(f.calls.length, 2);
  await assert.rejects(async () => recreated.edit(p.id, { revision: p.revision, slots: p.slots.map((s, index) => ({ id: s.id, ideaId: s.ideaId, format: s.format, scheduledAt: index ? s.scheduledAt : '2026-11-12T10:00:00+07:00' })) }), /immutable|original/i);
  await assert.rejects(async () => recreated.edit(p.id, { revision: p.revision, ideas: p.ideas.map((i, index) => ({ ...i, topic: index ? i.topic : 'Silently changed authorized topic' })) }), /immutable|original/i);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM publishing_destinations WHERE status='scheduled'").get() as { n: number }).n, 0);
});

test('prepared drafts enter existing campaigns unapproved and repeated materialization does not duplicate or queue them', async () => {
  const drafts = new Map<string, { id: string; revision: number }>();
  const f = serviceFixture(async (action, input) => {
    if (action === 'prepare') {
      const jobId = 'job-' + input.slotId;
      const draft = generalPostsService.save({ title: 'Original prepared workflow post', contentType: 'text', destinations: [{ accountId: input.accountId, caption: 'Useful original steps based on the supplied reference.', hashtags: '', attachments: [] }] });
      drafts.set(input.slotId, { id: draft!.id, revision: draft!.revision });
      return { taskId: 'task-' + input.slotId, jobId, status: 'prepared' };
    }
    if (action === 'persist') return { status: 'prepared', preparation: { draftId: drafts.get(input.slotId)!.id, revision: drafts.get(input.slotId)!.revision } };
    throw new Error('Unexpected provider operation');
  });
  let p = selectedPlan(f);
  p = await f.service.prepare(p.id, { revision: p.revision, slotIds: [p.slots[0].id], confirmPreparation: true });
  const beforeDestinations = db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all();
  p = await f.service.materialize(p.id, { revision: p.revision });
  assert.ok(p.slots[0].draftId, JSON.stringify(p.slots[0].preparation));
  assert.ok(p.slots[0].campaignId, String(p.slots[0].preparation?.hold || 'Campaign was not created'));
  const campaignId = p.slots[0].campaignId!;
  const campaign = calendarService.getCampaignById(campaignId);
  assert.equal(campaign.days, 7);
  assert.equal(campaign.status, 'awaiting_approval');
  assert.equal(campaign.approvedRevision, null);
  const draft = generalPostsService.get(p.slots[0].draftId!);
  assert.equal(draft!.status, 'draft');
  assert.equal(draft!.approvedRevision, null);
  assert.equal(draft!.queuedPostId, null);
  assert.equal(draft!.scheduledAt, '2026-11-11T03:00:00.000Z');
  assert.deepEqual(db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all(), beforeDestinations);
  const ids = { draftId: p.slots[0].draftId, campaignId };
  p = await f.service.materialize(p.id, { revision: p.revision });
  assert.equal(p.slots[0].draftId, ids.draftId);
  assert.equal(p.slots[0].campaignId, ids.campaignId);
  assert.equal(f.calls.filter(c => c.action === 'persist').length, 1);
  assert.deepEqual(db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all(), beforeDestinations);
  p = f.service.outcomes(p.id, { revision: p.revision });
  assert.equal(p.slots[0].outcome!.status, 'draft');
  assert.equal(p.slots[0].outcome!.publishedAt, null);
  assert.equal(p.slots[0].outcome!.metrics, null);

  const review = calendarService.getCampaignReview(campaignId);
  assert.throws(() => calendarService.approveCampaign(campaignId, { accountId: developer, expectedHash: 'stale-review' }), /exact current snapshot|changed/i);
  const realNow = Date.now;
  let queued: ReturnType<typeof calendarService.approveCampaign>;
  try {
    Date.now = () => +now;
    queued = calendarService.approveCampaign(campaignId, { accountId: developer, expectedHash: review.expectedApprovalHash });
  } finally { Date.now = realNow; }
  assert.equal(queued!.queuedCount, 1);
  const destination = db.prepare('SELECT * FROM publishing_destinations WHERE campaign_id=?').get(campaignId) as any;
  assert.equal(destination.status, 'scheduled');
  assert.equal(destination.account_id, developer);
  assert.equal(destination.remote_post_id, null);
  p = f.service.outcomes(p.id, { revision: p.revision });
  assert.equal(p.slots[0].outcome!.destinationId, destination.id);
  assert.equal(p.slots[0].outcome!.status, 'scheduled');

  // Offline fixture advances an existing destination receipt; no connector is invoked.
  db.prepare("UPDATE publishing_destinations SET status='published',published_at='2026-11-11T03:00:00Z',remote_post_id='OFFLINE_REMOTE_RECEIPT',remote_post_url='https://www.facebook.com/123/posts/456',confirmation_source='api',verification_status='confirmed' WHERE id=?").run(destination.id);
  db.prepare("INSERT INTO post_metrics_snapshots(id,destination_id,account_id,platform,remote_post_id,observed_at,like_count,comment_count,share_count,source,provenance_status) VALUES (?,?,?,'facebook','OFFLINE_REMOTE_RECEIPT','2026-11-11T04:00:00Z',0,NULL,NULL,'meta_graph_api','confirmed')")
    .run(unique('outcome-snapshot'), destination.id, developer);
  p = f.service.outcomes(p.id, { revision: p.revision });
  assert.equal(p.slots[0].outcome!.status, 'published');
  assert.equal((p.slots[0].outcome!.metrics as any).like_count, 0);
  assert.equal((p.slots[0].outcome!.metrics as any).comment_count, null);
  assert.equal((p.slots[0].outcome!.metrics as any).share_count, null);
  assert.equal(f.calls.filter(c => c.action === 'prepare').length, 1);
});

test('an owner-edited prepared draft remains untouched and cannot be silently rebound to a weekly campaign', async () => {
  const draft = generalPostsService.save({ title: 'Original worker draft', contentType: 'text', destinations: [{ accountId: developer, caption: 'Original prepared content', hashtags: '', attachments: [] }] })!;
  const f = serviceFixture(async (action, input) => action === 'prepare'
    ? { taskId: 'task-' + input.slotId, jobId: 'job-' + input.slotId, status: 'prepared' }
    : { status: 'prepared', preparation: { draftId: draft.id, revision: draft.revision } });
  let p = selectedPlan(f);
  p = await f.service.prepare(p.id, { revision: p.revision, slotIds: [p.slots[0].id], confirmPreparation: true });
  const edited = generalPostsService.save({ ...draft, title: 'Owner-adjusted title', destinations: [{ ...draft.destinations[0], caption: 'OWNER_EDIT_MUST_SURVIVE' }] }, draft.id, draft.revision)!;
  p = await f.service.materialize(p.id, { revision: p.revision });
  assert.equal(p.slots[0].campaignId, undefined);
  assert.match(String(p.slots[0].preparation!.hold), /revision|unchanged|original/i);
  assert.deepEqual(generalPostsService.get(draft.id), edited);
});

test('Group weekly scheduling uses the exact existing registry and grant, then reconciles without another scheduling action', async () => {
  const g = groupsWorkspaceService.save(undefined, { name: unique('Exact Group lane'), url: `https://www.facebook.com/groups/${20000 + sequence}/`, identityType: 'page', accountId: developer,
    membership: 'member', category: 'developer_workflow', rules: 'Original practical developer questions only.', rulesReviewedAt: '2026-11-10', reviewedAt: now.toISOString(),
    eligibility: { pagesCanJoin: 'yes', participationApproval: 'not_required', postModeration: 'not_required', promotionalRestrictions: '', questions: [] } });
  const prepared = groupsWorkspaceService.prepare(g.id, { kind: 'post', content: 'Original concise Group-specific question about independent workspaces.', sourcePageId: developer, relevance: 'Discusses a practical developer problem within the recorded rules.', revision: g.revision });
  const registryId = 'group-channel:offline-weekly', grantId = 'group-grant:existing-offline-weekly';
  let destination: any;
  const f = serviceFixture(async (action, input) => {
    if (action === 'prepare') return { taskId: 'task-' + input.slotId, jobId: 'job-' + input.slotId, status: 'prepared' };
    if (action === 'persist') return { status: 'prepared', preparation: { preparedId: prepared.id } };
    if (action === 'groupStatus') return { registries: [{ id: registryId, groupId: g.id, accountId: developer }], destinations: destination ? [destination] : [] };
    if (action === 'groupSchedule') {
      assert.equal(input.registryId, registryId);
      assert.equal(input.grantId, grantId);
      assert.equal(input.preparedId, prepared.id);
      assert.equal(input.timeZone, 'Asia/Bangkok');
      destination = { id: 'group-text:' + input.id, phase: 'scheduled' };
      return { id: destination.id, state: { phase: 'scheduled' } };
    }
    throw new Error('Native browser publication must not occur in this test');
  });
  let p = f.service.create({ name: unique('Group slot week'), startDate: '2026-11-10', targetAccountIds: [developer], groupIds: [g.id] });
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence({ groupId: g.id, privacy: 'authorized_group', sourceRef: g.url }) });
  const i = idea(p.evidence[0].id, { groupId: g.id });
  p = f.service.edit(p.id, { revision: p.revision, ideas: [i], slots: [{ id: unique('group-slot'), ideaId: i.id, format: 'text', scheduledAt: '2026-11-11T11:00:00+07:00' }] });
  p = f.service.approvePlanning(p.id, { revision: p.revision });
  p = await f.service.prepare(p.id, { revision: p.revision, slotIds: [p.slots[0].id], confirmPreparation: true });
  p = await f.service.materialize(p.id, { revision: p.revision });
  assert.equal(p.slots[0].preparedId, prepared.id);
  await assert.rejects(() => f.service.scheduleGroup(p.id, { revision: p.revision, slotId: p.slots[0].id, registryId: 'group-channel:another-group', grantId, confirmSchedule: true }), /exact|registry|match/i);
  p = await f.service.scheduleGroup(p.id, { revision: p.revision, slotId: p.slots[0].id, registryId, grantId, confirmSchedule: true });
  assert.equal(p.slots[0].groupSchedule!.status, 'scheduled');
  const original = p.slots[0].groupSchedule!.destinationId;
  const recreated = new WeeklyContentService(f.bridge, () => new Date(now));
  p = await recreated.scheduleGroup(p.id, { revision: p.revision, slotId: p.slots[0].id, registryId, grantId, confirmSchedule: true });
  assert.equal(p.slots[0].groupSchedule!.destinationId, original);
  assert.equal(f.calls.filter(c => c.action === 'groupSchedule').length, 1);
  await assert.rejects(() => recreated.scheduleGroup(p.id, { revision: p.revision, slotId: p.slots[0].id, registryId, grantId: 'group-grant:different-scope', confirmSchedule: true }), /immutable|original|scope/i);
  p = recreated.outcomes(p.id, { revision: p.revision });
  assert.equal(p.slots[0].outcome!.verified, false);
  assert.equal(p.slots[0].outcome!.status, 'prepared');
  assert.deepEqual(p.slots[0].outcome!.receiptHistory, []);
});

test('a Group archived after planning approval holds its own preparation while a later eligible Page lane continues', async () => {
  const g = groupsWorkspaceService.save(undefined, { name: unique('Later archived Group'), url: `https://www.facebook.com/groups/${30000 + sequence}/`, identityType: 'page', accountId: developer,
    membership: 'member', category: 'developer_workflow', rules: 'Developer discussion only.', rulesReviewedAt: '2026-11-10', reviewedAt: now.toISOString(),
    eligibility: { pagesCanJoin: 'yes', participationApproval: 'not_required', postModeration: 'not_required', promotionalRestrictions: '', questions: [] } });
  const f = serviceFixture(async (action, input) => {
    assert.equal(action, 'prepare');
    assert.equal(input.accountId, world);
    return { taskId: 'task-' + input.slotId, jobId: 'job-' + input.slotId, status: 'ready' };
  });
  let p = f.service.create({ name: unique('Independent lanes'), startDate: '2026-11-10', targetAccountIds: [developer, world], groupIds: [g.id] });
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence({ groupId: g.id, privacy: 'authorized_group', sourceRef: g.url }) });
  p = f.service.addEvidence(p.id, { revision: p.revision, evidence: evidence({ accountId: world }) });
  const groupIdea = idea(p.evidence[0].id, { groupId: g.id });
  const pageIdea = idea(p.evidence[1].id, { accountId: world });
  p = f.service.edit(p.id, { revision: p.revision, ideas: [groupIdea, pageIdea], slots: [groupIdea, pageIdea].map(i => ({ id: unique('isolated-slot'), ideaId: i.id, format: 'text', scheduledAt: '2026-11-11T12:00:00+07:00' })) });
  p = f.service.approvePlanning(p.id, { revision: p.revision });
  db.prepare('UPDATE group_plan_extensions SET archived_at=? WHERE group_id=?').run(now.toISOString(), g.id);
  p = await f.service.prepare(p.id, { revision: p.revision, slotIds: p.slots.map(s => s.id), confirmPreparation: true });
  assert.equal(p.slots[0].preparation!.status, 'held');
  assert.match(String(p.slots[0].preparation!.hold), /Group|registered|archiv/i);
  assert.equal(p.slots[0].preparation!.intentAt, undefined);
  assert.equal(p.slots[1].preparation!.status, 'ready');
  assert.ok(p.slots[1].preparation!.intentAt);
  assert.equal(f.calls.length, 1);
});

test('an owner edit while one preparation handoff is pending requires new planning approval before the next slot', async () => {
  const f = serviceFixture(async (action, input) => {
    assert.equal(action, 'prepare');
    const current = f.service.get(input.planId);
    f.service.edit(current.id, { revision: current.revision, slots: current.slots.map((s, index) => ({ id: s.id, ideaId: s.ideaId, format: s.format,
      scheduledAt: index === 1 ? '2026-11-12T10:00:00+07:00' : s.scheduledAt })) });
    return { taskId: 'task-' + input.slotId, jobId: 'job-' + input.slotId, status: 'ready' };
  });
  let p = selectedPlan(f, [developer, world]);
  p = await f.service.prepare(p.id, { revision: p.revision, slotIds: p.slots.map(s => s.id), confirmPreparation: true });
  assert.equal(f.calls.length, 1);
  assert.equal(p.slots[0].preparation!.status, 'ready');
  assert.equal(p.slots[1].scheduledAt, '2026-11-12T03:00:00.000Z');
  assert.equal(p.slots[1].preparation, undefined);
  assert.equal(p.planningApproval, null);
  await assert.rejects(() => f.service.prepare(p.id, { revision: p.revision, slotIds: [p.slots[1].id], confirmPreparation: true }), /Approve the current weekly plan/i);
  assert.equal(f.calls.length, 1);
});

test('a valid verbose idea holds before dispatch intent and remains editable for a shorter authorized preparation', async () => {
  const f = serviceFixture(async (action, input) => {
    assert.equal(action, 'prepare');
    return { taskId: 'task-' + input.slotId, jobId: 'job-' + input.slotId, status: 'ready' };
  });
  let p = selectedPlan(f);
  p = f.service.edit(p.id, { revision: p.revision, ideas: [{ ...p.ideas[0], interestReason: 'Audience relevance with explicit limitations. '.repeat(25), originalContribution: 'Original worked example with careful source qualifications. '.repeat(20) }] });
  p = f.service.approvePlanning(p.id, { revision: p.revision });
  p = await f.service.prepare(p.id, { revision: p.revision, slotIds: [p.slots[0].id], confirmPreparation: true });
  assert.equal(p.slots[0].preparation!.status, 'held');
  assert.match(String(p.slots[0].preparation!.hold), /bounded|shorten/i);
  assert.equal(p.slots[0].preparation!.intentAt, undefined);
  assert.equal(p.slots[0].preparation!.jobId, undefined);
  assert.equal(f.calls.length, 0);
  const requirements = [...p.ideas[0].factualRequirements];
  p = f.service.edit(p.id, { revision: p.revision, ideas: [{ ...p.ideas[0], interestReason: 'One practical owner question.', originalContribution: 'An original short worked example.' }] });
  assert.deepEqual(p.ideas[0].factualRequirements, requirements);
  p = f.service.approvePlanning(p.id, { revision: p.revision });
  p = await f.service.prepare(p.id, { revision: p.revision, slotIds: [p.slots[0].id], confirmPreparation: true });
  assert.equal(p.slots[0].preparation!.status, 'ready');
  assert.ok(p.slots[0].preparation!.intentAt);
  assert.equal(f.calls.length, 1);
});

test('an existing Group schedule reconciles read-only after its date and evidence expire and the Group is archived', async () => {
  const g = groupsWorkspaceService.save(undefined, { name: unique('Archived recovery Group'), url: `https://www.facebook.com/groups/${40000 + sequence}/`, identityType: 'page', accountId: developer,
    membership: 'member', category: 'developer_workflow', rules: 'Original developer discussion.', rulesReviewedAt: '2026-11-10', reviewedAt: now.toISOString(),
    eligibility: { pagesCanJoin: 'yes', participationApproval: 'not_required', postModeration: 'not_required', promotionalRestrictions: '', questions: [] } });
  let p = planFixture();
  p.targetAccountIds = [developer];
  p.groupIds = [g.id];
  p.ideas[0].groupId = g.id;
  p.evidence[0].groupId = g.id;
  p.evidence[0].privacy = 'authorized_group';
  p.slots[0].preparedId = 'original-prepared-group-recovery';
  const registryId = 'group-channel:original-recovery', grantId = 'group-grant:original-recovery', destinationId = 'group-text:original-weekly-recovery';
  p.slots[0].groupSchedule = { status: 'schedule_intent', registryId, grantId, destinationId };
  p = weeklyContentRepo.save(p, 0);
  db.prepare('UPDATE group_plan_extensions SET archived_at=? WHERE group_id=?').run(now.toISOString(), g.id);
  const calls: WeeklyAgentAction[] = [];
  const service = new WeeklyContentService({ async run(action) {
    calls.push(action);
    assert.equal(action, 'groupStatus');
    return { registries: [], destinations: [{ id: destinationId, phase: 'reconciliation_required', admission: 'unknown_native_original_retained' }] };
  } }, () => new Date('2026-11-18T00:00:00Z'));
  p = await service.scheduleGroup(p.id, { revision: p.revision, slotId: p.slots[0].id, registryId, grantId, confirmSchedule: true });
  assert.equal(p.slots[0].groupSchedule!.destinationId, destinationId);
  assert.equal(p.slots[0].groupSchedule!.status, 'reconciliation_required');
  assert.equal(p.slots[0].groupSchedule!.hold, 'unknown_native_original_retained');
  assert.deepEqual(calls, ['groupStatus']);
});

function batchReady(){
  const f=serviceFixture();let p=selectedPlan(f,[developer,rai,world]);
  for(const slot of p.slots){const candidate=p.ideas.find(i=>i.id===slot.ideaId)!;const draft=generalPostsService.save({title:candidate.topic,contentType:'text',destinations:[{accountId:candidate.accountId,caption:'OFFLINE reviewed original '+candidate.accountId,hashtags:'',attachments:[]}]});slot.draftId=draft.id;slot.draftRevision=draft.revision;slot.preparation={status:'prepared',intentAt:now.toISOString()};}
  p=weeklyContentRepo.save(p,p.revision);return {f,plan:()=>f.service.get(p.id),materialize:()=>f.service.materialize(p.id,{revision:f.service.get(p.id).revision})};
}
test('V1.1 exactly seven Bangkok calendar days include every day and exclude the eighth, including leap/year boundaries',()=>{
  for(const start of ['2026-11-10','2026-12-29','2028-02-25']){const w=weekWindow(start);assert.equal(w.end-w.start,7*86400000);for(let day=0;day<7;day++){const at=w.start+day*86400000;assert.ok(at>=w.start&&at<w.end);}assert.equal(new Date(w.end+7*3600000).toISOString().slice(0,10),w.endDate);}
  assert.throws(()=>validateEvidence(evidence({kind:'verified_fact',sourceRef:'https://www.etda.or.th/th/...',verificationNote:'Unsupported test attribution'}),+now),/placeholder/);
});
test('V1.1 one exact batch review queues all three ready Page campaigns without repeated approvals or future-content authority',async()=>{
  const f=batchReady();let p=await f.materialize();const batches=new WeeklyBatchService(f.f.bridge,()=>now);const selected=p.slots.map(s=>s.id),review=await batches.review(p.id,{revision:p.revision,slotIds:selected});assert.equal(review.campaigns.length,3);
  const before=(db.prepare('SELECT COUNT(*) n FROM publishing_destinations').get() as any).n;
  const request={revision:p.revision,slotIds:selected,expectedHash:review.hash,expiresAt:'2026-11-16T17:00:00Z',confirm:true as const,operations:{prepare:true,materialize:true,publishExact:true},groupScopes:[]};
  f.f.service.outcomes(p.id,{revision:p.revision}); // Status-only refresh must not require another unchanged content review.
  p=await batches.authorize(p.id,request);assert.equal((db.prepare('SELECT COUNT(*) n FROM publishing_destinations').get() as any).n,before+3);assert.equal(p.authorizations!.length,1);assert.equal(p.authorizations![0].campaigns.length,3);
  const retried=await batches.authorize(p.id,request);assert.equal(retried.authorizations!.length,1);assert.equal((db.prepare('SELECT COUNT(*) n FROM publishing_destinations').get() as any).n,before+3);
  assert.throws(()=>f.f.service.edit(p.id,{revision:p.revision,ideas:p.ideas.map((i,n)=>n?i:{...i,topic:'Materially changed topic'})}),/immutable/);
  const reopened=new WeeklyBatchService(f.f.bridge,()=>now);await reopened.advance(p.id);assert.equal((db.prepare('SELECT COUNT(*) n FROM publishing_destinations').get() as any).n,before+3);
});
test('V1.1 exact batch review rejects unseen edits and does not grant images from an unprepared idea or renew expiry',async()=>{
  const f=batchReady();let p=await f.materialize();const b=new WeeklyBatchService(f.f.bridge,()=>now),selected=p.slots.map(s=>s.id),review=await b.review(p.id,{revision:p.revision,slotIds:selected});
  const row=db.prepare('SELECT * FROM publishing_drafts WHERE id=?').get(p.slots[0].draftId) as any;generalPostsService.save({...JSON.parse(row.payload_json),title:'Owner changed the exact final copy'},row.id,row.revision);
  const request={revision:p.revision,slotIds:selected,expectedHash:review.hash,expiresAt:'2026-11-16T17:00:00Z',confirm:true,operations:{prepare:true,materialize:true,publishExact:true}};
  await assert.rejects(()=>b.authorize(p.id,request),/changed since review/);assert.equal(f.plan().authorizations,undefined);
  const current=await b.review(p.id,{revision:p.revision,slotIds:selected});await assert.rejects(()=>b.authorize(p.id,{...request,expectedHash:current.hash,imageBudget:{maxTotalImages:3,maxImagesPer24Hours:1,maxPendingItems:1}}),/prepared image concepts/);
  await assert.rejects(()=>b.authorize(p.id,{...request,expectedHash:current.hash,expiresAt:'2026-11-18T00:00:00Z'}),/seven-day/);
});
test('V1.1 bounded continuation prepares original selected lanes after restart and never approves future final drafts',async()=>{
  let tick=+now;const calls:any[]=[];const bridge:WeeklyAgentBridge={async run(action,input:any){calls.push({action,input});if(action==='prepare')return {taskId:'batch-task-'+input.slotId,jobId:'batch-job-'+input.slotId,status:'ready'};if(action==='status')return {tasks:input.taskIds.map((taskId:string)=>({taskId,status:'ready'}))};throw Error('No generation or public action permitted');}};
  const f=serviceFixture((action,input)=>bridge.run(action,input));let p=selectedPlan(f,[developer,rai,world]);const batch=new WeeklyBatchService(bridge,()=>new Date(tick)),review=await batch.review(p.id,{revision:p.revision,slotIds:p.slots.map(s=>s.id)});
  p=await batch.authorize(p.id,{revision:p.revision,slotIds:p.slots.map(s=>s.id),expectedHash:review.hash,expiresAt:'2026-11-16T17:00:00Z',confirm:true,operations:{prepare:true,materialize:true,publishExact:true}});assert.equal(p.authorizations![0].campaigns.length,0);
  const before=db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all();for(let n=0;n<4;n++){await new WeeklyBatchService(bridge,()=>new Date(tick)).advance(p.id);tick+=61000;}
  assert.equal(calls.filter(c=>c.action==='prepare').length,3);assert.deepEqual(db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all(),before);assert.equal(f.service.get(p.id).authorizations![0].campaigns.length,0);
});
test('V1.1 realistic three-Page and registered-Group week advances independent lanes under one scoped authorization',async()=>{
  const group=groupsWorkspaceService.save(undefined,{name:unique('Weekly developer Group'),url:`https://www.facebook.com/groups/${90000+sequence}/`,identityType:'page',accountId:developer,membership:'member',category:'developer_workflow',rules:'Original relevant developer discussion only',rulesReviewedAt:'2026-11-10',reviewedAt:now.toISOString(),eligibility:{pagesCanJoin:'yes',participationApproval:'not_required',postModeration:'required',promotionalRestrictions:'No promotion',questions:[]}});
  let tick=+now,prepared:any[]=[];const calls:any[]=[];let service:WeeklyContentService;
  const bridge:WeeklyAgentBridge={async run(action,input:any){calls.push({action,input});const p=service.get(planId);if(action==='prepare'){if(input.accountId===rai)throw Error('Fixture provider quota hold; no retry or paid fallback');prepared.push(input);return {taskId:'four-target-'+input.slotId,jobId:'four-target-job-'+input.slotId,status:'ready'};}if(action==='status')return {tasks:input.taskIds.map((taskId:string)=>({taskId,status:'prepared'}))};if(action==='persist'){const slot=p.slots.find(s=>s.id===input.slotId)!,i=p.ideas.find(i=>i.id===slot.ideaId)!;if(i.groupId)return {preparation:{preparedId:'four-target-group-package'}};if(slot.format==='reel')return {status:'prepared'};return {preparation:{draft:generalPostsService.save({title:i.topic,contentType:'text',destinations:[{accountId:i.accountId,caption:'Fixture original '+i.topic,hashtags:'',attachments:[]}]})}};}if(action==='videoAdmit')return {itemId:'four-target-original-production',status:'queued',hold:'Existing provider scope and mandatory World review still required'};if(action==='groupStatus')return {registries:[{id:'group-channel:four-target',groupId:group.id,accountId:developer}],destinations:[]};if(action==='groupSchedule')return {id:'group-text:'+input.id,state:{phase:'scheduled'}};throw Error('No provider or native social action allowed');}};
  service=new WeeklyContentService(bridge,()=>new Date(tick));let p=service.create({name:'OFFLINE realistic four-target week',startDate:'2026-11-10',targetAccountIds:[developer,rai,world],groupIds:[group.id]});const planId=p.id;
  const candidates:any[]=[];for(const [accountId,groupId,format,topic] of [[developer,undefined,'text','A practical debugging question'],[rai,undefined,'text','A carefully qualified Thai-interest discussion'],[world,undefined,'reel','An original fictional moving-object joke'],[developer,group.id,'text','A relevant peer workflow question']] as const){p=service.addEvidence(p.id,{revision:p.revision,evidence:evidence({accountId,summary:topic,sourceRef:groupId?group.url:'owner:four-target-'+accountId,...(groupId?{groupId,privacy:'authorized_group'}:{})})});const e=p.evidence.at(-1)!;candidates.push(idea(e.id,{accountId,...(groupId?{groupId}:{}),recommendedFormat:format,topic}));}
  p=service.edit(p.id,{revision:p.revision,ideas:candidates,slots:candidates.map((i,n)=>({id:'four-target-slot-'+n,ideaId:i.id,format:i.recommendedFormat,scheduledAt:`2026-11-${11+n}T05:00:00Z`}))});
  const batch=new WeeklyBatchService(bridge,()=>new Date(tick)),review=await batch.review(p.id,{revision:p.revision,slotIds:p.slots.map(s=>s.id)});
  p=await batch.authorize(p.id,{revision:p.revision,slotIds:p.slots.map(s=>s.id),expectedHash:review.hash,expiresAt:'2026-11-16T17:00:00Z',confirm:true,operations:{prepare:true,materialize:true,publishExact:true},groupScopes:[{slotId:p.slots[3].id,registryId:'group-channel:four-target',grantId:'group-grant:four-target'}]});
  for(let n=0;n<5;n++){await new WeeklyBatchService(bridge,()=>new Date(tick)).advance(p.id);tick+=61000;}
  p=service.get(p.id);assert.ok(p.slots[0].campaignId);assert.match(p.slots[1].preparation!.hold!,/quota/);assert.ok(p.slots[2].production);assert.equal(p.slots[3].groupSchedule!.status,'scheduled');assert.equal(p.authorizations!.length,1);assert.equal(p.authorizations![0].campaigns.length,0);assert.equal(calls.filter(c=>c.action==='prepare').length,4);assert.equal(calls.filter(c=>c.action==='groupSchedule').length,1);assert.ok(p.evidence.every(e=>e.independentlyVerified===false));
});
