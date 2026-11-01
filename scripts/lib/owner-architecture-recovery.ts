import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { captureArchitectureDatabase, verifyArchitectureMigration } from '../../server/src/db/architecture-schema.js';
import { assertOwnerQueueSafe } from '../../server/src/domain/runtime-recovery.js';
import { retainedFingerprint, retiredManualIds } from './content-reset.js';
import { fingerprint, processIdentity, readJson, type OwnerConfiguration } from './owner-runtime-core.js';
import { configurationFingerprint, type OwnerReleaseManifest } from './owner-release-core.js';

const markerNames = ['owner-update.lock','maintenance.lock']; // Startup exclusion is released last.
type ProcessLookup = typeof processIdentity;

function canonicalFile(file:string) {
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||!stat.isFile()||path.resolve(fs.realpathSync(file))!==path.resolve(file))throw new Error('Recovery evidence must be a canonical regular file');
  return stat;
}
function markers(c:OwnerConfiguration,runDirectory:string,lookup:ProcessLookup) {
  const result=markerNames.map(name=>{
    const file=path.join(c.runtimeDir,name),stat=canonicalFile(file),bytes=fs.readFileSync(file);
    const marker=JSON.parse(bytes.toString('utf8'));
    if(marker.runDirectory!==runDirectory||!Number.isInteger(marker.pid)||marker.pid<=0||! /^[a-f0-9-]{36}$/.test(marker.nonce)||lookup(marker.pid))throw new Error('Retained maintenance marker ownership is not verified');
    return {file,stat,bytes,pid:marker.pid};
  });
  if(result[0].pid!==result[1].pid)throw new Error('Retained maintenance marker owners differ');
  return result;
}

/** No writes, networking, migration, reset, or process startup. Recompute evidence rather than trusting a PASS field. */
export function inspectArchitectureRecovery(c:OwnerConfiguration,run:string,lookup:ProcessLookup=processIdentity) {
  const runDirectory=path.resolve(run),parent=path.join(c.dataDir,'owner-content-maintenance');
  if(path.dirname(runDirectory)!==parent||fs.lstatSync(runDirectory).isSymbolicLink()||path.resolve(fs.realpathSync(runDirectory))!==runDirectory)throw new Error('Select the original canonical owner maintenance run');
  const locks=markers(c,runDirectory,lookup);
  const reportFile=path.join(runDirectory,'report.json');canonicalFile(reportFile);
  const report=readJson(reportFile);
  if(report.version!==1||report.runDir!==runDirectory||report.frozenRevision!==c.releaseRevision||!report.reset?.receiptId||!report.migration?.schemaReady||
    !['complete_maintenance_held','failed'].includes(report.status)||report.status==='failed'&&report.error!=='Post-migration prerequisite or identity verification failed')throw new Error('Maintenance report is not a completed additive recovery boundary');
  const openBackup=(name:string,receipt:{file:string;sha256:string})=>{
    const file=path.join(runDirectory,name);canonicalFile(file);
    if(!receipt||receipt.file!==file||fingerprint(fs.readFileSync(file))!==receipt.sha256)throw new Error('Verified recovery backup changed: '+name);
    return new Database(file,{readonly:true,fileMustExist:true});
  };
  const databases:Database.Database[]=[];
  try{
    const original=openBackup('pre-reset.db',report.preResetBackup);databases.push(original);
    const baseline=openBackup('pre-migration.db',report.preMigrationBackup);databases.push(baseline);
    const ownerFile=path.join(c.dataDir,'social_command_center.db');canonicalFile(ownerFile);
    const owner=new Database(ownerFile,{readonly:true,fileMustExist:true});databases.push(owner);
    captureArchitectureDatabase(original);
    const verified=verifyArchitectureMigration(captureArchitectureDatabase(baseline),owner);
    if(retainedFingerprint(original)!==retainedFingerprint(baseline)||retainedFingerprint(baseline)!==retainedFingerprint(owner))throw new Error('Preserved accounts, credentials, configuration or receipts changed');
    const receipt=owner.prepare('SELECT metadata_json FROM activity_events WHERE id=? AND type=?').get(report.reset.receiptId,'scc_content_reset_safety') as {metadata_json:string}|undefined;
    if(!receipt)throw new Error('Reset safety receipt is missing');
    const body=JSON.parse(receipt.metadata_json);
    if(body.commit!==report.sourceRevision||body.backupSha256!==report.preResetBackup.sha256)throw new Error('Reset safety receipt provenance differs');
    const retired=retiredManualIds(owner);assertOwnerQueueSafe([],[],Date.now(),retired);
    for(const name of ['publishing_destinations','publishing_posts','publishing_commands','sync_states']){
      if((owner.prepare('SELECT count(*) n FROM '+name).get() as {n:number}).n)throw new Error('Recovery requires an empty publishing/command/sync boundary');
    }
    return {...verified,ready:true as const,runDirectory,backupsVerified:2,retiredManualHolds:retired,ownerOpenedReadOnly:true,
      ownerDataFingerprint:fingerprint(JSON.stringify(captureArchitectureDatabase(owner))),
      markerFingerprint:fingerprint(Buffer.concat(locks.map(lock=>lock.bytes))),reportFingerprint:fingerprint(fs.readFileSync(reportFile))};
  }finally{for(const database of databases.reverse())database.close();}
}

