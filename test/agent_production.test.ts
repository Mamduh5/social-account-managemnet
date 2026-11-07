import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {AgentStore} from '../scripts/agent/store.js';
import {GeminiProduction} from '../scripts/agent/production.js';
import {PipelineAdapter} from '../scripts/agent/pipeline.js';
import {SccAdapter} from '../scripts/agent/scc.js';
import {JsonClient,ApiError} from '../scripts/agent/http.js';
import {AgentRunner} from '../scripts/agent/runner.js';
import {configureRunner,defaultRunnerConfig} from '../scripts/agent/runner-config.js';
import {agentResultSchema} from '../scripts/agent/executors.js';
import {CreatorResearch} from '../scripts/agent/creator-research.js';
import {geminiLanguagePolicyVersion} from '../scripts/agent/gemini-language.js';

const sha='a'.repeat(64),targets={pipeline:'http://localhost:8080',scc:'http://localhost:3001'};
const concept=(n=1)=>({version:'gemini-concept.v1',fictional:true,accountId:'page',title:'Leaf '+n,idea:'A leaf helps a miniature excavator '+n,hook:'Rain splashes its face',development:'The leaf bends over it',payoff:'It settles under the leaf umbrella',category:'living_objects'});
function evidence(state='awaiting_external_generation'):any{return {project:{state,media:{videoUrl:state==='completed'?targets.pipeline+'/final.mp4':null}},plannedScenes:1,run:{status:'',submissionIntent:false,acknowledged:false,resolution:null},session:{active:false,unresolved:false},recovery:{required:false,canRecover:false,state:''},original:{projectId:'project-1',runId:null},failure:null};}
function setup(t:any,config:any={}){
  const dir=mkdtempSync(path.join(tmpdir(),'scc-production-')),file=path.join(dir,'agent.db');let store=new AgentStore(file),now=new Date('2026-11-04T00:00:00Z');
  let read=evidence(),created=0,submitted=0,recovered=0,checks=0,imports=0,branded=0,drafts=0,reconcileHolds=0,free=10*1024**3;
  let native:any={available:true,workerEnabled:true,nativeEnabled:false,activeRunId:null,observationLocked:false,unresolved:false,accountingHold:false,cap:4,used:0,availability:{blocker_code:'video_available',stale:false,previous_submission_uncertain:false,conflicting_evidence:false},boundedRequests:[],blockers:[],accountUsage:{},applicationWindowHours:5};
  let submitBehavior=async()=>({accepted:true}),createBehavior=async()=>({projectId:'project-'+(++created)}),checkBehavior=async()=>({}),recoverBehavior=async()=>({});
  const pipeline={productionStatus:async()=>structuredClone(native),observeProductionUsage:async()=>({observed:true}),reconcileProductionRecovery:async()=>{reconcileHolds++;native.recoveryHold=false;return {};},checkProductionAvailability:async()=>{checks++;return checkBehavior();},prepareProduction:async(input:any,accountId:any)=>{assert.equal(accountId,'gemini_web-main');assert.equal(input.sceneCount,1);assert.equal(input.aspectRatio,'9:16');const result=await createBehavior();if(!native.boundedRequests.some((r:any)=>r.jobId===result.projectId))native.boundedRequests.push({jobId:result.projectId,available:true,in_progress:false,state:'idle'});return result;},verifyProduction:async(projectId:string)=>{if(!native.boundedRequests.some((r:any)=>r.jobId===projectId))native.boundedRequests.push({jobId:projectId,available:true,in_progress:false,state:'idle'});return {projectId};},submitProduction:async()=>{submitted++;native.used++;return submitBehavior();},inspect:async()=>structuredClone(read),recoverProduction:async(_project:string,runId:string)=>{assert.equal(runId,'original-run');recovered++;return recoverBehavior();},productionArtifact:async()=>({sha256:sha,bytes:1024})} as unknown as PipelineAdapter;
  const media={width:720,height:1280,duration:10,file_size:1024,provenance:{sha256:sha,hasAudio:true}};
  let publication:any={post:{destinations:[{id:'dest',account_id:'page',status:'published',confirmation_source:'api',verification_status:'confirmed',remote_post_id:'remote',remote_post_url:'https://facebook.com/reel/remote',published_at:'2026-11-03T00:00:00Z'}]}};
  let draft:any={id:'draft',revision:1,status:'draft',queuedPostId:null};let history:any={items:[],hasMore:false};
  const scc={pageContext:async()=>({account:{id:'page',name:'Page',graphId:'123'},rules:[]}),pipelineOrigin:async()=>targets.pipeline,importVideo:async()=>{imports++;return {videoId:'video'};},media:async()=>media,brandProduction:async()=>{branded++;return {variantId:'variant'};},prepare:async()=>{drafts++;return {draft};},getDraft:async()=>draft,review:async()=>({draft}),history:async()=>history,publication:async()=>publication,analytics:async()=>({history:[{view_count:null,like_count:0,observed_at:'2026-11-03T00:15:00Z',source:'meta_graph_api'}],missingStatisticsAreZero:false})} as unknown as SccAdapter;
  let qaBehavior=async()=>({version:'gemini-technical-qa.v1',videoId:'video',sha256:sha,technicalPass:true,artifactBytes:1024,contactSheet:{sha256:'c'.repeat(64),path:'fixture-contact.jpg'},audio:{listeningAccepted:false,warnings:[]}});
  const build=()=>new GeminiProduction(store,pipeline,scc,targets,dir,()=>new Date(now),()=>free,{inspect:async()=>qaBehavior()});let controller=build();controller.configure(config);
  const start=(n=3)=>controller.start({id:'scope',geminiAccountId:'gemini_web-main',pageAccountId:'page',maxSubmissions:n,expiresAt:'2026-11-04T06:00:00Z'},true);
  const counts=()=>({created,submitted,recovered,checks,imports,branded,drafts,reconcileHolds});
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {get c(){return controller;},get store(){return store;},pipeline,scc,start,counts,media,native,
    enqueue:(n=1)=>controller.enqueue(concept(n)),read:(r:any)=>{read=r;},advance:(ms=301000)=>{now=new Date(now.getTime()+ms);},free:(n:number)=>{free=n;},
    submit:(fn:()=>Promise<any>)=>{submitBehavior=fn;},create:(fn:()=>Promise<any>)=>{createBehavior=fn;},check:(fn:()=>Promise<any>)=>{checkBehavior=fn;},recover:(fn:()=>Promise<any>)=>{recoverBehavior=fn;},draft:(d:any)=>{draft=d;},publication:(p:any)=>{publication=p;},history:(h:any)=>{history=h;},qa:(fn:()=>Promise<any>)=>{qaBehavior=fn;},
    restart:()=>{store.close();store=new AgentStore(file);controller=build();return controller;},dir};
}
test('disabled defaults require explicit bounded account/Page/expiry scope; no allowance inferred',async t=>{
  const f=setup(t);assert.deepEqual(await f.c.tick(),{state:'disabled',actions:0});assert.throws(()=>f.c.start({}),/scope/);assert.throws(()=>f.c.configure({enabled:true}),/explicitly/);assert.equal(f.c.status().providerAllowance,null);assert.equal(f.counts().submitted,0);f.start();assert.throws(()=>f.start(),/existing/);
});

