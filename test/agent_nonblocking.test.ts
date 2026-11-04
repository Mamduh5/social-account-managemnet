import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {AgentStore} from '../scripts/agent/store.js';
import {JsonClient,ApiError} from '../scripts/agent/http.js';
import {PipelineAdapter} from '../scripts/agent/pipeline.js';
import {AgentWorkflow} from '../scripts/agent/workflow.js';

const targets={pipeline:'http://127.0.0.1:18080',scc:'http://127.0.0.1:13001'};
const input={title:'Fixture story',generation:{title:'Fixture story',idea:'A toy shelters a plant.',sceneCount:1,aspectRatio:'9:16'}};
function setup(t:{after:(fn:()=>void)=>void}) {
  const directory=mkdtempSync(path.join(tmpdir(),'scc-agent-work-test-runs-')),filename=path.join(directory,'agent.db');
  let now=new Date('2026-11-02T00:00:00Z');
  const clock=()=>new Date(now);
  const store=new AgentStore(filename),opened=[store];
  const calls:Array<{method:string;path:string}>=[];
  const controls={created:false,dropCreate:false,offline:false,blocked:false,imports:0,drafts:0};
  const project:any={id:'fixture-project',title:input.title,topic:input.generation.idea,status:'running',current_step:'planning',provider:'gemini_web',autopilot:{provider:'gemini_web',review_status:'not_reviewed'},
    created_at:now.toISOString(),updated_at:now.toISOString(),scene_count:1,accepted_count:0,scene_seconds:10,aspect_ratio:'9:16',generation_settings:{version:'generation_settings.v1',mode:'dense_performance',performance_tempo:2},
    scenes:[{order:1,status:'awaiting_external_generation'},{order:2,status:'awaiting_external_generation'}],next_action:{background:true}};
  const run:any={id:'fixture-original-run',scene_order:1,status:'generating',account_id:'gemini_web-main',at:now.toISOString(),submission_intent:true,submission_acknowledged:true,evidence:{provider_context_url:'https://gemini.google.com/app/fixture-original-turn'}};
  const item:any={job_id:project.id,title:project.title,status:'generating',paused:false,recovery_attempts:0,runs:[run]};
  const recovery:any={job_id:project.id,state:'generation_in_progress',submission_unresolved:true,needs_recovery:false,submission_outcome:'in_progress'};
  const fetcher:typeof fetch=async(url,options)=>{
    const u=new URL(String(url)),method=options?.method||'GET';calls.push({method,path:u.pathname});
    assert.equal(u.origin,targets.pipeline,'fixtures cannot reach a live origin');assert.doesNotMatch(u.pathname,/flow|330aaf23/);
    if(controls.offline)throw new Error('Fixture transport unavailable');
    if(u.pathname==='/gemini-autopilot'&&method==='GET')return Response.json({provider:'gemini_web',available:true,worker_enabled:true,
      scheduler:{enabled:true,active_run:controls.blocked?'other-run':controls.created&&run.status==='generating'?run.id:null,
        configured_submission_cap:4,submissions_this_window:controls.created?1:0,queue:controls.created?[item]:[]},
      recovery_status:controls.blocked?{submission_unresolved:true}:controls.created?recovery:{submission_unresolved:false},quota_timing:{remaining_blockers:[]}});
    if(u.pathname==='/gemini-autopilot/queue'&&method==='POST'){
      assert.equal(controls.created,false,'no duplicate native queue submission');controls.created=true;
      if(controls.dropCreate)throw new Error('Response lost after queue insert');
      return Response.json({job_id:project.id},{status:202});
    }
    if(u.pathname==='/scene-video-jobs/'+project.id&&method==='GET')return Response.json(project);
    throw new Error('Unexpected fixture endpoint '+u.pathname);
  };
  const pipeline=new PipelineAdapter(new JsonClient(targets.pipeline,{fetch:fetcher}));
  const scc:any={
    async pipelineOrigin(){return targets.pipeline;},
    async importVideo(){controls.imports++;return {success:true,videoId:'fixture-video',alreadyExisted:controls.imports>1};},
    async prepare(){controls.drafts++;return {draft:{id:'fixture-draft',revision:1,status:'draft',approvedRevision:null,queuedPostId:null}};},
  };
  const workflow=new AgentWorkflow(store,pipeline,scc,targets,clock);
  const restart=()=>{store.close();const nextStore=new AgentStore(filename);opened.push(nextStore);return {store:nextStore,workflow:new AgentWorkflow(nextStore,pipeline,scc,targets,clock)};};
  const finish=()=>{
    Object.assign(project,{status:'completed',current_step:'completed',accepted_count:2,video_url:'/scene-video-jobs/'+project.id+'/artifacts/video',duration_seconds:20});
    Object.assign(item,{status:'completed'});Object.assign(run,{status:'completed',finished_at:clock().toISOString()});
    Object.assign(recovery,{state:'healthy',submission_unresolved:false,needs_recovery:false,submission_outcome:'completed'});
    project.scenes.forEach((scene:any)=>{scene.status='accepted';scene.clip_url='/scene-video-jobs/'+project.id+'/artifacts/scene-clip/'+scene.order;});
  };
  t.after(()=>{for(const db of opened)try{db.close();}catch{}rmSync(directory,{recursive:true,force:true});});
  return {store,workflow,pipeline,scc,calls,controls,project,item,run,recovery,filename,clock,restart,finish,advanceTime:(ms:number)=>{now=new Date(now.getTime()+ms);}};
}

