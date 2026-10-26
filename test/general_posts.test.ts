import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { db, dataDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { initializeContentWorkspace } from '../server/src/db/content-workspace.js';
import { contentWorkspaceRepo } from '../server/src/repositories/content-workspace.repo.js';
import { generalPostsReady, migrateGeneralPublishing } from '../server/src/db/general-posts-schema.js';
import { generalPostsService as drafts, pagePostCapabilities } from '../server/src/services/general-posts.service.js';
import { generalPostsRepo } from '../server/src/repositories/general-posts.repo.js';
import { publishingRepo } from '../server/src/repositories/publishing.repo.js';
import { publishingService } from '../server/src/services/publishing.service.js';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { QueueService } from '../server/src/services/queue.service.js';
import { storeImage, imageById, verifiedImagePath, imageDir } from '../server/src/services/image-media.service.js';
import { normalizeDraft, publicLink } from '../server/src/domain/general-posts.js';
import { seal } from '../server/src/services/token-protection.js';

const originalFetch = globalThis.fetch;
const pageA = 'general-fixture-page-a', pageB = 'general-fixture-page-b', realPage = 'general-fixture-real-page', tikTok = 'general-fixture-tiktok';
let imageA: any, imageB: any, png: Buffer;
const videoId = 'general-fixture-reel';
function text(accountId = pageA, caption = 'ข้อความภาษาไทย 🌱') { return { title: 'General draft fixture', contentType: 'text', destinations: [{ accountId, caption, hashtags: '#ทดสอบ' }] }; }
function approved(raw: unknown) { const row = drafts.save(raw); drafts.approveBatch([{ id: row.id, revision: row.revision }]); return drafts.get(row.id); }
function queued(raw: unknown) { const row = approved(raw); const result = drafts.queue(row.id, row.revision); return { ...result, destination: publishingRepo.getPostDestinationRows(result.postId)[0] }; }
function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
before(async () => {
  assert.ok(process.env.SCC_DATA_DIR && /test-runs/i.test(dataDir), 'This suite requires isolated SCC_DATA_DIR under test-runs');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 27).toString('base64');
  process.env.META_GRAPH_VERSION = 'v26.0';
  initializeDatabase();
  initializeContentWorkspace();
  const insert = db.prepare("INSERT INTO accounts (id,platform,account_type,name,handle,connector_mode,is_demo,status,external_id) VALUES (?,?,?,?,?,?,?,'connected',?)");
  insert.run(pageA, 'facebook', 'page', 'Fixture Page A', '@fixture-a', 'simulator', 1, '1001');
  insert.run(pageB, 'facebook', 'page', 'Fixture Page B', '@fixture-b', 'simulator', 1, '1002');
  insert.run(realPage, 'facebook', 'page', 'Mock official Page', '@official-fixture', 'official_api', 0, '1234');
  insert.run(tikTok, 'tiktok', 'personal', 'Fixture Personal TikTok', '@fixture-tiktok', 'official_api', 0, 'tiktok-fixture');
  db.prepare("UPDATE accounts SET access_token=?,identity_verified_at=?,token_expires_at=?,granted_scopes_json=?,connection_status='connected' WHERE id=?").run(seal('mock-page-token'), new Date().toISOString(), new Date(Date.now()+7*86400000).toISOString(), JSON.stringify(['pages_show_list','pages_manage_posts','pages_read_engagement']), realPage);
  png = execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=blue:s=64x48','-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1'], { windowsHide: true });
  imageA = await storeImage(png, 'ภาพหนึ่ง.png');
  imageB = await storeImage(png, 'ภาพสอง.png');
  const reelPath = path.join(dataDir, 'uploads', 'reel-fixture.mp4');
  fs.writeFileSync(reelPath, 'fixture-video-not-used-in-ffmpeg');
  publishingRepo.insertVideo({ id: videoId, title: 'Fixture Reel', sourceType: 'manual_upload', originalFilename: 'reel.mp4', filePath: reelPath, fileSize: fs.statSync(reelPath).size, duration: 3, width: 64, height: 48, aspectRatio: '4:3' });
});
after(() => { globalThis.fetch = originalFetch; db.close(); });