const internationalLanguage={spokenLanguage:'none',dialogue:'',intendedAudience:'International visual-comedy viewers',rationale:'Visual action is self-contained; multilingual audience choice is a hypothesis.',evidenceBasis:'hypothesis',findingIds:[],captionLanguages:['en'],hashtagLanguages:[]};
test('new Gemini preparation requires durable language/audience metadata without rewriting historical tasks',async t=>{
  const f=setup(t);f.start();const next=await f.c.tick();const task=f.store.getWork(next.taskId)!;assert.equal(task.payload.production.languagePolicy,geminiLanguagePolicyVersion);
  const claim=f.c.work.claim(task.id,{owner:'fixture',commandId:'multi-claim'}).task;
  f.c.work.save({id:task.id,owner:'fixture',commandId:'multi-save',claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:JSON.stringify(concept())});assert.throws(()=>f.c.enqueuePrepared(task.id),/language and audience/);
  const item=f.c.enqueue({...concept(),languageStrategy:internationalLanguage});const before=f.store.getJob(item.id)!.input;f.restart();assert.deepEqual(f.store.getJob(item.id)!.input,before);assert.deepEqual(f.c.status().backlog.find(x=>x.id===item.id)!.languageStrategy,internationalLanguage);assert.equal(f.counts().submitted,0);
});
test('Gemini language and exact speech reach Pipeline planning while caption language stays separate',async t=>{
  const f=setup(t);let request:any;const prepare=f.pipeline.prepareProduction.bind(f.pipeline);f.pipeline.prepareProduction=async(input,account)=>{request=input;return prepare(input,account);};
  const strategy={...internationalLanguage,spokenLanguage:'ja',dialogue:'ありがとう',captionLanguages:['en','ja'],hashtagLanguages:['ja']};f.c.enqueue({...concept(),languageStrategy:strategy});f.start();assert.equal((await f.c.tick()).state,'planning');assert.match(request.idea,/Speech language: ja/);assert.ok(request.idea.includes('ありがとう'));assert.match(request.idea,/Do not translate or add speech/);assert.equal(request.sceneCount,1);assert.equal(request.aspectRatio,'9:16');assert.equal(f.counts().submitted,0);
});
test('saved multilingual preparation stays idempotent after its originally verified research expires',t=>{
  const f=setup(t),finding={id:'verified-language-fixture',access:'observed',independentlyVerified:true,validUntil:'2026-11-05T00:00:00Z'};
  f.store.recordKnowledge({id:finding.id,kind:'observation',accountId:'page',resourceId:'gemini-creator-research.v1',text:'Isolated verified-source fixture',source:'fixture_review',evidence:finding});
  f.c.work.add({id:'verified-language-task',kind:'prepare_video',title:'Original multilingual preparation',accountId:'page',payload:{production:{version:'gemini-concept.v1',languagePolicy:geminiLanguagePolicyVersion},creatorLearning:{external:[finding]}}});
  const claim=f.c.work.claim('verified-language-task',{owner:'fixture',commandId:'verified-language-claim'}).task,choice={...concept(),languageStrategy:{...internationalLanguage,evidenceBasis:'verified_research',findingIds:[finding.id]}};
  f.c.work.save({id:claim.id,owner:'fixture',commandId:'verified-language-save',claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:JSON.stringify(choice)});const item=f.c.enqueuePrepared(claim.id);f.advance(2*86400000);f.restart();assert.equal(f.c.enqueuePrepared(claim.id).id,item.id);assert.equal(f.counts().submitted,0);
});
for(const [code,caption,hashtags] of [['en','A tiny hero, a big heart.',''],['ja','小さなヒーローの大きな心。','#小さな物語'],['th','ฮีโร่ตัวจิ๋ว หัวใจไม่จิ๋ว','']])test('Gemini reviewed '+code+' caption remains exact through unpublished draft preparation',async t=>{
  const f=setup(t);let copy:any;const prepare=f.scc.prepare.bind(f.scc);f.scc.prepare=async(input)=>{copy=input;return prepare(input);};
  const item=f.c.enqueue({...concept(),languageStrategy:{...internationalLanguage,captionLanguages:[code],hashtagLanguages:hashtags?[code]:[]}});f.start();await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();
  const result=await f.c.review({itemId:item.id,sha256:sha,decision:'accepted',visual:'pass',audio:'pass',source:'owner',notes:'Isolated fixture audiovisual acceptance; actual content and copy reviewed',caption,hashtags},true);assert.equal(result.approved,false);assert.equal(result.queued,false);assert.equal(copy.caption,caption);assert.equal(copy.hashtags,hashtags);assert.equal(copy.scheduledAt,null);const qa=f.store.listKnowledge({accountId:'page',resourceId:item.id,limit:20}).find(k=>k.id==='production-qa:'+item.id)!;assert.equal((qa.evidence as any).languageStrategy.captionLanguages[0],code);
});
test('three sequential original submissions finish into QA backlog without any Facebook analytics',async t=>{
  const f=setup(t);for(let n=1;n<=3;n++)f.enqueue(n);f.start();
  for(let n=1;n<=3;n++){
    f.read(evidence());assert.equal((await f.c.tick()).state,'planning');assert.equal((await f.c.tick()).state,'bounded_request_queued');
    const active=evidence();active.run={status:'running',submissionIntent:true,acknowledged:true};active.session.active=true;f.read(active);assert.equal((await f.c.tick()).state,'generating');assert.equal(f.counts().submitted,n);
    f.read(evidence('completed'));assert.equal((await f.c.tick()).state,'awaiting_qa');
  }
  assert.equal((await f.c.tick()).state,'cycle_finished');assert.equal(f.counts().submitted,3);assert.equal(f.counts().imports,3);assert.equal(f.c.status().inventory.items,3);assert.equal(f.counts().drafts,0);
});
for(const blocker of ['video_limit_reached','weekly_limit_exhausted','quota_exhausted'])test('early provider '+blocker+' retains original planned task and does not spend another slot',async t=>{
  const f=setup(t);f.enqueue();f.start();await f.c.tick();f.check(async()=>{f.native.availability.blocker_code=blocker;f.native.availability.next_recheck_at='2026-11-04T05:00:00Z';return {};});
  assert.equal((await f.c.tick()).state,blocker);assert.equal(f.counts().submitted,0);f.advance();assert.equal((await f.c.tick()).state,'waiting_provider');assert.equal(f.counts().checks,1);assert.equal(f.native.used,0);
});
test('human verification holds the original, never interacts with a challenge or submits replacement',async t=>{
  const f=setup(t);f.enqueue();f.start();await f.c.tick();await f.c.tick();const r=evidence();r.run.submissionIntent=true;r.session.unresolved=true;r.failure={code:'human_action_required'};r.original.runId='original-run';f.read(r);
  assert.equal((await f.c.tick()).state,'human_action_required');f.restart();assert.equal((await f.c.tick()).state,'human_action_required');assert.equal(f.counts().submitted,1);assert.equal(f.counts().recovered,0);
});
test('stale result imports the exact original turn once, preserving the sole generation request',async t=>{
  const f=setup(t);f.enqueue();f.start();await f.c.tick();await f.c.tick();const r=evidence();r.session.unresolved=true;r.recovery={required:true,canRecover:true};r.original.runId='original-run';f.read(r);
  assert.equal((await f.c.tick()).state,'recovering_original');assert.equal((await f.c.tick()).state,'recovery_required');assert.equal(f.counts().recovered,1);
  f.read(evidence('completed'));f.restart();assert.equal((await f.c.tick()).state,'awaiting_qa');assert.equal(f.counts().submitted,1);assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),null);
});
test('lost generation response remains counted and uncertain across process restart, without replay',async t=>{
  const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();f.submit(async()=>{throw new ApiError(null,'request_timeout',true);});assert.equal((await f.c.tick()).state,'reconciliation_required');
  f.restart();f.advance();assert.equal((await f.c.tick()).state,'reconciliation_required');assert.equal(f.counts().submitted,1);assert.equal(f.c.status().cycle!.state.attempts instanceof Array,true);assert.equal(f.store.getOperation(item.id,'production_submit')!.status,'uncertain');
  f.read(evidence('completed'));assert.equal((await f.c.tick()).state,'awaiting_qa');assert.equal(f.counts().submitted,1);
});
test('lost creation response can attach a verified original project without a second creation',async t=>{
  const f=setup(t);const item=f.enqueue();f.start();let calls=0;f.create(async()=>{calls++;throw new ApiError(null,'request_timeout',true);});await f.c.tick();f.restart();await f.c.tick();assert.equal(calls,1);
  await f.c.reconcile(item.id,'known-original');assert.equal(f.store.getOperation(item.id,'production_create')!.status,'succeeded');assert.equal((await f.c.tick()).state,'bounded_request_queued');assert.equal(calls,1);
});
test('correlated terminal provider failure stops the cycle and preserves accounting',async t=>{
  const f=setup(t);f.enqueue();f.enqueue(2);f.start();await f.c.tick();await f.c.tick();const r=evidence('failed');r.run={submissionIntent:true,acknowledged:true,status:'provider_failed',resolution:'conclusive_provider_failure_no_video'};r.failure={code:'provider_error'};f.read(r);
  assert.equal((await f.c.tick()).state,'provider_failure_hold');f.restart();await f.c.tick();assert.equal(f.counts().submitted,1);assert.equal(f.native.used,1);await assert.rejects(()=>f.c.resume(true),/ends this bounded cycle/);
});
test('native quota rejection after dispatch is terminal, not an endless generating state or replacement request',async t=>{
  const f=setup(t);f.enqueue();f.start();await f.c.tick();await f.c.tick();const r=evidence();r.run={submissionIntent:true,acknowledged:false,status:'failed',finishedAt:'2026-11-04T00:01:00Z',resolution:'quota_rejected_no_video'};r.failure={code:'weekly_limit'};f.read(r);
  assert.equal((await f.c.tick()).state,'provider_failure_hold');assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),null);assert.equal(f.counts().submitted,1);assert.equal(f.native.used,1);
  await assert.rejects(()=>f.c.close(),/owner/);await f.c.close(true);assert.equal(f.c.status().cycle!.state.phase,'finished');assert.equal(f.native.used,1);
});
test('application cap, another native worker or uncertain original block admission without a provider call',async t=>{
  for(const patch of [{used:4},{nativeEnabled:true},{unresolved:true},{activeRunId:'other'},{accountingHold:true}]){
    const f=setup(t);f.enqueue();f.start();Object.assign(f.native,patch);assert.notEqual((await f.c.tick()).state,'planning');assert.equal(f.counts().submitted,0);assert.equal(f.counts().checks,0);
  }
});
test('pinned-account cap blocks before creating another project even when global usage is low; no ledger reset',async t=>{
  const f=setup(t);f.enqueue();f.start();f.native.used=1;f.native.accountUsage={'gemini_web-main':{submissions:4,window_started_at:'2026-11-03T23:00:00Z'}};
  assert.equal((await f.c.tick()).state,'account_application_cap');assert.equal(f.counts().created,0);assert.equal(f.counts().submitted,0);assert.equal(f.native.accountUsage['gemini_web-main'].submissions,4);
  f.advance(5*3600000);assert.equal((await f.c.tick()).state,'planning');assert.equal(f.native.accountUsage['gemini_web-main'].submissions,4);
});
test('native blocked bounded request with no original run is conclusive admission failure, not generation or blind replay',async t=>{
  const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();const requestId=f.store.getJob(item.id)!.state.requestId;
  f.native.accountUsage={'gemini_web-main':{submissions:4,window_started_at:'2026-11-04T00:00:00Z'}};f.native.boundedRequests=[{jobId:'project-1',request_id:requestId,state:'blocked',available:false,in_progress:false,unavailable_reason:'Pinned account application safety cap'}];
  assert.equal((await f.c.tick()).state,'native_admission_blocked');assert.equal(f.counts().submitted,1);assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),null);await f.c.close(true);assert.equal(f.c.status().cycle!.state.phase,'finished');assert.equal(f.native.accountUsage['gemini_web-main'].submissions,4);
});
test('native per-project restriction after a fresh available capability check blocks dispatch',async t=>{
  const f=setup(t);f.enqueue();f.start();await f.c.tick();f.native.boundedRequests=[{jobId:'project-1',available:false,in_progress:false,state:'idle',unavailable_reason:'Account weekly restriction'}];
  assert.equal((await f.c.tick()).state,'native_project_admission_blocked');assert.equal(f.counts().submitted,0);
});
test('backlog capacity admits already reserved work at capacity; rejects extra concepts and low disk',async t=>{
  const f=setup(t,{maxBacklogItems:1});f.enqueue();assert.throws(()=>f.enqueue(2),/capacity/);f.start();assert.equal((await f.c.tick()).state,'planning');
  const g=setup(t);g.enqueue();g.start();g.free(0);assert.equal((await g.c.tick()).state,'storage_hold');assert.equal(g.counts().created,0);
});
test('stop during fresh readiness revokes dispatch before submission accounting; low disk after planning also holds',async t=>{
  const f=setup(t);f.enqueue();f.start();await f.c.tick();f.check(async()=>{f.c.stop();return {};});assert.equal((await f.c.tick()).state,'reconciliation_required');assert.equal(f.counts().submitted,0);assert.deepEqual(f.c.status().cycle!.state.attempts,[]);
  const g=setup(t);g.enqueue();g.start();await g.c.tick();g.free(0);assert.equal((await g.c.tick()).state,'storage_hold');assert.equal(g.counts().submitted,0);
});
test('concurrent ticks reserve one active item and never create parallel Pipeline projects',async t=>{
  const f=setup(t);f.enqueue();f.enqueue(2);f.start();const results=await Promise.all([f.c.tick(),f.c.tick()]);assert.ok(results.some(r=>r.state==='busy'));assert.equal(f.counts().created,1);assert.equal(f.c.status().backlog.filter((j:any)=>j.phase==='planning').length,1);
});
test('scope expiry stops new submissions but preserves and imports an already generated original',async t=>{
  const f=setup(t);f.enqueue();f.start();await f.c.tick();await f.c.tick();f.advance(7*3600000);f.read(evidence('completed'));assert.equal((await f.c.tick()).state,'awaiting_qa');assert.equal((await f.c.tick()).state,'scope_expired');assert.equal(f.counts().submitted,1);
});
test('failed audiovisual QA keeps immutable media, occupies backlog and never brands/publishes',async t=>{
  const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();
  await f.c.review({itemId:item.id,sha256:sha,decision:'rejected',visual:'pass',audio:'fail',source:'owner',notes:'Harsh audio requires owner review',caption:'Leaf'},true);
  assert.equal((f.c.status().backlog[0] as any).phase,'qa_failed');assert.equal(f.counts().branded,0);assert.equal(f.c.status().inventory.items,1);
});
test('accepted exact master prepares branding and unapproved draft once; publication does not consume generation',async t=>{
  const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();
  const review={itemId:item.id,sha256:sha,decision:'accepted',visual:'pass',audio:'pass',source:'owner',notes:'Watched and listened to the exact master',caption:'Thai caption'};
  await assert.rejects(()=>f.c.review(review),/owner/);assert.equal((await f.c.review(review,true)).state,'ready');f.restart();await f.c.review(review,true);assert.equal(f.counts().branded,1);assert.equal(f.counts().drafts,1);
  f.draft({id:'draft',revision:1,status:'queued',queuedPostId:'post'});await f.c.observe();assert.equal((f.c.status().backlog[0] as any).phase,'published');assert.equal(f.c.status().inventory.items,0);assert.equal(f.counts().submitted,1);
});
test('saved metric checkpoints retain unavailable values and actual source timestamps, independent of generation',async t=>{
  const f=setup(t);const r=await f.c.observe('post','page');assert.equal(r.state,'observation_saved');assert.equal(r.metrics!.history[0].view_count,null);assert.equal(r.metrics!.history[0].like_count,0);assert.equal(r.metrics!.history[0].observed_at,'2026-11-03T00:15:00Z');assert.equal(f.counts().submitted,0);assert.equal((await f.c.tick()).state,'disabled');
});
test('publication cadence is independent of disabled production and requires separate exact approval',async t=>{
  const f=setup(t);const item=f.enqueue();f.store.patchState(item.id,{phase:'ready',draftId:'draft',variantId:'variant',videoId:'video'});f.draft({id:'draft',revision:2,status:'draft',videoId:'video',destinations:[{accountId:'page',selectedVariantId:'variant'}]});
  f.history({hasMore:false,items:[{account_id:'page',status:'published',published_at:'2026-11-03 23:30:00'}]});
  const wait=await f.c.publicationPlan();assert.equal(wait.state,'publication_cadence_wait');assert.equal(wait.earliestAt,'2026-11-04T23:30:00.000Z');assert.equal(f.c.status().config.enabled,false);assert.equal(f.counts().submitted,0);
  f.advance(25*3600000);const ready=await f.c.publicationPlan();assert.equal(ready.state,'exact_owner_approval_required');assert.equal(ready.automatic,false);assert.equal(ready.draft.revision,2);
  f.history({hasMore:false,items:[{account_id:'page',status:'uploading',submission_state:'uncertain'}]});assert.equal((await f.c.publicationPlan()).state,'original_publication_requires_reconciliation');
});
test('SQLite UTC publication times are not interpreted as Bangkok wall time, and premature checkpoint history is retained',async t=>{
  const f=setup(t);f.publication({post:{destinations:[{id:'dest',account_id:'page',status:'published',confirmation_source:'api',verification_status:'confirmed',remote_post_id:'remote',remote_post_url:'https://facebook.com/reel/remote',published_at:'2026-11-03 23:30:00'}]}});
  assert.equal((await f.c.observe('post','page')).state,'no_observation_due');
  const tracked=f.store.runnerState<any[]>('production.observations')!;tracked[0].checkpoints.push({hours:1,checkedAt:'2026-11-04T00:00:00Z',metrics:{history:[]}});f.store.setRunnerState('production.observations',tracked);
  assert.equal((await f.c.observe()).state,'no_observation_due');assert.equal(f.store.runnerState<any[]>('production.observations')![0].checkpoints[0].timingStatus,'premature_unzoned_timestamp');
  f.advance(3600000);assert.equal((await f.c.observe()).state,'observation_saved');assert.equal(f.store.runnerState<any[]>('production.observations')![0].checkpoints.length,2);
});
test('runner uses one existing trigger for production despite exhausted text-model budget, respecting pause/authorization',async t=>{
  const f=setup(t);let steps=0;configureRunner(f.store,{...defaultRunnerConfig(),enabled:true,maxInvocationsPerDay:1},true);
  new AgentRunner(f.store,f.dir).work.add({id:'old',kind:'story_plan',title:'Existing task'});
  f.store.saveRunnerSession({id:'spent',taskId:'old',status:'completed',startedAt:'2026-11-04T00:00:00Z',reservedTokens:1,usage:{tokens:1}});
  const runner=new AgentRunner(f.store,f.dir,undefined,()=>new Date('2026-11-04T00:01:00Z'),undefined,async()=>{steps++;return {state:'generating'};});assert.equal((await runner.tick()).state,'production:generating');assert.equal(steps,1);
  runner.control('pause');assert.equal((await runner.tick()).state,'paused');assert.equal(steps,1);
});
test('artifact reader enforces byte bound and same-origin paths without transforms',async()=>{
  const client=new JsonClient('http://localhost:3001',{fetch:async()=>new Response('verified bytes')});const result=await client.media('/video.mp4',100);assert.equal(result.bytes,14);assert.equal(result.sha256.length,64);
  await assert.rejects(()=>client.media('/video.mp4',3),/media_byte_limit/);await assert.rejects(()=>client.media('//foreign/video.mp4',100),/Invalid media/);
});
test('production HTTP contract pins account, review-first policy and no image; mismatched historical project cannot submit',async()=>{
  const calls:any[]=[];let project:any={id:'project',provider:'gemini_web',autopilot:{provider:'gemini_web'},status:'awaiting_external_generation',topic:'One original story',scene_count:1,scene_seconds:10,aspect_ratio:'9:16',gemini_workflow:'standalone_10s_v1',audio_policy:'clip_native',scenes:[{order:1,status:'pending',generation_request:{scene_order:1,duration_seconds:10,aspect_ratio:'9:16',reference_mode:'none',generation_settings:{version:'generation_settings.v1',mode:'dense_performance',performance_tempo:2}}}],account_policy:{mode:'specific',account_id:'gemini_web-main'},generation_settings:{version:'generation_settings.v1',mode:'dense_performance',performance_tempo:2}};
  const adapter=new PipelineAdapter(new JsonClient(targets.pipeline,{fetch:async(url,init)=>{calls.push({url:String(url),method:init?.method,body:init?.body?JSON.parse(String(init.body)):null});return Response.json(init?.method==='POST'?{job_id:'project'}:project);}}));
  const input={title:'Story',idea:'One original story'};await adapter.prepareProduction(input,'gemini_web-main');assert.equal(calls[0].body.gemini_workflow,'standalone_10s_v1');assert.deepEqual(calls[0].body.account_policy,{mode:'specific',account_id:'gemini_web-main'});assert.equal(calls[0].body.scene_count,1);assert.equal(calls[0].body.starting_image,undefined);
  await adapter.verifyProduction('project',input,'gemini_web-main',true);const saved=project.scenes[0].generation_request;for(const patch of [{start_frame:{}},{duration_seconds:8},{reference_mode:'image'},{generation_settings:{mode:'standard'}}]){project.scenes[0].generation_request={...saved,...patch};await assert.rejects(()=>adapter.verifyProduction('project',input,'gemini_web-main',true),/Saved scene request/);}project.scenes[0].generation_request=saved;project={...project,scene_count:2};await assert.rejects(()=>adapter.verifyProduction('project',input,'gemini_web-main'),/differs/);
  project={...project,scene_count:1,provider:'flow_web'};await assert.rejects(()=>adapter.verifyProduction('project',input,'gemini_web-main'));assert.equal(calls.filter(c=>c.method==='POST').length,1);
});
test('Page preparation uses actual operator DTO and immutable media/variant readback',async()=>{
  let rendered=false;const calls:string[]=[];
  const adapter=new SccAdapter(new JsonClient(targets.scc,{fetch:async(url,init)=>{
    const p=new URL(String(url)).pathname;calls.push(p);
    if(p.endsWith('/context'))return Response.json({account:{id:'page',name:'Page',graphId:'123',identityVerifiedAt:'2026-11-04T00:00:00Z'},contextFingerprint:'fp',rules:[],voice:{},brandKit:{}});
    if(p.endsWith('/render-preview')){rendered=true;assert.equal(JSON.parse(String(init?.body)).brandKit.safeArea.bottom,420);return Response.json({variantId:'variant',sha256:sha});}
    return Response.json({video:{id:'video',width:720,height:1280,duration:10,metadata_json:JSON.stringify({sha256:sha}),branded_variants:rendered?[{id:'variant',sha256:sha,width:720,height:1280,duration:10}]:[]}});
  }}));
  assert.equal((await adapter.brandProduction('video','page')).variantId,'variant');assert.ok(calls.every(p=>!p.includes('approve')&&!p.includes('queue')));
});
test('bounded-request HTTP receipt and per-account accounting remain distinct from provider allowance',async()=>{
  let malformed=false;
  const adapter=new PipelineAdapter(new JsonClient(targets.pipeline,{fetch:async(url,init)=>{
    if(init?.method==='POST'){const body=JSON.parse(String(init.body));assert.deepEqual(body,{job_id:'project',scene_order:1,request_id:'request',confirmed:true});return Response.json(malformed?{}:{force_retry_status:{job_id:'project',request_id:'request',in_progress:true}});}
    return Response.json({provider:'gemini_web',available:true,worker_enabled:true,recovery_status:{submission_unresolved:false},scheduler:{enabled:false,queue:[],configured_submission_cap:4,submissions_this_window:1,window_hours:5,account_usage:{'gemini_web-main':{submissions:4,window_started_at:'2026-11-04T03:43:26Z'}}}});
  }}));
  const status=await adapter.productionStatus();assert.equal(status.used,1);assert.equal(status.accountUsage['gemini_web-main'].submissions,4);assert.equal(status.providerAllowance,null);await adapter.submitProduction('project','request');malformed=true;await assert.rejects(()=>adapter.submitProduction('project','request'),/invalid_bounded_request_response/);
});

