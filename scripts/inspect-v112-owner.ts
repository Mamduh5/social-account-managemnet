/** Read-only owner evidence. Never initializes schemas or imports a worker. */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {MetaFacebookConnector} from '../server/src/connectors/meta-facebook.js';
import {unseal} from '../server/src/services/token-protection.js';
async function main(){
const root=process.cwd(),out=path.join(root,'.data/v112-owner');
fs.mkdirSync(out,{recursive:true});
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const configPath=path.join(root,'.data/runtime/owner-config.json');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const database=new Database(path.join(config.dataDir,'social_command_center.db'),{readonly:true,fileMustExist:true});
const holds=['dest-mvf5hdwf-19hi','dest-mvf5j24q-ub0y','dest-mvf5j24r-rw4x'];
const columns=(table:string)=>database.prepare(`PRAGMA table_info(${table})`).all() as any[];
const tableHash=(table:string,excluded:string[]=[])=>{
 const names=columns(table).map(c=>c.name).filter(n=>!excluded.includes(n));
 return hash(JSON.stringify(database.prepare(`SELECT ${names.map(n=>`"${n}"`).join(',')} FROM ${table} ORDER BY rowid`).all()));
};
const accounts=database.prepare('SELECT * FROM accounts WHERE is_demo=0 AND archived_at IS NULL').all() as any[];
const safeAccounts=await (await fetch('http://127.0.0.1:3001/api/accounts',{signal:AbortSignal.timeout(10000)})).json() as any;
const pages=[];
const commentReads:any[]=[];
for(const account of accounts.filter(a=>a.platform==='facebook')) {
 const connector=new MetaFacebookConnector();
 // Only a bounded authenticated GET /me identity check; no health persistence.
 const health=await connector.verifyHealth({...account,access_token:unseal(account.access_token)});
 pages.push({id:account.id,name:account.name,publicUrl:account.public_url,graphId:account.external_id,
  identityVerifiedAt:account.identity_verified_at,connectionStatus:account.connection_status,
  syncStatus:account.sync_status,lastSyncedAt:account.last_synced_at,capabilities:safeAccounts.accounts.find((a:any)=>a.id===account.id)?.capabilities,health});
 const posts=database.prepare("SELECT id,remote_post_id FROM publishing_destinations WHERE account_id=? AND status='published' AND remote_post_id IS NOT NULL ORDER BY published_at DESC LIMIT 2").all(account.id) as any[];
 for(const post of posts) {
  const url=new URL(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v25.0'}/${post.remote_post_id}/comments`);
  url.searchParams.set('fields','id,message,parent');url.searchParams.set('limit','5');
  try {
   const response=await fetch(url,{headers:{Authorization:`Bearer ${unseal(account.access_token)}`},signal:AbortSignal.timeout(15000)});
   const result=await response.json() as any;
   commentReads.push({accountId:account.id,destinationId:post.id,httpStatus:response.status,status:response.ok&&!result.error&&Array.isArray(result.data)?'confirmed_read':'unavailable',observedComments:response.ok&&!result.error&&Array.isArray(result.data)?result.data.length:null,complete:!result.paging?.next,providerErrorCode:typeof result.error?.code==='number'?result.error.code:null});
  }catch {commentReads.push({accountId:account.id,destinationId:post.id,status:'unavailable',observedComments:null});}
 }
}
const mediaRows=[...database.prepare('SELECT file_path,thumbnail_path FROM videos').all(),...database.prepare('SELECT file_path,thumbnail_path FROM branded_videos').all()] as any[];
const imageMedia=database.prepare('SELECT id,sha256,file_path FROM media_images').all() as any[];
const media=[...new Set(mediaRows.flatMap(r=>[r.file_path,r.thumbnail_path]).filter(Boolean))].sort().map(file=>({path:file,sha256:fs.existsSync(file)?hash(fs.readFileSync(file)):null}));
const provider=JSON.parse(fs.readFileSync(config.providerConfig,'utf8').replace(/^\uFEFF/,''));
const providerFiles=[config.providerConfig,...Object.entries(provider).filter(([key,value])=>/ledger|usage/i.test(key)&&typeof value==='string').map(([,value])=>value as string)].filter(f=>fs.existsSync(f));
const evidence={observedAt:new Date().toISOString(),pages,releaseRevision:config.releaseRevision,configHash:hash(fs.readFileSync(configPath)),
 health:await (await fetch('http://127.0.0.1:3001/api/health',{signal:AbortSignal.timeout(10000)})).json(),commentReads,
 envHash:hash(fs.readFileSync(config.envFile)),providerFiles:providerFiles.map(file=>({file,sha256:hash(fs.readFileSync(file))})),
 accountsHash:tableHash('accounts',['updated_at','last_synced_at','sync_status','sync_error','last_health_check','health_status']),
 identityAliasesHash:tableHash('account_identities'),
 publicationHash:tableHash('publishing_destinations',['updated_at','last_synced_at','sync_status','sync_error']),postsHash:tableHash('publishing_posts'),
 videoHash:tableHash('videos'),variantHash:tableHash('branded_videos'),media,imageMedia:imageMedia.map(im=>({id:im.id,storedSha:im.sha256,actualSha:fs.existsSync(im.file_path)?hash(fs.readFileSync(im.file_path)):null})),
 protectedRows:holds.map(id=>database.prepare('SELECT * FROM publishing_destinations WHERE id=?').get(id)),
 queue:database.prepare('SELECT status,count(*) count FROM publishing_destinations GROUP BY status').all(),
 comments:database.prepare('SELECT account_id,source,count(*) count FROM comments GROUP BY account_id,source').all()};
if(evidence.protectedRows.some((r:any)=>!r||r.status!=='awaiting_confirmation'))throw new Error('Protected holds missing or changed');
const baselinePath=path.join(out,'baseline.json');
let preserved:any=null;
if(fs.existsSync(baselinePath)){
 const old=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
 const keys=['releaseRevision','configHash','envHash','providerFiles','accountsHash','identityAliasesHash','publicationHash','postsHash','videoHash','variantHash','media','protectedRows'];
 preserved=Object.fromEntries(keys.map(key=>[key,JSON.stringify(old[key])===JSON.stringify((evidence as any)[key])]));
 fs.writeFileSync(path.join(out,'final.json'),JSON.stringify({evidence,preserved},null,2));
}else fs.writeFileSync(baselinePath,JSON.stringify(evidence,null,2),{flag:'wx'});
database.close();
console.log(JSON.stringify({observedAt:evidence.observedAt,pages,queue:evidence.queue,comments:evidence.comments,commentReads,mediaCount:media.length,imageIntegrity:evidence.imageMedia.every(im=>im.storedSha===im.actualSha),preserved},null,2));
}
main().catch((error:any)=>{console.error('Read-only owner evidence could not complete; '+String(error.message).replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]'));process.exitCode=1;});
