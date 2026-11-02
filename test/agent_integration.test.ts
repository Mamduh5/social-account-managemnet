import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {db,dataDir} from '../server/src/db/database.js';
import {initializeDatabase} from '../server/src/db/schema.js';
import {initializeContentWorkspace} from '../server/src/db/content-workspace.js';
import {initializeCalendarSchema} from '../server/src/db/calendar-schema.js';
import {accountsRouter} from '../server/src/routes/accounts.routes.js';
import {pipelineRouter} from '../server/src/routes/pipeline.routes.js';
import {publishingRouter} from '../server/src/routes/publishing.routes.js';
import {generalPublishingRouter} from '../server/src/routes/general-publishing.routes.js';
import {operatorRouter} from '../server/src/routes/operator-workspace.routes.js';
import {analyticsRouter} from '../server/src/routes/analytics.routes.js';
import {localAccess} from '../server/src/local-access.js';
import {pipelineService} from '../server/src/services/pipeline.service.js';
import {publishingRepo} from '../server/src/repositories/publishing.repo.js';
import {QueueService} from '../server/src/services/queue.service.js';
import {metaConnector} from '../server/src/connectors/registry.js';
import {seal} from '../server/src/services/token-protection.js';
import {JsonClient,ApiError} from '../scripts/agent/http.js';
import {PipelineAdapter} from '../scripts/agent/pipeline.js';
import {SccAdapter} from '../scripts/agent/scc.js';
import {AgentStore} from '../scripts/agent/store.js';
import {AgentWorkflow, type ContentInput} from '../scripts/agent/workflow.js';

const nativeFetch=globalThis.fetch;
const originalPublish=metaConnector.publishVideo;
const servers:http.Server[]=[];
const stores:AgentStore[]=[];
const projects=new Map<string,any>();
const allowedOrigins=new Set<string>();
let pipelineURL:string,sccURL:string,fixtureFile:string,fixtureBytes:Buffer;
let createCount=0,downloadCount=0,draftCount=0,publishCount=0,externalAttempts=0;
let dropCreate=false,dropDraft=false,lastCreatedId:string,lastDraftId:string;
const pageId='agent-fixture-page',categoryId='agent-fixture-category';
const now=()=>new Date().toISOString();
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