test('submission returns its durable ID without checking completion and immediately permits independent planning',async t=>{
  const f=setup(t),started=await f.workflow.start('fixture-run',input,true);
  assert.equal(started.projectId,'fixture-project');assert.equal(started.agentShouldWait,false);assert.equal(started.next,'work-next');
  assert.deepEqual(f.calls.map(c=>c.path),['/gemini-autopilot','/gemini-autopilot/queue']);
  const before=f.calls.length;
  f.workflow.work.add({id:'plan-next',kind:'story_plan',title:'A useful next idea',payload:{denseMode:true,ownerIdea:'A small useful story'}});
  const claim=f.workflow.work.next({owner:'agent-a',commandId:'claim-plan'}).task!;
  const saved=f.workflow.work.save({id:claim.id,owner:'agent-a',commandId:'save-plan',claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:{idea:'A lamp guides a moth home.',scenePrompts:['Opening action','Payoff'],caption:'A fictional story'}});
  assert.equal(saved.automaticGeneration,false);assert.equal(f.calls.length,before);
  assert.equal(f.workflow.handoff().preparedWork[0].id,'plan-next');assert.equal(f.workflow.handoff().generations.active.total,1);
});

test('normal, slow and suspected-stall classifications use confirmed progress rather than unchanged notices or update timestamps',async t=>{
  const f=setup(t);await f.workflow.start('pace',input,true);
  let observation=(await f.workflow.refresh('pace')).observation;const confirmed=observation.lastConfirmedProgressAt;
  assert.equal(observation.condition,'in_progress');
  f.advanceTime(6*60000);f.project.updated_at=f.clock().toISOString();
  observation=(await f.workflow.refresh('pace')).observation;
  assert.equal(observation.condition,'slow');assert.equal(observation.lastConfirmedProgressAt,confirmed);
  f.advanceTime(10*60000);f.project.updated_at=f.clock().toISOString();
  observation=(await f.workflow.refresh('pace')).observation;
  assert.equal(observation.condition,'suspected_stall');assert.equal(observation.retryPermitted,false);assert.equal(f.store.generationSnapshot('pace')?.condition,'suspected_stall');
  f.project.accepted_count=1;f.project.scenes[0].clip_url='/scene-video-jobs/fixture-project/artifacts/scene-clip/1';
  observation=(await f.workflow.refresh('pace')).observation;
  assert.equal(observation.condition,'in_progress');assert.equal(observation.lastConfirmedProgressAt,f.clock().toISOString());
});

test('cached status and handoff suppress repeated HTTP calls while other tasks remain available',async t=>{
  const f=setup(t);await f.workflow.start('cached',input,true);await f.workflow.refresh('cached');const reads=f.calls.length;
  await f.workflow.status('cached');await f.workflow.status('cached');f.workflow.handoff();f.workflow.summary('cached');
  f.workflow.work.add({id:'research',kind:'research_concept',title:'Research independent concepts'});f.workflow.work.next();
  assert.equal(f.calls.length,reads);assert.equal(f.workflow.handoff().availableIndependentTasks.length,1);
});

