import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {AgentStore,stableHash} from '../scripts/agent/store.js';import {GroupTextPublication} from '../scripts/agent/group-text-publication.js';
import {GroupTextExecution,type NativeDriver} from '../scripts/agent/group-text-execution.js';import {NativeHold} from '../scripts/agent/group-native-ui.js';
import {GROUP_BROWSER_REGISTRY,accountBrowserBinding,groupBrowserLease} from '../scripts/agent/group-browser-binding.js';
async function fixture(t:any){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scc-test-runs-group-text-')),file=path.join(dir,'agent.db');let store=new AgentStore(file),now=Date.parse('2026-11-09T08:00:00Z');
 store.setRunnerState(GROUP_BROWSER_REGISTRY,{'page-a':{accountId:'page-a',profilePath:'isolated-profile-a',endpoint:'http://127.0.0.1:9235',pid:1,startedAt:'2026-11-09T08:00:00Z'}});
 const group:any={id:'group-a',url:'https://www.facebook.com/groups/123456/',name:'Isolated AI film Group',identity_type:'page',account_id:'page-a',membership:'member',rules:'Relevant original AI filmmaking discussion; community rules apply.',rules_reviewed_at:'2026-11-09',eligibility:{pagesCanJoin:'yes',participationApproval:'unknown',postModeration:'unknown'},revision:1,archivedAt:null};
 const packets:any={};let calls=0;const client={client:{origin:'http://localhost:3199'},async group(id:string){calls++;assert.equal(id,group.id);return structuredClone(group);},async pageContext(id:string){calls++;assert.equal(id,'page-a');return {account:{graphId:'101'}};},async groupPackage(id:string){calls++;assert(packets[id]);return structuredClone(packets[id]);}};
 const clock=()=>new Date(now),rawLane=()=>new GroupTextPublication(store,client,clock),iso=(offset=0)=>new Date(now+offset).toISOString();
 // Existing domain tests simulate an already verified managed composer. Raw claims are tested separately below.
 const lane=()=>{const l=rawLane(),claim=l.claim.bind(l);l.claim=(raw:any,ready?)=>claim(raw,ready??{destinationId:raw.destinationId,contentHash:(store.getJob(raw.destinationId)!.input as any).contentHash,checkedAt:iso(),profileId:'202',accountId:'page-a',endpoint:accountBrowserBinding(store,'page-a').endpoint,executionId:'isolated-verified-executor'});return l;};
 const obs=()=>({observedAt:iso(),source:'agent_browser_observation' as const,groupUrl:group.url,graphId:'101',profileId:'202',joined:true as const,textComposerObserved:true as const,rulesRead:true as const,moderation:'unknown' as const,notes:'Isolated synthetic native observation, not Facebook proof.'});
 const draft=(id='prepared-a',content='An original question about visual continuity in AI short films.')=>{packets[id]={prepared:{id,kind:'post',status:'prepared',receipt_url:null,content},group:{url:group.url},contextCaptured:true,planChanged:false,sourcePageUnavailable:false,sourcePage:{id:'page-a',externalId:'101'},media:[]};return id;};draft();
 const reg=(await lane().register({commandId:'register-a',groupId:group.id,accountId:'page-a',observation:obs()},true)).registryId;
 const grantInput=(extra:any={})=>({id:'weekly-a',registryId:reg,mode:'weekly',startsAt:iso(),expiresAt:iso(7*86400000),formats:['text'],maxSubmissions:3,maxPer24Hours:1,minimumHours:24,maxLatenessMinutes:10,allowUnknownModeration:true,...extra});
 const grant=async(extra:any={})=>(await lane().authorize(grantInput(extra),true)).id;
 const schedule=async(grantId:string,extra:any={})=>lane().schedule({id:'slot-a',registryId:reg,grantId,preparedId:'prepared-a',scheduledAt:iso(60000),timeZone:'Asia/Bangkok',...extra});
 const outcome=(destinationId:string,state='pending_approval',extra:any={})=>({commandId:'outcome-'+state,destinationId,state,observedAt:iso(),source:'agent_browser_observation',accountId:'page-a',groupUrl:group.url,notes:'Isolated actual-outcome contract fixture, no remote action.',...extra});
 t.after(()=>store.close());return {lane,rawLane,clock,store:()=>store,group,packets,obs,draft,grantInput,grant,schedule,outcome,iso,advance:(ms=60000)=>{now+=ms;},restart:()=>{store.close();store=new AgentStore(file);},calls:()=>calls,reg};
}
test('existing Group registry binds Page/numeric identity and native observations without inventing API capability',async t=>{
 const f=await fixture(t);const s=f.lane().status();assert.equal(s.registries.length,1);assert.equal((s.registries[0] as any).groupNumericId,'123456');assert.equal(s.capabilities.automaticSubmission,false);assert.equal(s.capabilities.runtimeExecutor,'scc_dedicated_chrome_cli');assert.equal(s.capabilities.standaloneClaim,false);assert.equal(s.capabilities.providerApi,false);
 await assert.rejects(()=>f.lane().register({commandId:'no-authority',groupId:'group-a',accountId:'page-a',observation:f.obs()}),/Owner authorization/);
 await assert.rejects(()=>f.lane().register({commandId:'wrong-page',groupId:'group-a',accountId:'page-a',observation:{...f.obs(),graphId:'999'}},true),/Exact joined/);
 f.group.membership='not_member';await assert.rejects(()=>f.grant(),/membership/);
});
test('weekly authorization is separate, bounded, immutable and never renews an expired grant',async t=>{
 const f=await fixture(t);await assert.rejects(()=>f.lane().authorize(f.grantInput()),/Separate explicit/);await assert.rejects(()=>f.grant({allowUnknownModeration:false}),/acknowledge unknown/);await assert.rejects(()=>f.grant({expiresAt:f.iso(8*86400000)}),/seven days/);
 const g=await f.grant();await assert.rejects(()=>f.grant({maxSubmissions:4}),/immutable/);f.advance(8*86400000);assert.throws(()=>f.lane().control({commandId:'renew-no',target:'grant',id:g,action:'resume'},true),/cannot rearm/);assert.equal(f.store().getJob(g)!.inputHash,stableHash(f.store().getJob(g)!.input));
});
test('exact approval binds the prepared text and exact time; scheduling does not submit',async t=>{
 const f=await fixture(t),at=f.iso(60000),hash=stableHash(f.packets['prepared-a'].prepared.content),g=await f.grant({mode:'exact_post',maxSubmissions:1,preparedId:'prepared-a',contentHash:hash,scheduledAt:at});
 await assert.rejects(()=>f.schedule(g,{scheduledAt:f.iso(120000)}),/Exact-post/);f.packets['prepared-a'].prepared.content+=' changed';await assert.rejects(()=>f.schedule(g),/Exact-post/);f.packets['prepared-a'].prepared.content=f.packets['prepared-a'].prepared.content.replace(/ changed$/,'');
 const j=await f.schedule(g);assert.equal(j.state.submissions,0);assert.equal(f.lane().status().destinations[0].admission,'not_due');await assert.rejects(()=>f.lane().claim({destinationId:j.id,observation:f.obs()}),/not_due/);
});
test('due claim is one charged native intent, survives restart/concurrent claims and never touches Page budgets',async t=>{
 const f=await fixture(t);f.store().setRunnerState('config',{fixture:'unchanged Page runner'});const before=f.store().runnerState('config'),g=await f.grant(),j=await f.schedule(g);f.advance();
 const claim=await f.lane().claim({destinationId:j.id,observation:f.obs()});assert.equal(claim.submissionStarted,true);assert.equal(claim.content,f.packets['prepared-a'].prepared.content);f.restart();await assert.rejects(()=>f.lane().claim({destinationId:j.id,observation:f.obs()}),/original_submission_started/);
 assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);assert.deepEqual(f.store().runnerState('config'),before);
});
test('downtime does not flood overdue slots and pause/revoke holds preserve charges',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance(12*60000);assert.equal((await f.lane().claim({destinationId:j.id,observation:f.obs()})).state,'overdue_hold');assert.equal(f.store().getOperation(j.id,'native_submit'),null);assert.throws(()=>f.lane().control({commandId:'resume-missed',target:'destination',id:j.id,action:'resume'},true),/cannot rearm/);
 assert.equal((f.store().getJob(g)!.state.charges as any[]).length,0);
});
test('unknown/mismatched/stale native evidence and changed rules/drafts/media fail closed before submission',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();
 for(const patch of [{graphId:'999'},{groupUrl:'https://www.facebook.com/groups/999/'},{observedAt:f.iso(-360000)}])await assert.rejects(()=>f.lane().claim({destinationId:j.id,observation:{...f.obs(),...patch}}));
 f.group.revision++;await assert.rejects(()=>f.lane().claim({destinationId:j.id,observation:f.obs()}),/context changed/);f.group.revision--;
 f.packets['prepared-a'].media=[{kind:'image',id:'wrong'}];await assert.rejects(()=>f.lane().claim({destinationId:j.id,observation:f.obs()}),/Original Group text only/);assert.equal(f.store().getOperation(j.id,'native_submit'),null);
});
test('pending moderation is charged, not a retry trigger; later actual publication is append-only and exact-Group bound',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();await f.lane().claim({destinationId:j.id,observation:f.obs()});const pending=f.outcome(j.id);f.lane().record(pending);assert.deepEqual(f.lane().record(pending),f.store().getJob(j.id));
 await assert.rejects(()=>f.lane().claim({destinationId:j.id,observation:f.obs()}),/original_pending_approval/);assert.throws(()=>f.lane().record(f.outcome(j.id,'published',{url:'https://www.facebook.com/groups/999/posts/888/'})),/exact Group/);
 f.advance();f.lane().record(f.outcome(j.id,'published',{url:'https://www.facebook.com/groups/123456/posts/888/'}));f.restart();assert.equal((f.store().getJob(j.id)!.state.outcomes as any[]).length,2);assert.equal(f.store().getJob(j.id)!.state.phase,'published');assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);
});
test('uncertain original can reconcile to published but cannot be retried under another key',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();await f.lane().claim({destinationId:j.id,observation:f.obs()});f.lane().record(f.outcome(j.id,'uncertain'));f.restart();await assert.rejects(()=>f.schedule(g,{id:'duplicate',scheduledAt:f.iso(60000)}),/already exists/);
 f.lane().record(f.outcome(j.id,'published',{url:'https://www.facebook.com/groups/123456/posts/999/'}));assert.equal(f.store().getOperation(j.id,'native_submit')!.status,'succeeded');
});
test('registry pause and rolling submission spacing apply across different grants, with no refund on restriction',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();f.lane().control({commandId:'pause',target:'registry',id:f.reg,action:'pause'},true);await assert.rejects(()=>f.lane().claim({destinationId:j.id,observation:f.obs()}),/paused/);f.lane().control({commandId:'resume',target:'registry',id:f.reg,action:'resume'},true);await f.lane().claim({destinationId:j.id,observation:f.obs()});f.lane().record(f.outcome(j.id,'restricted'));
 const second=await f.grant({id:'weekly-b'});f.draft('prepared-b','A different original short-film discussion.');const b=await f.schedule(second,{id:'slot-b',preparedId:'prepared-b',scheduledAt:f.iso(60000)});f.advance();await assert.rejects(()=>f.lane().claim({destinationId:b.id,observation:f.obs()}),/group_submission_limit/);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);
});

