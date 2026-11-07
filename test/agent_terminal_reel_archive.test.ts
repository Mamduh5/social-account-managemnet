import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {fixture,rai,dev,world,targets} from './helpers/page-reel-fixture.js';
import {PagePublicationPolicies,pagePublicationPolicySchema} from '../scripts/agent/page-publication-policy.js';import {OwnerVideoReviews} from '../scripts/agent/video-review.js';import {GeminiProduction} from '../scripts/agent/production.js';import {automaticPageBinding,machineScope,currentMachineAcceptance,pageMachineResult} from '../scripts/agent/page-reel-autonomy.js';import {stableHash} from '../scripts/agent/store.js';import {AgentWorkQueue} from '../scripts/agent/work-queue.js';import {maintainPageSources,adoptPageSources,pageReelSourceResult} from '../scripts/agent/page-reel-sources.js';import {publicationCadence} from '../scripts/agent/publication-streams.js';import {CommandExecutors} from '../scripts/agent/executors.js';import {AgentRunner} from '../scripts/agent/runner.js';import {configureRunner} from '../scripts/agent/runner-config.js';
async function grant(f:any,e:any){f.fact(e);await f.coord().authorizeStanding({version:'gemini-page-standing.v1',id:'standing-'+e.graphId,geminiAccountId:'gemini_web-main',pageAccountId:e.accountId,pageGraphId:e.graphId,expiresAt:null,maxPer24Hours:2,reviewMode:'machine_with_owner_override'},true);const p=new PagePublicationPolicies(f.store,f.scc,targets,f.clock);await p.authorize({version:'page-publication-policy.v1',id:'auto-'+e.graphId,accountId:e.accountId,graphId:e.graphId,contentType:'reel',expiresAt:null,maxPer24Hours:2,minimumHours:6,preferredHours:12,targetPer24Hours:2,maxTotal:null,reviewMode:'machine_with_owner_override'},true);return p;}
async function candidate(f:any,e:any,title='initial',overrides:any={}){const item=f.lane(e).enqueue({...f.concept(e,title),...overrides});await f.lane(e).tick();f.advance();await f.lane(e).tick();f.complete(String(f.store.getJob(item.id).state.projectId));f.advance();await f.lane(e).tick();for(let i=0;i<3;i++)assert.equal((await f.lane(e).processBacklog()).actions,1);return f.store.getJob(item.id);}
function reviews(f:any){return new OwnerVideoReviews(f.store,f.scc,targets,f.dir,f.qa,f.clock,()=>10*1024**3);}
function finish(f:any,id:string,result:any,extra:any={}){const work=new AgentWorkQueue(f.store,f.clock),claim=work.claim(id,{owner:'fixture-model',commandId:randomUUID()}).task,raw=JSON.stringify(result),envelope={version:'agent-result.v1',status:'prepared',result:raw,lessons:[]};work.save({id,owner:claim.owner!,claimToken:claim.claimToken!,revision:claim.revision,commandId:randomUUID(),status:'prepared',result:raw});f.store.saveRunnerSession({id:randomUUID(),taskId:id,executorId:'codex_page_reels',adapter:'codex',status:'completed',claim,startedAt:f.clock().toISOString(),finishedAt:f.clock().toISOString(),deadlineAt:new Date(+f.clock()+60000).toISOString(),usage:{tokens:100,source:'ISOLATED_FIXTURE'},reservedTokens:0,result:envelope,mayBeRunning:false,pid:null,...extra});}
async function accept(f:any,item:any,override:any={}){const prepared=await reviews(f).prepareMachineReview(item.id),task=f.store.getWork(prepared.taskId!),result={version:'page-reel-machine-review.v1',scopeHash:task.payload.pageReelReview.scopeHash,decision:'accept',conceptMatch:true,editorialMatch:true,brandingCorrect:true,readable:true,safeOriginalDepiction:true,supportedClaimsOnly:true,unexpectedTextOrSpeech:'none_visible_no_speech_requested',issues:[],notes:'Isolated frame-review result, not a real model observation.',limitations:'Fixture only. No perceptual listening or owner acceptance.',...override};finish(f,task.id,result);return reviews(f).machineAccept(item.id,task.id);}
import {terminalArchiveBlock} from '../scripts/agent/terminal-reel-archive.js';
import {productionInventory} from '../scripts/agent/production-inventory.js';
async function held(t:any){const f=await fixture(t);await grant(f,dev);const j=await candidate(f,dev,'terminal');await accept(f,j,{decision:'hold',conceptMatch:false,failureKinds:['creative_mismatch'],issues:['Visible consequence missing']});return {f,j:f.store.getJob(j.id)!};}

