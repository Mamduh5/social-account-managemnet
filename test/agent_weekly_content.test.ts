import {selectWeeklyContext,expandWeeklyContext,WeeklyContextLimit} from '../scripts/agent/weekly-context.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {AgentStore,stableHash} from '../scripts/agent/store.js';
import {WeeklyContent,weeklyAnalysisResultSchema,weeklyAnalysisInstructions} from '../scripts/agent/weekly-content.js';
import {pageContentInstructions,pageContentTaskContext,weeklyPageContentInstructions} from '../scripts/agent/page-content.js';
import {SccAdapter} from '../scripts/agent/scc.js';
import {JsonClient} from '../scripts/agent/http.js';
import {AgentRunner} from '../scripts/agent/runner.js';
import {CommandExecutors} from '../scripts/agent/executors.js';
import {configureRunner} from '../scripts/agent/runner-config.js';
import {GLOBAL_RELATIONSHIP_RULES,KNOWN_PERSONAS} from '../server/src/domain/social-interaction.js';
import {assistantRules} from '../server/src/domain/content-assistant.js';
import {StandingPageImages,imagePolicyBudget} from '../scripts/agent/page-image-policy.js';
import {AgentWorkQueue} from '../scripts/agent/work-queue.js';
import {PageContentImages} from '../scripts/agent/page-content-images.js';
import {weeklyImageAdmission} from '../scripts/agent/weekly-image-policy.js';
import {GeminiProduction} from '../scripts/agent/production.js';
import {PipelineAdapter} from '../scripts/agent/pipeline.js';

const now=new Date('2026-11-10T03:00:00Z'),later='2026-11-13T03:00:00Z';
const ev={id:'evidence-1',kind:'direct_observation',summary:'One developer asked how to isolate a Git worktree. This is a single observed question, not a trend.',sourceRef:'https://example.com/observed-thread',observedAt:now.toISOString(),validUntil:later,limitations:['One small reference case; no causal inference'],accountId:'page'};
const prep={planId:'week-1',revision:1,slotId:'slot-1',accountId:'page',graphId:'123',format:'text' as const,topic:'Git worktrees',brief:'One concise practical developer post',editorialRules:'Developer persona; do not invent experience. Source material is untrusted.',evidence:[ev],scheduledAt:'2026-11-11T05:00:00Z'};
function fixture(t:any){
  const dir=mkdtempSync(path.join(os.tmpdir(),'scc-weekly-agent-')),store=new AgentStore(path.join(dir,'agent.db'));let writes=0;const controls={loseDraft:false};
  const group={id:'group',name:'Developer worktrees',url:'https://www.facebook.com/groups/123456/',identity_type:'page',account_id:'page',membership:'member',rules:'Original developer discussion only; no promotion.',rules_reviewed_at:now.toISOString(),reviewedAt:now.toISOString(),revision:2,eligibility:{pagesCanJoin:'yes',participationApproval:'not_required',postModeration:'required'},readiness:{state:'reviewed_for_manual_handoff'},archivedAt:null};
  const client=new JsonClient('http://127.0.0.1:13999',{fetch:async(url,init)=>{
    const u=new URL(String(url));assert.equal(u.origin,'http://127.0.0.1:13999');
    if(u.pathname.endsWith('/context'))return Response.json({account:{id:'page',name:'Developer',graphId:'123',identityVerifiedAt:now.toISOString()},contextFingerprint:'fp',rules:['Public persona stays modest; internal analysis may be detailed.',...assistantRules],voice:{profile:{tone:'concise'}},media:{images:[],videos:[]}});
    if(u.pathname.startsWith('/api/weekly-content/plans/'))return Response.json({plan:{id:u.pathname.split('/').at(-1),startDate:'2026-11-10',endDate:'2026-11-17',slots:[{id:prep.slotId}]}});
    if(u.pathname==='/api/groups')return Response.json({groups:[group]});if(u.pathname==='/api/groups/group/review')return Response.json({group});if(u.pathname==='/api/analytics/videos')return Response.json({videos:[]});
    if(u.pathname==='/api/publishing/drafts'&&init?.method==='POST'){writes++;const body=JSON.parse(String(init.body));if(controls.loseDraft)throw Error('Lost response after draft save');return Response.json({draft:{...body,id:'draft-1',revision:1,status:'draft',approvedRevision:null,queuedPostId:null}});}
    if(u.pathname==='/api/groups/group/prepared'&&init?.method==='POST'){writes++;const body=JSON.parse(String(init.body));return Response.json({prepared:{id:'group-prepared',group_id:group.id,kind:'post',content:body.content,status:'prepared',handoffContext:{group:{revision:group.revision}}}});}
    throw Error('No provider, approval, queue or unexpected request allowed: '+u.pathname);
  }});
  const weekly=new WeeklyContent(store,new SccAdapter(client),()=>now);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});return {dir,store,weekly,client,controls,group,writes:()=>writes};
}
function save(f:ReturnType<typeof fixture>,id:string,result:any){const c=f.weekly.work.claim(id,{owner:'offline-fixture',commandId:'claim:'+id}).task;f.weekly.work.save({id,owner:c.owner,claimToken:c.claimToken,revision:c.revision,commandId:'save:'+id,status:'prepared',result:JSON.stringify(result)});}
const content={version:'page-content-result.v1',title:'Worktree question',text:'A concise original question about isolated worktrees.',hashtags:'',language:'Thai',intendedAudience:'Developers',rationale:'One useful practical question',originality:'Original explanation, no copied comments',research:{observedAt:now.toISOString(),sources:[{url:ev.sourceRef,title:'Observed discussion',accessedAt:now.toISOString()}],summary:'Single observed question',limitations:'Not a general trend',creatorExamples:[]},claims:[],imageBrief:null};

