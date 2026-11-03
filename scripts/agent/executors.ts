import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import type {ExecutorConfig} from './runner-config.js';

export const agentResultSchema=z.object({
  version:z.literal('agent-result.v1'),status:z.enum(['prepared','done','blocked']),
  result:z.string().min(1).max(48000),
  // Agent prose is stored as an assumption; the runner never promotes it to observed fact.
  lessons:z.array(z.string().min(1).max(2000)).max(5),
}).strict();
export type AgentResult=z.infer<typeof agentResultSchema>;
export interface ExecutionResult {result:AgentResult;usage:{tokens:number;source:string}|null;diagnostics?:ProcessDiagnostics;}
export interface ExecutorCapability {id:string;adapter:ExecutorConfig['adapter'];available:boolean;reason:string;command?:string;args?:string[];usageAccounting?:string;}
export class ExecutionError extends Error {
  constructor(readonly code:string,readonly definitelyNotStarted=false,readonly diagnostics?:ProcessDiagnostics){super(code);}
}
export interface ProcessDiagnostics {directory:string;pid:number|null;startedAt:string;finishedAt?:string;exitCode:number|null;signal:string|null;failure:string|null;stdoutBytes:number;stderrBytes:number;}
export interface ProcessOutput {stdout:string;code:number|null;diagnostics?:ProcessDiagnostics;}
export interface ProcessOptions {cwd:string;stdin?:string;timeoutMs:number;maxBytes:number;signal?:AbortSignal;env?:NodeJS.ProcessEnv;onSpawn?:(pid:number)=>void;diagnosticsDirectory?:string;}
export type ProcessRunner=(command:string,args:string[],options:ProcessOptions)=>Promise<ProcessOutput>;

// Logs remain local and bounded. Never persist environment, stdin, or raw credential fields.
export function redactDiagnostics(text:string):string {
  return text.replace(/\b(?:sk-[\w-]+|AIza[\w-]+|eyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?)/g,'[REDACTED]')
    .replace(/(\bBearer\s+)[^\s"',}]+/gi,'$1[REDACTED]')
    .replace(/((?:access_token|refresh_token|api_key|authorization|password|client_secret)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,'$1[REDACTED]');
}

// No shell evaluation. Only the exact child tree created by this invocation is terminated.
export const runProcess:ProcessRunner=(command,args,options)=>new Promise((resolve,reject)=>{
  if(options.signal?.aborted){reject(new ExecutionError('shutdown_before_launch',true));return;}
  const diagnostics:ProcessDiagnostics|undefined=options.diagnosticsDirectory?{directory:options.diagnosticsDirectory,pid:null,startedAt:new Date().toISOString(),exitCode:null,signal:null,failure:null,stdoutBytes:0,stderrBytes:0}:undefined;
  let stdout='',stderr='';
  const persist=(finished=false)=>{
    if(!diagnostics)return;
    if(finished)diagnostics.finishedAt=new Date().toISOString();
    mkdirSync(diagnostics.directory,{recursive:true});
    writeFileSync(path.join(diagnostics.directory,'process.json'),JSON.stringify(diagnostics));
    writeFileSync(path.join(diagnostics.directory,'stdout.log'),redactDiagnostics(stdout));
    writeFileSync(path.join(diagnostics.directory,'stderr.log'),redactDiagnostics(stderr));
  };
  try{persist();}catch{reject(new ExecutionError('diagnostics_write_failed',true));return;}
  let child:ReturnType<typeof spawn>;
  try {child=spawn(command,args,{cwd:options.cwd,env:options.env??safeEnvironment(),shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});}
  catch {reject(new ExecutionError('spawn_failed',true));return;}
  let bytes=0,failure:string|null=null,spawned=false,killTimer:NodeJS.Timeout|undefined,terminationTimer:NodeJS.Timeout|undefined;
  const terminate=()=>{
    if(!child.pid)return;
    if(process.platform==='win32'){
      // taskkill is a native executable; PID is created here and no shell is used.
      const killer=spawn(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});
      killer.on('error',()=>child.kill());
      killer.on('close',code=>{if(code!==0)child.kill('SIGKILL');});
    }else {try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}
      killTimer=setTimeout(()=>{try{process.kill(-child.pid!,'SIGKILL');}catch{}},1000);}
  };
  const stop=(code:string)=>{if(failure)return;failure=code;terminate();
    terminationTimer=setTimeout(()=>{
      // Return an explicit unknown if OS termination itself fails; do not hang the scheduler.
      child.kill('SIGKILL');child.stdin?.destroy();child.stdout?.destroy();child.stderr?.destroy();child.unref();
      clearTimeout(timer);if(killTimer)clearTimeout(killTimer);options.signal?.removeEventListener('abort',abort);
      if(diagnostics){diagnostics.failure='termination_unconfirmed';try{persist(true);}catch{}}
      reject(new ExecutionError('termination_unconfirmed',false,diagnostics));
    },2500);
  };
  const abort=()=>stop('interrupted');
  const timer=setTimeout(()=>stop('execution_timeout'),options.timeoutMs);
  options.signal?.addEventListener('abort',abort,{once:true});
  child.on('spawn',()=>{spawned=true;try{if(diagnostics){diagnostics.pid=child.pid!;persist();}options.onSpawn?.(child.pid!);}catch{stop('receipt_write_failed');}});
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data',(chunk:string)=>{const size=Buffer.byteLength(chunk);bytes+=size;if(diagnostics)diagnostics.stdoutBytes+=size;if(bytes>options.maxBytes)stop('output_limit');else stdout+=chunk;});
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data',(chunk:string)=>{const size=Buffer.byteLength(chunk);bytes+=size;if(diagnostics)diagnostics.stderrBytes+=size;if(bytes>options.maxBytes)stop('output_limit');else stderr+=chunk;});
  child.stdin!.on('error',()=>{});child.stdin!.end(options.stdin??'');
  child.on('error',error=>{if(!spawned)failure='spawn_failed';if(diagnostics)diagnostics.failure=(error as NodeJS.ErrnoException).code??'process_error';});
  child.on('close',(code,signal)=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);if(terminationTimer)clearTimeout(terminationTimer);options.signal?.removeEventListener('abort',abort);
    if(diagnostics){diagnostics.exitCode=code;diagnostics.signal=signal;diagnostics.failure=failure??diagnostics.failure;try{persist(true);}catch{failure='diagnostics_write_failed';}}
    if(failure)reject(new ExecutionError(failure,!spawned,diagnostics));else resolve({stdout,code,...(diagnostics?{diagnostics}:{})});});
});