const standing=(extra:any={})=>({version:'gemini-production-policy.v1',id:'standing',geminiAccountId:'gemini_web-main',pageAccountId:'page',pageGraphId:'123',expiresAt:'2026-12-04T00:00:00Z',targetPerWindow:3,planningWindowHours:5,maxPer24Hours:12,maxTotalSubmissions:300,...extra});

function enableCandidateFixture(f:ReturnType<typeof setup>){
  Object.assign(f.media,{id:'video',variants:[{id:'variant',sha256:'b'.repeat(64),file_size:1024}]});
  const brand=f.scc.brandProduction.bind(f.scc);f.scc.brandProduction=async(...a)=>({...await brand(...a),sha256:'b'.repeat(64)});
}
test('completed backlog progresses through technical evidence, watermark and held candidate during a production security hold',async t=>{
  const f=setup(t);enableCandidateFixture(f);const item=f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();
  f.store.patchState((f.c.policyStatus() as any).id,{humanHold:'human_action_required'});assert.equal((await f.c.tick()).state,'human_action_required');assert.equal((await f.c.processBacklog()).state,'backlog_qa_recorded');assert.equal((await f.c.processBacklog()).state,'backlog_variant_ready');assert.equal((await f.c.processBacklog()).state,'review_candidate_ready');
  const s=f.store.getJob(item.id)!.state;assert.equal(s.phase,'needs_review');assert.equal(s.candidateDraftId,'draft');assert.equal(s.qa,undefined);assert.equal(s.publicationHold,'creative_and_listening_review_required');assert.equal(f.counts().branded,1);assert.equal(f.counts().drafts,1);f.restart();assert.equal((await f.c.processBacklog()).state,'no_backlog_work');assert.equal(f.counts().drafts,1);assert.equal((f.c.policyStatus() as any).state.humanHold,'human_action_required');
});
test('uncertain candidate render holds only its original item and never repeats its POST',async t=>{
  const f=setup(t);enableCandidateFixture(f);for(let i=1;i<=2;i++)f.enqueue(i);f.start();for(let i=1;i<=2;i++){f.read(evidence());await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();}
  let calls=0;const brand=f.scc.brandProduction.bind(f.scc);f.scc.brandProduction=async(...a)=>{calls++;if(calls===1)throw new ApiError(null,'render_response_lost',true);return brand(...a);};
  await f.c.processBacklog();assert.equal((await f.c.processBacklog()).state,'backlog_item_held');f.restart();assert.equal((await f.c.processBacklog()).state,'backlog_qa_recorded');assert.equal((await f.c.processBacklog()).state,'backlog_variant_ready');assert.equal((await f.c.processBacklog()).state,'review_candidate_ready');assert.equal(calls,2);assert.equal(f.counts().submitted,2);
  const held=f.c.status().backlog.find((x:any)=>x.backlogHold)!;await assert.rejects(()=>f.c.review({itemId:held.id,sha256:sha,decision:'accepted',visual:'pass',audio:'pass',source:'owner',notes:'Isolated acceptance cannot bypass an uncertain render',caption:'Copy',hashtags:''},true),/original candidate/);assert.equal(calls,2);
});
test('lost candidate draft response is reconciled by exact existing SCC draft read-back without a second write',async t=>{
  const f=setup(t);enableCandidateFixture(f);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();await f.c.processBacklog();await f.c.processBacklog();let writes=0,reads=0;
  f.scc.prepare=async()=>{writes++;throw new ApiError(null,'draft_response_lost',true);};assert.equal((await f.c.processBacklog()).state,'backlog_item_held');f.restart();await assert.rejects(()=>f.c.recheckBacklog(item.id),/technical-read/);
  f.scc.reconcileDraft=async(id,expected)=>{reads++;assert.equal(id,'original-draft');assert.equal(expected.accountId,'page');assert.equal(expected.videoId,'video');assert.equal(expected.selectedVariantId,'variant');return {draft:{id,revision:1,status:'draft',approvedRevision:null,queuedPostId:null},payloadHash:'d'.repeat(64)};};
  await f.c.reconcileBacklog(item.id,{draftId:'original-draft'});assert.equal(writes,1);assert.equal(reads,1);assert.equal(f.store.getOperation(item.id,'production_candidate_draft')!.status,'succeeded');assert.equal(f.store.getJob(item.id)!.state.candidateDraftId,'original-draft');assert.equal(f.store.getJob(item.id)!.state.phase,'needs_review');assert.equal((await f.c.processBacklog()).state,'no_backlog_work');assert.equal(writes,1);
});
test('duplicate backlog invocations preserve one technical/brand/draft identity; owner acceptance adopts the existing candidate',async t=>{
  const f=setup(t);enableCandidateFixture(f);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();
  const results=await Promise.all([f.c.processBacklog(),f.c.processBacklog()]);assert.ok(results.some(x=>x.state==='backlog_busy'));await f.c.processBacklog();await f.c.processBacklog();
  f.draft({id:'draft',revision:1,status:'draft',videoId:'video',scheduledAt:null,approvedRevision:null,queuedPostId:null,destinations:[{accountId:'page',selectedVariantId:'variant',caption:'Reviewed copy',hashtags:''}]});
  await f.c.review({itemId:item.id,sha256:sha,decision:'accepted',visual:'pass',audio:'pass',source:'owner',notes:'Isolated actual-owner acceptance fixture',caption:'Reviewed copy',hashtags:''},true);assert.equal(f.store.getJob(item.id)!.state.phase,'ready');assert.equal(f.counts().branded,1);assert.equal(f.counts().drafts,1);assert.equal(f.store.getJob(item.id)!.state.draftId,'draft');
});
test('six sequential completions over two quota windows survive acknowledgment restart and prepare six unpublished candidates',async t=>{
  const f=setup(t);enableCandidateFixture(f);for(let i=1;i<=6;i++)f.enqueue(i);f.native.windowStartedAt='2026-11-04T00:00:00Z';await f.c.authorizePolicy(standing(),true);
  for(let i=1;i<=6;i++){
    if(i===4){assert.equal((await f.c.tick()).state,'policy_budget_wait');await f.c.processBacklog();f.advance(5*3600000);f.restart();}
    f.read(evidence());assert.equal((await f.c.tick()).state,'planning');assert.equal((await f.c.tick()).state,'bounded_request_queued');const active=evidence();active.run={submissionIntent:true,acknowledged:true,status:'generating'};active.session.active=true;f.read(active);f.restart();await f.c.tick();const prior=f.counts().submitted;await Promise.all([f.c.tick(),f.c.tick()]);assert.equal(f.counts().submitted,prior);
    f.read(evidence('completed'));assert.equal((await f.c.tick()).state,'awaiting_qa');await f.c.processBacklog();
  }
  for(let i=0;i<20;i++)await f.c.processBacklog();assert.equal(f.counts().submitted,6);assert.equal(f.counts().imports,6);assert.equal(f.counts().drafts,6);assert.equal(f.c.status().backlog.filter((x:any)=>x.phase==='needs_review'&&x.candidateDraftId).length,6);assert.equal((f.c.policyStatus() as any).budget.total,6);assert.ok(f.c.status().backlog.every((x:any)=>!x.qa));
});
test('technical/visual failure and low storage do not fabricate candidate acceptance or block unrelated clips',async t=>{
  const f=setup(t);enableCandidateFixture(f);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();f.free(0);assert.equal((await f.c.processBacklog()).state,'backlog_storage_hold');f.free(10*1024**3);await f.c.processBacklog();
  assert.throws(()=>f.c.candidateReview({itemId:item.id,sha256:sha,contactSheetSha256:'c'.repeat(64),samples:20,visual:'sampled_pass',audio:'pass',notes:'Not allowed to invent listening pass',caption:'Copy',hashtags:'',captionLanguage:'en',source:'agent_frame_samples_and_signal_analysis'}));
  f.c.candidateReview({itemId:item.id,sha256:sha,contactSheetSha256:'c'.repeat(64),samples:20,visual:'fail',audio:'needs_review',notes:'Sampled visual story is incoherent in this isolated fixture',caption:'Copy',hashtags:'',captionLanguage:'en',source:'agent_frame_samples_and_signal_analysis'});assert.equal(f.store.getJob(item.id)!.state.phase,'qa_failed');assert.equal((await f.c.processBacklog()).state,'no_backlog_work');assert.equal(f.counts().drafts,0);
});
test('status separates configured policy waiting, observed native accounting and provider quota uncertainty',async t=>{
  const f=setup(t);await f.c.authorizePolicy(standing(),true);f.native.accountUsage={'gemini_web-main':{submissions:4,window_started_at:'2026-11-04T00:00:00Z'}};await f.c.tick();const s=await f.c.inspectStatus();assert.equal(s.operation.state,'waiting_capacity');assert.equal(s.nativeObservation.accountUsage['gemini_web-main'].submissions,4);assert.equal(s.nativeObservation.providerAllowance,null);assert.equal(s.analyticsRequiredForProduction,false);assert.equal(f.counts().submitted,0);
});
test('a lost immutable import is read back by exact source/hash and never repeats its POST',async t=>{
  const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();f.read(evidence('completed'));let posts=0;f.scc.importVideo=async()=>{posts++;throw new ApiError(null,'import_response_lost',true);};assert.equal((await f.c.tick()).state,'reconciliation_required');
  const {createHash}=await import('node:crypto');Object.assign(f.media,{id:'video',source_type:'pipeline_import',pipeline_job_id:'project-1'});Object.assign(f.media.provenance,{source:'ai_video_pipeline',upstreamJobId:'project-1',pipelineSourceFingerprint:createHash('sha256').update(targets.pipeline).digest('hex')});
  await assert.rejects(()=>f.c.reconcileImport(item.id,'foreign-video'),/differs/);await f.c.reconcileImport(item.id,'video');f.restart();await f.c.resume(true);assert.equal(posts,1);assert.equal(f.store.getJob(item.id)!.state.phase,'awaiting_qa');assert.equal(f.store.getJob(item.id)!.state.videoId,'video');assert.equal(f.counts().submitted,1);
});
test('the existing runner advances held backlog despite exhausted model budget and duplicate triggers',async t=>{
  const f=setup(t);enableCandidateFixture(f);f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();await f.c.tick();f.read(evidence('completed'));await f.c.tick();f.store.patchState((f.c.policyStatus() as any).id,{humanHold:'human_action_required'});
  configureRunner(f.store,{...defaultRunnerConfig(),enabled:true,maxInvocationsPerDay:1},true);f.c.work.add({id:'fixture',kind:'story_plan',title:'Prior isolated model-budget fixture',priority:0});f.store.saveRunnerSession({id:'used-model-budget',taskId:'fixture',adapter:'json',status:'completed',startedAt:'2026-11-04T00:00:00Z',deadlineAt:'2026-11-04T00:01:00Z',finishedAt:'2026-11-04T00:00:01Z',reservedTokens:1,usage:{tokens:1,source:'fixture'}});
  let models=0;const noModels={detect:async()=>{models++;throw new Error('Model budget exhausted');},execute:async()=>{models++;throw new Error('Unexpected model');}} as any;
  const runner=new AgentRunner(f.store,path.join(f.dir,'runner'),noModels,()=>new Date('2026-11-04T00:00:00Z'),undefined,async()=>{const result=await f.c.tick();await f.c.processBacklog();return result;});await Promise.all([runner.tick(),runner.tick()]);await runner.tick();await runner.tick();assert.equal(models,0);assert.equal(f.counts().branded,1);assert.equal(f.counts().drafts,1);assert.equal(f.counts().submitted,1);
});
test('provider unavailable waits at a supported boundary and resumes normal admission under the same grant',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing(),true);f.native.available=false;assert.equal((await f.c.tick()).state,'provider_unavailable');assert.equal((await f.c.tick()).state,'waiting_capacity');assert.equal(f.counts().submitted,0);f.advance(5*3600000);f.restart();f.native.available=true;assert.equal((await f.c.tick()).state,'capacity_observed');assert.equal((await f.c.tick()).state,'planning');assert.equal((await f.c.tick()).state,'bounded_request_queued');assert.equal(f.counts().submitted,1);
});

