import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {readJson,writeJson,validateOwnerConfiguration,processIdentity,isOwnedProcess,redactRuntimeLog,startupScript,fingerprint,type OwnerConfiguration,type OwnerState,type OwnedProcess} from './lib/owner-runtime-core.js';
const args=process.argv.slice(2),action=args[0]||'status';
const configAt=args.indexOf('--config');
const configFile=path.resolve(configAt>=0?args[configAt+1]:path.join(__dirname,'..','.data','runtime','owner-config.json'));
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function health(){try{const r=await fetch('http://127.0.0.1:3001/api/health',{signal:AbortSignal.timeout(2000)});return r.ok?await r.json() as any:null;}catch{return null;}}
async function portOpen(port:number){return await new Promise<boolean>(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>{socket.destroy();resolve(false);});socket.once('timeout',()=>{socket.destroy();resolve(false);});});}
async function main(){
 if(!fs.existsSync(configFile))throw new Error('Owner release is not configured; complete the documented rollout first.');
 const c=readJson(configFile) as OwnerConfiguration;validateOwnerConfiguration(c);
 if(path.resolve(configFile)!==path.join(c.runtimeDir,'owner-config.json'))throw new Error('Unexpected owner configuration location');
 fs.mkdirSync(c.runtimeDir,{recursive:true});
 const stateFile=path.join(c.runtimeDir,'owner-state.json'),lockFile=path.join(c.runtimeDir,'controller.lock');
 const log=(message:string)=>fs.appendFileSync(path.join(c.runtimeDir,'controller.log'),new Date().toISOString()+' '+redactRuntimeLog(message)+'\n');
 const startupFile=path.join(process.env.APPDATA||'', 'Microsoft','Windows','Start Menu','Programs','Startup','SocialCommandCenter.vbs');
 let lockFd:number|undefined;
 if(action!=='status'){
  const ownIdentity=processIdentity(process.pid);if(!ownIdentity)throw new Error('Could not verify lifecycle process identity');
  try{lockFd=fs.openSync(lockFile,'wx');fs.writeFileSync(lockFd,JSON.stringify({pid:process.pid,startedAt:ownIdentity.startedAt}));}
  catch{const old=readJson(lockFile);const identity=processIdentity(old.pid);if(identity&&Date.parse(identity.startedAt)===Date.parse(old.startedAt))throw new Error('Another owner lifecycle command is active; no duplicate action was taken.');fs.unlinkSync(lockFile);lockFd=fs.openSync(lockFile,'wx');fs.writeFileSync(lockFd,JSON.stringify({pid:process.pid,startedAt:ownIdentity.startedAt}));}
 }
 try{
  const state=fs.existsSync(stateFile)?readJson(stateFile) as OwnerState:{releaseRevision:c.releaseRevision,instanceId:''};
  const owned=(p:OwnedProcess|undefined)=>p?isOwnedProcess(p,processIdentity(p.pid)):false;
  if(action==='status'){
   const h=await health();console.log(JSON.stringify({configuredRevision:c.releaseRevision,ownerRevision:h?.releaseRevision||null,ready:!!h?.ready,backendPid:owned(state.backend)?state.backend!.pid:null,proxyPid:owned(state.proxy)?state.proxy!.pid:null,publishingHold:h?.publishingHold||null,syncEnabled:h?.syncEnabled||false,startupEnabled:fs.existsSync(startupFile),database:path.join(c.dataDir,'social_command_center.db'),clientDist:c.clientDist},null,2));return;
  }
  if(action==='install-startup'){
   if(process.platform!=='win32'||!process.env.APPDATA)throw new Error('Current-user Windows startup is unavailable');
   fs.mkdirSync(path.dirname(startupFile),{recursive:true});
   if(fs.existsSync(startupFile)&&!fs.readFileSync(startupFile,'utf8').includes('Social Command Center current-user startup'))throw new Error('Startup filename already belongs to another program');
   fs.writeFileSync(startupFile,startupScript(c));log('Current-user startup enabled; owner backend/proxy only.');console.log(JSON.stringify({startupEnabled:true,startupFile,administratorElevation:false}));return;
  }
  if(action==='disable'){
   if(fs.existsSync(startupFile)){const contents=fs.readFileSync(startupFile,'utf8');if(!contents.includes('Social Command Center current-user startup')||!contents.includes(configFile))throw new Error('Startup entry ownership mismatch');fs.unlinkSync(startupFile);}
   log('Current-user startup disabled; running services were not stopped.');console.log('Startup disabled; owner services remain running.');return;
  }
  if(action==='stop'){
   if(owned(state.backend)){
    const h=await health();if(h?.instanceId!==state.instanceId||h?.releaseRevision!==state.releaseRevision)throw new Error('Backend instance mismatch; no process stopped');
    const token=fs.readFileSync(path.join(c.runtimeDir,'control-token'),'utf8').trim();let accepted=false;
    for(let i=0;i<30;i++){
     const result=await fetch('http://127.0.0.1:3001/api/internal/runtime/shutdown',{method:'POST',headers:{'x-scc-runtime-control':token},signal:AbortSignal.timeout(5000)}).catch(()=>null);
     if(result?.status===202){accepted=true;break;}if(result?.status!==409)throw new Error('Backend stop authorization/readiness failed; no forced termination');await wait(1000);
    }
    if(!accepted)throw new Error('Backend remained busy; operation preserved and no forced termination performed');
    for(let i=0;i<100&&owned(state.backend);i++)await wait(100);
    if(owned(state.backend))throw new Error('Backend stop is still draining; proxy and process were left intact');
   }else if(await portOpen(3001))throw new Error('Port 3001 belongs to an unowned process; it was not stopped');
   if(owned(state.proxy))process.kill(state.proxy!.pid);
   else if(await portOpen(3443))throw new Error('Port 3443 belongs to an unowned process; it was not stopped');
   writeJson(stateFile,{releaseRevision:c.releaseRevision,instanceId:'',stoppedAt:new Date().toISOString()});log('Owner backend and proxy stopped safely.');console.log(JSON.stringify({stopped:true}));return;
  }
  if(action!=='start')throw new Error('Use start, stop, status, install-startup or disable');
  if(fs.existsSync(path.join(c.runtimeDir,'maintenance.lock')))throw new Error('Maintenance is active; startup is blocked');
  const manifest=readJson(path.join(c.releaseRoot,'release.json'));
  if(manifest.revision!==c.releaseRevision)throw new Error('Release manifest revision mismatch');
  for(const [relative,hash] of Object.entries(manifest.hashes as Record<string,string>)){const absolute=path.resolve(c.releaseRoot,relative);if(!absolute.toLowerCase().startsWith((c.releaseRoot+path.sep).toLowerCase())||fingerprint(fs.readFileSync(absolute))!==hash)throw new Error('Pinned release contents changed; no process started');}
  let next:OwnerState=state;
  const h=await health();
  if(h){if(!owned(state.backend)||h.instanceId!==state.instanceId||h.releaseRevision!==c.releaseRevision)throw new Error('Existing owner listener is a different or unowned release; no duplicate started');}
  else{
   if(await portOpen(3001))throw new Error('Port 3001 is occupied but not ready; no duplicate backend started');
   if(owned(state.backend))throw new Error('Owned backend is still starting or unavailable; no duplicate started');
   const tokenFile=path.join(c.runtimeDir,'control-token');if(!fs.existsSync(tokenFile))fs.writeFileSync(tokenFile,randomBytes(32).toString('hex'),{flag:'wx'});const token=fs.readFileSync(tokenFile,'utf8').trim();
   const instanceId=randomUUID();const env={...process.env};
   for(const key of Object.keys(env))if(/^(SCC_|META_|TIKTOK_|GEMINI_|OPENAI_|OPENROUTER_|ANTHROPIC_|DOTENV_)|^PORT$/.test(key))delete env[key];
   Object.assign(env,{DOTENV_CONFIG_PATH:c.envFile,SCC_DATA_DIR:c.dataDir,SCC_CLIENT_DIST:c.clientDist,SCC_SEED_DEMOS:'false',SCC_OWNER_MANAGED:'true',SCC_RELEASE_REVISION:c.releaseRevision,SCC_RUNTIME_INSTANCE_ID:instanceId,SCC_RUNTIME_CONTROL_TOKEN:token,SCC_ASSISTANT_PROVIDER_CONFIG:c.providerConfig,SCC_ASSISTANT_FIXTURES:'false',PORT:'3001'});
   const entrypoint=path.join(c.releaseRoot,'server','src','index.ts');const out=fs.openSync(path.join(c.runtimeDir,'backend.stdout.log'),'a'),err=fs.openSync(path.join(c.runtimeDir,'backend.stderr.log'),'a');
   const child=spawn(c.nodePath,['--import','tsx',entrypoint],{cwd:c.workspaceRoot,env,stdio:['ignore',out,err],windowsHide:true,detached:true});child.unref();
   let identity=processIdentity(child.pid!);for(let i=0;!identity&&i<10;i++){await wait(100);identity=processIdentity(child.pid!);}if(!identity)throw new Error('Backend did not start; inspect local bounded logs');
   next={releaseRevision:c.releaseRevision,instanceId,proxy:owned(state.proxy)?state.proxy:undefined,backend:{pid:child.pid!,startedAt:identity.startedAt,entrypoint}};writeJson(stateFile,next);
   let ready=false;for(let i=0;i<60;i++){const response=await health();if(response?.ready&&response.instanceId===instanceId&&response.releaseRevision===c.releaseRevision){ready=true;break;}if(!isOwnedProcess(next.backend!,processIdentity(child.pid!)))break;await wait(500);}
   if(!ready)throw new Error('Owner backend readiness failed; proxy was not started. Inspect local logs and documented rollback.');
   log('Owner backend ready; release '+c.releaseRevision+' pid '+child.pid);
  }
  if(await portOpen(3443)){if(!owned(next.proxy))throw new Error('Existing proxy is unowned; no duplicate proxy started');}
  else{
   const entrypoint=path.join(c.releaseRoot,'server','src','loopback-proxy.ts');const out=fs.openSync(path.join(c.runtimeDir,'proxy.stdout.log'),'a'),err=fs.openSync(path.join(c.runtimeDir,'proxy.stderr.log'),'a');
   const child=spawn(c.nodePath,['--import','tsx',entrypoint],{cwd:c.workspaceRoot,env:{...process.env,PORT:'3001',SCC_HTTPS_PORT:'3443'},stdio:['ignore',out,err],windowsHide:true,detached:true});child.unref();let identity=processIdentity(child.pid!);for(let i=0;!identity&&i<10;i++){await wait(100);identity=processIdentity(child.pid!);}if(!identity)throw new Error('Proxy startup failed; backend remains available');next.proxy={pid:child.pid!,startedAt:identity.startedAt,entrypoint};writeJson(stateFile,next);
   for(let i=0;i<60&&!await portOpen(3443);i++)await wait(250);
   if(!await portOpen(3443))throw new Error('Proxy readiness failed; backend remains available');log('Owner HTTPS proxy ready; pid '+child.pid);
  }
  console.log(JSON.stringify({ready:true,revision:c.releaseRevision,backendPid:next.backend?.pid,proxyPid:next.proxy?.pid}));
 }catch(error:any){log('Lifecycle '+action+' failed: '+error.message);throw error;}finally{if(lockFd!==undefined){fs.closeSync(lockFd);fs.unlinkSync(lockFile);}}
}
main().catch(error=>{const safe=redactRuntimeLog(error.message);try{fs.appendFileSync(path.join(path.dirname(configFile),'startup-errors.log'),new Date().toISOString()+' '+safe+'\n');}catch{}console.error(safe);process.exitCode=1;});