test('terminal archive is atomic, durable and idempotent; exact failed media/draft/review/charges remain owner-visible read-only',async t=>{
 const {f,j}=await held(t),before=f.root().status().inventory,charges=structuredClone(f.lane(dev).policy()!.state.dispatches),draft=structuredClone(f.drafts.get(String(j.state.candidateDraftId))),result=f.store.getWork(String(j.state.machineReviewTaskId))!.result,hash=stableHash(j.state.media),models=f.store.runnerSessions().length;
 assert.equal(terminalArchiveBlock(f.store,j,+f.clock()),null);assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,1);
 const s=f.store.getJob(j.id)!.state,after=f.root().status().inventory;assert.equal(s.phase,'archived');assert.equal(after.items,before.items-1);assert.equal(after.bytes,before.bytes);assert.equal(after.archivedItems,1);assert(after.archivedBytes>0);
 assert.equal(stableHash(s.media),hash);assert.deepEqual(s.machineReviewEvaluation,j.state.machineReviewEvaluation);assert.deepEqual(s.original,j.state.original);assert.deepEqual(f.drafts.get(String(s.candidateDraftId)),draft);assert.equal(f.store.getWork(String(s.machineReviewTaskId))!.result,result);assert.deepEqual(f.lane(dev).policy()!.state.dispatches,charges);
 f.restart();assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,0);assert.equal(f.store.jobOperations(j.id).filter((x:any)=>x.step==='terminal_archive_v1').length,1);assert.equal(f.store.getOperation(j.id,'terminal_archive_v1')!.status,'succeeded');assert.equal(f.store.listKnowledge({resourceId:j.id}).filter((x:any)=>x.source==='terminal_machine_quality_archive').length,1);assert.equal(f.store.runnerSessions().length,models);
 const row=(await reviews(f).list()).items.find((x:any)=>x.id===j.id)!;assert.equal(row.status,'archived');assert(row.archive);assert.equal(row.canApprove,false);assert.equal(row.canEdit,false);assert(row.history.some((x:any)=>x.source==='terminal_machine_quality_archive'||x.evidence?.version==='terminal-reel-archive.v1'));
 await assert.rejects(()=>reviews(f).decide({commandId:'no-unarchive',itemId:j.id,binding:row.binding,decision:'approve',watched:true,listened:true,reviewedVariant:true,factsReviewed:true},true),/read-only/);
 await assert.rejects(()=>reviews(f).edit({commandId:'no-edit-archive',itemId:j.id,binding:row.binding,caption:'change',hashtags:'',variantId:row.variant.id},true),/read-only/);
 assert.equal((await reviews(f).prepareMachineReview(j.id)).state,'terminal_candidate_archived');assert.equal((await reviews(f).machineAccept(j.id,String(s.machineReviewTaskId))).state,'terminal_candidate_archived');
 assert.equal((await new PagePublicationPolicies(f.store,f.scc,targets,f.clock).tick()).actions,0);assert.equal(f.history.length,0);
});

test('only completed exact machine holds qualify: World, owner decisions, accepted work, uncertainty, superseded tasks and source changes fail closed',async t=>{
 const {f,j}=await held(t),original=structuredClone(j.state),task=f.store.getWork(String(j.state.machineReviewTaskId))!;
 const patches=[{phase:'ready'},{phase:'generating'},{ownerReview:{decision:'reject'}},{qa:{source:'owner'}},{machineAcceptance:{}},{backlogHold:'needs_changes'},{publicationIntent:{}},{publicationPostId:'original-post'},{lastObservation:{project:{state:'completed'},session:{unresolved:true}}},{machineReviewEvaluation:{...(original.machineReviewEvaluation as any),resultHash:'0'.repeat(64)}},{machineReviewTaskId:'different'},{technicalQa:{...(original.technicalQa as any),fullDecode:false}}];
 for(const p of patches){f.store.updateState(j.id,{...original,...p});assert(terminalArchiveBlock(f.store,f.store.getJob(j.id)!,+f.clock()),JSON.stringify(p));}f.store.updateState(j.id,original);
 f.store.claimOperation(j.id,'uncertain_upload',{original:true});assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,0);f.store.finishOperation(j.id,'uncertain_upload','uncertain',{});assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,0);f.store.finishOperation(j.id,'uncertain_upload','succeeded',{});
 const claim=f.store.reserveProvider('gemini_web:gemini_web-main',j.id);assert(claim);assert(terminalArchiveBlock(f.store,f.store.getJob(j.id)!,+f.clock()));f.store.releaseProvider('gemini_web:gemini_web-main',j.id);
 const d=f.drafts.get(String(original.candidateDraftId));d.revision++;assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,0);d.revision--;d.approvedRevision=d.revision;assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,0);d.approvedRevision=null;
 const other={...j,input:{...(j.input as any),concept:{...(j.input as any).concept,version:'gemini-concept.v1',accountId:world.accountId}}};assert.equal(terminalArchiveBlock(f.store,other,+f.clock()),'outside_automatic_page_scope');assert.equal(f.store.getWork(task.id)!.result,task.result);
});

