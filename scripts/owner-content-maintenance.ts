/** Explicit offline owner maintenance. Never activates a release or removes media. */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import readline from 'node:readline';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { acquireOwnerMaintenance, configurationFingerprint, verifyOwnerRelease } from './lib/owner-release-core.js';
import { inspectReleaseSource } from './lib/owner-release-prepare.js';
import { readJson, writeJson, privateDirectory, validateOwnerConfiguration, fingerprint, processIdentity, isOwnedProcess, type OwnerConfiguration, type OwnerState } from './lib/owner-runtime-core.js';
import { planContentReset, resetContent, retainedFingerprint, retiredManualIds, tableCounts, verifyDatabase } from './lib/content-reset.js';
import { assertOwnerQueueSafe } from '../server/src/domain/runtime-recovery.js';
import { migrateArchitectureDatabase, architectureSchemaReady } from '../server/src/db/architecture-schema.js';

const root = path.resolve(__dirname, '..');
const configFile = path.join(root,'.data','runtime','owner-config.json');
const wait = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
function hashFile(file:string){
  const hash=createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024);
  try{for(;;){const length=fs.readSync(fd,buffer,0,buffer.length,null);if(!length)break;hash.update(buffer.subarray(0,length));}return hash.digest('hex');}
  finally{fs.closeSync(fd);}
}
function protectedFiles(c:OwnerConfiguration) {
  const files = [configFile,c.envFile,c.providerConfig,path.join(c.runtimeDir,'control-token')];
  if(fs.existsSync(c.providerConfig)){
    const provider=readJson(c.providerConfig);
    for(const key of ['ledgerPath','sourceEnvFile'])if(typeof provider[key]==='string'&&path.isAbsolute(provider[key]))files.push(provider[key]);
    if(typeof provider.ledgerPath==='string'&&fs.existsSync(provider.ledgerPath+'.lock'))throw new Error('Provider ledger is busy; no maintenance started');
  }
  const startup = process.env.APPDATA && path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Startup','SocialCommandCenter.vbs');
  if (startup) files.push(startup);
  // Certificate/account/provider files are fingerprinted, never printed or modified.
  const visit=(dir:string)=>{if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Protected resource symlink requires review');
    if(entry.isDirectory())visit(file);else if(entry.isFile())files.push(file);
  }};
  for(const name of ['certs','certificates','avatars','provider-config'])visit(path.join(c.dataDir,name));
  return Object.fromEntries([...new Set(files)].sort().map(file=>[file,fs.existsSync(file)?fingerprint(fs.readFileSync(file)):null]));
}
function mediaInventory(c:OwnerConfiguration) {
  const result:{path:string;size:number;sha256:string}[]=[];
  for(const name of ['uploads','renders']){
    const visit=(dir:string)=>{if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Media symlink requires review');
      if(entry.isDirectory())visit(file);else if(entry.isFile())result.push({path:path.relative(c.dataDir,file),size:fs.statSync(file).size,sha256:hashFile(file)});
    }};visit(path.join(c.dataDir,name));
  }
  return result.sort((a,b)=>a.path.localeCompare(b.path));
}
async function reserve(port:number){
  const server=net.createServer(socket=>socket.destroy());
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}
function assertNoOwnedProcesses(c:OwnerConfiguration){
  const state=readJson(path.join(c.runtimeDir,'owner-state.json')) as OwnerState;
  for(const owned of [state.backend,state.proxy])if(owned&&isOwnedProcess(owned,processIdentity(owned.pid)))throw new Error('Managed owner process is still running');
}
async function backup(source:Database.Database,file:string){
  if(fs.existsSync(file))throw new Error('Refusing to overwrite a backup');
  verifyDatabase(source);const counts=tableCounts(source);await source.backup(file);
  const copy=new Database(file,{readonly:true,fileMustExist:true});
  try{verifyDatabase(copy);if(JSON.stringify(tableCounts(copy))!==JSON.stringify(counts))throw new Error('Backup table counts differ');}
  finally{copy.close();}
  return {file,sha256:fingerprint(fs.readFileSync(file)),integrity:'ok',foreignKeyViolations:0,counts};
}
export async function bootMaintenanceCopy(c:Pick<OwnerConfiguration,'nodePath'>,source:Database.Database,runDir:string,label:string,entry:string){
  const directory=path.join(runDir,'compatibility-'+label);fs.mkdirSync(directory);
  await source.backup(path.join(directory,'social_command_center.db'));
  const emptyEnv=path.join(directory,'empty.env');fs.writeFileSync(emptyEnv,'');
  const blockedFile=path.join(directory,'blocked-network.log'),preload=path.join(directory,'block-network.cjs');
  const ipcPrefixes=JSON.stringify(['\\\\?\\pipe\\','\\\\.\\pipe\\']);
  fs.writeFileSync(preload,`const fs=require('node:fs');const deny=()=>{fs.appendFileSync(${JSON.stringify(blockedFile)},new Error('blocked outbound request').stack+'\\n');throw new Error('Compatibility rehearsal forbids outbound requests');};globalThis.fetch=deny;for(const name of ['node:http','node:https']){const m=require(name);m.request=deny;m.get=deny;}const net=require('node:net');for(const name of ['connect','createConnection']){const original=net[name];net[name]=function(...args){const target=typeof args[0]==='object'?args[0].path:args[0];if(typeof target==='string'&&${ipcPrefixes}.some(prefix=>target.startsWith(prefix)))return original.apply(this,args);return deny();};}require('node:tls').connect=deny;`);
  const reservation=await reserve(0),port=(reservation.address() as net.AddressInfo).port;
  await new Promise<void>(resolve=>reservation.close(()=>resolve()));
  const env={...process.env};for(const key of Object.keys(env))if(/^(SCC_|META_|TIKTOK_|GEMINI_|OPENAI_|OPENROUTER_|ANTHROPIC_|DOTENV_)|^PORT$/.test(key))delete env[key];
  Object.assign(env,{DOTENV_CONFIG_PATH:emptyEnv,SCC_DATA_DIR:directory,SCC_ISOLATED_TEST:'true',SCC_PAUSE_WORKERS:'true',SCC_SEED_DEMOS:'false',SCC_OWNER_MANAGED:'true',SCC_RUNTIME_CONTROL_TOKEN:randomUUID(),SCC_RELEASE_REVISION:label,PORT:String(port)});
  const child=spawn(c.nodePath,['--require',preload,'--import','tsx',entry],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',data=>{log+=data;});child.stderr.on('data',data=>{log+=data;});
  let result;
  try{
    const deadline=Date.now()+25000;let health:any;
    while(Date.now()<deadline&&child.exitCode===null){try{const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)});health=await response.json();if(health.ready)break;}catch{}await wait(200);}
    if(!health?.ready||health.syncEnabled!==false||health.publishingHold)throw new Error('Compatibility backend failed readiness: '+label);
    const check=new Database(path.join(directory,'social_command_center.db'),{readonly:true});
    try{verifyDatabase(check);if(retainedFingerprint(check)!==retainedFingerprint(source))throw new Error('Compatibility boot changed protected rows');
      for(const table of ['publishing_posts','publishing_destinations','videos','comments'])if((check.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as any).n!==0)throw new Error('Old content reappeared during compatibility boot');
    }finally{check.close();}
    if(fs.existsSync(blockedFile))throw new Error('Compatibility backend attempted outbound access');
    result={label,ready:true,workersPaused:true,outboundAttempts:0,protectedRowsUnchanged:true};
  }finally{
    if(child.exitCode===null){await fetch(`http://127.0.0.1:${port}/api/internal/runtime/shutdown`,{method:'POST',headers:{'x-scc-runtime-control':String(env.SCC_RUNTIME_CONTROL_TOKEN)},signal:AbortSignal.timeout(3000)}).catch(()=>{});
      const deadline=Date.now()+5000;while(child.exitCode===null&&Date.now()<deadline)await wait(100);
      if(child.exitCode===null)child.kill();}
    fs.writeFileSync(path.join(directory,'runtime.log'),log);
  }
  if(child.exitCode===null)throw new Error('Compatibility child did not stop');
  return result;
}

