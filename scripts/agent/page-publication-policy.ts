import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {AgentStore,stableHash,type AgentJob} from './store.js';
import {SccAdapter,draftFingerprint} from './scc.js';
import {ApiError} from './http.js';

export const pagePublicationPolicySchema=z.object({version:z.literal('page-publication-policy.v1'),id:z.string().regex(/^[A-Za-z0-9_-]{1,50}$/),accountId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),graphId:z.string().regex(/^\d+$/),expiresAt:z.string().datetime().nullable(),maxPer24Hours:z.number().int().min(1).max(20),minimumHours:z.number().min(1).max(720),maxTotal:z.number().int().min(1).max(10000).nullable()}).strict();
type Any=Record<string,any>;
function time(value:unknown){return typeof value==='string'?Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)?value.replace(' ','T')+'Z':value):NaN;}

/** Optional publication step on the existing runner. No schedule, provider
 * generation, or default Page grant. A production policy conveys no authority here. */
export class PagePublicationPolicies {
  constructor(readonly store:AgentStore,readonly scc:SccAdapter,readonly targets:{scc:string;pipeline:string},readonly clock:()=>Date=()=>new Date()){}
  status(){return (this.store.runnerState<string[]>('publication.policies')??[]).map(id=>this.store.getJob(id)!).map(j=>({id:j.id,policy:(j.input as Any).policy,state:j.state}));}
  async authorize(raw:unknown,ownerAuthorized=false){if(!ownerAuthorized)throw new Error('Separate standing Page publication authorization required');const p=pagePublicationPolicySchema.parse(raw),now=this.clock().getTime();if(p.expiresAt&&Date.parse(p.expiresAt)<=now)throw new Error('Publication policy expired');
    const page=await this.scc.pageContext(p.accountId);if(page.account.graphId!==p.graphId)throw new Error('Publication Page identity differs');
    const id='page-publication-policy:'+p.id;return this.store.transaction(()=>{
      const old=this.store.getJob(id);if(old){if(stableHash((old.input as Any).policy)!==stableHash(p)||old.state.revokedAt)throw new Error('Publication grant IDs are immutable');return this.status();}
      if(this.status().some(j=>j.policy.accountId===p.accountId&&!j.state.revokedAt))throw new Error('Revoke the prior Page grant before replacing it');
      this.store.createJob(id,{policy:p,targets:this.targets});this.store.patchState(id,{enabled:true,issuedAt:this.clock().toISOString(),dispatches:[],hold:null});this.store.setRunnerState('publication.policies',[...(this.store.runnerState<string[]>('publication.policies')??[]),id]);
      this.store.recordKnowledge({id:id+':authorization',kind:'observation',accountId:p.accountId,resourceId:id,source:'explicit_owner_standing_page_publication_authorization',text:'Separate exact-Page publication grant. Only quality-approved Gemini production drafts qualify.',evidence:p});return this.status();
    });
  }
  revoke(id:string){const j=this.store.getJob(id);if(!j||!(j.input as Any).policy?.graphId)throw new Error('Unknown Page policy');if(!j.state.revokedAt)this.store.patchState(id,{enabled:false,revokedAt:this.clock().toISOString()});return this.status();}
  async reconcile(itemId:string){const item=this.store.getJob(itemId);if(!item||(item.input as Any).production!==true)throw new Error('Unknown original publication item');const s=item.state as Any,queue=this.store.getOperation(item.id,'standing_publication_queue'),op=queue??this.store.getOperation(item.id,'standing_publication_approve');if(!op)throw new Error('No original publication intent');
    const request=op.request as Any,draft=await this.scc.getDraft(request.draftId);if(draft.revision!==request.revision||draftFingerprint(draft)!==request.payloadHash)throw new Error('Original publication revision differs');
    if(!queue){if(draft.status!=='approved'||draft.approvedRevision!==request.revision)throw new Error('Original approval outcome still unresolved');if(op.status!=='succeeded')this.store.finishOperation(item.id,'standing_publication_approve','succeeded',{reconciledDraftId:draft.id,revision:draft.revision});this.store.patchState(request.policyId,{hold:null});return {approved:true,reconciled:true};}
    if(!draft.queuedPostId)throw new Error('Original queue outcome still unresolved');
    const result={postId:draft.queuedPostId,reconciled:true};if(op.status!=='succeeded')this.store.finishOperation(item.id,'standing_publication_queue','succeeded',result);this.store.patchState(item.id,{publicationPostId:draft.queuedPostId});const grant=this.store.getJob(request.policyId);if(grant)this.store.patchState(grant.id,{hold:null});return result;
  }
  private active(j:AgentJob){const p=(j.input as Any).policy;return j.state.enabled&&!j.state.revokedAt&&!j.state.hold&&(!p.expiresAt||Date.parse(p.expiresAt)>this.clock().getTime())&&stableHash((j.input as Any).targets)===stableHash(this.targets);}
  private async once(j:AgentJob,step:string,request:Any,action:()=>Promise<any>,admit?:()=>void){
    const claimed=this.store.transaction(()=>{if(!this.store.getOperation(j.id,step))admit?.();return this.store.claimOperation(j.id,step,request);});
    if(!claimed.claimed){if(claimed.operation.status==='succeeded')return claimed.operation.response;throw new Error('original_publication_reconciliation_required');}
    try{const result=await action();this.store.finishOperation(j.id,step,'succeeded',result);return result;}catch(e){this.store.finishOperation(j.id,step,e instanceof ApiError&&!e.uncertain?'rejected':'uncertain',{code:e instanceof ApiError?e.code:'publication_unconfirmed'});throw e;}
  }
  async tick(){const grants=this.status().map(p=>this.store.getJob(p.id)!).filter(j=>this.active(j));if(!grants.length)return {state:'publication_disabled',actions:0};
    const token=randomUUID(),now=this.clock().getTime();const lock=this.store.transaction(()=>{const old=this.store.runnerState<Any>('publication.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('publication.lease',{token,until:new Date(now+900000).toISOString()});return true;});if(!lock)return {state:'publication_busy',actions:0};
    try{for(const grant of grants){const result=await this.step(grant);if(result.state!=='no_ready_content')return result;}return {state:'no_ready_content',actions:0};}
    finally{if(this.store.runnerState<Any>('publication.lease')?.token===token)this.store.setRunnerState('publication.lease',null);}
  }
  private async step(grant:AgentJob):Promise<Any>{const p=(grant.input as Any).policy;
    const ids=this.store.runnerState<string[]>('production.items')??[],item=ids.map(id=>this.store.getJob(id)!).find(j=>(j.input as Any).production&&(j.input as Any).concept.accountId===p.accountId&&j.state.phase==='ready');if(!item)return {state:'no_ready_content',actions:0};
    const state=item.state as Any,qa=state.qa;if(!qa||qa.decision!=='accepted'||qa.visual!=='pass'||qa.audio!=='pass'||!state.media?.technical||qa.sha256!==state.media.sha256)return {state:'quality_hold',actions:0};
    if(!state.variantReview||state.variantReview.visual!=='pass'||state.variantReview.sha256!==state.variantSha256||state.variantReview.masterAudioHash!==state.variantReview.variantAudioHash)return {state:'final_variant_review_required',actions:0};
    const page=await this.scc.pageContext(p.accountId);if(page.account.graphId!==p.graphId)throw new Error('Standing publication Page identity changed');
    const media=await this.scc.media(state.videoId),variant=media.variants.find((v:Any)=>v.id===state.variantId);if(media.provenance.sha256!==qa.sha256||!variant||variant.sha256!==state.variantSha256)throw new Error('Publication media integrity differs');
    let draft=await this.scc.getDraft(state.draftId);if(draft.videoId!==state.videoId||draft.scheduledAt!==null||draft.destinations.length!==1||draft.destinations[0].accountId!==p.accountId||draft.destinations[0].selectedVariantId!==state.variantId||draft.destinations[0].applyBranding!==false||draftFingerprint(draft)!==state.draftHash)throw new Error('Publication draft changed since final review');
    if(draft.destinations[0].caption!==qa.caption||draft.destinations[0].hashtags!==(qa.hashtags??''))throw new Error('Publication caption differs from creative QA');
    const approval={revision:draft.revision,accountId:p.accountId,payloadHash:draftFingerprint(draft)};
    // Read back the exact existing queue receipt before any possible new action.
    if(draft.queuedPostId){this.store.patchState(item.id,{publicationPostId:draft.queuedPostId});return {state:'original_publication_queued',postId:draft.queuedPostId,actions:0};}
    const history=await this.scc.history({limit:100});if(history.hasMore)return {state:'publication_history_incomplete',actions:0};const rows=history.items.filter((r:Any)=>r.account_id===p.accountId),events=(grant.state.dispatches??[]) as Any[];
    if(rows.some((r:Any)=>!['published','failed','cancelled'].includes(r.status)||r.submission_state==='uncertain'))return {state:'original_publication_reconciliation_required',actions:0};
    const dates=rows.filter((r:Any)=>r.status==='published').map((r:Any)=>time(r.published_at));if(dates.some((d:number)=>!Number.isFinite(d)))return {state:'publication_date_unknown',actions:0};const now=this.clock().getTime();
    if((p.maxTotal!==null&&events.length>=p.maxTotal)||events.filter(e=>Date.parse(e.at)>now-86400000).length>=p.maxPer24Hours||dates.filter((d:number)=>d>now-86400000).length>=p.maxPer24Hours||dates.some((d:number)=>d+p.minimumHours*3600000>now))return {state:'publication_cadence_wait',actions:0};
    const sameContent=ids.map(id=>this.store.getJob(id)!).some(j=>j.id!==item.id&&(j.state as Any).media?.sha256===qa.sha256&&((j.state as Any).publicationPostId||(j.state as Any).publicationIntent));if(sameContent)return {state:'duplicate_publication_hold',actions:0};
    try{
      const oldApprove=this.store.getOperation(item.id,'standing_publication_approve');
      if(oldApprove&&oldApprove.status!=='succeeded'&&draft.status==='approved'&&draft.approvedRevision===draft.revision)this.store.finishOperation(item.id,'standing_publication_approve','succeeded',{reconciledDraftId:draft.id,revision:draft.revision});
      await this.once(item,'standing_publication_approve',{policyId:grant.id,draftId:draft.id,...approval},()=>this.scc.approve(draft.id,approval),()=>{if(!this.active(this.store.getJob(grant.id)!))throw new Error('Publication authority revoked');});
      const result=await this.once(item,'standing_publication_queue',{policyId:grant.id,draftId:draft.id,...approval},()=>this.scc.queue(draft.id,approval),()=>{
        const current=this.store.getJob(grant.id)!;if(!this.active(current))throw new Error('Publication authority revoked');const charged=(current.state.dispatches??[]) as Any[];
        if((p.maxTotal!==null&&charged.length>=p.maxTotal)||charged.filter(e=>Date.parse(e.at)>now-86400000).length>=p.maxPer24Hours)throw new Error('Publication policy budget reached');
        this.store.patchState(grant.id,{dispatches:[...charged,{itemId:item.id,sha256:qa.sha256,draftId:draft.id,at:this.clock().toISOString()}]});this.store.patchState(item.id,{publicationIntent:{policyId:grant.id,draftId:draft.id,revision:draft.revision}});
      });this.store.patchState(item.id,{publicationPostId:result.postId});return {state:'publication_queued',postId:result.postId,actions:1};
    }catch(e){this.store.patchState(grant.id,{hold:'original_publication_reconciliation_required'});return {state:'original_publication_reconciliation_required',actions:0};}
  }
}