test('standing creation consults external cache before concepts without waiting for local analytics',async t=>{
  const f=setup(t);await f.c.authorizePolicy(standing(),true);assert.equal((await f.c.tick()).state,'needs_creator_research');
  const research=f.store.listWork().find(t=>t.kind==='research_concept')!;assert.equal(research.priority,80);assert.equal(f.counts().submitted,0);
  const claim=f.c.work.claim(research.id,{owner:'fixture',commandId:'research-claim'}).task;
  f.c.work.save({id:claim.id,owner:'fixture',commandId:'research-save',claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:JSON.stringify({version:'gemini-creator-research.v1',observedAt:'2026-11-04T00:00:00Z',validUntil:'2026-11-05T00:00:00Z',access:'blocked',limitations:'Facebook access unavailable; no metrics invented.',examples:[],principles:[]})});
  const next=await f.c.tick();assert.equal(next.state,'needs_concept');const task=f.store.getWork(next.taskId)!;assert.equal(task.payload.creatorLearning.external.length,1);assert.equal(task.payload.creatorLearning.external[0].access,'blocked');assert.equal(f.counts().submitted,0);
  const prepared=f.c.work.claim(task.id,{owner:'fixture',commandId:'concept-claim'}).task;
  f.c.work.save({id:task.id,owner:'fixture',commandId:'concept-save',claimToken:prepared.claimToken,revision:prepared.revision,status:'prepared',result:JSON.stringify({...concept(),languageStrategy:internationalLanguage,researchUse:{findingIds:['invented'],principleIds:[],originality:'Original subject and action'}})});
  assert.throws(()=>f.c.enqueuePrepared(task.id),/unsupplied/);assert.equal(f.counts().submitted,0);
});