test('offset weekly image authorization reconciles partial local scope saves without changing grants or repeating uncertain attempts',async t=>{
  const f=fixture(t),file=path.join(f.dir,'agent.db'),week=new WeeklyContent(f.store,f.weekly.scc,()=>now,file);
  const p={...prep,format:'image' as const},a=await week.prepare(p,true);
  save(f,a.taskId,{...content,imageBrief:{description:'Original diagram',aspectRatio:'4:5',altText:'Exact diagram',legibility:'Readable',consistency:'Same subjects',disclosure:''}});
  await week.persist({jobId:a.jobId});const review=week.imageReview({planId:p.planId,slotIds:[p.slotId]});
  const input={id:'offset-original',planId:p.planId,slotIds:[p.slotId],expectedHash:review.reviewHash,startsAt:'2026-11-10T10:00:00+07:00',expiresAt:'2026-11-12T23:00:00+07:00',maxTotalImages:1,maxImagesPer24Hours:1,maxPendingItems:1};
  // Reproduce a pre-fix durable offset grant whose downstream scope was never saved.
  const legacyId='weekly-images:'+input.id;
  f.store.createJob(legacyId,{origin:f.client.origin,policy:{version:'weekly-codex-images.v1',id:input.id,planId:p.planId,startsAt:input.startsAt,expiresAt:input.expiresAt,maxTotalImages:1,maxImagesPer24Hours:1,maxActiveImages:1,maxPendingItems:1,provider:'codex_included',concepts:review.concepts.map(({slotId,taskId,accountId,graphId,resultHash,count})=>({slotId,taskId,accountId,graphId,resultHash,count}))}});
  f.store.patchState(legacyId,{enabled:true,issuedAt:now.toISOString(),publicationAuthorized:false});
  const context=week.pages.scc.preparationContext;week.pages.scc.preparationContext=async()=>{throw Error('Temporary local read failure after grant save');};
  await assert.rejects(()=>week.authorizeImages(input,true),/Temporary local read/);const grant=f.store.getJob('weekly-images:'+input.id)!,hash=grant.inputHash;
  assert.equal((grant.input as any).policy.expiresAt,input.expiresAt);assert.equal(f.store.getJob('page-images:'+a.taskId),null);
  week.pages.scc.preparationContext=context;await week.authorizeImages(input,true);
  const scope=f.store.getJob('page-images:'+a.taskId)!;assert.equal((scope.input as any).plan.expiresAt,'2026-11-12T16:00:00.000Z');assert.equal(f.store.getJob(grant.id)!.inputHash,hash);
  assert.equal((await new PageContentImages(week.pages,file,()=>now).advance()).state,'image_request_queued');const task=f.store.listWork(100).find(t=>t.kind==='opening_image')!;
  f.store.saveWork({...task,status:'blocked',revision:task.revision+1,result:{uncertainOriginal:'retain charged attempt'}});const count=f.store.workCount();
  await new WeeklyContent(f.store,f.weekly.scc,()=>now,file).authorizeImages({...input,startsAt:now.toISOString(),expiresAt:'2026-11-12T16:00:00Z'},true);
  assert.equal(f.store.workCount(),count);assert.equal(f.store.getJob(scope.id)!.inputHash,scope.inputHash);assert.equal(f.store.getWork(task.id)!.status,'blocked');assert.equal(weeklyImageAdmission(f.store,scope.input as any,+now),false);
  await assert.rejects(()=>week.authorizeImages({...input,expiresAt:'2026-11-12T23:01:00+07:00'},true),/immutable/);
  new PageContentImages(week.pages,file,()=>now).revoke(scope.id);await assert.rejects(()=>week.authorizeImages(input,true),/cannot be replaced/);assert.equal(f.writes(),0);
});

test('partially saved multi-concept image authorization resumes only missing scopes and preserves original attempts',async t=>{
  const f=fixture(t),file=path.join(f.dir,'agent.db'),week=new WeeklyContent(f.store,f.weekly.scc,()=>now,file),tasks:string[]=[];
  for(const slotId of ['partial-one','partial-two']){const r=await week.prepare({...prep,slotId,format:'image'},true);tasks.push(r.taskId);save(f,r.taskId,{...content,title:slotId,text:'A distinct original image concept '+slotId,imageBrief:{description:'Original diagram '+slotId,aspectRatio:'4:5',altText:slotId,legibility:'Readable',consistency:'Same subjects',disclosure:''}});await week.persist({jobId:r.jobId});}
  const slotIds=['partial-one','partial-two'],review=week.imageReview({planId:prep.planId,slotIds}),request={id:'partial-scopes',planId:prep.planId,slotIds,expectedHash:review.reviewHash,startsAt:now.toISOString(),expiresAt:'2026-11-12T16:00:00Z',maxTotalImages:2,maxImagesPer24Hours:2,maxPendingItems:2};
  let calls=0;const original=week.pages.scc.preparationContext.bind(week.pages.scc);week.pages.scc.preparationContext=async id=>{if(++calls===2)throw Error('Second scope local context unavailable');return original(id);};
  await assert.rejects(()=>week.authorizeImages(request,true),/Second scope/);const first=f.store.getJob('page-images:'+tasks[0])!;assert.ok(first);assert.equal(f.store.getJob('page-images:'+tasks[1]),null);
  const images=new PageContentImages(week.pages,file,()=>now);assert.equal((await images.advance()).state,'image_request_queued');const count=f.store.workCount(),active=f.store.getJob(first.id)!.state.activeTaskId;
  week.pages.scc.preparationContext=original;await week.authorizeImages(request,true);assert.ok(f.store.getJob('page-images:'+tasks[1]));assert.equal(f.store.getJob(first.id)!.inputHash,first.inputHash);assert.equal(f.store.getJob(first.id)!.state.activeTaskId,active);assert.equal(f.store.workCount(),count);assert.equal(f.writes(),0);
});

