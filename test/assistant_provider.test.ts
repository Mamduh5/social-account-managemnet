import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {dataDir} from '../server/src/db/database.js';
import {GeminiFreeAssistantProvider,configuredAssistantProvider,AssistantProviderError} from '../server/src/services/assistant-provider.js';
import {provisionalVoice,assistantRules,type AssistantRequest} from '../server/src/domain/content-assistant.js';
assert.ok(process.env.SCC_DATA_DIR&&/test-runs/.test(dataDir),'Isolated test directory required');
let sequence=0;
function setup(maxRequests=6){const directory=path.join(dataDir,'provider-'+(++sequence));fs.mkdirSync(directory,{recursive:true});const sourceEnvFile=path.join(directory,'approved.env');fs.writeFileSync(sourceEnvFile,'GEMINI_AUTOPILOT_PLANNER_PROVIDER=gemini_api_free\nGEMINI_PLANNER_API_KEY_ENV=GEMINI_API_KEY_FREE2\nGEMINI_PLANNER_MODEL=gemini-3.5-flash-lite\nGEMINI_PLANNER_FREE_TIER_VERIFIED=true\nGEMINI_PLANNER_PROJECT_ID=synthetic-project\nGEMINI_API_KEY_FREE2=secret-fixture-key\n');const config={provider:'gemini_api_free' as const,sourceEnvFile,sourceEnvSha256:createHash('sha256').update(fs.readFileSync(sourceEnvFile)).digest('hex'),keyEnv:'GEMINI_API_KEY_FREE2' as const,model:'gemini-3.5-flash-lite' as const,maxRequests,ledgerPath:path.join(directory,'ledger.json')};return {config,directory};}
const request:AssistantRequest={kind:'post',language:'Thai',voice:provisionalVoice,ownerIdea:'วันพักผ่อนกับต้นไม้',rules:assistantRules};
function success(text='สวัสดีวันสบาย 🌿'){return new Response(JSON.stringify({modelVersion:'gemini-3.5-flash-lite',responseId:'synthetic-response',candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({text,flags:[]})}]}}],usageMetadata:{promptTokenCount:120,candidatesTokenCount:20,totalTokenCount:140}}),{status:200});}
test('Default is unavailable; fixture and real configuration cannot silently replace each other',()=>{
 assert.equal(configuredAssistantProvider({}).available,false);assert.equal(configuredAssistantProvider({SCC_ASSISTANT_FIXTURES:'true'}).available,false);
 assert.equal(configuredAssistantProvider({SCC_ISOLATED_TEST:'true',SCC_ASSISTANT_FIXTURES:'true'}).fixture,true);
 assert.equal(configuredAssistantProvider({SCC_ASSISTANT_PROVIDER_CONFIG:'missing',SCC_ASSISTANT_FIXTURES:'true',SCC_ISOLATED_TEST:'true'}).available,false);
});
test('Approved configuration requires exact free provider, key selector, model, source fingerprint and billing attestation',()=>{
 for(const change of [{provider:'paid'}, {model:'gemini-paid'}, {keyEnv:'GEMINI_API_KEY'}, {sourceEnvSha256:'wrong'}, {maxRequests:99}]){const {config}=setup();assert.throws(()=>new GeminiFreeAssistantProvider({...config,...change} as any));}
 const {config}=setup();fs.appendFileSync(config.sourceEnvFile,'GEMINI_PLANNER_FREE_TIER_VERIFIED=false\n');config.sourceEnvSha256=createHash('sha256').update(fs.readFileSync(config.sourceEnvFile)).digest('hex');assert.throws(()=>new GeminiFreeAssistantProvider(config),/configuration/);
});
test('One real-route request uses exact endpoint, text JSON, no tools/retry/redirect and records safe model/usage identity',async()=>{
 const {config}=setup();let calls=0;const provider=new GeminiFreeAssistantProvider(config,async(input,init)=>{calls++;assert.equal(input,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');assert.equal(init?.redirect,'error');assert.equal((init?.headers as any)['x-goog-api-key'],'secret-fixture-key');const body=JSON.parse(init?.body as string);assert.equal(body.tools,undefined);assert.equal(body.cachedContent,undefined);assert.doesNotMatch(init?.body as string,/secret-fixture-key/);assert.equal(body.generationConfig.responseMimeType,'application/json');return success();});
 const result=await provider.generate(request);assert.equal(calls,1);assert.equal(result.text,'สวัสดีวันสบาย 🌿');assert.equal(result.generation.model,'gemini-3.5-flash-lite');assert.equal(result.generation.totalTokens,140);assert.equal(provider.fixture,false);assert.equal(provider.canInspectMedia,false);assert.doesNotMatch(fs.readFileSync(config.ledgerPath,'utf8'),/secret-fixture-key|วันพักผ่อน/);
});
test('Source configuration changes fail before transport and never rotate to another key',async()=>{
 const {config}=setup();let calls=0;const provider=new GeminiFreeAssistantProvider(config,async()=>{calls++;return success();});fs.appendFileSync(config.sourceEnvFile,'# changed\n');assert.equal(provider.available,false);await assert.rejects(()=>provider.generate(request),/configuration/);assert.equal(calls,0);
});
test('Quota rejection is explicit, consumes one reserved attempt, never fabricates output and never retries',async()=>{
 const {config}=setup();let calls=0;const provider=new GeminiFreeAssistantProvider(config,async()=>{calls++;return new Response('access_token=PRIVATE_PROVIDER_BODY',{status:429});});await assert.rejects(()=>provider.generate(request),(error:any)=>{assert.ok(error instanceof AssistantProviderError);assert.equal(error.httpStatus,429);assert.match(error.message,/quota or rate/);assert.doesNotMatch(error.message,/PRIVATE/);return true;});assert.equal(calls,1);const attempts=JSON.parse(fs.readFileSync(config.ledgerPath,'utf8'));assert.equal(attempts[0].outcome,'rate_limited');assert.doesNotMatch(JSON.stringify(attempts),/PRIVATE/);
});
test('Transport failures hide credential-like diagnostics and do not retry',async()=>{
 const {config}=setup();let calls=0;const provider=new GeminiFreeAssistantProvider(config,async()=>{calls++;throw new Error('https://example/?key=PRIVATE_KEY');});await assert.rejects(()=>provider.generate(request),(e:any)=>{assert.doesNotMatch(e.message,/PRIVATE_KEY/);return true;});assert.equal(calls,1);
});
test('Blocked, truncated, action, malformed and wrong-model results never produce successful drafts',async()=>{
 const envelopes=[{candidates:[]},{candidates:[{finishReason:'MAX_TOKENS'}]},{candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'publish'}}]}}]},{modelVersion:'other-model',candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]},{candidates:[{finishReason:'STOP',content:{parts:[{text:'not-json'}]}}]},{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({text:''})}]}}]}];
 for(const body of envelopes){const {config}=setup();const provider=new GeminiFreeAssistantProvider(config,async()=>new Response(JSON.stringify(body),{status:200}));await assert.rejects(()=>provider.generate(request));assert.equal(JSON.parse(fs.readFileSync(config.ledgerPath,'utf8'))[0].state,'failed');}
});
test('Explicit request budget persists across instances and includes failed attempts',async()=>{
 const {config}=setup(1);let calls=0;const transport=async()=>{calls++;return new Response('',{status:503});};const first=new GeminiFreeAssistantProvider(config,transport);await assert.rejects(()=>first.generate(request));const second=new GeminiFreeAssistantProvider(config,transport);assert.equal(second.available,false);assert.match(second.unavailableReason||'',/limit/);await assert.rejects(()=>second.generate(request),/limit/);assert.equal(calls,1);
});
test('Concurrent requests reserve a finite budget before inference',async()=>{
 const {config}=setup(1);let calls=0;const provider=new GeminiFreeAssistantProvider(config,async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return success();});const result=await Promise.allSettled([provider.generate(request),provider.generate(request)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
});
test('Configuration file BOM is accepted without exposing credential paths in provider status',()=>{
 const {config,directory}=setup();const filename=path.join(directory,'config.json');fs.writeFileSync(filename,'\uFEFF'+JSON.stringify(config));const provider=configuredAssistantProvider({SCC_ASSISTANT_PROVIDER_CONFIG:filename});assert.equal(provider.available,true);assert.equal(provider.model,'gemini-3.5-flash-lite');assert.doesNotMatch(provider.configurationNotice||'',/secret-fixture-key|approved.env/);
});

test('Caption task isolates the supplied description from unrelated approved facts and has a specific grounding instruction',async()=>{const {config}=setup();const provider=new GeminiFreeAssistantProvider(config,async(_input,init)=>{const body=JSON.parse(init?.body as string);assert.match(body.systemInstruction.parts[0].text,/Mention at least two concrete details/);const data=JSON.parse(body.contents[0].parts[0].text.replace(/^INPUT_JSON\n/,''));assert.equal(data.rules,undefined);assert.deepEqual(data.voice.approvedFacts,[]);assert.deepEqual(data.voice.faqAnswers,[]);assert.equal(data.suppliedMediaDescription,'Orange pot, green leaves, white table');return success('กระถางสีส้มและใบไม้สีเขียว');});const result=await provider.generate({...request,kind:'caption',voice:{...provisionalVoice,approvedFacts:['Shop hours10–18'],faqAnswers:['unrelated fact']},suppliedMediaDescription:'Orange pot, green leaves, white table'});assert.equal(result.generation.promptVersion,'draft-kind-v2');});
