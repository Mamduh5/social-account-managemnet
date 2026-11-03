import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {AgentStore} from '../scripts/agent/store.js';
import {AgentContent,groupRulesHash,groupSuitable} from '../scripts/agent/content.js';
import {AgentResearch} from '../scripts/agent/research.js';
import {SccAdapter} from '../scripts/agent/scc.js';
import {JsonClient} from '../scripts/agent/http.js';
import {AgentRunner} from '../scripts/agent/runner.js';
import {configureRunner,defaultRunnerConfig,type ExecutorConfig} from '../scripts/agent/runner-config.js';
import {CommandExecutors,type ExecutionResult,type ExecutorCapability} from '../scripts/agent/executors.js';

function fixture(t:{after:(f:()=>void)=>void}){
  const dir=mkdtempSync(path.join(tmpdir(),'scc-content-test-runs-')),filename=path.join(dir,'agent.db'),store=new AgentStore(filename),opened=[store];
  let now=new Date('2026-11-03T04:00:00Z');const clock=()=>new Date(now);
  const calls:Array<{method:string;path:string;body:any}>=[],drafts=new Map<string,any>(),packages=new Map<string,any>();
  const page:any={account:{id:'page-a',name:'Thai educational Page'},voice:{revision:1,profile:{language:'Thai',editorialPurpose:'Useful explanations',provisional:true}},rules:['Use sourced facts; no invented experiences'],contextFingerprint:'page-context-1',media:{images:[{id:'im-a',name:'Supplied diagram',width:64,height:48}],videos:[{id:'vid-a',title:'Existing fixture',duration:10,width:720,height:1280}]}};
  const group:any={id:'group-a',name:'Local learning',url:'https://www.facebook.com/groups/fixture/',identity_type:'page',account_id:'page-a',membership:'member',rules:'Educational posts only. No promotion or external links.',rules_reviewed_at:'2026-11-01',reviewedAt:'2026-11-01',revision:2,eligibility:{pagesCanJoin:'yes',promotionalRestrictions:'No promotion',participationApproval:'not_required',postModeration:'required'},readiness:{state:'reviewed_for_manual_handoff'},archivedAt:null};
  const controls={loseDraft:false,loseGroup:false,offlineOptional:false};
  const fetcher:typeof fetch=async(input,init)=>{
    const u=new URL(String(input));assert.equal(u.origin,'http://127.0.0.1:13999','fixture cannot reach owner or providers');
    const method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):null;
    calls.push({method,path:u.pathname,body});assert.doesNotMatch(u.pathname,/approve|queue|generate|flow|recover/);
    if(u.pathname==='/api/operator/pages/page-a/context')return Response.json(page);
    if(u.pathname==='/api/analytics/videos')return controls.offlineOptional?Response.json({},{status:503}):Response.json({videos:[{destination_id:'observed',provenance_status:'confirmed',source:'manual',views:null,likes:0,comments:0}]});
    if(u.pathname==='/api/groups')return controls.offlineOptional?Response.json({},{status:503}):Response.json({groups:[group]});
    if(u.pathname==='/api/groups/group-a/review')return Response.json({group});
    if(u.pathname==='/api/publishing/drafts'&&method==='POST'){
      const draft={...body,id:'draft-'+drafts.size,revision:1,status:'draft',approvedRevision:null,queuedPostId:null};drafts.set(draft.id,draft);
      if(controls.loseDraft)throw new Error('Response lost after saving');return Response.json({draft});
    }
    if(u.pathname.startsWith('/api/publishing/drafts/')&&method==='GET')return Response.json({draft:drafts.get(u.pathname.split('/').at(-1)!)});
    if(u.pathname==='/api/groups/group-a/prepared'&&method==='POST'){
      const p={id:'prepared-'+packages.size,group_id:group.id,kind:'post',content:body.content,status:'prepared',handoffContext:{group:{...group,revision:group.revision},sourcePage:{id:body.sourcePageId},relevance:body.relevance,reminderAt:null}};
      packages.set(p.id,{prepared:p,group:p.handoffContext.group,sourcePage:p.handoffContext.sourcePage,relevance:body.relevance,reminderAt:null});
      if(controls.loseGroup)throw new Error('Response lost after Group save');return Response.json({prepared:p});
    }
    if(u.pathname.startsWith('/api/groups/prepared/')&&u.pathname.endsWith('/package'))return Response.json(packages.get(u.pathname.split('/')[4]));
    throw new Error('Unexpected fixture request '+u.pathname);
  };
  const scc=new SccAdapter(new JsonClient('http://127.0.0.1:13999',{fetch:fetcher})),content=new AgentContent(store,scc,clock);
  const prepare=(id:string,result:any)=>{
    const claimed=content.work.claim(id,{owner:'fixture-agent',commandId:'claim:'+id}).task;
    content.work.save({id,owner:claimed.owner,commandId:'save:'+id,claimToken:claimed.claimToken,revision:claimed.revision,status:'prepared',result});
  };
  t.after(()=>{for(const s of opened)try{s.close();}catch{}rmSync(dir,{recursive:true,force:true});});
  return {dir,filename,store,content,scc,page,group,calls,controls,drafts,packages,clock,prepare,advance:(ms:number)=>{now=new Date(now.getTime()+ms);},restart:()=>{const s=new AgentStore(filename);opened.push(s);return new AgentContent(s,scc,clock);}};
}
const result={title:'A useful explanation',text:'คำอธิบายจากหลักฐานที่ให้มา',hashtags:'#เรียนรู้'};
const finding={topic:'Learning',summary:'A dated source observation; not evidence of popularity.',observedAt:'2026-11-03T03:00:00Z',validUntil:'2026-11-04T03:00:00Z',sources:[{url:'https://example.com/research',title:'Supplied source',accessedAt:'2026-11-03T03:00:00Z'}],uncertainty:'One source and no measured audience performance.'};

