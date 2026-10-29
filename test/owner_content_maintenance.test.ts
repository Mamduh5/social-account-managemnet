import './helpers/require-isolated-db.js';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {db,dataDir} from '../server/src/db/database.js';
import {initializeDatabase} from '../server/src/db/schema.js';
import {planContentReset,resetContent,retiredManualIds,retainedFingerprint,tableCounts,verifyDatabase} from '../scripts/lib/content-reset.js';
import {bootMaintenanceCopy} from '../scripts/owner-content-maintenance.js';
import {architectureSchemaReady,migrateArchitectureDatabase} from '../server/src/db/architecture-schema.js';
import {assertOwnerQueueSafe,protectedManualDestinationIds} from '../server/src/domain/runtime-recovery.js';
import {activityRepo} from '../server/src/repositories/activity.repo.js';
import {contentWorkspaceRepo} from '../server/src/repositories/content-workspace.repo.js';
import {normalizeIdentity} from '../server/src/domain/account-identity.js';

before(()=>{initializeDatabase();db.pragma('journal_mode=DELETE');});after(()=>db.close());
const provenance={commit:'a'.repeat(40),backupSha256:'b'.repeat(64),receiptId:'reset-1234'};
function fixture(){
  const copy=new Database(db.serialize());copy.pragma('foreign_keys=ON');
  copy.exec(`INSERT INTO categories(id,name,slug,color) VALUES('category','Fixture','fixture','#000');
    INSERT INTO accounts(id,platform,account_type,name,handle,category_id,status,access_token,refresh_token,external_id) VALUES('account','facebook','page','Fixture','fixture','category','connected','ENCRYPTED_FIXTURE','ENCRYPTED_REFRESH','100');
    INSERT INTO account_identities(platform,identity_key,account_id) VALUES('facebook','external:100','account');
    INSERT INTO videos(id,title,source_type,original_filename,file_path) VALUES('video','Synthetic','manual_upload','fixture.mp4','retained-file.mp4');
    INSERT INTO publishing_posts(id,video_id,title,status) VALUES('post','video','Synthetic','failed');
    INSERT INTO publishing_destinations(id,post_id,account_id,caption,status,remote_post_id) VALUES('published','post','account','old caption','published','remote-100');
    INSERT INTO publishing_destinations(id,post_id,account_id,caption,status) VALUES('failed','post','account','old caption','failed');
    INSERT INTO facebook_group_plans(id,name,url,identity_type,account_id,membership) VALUES('group','Fixture','https://www.facebook.com/groups/123','page','account','unknown');
    INSERT INTO group_plan_extensions(group_id,original_url) VALUES('group','https://www.facebook.com/groups/123');
    INSERT INTO group_membership_observations(id,group_id,account_id,status) VALUES('membership','group','account','unknown');
    INSERT INTO group_prepared_content(id,group_id,kind,content) VALUES('prepared','group','post','fixture');
    INSERT INTO group_receipt_events(id,prepared_id,url) VALUES('receipt','prepared','https://www.facebook.com/groups/123/posts/1');
    INSERT INTO group_receipt_events(id,prepared_id,url,supersedes_id) VALUES('corrected','prepared','https://www.facebook.com/groups/123/posts/2','receipt');
    INSERT INTO app_settings(key,value) VALUES('cleanup:classification:fixture','test');
    INSERT OR REPLACE INTO app_settings(key,value) VALUES('pipeline_api_url','https://fixture.invalid');
    INSERT INTO content_workspace_audit(id,entity_id,action,detail_json) VALUES('reply-audit','reply-comment:account:old-local-id','reply_submission_intent','{"accountId":"account","externalCommentId":"remote-comment"}');
    INSERT INTO content_workspace_audit(id,entity_id,action,detail_json) VALUES('draft-audit','draft-id','draft_created','{"source":"provider"}');
    INSERT INTO activity_events(id,type,title,message) VALUES('old-activity','system','Old','Ordinary');`);
  for(const id of protectedManualDestinationIds)copy.prepare("INSERT INTO publishing_destinations(id,post_id,account_id,caption,status) VALUES(?,'post','account','old handoff','awaiting_confirmation')").run(id);
  copy.prepare("INSERT OR IGNORE INTO account_identities(platform,identity_key,account_id) VALUES('facebook',?,'account')").run(normalizeIdentity('facebook','fixture').key);
  return copy;
}