test('concurrent native claims charge once and never return a second dispatch packet',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();
 const results=await Promise.allSettled([f.lane().claim({destinationId:j.id,observation:f.obs()}),f.lane().claim({destinationId:j.id,observation:f.obs()})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);assert.equal(f.store().getJob(j.id)!.state.submissions,1);
});

test('unmanaged observations cannot charge a claim without dedicated dispatch readiness',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();
 await assert.rejects(()=>f.rawLane().claim({destinationId:j.id,observation:f.obs()}),/dedicated-browser/);assert.equal(f.store().getJob(j.id)!.state.submissions,0);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,0);
});

function driver(f:any,options:any={}){let clicks=0,verifies=0;const events:string[]=[];
 const native:NativeDriver={async withSession(target,action){events.push('connect');if(options.connectError)throw Error(options.connectError);return action({binding:options.binding??accountBrowserBinding(f.store(),target.accountId),async observe(){events.push('observe');return options.observeOutcome??null;},async prepare(){events.push('prepare');if(options.prepareError)throw new NativeHold(options.prepareError,'Isolated preflight failure');return {observation:f.obs()};},async verify(){events.push('verify');verifies++;if(options.afterClaimError&&verifies===2)throw Error('Isolated changed composer before dispatch');if(options.pauseAfterClaim&&verifies===2)f.store().patchState((f.store().getJob(target.destinationId)!.input as any).grantId,{paused:true});if(options.expireAfterClaim&&verifies===2)f.advance(20*60000);},async submit(){events.push('submit');clicks++;assert.equal(f.store().getJob(target.destinationId)!.state.submissions,1);assert.equal(f.store().getOperation(target.destinationId,'native_ui_dispatch')!.status,'pending');if(options.submitError)throw Error('Isolated response lost');return options.outcome??{state:'pending_approval',notes:'Isolated native moderation fixture'};}});}};
 return {native,events,clicks:()=>clicks};
}

