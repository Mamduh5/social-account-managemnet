/** Read-only owner inspection + new WAL-safe backup. No migration or lifecycle action. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { assertOwnerQueueSafe } from '../server/src/domain/runtime-recovery.js';
import { fingerprint, readJson, writeJson, privateDirectory, validateOwnerConfiguration, type OwnerConfiguration } from './lib/owner-runtime-core.js';
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function option(key:string) { const index=args.indexOf(key); return index<0?undefined:args[index+1]; }
function quote(value:string) { return '"'+value.replaceAll('"','""')+'"'; }
function tables(database:Database.Database) {
 return (database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[]).map(({name})=>{
  const columns=(database.prepare('PRAGMA table_info('+quote(name)+')').all() as {name:string}[]).map(row=>row.name);
  const rows=database.prepare('SELECT * FROM '+quote(name)+' ORDER BY rowid').all();
  return {name,columns,count:rows.length,sha256:fingerprint(JSON.stringify(rows))};
 });
}
function hasTable(database:Database.Database,name:string) { return !!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); }
function inspect(database:Database.Database) {
 const queue=database.prepare(`SELECT pd.id,pd.status,p.scheduled_at,pd.remote_post_id,pd.submission_state FROM publishing_destinations pd JOIN publishing_posts p ON p.id=pd.post_id WHERE pd.status IN ('preparing','branding','uploading','scheduled') ORDER BY pd.id`).all() as any[];
 const protectedRows=database.prepare("SELECT * FROM publishing_destinations WHERE status='awaiting_confirmation' ORDER BY id").all() as any[];
 let queueSafe=true,queueReason:string|null=null;
 try { assertOwnerQueueSafe(queue,protectedRows.map(row=>row.id)); if(queue.some(row=>row.submission_state))throw new Error('Pending submission intent requires reconciliation'); } catch(error:any) { queueSafe=false;queueReason=error.message; }
 const uncertain=database.prepare("SELECT id,status,submission_state FROM publishing_destinations WHERE status='failed' AND (remote_post_id IS NOT NULL OR submission_state IS NOT NULL) ORDER BY id").all();
 if(uncertain.length){queueSafe=false;queueReason='Failed destinations with remote/submission intent need reconciliation before maintenance';}
 const identities=database.prepare('SELECT * FROM account_identities ORDER BY rowid').all();
 const accounts=database.prepare('SELECT id,platform,account_type,name,handle,external_id,access_token,refresh_token,connection_revision,granted_scopes_json,token_expires_at FROM accounts ORDER BY id').all();
 const campaigns=hasTable(database,'publishing_campaigns')?database.prepare('SELECT id,status,approved_revision,approved_hash,approved_at FROM publishing_campaigns ORDER BY id').all():[];
 const sync=database.prepare('SELECT account_id,target,status,last_attempt_at,last_success_at,records_synced FROM sync_states ORDER BY account_id,target').all();
 const providerTables=(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%provider%' OR name LIKE '%generation%') ORDER BY name").all() as {name:string}[]).map(row=>({name:row.name,sha256:fingerprint(JSON.stringify(database.prepare('SELECT * FROM '+quote(row.name)+' ORDER BY rowid').all()))}));
 return {queueSafe,queueReason,queue,uncertain,protectedRows,counts:database.prepare('SELECT status,count(*) count FROM publishing_destinations GROUP BY status ORDER BY status').all(),sync,syncActive:sync.some((row:any)=>row.status==='syncing'),accountsSha256:fingerprint(JSON.stringify(accounts)),identitiesSha256:fingerprint(JSON.stringify(identities)),campaigns,providerTables};
}
function mediaFiles(directory:string) : {file:string;size:number;sha256:string}[] {
 if(!fs.existsSync(directory))return [];
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(item=>{
  const file=path.join(directory,item.name);
  if(item.isSymbolicLink())throw new Error('Unexpected media symlink; inspect before release');
  return item.isDirectory()?mediaFiles(file):[{file,size:fs.statSync(file).size,sha256:fingerprint(fs.readFileSync(file))}];
 });
}
async function health() { try { const response=await fetch('http://127.0.0.1:3001/api/health',{signal:AbortSignal.timeout(3000)}); const value=await response.json() as any; return {ready:value.ready,version:value.version,releaseRevision:value.releaseRevision,instanceId:value.instanceId,syncEnabled:value.syncEnabled,publishingHold:value.publishingHold}; } catch { return null; } }
async function main(){
 const config=readJson(path.join(root,'.data/runtime/owner-config.json')) as OwnerConfiguration;validateOwnerConfiguration(config);
 const sourcePath=path.join(config.dataDir,'social_command_center.db');
 const source=new Database(sourcePath,{readonly:true,fileMustExist:true});
 try {
  const verify=option('--verify');
  if(verify){
   const baseline=readJson(path.resolve(verify));const current=inspect(source);
   const original=new Database(baseline.backup,{readonly:true,fileMustExist:true});
   let mediaRecordsUnchanged=true,brandPresetsUnchanged=true,publishingHistoryUnchanged=true;
   try {
    for(const table of ['videos','branded_videos'])for(const row of original.prepare('SELECT * FROM '+quote(table)).all() as any[]){if(JSON.stringify(source.prepare('SELECT * FROM '+quote(table)+' WHERE id=?').get(row.id))!==JSON.stringify(row))mediaRecordsUnchanged=false;}
    const presets=(database:Database.Database)=>database.prepare('SELECT id,brand_kit_json,settings_json FROM accounts ORDER BY id').all();
    brandPresetsUnchanged=JSON.stringify(presets(source))===JSON.stringify(presets(original));
    const stable=(row:any)=>{const copy={...row};for(const key of ['last_synced_at','sync_status','verification_status','updated_at'])delete copy[key];return JSON.stringify(copy);};
    for(const table of ['publishing_posts','publishing_destinations'])for(const row of original.prepare('SELECT * FROM '+quote(table)).all() as any[]){if(stable(source.prepare('SELECT * FROM '+quote(table)+' WHERE id=?').get(row.id))!==stable(row))publishingHistoryUnchanged=false;}
   }finally{original.close();}

   const protectedUnchanged=JSON.stringify(current.protectedRows)===JSON.stringify(baseline.database.protectedRows);
   const filesUnchanged=baseline.media.every((item:any)=>fs.existsSync(item.file)&&fs.statSync(item.file).size===item.size&&fingerprint(fs.readFileSync(item.file))===item.sha256);
   const controlFilesUnchanged=baseline.controlFiles.every((item:any)=>fingerprint(fs.readFileSync(item.file))===item.sha256);
   const result={checkedAt:new Date().toISOString(),readOnly:true,protectedUnchanged,filesUnchanged,controlFilesUnchanged,mediaRecordsUnchanged,brandPresetsUnchanged,publishingHistoryUnchanged,accountsUnchanged:current.accountsSha256===baseline.database.accountsSha256,identitiesUnchanged:current.identitiesSha256===baseline.database.identitiesSha256,campaignsUnchanged:JSON.stringify(current.campaigns)===JSON.stringify(baseline.database.campaigns),providerTablesUnchanged:JSON.stringify(current.providerTables)===JSON.stringify(baseline.database.providerTables),current,health:await health()};
   const report=option('--report');if(!report||fs.existsSync(report))throw new Error('Provide a new verification --report');writeJson(path.resolve(report),result);
   console.log(JSON.stringify({readOnly:true,protectedUnchanged,filesUnchanged,controlFilesUnchanged,mediaRecordsUnchanged,brandPresetsUnchanged,publishingHistoryUnchanged,accountsUnchanged:result.accountsUnchanged,identitiesUnchanged:result.identitiesUnchanged,campaignsUnchanged:result.campaignsUnchanged,providerTablesUnchanged:result.providerTablesUnchanged,queueSafe:current.queueSafe,syncActive:current.syncActive,health:result.health},null,2));
   if(!protectedUnchanged||!filesUnchanged||!controlFilesUnchanged||!mediaRecordsUnchanged||!brandPresetsUnchanged||!publishingHistoryUnchanged||!result.accountsUnchanged||!result.identitiesUnchanged||!result.campaignsUnchanged||!result.providerTablesUnchanged)throw new Error('Preservation verification failed');return;
  }
  const out=option('--out');if(!out)throw new Error('Use --out NEW_DIRECTORY or --verify BASELINE --report NEW_JSON');const output=path.resolve(out);
  const allowed=path.join(root,'.data/v111-integration')+path.sep;
  if(!output.toLowerCase().startsWith(allowed.toLowerCase())||fs.existsSync(output))throw new Error('Output must be a new directory inside .data/v111-integration');
  privateDirectory(output);
  const before=inspect(source);const backup=path.join(output,'owner-pre-v111.db');await source.backup(backup);
  const saved=new Database(backup,{readonly:true,fileMustExist:true});
  let savedState:ReturnType<typeof inspect>,savedTables:ReturnType<typeof tables>;
  try { if(saved.pragma('integrity_check',{simple:true})!=='ok'||(saved.pragma('foreign_key_check') as unknown[]).length)throw new Error('Backup failed integrity/foreign key verification');savedState=inspect(saved);savedTables=tables(saved); } finally {saved.close();}
  const after=inspect(source);if(JSON.stringify(before.protectedRows)!==JSON.stringify(savedState.protectedRows)||JSON.stringify(after.protectedRows)!==JSON.stringify(savedState.protectedRows))throw new Error('Protected rows changed during backup; do not use for maintenance');
  const controlPaths=[path.join(config.runtimeDir,'owner-config.json'),path.join(config.runtimeDir,'owner-state.json'),config.envFile,config.providerConfig,path.join(root,'.data/certs/localhost.key'),path.join(root,'.data/certs/localhost.crt')];
  const startup=path.join(process.env.APPDATA||'', 'Microsoft/Windows/Start Menu/Programs/Startup/SocialCommandCenter.vbs');if(fs.existsSync(startup))controlPaths.push(startup);
  const media=[...mediaFiles(path.join(config.dataDir,'uploads')),...mediaFiles(path.join(config.dataDir,'renders'))];
  const result={capturedAt:new Date().toISOString(),sourcePath,backup,backupSha256:fingerprint(fs.readFileSync(backup)),integrity:'ok',foreignKeyViolations:0,onlineBackup:true,sourceOpenedReadOnly:true,sourceWasNotMigrated:true,database:savedState,tables:savedTables,media,controlFiles:controlPaths.map(file=>({file,sha256:fingerprint(fs.readFileSync(file))})),health:await health(),configuredRevision:config.releaseRevision};
  writeJson(path.join(output,'baseline.json'),result);
  console.log(JSON.stringify({backup,backupSha256:result.backupSha256,integrity:'ok',foreignKeyViolations:0,tableCount:savedTables.length,mediaFiles:media.length,protectedCount:savedState.protectedRows.length,queueSafe:savedState.queueSafe,queueReason:savedState.queueReason,syncActive:after.syncActive,counts:savedState.counts,campaigns:savedState.campaigns,health:result.health},null,2));
 }finally{source.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