async function listen(app:express.Express):Promise<string> {
  const server=http.createServer(app);servers.push(server);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address && typeof address==='object');
  const origin='http://127.0.0.1:'+address.port;allowedOrigins.add(origin);return origin;
}
const guardedFetch:typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(!allowedOrigins.has(url.origin)) {externalAttempts++;throw new Error('External network is blocked in the agent integration fixture');}
  const result=await nativeFetch(input,init);
  if(dropDraft && init?.method==='POST' && url.pathname==='/api/publishing/drafts') {
    dropDraft=false;lastDraftId=(await result.clone().json() as any).draft.id;
    throw new Error('Simulated response loss after durable SCC draft creation');
  }
  return result;
};
function makeWorkflow(name:string) {
  const filename=path.join(dataDir,name+'-agent-sidecar.db');
  const store=new AgentStore(filename);stores.push(store);
  const pipeline=new PipelineAdapter(new JsonClient(pipelineURL,{fetch:guardedFetch}));
  const scc=new SccAdapter(new JsonClient(sccURL,{fetch:guardedFetch}));
  return {filename,store,pipeline,scc,workflow:new AgentWorkflow(store,pipeline,scc,{pipeline:pipelineURL,scc:sccURL})};
}
function generation(title:string) {return {title,idea:'Fixture only: a tiny robot learns to hold an umbrella.',sceneCount:2,aspectRatio:'9:16'};}
function content(overrides:Partial<ContentInput>={}):ContentInput {
  return {accountId:pageId,caption:'Agent-authored fixture caption; no visual claim.',hashtags:'#fixture #robot',scheduledAt:'2099-01-02T10:00:00+07:00',categoryId,applyBranding:true,...overrides};
}
function complete(id:string) {
  Object.assign(projects.get(id),{status:'completed',display_status:'Completed',accepted_count:2,duration_seconds:1.25,video_url:'/scene-video-jobs/'+id+'/artifacts/video',next_action:{type:'watch_final_video',background:false}});
}
function counts() {return {
  videos:(db.prepare('SELECT count(*) n FROM videos').get() as any).n,
  drafts:(db.prepare('SELECT count(*) n FROM publishing_drafts').get() as any).n,
  destinations:(db.prepare('SELECT count(*) n FROM publishing_destinations').get() as any).n,
};}
async function waitForIdle(worker:QueueService) {
  const deadline=Date.now()+30_000;
  while(worker.activeJobCount && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(worker.activeJobCount,0,'fixture worker completed within a bounded wait');
}

before(async()=>{
  assert.equal(process.env.SCC_ISOLATED_TEST,'true');assert.equal(process.env.SCC_PAUSE_WORKERS,'true');
  assert.match(dataDir,/test-runs/i);assert.notEqual(path.resolve(dataDir),path.resolve('.data'));
  process.env.SCC_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,61).toString('base64');
  initializeDatabase();initializeContentWorkspace();initializeCalendarSchema(db);
  db.prepare('INSERT INTO categories(id,name,slug,description,color) VALUES (?,?,?,?,?)').run(categoryId,'Fixture content','agent-fixture','Isolated synthetic category','#123456');
  db.prepare(`INSERT INTO accounts(id,platform,account_type,name,handle,category_id,status,connector_mode,external_id,is_demo,connection_status,access_token,identity_verified_at,token_expires_at,granted_scopes_json,brand_kit_json)
    VALUES (?,'facebook','page','Fixture Page','@fixture',?,'connected','official_api','123456789',0,'connected',?,?,?,?,?)`).run(
    pageId,categoryId,seal('isolated-fixture-token'),now(),new Date(Date.now()+7*86400000).toISOString(),JSON.stringify(['pages_manage_posts','pages_read_engagement']),
    JSON.stringify({mode:'moving',watermarkType:'moving_text',text:'@Fixture',movementPreset:'smooth_sine',fontSize:16,opacity:0.7,safeArea:{top:120,bottom:280,left:40,right:120}}));
  fixtureFile=path.join(dataDir,'synthetic-pipeline-original.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=360x640:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1.25','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',fixtureFile],{windowsHide:true});
  fixtureBytes=fs.readFileSync(fixtureFile);assert.ok(fixtureBytes.length>1000);
  const pipelineApp=express();pipelineApp.use(express.json());
  pipelineApp.get('/health',(_req,res)=>res.json({status:'ok'}));
  pipelineApp.get('/gemini-autopilot',(_req,res)=>res.json({provider:'gemini_web',available:true,worker_enabled:true,
    scheduler:{enabled:true,configured_submission_cap:4,submissions_this_window:0,queue:[...projects.values()].map(project=>({job_id:project.id,title:project.title,status:project.status,paused:true,recovery_attempts:0,runs:[]}))},
    recovery_status:{submission_unresolved:false},quota_timing:{remaining_blockers:[]}}));
  pipelineApp.post('/gemini-autopilot/queue',(req,res)=>{
    assert.equal(req.body.generation_settings.mode,'dense_performance');assert.equal(req.body.generation_settings.performance_tempo,2);
    assert.equal(req.body.scene_count,2);assert.equal(req.body.aspect_ratio,'9:16');
    createCount++;lastCreatedId='gemini-agent-fixture-'+createCount;
    const project={id:lastCreatedId,title:req.body.title,topic:req.body.idea,status:'pending',display_status:'Queued',provider:'gemini_web',workflow:'gemini_autopilot',autopilot:{provider:'gemini_web',review_status:'not_reviewed'},scene_count:req.body.scene_count,accepted_count:0,scene_seconds:10,aspect_ratio:req.body.aspect_ratio,generation_settings:req.body.generation_settings,created_at:now(),updated_at:now(),tags:[],paused:false,storage:{state:'local',label:'Local'},next_action:{type:'autopilot',background:true}};
    projects.set(lastCreatedId,project);
    if(dropCreate) {dropCreate=false;res.destroy();return;}
    res.status(202).json({job_id:lastCreatedId});
  });
  pipelineApp.get('/scene-video-library',(req,res)=>{
    let list=[...projects.values()];const status=req.query.status as string|undefined;
    if(status) list=list.filter(project=>project.status===status);
    res.json({api_version:'scene-video-library.v1',projects:list,page:{limit:Number(req.query.limit || 40),has_more:false,next_cursor:null}});
  });
  pipelineApp.get('/scene-video-jobs/:id/artifacts/video',(req,res)=>{
    if(projects.get(req.params.id)?.status!=='completed') {res.status(404).end();return;}
    downloadCount++;res.type('video/mp4').send(fixtureBytes);
  });
  pipelineApp.get('/scene-video-jobs/:id',(req,res)=>{
    const project=projects.get(req.params.id);if(!project) {res.status(404).json({error:'not found'});return;}res.json(project);
  });
  pipelineURL=await listen(pipelineApp);
  pipelineService.setPipelineApiUrl(pipelineURL);
  pipelineService.setWatchDirectory(path.join(dataDir,'empty-fixture-watch'));
  const sccApp=express();sccApp.use(localAccess);sccApp.use(express.json());
  sccApp.use((req,_res,next)=>{if(req.method==='POST' && req.path==='/api/publishing/drafts')draftCount++;next();});
  sccApp.use('/api/accounts',accountsRouter);sccApp.use('/api/pipeline',pipelineRouter);
  sccApp.use('/api/operator',operatorRouter);sccApp.use('/api/publishing',generalPublishingRouter);sccApp.use('/api/publishing',publishingRouter);sccApp.use('/api/analytics',analyticsRouter);
  sccURL=await listen(sccApp);globalThis.fetch=guardedFetch;
  metaConnector.publishVideo=async(_account,payload)=>{
    publishCount++;assert.equal(payload.scheduledAt,undefined,'existing local worker dispatches immediately once due');
    assert.ok(fs.existsSync(payload.videoPath));assert.notEqual(path.resolve(payload.videoPath),path.resolve(fixtureFile));
    payload.onRemoteCreated?.('fixture-remote-'+publishCount);
    return {success:true,remotePostId:'fixture-remote-'+publishCount,remotePostUrl:'https://www.facebook.com/reel/fixture-'+publishCount,verificationStatus:'confirmed'};
  };
});