test('text draft saves and reloads Unicode without video, attachments, queue work or implicit approval', () => {
  const before = (db.prepare('SELECT count(*) AS n FROM publishing_posts').get() as any).n;
  const row = drafts.save(text());
  assert.equal(row.status, 'draft');
  assert.equal(row.videoId, undefined);
  assert.equal(drafts.get(row.id).destinations[0].caption, 'ข้อความภาษาไทย 🌱');
  assert.deepEqual(row.destinations[0].attachments, []);
  assert.equal((db.prepare('SELECT count(*) AS n FROM publishing_posts').get() as any).n, before);
  assert.throws(() => drafts.queue(row.id, row.revision), /Approve the exact/);
  assert.deepEqual(generalPostsRepo.auditFor(row.id).map((a:any) => a.action), ['created']);
});

test('approved Reel preserves an explicitly empty caption instead of publishing its title',()=>{
  const result=queued({title:'Internal reviewed title is not the caption',contentType:'reel',videoId,destinations:[{accountId:pageA,caption:'',hashtags:'',applyBranding:false}]});
  assert.equal(result.draft.destinations[0].caption,'');
  assert.equal(result.destination.caption,'');
});

test('material text edits and destination changes invalidate approval and stale revisions', () => {
  const row = approved(text());
  const edited = drafts.save(text(pageA, 'แก้ไขแล้ว'), row.id, row.revision);
  assert.equal(edited.status, 'draft');
  assert.equal(edited.approvedRevision, null);
  assert.throws(() => drafts.queue(row.id, row.revision), /Approve the exact/);
  assert.throws(() => drafts.save(text(), row.id, row.revision), /changed/);
  drafts.approveBatch([{ id: edited.id, revision: edited.revision }]);
  const moved = drafts.save(text(pageB, 'แก้ไขแล้ว'), edited.id, edited.revision);
  assert.equal(moved.approvedRevision, null);
  assert.throws(() => drafts.queue(moved.id, moved.revision), /Approve the exact/);
  const rejected = drafts.reject(moved.id, moved.revision);
  assert.equal(rejected.status, 'rejected');
});

test('batch approval is atomic when any revision is stale', () => {
  const a = drafts.save(text()), b = drafts.save(text(pageB));
  assert.throws(() => drafts.approveBatch([{ id: a.id, revision: a.revision }, { id: b.id, revision: b.revision+1 }]), /changed/);
  assert.equal(drafts.get(a.id).status, 'draft');
  assert.equal(drafts.get(b.id).status, 'draft');
  assert.equal(generalPostsRepo.auditFor(a.id).length, 1, 'rolled-back approval audit must not survive');
  const result = drafts.approveBatch([{ id: a.id, revision: a.revision }, { id: b.id, revision: b.revision }]);
  assert.ok(result.every((r:any) => r.status === 'approved'));
});

