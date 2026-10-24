import {migrateV110Database} from '../server/src/db/v110-migration.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {generalPostsReady} from '../server/src/db/general-posts-schema.js';

async function main(){
// Read-only inspection by default. This command has no in-place/live apply mode.
const args=process.argv.slice(2);
function option(name:string){const i=args.indexOf(name);return i<0?undefined:args[i+1];}
const sourcePath=option('--database');
if(!sourcePath)throw new Error('Usage: tsx scripts/prepare-general-posts-migration.ts --database PATH [--copy-to NEW_PATH]');
const sourceAbsolute=fs.realpathSync(path.resolve(sourcePath));
const source=new Database(sourceAbsolute,{readonly:true,fileMustExist:true});
const originalHashRows=()=>Object.fromEntries(['publishing_posts','publishing_destinations','videos','branded_videos','post_metrics_snapshots','analytics_snapshots','accounts','account_identities'].map(name=>[name,source.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()]));
const before=JSON.stringify(originalHashRows());
const report:any={sourceReadOnly:true,ready:generalPostsReady(source),publicationCount:(source.prepare('SELECT count(*) AS n FROM publishing_posts').get() as any).n,destinationCount:(source.prepare('SELECT count(*) AS n FROM publishing_destinations').get() as any).n,liveApplyPerformed:false};
const target=option('--copy-to');
try {
  if(target){
    const absolute=path.resolve(target);
    if(fs.existsSync(absolute)||absolute.toLowerCase()===sourceAbsolute.toLowerCase())throw new Error('Copy destination must be a new file; existing files are never replaced');
    fs.mkdirSync(path.dirname(absolute),{recursive:true});
    await source.backup(absolute);
    const copy=new Database(absolute,{fileMustExist:true});
    try{
      if(copy.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Copy integrity check failed');
      migrateV110Database(copy);
      if(copy.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Migrated copy integrity check failed');
      if((copy.pragma('foreign_key_check') as any[]).length)throw new Error('Migrated copy foreign-key check failed');
      report.copyPrepared=true;report.copyReady=generalPostsReady(copy);report.copyIntegrity='ok';
    }finally{copy.close();}
  }
  // An active scheduler/analytics process can legitimately append source rows.
  report.sourceUnchangedDuringRead=before===JSON.stringify(originalHashRows());
  console.log(JSON.stringify(report,null,2));
}finally{source.close();}

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