test('transport, login and identity preflight failures make zero claims or charges',async t=>{
 for(const options of [{connectError:'No dedicated transport'},{prepareError:'login_required'},{prepareError:'posting_identity_unverified'}]){
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const d=driver(f,options),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock),result=await e.run(j.id,true);
 assert.equal(result.submissionStarted,false);assert.equal(d.clicks(),0);assert.equal(f.store().getOperation(j.id,'native_submit'),null);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,0);assert.equal(f.store().providerOwner('scc:facebook-group-browser'),null);
 }
});

test('managed preflight verifies a composer without claiming, then shared execution charges and dispatches once',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const d=driver(f),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock);
 assert.equal((await e.run(j.id)).ready,true);assert.equal(f.store().getOperation(j.id,'native_submit'),null);assert.equal(d.clicks(),0);
 const result=await e.run(j.id,true);assert.equal(result.state,'pending_approval');assert.equal(d.clicks(),1);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);
 f.restart();const again=await new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock).run(j.id,true);assert.equal(again.reason,'original_pending_approval');assert.equal(d.clicks(),1);
});

test('lost native submission response remains uncertain and never auto-replays',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const d=driver(f,{submitError:true}),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock);
 assert.equal((await e.run(j.id,true)).state,'uncertain');assert.equal(f.store().getOperation(j.id,'native_ui_dispatch')!.status,'uncertain');await e.run(j.id,true);assert.equal(d.clicks(),1);assert.equal(f.store().getJob(j.id)!.state.submissions,1);
});

