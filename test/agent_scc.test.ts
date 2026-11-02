import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SccAdapter,draftFingerprint} from '../scripts/agent/scc.js';
import {ApiError} from '../scripts/agent/http.js';

const initial=()=>({id:'draft-fixture',revision:1,status:'draft',approvedRevision:null,queuedPostId:null,title:'Fixture Reel',contentType:'reel',videoId:'video-fixture',scheduledAt:'2099-01-02T03:00:00.000Z',destinations:[{accountId:'account-fixture',caption:'Agent-authored fixture caption',hashtags:'#fixture',attachments:[],applyBranding:true}]});

test('SCC adapter prepares only a Reel draft and does not approve, render or queue',async()=>{
  const calls:Array<{path:string;body:any}>=[];
  const adapter=new SccAdapter({post:async(path:string,body:any)=>{calls.push({path,body});return {draft:initial()};}} as any);
  const result=await adapter.prepare({accountId:'account-fixture',videoId:'video-fixture',title:'Fixture Reel',caption:'Agent-authored fixture caption',hashtags:'#fixture',scheduledAt:'2099-01-02T10:00:00+07:00'});
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/publishing/drafts');
  assert.equal(calls[0].body.contentType,'reel');assert.equal(calls[0].body.destinations[0].applyBranding,true);
  assert.equal(result.requiresOwnerApproval,true);assert.equal(result.draft.timeZone,'Asia/Bangkok');
  await assert.rejects(()=>adapter.prepare({accountId:'a',videoId:'v',title:'x',caption:'c',scheduledAt:'2099-01-02T10:00:00'}),/timezone/);
});

test('SCC adapter binds exact content, account, revision and schedule before approval',async()=>{
  const draft=initial();let posts=0;
  const adapter=new SccAdapter({get:async()=>({draft}),post:async()=>{posts++;return {draft:{...draft,status:'approved',approvedRevision:1}};}} as any);
  const review=await adapter.review(draft.id);
  const approval={revision:1,accountId:'account-fixture',payloadHash:review.draft.payloadHash};
  await assert.rejects(()=>adapter.approve(draft.id,{...approval,accountId:'different-account'}),/changed/);
  draft.destinations[0].caption='Edited after review';
  await assert.rejects(()=>adapter.approve(draft.id,approval),/changed/);
  assert.equal(posts,0);
  const current={...approval,payloadHash:draftFingerprint(draft)};
  const approved=await adapter.approve(draft.id,current);
  assert.equal(approved.draft.status,'approved');assert.equal(posts,1);
});

test('SCC adapter refuses unapproved queueing and recovers a known queued result without replay',async()=>{
  const draft=initial();let posts=0;
  const adapter=new SccAdapter({get:async()=>({draft}),post:async()=>{posts++;throw new Error('Unexpected replay');}} as any);
  const exact={revision:1,accountId:'account-fixture',payloadHash:draftFingerprint(draft)};
  await assert.rejects(()=>adapter.queue(draft.id,exact),/Approve/);
  draft.status='queued';draft.approvedRevision=1 as any;draft.queuedPostId='post-fixture' as any;
  const result=await adapter.queue(draft.id,exact);
  assert.equal(result.postId,'post-fixture');assert.equal(result.reused,true);assert.equal(posts,0);
});

test('SCC context allowlists account configuration and private brand fields',async()=>{
  const adapter=new SccAdapter({get:async(path:string)=>path.endsWith('/categories')?{categories:[{id:'cat',name:'Fixture',private:'omit'}]}:{accounts:[{id:'a',name:'Fixture',platform:'tiktok',account_type:'personal',category_id:'cat',access_token:'secret',brand_kit_json:'secret',brandKit:{text:'@fixture',logoPath:'D:/private/logo.png',secret:'omit'},capabilities:{canPublish:false,credential:'omit'}}]}} as any);
  const result=await adapter.context('a');
  assert.equal(result.selectedAccount.id,'a');assert.equal(result.selectedAccount.brandKit.text,'@fixture');
  assert.doesNotMatch(JSON.stringify(result),/secret|credential|logoPath|private/);
});