test('weekly preparation requires separate authority, rejects stale/wrong-scope evidence, and does not create a queue on failure',async t=>{
  const f=fixture(t);await assert.rejects(()=>f.weekly.prepare(prep),/authorization/);await assert.rejects(()=>f.weekly.prepare({...prep,evidence:[{...ev,validUntil:now.toISOString()}]},true),/stale/);await assert.rejects(()=>f.weekly.prepare({...prep,evidence:[{...ev,accountId:'another-page'}]},true),/another Page/);assert.equal(f.store.workCount(),0);assert.equal(f.client.requestCount,0);
});
test('research handoffs retain owner-attested provenance and privacy qualification without promoting independent verification',async t=>{
  const f=fixture(t),qualified={...ev,kind:'verified_fact',provenance:'owner_entered_reference',independentlyVerified:false,verificationNote:'Owner reviewed the linked document; no independent application fetch.',privacy:'owner_supplied',relevanceConfirmed:true};
  const a=await f.weekly.analyze({id:'qualified-analysis',planId:prep.planId,revision:1,accountId:'page',graphId:'123',evidence:[qualified],brief:'Analyze this owner-attested reference',editorialRules:prep.editorialRules});assert.deepEqual(f.store.getWork(a.taskId)!.payload.weeklyAnalysis.evidence,[qualified]);
  const p=await f.weekly.prepare({...prep,evidence:[qualified]},true);assert.deepEqual(f.store.getWork(p.taskId)!.payload.pageContent.weeklyResearch.evidence,[qualified]);assert.equal((f.store.getJob(p.jobId)!.input as any).evidence[0].independentlyVerified,false);assert.match(weeklyAnalysisInstructions,/remains owner-attested, not independently verified/);assert.equal(f.writes(),0);
});
test('oversized combined Page topic and brief are rejected before any handoff intent or task is created',async t=>{
  const f=fixture(t);for(const format of ['text','image','image_caption'])await assert.rejects(()=>f.weekly.prepare({...prep,format,topic:'t'.repeat(200),brief:'b'.repeat(1600)},true),/1800-character/);assert.equal(f.store.workCount(),0);assert.equal(f.store.listJobs(100).length,0);assert.equal(f.client.requestCount,0);
});
test('CLI rejects private source references, freshness renewal beyond seven days, and Group-only evidence reused for a Page slot',async t=>{
  const f=fixture(t);for(const sourceRef of ['http://example.com/a','https://user:secret@example.com/a','https://example.com/a?token=secret','https://127.0.0.1/a','file:///private/path','https://private.local/a'])await assert.rejects(()=>f.weekly.prepare({...prep,evidence:[{...ev,sourceRef}]},true));
  await assert.rejects(()=>f.weekly.prepare({...prep,evidence:[{...ev,validUntil:'2026-11-20T03:00:00Z'}]},true),/seven-day/);await assert.rejects(()=>f.weekly.prepare({...prep,evidence:[{...ev,groupId:'group'}]},true),/another Page or Group/);assert.equal(f.store.workCount(),0);
});
test('default runner budget admits representative complete global persona and voice rules without dropping prohibitions',async t=>{
  const f=fixture(t),editorialRules=JSON.stringify({persona:KNOWN_PERSONAS.developer,globalRelationshipRules:GLOBAL_RELATIONSHIP_RULES,voice:{revision:1,profile:{language:'Thai',tone:'Natural, modest developer peer',prohibitedPhrases:['Do not invent personal experience','Do not expose private information'],approvedExamples:[],approvedFacts:[]}},group:null,restrictions:['Full internal analysis is permitted. Public content must match this identity and Group subject.','No reaction-only ranking, engagement bait, invented experience, trend, metrics or native colored-background support.','Reels require value from action, movement or visual storytelling; concise text is a valid first choice. Image captions add context.','Evidence labels, limitations and factual requirements must survive into every handoff.']});
  const a=await f.weekly.analyze({id:'default-budget-analysis',planId:prep.planId,revision:1,accountId:'page',graphId:'123',evidence:[{...ev,summary:'One relevant observed developer question. '.repeat(7)}],brief:'Analyze one original useful opportunity',editorialRules});assert.equal(a.taskId,'default-budget-analysis');assert.equal(f.store.getWork(a.taskId)!.payload.weeklyAnalysis.editorialRules,editorialRules);const p=await f.weekly.prepare({...prep,editorialRules},true);assert.equal(f.store.getWork(p.taskId)!.payload.pageContent.request.editorialRules,editorialRules);
  let invoked=0;class Admit extends CommandExecutors {override async detect(){return {id:'fixture',adapter:'json' as const,available:true,reason:'offline fixture'};}override async execute(_c:any,_cap:any,context:string):Promise<any>{invoked++;assert.ok(Buffer.byteLength(context)<=16000);assert.deepEqual(expandWeeklyContext(JSON.parse(context)).weeklyAnalysis.editorialRules,JSON.parse(editorialRules));return {result:{version:'agent-result.v1',status:'blocked',result:'Offline budget acceptance only',lessons:[]},usage:{tokens:1,source:'offline_fixture'}};}}
  configureRunner(f.store,{enabled:true,cooldownSeconds:0,executors:[{id:'fixture',adapter:'json',command:process.execPath,isolationReviewed:true,kinds:['audience_research']}]},true);await new AgentRunner(f.store,f.dir,new Admit(f.dir),()=>now).tick();assert.equal(invoked,1);
});
test('exact weekly slot uses existing Page queue, preserves evidence/persona and survives restart without another task or write',async t=>{
  const f=fixture(t),a=await f.weekly.prepare(prep,true);assert.equal(a.kind,'text_post');const task=f.store.getWork(a.taskId)!;assert.equal(task.payload.pageContent.requiresLiveResearch,false);assert.deepEqual(task.payload.pageContent.weeklyResearch.evidence,[ev]);assert.match(task.payload.pageContent.page.rules[0],/persona/);const other=new AgentStore(path.join(f.dir,'agent.db'));try{const resumed=new WeeklyContent(other,f.weekly.scc,()=>now),b=await resumed.prepare(prep,true);assert.equal(a.taskId,b.taskId);assert.equal(other.workCount(),1);assert.equal(f.writes(),0);assert.equal(other.getJob(a.jobId)!.state.publicationAuthorized,false);await assert.rejects(()=>resumed.prepare({...prep,topic:'Changed after dispatch'},true),/immutable/);}finally{other.close();}
});
test('completed text saves one unapproved unscheduled draft; replay reuses the exact original receipt',async t=>{
  const f=fixture(t),a=await f.weekly.prepare(prep,true);save(f,a.taskId,content);const r=await f.weekly.persist({jobId:a.jobId});assert.equal(r.preparation!.phase,'needs_owner_review');assert.equal(r.preparation!.draftId,'draft-1');await f.weekly.persist({planId:prep.planId,slotId:prep.slotId});assert.equal(f.writes(),1);assert.equal(f.store.getJob(a.jobId)!.state.publicationAuthorized,false);
});
test('image-caption prepares an imagery brief and retains awaiting-imagery without granting generation or renewing an image trial',async t=>{
  const f=fixture(t),a=await f.weekly.prepare({...prep,format:'image_caption'},true);assert.equal(a.kind,'image_post');save(f,a.taskId,{...content,imageBrief:{description:'Original visual comparison',aspectRatio:'4:5',altText:'Worktree branches',legibility:'Readable',consistency:'Same repository throughout',disclosure:''}});const r=await f.weekly.persist({jobId:a.jobId});assert.equal(r.preparation!.phase,'awaiting_imagery');assert.equal(f.writes(),0);assert.equal(f.store.runnerState('page-image.policy'),null);
});
test('an existing standing image trial cannot silently adopt a new weekly image concept',async t=>{
  const f=fixture(t),a=await f.weekly.prepare({...prep,format:'image_caption'},true);save(f,a.taskId,{...content,imageBrief:{description:'Original comparison',aspectRatio:'4:5',altText:'Worktree branches',legibility:'Readable',consistency:'Same repository',disclosure:''}});await f.weekly.persist({jobId:a.jobId});
  const stateFile=path.join(f.dir,'agent.db'),policy=new StandingPageImages(f.weekly.pages,stateFile,()=>now,async()=>({authType:'chatgpt',planType:'team'}),()=>2**40);
  await policy.authorize({version:'standing-codex-images.v1',id:'existing-trial',accountId:'page',graphId:'123',expiresAt:later,maxConceptsPer24Hours:1,maxImagesPer24Hours:3,maxImagesTotal:9,maxPendingItems:6,maxActiveImages:1,provider:'codex_included',brief:'Existing separately authorized original trial'},true);
  const policyId='page-image-policy:existing-trial',old=new AgentWorkQueue(f.store,()=>new Date('2026-11-08T03:00:00Z')).add({id:'old-trial-pending',kind:'image_post',title:'Existing trial pending concept',accountId:'page',payload:{pageContent:{version:'page-content.v1',format:'image',standingImagePolicyId:policyId}}});f.store.setRunnerState('page-content.tasks',[old.id,a.taskId]);
  const inputHash=f.store.getJob(policyId)!.inputHash,result=await policy.advance();assert.equal(result.state,'image_concept_preparation_pending_or_held');assert.equal(result.actions,0);assert.equal(f.store.getJob('page-images:'+a.taskId),null);assert.equal(f.store.runnerState('page-image.scopes'),null);assert.equal(f.store.getJob(policyId)!.inputHash,inputHash);assert.equal(imagePolicyBudget(f.store,f.store.getJob(policyId)!,+now).trialReservedOrStarted,0);
});
test('Reel preparation is an existing story-plan task with explicit production-scope hold and no generation',async t=>{
  const f=fixture(t),a=await f.weekly.prepare({...prep,format:'reel'},true);assert.equal(a.kind,'prepare_video');assert.match(a.hold!,/existing_video_production_scope_required/);assert.equal(f.writes(),0);await f.weekly.persist({jobId:a.jobId});assert.equal(f.writes(),0);
});
test('Group text uses the exact existing Group preparation workflow and does not distribute to unrelated Groups',async t=>{
  const f=fixture(t),a=await f.weekly.prepare({...prep,groupId:'group'},true),task=f.store.getWork(a.taskId)!;assert.equal(task.kind,'group_post');assert.equal(task.payload.content.group.id,'group');
  save(f,a.taskId,{title:'Original Group question',text:'An original relevant developer question',hashtags:'',groupRevision:2,rulesHash:task.payload.content.group.rulesHash,relevance:'Relevant to this developer Group',compliance:'Original developer discussion with no promotion'});
  const saved=await f.weekly.persist({planId:prep.planId,slotId:prep.slotId});assert.equal(saved.preparation!.prepared.id,'group-prepared');assert.equal(saved.preparation!.automaticPosting,false);assert.equal(f.writes(),1);assert.equal(f.store.runnerState('group-text.grants'),null);
  await assert.rejects(()=>f.weekly.prepare({...prep,slotId:'other-group',groupId:'group',evidence:[{...ev,groupId:'unrelated-group'}]},true),/another Page or Group/);
  await assert.rejects(()=>f.weekly.prepare({...prep,slotId:'group-image',groupId:'group',format:'image'},true),/original text only/);
});
test('uncertain original draft save never retries and leaves an unrelated weekly slot eligible',async t=>{
  const f=fixture(t),a=await f.weekly.prepare(prep,true);save(f,a.taskId,content);f.controls.loseDraft=true;await assert.rejects(()=>f.weekly.persist({jobId:a.jobId}));assert.equal(f.writes(),1);
  await assert.rejects(()=>f.weekly.persist({planId:prep.planId,slotId:prep.slotId}),/never repeat/);assert.equal(f.writes(),1);
  assert.match(f.weekly.status({planId:prep.planId,slotIds:[prep.slotId]}).tasks[0].hold!,/uncertain_requires_reconciliation/);
  const other=await f.weekly.prepare({...prep,slotId:'independent-slot',topic:'Another independent original question'},true);assert.equal(other.status,'ready');assert.equal(f.store.workCount(),2);
});
test('missed windows and source expiry hold original work without another generation or catch-up task',async t=>{
  const f=fixture(t);await assert.rejects(()=>f.weekly.prepare({...prep,scheduledAt:'2026-11-10T02:00:00Z'},true),/no catch-up/);assert.equal(f.store.workCount(),0);
  const a=await f.weekly.prepare(prep,true);save(f,a.taskId,content);const resumed=new WeeklyContent(f.store,f.weekly.scc,()=>new Date('2026-11-14T03:00:00Z'));await assert.rejects(()=>resumed.persist({jobId:a.jobId}),/stale/);assert.equal(f.writes(),0);assert.equal(f.store.workCount(),1);
});
test('expired queued weekly evidence consumes no executor or invocation and remains a named hold',async t=>{
  const f=fixture(t),a=await f.weekly.prepare(prep,true);let probes=0;class Never extends CommandExecutors{override async detect():Promise<any>{probes++;throw Error('Expired evidence must be fenced before executor probing');}}
  configureRunner(f.store,{enabled:true,cooldownSeconds:0,executors:[{id:'fixture',adapter:'json',command:process.execPath,isolationReviewed:true,kinds:['text_post']}]},true);const clock=()=>new Date('2026-11-14T03:00:00Z');await new AgentRunner(f.store,f.dir,new Never(f.dir),clock).tick();assert.equal(probes,0);assert.equal(f.store.runnerSessions().length,0);const status=new WeeklyContent(f.store,f.weekly.scc,clock).status({taskIds:[a.taskId]});assert.equal(status.tasks[0].hold,'weekly_evidence_stale_or_invalid');assert.equal(f.store.getWork(a.taskId)!.status,'ready');
});
test('prepared weekly copy cannot invent sources, refresh observation dates, or promote audience opinions into verified factual claims',async t=>{
  const f=fixture(t),a=await f.weekly.prepare(prep,true);save(f,a.taskId,{...content,research:{...content.research,sources:[{url:'https://invented.example.com/source',title:'Invented',accessedAt:now.toISOString()}]}});await assert.rejects(()=>f.weekly.persist({jobId:a.jobId}),/invent source/);assert.equal(f.writes(),0);
  const task=f.store.getWork(a.taskId)!;f.store.saveWork({...task,revision:task.revision+1,result:JSON.stringify({...content,research:{...content.research,observedAt:'2026-11-10T03:00:30Z'}})});await assert.rejects(()=>f.weekly.persist({jobId:a.jobId}),/cannot be renewed/);
  f.store.saveWork({...task,revision:task.revision+2,result:JSON.stringify({...content,claims:[{claim:'A factual technical assertion',sourceUrls:[ev.sourceRef]}]})});await assert.rejects(()=>f.weekly.persist({jobId:a.jobId}),/verified-fact evidence/);assert.equal(f.writes(),0);
});
test('typed analysis preserves traceability and rejects invented evidence, cross-Page routing, and fabricated schema fields',async t=>{
  const f=fixture(t),a=await f.weekly.analyze({id:'analysis-1',planId:prep.planId,revision:1,accountId:'page',graphId:'123',evidence:[ev],brief:'Suggest a useful original post',editorialRules:prep.editorialRules});
  const good={version:'weekly-analysis-result.v1',ideas:[{accountId:'page',topic:'Worktree isolation',intendedAudience:'Developers',evidenceIds:[ev.id],interestReason:'Addresses one observed practical question',originalContribution:'Clear original minimal example',recommendedFormat:'text',formatReason:'No action demonstration is needed',factualRequirements:['Official Git documentation'],confidence:'low',limitations:['One question is a small sample']}],limitations:['No audience trend is established']};
  assert.throws(()=>weeklyAnalysisResultSchema.parse({...good,verifiedReactions:100}));save(f,a.taskId,good);assert.equal(f.weekly.analysisResult(a.taskId).ideas[0].evidenceIds[0],ev.id);const task=f.store.getWork(a.taskId)!;
  f.store.saveWork({...task,revision:task.revision+1,result:JSON.stringify({...good,ideas:[{...good.ideas[0],evidenceIds:['invented']}]})});assert.throws(()=>f.weekly.analysisResult(a.taskId),/unknown evidence/);
  f.store.saveWork({...task,revision:task.revision+2,result:JSON.stringify({...good,ideas:[{...good.ideas[0],accountId:'other-page'}]})});assert.throws(()=>f.weekly.analysisResult(a.taskId),/another destination/);
});
test('V1.1 explicit image weeks retain exact concepts, prior reservations and expiry without renewing an old grant',async t=>{
  const f=fixture(t),file=path.join(f.dir,'agent.db'),week=new WeeklyContent(f.store,f.weekly.scc,()=>now,file);
  const a=await week.prepare({...prep,format:'image'},true);save(f,a.taskId,{...content,imageBrief:{description:'Original diagram',aspectRatio:'4:5',altText:'Independent worktrees',legibility:'Readable',consistency:'Same repository',disclosure:''}});await week.persist({jobId:a.jobId});
  const review=week.imageReview({planId:prep.planId,slotIds:[prep.slotId]}),input={id:'explicit-week-1',planId:prep.planId,slotIds:[prep.slotId],expectedHash:review.reviewHash,startsAt:now.toISOString(),expiresAt:'2026-11-12T03:00:00Z',maxTotalImages:1,maxImagesPer24Hours:1,maxPendingItems:1};
  await assert.rejects(()=>week.authorizeImages(input),/budget approval/);assert.equal(f.store.getJob('weekly-images:explicit-week-1'),null);
  const grant=await week.authorizeImages(input,true),oldHash=f.store.getJob(grant.grantId)!.inputHash;await week.authorizeImages(input,true);assert.equal(grant.generationSubmitted,false);assert.equal(f.store.listWork(100).filter(w=>w.kind==='opening_image').length,0);
  assert.equal((await new PageContentImages(week.pages,file,()=>now).advance()).state,'image_request_queued');const original=f.store.listWork(100).find(w=>w.kind==='opening_image')!;assert.ok(original);assert.equal(weeklyImageAdmission(f.store,f.store.getJob('page-images:'+a.taskId)!.input as any,+now),false);
  await assert.rejects(()=>week.authorizeImages({...input,expiresAt:'2026-11-13T03:00:00Z'},true),/immutable/);
  f.store.saveWork({...original,status:'blocked',revision:original.revision+1,result:{fixtureFailure:'quota_or_unknown_result_retained'}});
  const next=new Date('2026-11-17T03:00:00Z'),week2=new WeeklyContent(f.store,f.weekly.scc,()=>next,file),p2={...prep,planId:'week-2',slotId:'image-2',format:'image' as const,scheduledAt:'2026-11-18T05:00:00Z',evidence:[{...ev,observedAt:next.toISOString(),validUntil:'2026-11-20T03:00:00Z'}]};
  const second=await week2.prepare(p2,true);save(f,second.taskId,{...content,title:'Different selected concept',text:'A different original comparison for the explicitly selected second week.',research:{...content.research,observedAt:next.toISOString(),sources:[{url:ev.sourceRef,title:'Next actual fixture observation',accessedAt:next.toISOString()}]},imageBrief:{description:'Another original diagram',aspectRatio:'4:5',altText:'Original comparison',legibility:'Readable',consistency:'Consistent subjects',disclosure:''}});await week2.persist({jobId:second.jobId});
  const r2=week2.imageReview({planId:p2.planId,slotIds:[p2.slotId]}),g2=await week2.authorizeImages({...input,id:'explicit-week-2',planId:p2.planId,slotIds:[p2.slotId],expectedHash:r2.reviewHash,startsAt:next.toISOString(),expiresAt:'2026-11-19T03:00:00Z'},true);
  assert.notEqual(g2.grantId,grant.grantId);assert.equal(f.store.getJob(grant.grantId)!.inputHash,oldHash);assert.ok(f.store.getWork(original.id));assert.equal((await new PageContentImages(week2.pages,file,()=>next).advance()).state,'image_request_queued');assert.equal(f.store.listWork(100).filter(w=>w.kind==='opening_image').length,2);assert.equal(f.store.getJob('page-images:'+a.taskId)!.state.phase,'expired_original_recovery_hold');assert.equal(f.writes(),0);
  const changed=f.store.getWork(second.taskId)!;f.store.saveWork({...changed,revision:changed.revision+1,result:JSON.stringify({...JSON.parse(changed.result),text:'Materially changed original concept'})});await new PageContentImages(week2.pages,file,()=>next).advance();assert.equal(f.store.getJob('page-images:'+second.taskId)!.state.phase,'changed_concept_hold');assert.equal(f.store.listWork(100).filter(w=>w.kind==='opening_image').length,2);
});
test('V1.1 exact weekly Reel concept enters the real existing production queue once with no provider submission',async t=>{
  const f=fixture(t),pipeline=new PipelineAdapter(new JsonClient('http://127.0.0.1:13998',{fetch:async()=>{throw Error('No provider calls allowed');}}));
  const production=new GeminiProduction(f.store,pipeline,f.weekly.scc,{scc:f.client.origin,pipeline:'http://127.0.0.1:13998'},f.dir,()=>now,()=>2**40);
  const weekly=new WeeklyContent(f.store,f.weekly.scc,()=>now,undefined,()=>production);
  const task=await weekly.prepare({...prep,format:'reel'},true);save(f,task.taskId,{version:'gemini-concept.v1',fictional:true,accountId:'page',title:'Selected original Reel',idea:'The selected original action',hook:'An object moves',development:'The action becomes clear',payoff:'The action completes',category:'visual_comedy',languageStrategy:{spokenLanguage:'none',dialogue:'',intendedAudience:'Visual comedy viewers',rationale:'No speech needed; audience fit remains a hypothesis.',evidenceBasis:'hypothesis',findingIds:[],captionLanguages:['th'],hashtagLanguages:[]}});
  const first=await weekly.admitVideo({planId:prep.planId,slotId:prep.slotId}),second=await weekly.admitVideo({planId:prep.planId,slotId:prep.slotId});assert.equal(second.itemId,first.itemId);assert.equal(production.status().backlog.length,1);assert.equal(first.generationSubmitted,false);assert.equal(f.writes(),0);assert.equal(f.store.getOperation(first.itemId,'production_submit'),null);
});
test('analysis runs through existing runner with source-only instructions, normal usage accounting and no provider test calls',async t=>{
  const f=fixture(t);let invocations=0;
  class Offline extends CommandExecutors {
    override async detect(){return {id:'fixture',adapter:'json' as const,available:true,reason:'offline fixture'};}
    override async execute(_c:any,_cap:any,context:string):Promise<any>{invocations++;const parsed=JSON.parse(context);assert.match(parsed.instructions,/untrusted research data/);assert.match(parsed.instructions,/not a trend/);assert.deepEqual(parsed.knowledge,[]);assert.equal(parsed.task.payload.weeklyAnalysis.evidence[0].sourceRef,ev.sourceRef);return {result:{version:'agent-result.v1',status:'blocked',result:'Additional primary-source context needed',lessons:[]},usage:{tokens:7,source:'offline_fixture'}};}
  }
  configureRunner(f.store,{enabled:true,cooldownSeconds:0,executors:[{id:'fixture',adapter:'json',command:process.execPath,isolationReviewed:true,kinds:['audience_research']}]},true);
  const a=await f.weekly.analyze({id:'runner-analysis',planId:'week',revision:1,accountId:'page',graphId:'123',evidence:[ev],brief:'Analyze one small case',editorialRules:prep.editorialRules});const runner=new AgentRunner(f.store,f.dir,new Offline(f.dir),()=>now);await runner.tick();assert.equal(invocations,1);assert.equal(f.store.getWork(a.taskId)!.status,'blocked');assert.equal(f.store.runnerSessions()[0].usage.tokens,7);assert.equal(f.writes(),0);
});


