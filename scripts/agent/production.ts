import {statfsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AgentStore,stableHash,type AgentJob} from './store.js';
import {ApiError} from './http.js';
import {PipelineAdapter} from './pipeline.js';
import {SccAdapter} from './scc.js';
import {AgentWorkQueue} from './work-queue.js';

const account=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const productionConfigSchema=z.object({
  version:z.literal('gemini-production.v1').default('gemini-production.v1'),
  enabled:z.boolean().default(false),
  refreshObservationHours:z.number().min(1).max(168).default(5),
  targetPerWindow:z.number().int().min(1).max(5).default(3),
  maxBacklogItems:z.number().int().min(1).max(100).default(8),
  maxBacklogBytes:z.number().int().min(1024**2).max(100*1024**3).default(512*1024**2),
  reservationBytes:z.number().int().min(1024**2).max(1024**3).default(64*1024**2),
  minimumFreeBytes:z.number().int().min(0).max(1024**4).default(1024**3),
  observationSeconds:z.number().int().min(30).max(86400).default(300),
  maxRecoveryChecks:z.number().int().min(0).max(5).default(2),
  publication:z.object({enabled:z.literal(false).default(false),minimumHoursBetweenPosts:z.number().min(1).max(720).default(24),maximumPerPagePerDay:z.number().int().min(1).max(10).default(1)}).default({enabled:false,minimumHoursBetweenPosts:24,maximumPerPagePerDay:1}),
}).strict().superRefine((c,ctx)=>{if(c.reservationBytes>c.maxBacklogBytes)ctx.addIssue({code:'custom',message:'Reservation exceeds backlog byte capacity'});});
export const productionConceptSchema=z.object({
  version:z.literal('gemini-concept.v1'),fictional:z.literal(true),
  accountId:account,title:z.string().trim().min(1).max(180),idea:z.string().trim().min(1).max(6000),
  hook:z.string().trim().min(1).max(800),development:z.string().trim().min(1).max(1200),payoff:z.string().trim().min(1).max(800),
  category:z.enum(['living_objects','visual_comedy','transformation','surprising_interaction','miniature_action','emotional_micro_story']),
}).strict();
const scopeSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,70}$/),geminiAccountId:account,pageAccountId:account,maxSubmissions:z.number().int().min(1).max(5),expiresAt:z.string().datetime()}).strict();
const reviewSchema=z.object({itemId:z.string().min(1).max(200),sha256:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['accepted','rejected']),visual:z.enum(['pass','fail']),audio:z.enum(['pass','fail']),source:z.literal('owner'),notes:z.string().min(1).max(2000),caption:z.string().min(1).max(6000),hashtags:z.string().max(1000).default('')}).strict();
type Config=z.infer<typeof productionConfigSchema>;
type Scope=z.infer<typeof scopeSchema>;
type Any=Record<string,any>;
const prefix='gemini-production:';
// SQLite's CURRENT_TIMESTAMP is UTC even though its text has no suffix.
function publicationTime(value:unknown):number {
  if(typeof value!=='string')return NaN;
  if(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value))return Date.parse(value.replace(' ','T')+'Z');
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value)?Date.parse(value):NaN;
}

/** One bounded step on the existing AgentRunner trigger; Pipeline owns video execution.
 * No timer, quota reset, account rotation, publishing approval or recurring schedule.
 */
