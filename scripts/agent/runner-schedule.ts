import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {AgentStore} from './store.js';
import {getRunnerConfig,runnerAuthorized} from './runner-config.js';
import {runProcess,type ProcessRunner} from './executors.js';

const xml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function windowsArgument(s:string):string{return '"'+s.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';}
export function scheduleIdentity(repository:string,state:string){return 'SCC-Agent-'+createHash('sha256').update(path.resolve(repository)+'\n'+path.resolve(state)).digest('hex').slice(0,12);}
export function scheduleXml(repository:string,state:string,intervalSeconds:number,enabled=false){
  if(!Number.isInteger(intervalSeconds)||intervalSeconds<60||intervalSeconds>86400)throw new Error('Invalid scheduler interval');
  const args=['--import',pathToFileURL(path.join(repository,'node_modules/tsx/dist/loader.mjs')).href,path.join(repository,'scripts/agent.ts'),'runner-tick','--state',path.resolve(state)].map(windowsArgument).join(' ');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Bounded SCC preparation work. Generation and publishing stay in existing workers.</Description></RegistrationInfo>
  <Triggers><TimeTrigger><Repetition><Interval>PT${intervalSeconds}S</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2026-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>
  <Principals><Principal id="Owner"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT6H</ExecutionTimeLimit><Enabled>${enabled}</Enabled></Settings>
  <Actions Context="Owner"><Exec><Command>${xml(process.execPath)}</Command><Arguments>${xml(args)}</Arguments><WorkingDirectory>${xml(repository)}</WorkingDirectory></Exec></Actions>
</Task>`;
}
export async function manageSchedule(store:AgentStore,repository:string,state:string,input:{action:'export'|'install'|'remove'|'status';file?:string},ownerAuthorized=false,execute:ProcessRunner=runProcess){
  if(!['export','install','remove','status'].includes(input.action)||Object.keys(input).some(k=>!['action','file'].includes(k)))throw new Error('Supply scheduler action export/install/remove/status and optional file');
  const config=getRunnerConfig(store),name=scheduleIdentity(repository,state);
  if(input.action==='export'){
    if(typeof input.file!=='string'||!input.file.trim())throw new Error('Schedule export requires a new output file');
    const file=path.resolve(input.file);mkdirSync(path.dirname(file),{recursive:true});
    writeFileSync(file,'\ufeff'+scheduleXml(repository,state,config.intervalSeconds),{encoding:'utf16le',flag:'wx'});
    return {name,file,installed:false,enabled:false,notice:'Export only; no OS task registered.'};
  }
  if(process.platform!=='win32')throw new Error('Automatic scheduling requires Windows Task Scheduler; invoke runner-tick from your OS scheduler elsewhere');
  if(input.action!=='status'&&!ownerAuthorized)throw new Error('Installing or removing an OS task requires separate explicit owner authorization');
  if(input.action==='install'&&(!config.enabled||config.paused||!runnerAuthorized(store,config)))throw new Error('Configure and explicitly authorize the enabled runner before installing its schedule');
  const command=path.join(process.env.SystemRoot??'C:\\Windows','System32','schtasks.exe');
  let args:string[];
  if(input.action==='install'){
    const file=path.join(path.dirname(state),'runner-schedule-'+Date.now()+'.xml');mkdirSync(path.dirname(file),{recursive:true});
    writeFileSync(file,'\ufeff'+scheduleXml(repository,state,config.intervalSeconds,true),{encoding:'utf16le',flag:'wx'});
    args=['/Create','/TN',name,'/XML',file,'/F'];
  }else args=input.action==='remove'?['/Delete','/TN',name,'/F']:['/Query','/TN',name];
  const result=await execute(command,args,{cwd:repository,timeoutMs:15000,maxBytes:64000});
  if(input.action!=='status'&&result.code!==0)throw new Error('Task Scheduler operation failed; runner configuration retained. Inspect the task with the owner account.');
  const status={name,installed:input.action==='remove'?false:result.code===0,lastVerifiedAt:new Date().toISOString(),source:'windows_task_scheduler',requiresSignedInUser:true};
  store.setRunnerState('schedule',status);return status;
}
