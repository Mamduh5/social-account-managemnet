import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {db,dataDir,uploadsDir,rendersDir} from '../server/src/db/database.js';
import {initializeDatabase} from '../server/src/db/schema.js';
import {deleteBrandingVariant} from '../server/src/services/branding-artifacts.service.js';
import {analyticsRepo} from '../server/src/repositories/analytics.repo.js';
import {inboxRepo} from '../server/src/repositories/inbox.repo.js';
import {publishingRepo} from '../server/src/repositories/publishing.repo.js';
import {SyncService} from '../server/src/services/sync.service.js';
import {QueueService} from '../server/src/services/queue.service.js';
import {EventService} from '../server/src/services/events.service.js';
import {ContentAssistantService,AssistantBatchPartialError} from '../server/src/services/content-assistant.service.js';
import {MetaFacebookConnector} from '../server/src/connectors/meta-facebook.js';

before(()=>{assert.match(dataDir,/test-runs/i);initializeDatabase();});
after(()=>db.close());
function account(platform='facebook') {
  const id=randomUUID();db.prepare("INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,is_demo) VALUES (?,?,?,'Reliability fixture',?,'disconnected','official_api',0)").run(id,platform,platform==='facebook'?'page':'personal',id);return id;
}
function publication(accountId:string) {
  const post=randomUUID(),destination=randomUUID();
  db.prepare("INSERT INTO publishing_posts(id,title,status) VALUES (?,'Reliability fixture','completed')").run(post);
  db.prepare("INSERT INTO publishing_destinations(id,post_id,account_id,caption,status,remote_post_id) VALUES (?,?,?,'Fixture','published','fixture-remote')").run(destination,post,accountId);
  return {post,destination};
}
function snapshot(accountId:string,destination:string,observed_at:string,views:number|null,likes:number|null=0) {
  return analyticsRepo.recordPostMetricSnapshot({account_id:accountId,destination_id:destination,platform:'facebook',remote_post_id:'fixture',observed_at,view_count:views,like_count:likes,comment_count:0,share_count:0,source:'manual',provenance_status:'confirmed'});
}
function variant(filePath?:string) {
  const video=randomUUID(),id=randomUUID(),master=path.join(uploadsDir,video+'.mp4'),render=filePath||path.join(rendersDir,id+'.mp4');
  fs.writeFileSync(master,'immutable-master');if(!filePath)fs.writeFileSync(render,'render-bytes');
  db.prepare("INSERT INTO videos(id,title,source_type,original_filename,file_path) VALUES (?,'Fixture','manual_upload','fixture.mp4',?)").run(video,master);
  db.prepare("INSERT INTO branded_videos(id,video_id,preset_name,movement_preset,watermark_text,file_path) VALUES (?,?,'Fixture','static_corner','fixture',?)").run(id,video,render);
  return {id,video,master,render};
}

test('variant removal preserves a shared cached artifact and rejects publishing/draft references',()=>{
  const first=variant(),second=variant(first.render);
  assert.equal(deleteBrandingVariant(first.id)?.success,true);assert.equal(fs.existsSync(first.render),true);assert.equal(fs.readFileSync(first.master,'utf8'),'immutable-master');
  const p=publication(account());db.prepare('UPDATE publishing_destinations SET selected_variant_id=? WHERE id=?').run(second.id,p.destination);
  assert.throws(()=>deleteBrandingVariant(second.id),/selected/);assert.ok(fs.existsSync(first.render));
  db.prepare('UPDATE publishing_destinations SET selected_variant_id=NULL WHERE id=?').run(p.destination);
  const draft=randomUUID();db.prepare('INSERT INTO publishing_drafts(id,payload_json) VALUES (?,?)').run(draft,JSON.stringify({destinations:[{selectedVariantId:second.id}]}));
  assert.throws(()=>deleteBrandingVariant(second.id),/saved publishing draft/);
  db.prepare('DELETE FROM publishing_drafts WHERE id=?').run(draft);
  assert.equal(deleteBrandingVariant(second.id)?.success,true);assert.equal(fs.existsSync(first.render),false);
});

test('variant removal compensates a database failure and rejects master/outside-directory paths',()=>{
  const v=variant();db.exec(`CREATE TRIGGER refuse_fixture_variant BEFORE DELETE ON branded_videos WHEN OLD.id='${v.id}' BEGIN SELECT RAISE(ABORT,'fixture failure'); END`);
  try{assert.throws(()=>deleteBrandingVariant(v.id),/fixture failure/);assert.ok(fs.existsSync(v.render));assert.ok(db.prepare('SELECT 1 FROM branded_videos WHERE id=?').get(v.id));}finally{db.exec('DROP TRIGGER refuse_fixture_variant');}
  const outside=variant(path.join(rendersDir,'..','not-a-render.mp4'));assert.throws(()=>deleteBrandingVariant(outside.id),/outside/);
  const master=variant();db.prepare('UPDATE branded_videos SET file_path=? WHERE id=?').run(master.master,master.id);assert.throws(()=>deleteBrandingVariant(master.id),/outside|master/);assert.ok(fs.existsSync(master.master));
});

