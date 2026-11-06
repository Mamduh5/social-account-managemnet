// Disposable owner-authorized validation only. Not a recurring image provider.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const DIRECTORY = path.join(ROOT, '.data/agent/codex-image-final-20261105');
const CLI = 'C:\\Program Files\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js';
const TASK = 'codex-image-final-20261105-v1';
const ENDPOINT = 'http://localhost:3001/api/publishing/images';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
function save(directory, name, value) { fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2), {flag:'wx'}); }
function requireTrue(value, reason) { if (!value) throw new Error(reason); }
function safeEnv() {
  const env = {};
  for (const key of ['PATH','Path','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','CODEX_HOME']) if (process.env[key]) env[key] = process.env[key];
  return env;
}
function validateAdmission(account, limits, capabilities) {
  const r = limits.rateLimitsByLimitId?.codex ?? limits.rateLimits;
  requireTrue(account.account?.type === 'chatgpt' && ['team','business','plus','pro','enterprise','edu'].includes(account.account?.planType), 'subscription_authentication_unverified');
  // Provider-visible availability, not the former test's arbitrary 80% cutoff.
  requireTrue(limits.ordinaryUsageAllowed!==false && r?.rateLimitReachedType==null && r?.primary && r?.secondary && [r.primary.usedPercent,r.secondary.usedPercent].every(v => Number.isFinite(v) && v >= 0 && v < 100), 'included_usage_headroom_unverified');
  requireTrue(r.credits?.hasCredits === false && r.credits?.unlimited === false && r.spendControlReached !== true, 'credit_fallback_cannot_be_excluded');
  requireTrue(capabilities.imageGeneration === true, 'noninteractive_image_capability_unavailable');
  return {authType:account.account.type, planType:account.account.planType, rateLimits:r, capabilities};
}
async function preflight(directory = DIRECTORY) {
  const child = spawn(process.execPath, [CLI,'app-server','--listen','stdio://'], {cwd:directory, env:safeEnv(), windowsHide:true, shell:false, stdio:['pipe','pipe','pipe']});
  let buf = '', id = 0; const pending = new Map();
  const fail = reason => { for (const p of pending.values()) p.reject(new Error(reason)); pending.clear(); };
  child.stdout.on('data', b => { buf += b; for (;;) { const n=buf.indexOf('\n'); if(n<0)break; const line=buf.slice(0,n);buf=buf.slice(n+1);try{const r=JSON.parse(line),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(new Error('preflight_rpc_'+r.error.code)):p.resolve(r.result);}}catch{}} });
  child.stderr.resume();child.on('error',()=>fail('preflight_spawn_failed'));child.on('close',()=>fail('preflight_closed'));
  const call = (method,params) => new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
  const timer=setTimeout(()=>{fail('preflight_timeout');child.kill();},20000);
  try {
    await call('initialize',{clientInfo:{name:'scc_image_once',version:'1.1.0'},capabilities:{experimentalApi:false}}); child.stdin.write('{"method":"initialized"}\n');
    const account=await call('account/read',{refreshToken:false}), limits=await call('account/rateLimits/read',{}), capabilities=await call('modelProvider/capabilities/read',{});
    save(directory,'subscription-observation-'+Date.now()+'.json',{at:new Date().toISOString(),authType:account.account?.type,planType:account.account?.planType,limits,capabilities,generationCalls:0});
    return validateAdmission(account,limits,capabilities);
  } finally {clearTimeout(timer);child.stdin.end();}
}
function imageEvents(events) { return events.filter(e=>['item.started','item.completed'].includes(e.type) && /^(image_generation|imageGeneration|image_generation_call)$/.test(e.item?.type??'')); }
function verifyIntent(intent) {
  requireTrue(intent?.maximumImages===1 && intent.apiKeysPassed===false && typeof intent.prompt==='string' && sha(Buffer.from(intent.prompt))===intent.promptSha256, 'generation_intent_mismatch');
  requireTrue(Array.isArray(intent.args) && intent.args[0]===CLI && intent.args.includes('exec') && intent.args.includes('features.image_generation=true') && intent.args.includes('--ignore-user-config') && intent.args.includes('approval_policy="never"'), 'included_generation_route_unverified');
  requireTrue(Number.isFinite(Date.parse(intent.startedAt)), 'generation_intent_time_invalid');
}
function selectArtifact(events, receipt, intent, generatedRoot, expectedThreadId) {
  verifyIntent(intent);
  const start=Date.parse(receipt?.startedAt), end=Date.parse(receipt?.finishedAt);
  requireTrue(receipt?.exitCode===0 && receipt.failure===null && Number.isFinite(start) && Number.isFinite(end) && end>=start && start>=Date.parse(intent.startedAt) && start-Date.parse(intent.startedAt)<10000, 'successful_original_process_required');
  if(receipt.intentSha256) requireTrue(receipt.intentSha256===sha(Buffer.from(JSON.stringify(intent))), 'process_intent_binding_mismatch');
  requireTrue(events.filter(e=>e.type==='thread.started').length===1 && events.filter(e=>e.type==='turn.started').length===1 && events.filter(e=>e.type==='turn.completed').length===1 && !events.some(e=>['turn.failed','error'].includes(e.type)), 'single_successful_turn_required');
  const threadId=events.find(e=>e.type==='thread.started').thread_id;
  requireTrue(typeof threadId==='string' && /^[a-f0-9-]{36}$/i.test(threadId) && (!expectedThreadId || threadId===expectedThreadId) && (!receipt.threadId || receipt.threadId===threadId), 'original_thread_mismatch');
  const native=imageEvents(events), ids=new Set(native.map(e=>e.item.id));
  let file, evidenceMode, itemId=null;
  if(native.length) {
    requireTrue(ids.size===1, 'ambiguous_native_image_operations');
    const completed=native.filter(e=>e.type==='item.completed');
    requireTrue(completed.length===1 && !completed[0].item.failure && ['completed','succeeded','success'].includes(completed[0].item.status), 'native_image_result_not_completed');
    file=completed[0].item.saved_path??completed[0].item.savedPath;itemId=completed[0].item.id;evidenceMode='native_completion';
  } else {
    requireTrue(events.every(e=>!e.type.startsWith('item.') || e.item?.type==='agent_message'), 'unexpected_tool_evidence_requires_review');
    evidenceMode='verified_final_result_path';
  }
  const last=events.filter(e=>e.type==='item.completed' && e.item?.type==='agent_message').at(-1);
  let final;try{final=JSON.parse(last?.item.text);}catch{}
  if(!file) {
    requireTrue(final && Object.keys(final).length===1 && typeof final.file==='string', 'strict_final_file_result_required');file=final.file;
  } else if(final?.file) requireTrue(path.normalize(final.file)===path.normalize(file), 'native_final_path_disagreement');
  requireTrue(typeof file==='string' && path.isAbsolute(file) && !file.split(/[\\/]+/).includes('..') && !file.includes('\0'), 'absolute_nontraversing_png_path_required');
  const root=fs.realpathSync(generatedRoot), expected=path.join(root,threadId), lexical=path.normalize(file);
  requireTrue(path.dirname(lexical)===expected && /^exec-[a-f0-9-]+\.png$/i.test(path.basename(lexical)), 'expected_thread_output_location_required');
  requireTrue(!fs.lstatSync(expected).isSymbolicLink() && fs.realpathSync(expected)===expected && !fs.lstatSync(lexical).isSymbolicLink(), 'image_symlink_forbidden');
  const real=fs.realpathSync(lexical),stat=fs.statSync(real);
  requireTrue(path.dirname(real)===expected && stat.isFile(), 'image_artifact_provenance_invalid');
  const candidates=fs.readdirSync(expected).filter(f=>/\.png$/i.test(f));
  requireTrue(candidates.length===1 && candidates[0]===path.basename(real), 'ambiguous_image_candidates');
  requireTrue(stat.mtimeMs>=start-2000 && stat.mtimeMs<=end+2000 && stat.birthtimeMs>=start-2000 && stat.birthtimeMs<=end+2000, 'image_artifact_stale_or_future');
  return {file:real,threadId,itemId,evidenceMode,nativeImageEventObserved:native.length>0,artifactCount:1,traceSha256:sha(Buffer.from(JSON.stringify(events))),intentSha256:sha(Buffer.from(JSON.stringify(intent))),processReceipt:receipt};
}
function probePng(file) {
  const bytes=fs.readFileSync(file);
  requireTrue(bytes.length>24 && bytes.length<=4*1024*1024 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'png_signature_or_upload_size_invalid');
  const s=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height','-of','json',file],{encoding:'utf8',timeout:10000,windowsHide:true})).streams?.[0];
  requireTrue(s?.codec_name==='png' && s.width>=512 && s.height>=512 && s.width<=4096 && s.height<=4096, 'png_dimensions_invalid');
  execFileSync('ffmpeg',['-v','error','-xerror','-i',file,'-frames:v','1','-f','null','-'],{timeout:15000,windowsHide:true});
  return {sha256:sha(bytes),bytes:bytes.length,format:'png',width:s.width,height:s.height,fullDecode:true};
}
async function generate(prompt, directory, references=[]) {
  const cwd=path.join(directory,'sandbox');fs.mkdirSync(cwd,{recursive:true});
  const args=[CLI,'exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','-c','approval_policy="never"','-c','features.image_generation=true','-c','features.shell_tool=false','-c','features.unified_exec=false','-c','features.apps=false','-c','features.hooks=false','-c','features.multi_agent=false','-c','features.skill_search=false','-c','web_search="disabled"','-'];
  const referenceEvidence=references.map(file=>({file:fs.realpathSync(file),...probePng(file)}));
  for(const reference of referenceEvidence)args.splice(args.length-1,0,'--image',reference.file);
  const intent={startedAt:new Date().toISOString(),method:'codex exec built-in image_generation feature; ChatGPT included authentication only',command:process.execPath,args,prompt,promptSha256:sha(Buffer.from(prompt)),maximumImages:1,apiKeysPassed:false,...(referenceEvidence.length?{references:referenceEvidence}:{})};save(directory,'generation-intent.json',intent);
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd,env:safeEnv(),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    let output='',error='',buffer='',failure=null,threadId=null;const startedAt=new Date().toISOString(),seen=new Set();
    const timer=setTimeout(()=>{failure='generation_timeout_original_uncertain';child.kill();},210000);
    child.stdout.on('data',b=>{output+=b;buffer+=b;fs.writeFileSync(path.join(directory,'codex-events.jsonl'),output);if(Buffer.byteLength(output)>16*1024*1024){failure='output_limit_original_uncertain';child.kill();}for(;;){const n=buffer.indexOf('\n');if(n<0)break;const line=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const e=JSON.parse(line);if(e.type==='thread.started')threadId=e.thread_id;if(imageEvents([e]).length){seen.add(e.item.id);if(seen.size>1){failure='second_image_operation_refused';child.kill();}}}catch{}}});
    child.stderr.on('data',b=>{if(error.length<65536)error+=b;});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('codex_spawn_failed'));});
    child.on('close',code=>{clearTimeout(timer);fs.writeFileSync(path.join(directory,'codex-stderr.log'),error.replace(/\b(?:sk-[\w-]+|AIza[\w-]+)/g,'[REDACTED]'));const receipt={pid:child.pid,exitCode:code,startedAt,finishedAt:new Date().toISOString(),failure,threadId,intentSha256:sha(Buffer.from(JSON.stringify(intent))),nativeImageOperationCount:seen.size};save(directory,'codex-process.json',receipt);if(failure||code!==0)return reject(new Error(failure??'codex_exit_'+code));try{resolve({events:output.trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)),receipt,intent});}catch{reject(new Error('codex_event_parse_failed'));}});
    child.stdin.end(prompt);
  });
}
async function importImage(file, qa, provenance, directory, fetcher=fetch, endpoint=ENDPOINT) {
  // Write-once operation identity and pre-upload inventory precede POST. Recovery is GET-only.
  const bytes=fs.readFileSync(file);requireTrue(bytes.length===qa.bytes && sha(bytes)===qa.sha256,'local_image_changed_before_upload');
  const identity={version:'codex-image-once-import.v1',threadId:provenance.threadId,intentSha256:provenance.intentSha256,sha256:qa.sha256};
  const operationId='codex-image-import-'+sha(Buffer.from(JSON.stringify(identity))),filename=operationId+'.png';
  const intentFile=path.join(directory,'upload-intent.json'),responseFile=path.join(directory,'upload-response.json');
  const get=async url=>{const r=await fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'error'});requireTrue(r.ok,'image_read_http_'+r.status);return r;};
  let image;
  if(fs.existsSync(intentFile)) {
    const original=read(intentFile);requireTrue(original.operationId===operationId && original.endpoint===endpoint && original.sha256===qa.sha256,'original_upload_identity_mismatch');
    if(fs.existsSync(responseFile))image=read(responseFile);
    else {
      const {images}=await (await get(endpoint)).json();requireTrue(Array.isArray(images),'image_inventory_invalid');
      const matches=images.filter(i=>i.original_filename===filename && i.sha256===qa.sha256 && i.file_size===qa.bytes && i.width===qa.width && i.height===qa.height && !original.previousIds.includes(i.id));
      requireTrue(matches.length===1,'original_upload_uncertain_do_not_repeat');image=matches[0];save(directory,'upload-response.json',image);
    }
  } else {
    const {images}=await (await get(endpoint)).json();requireTrue(Array.isArray(images),'image_inventory_invalid');
    save(directory,'upload-intent.json',{at:new Date().toISOString(),operationId,endpoint,filename,sha256:qa.sha256,bytes:qa.bytes,previousIds:images.map(i=>i.id)});
    const form=new FormData();form.append('image',new Blob([new Uint8Array(bytes)],{type:'image/png'}),filename);
    const r=await fetcher(endpoint,{method:'POST',body:form,signal:AbortSignal.timeout(30000),redirect:'error'});requireTrue(r.ok,'upload_http_'+r.status+'_original_requires_review');image=(await r.json()).image;save(directory,'upload-response.json',image);
  }
  requireTrue(typeof image?.id==='string' && /^img-[a-z0-9-]+$/i.test(image.id) && image.original_filename===filename && image.sha256===qa.sha256 && image.file_size===qa.bytes && image.width===qa.width && image.height===qa.height,'uploaded_image_metadata_mismatch');
  const downloaded=Buffer.from(await (await get(endpoint+'/'+encodeURIComponent(image.id)+'/content')).arrayBuffer());requireTrue(downloaded.equals(bytes),'uploaded_image_readback_mismatch');
  const completion={at:new Date().toISOString(),operationId,imageId:image.id,sha256:qa.sha256,bytes:qa.bytes,readbackByteIdentical:true};
  const completionFile=path.join(directory,'import-completion.json');if(fs.existsSync(completionFile)){const old=read(completionFile);requireTrue(old.operationId===operationId && old.imageId===image.id && old.sha256===qa.sha256,'import_completion_mismatch');}else save(directory,'import-completion.json',completion);
  return {image,completion:read(completionFile)};
}
async function finishOriginal(directory, generatedRoot, fetcher=fetch, endpoint=ENDPOINT) {
  const intent=read(path.join(directory,'generation-intent.json')),receipt=read(path.join(directory,'codex-process.json'));
  const events=fs.readFileSync(path.join(directory,'codex-events.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));
  const artifact=selectArtifact(events,receipt,intent,generatedRoot,receipt.threadId),qa=probePng(artifact.file),file=path.join(directory,'scheduled-candidate.png');
  if(fs.existsSync(file))requireTrue(sha(fs.readFileSync(file))===qa.sha256,'saved_candidate_changed');else fs.copyFileSync(artifact.file,file,fs.constants.COPYFILE_EXCL);
  const handoff={...artifact,file,sourceFile:artifact.file,qa};const handoffFile=path.join(directory,'artifact-handoff.json');
  if(fs.existsSync(handoffFile))requireTrue(JSON.stringify(read(handoffFile))===JSON.stringify(handoff),'saved_artifact_handoff_mismatch');else save(directory,'artifact-handoff.json',handoff);
  const {image,completion}=await importImage(file,qa,artifact,directory,fetcher,endpoint);
  return {status:'imported_candidate_needs_owner_review',method:'Codex built-in image_generation through scheduled SCC AgentRunner',file,sourceFile:artifact.file,qa,imageId:image.id,completion,provenance:artifact,usage:events.find(e=>e.type==='turn.completed').usage??null,draftId:null,publication:false,additionalSpending:false};
}
async function main() {
  const context=JSON.parse(fs.readFileSync(0,'utf8'));requireTrue(context.task?.id===TASK && context.task?.payload?.codexImageOnce?.version==='codex-image-once.v1','one_time_test_scope_required');
  requireTrue(context.task.payload.codexImageOnce.executorSha256===sha(fs.readFileSync(__filename)),'reviewed_one_time_executor_changed');
  requireTrue(context.task.payload.codexImageOnce.maximumImages===1 && context.task.payload.codexImageOnce.apiFallbackAuthorized===false && context.task.payload.codexImageOnce.publicationAuthorized===false,'one_image_no_paid_no_publication_scope_required');
  const generatedRoot=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'generated_images');
  if(process.argv.includes('--import-only')) {
    const result=await finishOriginal(DIRECTORY,generatedRoot);save(DIRECTORY,'recovery-result-'+Date.now()+'.json',result);console.log(JSON.stringify({version:'agent-result.v1',status:'prepared',result:JSON.stringify(result),lessons:[]}));return;
  }
  requireTrue(!fs.existsSync(path.join(DIRECTORY,'generation-intent.json')),'original_generation_intent_exists_never_repeat');
  const lock=path.join(ROOT,'.data/agent/codex-image-generation-test.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,task:TASK,startedAt:new Date().toISOString()}),{flag:'wx'});
  try {
    const admission=await preflight();save(DIRECTORY,'runtime-admission.json',{at:new Date().toISOString(),...admission});
    const command="@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'codex.exe' -or $_.Name -eq 'node.exe') -and $_.CommandLine -match 'codex' -and $_.CommandLine -match '(?:^|\\s)exec(?:\\s|$)' }).Count";
    const count=Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',timeout:15000,windowsHide:true}).trim());
    requireTrue(count===0,'conflicting_codex_exec_requires_hold');save(DIRECTORY,'concurrency-admission.json',{at:new Date().toISOString(),activeCodexExecProcesses:count});
    const prompt='$imagegen\nGenerate exactly ONE original PNG with the built-in image generation tool. One tool call, one candidate, no variations or regeneration. Use included ChatGPT/Codex usage only. Never use an API key, paid API, browser, package installation, network command or fallback. If unavailable, report blocked and stop. Do not read unrelated files or invoke shell commands.\nImage: one small original clay wind-up bird beside a single green fern on a wooden platform, warm morning sunlight, charming readable indie-game 3D concept frame, portrait. No text, logos, brand packaging, people, copyrighted characters or interfaces. Deliver one PNG. After the single image completes, stop immediately and return strict JSON {"file":"absolute saved PNG path"}. Do not generate another image to fix anything.';
    await generate(prompt,DIRECTORY);const result=await finishOriginal(DIRECTORY,generatedRoot);save(DIRECTORY,'result.json',{at:new Date().toISOString(),...result});console.log(JSON.stringify({version:'agent-result.v1',status:'prepared',result:JSON.stringify(result),lessons:[]}));
  } finally {if(read(lock).pid===process.pid)fs.unlinkSync(lock);}
}
if(require.main===module) {
  if(process.argv.includes('--help'))console.log('agent-result.v1 structured_output noninteractive; isolated one-time Codex image validation only');
  else main().catch(e=>{const result={at:new Date().toISOString(),status:'blocked',reason:e.message,retryAuthorized:false,publication:false};try{save(DIRECTORY,'blocked-'+Date.now()+'.json',result);}catch{}console.log(JSON.stringify({version:'agent-result.v1',status:'blocked',result:JSON.stringify(result),lessons:[]}));});
}
module.exports={validateAdmission,imageEvents,selectArtifact,probePng,safeEnv,preflight,generate,importImage,finishOriginal,sha};
