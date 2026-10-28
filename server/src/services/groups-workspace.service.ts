import { textValue } from '../domain/content-assistant.js';
import { canonicalGroupIdentity, defaultGroupEligibility, groupMembershipStatuses, groupReadiness, groupReceiptMatchesThread, parseGroupThreadIdentity,
  type GroupEligibility, type GroupHandoffContext, type GroupListFilters, type GroupMembershipInput, type GroupMembershipStatus,
  type GroupPlanDto, type GroupPlanInput, type GroupPreparedDto, type GroupPrepareInput, type GroupReceiptInput, type GroupReminderInput } from '../domain/groups.js';
import { contentWorkspaceRepo as repo } from '../repositories/content-workspace.repo.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { groupsHandoffRepo as handoffs } from '../repositories/groups-handoff.repo.js';
import { groupsRegistryRepo as registry } from '../repositories/groups-registry.repo.js';

function ready() { if (!registry.ready()) throw new Error('External Groups requires the explicit offline owner-maintenance migration'); }
function pageIdentity(id: string) {
  const a=accountsRepo.getAccountById(id);
  if (!a || a.archived_at || a.is_demo || a.platform!=='facebook' || a.account_type!=='page') throw new Error('Select an active real Facebook Page');
  return {id:a.id,name:a.name,externalId:a.external_id || null};
}
function pageAvailable(id: string | null) { try { if (!id) return false;pageIdentity(id);return true; } catch { return false; } }
function group(id: string) { ready();const row=repo.group(id);if (!row) throw new Error('Group plan not found');return row; }
function plan(id: string): GroupPlanDto {
  const g=group(id),extension=registry.extension(id);
  if (!extension) throw new Error('Group metadata requires the explicit offline owner-maintenance migration');
  const eligibility: GroupEligibility=JSON.parse(extension.eligibility_json);
  return {...g,canonicalKey:extension.canonical_key,canonicalUrl:extension.canonical_url,originalUrl:extension.original_url,
    actingPageId:extension.acting_page_id,shortlisted:!!extension.shortlisted,archivedAt:extension.archived_at,
    reviewedAt:extension.reviewed_at,revision:extension.revision,legacyDuplicate:!!extension.legacy_duplicate,
    eligibility,membershipObservations:registry.observations(id),
    readiness:groupReadiness({identityType:g.identity_type,membership:g.membership,eligibility,rules:g.rules,rulesReviewedAt:g.rules_reviewed_at,
      reviewedAt:extension.reviewed_at,archivedAt:extension.archived_at,actingPageAvailable:g.identity_type==='personal'||pageAvailable(g.account_id)}),
    permissionVerified:false,source:'owner_entered',automationSupported:false};
}
function preparedContext(p: ReturnType<typeof repo.preparedById>): GroupPreparedDto {
  const context=handoffs.context(p.id) as GroupHandoffContext|undefined,receiptHistory=registry.receipts(p.id);
  return {...p,handoffContext:context || null,contextCaptured:!!context,receiptHistory,
    latestReceipt:receiptHistory.at(-1)||null,reminderState:registry.reminderState(p.id)};
}
function selectedMedia(input: GroupPrepareInput) {
  const items=input.media || [];
  if (!Array.isArray(items) || items.length>10) throw new Error('Select at most ten existing media items');
  const keys=new Set<string>();
  return items.map(item=>{
    if (!item || !['image','video'].includes(item.kind) || typeof item.id!=='string') throw new Error('Select an existing image or video');
    const row=handoffs.media(item.kind,item.id),key=`${item.kind}:${item.id}`;
    if (!row || keys.has(key)) throw new Error('Media is missing or selected more than once');
    keys.add(key);
    return {kind:item.kind,id:row.id as string,title:row.title as string,url:item.kind==='image'?`/api/publishing/images/${encodeURIComponent(row.id)}/content`:`/api/publishing/videos/${encodeURIComponent(row.id)}/stream`};
  });
}
function membership(value: unknown): GroupMembershipStatus {
  if (!groupMembershipStatuses.includes(value as GroupMembershipStatus)) throw new Error('Select owner-entered membership status');
  return value as GroupMembershipStatus;
}
function date(value: unknown, label: string, dateOnly = false): string | null {
  if (value===undefined || value===null || value==='') return null;
  if (typeof value!=='string' || !Number.isFinite(Date.parse(value))) throw new Error(`Use a valid ${label}`);
  const isDate=/^\d{4}-\d{2}-\d{2}$/.test(value);
  if ((dateOnly && !isDate) || (isDate && new Date(value).toISOString().slice(0,10)!==value) || (!isDate && !/(Z|[+-]\d\d:\d\d)$/.test(value))) throw new Error(`Use a valid ${label}${dateOnly?'':' with an explicit timezone'}`);
  return isDate?value:new Date(value).toISOString();
}
function eligibility(input: GroupEligibility | undefined, fallback: GroupEligibility): GroupEligibility {
  if (input===undefined) return fallback;
  if (!input || !['unknown','yes','no'].includes(input.pagesCanJoin) || !['unknown','required','not_required','approved','restricted'].includes(input.participationApproval) || !['unknown','required','not_required'].includes(input.postModeration)) throw new Error('Select valid owner-entered Group eligibility');
  if (!Array.isArray(input.questions) || input.questions.length>20) throw new Error('Record at most twenty membership questions');
  return {pagesCanJoin:input.pagesCanJoin,participationApproval:input.participationApproval,postModeration:input.postModeration,
    promotionalRestrictions:textValue(input.promotionalRestrictions||'','Promotional restrictions',6000),
    questions:input.questions.map(item=>({question:textValue(item?.question,'Membership question',2000,true),answer:textValue(item?.answer||'','Owner-provided answer',4000)}))};
}
function checkRevision(current: GroupPlanDto, input: {revision?:number;expectedRevision?:number}) {
  const expected=input.expectedRevision ?? input.revision;
  if (expected!==undefined && (!Number.isInteger(expected) || expected!==current.revision)) throw new Error('Group revision changed; reload before saving or preparing');
}
function sameGroup(groupUrl: string, contentUrl: string) {
  if (canonicalGroupIdentity(groupUrl).canonicalKey!==canonicalGroupIdentity(contentUrl).canonicalKey) throw new Error('The thread/receipt URL must belong to the registered group');
}
function observeMembership(groupId: string, accountId: string, status: GroupMembershipStatus, observedAt: string, notes: string, canonicalKey: string | null, url: string) {
  const observationId=registry.observe(groupId,accountId,status,observedAt,notes);
  // Bind new history to the identity observed without altering the append-only tables.
  repo.audit(observationId,'group_membership_identity_saved',null,{groupId,accountId,canonicalKey,url});
  return observationId;
}
function drift(snapshot: GroupHandoffContext['group'], current: GroupPlanDto): string[] {
  const warnings:string[]=[];
  if (snapshot.url!==current.url || snapshot.identityType!==current.identity_type || snapshot.accountId!==current.account_id) warnings.push('Group identity or acting Page changed since preparation.');
  if (snapshot.membership!==current.membership) warnings.push('Owner-recorded membership changed since preparation.');
  if (snapshot.rules!==current.rules || snapshot.rulesReviewedAt!==current.rules_reviewed_at) warnings.push('Group rules or rules review date changed since preparation.');
  if (snapshot.eligibility && JSON.stringify(snapshot.eligibility)!==JSON.stringify(current.eligibility)) warnings.push('Group eligibility, questions, participation approval or moderation changed since preparation.');
  if (snapshot.membershipObservationId!==undefined && snapshot.membershipObservationId!==(current.membershipObservations.filter(o=>o.accountId===current.account_id).at(-1)?.id||null)) warnings.push('A new owner-entered membership observation was recorded.');
  if (snapshot.reviewedAt!==undefined && snapshot.reviewedAt!==current.reviewedAt) warnings.push('Owner review date changed since preparation.');
  if (current.archivedAt) warnings.push('This Group plan is now archived.');
  if (!snapshot.eligibility) warnings.push('Legacy handoff did not capture eligibility or membership-observation history; review current requirements.');
  return warnings;
}