test('SCC analytics preserves confirmed zero while missing and unconfirmed metrics remain null',async()=>{
  const adapter=new SccAdapter({get:async()=>({videos:[
    {destination_id:'zero',provenance_status:'confirmed',source:'manual',views:0,likes:0,comments:null,shares:undefined},
    {destination_id:'missing',provenance_status:'unavailable',views:null},
    {destination_id:'estimated',provenance_status:'estimated',views:999,likes:2},
    {destination_id:'known',provenance_status:'confirmed',views:8,likes:1,comments:0,shares:0},
  ]})} as any);
  const result=await adapter.analytics();
  assert.equal(result.videos[0].views,0);assert.equal(result.videos[0].comments,null);assert.equal(result.videos[1].views,null);assert.equal(result.videos[2].views,null);
  assert.deepEqual(result.rankingByConfirmedViews,[{destinationId:'known',views:8},{destinationId:'zero',views:0}]);
  assert.equal(result.unavailableViews,2);
});

test('SCC Pipeline source origin retains base path for cross-application binding',async()=>{
  const adapter=new SccAdapter({get:async()=>({apiUrl:'http://127.0.0.1:8080/pipeline/'})} as any);
  assert.equal(await adapter.pipelineOrigin(),'http://127.0.0.1:8080/pipeline');
});

test('SCC lost-response draft reconciliation compares normalized original content without replay',async()=>{
  const draft=initial();let writes=0;
  const adapter=new SccAdapter({get:async()=>({draft}),post:async()=>{writes++;}} as any);
  const expected={title:' Fixture Reel ',videoId:'video-fixture',accountId:'account-fixture',caption:'Agent-authored fixture caption',hashtags:'#fixture',scheduledAt:'2099-01-02T10:00:00+07:00',categoryId:'ignored-import-category'};
  const recovered=await adapter.reconcileDraft(draft.id,expected);
  assert.equal(recovered.draft.id,draft.id);assert.equal(recovered.reconciled,true);assert.equal(writes,0);
  for(const changed of [{caption:'Changed caption'},{accountId:'another-account'},{scheduledAt:'2099-01-02T11:00:00+07:00'},{applyBranding:false},{selectedVariantId:'different-variant'}]) {
    await assert.rejects(()=>adapter.reconcileDraft(draft.id,{...expected,...changed}),/does not match/);
  }
  draft.status='approved';draft.approvedRevision=1 as any;
  await assert.rejects(()=>adapter.reconcileDraft(draft.id,expected),/unapproved/);
  assert.equal(writes,0);
});

test('SCC media reports original source and available quality without local paths or private metadata',async()=>{
  const adapter=new SccAdapter({get:async()=>({video:{id:'v',title:'Fixture',pipeline_job_id:'project-original',source_type:'pipeline_import',width:360,height:640,duration:1.25,file_path:'D:/private/video.mp4',metadata_json:JSON.stringify({sha256:'abc',source:'ai_video_pipeline',upstreamJobId:'project-original',hasAudio:true,creative_acceptance:'not_reviewed',private_secret:'omit',upstreamVideoUrl:'http://private/video'}),branded_variants:[{id:'variant',preset_name:'moving',file_path:'D:/private/render.mp4',width:360,height:640}]}})} as any);
  const media=await adapter.media('v');
  assert.equal(media.pipeline_job_id,'project-original');assert.equal(media.provenance.hasAudio,true);assert.equal(media.quality.creative_acceptance,'not_reviewed');
  assert.doesNotMatch(JSON.stringify(media),/private|file_path|upstreamVideoUrl/);
});

test('valid JSON with missing or conflicting SCC POST receipts remains uncertain',async()=>{
  const draft=initial();const exact={revision:1,accountId:'account-fixture',payloadHash:draftFingerprint(draft)};
  for(const invalid of [{},{success:true},{success:true,videoId:'video-fixture'},{success:false,videoId:'video-fixture',alreadyExisted:false}]) {
    const adapter=new SccAdapter({post:async()=>invalid} as any);
    await assert.rejects(()=>adapter.importVideo('project-fixture'),(error:unknown)=>error instanceof ApiError && error.uncertain && error.code==='invalid_scc_import_response');
  }
  const prepareInput={title:draft.title,videoId:draft.videoId,accountId:'account-fixture',caption:draft.destinations[0].caption,hashtags:'#fixture',scheduledAt:draft.scheduledAt};
  for(const invalid of [{},{draft:{}},{draft:{...draft,id:null}},{draft:{...draft,revision:0}},{draft:{...draft,status:'approved'}},{draft:{...draft,title:'Another title'}}]) {
    const adapter=new SccAdapter({post:async()=>invalid} as any);
    await assert.rejects(()=>adapter.prepare(prepareInput),(error:unknown)=>error instanceof ApiError && error.uncertain && error.code==='invalid_scc_prepare_response');
  }
  for(const invalid of [{},{draft:{...draft,status:'approved',approvedRevision:1,id:'another-draft'}},{draft:{...draft,status:'approved',approvedRevision:2}},{draft:{...draft,status:'draft'}}]) {
    const adapter=new SccAdapter({get:async()=>({draft}),post:async()=>invalid} as any);
    await assert.rejects(()=>adapter.approve(draft.id,exact),(error:unknown)=>error instanceof ApiError && error.uncertain && error.code==='invalid_scc_approve_response');
  }
  const approved={...draft,status:'approved',approvedRevision:1};
  const queued={...approved,status:'queued',queuedPostId:'post-fixture'};
  for(const invalid of [{},{draft:queued},{postId:'another-post',draft:queued},{postId:'post-fixture',draft:{...queued,revision:2}},{postId:'post-fixture',draft:approved}]) {
    const adapter=new SccAdapter({get:async()=>({draft:approved}),post:async()=>invalid} as any);
    await assert.rejects(()=>adapter.queue(draft.id,exact),(error:unknown)=>error instanceof ApiError && error.uncertain && error.code==='invalid_scc_queue_response');
  }
});