test('assistant transfer records approved source lineage but requires fresh publishing approval and retains origin after edits', () => {
  const source = contentWorkspaceRepo.insertDraft({accountId:pageA,kind:'post',content:'ร่างจากผู้ช่วยที่ตรวจแล้ว',source:'fixture',provider:'fixture-security-test',context:{ownerIdea:'Source fixture idea',untrustedContext:{commentText:'Untrusted text remains only in original context'}},flags:['Fixture output, never live AI acceptance']});
  contentWorkspaceRepo.review(source.id,source.revision,pageA,true);
  const assistantSource={draftId:source.id,revision:source.revision};
  const input={...text(pageA,source.content),assistantSource};
  const transferred=drafts.save(input);
  assert.equal(transferred.status,'draft');
  assert.equal(transferred.approvedRevision,null);
  assert.deepEqual(transferred.assistantSource,assistantSource);
  assert.throws(()=>drafts.queue(transferred.id,transferred.revision),/Approve the exact/);
  const created=generalPostsRepo.auditFor(transferred.id)[0] as any;
  const detail=JSON.parse(created.detail_json);
  assert.deepEqual(detail.assistantSource,assistantSource);
  assert.equal(detail.sourceContextHash,createHash('sha256').update(source.context_json).digest('hex'));
  assert.equal(detail.sourceOutputHash,createHash('sha256').update(source.content).digest('hex'));
  assert.equal(detail.provider,'fixture-security-test');
  assert.equal(detail.source,'fixture');
  assert.ok(!created.detail_json.includes('Untrusted text remains only in original context'));
  drafts.approveBatch([{id:transferred.id,revision:transferred.revision}]);
  const edited=drafts.save(text(pageB,'เจ้าของแก้ไขข้อความ'),transferred.id,transferred.revision);
  assert.equal(edited.status,'draft');
  assert.equal(edited.approvedRevision,null);
  assert.deepEqual(edited.assistantSource,assistantSource,'editing/removing client lineage must preserve the original provenance');
  const forged=drafts.save({...text(pageB,'แก้อีกครั้ง'),assistantSource:{draftId:'forged-source-id',revision:999}},edited.id,edited.revision);
  assert.deepEqual(forged.assistantSource,assistantSource,'client edits must not replace the historical source');
  assert.throws(()=>drafts.queue(edited.id,edited.revision),/Approve the exact/);
  assert.deepEqual(JSON.parse((generalPostsRepo.auditFor(transferred.id)[0] as any).detail_json),detail);
});

test('assistant transfer rejects forged revisions, destination, text, extra destinations, replies and unapproved sources', () => {
  const source=contentWorkspaceRepo.insertDraft({accountId:pageA,kind:'post',content:'Exact reviewed text',source:'manual',provider:'owner',context:{ownerEntered:true},flags:[]});
  const input={...text(pageA,source.content),assistantSource:{draftId:source.id,revision:source.revision}};
  assert.throws(()=>drafts.save(input),/exact approved source/);
  contentWorkspaceRepo.review(source.id,source.revision,pageA,true);
  for(const raw of [
    {...input,assistantSource:{draftId:'does-not-exist',revision:1}},
    {...input,assistantSource:{draftId:source.id,revision:source.revision+1}},
    {...input,destinations:text(pageB,source.content).destinations},
    {...input,destinations:text(pageA,'Changed content masquerading as reviewed').destinations},
    {...input,destinations:[...text(pageA,source.content).destinations,...text(pageB,source.content).destinations]},
  ])assert.throws(()=>drafts.save(raw),/exact approved source/);
  const reply=contentWorkspaceRepo.insertDraft({accountId:pageA,kind:'reply',content:source.content,source:'fixture',provider:'fixture',context:{commentId:'comment-fixture'},flags:[]});
  contentWorkspaceRepo.review(reply.id,reply.revision,pageA,true);
  assert.throws(()=>drafts.save({...input,assistantSource:{draftId:reply.id,revision:reply.revision}}),/exact approved source/);
  contentWorkspaceRepo.editDraft(source.id,source.revision,'Source changed after approval',pageA);
  assert.throws(()=>drafts.save(input),/exact approved source/);
});

test('queue consumes one exact approval and cannot duplicate the post', () => {
  const row = approved(text());
  const result = drafts.queue(row.id, row.revision);
  const post = db.prepare('SELECT * FROM publishing_posts WHERE id=?').get(result.postId) as any;
  assert.equal(post.video_id, null);
  assert.equal(post.content_type, 'text');
  assert.equal(post.timezone, 'Asia/Bangkok');
  const before = (db.prepare('SELECT count(*) AS n FROM publishing_posts').get() as any).n;
  assert.throws(() => drafts.queue(row.id, row.revision), /Approve the exact/);
  assert.throws(() => drafts.save(text(), row.id, row.revision), /changed/);
  assert.equal((db.prepare('SELECT count(*) AS n FROM publishing_posts').get() as any).n, before);
  assert.equal(drafts.get(row.id).queuedPostId, result.postId);
});

