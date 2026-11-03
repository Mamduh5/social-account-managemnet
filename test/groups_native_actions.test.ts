import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeDatabase } from '../server/src/db/schema.js';
import { db, dataDir } from '../server/src/db/database.js';
import { groupsWorkspaceService as groups } from '../server/src/services/groups-workspace.service.js';
import { groupsNativeActionsService as native } from '../server/src/services/groups-native-actions.service.js';
import { groupsNativeActionsRepo as ledger } from '../server/src/repositories/groups-native-actions.repo.js';
import { defaultGroupEligibility, type GroupPlanDto, type GroupPlanInput } from '../server/src/domain/groups.js';
import type { GroupNativeActionDto, GroupNativeOutcomeInput } from '../server/src/domain/groups-native-actions.js';
import { groupNativeActionExport } from '../server/src/domain/groups-native-actions.js';

assert.ok(process.env.SCC_ISOLATED_TEST === 'true' && /test-runs/.test(dataDir), 'Use an isolated test-runs database');
initializeDatabase();
db.prepare("INSERT INTO accounts(id,platform,account_type,name,handle) VALUES ('native-page-a','facebook','page','Native Page A','npa'),('native-page-b','facebook','page','Native Page B','npb')").run();
function group(overrides: Partial<GroupPlanInput> = {}) {
  return groups.save(undefined, {name:'Native fixture',url:`https://www.facebook.com/groups/native-${randomUUID()}`,identityType:'page',accountId:'native-page-a',membership:'not_member',rules:'Relevant original entertainment only; no promotions',rulesReviewedAt:'2026-11-03',reviewedAt:'2026-11-03T00:00:00Z',eligibility:{...defaultGroupEligibility(),pagesCanJoin:'yes',participationApproval:'approved',postModeration:'not_required'},...overrides});
}
function start(g: GroupPlanDto, kind: 'join'|'post' = 'join', preparedId?: string, requestKey = randomUUID()) {
  return native.prepare(g.id, {kind,preparedId,revision:g.revision,requestKey});
}
function outcome(action: GroupNativeActionDto, state: GroupNativeOutcomeInput['state'], overrides: Partial<GroupNativeOutcomeInput> = {}) {
  return native.record(action.id, {state,revision:action.revision,accountId:action.accountId,observedAt:'2026-11-03T10:00:00+07:00',source:'agent_browser_observation',notes:'Observed the exact acting Page and recorded native state; read the existing result before any follow-up.',confirmIdentity:true,confirmRules:true,...overrides});
}
function postFixture(overrides: Partial<GroupPlanInput> = {}) {
  const g = group({membership:'member',...overrides});
  const p = groups.prepare(g.id,{kind:'post',content:'An original Group-specific entertainment question.',relevance:'Invites this entertainment community to discuss the visual joke.',revision:g.revision});
  return {g,p};
}

test('join intent is local, identity-bound, durable, and idempotent across lost responses',()=>{
  const g = group(), key = randomUUID(), action = start(g,'join',undefined,key);
  assert.equal(action.state,'prepared'); assert.equal(action.accountId,g.account_id); assert.equal(action.canonicalKey,g.canonicalKey);
  assert.equal(action.automationSupported,false); assert.equal(action.publicationVerified,false);
  assert.deepEqual(start(g,'join',undefined,key),action);
  assert.deepEqual(ledger.get(action.id),action);
  assert.equal(groups.review(g.id).group.membership,'not_member');
  assert.throws(()=>start(g),/already exists/);
});

test('pending membership holds duplicate requests and approval is separate from posting permission',()=>{
  const g = group(); let action = outcome(start(g),'submission_started');
  action = outcome(action,'request_pending',{url:g.url});
  assert.equal(action.state,'request_pending'); assert.equal(native.list(g.id)[0].state,'request_pending');
  assert.throws(()=>outcome(action,'submission_started'),/already started|held/);
  assert.throws(()=>start(g),/already exists/);
  action = outcome(action,'membership_approved',{url:g.url});
  assert.equal(action.publicationVerified,false); assert.equal(action.events.at(-1)?.verified,false);
  assert.equal(groups.review(g.id).group.membership,'not_member');
  assert.throws(()=>outcome(action,'submission_started'),/closed/);
});

test('membership rejection stays durable without automatic retry or Page-record changes',()=>{
  const g = group(); const action = outcome(outcome(start(g),'submission_started'),'membership_rejected',{notes:'Facebook rejected the Page request. Owner review is required.'});
  assert.equal(action.state,'membership_rejected'); assert.equal(action.events.length,2);
  assert.throws(()=>start(g),/already exists/); assert.equal(groups.review(g.id).group.membership,'not_member');
});