export function safeEnvironment():NodeJS.ProcessEnv {
  const result:NodeJS.ProcessEnv={};
  for(const key of ['PATH','Path','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','CODEX_HOME','GEMINI_CLI_HOME'])
    if(process.env[key])result[key]=process.env[key];
  return result;
}

export const supervisedProcess:ProcessRunner=async(command,args,options)=>{
  const {onSpawn,signal,...serialized}=options;
  // Host has its own duration timer and watches the original parent; no model-facing supervisor service.
  const output=await runProcess(process.execPath,['--import',pathToFileURL(path.resolve(__dirname,'../../node_modules/tsx/dist/loader.mjs')).href,path.join(__dirname,'executor-host.ts')],{
    cwd:options.cwd,stdin:JSON.stringify({command,args,parentPid:process.pid,options:serialized}),timeoutMs:options.timeoutMs+5000,
    maxBytes:options.maxBytes*6,signal,onSpawn,
  });
  if(output.code!==0)throw new ExecutionError('supervisor_exit_uncertain');
  let envelope:any;try{envelope=JSON.parse(output.stdout);}catch{throw new ExecutionError('supervisor_result_uncertain');}
  if(!envelope.ok)throw new ExecutionError(envelope.code,envelope.definitelyNotStarted===true,envelope.diagnostics);
  return envelope.output;
};

/** Resolve native programs or known npm JS entry points, never .cmd/.ps1 through a shell. */
export function resolveExecutor(command:string,adapter:string,searchPath=process.env.PATH??process.env.Path??''): {command:string;args:string[]}|null {
  const locations=path.isAbsolute(command)?[command]:searchPath.split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,command));
  for(const location of locations){
    const ext=path.extname(location).toLowerCase();
    if(existsSync(location)&&!['.cmd','.bat','.ps1'].includes(ext)&&(process.platform!=='win32'||['.exe','.com','.js','.mjs','.cjs'].includes(ext))){
      if(['.js','.mjs','.cjs'].includes(ext))return {command:process.execPath,args:[location]};
      return {command:location,args:[]};
    }
    if(process.platform==='win32'&&!ext&&existsSync(location+'.exe'))return {command:location+'.exe',args:[]};
    const entry=adapter==='codex'?'@openai/codex/bin/codex.js':adapter==='gemini'?'@google/gemini-cli/dist/index.js':null;
    if(entry){const js=path.join(path.dirname(location),'node_modules',entry);if(existsSync(js))return {command:process.execPath,args:[js]};}
  }
  return null;
}

