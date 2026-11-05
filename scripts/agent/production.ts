import {statfsSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {OwnerVideoReviews} from './video-review.js';
import {AgentStore,stableHash,type AgentJob} from './store.js';
import {ApiError} from './http.js';
import {PipelineAdapter} from './pipeline.js';
import {SccAdapter} from './scc.js';
import {AgentWorkQueue} from './work-queue.js';
import {CreatorResearch} from './creator-research.js';
import {geminiLanguageSchema,geminiLanguagePolicyVersion,validateLanguageEvidence,geminiConceptIdea} from './gemini-language.js';
import {GeminiMediaQa,candidateCopy} from './gemini-media-qa.js';

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
  researchUse:z.object({findingIds:z.array(z.string()).max(3),principleIds:z.array(z.string()).max(6),originality:z.string().min(1).max(800)}).strict().optional(),
  languageStrategy:geminiLanguageSchema.optional(),
}).strict();
export const standingProductionSchema=z.object({version:z.literal('gemini-production-policy.v1'),id:z.string().regex(/^[A-Za-z0-9_-]{1,50}$/),geminiAccountId:account,pageAccountId:account,pageGraphId:z.string().regex(/^\d+$/),expiresAt:z.string().datetime().nullable(),targetPerWindow:z.number().int().min(3).max(5).default(3),planningWindowHours:z.number().min(1).max(168).default(5),maxPer24Hours:z.number().int().min(1).max(100).default(12),maxTotalSubmissions:z.number().int().min(1).max(100000).nullable().default(null)}).strict();
const scopeSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,70}$/),geminiAccountId:account,pageAccountId:account,maxSubmissions:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),expiresAt:z.string().datetime(),policyId:z.string().optional()}).strict();
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
    readonly clock:()=>Date=()=>new Date(),readonly freeBytes:()=>number=()=>{const s=statfsSync(directory);return s.bavail*s.bsize;},readonly mediaQa:Pick<GeminiMediaQa,'inspect'>=new GeminiMediaQa(path.join(directory,'production-qa'))){this.work=new AgentWorkQueue(store,clock);}
  config():Config{return productionConfigSchema.parse(this.store.runnerState('production.config')??{});}
  policy(){const id=this.store.runnerState<string>('production.policy');return id?this.store.getJob(id):null;}
  policyStatus(){const p=this.policy();return p?{id:p.id,policy:(p.input as Any).policy,targets:(p.input as Any).targets,authorizationExpiresAt:(p.input as Any).policy.expiresAt,state:p.state,budget:this.policyBudget(p)}:{enabled:false};}
  private policyBudget(job:AgentJob){const p=(job.input as Any).policy,now=this.clock().getTime(),issued=Date.parse(String(job.state.issuedAt)),windowMs=p.planningWindowHours*3600000,start=issued+Math.max(0,Math.floor((now-issued)/windowMs))*windowMs;
    const events=(job.state.dispatches??[]) as Any[],daily=events.filter(e=>Date.parse(e.at)>now-86400000),window=events.filter(e=>Date.parse(e.at)>=start);
    let next=now;if(window.length>=p.targetPerWindow)next=Math.max(next,start+windowMs);if(daily.length>=p.maxPer24Hours)next=Math.max(next,Date.parse(daily[daily.length-p.maxPer24Hours].at)+86400000);
    const exhausted=p.maxTotalSubmissions!==null&&events.length>=p.maxTotalSubmissions;
    return {total:events.length,daily:daily.length,window:window.length,windowStartedAt:new Date(start).toISOString(),nextCheckAt:next>now?new Date(next).toISOString():null,exhausted,providerAllowance:null};
  }
  async authorizePolicy(input:unknown,ownerAuthorized=false){if(!ownerAuthorized)throw new Error('Standing production needs recorded owner authorization');const p=standingProductionSchema.parse(input);
    if(p.expiresAt&&Date.parse(p.expiresAt)<=this.clock().getTime())throw new Error('Policy already expired');
    const context=await this.scc.pageContext(p.pageAccountId);if(context.account.graphId!==p.pageGraphId)throw new Error('Standing policy Page identity differs');
    const id=prefix+'policy:'+p.id,existing=this.store.getJob(id);if(existing){if(stableHash((existing.input as Any).policy)!==stableHash(p)||existing.state.revokedAt)throw new Error('Policy IDs are immutable and revoked IDs cannot be rearmed');return this.policyStatus();}
    return this.store.transaction(()=>{
      const previous=this.policy();if(previous&&!previous.state.revokedAt)throw new Error('Revoke the previous standing policy before replacing it');
      this.store.createJob(id,{policy:p,targets:this.targets});this.save(id,{enabled:true,issuedAt:this.clock().toISOString(),dispatches:[],humanHold:null,nextCheckAt:null});
      this.start({id:'standing-'+stableHash(id).slice(0,32),geminiAccountId:p.geminiAccountId,pageAccountId:p.pageAccountId,maxSubmissions:p.maxTotalSubmissions??Number.MAX_SAFE_INTEGER,expiresAt:p.expiresAt??'9999-12-31T23:59:59.999Z',policyId:id},true,true);
      this.store.setRunnerState('production.policy',id);this.store.recordKnowledge({id:id+':authorization',kind:'observation',accountId:p.pageAccountId,resourceId:id,source:'explicit_owner_standing_production_authorization',text:'Standing Gemini-only production authorization; publication is excluded.',evidence:{policy:p,targets:this.targets,contextFingerprint:context.contextFingerprint}});return this.policyStatus();
    });
  }
  revokePolicy(){const p=this.policy();if(!p)return {enabled:false};if(p.state.revokedAt)return this.policyStatus();this.save(p.id,{enabled:false,revokedAt:this.clock().toISOString()});const id=this.store.runnerState<string>('production.active');if(id)this.save(id,{phase:'policy_revoked'});return this.policyStatus();}
  private policyFor(scope:Scope){if(!scope.policyId)return null;const p=this.store.getJob(scope.policyId);if(!p||stableHash((p.input as Any).targets)!==stableHash(this.targets))throw new Error('Original standing policy target changed');return p;}
  private policyAdmission(scope:Scope):Any|null {const job=this.policyFor(scope);if(!job)return null;const p=(job.input as Any).policy;
    if(!job.state.enabled||job.state.revokedAt)return {state:'policy_revoked'};if(p.expiresAt&&Date.parse(p.expiresAt)<=this.clock().getTime())return {state:'policy_expired'};
    if(job.state.humanHold)return {state:String(job.state.humanHold)};const budget=this.policyBudget(job);if(budget.exhausted)return {state:'policy_total_limit'};if(budget.nextCheckAt)return {state:'policy_budget_wait',nextCheckAt:budget.nextCheckAt};
    const next=Date.parse(String(job.state.nextCheckAt??''));if(Number.isFinite(next)&&next>this.clock().getTime())return {state:'waiting_capacity',nextCheckAt:new Date(next).toISOString()};return null;
  }
  private capacityWait(scope:Scope,n:Any,code:string){const job=this.policyFor(scope);if(!job)return;
    if(/human|login|security|captcha|sign_in/.test(code)){this.save(job.id,{humanHold:'human_action_required'});return;}
    const now=this.clock().getTime(),hours=n.applicationWindowHours;let value=code==='account_application_cap'?n.accountWaitNext:code==='application_cap'&&hours&&n.windowStartedAt?new Date(Date.parse(n.windowStartedAt)+hours*3600000).toISOString():n.nextCheckAt;
    if(code==='account_application_cap'&&!value){const usage=n.accountUsage?.[scope.geminiAccountId];if(usage?.window_started_at&&hours)value=new Date(Date.parse(usage.window_started_at)+hours*3600000).toISOString();}
    const date=Date.parse(value??'');this.save(job.id,{nextCheckAt:Number.isFinite(date)&&date>now?value:new Date(now+this.config().refreshObservationHours*3600000).toISOString(),waitReason:code});
  }
  configure(input:unknown){const value=productionConfigSchema.parse(input);if(value.enabled)throw new Error('Enable production only through an explicitly authorized bounded cycle');this.store.setRunnerState('production.config',value);return value;}
  private ids():string[]{return this.store.runnerState<string[]>('production.items')??[];}
  private items():AgentJob[]{return this.ids().map(id=>this.store.getJob(id)).filter((x):x is AgentJob=>!!x);}
  private item(id:string):AgentJob{const j=this.store.getJob(id);if(!j||!(j.input as Any).production||stableHash((j.input as Any).targets)!==stableHash(this.targets))throw new Error('Unknown production item or changed API targets');return j;}
  private save(id:string,value:Any){return this.store.patchState(id,value);}
  private inventory(){const c=this.config();const items=this.items().filter(j=>j.state.phase!=='published'&&(j.state.phase!=='failed'||!!j.state.media));
    const bytes=items.reduce((n,j)=>n+Number((j.state.media as Any)?.bytes??(['queued','planning','generating','recovering'].includes(String(j.state.phase))?c.reservationBytes:0))+Number((j.state.technicalQa as Any)?.artifactBytes??0)+Number((j.state.ownerVariantQa as Any)?.artifactBytes??0)+Number(j.state.candidateVariantBytes??0),0);
    return {items:items.length,bytes,full:items.length>=c.maxBacklogItems||bytes+c.reservationBytes>c.maxBacklogBytes};}
  status(){const active=this.store.runnerState<string>('production.active');const cycle=active?this.store.getJob(active):null;
    const scope=(cycle?.input as Any)?.scope as Scope|undefined,hold=scope?this.policyAdmission(scope):null,lastSuccess=this.items().filter(j=>j.state.videoId&&(j.state.media as Any)?.technical).sort((a,b)=>Date.parse(String(b.state.lastCheckedAt))-Date.parse(String(a.state.lastCheckedAt)))[0];
    return {version:'gemini-production.v1',config:this.config(),standing:this.policyStatus(),inventory:this.inventory(),cycle:cycle?{id:cycle.id,scope:cycle.input,state:cycle.state}:null,
      operation:{state:!this.config().enabled?'disabled':hold?.state??String(cycle?.state.phase??'activation_required'),nextRecheckAt:hold?.nextCheckAt??this.policy()?.state.nextCheckAt??null,lastSuccessfulImport:lastSuccess?{itemId:lastSuccess.id,videoId:lastSuccess.state.videoId,original:lastSuccess.state.original,completionObservedAt:lastSuccess.state.lastCheckedAt}:null,lastError:cycle?.state.lastError??null,requiredHumanAction:hold&&/human|security/.test(hold.state)?'Open the dedicated Gemini account session and complete any displayed security/sign-in check, then use production-resume. Do not resubmit the turn.':hold&&/reconciliation|failure/.test(hold.state)?'Inspect the exact original operation; use supported recovery or original-receipt reconciliation only.':null},
      nativeObservation:this.store.runnerState('production.nativeObservation')??null,backlogProcessing:this.store.runnerState('production.backlogLastTick')??null,
      backlog:this.items().map(j=>({id:j.id,title:(j.input as Any).concept.title,accountId:(j.input as Any).concept.accountId,...((j.input as Any).concept.languageStrategy?{languageStrategy:(j.input as Any).concept.languageStrategy}:{}),...j.state})),
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
      if(concept.languageStrategy)validateLanguageEvidence(concept.languageStrategy,new CreatorResearch(this.store,this.clock).status(concept.accountId).findings,this.clock().getTime());
      if(this.inventory().full)throw new Error('Production backlog capacity reached');
      const ids=this.ids();if(ids.length>=1000)throw new Error('Production history index needs explicit maintenance; no history was deleted');
      this.store.createJob(id,{production:true,title:concept.title,concept,source:source??null,targets:this.targets});
      this.save(id,{phase:'queued',queuedAt:this.clock().toISOString()});this.store.setRunnerState('production.items',[...ids,id]);return this.item(id);
    });
  }
  enqueuePrepared(taskId:string){const t=this.store.getWork(taskId);if(!t||t.kind!=='prepare_video'||!['prepared','done'].includes(t.status)||t.payload?.production?.version!=='gemini-concept.v1')throw new Error('Use an exact prepared Gemini production concept task');let value=t.result;if(typeof value==='string'){try{value=JSON.parse(value);}catch{throw new Error('Prepared concept must contain valid serialized gemini-concept.v1 JSON');}}const concept=productionConceptSchema.parse(value);if(concept.accountId!==t.accountId)throw new Error('Prepared concept Page identity changed');
    const original=this.items().find(j=>(j.input as Any).source?.taskId===t.id&&(j.input as Any).source?.revision===t.revision&&stableHash((j.input as Any).concept)===stableHash(concept));if(original)return this.item(original.id);
    const supplied=[...(t.payload?.creatorLearning?.external??[]),...(t.payload?.creatorLearning?.historicalHypotheses??[])];
    if(t.payload.production.languagePolicy===geminiLanguagePolicyVersion&&!concept.languageStrategy)throw new Error('New multilingual Gemini preparation requires language and audience metadata');
    if(concept.languageStrategy)validateLanguageEvidence(concept.languageStrategy,supplied,this.clock().getTime());
    if(concept.researchUse&&(concept.researchUse.findingIds.some(id=>!supplied.some(f=>f.id===id))||concept.researchUse.principleIds.some(id=>!supplied.some(f=>f.principles?.some((p:Any)=>p.id===id)))))throw new Error('Concept cites unsupplied creator evidence');
    return this.enqueue(concept,{taskId:t.id,revision:t.revision});}
  start(input:unknown,ownerAuthorized=false,fromPolicy=false){if(ownerAuthorized!==true)throw new Error('An explicit bounded live-production scope is required');const scope=scopeSchema.parse(input),now=this.clock().getTime();
    if(scope.policyId&&!fromPolicy)throw new Error('Use standing policy authorization');
    if((!scope.policyId&&(scope.maxSubmissions>5||Date.parse(scope.expiresAt)>now+7*86400000))||Date.parse(scope.expiresAt)<=now)throw new Error('Bounded scope requires at most five submissions and expiry in seven days');
    return this.store.transaction(()=>{const old=this.store.runnerState<string>('production.active');if(old&&!['finished','expired','stopped'].includes(String(this.store.getJob(old)?.state.phase)))throw new Error('An existing production cycle still owns the scope');
      if(old&&this.store.getJob(old)?.state.activeItem)throw new Error('Resolve the original active item before replacing a scope');
      const c=this.config(),id=prefix+'cycle:'+scope.id;this.store.createJob(id,{scope,configHash:stableHash({...c,enabled:true}),targets:this.targets});
      if(this.store.getJob(id)!.state.phase)throw new Error('A consumed cycle ID cannot be rearmed');
      this.save(id,{phase:'active',attempts:[],createdProjects:0,activeItem:null,startedAt:this.clock().toISOString()});this.store.setRunnerState('production.config',{...c,enabled:true});this.store.setRunnerState('production.active',id);return this.status();});
  }
  stop(){this.revokePolicy();const id=this.store.runnerState<string>('production.active');if(id)this.save(id,{phase:'stopped',stoppedAt:this.clock().toISOString()});this.store.setRunnerState('production.config',{...this.config(),enabled:false});return this.status();}
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
    if(scope.policyId&&new CreatorResearch(this.store,this.clock).status(scope.pageAccountId).researchNeeded&&this.store.workCandidates().some(t=>t.accountId===scope.pageAccountId&&t.payload?.creatorResearch?.version==='gemini-creator-research.v1'))return {state:'needs_creator_research',actions:0};
    const id='gemini-concept-'+scope.id+'-'+Number(cycle.state.createdProjects)+'-creators-v1';
    if(!this.store.getWork(id)){const context=await this.scc.pageContext(scope.pageAccountId);this.work.add({id,kind:'prepare_video',title:'Prepare one complete ten-second Gemini entertainment concept',priority:70,accountId:scope.pageAccountId,
      payload:{production:{version:'gemini-concept.v1',languagePolicy:geminiLanguagePolicyVersion,...(scope.policyId?{policyId:scope.policyId}:{})},pageContext:context,
        avoidRepeating:this.items().slice(-8).map(j=>({title:(j.input as Any).concept.title,idea:String((j.input as Any).concept.idea).slice(0,400)})),
        research:this.store.listKnowledge({accountId:scope.pageAccountId,limit:5}).filter(k=>(k.evidence as Any)?.sources&&Date.parse((k.evidence as Any).validUntil)>this.clock().getTime()).map(k=>({summary:k.text,evidence:k.evidence,notice:'Supplied dated sources, not independently verified; no trend claim'})),
        creatorLearning:new CreatorResearch(this.store,this.clock).context(scope.pageAccountId),
        brief:'Original fictional visual entertainment. Immediate hook, one consequential development, visible payoff. One ten-second portrait text-only clip with native sound. No multi-scene continuation or irrelevant dialogue. Serialize one gemini-concept.v1 object as the result string. Do not repeat prior concepts across Pages merely for volume. Missing trend research does not prevent an original fictional concept; do not invent popularity or factual claims.'}});}
    return {state:'needs_concept',taskId:id};
  }
  private async eligibleNative(accountId:string,ownProjectId?:string){const n=await this.pipeline.productionStatus();
    this.cacheNative(n);
    if(!n.available||!n.workerEnabled)return {n,block:'provider_unavailable'};
    if(n.nativeEnabled)return {n,block:'native_scheduler_running'};
    if(n.unresolved||n.activeRunId||n.observationLocked||n.boundedRequests.some((r:Any)=>r.in_progress&&r.jobId!==ownProjectId))return {n,block:'original_submission_protected'};
    if(n.accountingHold)return {n,block:'accounting_or_storage_hold'};
    if(/human|login|security|captcha|sign_in/.test(String(n.providerBlock??''))||/human|login|security|captcha|sign_in/.test(String(n.availability?.blocker_code??'')))return {n,block:'human_action_required'};
    const globalStart=Date.parse(n.windowStartedAt??''),globalExpired=Number.isFinite(globalStart)&&typeof n.applicationWindowHours==='number'&&globalStart+n.applicationWindowHours*3600000<=this.clock().getTime();
    // Never reset the historical counter. After its boundary, only the native
    // project's fresh admission can authorize dispatch (including account-aware rules).
    if(n.used>=n.cap&&!globalExpired)return {n,block:'application_cap'};
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
  private cacheNative(n:Any){this.store.setRunnerState('production.nativeObservation',{observedAt:this.clock().toISOString(),accountUsage:n.accountUsage,globalApplication:{used:n.used,cap:n.cap,windowStartedAt:n.windowStartedAt,windowHours:n.applicationWindowHours},providerAllowance:null,activeRunId:n.activeRunId,submissionUnresolved:n.unresolved,accountWaitNext:n.accountWaitNext,availability:n.availability,providerBlock:n.providerBlock,boundedRequests:n.boundedRequests.map((r:Any)=>({jobId:r.jobId,requestId:r.request_id,state:r.state,inProgress:r.in_progress,available:r.available,runId:r.run_id})),notice:'Supported API observation, not a fresh browser capability check. Application counters are not provider quota.'});}
  async inspectStatus(){this.cacheNative(await this.pipeline.productionStatus());return this.status();}
  async tick(){const c=this.config();if(!c.enabled)return {state:'disabled',actions:0};const cycle=this.cycle();if(!cycle)return {state:'activation_required',actions:0};
    const lease=randomUUID(),now=this.clock().getTime();const acquired=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token:lease,until:new Date(now+900000).toISOString()});return true;});
    if(!acquired)return {state:'busy',actions:0};
    try{const latest=this.cycle();if(!latest)throw new Error('Original cycle changed');return await this.step(latest,c);}catch(e){const policy=this.policyFor((cycle.input as Any).scope);if(policy)this.save(policy.id,{humanHold:'reconciliation_required'});this.save(cycle.id,{lastError:e instanceof ApiError?e.code:e instanceof Error?e.message:'production_step_failed',lastCheckedAt:this.clock().toISOString()});return {state:'reconciliation_required',actions:0,error:e instanceof ApiError?e.code:e instanceof Error?e.message:'production_step_failed'};}
    finally{this.store.transaction(()=>{if(this.store.runnerState<Any>('production.lease')?.token===lease)this.store.setRunnerState('production.lease',null);});}
  }
  private async step(cycle:AgentJob,c:Config):Promise<Any>{
    const scope=(cycle.input as Any).scope as Scope;
    // Preparation is independent of provider waits and local Page analytics.
    const researchPolicy=this.policyFor(scope);
    if(scope.policyId&&researchPolicy?.state.enabled&&!researchPolicy.state.revokedAt&&Date.parse(scope.expiresAt)>this.clock().getTime())new CreatorResearch(this.store,this.clock).maintain(scope.pageAccountId,scope.policyId);
    const policyHold=this.policyAdmission(scope);
    if(policyHold){const active=cycle.state.activeItem?this.item(String(cycle.state.activeItem)):null;
      if(!active||!['generating','recovering'].includes(String(active.state.phase)))return {...policyHold,actions:0};
    }
    const policy=this.policyFor(scope),boundary=policy?.state.nextCheckAt;
    if(policy&&boundary&&Date.parse(String(boundary))<=this.clock().getTime()&&policy.state.observedBoundary!==boundary){
      const n=await this.pipeline.productionStatus();if(n.unresolved||n.activeRunId||n.observationLocked||n.boundedRequests.some((r:Any)=>r.in_progress))return {state:'original_submission_protected',actions:0};
      this.save(policy.id,{observedBoundary:boundary});await this.pipeline.observeProductionUsage();return {state:'capacity_observed',actions:1};
    }
    // Observing/recovering owned work remains possible after expiry; no new submission does.
    if(cycle.state.activeItem)return this.advance(cycle,this.item(String(cycle.state.activeItem)),scope,c);
    if(cycle.state.phase!=='active')return {state:String(cycle.state.phase),actions:0};
    if(Date.parse(scope.expiresAt)<=this.clock().getTime()){this.save(cycle.id,{phase:'expired'});return {state:'scope_expired',actions:0};}
    if(!scope.policyId&&((cycle.state.attempts as string[]).length>=Math.min(scope.maxSubmissions,c.targetPerWindow)||Number(cycle.state.createdProjects)>=scope.maxSubmissions)){this.save(cycle.id,{phase:'finished',finishedAt:this.clock().toISOString()});return {state:'cycle_finished',actions:0};}
    const free=this.freeBytes();if(!Number.isFinite(free)||free<c.minimumFreeBytes+c.reservationBytes)return {state:'storage_hold',actions:0};
    const native=await this.eligibleNative(scope.geminiAccountId);if(native.block){this.capacityWait(scope,native.n,native.block);return {state:native.block,actions:0,providerAllowance:null,nextCheckAt:this.policyFor(scope)?.state.nextCheckAt??native.n.accountWaitNext};}
    for(const t of this.store.listWork(100)){if(t.kind==='prepare_video'&&['prepared','done'].includes(t.status)&&t.accountId===scope.pageAccountId&&t.payload?.production?.version==='gemini-concept.v1'){
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
      if(cycle.state.phase!=='active')return {state:String(cycle.state.phase),actions:0};
      if(Date.parse(scope.expiresAt)<=this.clock().getTime())return {state:'scope_expired',actions:0};
      if(!this.store.reserveProvider(providerScope,item.id))return {state:'provider_claim_held',actions:0};
      const idea=geminiConceptIdea(concept);
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
      const native=await this.pipeline.productionStatus();
      if(native.recoveryHold&&!native.unresolved&&!native.activeRunId&&!native.observationLocked&&!native.boundedRequests.some((r:Any)=>r.in_progress))await this.once(item.id,'production_reconcile_recovery',{projectId,sha256:facts.sha256},()=>this.pipeline.reconcileProductionRecovery());
      this.save(item.id,{phase:technical?'awaiting_qa':'qa_failed',videoId:imported.videoId,media:{sha256:facts.sha256,bytes:facts.bytes,technical,metadata:media},original:e.original});
      this.store.releaseProvider(providerScope,item.id);this.save(cycle.id,{activeItem:null});
      const policy=this.policyFor(scope);if(policy&&policy.state.humanHold==='reconciliation_required')this.save(policy.id,{humanHold:null});
      return {state:technical?'awaiting_qa':'qa_failed',actions:1,itemId:item.id,publication:false};
    }
    const code=String(e.failure?.code??e.session.nativeBlock??'');
    if(/human|login|security|captcha/.test(code)||/human|login|security/.test(e.recovery?.state??'')){this.save(cycle.id,{phase:'human_action_required'});const policy=this.policyFor(scope);if(policy)this.save(policy.id,{humanHold:'human_action_required'});return {state:'human_action_required',actions:0};}
    const resolvedNoVideo=['conclusive_provider_failure_no_video','owner_confirmed_no_video','quota_rejected_no_video','provider_error_no_result'].includes(e.run.resolution);
    const ignoredResolved=scope.policyId&&item.state.ignoredResolvedRunId===e.original.runId&&resolvedNoVideo;
    if(scope.policyId&&item.state.capacityRunId===e.original.runId&&resolvedNoVideo&&!e.session.active&&!e.session.unresolved){
      const before=await this.eligibleNative(scope.geminiAccountId,projectId);if(before.block){this.capacityWait(scope,before.n,before.block);return {state:before.block,actions:0};}
      await this.pipeline.checkProductionAvailability();const ready=await this.eligibleNative(scope.geminiAccountId,projectId),a=ready.n.availability,gate=ready.n.boundedRequests.find((r:Any)=>r.jobId===projectId);
      if(!ready.block&&a?.blocker_code==='video_available'&&!a.stale&&!a.conflicting_evidence&&!a.previous_submission_uncertain&&gate?.available){this.save(item.id,{ignoredResolvedRunId:e.original.runId,capacityRunId:null,dispatchSequence:Number(item.state.dispatchSequence??0)+1,phase:'planning'});this.save(cycle.id,{phase:'active'});return {state:'capacity_rechecked',actions:1};}
      this.capacityWait(scope,ready.n,ready.block??a?.blocker_code??'quota_wait');return {state:'waiting_capacity',actions:0};
    }
    if(!ignoredResolved&&(e.run.status==='provider_failed'||e.run.status==='failed'||resolvedNoVideo||e.project.state==='failed') && (e.run.submissionIntent||e.run.acknowledged||e.run.finishedAt) && !e.session.unresolved && !e.session.active){
      if(scope.policyId&&resolvedNoVideo&&/quota|weekly|limit|capacity/.test(code)){this.save(item.id,{phase:'planning',capacityRunId:e.original.runId,original:e.original});this.capacityWait(scope,await this.pipeline.productionStatus(),code);return {state:'waiting_capacity',actions:0};}
      this.save(item.id,{phase:'failed',failure:e.failure,original:e.original});this.save(cycle.id,{phase:'provider_failure_hold'});
      const policy=this.policyFor(scope);if(policy)this.save(policy.id,{humanHold:'provider_failure_hold'});
      if(resolvedNoVideo||(!e.run.submissionIntent&&!e.run.acknowledged&&e.run.finishedAt))this.store.releaseProvider(providerScope,item.id);
      return {state:'provider_failure_hold',actions:0};
    }
    if(e.session.unresolved||(!ignoredResolved&&e.recovery.required)){
      const attempts=Number(item.state.recoveryChecks??0),next=Date.parse(String(item.state.nextRecoveryAt??''));
      if(!e.session.active&&e.recovery.canRecover&&e.original.runId&&attempts<c.maxRecoveryChecks&&(!Number.isFinite(next)||next<=this.clock().getTime())){
        // The supported project/run route can only recover that exact saved turn.
        this.save(item.id,{phase:'recovering',recoveryChecks:attempts+1,nextRecoveryAt:new Date(this.clock().getTime()+c.observationSeconds*1000).toISOString()});
        await this.once(item.id,'production_recover_'+attempts,{projectId,runId:e.original.runId},()=>this.pipeline.recoverProduction(projectId,e.original.runId));return {state:'recovering_original',actions:1};
      }
      return {state:e.session.active?'generating':'recovery_required',actions:0};
    }
    if(!ignoredResolved&&(e.run.submissionIntent||e.run.acknowledged||e.session.active)){
      this.save(item.id,{phase:'generating',original:e.original});return {state:'generating',actions:0};
    }
    if(!ignoredResolved&&e.project.state==='failed'){this.save(item.id,{phase:'failed',failure:e.failure});this.save(cycle.id,{phase:'planning_failure_hold'});return {state:'planning_failure_hold',actions:0};}
    if(e.plannedScenes!==1||(e.project.state!=='awaiting_external_generation'&&!ignoredResolved))return {state:'planning',actions:0};
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
    const sequence=Number(item.state.dispatchSequence??0),submitStep=sequence?'production_submit_'+sequence:'production_submit';
    const requestId='scc-production-'+stableHash(sequence?{cycle:cycle.id,item:item.id,sequence}:{cycle:cycle.id,item:item.id}).slice(0,40);
    const previous=this.store.getOperation(item.id,submitStep);
    if(own?.request_id===requestId){
      if(own.state==='blocked'&&!own.in_progress&&!e.original.runId&&!e.run.submissionIntent&&!e.run.acknowledged&&!e.session.active&&!e.session.unresolved){
        if(scope.policyId){
          if(n.block){this.capacityWait(scope,n.n,n.block);return {state:n.block,actions:0};}
          await this.pipeline.checkProductionAvailability();const fresh=await this.eligibleNative(scope.geminiAccountId,projectId),gate=fresh.n.boundedRequests.find((r:Any)=>r.jobId===projectId);
          if(!fresh.block&&fresh.n.availability?.blocker_code==='video_available'&&!fresh.n.availability.stale&&gate?.available){this.save(item.id,{dispatchSequence:sequence+1,phase:'planning'});this.save(cycle.id,{phase:'active'});return {state:'admission_rechecked',actions:1};}
          this.capacityWait(scope,fresh.n,fresh.block??'native_admission_blocked');return {state:'waiting_capacity',actions:0};
        }
        this.save(item.id,{phase:'admission_blocked',admission:own,original:e.original});this.save(cycle.id,{phase:'application_capacity_hold'});
        this.store.recordGeneration(item.id,{condition:'admission_blocked',checkedAt:this.clock().toISOString(),evidence:{nativeRequest:own,original:e.original,providerSubmitted:false}});
        this.store.releaseProvider(providerScope,item.id);
        return {state:'native_admission_blocked',actions:0,providerSubmitted:false,nativeRequest:own};
      }
      if(previous&&['pending','uncertain'].includes(previous.status))this.store.finishOperation(item.id,submitStep,'succeeded',{nativeRequest:own,readBackAt:this.clock().toISOString()});
      return {state:own.in_progress?'generating':'native_request_recorded',actions:0};
    }
    if(n.block){this.capacityWait(scope,n.n,n.block);return {state:n.block,actions:0,nextCheckAt:this.policyFor(scope)?.state.nextCheckAt??n.n.accountWaitNext};}
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
      this.capacityWait(scope,{...ready.n,nextCheckAt:this.item(item.id).state.nextAvailabilityAt},nativeBlock??a?.blocker_code??'unknown');
      return {state:nativeBlock??String(a?.blocker_code??'availability_unknown'),actions:0,providerAllowance:null};
    }
    const admission=ready.n.boundedRequests.find((r:Any)=>r.jobId===projectId);
    if(!admission||admission.available!==true){this.save(item.id,{admission:admission??null});if(scope.policyId)this.capacityWait(scope,ready.n,'native_admission_blocked');else this.save(cycle.id,{phase:'application_capacity_hold'});return {state:'native_project_admission_blocked',actions:0,providerSubmitted:false,nativeRequest:admission??null};}
    if(!scope.policyId&&(cycle.state.attempts as string[]).length>=Math.min(scope.maxSubmissions,c.targetPerWindow))return {state:'cycle_budget',actions:0};
    await this.once(item.id,submitStep,{projectId,requestId,scope:scope.id},()=>this.pipeline.submitProduction(projectId,requestId),()=>{
      const current=this.authorized(cycle.id,item.id,scope),attempts=current.state.attempts as string[];
      const policy=this.policyFor(scope);if(policy){const hold=this.policyAdmission(scope);if(hold)throw new Error(hold.state);const events=(policy.state.dispatches??[]) as Any[];this.save(policy.id,{dispatches:[...events,{requestId,itemId:item.id,at:this.clock().toISOString()}],nextCheckAt:null});}
      if(!scope.policyId&&attempts.length>=Math.min(scope.maxSubmissions,c.targetPerWindow))throw new Error('Bounded cycle budget reached');
      this.save(cycle.id,{attempts:[...attempts,requestId]});this.save(item.id,{requestId,phase:'generating',windowObservedAt:ready.n.windowStartedAt??null});
    });
    return {state:'bounded_request_queued',actions:1,itemId:item.id,projectId,requestId,providerAllowance:null};
  }
  private authorized(cycleId:string,itemId:string,scope:Scope){
    const current=this.cycle();
    if(!this.config().enabled||!current||current.id!==cycleId||current.state.phase!=='active'||current.state.activeItem!==itemId||Date.parse(scope.expiresAt)<=this.clock().getTime())throw new Error('Production authorization changed before dispatch');
    const policyHold=this.policyAdmission(scope);if(policyHold)throw new Error(policyHold.state);
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
  async reconcileImport(itemId:string,videoId:string){const token=randomUUID(),now=this.clock().getTime(),locked=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token,until:new Date(now+900000).toISOString()});return true;});if(!locked)throw new Error('Production observation is busy');
    try{const item=this.item(itemId),op=this.store.getOperation(item.id,'production_import'),artifact=this.store.getOperation(item.id,'production_artifact');if(!op||!['pending','uncertain','succeeded'].includes(op.status)||artifact?.status!=='succeeded')throw new Error('No original verified import to reconcile');
      if(op.status==='succeeded'&&(op.response as Any).videoId!==videoId)throw new Error('Original import ID is immutable');
      const facts=artifact.response as Any,media=await this.scc.media(videoId),origin=await this.scc.pipelineOrigin(),fingerprint=createHash('sha256').update(origin.replace(/\/+$/,'')).digest('hex');
      if(origin!==this.targets.pipeline||media.id!==videoId||media.source_type!=='pipeline_import'||media.pipeline_job_id!==item.state.projectId||media.provenance.source!=='ai_video_pipeline'||media.provenance.upstreamJobId!==item.state.projectId||media.provenance.pipelineSourceFingerprint!==fingerprint||media.provenance.sha256!==facts.sha256||media.file_size!==facts.bytes)throw new Error('SCC media differs from the original verified Pipeline import');
      const result={success:true,videoId,alreadyExisted:true,reconciled:true};if(op.status!=='succeeded')this.store.finishOperation(item.id,'production_import','succeeded',result);
      this.store.recordKnowledge({id:'import-reconciled:'+item.id,kind:'observation',accountId:(item.input as Any).concept.accountId,resourceId:item.id,source:'exact_scc_media_read_back',text:'Verified the original immutable import without repeating a POST.',evidence:{videoId,projectId:item.state.projectId,sha256:facts.sha256,bytes:facts.bytes,sourceFingerprint:fingerprint}});
      return {...result,itemId:item.id,next:'production-resume verifies the completed original and fresh readiness; no generation is submitted by reconciliation'};
    }finally{if(this.store.runnerState<Any>('production.lease')?.token===token)this.store.setRunnerState('production.lease',null);}
  }
  async resume(ownerAuthorized=false){if(!ownerAuthorized)throw new Error('Manual security completion or failed-scope review requires owner authorization');
    const token=randomUUID(),now=this.clock().getTime(),acquired=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token,until:new Date(now+900000).toISOString()});return true;});
    if(!acquired)throw new Error('Original production observation is busy');
    try{return await this.resumeOriginal();}finally{if(this.store.runnerState<Any>('production.lease')?.token===token)this.store.setRunnerState('production.lease',null);}
  }
  private async resumeOriginal(){const cycle=this.cycle();if(!cycle)throw new Error('No original cycle');
    if(cycle.state.phase==='provider_failure_hold'||cycle.state.phase==='planning_failure_hold')throw new Error('A provider/planning failure ends this bounded cycle; reconcile the original before authorizing another scope');
    const scope=(cycle.input as Any).scope as Scope;
    if(cycle.state.activeItem){const item=this.item(String(cycle.state.activeItem));if(item.state.projectId){let e=await this.pipeline.inspect(String(item.state.projectId));
      if(e.session.active)throw new Error('Original generation is still active');
      if(e.session.unresolved&&e.original.runId){const count=Number(item.state.manualRecoveryChecks??0);if(count>=this.config().maxRecoveryChecks)throw new Error('Original recovery check limit reached');this.save(item.id,{manualRecoveryChecks:count+1});await this.once(item.id,'owner_security_recovery_'+count,{projectId:item.state.projectId,runId:e.original.runId},()=>this.pipeline.recoverProduction(String(item.state.projectId),e.original.runId));e=await this.pipeline.inspect(String(item.state.projectId));}
      if(e.project.state==='completed'&&!e.session.unresolved)await this.advance(cycle,this.item(item.id),scope,this.config());
      else if(e.session.unresolved)throw new Error('Original result remains unresolved; no fresh submission is permitted');
    }}
    await this.pipeline.checkProductionAvailability();const fresh=await this.pipeline.productionStatus(),a=fresh.availability;
    if(!a||a.stale||a.conflicting_evidence||a.previous_submission_uncertain||/human|login|security|captcha/.test(String(a.blocker_code))||fresh.unresolved)throw new Error('Fresh supported availability did not pass');
    if(a.blocker_code!=='video_available'&&!/quota|weekly|limit|capacity|disabled/.test(String(a.blocker_code)))throw new Error('Fresh supported availability remains unknown');
    this.save(cycle.id,{phase:'active'});const policy=this.policyFor(scope);if(policy){this.save(policy.id,{humanHold:null,nextCheckAt:null});if(a.blocker_code!=='video_available')this.capacityWait(scope,fresh,a.blocker_code);}return this.status();}
  /** Independent existing-trigger step: technical evidence and unapproved candidates, never creative acceptance. */
  private async recordTechnical(item:AgentJob,media:Any){const s=item.state as Any,concept=(item.input as Any).concept;
    if(media.provenance.sha256!==s.media.sha256||media.file_size!==s.media.bytes)throw new Error('backlog_master_integrity_changed');
    const report=await this.mediaQa.inspect(this.targets.scc,media,this.config().reservationBytes);
    if(report.sha256!==s.media.sha256||report.videoId!==s.videoId)throw new Error('backlog_report_identity_changed');
    this.store.recordKnowledge({id:'technical-qa:'+item.id,kind:'observation',accountId:concept.accountId,resourceId:item.id,source:'ffprobe_full_decode_pcm_measurements',text:'Automated technical evidence; listening and creative acceptance remain pending.',evidence:report});
    this.save(item.id,{technicalQa:report,backlogHold:null,phase:report.technicalPass?(s.phase==='ready'?'ready':'needs_review'):'qa_failed',publicationHold:report.technicalPass?(s.phase==='ready'?'separate_publication_authority_required':'creative_and_listening_review_required'):'technical_qa_failed'});
    return {state:'backlog_qa_recorded',itemId:item.id,technicalPass:report.technicalPass,actions:1};
  }
  async recheckBacklog(itemId:string){
    const token=randomUUID(),now=this.clock().getTime(),locked=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token,until:new Date(now+900000).toISOString()});return true;});if(!locked)throw new Error('Production observation is busy');
    try{const item=this.item(itemId),s=item.state as Any;
      if(!s.backlogHold||s.technicalQa||s.candidateVariantId||this.store.getOperation(item.id,'production_candidate_brand')||this.store.getOperation(item.id,'production_candidate_draft'))throw new Error('Only an original pure technical-read failure can be rechecked here; reconcile existing render/draft receipts separately');
      return await this.recordTechnical(item,await this.scc.media(s.videoId));
    }finally{if(this.store.runnerState<Any>('production.lease')?.token===token)this.store.setRunnerState('production.lease',null);}
  }
  async processBacklog(){
    if(!this.config().enabled)return {state:'backlog_disabled',actions:0};
    const reviewed=await new OwnerVideoReviews(this.store,this.scc,this.targets,this.directory).advance();
    if(reviewed.state!=='no_owner_review_work')return reviewed;
    const token=randomUUID(),now=this.clock().getTime(),acquired=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token,until:new Date(now+900000).toISOString()});return true;});
    if(!acquired)return {state:'backlog_busy',actions:0};
    let result:Any={state:'no_backlog_work',actions:0};
    try{
      const accountId=(this.policy()?.input as Any)?.policy?.pageAccountId??((this.cycle()?.input as Any)?.scope?.pageAccountId);
      const item=this.items().find(j=>(j.input as Any).concept.accountId===accountId&&(['awaiting_qa','needs_review'].includes(String(j.state.phase))||(j.state.phase==='ready'&&!j.state.technicalQa))&&!j.state.backlogHold&&!j.state.candidateDraftId);
      if(!item)return result;
      const s=item.state as Any,concept=(item.input as Any).concept;
      if(this.freeBytes()<this.config().minimumFreeBytes+this.config().reservationBytes)return result={state:'backlog_storage_hold',actions:0};
      if(this.inventory().bytes>this.config().maxBacklogBytes)return result={state:'backlog_byte_limit',actions:0};
      try{
        const media=await this.scc.media(s.videoId);if(media.provenance.sha256!==s.media.sha256||media.file_size!==s.media.bytes)throw new Error('backlog_master_integrity_changed');
        if(!s.technicalQa){
          return result=await this.recordTechnical(item,media);
        }
        if(!s.technicalQa.technicalPass)return result={state:'backlog_technical_hold',actions:0};
        if(!s.candidateVariantId){
          const variant=await this.once(item.id,'production_candidate_brand',{videoId:s.videoId,accountId:concept.accountId,sha256:s.media.sha256},()=>this.scc.brandProduction(s.videoId,concept.accountId,intent=>this.store.setRunnerState('production.candidateBrandIntent:'+item.id,intent)));
          const updated=await this.scc.media(s.videoId),stored=updated.variants.find((v:Any)=>v.id===variant.variantId);
          if(!variant.sha256||stored?.sha256!==variant.sha256||updated.provenance.sha256!==s.media.sha256)throw new Error('candidate_variant_integrity_changed');
          this.save(item.id,{candidateVariantId:variant.variantId,candidateVariantSha256:variant.sha256,candidateVariantBytes:stored.file_size??0,publicationHold:'creative_and_listening_review_required'});
          return result={state:'backlog_variant_ready',itemId:item.id,variantId:variant.variantId,creativeAccepted:false,actions:1};
        }
        const variant=media.variants.find((v:Any)=>v.id===s.candidateVariantId);if(variant?.sha256!==s.candidateVariantSha256)throw new Error('candidate_variant_integrity_changed');
        const copy=s.candidateReview?.caption?{caption:s.candidateReview.caption,hashtags:s.candidateReview.hashtags,language:s.candidateReview.captionLanguage,basis:'sampled_visual_review_pending_listening'}:candidateCopy(concept);
        if(!copy.caption){this.save(item.id,{backlogHold:'caption_language_review_required',publicationHold:'creative_and_listening_review_required',copyProposal:copy});return result={state:'caption_language_review_required',itemId:item.id,actions:0};}
        const prepared=await this.once(item.id,'production_candidate_draft',{videoId:s.videoId,variantId:s.candidateVariantId,caption:copy.caption,hashtags:copy.hashtags,accountId:concept.accountId},()=>this.scc.prepare({title:concept.title,videoId:s.videoId,accountId:concept.accountId,caption:copy.caption!,hashtags:copy.hashtags,selectedVariantId:s.candidateVariantId,applyBranding:false,scheduledAt:null}));
        this.save(item.id,{candidateDraftId:prepared.draft.id,candidateDraftHash:prepared.payloadHash??null,copyProposal:copy,phase:'needs_review',publicationHold:'creative_and_listening_review_required'});
        return result={state:'review_candidate_ready',itemId:item.id,draftId:prepared.draft.id,approved:false,queued:false,actions:1};
      }catch(e){const reason=e instanceof Error?e.message:'backlog_operation_uncertain';this.save(item.id,{backlogHold:reason,publicationHold:'original_candidate_operation_review_required'});return result={state:'backlog_item_held',itemId:item.id,error:reason,actions:0};}
    }finally{this.store.setRunnerState('production.backlogLastTick',{...result,observedAt:this.clock().toISOString()});if(this.store.runnerState<Any>('production.lease')?.token===token)this.store.setRunnerState('production.lease',null);}
  }
  candidateReview(raw:unknown){const r=z.object({itemId:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),contactSheetSha256:z.string().regex(/^[a-f0-9]{64}$/),samples:z.number().int().min(1).max(20),visual:z.enum(['sampled_pass','needs_review','fail']),audio:z.enum(['needs_review','fail']),notes:z.string().min(1).max(2000),caption:z.string().min(1).max(6000),hashtags:z.string().max(1000),captionLanguage:z.string().min(2).max(35),source:z.literal('agent_frame_samples_and_signal_analysis')}).strict().parse(raw);
    const token=randomUUID(),now=this.clock().getTime(),locked=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token,until:new Date(now+900000).toISOString()});return true;});if(!locked)throw new Error('Production/candidate observation is busy');
    try{
    const item=this.item(r.itemId),s=item.state as Any;if(!['awaiting_qa','needs_review'].includes(s.phase)||s.media?.sha256!==r.sha256||s.technicalQa?.contactSheet?.sha256!==r.contactSheetSha256||s.candidateDraftId)throw new Error('Review must bind the exact pending master/contact sheet before its draft is saved');
    this.store.recordKnowledge({id:'candidate-review:'+item.id,kind:'observation',accountId:(item.input as Any).concept.accountId,resourceId:item.id,source:r.source,text:r.notes,evidence:r});
    this.save(item.id,{candidateReview:r,backlogHold:s.backlogHold==='caption_language_review_required'?null:s.backlogHold??null,phase:r.visual==='fail'||r.audio==='fail'?'qa_failed':'needs_review',publicationHold:r.visual==='fail'||r.audio==='fail'?'candidate_quality_failed':'creative_and_listening_review_required'});
    return {itemId:item.id,creativeAccepted:false,publicationAuthorized:false};
    }finally{if(this.store.runnerState<Any>('production.lease')?.token===token)this.store.setRunnerState('production.lease',null);}
  }
  async reconcileBacklog(itemId:string,raw:unknown){const token=randomUUID(),now=this.clock().getTime(),locked=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token,until:new Date(now+900000).toISOString()});return true;});if(!locked)throw new Error('Production/candidate observation is busy');
    try{return await this.reconcileBacklogOriginal(itemId,raw);}finally{if(this.store.runnerState<Any>('production.lease')?.token===token)this.store.setRunnerState('production.lease',null);}
  }
  private async reconcileBacklogOriginal(itemId:string,raw:unknown){const r=z.object({draftId:z.string().optional(),variantId:z.string().optional()}).strict().parse(raw);if(Number(!!r.draftId)+Number(!!r.variantId)!==1)throw new Error('Supply one exact original candidate draft or variant ID');
    const item=this.item(itemId),s=item.state as Any,concept=(item.input as Any).concept,step=r.draftId?'production_candidate_draft':'production_candidate_brand',op=this.store.getOperation(item.id,step);
    if(!op||!['pending','uncertain','succeeded'].includes(op.status))throw new Error('No original candidate operation to reconcile');
    if(!['needs_review','awaiting_qa'].includes(String(s.phase)))throw new Error('Candidate is no longer pending review');
    const known=(op.response as Any)?.draft?.id??(op.response as Any)?.variantId;if(op.status==='succeeded'&&known&&known!==(r.draftId??r.variantId))throw new Error('The original candidate resource ID is immutable');
    const media=await this.scc.media(s.videoId);if(media.provenance.sha256!==s.media.sha256)throw new Error('Original candidate master changed');
    let result:Any;
    if(r.draftId){const q=op.request as Any;if(q.videoId!==s.videoId||q.accountId!==concept.accountId||q.variantId!==s.candidateVariantId)throw new Error('Original candidate request changed');
      result=await this.scc.reconcileDraft(r.draftId,{title:concept.title,videoId:q.videoId,accountId:q.accountId,caption:q.caption,hashtags:q.hashtags,selectedVariantId:q.variantId,applyBranding:false,scheduledAt:null});
      if(op.status!=='succeeded')this.store.finishOperation(item.id,step,'succeeded',result);this.save(item.id,{candidateDraftId:r.draftId,candidateDraftHash:result.payloadHash,backlogHold:null,phase:'needs_review',publicationHold:'creative_and_listening_review_required'});
    }else{const intent=this.store.runnerState<Any>('production.candidateBrandIntent:'+item.id);if(!intent)throw new Error('Exact original branding intent unavailable; retain the hold');
      result=await this.scc.reconcileProductionBrand(r.variantId!,intent);if(op.status!=='succeeded')this.store.finishOperation(item.id,step,'succeeded',result);this.save(item.id,{candidateVariantId:result.variantId,candidateVariantSha256:result.sha256,backlogHold:null,publicationHold:'creative_and_listening_review_required'});
    }
    return {...result,itemId:item.id,approved:false,queued:false};
  }
  async review(input:unknown,ownerAuthorized=false){if(!ownerAuthorized)throw new Error('Actual owner audiovisual review is required');const token=randomUUID(),now=this.clock().getTime(),locked=this.store.transaction(()=>{const old=this.store.runnerState<Any>('production.lease');if(old&&Date.parse(old.until)>now)return false;this.store.setRunnerState('production.lease',{token,until:new Date(now+900000).toISOString()});return true;});if(!locked)throw new Error('Production/candidate observation is busy');
    try{return await this.reviewOriginal(input);}finally{if(this.store.runnerState<Any>('production.lease')?.token===token)this.store.setRunnerState('production.lease',null);}
  }
  private async reviewOriginal(input:unknown){const r=reviewSchema.parse(input),j=this.item(r.itemId),media=j.state.media as Any;
    if(!['awaiting_qa','needs_review','branding','ready'].includes(String(j.state.phase))||media?.sha256!==r.sha256 || (j.state.qa&&stableHash(j.state.qa)!==stableHash(r)))throw new Error('Review must bind the unchanged original master and original QA decision');
    if(j.state.phase==='ready')return {state:'ready',draft:await this.scc.getDraft(String(j.state.draftId)),approved:false,queued:false};
    for(const step of ['production_candidate_brand','production_candidate_draft']){const op=this.store.getOperation(j.id,step);if(op&&(['pending','uncertain'].includes(op.status)||(step==='production_candidate_draft'&&!j.state.candidateDraftId)))throw new Error('Reconcile the original candidate operation before accepting it; no duplicate render/draft is permitted');}
    const accepted=r.decision==='accepted'&&r.visual==='pass'&&r.audio==='pass'&&media.technical;
    this.store.recordKnowledge({id:'production-qa:'+j.id,kind:'observation',accountId:(j.input as Any).concept.accountId,resourceId:j.id,source:'owner_audiovisual_review',text:r.notes,evidence:{...r,...((j.input as Any).concept.languageStrategy?{languageStrategy:(j.input as Any).concept.languageStrategy}:{})}});
    this.save(j.id,{qa:r,phase:accepted?'branding':'qa_failed'});if(!accepted)return {state:'qa_failed',itemId:j.id};
    const concept=(j.input as Any).concept;
    if(j.state.candidateDraftId){
      const current=await this.scc.media(String(j.state.videoId)),variant=current.variants.find((v:Any)=>v.id===j.state.candidateVariantId),prepared=await this.scc.review(String(j.state.candidateDraftId)),draft=prepared.draft,d=draft.destinations?.[0];
      if(current.provenance.sha256!==media.sha256||variant?.sha256!==j.state.candidateVariantSha256||draft.videoId!==j.state.videoId||draft.destinations?.length!==1||d.accountId!==concept.accountId||d.selectedVariantId!==j.state.candidateVariantId||d.caption!==r.caption||d.hashtags!==r.hashtags||draft.scheduledAt!==null||draft.queuedPostId||draft.approvedRevision)throw new Error('Review the original candidate draft/media and exact caption before adopting it; no duplicate draft was created');
      this.save(j.id,{phase:'ready',draftId:draft.id,variantId:j.state.candidateVariantId,variantSha256:j.state.candidateVariantSha256,draftHash:prepared.payloadHash,publicationHold:'final_variant_review_and_separate_publication_authority_required'});return {state:'ready',draft,approved:false,queued:false};
    }
    let rendered:Any;if(j.state.candidateVariantId){const current=await this.scc.media(String(j.state.videoId)),v=current.variants.find((v:Any)=>v.id===j.state.candidateVariantId);if(current.provenance.sha256!==media.sha256||v?.sha256!==j.state.candidateVariantSha256)throw new Error('Original candidate render changed');rendered={variantId:v.id,sha256:v.sha256};}
    else rendered=await this.once(j.id,'production_brand',{videoId:j.state.videoId,accountId:concept.accountId},()=>this.scc.brandProduction(String(j.state.videoId),concept.accountId));
    const prepared=await this.once(j.id,'production_draft',{videoId:j.state.videoId,variantId:rendered.variantId,caption:r.caption,hashtags:r.hashtags,accountId:concept.accountId},()=>this.scc.prepare({title:concept.title,videoId:String(j.state.videoId),accountId:concept.accountId,caption:r.caption,hashtags:r.hashtags,selectedVariantId:rendered.variantId,applyBranding:false,scheduledAt:null}));
    this.save(j.id,{phase:'ready',draftId:prepared.draft.id,variantId:rendered.variantId,variantSha256:rendered.sha256??null,draftHash:prepared.payloadHash??null});return {state:'ready',draft:prepared.draft,approved:false,queued:false};
  }
  async reviewVariant(raw:unknown,authorized=false){if(!authorized)throw new Error('Final variant QA requires an authorized actual review');const r=z.object({itemId:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),visual:z.literal('pass'),masterAudioHash:z.string().regex(/^[a-f0-9]{64}$/),variantAudioHash:z.string().regex(/^[a-f0-9]{64}$/),notes:z.string().min(1).max(2000)}).strict().parse(raw);
    const item=this.item(r.itemId),s=item.state as Any;if(s.phase!=='ready'||s.qa?.decision!=='accepted'||s.qa.audio!=='pass'||r.masterAudioHash!==r.variantAudioHash)throw new Error('Accepted master, exact audio preservation and ready variant required');
    const media=await this.scc.media(s.videoId),variant=media.variants.find((v:Any)=>v.id===s.variantId),draft=await this.scc.review(s.draftId);
    if(media.provenance.sha256!==s.media.sha256||variant?.sha256!==r.sha256||draft.draft.destinations?.[0]?.selectedVariantId!==s.variantId)throw new Error('Final reviewed artifact differs');
    this.store.recordKnowledge({id:'variant-qa:'+item.id+':'+r.sha256,kind:'observation',accountId:(item.input as Any).concept.accountId,resourceId:item.id,source:'qualified_visual_review_and_decoded_audio_identity',text:r.notes,evidence:r});
    this.save(item.id,{variantSha256:r.sha256,variantReview:r,draftHash:draft.payloadHash});return {itemId:item.id,variantId:s.variantId,sha256:r.sha256,publicationAuthorized:false};
  }
}