test('external research preparation continues during standing account-cap waits',async t=>{
  const f=setup(t);await f.c.authorizePolicy(standing(),true);f.native.accountUsage={'gemini_web-main':{submissions:4,window_started_at:'2026-11-04T00:00:00Z'}};assert.equal((await f.c.tick()).state,'account_application_cap');assert.equal(f.store.listWork().filter(t=>t.kind==='research_concept').length,1);assert.equal(f.counts().submitted,0);
});

test('a done Gemini preparation still creates only its original durable concept',t=>{
  const f=setup(t);f.c.work.add({id:'done-concept',kind:'prepare_video',title:'Original complete scene',accountId:'page',payload:{production:{version:'gemini-concept.v1'}}});const claim=f.c.work.claim('done-concept',{owner:'fixture',commandId:'done-claim'}).task;
  f.c.work.save({id:claim.id,owner:'fixture',commandId:'done-save',claimToken:claim.claimToken,revision:claim.revision,status:'done',result:JSON.stringify(concept())});const item=f.c.enqueuePrepared(claim.id);assert.equal(f.c.enqueuePrepared(claim.id).id,item.id);assert.equal(f.counts().submitted,0);
});
test('standing policy runs six sequential clips across two estimated windows and restart without another owner authorization',async t=>{
  const f=setup(t);for(let n=1;n<=6;n++)f.enqueue(n);f.native.windowStartedAt='2026-11-04T00:00:00Z';await f.c.authorizePolicy(standing(),true);
  for(let n=1;n<=6;n++){
    if(n===4){assert.equal((await f.c.tick()).state,'policy_budget_wait');f.advance(5*3600000);f.restart();}
    f.read(evidence());assert.equal((await f.c.tick()).state,'planning');assert.equal((await f.c.tick()).state,'bounded_request_queued');f.read(evidence('completed'));assert.equal((await f.c.tick()).state,'awaiting_qa');
  }
  assert.equal(f.counts().submitted,6);assert.equal((f.c.policyStatus() as any).budget.total,6);assert.equal((await f.c.tick()).state,'policy_budget_wait');
});
test('standing account-cap wait performs a supported observation at its boundary without resetting the native ledger',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing(),true);f.native.accountUsage={'gemini_web-main':{submissions:4,window_started_at:'2026-11-04T00:00:00Z'}};f.native.accountWaitNext='2026-11-04T05:00:00Z';
  assert.equal((await f.c.tick()).state,'account_application_cap');assert.equal((await f.c.tick()).state,'waiting_capacity');f.advance(5*3600000);f.restart();assert.equal((await f.c.tick()).state,'capacity_observed');assert.equal((await f.c.tick()).state,'planning');assert.equal(f.native.accountUsage['gemini_web-main'].submissions,4);assert.equal((await f.c.tick()).state,'bounded_request_queued');
});
test('standing weekly restriction waits for the recorded date, then checks eligibility automatically',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();f.check(async()=>{f.native.availability={blocker_code:'weekly_limit_exhausted',stale:false,next_recheck_at:'2026-11-10T00:00:00Z'};f.native.nextCheckAt='2026-11-10T00:00:00Z';return {};});
  assert.equal((await f.c.tick()).state,'weekly_limit_exhausted');f.advance(3600000);assert.equal((await f.c.tick()).state,'waiting_capacity');f.advance(6*86400000);f.restart();assert.equal((await f.c.tick()).state,'capacity_observed');f.check(async()=>{f.native.availability={blocker_code:'video_available',stale:false};return {};});assert.equal((await f.c.tick()).state,'bounded_request_queued');assert.equal(f.counts().submitted,1);
});
test('standing revocation during readiness is atomic against dispatch; expiry and rolling daily limits need no new approval',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();f.check(async()=>{f.c.revokePolicy();return {};});assert.equal((await f.c.tick()).state,'reconciliation_required');assert.equal(f.counts().submitted,0);assert.equal((await f.c.tick()).state,'policy_revoked');await assert.rejects(()=>f.c.authorizePolicy(standing(),true),/cannot be rearmed/);
  const g=setup(t);g.enqueue();await g.c.authorizePolicy(standing({expiresAt:'2026-11-04T01:00:00Z'}),true);g.advance(3600001);assert.equal((await g.c.tick()).state,'policy_expired');assert.equal(g.counts().submitted,0);
  const h=setup(t);await h.c.authorizePolicy(standing({maxPer24Hours:1}),true);h.enqueue();await h.c.tick();await h.c.tick();h.read(evidence('completed'));await h.c.tick();h.advance(5*3600000);assert.equal((await h.c.tick()).state,'policy_budget_wait');
});
test('standing uncertain dispatch remains protected across restart and recovers its original without another request',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();f.submit(async()=>{throw new ApiError(null,'transport_failed',true);});assert.equal((await f.c.tick()).state,'reconciliation_required');f.restart();await f.c.tick();assert.equal(f.counts().submitted,1);f.read(evidence('completed'));assert.equal((await f.c.tick()).state,'awaiting_qa');assert.equal(f.counts().submitted,1);
});
test('standing native blocked request rechecks the same unsubmitted project and uses a new durable dispatch sequence',async t=>{
  const f=setup(t);const item=f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();await f.c.tick();const request=f.store.getJob(item.id)!.state.requestId;
  f.native.boundedRequests=[{jobId:'project-1',request_id:request,state:'blocked',in_progress:false,available:false}];assert.equal((await f.c.tick()).state,'waiting_capacity');f.advance(5*3600000);assert.equal((await f.c.tick()).state,'capacity_observed');f.native.boundedRequests[0].available=true;assert.equal((await f.c.tick()).state,'admission_rechecked');assert.equal((await f.c.tick()).state,'bounded_request_queued');assert.equal(f.counts().created,1);assert.ok(f.store.getOperation(item.id,'production_submit_1'));assert.equal(f.counts().submitted,2);
});
test('standing known quota-rejected no-video run resumes after supported checks, while generic errors need human review',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();await f.c.tick();const r=evidence('failed');r.original.runId='quota-run';r.run={status:'failed',submissionIntent:true,acknowledged:false,resolution:'quota_rejected_no_video',finishedAt:'2026-11-04T00:01:00Z'};r.failure={code:'weekly_limit'};f.read(r);
  assert.equal((await f.c.tick()).state,'waiting_capacity');f.advance(5*3600000);assert.equal((await f.c.tick()).state,'capacity_observed');assert.equal((await f.c.tick()).state,'capacity_rechecked');assert.equal((await f.c.tick()).state,'bounded_request_queued');assert.equal(f.counts().created,1);assert.equal(f.counts().submitted,2);
  const g=setup(t);g.enqueue();await g.c.authorizePolicy(standing(),true);await g.c.tick();await g.c.tick();const failed=evidence('failed');failed.run={status:'provider_failed',submissionIntent:true,acknowledged:true,resolution:'conclusive_provider_failure_no_video'};failed.failure={code:'provider_error'};g.read(failed);assert.equal((await g.c.tick()).state,'provider_failure_hold');g.advance(2*86400000);assert.equal((await g.c.tick()).state,'provider_failure_hold');assert.equal(g.counts().submitted,1);
});
test('revoked standing authority still imports an already generated original but cannot start another',async t=>{
  const f=setup(t);f.enqueue();f.enqueue(2);await f.c.authorizePolicy(standing(),true);await f.c.tick();await f.c.tick();f.c.revokePolicy();f.read(evidence('completed'));assert.equal((await f.c.tick()).state,'awaiting_qa');assert.equal((await f.c.tick()).state,'policy_revoked');assert.equal(f.counts().submitted,1);assert.equal(f.counts().imports,1);
});
test('authorization can have no expiry; security verification remains a human hold across quota windows',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing({expiresAt:null}),true);f.advance(31*86400000);assert.equal((await f.c.tick()).state,'planning');assert.equal((f.c.policyStatus() as any).policy.expiresAt,null);
  const g=setup(t);g.enqueue();await g.c.authorizePolicy(standing(),true);g.native.providerBlock='human_action_required';assert.equal((await g.c.tick()).state,'human_action_required');g.advance(7*86400000);assert.equal((await g.c.tick()).state,'human_action_required');assert.equal(g.counts().checks,0);assert.equal(g.counts().submitted,0);
});
test('owner security resume recovers/imports the original and reconciles its stale hold without another video request',async t=>{
  const f=setup(t);f.enqueue();f.enqueue(2);await f.c.authorizePolicy(standing(),true);await f.c.tick();await f.c.tick();const r=evidence();r.original.runId='original-run';r.run.submissionIntent=true;r.session.unresolved=true;r.failure={code:'human_action_required'};f.read(r);assert.equal((await f.c.tick()).state,'human_action_required');
  f.recover(async()=>{f.read(evidence('completed'));f.native.recoveryHold=true;return {};});await f.c.resume(true);
  assert.equal(f.counts().submitted,1);assert.equal(f.counts().recovered,1);assert.equal(f.counts().imports,1);assert.equal(f.counts().reconcileHolds,1);assert.equal((f.c.policyStatus() as any).state.humanHold,null);assert.equal((await f.c.tick()).state,'planning');
});
test('automatic original-result import reconciles only a proven completed hold; known capacity after security needs no new grant',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();await f.c.tick();f.read(evidence('completed'));f.native.recoveryHold=true;assert.equal((await f.c.tick()).state,'awaiting_qa');assert.equal(f.counts().reconcileHolds,1);assert.equal(f.counts().submitted,1);
  f.check(async()=>{f.native.availability={blocker_code:'weekly_limit_exhausted',stale:false,next_recheck_at:'2026-11-10T00:00:00Z'};f.native.nextCheckAt='2026-11-10T00:00:00Z';return {};});await f.c.resume(true);assert.equal((await f.c.tick()).state,'waiting_capacity');assert.equal((f.c.policyStatus() as any).state.humanHold,null);
});