test('managed failure after claim but before its dispatch fence conclusively stops without refund or replay',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const d=driver(f,{afterClaimError:true}),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock);
 assert.equal((await e.run(j.id,true)).state,'stopped_before_dispatch');assert.equal(d.clicks(),0);assert.equal(f.store().getOperation(j.id,'native_ui_dispatch'),null);assert.equal(f.store().getOperation(j.id,'native_submit')!.status,'pending');assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);await e.run(j.id,true);assert.equal(d.clicks(),0);
});

test('legacy locked claim is inspectable but cannot dispatch; audited reconciliation retains original charge and intent',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();await f.lane().claim({destinationId:j.id,observation:f.obs()});const original=f.store().getOperation(j.id,'native_submit'),d=driver(f),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock);
 assert.equal((await e.run(j.id,true)).reason,'original_submission_started');assert.deepEqual(d.events,[]);
 const r={commandId:'proven-isolated-stop',destinationId:j.id,source:'complete_executor_trace',evidenceSha256:'a'.repeat(64),notes:'Isolated fixture: complete managed trace shows zero native dispatch calls.'};
 assert.throws(()=>f.rawLane().reconcileBeforeDispatch(r),/owner-backed/);f.rawLane().reconcileBeforeDispatch(r,true);assert.equal(f.store().getJob(j.id)!.state.phase,'stopped_before_dispatch');assert.deepEqual(f.store().getOperation(j.id,'native_submit'),original);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);assert.equal((await e.run(j.id,true)).reason,'original_stopped_before_dispatch');
});