test('analytics keeps missing and partial metrics unavailable; confirmed zero remains zero',()=>{
  const a=account(),first=publication(a),second=publication(a);
  snapshot(a,first.destination,'2026-10-29T00:00:00Z',0,null);
  let totals=analyticsRepo.getOverviewTotals({accountId:a});assert.equal(totals.total_views,null);assert.deepEqual(totals.coverage.views,{known:1,total:2,status:'partial',observedTotal:0});
  snapshot(a,second.destination,'2026-10-29T00:00:00Z',0,0);
  totals=analyticsRepo.getOverviewTotals({accountId:a});assert.equal(totals.total_views,0);assert.equal(totals.total_likes,null);assert.equal(totals.avg_engagement_rate,null);
  const platforms=analyticsRepo.getPlatformComparison({accountId:a});assert.equal(platforms.length,1);assert.equal(platforms[0].account_count,1);assert.equal(platforms[0].total_likes,null);
  const rankings=analyticsRepo.getAccountRankings({accountId:a});assert.equal(rankings.length,1);assert.equal(rankings[0].id,a);
});

test('daily analytics uses latest destination snapshot per Bangkok date and stable ties',()=>{
  const a=account(),p=publication(a);snapshot(a,p.destination,'2026-10-28T16:59:00Z',10);snapshot(a,p.destination,'2026-10-28T17:01:00Z',20);snapshot(a,p.destination,'2026-10-28T18:00:00Z',30);snapshot(a,p.destination,'2026-10-28T18:00:00Z',40);
  const days=analyticsRepo.getDailyTrends({accountId:a});assert.deepEqual(days.map(d=>[d.date,d.total_views]),[['2026-10-28',10],['2026-10-29',40]]);assert.equal(days[1].timezone,'Asia/Bangkok');
});

test('manual observations reject forged provider provenance and invalid counts without writing',()=>{
  const a=account(),p=publication(a),service=new SyncService();
  for(const input of [{source:'meta_graph_api',viewCount:1},{viewCount:-1},{viewCount:Infinity},{viewCount:1.5},{viewCount:'4'},{}]) assert.throws(()=>service.recordObservation({destinationId:p.destination,...input} as any));
  assert.equal(analyticsRepo.getPostHistory(p.destination).length,0);
  service.recordObservation({destinationId:p.destination,viewCount:0,source:'manual'});assert.equal(analyticsRepo.getPostHistory(p.destination)[0].view_count,0);
});

test('account synchronization coalesces overlapping calls and exposes active work',async()=>{
  const service=new SyncService();let resolve!:(result:any)=>void,calls=0;
  (service as any).performAccountSync=()=>{calls++;return new Promise(r=>resolve=r);};
  const first=service.syncAccount('fixture'),second=service.syncAccount('fixture');assert.equal(first,second);assert.equal(calls,1);assert.equal(service.activeSynchronization,true);
  resolve({success:true});await first;await Promise.resolve();assert.equal(service.activeSynchronization,false);
});

test('queue capacity stays bounded across repeated ticks while uploads are active',async()=>{
  const service=new QueueService(),originalPending=publishingRepo.getPendingQueueJobs,originalDue=publishingRepo.getDueScheduledDestinations;let starts=0;
  try {
    publishingRepo.getDueScheduledDestinations=()=>[];
    publishingRepo.getPendingQueueJobs=()=>Array.from({length:8},(_,i)=>({id:'job-'+i})) as any;
    (service as any).executeDestinationJob=async(job:any)=>{(service as any).inFlight.add(job.id);starts++;};
    await service.processNextJobs();await service.processNextJobs();await service.processNextJobs();assert.equal(starts,2);
    (service as any).inFlight.delete('job-0');await service.processNextJobs();assert.equal(starts,3);
  } finally {publishingRepo.getPendingQueueJobs=originalPending;publishingRepo.getDueScheduledDestinations=originalDue;}
});