test('oversized legacy weekly Page envelope resumes the original unqueued intent under the unchanged cap',async t=>{
  const f=fixture(t),p={...prep,format:'image_caption' as const,topic:'PromptPay infographic',brief:'\u0e01'.repeat(1400),editorialRules:JSON.stringify({persona:KNOWN_PERSONAS.rai,globalRelationshipRules:GLOBAL_RELATIONSHIP_RULES,voice:{language:'Thai',tone:'Objective, modest peer'},restrictions:['Keep owner-attested facts qualified; no publication.']}),evidence:[{...ev,kind:'verified_fact',summary:'\u0e02'.repeat(650),limitations:'\u0e04'.repeat(500),provenance:'owner_attested_fact_not_independently_verified',independentlyVerified:false,verificationNote:'Owner supplied; not independently fetched.'}]};
  const suffix=stableHash({origin:f.client.origin,planId:p.planId,slotId:p.slotId}).slice(0,32),jobId='weekly-preparation:'+suffix,taskId='weekly-content-'+suffix,{revision,...binding}=p;
  f.store.createJob(jobId,{...p,origin:f.client.origin,identityHash:stableHash(binding),taskId});const original=f.store.getJob(jobId)!,beforeHash=original.inputHash;
  assert.throws(()=>f.weekly.imageReview({planId:p.planId,slotIds:[p.slotId]}),/not queued; resume the original handoff/);
  const r=await f.weekly.prepare(p,true),task=f.store.getWork(taskId)!,context=pageContentTaskContext(task),bytes=Buffer.byteLength(JSON.stringify(context));
  assert.equal(r.taskId,taskId);assert.equal(r.jobId,jobId);assert(bytes<=16000);assert(Buffer.byteLength(JSON.stringify({...context,instructions:pageContentInstructions}))+1000>16000);
  assert.equal(f.store.getJob(jobId)!.inputHash,beforeHash);assert.deepEqual(f.store.getJob(jobId)!.input,original.input);assert.deepEqual(task.payload.pageContent.weeklyResearch.evidence,p.evidence);assert.equal(task.payload.pageContent.request.brief,p.topic+'\n'+p.brief);assert.equal(task.payload.pageContent.request.editorialRules,p.editorialRules);assert.deepEqual(task.payload.pageContent.page.rules,['Public persona stays modest; internal analysis may be detailed.',...assistantRules]);
  assert.match(context.instructions,/independentlyVerified:false remains owner-attested/);assert.match(context.instructions,/No tools/);assert.match(context.instructions,/separate image authorization/);assert.equal(context.instructions,weeklyPageContentInstructions);
  let calls=0;class Fixture extends CommandExecutors {override async detect(){return {id:'fixture',adapter:'json' as const,available:true,reason:'offline fixture'};}override async execute(_c:any,_cap:any,input:string):Promise<any>{calls++;assert.equal(input,JSON.stringify(context));assert(Buffer.byteLength(input)<=16000);return {result:{version:'agent-result.v1',status:'prepared',result:JSON.stringify({...content,editorialCategory:'visual_explainer',imageBrief:{description:'ISOLATED FIXTURE, NOT REAL REVIEWED CONTENT',aspectRatio:'4:5',altText:'Fixture',legibility:'Readable',consistency:'Consistent',disclosure:''}}),lessons:[]},usage:{tokens:1,source:'offline_fixture'}};}}
  configureRunner(f.store,{enabled:true,cooldownSeconds:0,maxContextBytes:16000,executors:[{id:'fixture',adapter:'json',command:process.execPath,isolationReviewed:true,kinds:['image_post']}]},true);
  const runner=()=>new AgentRunner(f.store,f.dir,new Fixture(f.dir),()=>now);assert.equal((await runner().tick()).launched,1);
  const restarted=new WeeklyContent(f.store,new SccAdapter(f.client),()=>now),again=await restarted.prepare(p,true);assert.equal(again.taskId,taskId);assert.equal(again.reused,true);await runner().tick();assert.equal(calls,1);assert.equal(f.store.workCount(),1);assert.equal(f.store.runnerSessions({taskId}).length,1);
  const review=restarted.imageReview({planId:p.planId,slotIds:[p.slotId]});assert.equal(review.concepts[0].taskId,taskId);assert.equal(review.generationSubmitted,false);assert.equal(f.store.getJob('page-images:'+taskId),null);assert.equal(f.store.runnerState('page-image.scopes'),null);assert.equal(f.writes(),0);
});