test('single-image and ordered multi-image draft snapshots preserve caption, alt text and original bytes', () => {
  const before = createHash('sha256').update(fs.readFileSync(verifiedImagePath(imageById(imageA.id)))).digest('hex');
  const single = drafts.save({ title:'ภาพเดียว', contentType:'image', destinations:[{ accountId:pageA, caption:'ภาษาไทย', attachments:[{mediaId:imageA.id,altText:'ต้นไม้'}] }] });
  assert.equal(drafts.get(single.id).destinations[0].caption, 'ภาษาไทย');
  const multi = queued({ title:'ภาพหลายภาพ', contentType:'multi_image', destinations:[{ accountId:pageA, caption:'คำบรรยายเรียงภาพ', attachments:[{mediaId:imageB.id,altText:'สอง'},{mediaId:imageA.id,altText:'หนึ่ง'}] }] });
  const attachments = generalPostsRepo.attachments(multi.destination.id);
  assert.deepEqual(attachments.map((a:any) => a.media_id), [imageB.id,imageA.id]);
  assert.deepEqual(attachments.map((a:any) => a.alt_text), ['สอง','หนึ่ง']);
  assert.equal(attachments[0].position, 0);
  assert.equal(createHash('sha256').update(fs.readFileSync(verifiedImagePath(imageById(imageA.id)))).digest('hex'), before);
  assert.equal(multi.destination.apply_branding, 0);
  assert.equal(multi.destination.branded_video_path, null);
});

test('image validation rejects disguised, corrupt, oversized, escaped and altered images', async () => {
  await assert.rejects(storeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'pretend.png'), /actual JPEG and PNG/);
  await assert.rejects(storeImage(Buffer.alloc(4*1024*1024+1),'large.png'), /at most 4 MB/);
  await assert.rejects(storeImage(png.subarray(0,24),'broken.png'), /decoding/);
  const original = imageById(imageA.id);
  assert.equal(original.width, 64); assert.equal(original.height, 48);
  const outside = path.join(dataDir,'escaped.png'); fs.writeFileSync(outside,png);
  assert.throws(() => verifiedImagePath({...original,file_path:outside}), /outside managed storage/);
  const altered = await storeImage(png,'altered.png'); const alteredRow = imageById(altered.id);
  fs.appendFileSync(alteredRow.file_path,'tamper');
  assert.throws(() => verifiedImagePath(alteredRow), /integrity/);
  assert.equal(fs.readdirSync(imageDir).filter(f=>f.endsWith('.png')).length, 3, 'corrupt upload must be removed');
});

test('scheduled drafts normalize Bangkok offset to UTC and retain exact destination until due', () => {
  const result = queued({...text(),scheduledAt:'2030-12-01T12:30:00+07:00'});
  const post = db.prepare('SELECT * FROM publishing_posts WHERE id=?').get(result.postId) as any;
  assert.equal(post.scheduled_at, '2030-12-01T05:30:00.000Z');
  assert.equal(post.timezone, 'Asia/Bangkok');
  assert.equal(result.destination.account_id, pageA);
  assert.equal(result.destination.status, 'scheduled');
  assert.ok(!publishingRepo.getPendingQueueJobs(100).some((j:any)=>j.id===result.destination.id));
  assert.throws(()=>normalizeDraft({...text(),scheduledAt:'2030-12-01T12:30'}), /explicit timezone/);
  const elapsed = approved({...text(),scheduledAt:'2020-12-01T12:30:00+07:00'});
  assert.throws(()=>drafts.queue(elapsed.id,elapsed.revision),/future/);
});