export class GeminiProduction {
  readonly work:AgentWorkQueue;
  constructor(readonly store:AgentStore,readonly pipeline:PipelineAdapter,readonly scc:SccAdapter,
    readonly targets:{pipeline:string;scc:string},readonly directory:string,
    readonly clock:()=>Date=()=>new Date(),readonly freeBytes:()=>number=()=>{const s=statfsSync(directory);return s.bavail*s.bsize;}){this.work=new AgentWorkQueue(store,clock);}
  config():Config{return productionConfigSchema.parse(this.store.runnerState('production.config')??{});}
  configure(input:unknown){const value=productionConfigSchema.parse(input);if(value.enabled)throw new Error('Enable production only through an explicitly authorized bounded cycle');this.store.setRunnerState('production.config',value);return value;}
  private ids():string[]{return this.store.runnerState<string[]>('production.items')??[];}
  private items():AgentJob[]{return this.ids().map(id=>this.store.getJob(id)).filter((x):x is AgentJob=>!!x);}
  private item(id:string):AgentJob{const j=this.store.getJob(id);if(!j||!(j.input as Any).production||stableHash((j.input as Any).targets)!==stableHash(this.targets))throw new Error('Unknown production item or changed API targets');return j;}
  private save(id:string,value:Any){return this.store.patchState(id,value);}
  private inventory(){const c=this.config();const items=this.items().filter(j=>j.state.phase!=='published'&&(j.state.phase!=='failed'||!!j.state.media));
    const bytes=items.reduce((n,j)=>n+Number((j.state.media as Any)?.bytes??(['queued','planning','generating','recovering'].includes(String(j.state.phase))?c.reservationBytes:0)),0);
    return {items:items.length,bytes,full:items.length>=c.maxBacklogItems||bytes+c.reservationBytes>c.maxBacklogBytes};}
  status(){const active=this.store.runnerState<string>('production.active');const cycle=active?this.store.getJob(active):null;
    return {version:'gemini-production.v1',config:this.config(),inventory:this.inventory(),cycle:cycle?{id:cycle.id,scope:cycle.input,state:cycle.state}:null,
      backlog:this.items().map(j=>({id:j.id,title:(j.input as Any).concept.title,accountId:(j.input as Any).concept.accountId,...j.state})),
      providerAllowance:null,refreshObservationHours:this.config().refreshObservationHours,planningAssumption:'Five-hour observations and 3–5 possible videos are not guaranteed allowances. Native admission remains authoritative. Observation timing never resets a counter.',
      publication:{automatic:false,standingPagePolicyRequired:true,cadence:this.config().publication},analyticsRequiredForProduction:false};}
  async publicationPlan(){
    const candidates=this.items().filter(j=>j.state.phase==='ready');
    if(!candidates.length)return {state:'no_ready_content',automatic:false};
    const item=candidates[0],accountId=(item.input as Any).concept.accountId,context=await this.scc.pageContext(accountId);
    const history=await this.scc.history({limit:100});
    if(history.hasMore)return {state:'publication_history_incomplete',automatic:false};
    const rows=history.items.filter((r:Any)=>r.account_id===accountId);
    if(rows.some((r:Any)=>!['published','failed','cancelled'].includes(r.status)||r.submission_state==='uncertain'))return {state:'original_publication_requires_reconciliation',automatic:false};
    const published=rows.filter((r:Any)=>r.status==='published');
    if(published.some((r:Any)=>!Number.isFinite(publicationTime(r.published_at))))return {state:'publication_timestamp_unknown',automatic:false};
    const times=published.map((r:Any)=>publicationTime(r.published_at)).sort((a:number,b:number)=>b-a),now=this.clock().getTime(),cadence=this.config().publication;
    const recent=times.filter((time:number)=>time>now-86400000);
    let next=times.length?times[0]+cadence.minimumHoursBetweenPosts*3600000:now;
    if(recent.length>=cadence.maximumPerPagePerDay)next=Math.max(next,recent[cadence.maximumPerPagePerDay-1]+86400000);
    const draft=await this.scc.review(String(item.state.draftId));
    if(draft.draft.destinations?.length!==1||draft.draft.destinations[0].accountId!==accountId||draft.draft.destinations[0].selectedVariantId!==item.state.variantId||draft.draft.videoId!==item.state.videoId)throw new Error('Ready draft identity or media changed since QA');
    return {state:next>now?'publication_cadence_wait':'exact_owner_approval_required',itemId:item.id,accountId,graphId:context.account.graphId,
      earliestAt:new Date(Math.max(now,next)).toISOString(),draft:draft.draft,automatic:false,standingPagePolicyRequired:true,productionBlocked:false};
  }
  async observe(postId?:string,accountId?:string){
    // Read existing publication receipts and saved metrics only. No provider
    // sync, approval, queue action or analytics-derived generation gate.
    let tracked=this.store.runnerState<Any[]>('production.observations')??[];
    for(const item of this.items().filter(j=>j.state.phase==='ready')){
      const draft=await this.scc.getDraft(String(item.state.draftId));
      if(draft.queuedPostId){const receipt=await this.scc.publication(draft.queuedPostId);
        const accountId=(item.input as Any).concept.accountId;
        const destination=receipt.post?.destinations?.find((d:Any)=>d.account_id===accountId);
        if(destination?.status==='published'&&destination.confirmation_source==='api'&&destination.verification_status==='confirmed'&&destination.remote_post_id&&destination.remote_post_url){
          this.save(item.id,{phase:'published',publication:receipt});
          if(!tracked.some(o=>o.postId===draft.queuedPostId))tracked.push({postId:draft.queuedPostId,accountId,checkpoints:[],receipt});
        }
      }
    }
    if(postId){if(!accountId)throw new Error('An exact Page identity is required');
      if(!tracked.some(o=>o.postId===postId)){
        if(tracked.length>=200)throw new Error('Observation history capacity reached');
        const receipt=await this.scc.publication(postId);
        if(!receipt.post?.destinations?.some((d:Any)=>d.account_id===accountId&&d.status==='published'&&d.confirmation_source==='api'&&d.verification_status==='confirmed'&&d.remote_post_id&&d.remote_post_url))throw new Error('Verified exact-Page publication receipt required');
        tracked.push({postId,accountId,checkpoints:[],receipt});
      }
    }
    this.store.setRunnerState('production.observations',tracked);
    // One post per trigger bounds local observation work. Saved observation
    // timestamps remain visible even when no newer Meta data is available.
    for(const o of tracked){
      const destination=o.receipt.post.destinations.find((d:Any)=>d.account_id===o.accountId);
      const published=publicationTime(destination.published_at);
      if(!Number.isFinite(published))continue;
      for(const p of o.checkpoints){if(Date.parse(p.checkedAt)<published+p.hours*3600000)p.timingStatus='premature_unzoned_timestamp';}
      this.store.setRunnerState('production.observations',tracked);
      const hours=[1,24,72].find(h=>!o.checkpoints.some((p:Any)=>p.hours===h&&!p.timingStatus)&&this.clock().getTime()>=published+h*3600000);
      if(hours===undefined)continue;
      const metrics=await this.scc.analytics(o.accountId,destination.id,{limit:20});
      o.checkpoints.push({hours,checkedAt:this.clock().toISOString(),metrics,followerDelta:null,followerAttribution:'unavailable'});
      this.store.setRunnerState('production.observations',tracked);
      return {state:'observation_saved',postId:o.postId,hours,metrics,productionBlocked:false};
    }
    return {state:'no_observation_due',tracked:tracked.length,productionBlocked:false};
  }
  enqueue(input:unknown,source?:{taskId:string;revision:number}){
    const concept=productionConceptSchema.parse(input),id=prefix+'item:'+stableHash({concept,source:source??null}).slice(0,32);
    return this.store.transaction(()=>{
      if(this.store.getJob(id))return this.item(id);
      if(this.inventory().full)throw new Error('Production backlog capacity reached');
      const ids=this.ids();if(ids.length>=1000)throw new Error('Production history index needs explicit maintenance; no history was deleted');
      this.store.createJob(id,{production:true,title:concept.title,concept,source:source??null,targets:this.targets});
      this.save(id,{phase:'queued',queuedAt:this.clock().toISOString()});this.store.setRunnerState('production.items',[...ids,id]);return this.item(id);
    });
  }
  enqueuePrepared(taskId:string){const t=this.store.getWork(taskId);if(!t||t.kind!=='prepare_video'||t.status!=='prepared'||t.payload?.production?.version!=='gemini-concept.v1')throw new Error('Use an exact prepared Gemini production concept task');const concept=productionConceptSchema.parse(t.result);if(concept.accountId!==t.accountId)throw new Error('Prepared concept Page identity changed');return this.enqueue(concept,{taskId:t.id,revision:t.revision});}
  start(input:unknown,ownerAuthorized=false){if(ownerAuthorized!==true)throw new Error('An explicit bounded live-production scope is required');const scope=scopeSchema.parse(input),now=this.clock().getTime();
    if(Date.parse(scope.expiresAt)<=now||Date.parse(scope.expiresAt)>now+7*86400000)throw new Error('Scope expiry must be in the next seven days');
    return this.store.transaction(()=>{const old=this.store.runnerState<string>('production.active');if(old&&!['finished','expired','stopped'].includes(String(this.store.getJob(old)?.state.phase)))throw new Error('An existing production cycle still owns the scope');
      if(old&&this.store.getJob(old)?.state.activeItem)throw new Error('Resolve the original active item before replacing a scope');
      const c=this.config(),id=prefix+'cycle:'+scope.id;this.store.createJob(id,{scope,configHash:stableHash({...c,enabled:true}),targets:this.targets});
      if(this.store.getJob(id)!.state.phase)throw new Error('A consumed cycle ID cannot be rearmed');
      this.save(id,{phase:'active',attempts:[],createdProjects:0,activeItem:null,startedAt:this.clock().toISOString()});this.store.setRunnerState('production.config',{...c,enabled:true});this.store.setRunnerState('production.active',id);return this.status();});
  }
  stop(){const id=this.store.runnerState<string>('production.active');if(id)this.save(id,{phase:'stopped',stoppedAt:this.clock().toISOString()});this.store.setRunnerState('production.config',{...this.config(),enabled:false});return this.status();}
  async close(ownerAuthorized=false){
    if(!ownerAuthorized)throw new Error('Closing a held cycle requires explicit owner review');
    const id=this.store.runnerState<string>('production.active'),cycle=id?this.store.getJob(id):null;if(!cycle)throw new Error('No original cycle');
    if(stableHash((cycle.input as Any).targets)!==stableHash(this.targets))throw new Error('Original API targets changed');
    const n=await this.pipeline.productionStatus();if(n.activeRunId||n.observationLocked||n.unresolved||n.boundedRequests.some((r:Any)=>r.in_progress))throw new Error('Resolve the protected original operation first');
    if(cycle.state.activeItem){const item=this.item(String(cycle.state.activeItem));
      if(!item.state.projectId)throw new Error('Reconcile the original creation before closing');
      const e=await this.pipeline.inspect(String(item.state.projectId));
      const native=n.boundedRequests.find((r:Any)=>r.jobId===item.state.projectId&&r.request_id===item.state.requestId);
      const admissionBlocked=native?.state==='blocked'&&!native.in_progress&&!e.original.runId&&!e.run.submissionIntent&&!e.run.acknowledged;
      const resolved=['conclusive_provider_failure_no_video','owner_confirmed_no_video','quota_rejected_no_video','provider_error_no_result'].includes(e.run.resolution);
      if(e.session.active||e.session.unresolved||e.project.state==='completed'||((e.run.submissionIntent||e.run.acknowledged)&&!resolved))throw new Error('Import completed media or resolve the exact original run before closing');
      if(this.store.getOperation(item.id,'production_submit')&&!(e.run.finishedAt||resolved||admissionBlocked))throw new Error('Unconfirmed dispatch intent cannot be closed');
      this.save(item.id,{phase:'failed',closedAt:this.clock().toISOString(),closeReason:admissionBlocked?'native_admission_blocked_no_provider_submission':'authorized_resolved_or_unsubmitted',original:e.original,...(admissionBlocked?{admission:native}:{})});
      this.store.releaseProvider('gemini_web:'+this.targets.pipeline,item.id);
    }
    this.save(cycle.id,{phase:'finished',activeItem:null,finishedAt:this.clock().toISOString(),closeReason:'authorized_close_after_verified_resolution'});
    this.store.setRunnerState('production.config',{...this.config(),enabled:false});return this.status();
  }
  private cycle(){const id=this.store.runnerState<string>('production.active');const c=id?this.store.getJob(id):null;if(!c)return null;if(stableHash((c.input as Any).targets)!==stableHash(this.targets)||stableHash(this.config())!==(c.input as Any).configHash)throw new Error('Production configuration or targets changed; review a new authorization');return c;}
  private async once(id:string,step:string,request:unknown,action:()=>Promise<any>,admit?:()=>void){const op=this.store.transaction(()=>{if(!this.store.getOperation(id,step))admit?.();return this.store.claimOperation(id,step,request);});if(!op.claimed){if(op.operation.status==='succeeded')return op.operation.response;throw new Error('reconciliation_required:'+step);}
    try{const result=await action();this.store.finishOperation(id,step,'succeeded',result);return result;}
    catch(e){this.store.finishOperation(id,step,e instanceof ApiError&&!e.uncertain?'rejected':'uncertain',{code:e instanceof ApiError?e.code:'operation_unconfirmed'});throw e;}}
  private async conceptTask(scope:Scope,cycle:AgentJob){
    const id='gemini-concept-'+scope.id+'-'+Number(cycle.state.createdProjects);
    if(!this.store.getWork(id)){const context=await this.scc.pageContext(scope.pageAccountId);this.work.add({id,kind:'prepare_video',title:'Prepare one complete ten-second Gemini entertainment concept',priority:70,accountId:scope.pageAccountId,
      payload:{production:{version:'gemini-concept.v1'},pageContext:context,
        avoidRepeating:this.items().slice(-8).map(j=>({title:(j.input as Any).concept.title,idea:String((j.input as Any).concept.idea).slice(0,400)})),
        research:this.store.listKnowledge({accountId:scope.pageAccountId,limit:5}).filter(k=>(k.evidence as Any)?.sources&&Date.parse((k.evidence as Any).validUntil)>this.clock().getTime()).map(k=>({summary:k.text,evidence:k.evidence,notice:'Supplied dated sources, not independently verified; no trend claim'})),
        brief:'Original fictional visual entertainment. Immediate hook, one consequential development, visible payoff. One ten-second portrait text-only clip with native sound. No multi-scene continuation or irrelevant dialogue. Return a gemini-concept.v1 object in result. Do not repeat prior concepts across Pages merely for volume. Missing trend research does not prevent an original fictional concept; do not invent popularity or factual claims.'}});}
    return {state:'needs_concept',taskId:id};
  }
  private async eligibleNative(accountId:string,ownProjectId?:string){const n=await this.pipeline.productionStatus();
    if(!n.available||!n.workerEnabled)return {n,block:'provider_unavailable'};
    if(n.nativeEnabled)return {n,block:'native_scheduler_running'};
    if(n.unresolved||n.activeRunId||n.observationLocked||n.boundedRequests.some((r:Any)=>r.in_progress&&r.jobId!==ownProjectId))return {n,block:'original_submission_protected'};
    if(n.accountingHold)return {n,block:'accounting_or_storage_hold'};
    if(n.used>=n.cap)return {n,block:'application_cap'};
    const usage=n.accountUsage?.[accountId];
    if(usage){
      if(!Number.isInteger(usage.submissions)||usage.submissions<0)return {n,block:'account_application_accounting_unknown'};
      const start=Date.parse(usage.window_started_at??''),hours=n.applicationWindowHours;
      // Mirror the native accountUsage eligibility predicate without changing
      // its ledger. An expired application window says nothing about provider quota.
      const expired=Number.isFinite(start)&&typeof hours==='number'&&hours>0&&start+hours*3600000<=this.clock().getTime();
      if(usage.submissions>=n.cap&&!expired)return {n,block:'account_application_cap'};
    }
    return {n,block:null};
  }
  async tick(){const c=this.config();if(!c.enabled)return {state:'disabled',actions:0};const cycle=this.cycle();if(!cycle)return {state:'activation_required',actions:0};
    const lease=randomUUID(),now=this.clock().getTime();const acquired=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token:lease,until:new Date(now+900000).toISOString()});return true;});
    if(!acquired)return {state:'busy',actions:0};
    try{const latest=this.cycle();if(!latest)throw new Error('Original cycle changed');return await this.step(latest,c);}catch(e){this.save(cycle.id,{lastError:e instanceof ApiError?e.code:e instanceof Error?e.message:'production_step_failed',lastCheckedAt:this.clock().toISOString()});return {state:'reconciliation_required',actions:0,error:e instanceof ApiError?e.code:e instanceof Error?e.message:'production_step_failed'};}
    finally{this.store.transaction(()=>{if(this.store.runnerState<Any>('production.lease')?.token===lease)this.store.setRunnerState('production.lease',null);});}
  }
  private async step(cycle:AgentJob,c:Config):Promise<Any>{
    const scope=(cycle.input as Any).scope as Scope;
    // Observing/recovering owned work remains possible after expiry; no new submission does.
    if(cycle.state.activeItem)return this.advance(cycle,this.item(String(cycle.state.activeItem)),scope,c);
    if(cycle.state.phase!=='active')return {state:String(cycle.state.phase),actions:0};
    if(Date.parse(scope.expiresAt)<=this.clock().getTime()){this.save(cycle.id,{phase:'expired'});return {state:'scope_expired',actions:0};}
    if((cycle.state.attempts as string[]).length>=Math.min(scope.maxSubmissions,c.targetPerWindow)||Number(cycle.state.createdProjects)>=scope.maxSubmissions){this.save(cycle.id,{phase:'finished',finishedAt:this.clock().toISOString()});return {state:'cycle_finished',actions:0};}
    const free=this.freeBytes();if(!Number.isFinite(free)||free<c.minimumFreeBytes+c.reservationBytes)return {state:'storage_hold',actions:0};
    const native=await this.eligibleNative(scope.geminiAccountId);if(native.block)return {state:native.block,actions:0,providerAllowance:null,nextCheckAt:native.n.accountWaitNext};
    for(const t of this.store.listWork(100)){if(t.kind==='prepare_video'&&t.status==='prepared'&&t.accountId===scope.pageAccountId&&t.payload?.production?.version==='gemini-concept.v1'){
      try{this.enqueuePrepared(t.id);}catch(e){if(!this.inventory().full)throw e;}
    }}
    const item=this.items().find(j=>j.state.phase==='queued'&&(j.input as Any).concept.accountId===scope.pageAccountId);
    if(!item){if(this.inventory().full)return {state:'backlog_full',actions:0};return this.conceptTask(scope,cycle);}
    this.store.transaction(()=>{this.save(cycle.id,{activeItem:item.id,createdProjects:Number(cycle.state.createdProjects)+1});this.save(item.id,{phase:'planning',cycleId:cycle.id,geminiAccountId:scope.geminiAccountId});});
    return this.advance(this.store.getJob(cycle.id)!,this.item(item.id),scope,c);
  }
  private async advance(cycle:AgentJob,item:AgentJob,scope:Scope,c:Config):Promise<Any>{
    const concept=(item.input as Any).concept;
    const providerScope='gemini_web:'+this.targets.pipeline;
    if(!item.state.projectId){
      if(Date.parse(scope.expiresAt)<=this.clock().getTime())return {state:'scope_expired',actions:0};
      if(!this.store.reserveProvider(providerScope,item.id))return {state:'provider_claim_held',actions:0};
      const idea=[concept.idea,'Hook: '+concept.hook,'Development: '+concept.development,'Payoff: '+concept.payoff,'One complete ten-second portrait scene. Native audio.'].join('\n');
      const input={title:concept.title,idea,sceneCount:1,aspectRatio:'9:16'};
      const result=await this.once(item.id,'production_create',{input,accountId:scope.geminiAccountId},()=>this.pipeline.prepareProduction(input,scope.geminiAccountId),()=>this.authorized(cycle.id,item.id,scope));
      this.save(item.id,{projectId:result.projectId});return {state:'planning',itemId:item.id,projectId:result.projectId,actions:1};
    }
    const projectId=String(item.state.projectId),e=await this.pipeline.inspect(projectId);
    const condition=e.project.state==='completed'?'completed':e.session.unresolved?'recovery_required':e.project.state==='failed'?'failed':'pending';
    this.store.recordGeneration(item.id,{condition,checkedAt:this.clock().toISOString(),evidence:e});
    this.save(item.id,{lastObservation:e,lastCheckedAt:this.clock().toISOString()});
    if(e.project.state==='completed'&&e.project.media.videoUrl){
      if(e.session.active||e.session.unresolved)return {state:'original_submission_protected',actions:0};
      const facts=await this.once(item.id,'production_artifact',{projectId},()=>this.pipeline.productionArtifact(projectId,c.reservationBytes));
      if(await this.scc.pipelineOrigin()!==this.targets.pipeline)throw new Error('SCC Pipeline origin differs');
      const imported=await this.once(item.id,'production_import',{projectId},()=>this.scc.importVideo(projectId,undefined,concept.title));
      const media=await this.scc.media(imported.videoId);
      if(media.provenance.sha256!==facts.sha256||media.file_size!==facts.bytes)throw new Error('Imported master differs from verified final artifact');
      const technical=media.width*16===media.height*9&&Math.abs(media.duration-10)<0.15&&media.provenance.hasAudio===true;
      this.save(item.id,{phase:technical?'awaiting_qa':'qa_failed',videoId:imported.videoId,media:{sha256:facts.sha256,bytes:facts.bytes,technical,metadata:media},original:e.original});
      this.store.releaseProvider(providerScope,item.id);this.save(cycle.id,{activeItem:null});
      return {state:technical?'awaiting_qa':'qa_failed',actions:1,itemId:item.id,publication:false};
    }
    const code=String(e.failure?.code??e.session.nativeBlock??'');
    if(/human|login|security|captcha/.test(code)||/human|login|security/.test(e.recovery?.state??'')){this.save(cycle.id,{phase:'human_action_required'});return {state:'human_action_required',actions:0};}
    const resolvedNoVideo=['conclusive_provider_failure_no_video','owner_confirmed_no_video','quota_rejected_no_video','provider_error_no_result'].includes(e.run.resolution);
    if((e.run.status==='provider_failed'||e.run.status==='failed'||resolvedNoVideo||e.project.state==='failed') && (e.run.submissionIntent||e.run.acknowledged||e.run.finishedAt) && !e.session.unresolved && !e.session.active){
      this.save(item.id,{phase:'failed',failure:e.failure,original:e.original});this.save(cycle.id,{phase:'provider_failure_hold'});
      if(resolvedNoVideo||(!e.run.submissionIntent&&!e.run.acknowledged&&e.run.finishedAt))this.store.releaseProvider(providerScope,item.id);
      return {state:'provider_failure_hold',actions:0};
    }
    if(e.session.unresolved||e.recovery.required){
      const attempts=Number(item.state.recoveryChecks??0),next=Date.parse(String(item.state.nextRecoveryAt??''));
      if(!e.session.active&&e.recovery.canRecover&&e.original.runId&&attempts<c.maxRecoveryChecks&&(!Number.isFinite(next)||next<=this.clock().getTime())){
        // The supported project/run route can only recover that exact saved turn.
        this.save(item.id,{phase:'recovering',recoveryChecks:attempts+1,nextRecoveryAt:new Date(this.clock().getTime()+c.observationSeconds*1000).toISOString()});
        await this.once(item.id,'production_recover_'+attempts,{projectId,runId:e.original.runId},()=>this.pipeline.recoverProduction(projectId,e.original.runId));return {state:'recovering_original',actions:1};
      }
      return {state:e.session.active?'generating':'recovery_required',actions:0};
    }
    if(e.run.submissionIntent||e.run.acknowledged||e.session.active){
      this.save(item.id,{phase:'generating',original:e.original});return {state:'generating',actions:0};
    }
    if(e.project.state==='failed'){this.save(item.id,{phase:'failed',failure:e.failure});this.save(cycle.id,{phase:'planning_failure_hold'});return {state:'planning_failure_hold',actions:0};}
    if(e.plannedScenes!==1||e.project.state!=='awaiting_external_generation')return {state:'planning',actions:0};
    if(Date.parse(scope.expiresAt)<=this.clock().getTime())return {state:'scope_expired',actions:0};
    if(cycle.state.phase!=='active')return {state:String(cycle.state.phase),actions:0};
    if(this.freeBytes()<c.minimumFreeBytes+c.reservationBytes)return {state:'storage_hold',actions:0};
    const inventory=this.inventory();if(inventory.items>c.maxBacklogItems||inventory.bytes>c.maxBacklogBytes)return {state:'backlog_full',actions:0};
    const create=this.store.getOperation(item.id,'production_create');
    if(!create)throw new Error('Missing original creation intent');
    const expected=create.request as Any;
    await this.pipeline.verifyProduction(projectId,expected.input,expected.accountId,true);
    const n=await this.eligibleNative(scope.geminiAccountId,projectId);
    const own=n.n.boundedRequests.find((r:Any)=>r.jobId===projectId);
    const requestId='scc-production-'+stableHash({cycle:cycle.id,item:item.id}).slice(0,40);
    const previous=this.store.getOperation(item.id,'production_submit');
    if(own?.request_id===requestId){
      if(own.state==='blocked'&&!own.in_progress&&!e.original.runId&&!e.run.submissionIntent&&!e.run.acknowledged&&!e.session.active&&!e.session.unresolved){
        this.save(item.id,{phase:'admission_blocked',admission:own,original:e.original});this.save(cycle.id,{phase:'application_capacity_hold'});
        this.store.recordGeneration(item.id,{condition:'admission_blocked',checkedAt:this.clock().toISOString(),evidence:{nativeRequest:own,original:e.original,providerSubmitted:false}});
        this.store.releaseProvider(providerScope,item.id);
        return {state:'native_admission_blocked',actions:0,providerSubmitted:false,nativeRequest:own};
      }
      if(previous&&['pending','uncertain'].includes(previous.status))this.store.finishOperation(item.id,'production_submit','succeeded',{nativeRequest:own,readBackAt:this.clock().toISOString()});
      return {state:own.in_progress?'generating':'native_request_recorded',actions:0};
    }
    if(n.block)return {state:n.block,actions:0,nextCheckAt:n.n.accountWaitNext};
    if(previous)return {state:'reconciliation_required',actions:0,originalOperationStatus:previous.status};
    const observed=n.n.availability;
    if(observed&&/human|login|security/.test(String(observed.blocker_code)))return {state:'human_action_required',actions:0};
    const next=Date.parse(String(item.state.nextAvailabilityAt??''));if(Number.isFinite(next)&&next>this.clock().getTime())return {state:'waiting_provider',actions:0,nextCheckAt:item.state.nextAvailabilityAt};
    this.save(item.id,{nextAvailabilityAt:new Date(this.clock().getTime()+c.observationSeconds*1000).toISOString()});
    await this.pipeline.checkProductionAvailability();
    const ready=await this.eligibleNative(scope.geminiAccountId,projectId),a=ready.n.availability;
    const nativeBlock=ready.block??ready.n.blockers?.[0];
    if(nativeBlock||!a||a.blocker_code!=='video_available'||a.stale||a.conflicting_evidence||a.previous_submission_uncertain){
      const providerDate=Date.parse(String(a?.next_recheck_at??''));
      this.save(item.id,{nextAvailabilityAt:Number.isFinite(providerDate)&&providerDate>this.clock().getTime()?a.next_recheck_at:new Date(this.clock().getTime()+c.refreshObservationHours*3600000).toISOString(),providerBlocker:nativeBlock??a?.blocker_code??'unknown'});
      return {state:nativeBlock??String(a?.blocker_code??'availability_unknown'),actions:0,providerAllowance:null};
    }
    const admission=ready.n.boundedRequests.find((r:Any)=>r.jobId===projectId);
    if(!admission||admission.available!==true){this.save(item.id,{admission:admission??null});this.save(cycle.id,{phase:'application_capacity_hold'});return {state:'native_project_admission_blocked',actions:0,providerSubmitted:false,nativeRequest:admission??null};}
    if((cycle.state.attempts as string[]).length>=Math.min(scope.maxSubmissions,c.targetPerWindow))return {state:'cycle_budget',actions:0};
    await this.once(item.id,'production_submit',{projectId,requestId,scope:scope.id},()=>this.pipeline.submitProduction(projectId,requestId),()=>{
      const current=this.authorized(cycle.id,item.id,scope),attempts=current.state.attempts as string[];
      if(attempts.length>=Math.min(scope.maxSubmissions,c.targetPerWindow))throw new Error('Bounded cycle budget reached');
      this.save(cycle.id,{attempts:[...attempts,requestId]});this.save(item.id,{requestId,phase:'generating',windowObservedAt:ready.n.windowStartedAt??null});
    });
    return {state:'bounded_request_queued',actions:1,itemId:item.id,projectId,requestId,providerAllowance:null};
  }
  private authorized(cycleId:string,itemId:string,scope:Scope){
    const current=this.cycle();
    if(!this.config().enabled||!current||current.id!==cycleId||current.state.phase!=='active'||current.state.activeItem!==itemId||Date.parse(scope.expiresAt)<=this.clock().getTime())throw new Error('Production authorization changed before dispatch');
    return current;
  }
  async reconcile(itemId:string,projectId:string){
    const item=this.item(itemId),op=this.store.getOperation(itemId,'production_create');
    if(!op || !['pending','uncertain','succeeded'].includes(op.status))throw new Error('No unresolved original creation intent');
    const request=op.request as Any;
    const result=await this.pipeline.verifyProduction(projectId,request.input,request.accountId);
    if(item.state.projectId&&item.state.projectId!==projectId)throw new Error('Original project identity cannot change');
    if(op.status!=='succeeded')this.store.finishOperation(itemId,'production_create','succeeded',result);
    this.save(itemId,{projectId,creationReconciledAt:this.clock().toISOString()});return {itemId,projectId,reconciled:true};
  }
  async resume(ownerAuthorized=false){if(!ownerAuthorized)throw new Error('Manual security completion or failed-scope review requires owner authorization');const cycle=this.cycle();if(!cycle)throw new Error('No original cycle');
    if(cycle.state.phase==='provider_failure_hold'||cycle.state.phase==='planning_failure_hold')throw new Error('A provider/planning failure ends this bounded cycle; reconcile the original before authorizing another scope');
    await this.pipeline.checkProductionAvailability();const fresh=await this.pipeline.productionStatus();if(fresh.availability?.blocker_code!=='video_available'||fresh.availability.stale)throw new Error('Fresh supported availability did not pass');this.save(cycle.id,{phase:'active'});return this.status();}
  async review(input:unknown,ownerAuthorized=false){if(!ownerAuthorized)throw new Error('Actual owner audiovisual review is required');const r=reviewSchema.parse(input),j=this.item(r.itemId),media=j.state.media as Any;
    if(!['awaiting_qa','branding','ready'].includes(String(j.state.phase))||media?.sha256!==r.sha256 || (j.state.qa&&stableHash(j.state.qa)!==stableHash(r)))throw new Error('Review must bind the unchanged original master and original QA decision');
    if(j.state.phase==='ready')return {state:'ready',draft:await this.scc.getDraft(String(j.state.draftId)),approved:false,queued:false};
    const accepted=r.decision==='accepted'&&r.visual==='pass'&&r.audio==='pass'&&media.technical;
    this.store.recordKnowledge({id:'production-qa:'+j.id,kind:'observation',accountId:(j.input as Any).concept.accountId,resourceId:j.id,source:'owner_audiovisual_review',text:r.notes,evidence:r});
    this.save(j.id,{qa:r,phase:accepted?'branding':'qa_failed'});if(!accepted)return {state:'qa_failed',itemId:j.id};
    const concept=(j.input as Any).concept;
    const rendered=await this.once(j.id,'production_brand',{videoId:j.state.videoId,accountId:concept.accountId},()=>this.scc.brandProduction(String(j.state.videoId),concept.accountId));
    const prepared=await this.once(j.id,'production_draft',{videoId:j.state.videoId,variantId:rendered.variantId,caption:r.caption,hashtags:r.hashtags,accountId:concept.accountId},()=>this.scc.prepare({title:concept.title,videoId:String(j.state.videoId),accountId:concept.accountId,caption:r.caption,hashtags:r.hashtags,selectedVariantId:rendered.variantId,applyBranding:false,scheduledAt:null}));
    this.save(j.id,{phase:'ready',draftId:prepared.draft.id,variantId:rendered.variantId});return {state:'ready',draft:prepared.draft,approved:false,queued:false};
  }
}