test('active native submissions/observations and changed original identities prevent archival; no import, model or provider POST',async t=>{
 const {f,j}=await held(t),status=f.pipeline.productionStatus,inspect=f.pipeline.inspect,counts=f.counts();
 for(const patch of [{activeRunId:'protected'},{unresolved:true},{observationLocked:true},{nativeEnabled:true},{boundedRequests:[{in_progress:true}]}]){f.pipeline.productionStatus=async()=>({...await status(),...patch});assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).state,'archive_original_protected');}f.pipeline.productionStatus=status;
 const obs=await inspect(String(j.state.projectId));for(const patch of [{original:{...obs.original,runId:'wrong'}},{project:{state:'generating'}},{session:{active:true}},{recovery:{required:true}}]){f.pipeline.inspect=async()=>({...obs,...patch});assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,0);}f.pipeline.inspect=inspect;assert.deepEqual(f.counts(),counts);assert.equal(f.store.getJob(j.id)!.state.phase,'needs_review');
});

test('retained archived bytes enforce storage independently of slots; full capacity resumes only after safe archival, never by refunding',async t=>{
 const {f,j}=await held(t),config=f.root().config();f.store.setRunnerState('production.config',{...config,maxBacklogItems:1});assert.equal(f.root().status().inventory.full,true);assert.equal((await f.coord().processBacklog()).state,'terminal_candidates_archived');assert.equal(f.root().status().inventory.items,0);assert.equal(f.root().status().inventory.full,false);
 const a=f.store.getJob(j.id)!;const bytes=productionInventory([a],{...config,maxBacklogBytes:1}).bytes;assert(bytes>1);assert.equal(productionInventory([a],{...config,maxBacklogBytes:1}).full,true);
 const spent=structuredClone(f.lane(dev).policy()!.state.dispatches);f.advance(24*3600000);const next=f.lane(dev).enqueue(f.concept(dev,'new-original'));assert.notEqual(next.id,j.id);assert.equal(f.store.getJob(j.id)!.state.phase,'archived');assert.deepEqual(f.lane(dev).policy()!.state.dispatches,spent);assert.equal(f.root().status().inventory.items,1);
});

test('archive transaction rollback leaves no partial receipt or released slot after interruption; restart safely retries the same original',async t=>{
 const {f,j}=await held(t),record=f.store.recordKnowledge.bind(f.store);f.store.recordKnowledge=(r:any)=>{if(r.source==='terminal_machine_quality_archive')throw new Error('fixture interruption');return record(r);};assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,0);assert.equal(f.store.getOperation(j.id,'terminal_archive_v1'),null);assert.equal(f.store.getJob(j.id)!.state.phase,'needs_review');f.restart();assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,1);assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,0);
});

test('a pending alternate review and recovery-required model session block archival; the completed original is not re-invoked',async t=>{
 const {f,j}=await held(t),work=new AgentWorkQueue(f.store,f.clock),id='alternate-review';
 work.add({id,kind:'review_video',accountId:dev.accountId,title:'Pending exact review fixture',payload:{pageReelReview:{itemId:j.id}}});
 assert.equal(terminalArchiveBlock(f.store,j,+f.clock()),'protected_review_task');
 const w=f.store.getWork(id)!;f.store.saveWork({...w,status:'cancelled',revision:w.revision+1});
 const original=f.store.runnerSessions({taskId:String(j.state.machineReviewTaskId)})[0];f.store.saveRunnerSession({...original,status:'recovery_required'});
 assert.equal(terminalArchiveBlock(f.store,j,+f.clock()),'protected_review_task');f.store.saveRunnerSession(original);
 assert.equal((await reviews(f).archiveTerminalHolds(f.pipeline)).actions,1);
});

test('ordinary accepted publication still advances beside an archived hold; even an accidental phase change cannot publish the archive',async t=>{
 const {f,j}=await held(t);await reviews(f).archiveTerminalHolds(f.pipeline);
 const next=await candidate(f,dev,'genuinely-different-candidate');assert.equal((await accept(f,next)).state,'machine_reel_ready');
 f.store.patchState(j.id,{phase:'ready'});assert.equal((await reviews(f).prepareMachineReview(j.id)).state,'terminal_candidate_archived');
 const pub=new PagePublicationPolicies(f.store,f.scc,targets,f.clock);await pub.tick();await pub.tick();
 assert.equal(f.history.length,1);assert.equal(f.store.getOperation(j.id,'standing_publication_queue'),null);assert.equal(f.store.getJob(next.id)!.state.phase,'published');
 assert.equal((await pub.streams(dev.accountId)).find(s=>s.contentType==='reel')!.confirmed24h,1);
});
