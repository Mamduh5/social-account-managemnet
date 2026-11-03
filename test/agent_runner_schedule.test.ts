import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {AgentStore} from '../scripts/agent/store.js';
import {AgentRunner} from '../scripts/agent/runner.js';
import {configureRunner,defaultRunnerConfig,type ExecutorConfig} from '../scripts/agent/runner-config.js';
import {CommandExecutors,type ExecutionResult,type ExecutorCapability,type ProcessRunner} from '../scripts/agent/executors.js';
import {manageSchedule,resolveOneTimeSchedule,scheduleIdentity,scheduleXml} from '../scripts/agent/runner-schedule.js';

const futureNow=new Date('2026-11-02T11:00:00Z');
const once={mode:'once' as const,date:'2026-11-02',time:'19:15',timeZone:'Asia/Bangkok'};
const good:ExecutionResult={result:{version:'agent-result.v1',status:'prepared',result:'An original fixture story plan.',lessons:[]},usage:{tokens:5,source:'fixture.actual'}};
class ScheduleExecutors extends CommandExecutors {
  probes=0;calls=0;
  override async detect(config:ExecutorConfig):Promise<ExecutorCapability>{this.probes++;return {id:config.id,adapter:config.adapter,available:true,reason:'fixture_only'};}
  override async execute():Promise<ExecutionResult>{this.calls++;return good;}
}
function setup(t:{after:(f:()=>void)=>void},overrides:Record<string,unknown>={}){
  const dir=mkdtempSync(path.join(tmpdir(),'scc-once-schedule-test-')),filename=path.join(dir,'agent.db');
  const store=new AgentStore(filename),executors=new ScheduleExecutors(path.join(dir,'probe'));
  let now=new Date(futureNow);
  configureRunner(store,{...defaultRunnerConfig(),enabled:true,cooldownSeconds:0,maxConcurrent:1,maxTasksPerRun:1,maxAttempts:1,maxDurationSeconds:180,maxInvocationsPerDay:2,
    executors:[{id:'codex',adapter:'codex',command:'codex',kinds:['story_plan']}],...overrides},true);
  const clock=()=>new Date(now),runner=new AgentRunner(store,path.join(dir,'runner'),executors,clock);
  const add=(id:string)=>runner.work.add({id,kind:'story_plan',title:'Prepare an original fixture story',payload:{brief:'Text preparation only'}});
  const arm=(id='once-fixture')=>{
    const resolved=resolveOneTimeSchedule(once,futureNow);
    store.setRunnerState('schedule-once:'+id,{...resolved,id,status:'armed'});
    return id;
  };
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,filename,store,runner,executors,clock,add,arm,setNow:(value:string)=>{now=new Date(value);}};
}

test('one-time local Bangkok date/time resolves to the exact UTC trigger independently of host timezone',()=>{
  const resolved=resolveOneTimeSchedule(once,futureNow);
  assert.equal(resolved.startAt,'2026-11-02T12:15:00.000Z');
  assert.equal(resolved.expiresAt,'2026-11-02T12:16:00.000Z');
  assert.equal(resolved.timeZone,'Asia/Bangkok');
  const otherZone=resolveOneTimeSchedule({...once,time:'07:15',timeZone:'America/New_York'},futureNow);
  assert.equal(otherZone.startAt,resolved.startAt);
});

test('past, invalid and ambiguous/nonexistent local one-time execution times are rejected',()=>{
  assert.throws(()=>resolveOneTimeSchedule(once,new Date('2026-11-02T12:15:00Z')),/past|future/i);
  assert.throws(()=>resolveOneTimeSchedule(once,new Date('2026-11-02T12:15:01Z')),/past|future/i);
  assert.throws(()=>resolveOneTimeSchedule({...once,date:'2026-02-30'},new Date('2026-01-01T00:00:00Z')));
  assert.throws(()=>resolveOneTimeSchedule({...once,time:'24:00'},futureNow));
  assert.throws(()=>resolveOneTimeSchedule({...once,timeZone:'Not/A_Timezone'},futureNow));
  assert.throws(()=>resolveOneTimeSchedule({...once,date:'2026-03-08',time:'02:30',timeZone:'America/New_York'},new Date('2026-01-01T00:00:00Z')));
  assert.throws(()=>resolveOneTimeSchedule({...once,date:'2026-11-01',time:'01:30',timeZone:'America/New_York'},new Date('2026-01-01T00:00:00Z')));
});

