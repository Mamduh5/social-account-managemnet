import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {GeminiMediaQa,pcmEvidence,fileSha256,candidateCopy} from '../scripts/agent/gemini-media-qa.js';
import {runProcess} from '../scripts/agent/executors.js';

test('PCM evidence distinguishes silence, nonfinite samples and full scale without claiming listening acceptance',()=>{
  const silent=pcmEvidence(Buffer.alloc(32));assert.ok(silent.warnings.includes('digital_silence'));assert.equal(silent.rmsDbfs,null);assert.equal(silent.listeningAccepted,false);
  const b=Buffer.alloc(16);[1.2,-1.2,NaN,0.1].forEach((v,i)=>b.writeFloatLE(v,i*4));const r=pcmEvidence(b);assert.equal(r.nonfiniteSamples,1);assert.equal(r.fullScaleSamples,2);assert.ok(r.warnings.includes('nonfinite_audio'));assert.equal(r.listeningAccepted,false);assert.throws(()=>pcmEvidence(Buffer.alloc(3)));
});
test('caption candidate follows planned language, retains no-hashtag option and never invents the rendered plot',()=>{
  assert.equal(candidateCopy({}).language,'en');assert.match(candidateCopy({}).basis,/hypothesis/);assert.match(candidateCopy({languageStrategy:{captionLanguages:['ja']}}).caption!,/AI/);assert.equal(candidateCopy({languageStrategy:{captionLanguages:['de']}}).caption,null);assert.equal(candidateCopy({}).hashtags,'');assert.doesNotMatch(candidateCopy({}).caption!,/rescue|umbrella|key|viral/);
});
test('Traditional Chinese caption choices preserve the requested script and audience region',()=>{for(const language of ['zh-Hant','zh-Hant-HK','zh-TW']){const copy=candidateCopy({languageStrategy:{captionLanguages:[language]}});assert.equal(copy.language,language);assert.match(copy.caption!,/虛構/);assert.doesNotMatch(copy.caption!,/虚构/);}});
test('synthetic local media passes actual FFprobe/full-decode/PCM checks and reuses exact cached evidence',async t=>{
  const probe=spawnSync('ffmpeg',['-version'],{encoding:'utf8',windowsHide:true});if(probe.status!==0){t.skip('Local FFmpeg fixture tool unavailable');return;}
  const dir=mkdtempSync(path.join(tmpdir(),'gemini-media-qa-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const source=path.join(dir,'synthetic-fixture.mp4');
  const built=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=72x128:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','10','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-ac','2',source],{windowsHide:true,encoding:'utf8'});assert.equal(built.status,0,built.stderr);
  const bytes=readFileSync(source),sha=await fileSha256(source);let downloads=0,calls=0;const qa=new GeminiMediaQa(path.join(dir,'qa'),async(...args)=>{calls++;return runProcess(...args);},async()=>{downloads++;return new Response(bytes,{headers:{'content-length':String(bytes.length)}});});
  const media={id:'fixture-video',file_size:bytes.length,provenance:{sha256:sha}},r=await qa.inspect('http://localhost:3001',media,1024**2);assert.equal(r.technicalPass,true);assert.equal(r.fullDecode,true);assert.equal(r.audio.nonfiniteSamples,0);assert.equal(r.audio.listeningAccepted,false);assert.equal(r.creativeAccepted,false);assert.equal(r.width,72);assert.equal(r.height,128);assert.equal(calls,4);assert.equal(downloads,1);assert.deepEqual(await qa.inspect('http://localhost:3001',media,1024**2),r);assert.equal(calls,4);assert.equal(downloads,1);assert.equal(await fileSha256(source),sha);
});
test('mismatched/oversized media is held before any analysis tool runs',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'gemini-corrupt-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let tools=0,gets=0;const q=new GeminiMediaQa(dir,async()=>{tools++;throw new Error('unexpected tool');},async()=>{gets++;return new Response(Buffer.from('wrong'));});
  await assert.rejects(()=>q.inspect('http://localhost:3001',{id:'video',file_size:5,provenance:{sha256:'a'.repeat(64)}},100),/immutable master/);assert.equal(tools,0);assert.equal(gets,1);await assert.rejects(()=>q.inspect('http://localhost:3001',{id:'video',file_size:1000,provenance:{sha256:'a'.repeat(64)}},100),/oversized/);assert.equal(gets,1);
});
test('current-backend upload stream is used and cross-origin or render URLs are rejected',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'gemini-stream-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let url='';const q=new GeminiMediaQa(dir,async()=>{throw new Error('unexpected');},async input=>{url=String(input);return new Response('wrong');});const m={id:'video',file_size:5,provenance:{sha256:'a'.repeat(64)},streamUrl:'/uploads/video_master.mp4'};
  await assert.rejects(()=>q.inspect('http://localhost:3001',m,100),/immutable/);assert.equal(url,'http://localhost:3001/uploads/video_master.mp4');
  for(const streamUrl of ['https://evil.example/video.mp4','/uploads/renders/variant.mp4','/uploads/../secret.mp4','/uploads/video.mp4?token=secret'])await assert.rejects(()=>q.inspect('http://localhost:3001',{...m,streamUrl},100),/Invalid master/);
});
