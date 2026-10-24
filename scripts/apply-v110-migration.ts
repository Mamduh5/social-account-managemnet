import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import Database from 'better-sqlite3';
import {parse} from 'dotenv';
import {migrateV110Database} from '../server/src/db/v110-migration.js';
import {generalPostsReady} from '../server/src/db/general-posts-schema.js';
import {assertOwnerQueueSafe} from '../server/src/domain/runtime-recovery.js';
import {readJson,writeJson,validateOwnerConfiguration,privateDirectory,fingerprint,type OwnerConfiguration} from './lib/owner-runtime-core.js';
const args=process.argv.slice(2);function option(name:string){const i=args.indexOf(name);return i<0?undefined:args[i+1];}
async function reserve(port:number){return await new Promise<net.Server>((resolve,reject)=>{const server=net.createServer(socket=>socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'));server.once('error',()=>reject(new Error('Owner/proxy port '+port+' is occupied; maintenance was not started')));server.listen(port,'127.0.0.1',()=>resolve(server));});}
function snapshot(db:Database.Database){return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r:any)=>{const columns=(db.prepare('PRAGMA table_info("'+r.name+'")').all() as any[]).map(c=>c.name);return {name:r.name,columns,count:(db.prepare('SELECT count(*) n FROM "'+r.name+'"').get() as any).n,hash:fingerprint(JSON.stringify(db.prepare('SELECT '+columns.map(c=>'"'+c+'"').join(',')+' FROM "'+r.name+'" ORDER BY rowid').all()))};});}
function validateRows(db:Database.Database,before:ReturnType<typeof snapshot>){for(const t of before){const rows=db.prepare('SELECT '+t.columns.map(c=>'"'+c+'"').join(',')+' FROM "'+t.name+'" ORDER BY rowid').all();if(rows.length!==t.count||fingerprint(JSON.stringify(rows))!==t.hash)throw new Error('Original rows changed in '+t.name+'; migration transaction rolled back');}}
async function main(){
 const config=option('--config');if(!config)throw new Error('Provide the private owner --config path');
 const c=readJson(config) as OwnerConfiguration;validateOwnerConfiguration(c);
 const databasePath=path.join(c.dataDir,'social_command_center.db');
 if(!args.includes('--apply')){const db=new Database(databasePath,{readonly:true,fileMustExist:true});try{console.log(JSON.stringify({readOnly:true,ready:generalPostsReady(db),tables:snapshot(db).map(t=>({name:t.name,count:t.count}))},null,2));}finally{db.close();}return;}
 const backup=option('--backup');if(!backup||!path.isAbsolute(backup)||fs.existsSync(backup)||!path.resolve(backup).toLowerCase().startsWith((path.join(c.workspaceRoot,'.data','v110-rollout')+path.sep).toLowerCase()))throw new Error('A new backup path inside .data/v110-rollout is required');
 if(!fs.readFileSync(path.join(c.workspaceRoot,'docs','qa','V1_10_PRODUCTION_ROLLOUT.md'),'utf8').includes('Rollback'))throw new Error('Document rollback before applying');
 const lock=path.join(c.runtimeDir,'maintenance.lock');const lockFd=fs.openSync(lock,'wx');fs.writeFileSync(lockFd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));
 const ports:net.Server[]=[];let db:Database.Database|undefined;
 try{
  ports.push(await reserve(3001));ports.push(await reserve(3443));
  const source=new Database(databasePath,{readonly:true,fileMustExist:true});let before:ReturnType<typeof snapshot>,protectedRows:any[];
  try{
   if(generalPostsReady(source))throw new Error('Owner already has V1.10; no migration replay is needed');
   const jobs=source.prepare("SELECT pd.id,pd.status,p.scheduled_at,pd.remote_post_id FROM publishing_destinations pd JOIN publishing_posts p ON p.id=pd.post_id WHERE pd.status IN ('preparing','branding','uploading','scheduled')").all() as any[];
   protectedRows=source.prepare("SELECT * FROM publishing_destinations WHERE status='awaiting_confirmation' ORDER BY id").all() as any[];assertOwnerQueueSafe(jobs,protectedRows.map(r=>r.id));
   if((source.prepare("SELECT count(*) n FROM sync_states WHERE status='syncing'").get() as any).n)throw new Error('A sync checkpoint is active; establish a safe idle boundary first');
   const baseline=readJson(path.join(c.workspaceRoot,'.data','v110-rollout','baseline.json'));
   if(JSON.stringify(protectedRows)!==JSON.stringify(baseline.protectedDestinations))throw new Error('Protected manual rows changed since the rollout baseline');
   const envBytes=fs.readFileSync(c.envFile);if(fingerprint(envBytes)!==baseline.ownerEnvSha256||Buffer.from(parse(envBytes).SCC_TOKEN_ENCRYPTION_KEY||'','base64').length!==32)throw new Error('Owner environment/key verification failed');
   before=snapshot(source);privateDirectory(path.dirname(backup));await source.backup(backup);
  }finally{source.close();}
  const saved=new Database(backup,{readonly:true,fileMustExist:true});try{if(saved.pragma('integrity_check',{simple:true})!=='ok'||(saved.pragma('foreign_key_check') as any[]).length)throw new Error('Backup validation failed');validateRows(saved,before!);}finally{saved.close();}
  writeJson(path.join(path.dirname(backup),'backup-receipt.json'),{createdAt:new Date().toISOString(),databasePath,backup,integrity:'ok',tables:before!,protectedCount:protectedRows!.length,release:c.releaseRevision});
  db=new Database(databasePath,{fileMustExist:true});
  migrateV110Database(db,current=>{validateRows(current,before!);if(current.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Migration integrity validation failed');});
  if(!generalPostsReady(db))throw new Error('Migration readiness failed');
  const after=snapshot(db);writeJson(path.join(c.workspaceRoot,'.data','v110-rollout','migration-result.json'),{appliedAt:new Date().toISOString(),release:c.releaseRevision,backup,integrity:'ok',foreignKeyViolations:(db.pragma('foreign_key_check') as any[]).length,originalTables:before!,resultTables:after,allOriginalRowsPreserved:true,protectedRowsUnchanged:true});
  console.log(JSON.stringify({applied:true,backup,integrity:'ok',allOriginalRowsPreserved:true,protectedRowsUnchanged:true,originalTableCount:before!.length,newTableCount:after.length},null,2));
 }finally{db?.close();for(const server of ports)server.close();fs.closeSync(lockFd);fs.unlinkSync(lock);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