test('mandatory weekly Page evidence over budget remains unqueued; diagnostics never create or replace originals',async t=>{
  const f=fixture(t),p={...prep,format:'image' as const,editorialRules:'Mandatory rule '.repeat(800)};
  await assert.rejects(()=>f.weekly.prepare(p,true),/Preparation context exceeds configured input budget \(\d+\/16000 bytes\)/);
  const j=f.store.listJobs(10)[0],hash=j.inputHash;assert.equal(f.store.workCount(),0);assert.throws(()=>f.weekly.imageReview({planId:p.planId,slotIds:[p.slotId]}),/not queued/);assert.equal(f.store.getJob(j.id)!.inputHash,hash);
  await assert.rejects(()=>f.weekly.prepare({...p,brief:'different'},true),/immutable/);assert.equal(f.store.runnerSessions().length,0);assert.equal(f.writes(),0);
  const late=new WeeklyContent(f.store,new SccAdapter(f.client),()=>new Date('2026-11-12T00:00:00Z'));await assert.rejects(()=>late.prepare(p,true),/no catch-up/);assert.equal(f.store.workCount(),0);
});

test('a missing historical noncanonical task ID fails closed instead of creating a deterministic replacement',async t=>{
  const f=fixture(t),{revision,...binding}=prep,suffix=stableHash({origin:f.client.origin,planId:prep.planId,slotId:prep.slotId}).slice(0,32),id='weekly-preparation:'+suffix;
  f.store.createJob(id,{...prep,origin:f.client.origin,identityHash:stableHash(binding),taskId:'historical-original-task'});const original=f.store.getJob(id)!;
  await assert.rejects(()=>f.weekly.prepare(prep,true),/Original weekly task identity differs/);assert.deepEqual(f.store.getJob(id),original);assert.equal(f.store.workCount(),0);assert.equal(f.client.requestCount,0);
});


