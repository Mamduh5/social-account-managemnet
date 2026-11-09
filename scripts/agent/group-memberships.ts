import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AgentStore,stableHash} from './store.js';
import {GroupBrowser} from './group-browser.js';
import {groupBrowserLease} from './group-browser-binding.js';
import {FacebookGroupMembershipUI,type NativePageIdentity} from './group-membership-ui.js';
import {GroupTextPublication} from './group-text-publication.js';
import {SccAdapter} from './scc.js';
import {canonicalGroupIdentity} from '../../server/src/domain/groups.js';

export class GroupMemberships {
  constructor(readonly store:AgentStore,readonly scc:SccAdapter,readonly browser:GroupBrowser,readonly ui=new FacebookGroupMembershipUI()){}
  private async identity(accountId:string):Promise<NativePageIdentity>{const context=await this.scc.pageContext(accountId),profileId=String(context.account.handle??'').replace(/^@/,'');if(!/^\d+$/.test(profileId))throw Error('A verified numeric native Page profile alias is required; do not guess identity from a display name');return {accountId,name:context.account.name,graphId:context.account.graphId,profileId};}
  private async lease<T>(jobId:string,identity:NativePageIdentity,action:()=>Promise<T>){const scope=groupBrowserLease(identity.accountId);if(this.store.providerOwner('scc:facebook-group-browser')||!this.store.reserveProvider(scope,jobId))throw Error('Account browser is busy or has an unresolved original operation');try{return await action();}finally{this.store.releaseProvider(scope,jobId);}}
  async discover(accountId:string){
    const identity=await this.identity(accountId),id='group-discovery:'+randomUUID();this.store.createJob(id,{identity,method:'native_your_groups'});
    return this.lease(id,identity,async()=>{const observation=await this.browser.withPage(accountId,page=>this.ui.joined(page,identity));this.store.patchState(id,{phase:'observed',observation});this.store.recordKnowledge({id:id+':observation',kind:'observation',accountId,resourceId:id,source:'agent_browser_observation',text:'Native Your Groups listing under exact Page identity. Not Chrome history, posting permission, a grant or publication.',evidence:observation});return {discoveryId:id,...observation};});
  }
  async register(raw:unknown,authorized=false){
    if(!authorized)throw Error('Explicit owner authority to register selected verified destinations required');
    const r=z.object({accountId:z.string().min(1).max(200),discoveryId:z.string().startsWith('group-discovery:'),groupUrl:z.string().url()}).strict().parse(raw),discovery=this.store.getJob(r.discoveryId),saved=(discovery?.state as any)?.observation;
    if(!saved||saved.identity.accountId!==r.accountId||Date.now()-Date.parse(saved.observedAt)>86400000)throw Error('Fresh native membership discovery for this same account required');
    const canonical=canonicalGroupIdentity(r.groupUrl),group=saved.groups.find((g:any)=>g.url===canonical.canonicalUrl);if(!group)throw Error('Selected Group was not observed in this account native membership list');
    const identity=await this.identity(r.accountId);if(identity.graphId!==saved.identity.graphId||identity.profileId!==saved.identity.profileId)throw Error('Page identity changed since membership discovery');
    const id='group-register-ui:'+stableHash(r).slice(0,32);this.store.createJob(id,r);
    if((this.store.getJob(id)!.state as any).phase==='registered')return this.store.getJob(id)!.state;
    return this.lease(id,identity,async()=>{const observation=await this.browser.withPage(r.accountId,page=>this.ui.inspect(page,identity,group));this.store.patchState(id,{phase:'native_verified',observation});
      const listing=await this.scc.client.get<any>('/api/groups?archived=false&accountId='+encodeURIComponent(r.accountId)),existing=listing.groups?.find((g:any)=>g.account_id===r.accountId&&canonicalGroupIdentity(g.url).canonicalUrl===canonical.canonicalUrl);
      let plan=existing;if(!plan){const input={name:group.name,url:canonical.canonicalUrl,identityType:'page',accountId:r.accountId,membership:'member',category:'Developer / AI tools',notes:'Agent browser observation: exact native Page identity, native Your Groups membership, Joined and empty original-post composer verified. No post or grant. Visible About snapshot below is not an owner approval or API permission. Global moderation and undisplayed rules remain unknown.',rules:observation.rules,rulesReviewedAt:observation.observedAt.slice(0,10),reviewedAt:null,eligibility:{pagesCanJoin:'yes',questions:[],promotionalRestrictions:'Review the complete Group rules and intended content before any publication authorization.',participationApproval:'unknown',postModeration:'unknown'}};
        const old=this.store.getOperation(id,'save_scc_group');if(old){if(old.status!=='succeeded')throw Error('Original registry save needs reconciliation; do not recreate');plan=(old.response as any).group;}else{this.store.claimOperation(id,'save_scc_group',input);try{const response=await this.scc.client.post<any>('/api/groups',input);this.store.finishOperation(id,'save_scc_group','succeeded',response);plan=response.group;}catch(e){this.store.finishOperation(id,'save_scc_group','uncertain',{error:String(e)});throw e;}}
      }
      const bound=await this.scc.group(plan.id);if(bound.account_id!==r.accountId||bound.url!==canonical.canonicalUrl)throw Error('Saved registry differs from the observed Page/Group');
      // Existing plans are not rewritten or silently rebound to new rules, grants or approvals.
      const textRegistry=await new GroupTextPublication(this.store,this.scc).register({commandId:id.replace(':','-'),groupId:plan.id,accountId:r.accountId,observation:{observedAt:observation.observedAt,source:'agent_browser_observation',groupUrl:canonical.canonicalUrl,graphId:identity.graphId,profileId:identity.profileId,joined:true,textComposerObserved:true,rulesRead:true,moderation:'unknown',notes:'Actual native Your Groups listing, Joined, exact Page composer and visible About inspected. No text, Post, owner review or posting grant; undisplayed rules/moderation remain unknown.'}},true);
      this.store.recordKnowledge({id:id+':observed',kind:'observation',accountId:r.accountId,resourceId:plan.id,source:'agent_browser_observation',text:'Account-specific native membership/composer and visible About observation; existing SCC owner-entered wrapper remains unverified. No publication authority.',evidence:observation});
      const result={phase:'registered',groupId:plan.id,registryId:textRegistry.registryId,accountId:r.accountId,groupUrl:canonical.canonicalUrl,postingIdentity:identity,nativeMembershipVerified:true,nativeComposerVerified:true,publicationAuthorized:false,moderation:'unknown',observation};this.store.patchState(id,result);return result;
    });
  }
}