test('SCC context and analytics responses are bounded while ranking uses all confirmed saved observations',async()=>{
  const rows=Array.from({length:25},(_,index)=>({id:'a-'+index,platform:'tiktok',account_type:'personal',destination_id:'destination-'+index,provenance_status:'confirmed',views:index}));
  const adapter=new SccAdapter({get:async(path:string)=>path.includes('/analytics/')?{videos:rows,history:rows}:path.endsWith('/categories')?{categories:[]}:{accounts:rows}} as any);
  const context=await adapter.context();assert.equal(context.accounts.length,20);assert.equal(context.totalAccounts,25);assert.equal(context.hasMore,true);
  const selected=await adapter.context('a-24');assert.equal(selected.accounts.length,1);assert.equal(selected.selectedAccount.id,'a-24');assert.equal(selected.hasMore,false);
  const analytics=await adapter.analytics(undefined,undefined,{limit:3,offset:1});
  assert.equal(analytics.videos.length,3);assert.equal(analytics.total,25);assert.equal(analytics.hasMore,true);assert.equal(analytics.rankingScope,'all_saved_confirmed');
  assert.deepEqual(analytics.rankingByConfirmedViews.map((row:any)=>row.views),[23,22,21]);assert.deepEqual(analytics.lowestConfirmedViews.map((row:any)=>row.views),[1,2,3]);
  const history=await adapter.analytics(undefined,'destination-fixture',{limit:5,offset:20});assert.equal(history.history.length,5);assert.equal(history.total,25);assert.equal(history.hasMore,false);
  await assert.rejects(()=>adapter.analytics(undefined,undefined,{limit:101}),/limit/);
});

test('SCC publication reads the exact saved post and preserves independent outcomes without exposing paths',async()=>{
  const paths:string[]=[];
  const adapter=new SccAdapter({get:async(path:string)=>{paths.push(path);return {posts:[
    {id:'unrelated-post',title:'Omit unrelated content',destinations:[]},
    {id:'post-fixture',video_id:'video-fixture',title:'Fixture',status:'partially_failed',scheduled_at:'2099-01-02T03:00:00Z',thumbnail_path:'D:/private/thumb.jpg',destinations:[
      {id:'destination-published',post_id:'post-fixture',account_id:'page-a',status:'published',remote_post_id:'remote-fixture',remote_post_url:'https://www.facebook.com/reel/fixture',confirmation_source:'api',verification_status:'confirmed',branded_video_path:'D:/private/render.mp4'},
      {id:'destination-failed',post_id:'post-fixture',account_id:'page-b',status:'failed',remote_post_id:null,error_message:'Synthetic failure',retry_count:1},
    ]},
  ]};}} as any);
  const result=await adapter.publication('post-fixture');
  assert.equal(result.post.id,'post-fixture');assert.equal(result.post.status,'partially_failed');assert.equal(result.post.destinations.length,2);
  assert.equal(result.post.destinations[0].confirmation_source,'api');assert.equal(result.post.destinations[0].verification_status,'confirmed');assert.equal(result.post.destinations[1].status,'failed');
  assert.doesNotMatch(JSON.stringify(result),/private|unrelated|branded_video_path|thumbnail_path/);
  assert.deepEqual(paths,['/api/publishing/posts']);
  assert.equal((await adapter.publication('missing-post')).status,'unavailable');
});
