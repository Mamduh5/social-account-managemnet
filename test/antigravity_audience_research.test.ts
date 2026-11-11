import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {AgentStore} from '../scripts/agent/store.js';
import {AgentRunner} from '../scripts/agent/runner.js';
import {AgentWorkQueue} from '../scripts/agent/work-queue.js';
import {configureRunner,executorSchema} from '../scripts/agent/runner-config.js';
import {CommandExecutors,parsePageContentOutput,type ProcessRunner} from '../scripts/agent/executors.js';
import {WeeklyContent} from '../scripts/agent/weekly-content.js';
import {SccAdapter} from '../scripts/agent/scc.js';
import {JsonClient} from '../scripts/agent/http.js';

const require=createRequire(import.meta.url);
const wrapperPath=path.resolve('scripts/agent/antigravity-wrapper.cjs');
const wrapper=fs.readFileSync(wrapperPath,'utf8').replace(/^#!.*\n/,'');
const now='2026-11-11T06:00:00.000Z';
const evidence={id:'evidence-original',kind:'audience_opinion',summary:'One authorized Group observation; never a trend.',sourceRef:'owner:authorized-observation',observedAt:now,validUntil:'2026-11-13T06:00:00.000Z',accountId:'page',groupId:'group',privacy:'authorized_group',relevanceConfirmed:true,independentlyVerified:false,provenance:'owner_supplied_not_independently_verified',limitations:['Small unverified sample; no private details']};
const idea={accountId:'page',groupId:'group',topic:'One original useful discussion',intendedAudience:'Exact Group audience',evidenceIds:[evidence.id],interestReason:'A response to one observed question',originalContribution:'Original explanation',recommendedFormat:'text',formatReason:'Text is sufficient',factualRequirements:[],confidence:'low',limitations:['No population claim']};
const analysis={version:'weekly-analysis-result.v1',ideas:[idea],limitations:['Supplied evidence only']};
const envelope=()=>({status:'SUCCESS',structured_output:{version:'agent-result.v1',status:'prepared',result:JSON.stringify(analysis),lessons:[]},usage:{total_tokens:42}});

// Run the real wrapper and routing modules, replacing only its native model process.
function wrapped(context:any,args:string[],response:any){
  const calls:any[]=[],stdout:string[]=[],stderr:string[]=[];
  const fakeFs={...fs,readFileSync:(file:any,...rest:any[])=>file===0?JSON.stringify(context):(fs.readFileSync as any)(file,...rest)};
  const localRequire=(id:string)=>id==='fs'?fakeFs:id==='child_process'?{spawnSync:(command:string,argv:string[],options:any)=>{
    calls.push({command,argv,options,schema:JSON.parse(fs.readFileSync(argv[argv.indexOf('--json-schema')+1],'utf8'))});return response;
  }}:id.startsWith('./')?require('../scripts/agent/'+id.slice(2)):require(id);
  const proc={argv:['node',wrapperPath,...args],exitCode:0,exit:(code:number)=>{proc.exitCode=code;throw new Error('FIXTURE_EXIT');}};
  try{new Function('require','process','console',wrapper)(localRequire,proc,{log:(s:string)=>stdout.push(s),error:(s:string)=>stderr.push(s)});}catch(error){if((error as Error).message!=='FIXTURE_EXIT'){proc.exitCode=1;stderr.push((error as Error).message);}}
  return {calls,code:proc.exitCode,stdout:stdout.join('\n'),stderr};
}

function fixture(t:any,settings:Record<string,unknown>={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'scc-audience-admission-')),state=path.join(directory,'agent.db');
  const store=new AgentStore(state),stores=[store];let clockMs=Date.parse(now),requests=0;
  const scc=new SccAdapter(new JsonClient('http://127.0.0.1:13997',{fetch:async(url,init)=>{
    requests++;assert.equal(init?.method??'GET','GET');assert.equal(new URL(String(url)).pathname,'/api/operator/pages/page/context');
    return Response.json({account:{id:'page',graphId:'123',identityVerifiedAt:now},contextFingerprint:'exact-page-context',rules:['Exact Page persona; no invented experience.'],voice:{profile:{tone:'modest'}},media:{images:[],videos:[]}});
  }}));
  const control={available:true,response:{status:0,stdout:JSON.stringify(envelope())}};
  const probes:any[]=[],calls:any[]=[];
  const processRunner:ProcessRunner=async(_command,args,options)=>{
    if(args.includes('--help')){probes.push(args);if(!control.available)return {code:1,stdout:''};}
    const run=wrapped(options.stdin?JSON.parse(options.stdin):{},args.slice(1),control.response);calls.push(...run.calls);
    assert(!run.stderr.length||run.code!==0);return {code:run.code,stdout:run.stdout};
  };
  const executors=new CommandExecutors(path.join(directory,'probe'),processRunner),clock=()=>new Date(clockMs);
  const executor={id:'antigravity',adapter:'json',command:wrapperPath,args:['--model','gemini-3.8-flash-medium'],kinds:['text_post','prepare_video','research_concept','image_post','audience_research'],isolationReviewed:true,liveResearch:true};
  configureRunner(store,{enabled:true,cooldownSeconds:0,maxAttempts:1,executors:[executor],...settings},true);
  const weekly=new WeeklyContent(store,scc,clock),runner=new AgentRunner(store,path.join(directory,'runner'),executors,clock);
  const input={id:'analysis-original',planId:'existing-week',revision:1,accountId:'page',graphId:'123',evidence:[evidence],brief:'Analyze this authorized evidence snapshot',editorialRules:JSON.stringify({persona:'Exact Page',groups:[{id:'group',rules:'Original relevant discussion only'}]})};
  t.after(()=>{for(const db of stores)try{db.close();}catch{}fs.rmSync(directory,{recursive:true,force:true});});
  return {directory,state,store,scc,weekly,runner,input,control,calls,probes,clock,requests:()=>requests,advance:(ms=301000)=>{clockMs+=ms;},restart:()=>{store.close();const next=new AgentStore(state);stores.push(next);return {store:next,weekly:new WeeklyContent(next,scc,clock),runner:new AgentRunner(next,path.join(directory,'runner'),executors,clock)};}};
}