test('profiles-only, pending membership and restricted participation remain explicit blockers',()=>{
  const profiles = group({eligibility:{...defaultGroupEligibility(),pagesCanJoin:'no'}});
  const blocked = start(profiles); assert.equal(blocked.state,'blocked'); assert.match(blocked.reasons.join(' '),/profiles only/);
  assert.throws(()=>outcome(blocked,'submission_started'),/closed/);
  const pending = start(group({membership:'request_pending'})); assert.equal(pending.state,'blocked'); assert.match(pending.reasons.join(' '),/request_pending/);
  const restricted = postFixture({eligibility:{...defaultGroupEligibility(),pagesCanJoin:'yes',participationApproval:'restricted',postModeration:'required'}});
  assert.equal(start(restricted.g,'post',restricted.p.id).state,'blocked');
});

test('a personal plan or wrong Page cannot become a Page-native attempt',()=>{
  const personal = group({identityType:'personal',accountId:null});
  assert.throws(()=>start(personal),/no personal-profile fallback/);
  const g = group(), action = start(g);
  assert.throws(()=>outcome(action,'submission_started',{accountId:'native-page-b'}),/exact acting Page/);
  assert.throws(()=>outcome(action,'submission_started',{confirmIdentity:false}),/exact acting Page/);
});

test('browser failure after submission stays uncertain and never allows replay',()=>{
  const g = group(); let action = outcome(start(g),'submission_started');
  // Reading after a process loss reconstructs the started state from saved audit events.
  assert.equal(ledger.get(action.id)?.state,'submission_started');
  action = outcome(action,'uncertain',{notes:'Browser disconnected after one click. Inspect existing Page membership; never press Join again.'});
  assert.throws(()=>outcome(action,'submission_started'),/already started|held/);
  assert.throws(()=>outcome(action,'failed_before_submission'),/uncertain outcome/);
  assert.throws(()=>outcome(action,'awaiting_owner'),/remains uncertain/);
  assert.throws(()=>start(g),/already exists/);
  assert.equal(outcome(action,'request_pending',{url:g.url}).state,'request_pending');
});

test('browser unavailability before submission yields an exportable owner handoff',()=>{
  const action = outcome(start(group()),'awaiting_owner',{source:'owner_entered',notes:'Authenticated Facebook browser is unavailable. Owner should open the Group as the named Page and use this package.'});
  assert.equal(action.state,'awaiting_owner'); assert.match(action.handoffText,/NO ACTION EXECUTED/); assert.match(action.handoffText,/No personal-profile fallback/);
  assert.equal(outcome(action,'submission_started').state,'submission_started');
});

test('post moderation pending does not change publication, receipts, or Page queue',()=>{
  const {g,p} = postFixture({eligibility:{...defaultGroupEligibility(),pagesCanJoin:'yes',participationApproval:'approved',postModeration:'required'}});
  const queueBefore = db.prepare('SELECT COUNT(*) AS n FROM publishing_destinations').get();
  let action = outcome(start(g,'post',p.id),'submission_started');
  action = outcome(action,'pending_approval',{url:g.url,notes:'Facebook accepted one post for moderator review. It is not yet publicly published.'});
  assert.equal(action.state,'pending_approval'); assert.equal(groups.package(p.id).publicationVerified,false);
  assert.match(groups.package(p.id).text,/REMOTE SUBMISSION WAS STARTED — RECONCILE ONLY/);
  assert.equal(groups.package(p.id).prepared.status,'prepared'); assert.equal(groups.package(p.id).receiptHistory.length,0);
  assert.deepEqual(db.prepare('SELECT COUNT(*) AS n FROM publishing_destinations').get(),queueBefore);
  assert.throws(()=>outcome(action,'submission_started'),/already started|held/);
});

test('published observation requires exact Group post evidence and remains unverified',()=>{
  const {g,p} = postFixture(); let action = outcome(start(g,'post',p.id),'submission_started');
  assert.throws(()=>outcome(action,'published'),/permalink is required/);
  assert.throws(()=>outcome(action,'published',{url:g.url}),/post\/thread permalink/);
  assert.throws(()=>outcome(action,'published',{url:'https://www.facebook.com/groups/another-group/posts/123'}),/captured Group/);
  assert.throws(()=>outcome(action,'published',{url:`${g.url}/posts/123?comment_id=4`}),/not a comment/);
  action = outcome(action,'published',{url:`${g.url}/posts/123`});
  assert.equal(action.state,'published'); assert.equal(action.publicationVerified,false);
  assert.equal(groups.package(p.id).prepared.status,'prepared'); assert.equal(groups.package(p.id).receiptHistory.length,0);
  assert.throws(()=>outcome(action,'published',{url:`${g.url}/posts/123`}),/closed/);
});