test('runner refuses an irreducible saved Page envelope before any executor probe or charged claim',async t=>{
  const f=fixture(t),r=await f.weekly.prepare({...prep,format:'image'},true),original=f.store.getWork(r.taskId)!;
  // Historical task fixture: retain an over-budget mandatory payload as saved work.
  f.store.saveWork({...original,revision:original.revision+1,payload:{pageContent:{...original.payload.pageContent,request:{...original.payload.pageContent.request,editorialRules:'Mandatory '.repeat(3000)}}}});
  const hash=stableHash(f.store.getWork(r.taskId)!.payload);let probes=0;
  class Never extends CommandExecutors {override async detect():Promise<any>{probes++;throw Error('Must not probe');}override async execute():Promise<any>{throw Error('Must not invoke');}}
  configureRunner(f.store,{enabled:true,cooldownSeconds:0,maxContextBytes:16000,executors:[{id:'fixture',adapter:'json',command:process.execPath,isolationReviewed:true,kinds:['image_post']}]},true);
  const runner=new AgentRunner(f.store,f.dir,new Never(f.dir),()=>now);assert.equal((await runner.tick()).state,'context_limit');assert.equal(probes,0);assert.equal(f.store.runnerSessions().length,0);assert.equal(stableHash(f.store.getWork(r.taskId)!.payload),hash);assert.equal(runner.status().budget.invocations,0);
});


