import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geminiQueueRequest,PipelineAdapter} from '../scripts/agent/pipeline.js';
test('standalone Gemini agent defaults and experimental admission do not touch Flow',async()=>{
 const body=geminiQueueRequest({title:'Kettle sneeze',idea:'A kettle sneezes, watering one flower which opens.'});
 assert.equal(body.scene_count,1);assert.equal(body.aspect_ratio,'9:16');assert.equal(body.generation_settings.mode,'dense_performance');
 let calls=0;const p=new PipelineAdapter({origin:'http://127.0.0.1:8080',get:async()=>{throw Error('unused')},post:async()=>{calls++;return {job_id:'one'} as any}});
 await assert.rejects(p.create({title:'two',idea:'two scenes',sceneCount:2}),/experimental/i);
 await assert.rejects(p.create({title:'wide',idea:'wide story',aspectRatio:'16:9'}),/experimental/i);
 assert.equal(calls,0);
});

test('historical two-scene Gemini creation intents still reconcile through reads only',async()=>{
 let gets=0,posts=0;
 const p=new PipelineAdapter({origin:'http://127.0.0.1:8080',get:async()=>{gets++;return {id:'historical',topic:'Original saved two-scene idea',status:'running',autopilot:{provider:'gemini_web'},scene_count:2,scene_seconds:10,aspect_ratio:'9:16',generation_settings:{version:'generation_settings.v1',mode:'dense_performance',performance_tempo:2}} as any},post:async()=>{posts++;throw Error('no mutation')}});
 const saved=await p.reconcile('historical',{title:'Historical',idea:'Original saved two-scene idea'});
 assert.equal(saved.progress.total,2);assert.equal(gets,1);assert.equal(posts,0);
});