test('resource-based format selection falls back to text with no image, video, fresh research or eligible Group',async t=>{
  const f=fixture(t);f.page.media={images:[],videos:[]};f.group.eligibility.pagesCanJoin='no';
  const selected=await f.content.enqueue('page-a',{topic:'Useful topic',formats:['existing_video','image','group','research','text','gemini_video']});
  assert.equal(f.store.getWork(selected.tasks[0].id)!.kind,'text_post');assert.equal(selected.skipped.length,4);assert.equal(selected.automaticGeneration,false);
  const cache=await f.content.context('page-a');assert.equal(cache.cached,true);assert.equal(f.calls.length,3);
});
test('all six preparation formats are selectable without generation or media-inspection claims',async t=>{
  const f=fixture(t);f.content.research.save(finding,'page-a');
  for(const format of ['existing_video','image','text','group','research','gemini_video']){
    const selected=await f.content.enqueue('page-a',{topic:'Learning',formats:[format]});assert.equal(selected.tasks.length,1,format);
    const task=f.store.getWork(selected.tasks[0].id)!;assert.equal(task.payload.content.format,format);assert.equal(task.waitForRunId,undefined);
    assert.match(task.payload.content.restrictions.join(' '),/No invented statistics/);
  }
  assert.equal(f.calls.length,3);assert.equal(f.calls.some(c=>c.method==='POST'),false);
});
test('same topic and format deduplicate across agents, respect backlog cap, and reject changed briefs',async t=>{
  const f=fixture(t);configureRunner(f.store,{maxBacklog:1});
  const a=await f.content.enqueue('page-a',{topic:' My   Topic ',formats:['text']});
  const b=await f.restart().enqueue('page-a',{topic:'my topic',formats:['text']});assert.equal(a.tasks[0].id,b.tasks[0].id);assert.equal(f.store.workCount(),1);
  await assert.rejects(f.content.enqueue('page-a',{topic:'my topic',brief:'Changed',formats:['text']}),/different brief/);
  await assert.rejects(f.content.enqueue('page-a',{topic:'Different topic',formats:['text']}),/backlog limit/);
});
test('Gemini recovery hold stays untouched while runner selects independent text and persists it once',async t=>{
  const f=fixture(t);f.store.createJob('original',{title:'Unresolved original'});f.store.recordGeneration('original',{condition:'recovery_required',checkedAt:f.clock().toISOString()});f.store.reserveProvider('gemini_web:fixture','original');
  f.content.work.add({id:'waiting-video',kind:'review_video',title:'Wait for actual clip',waitForRunId:'original',priority:100});
  const task=(await f.content.enqueue('page-a',{topic:'Fallback',formats:['gemini_video','text']})).tasks[0];
  class FixtureExecutor extends CommandExecutors {
    calls=0;
    override async detect(c:ExecutorConfig):Promise<ExecutorCapability>{return {id:c.id,adapter:c.adapter,available:true,reason:'fixture_only'};}
    override async execute(_c:any,_cap:any,context:string):Promise<ExecutionResult>{this.calls++;assert.equal(JSON.parse(context).task.kind,'text_post');return {result:{version:'agent-result.v1',status:'prepared',result:JSON.stringify(result),lessons:[]},usage:{tokens:1,source:'fixture'}};}
  }
  const executor=new FixtureExecutor(path.join(f.dir,'probe'));
  configureRunner(f.store,{...defaultRunnerConfig(),enabled:true,saveContentDrafts:true,cooldownSeconds:0},true);
  const runner=new AgentRunner(f.store,path.join(f.dir,'runner'),executor,f.clock,id=>f.content.persist(id));
  assert.equal((await runner.tick()).launched,1);assert.equal(executor.calls,1);assert.equal(f.drafts.size,1);assert.equal(f.store.providerOwner('gemini_web:fixture'),'original');
  assert.equal(f.store.getWork('waiting-video')!.status,'ready');assert.equal(f.store.getWork(task.id)!.preparation.draft.status,'draft');
  const saved=await f.restart().persist(task.id);assert.equal(saved.cached,true);assert.equal(f.drafts.size,1);
});
test('text, image and existing-video outputs save exact unscheduled unapproved SCC drafts',async t=>{
  const f=fixture(t);
  for(const [format,extra,type] of [['text',{},'text'],['image',{imageId:'im-a',altText:'Provided diagram'},'image'],['existing_video',{videoId:'vid-a'},'reel']] as const){
    const id=(await f.content.enqueue('page-a',{topic:'Prepare '+format,formats:[format]})).tasks[0].id;
    f.prepare(id,{...result,...extra});const saved=await f.content.persist(id),draft=saved.draft;
    assert.equal(draft.contentType,type);assert.equal(draft.scheduledAt,null);assert.equal(draft.approvedRevision,null);assert.equal(draft.queuedPostId,null);
  }
  assert.equal(f.drafts.size,3);assert.equal(f.store.listKnowledge({accountId:'page-a'}).length,3);
});
test('changed Page identity and unsupplied media fail before saving a draft',async t=>{
  const f=fixture(t),id=(await f.content.enqueue('page-a',{topic:'Image',formats:['image']})).tasks[0].id;
  f.prepare(id,{...result,imageId:'unknown'});await assert.rejects(f.content.persist(id),/existing supplied image/);assert.equal(f.drafts.size,0);
  f.page.contextFingerprint='changed';await assert.rejects(f.content.persist(id),/Page context changed/);assert.equal(f.drafts.size,0);
});
test('uncertain draft response cannot cause duplicate writes or model calls; known original is reconciled read-only',async t=>{
  const f=fixture(t),id=(await f.content.enqueue('page-a',{topic:'Lost response',formats:['text']})).tasks[0].id;f.prepare(id,result);f.controls.loseDraft=true;
  await assert.rejects(f.content.persist(id));await assert.rejects(f.restart().persist(id),/uncertain/);assert.equal(f.drafts.size,1);
  const saved=await f.content.reconcile(id,'draft-0');assert.equal(saved.draft.id,'draft-0');assert.equal((await f.content.persist(id)).cached,true);assert.equal(f.drafts.size,1);
});
test('two simultaneous agents share the preparation intent and create only one draft',async t=>{
  const f=fixture(t),id=(await f.content.enqueue('page-a',{topic:'Concurrent save',formats:['text']})).tasks[0].id;f.prepare(id,result);
  const settled=await Promise.allSettled([f.content.persist(id),f.restart().persist(id)]);assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.drafts.size,1);
});
test('Group-specific preparation binds restrictions and revision; changed rules and missing compliance block writes',async t=>{
  const f=fixture(t),id=(await f.content.enqueue('page-a',{topic:'Local lesson',formats:['group']})).tasks[0].id;
  f.prepare(id,{...result,groupRevision:2,rulesHash:groupRulesHash(f.group),relevance:'Local learning discussion',compliance:'Educational explanation with no promotion or external links.'});
  f.group.revision=3;await assert.rejects(f.content.persist(id),/Group rules/);assert.equal(f.packages.size,0);f.group.revision=2;
  const saved=await f.content.persist(id);assert.equal(saved.prepared.group_id,'group-a');assert.equal(saved.automaticPosting,false);assert.equal(f.packages.size,1);
  assert.equal(f.calls.filter(c=>c.method==='POST')[0].body.reminderAt,undefined);
});
test('known Group restrictions, cross-Page identity and missing reviews are ineligible; personal identity remains manual',()=>{
  const g:any={identity_type:'page',account_id:'a',membership:'member',rules:'No promotion',rules_reviewed_at:'2026-11-01',reviewedAt:'2026-11-01',readiness:{state:'reviewed_for_manual_handoff'},eligibility:{pagesCanJoin:'yes',participationApproval:'approved',postModeration:'required'}};
  assert.equal(groupSuitable(g,'a'),true);assert.equal(groupSuitable(g,'b'),false);
  for(const patch of [{membership:'not_member'},{rules:''},{reviewedAt:null},{archivedAt:'2026-11-02'},{eligibility:{...g.eligibility,pagesCanJoin:'no'}},{eligibility:{...g.eligibility,participationApproval:'restricted'}}])assert.equal(groupSuitable({...g,...patch},'a'),false);
  assert.equal(groupSuitable({...g,identity_type:'personal',account_id:null,readiness:{state:'needs_review'}},'a'),true);
});
test('Group lost-response recovery reads the original package and never posts again',async t=>{
  const f=fixture(t),id=(await f.content.enqueue('page-a',{topic:'Group loss',formats:['group']})).tasks[0].id;
  f.prepare(id,{...result,groupRevision:2,rulesHash:groupRulesHash(f.group),relevance:'Relevant lesson',compliance:'No links or promotion'});f.controls.loseGroup=true;
  await assert.rejects(f.content.persist(id));await assert.rejects(f.content.persist(id),/uncertain/);
  const saved=await f.restart().reconcile(id,'prepared-0');assert.equal(saved.prepared.id,'prepared-0');assert.equal(f.packages.size,1);
});
test('dated research survives another agent, reuses fresh sources, expires honestly and rejects unsupported claims metadata',t=>{
  const f=fixture(t),r=f.content.research;
  assert.equal(r.status('Learning','page-a').researchNeeded,true);
  const saved=r.save(finding,'page-a');assert.equal(r.save(finding,'page-a').id,saved.id);
  const merelyRechecked={...finding,observedAt:'2026-11-03T04:00:00Z',validUntil:'2026-11-04T04:00:00Z',sources:[{...finding.sources[0],accessedAt:'2026-11-03T04:00:00Z'}]};
  assert.equal(r.save(merelyRechecked,'page-a').id,saved.id,'timestamps alone cannot renew unchanged evidence');
  assert.equal(f.restart().research.status(' learning ','page-a').researchNeeded,false);
  assert.equal(r.status('Learning','page-b').researchNeeded,true);
  assert.throws(()=>r.save({...finding,uncertainty:''},'page-a'));
  assert.throws(()=>r.save({...finding,observedAt:'2099-01-01T00:00:00Z'},'page-a'));
  assert.throws(()=>r.save({...finding,views:999999},'page-a'));
  f.advance(2*86400000);assert.equal(new AgentResearch(f.store,f.clock).status('Learning','page-a').researchNeeded,true);assert.equal(f.calls.length,0);
});
test('optional Groups or analytics outage does not stop text preparation or invent observations',async t=>{
  const f=fixture(t);f.controls.offlineOptional=true;const enqueued=await f.content.enqueue('page-a',{topic:'Offline optional evidence',formats:['group','text']});
  const saved=f.store.getWork(enqueued.tasks[0].id)!;assert.equal(saved.kind,'text_post');assert.equal(saved.payload.content.analytics,null);
});
test('oversized Group rules select compact text instead of spending a model call on an oversized prompt',async t=>{
  const f=fixture(t);f.group.rules='Full restriction. '.repeat(900);
  const selected=await f.content.enqueue('page-a',{topic:'Bounded context',formats:['group','text']});
  assert.equal(f.store.getWork(selected.tasks[0].id)!.kind,'text_post');assert.equal(selected.skipped[0].reason,'context_over_budget');assert.equal(f.store.workCount(),1);
});
test('voice excerpts bound examples and facts while preserving all supplied prohibitions',async t=>{
  const f=fixture(t);f.page.voice.profile.approvedExamples=Array(30).fill('An approved example. '.repeat(100));f.page.voice.profile.approvedFacts=Array(30).fill('A complete supplied fact.');f.page.voice.profile.prohibitedPhrases=['Never claim a personal experience','Never promise a result'];
  const c=await f.content.context('page-a');assert.equal(c.page.voice.profile.approvedExamples.length,1);assert.equal(c.page.voice.profile.approvedFacts.length,4);
  assert.deepEqual(c.page.voice.profile.prohibitedPhrases,f.page.voice.profile.prohibitedPhrases);
});
test('unassigned runner context excludes account-private knowledge',async t=>{
  const f=fixture(t);f.store.recordKnowledge({kind:'observation',accountId:'other-account',text:'Private Page evidence',source:'fixture'});f.store.recordKnowledge({kind:'assumption',text:'Public generic guidance'});
  let prompt:any;
  class FixtureExecutor extends CommandExecutors {
    override async detect(c:ExecutorConfig):Promise<ExecutorCapability>{return {id:c.id,adapter:c.adapter,available:true,reason:'fixture_only'};}
    override async execute(_c:any,_cap:any,context:string):Promise<ExecutionResult>{prompt=JSON.parse(context);return {result:{version:'agent-result.v1',status:'prepared',result:'Useful generic preparation',lessons:[]},usage:{tokens:1,source:'fixture'}};}
  }
  configureRunner(f.store,{...defaultRunnerConfig(),enabled:true},true);f.content.work.add({id:'unassigned',kind:'text_post',title:'Generic preparation'});
  await new AgentRunner(f.store,path.join(f.dir,'runner'),new FixtureExecutor(f.dir),f.clock).tick();
  assert.deepEqual(prompt.knowledge.map((k:any)=>k.text),['Public generic guidance']);assert.doesNotMatch(JSON.stringify(prompt),/Private Page evidence/);
});
test('draft save failures remain observable and never repeat the model or write',async t=>{
  const f=fixture(t),id=(await f.content.enqueue('page-a',{topic:'Uncertain runner save',formats:['text']})).tasks[0].id;
  let calls=0;
  class FixtureExecutor extends CommandExecutors {
    override async detect(c:ExecutorConfig):Promise<ExecutorCapability>{return {id:c.id,adapter:c.adapter,available:true,reason:'fixture_only'};}
    override async execute():Promise<ExecutionResult>{calls++;return {result:{version:'agent-result.v1',status:'prepared',result:JSON.stringify(result),lessons:[]},usage:{tokens:1,source:'fixture'}};}
  }
  configureRunner(f.store,{...defaultRunnerConfig(),enabled:true,saveContentDrafts:true,cooldownSeconds:0},true);f.controls.loseDraft=true;
  const runner=new AgentRunner(f.store,path.join(f.dir,'runner'),new FixtureExecutor(f.dir),f.clock,taskId=>f.content.persist(taskId));
  assert.equal((await runner.tick()).state,'prepared_content_requires_review');assert.equal((runner.status().recentSessions[0] as any).preparationError,'content_save_requires_review');
  assert.equal(f.content.status(id).save?.status,'uncertain');f.advance(301000);assert.equal((await runner.tick()).launched,0);assert.equal(calls,1);assert.equal(f.drafts.size,1);
});
test('content output cannot inject a schedule or omit Group compliance',async t=>{
  const f=fixture(t),id=(await f.content.enqueue('page-a',{topic:'No schedule',formats:['text']})).tasks[0].id;
  f.prepare(id,{...result,scheduledAt:'2099-01-01T00:00:00Z'});await assert.rejects(f.content.persist(id));assert.equal(f.drafts.size,0);
  const groupId=(await f.content.enqueue('page-a',{topic:'No compliance',formats:['group']})).tasks[0].id;
  f.prepare(groupId,{...result,groupRevision:2,rulesHash:groupRulesHash(f.group),relevance:'Local topic'});await assert.rejects(f.content.persist(groupId),/compliance/);assert.equal(f.packages.size,0);
});
test('reconciliation refuses a changed task and compact handoffs omit the full saved draft',async t=>{
  const f=fixture(t),id=(await f.content.enqueue('page-a',{topic:'Changed while uncertain',formats:['text']})).tasks[0].id;f.prepare(id,result);f.controls.loseDraft=true;
  await assert.rejects(f.content.persist(id));
  const claim=f.content.work.claim(id,{owner:'next-agent',commandId:'changed-claim'}).task;
  f.content.work.save({id,owner:claim.owner,commandId:'changed-save',claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:{...result,text:'Changed after original write'}});
  await assert.rejects(f.content.reconcile(id,'draft-0'),/Task changed/);assert.equal(f.drafts.size,1);
  const other=(await f.content.enqueue('page-a',{topic:'Compact output',formats:['text']})).tasks[0].id;f.prepare(other,result);f.controls.loseDraft=false;await f.content.persist(other);
  const compact=f.content.work.list().tasks.find((t:any)=>t.id===other) as any;assert.ok(compact.preparation.draftId);assert.doesNotMatch(JSON.stringify(compact),/คำอธิบาย/);
});
