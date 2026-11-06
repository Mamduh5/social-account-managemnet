// Existing Codex built-in image executor, scoped to an exact SCC content plan.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),DB=require('better-sqlite3');
const core=require('./codex-image-once.cjs');
function verifyOriginal(p,taskId){
  const request=JSON.parse(fs.readFileSync(path.join(p.directory,'content-request.json'),'utf8'));
  if(request.taskId!==taskId||request.planHash!==p.planHash||request.index!==p.index||request.prompt!==p.prompt||request.continuity!==p.continuity||JSON.stringify(request.references)!==JSON.stringify(p.references))throw new Error('original_content_request_binding_changed');
  const intent=JSON.parse(fs.readFileSync(path.join(p.directory,'generation-intent.json'),'utf8'));
  if(intent.promptSha256!==request.effectivePromptSha256)throw new Error('original_content_prompt_binding_changed');
}
async function execute(context){
  const task=context.task,p=task?.payload?.codexImage;
  if(p?.version!=='codex-content-image.v1'||!path.isAbsolute(p.stateFile))throw new Error('bounded_image_scope_required');
  const expected=path.join(path.dirname(p.stateFile),'content-images',task.id);
  if(!/^page-image-[a-f0-9]{40}$/.test(task.id)||p.directory!==expected)throw new Error('image_directory_scope_mismatch');
  const db=new DB(p.stateFile,{readonly:true,fileMustExist:true});
  function validate(){
    if(db.pragma('application_id',{simple:true})!==0x53434147)throw new Error('original_agent_store_required');
    const row=db.prepare('SELECT input_hash,input_json,state_json FROM jobs WHERE id=?').get(p.scopeId);if(!row)throw new Error('image_grant_missing');
    const input=JSON.parse(row.input_json),state=JSON.parse(row.state_json),saved=JSON.parse(db.prepare('SELECT snapshot_json FROM agent_work WHERE id=?').get(task.id).snapshot_json),parent=JSON.parse(db.prepare('SELECT snapshot_json FROM agent_work WHERE id=?').get(input.plan.taskId).snapshot_json);
    if(!state.enabled||Date.parse(input.plan.expiresAt)<=Date.now()||state.activeTaskId!==task.id||row.input_hash!==p.planHash||JSON.stringify(saved.payload.codexImage)!==JSON.stringify(p)||input.origin!==p.origin)throw new Error('image_grant_expired_revoked_or_changed');
    const canonical=x=>x&&typeof x==='object'?Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
    if(core.sha(Buffer.from(JSON.stringify(canonical(parent.result))))!==input.resultHash)throw new Error('original_concept_changed');
    const config=JSON.parse(db.prepare("SELECT value_json FROM agent_runner_state WHERE key='config'").get().value_json);if(!config.enabled||config.paused)throw new Error('runner_paused_or_disabled');
    return input;
  }
  let lock;try{
    validate();fs.mkdirSync(p.directory,{recursive:true});
    const root=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'generated_images');
    if(fs.existsSync(path.join(p.directory,'generation-intent.json'))){
      // A restart can finish the original artifact; it can never submit this task again.
      verifyOriginal(p,task.id);
      const r=await core.finishOriginal(p.directory,root,fetch,p.origin+'/api/publishing/images');return {...r,requestId:task.id,directory:p.directory,references:p.references,recoveryOnly:true};
    }
    lock=path.join(path.dirname(p.stateFile),'codex-content-image.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,taskId:task.id,at:new Date().toISOString()}),{flag:'wx'});
    const admission=await core.preflight(p.directory);fs.writeFileSync(path.join(p.directory,'runtime-admission.json'),JSON.stringify({at:new Date().toISOString(),...admission}),{flag:'wx'});
    const command="@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'codex.exe' -or $_.Name -eq 'node.exe') -and $_.CommandLine -match 'codex' -and $_.CommandLine -match '(?:^|\\s)exec(?:\\s|$)' }).Count";
    if(Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',timeout:15000,windowsHide:true}).trim())!==0)throw new Error('conflicting_codex_request');
    const references=p.references.map(r=>{if(core.probePng(r.file).sha256!==r.sha256)throw new Error('reference_hash_changed');return r.file;});
    if(references.length){const help=execFileSync(process.execPath,['C:\\Program Files\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js','exec','--help'],{encoding:'utf8',env:core.safeEnv(),timeout:15000,windowsHide:true});if(!help.includes('--image'))throw new Error('reference_image_capability_unavailable');}
    const prompt='$imagegen\nUse case: stylized-concept\nGenerate exactly ONE original PNG using the built-in image tool, one call, no variations or regeneration. Included ChatGPT/Codex authentication only; no API key, paid API, browser, installation, shell commands, searches or fallback. If unavailable or quota/security blocked, stop. Output strict JSON {"file":"absolute saved PNG path"} after completion.\nAsset type: Facebook image post candidate, owner creative review required.\nContinuity: '+p.continuity+'\nPrimary request: '+p.prompt+'\nRequested framing/aspect ratio: '+p.aspectRatio+'\n'+(references.length?'Input image 1: reference image for the same scene, subjects, objects and visual style. Preserve their identity and geometry; change only the requested action. Do not merely copy the input.\n':'')+'No brand logos, official artwork, actor likenesses, copied composition, decorative watermarks or extra unrequested text. Never generate another candidate to repair a defect.';
    const request={taskId:task.id,planHash:p.planHash,index:p.index,prompt:p.prompt,continuity:p.continuity,references:p.references,effectivePromptSha256:core.sha(Buffer.from(prompt))};
    const requestFile=path.join(p.directory,'content-request.json');if(fs.existsSync(requestFile)){if(JSON.stringify(JSON.parse(fs.readFileSync(requestFile)))!==JSON.stringify(request))throw new Error('saved_content_request_changed');}else fs.writeFileSync(requestFile,JSON.stringify(request),{flag:'wx'});
    validate();await core.generate(prompt,p.directory,references);verifyOriginal(p,task.id);const r=await core.finishOriginal(p.directory,root,fetch,p.origin+'/api/publishing/images');
    const result={...r,requestId:task.id,directory:p.directory,references:p.references,referenceCapability:references.length?'cli_image_attachment_supplied':'not_needed',consistencyAcceptance:'needs_owner_review'};
    fs.writeFileSync(path.join(p.directory,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
  }finally{db.close();if(lock&&fs.existsSync(lock)&&JSON.parse(fs.readFileSync(lock)).pid===process.pid)fs.unlinkSync(lock);}
}
if(require.main===module){
  if(process.argv.includes('--help'))console.log('agent-result.v1 structured_output noninteractive; exact scoped included Codex image task only');
  else{let raw='';process.stdin.on('data',b=>{raw+=b;if(Buffer.byteLength(raw)>65536)process.exit(2);});process.stdin.on('end',async()=>{let context;try{context=JSON.parse(raw);const result=await execute(context),u=result.usage;const usage=u&&Number.isSafeInteger(u.input_tokens)&&Number.isSafeInteger(u.output_tokens)?{tokens:u.input_tokens+u.output_tokens,source:'codex.turn.completed.input_plus_output'}:null;console.log(JSON.stringify({version:'agent-result.v1',status:'prepared',result:JSON.stringify(result),lessons:[],usage}));}catch(e){const p=context?.task?.payload?.codexImage;let generated=false;try{generated=!!p?.directory&&fs.existsSync(path.join(p.directory,'generation-intent.json'));}catch{}console.log(JSON.stringify({version:'agent-result.v1',status:'blocked',result:JSON.stringify({error:e.message,originalProtected:generated,retryAuthorized:false}),lessons:[],usage:generated?null:{tokens:0,source:'no_generation_started'}}));}});}
}
module.exports={execute,verifyOriginal};