test('general drafts reject duplicate destinations/images, private links and unsupported TikTok actions', () => {
  assert.throws(()=>drafts.save({...text(),destinations:[...text().destinations,...text().destinations]}), /only once/);
  assert.throws(()=>drafts.save({title:'duplicate',contentType:'multi_image',destinations:[{accountId:pageA,attachments:[{mediaId:imageA.id},{mediaId:imageA.id}]}]}), /only once/);
  for(const value of ['http://127.0.0.1/a','http://localhost/a','http://[::1]/a','http://192.168.0.2/a','https://user:pass@example.org/a','file:///C:/secret','http://printer.local/a']) assert.throws(()=>publicLink(value));
  assert.equal(publicLink('https://example.org/เรื่อง'), 'https://example.org/%E0%B9%80%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87');
  assert.throws(()=>drafts.save(text(tikTok)), /Facebook Pages/);
  assert.deepEqual(pagePostCapabilities(accountsRepo.getAccountById(tikTok)).supportedPostTypes, []);
});

test('general queue selects feed and existing Reel queue selects video_reels without dummy media', async () => {
  const queue = new QueueService();
  const textJob = queued(text(realPage));
  const calls: string[]=[];
  globalThis.fetch=async(url,init)=>{
    calls.push(String(url));
    if(init?.method==='POST')return respond({id:'1234_5678'});
    return respond({id:'1234_5678',from:{id:'1234'},is_published:true,permalink_url:'https://www.facebook.com/1234/posts/5678'});
  };
  const fetched = publishingRepo.getPendingQueueJobs(100).find((j:any)=>j.id===textJob.destination.id);
  assert.ok(fetched,'null-video general post must appear in worker query');
  await (queue as any).executeDestinationJob(fetched);
  assert.equal((publishingRepo.getDestinationById(textJob.destination.id) as any).confirmation_source,'api');
  assert.ok(calls[0].endsWith('/1234/feed'));
  const reel = queued({title:'Existing Reel behavior',contentType:'reel',videoId,destinations:[{accountId:realPage,caption:'Reel caption',applyBranding:false,selectedVariantId:'original'}]});
  globalThis.fetch=async(url,init)=>{
    calls.push(String(url));
    if(String(url).includes('rupload.facebook.com')) return respond({success:true});
    if(String(url).includes('/video_reels')) {
      const body=JSON.parse(String(init?.body));
      if(body.upload_phase==='start')return respond({video_id:'9999',upload_url:'https://rupload.facebook.com/video-upload/v26.0/9999'});
      assert.equal(body.video_state,'PUBLISHED'); return respond({success:true});
    }
    return respond({status:{video_status:'ready',publishing_phase:{status:'complete'}},permalink_url:'https://www.facebook.com/reel/9999'});
  };
  await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find((j:any)=>j.id===reel.destination.id));
  assert.equal(publishingRepo.getDestinationById(reel.destination.id)?.status,'published');
  assert.ok(calls.some(url=>url.endsWith('/1234/video_reels')));
  globalThis.fetch=originalFetch;
});

test('unknown general submission persists intent, blocks retry and never republishes another destination', async () => {
  const row=queued({title:'Independent destinations',contentType:'text',destinations:[...text(realPage).destinations,...text(pageA).destinations]});
  const destinations=publishingRepo.getPostDestinationRows(row.postId);
  const official=destinations.find((d:any)=>d.account_id===realPage),other=destinations.find((d:any)=>d.account_id===pageA);
  publishingRepo.markDestinationPublished({destinationId:other.id,remotePostId:'fixture-already-published',remotePostUrl:'https://www.facebook.com/1001/posts/1',verificationStatus:'confirmed',confirmationSource:'simulator'});
  const protectedBefore=publishingRepo.getDestinationById(other.id);
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('fixture timeout');};
  const queue=new QueueService();
  await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find((j:any)=>j.id===official.id));
  const failed=publishingRepo.getDestinationById(official.id) as any;
  assert.equal(failed.status,'failed'); assert.equal(failed.submission_state,'feed_publish');
  assert.throws(()=>publishingService.retryDestination(official.id),/reconciliation/);
  await assert.rejects(queue.executeGeneralPost(failed),/uncertain/);
  assert.equal(calls,1);
  assert.deepEqual(publishingRepo.getDestinationById(other.id),protectedBefore);
  globalThis.fetch=originalFetch;
});