after(async()=>{
  globalThis.fetch=nativeFetch;metaConnector.publishVideo=originalPublish;
  for(const store of stores)try {store.close();}catch{}
  for(const server of servers){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  assert.equal(externalAttempts,0,'all network traffic stayed inside the two fixture origins');
  db.close();
});

test('real SCC workflow imports immutable Pipeline media, prepares a branded draft, schedules once, and reads analytics/knowledge after restart',async()=>{
  const {workflow,store,pipeline,scc,filename}=makeWorkflow('representative');
  const input={title:'Representative fixture Reel',generation:generation('Representative fixture Reel'),content:content()};
  const baselineCreates=createCount;
  const started=await workflow.start('representative',input,true);const projectId=started.projectId as string;
  assert.equal(createCount,baselineCreates+1);
  assert.equal((await workflow.advance('representative')).next,'work-next');
  complete(projectId);await workflow.refresh('representative');assert.equal((await pipeline.status(projectId)).media.creativeReview,'not_reviewed');
  const discovered=await scc.discover({status:'completed',limit:10});
  assert.equal(discovered.sourceContract,'library_v1');assert.ok(discovered.jobs.some((job:any)=>job.jobId===projectId && job.importEligible));
  const ready:any=await workflow.advance('representative');const videoId=ready.videoId as string;
  const video=publishingRepo.getVideoById(videoId)!;assert.equal(video.pipeline_job_id,projectId);assert.equal(video.source_type,'pipeline_import');
  const metadata=JSON.parse(video.metadata_json || '{}');assert.equal(metadata.upstreamJobId,projectId);assert.ok(metadata.pipelineSourceFingerprint);assert.equal(metadata.sha256,digest(fixtureBytes));
  assert.equal(digest(fs.readFileSync(fixtureFile)),digest(fixtureBytes));assert.equal(digest(fs.readFileSync(video.file_path)),digest(fixtureBytes));
  assert.equal(ready.draft.draft.destinations[0].applyBranding,true);assert.equal(ready.draft.draft.status,'draft');assert.equal(ready.draft.draft.approvedRevision,null);
  const beforeDuplicate={createCount,downloadCount,draftCount,...counts()};
  await workflow.start('representative',input,true);await workflow.advance('representative');
  assert.deepEqual({createCount,downloadCount,draftCount,...counts()},beforeDuplicate,'stable run receipts and native import deduplication prevent duplicate writes');
  const context=await scc.context(pageId);assert.equal(context.selectedAccount.brandKit.text,'@Fixture');assert.equal(context.selectedAccount.capabilities.canPublish,true);
  const review:any=await workflow.review('representative');
  const exact={revision:review.draft.revision,accountId:pageId,payloadHash:review.draft.payloadHash};
  await assert.rejects(()=>workflow.approve('representative',exact,false),/authorization/);
  await workflow.approve('representative',exact,true);
  await assert.rejects(()=>workflow.schedule('representative',exact,false),/authorization/);
  const queued:any=await workflow.schedule('representative',exact,true);assert.ok(queued.postId);
  await workflow.schedule('representative',exact,true);
  const rows=publishingRepo.getPostDestinationRows(queued.postId);assert.equal(rows.length,1);const destinationId=rows[0].id;
  assert.equal(rows[0].status,'scheduled');assert.equal(publishCount,0);
  const worker=new QueueService();await worker.processNextJobs();await waitForIdle(worker);assert.equal(publishCount,0,'future schedule remains excluded');
  // Advance only the disposable fixture queue's wall time; no owner record is loaded.
  db.prepare("UPDATE publishing_posts SET scheduled_at=datetime('now','-1 minute') WHERE id=?").run(queued.postId);
  await worker.processNextJobs();await waitForIdle(worker);
  assert.equal(publishingRepo.getDestinationById(destinationId)?.status,'published');assert.equal(publishCount,1);
  const publication=await scc.publication(queued.postId);
  assert.equal(publication.post.status,'completed');assert.equal(publication.post.destinations[0].status,'published');
  assert.equal(publication.post.destinations[0].remote_post_id,'fixture-remote-1');assert.equal(publication.post.destinations[0].confirmation_source,'api');
  const pin=publishingRepo.getDestinationRenderPin(destinationId);assert.ok(pin);assert.notEqual(pin.path,video.file_path);
  assert.equal(digest(fs.readFileSync(video.file_path)),metadata.sha256,'branding kept the master immutable');
  let analytics=await scc.analytics(pageId);assert.equal(analytics.videos.find((row:any)=>row.destination_id===destinationId).views,null);
  await guardedFetch(sccURL+'/api/analytics/observe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({destinationId,viewCount:0,likeCount:0,source:'manual',notes:'Synthetic test fixture observation'})}).then(async response=>assert.equal(response.status,200));
  analytics=await scc.analytics(pageId);const observed=analytics.videos.find((row:any)=>row.destination_id===destinationId);
  assert.equal(observed.views,0);assert.equal(observed.likes,0);assert.equal(observed.comments,null);assert.equal(observed.shares,null);
  store.recordKnowledge({id:'representative-observation',kind:'observation',accountId:pageId,resourceId:'representative',text:'Synthetic fixture confirmed zero observed views; comments remain unavailable.',source:'SCC isolated manual metric fixture',evidence:{destinationId,views:0,comments:null}});
  store.recordKnowledge({id:'representative-assumption',kind:'assumption',accountId:pageId,resourceId:'representative',text:'A clearer opening might improve retention; untested hypothesis.'});
  store.close();const restarted=new AgentStore(filename);stores.push(restarted);
  const resumed=new AgentWorkflow(restarted,pipeline,scc,{pipeline:pipelineURL,scc:sccURL});
  assert.equal(resumed.summary('representative').postId,queued.postId);assert.equal(restarted.listKnowledge({resourceId:'representative'}).length,2);
  const beforeRestartDuplicate={createCount,downloadCount,draftCount,publishCount};
  await resumed.start('representative',input,true);await resumed.advance('representative');await resumed.schedule('representative',exact,true);
  assert.deepEqual({createCount,downloadCount,draftCount,publishCount},beforeRestartDuplicate);
  assert.equal((await scc.history({status:'published'})).items.filter((row:any)=>row.id===destinationId).length,1);
});

test('lost Gemini create response is fenced across restart and reconciled by exact read-only project identity',async()=>{
  const {workflow,store,pipeline,scc,filename}=makeWorkflow('lost-generation');const input={title:'Lost generation fixture',generation:generation('Lost generation fixture')};
  const before=createCount;dropCreate=true;
  await assert.rejects(()=>workflow.start('lost-generation',input,true),(error:unknown)=>error instanceof ApiError && error.uncertain);
  const createdId=lastCreatedId;assert.equal(createCount,before+1);assert.equal(store.getOperation('lost-generation','generation')?.status,'uncertain');
  store.close();const restarted=new AgentStore(filename);stores.push(restarted);const resumed=new AgentWorkflow(restarted,pipeline,scc,{pipeline:pipelineURL,scc:sccURL});
  await assert.rejects(()=>resumed.start('lost-generation',input,true),/Inspect the saved run/);assert.equal(createCount,before+1);
  const project=projects.get(createdId);project.topic='A different project idea';
  await assert.rejects(()=>resumed.reconcile('lost-generation',{projectId:createdId}),/does not match/);
  project.topic=input.generation.idea;await resumed.reconcile('lost-generation',{projectId:createdId});
  assert.equal(resumed.summary('lost-generation').projectId,createdId);assert.equal(createCount,before+1);
});

test('lost SCC draft response is never repeated and exact unapproved content recovers the original ID',async()=>{
  const {workflow,store,filename,pipeline,scc}=makeWorkflow('lost-draft');const input={title:'Lost draft fixture',generation:generation('Lost draft fixture'),content:content()};
  await workflow.start('lost-draft',input,true);complete(workflow.summary('lost-draft').projectId as string);
  const before=draftCount;dropDraft=true;await assert.rejects(()=>workflow.advance('lost-draft'),(error:unknown)=>error instanceof ApiError && error.uncertain);
  const originalDraft=lastDraftId;assert.equal(draftCount,before+1);assert.equal(store.getOperation('lost-draft','prepare')?.status,'uncertain');
  store.close();const restarted=new AgentStore(filename);stores.push(restarted);const resumed=new AgentWorkflow(restarted,pipeline,scc,{pipeline:pipelineURL,scc:sccURL});
  await assert.rejects(()=>resumed.advance('lost-draft'),/Inspect the saved run/);assert.equal(draftCount,before+1);
  await resumed.reconcile('lost-draft',{draftId:originalDraft});assert.equal(resumed.summary('lost-draft').draftId,originalDraft);
  await resumed.advance('lost-draft');assert.equal(draftCount,before+1);
});

test('changed caption invalidates the exact review before any approval or publication',async()=>{
  const {workflow,scc}=makeWorkflow('stale-review');const input={title:'Stale review fixture',generation:generation('Stale review fixture'),content:content()};
  await workflow.start('stale-review',input,true);complete(workflow.summary('stale-review').projectId as string);await workflow.advance('stale-review');
  const review:any=await workflow.review('stale-review'),draft=review.draft;
  const changed={title:draft.title,contentType:'reel',videoId:draft.videoId,scheduledAt:draft.scheduledAt,revision:draft.revision,destinations:draft.destinations.map((destination:any)=>({...destination,caption:'Changed after exact review'}))};
  const response=await guardedFetch(sccURL+'/api/publishing/drafts/'+draft.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(changed)});assert.equal(response.status,200);
  await assert.rejects(()=>scc.approve(draft.id,{revision:draft.revision,accountId:pageId,payloadHash:draft.payloadHash}),/changed/);
  assert.equal((await scc.review(draft.id)).draft.status,'draft');assert.equal((await scc.review(draft.id)).draft.approvedRevision,null);
});

test('cross-source Pipeline identity and failed generation cannot create an SCC import',async()=>{
  const {workflow}=makeWorkflow('source-mismatch');const input={title:'Source mismatch fixture',generation:generation('Source mismatch fixture'),content:content()};
  await workflow.start('source-mismatch',input,true);const projectId=workflow.summary('source-mismatch').projectId as string;complete(projectId);
  const before=counts().videos;pipelineService.setPipelineApiUrl(sccURL);
  // Deliberately point at the other allowed fixture origin, never an owner/external service.
  await assert.rejects(()=>workflow.advance('source-mismatch'),/different Pipeline URL/);assert.equal(counts().videos,before);
  pipelineService.setPipelineApiUrl(pipelineURL);Object.assign(projects.get(projectId),{status:'failed',diagnostic:{code:'planner_failed',message:'Synthetic fixture failure'}});
  await workflow.refresh('source-mismatch');
  const failed=await workflow.advance('source-mismatch');assert.equal(failed.next,'work-next');assert.equal(counts().videos,before);
});