test('exact owner-authorized kind extension admits weekly analysis through the real wrapper and usage parser',async t=>{
  const f=fixture(t),config=f.runner.config(),old=structuredClone(config);old.executors[0].kinds=old.executors[0].kinds.filter(k=>k!=='audience_research');configureRunner(f.store,old,true);
  await f.weekly.analyze(f.input);assert.equal((await f.runner.tick()).state,'executor_unavailable_or_unsupported_task');assert.equal(f.calls.length,0);
  assert.throws(()=>configureRunner(f.store,config),/authorization/);configureRunner(f.store,config,true);f.advance();
  assert.equal((await f.runner.tick()).launched,1);assert.equal(f.calls.length,1);const call=f.calls[0];
  assert.deepEqual(call.argv.slice(0,2),['--model','gemini-3.8-flash-medium']);assert.match(call.command,/agy\.exe$/);assert.equal(call.options.timeout,180000);
  for(const flag of ['--json-schema','--disable-slash-commands','--sandbox','--mode'])assert(call.argv.includes(flag));
  assert.equal(call.schema.properties.version.const,'agent-result.v1');assert.match(call.options.input,/No tools, network, browser/);
  const received=JSON.parse(call.options.input.slice(call.options.input.indexOf('\n')+1));
  assert.equal(received.task.kind,'audience_research');assert.deepEqual(received.task.payload.weeklyAnalysis.evidence,[evidence]);assert.equal(received.task.payload.weeklyAnalysis.editorialRules,f.input.editorialRules);assert.match(received.task.payload.weeklyAnalysis.page.rules[0],/Exact Page persona/);assert.match(received.instructions,/owner-attested, not independently verified/);assert.deepEqual(received.knowledge,[]);
  assert.equal(f.weekly.analysisResult(f.input.id).ideas[0].evidenceIds[0],evidence.id);assert.equal(f.store.runnerSessions()[0].usage.tokens,42);assert.equal(f.runner.status().budget.actualTokens,42);assert.equal(f.requests(),1);
  assert.deepEqual({...config,executors:config.executors.map(e=>({...e,kinds:e.kinds.filter(k=>k!=='audience_research')}))},old);
});

test('restart and duplicate enqueue retain the original result, charge and task identity',async t=>{
  const f=fixture(t);await f.weekly.analyze(f.input);await f.runner.tick();const original=JSON.stringify(f.store.runnerSessions());const next=f.restart();
  await next.weekly.analyze({...f.input,revision:2});assert.equal(next.store.workCount(),1);assert.equal(next.weekly.analysisResult(f.input.id).ideas.length,1);f.advance();assert.equal((await next.runner.tick()).launched,0);assert.equal(f.calls.length,1);assert.equal(JSON.stringify(next.store.runnerSessions()),original);
  await assert.rejects(()=>next.weekly.analyze({...f.input,brief:'Changed evidence direction'}),/identity changed/);
});