test('different request keys and cloned prepared IDs cannot bypass post duplicate prevention',()=>{
  const {g,p} = postFixture(), action = start(g,'post',p.id);
  assert.throws(()=>start(g,'post',p.id),/already exists/);
  const clone = groups.prepare(g.id,{kind:'post',content:p.content,relevance:'Same content cloned accidentally',revision:g.revision});
  assert.throws(()=>start(g,'post',clone.id),/identical native post intent/);
  assert.equal(groups.package(p.id).nativeActions?.[0].id,action.id);
});

test('post and join result kinds cannot be confused, and outcomes require an original submission intent',()=>{
  const g = group(), join = start(g);
  assert.throws(()=>outcome(join,'request_pending'),/original submission intent/);
  assert.throws(()=>outcome(outcome(join,'submission_started'),'published',{url:`${g.url}/posts/2`}),/action kind/);
  const {g:pg,p} = postFixture(), post = outcome(start(pg,'post',p.id),'submission_started');
  assert.throws(()=>outcome(post,'membership_approved'),/action kind/);
});

test('revision, rules, observation time, evidence source and changed actor are checked before submission',()=>{
  const g = group(), action = start(g);
  assert.throws(()=>native.prepare(g.id,{kind:'join',revision:999,requestKey:randomUUID()}),/revision changed/);
  assert.throws(()=>outcome(action,'submission_started',{revision:999}),/revision changed/);
  assert.throws(()=>outcome(action,'submission_started',{confirmRules:false}),/rules were not confirmed/);
  assert.throws(()=>outcome(action,'submission_started',{observedAt:'2026-11-03T10:00:00'}),/explicit timezone/);
  assert.throws(()=>outcome(action,'submission_started',{source:'api_verified' as any}),/actual observation source/);
  assert.equal(ledger.get(action.id)?.events.length,0);
  groups.save(g.id,{name:g.name,url:g.url,identityType:'page',accountId:'native-page-b',revision:g.revision});
  assert.throws(()=>outcome(action,'submission_started'),/acting Page changed/);
});

test('Group-specific relevance and current immutable handoff are required before native post',()=>{
  const g = group({membership:'member'}), p = groups.prepare(g.id,{kind:'post',content:'No relevance given',revision:g.revision});
  const blocked = start(g,'post',p.id); assert.equal(blocked.state,'blocked'); assert.match(blocked.reasons.join(' '),/relevant/);
  const other = postFixture(); assert.throws(()=>start(g,'post',other.p.id),/exact Group/);
  const {g:current,p:prepared} = postFixture(); const action = start(current,'post',prepared.id);
  groups.observe(current.id,{status:'request_pending',observedAt:'2026-11-03',accountId:current.account_id!,revision:current.revision});
  assert.throws(()=>outcome(action,'submission_started'),/review changed/);
});

test('archived or externally changed Page accounts block pre-submit while preserving reconciliation',()=>{
  const g = group(), action = start(g);
  db.prepare("UPDATE accounts SET archived_at='2026-11-03T01:00:00Z' WHERE id='native-page-a'").run();
  try { assert.throws(()=>outcome(action,'submission_started'),/Page is unavailable/); }
  finally { db.prepare("UPDATE accounts SET archived_at=NULL WHERE id='native-page-a'").run(); }
  db.prepare("UPDATE accounts SET external_id='changed-external-identity' WHERE id='native-page-a'").run();
  try { assert.throws(()=>outcome(action,'submission_started'),/external identity changed/); }
  finally { db.prepare("UPDATE accounts SET external_id=NULL WHERE id='native-page-a'").run(); }
  const started = outcome(action,'submission_started');
  db.prepare("UPDATE accounts SET archived_at='2026-11-03T01:00:00Z',external_id='later-external-identity' WHERE id='native-page-a'").run();
  try { assert.equal(outcome(started,'request_pending',{url:g.url}).state,'request_pending'); }
  finally { db.prepare("UPDATE accounts SET archived_at=NULL,external_id=NULL WHERE id='native-page-a'").run(); }
});