test('audited missed-slot reschedule retains original input/task identity, is idempotent and survives restart without a new grant',async t=>{
 const f=fixture(t),r=await f.weekly.prepare(prep,true),j=f.store.getJob(r.jobId)!,hash=j.inputHash,late=()=>new Date('2026-11-12T03:00:00Z'),w=new WeeklyContent(f.store,new SccAdapter(f.client),late);
 const request={planId:prep.planId,slotId:prep.slotId,previousScheduledAt:prep.scheduledAt,scheduledAt:'2026-11-12T05:00:00Z',notes:'ISOLATED owner-reviewed time only',confirmReview:true};
 assert.equal((await w.resume({planId:prep.planId,slotId:prep.slotId},true)).hold,'weekly_preparation_window_missed');await assert.rejects(()=>w.reschedule(request),/owner-reviewed/);const receipt=await w.reschedule(request,true);assert.equal((await w.reschedule(request,true)).rescheduleId,receipt.rescheduleId);assert.equal(f.store.getJob(r.jobId)!.inputHash,hash);
 const resumed=await w.resume({planId:prep.planId,slotId:prep.slotId},true);assert.equal(resumed.taskId,r.taskId);assert.equal(resumed.hold,null);assert.equal(f.store.getWork(r.taskId)!.payload.pageContent.weeklyResearch.scheduledAt,prep.scheduledAt);assert.equal(f.store.workCount(),1);assert.equal(f.store.getJob('page-images:'+r.taskId),null);
 const peer=new AgentStore(path.join(f.dir,'agent.db'));try{assert.equal((await new WeeklyContent(peer,new SccAdapter(f.client),late).resume({planId:prep.planId,slotId:prep.slotId},true)).taskId,r.taskId);}finally{peer.close();}
 save(f,r.taskId,content);await assert.rejects(()=>w.reschedule({...request,previousScheduledAt:request.scheduledAt,scheduledAt:'2026-11-12T06:00:00Z'},true),/protected/);
});

