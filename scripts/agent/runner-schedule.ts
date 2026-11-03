import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {AgentStore} from './store.js';
import {getRunnerConfig,runnerAuthorized} from './runner-config.js';
import {runProcess,type ProcessRunner} from './executors.js';

const xml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function windowsArgument(s:string):string{return '"'+s.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';}
function writeLauncher(repository:string,state:string,timeoutMs:number,scheduleId?:string):string {
  const directory=path.join(path.dirname(state),'runner','launchers');mkdirSync(directory,{recursive:true});
  const file=path.join(directory,randomUUID()+'.vbs');
  const command=[process.execPath,'--import',pathToFileURL(path.join(repository,'node_modules/tsx/dist/loader.mjs')).href,
    path.join(repository,'scripts/agent/scheduled-host.ts'),repository,path.resolve(state),scheduleId??'-',String(timeoutMs)].map(windowsArgument).join(' ');
  const quoted=(s:string)=>'"'+s.replace(/"/g,'""')+'"';
  // WScript is a GUI executable; Run(..., 0, True) hides Node and waits for its real exit.
  // The fallback receipt also records bootstrap failures before the Node host can log.
  const script=`Option Explicit\r\nDim shell, code, files, receipt\r\nOn Error Resume Next\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.CurrentDirectory = ${quoted(repository)}\r\ncode = shell.Run(${quoted(command)}, 0, True)\r\nIf Err.Number <> 0 Then code = 1\r\nSet files = CreateObject("Scripting.FileSystemObject")\r\nSet receipt = files.CreateTextFile(WScript.ScriptFullName & ".last-exit.json", True, True)\r\nreceipt.Write "{""exitCode"":" & code & "}"\r\nreceipt.Close\r\nWScript.Quit code\r\n`;
  writeFileSync(file,'\ufeff'+script,{encoding:'utf16le',flag:'wx'});return file;
}
export function scheduleIdentity(repository:string,state:string){return 'SCC-Agent-'+createHash('sha256').update(path.resolve(repository)+'\n'+path.resolve(state)).digest('hex').slice(0,12);}
export type OneTimeSpec={mode:'once';date:string;time:string;timeZone:string};
export type OneTimeSchedule=OneTimeSpec&{startAt:string;expiresAt:string;id?:string};
type ScheduleInput={action:'export'|'install'|'remove'|'status';file?:string;schedule?:OneTimeSpec|{mode:'recurring'}};

/** Resolve wall time through IANA rules; gaps and ambiguous DST times fail closed. */
export function resolveOneTimeSchedule(spec:OneTimeSpec,now=new Date()):OneTimeSchedule {
  if(Object.keys(spec).some(k=>!['mode','date','time','timeZone'].includes(k))||
    !/^\d{4}-\d{2}-\d{2}$/.test(spec.date)||!/^\d{2}:\d{2}(:\d{2})?$/.test(spec.time)||typeof spec.timeZone!=='string')throw new Error('Supply one-time date YYYY-MM-DD, time HH:mm[:ss], and IANA timeZone');
  const wall=spec.date+'T'+spec.time+(spec.time.length===5?':00':'');
  const nominal=Date.parse(wall+'Z');
  if(!Number.isFinite(nominal)||new Date(nominal).toISOString().slice(0,19)!==wall)throw new Error('Invalid one-time local date or time');
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:spec.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const local=(ms:number)=>{const p=Object.fromEntries(formatter.formatToParts(ms).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;};
  const matches=new Set<number>();
  for(let hours=-36;hours<=36;hours+=6){
    const sample=nominal+hours*3600000,offset=Date.parse(local(sample)+'Z')-sample,candidate=nominal-offset;
    if(local(candidate)===wall)matches.add(candidate);
  }
  if(matches.size!==1)throw new Error('One-time local time is nonexistent or ambiguous in this timezone');
  const start=[...matches][0];if(start<=now.getTime())throw new Error('One-time execution time must be in the future');
  return {...spec,startAt:new Date(start).toISOString(),expiresAt:new Date(start+60000).toISOString()};
}
export function scheduleXml(repository:string,state:string,intervalSeconds:number,enabled=false,once?:OneTimeSchedule,launcher?:string){
  if(!Number.isInteger(intervalSeconds)||intervalSeconds<60||intervalSeconds>86400)throw new Error('Invalid scheduler interval');
  const args=['--import',pathToFileURL(path.join(repository,'node_modules/tsx/dist/loader.mjs')).href,path.join(repository,'scripts/agent.ts'),'runner-tick','--state',path.resolve(state),...(once?.id?['--schedule',once.id]:[])].map(windowsArgument).join(' ');
  const trigger=once?`<StartBoundary>${xml(once.startAt)}</StartBoundary><EndBoundary>${xml(once.expiresAt)}</EndBoundary>`:
    `<Repetition><Interval>PT${intervalSeconds}S</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2026-01-01T00:00:00</StartBoundary>`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Bounded SCC preparation work. Generation and publishing stay in existing workers.</Description></RegistrationInfo>
  <Triggers><TimeTrigger>${trigger}<Enabled>true</Enabled></TimeTrigger></Triggers>
  <Principals><Principal id="Owner"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>${!once}</StartWhenAvailable><ExecutionTimeLimit>PT6H</ExecutionTimeLimit><Enabled>${enabled}</Enabled></Settings>
  <Actions Context="Owner"><Exec><Command>${xml(launcher?path.join(process.env.SystemRoot??'C:\\Windows','System32','wscript.exe'):process.execPath)}</Command><Arguments>${xml(launcher?['/B','/NoLogo',launcher].map(windowsArgument).join(' '):args)}</Arguments><WorkingDirectory>${xml(repository)}</WorkingDirectory></Exec></Actions>
</Task>`;
}
export async function manageSchedule(store:AgentStore,repository:string,state:string,input:ScheduleInput,ownerAuthorized=false,execute:ProcessRunner=runProcess,clock:()=>Date=()=>new Date()){
  if(!['export','install','remove','status'].includes(input.action)||Object.keys(input).some(k=>!['action','file','schedule'].includes(k)))throw new Error('Supply scheduler action export/install/remove/status and optional file/schedule');
  if(input.schedule!==undefined&&(!input.schedule||typeof input.schedule!=='object'||Array.isArray(input.schedule)))throw new Error('Invalid scheduler mode');
  if(input.schedule&&(!['export','install'].includes(input.action)||!['once','recurring'].includes(input.schedule.mode)||
    input.schedule.mode==='recurring'&&Object.keys(input.schedule).some(k=>k!=='mode')))throw new Error('Invalid scheduler mode or action');
  const once=input.schedule?.mode==='once'?resolveOneTimeSchedule(input.schedule,clock()):undefined;
  if(once)once.id=randomUUID();
  const config=getRunnerConfig(store),name=scheduleIdentity(repository,state);
  const timeoutMs=Math.min(21600000,((once?1:config.maxTasksPerRun)*config.maxDurationSeconds+config.executors.length*10+30)*1000);
  if(input.action==='export'){
    if(typeof input.file!=='string'||!input.file.trim())throw new Error('Schedule export requires a new output file');
    const file=path.resolve(input.file);mkdirSync(path.dirname(file),{recursive:true});
    const launcher=writeLauncher(repository,state,timeoutMs,once?.id);
    writeFileSync(file,'\ufeff'+scheduleXml(repository,state,config.intervalSeconds,false,once,launcher),{encoding:'utf16le',flag:'wx'});
    return {name,file,installed:false,enabled:false,notice:'Export only; no OS task registered.'};
  }
  if(process.platform!=='win32')throw new Error('Automatic scheduling requires Windows Task Scheduler; invoke runner-tick from your OS scheduler elsewhere');
  if(input.action!=='status'&&!ownerAuthorized)throw new Error('Installing or removing an OS task requires separate explicit owner authorization');
  if(input.action==='install'&&(!config.enabled||config.paused||!runnerAuthorized(store,config)))throw new Error('Configure and explicitly authorize the enabled runner before installing its schedule');
  const command=path.join(process.env.SystemRoot??'C:\\Windows','System32','schtasks.exe');
  let args:string[];
  if(input.action==='install'){
    if(store.runnerState('schedule')?.mode==='once')throw new Error('One-time schedule already registered or attempted; inspect before explicit removal');
    if(once){
      store.transaction(()=>{
        if(store.runnerState('schedule')?.mode==='once')throw new Error('One-time schedule already registered or attempted; inspect before explicit removal');
        store.setRunnerState('schedule-once:'+once.id,{...once,status:'installing'});
        store.setRunnerState('schedule',{name,mode:'once',scheduleId:once.id,installed:false,registration:'pending'});
      });
      const existing=await execute(command,['/Query','/TN',name],{cwd:repository,timeoutMs:15000,maxBytes:64000});
      if(existing.code===0)throw new Error('Windows task already exists; refusing duplicate one-time registration');
      // A slow OS probe cannot turn registration into a late execution.
      if(Date.parse(once.startAt)<=clock().getTime())throw new Error('One-time execution time passed before installation');
      store.setRunnerState('schedule-once:'+once.id,{...once,status:'armed'});
    }
    const file=path.join(path.dirname(state),'runner-schedule-'+Date.now()+'.xml');mkdirSync(path.dirname(file),{recursive:true});
    const launcher=writeLauncher(repository,state,timeoutMs,once?.id);
    writeFileSync(file,'\ufeff'+scheduleXml(repository,state,config.intervalSeconds,true,once,launcher),{encoding:'utf16le',flag:'wx'});
    args=['/Create','/TN',name,'/XML',file,...(once?[]:['/F'])];
  }else args=input.action==='remove'?['/Delete','/TN',name,'/F']:['/Query','/TN',name];
  const result=await execute(command,args,{cwd:repository,timeoutMs:15000,maxBytes:64000});
  if(input.action!=='status'&&result.code!==0)throw new Error('Task Scheduler operation failed; runner configuration retained. Inspect the task with the owner account.');
  const previous=store.runnerState('schedule');
  const status={...(input.action==='status'?previous:{}),...(once?{mode:'once',scheduleId:once.id,startAt:once.startAt,expiresAt:once.expiresAt,timeZone:once.timeZone}:{}),name,installed:input.action==='remove'?false:result.code===0,lastVerifiedAt:clock().toISOString(),source:'windows_task_scheduler',requiresSignedInUser:true};
  store.setRunnerState('schedule',status);return status;
}