async function main(){
  const args=process.argv.slice(2);
  if(args.length!==5||args[0]!=='--execute'||args[1]!=='--expect-current'||args[3]!=='--expect-source'||!args.slice(2).filter((_,i)=>i%2===0).every(s=>/^[a-f0-9]{40}$/.test(s)))throw new Error('Use --execute --expect-current COMMIT --expect-source COMMIT; review handshake is mandatory');
  const c=readJson(configFile) as OwnerConfiguration;validateOwnerConfiguration(c);
  if(path.resolve(c.workspaceRoot)!==root||c.releaseRevision!==args[2])throw new Error('Owner configuration or frozen revision differs');
  const source=inspectReleaseSource(root,args[4]);
  if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).trim())throw new Error('A fully clean committed checkpoint is required');
  verifyOwnerRelease(c.releaseRoot,c.releaseRevision);
  const originalConfiguration=configurationFingerprint(c),protectedBefore=protectedFiles(c);
  const runDir=path.join(c.dataDir,'owner-content-maintenance',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());privateDirectory(runDir);
  fs.copyFileSync(path.join(root,'docs','qa','OWNER_CONTENT_MAINTENANCE.md'),path.join(runDir,'ROLLBACK.md'));
  const report:any={version:1,status:'preparing',runDir,sourceRevision:source.revision,frozenRevision:c.releaseRevision,releaseActivated:false,mediaFilesRemoved:0};
  writeJson(path.join(runDir,'report.json'),report);
  const hold=acquireOwnerMaintenance(c,runDir);let stopped=false;const reservations:net.Server[]=[];
  let owner:Database.Database|undefined;
  try{
    console.log('Establishing official maintenance hold and managed idle-only shutdown.');
    try{execFileSync(c.nodePath,['--import','tsx',path.join(c.releaseRoot,'scripts','owner-runtime.ts'),'stop','--config',configFile],{cwd:root,windowsHide:true,stdio:'pipe',maxBuffer:1000000});}catch{throw new Error('Managed shutdown refused or failed; no forced stop or database mutation occurred');}
    stopped=true;
    const deadline=Date.now()+10000;for(;;){try{assertNoOwnedProcesses(c);break;}catch(error){if(Date.now()>=deadline)throw error;await wait(200);}}
    reservations.push(await reserve(3001),await reserve(3443));
    const mediaBefore=mediaInventory(c);writeJson(path.join(runDir,'media-retained.json'),mediaBefore);
    const databaseFile=path.join(c.dataDir,'social_command_center.db');
    if(fs.lstatSync(databaseFile).isSymbolicLink()||fs.realpathSync(databaseFile)!==databaseFile)throw new Error('Owner database must be its original canonical file');
    const readonly=new Database(databaseFile,{readonly:true,fileMustExist:true});
    let plan;
    try{readonly.pragma('foreign_keys=ON');plan=planContentReset(readonly);
      assertOwnerQueueSafe([],plan.awaitingManualIds,Date.now(),retiredManualIds(readonly));
      report.preResetBackup=await backup(readonly,path.join(runDir,'pre-reset.db'));
    }finally{readonly.close();}
    writeJson(path.join(runDir,'reset-plan.json'),plan);
    console.log(JSON.stringify({event:'BACKUP_VERIFIED',backup:report.preResetBackup.file,plan},null,2));
    const saved=new Database(report.preResetBackup.file,{readonly:true});
    try{await backup(saved,path.join(runDir,'rehearsal.db'));}finally{saved.close();}
    const rehearsal=new Database(path.join(runDir,'rehearsal.db'));rehearsal.pragma('foreign_keys=ON');
    const provenance={commit:source.revision,backupSha256:report.preResetBackup.sha256,receiptId:'reset-'+randomUUID()};
    try{
      // First prove the backup recovers the full original graph, then rehearse reset and migration.
      if(planContentReset(rehearsal).fingerprint!==plan.fingerprint)throw new Error('Recovery rehearsal differs from original inventory');
      report.rehearsalReset=resetContent(rehearsal,plan,provenance);
      report.rehearsalMigration=migrateArchitectureDatabase(rehearsal);verifyDatabase(rehearsal);
      report.compatibility=[await bootMaintenanceCopy(c,rehearsal,runDir,'frozen',path.join(c.releaseRoot,'server','src','index.ts')),await bootMaintenanceCopy(c,rehearsal,runDir,'architecture',path.join(root,'server','src','index.ts'))];
    }finally{rehearsal.close();}
    report.status='rehearsal_verified';writeJson(path.join(runDir,'report.json'),report);
    console.log('REVIEW_REQUIRED '+JSON.stringify({runDir,fingerprint:plan.fingerprint,compatibility:report.compatibility,retainedManualEvidence:plan.awaitingManualIds,requiredInput:'APPLY '+plan.fingerprint}));
    const rl=readline.createInterface({input:process.stdin,output:process.stdout});
    const answer=await new Promise<string>(resolve=>{rl.question('Review inventory and enter exact APPLY fingerprint: ',resolve);rl.once('close',()=>resolve(''));});rl.close();
    if(answer.trim()!=='APPLY '+plan.fingerprint)throw new Error('No matching reviewed reset fingerprint; original database unchanged');
    if(configurationFingerprint(readJson(configFile) as OwnerConfiguration)!==originalConfiguration||JSON.stringify(protectedFiles(c))!==JSON.stringify(protectedBefore))throw new Error('Protected configuration changed during rehearsal');
    assertNoOwnedProcesses(c);verifyOwnerRelease(c.releaseRoot,c.releaseRevision);inspectReleaseSource(root,args[4]);
    owner=new Database(databaseFile,{fileMustExist:true});owner.pragma('foreign_keys=ON');
    report.reset=resetContent(owner,plan,provenance);report.status='reset_verified';writeJson(path.join(runDir,'report.json'),report);
    report.preMigrationBackup=await backup(owner,path.join(runDir,'pre-migration.db'));writeJson(path.join(runDir,'report.json'),report);
    report.migration=migrateArchitectureDatabase(owner);verifyDatabase(owner);
    if(!architectureSchemaReady(owner)||retainedFingerprint(owner)!==plan.protectedFingerprint)throw new Error('Post-migration prerequisite or identity verification failed');
    assertOwnerQueueSafe([],[],Date.now(),retiredManualIds(owner));
    report.after=tableCounts(owner);report.schemaReady=true;report.protectedRowsUnchanged=true;
    report.accountIdentities=plan.accountIdentities;report.indexes=owner.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%history_%' ORDER BY name").all();
    owner.close();owner=undefined;
    if(JSON.stringify(mediaInventory(c))!==JSON.stringify(mediaBefore)||JSON.stringify(protectedFiles(c))!==JSON.stringify(protectedBefore))throw new Error('Protected file or retained media fingerprints changed');
    report.status='complete_maintenance_held';report.completedAt=new Date().toISOString();
    report.runtime={stopped:true,maintenanceHold:true,reason:'Frozen Activity API can delete reset safety evidence and lacks remote-comment replay protection. New release activation requires separate approval.',startupEntryUnchanged:true};
    writeJson(path.join(runDir,'report.json'),report);
    console.log(JSON.stringify({event:'MAINTENANCE_COMPLETE',reportFile:path.join(runDir,'report.json'),...report},null,2));
    // Deliberately keep the official nonce-owned exclusion markers. The old
    // release has compatible SQL but cannot protect the new reset receipts.
  }catch(error){
    report.status='failed';report.error=error instanceof Error?error.message:'Maintenance failed';report.ownerStopped=stopped;report.maintenanceHold=stopped;
    writeJson(path.join(runDir,'report.json'),report);
    if(!stopped)hold.release();
    throw new Error(report.error+'; private recovery report: '+path.join(runDir,'report.json'));
  }finally{owner?.close();for(const server of reservations)await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