test('saved remote post reconciles GET-only after failed verification without local media dependency', async () => {
  const result=queued({title:'Recover image verification',contentType:'image',destinations:[{accountId:realPage,caption:'ภาพ',attachments:[{mediaId:imageA.id}]}]});
  let writes=0;
  globalThis.fetch=async(url,init)=>{
    if(init?.method==='POST') {writes++;return String(url).endsWith('/photos')?respond({id:'901'}):respond({id:'1234_5678'});}
    return respond({error:{message:'fixture verification unavailable'}},503);
  };
  const queue=new QueueService();
  await (queue as any).executeDestinationJob(publishingRepo.getPendingQueueJobs(100).find((j:any)=>j.id===result.destination.id));
  const saved=publishingRepo.getDestinationById(result.destination.id) as any;
  assert.equal(saved.remote_post_id,'1234_5678');assert.equal(saved.status,'failed');
  assert.equal(generalPostsRepo.attachments(saved.id)[0].remote_id,'901');
  assert.throws(()=>publishingService.retryDestination(saved.id),/reconciliation|Reconcile/);
  const media=imageById(imageA.id);const original=fs.readFileSync(media.file_path);fs.unlinkSync(media.file_path);
  try {
    globalThis.fetch=async(_url,init)=>{assert.equal(init?.method,'GET');return respond({id:'1234_5678',from:{id:'1234'},is_published:true,permalink_url:'https://www.facebook.com/1234/posts/5678'});};
    await queue.reconcileGeneralDestination(saved.id);
    assert.equal(publishingRepo.getDestinationById(saved.id)?.status,'published');assert.equal(writes,2);
  } finally {fs.writeFileSync(media.file_path,original);globalThis.fetch=originalFetch;}
});

function legacyDatabase(brokenForeignKey=false) {
  const fixture=new Database(':memory:');
  fixture.exec(`
    PRAGMA foreign_keys=OFF;
    CREATE TABLE videos(id TEXT PRIMARY KEY); INSERT INTO videos VALUES ('master');
    CREATE TABLE accounts(id TEXT PRIMARY KEY); INSERT INTO accounts VALUES ('owner');
    CREATE TABLE publishing_posts(id TEXT PRIMARY KEY,video_id TEXT NOT NULL REFERENCES videos(id),title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',scheduled_at TEXT,timezone TEXT DEFAULT 'Asia/Bangkok');
    CREATE TABLE publishing_destinations(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES publishing_posts(id),account_id TEXT NOT NULL REFERENCES accounts(id),caption TEXT NOT NULL,status TEXT NOT NULL,remote_post_id TEXT,remote_post_url TEXT);
    CREATE INDEX history_title ON publishing_posts(title);
    CREATE TABLE trigger_log(id TEXT); CREATE TRIGGER history_trigger AFTER UPDATE OF title ON publishing_posts BEGIN INSERT INTO trigger_log VALUES (new.id); END;
    CREATE TABLE historical_metrics(id TEXT PRIMARY KEY,destination_id TEXT REFERENCES publishing_destinations(id),value INTEGER,source TEXT);
    INSERT INTO publishing_posts VALUES ('legacy','master','ประวัติเดิม','processing','2026-10-20T05:14:00.000Z','Asia/Bangkok');
    INSERT INTO publishing_destinations VALUES ('manual-one','legacy','owner','เดิมหนึ่ง','awaiting_confirmation',NULL,NULL),('manual-two','legacy','owner','เดิมสอง','awaiting_confirmation',NULL,NULL),('manual-three','legacy','owner','เดิมสาม','awaiting_confirmation',NULL,NULL);
    INSERT INTO historical_metrics VALUES ('nullable-history','manual-one',NULL,'tiktok_display_api');
  `);
  if(brokenForeignKey)fixture.exec("UPDATE publishing_destinations SET post_id='missing' WHERE id='manual-one'");
  fixture.pragma('foreign_keys=ON');return fixture;
}