test('missing runner authorization blocks before capability probe or model charge',async t=>{
  const f=fixture(t);await f.weekly.analyze(f.input);f.store.setRunnerState('authorization',null);assert.equal((await f.runner.tick()).state,'authorization_required');assert.equal(f.calls.length,0);assert.equal(f.probes.length,0);assert.equal(f.store.runnerSessions().length,0);
});

test('exhausted invocation quota and token admission stay blocked without another model call',async t=>{
  for(const settings of [{maxInvocationsPerDay:1},{dailyTokenBudget:50,tokenReservation:12}]){
    const f=fixture(t,settings);await f.weekly.analyze(f.input);await f.runner.tick();await f.weekly.analyze({...f.input,id:'second'});f.advance();
    assert.equal((await f.runner.tick()).state,'maxInvocationsPerDay' in settings?'daily_invocation_limit':'daily_token_admission_limit');assert.equal(f.calls.length,1);assert.equal(f.store.getWork('second')!.status,'ready');
  }
});

test('unavailable executor and stale evidence never acquire a model claim',async t=>{
  const f=fixture(t);await f.weekly.analyze(f.input);f.control.available=false;assert.equal((await f.runner.tick()).state,'executor_unavailable_or_unsupported_task');assert.equal(f.store.runnerSessions().length,0);assert.equal(f.calls.length,0);
  f.control.available=true;f.advance(3*86400000);assert.equal((await f.runner.tick()).launched,0);assert.equal(f.calls.length,0);assert.equal(f.weekly.status({taskIds:[f.input.id]}).tasks[0].hold,'weekly_evidence_stale_or_invalid');
});

test('native quota failure remains one uncertain original with no fallback, retry or fabricated usage',async t=>{
  const f=fixture(t);f.control.response={status:1,stdout:''};await f.weekly.analyze(f.input);assert.equal((await f.runner.tick()).state,'failed_or_recovery_required');assert.equal(f.calls.length,1);assert.equal(f.store.runnerSessions()[0].status,'recovery_required');assert.equal(f.store.runnerSessions()[0].usage,null);
  f.advance();const next=f.restart();await next.runner.tick();assert.equal(f.calls.length,1);assert.equal(next.store.runnerSessions().length,1);assert.equal(next.store.getWork(f.input.id)!.status,'blocked');
});

test('missing reported usage stays unknown and holds further token-budgeted analysis',async t=>{
  const f=fixture(t,{dailyTokenBudget:100,tokenReservation:12}),reply=envelope();delete (reply as any).usage;f.control.response={status:0,stdout:JSON.stringify(reply)};
  await f.weekly.analyze(f.input);await f.runner.tick();assert.equal(f.store.runnerSessions()[0].usage,null);await f.weekly.analyze({...f.input,id:'second'});f.advance();assert.equal((await f.runner.tick()).state,'unknown_usage_hold');assert.equal(f.calls.length,1);
});

test('returned ideas cannot import invented evidence or another Page or Group',async t=>{
  for(const change of [{evidenceIds:['invented']},{accountId:'other-page'},{groupId:'other-group'}]){
    const f=fixture(t),reply=envelope();reply.structured_output.result=JSON.stringify({...analysis,ideas:[{...idea,...change}]});f.control.response={status:0,stdout:JSON.stringify(reply)};
    await f.weekly.analyze(f.input);await f.runner.tick();assert.throws(()=>f.weekly.analysisResult(f.input.id),/unknown evidence|another destination/);assert.equal(f.calls.length,1);assert.equal(f.store.runnerSessions()[0].usage.tokens,42);
  }
});

test('invalid task kinds and mismatched weekly contracts fail closed without model invocation',t=>{
  const f=fixture(t);assert.throws(()=>new AgentWorkQueue(f.store).add({id:'invalid',kind:'scrape_groups' as any,title:'Rejected'}),/supported kind/);assert.throws(()=>executorSchema.parse({...f.runner.config().executors[0],kinds:['scrape_groups']}));
  for(const task of [{kind:'text_post',payload:{weeklyAnalysis:{version:'weekly-analysis.v1'}}},{kind:'audience_research',payload:{weeklyAnalysis:{version:'other'}}}]){const r=wrapped({task},['--model','gemini-3.8-flash-medium'],{status:0,stdout:JSON.stringify(envelope())});assert.equal(r.code,1);assert.equal(r.calls.length,0);}
  assert.throws(()=>parsePageContentOutput(JSON.stringify({...envelope().structured_output,usage:{tokens:-1,source:'invalid'}})),/usage/);
  assert.throws(()=>parsePageContentOutput(JSON.stringify({...envelope().structured_output,unrecognized:true})),/unrecognized/i);
});