test('Inbox threading keeps equal provider IDs isolated by account',()=>{
  const a=account(),b=account();
  for(const account_id of [a,b]) for(const [suffix,parent_comment_id] of [['parent',null],['reply','same-parent']] as const) inboxRepo.upsertComment({account_id,platform:'facebook',external_comment_id:'same-'+suffix,parent_comment_id,author_name:'Fixture',content:account_id,created_time:'2026-10-29T00:00:00Z',like_count:0,status:'unread',awaiting_reply:1,has_replied:0});
  const comments=inboxRepo.getComments({}).filter(c=>[a,b].includes(c.account_id));assert.equal(comments.length,2);for(const c of comments){assert.equal(c.replies.length,1);assert.equal(c.replies[0].account_id,c.account_id);}
});

test('SSE adds resource metadata, closes slow clients, and cleans up heartbeat lifecycle',async()=>{
  const service=new EventService(5),frames:string[]=[];let ended=0,slow=false;
  const response={destroyed:false,write:(frame:string)=>{frames.push(frame);return !slow;},end:()=>ended++};
  service.addClient('fixture',response as any);service.broadcast('destination_updated',{destinationId:'fixture'});assert.match(frames[1],/event: destination_updated/);assert.match(frames[1],/"version":1/);assert.match(frames[1],/"resumeSupported":false/);
  await new Promise(r=>setTimeout(r,15));assert.ok(frames.some(f=>f===': heartbeat\n\n'));slow=true;service.broadcast('cleanup:changed',{kind:'fixture'});assert.equal(ended,1);const count=frames.length;service.broadcast('cleanup:changed',{});assert.equal(frames.length,count);service.closeAll();
});

test('partial assistant generation exposes already saved drafts and stops without retry',async()=>{
  const a=account();let calls=0;
  const service=new ContentAssistantService({id:'reliability_fixture',fixture:true,available:true,canInspectMedia:false,generate:async()=>{if(++calls===2)throw new Error('Fixture provider failure');return {text:'Saved fixture draft'};}});
  try {await service.batch([{accountId:a,kind:'post',idea:'One'},{accountId:a,kind:'post',idea:'Two'},{accountId:a,kind:'post',idea:'Three'}]);assert.fail('Expected partial result');}
  catch(error){assert.ok(error instanceof AssistantBatchPartialError);assert.equal(error.drafts.length,1);assert.equal(error.failedIndex,1);assert.equal(error.notAttempted,1);assert.equal(calls,2);assert.ok(db.prepare('SELECT 1 FROM assistant_drafts WHERE id=?').get(error.drafts[0].id));}
});

test('Facebook comments traverse top-level and reply cursors with header-only credentials',async()=>{
  const original=globalThis.fetch,calls:string[]=[];process.env.META_GRAPH_VERSION='v26.0';
  try {
    globalThis.fetch=(async(input:any,init:any)=>{
      const url=new URL(String(input));calls.push(url.href);assert.equal(init.headers.Authorization,'Bearer FIXTURE_TOKEN');assert.equal(url.searchParams.has('access_token'),false);assert.equal(init.redirect,'error');
      const body=url.searchParams.get('after')==='reply-page'?{data:[{id:'reply-2'}]}:url.searchParams.get('after')==='top-page'?{data:[{id:'top-2'}]}:
        {data:[{id:'top-1',comments:{data:[{id:'reply-1'}],paging:{next:'https://graph.facebook.com/v26.0/top-1/comments?after=reply-page&access_token=FIXTURE_TOKEN'}}}],paging:{next:'https://graph.facebook.com/v26.0/post/comments?after=top-page&access_token=FIXTURE_TOKEN'}};
      return new Response(JSON.stringify(body),{status:200});
    }) as any;
    const comments=await new MetaFacebookConnector().fetchComments({access_token:'FIXTURE_TOKEN'},{postId:'post'});
    assert.deepEqual(comments.map(c=>c.externalCommentId),['top-1','reply-1','reply-2','top-2']);assert.equal(comments[2].parentCommentId,'top-1');assert.equal(calls.length,3);
  } finally {globalThis.fetch=original;}
});

test('Facebook comment pagination rejects foreign hosts and repeated cursors without leaking credentials',async()=>{
  const original=globalThis.fetch;process.env.META_GRAPH_VERSION='v26.0';
  try {
    for(const next of ['https://untrusted.invalid/v26.0/post/comments?access_token=FIXTURE_TOKEN','https://graph.facebook.com/v26.0/post/comments?fields=id&limit=50']) {
      let calls=0;globalThis.fetch=(async()=>{calls++;return new Response(JSON.stringify({data:[],paging:{next}}),{status:200});}) as any;
      await assert.rejects(()=>new MetaFacebookConnector().fetchComments({access_token:'FIXTURE_TOKEN'},{postId:'post'}),error=>{assert.doesNotMatch(String(error),/FIXTURE_TOKEN|untrusted/);return true;});assert.ok(calls<=2);
    }
  }finally{globalThis.fetch=original;}
});
