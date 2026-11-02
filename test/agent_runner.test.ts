import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {AgentStore} from '../scripts/agent/store.js';
import {AgentRunner} from '../scripts/agent/runner.js';
import {AgentWorkQueue} from '../scripts/agent/work-queue.js';
import {CommandExecutors,ExecutionError,runProcess,supervisedProcess,type ExecutorCapability,type ExecutionResult,type ProcessRunner} from '../scripts/agent/executors.js';
import {configureRunner,defaultRunnerConfig,executorSchema,type ExecutorConfig} from '../scripts/agent/runner-config.js';
import {manageSchedule,scheduleXml,scheduleIdentity} from '../scripts/agent/runner-schedule.js';
import {AgentWorkflow} from '../scripts/agent/workflow.js';
import {JsonClient} from '../scripts/agent/http.js';
import {PipelineAdapter} from '../scripts/agent/pipeline.js';

const good:ExecutionResult={result:{version:'agent-result.v1',status:'prepared',result:'A useful original scene plan, based on the supplied brief.',lessons:['This creative direction remains a hypothesis.']},usage:{tokens:5,source:'fixture.actual'}};
class FakeExecutors extends CommandExecutors {
  probes:string[]=[];calls:Array<{id:string;context:any}>=[];missing=new Set<string>();
  behavior:(signal?:AbortSignal)=>Promise<ExecutionResult>=async()=>good;
  override async detect(config:ExecutorConfig):Promise<ExecutorCapability>{this.probes.push(config.id);return {id:config.id,adapter:config.adapter,available:!this.missing.has(config.id),reason:'fixture_only'};}
  override async execute(config:ExecutorConfig,_cap:ExecutorCapability,context:string,_directory:string,options:any):Promise<ExecutionResult>{
    this.calls.push({id:config.id,context:JSON.parse(context)});options.onSpawn?.(12345);return this.behavior(options.signal);
  }
}
function setup(t:{after:(f:()=>void)=>void},overrides:Record<string,unknown>={}){
  const dir=mkdtempSync(path.join(tmpdir(),'scc-runner-test-')),filename=path.join(dir,'agent.db');
  const store=new AgentStore(filename),opened=[store],fake=new FakeExecutors(path.join(dir,'probe'));
  let now=new Date('2026-11-02T00:00:00Z');const clock=()=>new Date(now);
  configureRunner(store,{...defaultRunnerConfig(),enabled:true,cooldownSeconds:0,...overrides},true);
  const runner=new AgentRunner(store,path.join(dir,'runner'),fake,clock);
  const add=(id='plan',extra:Record<string,unknown>={})=>runner.work.add({id,kind:'story_plan',title:'Useful story preparation',payload:{brief:'An original toy story'},...extra});
  t.after(()=>{for(const s of opened)try{s.close();}catch{}rmSync(dir,{recursive:true,force:true});});
  return {dir,filename,store,runner,fake,add,clock,advance:(ms=301000)=>{now=new Date(now.getTime()+ms);},restart:()=>{store.close();const next=new AgentStore(filename);opened.push(next);return new AgentRunner(next,path.join(dir,'runner'),fake,clock);}};
}