test('timeout preserves original turn, account, scene, recovery details and provider ownership without declaring provider failure',async t=>{
  const f=setup(t);await f.workflow.start('timeout',input,true);await f.workflow.refresh('timeout');
  f.advanceTime(30*60000);Object.assign(f.run,{status:'reconciliation_required',diagnostic:{code:'provider_timeout',stage:'result_detection',message:'Original generating notice unchanged',occurred_at:f.clock().toISOString()}});
  Object.assign(f.recovery,{state:'in_progress',needs_recovery:true,next_retry_at:new Date(f.clock().getTime()+60000).toISOString()});f.item.recovery_attempts=2;f.item.last_recovery_outcome='still_generating';
  const observation=(await f.workflow.refresh('timeout')).observation;
  assert.equal(observation.condition,'recovery_required');assert.equal(observation.evidence.original.conversationUrl,'https://gemini.google.com/app/fixture-original-turn');
  assert.equal(observation.evidence.original.accountId,'gemini_web-main');assert.equal(observation.evidence.original.sceneOrder,1);assert.equal(observation.evidence.recovery.attempts,2);
  assert.equal(observation.firstSubmission.runId,'fixture-original-run');assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),'timeout');
  await assert.rejects(f.workflow.start('conflicting',input,true),/provider_session_locked/);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

test('browser-control-ended marker is durable and performs no browser or provider action',async t=>{
  const f=setup(t);await f.workflow.start('browser-ended',input,true);await f.workflow.refresh('browser-ended');const count=f.calls.length;
  const note=f.workflow.recoveryNote('browser-ended',{state:'ended',reason:'Browser URL confidence policy ended Computer Use.'});
  assert.equal(note.condition,'recovery_required');assert.equal(note.browserInteractionPermitted,false);assert.equal(f.calls.length,count);
  const resumed=f.restart();const handoff=resumed.workflow.handoff();
  assert.equal(handoff.generations.recoveryRequired.items[0].browserControl.state,'ended');assert.equal(handoff.generations.recoveryRequired.items[0].original.runId,'fixture-original-run');
});

test('an explicit conclusive technical error is distinct from a timeout',async t=>{
  const f=setup(t);await f.workflow.start('technical',input,true);
  f.project.status='failed';f.run.status='failed';f.run.submission_intent=false;f.run.submission_acknowledged=false;
  f.run.diagnostic={code:'planner_failed',stage:'planning',message:'Structured planning failed'};Object.assign(f.recovery,{state:'failed',submission_unresolved:false,needs_recovery:false});
  assert.equal((await f.workflow.refresh('technical')).observation.condition,'technical_failure');
});

test('restart recovers prepared prompts, immutable decisions and the original generation without native replay',async t=>{
  const f=setup(t);await f.workflow.start('restart',input,true);await f.workflow.refresh('restart');
  f.workflow.work.add({id:'caption',kind:'caption',title:'Prepare a grounded caption',runId:'restart',payload:{context:'Known fictional story'}});
  const claim=f.workflow.work.next({owner:'codex',commandId:'claim-caption'}).task!;
  f.workflow.work.save({id:claim.id,owner:'codex',commandId:'save-caption',claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:{caption:'เรื่องสมมติจาก AI',hashtags:'#เรื่องสั้นAI'}});
  f.store.recordKnowledge({id:'decision',kind:'assumption',resourceId:'restart',text:'A visual payoff may improve comprehension.'});
  const resumed=f.restart(),before=f.calls.length;
  const handoff=resumed.workflow.handoff();assert.equal(handoff.preparedWork[0].id,'caption');assert.equal(handoff.decisionsAndObservations[0].id,'decision');
  assert.equal(resumed.workflow.work.show('caption').task.result.caption,'เรื่องสมมติจาก AI');assert.equal(f.calls.length,before);
  await resumed.workflow.start('restart',input,true);assert.equal(f.calls.length,before);
});