test('one-time export is inert, exact, has no recurrence or catch-up, and retains isolated command context',async t=>{
  const f=setup(t),file=path.join(f.dir,'once.xml');let calls=0;
  const result=await manageSchedule(f.store,path.resolve('.'),f.filename,{action:'export',file,schedule:once},false,async()=>{calls++;throw new Error('No OS calls for export');},f.clock);
  const xml=readFileSync(file,'utf16le');
  assert.equal(result.installed,false);assert.equal(calls,0);
  assert.match(xml,/<StartBoundary>2026-11-02T12:15:00\.000Z<\/StartBoundary>/);
  assert.match(xml,/<EndBoundary>2026-11-02T12:16:00\.000Z<\/EndBoundary>/);
  assert.doesNotMatch(xml,/<Repetition>|<CalendarTrigger>|<RestartOnFailure>/);
  assert.match(xml,/<StartWhenAvailable>false<\/StartWhenAvailable>/);
  assert.match(xml,/<Enabled>false<\/Enabled>/);
  assert.match(xml,/IgnoreNew/);assert.match(xml,/LeastPrivilege/);assert.match(xml,/InteractiveToken/);
  assert.match(xml,/wscript\.exe/);assert.doesNotMatch(xml,/powershell/i);
  const launcher=xml.match(/&quot;([^&]+\.vbs)&quot;/)![1];
  const launchText=readFileSync(launcher,'utf16le');
  assert.ok(launchText.includes(f.filename));assert.match(launchText,/scheduled-host\.ts/);assert.match(launchText,/, 0, True/);
  assert.ok(xml.includes(path.resolve('.')));assert.equal(f.store.runnerState('schedule'),null);
});