test('published observation survives SCC receipt save failure and cannot trigger another native Post',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const d=driver(f,{outcome:{state:'published',url:'https://www.facebook.com/groups/123456/posts/888/',notes:'Isolated published fixture'}}),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,async()=>{throw Error('Isolated receipt timeout');},f.clock);
 const result=await e.run(j.id,true);assert.equal(result.state,'published');assert.equal(result.receiptState,'scc_receipt_reconciliation_required');assert.equal(f.store().getOperation(j.id,'save_scc_group_receipt')!.status,'uncertain');await e.run(j.id,true);assert.equal(d.clicks(),1);assert.equal(f.store().getJob(j.id)!.state.phase,'published');
});

test('two agents using the shared boundary produce one native submission',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const d=driver(f),a=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock),b=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock);
 const results=await Promise.all([a.run(j.id,true),b.run(j.id,true)]);assert.equal(d.clicks(),1);assert.equal(results.filter(r=>r.reason==='dedicated_browser_busy_or_unresolved').length,1);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);
});

test('owner hold or elapsed exact slot after readiness stops before the native dispatch fence',async t=>{
 for(const options of [{pauseAfterClaim:true},{expireAfterClaim:true}]){const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const d=driver(f,options),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock);assert.equal((await e.run(j.id,true)).state,'stopped_before_dispatch');assert.equal(d.clicks(),0);assert.equal(f.store().getOperation(j.id,'native_ui_dispatch'),null);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);}
});

async function reconciledOriginal(t:any){const f=await fixture(t),g=await f.grant({mode:'exact_post',maxSubmissions:1,preparedId:'prepared-a',contentHash:stableHash(f.packets['prepared-a'].prepared.content),scheduledAt:f.iso(60000)}),j=await f.schedule(g);f.advance();await f.lane().claim({destinationId:j.id,observation:f.obs()});f.advance(20*60000);f.rawLane().reconcileBeforeDispatch({commandId:'owner-confirms-zero-dispatch',destinationId:j.id,source:'owner_confirmed_no_remote_dispatch',evidenceSha256:'b'.repeat(64),notes:'Explicit isolated owner confirmation of no prior Post click.'},true);const authority={commandId:'one-original-new-time',destinationId:j.id,preparedId:'prepared-a',contentHash:stableHash(f.packets['prepared-a'].prepared.content),authorizedAt:f.iso(),expiresAt:f.iso(20*60000),evidenceSha256:'b'.repeat(64),notes:'Explicit isolated one-continuation timing authority for this same original only.'};return {f,g,j,authority};}

test('owner-confirmed original continuation preserves grant, charge and original intent through one shared dispatch',async t=>{
 const {f,g,j,authority}=await reconciledOriginal(t),beforeGrant=f.store().getJob(g)!,beforeOperation=f.store().getOperation(j.id,'native_submit')!,originalStartedAt=f.store().getJob(j.id)!.state.submissionStartedAt;
 await f.rawLane().authorizeContinuation(authority,true);const d=driver(f),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock),result=await e.run(j.id,true);
 assert.equal(result.state,'pending_approval');assert.equal(d.clicks(),1);assert.deepEqual(f.store().getJob(g),beforeGrant);assert.equal(f.store().getOperation(j.id,'native_submit')!.requestHash,beforeOperation.requestHash);assert.equal(f.store().getJob(j.id)!.state.submissions,1);assert.equal(f.store().getJob(j.id)!.state.submissionStartedAt,originalStartedAt);assert.equal(f.store().getJob(j.id)!.state.nativeDispatchAt,f.iso());
 await e.run(j.id,true);assert.equal(d.clicks(),1);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);
});