test('weekly model factoring retains complete evidence, persona prohibitions and instructions without changing stored input',()=>{
 const evidence=[{...ev,summary:'Exact source paragraph '.repeat(50),independentlyVerified:false}],voice={revision:2,profile:{tone:'Precise and modest',prohibitedPhrases:['Never invent personal experience'],approvedFacts:['Owner-supplied fact'],approvedExamples:[]}},rules={voice,globalRelationshipRules:GLOBAL_RELATIONSHIP_RULES},raw={version:'agent-task.v1',task:{id:'original',kind:'group_post',payload:{content:{weeklyResearch:{evidence},research:evidence,page:{account:{id:'page',graphId:'123',name:'Original',capabilities:{canPublish:true}},voice,rules:[JSON.stringify(rules)]},output:'{title,text,hashtags,groupRevision,rulesHash,relevance,compliance}'}}},knowledge:[],generation:null,instructions:'No authority'};
 const before=stableHash(raw),selected=selectWeeklyContext(raw,16000),restored=expandWeeklyContext(JSON.parse(selected.text));assert.equal(stableHash(raw),before);assert.deepEqual(restored.content.weeklyResearch.evidence,evidence);assert.deepEqual(restored.content.page.rules,[rules]);assert.deepEqual(restored.content.page.voice.profile.prohibitedPhrases,voice.profile.prohibitedPhrases);assert.equal(restored.content.page.account.id,'page');assert(selected.admission.selectedBytes<selected.admission.rawBytes);assert.match(JSON.parse(selected.text).instructions,/No tools/);
 const tooBig=structuredClone(raw);tooBig.task.payload.content.weeklyResearch.evidence[0].summary='Unique mandatory '.repeat(2000);tooBig.task.payload.content.research=[];assert.throws(()=>selectWeeklyContext(tooBig,16000),WeeklyContextLimit);
});


test('exact image admission honors an audited original preparation time without rewriting its historical snapshot or caps',async t=>{
 const f=fixture(t),p={...prep,format:'image' as const},r=await f.weekly.prepare(p,true),clock=()=>new Date('2026-11-12T03:00:00Z'),file=path.join(f.dir,'agent.db'),w=new WeeklyContent(f.store,new SccAdapter(f.client),clock,file),before=f.store.getJob(r.jobId)!.inputHash;
 await w.reschedule({planId:p.planId,slotId:p.slotId,previousScheduledAt:p.scheduledAt,scheduledAt:'2026-11-12T05:00:00Z',notes:'ISOLATED reviewed future preparation',confirmReview:true},true);save(f,r.taskId,{...content,imageBrief:{description:'NOT AI fixture diagram',aspectRatio:'4:5',altText:'Fixture',legibility:'Pending review',consistency:'Same subject',disclosure:'NOT AI'}});await w.persist({jobId:r.jobId});const reviewed=w.imageReview({planId:p.planId,slotIds:[p.slotId]});await w.authorizeImages({id:'isolated-reviewed-time',planId:p.planId,slotIds:[p.slotId],expectedHash:reviewed.reviewHash,startsAt:clock().toISOString(),expiresAt:'2026-11-13T02:00:00Z',maxTotalImages:1,maxImagesPer24Hours:1,maxPendingItems:1},true);assert.equal((await new PageContentImages(w.pages,file,clock).advance()).state,'image_request_queued');assert.equal(f.store.getWork(r.taskId)!.payload.pageContent.weeklyResearch.scheduledAt,p.scheduledAt);assert.equal(f.store.getJob(r.jobId)!.inputHash,before);assert.equal(f.writes(),0);
});


test('exact weekly image brief authority remains inside global Page preparation controls',async t=>{
 const f=fixture(t),r=await f.weekly.prepare({...prep,format:'image'},true);
 const config={enabled:true,entries:[{accountId:'page',graphId:'123',formats:['text']}],expiresAt:null};
 f.store.setRunnerState('page-content.config',config);
 assert.equal(f.weekly.status({taskIds:[r.taskId]}).tasks[0].hold,null);
 const {explicitWeeklyPreparation}=await import('../scripts/agent/weekly-original.js');
 const task=f.store.getWork(r.taskId)!;assert.equal(explicitWeeklyPreparation(f.store,task),true);
 assert.equal(explicitWeeklyPreparation(f.store,{...task,id:'another'}),false);
 const changed=structuredClone(task);changed.payload.pageContent.request.brief+=' changed';assert.equal(explicitWeeklyPreparation(f.store,changed),false);
 f.store.setRunnerState('page-content.config',{...config,enabled:false});assert.equal(f.weekly.status({taskIds:[r.taskId]}).tasks[0].hold,'existing_page_preparation_configuration_hold');
 f.store.setRunnerState('page-content.config',{...config,entries:[{accountId:'other',graphId:'123',formats:['text']}]});assert.equal(f.weekly.status({taskIds:[r.taskId]}).tasks[0].hold,'existing_page_preparation_configuration_hold');
 assert.equal(f.store.getJob('page-images:'+r.taskId),null);assert.equal(f.store.runnerSessions().length,0);
 f.store.setRunnerState('page-content.config',config);
 let calls=0;class Fixture extends CommandExecutors {override async detect(){return {id:'fixture',adapter:'json' as const,available:true,reason:'offline fixture'};}override async execute():Promise<any>{calls++;return {result:{version:'agent-result.v1',status:'blocked',result:'ISOLATED admission proof',lessons:[]},usage:{tokens:1,source:'offline_fixture'}};}}
 configureRunner(f.store,{enabled:true,cooldownSeconds:0,executors:[{id:'fixture',adapter:'json',command:process.execPath,isolationReviewed:true,kinds:['image_post']}]},true);
 assert.equal((await new AgentRunner(f.store,f.dir,new Fixture(f.dir),()=>now).tick()).launched,1);assert.equal(calls,1);
 assert.equal(f.store.getJob('page-images:'+r.taskId),null);
});
