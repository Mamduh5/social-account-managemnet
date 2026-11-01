import './helpers/require-isolated-db.js';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {db,dataDir} from '../server/src/db/database.js';
import {initializeDatabase} from '../server/src/db/schema.js';
import {migrateArchitectureDatabase} from '../server/src/db/architecture-schema.js';
import {protectedManualDestinationIds} from '../server/src/domain/runtime-recovery.js';
import {planContentReset,resetContent} from '../scripts/lib/content-reset.js';
import {fingerprint,writeJson,type OwnerConfiguration} from '../scripts/lib/owner-runtime-core.js';
import {candidateOwnerConfiguration,configurationFingerprint,type OwnerReleaseManifest} from '../scripts/lib/owner-release-core.js';
import {activateOwnerRelease} from '../scripts/lib/owner-release-activation.js';
import {inspectArchitectureRecovery,claimArchitectureMaintenance,assertArchitectureReleaseCompatibility} from '../scripts/lib/owner-architecture-recovery.js';

before(()=>{initializeDatabase();db.pragma('journal_mode=DELETE');});after(()=>db.close());
const absent=()=>null;
function fixture(){
  const workspace=fs.mkdtempSync(path.join(dataDir,'recovery-')),data=path.join(workspace,'.data'),runtime=path.join(data,'runtime');
  const run=path.join(data,'owner-content-maintenance','original-run');fs.mkdirSync(run,{recursive:true});fs.mkdirSync(runtime);
  const revision='a'.repeat(40),releaseRoot=path.join(data,'releases',revision);
  const c:OwnerConfiguration={workspaceRoot:workspace,dataDir:data,runtimeDir:runtime,releaseRoot,releaseRevision:revision,
    clientDist:path.join(releaseRoot,'client'),envFile:path.join(workspace,'.env'),providerConfig:path.join(data,'provider.json'),nodePath:process.execPath};
  const original=new Database(db.serialize());original.pragma('foreign_keys=ON');
  original.exec(`DROP TABLE publishing_commands;
    DROP INDEX idx_dest_history_created; DROP INDEX idx_dest_history_updated; DROP INDEX idx_post_history_scheduled;
    INSERT INTO accounts(id,platform,account_type,name,handle,status,access_token) VALUES('account','facebook','page','Fixture','fixture','connected','ENCRYPTED');
    INSERT INTO account_identities(platform,identity_key,account_id) VALUES('facebook','external:100','account');
    INSERT INTO videos(id,title,source_type,original_filename,file_path) VALUES('video','Fixture','manual_upload','fixture.mp4','retained.mp4');
    INSERT INTO publishing_posts(id,video_id,title,status) VALUES('post','video','Fixture','failed');`);
  for(const id of protectedManualDestinationIds)original.prepare("INSERT INTO publishing_destinations(id,post_id,account_id,caption,status) VALUES(?,'post','account','fixture','awaiting_confirmation')").run(id);
  const preReset=path.join(run,'pre-reset.db');fs.writeFileSync(preReset,original.serialize());
  const preResetReceipt={file:preReset,sha256:fingerprint(fs.readFileSync(preReset))};
  const provenance={commit:'b'.repeat(40),backupSha256:preResetReceipt.sha256,receiptId:'reset-1234'};
  const reset=resetContent(original,planContentReset(original),provenance);
  const preMigration=path.join(run,'pre-migration.db');fs.writeFileSync(preMigration,original.serialize());
  const preMigrationReceipt={file:preMigration,sha256:fingerprint(fs.readFileSync(preMigration))};
  const migration=migrateArchitectureDatabase(original);
  const owner=path.join(data,'social_command_center.db');fs.writeFileSync(owner,original.serialize());original.close();
  writeJson(path.join(run,'report.json'),{version:1,status:'failed',error:'Post-migration prerequisite or identity verification failed',runDir:run,frozenRevision:revision,sourceRevision:provenance.commit,reset,migration,preResetBackup:preResetReceipt,preMigrationBackup:preMigrationReceipt});
  for(const name of ['maintenance.lock','owner-update.lock'])writeJson(path.join(runtime,name),{nonce:'12345678-1234-1234-1234-123456789abc',pid:9876,runDirectory:run});
  writeJson(path.join(runtime,'owner-config.json'),c);
  return {c,run,owner,preReset,preMigration,candidate:candidateOwnerConfiguration(c,'c'.repeat(40)),mutate(sql:string){const copy=new Database(owner);try{copy.exec(sql);}finally{copy.close();}}};
}

