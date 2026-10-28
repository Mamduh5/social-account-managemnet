import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase } from '../server/src/db/schema.js';
import { db, dataDir } from '../server/src/db/database.js';
import { groupsWorkspaceService as groups } from '../server/src/services/groups-workspace.service.js';
import { contentWorkspaceRepo as workspace } from '../server/src/repositories/content-workspace.repo.js';
import { defaultGroupEligibility, type GroupPlanDto, type GroupPlanInput } from '../server/src/domain/groups.js';

assert.ok(process.env.SCC_DATA_DIR && /test-runs/.test(dataDir),'An isolated Groups test directory is required');
initializeDatabase();
db.prepare("INSERT INTO accounts(id,platform,account_type,name,handle) VALUES ('external-page-a','facebook','page','External Page A','epa'),('external-page-b','facebook','page','External Page B','epb')").run();
const input=(slug:string,accountId='external-page-a'):GroupPlanInput=>({name:`External ${slug}`,url:`https://www.facebook.com/groups/${slug}`,identityType:'page',accountId,membership:'unknown',rules:'Relevant posts only',rulesReviewedAt:'2026-10-27',eligibility:defaultGroupEligibility()});
const saveInput=(g:GroupPlanDto):GroupPlanInput=>({name:g.name,url:g.url,identityType:g.identity_type,accountId:g.account_id,membership:g.membership,category:g.category,notes:g.notes,rules:g.rules,rulesReviewedAt:g.rules_reviewed_at,shortlisted:g.shortlisted,archived:!!g.archivedAt,reviewedAt:g.reviewedAt,eligibility:g.eligibility,revision:g.revision});
const count=(table:string)=>(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n;

test('external registration canonicalizes supported variants while retaining original URLs and per-Page isolation',()=>{
  const original='https://m.facebook.com/groups/External.Identity/posts/123?ref=share#section';
  const a=groups.save(undefined,{...input('external.identity'),url:original});
  assert.equal(a.canonicalKey,'slug:external.identity');assert.equal(a.originalUrl,original);assert.equal(a.url,original);
  assert.throws(()=>groups.save(undefined,input('EXTERNAL.IDENTITY')),/active plan already exists/);
  const b=groups.save(undefined,input('external.identity','external-page-b'));
  assert.notEqual(a.id,b.id);assert.equal(b.account_id,'external-page-b');
  assert.equal(b.membership,'unknown');assert.equal(b.membershipObservations[0].accountId,'external-page-b');
  const numeric=groups.save(undefined,input('123456789'));
  assert.equal(numeric.canonicalKey,'id:123456789');assert.notEqual(numeric.canonicalKey,a.canonicalKey);
  const changed=groups.save(a.id,{...saveInput(a),url:'https://www.facebook.com/groups/external.identity/'});
  assert.equal(changed.originalUrl,original);assert.equal(changed.id,a.id);
});

test('shortlist, category, review, archive and query filters remain local and safe to restore',()=>{
  let g=groups.save(undefined,{...input('filter-group'),category:'Local developers',shortlisted:true,reviewedAt:'2026-10-27T10:00:00+07:00'});
  assert.equal(groups.list({query:'filter-group',shortlisted:true,category:'Local developers',archived:false}).length,1);
  g=groups.save(g.id,{...saveInput(g),archived:true});
  assert.ok(g.archivedAt);assert.equal(groups.list({query:'filter-group',archived:false}).length,0);
  assert.equal(groups.list({query:'filter-group',archived:true}).length,1);
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Draft'}),/Restore/);
  const replacement=groups.save(undefined,input('filter-group'));
  assert.throws(()=>groups.save(g.id,{...saveInput(g),archived:false}),/active plan already exists/);
  assert.ok(groups.review(replacement.id).group);
});

test('membership history records all eight statuses with source, date and exact acting Page',()=>{
  let g=groups.save(undefined,input('membership-history'));
  for (const status of ['not_member','request_pending','member','admin','request_rejected','request_withdrawn','participation_restricted','unknown'] as const) {
    const previous=g.revision;
    g=groups.observe(g.id,{status,observedAt:'2026-10-27',accountId:'external-page-a',notes:`Owner observed ${status}`,revision:g.revision});
    assert.equal(g.membership,status);assert.equal(g.revision,previous+1);
  }
  assert.equal(g.membershipObservations.length,9);
  assert.ok(g.membershipObservations.every(o=>o.accountId==='external-page-a'&&o.source==='owner_entered'&&!o.verified));
  assert.throws(()=>groups.observe(g.id,{status:'member',observedAt:'2026-10-27',accountId:'external-page-b'}),/must match/);
  assert.throws(()=>groups.observe(g.id,{status:'member',observedAt:'2026-02-30'}),/valid/);
  assert.throws(()=>groups.observe(g.id,{status:'member',observedAt:'2026-10-27',revision:1}),/revision changed/);
});

test('Member is not publishing permission and a new observation requires Resume Review',()=>{
  let g=groups.save(undefined,{...input('review-after-approval'),membership:'request_pending',eligibility:{...defaultGroupEligibility(),pagesCanJoin:'yes',participationApproval:'not_required',postModeration:'required'}});
  g=groups.observe(g.id,{status:'member',observedAt:'2026-10-27',revision:g.revision});
  assert.equal(g.readiness.membershipAllowsParticipation,true);assert.equal(g.readiness.publishingPermission,'owner_review_required');
  assert.equal(g.reviewedAt,null);assert.equal(g.readiness.state,'needs_review');
  g=groups.save(g.id,{...saveInput(g),reviewedAt:'2026-10-27T10:00:00+07:00'});
  assert.equal(g.readiness.state,'reviewed_for_manual_handoff');assert.equal(g.permissionVerified,false);
  assert.equal(g.readiness.verified,false);
  const p=groups.prepare(g.id,{kind:'post',content:'Still only prepared',revision:g.revision});
  assert.equal(p.status,'prepared');assert.equal(groups.package(p.id).publicationVerified,false);
  g=groups.observe(g.id,{status:'member',observedAt:'2026-10-28',revision:g.revision});
  assert.equal(g.reviewedAt,null);
});

test('acting Page changes never inherit another Page membership and old observations survive',()=>{
  const a=groups.save(undefined,{...input('acting-page-change'),membership:'admin'});
  const b=groups.save(a.id,{...saveInput(a),accountId:'external-page-b',membership:'admin'});
  assert.equal(b.membership,'unknown');assert.equal(b.account_id,'external-page-b');
  assert.equal(b.membershipObservations[0].status,'admin');assert.equal(b.membershipObservations[0].accountId,'external-page-a');
  assert.equal(b.membershipObservations.at(-1)?.status,'unknown');assert.equal(b.membershipObservations.at(-1)?.accountId,'external-page-b');
});

test('changing the Group identity resets membership and review without rewriting its old history or snapshot',()=>{
  const g=groups.save(undefined,{...input('original-identity'),membership:'admin',reviewedAt:'2026-10-27T10:00:00+07:00'});
  const prepared=groups.prepare(g.id,{kind:'post',content:'Original Group only'}),snapshot=JSON.stringify(prepared.handoffContext);
  const changed=groups.save(g.id,{...saveInput(g),url:'https://www.facebook.com/groups/new-identity',membership:'admin'});
  assert.equal(changed.membership,'unknown');assert.equal(changed.reviewedAt,null);assert.equal(changed.id,g.id);
  assert.equal(changed.originalUrl,g.originalUrl);assert.equal(changed.membershipObservations[0].status,'admin');
  assert.equal(changed.membershipObservations.at(-1)?.status,'unknown');
  assert.equal(JSON.stringify(groups.prepared(g.id)[0].handoffContext),snapshot);
  assert.ok(groups.package(prepared.id).driftWarnings.some(w=>/Group identity/.test(w)));
});

const approvedEligibility=()=>({...defaultGroupEligibility(),pagesCanJoin:'yes' as const,participationApproval:'approved' as const,postModeration:'not_required' as const,
  promotionalRestrictions:'Relevant work only',questions:[{question:'Why should this identity join?',answer:'Page A creates relevant work'}]});

test('Page changes clear actor approval and answers even when an old full form and new review date are submitted',()=>{
  const a=groups.save(undefined,{...input('approval-page-change'),membership:'admin',eligibility:approvedEligibility(),reviewedAt:'2026-10-27T10:00:00Z'});
  const prepared=groups.prepare(a.id,{kind:'post',content:'Page A snapshot'});
  const snapshot=JSON.stringify(prepared.handoffContext),observations=JSON.stringify(a.membershipObservations);
  const audit=db.prepare('SELECT * FROM content_workspace_audit ORDER BY rowid').all();
  let b=groups.save(a.id,{...saveInput(a),accountId:'external-page-b',reviewedAt:'2026-10-28T10:00:00Z'});
  assert.equal(b.membership,'unknown');assert.equal(b.reviewedAt,null);
  assert.equal(b.eligibility.participationApproval,'unknown');assert.equal(b.eligibility.questions[0].answer,'');
  assert.equal(b.eligibility.questions[0].question,a.eligibility.questions[0].question);
  assert.equal(b.eligibility.pagesCanJoin,'yes');assert.equal(b.eligibility.postModeration,'not_required');
  assert.equal(JSON.stringify(b.membershipObservations.slice(0,a.membershipObservations.length)),observations);
  assert.equal(b.membershipObservations[0].accountId,'external-page-a');
  assert.equal(JSON.stringify(groups.prepared(a.id)[0].handoffContext),snapshot);
  for (const row of audit as {id:string}[]) assert.deepEqual(db.prepare('SELECT * FROM content_workspace_audit WHERE id=?').get(row.id),row);
  b=groups.observe(b.id,{status:'member',observedAt:'2026-10-28',revision:b.revision});
  b=groups.save(b.id,{...saveInput(b),reviewedAt:'2026-10-28T11:00:00Z'});
  assert.notEqual(b.readiness.state,'reviewed_for_manual_handoff');
});

test('canonical Group changes clear Group eligibility and rules review while retaining original observation context',()=>{
  const original=groups.save(undefined,{...input('approval-original-group'),membership:'admin',eligibility:approvedEligibility(),reviewedAt:'2026-10-27T10:00:00Z'});
  const observed=groups.observe(original.id,{status:'member',observedAt:'2026-10-27',revision:original.revision});
  const prepared=groups.prepare(original.id,{kind:'post',content:'Original Group snapshot'}),snapshot=JSON.stringify(prepared.handoffContext);
  const changed=groups.save(original.id,{...saveInput(observed),url:'https://www.facebook.com/groups/approval-new-group',reviewedAt:'2026-10-28T10:00:00Z'});
  assert.equal(changed.membership,'unknown');assert.equal(changed.reviewedAt,null);
  assert.deepEqual(changed.eligibility,defaultGroupEligibility());
  assert.equal(changed.rules,'');assert.equal(changed.rules_reviewed_at,null);
  assert.equal(changed.membershipObservations[0].groupIdentity?.canonicalKey,original.canonicalKey);
  assert.equal(changed.membershipObservations[0].groupIdentity?.url,original.url);
  assert.equal(changed.membershipObservations[1].groupIdentity?.canonicalKey,original.canonicalKey);
  assert.equal(changed.membershipObservations.at(-1)?.groupIdentity?.canonicalKey,changed.canonicalKey);
  assert.equal(JSON.stringify(groups.prepared(original.id)[0].handoffContext),snapshot);
});

test('Page and personal transitions never inherit actor approval or membership-question answers',()=>{
  const a=groups.save(undefined,{...input('approval-personal-transition'),membership:'member',eligibility:approvedEligibility(),reviewedAt:'2026-10-27T10:00:00Z'});
  const personal=groups.save(a.id,{...saveInput(a),identityType:'personal',accountId:null});
  assert.equal(personal.account_id,null);assert.equal(personal.membership,'unknown');assert.equal(personal.reviewedAt,null);
  assert.equal(personal.eligibility.participationApproval,'unknown');assert.equal(personal.eligibility.questions[0].answer,'');
  assert.equal(personal.membershipObservations.length,a.membershipObservations.length);
  const personalReviewed=groups.save(personal.id,{...saveInput(personal),membership:'member',eligibility:approvedEligibility(),reviewedAt:'2026-10-28T10:00:00Z'});
  const b=groups.save(personal.id,{...saveInput(personalReviewed),identityType:'page',accountId:'external-page-b'});
  assert.equal(b.membership,'unknown');assert.equal(b.reviewedAt,null);
  assert.equal(b.eligibility.participationApproval,'unknown');assert.equal(b.eligibility.questions[0].answer,'');
  assert.equal(b.membershipObservations.at(-1)?.accountId,'external-page-b');
});

test('same canonical Group variants and ordinary edits preserve reviewed eligibility',()=>{
  const a=groups.save(undefined,{...input('approval-preserved'),membership:'member',eligibility:approvedEligibility(),reviewedAt:'2026-10-27T10:00:00Z'});
  const same=groups.save(a.id,{...saveInput(a),url:'https://m.facebook.com/groups/APPROVAL-PRESERVED/?ref=share',notes:'Changed local note'});
  assert.equal(same.membership,'member');assert.deepEqual(same.eligibility,a.eligibility);
  assert.equal(same.reviewedAt,a.reviewedAt);assert.equal(same.rules,a.rules);assert.equal(same.rules_reviewed_at,a.rules_reviewed_at);
});

test('preserved legacy duplicate exemptions cannot be used to register a third active Group/Page record',()=>{
  const first=groups.save(undefined,input('legacy-duplicate-guard'));
  db.prepare('UPDATE group_plan_extensions SET legacy_duplicate=1 WHERE group_id=?').run(first.id);
  const legacy=workspace.saveGroup(undefined,{name:'Preserved duplicate',url:first.url,identityType:'page',accountId:first.account_id,membership:'unknown',category:'',notes:'',rules:'',rulesReviewedAt:null});
  db.prepare(`INSERT INTO group_plan_extensions(group_id,canonical_key,canonical_url,original_url,acting_page_id,eligibility_json,legacy_duplicate)
    SELECT ?,canonical_key,canonical_url,original_url,acting_page_id,eligibility_json,1 FROM group_plan_extensions WHERE group_id=?`).run(legacy.id,first.id);
  assert.throws(()=>groups.save(undefined,input('legacy-duplicate-guard')),/active plan already exists/);
  assert.equal(groups.list({query:'legacy-duplicate-guard'}).length,2);
  assert.equal(workspace.group(first.id).id,first.id);assert.equal(workspace.group(legacy.id).id,legacy.id);
});

test('reply receipts reject a different post or saved comment target without writing history',()=>{
  const g=groups.save(undefined,input('reply-target'));
  const p=groups.prepare(g.id,{kind:'reply',content:'Manual reply',threadUrl:'https://www.facebook.com/groups/reply-target/posts/100?comment_id=200'});
  const receipt=(url:string)=>groups.receipt(p.id,{url,confirmOwnerEntered:true});
  assert.throws(()=>receipt('https://www.facebook.com/groups/reply-target/posts/101?comment_id=200'),/original post/);
  assert.throws(()=>receipt('https://www.facebook.com/groups/reply-target/posts/100?comment_id=201'),/original post/);
  assert.equal(groups.prepared(g.id)[0].receiptHistory.length,0);
  assert.equal(receipt('https://m.facebook.com/groups/reply-target/permalink/100?comment_id=200&reply_comment_id=300').receiptHistory.length,1);
});

test('post and unchanged parent receipts cannot complete reply handoffs or close their reminders',()=>{
  const g=groups.save(undefined,input('reply-completion'));
  const thread='https://www.facebook.com/groups/reply-completion/posts/100';
  const top=groups.prepare(g.id,{kind:'reply',content:'Top-level comment draft',threadUrl:thread,reminderAt:'2026-10-28T10:00:00+07:00'});
  const nested=groups.prepare(g.id,{kind:'reply',content:'Nested reply draft',threadUrl:thread+'?comment_id=200',reminderAt:'2026-10-28T10:00:00+07:00'});
  const receipts=count('group_receipt_events'),audit=count('content_workspace_audit');
  assert.throws(()=>groups.receipt(top.id,{url:thread,confirmOwnerEntered:true}),/original post/);
  assert.throws(()=>groups.receipt(nested.id,{url:thread+'?comment_id=200',confirmOwnerEntered:true}),/original post/);
  assert.equal(count('group_receipt_events'),receipts);assert.equal(count('content_workspace_audit'),audit);
  assert.ok(groups.reminders().some(r=>r.preparedId===top.id));assert.ok(groups.reminders().some(r=>r.preparedId===nested.id));
  assert.equal(groups.package(top.id).prepared.status,'prepared');assert.equal(groups.package(nested.id).prepared.status,'prepared');
  const completed=groups.receipt(top.id,{url:thread+'?comment_id=201',confirmOwnerEntered:true});
  assert.equal(completed.status,'receipt_recorded_unverified');assert.equal(completed.latestReceipt?.verified,false);
  assert.equal(groups.reminders().some(r=>r.preparedId===top.id),false);
  const reply=groups.receipt(nested.id,{url:thread+'?comment_id=200&reply_comment_id=300',confirmOwnerEntered:true});
  assert.equal(reply.status,'receipt_recorded_unverified');assert.equal(reply.latestReceipt?.verified,false);
});

test('reading historical parent-only receipts preserves their original completion state and snapshot',()=>{
  const g=groups.save(undefined,input('historical-reply-receipt'));
  const thread='https://www.facebook.com/groups/historical-reply-receipt/posts/100?comment_id=200';
  const p=groups.prepare(g.id,{kind:'reply',content:'Historical draft',threadUrl:thread,reminderAt:'2026-10-28T10:00:00+07:00'});
  workspace.receipt(p.id,thread,'Previously recorded owner statement');
  db.prepare("INSERT INTO group_receipt_events(id,prepared_id,url,note) VALUES (?,?,?,?)").run('historical-parent-only',p.id,thread,'Previously recorded owner statement');
  const before=db.prepare('SELECT * FROM group_prepared_content WHERE id=?').get(p.id),history=groups.prepared(g.id)[0].receiptHistory;
  const snapshot=JSON.stringify(p.handoffContext),audit=count('content_workspace_audit');
  const pack=groups.package(p.id);
  assert.equal(pack.prepared.status,'receipt_recorded_unverified');assert.equal(pack.publicationVerified,false);
  assert.deepEqual(pack.receiptHistory,history);assert.equal(JSON.stringify(pack.prepared.handoffContext),snapshot);
  assert.deepEqual(db.prepare('SELECT * FROM group_prepared_content WHERE id=?').get(p.id),before);
  assert.equal(groups.reminders().some(r=>r.preparedId===p.id),false);assert.equal(count('content_workspace_audit'),audit);
});

test('uncaptured historical observation identity is never inferred from a later Group URL',()=>{
  const g=groups.save(undefined,input('uncaptured-observation'));
  const insert=db.prepare("INSERT INTO group_membership_observations(id,group_id,account_id,status,observed_at,notes) VALUES (?,?,?,'member','2026-10-27','Historical owner observation')");
  insert.run('old-without-context',g.id,'external-page-a');insert.run('old-explicit-observation',g.id,'external-page-a');
  workspace.audit(g.id,'group_membership_observed_unverified',g.revision,{observationId:'old-explicit-observation',accountId:'external-page-a',canonicalKey:g.canonicalKey});
  const changed=groups.save(g.id,{...saveInput(g),url:'https://www.facebook.com/groups/uncaptured-new-group'});
  const old=changed.membershipObservations.find(o=>o.id==='old-without-context')!;
  assert.equal(old.accountId,'external-page-a');assert.equal(old.groupIdentity,null);assert.equal(old.notes,'Historical owner observation');
  assert.deepEqual(changed.membershipObservations.find(o=>o.id==='old-explicit-observation')?.groupIdentity,{canonicalKey:g.canonicalKey,url:null});
});

test('receipt corrections append an explicit superseding event and preserve the first legacy receipt fields',()=>{
  const g=groups.save(undefined,input('receipt-corrections')),p=groups.prepare(g.id,{kind:'post',content:'Caption'});
  const first={url:'https://www.facebook.com/groups/receipt-corrections/posts/100',note:'Initial owner note',confirmOwnerEntered:true};
  const initial=groups.receipt(p.id,first);
  const corrected=groups.receipt(p.id,{...first,url:'https://www.facebook.com/groups/receipt-corrections/posts/101',note:'Corrected owner note'});
  assert.equal(corrected.receiptHistory.length,2);assert.equal(corrected.latestReceipt?.supersedesId,initial.latestReceipt?.id);
  assert.equal(corrected.receipt_url,first.url);assert.equal(corrected.receipt_note,first.note);
  assert.equal(corrected.latestReceipt?.note,'Corrected owner note');
  assert.equal(groups.receipt(p.id,{...first,url:corrected.latestReceipt!.url,note:corrected.latestReceipt!.note}).receiptHistory.length,2);
  assert.ok(corrected.receiptHistory.every(event=>event.source==='owner_entered'&&!event.verified));
});

test('cancel and dismiss affect only their reminder and never create a publication or receipt',()=>{
  const g=groups.save(undefined,input('reminders'));
  const prepare=(content:string)=>groups.prepare(g.id,{kind:'post',content,reminderAt:'2026-10-27T10:00:00+07:00'});
  const a=prepare('A'),b=prepare('B'),c=prepare('C');
  const receipts=count('group_receipt_events'),destinations=count('publishing_destinations');
  assert.equal(groups.reminder(a.id,{state:'cancelled',note:'No longer needed'}).status,'prepared');
  assert.equal(groups.reminder(b.id,{state:'dismissed'}).status,'prepared');
  assert.equal(groups.reminders().some(r=>r.preparedId===a.id||r.preparedId===b.id),false);
  assert.equal(groups.reminders().some(r=>r.preparedId===c.id),true);
  assert.equal(count('group_receipt_events'),receipts);assert.equal(count('publishing_destinations'),destinations);
  assert.equal(groups.package(a.id).publicationStatus,'unpublished_manual_handoff');
});

test('handoff drift covers membership, observation, rules and eligibility while GET packages remain read-only',()=>{
  let g=groups.save(undefined,input('drift'));
  const p=groups.prepare(g.id,{kind:'post',content:'Saved snapshot'}),context=JSON.stringify(p.handoffContext);
  g=groups.observe(g.id,{status:'request_pending',observedAt:'2026-10-27'});
  g=groups.save(g.id,{...saveInput(g),rules:'New rules',eligibility:{...g.eligibility,questions:[{question:'Why join?',answer:'Relevant work'}],promotionalRestrictions:'No advertising'}});
  const audit=count('content_workspace_audit'),pack=groups.package(p.id);
  assert.equal(count('content_workspace_audit'),audit);
  assert.ok(pack.driftWarnings.some(w=>/membership changed/.test(w)));
  assert.ok(pack.driftWarnings.some(w=>/rules/.test(w)));
  assert.ok(pack.driftWarnings.some(w=>/eligibility/.test(w)));
  assert.equal(JSON.stringify(groups.prepared(g.id)[0].handoffContext),context);
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Stale selection',revision:1}),/revision changed/);
});

test('legacy version 1 snapshots and personal handoffs retain their original identities without inventing a profile',()=>{
  const g=groups.save(undefined,{...input('legacy-personal'),identityType:'personal',accountId:'external-page-a',membership:'member'});
  const p=workspace.prepare(g.id,'post','Legacy caption',null);
  const snapshot={version:1,group:{name:g.name,url:g.url,identityType:'personal',accountId:null,membership:'member',rules:g.rules,rulesReviewedAt:g.rules_reviewed_at,notes:g.notes},sourcePage:null,relevance:'',media:[],reminderAt:null};
  workspace.audit(p.id,'group_handoff_context_saved',null,snapshot);
  const before=JSON.stringify(groups.prepared(g.id)[0].handoffContext),pack=groups.package(p.id);
  assert.equal(pack.group.identityType,'personal');assert.equal(pack.group.accountId,null);assert.equal(pack.sourcePage,null);
  assert.equal(JSON.stringify(groups.prepared(g.id)[0].handoffContext),before);
  assert.ok(pack.driftWarnings.some(w=>/Legacy handoff/.test(w)));
  assert.throws(()=>groups.observe(g.id,{status:'member',observedAt:'2026-10-27'}),/personal handoffs remain manual/);
});

test('Groups operations do not change Page publishing destinations or Content Calendar drafts and never call fetch',()=>{
  const beforeDestinations=db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all();
  const beforeDrafts=db.prepare('SELECT * FROM publishing_drafts ORDER BY id').all();
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(()=>{throw new Error('No external calls are permitted by Groups planning');}) as typeof fetch;
  try {
    const g=groups.save(undefined,input('no-provider-work'));
    const p=groups.prepare(g.id,{kind:'post',content:'Local draft'});
    groups.package(p.id);groups.review(g.id);groups.list();groups.reminders();
    groups.observe(g.id,{status:'request_pending',observedAt:'2026-10-27'});
    assert.deepEqual(db.prepare('SELECT * FROM publishing_destinations ORDER BY id').all(),beforeDestinations);
    assert.deepEqual(db.prepare('SELECT * FROM publishing_drafts ORDER BY id').all(),beforeDrafts);
  } finally { globalThis.fetch=originalFetch; }
});