test('eventual completion reconciles the original ID, releases local admission and makes dependent review available without automatic import',async t=>{
  const f=setup(t);await f.workflow.start('eventual',input,true);await f.workflow.refresh('eventual');
  f.workflow.work.add({id:'review',kind:'review_video',title:'Inspect actual completed output',waitForRunId:'eventual'});
  assert.equal(f.workflow.work.next().task,null);
  f.finish();const observed=await f.workflow.refresh('eventual');
  assert.equal(observed.observation.condition,'completed');assert.equal(f.store.providerOwner('gemini_web:'+targets.pipeline),null);
  assert.equal(f.controls.imports,0);assert.equal(f.controls.drafts,0);assert.equal(f.workflow.work.next().task?.id,'review');
  const ready=await f.workflow.advance('eventual',{accountId:'fixture-page',caption:'Reviewed fixture story',applyBranding:true});
  assert.equal(ready.draftId,'fixture-draft');await f.workflow.advance('eventual');
  assert.equal(f.controls.imports,1);assert.equal(f.controls.drafts,1);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

test('native session reservation denies a second project while independent work remains usable',async t=>{
  const f=setup(t);f.controls.blocked=true;
  await assert.rejects(f.workflow.start('blocked-concept',input,true),/provider_session_locked/);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
  f.workflow.work.add({id:'analysis',kind:'analyze_performance',title:'Review saved statistics'});
  const handoff=f.workflow.handoff();assert.equal(handoff.generations.preparedWaitingForGeneration.total,1);assert.equal(handoff.availableIndependentTasks[0].id,'analysis');
  assert.deepEqual(f.workflow.intent('blocked-concept').input.generation,input.generation);
});

test('atomic local provider admission excludes concurrent agents even when both native preflight reads see idle',async t=>{
  const f=setup(t);
  const outcomes=await Promise.allSettled([f.workflow.start('agent-one',input,true),f.workflow.start('agent-two',input,true)]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

test('lost create response stays held across reconnection, with independent work and read-only exact attachment',async t=>{
  const f=setup(t);f.controls.dropCreate=true;
  await assert.rejects(f.workflow.start('lost',input,true),ApiError);
  f.workflow.work.add({id:'free-task',kind:'scene_prompt',title:'Write an independent prompt'});
  const resumed=f.restart();await assert.rejects(resumed.workflow.start('lost',input,true),/Inspect the saved run/);
  assert.equal(resumed.workflow.handoff().generations.recoveryRequired.total,1);assert.equal(resumed.workflow.work.next().task?.id,'free-task');
  await resumed.workflow.reconcile('lost',{projectId:'fixture-project'});
  assert.equal(resumed.workflow.summary('lost').projectId,'fixture-project');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

test('task claims exclude concurrent writers, expire safely, retain revisions and deduplicate saves',t=>{
  const f=setup(t);f.workflow.work.add({id:'leased',kind:'story_plan',title:'A substantive useful plan'});
  const first=f.workflow.work.claim('leased',{owner:'one',commandId:'claim-one',leaseSeconds:30}).task;
  assert.throws(()=>f.workflow.work.claim('leased',{owner:'two',commandId:'claim-two'}),/claimed/);
  f.advanceTime(31000);const second=f.workflow.work.claim('leased',{owner:'two',commandId:'claim-two-new'}).task;
  assert.throws(()=>f.workflow.work.save({id:'leased',owner:'one',commandId:'stale-write',claimToken:first.claimToken,revision:first.revision,status:'done',result:'bad'}),/expired or changed/);
  const save={id:'leased',owner:'two',commandId:'good-write',claimToken:second.claimToken,revision:second.revision,status:'prepared' as const,result:{prompt:'Connected actions and a satisfying result'}};
  const result=f.workflow.work.save(save);assert.deepEqual(f.workflow.work.save(save),result);assert.equal(f.store.workHistory('leased').length,4);
  assert.throws(()=>f.workflow.work.save({...save,result:'different'}),/different input/);
});

test('transport loss preserves last confirmed progress and original evidence without inventing a provider failure',async t=>{
  const f=setup(t);await f.workflow.start('offline',input,true);await f.workflow.refresh('offline');const before=f.store.generationSnapshot('offline')!;
  f.controls.offline=true;f.advanceTime(60000);
  const result=(await f.workflow.refresh('offline')).observation;
  assert.equal(result.stale,true);assert.equal(result.refreshError.code,'transport_failed');assert.equal(result.evidence.original.runId,before.evidence.original.runId);
  assert.equal(result.lastConfirmedProgressAt,before.lastConfirmedProgressAt);assert.notEqual(result.condition,'technical_failure');
});

test('CLI work preparation and handoff run offline in a separate session with compact JSON output',t=>{
  const f=setup(t),cli=path.resolve(__dirname,'../scripts/agent.ts');
  const invoke=(args:string[],body?:unknown)=>{
    const run=spawnSync(process.execPath,['--import','tsx',cli,...args,'--state',f.filename,'--pipeline','http://127.0.0.1:1','--scc','http://127.0.0.1:1'],
      {cwd:path.resolve(__dirname,'..'),encoding:'utf8',input:body===undefined?undefined:JSON.stringify(body),timeout:10000});
    assert.equal(run.status,0,run.stdout+run.stderr);return JSON.parse(run.stdout);
  };
  invoke(['work-add','--input','-'],{id:'cli-plan',kind:'story_plan',title:'Prepared through another agent session',payload:{idea:'Independent original story'}});
  const claim=invoke(['work-next','--input','-'],{owner:'gemini-agent',commandId:'cli-claim'}).data.task;
  invoke(['work-save','--input','-'],{id:claim.id,owner:'gemini-agent',commandId:'cli-save',claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:{prompt:'Saved full scene prompt'}});
  const handoff=invoke(['handoff']);assert.equal(handoff.data.networkCalls,0);assert.equal(handoff.data.preparedWork[0].id,'cli-plan');assert.equal(handoff.data.autonomousAgentTriggerAvailable,false);
  const shown=invoke(['work-show','--task','cli-plan']);assert.equal(shown.data.task.result.prompt,'Saved full scene prompt');
});

test('an unknown admission contract fails closed without any generation request',async t=>{
  const f=setup(t);const pipeline=new PipelineAdapter(new JsonClient(targets.pipeline,{fetch:async()=>Response.json({available:true})}));
  const workflow=new AgentWorkflow(f.store,pipeline,f.scc,targets,f.clock);
  await assert.rejects(workflow.start('unknown-native',input,true),error=>error instanceof ApiError&&error.code==='invalid_gemini_admission_response');
  assert.equal(f.controls.created,false);
});

test('a browser-control note cannot erase already confirmed completion or block review work',async t=>{
  const f=setup(t);await f.workflow.start('finished-note',input,true);f.finish();await f.workflow.refresh('finished-note');
  f.workflow.work.add({id:'review-finished',kind:'review_video',title:'Review saved output',waitForRunId:'finished-note'});
  const count=f.calls.length;
  const note=f.workflow.recoveryNote('finished-note',{state:'ended',reason:'Interactive browser access ended after the result was saved.'});
  assert.equal(note.condition,'completed');assert.equal(f.store.generationSnapshot('finished-note')?.condition,'completed');
  assert.equal(f.workflow.work.next().task?.id,'review-finished');assert.equal(f.calls.length,count);
});

test('an older delayed observation cannot overwrite a newer completed result',async t=>{
  const f=setup(t);await f.workflow.start('out-of-order',input,true);await f.workflow.refresh('out-of-order');
  const oldEvidence=structuredClone(f.store.generationSnapshot('out-of-order')!.evidence);
  const inspect=f.pipeline.inspect.bind(f.pipeline);let resolveOld!:(value:Record<string,any>)=>void;let count=0;
  f.pipeline.inspect=async id=>++count===1?new Promise(resolve=>{resolveOld=resolve;}):inspect(id);
  const older=f.workflow.refresh('out-of-order');f.advanceTime(1000);f.finish();
  const current=await f.workflow.refresh('out-of-order');assert.equal(current.observation.condition,'completed');
  resolveOld(oldEvidence);await older;
  assert.equal(f.workflow.generations.cached('out-of-order')?.condition,'completed');assert.equal(f.workflow.handoff().generations.completed.total,1);
});

test('native capacity exhaustion and missing accounting metadata cannot authorize new generation',async t=>{
  const f=setup(t);
  for(const cap of [4,undefined]) {
    let posts=0;
    const pipeline=new PipelineAdapter(new JsonClient(targets.pipeline,{fetch:async(_url,options)=>{
      if(options?.method==='POST')posts++;
      return Response.json({provider:'gemini_web',available:true,worker_enabled:true,scheduler:{enabled:true,queue:[],configured_submission_cap:cap,submissions_this_window:4},recovery_status:{submission_unresolved:false},quota_timing:{remaining_blockers:[]}});
    }}));
    const workflow=new AgentWorkflow(f.store,pipeline,f.scc,targets,f.clock);
    await assert.rejects(workflow.start('capacity-'+String(cap),input,true));assert.equal(posts,0);
  }
});

test('first submitted conversation remains available when a later scene has its own native turn',async t=>{
  const f=setup(t);await f.workflow.start('two-scenes',input,true);await f.workflow.refresh('two-scenes');
  f.advanceTime(10000);f.project.accepted_count=1;f.run.status='completed';f.recovery.submission_unresolved=false;
  f.item.runs=[{...structuredClone(f.run),id:'second-native-run',scene_order:2,status:'generating',at:f.clock().toISOString(),evidence:{provider_context_url:'https://gemini.google.com/app/second-scene-turn'}}];
  const result=(await f.workflow.refresh('two-scenes')).observation;
  assert.equal(result.evidence.original.runId,'second-native-run');assert.equal(result.firstSubmission.runId,'fixture-original-run');
  assert.equal(result.firstSubmission.conversationUrl,'https://gemini.google.com/app/fixture-original-turn');
  assert.equal(f.store.generationHistory('two-scenes').length,2);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
