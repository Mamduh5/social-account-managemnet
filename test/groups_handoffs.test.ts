import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase } from '../server/src/db/schema.js';
import { initializeContentWorkspace } from '../server/src/db/content-workspace.js';
import { db,dataDir } from '../server/src/db/database.js';
import { groupsWorkspaceService as groups } from '../server/src/services/groups-workspace.service.js';

assert.ok(process.env.SCC_DATA_DIR && /test-runs/.test(dataDir),'An isolated Groups test directory is required');
initializeDatabase();initializeContentWorkspace();
db.prepare("INSERT INTO accounts(id,platform,account_type,name,handle) VALUES ('page-a','facebook','page','Page A','a'),('page-b','facebook','page','Page B','b'),('personal','facebook','personal','Personal','p')").run();
db.prepare("INSERT INTO videos(id,title,source_type,original_filename,file_path) VALUES ('video-a','Owner selected video','manual_upload','existing.mp4','not-opened-in-test.mp4')").run();
const plan=(accountId='page-a',url='https://www.facebook.com/groups/fixture-a')=>({name:'Owner Group',url,identityType:'page',accountId,membership:'member',rules:'Only relevant development updates',rulesReviewedAt:'2026-10-26'});

test('Group handoffs bind the original Page, Group rules, relevance and media without creating publishing work',()=>{
  const before=(db.prepare('SELECT COUNT(*) n FROM publishing_destinations').get() as any).n;
  const g=groups.save(undefined,plan());
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Wrong Page',accountId:'page-b'}),/match/);
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Wrong source Page',sourcePageId:'page-b'}),/match/);
  const p=groups.prepare(g.id,{kind:'post',content:'Specific caption for this Group',relevance:'Members discuss local app development',media:[{kind:'video',id:'video-a'}],reminderAt:'2026-10-26T09:30:00+07:00'});
  assert.equal(p.handoffContext.sourcePage.id,'page-a');
  assert.equal(p.handoffContext.reminderAt,'2026-10-26T02:30:00.000Z');
  groups.save(g.id,{...plan('page-b','https://www.facebook.com/groups/fixture-b'),rules:'Changed rules'});
  const handoff=groups.package(p.id);
  assert.equal(handoff.sourcePage.id,'page-a');
  assert.equal(handoff.group.rules,'Only relevant development updates');
  assert.equal(handoff.nativeUrl,'https://www.facebook.com/groups/fixture-a');
  assert.equal(handoff.planChanged,true);
  assert.equal(handoff.media[0].url,'/api/publishing/videos/video-a/stream');
  assert.match(handoff.text,/Page A/);assert.doesNotMatch(handoff.text,/Page B/);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM publishing_destinations').get() as any).n,before);
  assert.equal(groups.reminders().find(r=>r.preparedId===p.id)?.status,'pending_manual_action');
  assert.throws(()=>groups.receipt(p.id,{url:'https://www.facebook.com/groups/fixture-b/posts/123',confirmOwnerEntered:true}),/registered group/);
  groups.receipt(p.id,{url:'https://www.facebook.com/groups/fixture-a/posts/123',confirmOwnerEntered:true,note:'Owner statement only'});
  assert.equal(groups.reminders().some(r=>r.preparedId===p.id),false);
  assert.equal(groups.package(p.id).publicationStatus,'owner_receipt_recorded_unverified');
  assert.equal(groups.package(p.id).publicationVerified,false);
});

test('Group preparation rejects missing media, duplicate media, ambiguous reminders and unavailable source Pages',()=>{
  const g=groups.save(undefined,plan());
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Caption',media:[{kind:'video',id:'missing'}]}),/missing/);
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Caption',media:[{kind:'video',id:'video-a'},{kind:'video',id:'video-a'}]}),/more than once/);
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Caption',reminderAt:'2026-10-26T09:30'}),/timezone/);
  db.prepare("UPDATE accounts SET archived_at=datetime('now') WHERE id='page-a'").run();
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Caption'}),/active real Facebook Page/);
  db.prepare("UPDATE accounts SET archived_at=NULL WHERE id='page-a'").run();
});

test('Personal Group posting identity remains manual and separate from its optional source Page',()=>{
  const g=groups.save(undefined,{...plan(),identityType:'personal',accountId:'page-a'});
  const p=groups.prepare(g.id,{kind:'post',content:'Group-specific caption',sourcePageId:'page-b'});
  const handoff=groups.package(p.id);
  assert.equal(handoff.group.identityType,'personal');assert.equal(handoff.group.accountId,null);
  assert.equal(handoff.sourcePage.id,'page-b');
  assert.equal(handoff.publicationStatus,'unpublished_manual_handoff');
  assert.equal(handoff.group.permissionVerified,false);
  assert.throws(()=>groups.prepare(g.id,{kind:'post',content:'Caption',sourcePageId:'personal'}),/Facebook Page/);
});