test('offline migration preserves three manual destinations, masters, metrics, indexes/triggers and is idempotent',()=>{
  const fixture=legacyDatabase();
  try {
    const destinations=fixture.prepare('SELECT * FROM publishing_destinations ORDER BY id').all() as any[];
    const posts=fixture.prepare('SELECT * FROM publishing_posts ORDER BY id').all() as any[];
    assert.equal(generalPostsReady(fixture),false);
    migrateGeneralPublishing(fixture);
    assert.equal(generalPostsReady(fixture),true);
    assert.equal((fixture.prepare('PRAGMA table_info(publishing_posts)').all() as any[]).find(c=>c.name==='video_id').notnull,0);
    const after=fixture.prepare('SELECT * FROM publishing_destinations ORDER BY id').all() as any[];
    assert.deepEqual(after.map(row=>Object.fromEntries(Object.keys(destinations[0]).map(k=>[k,row[k]]))),destinations);
    const postAfter=fixture.prepare('SELECT * FROM publishing_posts ORDER BY id').all() as any[];
    assert.deepEqual(postAfter.map(row=>Object.fromEntries(Object.keys(posts[0]).map(k=>[k,row[k]]))),posts);
    assert.deepEqual(fixture.prepare('SELECT * FROM historical_metrics').all(),[{id:'nullable-history',destination_id:'manual-one',value:null,source:'tiktok_display_api'}]);
    assert.equal((fixture.prepare('SELECT count(*) AS n FROM videos').get() as any).n,1);
    const sql=fixture.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
    migrateGeneralPublishing(fixture);
    assert.deepEqual(fixture.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all(),sql);
    assert.ok(fixture.prepare("SELECT 1 FROM sqlite_master WHERE name='history_title'").get());
    fixture.prepare("UPDATE publishing_posts SET title='trigger retained' WHERE id='legacy'").run();
    assert.deepEqual(fixture.prepare('SELECT * FROM trigger_log').all(),[{id:'legacy'}]);
    assert.equal(fixture.pragma('foreign_keys',{simple:true}),1);
    assert.deepEqual(fixture.pragma('foreign_key_check'),[]);
  }finally{fixture.close();}
});

test('migration foreign-key failure rolls schema and rows back and restores foreign-key enforcement',()=>{
  const fixture=legacyDatabase(true);
  try {
    const schema=fixture.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
    const before=fixture.prepare('SELECT * FROM publishing_destinations ORDER BY id').all();
    assert.throws(()=>migrateGeneralPublishing(fixture),/Foreign-key/);
    assert.deepEqual(fixture.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all(),schema);
    assert.deepEqual(fixture.prepare('SELECT * FROM publishing_destinations ORDER BY id').all(),before);
    assert.equal(generalPostsReady(fixture),false);
    assert.equal(fixture.pragma('foreign_keys',{simple:true}),1);
  }finally{fixture.close();}
});

test('partial schema cannot advertise V1.10 readiness',()=>{
  const fixture=new Database(':memory:');
  try{fixture.exec('CREATE TABLE publishing_posts(id TEXT PRIMARY KEY,video_id TEXT,content_type TEXT)');assert.equal(generalPostsReady(fixture),false);}finally{fixture.close();}
});