test('completed recovery is recomputed read-only from both backups, exact rows, schema and retirement receipts',()=>{
  const f=fixture(),files=[f.owner,f.preReset,f.preMigration,...['maintenance.lock','owner-update.lock','owner-config.json'].map(name=>path.join(f.c.runtimeDir,name))];
  const before=files.map(file=>fingerprint(fs.readFileSync(file))),result=inspectArchitectureRecovery(f.c,f.run,absent);
  assert.equal(result.ready,true);assert.equal(result.existingTablesVerified,29);assert.equal(result.backupsVerified,2);
  assert.deepEqual(result.retiredManualHolds,[...protectedManualDestinationIds].sort());
  assert.deepEqual(files.map(file=>fingerprint(fs.readFileSync(file))),before);
});
test('record, credential, safety receipt and schema drift or damaged backups fail recovery',()=>{
  for(const sql of ["UPDATE accounts SET access_token='CHANGED'","UPDATE accounts SET name='CHANGED'","DELETE FROM activity_events",'ALTER TABLE accounts ADD COLUMN unexpected TEXT','CREATE INDEX unexpected ON accounts(name)',"INSERT INTO publishing_commands VALUES('receipt','hash','post','{}','now')"]){
    const f=fixture();f.mutate(sql);assert.throws(()=>inspectArchitectureRecovery(f.c,f.run,absent),/changed|Unexpected|empty/);
  }
  const f=fixture();fs.appendFileSync(f.preReset,'tampered');assert.throws(()=>inspectArchitectureRecovery(f.c,f.run,absent),/backup changed/);
});
test('a live former controller, wrong run, missing or replaced marker cannot authorize takeover',()=>{
  const f=fixture();assert.throws(()=>inspectArchitectureRecovery(f.c,f.run,()=>({pid:9876,startedAt:'now',command:'fixture'})),/ownership/);
  const file=path.join(f.c.runtimeDir,'maintenance.lock');writeJson(file,{nonce:'12345678-1234-1234-1234-123456789abc',pid:9876,runDirectory:'different'});
  assert.throws(()=>inspectArchitectureRecovery(f.c,f.run,absent),/ownership/);fs.unlinkSync(file);
  assert.throws(()=>inspectArchitectureRecovery(f.c,f.run,absent));
});
test('failed or unpromoted activation releases its claim while retaining both original publishing holds',()=>{
  const f=fixture(),lease=claimArchitectureMaintenance(f.c,f.candidate,f.run,absent);
  assert.throws(()=>claimArchitectureMaintenance(f.c,f.candidate,f.run,absent),/EEXIST/);
  lease.release();lease.release();
  for(const name of ['maintenance.lock','owner-update.lock'])assert.equal(fs.existsSync(path.join(f.c.runtimeDir,name)),true);
  assert.equal(fs.existsSync(path.join(f.c.runtimeDir,'architecture-recovery.lock')),false);
});
test('hold release requires successful promotion, the exact candidate pointer and unchanged owned markers',()=>{
  const f=fixture(),lease=claimArchitectureMaintenance(f.c,f.candidate,f.run,absent);lease.allowRelease();
  assert.throws(()=>lease.release(),/pointer differs/);assert.equal(fs.existsSync(path.join(f.c.runtimeDir,'maintenance.lock')),true);
  const g=fixture(),other=claimArchitectureMaintenance(g.c,g.candidate,g.run,absent);other.allowRelease();writeJson(path.join(g.c.runtimeDir,'owner-config.json'),g.candidate);
  fs.appendFileSync(path.join(g.c.runtimeDir,'owner-update.lock'),' ');
  assert.throws(()=>other.release(),/evidence changed/);assert.equal(fs.existsSync(path.join(g.c.runtimeDir,'maintenance.lock')),true);
  const h=fixture(),success=claimArchitectureMaintenance(h.c,h.candidate,h.run,absent);success.allowRelease();writeJson(path.join(h.c.runtimeDir,'owner-config.json'),h.candidate);success.release();
  for(const name of ['maintenance.lock','owner-update.lock','architecture-recovery.lock'])assert.equal(fs.existsSync(path.join(h.c.runtimeDir,name)),false);
});
test('compatibility exception permits only the exact reviewed architecture addition and blocks backward promotion',()=>{
  const f=fixture(),schema='server/src/db/schema.ts',architecture='server/src/db/architecture-schema.ts';
  const candidateSchema=fs.readFileSync(schema,'utf8').replaceAll('\r\n','\n');
  const oldSchema=candidateSchema.replace("import {initializeArchitectureSchema} from './architecture-schema.js';\n",'').replace('    initializeArchitectureSchema(db);\n','');
  for(const [root,content] of [[f.c.releaseRoot,oldSchema],[f.candidate.releaseRoot,candidateSchema]]){fs.mkdirSync(path.join(root,'server/src/db'),{recursive:true});fs.writeFileSync(path.join(root,schema),content);}
  fs.copyFileSync(architecture,path.join(f.candidate.releaseRoot,architecture));
  const previous:OwnerReleaseManifest={revision:f.c.releaseRevision,hashes:{[schema]:fingerprint(oldSchema)}};
  const next:OwnerReleaseManifest={revision:f.candidate.releaseRevision,hashes:{[schema]:fingerprint(candidateSchema),[architecture]:fingerprint(fs.readFileSync(architecture))}};
  assert.doesNotThrow(()=>assertArchitectureReleaseCompatibility(f.c,f.candidate,previous,next));
  assert.throws(()=>assertArchitectureReleaseCompatibility(f.candidate,f.c,next,previous),/Unreviewed/);
  assert.throws(()=>assertArchitectureReleaseCompatibility(f.c,f.candidate,previous,{...next,hashes:{...next.hashes,'server/src/db/unreviewed.ts':'e'.repeat(64)}}),/Unreviewed/);
  fs.writeFileSync(path.join(f.candidate.releaseRoot,schema),candidateSchema.replace('    initializeArchitectureSchema(db);\n','')+'\n    initializeArchitectureSchema(db);\n');
  assert.throws(()=>assertArchitectureReleaseCompatibility(f.c,f.candidate,previous,next),/reviewed/);
  fs.writeFileSync(path.join(f.candidate.releaseRoot,schema),candidateSchema);
  fs.appendFileSync(path.join(f.candidate.releaseRoot,schema),'\n// Unreviewed');
  assert.throws(()=>assertArchitectureReleaseCompatibility(f.c,f.candidate,previous,next),/reviewed/);
});
test('recovery activation retains the hold on every failure and releases only after complete promotion; stopped owner never starts',async()=>{
  for(const failure of ['verify','backup','promote','refresh','record',null]){
    const f=fixture();let lease:ReturnType<typeof claimArchitectureMaintenance>|undefined,starts=0;
    const fail=(phase:string)=>{if(failure===phase)throw new Error('injected '+phase);};
    const activation=()=>activateOwnerRelease({authorized:true,current:f.c,candidate:f.candidate,expectedConfigurationFingerprint:configurationFingerprint(f.c)},{
      acquire(){lease=claimArchitectureMaintenance(f.c,f.candidate,f.run,absent);return ()=>lease!.release();},
      readConfiguration:()=>JSON.parse(fs.readFileSync(path.join(f.c.runtimeDir,'owner-config.json'),'utf8')),
      verify:c=>({revision:c.releaseRevision,hashes:{'server/src/db/schema.ts':'d'.repeat(64)}}),
      verifySchemaCompatibility(){fail('verify');},wasRunning:()=>false,async stop(){},
      async backup(){fail('backup');return {integrity:'ok'};},
      promote(c){fail('promote');writeJson(path.join(f.c.runtimeDir,'owner-config.json'),c);},
      refreshStartup(){fail('refresh');},async start(){starts++;},
      record(event){if(event.event==='owner_release_activation_promoted'){fail('record');lease!.allowRelease();}},
    });
    if(failure)await assert.rejects(activation,/injected/);else await activation();
    assert.equal(starts,0);
    for(const name of ['maintenance.lock','owner-update.lock'])assert.equal(fs.existsSync(path.join(f.c.runtimeDir,name)),failure!==null);
  }
});
