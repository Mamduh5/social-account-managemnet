import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {AgentStore} from '../scripts/agent/store.js';
import {WeeklyContent,weeklyAnalysisResultSchema,weeklyAnalysisInstructions} from '../scripts/agent/weekly-content.js';
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
    if(u.pathname==='/api/groups')return Response.json({groups:[group]});if(u.pathname==='/api/groups/group/review')return Response.json({group});if(u.pathname==='/api/analytics/videos')return Response.json({videos:[]});
    if(u.pathname==='/api/publishing/drafts'&&init?.method==='POST'){writes++;const body=JSON.parse(String(init.body));if(controls.loseDraft)throw Error('Lost response after draft save');return Response.json({draft:{...body,id:'draft-1',revision:1,status:'draft',approvedRevision:null,queuedPostId:null}});}
    if(u.pathname==='/api/groups/group/prepared'&&init?.method==='POST'){writes++;const body=JSON.parse(String(init.body));return Response.json({prepared:{id:'group-prepared',group_id:group.id,kind:'post',content:body.content,status:'prepared',handoffContext:{group:{revision:group.revision}}}});}
    throw Error('No provider, approval, queue or unexpected request allowed: '+u.pathname);
  }});
  const weekly=new WeeklyContent(store,new SccAdapter(client),()=>now);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});return {dir,store,weekly,client,controls,group,writes:()=>writes};
}
function save(f:ReturnType<typeof fixture>,id:string,result:any){const c=f.weekly.work.claim(id,{owner:'offline-fixture',commandId:'claim:'+id}).task;f.weekly.work.save({id,owner:c.owner,claimToken:c.claimToken,revision:c.revision,commandId:'save:'+id,status:'prepared',result:JSON.stringify(result)});}
const content={version:'page-content-result.v1',title:'Worktree question',text:'A concise original question about isolated worktrees.',hashtags:'',language:'Thai',intendedAudience:'Developers',rationale:'One useful practical question',originality:'Original explanation, no copied comments',research:{observedAt:now.toISOString(),sources:[{url:ev.sourceRef,title:'Observed discussion',accessedAt:now.toISOString()}],summary:'Single observed question',limitations:'Not a general trend',creatorExamples:[]},claims:[],imageBrief:null};

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
  let invoked=0;class Admit extends CommandExecutors {override async detect(){return {id:'fixture',adapter:'json' as const,available:true,reason:'offline fixture'};}override async execute(_c:any,_cap:any,context:string):Promise<any>{invoked++;assert.ok(Buffer.byteLength(context)<=16000);assert.equal(JSON.parse(context).task.payload.weeklyAnalysis.editorialRules,editorialRules);return {result:{version:'agent-result.v1',status:'blocked',result:'Offline budget acceptance only',lessons:[]},usage:{tokens:1,source:'offline_fixture'}};}}
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