test('runner defaults disabled, and enabled settings require separate authorization',async t=>{
  const f=setup(t);configureRunner(f.store,{});f.add();assert.equal((await f.runner.tick()).state,'disabled');assert.equal(f.fake.probes.length,0);
  assert.throws(()=>configureRunner(f.store,{enabled:true}),/authorization/);
  assert.throws(()=>f.runner.control('enable'),/authorization/);
  f.runner.control('enable',true);assert.equal(f.runner.status().enabled,true);
  assert.throws(()=>configureRunner(f.store,{...f.runner.config(),maxConcurrent:2}),/authorization/);
});
test('idle check launches no probes, model, generation poll, or synthetic work',async t=>{
  const f=setup(t);assert.deepEqual(await f.runner.tick(),{state:'idle',launched:0});
  assert.equal(f.fake.probes.length,0);assert.equal(f.store.workCount(),0);assert.equal(f.store.runnerSessions().length,0);
});
test('priority selection, results, assumption lessons, and later-session handoff',async t=>{
  const f=setup(t);f.add('low',{priority:1});f.add('high',{priority:90});
  assert.equal((await f.runner.tick()).launched,1);assert.equal(f.fake.calls[0].context.task.id,'high');
  assert.equal(f.store.getWork('high')!.status,'prepared');assert.equal(f.store.getWork('low')!.status,'ready');
  const knowledge=f.store.listKnowledge({resourceId:'high'});assert.equal(knowledge[0].kind,'assumption');assert.equal((knowledge[0].evidence as any).verified,false);
  f.advance();const next=f.restart();assert.equal((await next.tick()).launched,1);assert.equal(next.store.getWork('low')!.status,'prepared');
  assert.equal(next.store.runnerSessions().length,2);
});
test('missing primary executor falls back without creating another task or claim',async t=>{
  const f=setup(t);f.fake.missing.add('codex');f.add();await f.runner.tick();
  assert.deepEqual(f.fake.probes,['codex','gemini']);assert.equal(f.fake.calls[0].id,'gemini');assert.equal(f.store.workHistory('plan').length,3);
});
test('all executors unavailable leaves work safely ready with no invocation charge',async t=>{
  const f=setup(t);f.fake.missing=new Set(['codex','gemini']);f.add();
  assert.equal((await f.runner.tick()).state,'executor_unavailable_or_unsupported_task');assert.equal(f.store.getWork('plan')!.revision,1);
  assert.equal(f.runner.status().budget.invocations,0);
});
test('unsupported image and audiovisual work does not launch a text-only agent',async t=>{
  const f=setup(t);f.add('image',{kind:'opening_image'});f.add('review',{kind:'review_video'});
  assert.equal((await f.runner.tick()).launched,0);assert.equal(f.fake.calls.length,0);
});
test('generation-dependent work waits for saved completion while independent work proceeds',async t=>{
  const f=setup(t);f.store.createJob('generation',{title:'Protected generation'});f.store.recordGeneration('generation',{condition:'recovery_required',checkedAt:f.clock().toISOString(),evidence:{original:{projectId:'330aaf23-17d6-4982-96c6-93ef3792673c'}}});
  f.store.reserveProvider('gemini_web:fixture','generation');
  const before=JSON.stringify(f.store.generationSnapshot('generation'));
  f.add('wait',{waitForRunId:'generation',priority:100});f.add('independent');
  await f.runner.tick();assert.equal(f.store.getWork('wait')!.status,'ready');assert.equal(f.store.getWork('independent')!.status,'prepared');
  assert.equal(JSON.stringify(f.store.generationSnapshot('generation')),before);assert.equal(f.store.providerOwner('gemini_web:fixture'),'generation');
  f.store.recordGeneration('generation',{condition:'completed',checkedAt:new Date(f.clock().getTime()+1).toISOString()});f.advance();await f.runner.tick();assert.equal(f.store.getWork('wait')!.status,'prepared');
});
test('concurrent runner processes share atomic budgets and exclusive existing queue claims',async t=>{
  const f=setup(t,{maxConcurrent:2,maxInvocationsPerDay:1});f.add('one');f.add('two');
  const secondStore=new AgentStore(f.filename);
  const second=new AgentRunner(secondStore,path.join(f.dir,'two'),f.fake,f.clock);
  try{await Promise.all([f.runner.tick(),second.tick()]);}finally{secondStore.close();}
  assert.equal(f.fake.calls.length,1);assert.equal(f.store.runnerSessions().length,1);
  assert.equal(f.store.workStatusCounts().ready,1);
});
test('active invocation blocks competing manual claim and concurrency admission',async t=>{
  const f=setup(t);f.add('one');f.add('two');let release!:(v:ExecutionResult)=>void;
  f.fake.behavior=()=>new Promise(resolve=>{release=resolve;});const running=f.runner.tick();
  while(!release)await new Promise(resolve=>setTimeout(resolve,5));
  assert.throws(()=>f.runner.work.claim('one',{owner:'other',commandId:'manual'}),/claim/);
  assert.equal((await f.runner.tick()).state,'concurrency_limit');release(good);await running;
});
test('maximum tasks per run and daily invocation budget persist across restart',async t=>{
  const f=setup(t,{maxTasksPerRun:2,maxInvocationsPerDay:2});f.add('one');f.add('two');f.add('three');
  assert.equal((await f.runner.tick()).launched,2);f.advance();assert.equal((await f.restart().tick()).state,'daily_invocation_limit');
});
test('interval, durable wake, cooldown, pause/resume, and disable controls',async t=>{
  const f=setup(t,{cooldownSeconds:60});f.add('one');await f.runner.tick();
  assert.equal((await f.runner.tick()).state,'cooldown');f.add('two');f.advance(61000);
  assert.equal((await f.runner.tick()).launched,1,'new useful work wakes before next interval');
  f.runner.control('pause');f.advance();assert.equal((await f.runner.tick()).state,'paused');f.runner.control('resume');
  f.runner.control('disable');assert.equal((await f.runner.tick()).state,'disabled');
});
test('token admission uses measured totals and explicitly does not promise a provider hard cap',async t=>{
  const f=setup(t,{dailyTokenBudget:10,tokenReservation:6});f.add('one');f.add('two');await f.runner.tick();
  const budget=f.runner.status().budget;assert.equal(budget.actualTokens,5);assert.equal(budget.providerHardTokenCap,false);
  f.advance();assert.equal((await f.runner.tick()).state,'daily_token_admission_limit');
});
test('missing reliable usage holds further token-budgeted sessions instead of inventing costs',async t=>{
  const f=setup(t,{dailyTokenBudget:100,tokenReservation:10});f.fake.behavior=async()=>({...good,usage:null});f.add('one');f.add('two');await f.runner.tick();
  f.advance();assert.equal((await f.runner.tick()).state,'unknown_usage_hold');assert.equal(f.runner.status().budget.actualTokens,0);assert.equal(f.runner.status().budget.reservedOrEstimatedTokens,10);
});
test('backlog cap is enforced atomically without breaking idempotent work-add',t=>{
  const f=setup(t,{maxBacklog:1});const existing=f.add();assert.equal(f.add().id,existing.id);assert.throws(()=>f.add('other'),/backlog/);
});
test('oversized context remains queued and never starts an agent',async t=>{
  const f=setup(t,{maxContextBytes:2048});f.add('large',{payload:{text:'x'.repeat(4000)}});
  assert.equal((await f.runner.tick()).state,'context_limit');assert.equal(f.fake.calls.length,0);assert.equal(f.store.getWork('large')!.status,'ready');
});
test('post-launch crash is held across restart and never automatically replayed',async t=>{
  const f=setup(t);f.add();f.fake.behavior=async()=>{throw new ExecutionError('executor_exit_nonzero');};
  await f.runner.tick();const session=f.store.runnerSessions()[0];assert.equal(session.status,'recovery_required');assert.equal(f.store.getWork('plan')!.status,'blocked');
  f.advance();await f.restart().tick();assert.equal(f.fake.calls.length,1);
});
test('definitive prelaunch failure safely releases claim but attempt limit prevents loops',async t=>{
  const f=setup(t);f.add();f.fake.behavior=async()=>{throw new ExecutionError('spawn_failed',true);};
  await f.runner.tick();assert.equal(f.store.getWork('plan')!.status,'ready');assert.equal(f.store.runnerSessions()[0].status,'not_started');f.advance();await f.runner.tick();assert.equal(f.fake.calls.length,1);
});
test('expired interrupted invocation becomes a recovery hold and retains its concurrency slot',async t=>{
  const f=setup(t);f.add('one');f.add('two');const claim=f.runner.work.claim('one',{owner:'runner:crash',commandId:'claim-crash',leaseSeconds:30}).task;
  f.store.saveRunnerSession({id:'crash',taskId:'one',status:'running',startedAt:f.clock().toISOString(),deadlineAt:f.clock().toISOString(),claim,reservedTokens:10,usage:null});
  const next=f.restart();assert.equal((await next.tick()).state,'concurrency_limit');assert.equal(next.store.getWork('one')!.status,'blocked');assert.equal(f.fake.calls.length,0);
  assert.throws(()=>next.reconcile({id:'crash',processStopped:true,externalOperationsReconciled:true,reason:'Reviewed'}),/authorization/);
  next.reconcile({id:'crash',processStopped:true,externalOperationsReconciled:true,reason:'Fixture process stopped, no external effects'},true);assert.equal(next.store.getWork('one')!.status,'ready');
});
test('a validated persisted result recovers without another model or duplicate knowledge',async t=>{
  const f=setup(t);f.add();const claim=f.runner.work.claim('plan',{owner:'runner:saved',commandId:'claim-saved',leaseSeconds:900}).task;
  f.store.saveRunnerSession({id:'saved',taskId:'plan',executorId:'fixture',status:'running',startedAt:f.clock().toISOString(),deadlineAt:new Date(f.clock().getTime()+100000).toISOString(),claim,result:good.result,usage:good.usage,reservedTokens:10});
  const next=f.restart();next.recoverExpired();next.recoverExpired();assert.equal(next.store.getWork('plan')!.status,'prepared');assert.equal(next.store.listKnowledge({resourceId:'plan'}).length,1);assert.equal(f.fake.calls.length,0);
  const receipt=next.show('saved');assert.equal(receipt.result.result,good.result.result);assert.equal('claim' in receipt,false);assert.equal('claimToken' in receipt.task,false);
});
test('manual expired claims are left for review rather than automatically adopted',async t=>{
  const f=setup(t);f.add();f.runner.work.claim('plan',{owner:'manual',commandId:'manual',leaseSeconds:30});f.advance();assert.equal((await f.runner.tick()).launched,0);assert.equal(f.store.getWork('plan')!.status,'claimed');
});
test('stop interrupts current work and pauses future sessions',async t=>{
  const f=setup(t);f.add();let started=false;
  f.fake.behavior=signal=>new Promise((_resolve,reject)=>{started=true;signal!.addEventListener('abort',()=>reject(new ExecutionError('interrupted')),{once:true});});
  const running=f.runner.tick();while(!started)await new Promise(resolve=>setTimeout(resolve,5));f.runner.control('stop');await running;
  assert.equal(f.store.getWork('plan')!.status,'blocked');assert.equal((await f.runner.tick()).state,'paused');
});
test('shutdown before launch consumes no session',async t=>{
  const f=setup(t);f.add();const controller=new AbortController();controller.abort();assert.equal((await f.runner.tick(controller.signal)).launched,0);assert.equal(f.fake.calls.length,0);
});
test('handoff and execution context use local evidence without Gemini polling',async t=>{
  const f=setup(t);let networkCalls=0;const client=new JsonClient('http://127.0.0.1:1',{fetch:async()=>{networkCalls++;throw new Error('No fixture networking permitted');}});
  const workflow=new AgentWorkflow(f.store,new PipelineAdapter(client),{} as any,{pipeline:client.origin,scc:client.origin},f.clock);
  f.add();await f.runner.tick();assert.equal(workflow.handoff().preparedWork[0].id,'plan');assert.equal(networkCalls,0);assert.equal(f.fake.calls[0].context.knowledge.length,0);
  assert.equal('claimToken' in f.fake.calls[0].context.task,false);
});

