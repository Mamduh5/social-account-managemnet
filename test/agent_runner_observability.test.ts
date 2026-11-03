import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {AgentStore} from '../scripts/agent/store.js';
import {AgentRunner} from '../scripts/agent/runner.js';
import {configureRunner,defaultRunnerConfig} from '../scripts/agent/runner-config.js';
import {runProcess,ExecutionError} from '../scripts/agent/executors.js';
import {pathToFileURL} from 'node:url';

function directory(t:{after:(f:()=>void)=>void}){
  const dir=mkdtempSync(path.join(tmpdir(),'scc-agent-diagnostics-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;
}
test('process logs capture stdout, stderr and exit status with credentials redacted across chunks',async t=>{
  const dir=directory(t),logs=path.join(dir,'logs');
  const output=await runProcess(process.execPath,['-e','process.stdout.write("original useful output\\n");process.stderr.write("Bearer fixture-");setTimeout(()=>{process.stderr.write("token api_key=private-value sk-fixtureSecret123\\n");process.exit(7)},50)'],
    {cwd:dir,timeoutMs:2000,maxBytes:10000,diagnosticsDirectory:logs});
  assert.equal(output.code,7);assert.equal(output.stdout,'original useful output\n');
  const receipt=JSON.parse(readFileSync(path.join(logs,'process.json'),'utf8'));
  assert.equal(receipt.exitCode,7);assert.ok(receipt.pid>0);assert.ok(receipt.finishedAt);assert.ok(receipt.stderrBytes>0);
  const stderr=readFileSync(path.join(logs,'stderr.log'),'utf8');
  assert.match(stderr,/REDACTED/);assert.doesNotMatch(stderr,/fixture-token|private-value|sk-fixtureSecret123/);
  assert.equal(readFileSync(path.join(logs,'stdout.log'),'utf8'),output.stdout);
});
test('timeout terminates the exact fixture child and retains its partial output and failure receipt',async t=>{
  const dir=directory(t),logs=path.join(dir,'logs');
  await assert.rejects(()=>runProcess(process.execPath,['-e','console.error("fixture waiting for input");setInterval(()=>{},1000)'],
    {cwd:dir,timeoutMs:350,maxBytes:10000,diagnosticsDirectory:logs}),error=>error instanceof ExecutionError&&error.code==='execution_timeout');
  const receipt=JSON.parse(readFileSync(path.join(logs,'process.json'),'utf8'));
  assert.equal(receipt.failure,'execution_timeout');assert.ok(receipt.finishedAt);
  assert.match(readFileSync(path.join(logs,'stderr.log'),'utf8'),/fixture waiting for input/);
  assert.throws(()=>process.kill(receipt.pid,0),'timed-out fixture is no longer running');
});
test('failed supervised invocation keeps useful diagnostics on its receipt and never retries',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'scc-agent-failure-')),store=new AgentStore(path.join(dir,'agent.db'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const fixture=path.join(dir,'failure.cjs');
  writeFileSync(fixture,'if(process.argv.includes("--help")){console.log("agent-result.v1")}else{console.error("FIXTURE_AUTH_REQUIRED: sign in manually before retrying");process.exit(7)}');
  configureRunner(store,{...defaultRunnerConfig(),enabled:true,cooldownSeconds:0,maxAttempts:1,
    executors:[{id:'failure_fixture',adapter:'json',command:process.execPath,args:[fixture],isolationReviewed:true}]},true);
  const runner=new AgentRunner(store,path.join(dir,'runner'));
  runner.work.add({id:'failure-task',kind:'story_plan',title:'Disposable diagnostic fixture'});
  assert.equal((await runner.tick()).state,'failed_or_recovery_required');
  const session=store.runnerSessions()[0];
  assert.equal(session.error,'executor_exit_nonzero');assert.equal(session.diagnostics.exitCode,7);
  assert.match(readFileSync(path.join(session.diagnostics.directory,'stderr.log'),'utf8'),/FIXTURE_AUTH_REQUIRED/);
  assert.equal(store.getWork('failure-task')!.claimToken,null);assert.equal(store.getWork('failure-task')!.status,'blocked');
  assert.equal((await runner.tick()).launched,0);assert.equal(store.runnerSessions().length,1);
});

test('scheduled host identifies a blocked model answer instead of reporting executed as its error',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'scc-blocked-host-')),filename=path.join(dir,'agent.db'),store=new AgentStore(filename);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const fixture=path.join(dir,'blocked.cjs');
  writeFileSync(fixture,'if(process.argv.includes("--help")){console.log("agent-result.v1")}else{console.log(JSON.stringify({version:"agent-result.v1",status:"blocked",result:"Missing required source evidence",lessons:[]}))}');
  configureRunner(store,{...defaultRunnerConfig(),enabled:true,cooldownSeconds:0,executors:[{id:'blocked_fixture',adapter:'json',command:process.execPath,args:[fixture],isolationReviewed:true}]},true);
  new AgentRunner(store,path.join(dir,'runner')).work.add({id:'blocked-plan',kind:'story_plan',title:'Blocked answer fixture'});
  const result=await runProcess(process.execPath,['--import',pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href,path.resolve('scripts/agent/scheduled-host.ts'),path.resolve('.'),filename,'-','15000'],{cwd:path.resolve('.'),timeoutMs:20000,maxBytes:64000});
  assert.equal(result.code,1);
  assert.equal(store.runnerState<any>('scheduledHost')!.error,'agent_returned_blocked');
  assert.equal(store.runnerSessions().length,1);
});