export class CommandExecutors {
  constructor(readonly probeDirectory:string,readonly processRunner:ProcessRunner=runProcess){}
  async detect(config:ExecutorConfig):Promise<ExecutorCapability>{
    const resolved=resolveExecutor(config.command,config.adapter);
    if(!resolved)return {id:config.id,adapter:config.adapter,available:false,reason:'not_installed'};
    mkdirSync(this.probeDirectory,{recursive:true});
    try {
      const args=config.adapter==='codex'?['exec','--help']:config.adapter==='gemini'?['--help']:[...config.args,'--help'];
      const probe=await this.processRunner(resolved.command,[...resolved.args,...args],{cwd:this.probeDirectory,timeoutMs:10000,maxBytes:64000});
      const required=config.adapter==='codex'?['--json','--sandbox','--ephemeral','--ignore-user-config','--output-schema']:config.adapter==='gemini'?['--prompt','--output-format','--extensions']:['agent-result.v1'];
      if(probe.code!==0||required.some(flag=>!probe.stdout.includes(flag)))return {id:config.id,adapter:config.adapter,available:false,reason:'unsupported_noninteractive_contract'};
      return {id:config.id,adapter:config.adapter,available:true,reason:'help_verified_auth_not_probed',...resolved,usageAccounting:config.adapter==='json'?'none':'final_report_when_available'};
    }catch{return {id:config.id,adapter:config.adapter,available:false,reason:'capability_probe_failed'};}
  }
  async execute(config:ExecutorConfig,capability:ExecutorCapability,context:string,directory:string,options:Omit<ProcessOptions,'cwd'|'stdin'>):Promise<ExecutionResult>{
    if(!capability.available||!capability.command)throw new ExecutionError('executor_unavailable',true);
    mkdirSync(directory,{recursive:true});
    // Work outside the repository: inherited project MCP servers, hooks and dotenv are not context.
    const executionDirectory=mkdtempSync(path.join(tmpdir(),'scc-agent-executor-'));
    const schemaPath=path.join(executionDirectory,'result-schema.json');
    writeFileSync(schemaPath,JSON.stringify(z.toJSONSchema(agentResultSchema)),{flag:'wx'});
    let args:string[],env=safeEnvironment();
    if(config.adapter==='codex')args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json',
      '-c','approval_policy="never"','-c','features.shell_tool=false','-c','features.apps=false','-c','features.hooks=false','-c','features.multi_agent=false','-c','features.skill_search=false','-c','web_search="disabled"',
      '--output-schema',schemaPath,'-'];
    else if(config.adapter==='gemini'){
      const settings=path.join(executionDirectory,'gemini-settings.json');
      // Gemini treats an empty MCP allowlist as unrestricted. Match only a fresh nonexistent name.
      writeFileSync(settings,JSON.stringify({tools:{core:[],discoveryCommand:'',callCommand:''},mcp:{allowed:[path.basename(executionDirectory)+'-no-server'],serverCommand:''},mcpServers:{},hooksConfig:{enabled:false},skills:{enabled:false},advanced:{ignoreLocalEnv:true},ide:{enabled:false}}),{flag:'wx'});
      env={...env,GEMINI_CLI_SYSTEM_SETTINGS_PATH:settings};
      args=['--prompt','Return only the requested agent-result.v1 JSON for the supplied task.','--output-format','json','--extensions','none'];
    }else args=config.args;
    const executeProcess=this.processRunner===runProcess?supervisedProcess:this.processRunner;
    let output:ProcessOutput;
    try{output=await executeProcess(capability.command,[...(capability.args??[]),...args],{...options,diagnosticsDirectory:path.join(directory,'process'),cwd:executionDirectory,stdin:context,env});}
    finally{rmSync(executionDirectory,{recursive:true,force:true});}
    if(output.code!==0)throw new ExecutionError('executor_exit_nonzero',false,output.diagnostics);
    let value:unknown,usage:ExecutionResult['usage']=null;
    try {
      if(config.adapter==='codex'){
        const events=output.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
        const final=events.filter(e=>e.type==='item.completed'&&e.item?.type==='agent_message').at(-1);
        value=JSON.parse(final?.item?.text??'');
        const turns=events.filter(e=>e.type==='turn.completed');
        if(turns.length&&turns.every(e=>Number.isSafeInteger(e.usage?.input_tokens)&&e.usage.input_tokens>=0&&Number.isSafeInteger(e.usage?.output_tokens)&&e.usage.output_tokens>=0))
          usage={tokens:turns.reduce((n,e)=>n+e.usage.input_tokens+e.usage.output_tokens,0),source:'codex.turn.completed.input_plus_output'};
        if(events.some(e=>e.type==='turn.failed'||e.type==='error'))throw new Error('failed event');
      }else if(config.adapter==='gemini'){
        const envelope=JSON.parse(output.stdout);if(envelope.error)throw new Error('failed envelope');
        value=JSON.parse(envelope.response);
        const models=Object.values(envelope.stats?.models??{}) as any[];
        if(models.length&&models.every(m=>Number.isSafeInteger(m.tokens?.total)&&m.tokens.total>=0))usage={tokens:models.reduce((n,m)=>n+m.tokens.total,0),source:'gemini.stats.models.tokens.total'};
      }else value=JSON.parse(output.stdout);
      return {result:agentResultSchema.parse(value),usage,...(output.diagnostics?{diagnostics:output.diagnostics}:{})};
    }catch{throw new ExecutionError('invalid_result_or_usage',false,output.diagnostics);}
  }
}
