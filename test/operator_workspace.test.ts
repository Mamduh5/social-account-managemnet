import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {db,dataDir} from '../server/src/db/database.js';
import {initializeDatabase} from '../server/src/db/schema.js';
import {initializeContentWorkspace} from '../server/src/db/content-workspace.js';
import {initializeCalendarSchema} from '../server/src/db/calendar-schema.js';
import {operatorWorkspaceService as service} from '../server/src/services/operator-workspace.service.js';
import {seal} from '../server/src/services/token-protection.js';

before(()=>{
  assert.match(dataDir,/test-runs/i);
  process.env.SCC_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,47).toString('base64');
  initializeDatabase();initializeContentWorkspace();initializeCalendarSchema(db);
  for(const [id,graph,name] of [['operator-a','123456','Development Page'],['operator-b','654321','Entertainment Page']]) {
    db.prepare(`INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,external_id,is_demo,connection_status,access_token,identity_verified_at,token_expires_at,granted_scopes_json) VALUES (?,'facebook','page',?,?,'connected','official_api',?,0,'connected',?,?,?,?)`).run(id,name,'@'+id,graph,seal('private-token-'+id),'2026-10-20',new Date(Date.now()+86400000).toISOString(),JSON.stringify(['pages_manage_posts','pages_read_engagement']));
  }
  globalThis.fetch=async()=>{throw new Error('No model or social provider calls permitted');};
});
after(()=>db.close());
const plan=(id:string,accountId='operator-a')=>({id,accountId,name:'Owner review draft',editorialScope:'User supplied topics',days:7,startDate:'2099-01-01',origin:'manual',maxPublications:1,items:[{title:'Draft only',contentType:'text',caption:'Test content awaiting owner approval',scheduledAt:'2099-01-01T10:00:00+07:00'}]});

test('operator context allowlists identities and preserves independent provisional voice',()=>{
  db.prepare('UPDATE accounts SET brand_kit_json=? WHERE id=?').run(JSON.stringify({text:'Page A',logoPath:'D:/private/branding/logo.png',unknownSecret:'private-token-extra'}),'operator-a');
  const a=service.context('operator-a'),b=service.context('operator-b');
  assert.equal(a.account.graphId,'123456');assert.equal(b.account.graphId,'654321');
  assert.notEqual(a.contextFingerprint,b.contextFingerprint);
  assert.equal(a.voice.revision,0);assert.equal(a.voice.profile.provisional,true);
  const text=JSON.stringify(a);assert.doesNotMatch(text,/private-token|enc1:|access_token|file_path|logoPath|D:\/private/);
});
test('external prepared import stays awaiting approval and is idempotent after response uncertainty',()=>{
  const body={contextFingerprint:service.context('operator-a').contextFingerprint,plan:plan('operator-first'),operatorLabel:'Codex'};
  const saved=service.prepare(body);
  assert.equal(saved.campaign.status,'awaiting_approval');assert.equal(saved.campaign.approvedHash,null);
  assert.equal(saved.items.length,1);assert.equal(saved.items[0].status,'draft');
  const retry=service.prepare(body);assert.equal(retry.reused,true);assert.equal(retry.campaign.id,saved.campaign.id);
  assert.equal((db.prepare('SELECT count(*) n FROM publishing_destinations').get() as any).n,0);
  assert.equal(service.context('operator-b').campaigns.length,0);
});
test('wrong Page, changed voice/branding and reused IDs reject before inserting anything',()=>{
  const context=service.context('operator-a');
  assert.throws(()=>service.prepare({contextFingerprint:context.contextFingerprint,plan:plan('wrong-page','operator-b')}),/changed/);
  assert.throws(()=>service.prepare({contextFingerprint:context.contextFingerprint,plan:{...plan('operator-first'),name:'Changed content'}}),/different prepared payload/);
  db.prepare('UPDATE accounts SET brand_kit_json=? WHERE id=?').run(JSON.stringify({text:'Updated brand'}),'operator-a');
  assert.throws(()=>service.prepare({contextFingerprint:context.contextFingerprint,plan:plan('old-context')}),/changed/);
  assert.equal(service.context('operator-a').campaigns.length,1);
});