test('real Gemini provider_block_reason drives exact-turn resume reconciliation before fresh readiness',async t=>{
  const f=setup(t);f.enqueue();await f.c.authorizePolicy(standing(),true);await f.c.tick();await f.c.tick();
  const pending=evidence();pending.original.runId='original-run';pending.run.submissionIntent=true;pending.session.unresolved=true;pending.failure={code:'human_action_required'};f.read(pending);assert.equal((await f.c.tick()).state,'human_action_required');
  let held=false,reconciled=0;
  const adapter=new PipelineAdapter(new JsonClient(targets.pipeline,{fetch:async(url,init)=>{
    assert.equal(new URL(String(url)).pathname,init?.method==='POST'?'/gemini-autopilot/recover':'/gemini-autopilot');
    if(init?.method==='POST'){assert.deepEqual(JSON.parse(String(init.body)),{action:'reconcile_recovery'});assert.equal(held,true);held=false;reconciled++;return Response.json({status:'ok'});}
    return Response.json({provider:'gemini_web',available:true,worker_enabled:true,recovery_status:{submission_unresolved:false},availability_status:{blocker_code:'video_available',stale:false},scheduler:{enabled:false,queue:[],configured_submission_cap:4,submissions_this_window:1,provider_block_reason:held?'reconciliation_required':'',block_reason:'stale_legacy_value'}});
  }}));
  f.pipeline.productionStatus=()=>adapter.productionStatus();f.pipeline.reconcileProductionRecovery=()=>adapter.reconcileProductionRecovery();
  f.recover(async()=>{f.read(evidence('completed'));held=true;return {};});f.check(async()=>{assert.equal(held,false,'readiness must follow audited reconciliation');return {};});
  await f.c.resume(true);assert.equal(reconciled,1);assert.equal(f.counts().recovered,1);assert.equal(f.counts().imports,1);assert.equal(f.counts().submitted,1);assert.equal((f.c.policyStatus() as any).state.humanHold,null);
});

