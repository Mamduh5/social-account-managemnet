import {assertOwnerQueueSafe} from '../server/src/domain/runtime-recovery.js';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {parse} from 'dotenv';

const root=path.resolve(__dirname,'..');
const revision='12ae5d8';
const recovery=path.join(root,'.data','v110-recovery');
const snapshot=path.join(recovery,'owner-runtime-'+revision);
const databasePath=path.join(root,'.data','social_command_center.db');
const envPath=path.join(root,'.env');
function hash(bytes:Buffer|string){return createHash('sha256').update(bytes).digest('hex');}
function inspect(db:Database.Database){
 const jobs=db.prepare("SELECT pd.id,pd.status,p.scheduled_at,pd.remote_post_id FROM publishing_destinations pd JOIN publishing_posts p ON p.id=pd.post_id WHERE pd.status IN ('preparing','branding','uploading','scheduled')").all() as any[];
 const pending=db.prepare("SELECT * FROM publishing_destinations WHERE status='awaiting_confirmation' ORDER BY id").all() as any[];
 assertOwnerQueueSafe(jobs,pending.map(p=>p.id));
 return {jobs,protectedDestinations:pending,schema:db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()};
}
async function assertPortFree(port:number){await new Promise<void>((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(new Error('Port '+port+' is already in use; no runtime was started')));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve()));});}
async function main(){
 fs.mkdirSync(recovery,{recursive:true});
 const ownerEnv=parse(fs.readFileSync(envPath));
 if(Buffer.from(ownerEnv.SCC_TOKEN_ENCRYPTION_KEY||'','base64').length!==32)throw new Error('Owner encryption key is not configured');
 if(ownerEnv.SCC_DATA_DIR && path.resolve(root,ownerEnv.SCC_DATA_DIR)!==databasePath.replace(/[\\/]social_command_center.db$/,''))throw new Error('Unexpected owner data directory; resolve before restoring');
 const owner=new Database(databasePath,{readonly:true,fileMustExist:true});
 let baseline:any;try{baseline=inspect(owner);}finally{owner.close();}
 const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'server/src'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/);
 const sourceHashes:Record<string,string>={};
 for(const file of files){
  const bytes=execFileSync('git',['show',revision+':'+file],{cwd:root,maxBuffer:10_000_000,windowsHide:true});
  const destination=path.join(snapshot,file);fs.mkdirSync(path.dirname(destination),{recursive:true});
  if(fs.existsSync(destination)&&hash(fs.readFileSync(destination))!==hash(bytes))throw new Error('Pinned runtime snapshot was modified');
  if(!fs.existsSync(destination))fs.writeFileSync(destination,bytes,{flag:'wx'});
  sourceHashes[file]=hash(bytes);
 }
 fs.writeFileSync(path.join(recovery,'owner-source-manifest.json'),JSON.stringify({revision,sourceHashes,databasePath},null,2));
 const runtimeEnv={...process.env,DOTENV_CONFIG_PATH:envPath,SCC_DATA_DIR:path.dirname(databasePath),SCC_SEED_DEMOS:'false',PORT:'3001'};
 // Rehearse startup against a fresh copy with every provider request blocked.
 if(process.argv.includes('--rehearse')){
  const copyDir=path.join(recovery,'rehearsal-'+Date.now());fs.mkdirSync(copyDir,{recursive:true});
  const copyPath=path.join(copyDir,'social_command_center.db');
  const source=new Database(databasePath,{readonly:true,fileMustExist:true});try{await source.backup(copyPath);}finally{source.close();}
  const harness=path.join(recovery,'rehearse-owner.ts');
  fs.writeFileSync(harness,`import {pathToFileURL} from 'node:url';
if(!process.env.SCC_DATA_DIR?.includes('v110-recovery')||process.env.PORT!=='3197')throw new Error('Rehearsal isolation required');
globalThis.fetch=async()=>{throw new Error('Rehearsal provider traffic blocked');};
(async()=>{const dir=process.env.SCC_OWNER_SNAPSHOT!;await import(pathToFileURL(dir+'/server/src/index.ts').href);const {queueService}=await import(pathToFileURL(dir+'/server/src/services/queue.service.ts').href);const {syncService}=await import(pathToFileURL(dir+'/server/src/services/sync.service.ts').href);queueService.stop();syncService.stop();console.log('OWNER_REHEARSAL_READY');process.exit(0);})().catch(()=>{console.error('Owner rehearsal failed');process.exit(1);});
`);
  const child=spawnSync(process.execPath,['--import','tsx',harness],{cwd:root,env:{...runtimeEnv,SCC_DATA_DIR:copyDir,PORT:'3197',SCC_OWNER_SNAPSHOT:snapshot},encoding:'utf8',timeout:30000,windowsHide:true});
  if(child.status!==0||!child.stdout.includes('OWNER_REHEARSAL_READY'))throw new Error('Owner startup rehearsal failed');
  const copy=new Database(copyPath,{readonly:true,fileMustExist:true});let after:any;try{after=inspect(copy);}finally{copy.close();}
  if(JSON.stringify(baseline.schema)!==JSON.stringify(after.schema))throw new Error('Startup requires a schema change; live restoration blocked');
  if(JSON.stringify(baseline.protectedDestinations)!==JSON.stringify(after.protectedDestinations))throw new Error('Startup changed protected manual jobs; live restoration blocked');
  const report={revision,databasePath,rehearsalPassed:true,schemaUnchanged:true,protectedRowsUnchanged:true,activeJobs:baseline.jobs.length,providerRequests:0};
  fs.writeFileSync(path.join(recovery,'owner-rehearsal.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }
 if(!process.argv.includes('--start')){console.log('Read-only owner preflight complete; no owner process started.');return;}
 const evidence=JSON.parse(fs.readFileSync(path.join(recovery,'owner-rehearsal.json'),'utf8'));
 if(!evidence.rehearsalPassed||evidence.revision!==revision)throw new Error('Successful pinned startup rehearsal is required');
 await assertPortFree(3001);
 const check=new Database(databasePath,{readonly:true,fileMustExist:true});try{inspect(check);}finally{check.close();}
 const stdout=fs.openSync(path.join(recovery,'owner-server.stdout.log'),'a');const stderr=fs.openSync(path.join(recovery,'owner-server.stderr.log'),'a');
 const child=spawn(process.execPath,['--import','tsx',path.join(snapshot,'server/src/index.ts')],{cwd:root,env:runtimeEnv,stdio:['ignore',stdout,stderr],windowsHide:true,detached:true});child.unref();
 fs.writeFileSync(path.join(recovery,'owner-runtime.json'),JSON.stringify({pid:child.pid,revision,databasePath,startedAt:new Date().toISOString(),watcher:false,entrypoint:path.join(snapshot,'server/src/index.ts')},null,2));
 console.log(JSON.stringify({started:true,pid:child.pid,revision,databasePath,port:3001}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
