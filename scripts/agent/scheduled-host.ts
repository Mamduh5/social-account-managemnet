// Windowless Windows launcher starts this bounded host, which captures the real CLI.
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {AgentStore} from './store.js';
import {runProcess,ExecutionError} from './executors.js';

async function main(){
  const [repository,state,scheduleId,timeoutValue]=process.argv.slice(2);
  const timeoutMs=Number(timeoutValue);
  if(!path.isAbsolute(repository??'')||!path.isAbsolute(state??'')||!/^[-a-zA-Z0-9_]{1,100}$/.test(scheduleId??'')||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>21600000)throw new Error('Invalid scheduled host arguments');
  const directory=path.join(path.dirname(state),'runner','launches',Date.now()+'-'+randomUUID());
  mkdirSync(directory,{recursive:true});
  const store=new AgentStore(state),controller=new AbortController();
  const receipt:Record<string,any>={version:'agent-scheduled-host.v1',directory,scheduleId:scheduleId==='-'?null:scheduleId,
    pid:process.pid,parentPid:process.ppid,startedAt:new Date().toISOString(),status:'starting',exitCode:null};
  const save=()=>{writeFileSync(path.join(directory,'host.json'),JSON.stringify(receipt));store.setRunnerState('scheduledHost',receipt);};
  save();
  const parent=setInterval(()=>{try{process.kill(process.ppid,0);}catch{controller.abort();}},1000);
  const abort=()=>controller.abort();process.on('SIGINT',abort);process.on('SIGTERM',abort);
  try{
    const args=['--import',pathToFileURL(path.join(repository,'node_modules/tsx/dist/loader.mjs')).href,path.join(repository,'scripts/agent.ts'),'runner-tick','--state',state,
      ...(scheduleId==='-'?[]:['--schedule',scheduleId])];
    const output=await runProcess(process.execPath,args,{cwd:repository,timeoutMs,maxBytes:1048576,signal:controller.signal,diagnosticsDirectory:directory,
      onSpawn:pid=>{receipt.runnerPid=pid;receipt.status='running';save();}});
    receipt.diagnostics=output.diagnostics;receipt.exitCode=output.code;
    let envelope:any;try{envelope=JSON.parse(output.stdout);}catch{}
    const failure=!envelope?.ok||envelope.data?.state==='failed_or_recovery_required'||
      (scheduleId!=='-'&&!['executed','one_time_already_consumed'].includes(envelope?.data?.state));
    // A blocked model answer is an explicit failure even when the CLI itself finished normally.
    const failedSession=store.runnerSessions({since:receipt.startedAt,limit:20}).some(s=>['failed','recovery_required','not_started'].includes(s.status));
    receipt.result=envelope?.data??null;
    receipt.status=output.code===0&&!failure&&!failedSession?'completed':'failed';
    if(receipt.status==='failed')receipt.error=envelope?.error?.code??envelope?.data?.state??'runner_exit_or_output_invalid';
    process.exitCode=receipt.status==='completed'?0:(output.code||1);
  }catch(error){
    receipt.status='failed';receipt.error=error instanceof ExecutionError?error.code:'scheduled_host_failure';
    if(error instanceof ExecutionError)receipt.diagnostics=error.diagnostics;
    process.exitCode=1;
  }finally{
    clearInterval(parent);process.off('SIGINT',abort);process.off('SIGTERM',abort);
    receipt.finishedAt=new Date().toISOString();receipt.hostExitCode=process.exitCode??0;
    try{save();}finally{store.close();}
  }
}
void main().catch(()=>{process.exitCode=1;});