test('Gemini native blocker field preserves recovery, security and accounting dispositions',async()=>{
  for(const code of ['reconciliation_required','result_recovery_pending','human_action_required','external_submission_accounting','']){
    const adapter=new PipelineAdapter(new JsonClient(targets.pipeline,{fetch:async()=>Response.json({provider:'gemini_web',available:true,worker_enabled:true,recovery_status:{submission_unresolved:false},scheduler:{enabled:false,queue:[],configured_submission_cap:4,submissions_this_window:2,provider_block_reason:code,block_reason:'legacy_must_not_override'}})}));
    const status=await adapter.productionStatus();assert.equal(status.providerBlock,code);assert.equal(status.recoveryHold,['reconciliation_required','result_recovery_pending'].includes(code));assert.equal(status.accountingHold,code==='external_submission_accounting');assert.equal(status.used,2);assert.equal(status.providerAllowance,null);
  }
});
test('manual security recovery shares the production lease and cannot overlap an existing observation',async t=>{
  const f=setup(t);await f.c.authorizePolicy(standing(),true);f.store.setRunnerState('production.lease',{token:'existing',until:'2026-11-04T01:00:00Z'});await assert.rejects(()=>f.c.resume(true),/busy/);assert.equal(f.counts().recovered,0);assert.equal(f.counts().submitted,0);assert.equal(f.store.runnerState<any>('production.lease')?.token,'existing');
});
test('real executor string result is parsed into a durable concept without changing the shared result contract',t=>{
  const f=setup(t);f.c.work.add({id:'prepared-concept',kind:'prepare_video',title:'Prepare complete scene',accountId:'page',payload:{production:{version:'gemini-concept.v1'}}});
  const claim=f.c.work.claim('prepared-concept',{owner:'fixture',commandId:'claim-concept',leaseSeconds:30}).task;
  const result=agentResultSchema.parse({version:'agent-result.v1',status:'prepared',result:JSON.stringify(concept()),lessons:[]});
  f.c.work.save({id:claim.id,owner:'fixture',commandId:'save-concept',claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:result.result});
  const item=f.c.enqueuePrepared('prepared-concept');assert.equal(item.state.phase,'queued');assert.equal((item.input as any).concept.hook,concept().hook);assert.equal(typeof result.result,'string');assert.equal(f.counts().created,0);
});

