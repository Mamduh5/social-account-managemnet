import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {AgentStore} from '../scripts/agent/store.js';
import {AgentContent} from '../scripts/agent/content.js';
import {SccAdapter} from '../scripts/agent/scc.js';
import {JsonClient} from '../scripts/agent/http.js';

let database:typeof import('../server/src/db/database.js'),groups:typeof import('../server/src/services/groups-workspace.service.js');
let server:http.Server,origin:string,store:AgentStore,content:AgentContent,imageId:string,groupId:string;
let externalAttempts=0,writes=0;
const nativeFetch=globalThis.fetch;
const guardedFetch:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.origin!==origin){externalAttempts++;throw new Error('No owner or provider HTTP allowed in this fixture');}
  assert.doesNotMatch(url.pathname,/approve|queue|generate|send-reply|receipt|membership/);
  if(init?.method==='POST')writes++;
  return nativeFetch(input,init);
};
before(async()=>{
  // Check before importing any application database module.
  assert.equal(process.env.SCC_ISOLATED_TEST,'true');assert.equal(process.env.SCC_PAUSE_WORKERS,'true');assert.match(process.env.SCC_DATA_DIR??'',/test-runs/);
  database=await import('../server/src/db/database.js');
  const {db,dataDir}=database;
  (await import('../server/src/db/schema.js')).initializeDatabase();
  (await import('../server/src/db/content-workspace.js')).initializeContentWorkspace();
  (await import('../server/src/db/calendar-schema.js')).initializeCalendarSchema(db);
  db.prepare("INSERT INTO accounts(id,platform,account_type,name,handle,is_demo,connector_mode) VALUES ('content-page','facebook','page','Fixture educational Page','@fixture',0,'official_api')").run();
  const png=execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x48','-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1'],{windowsHide:true});
  imageId=(await (await import('../server/src/services/image-media.service.js')).storeImage(png,'fixture-diagram.png')).id;
  const file=path.join(dataDir,'uploads','fixture.mp4');fs.writeFileSync(file,'Only metadata is reviewed by this fixture');
  (await import('../server/src/repositories/publishing.repo.js')).publishingRepo.insertVideo({id:'content-video',title:'Existing fixture video',sourceType:'manual_upload',originalFilename:'fixture.mp4',filePath:file,fileSize:fs.statSync(file).size,duration:10,width:720,height:1280,aspectRatio:'9:16'});
  groups=await import('../server/src/services/groups-workspace.service.js');
  const group=groups.groupsWorkspaceService.save(undefined,{name:'Local learners',url:'https://www.facebook.com/groups/fixture-content',identityType:'page',accountId:'content-page',membership:'member',rules:'Educational explanations only. No sales or external links.',rulesReviewedAt:'2026-11-01',reviewedAt:'2026-11-01',eligibility:{pagesCanJoin:'yes',promotionalRestrictions:'No sales',participationApproval:'not_required',postModeration:'required',questions:[]}});
  groupId=group.id;
  const app=express();app.use(express.json());
  app.use('/api/operator',(await import('../server/src/routes/operator-workspace.routes.js')).operatorRouter);
  app.use('/api/groups',(await import('../server/src/routes/groups-workspace.routes.js')).groupsRouter);
  app.use('/api/publishing',(await import('../server/src/routes/general-publishing.routes.js')).generalPublishingRouter);
  app.use('/api/analytics',(await import('../server/src/routes/analytics.routes.js')).analyticsRouter);
  server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const addr=server.address();assert.ok(addr&&typeof addr==='object');origin='http://127.0.0.1:'+addr.port;
  globalThis.fetch=guardedFetch;
  store=new AgentStore(path.join(dataDir,'content-sidecar.db'));content=new AgentContent(store,new SccAdapter(new JsonClient(origin,{fetch:guardedFetch})));
});
after(async()=>{globalThis.fetch=nativeFetch;store?.close();database?.db.close();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
async function prepare(format:'text'|'image'|'existing_video'|'group',suffix=''){
  const response=await content.enqueue('content-page',{topic:'Fixture '+format+suffix,formats:[format]});assert.equal(response.tasks.length,1,JSON.stringify(response));
  const id=response.tasks[0].id,task=content.work.show(id).task,c=task.payload.content;
  const result={title:'Useful Thai explanation',text:'คำอธิบายสำหรับกลุ่มผู้เรียนจากข้อมูลที่มี',...(format==='image'?{imageId,altText:'Supplied blue fixture'}:{}),...(format==='existing_video'?{videoId:'content-video'}:{}),
    ...(format==='group'?{groupRevision:c.group.revision,rulesHash:c.group.rulesHash,relevance:'Educational topic for learners',compliance:'No sales, promotion or external links.'}:{})};
  const claim=content.work.claim(id,{owner:'fixture-agent',commandId:'claim:'+id}).task;
  content.work.save({id,owner:claim.owner,commandId:'save:'+id,claimToken:claim.claimToken,revision:claim.revision,status:'prepared',result:JSON.stringify(result)});
  return {id,result};
}
test('real SCC handlers save text, image and existing-video drafts without approval, schedules or queue work',async()=>{
  for(const format of ['text','image','existing_video'] as const){
    const {id}=await prepare(format);const saved=await content.persist(id),d=saved.draft;
    assert.equal(d.status,'draft');assert.equal(d.approvedRevision,null);assert.equal(d.scheduledAt,null);assert.equal(d.queuedPostId,null);
    assert.equal(d.contentType,format==='existing_video'?'reel':format);
    if(format==='image')assert.equal(d.destinations[0].attachments[0].mediaId,imageId);
    assert.equal((await content.persist(id)).cached,true);
  }
  assert.equal(writes,3);assert.equal((database.db.prepare('SELECT count(*) n FROM publishing_destinations').get() as any).n,0);
  assert.equal(externalAttempts,0);
});
test('real Groups Planning captures exact restrictions, identity and relevance in an unpublished manual package',async()=>{
  const {id}=await prepare('group'),saved=await content.persist(id),prepared=saved.prepared;
  const p=await content.scc.groupPackage(prepared.id);
  assert.equal(prepared.group_id,groupId);assert.equal(p.sourcePage.id,'content-page');assert.match(p.group.rules,/No sales/);
  assert.equal(p.publicationStatus,'unpublished_manual_handoff');assert.equal(p.publicationVerified,false);assert.equal(p.reminderAt,null);
  assert.equal(p.group.permissionVerified,false);assert.equal(writes,4);
});
test('actual CLI retrieves completed work and another agent sees its saved preparation',async()=>{
  const task=store.listWork(100).find(t=>t.kind==='image_post')!;
  const {stdout}=await promisify(execFile)(process.execPath,['--import',pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href,path.resolve('scripts/agent.ts'),'work-show','--task',task.id,'--state',path.join(database.dataDir,'content-sidecar.db')],{cwd:process.cwd(),timeout:20000,windowsHide:true,maxBuffer:200000});
  const result=JSON.parse(stdout);assert.equal(result.ok,true);assert.equal(result.data.task.preparation.draft.id,task.preparation.draft.id);
  assert.equal(result.data.task.owner,null);assert.equal(result.data.task.claimToken,null);
  assert.equal(externalAttempts,0);
});
test('real Group rules drift prevents preparation even after the model finished',async()=>{
  const {id}=await prepare('group',' with changed rules');
  const g=groups.groupsWorkspaceService.review(groupId).group;
  groups.groupsWorkspaceService.save(g.id,{name:g.name,url:g.url,identityType:g.identity_type,accountId:g.account_id,membership:g.membership,rules:g.rules+' No AI content.',rulesReviewedAt:'2026-11-03',eligibility:g.eligibility,reviewedAt:'2026-11-03',revision:g.revision});
  const before=writes;await assert.rejects(content.persist(id),/Group rules/);assert.equal(writes,before);
});