test('original continuation cannot invent timing authority, change text or extend beyond thirty minutes',async t=>{
 const {f,j,authority}=await reconciledOriginal(t);await assert.rejects(()=>f.rawLane().authorizeContinuation(authority),/Explicit new exact-time/);await assert.rejects(()=>f.rawLane().authorizeContinuation({...authority,contentHash:'f'.repeat(64)},true),/original exact text/);await assert.rejects(()=>f.rawLane().authorizeContinuation({...authority,expiresAt:f.iso(31*60000)},true),/30-minute/);await f.rawLane().authorizeContinuation(authority,true);f.advance(21*60000);const d=driver(f),result=await new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock).run(j.id,true);assert.equal(result.reason,'original_continuation_expired');assert.deepEqual(d.events,[]);assert.equal(f.store().getJob(j.id)!.state.submissions,1);
});

test('one original continuation is immutable and cannot be renewed or authorize a second dispatch',async t=>{
 const {f,j,authority}=await reconciledOriginal(t);await f.rawLane().authorizeContinuation(authority,true);await assert.rejects(()=>f.rawLane().authorizeContinuation({...authority,commandId:'renewed-window'},true),/previous continuation/);const d=driver(f,{submitError:true}),e=new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock);assert.equal((await e.run(j.id,true)).state,'uncertain');await e.run(j.id,true);assert.equal(d.clicks(),1);await assert.rejects(()=>f.rawLane().authorizeContinuation({...authority,commandId:'after-uncertain'},true),/previous continuation|requires proven/);
});

test('read-only visible reconciliation saves a known receipt after uncertainty without another native call',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const options:any={submitError:true},d=driver(f,options);let receiptSaves=0;
 const e=new GroupTextExecution(f.store(),f.rawLane(),d.native,async()=>{receiptSaves++;return {status:'receipt_recorded_unverified'};},f.clock);assert.equal((await e.run(j.id,true)).state,'uncertain');
 options.observeOutcome={state:'published',url:'https://www.facebook.com/groups/123456/posts/888/',notes:'Isolated read-only native receipt observation'};assert.equal((await e.reconcileVisible(j.id)).state,'published');assert.equal(d.clicks(),1);assert.equal(receiptSaves,1);assert.equal((f.store().getJob(j.id)!.state.outcomes as any[]).length,2);assert.equal(f.store().getOperation(j.id,'native_ui_dispatch')!.status,'succeeded');await e.reconcileVisible(j.id);assert.equal(d.clicks(),1);assert.equal(receiptSaves,1);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,1);
});

test('shared executor accepts its registered second-account port rather than requiring 9235',async t=>{
 const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const registry=f.store().runnerState<any>(GROUP_BROWSER_REGISTRY);f.store().setRunnerState(GROUP_BROWSER_REGISTRY,{'page-a':{...registry['page-a'],endpoint:'http://127.0.0.1:9236'}});const d=driver(f),result=await new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock).run(j.id,true);assert.equal(result.state,'pending_approval');assert.equal(d.clicks(),1);assert.equal((f.store().getJob(j.id)!.state.dispatchReadiness as any).endpoint,'http://127.0.0.1:9236');assert.equal(f.store().providerOwner(groupBrowserLease('page-a')),null);
});
test('another account session or wrong reserved port fails before a charged claim',async t=>{
 for(const binding of [{accountId:'page-b',endpoint:'http://127.0.0.1:9235'},{accountId:'page-a',endpoint:'http://127.0.0.1:9236'}]){const f=await fixture(t),g=await f.grant(),j=await f.schedule(g);f.advance();const d=driver(f,{binding}),result=await new GroupTextExecution(f.store(),f.rawLane(),d.native,undefined,f.clock).run(j.id,true);assert.equal(result.submissionStarted,false);assert.equal(d.clicks(),0);assert.equal(f.store().getOperation(j.id,'native_submit'),null);assert.equal((f.store().getJob(g)!.state.charges as any[]).length,0);}
});