test('Codex adapter verifies actual help, pins read-only flags, and parses measured JSONL usage',async t=>{
  const f=setup(t);const calls:any[]=[];
  const mock:ProcessRunner=async(command,args,options)=>{calls.push({command,args,options});if(args.includes('--help'))return {code:0,stdout:'--json --sandbox --ephemeral --ignore-user-config --output-schema'};
    return {code:0,stdout:[{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(good.result)}},{type:'turn.completed',usage:{input_tokens:7,output_tokens:3,cached_input_tokens:4}}].map(e=>JSON.stringify(e)).join('\n')};};
  const adapter=new CommandExecutors(path.join(f.dir,'probe'),mock),config=executorSchema.parse({id:'local',adapter:'codex',command:process.execPath});
  const cap=await adapter.detect(config);const output=await adapter.execute(config,cap,'fixture context',path.join(f.dir,'session'),{timeoutMs:1000,maxBytes:10000});
  assert.equal(output.usage!.tokens,10);assert.ok(calls[1].args.includes('read-only'));assert.ok(calls[1].args.includes('--ignore-user-config'));assert.ok(calls[1].args.includes('features.hooks=false'));
  assert.equal(calls[1].options.stdin,'fixture context');assert.ok(!calls[1].options.cwd.startsWith(path.resolve('.')));
  assert.equal(calls[1].options.env.SCC_TOKEN_ENCRYPTION_KEY,undefined);
});
test('Gemini adapter verifies headless flags and reads its distinct response/stats envelope',async t=>{
  const f=setup(t);let settings:any;
  const mock:ProcessRunner=async(_c,args,options)=>{
    if(args.includes('--help'))return {code:0,stdout:'--prompt --output-format --extensions'};
    settings=JSON.parse(readFileSync(options.env!.GEMINI_CLI_SYSTEM_SETTINGS_PATH!,'utf8'));
    return {code:0,stdout:JSON.stringify({response:JSON.stringify(good.result),stats:{models:{fixture:{tokens:{total:9}}}}})};};
  const adapter=new CommandExecutors(path.join(f.dir,'probe'),mock),config=executorSchema.parse({id:'local',adapter:'gemini',command:process.execPath});
  const cap=await adapter.detect(config),result=await adapter.execute(config,cap,'context',path.join(f.dir,'session'),{timeoutMs:1000,maxBytes:10000});
  assert.equal(result.usage!.tokens,9);assert.deepEqual(settings.tools.core,[]);assert.equal(settings.hooksConfig.enabled,false);
  assert.equal(settings.mcp.allowed.length,1);assert.match(settings.mcp.allowed[0],/^scc-agent-executor-.+-no-server$/,'empty MCP allowlists are unrestricted in Gemini');
});
test('unsupported CLI versions and malformed results fail closed',async t=>{
  const f=setup(t),config=executorSchema.parse({id:'local',adapter:'codex',command:process.execPath});
  const old=new CommandExecutors(path.join(f.dir,'probe'),async()=>({code:0,stdout:'old interactive only'}));assert.equal((await old.detect(config)).available,false);
  const malformed=new CommandExecutors(path.join(f.dir,'probe'),async()=>({code:0,stdout:'{bad'}));
  await assert.rejects(()=>malformed.execute(config,{id:'local',adapter:'codex',available:true,reason:'fixture',command:process.execPath},'x',path.join(f.dir,'session'),{timeoutMs:1000,maxBytes:10000}),/invalid_result/);
});
test('compatible custom JSON executable is shell-free and supervised with actual fixture child',async t=>{
  const f=setup(t);const script=path.join(f.dir,'mock-agent.cjs');
  writeFileSync(script,'if(process.argv.includes("--help")){console.log("agent-result.v1")}else{let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log('+JSON.stringify(JSON.stringify(good.result))+'));}');
  const config=executorSchema.parse({id:'fixture',adapter:'json',command:process.execPath,args:[script],isolationReviewed:true});
  const adapter=new CommandExecutors(path.join(f.dir,'probe')),cap=await adapter.detect(config);
  assert.equal(cap.available,true);const result=await adapter.execute(config,cap,'fixture',path.join(f.dir,'session'),{timeoutMs:5000,maxBytes:10000});
  assert.equal(result.result.result,good.result.result);assert.equal(result.usage,null);
});
test('supervised fixture timeout and output overflow are bounded, uncertain, and never retried',async t=>{
  const f=setup(t);
  await assert.rejects(()=>supervisedProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:f.dir,timeoutMs:100,maxBytes:10000}),/execution_timeout/);
  await assert.rejects(()=>supervisedProcess(process.execPath,['-e','console.log("x".repeat(20000))'],{cwd:f.dir,timeoutMs:1000,maxBytes:1000}),/output_limit/);
});
test('schedule export is disabled, deterministic, escaped and does not register an OS task',async t=>{
  const f=setup(t);const xml=scheduleXml('D:\\Example & Space',f.filename,300);assert.match(xml,/<Enabled>false<\/Enabled>/);assert.match(xml,/IgnoreNew/);assert.match(xml,/&amp;/);assert.match(xml,/runner-tick/);
  const file=path.join(f.dir,'task.xml');let calls=0;
  await manageSchedule(f.store,path.resolve('.'),f.filename,{action:'export',file},false,async()=>{calls++;throw new Error('No real scheduler');});
  assert.equal(calls,0);assert.match(readFileSync(file,'utf16le'),/<Enabled>false/);assert.equal(f.store.runnerState('schedule'),null);
  assert.equal(scheduleIdentity('.',f.filename),scheduleIdentity(path.resolve('.'),f.filename));
  await assert.rejects(()=>manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install'},false),/authorization|Windows/);
});
test('custom wrappers require an explicit isolation review and config bounds reject unsafe limits',t=>{
  const f=setup(t);assert.throws(()=>configureRunner(f.store,{executors:[{id:'custom',adapter:'json',command:'some-cli'}]}),/isolation/);
  assert.throws(()=>configureRunner(f.store,{maxConcurrent:100}),/4/);assert.throws(()=>configureRunner(f.store,{dailyTokenBudget:3,tokenReservation:4}),/reservation/);
});

test('separate CLI invocations complete fixture work once and carry results to the next session',t=>{
  const f=setup(t),script=path.join(f.dir,'fixture-agent.cjs'),counter=path.join(f.dir,'invocations.txt');
  writeFileSync(script,'const fs=require("node:fs");if(process.argv.includes("--help")){console.log("agent-result.v1")}else{let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{fs.appendFileSync('+JSON.stringify(counter)+',"one\\n");console.log('+JSON.stringify(JSON.stringify(good.result))+');});}');
  configureRunner(f.store,{...defaultRunnerConfig(),enabled:true,cooldownSeconds:0,executors:[{id:'fixture',adapter:'json',command:process.execPath,args:[script],isolationReviewed:true}]},true);
  const cli=(command:string,input?:unknown)=>{
    const args=['--import','tsx','scripts/agent.ts',command,'--state',f.filename];if(input)args.push('--input','-');
    const result=spawnSync(process.execPath,args,{encoding:'utf8',input:input?JSON.stringify(input):undefined,timeout:20000});
    assert.equal(result.status,0,result.stdout);const envelope=JSON.parse(result.stdout);assert.equal(envelope.ok,true);return envelope.data;
  };
  cli('work-add',{id:'first-cli',kind:'story_plan',title:'Prepare fixture story'});assert.equal(cli('runner-tick').launched,1);
  assert.equal(cli('runner-tick').launched,0);assert.equal(readFileSync(counter,'utf8'),'one\n');
  cli('work-add',{id:'second-cli',kind:'caption',title:'Prepare supplied fixture caption'});assert.equal(cli('runner-tick').launched,1);
  assert.equal(readFileSync(counter,'utf8'),'one\none\n');assert.equal(cli('runner-status').tasks.prepared,2);
});

test('OS registration uses the one deterministic task only through an authorized mocked scheduler',async t=>{
  if(process.platform!=='win32'){t.skip('Windows scheduler adapter');return;}
  const f=setup(t),calls:any[]=[];
  const mock:ProcessRunner=async(command,args)=>{calls.push({command,args});return {code:0,stdout:'fixture scheduler only'};};
  const result=await manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install'},true,mock);
  assert.equal(result.installed,true);assert.equal(calls.length,1);assert.equal(calls[0].args[0],'/Create');
  assert.equal(calls[0].args[2],scheduleIdentity('.',f.filename));assert.match(readFileSync(calls[0].args[4],'utf16le'),/<Enabled>true<\/Enabled>/);
  await manageSchedule(f.store,path.resolve('.'),f.filename,{action:'remove'},true,mock);assert.equal(calls[1].args[0],'/Delete');
});

test('UTC daily budget resets without resetting task attempt history',async t=>{
  const f=setup(t,{maxInvocationsPerDay:1});f.add('one');f.add('two');await f.runner.tick();f.advance(86401000);
  assert.equal((await f.runner.tick()).launched,1);assert.equal(f.store.runnerSessions().length,2);
});

test('saved output cannot overwrite a newer claim during restart reconciliation',t=>{
  const f=setup(t);f.add();const claim=f.runner.work.claim('plan',{owner:'runner:old',commandId:'old',leaseSeconds:30}).task;
  f.store.saveRunnerSession({id:'old',taskId:'plan',status:'running',startedAt:f.clock().toISOString(),deadlineAt:f.clock().toISOString(),claim,result:good.result,usage:good.usage,reservedTokens:10});
  f.store.transaction(()=>f.store.saveWork({...claim,owner:'new-owner',claimToken:'new-token',revision:claim.revision+1}));
  f.runner.recoverExpired();assert.equal(f.store.getWork('plan')!.owner,'new-owner');assert.equal(f.store.getWork('plan')!.claimToken,'new-token');assert.equal(f.store.runnerSession('old')!.status,'recovery_required');
});

test('supervisor stops a fixture agent after its parent disappears',async t=>{
  const f=setup(t),marker=path.join(f.dir,'heartbeat.txt'),child=path.join(f.dir,'heartbeat.cjs'),parent=path.join(f.dir,'parent.ts');
  writeFileSync(child,'const fs=require("node:fs");setInterval(()=>fs.appendFileSync('+JSON.stringify(marker)+',"x"),50);');
  const modulePath=path.resolve('scripts/agent/executors.ts');
  writeFileSync(parent,'import {supervisedProcess} from '+JSON.stringify(modulePath.replace(/\\/g,'/'))+';import {existsSync} from "node:fs";void supervisedProcess(process.execPath,['+JSON.stringify(child)+'],{cwd:'+JSON.stringify(f.dir)+',timeoutMs:10000,maxBytes:10000}).catch(()=>{});const timer=setInterval(()=>{if(existsSync('+JSON.stringify(marker)+'))process.exit(23);},25);setTimeout(()=>process.exit(24),12000);');
  const parentResult=spawnSync(process.execPath,['--import','tsx',parent],{cwd:path.resolve('.'),encoding:'utf8',timeout:15000,stdio:['ignore','ignore','ignore']});
  assert.equal(parentResult.status,23,'fixture parent exited after child started');
  await new Promise(resolve=>setTimeout(resolve,2000));const length=readFileSync(marker,'utf8').length;
  await new Promise(resolve=>setTimeout(resolve,500));assert.equal(readFileSync(marker,'utf8').length,length,'orphaned fixture stopped writing');
});

test('executor output preserves Thai UTF-8 across separate child-process chunks',async t=>{
  const f=setup(t),code='const b=Buffer.from("ก");process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),50);';
  const output=await runProcess(process.execPath,['-e',code],{cwd:f.dir,timeoutMs:2000,maxBytes:1000});
  assert.equal(output.stdout,'ก');
});

test('unconfirmed supervisor exit preserves concurrency until explicit process reconciliation',async t=>{
  const f=setup(t);f.add('one');f.add('two');f.fake.behavior=async()=>{throw new ExecutionError('supervisor_exit_uncertain');};
  await f.runner.tick();assert.equal(f.store.runnerSessions()[0].mayBeRunning,true);f.advance();assert.equal((await f.runner.tick()).state,'concurrency_limit');assert.equal(f.fake.calls.length,1);
});