export const groupsWorkspaceService = {
  ready: () => registry.ready(),
  list(filters: GroupListFilters = {}): GroupPlanDto[] {
    ready();let rows=repo.groups().map(g=>plan(g.id));
    if (filters.archived!==undefined) rows=rows.filter(g=>!!g.archivedAt===filters.archived);
    if (filters.accountId) rows=rows.filter(g=>g.account_id===filters.accountId);
    if (filters.membership) rows=rows.filter(g=>g.membership===filters.membership);
    if (filters.shortlisted!==undefined) rows=rows.filter(g=>g.shortlisted===filters.shortlisted);
    if (filters.category) rows=rows.filter(g=>g.category===filters.category);
    if (filters.query) { const q=filters.query.toLocaleLowerCase();rows=rows.filter(g=>[g.name,g.url,g.category,g.notes].some(v=>v.toLocaleLowerCase().includes(q))); }
    return rows;
  },
  save(id: string | undefined,input: GroupPlanInput): GroupPlanDto {
    ready();return registry.transaction(()=>{
      const current=id?plan(id):null;if (current) checkRevision(current,input);
      if (!['page','personal'].includes(input.identityType)) throw new Error('Select Page or personal profile as intended identity');
      const accountId=input.identityType==='page'?pageIdentity(input.accountId || '').id:null;
      const actorChanged=!!current&&(current.account_id!==accountId || current.identity_type!==input.identityType);
      const canonical=canonicalGroupIdentity(input.url),groupChanged=!!current&&current.canonicalKey!==canonical.canonicalKey;
      const status=actorChanged||groupChanged?'unknown':membership(input.membership ?? current?.membership ?? 'unknown');
      const archivedAt=input.archived===undefined?current?.archivedAt||null:input.archived?current?.archivedAt||new Date().toISOString():null;
      if (input.shortlisted!==undefined && typeof input.shortlisted!=='boolean') throw new Error('Shortlist must be a boolean');
      if (input.archived!==undefined && typeof input.archived!=='boolean') throw new Error('Archive status must be a boolean');
      const identityChanged=!current || groupChanged || actorChanged || !!current.archivedAt!==!!archivedAt;
      if (!archivedAt && accountId && identityChanged && registry.duplicate(canonical.canonicalKey,accountId,id||'')) throw new Error('An active plan already exists for this Group and acting Page');
      const suppliedEligibility=eligibility(input.eligibility,current?.eligibility||defaultGroupEligibility());
      const nextEligibility=groupChanged?defaultGroupEligibility():actorChanged?{...suppliedEligibility,participationApproval:'unknown' as const,
        questions:suppliedEligibility.questions.map(item=>({...item,answer:''}))}:suppliedEligibility;
      const rules=groupChanged?'':textValue(input.rules||'','Rules',12000);
      const rulesReviewedAt=groupChanged?null:date(input.rulesReviewedAt,'rules review date',true);
      const requirementsChanged=!!current&&(actorChanged || groupChanged || status!==current.membership || rules!==current.rules || rulesReviewedAt!==current.rules_reviewed_at || JSON.stringify(nextEligibility)!==JSON.stringify(current.eligibility));
      const explicitReview=input.reviewedAt!==undefined&&input.reviewedAt!==current?.reviewedAt;
      // An identity change always needs a subsequent review of the reset context.
      const reviewedAt=actorChanged||groupChanged||requirementsChanged&&!explicitReview?null:input.reviewedAt===undefined?current?.reviewedAt||null:date(input.reviewedAt,'owner review date');
      const row=repo.saveGroup(id,{name:textValue(input.name,'Group name',200,true),url:input.url,identityType:input.identityType,accountId,membership:status,
        category:textValue(input.category||'','Category',200),notes:textValue(input.notes||'','Notes',6000),rules,rulesReviewedAt});
      const revision=(current?.revision||0)+1;
      registry.saveExtension({group_id:row.id,canonical_key:canonical.canonicalKey,canonical_url:canonical.canonicalUrl,original_url:current?.originalUrl||input.url,
        acting_page_id:accountId,shortlisted:input.shortlisted===undefined?(current?.shortlisted?1:0):input.shortlisted?1:0,archived_at:archivedAt,reviewed_at:reviewedAt,
        eligibility:nextEligibility,revision,legacy_duplicate:identityChanged?0:current?.legacyDuplicate?1:0});
      if (current && (actorChanged || groupChanged)) repo.audit(row.id,'group_identity_context_reset',revision,{
        previous:{canonicalKey:current.canonicalKey,url:current.url,identityType:current.identity_type,accountId:current.account_id,membership:current.membership,
          eligibility:current.eligibility,rules:current.rules,rulesReviewedAt:current.rules_reviewed_at,reviewedAt:current.reviewedAt},
        current:{canonicalKey:canonical.canonicalKey,url:input.url,identityType:input.identityType,accountId},source:'owner_entered',verified:false});
      if (accountId && (!current || actorChanged || groupChanged || current.membership!==status)) observeMembership(row.id,accountId,status,new Date().toISOString(),'Recorded with Group plan save',canonical.canonicalKey,input.url);
      repo.audit(row.id,'group_plan_revision_saved_unverified',revision,{canonicalKey:canonical.canonicalKey,accountId,membership:status,archived:!!archivedAt,source:'owner_entered',verified:false});
      return plan(row.id);
    });
  },
  observe(id: string,input: GroupMembershipInput & {accountId?:string}): GroupPlanDto {
    return registry.transaction(()=>{
      const current=plan(id);checkRevision(current,input);
      if (current.identity_type!=='page' || !current.account_id) throw new Error('Membership observations require the existing acting Facebook Page; personal handoffs remain manual');
      pageIdentity(current.account_id);
      if (input.accountId!==undefined && input.accountId!==current.account_id) throw new Error('Membership Page must match the selected Group plan');
      const status=membership(input.status),observedAt=date(input.observedAt,'membership observation date');
      if (!observedAt) throw new Error('Membership observation date is required');
      const observationId=observeMembership(id,current.account_id,status,observedAt,textValue(input.notes||'','Membership notes',6000),current.canonicalKey,current.url);
      registry.updateMembership(id,status);
      repo.audit(id,'group_membership_observed_unverified',current.revision+1,{observationId,canonicalKey:current.canonicalKey,accountId:current.account_id,status,observedAt,source:'owner_entered',verified:false});
      return plan(id);
    });
  },
  review(id: string) { return {group:plan(id),prepared:this.prepared(id),publicationVerified:false as const}; },
  prepared(id: string): GroupPreparedDto[] { group(id);return repo.prepared(id).map(preparedContext); },
  reminders() {
    ready();return handoffs.pending().map(preparedContext).filter(p=>p.handoffContext?.reminderAt && p.reminderState==='active').map(p=>({
      preparedId:p.id,groupId:p.group_id,groupName:p.handoffContext!.group.name,sourcePage:p.handoffContext!.sourcePage,
      reminderAt:p.handoffContext!.reminderAt!,overdue:Date.parse(p.handoffContext!.reminderAt!)<=Date.now(),content:p.content,
      state:'active' as const,status:'pending_manual_action' as const,publicationVerified:false as const,
    }));
  },
  reminder(id: string,input: GroupReminderInput): GroupPreparedDto {
    ready();return registry.transaction(()=>{
      const p=repo.preparedById(id);if (!p) throw new Error('Prepared content not found');
      if (!['cancelled','dismissed'].includes(input.state)) throw new Error('Select cancel or dismiss reminder');
      if (!handoffs.context(id)?.reminderAt) throw new Error('This handoff has no reminder');
      registry.setReminderState(id,input.state,textValue(input.note||'','Reminder note',2000));
      repo.audit(id,`group_reminder_${input.state}`,null,{source:'owner_entered',publicationRecorded:false});
      return preparedContext(p);
    });
  },
  prepare(id: string,input: GroupPrepareInput): GroupPreparedDto {
    return registry.transaction(()=>{
      const g=plan(id);checkRevision(g,input);
      if (g.archivedAt) throw new Error('Restore this Group plan before preparing a new handoff');
      if (!['post','reply'].includes(input.kind)) throw new Error('Select post or reply');
      const thread=input.threadUrl?textValue(input.threadUrl,'Thread URL',2048,true):null;
      if (input.kind==='reply' && !thread) throw new Error('A native group thread URL is required for reply preparation');
      if (thread) { parseGroupThreadIdentity(thread);sameGroup(g.url,thread); }
      if (input.accountId && input.accountId!==g.account_id) throw new Error('Handoff Page must match the selected Group plan');
      if (g.identity_type==='page' && input.sourcePageId && input.sourcePageId!==g.account_id) throw new Error('Source Page must match the selected Group plan');
      const sourcePage=g.identity_type==='page'?pageIdentity(g.account_id!):input.sourcePageId?pageIdentity(input.sourcePageId):null;
      if (input.reminderAt && (typeof input.reminderAt!=='string' || !/(Z|[+-]\d\d:\d\d)$/.test(input.reminderAt))) throw new Error('Reminder requires an explicit timezone');
      const reminder=date(input.reminderAt,'reminder');
      const context: GroupHandoffContext={version:2,group:{name:g.name,url:g.url,identityType:g.identity_type,accountId:g.account_id,membership:g.membership,rules:g.rules,rulesReviewedAt:g.rules_reviewed_at,notes:g.notes,
        revision:g.revision,eligibility:g.eligibility,reviewedAt:g.reviewedAt,archivedAt:g.archivedAt,membershipObservationId:g.membershipObservations.filter(o=>o.accountId===g.account_id).at(-1)?.id||null},
        sourcePage,relevance:textValue(input.relevance||'','Group relevance',4000),media:selectedMedia(input),reminderAt:reminder};
      const p=repo.prepare(id,input.kind,textValue(input.content,'Prepared content',12000,true),thread);handoffs.saveContext(p.id,context);return preparedContext(p);
    });
  },
  package(id: string) {
    ready();const p=repo.preparedById(id);if (!p) throw new Error('Prepared content not found');const g=plan(p.group_id);
    const context=handoffs.context(id) as GroupHandoffContext|undefined;
    const snapshot=context?.group || {name:g.name,url:g.url,identityType:g.identity_type,accountId:g.account_id,membership:g.membership,rules:g.rules,rulesReviewedAt:g.rules_reviewed_at,notes:g.notes};
    const sourcePage=context?.sourcePage || null,driftWarnings=context?drift(snapshot,g):['Legacy handoff has no captured identity, membership or rules snapshot; review manually.'];
    const planChanged=!!context && driftWarnings.some(w=>!w.startsWith('Legacy handoff')),sourcePageUnavailable=!!sourcePage&&!pageAvailable(sourcePage.id),prepared=preparedContext(p);
    return {prepared,group:{...snapshot,permissionVerified:false as const},sourcePage,media:context?.media || [],relevance:context?.relevance || '',reminderAt:context?.reminderAt || null,
      planChanged,driftWarnings,readiness:g.readiness,receiptHistory:prepared.receiptHistory,reminderState:prepared.reminderState,
      sourcePageUnavailable,contextCaptured:!!context,publicationVerified:false as const,
      nativeUrl:p.thread_url || snapshot.url,publicationStatus:p.status==='prepared'?'unpublished_manual_handoff':'owner_receipt_recorded_unverified',
      text:`MANUAL FACEBOOK GROUP HANDOFF — ${p.status==='prepared'?'NOT PUBLISHED':'OWNER RECEIPT RECORDED — UNVERIFIED'}\nGroup: ${snapshot.name}\nURL: ${p.thread_url || snapshot.url}\nIntended identity: ${snapshot.identityType}\nSource Page: ${sourcePage?`${sourcePage.name} (${sourcePage.id})`:'Not captured — review source manually'}\nMembership/admin: ${snapshot.membership} (owner entered, unverified)\nRules last reviewed: ${snapshot.rulesReviewedAt || 'Not reviewed'}\nRules: ${snapshot.rules || 'Not supplied'}\nGroup relevance: ${context?.relevance || 'Not supplied'}\nReminder: ${context?.reminderAt || 'None'}\n${driftWarnings.map(w=>`REVIEW: ${w}\n`).join('')}${sourcePageUnavailable?'SOURCE PAGE UNAVAILABLE — review before any manual action.\n':''}\n${p.content}\n\nOpen/copy/export does not publish. Membership is not permission to post. Select the correct identity and review Group rules before any owner action.`};
  },
  receipt(id: string,input: GroupReceiptInput): GroupPreparedDto {
    ready();return registry.transaction(()=>{
      const p=repo.preparedById(id);if (!p) throw new Error('Prepared content not found');const g=group(p.group_id);
      if (input.confirmOwnerEntered!==true) throw new Error('Explicitly confirm this is an owner-entered, unverified receipt');
      const url=textValue(input.url,'Receipt URL',2048,true);parseGroupThreadIdentity(url);sameGroup(handoffs.context(id)?.group.url || g.url,url);
      if (p.kind==='reply' && (!p.thread_url || !groupReceiptMatchesThread(p.thread_url,url))) throw new Error('Reply receipt must match the original post and saved reply thread');
      const note=textValue(input.note||'','Receipt note',2000),latest=registry.receipts(id).at(-1);
      if (latest?.url===url && latest.note===note) return preparedContext(p);
      const receiptId=registry.receipt(id,url,note,latest?.id||null),updated=repo.receipt(id,url,note);
      repo.audit(id,latest?'manual_group_receipt_corrected_unverified':'manual_group_receipt_recorded_unverified',null,{receiptId,supersedesId:latest?.id||null,url,note,source:'owner_entered',verified:false});
      return preparedContext(updated);
    });
  },
};