test('automatic original recovery bypasses stale canRecover display only, never the original reservation',async t=>{
 const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();const r=evidence();r.original.runId='original-run';r.run.submissionIntent=true;r.session.unresolved=true;r.recovery={required:true,canRecover:false};f.read(r);
 let calls=0;let receipt:any={run_id:'original-run',state:'still_generating',auto_checks:0,busy:false};
 f.pipeline.originalRecoveryStatus=async()=>structuredClone(receipt);
 f.pipeline.recoverOriginalAutomatically=async(project,run,request)=>{assert.equal(run,'original-run');calls++;receipt={...receipt,auto_checks:1,auto_request_id:request,auto_next_check_at:'2026-11-04T01:00:00Z'};return {recoveries:[receipt]};};
 assert.equal((await f.c.tick()).state,'recovering_original');f.restart();for(let i=0;i<5;i++)assert.equal((await f.c.tick()).state,'original_recovery_backoff');
 assert.equal(calls,1);assert.equal(f.counts().submitted,1);assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),item.id);
 f.read(evidence('completed'));assert.equal((await f.c.tick()).state,'awaiting_qa');assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),null);assert.equal(f.counts().imports,1);assert.equal(f.counts().submitted,1);
});
test('lost automatic original response reconciles the exact durable native request after restart without replay',async t=>{
 const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();const r=evidence();r.original.runId='original-run';r.session.unresolved=true;f.read(r);let calls=0;let receipt:any={run_id:'original-run',state:'needs_check',auto_checks:0,busy:false};
 f.pipeline.originalRecoveryStatus=async()=>structuredClone(receipt);f.pipeline.recoverOriginalAutomatically=async(_p,_r,request)=>{calls++;receipt={...receipt,auto_request_id:request,auto_checks:1,state:'still_generating',auto_next_check_at:'2026-11-04T01:00:00Z'};throw new ApiError(null,'request_timeout',true);};
 assert.equal((await f.c.tick()).state,'original_recovery_operation_uncertain');f.restart();assert.equal((await f.c.tick()).state,'original_recovery_observed');assert.equal((await f.c.tick()).state,'original_recovery_backoff');assert.equal(calls,1);
 const op=f.store.getOperation(item.id,'production_original_recovery_original-run_0')!;assert.equal(op.status,'succeeded');assert.equal((op.response as any).reconciled,true);assert.equal(f.counts().submitted,1);
});
test('automatic recovery holds security, mismatches, exhausted and unrelated uncertain receipts without model or POST loops',async t=>{
 for(const state of ['human_action_required','identity_mismatch','original_unavailable','exhausted','wrong_receipt']){
 const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();const r=evidence();r.original.runId='original-run';r.session.unresolved=true;f.read(r);let calls=0;
 f.pipeline.originalRecoveryStatus=async()=>({run_id:'original-run',state,auto_checks:state==='exhausted'?4:0,busy:false,auto_request_id:'different-original-request'});
 f.pipeline.recoverOriginalAutomatically=async()=>{calls++;throw Error('must not call')};
 if(state==='wrong_receipt'){f.store.claimOperation(item.id,'production_original_recovery_original-run_0',{projectId:'project-1',runId:'original-run',requestId:'original-request'});f.store.finishOperation(item.id,'production_original_recovery_original-run_0','uncertain',{});}
 for(let i=0;i<4;i++)await f.c.tick();assert.equal(calls,0);assert.equal(f.counts().submitted,1);assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),item.id);
 }
});

test('completed manual original recovery read-back reconciles its lost response before import without another recovery POST',async t=>{
 const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();const op='owner_security_recovery_0';f.store.claimOperation(item.id,op,{projectId:'project-1',runId:'original-run'});f.store.finishOperation(item.id,op,'uncertain',{code:'request_timeout'});
 const r=evidence('completed');r.original.runId='original-run';f.read(r);let gets=0;f.pipeline.originalRecoveryStatus=async()=>{gets++;return {run_id:'original-run',state:'completed',busy:false,provenance:{original_run_id:'original-run',source:'provider_correlated_original',clip_sha256:sha}};};
 await f.c.resume(true);assert.equal(gets,1);assert.equal(f.counts().recovered,0);assert.equal(f.counts().imports,1);assert.equal(f.counts().submitted,1);assert.equal(f.store.getOperation(item.id,op)!.status,'succeeded');assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),null);
 const saved=f.store.listKnowledge({resourceId:item.id,limit:20}).find(k=>k.id==='owner-recovery-readback:'+item.id+':'+op)!;assert.equal((saved.evidence as any).previousOperation.response.code,'request_timeout');f.restart();await f.c.resume(true);assert.equal(f.counts().imports,1);assert.equal(f.counts().recovered,0);
});
test('manual original recovery reconciliation rejects wrong run, provenance, media and busy receipts without POST or import',async t=>{
 for(const problem of ['wrong_run','wrong_provenance','bad_hash','busy','no_media']){const f=setup(t);const item=f.enqueue();f.start();await f.c.tick();await f.c.tick();f.store.claimOperation(item.id,'owner_security_recovery_0',{projectId:'project-1',runId:'original-run'});f.store.finishOperation(item.id,'owner_security_recovery_0','uncertain',{code:'request_timeout'});const r=evidence('completed');r.original.runId='original-run';if(problem==='no_media')r.project.media.videoUrl=null;f.read(r);const receipt:any={run_id:'original-run',state:'completed',busy:false,provenance:{original_run_id:'original-run',source:'provider_correlated_original',clip_sha256:sha}};if(problem==='wrong_run')receipt.run_id='wrong';if(problem==='wrong_provenance')receipt.provenance.original_run_id='wrong';if(problem==='bad_hash')receipt.provenance.clip_sha256='not-a-hash';if(problem==='busy')receipt.busy=true;f.pipeline.originalRecoveryStatus=async()=>receipt;
 await assert.rejects(()=>f.c.resume(true),/recovery/);assert.equal(f.store.getOperation(item.id,'owner_security_recovery_0')!.status,'uncertain');assert.equal(f.counts().imports,0);assert.equal(f.counts().recovered,0);assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),item.id);}
});
