import { safeFacebookUrl, textValue } from '../domain/content-assistant.js';
import { contentWorkspaceRepo as repo } from '../repositories/content-workspace.repo.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { groupsHandoffRepo as handoffs } from '../repositories/groups-handoff.repo.js';

function pageIdentity(id: string) {
  const a=accountsRepo.getAccountById(id);
  if (!a || a.archived_at || a.is_demo || a.platform!=='facebook' || a.account_type!=='page') throw new Error('Select an active real Facebook Page');
  return {id:a.id,name:a.name,externalId:a.external_id || null};
}
function preparedContext(p:any) {
  const context=handoffs.context(p.id);
  return {...p,handoffContext:context || null,contextCaptured:!!context};
}
function selectedMedia(input:any) {
  const items=input.media || [];
  if (!Array.isArray(items) || items.length>10) throw new Error('Select at most ten existing media items');
  const keys=new Set<string>();
  return items.map((item:any)=>{
    if (!item || !['image','video'].includes(item.kind) || typeof item.id!=='string') throw new Error('Select an existing image or video');
    const row=handoffs.media(item.kind,item.id),key=`${item.kind}:${item.id}`;
    if (!row || keys.has(key)) throw new Error('Media is missing or selected more than once');
    keys.add(key);
    return {kind:item.kind,id:row.id,title:row.title,url:item.kind==='image'?`/api/publishing/images/${encodeURIComponent(row.id)}/content`:`/api/publishing/videos/${encodeURIComponent(row.id)}/stream`};
  });
}

