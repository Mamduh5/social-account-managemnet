import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {randomUUID} from 'node:crypto';
const {validateAdmission,imageEvents,selectArtifact,probePng,safeEnv,importImage,finishOriginal,sha}=createRequire(__filename)('../scripts/agent/codex-image-once.cjs');
const account={account:{type:'chatgpt',planType:'team'}},limits={rateLimits:{primary:{usedPercent:40},secondary:{usedPercent:20},credits:{hasCredits:false,unlimited:false}}};
function fixture(t:any){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scc-image-once-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const thread=randomUUID(),generated=path.join(dir,'generated'),threadDir=path.join(generated,thread);fs.mkdirSync(threadDir,{recursive:true});
  const file=path.join(threadDir,'exec-'+randomUUID()+'.png');fs.writeFileSync(file,'fixture');
  const start=new Date(Date.now()-1000).toISOString(),end=new Date(Date.now()+1000).toISOString(),prompt='one included image';
  const intent={startedAt:start,prompt,promptSha256:sha(Buffer.from(prompt)),maximumImages:1,apiKeysPassed:false,args:['C:\\Program Files\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js','exec','--ignore-user-config','features.image_generation=true','approval_policy="never"']};
  const receipt={startedAt:start,finishedAt:end,exitCode:0,failure:null,threadId:thread,intentSha256:sha(Buffer.from(JSON.stringify(intent)))};
  const events:any[]=[{type:'thread.started',thread_id:thread},{type:'turn.started'},{type:'item.completed',item:{id:'final',type:'agent_message',text:JSON.stringify({file})}},{type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}];
  return {dir,thread,generated,threadDir,file,intent,receipt,events,select(){return selectArtifact(this.events,this.receipt,this.intent,this.generated,this.thread);}};
}
test('one-time admission requires included ChatGPT capacity, no credits and native capability',()=>{
  assert(validateAdmission(account,limits,{imageGeneration:true}));assert(validateAdmission(account,{...limits,ordinaryUsageAllowed:true,rateLimits:{...limits.rateLimits,primary:{usedPercent:91}}},{imageGeneration:true}));
  for(const a of [{account:{type:'apiKey',planType:'team'}},{account:{type:'chatgpt',planType:'unknown'}}])assert.throws(()=>validateAdmission(a,limits,{imageGeneration:true}));
  for(const r of [{...limits.rateLimits,credits:{hasCredits:true,unlimited:false}},{...limits.rateLimits,credits:{hasCredits:false,unlimited:true}},{...limits.rateLimits,primary:{usedPercent:100}},{...limits.rateLimits,rateLimitReachedType:'weekly'},{...limits.rateLimits,secondary:{usedPercent:NaN}},{...limits.rateLimits,spendControlReached:true},{primary:{usedPercent:0}}])assert.throws(()=>validateAdmission(account,{rateLimits:r},{imageGeneration:true}));
  assert.throws(()=>validateAdmission(account,{...limits,ordinaryUsageAllowed:false},{imageGeneration:true}));
  assert.throws(()=>validateAdmission(account,limits,{imageGeneration:false}));
});
test('exact final-result handoff succeeds without claiming a native image event',t=>{
  const f=fixture(t),a=f.select();assert.equal(a.file,fs.realpathSync(f.file));assert.equal(a.evidenceMode,'verified_final_result_path');assert.equal(a.nativeImageEventObserved,false);assert.equal(a.itemId,null);assert.equal(imageEvents(f.events).length,0);
});
test('native completion is preferred; failed or duplicate native operations never fall back',t=>{
  const f=fixture(t),event={type:'item.completed',item:{type:'image_generation',id:'image',status:'completed',saved_path:f.file}};
  f.events.splice(2,0,event);assert.equal(f.select().evidenceMode,'native_completion');event.item.status='failed';assert.throws(()=>f.select(),/native_image_result/);event.item.status='completed';f.events.splice(2,0,{...event,item:{...event.item,id:'second'}});assert.throws(()=>f.select(),/ambiguous_native/);
});
test('failed or incomplete process, changed intent and mismatched thread are rejected',t=>{
  const f=fixture(t);for(const receipt of [{...f.receipt,exitCode:1},{...f.receipt,failure:'timeout'},{...f.receipt,finishedAt:null},{...f.receipt,threadId:randomUUID()},{...f.receipt,intentSha256:'wrong'}])assert.throws(()=>selectArtifact(f.events,receipt,f.intent,f.generated,f.thread));
  assert.throws(()=>selectArtifact(f.events,f.receipt,{...f.intent,prompt:'changed'},f.generated,f.thread));assert.throws(()=>selectArtifact(f.events,f.receipt,{...f.intent,apiKeysPassed:true},f.generated,f.thread));assert.throws(()=>selectArtifact(f.events,f.receipt,f.intent,f.generated,randomUUID()));
});
test('unrelated, missing, traversal, ambiguous, stale and future artifacts are rejected',t=>{
  const f=fixture(t),set=(file:string)=>{f.events[2].item.text=JSON.stringify({file});};
  set(path.join(f.dir,'unrelated.png'));assert.throws(()=>f.select());set(path.join(f.threadDir,'exec-missing.png'));assert.throws(()=>f.select());set(f.threadDir+path.sep+'..'+path.sep+f.thread+path.sep+path.basename(f.file));assert.throws(()=>f.select(),/nontraversing/);
  set(f.file);fs.writeFileSync(path.join(f.threadDir,'extra.png'),'extra');assert.throws(()=>f.select(),/ambiguous_image/);fs.unlinkSync(path.join(f.threadDir,'extra.png'));
  fs.utimesSync(f.file,new Date(0),new Date(0));assert.throws(()=>f.select(),/stale_or_future/);fs.utimesSync(f.file,new Date(),new Date(Date.now()+60000));assert.throws(()=>f.select(),/stale_or_future/);
});
test('directory junction escaping expected thread location is rejected',t=>{
  const f=fixture(t),outside=path.join(f.dir,'outside');fs.renameSync(f.threadDir,outside);fs.symlinkSync(outside,f.threadDir,process.platform==='win32'?'junction':'dir');assert.throws(()=>f.select(),/symlink/);
});
test('extra turns, unexpected commands and malformed final objects are rejected',t=>{
  const f=fixture(t);assert.throws(()=>selectArtifact([...f.events,{type:'turn.completed'}],f.receipt,f.intent,f.generated,f.thread));assert.throws(()=>selectArtifact([...f.events,{type:'item.completed',item:{type:'command_execution'}}],f.receipt,f.intent,f.generated,f.thread));f.events[2].item.text=JSON.stringify({file:f.file,other:'ambiguous'});assert.throws(()=>f.select(),/strict_final/);
});
test('image-only environment excludes API keys and provider overrides',()=>{const env=safeEnv();for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL','GEMINI_API_KEY','ANTHROPIC_API_KEY'])assert.equal(env[key],undefined);});
function uploadFixture(t:any){
  const f=fixture(t),bytes=fs.readFileSync(f.file),qa={sha256:sha(bytes),bytes:bytes.length,width:512,height:768},provenance={threadId:f.thread,intentSha256:f.receipt.intentSha256};
  const assets:any[]=[],calls:string[]=[];let losePost=false,loseRead=false;
  const fetcher=async(url:string,options:any={})=>{const method=options.method??'GET';calls.push(method+' '+url);if(method==='POST'){const blob=options.body.get('image');const image={id:'img-'+randomUUID(),original_filename:blob.name,sha256:qa.sha256,file_size:qa.bytes,width:qa.width,height:qa.height};assets.push(image);if(losePost)throw new Error('lost_response');return Response.json({image});}if(url.endsWith('/content')){if(loseRead){loseRead=false;throw new Error('lost_read');}return new Response(bytes);}return Response.json({images:assets});};
  return {...f,qa,provenance,assets,calls,fetcher,losePost(){losePost=true;},loseRead(){loseRead=true;},run(){return importImage(f.file,qa,provenance,f.dir,fetcher,'http://fixture/images');}};
}
test('durable completion and repeat read-back never upload twice',async t=>{const f=uploadFixture(t),first=await f.run(),second=await f.run();assert.equal(first.image.id,second.image.id);assert.equal(f.calls.filter(x=>x.startsWith('POST')).length,1);assert.equal(first.completion.readbackByteIdentical,true);assert(fs.existsSync(path.join(f.dir,'import-completion.json')));});
test('concurrent import claims admit at most one POST',async t=>{const f=uploadFixture(t),results=await Promise.allSettled([f.run(),f.run()]);assert(results.some(r=>r.status==='fulfilled'));assert.equal(f.calls.filter(x=>x.startsWith('POST')).length,1);assert.equal(f.assets.length,1);});
test('lost upload response recovers exact original using GET only',async t=>{const f=uploadFixture(t);f.losePost();await assert.rejects(f.run(),/lost_response/);const recovered=await f.run();assert.equal(recovered.image.id,f.assets[0].id);assert.equal(f.calls.filter(x=>x.startsWith('POST')).length,1);});
test('interrupted read-back resumes without another POST or generation',async t=>{const f=uploadFixture(t);f.loseRead();await assert.rejects(f.run(),/lost_read/);assert.equal((await f.run()).image.id,f.assets[0].id);assert.equal(f.calls.filter(x=>x.startsWith('POST')).length,1);});
test('uncertain upload with no unique match stays held without another POST',async t=>{const f=uploadFixture(t);f.losePost();await assert.rejects(f.run());f.assets.push({...f.assets[0],id:'img-'+randomUUID()});await assert.rejects(f.run(),/uncertain_do_not_repeat/);f.assets.length=0;await assert.rejects(f.run(),/uncertain_do_not_repeat/);assert.equal(f.calls.filter(x=>x.startsWith('POST')).length,1);});
test('changed local bytes are rejected before any upload',async t=>{const f=uploadFixture(t);fs.appendFileSync(f.file,'changed');await assert.rejects(f.run(),/changed_before_upload/);assert.equal(f.calls.length,0);});
test('PNG checks reject fake signatures, excessive sizes and damaged decode',t=>{
  const f=fixture(t);assert.throws(()=>probePng(f.file),/signature_or_upload_size/);fs.writeFileSync(f.file,Buffer.alloc(4*1024*1024+1));assert.throws(()=>probePng(f.file),/signature_or_upload_size/);
  const original=path.resolve('.data/agent/codex-imagegen-once-20261105/scheduled-candidate.png');if(fs.existsSync(original)){fs.writeFileSync(f.file,fs.readFileSync(original).subarray(0,100));assert.throws(()=>probePng(f.file));}
});
test('wrong uploaded metadata and corrupted read-back stay held without a second upload',async t=>{
  const f=uploadFixture(t);await f.run();f.assets[0].sha256='foreign';fs.unlinkSync(path.join(f.dir,'upload-response.json'));await assert.rejects(f.run(),/uncertain_do_not_repeat/);assert.equal(f.calls.filter(x=>x.startsWith('POST')).length,1);
  const g=uploadFixture(t);const fetcher=async(url:string,options:any={})=>url.endsWith('/content')?new Response('wrong bytes'):g.fetcher(url,options);await assert.rejects(importImage(g.file,g.qa,g.provenance,g.dir,fetcher,'http://fixture/images'),/readback_mismatch/);assert.equal(g.calls.filter(x=>x.startsWith('POST')).length,1);
});
test('original saved stream and PNG complete corrected importer in isolated state with zero generation',async t=>{
  const original=path.resolve('.data/agent/codex-imagegen-once-20261105');if(!fs.existsSync(path.join(original,'codex-events.jsonl'))){t.skip('Owner-local original evidence not present');return;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scc-original-image-replay-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));for(const name of ['generation-intent.json','codex-process.json','codex-events.jsonl'])fs.copyFileSync(path.join(original,name),path.join(dir,name));
  const source=path.join(original,'scheduled-candidate.png'),bytes=fs.readFileSync(source),qa=probePng(source),assets:any[]=[],calls:string[]=[];
  const fetcher=async(url:string,options:any={})=>{const method=options.method??'GET';calls.push(method);if(method==='POST'){const file=options.body.get('image');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);const image={id:'img-'+randomUUID(),original_filename:file.name,sha256:qa.sha256,file_size:qa.bytes,width:qa.width,height:qa.height};assets.push(image);return Response.json({image});}return url.endsWith('/content')?new Response(bytes):Response.json({images:assets});};
  const generated=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'generated_images');const result=await finishOriginal(dir,generated,fetcher,'http://fixture/images'),again=await finishOriginal(dir,generated,fetcher,'http://fixture/images');
  assert.equal(result.provenance.nativeImageEventObserved,false);assert.equal(result.provenance.evidenceMode,'verified_final_result_path');assert.equal(result.qa.sha256,'97030fa62290c152f2318a94a9b08f2fe6c85b5b498fb1ba37534f5bf2ba70b5');assert.equal(result.imageId,again.imageId);assert.equal(calls.filter(x=>x==='POST').length,1);assert.equal(assets.length,1);assert.deepEqual(fs.readFileSync(source),bytes);
});
