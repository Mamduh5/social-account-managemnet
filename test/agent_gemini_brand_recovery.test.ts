import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SccAdapter} from '../scripts/agent/scc.js';
import {JsonClient} from '../scripts/agent/http.js';
const sourceSha='a'.repeat(64),variantSha='b'.repeat(64);
function fixture(){let posts=0,intent:any,variants:any[]=[];
  const adapter=new SccAdapter(new JsonClient('http://localhost:3001',{fetch:async(input,options)=>{
    const url=new URL(String(input));
    if(url.pathname==='/api/operator/pages/page/context')return Response.json({account:{id:'page',name:'Correct Page',graphId:'123',identityVerifiedAt:'2026-11-04T00:00:00Z'},contextFingerprint:'c'.repeat(64),rules:[]});
    if(url.pathname==='/api/publishing/videos/video')return Response.json({video:{id:'video',width:720,height:1280,duration:10,file_size:1024,metadata_json:JSON.stringify({sha256:sourceSha,hasAudio:true}),branded_variants:variants}});
    if(url.pathname==='/api/branding/render-preview'&&options?.method==='POST'){posts++;assert.ok(intent,'durable callback ran before POST');const body=JSON.parse(String(options.body));variants=[{id:'variant',video_id:'video',preset_name:body.presetName,brand_kit_json:JSON.stringify(body.brandKit),sha256:variantSha,width:720,height:1280,duration:10,file_size:2048}];return Response.json({variantId:'variant',sha256:variantSha});}
    throw new Error('Unexpected fixture request');
  }}));
  return {adapter,get posts(){return posts;},get intent(){return intent;},capture:(v:any)=>{intent=v;}};
}
test('Gemini render intent is recorded before POST and exact original variant recovery is read-only',async()=>{const f=fixture();const rendered=await f.adapter.brandProduction('video','page',f.capture);assert.equal(rendered.variantId,'variant');assert.equal(f.posts,1);const recovered=await f.adapter.reconcileProductionBrand('variant',f.intent);assert.equal(recovered.sha256,variantSha);assert.equal(f.posts,1);
  for(const changed of [{...f.intent,graphId:'999'},{...f.intent,sourceSha256:'d'.repeat(64)},{...f.intent,brandKit:{...f.intent.brandKit,text:'Wrong Page'}}])await assert.rejects(()=>f.adapter.reconcileProductionBrand('variant',changed),/differs/);assert.equal(f.posts,1);
});
test('failed durable intent persistence prevents any branding write',async()=>{const f=fixture();await assert.rejects(()=>f.adapter.brandProduction('video','page',()=>{throw new Error('fixture persistence failure');}),/persistence failure/);assert.equal(f.posts,0);});

test('future sourced-Page mobile branding is opt-in and preserves the ordinary World defaults and original render identities',async()=>{const legacy=fixture();await legacy.adapter.brandProduction('video','page',legacy.capture);assert.equal(legacy.intent.brandKit.fontSize,36);assert.equal(legacy.intent.brandKit.opacity,.6);const page=fixture();await page.adapter.brandProduction('video','page',page.capture,true);assert.equal(page.intent.brandKit.fontSize,54);assert.equal(page.intent.brandKit.opacity,.9);assert.equal(page.intent.brandKit.text,'Correct Page');assert.deepEqual(page.intent.brandKit.safeArea,legacy.intent.brandKit.safeArea);assert.equal((await page.adapter.reconcileProductionBrand('variant',page.intent)).reconciled,true);assert.equal(page.posts,1);});
