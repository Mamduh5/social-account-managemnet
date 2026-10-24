import { safeFacebookUrl, textValue } from '../domain/content-assistant.js';
import { contentWorkspaceRepo as repo } from '../repositories/content-workspace.repo.js';
import { accountsRepo } from '../repositories/accounts.repo.js';

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
      const a=accountsRepo.getAccountById(input.accountId);
      if (!a || a.archived_at || a.platform!=='facebook' || a.account_type!=='page') throw new Error('Select an active Facebook Page');accountId=a.id;
    }
    if (!['unknown','not_member','member','admin'].includes(input.membership)) throw new Error('Select owner-entered membership status');
    const reviewed=input.rulesReviewedAt || null;
    if (reviewed && (!/^\d{4}-\d{2}-\d{2}$/.test(reviewed) || !Number.isFinite(Date.parse(reviewed)))) throw new Error('Use a valid rules review date');
    return repo.saveGroup(id,{name:textValue(input.name,'Group name',200,true),url:safeFacebookUrl(input.url),identityType:input.identityType,accountId,membership:input.membership,
      category:textValue(input.category||'','Category',200),notes:textValue(input.notes||'','Notes',6000),rules:textValue(input.rules||'','Rules',12000),rulesReviewedAt:reviewed});
  },
  prepared(id:string) {group(id);return repo.prepared(id);},
  prepare(id:string,input:any) {
    const g=group(id);if (!['post','reply'].includes(input.kind)) throw new Error('Select post or reply');
    const thread=input.threadUrl?safeFacebookUrl(input.threadUrl,'thread'):null;
    if (input.kind==='reply' && !thread) throw new Error('A native group thread URL is required for reply preparation');
    if (thread) sameGroup(g.url,thread);
    return repo.prepare(id,input.kind,textValue(input.content,'Prepared content',12000,true),thread);
  },
  package(id:string) {
    const p=repo.preparedById(id);if (!p) throw new Error('Prepared content not found');const g=group(p.group_id);
    repo.audit(id,'manual_group_handoff_prepared');
    return { prepared:p,group:{name:g.name,url:g.url,identityType:g.identity_type,membership:g.membership,permissionVerified:false},
      nativeUrl:p.thread_url || g.url,publicationStatus:'unpublished_manual_handoff',
      text:`MANUAL FACEBOOK GROUP HANDOFF — NOT PUBLISHED\nGroup: ${g.name}\nURL: ${p.thread_url || g.url}\nIntended identity: ${g.identity_type}\nMembership/admin: ${g.membership} (owner entered, unverified)\nRules last reviewed: ${g.rules_reviewed_at || 'Not reviewed'}\nRules: ${g.rules || 'Not supplied'}\n\n${p.content}\n\nOpen/copy/export does not publish. Select the correct identity and review the group rules before any owner action.` };
  },
  receipt(id:string,input:any) {
    const p=repo.preparedById(id);if (!p) throw new Error('Prepared content not found');const g=group(p.group_id);
    if (input.confirmOwnerEntered!==true) throw new Error('Explicitly confirm this is an owner-entered, unverified receipt');
    const url=safeFacebookUrl(input.url,'receipt');sameGroup(g.url,url);
    return repo.receipt(id,url,textValue(input.note||'','Receipt note',2000));
  },
};
