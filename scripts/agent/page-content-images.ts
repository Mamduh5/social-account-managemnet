import path from 'node:path';
import {z} from 'zod';
import {AgentStore,stableHash} from './store.js';
import type {PageContent} from './page-content.js';
import {editorialAdmission} from './page-editorial.js';
import {standingImageAdmission,standingImageActive,standingImageMatches} from './page-image-policy.js';
type Any=Record<string,any>;
const text=(n:number)=>z.string().trim().min(1).max(n);
export const imagePlan=z.object({version:z.literal('codex-content-images.v1'),taskId:text(160),expiresAt:z.string().datetime(),continuity:text(2000),images:z.array(z.object({prompt:text(4000),altText:text(1000),aspectRatio:z.enum(['1:1','4:5','3:4','9:16','16:9']),purpose:text(600)}).strict()).min(1).max(10)}).strict();
export function imageTaskEligible(store:AgentStore,task:Any,now=Date.now()){
  const p=task.payload?.codexImage;if(p?.version!=='codex-content-image.v1')return false;
  const job=store.getJob(p.scopeId),parent=job&&store.getWork((job.input as Any).plan.taskId);if(parent){try{if(editorialAdmission(store,parent,typeof parent.result==='string'?JSON.parse(parent.result):parent.result))return false;}catch{return false;}}
  return !!job&&job.state.enabled===true&&Date.parse((job.input as Any).plan.expiresAt)>now&&!!parent&&stableHash(parent.result)===(job.input as Any).resultHash&&task.id===job.state.activeTaskId&&p.planHash===job.inputHash&&standingImageAdmission(store,p,now,task.id);
}
/** Exact-concept bounded grants; no timer, recurring activation or publication authority. */
export class PageContentImages {
  constructor(readonly page:PageContent,readonly stateFile:string,readonly clock:()=>Date=()=>new Date()){}
  get store(){return this.page.store;}
  ids(){return this.store.runnerState<string[]>('page-image.scopes')??[];}
  status(){return {enabledScopes:this.ids().map(id=>this.store.getJob(id)).filter(j=>j?.state.enabled),recurringEnabled:!!this.store.runnerState<string>('page-image.policy')&&standingImageActive(this.store,this.store.runnerState<string>('page-image.policy')!,this.clock().getTime()),scopeRequired:true,maximumPendingItems:6};}
  async authorize(raw:unknown,authorized=false,standingPolicyId?:string){
    if(!authorized)throw new Error('Exact bounded image scope requires owner authorization');
    const plan=imagePlan.parse(raw),v=this.page.validate(plan.taskId),id='page-images:'+plan.taskId;
    if(v.payload.format!=='image')throw new Error('Image concept required');
    if(v.result.imageBrief?.frames&&v.result.imageBrief.frames.length!==plan.images.length)throw new Error('Image count differs from the concept sequence');
    if(standingPolicyId){const grant=this.store.getJob(standingPolicyId),policy=(grant?.input as Any)?.policy;if(!standingImageActive(this.store,standingPolicyId,this.clock().getTime())||!standingImageMatches(this.store,standingPolicyId,v.task.accountId!,v.payload.request.graphId)||Date.parse(plan.expiresAt)>Date.parse(policy.expiresAt))throw new Error('Standing image authority is inactive or differs from scope');}
    const input={plan,resultHash:stableHash(v.task.result),origin:this.page.scc.client.origin,accountId:v.task.accountId,graphId:v.payload.request.graphId,...(standingPolicyId?{standingPolicyId}:{})};
    const old=this.store.getJob(id);if(old){if(old.inputHash!==stableHash(input))throw new Error('Original image scope cannot be replaced');return old;}
    if(Date.parse(plan.expiresAt)<=this.clock().getTime())throw new Error('Image scope expired');
    const state=this.store.runnerState<Any>('page-content.state:'+plan.taskId);
    if(state?.phase!=='awaiting_imagery'||state?.draftId||this.store.runnerState('page-content.images:'+plan.taskId)||this.store.getOperation(this.page.job(plan.taskId),'prepare'))throw new Error('Existing imagery/draft or held concept cannot be regenerated');
    this.pendingBound();
    const context=await this.page.scc.preparationContext(v.task.accountId!);if(context.contextFingerprint!==v.payload.contextFingerprint||context.account.graphId!==v.payload.request.graphId)throw new Error('Page context changed');
    return this.store.transaction(()=>{const job=this.store.createJob(id,input);this.store.patchState(id,{enabled:true,phase:'pending',completed:[],activeTaskId:null});this.store.setRunnerState('page-image.scopes',[...this.ids(),id]);return this.store.getJob(job.id);});
  }
  revoke(id:string){const job=this.store.getJob(id);if(!job)throw new Error('Unknown image scope');return this.store.patchState(id,{enabled:false,revokedAt:this.clock().toISOString()});}
  private pendingBound(){const c=this.store.runnerState<Any>('page-content.config'),limit=Math.min(6,c?.maxPendingItems??6),n=this.page.pendingCount();if(n>limit)throw new Error('Six-item content preparation bound exceeded');}
  async advance(){
    // Shared preparation lease is held by PageContent.advance, including these deterministic steps.
    for(const id of this.ids()){
      const job=this.store.getJob(id)!,input=job.input as Any,plan=input.plan,state=job.state as Any;
      if(state.phase==='needs_owner_review')continue;
      const active=state.activeTaskId&&this.store.getWork(state.activeTaskId);
      if(active){
        if(this.store.runnerSessions({taskId:active.id}).some(s=>['running','reserved'].includes(s.status)||s.mayBeRunning))return {state:'image_original_protected',actions:0};
        if(active.status==='prepared'||active.status==='done'){
          const r=JSON.parse(active.result);if(r.status!=='imported_candidate_needs_owner_review'||!r.completion?.readbackByteIdentical)throw new Error('Image import completion required');
          const expected=active.payload.codexImage;if(r.requestId!==active.id||r.directory!==expected.directory)throw new Error('Image task result binding differs');
          const completed=[...(state.completed??[])];if(completed.length!==expected.index)throw new Error('Image ordering differs');
          completed.push(r);this.store.patchState(id,{completed,activeTaskId:null,phase:'imported'});return {state:'image_import_adopted',actions:1};
        }
        if(active.status==='blocked'){try{await this.recover(active.id);return {state:'image_original_import_recovered',actions:1};}catch{return {state:'image_original_requires_recovery',actions:0,taskId:active.id};}}
        return {state:'image_request_queued',actions:0,taskId:active.id};
      }
      if((state.completed??[]).length===plan.images.length){
        const images=(state.completed as Any[]).map((r,index)=>({id:r.imageId,sha256:r.qa.sha256,altText:plan.images[index].altText}));
        const collection={orderedImages:images,requestedCount:plan.images.length,continuity:plan.continuity,referenceEvidence:(state.completed as Any[]).map(r=>r.references),technicalOnly:true,visualConsistency:'needs_owner_review',limitations:'Reference attachments and shared prompts guide continuity; they do not establish perfect visual consistency, readable UI or creative acceptance.'};
        const saved=await this.page.attachGeneratedImages(plan.taskId,input.resultHash,images,collection);
        this.store.patchState(id,{phase:'needs_owner_review',enabled:false,draftId:saved.draftId,collection});return {state:'image_draft_needs_owner_review',actions:1,draftId:saved.draftId};
      }
      if(!state.enabled||Date.parse(plan.expiresAt)<=this.clock().getTime())continue;
      if(!standingImageAdmission(this.store,input,this.clock().getTime()))return {state:'standing_image_admission_wait',actions:0};
      this.pendingBound();const v=this.page.validate(plan.taskId);if(stableHash(v.task.result)!==input.resultHash)throw new Error('Concept changed after image scope');
      const context=await this.page.scc.preparationContext(v.task.accountId!);if(context.contextFingerprint!==v.payload.contextFingerprint||context.account.graphId!==input.graphId)throw new Error('Page context changed');
      const index=(state.completed??[]).length,requestId='page-image-'+stableHash({scope:id,planHash:job.inputHash,index}).slice(0,40),directory=path.join(path.dirname(path.resolve(this.stateFile)),'content-images',requestId);
      const references=index>0?[{file:state.completed[0].file,sha256:state.completed[0].qa.sha256}]:[];
      const payload={codexImage:{version:'codex-content-image.v1',scopeId:id,planHash:job.inputHash,stateFile:path.resolve(this.stateFile),directory,index,prompt:plan.images[index].prompt,aspectRatio:plan.images[index].aspectRatio,continuity:plan.continuity,references,origin:input.origin,...(input.standingPolicyId?{standingPolicyId:input.standingPolicyId}:{})}};
      this.store.transaction(()=>{const latest=this.store.getJob(id)!;if(!latest.state.enabled||latest.state.activeTaskId)throw new Error('Image grant changed');this.page.content.work.add({id:requestId,kind:'opening_image',accountId:v.task.accountId,title:plan.images[index].purpose,priority:95,payload});this.store.patchState(id,{activeTaskId:requestId,phase:'queued'});});return {state:'image_request_queued',actions:1,taskId:requestId};
    }
    return {state:'image_scopes_idle',actions:0};
  }
  async recover(taskId:string){
    const task=this.store.getWork(taskId),p=task?.payload?.codexImage;if(!p)throw new Error('Original image task required');
    if(this.store.runnerSessions({taskId}).some(s=>['running','reserved'].includes(s.status)||s.mayBeRunning))throw new Error('Original image process protected');
    const {finishOriginal}=require('./codex-image-once.cjs'),{verifyOriginal}=require('./codex-content-image.cjs'),os=require('node:os');verifyOriginal(p,taskId);
    // Pure original-file/import recovery. No preflight, model invocation or generation retry.
    const result=await finishOriginal(p.directory,path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'generated_images'),fetch,p.origin+'/api/publishing/images');
    const output={...result,requestId:taskId,directory:p.directory,references:p.references,recoveryOnly:true};
    this.store.saveWork({...task,revision:task.revision+1,status:'prepared',owner:null,claimToken:null,leaseUntil:null,result:JSON.stringify(output),updatedAt:this.clock().toISOString()});
    this.store.recordKnowledge({kind:'observation',resourceId:taskId,source:'codex_original_image_import_recovery',text:'Existing verified original image imported without another generation.',evidence:output});return output;
  }
}