function group(id: string) { const g=repo.group(id);if (!g) throw new Error('Group plan not found');return g; }
function sameGroup(groupUrl: string,contentUrl: string) {
  const slug=(u:string)=>new URL(u).pathname.split('/')[2];
  if (slug(groupUrl)!==slug(contentUrl)) throw new Error('The thread/receipt URL must belong to the registered group');
}
export const groupsWorkspaceService = {
  list() { return repo.groups().map(g=>({...g,permissionVerified:false,source:'owner_entered',automationSupported:false})); },
  save(id: string | undefined,input:any) {
    if (id) group(id);
    if (!['page','personal'].includes(input.identityType)) throw new Error('Select Page or personal profile as intended identity');
    let accountId=null;
    if (input.identityType==='page') {
      accountId=pageIdentity(input.accountId).id;
    }
    if (!['unknown','not_member','member','admin'].includes(input.membership)) throw new Error('Select owner-entered membership status');
    const reviewed=input.rulesReviewedAt || null;
    if (reviewed && (!/^\d{4}-\d{2}-\d{2}$/.test(reviewed) || !Number.isFinite(Date.parse(reviewed)))) throw new Error('Use a valid rules review date');
    return repo.saveGroup(id,{name:textValue(input.name,'Group name',200,true),url:safeFacebookUrl(input.url),identityType:input.identityType,accountId,membership:input.membership,
      category:textValue(input.category||'','Category',200),notes:textValue(input.notes||'','Notes',6000),rules:textValue(input.rules||'','Rules',12000),rulesReviewedAt:reviewed});
  },
  prepared(id:string) {group(id);return repo.prepared(id).map(preparedContext);},
  reminders() {
    return handoffs.pending().map(preparedContext).filter(p=>p.handoffContext?.reminderAt).map(p=>({
      preparedId:p.id,groupId:p.group_id,groupName:p.handoffContext.group.name,sourcePage:p.handoffContext.sourcePage,
      reminderAt:p.handoffContext.reminderAt,overdue:Date.parse(p.handoffContext.reminderAt)<=Date.now(),content:p.content,
      status:'pending_manual_action',publicationVerified:false,
    }));
  },
  prepare(id:string,input:any) {
    const g=group(id);if (!['post','reply'].includes(input.kind)) throw new Error('Select post or reply');
    const thread=input.threadUrl?safeFacebookUrl(input.threadUrl,'thread'):null;
    if (input.kind==='reply' && !thread) throw new Error('A native group thread URL is required for reply preparation');
    if (thread) sameGroup(g.url,thread);
    if (input.accountId && input.accountId!==g.account_id) throw new Error('Handoff Page must match the selected Group plan');
    if (g.identity_type==='page' && input.sourcePageId && input.sourcePageId!==g.account_id) throw new Error('Source Page must match the selected Group plan');
    const sourcePage=g.identity_type==='page'?pageIdentity(g.account_id):input.sourcePageId?pageIdentity(input.sourcePageId):null;
    const reminder=input.reminderAt || null;
    if (reminder && (typeof reminder!=='string' || !/(Z|[+-]\d\d:\d\d)$/.test(reminder) || !Number.isFinite(Date.parse(reminder)))) throw new Error('Reminder requires an explicit timezone');
    const context={version:1,group:{name:g.name,url:g.url,identityType:g.identity_type,accountId:g.account_id,membership:g.membership,rules:g.rules,rulesReviewedAt:g.rules_reviewed_at,notes:g.notes},
      sourcePage,relevance:textValue(input.relevance||'','Group relevance',4000),media:selectedMedia(input),reminderAt:reminder?new Date(reminder).toISOString():null};
    return handoffs.transaction(()=>{const p=repo.prepare(id,input.kind,textValue(input.content,'Prepared content',12000,true),thread);handoffs.saveContext(p.id,context);return preparedContext(p);});
  },
  package(id:string) {
    const p=repo.preparedById(id);if (!p) throw new Error('Prepared content not found');const g=group(p.group_id);
    const context=handoffs.context(id),snapshot=context?.group || {name:g.name,url:g.url,identityType:g.identity_type,accountId:g.account_id,membership:g.membership,rules:g.rules,rulesReviewedAt:g.rules_reviewed_at,notes:g.notes};
    const sourcePage=context?.sourcePage || null;
    const planChanged=!!context && (snapshot.url!==g.url || snapshot.identityType!==g.identity_type || snapshot.accountId!==g.account_id || snapshot.rules!==g.rules || snapshot.rulesReviewedAt!==g.rules_reviewed_at);
    const sourcePageUnavailable=!!sourcePage && (()=>{try{pageIdentity(sourcePage.id);return false;}catch{return true;}})();
    repo.audit(id,'manual_group_handoff_prepared');
    return { prepared:preparedContext(p),group:{...snapshot,permissionVerified:false},sourcePage,media:context?.media || [],relevance:context?.relevance || '',reminderAt:context?.reminderAt || null,
      planChanged,sourcePageUnavailable,contextCaptured:!!context,publicationVerified:false,
      nativeUrl:p.thread_url || snapshot.url,publicationStatus:p.status==='prepared'?'unpublished_manual_handoff':'owner_receipt_recorded_unverified',
      text:`MANUAL FACEBOOK GROUP HANDOFF — ${p.status==='prepared'?'NOT PUBLISHED':'OWNER RECEIPT RECORDED — UNVERIFIED'}\nGroup: ${snapshot.name}\nURL: ${p.thread_url || snapshot.url}\nIntended identity: ${snapshot.identityType}\nSource Page: ${sourcePage?`${sourcePage.name} (${sourcePage.id})`:'Not captured — review source manually'}\nMembership/admin: ${snapshot.membership} (owner entered, unverified)\nRules last reviewed: ${snapshot.rulesReviewedAt || 'Not reviewed'}\nRules: ${snapshot.rules || 'Not supplied'}\nGroup relevance: ${context?.relevance || 'Not supplied'}\nReminder: ${context?.reminderAt || 'None'}\n${planChanged?'GROUP PLAN CHANGED — prepare a new handoff after reviewing identity and rules.\n':''}${sourcePageUnavailable?'SOURCE PAGE UNAVAILABLE — review before any manual action.\n':''}\n${p.content}\n\nOpen/copy/export does not publish. Select the correct identity and review the group rules before any owner action.` };
  },
  receipt(id:string,input:any) {
    const p=repo.preparedById(id);if (!p) throw new Error('Prepared content not found');const g=group(p.group_id);
    if (input.confirmOwnerEntered!==true) throw new Error('Explicitly confirm this is an owner-entered, unverified receipt');
    const url=safeFacebookUrl(input.url,'receipt');sameGroup(handoffs.context(id)?.group.url || g.url,url);
    return repo.receipt(id,url,textValue(input.note||'','Receipt note',2000));
  },
};