test('one known pre-submit failure is preserved without permitting another automatic attempt',()=>{
  const g = group(), action = outcome(start(g),'failed_before_submission',{notes:'Facebook was not opened. Owner must review why the browser is unavailable.'});
  assert.equal(action.state,'failed_before_submission'); assert.throws(()=>start(g),/already exists/);
  assert.equal(native.list(g.id)[0].events.length,1);
});

test('an explicitly reviewed unsent replacement unblocks corrected rules without mutating the original intent',()=>{
  const g = group({rules:'',rulesReviewedAt:null}), original = start(g), originalAudit = db.prepare("SELECT detail_json FROM content_workspace_audit WHERE entity_id=? AND action='group_native_intent_saved'").get(original.id);
  assert.equal(original.state,'blocked');
  const reviewed = groups.save(g.id,{name:g.name,url:g.url,identityType:'page',accountId:g.account_id,membership:'not_member',rules:'Original entertainment is welcome; no promotion',rulesReviewedAt:'2026-11-03',eligibility:g.eligibility,revision:g.revision});
  const input = {kind:'join' as const,revision:reviewed.revision,requestKey:randomUUID(),supersedesActionId:original.id,expectedActionRevision:original.revision,confirmIdentity:true,confirmRules:true};
  assert.throws(()=>native.prepare(g.id,{...input,confirmRules:false}),/Confirm the current unsent intent/);
  assert.throws(()=>native.prepare(g.id,{...input,expectedActionRevision:99}),/Confirm the current unsent intent/);
  const replacement = native.prepare(g.id,input);
  assert.equal(replacement.state,'prepared'); assert.equal(replacement.supersedesActionId,original.id);
  assert.equal(ledger.get(original.id)?.supersededById,replacement.id);
  assert.match(groupNativeActionExport(ledger.get(original.id)!),/SUPERSEDED — DO NOT SUBMIT/);
  assert.match(groupNativeActionExport(replacement),new RegExp(`replacement of ${original.id}`));
  assert.deepEqual(db.prepare("SELECT detail_json FROM content_workspace_audit WHERE entity_id=? AND action='group_native_intent_saved'").get(original.id),originalAudit);
  assert.deepEqual(native.prepare(g.id,input),replacement);
  assert.throws(()=>outcome(original,'submission_started'),/superseded/);
  assert.equal(outcome(replacement,'submission_started').state,'submission_started');
});

test('reviewed post replacement captures current rules while preserving the original prepared snapshot',()=>{
  let {g,p} = postFixture({rules:'',rulesReviewedAt:null,reviewedAt:null});
  const original = start(g,'post',p.id), snapshot = JSON.stringify(p.handoffContext);
  g = groups.save(g.id,{name:g.name,url:g.url,identityType:'page',accountId:g.account_id,membership:'member',rules:'Relevant original entertainment only',rulesReviewedAt:'2026-11-03',eligibility:g.eligibility,revision:g.revision});
  // Changing requirements clears review; a separate owner completion binds the corrected context.
  g = groups.save(g.id,{name:g.name,url:g.url,identityType:'page',accountId:g.account_id,membership:'member',rules:g.rules,rulesReviewedAt:g.rules_reviewed_at,eligibility:g.eligibility,reviewedAt:'2026-11-03T01:00:00Z',revision:g.revision});
  const replacement = native.prepare(g.id,{kind:'post',preparedId:p.id,revision:g.revision,requestKey:randomUUID(),supersedesActionId:original.id,expectedActionRevision:original.revision,confirmIdentity:true,confirmRules:true});
  assert.equal(replacement.state,'prepared'); assert.match(replacement.handoffText,/explicitly re-reviewed/);
  assert.equal(JSON.stringify(groups.prepared(g.id)[0].handoffContext),snapshot);
  assert.equal(outcome(replacement,'submission_started').state,'submission_started');
});

test('review replacement cannot bypass started, uncertain, pending or remotely completed attempts',()=>{
  for (const state of ['submission_started','uncertain','request_pending','membership_approved','membership_rejected'] as const) {
    const g = group(); let action = outcome(start(g),'submission_started');
    if (state !== 'submission_started') action = outcome(action,state,{url:g.url});
    assert.throws(()=>native.prepare(g.id,{kind:'join',revision:g.revision,requestKey:randomUUID(),supersedesActionId:action.id,expectedActionRevision:action.revision,confirmIdentity:true,confirmRules:true}),/Only a never-submitted handoff/);
  }
});

test.after(()=>db.close());