test('reviewed reset clears complete ordinary graphs and keeps exact accounts, safety evidence, schema and FK enforcement',()=>{
  const copy=fixture();try{
    const plan=planContentReset(copy),before=retainedFingerprint(copy),schema=copy.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
    const result=resetContent(copy,plan,provenance);
    assert.equal(retainedFingerprint(copy),before);assert.equal(result.after.videos,0);assert.equal(result.after.publishing_destinations,0);assert.equal(result.after.group_receipt_events,0);
    assert.equal(result.after.content_workspace_audit,2);assert.equal(result.after.activity_events,1);
    assert.deepEqual(copy.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(),schema);
    assert.equal(copy.pragma('foreign_keys',{simple:true}),1);verifyDatabase(copy);
    assert.deepEqual(retiredManualIds(copy),[...protectedManualDestinationIds].sort());
    assert.doesNotThrow(()=>assertOwnerQueueSafe([],[],Date.now(),retiredManualIds(copy)));
    const receipt=JSON.parse((copy.prepare('SELECT metadata_json FROM activity_events').get() as any).metadata_json);
    assert.equal(receipt.destinations.find((d:any)=>d.id==='published').remote_post_id,'remote-100');
    assert.equal(receipt.destinations.filter((d:any)=>d.status==='awaiting_confirmation').length,3);
    assert.equal(JSON.stringify(receipt).includes('old caption'),false);assert.equal(result.mediaFilesRemoved,0);
  }finally{copy.close();}
});
test('stale inventory and unknown tables stop without modifying content',()=>{
  const copy=fixture();try{const plan=planContentReset(copy);copy.exec("INSERT INTO activity_events(id,type,title,message) VALUES('changed','system','Changed','Changed')");
    assert.throws(()=>resetContent(copy,plan,provenance),/inventory changed/);assert.equal(tableCounts(copy).videos,1);
    copy.exec('CREATE TABLE unknown_content(id TEXT)');assert.throws(()=>planContentReset(copy),/inventory/);
  }finally{copy.close();}
});
test('active, due, uncertain provider and exchanging OAuth operations fail closed',()=>{
  for(const status of ['scheduled','preparing','branding','uploading']){const copy=fixture();try{copy.prepare('UPDATE publishing_destinations SET status=? WHERE id=?').run(status,'failed');assert.throws(()=>planContentReset(copy),/Active or scheduled/);}finally{copy.close();}}
  const copy=fixture();try{copy.exec("UPDATE publishing_destinations SET remote_post_id='uncertain' WHERE id='failed'");assert.throws(()=>planContentReset(copy),/Uncertain/);}finally{copy.close();}
  const oauth=fixture();try{oauth.exec("INSERT INTO oauth_sessions(state_hash,browser_hash,account_id,revision,expires_at,phase) VALUES('hash','browser','account',1,9999999999999,'exchanging')");assert.throws(()=>planContentReset(oauth),/OAuth/);}finally{oauth.close();}
});
test('failure after deletion rolls back every row and reinstates append-only triggers',()=>{
  const copy=fixture();try{const plan=planContentReset(copy);const before=tableCounts(copy);
    // Duplicate retained safety ID forces a late insertion failure after all DELETEs.
    copy.exec("INSERT INTO activity_events(id,type,title,message) VALUES('reset-1234','test_data_deleted','Safety','Safety')");
    const actual=planContentReset(copy);assert.throws(()=>resetContent(copy,actual,provenance),/UNIQUE/);
    assert.equal(tableCounts(copy).videos,before.videos);assert.equal(tableCounts(copy).group_membership_observations,1);
    assert.throws(()=>copy.exec('DELETE FROM group_membership_observations'),/append-only/);assert.equal(plan.tables.find(t=>t.table==='accounts')?.remove,0);
  }finally{copy.close();}
});
test('changed triggers and damaged retirement receipts are rejected; missing holds remain protected by default',()=>{
  const copy=fixture();try{copy.exec('DROP TRIGGER group_membership_no_delete');assert.throws(()=>planContentReset(copy),/trigger/);}finally{copy.close();}
  const other=fixture();try{resetContent(other,planContentReset(other),provenance);other.exec("UPDATE activity_events SET metadata_json='{}'");assert.throws(()=>retiredManualIds(other),/Invalid/);}finally{other.close();}
  assert.throws(()=>assertOwnerQueueSafe([],[]),/Protected/);
  assert.throws(()=>assertOwnerQueueSafe([],[],Date.now(),['unexpected']),/Protected/);
});
test('post-reset migration adds prerequisites without changing retained rows and fails readiness if an index is absent',()=>{
  const copy=fixture();try{resetContent(copy,planContentReset(copy),provenance);copy.exec('DROP TABLE publishing_commands; DROP INDEX idx_dest_history_created');
    assert.equal(architectureSchemaReady(copy),false);const before=retainedFingerprint(copy);migrateArchitectureDatabase(copy);
    assert.equal(architectureSchemaReady(copy),true);assert.equal(tableCounts(copy).publishing_commands,0);
    // The empty new receipts table is additive; all existing data remains identical.
    copy.exec('DROP TABLE publishing_commands');assert.equal(retainedFingerprint(copy),before);migrateArchitectureDatabase(copy);verifyDatabase(copy);
  }finally{copy.close();}
});
test('source runtime boots on a reset copy with no workers or outbound requests',async()=>{
  const copy=fixture();try{resetContent(copy,planContentReset(copy),provenance);migrateArchitectureDatabase(copy);
    const run=path.join(dataDir,'boot-rehearsal');fs.mkdirSync(run);
    const result=await bootMaintenanceCopy({nodePath:process.execPath},copy,run,'synthetic',path.resolve('server/src/index.ts'));
    assert.equal(result?.ready,true);assert.equal(result?.outboundAttempts,0);
  }finally{copy.close();}
});
test('reset safety events cannot be deleted through Activity and daily accounting survives draft removal',()=>{
  db.prepare('INSERT INTO activity_events(id,type,title,message) VALUES(?,?,?,?)').run('protected-reset','scc_content_reset_safety','Safety','Safety');
  assert.throws(()=>activityRepo.deleteEvent('protected-reset'),/retained safety/);
  const before=contentWorkspaceRepo.generatedToday();db.prepare('INSERT INTO content_workspace_audit(id,entity_id,action,detail_json) VALUES(?,?,?,?)').run('provider-accounting','removed-draft','draft_created',JSON.stringify({source:'provider'}));
  assert.equal(contentWorkspaceRepo.generatedToday(),before+1);
});