test('existing recurring schedule XML remains recurring with its original catch-up behavior',()=>{
  const xml=scheduleXml(path.resolve('.'),path.resolve('isolated-test.db'),300,true);
  assert.match(xml,/<Repetition><Interval>PT300S<\/Interval>/);
  assert.match(xml,/<StartBoundary>2026-01-01T00:00:00<\/StartBoundary>/);
  assert.match(xml,/<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.doesNotMatch(xml,/--schedule/);
});

test('one-time install checks existing OS identity and never force-replaces a task',async t=>{
  if(process.platform!=='win32'){t.skip('Windows registration contract');return;}
  const f=setup(t),calls:Array<{args:string[];cwd:string}>=[];
  const mock:ProcessRunner=async(_command,args,options)=>{calls.push({args,cwd:options.cwd});return {code:args[0]==='/Query'?1:0,stdout:'fixture scheduler only'};};
  const result=await manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install',schedule:once},true,mock,f.clock);
  assert.equal(result.installed,true);
  assert.equal(calls[0].args[0],'/Query');assert.equal(calls[1].args[0],'/Create');
  assert.equal(calls[1].args[2],scheduleIdentity('.',f.filename));assert.ok(!calls[1].args.includes('/F'));
  assert.equal(calls[1].cwd,path.resolve('.'));
  const xml=readFileSync(calls[1].args[4],'utf16le');assert.doesNotMatch(xml,/<Repetition>/);
  assert.match(xml,/<Enabled>true<\/Enabled>/);assert.match(xml,/wscript\.exe/);
  const previousCalls=calls.length;
  await assert.rejects(()=>manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install',schedule:once},true,mock,f.clock),/already|duplicate|existing|one.time/i);
  assert.equal(calls.length,previousCalls,'saved one-time registration prevents repeated installation');
});

test('an existing Windows task prevents one-time registration rather than replacing it',async t=>{
  if(process.platform!=='win32'){t.skip('Windows registration contract');return;}
  const f=setup(t),calls:string[][]=[];
  const mock:ProcessRunner=async(_command,args)=>{calls.push(args);return {code:0,stdout:'existing task'};};
  await assert.rejects(()=>manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install',schedule:once},true,mock,f.clock),/already|duplicate|existing/i);
  assert.equal(calls.length,1);assert.equal(calls[0][0],'/Query');
});

test('disabled runner and missing owner authorization prevent one-time OS installation',async t=>{
  const f=setup(t);let calls=0;
  const mock:ProcessRunner=async()=>{calls++;return {code:0,stdout:'must not be called'};};
  await assert.rejects(()=>manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install',schedule:once},false,mock,f.clock),/authorization|Windows/i);
  f.runner.control('disable');
  await assert.rejects(()=>manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install',schedule:once},true,mock,f.clock),/enabled|authorize|Windows/i);
  assert.equal(calls,0);
});

test('explicit malformed schedule values cannot silently select recurring scheduling',async t=>{
  const f=setup(t);let calls=0;
  const mock:ProcessRunner=async()=>{calls++;return {code:0,stdout:'must not be called'};};
  for(const schedule of [null,false,'once',[]]){
    await assert.rejects(()=>manageSchedule(f.store,path.resolve('.'),f.filename,{action:'export',file:path.join(f.dir,'invalid.xml'),schedule} as any,false,mock,f.clock),/schedule|mode/i);
  }
  assert.equal(calls,0);assert.equal(f.store.runnerState('schedule'),null);
});

test('an existing one-time schedule cannot be overwritten by omitted or explicit recurring mode',async t=>{
  if(process.platform!=='win32'){t.skip('Windows registration contract');return;}
  const f=setup(t);let calls=0;
  f.store.setRunnerState('schedule',{mode:'once',name:scheduleIdentity('.',f.filename),installed:true,scheduleId:'protected-once'});
  const mock:ProcessRunner=async()=>{calls++;return {code:0,stdout:'must not be called'};};
  await assert.rejects(()=>manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install'},true,mock,f.clock),/already|duplicate|existing|one.time/i);
  await assert.rejects(()=>manageSchedule(f.store,path.resolve('.'),f.filename,{action:'install',schedule:{mode:'recurring'}},true,mock,f.clock),/already|duplicate|existing|one.time/i);
  assert.equal(calls,0,'the protected one-time identity must not reach OS replacement');
  assert.equal(f.store.runnerState<any>('schedule')!.scheduleId,'protected-once');
});

test('one-time runtime rejects unknown, early and expired triggers without model calls',async t=>{
  const f=setup(t);f.add('pending');const id=f.arm();
  assert.equal((await f.runner.tick(undefined,'missing')).state,'one_time_unknown');
  assert.equal((await f.runner.tick(undefined,id)).state,'one_time_not_due');
  assert.equal(f.store.runnerState<any>('schedule-once:'+id)!.status,'armed');
  f.setNow('2026-11-02T12:16:01Z');
  assert.equal((await f.runner.tick(undefined,id)).state,'one_time_expired');
  assert.equal(f.executors.calls,0);assert.equal(f.executors.probes,0);
  assert.equal(f.store.getWork('pending')!.status,'ready');
});

test('one-time duplicate dispatch is consumed durably and cannot claim another task',async t=>{
  const f=setup(t,{maxTasksPerRun:2});f.add('first');f.add('second');const id=f.arm();f.setNow('2026-11-02T12:15:00Z');
  assert.equal((await f.runner.tick(undefined,id)).launched,1);
  assert.equal((await f.runner.tick(undefined,id)).state,'one_time_already_consumed');
  assert.equal(f.executors.calls,1);assert.equal(f.store.runnerSessions().length,1);
  assert.equal(f.store.workStatusCounts().ready,1);
  assert.equal(f.store.runnerState<any>('schedule-once:'+id)!.status,'consumed');
});

test('scheduled dispatch respects a disabled runner and cannot spend a launch',async t=>{
  const f=setup(t);f.add('pending');const id=f.arm();f.runner.control('disable');f.setNow('2026-11-02T12:15:00Z');
  assert.equal((await f.runner.tick(undefined,id)).state,'disabled');
  assert.equal(f.executors.calls,0);assert.equal(f.store.runnerSessions().length,0);
  assert.equal(f.store.getWork('pending')!.status,'ready');
});

test('scheduled dispatch spends only the remaining second daily launch and retains task claims',async t=>{
  const f=setup(t);f.add('immediate');assert.equal((await f.runner.tick()).launched,1);
  f.add('scheduled');f.add('unrelated');const id=f.arm();f.setNow('2026-11-02T12:15:00Z');
  assert.equal((await f.runner.tick(undefined,id)).launched,1);
  assert.equal(f.store.runnerSessions().length,2);assert.equal(f.executors.calls,2);
  assert.equal((await f.runner.tick()).state,'daily_invocation_limit');
  assert.equal((await f.runner.tick(undefined,id)).launched,0);
  const completed=f.store.listWork(10).filter(task=>task.status==='prepared');
  assert.equal(completed.length,2);
  for(const task of completed){assert.equal(task.owner,null);assert.equal(task.claimToken,null);assert.equal(task.leaseUntil,null);assert.equal(task.revision,3);}
  assert.equal(f.store.workStatusCounts().ready,1);
});

test('separate CLI invocation persists scheduled evidence and handoff without a model or original session',t=>{
  const f=setup(t),scheduleId='cli-evidence-fixture';f.add('pending-cli');f.runner.control('disable');
  const now=Date.now();
  f.store.setRunnerState('schedule-once:'+scheduleId,{id:scheduleId,status:'armed',startAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()});
  const invoke=()=>{
    const output=spawnSync(process.execPath,['--import','tsx','scripts/agent.ts','runner-tick','--state',f.filename,'--schedule',scheduleId],{cwd:path.resolve('.'),encoding:'utf8',timeout:20000});
    assert.equal(output.status,0,output.stdout+'\n'+output.stderr);
    const envelope=JSON.parse(output.stdout);assert.equal(envelope.ok,true);return envelope.data;
  };
  assert.equal(invoke().state,'disabled');assert.equal(invoke().state,'one_time_already_consumed');
  const directory=path.join(f.dir,'runner','scheduled'),files=readdirSync(directory).filter(name=>name.endsWith('.json'));
  assert.equal(files.length,2,'a duplicate dispatch cannot overwrite the original evidence');
  const records=files.map(file=>JSON.parse(readFileSync(path.join(directory,file),'utf8')));
  assert.ok(records.some(record=>record.result.state==='disabled'));
  assert.ok(records.some(record=>record.result.state==='one_time_already_consumed'));
  for(const record of records){
    assert.equal(record.scheduleId,scheduleId);assert.equal(record.execution.status,'consumed');
    assert.equal(record.status.enabled,false);assert.equal(record.status.budget.invocations,0);
    assert.equal(record.handoff.version,'agent-handoff.v1');assert.equal(record.handoff.networkCalls,0);
    assert.equal(record.handoff.availableIndependentTasks[0].id,'pending-cli');
  }
  assert.equal(f.store.getWork('pending-cli')!.status,'ready');assert.equal(f.store.runnerSessions().length,0);
});