/** This exception covers exactly the reviewed fresh-DB initializer addition, never arbitrary schema edits or rollback. */
export function assertArchitectureReleaseCompatibility(current:OwnerConfiguration,candidate:OwnerConfiguration,previous:OwnerReleaseManifest,next:OwnerReleaseManifest) {
  const schema='server/src/db/schema.ts',architecture='server/src/db/architecture-schema.ts';
  const oldFiles=Object.keys(previous.hashes).filter(name=>name.startsWith('server/src/db/')).sort();
  const nextFiles=Object.keys(next.hashes).filter(name=>name.startsWith('server/src/db/')&&name!==architecture).sort();
  if(previous.hashes[architecture]||JSON.stringify(oldFiles)!==JSON.stringify(nextFiles)||!next.hashes[architecture]||
    oldFiles.some(name=>name!==schema&&previous.hashes[name]!==next.hashes[name]))throw new Error('Unreviewed database source change; separate maintenance is required');
  const read=(root:string,name:string)=>fs.readFileSync(path.join(root,...name.split('/')),'utf8').replaceAll('\r\n','\n');
  let candidateSchema=read(candidate.releaseRoot,schema);
  for(const [addition,original] of [
    ["import { db } from './database.js';\nimport {initializeArchitectureSchema} from './architecture-schema.js';\n","import { db } from './database.js';\n"],
    ['    initializeCalendarSchema(db);\n    initializeArchitectureSchema(db);\n','    initializeCalendarSchema(db);\n'],
  ]){
    if(candidateSchema.split(addition).length!==2)throw new Error('Architecture initializer differs from reviewed source');
    candidateSchema=candidateSchema.replace(addition,original);
  }
  if(candidateSchema!==read(current.releaseRoot,schema)||read(candidate.releaseRoot,architecture)!==read(path.resolve(__dirname,'../..'),architecture))throw new Error('Architecture source differs from reviewed implementation');
}

/** Claim the retained exclusion only during an authorized activation. Failed promotion leaves the original hold intact. */
export function claimArchitectureMaintenance(c:OwnerConfiguration,candidate:OwnerConfiguration,run:string,lookup:ProcessLookup=processIdentity) {
  const initial=inspectArchitectureRecovery(c,run,lookup),owned=markers(c,initial.runDirectory,lookup);
  const lock=path.join(c.runtimeDir,'architecture-recovery.lock'),fd=fs.openSync(lock,'wx');
  const identity=fs.fstatSync(fd),bytes=Buffer.from(JSON.stringify({pid:process.pid,runDirectory:initial.runDirectory}));
  let promoted=false,released=false;
  try{fs.writeFileSync(fd,bytes);}catch(error){fs.closeSync(fd);if(fs.lstatSync(lock).ino===identity.ino)fs.unlinkSync(lock);throw error;}
  fs.closeSync(fd);
  const unchanged=(file:string,stat:fs.Stats,expected:Buffer)=>{
    const actual=canonicalFile(file);
    if(actual.dev!==stat.dev||actual.ino!==stat.ino||!fs.readFileSync(file).equals(expected))throw new Error('Recovery marker changed; exclusion retained');
  };
  return {
    allowRelease(){promoted=true;},
    release(){
      if(released)return;
      try{
        if(promoted){
          const live=readJson(path.join(c.runtimeDir,'owner-config.json')) as OwnerConfiguration;
          if(configurationFingerprint(live)!==configurationFingerprint(candidate))throw new Error('Candidate pointer differs; maintenance hold retained');
          if(JSON.stringify(inspectArchitectureRecovery(c,run,lookup))!==JSON.stringify(initial))throw new Error('Recovery evidence changed before exclusion release');
          for(const marker of owned)unchanged(marker.file,marker.stat,marker.bytes);
          for(const marker of owned){unchanged(marker.file,marker.stat,marker.bytes);fs.unlinkSync(marker.file);}
        }
      }finally{
        unchanged(lock,identity,bytes);fs.unlinkSync(lock);released=true;
      }
    },
  };
}
