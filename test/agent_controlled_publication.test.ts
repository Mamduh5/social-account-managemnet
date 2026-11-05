import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {AgentStore,stableHash} from '../scripts/agent/store.js';
import {PagePublicationPolicies} from '../scripts/agent/page-publication-policy.js';
import {SccAdapter,draftFingerprint} from '../scripts/agent/scc.js';
import {publicationCopyMatches,relevantReelTags} from '../scripts/agent/publication-streams.js';
import {ApiError} from '../scripts/agent/http.js';

function fixture(t:any){
  const dir=mkdtempSync(path.join(tmpdir(),'scc-controlled-pub-')),file=path.join(dir,'agent.db');let store=new AgentStore(file),now=new Date('2026-11-05T06:00:00Z');
  const drafts=new Map<string,any>(),media=new Map<string,any>(),rows:any[]=[],calls={edits:0,approvals:0,queues:0,hashes:0};let loseEdit=false,loseQueue=false,failHash=false;
  const scc={pageContext:async()=>({account:{id:'page',name:'Verified Page',graphId:'123'}}),history:async()=>({items:structuredClone(rows),hasMore:false}),getDraft:async(id:string)=>structuredClone(drafts.get(id)),media:async(id:string)=>structuredClone(media.get(id)),
    editReviewDraft:async(id:string,rev:number,caption:string,hashtags:string,variantId:string)=>{calls.edits++;const d=drafts.get(id);assert.equal(d.revision,rev);Object.assign(d,{revision:rev+1,status:'draft',approvedRevision:null});Object.assign(d.destinations[0],{caption,hashtags,selectedVariantId:variantId});if(loseEdit)throw new ApiError(null,'lost_copy_response',true);return structuredClone(d);},
    verifyPublicationMedia:async()=>{calls.hashes++;if(failHash)throw new Error('Source hash differs');return {master:{bytes:1024},variant:{bytes:2048}};},
    approve:async(id:string,input:any)=>{calls.approvals++;const d=drafts.get(id);assert.equal(input.revision,d.revision);assert.equal(input.payloadHash,draftFingerprint(d));d.status='approved';d.approvedRevision=d.revision;return {draft:d};},
    queue:async(id:string,input:any)=>{calls.queues++;const d=drafts.get(id);assert.equal(d.approvedRevision,input.revision);d.status='queued';d.queuedPostId='post-'+id;rows.push({id:'destination-'+id,post_id:d.queuedPostId,account_id:'page',content_type:'reel',status:'uploading'});if(loseQueue)throw new ApiError(null,'lost_queue_response',true);return {postId:d.queuedPostId};},
  } as unknown as SccAdapter;
  const controller=()=>new PagePublicationPolicies(store,scc,{scc:'http://localhost:3001',pipeline:'http://localhost:8080'},()=>now);
  const add=(n:number)=>{const id='item-'+n,sha=n.toString(16).padStart(64,'0'),variantSha=(n+20).toString(16).padStart(64,'0'),d={id:'draft-'+n,revision:1,title:'Original story '+n,contentType:'reel',videoId:'video-'+n,scheduledAt:null,status:'draft',approvedRevision:null,queuedPostId:null,destinations:[{accountId:'page',caption:'A tiny object helps. AI-generated fiction.',hashtags:'',attachments:[],applyBranding:false,selectedVariantId:'variant-'+n}]};drafts.set(d.id,d);media.set(d.videoId,{provenance:{sha256:sha},variants:[{id:'variant-'+n,sha256:variantSha}]});store.createJob(id,{production:true,concept:{accountId:'page',title:d.title,category:'living_objects',idea:'An original tiny sponge catches a spill.',languageStrategy:{captionLanguages:['en']}}});const ownerReview={decision:'approve',watched:true,listened:true,scope:{draftRevision:1,draftHash:draftFingerprint(d),sha256:sha,variantSha256:variantSha}};store.patchState(id,{phase:'ready',videoId:d.videoId,variantId:'variant-'+n,variantSha256:variantSha,draftId:d.id,draftHash:draftFingerprint(d),media:{technical:true,sha256:sha},qa:{decision:'accepted',visual:'pass',audio:'pass',sha256:sha,caption:d.destinations[0].caption,hashtags:''},ownerReview,variantReview:{visual:'pass',sha256:variantSha,masterAudioHash:'same',variantAudioHash:'same'}});store.setRunnerState('production.items',[...(store.runnerState<string[]>('production.items')??[]),id]);return id;};
  const grant=()=>controller().authorize({version:'page-publication-policy.v1',id:'controlled',accountId:'page',graphId:'123',contentType:'reel',targetPer24Hours:3,copyHashtags:true,timeZone:'Asia/Bangkok',expiresAt:null,maxPer24Hours:5,minimumHours:3,maxTotal:null},true);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {get store(){return store;},controller,add,grant,rows,drafts,calls,now:()=>now,advance:(ms:number)=>{now=new Date(now.getTime()+ms);},confirm:(n:number)=>{Object.assign(rows.find(r=>r.post_id==='post-draft-'+n),{status:'published',confirmation_source:'api',remote_post_id:'remote-'+n,remote_post_url:'https://www.facebook.com/reel/'+n+'/',published_at:now.toISOString()});},restart:()=>{store.close();store=new AgentStore(file);},loseEdit:()=>{loseEdit=true;},loseQueue:()=>{loseQueue=true;},failHash:()=>{failHash=true;}};
}

test('five confirmed Reels, separate formats, three-hour spacing and next rolling-day eligibility without bursts',async t=>{
 const f=fixture(t);for(let n=1;n<=6;n++)f.add(n);await f.grant();
 for(let n=0;n<8;n++)f.rows.push({account_id:'page',content_type:n%2?'text':'image',status:'published',published_at:f.now().toISOString()});
 for(let n=1;n<=5;n++){assert.equal((await f.controller().tick()).state,'publication_queued');f.confirm(n);assert.equal((await f.controller().tick()).state,'publication_cadence_wait');if(n<5)f.advance(3*3600000);}
 assert.equal(f.calls.queues,5);f.advance(3*3600000);const held=await f.controller().tick();assert.equal(held.state,'publication_cadence_wait');assert.equal(held.confirmed24h,5);assert.equal(held.nextEligibleAt,'2026-11-06T06:00:00.000Z');
 f.advance(9*3600000);assert.equal((await f.controller().tick()).state,'publication_queued');assert.equal(f.calls.queues,6);
 const streams=await f.controller().streams('page');assert.equal(streams.find(s=>s.contentType==='text')!.enabled,false);assert.equal(streams.find(s=>s.contentType==='image')!.maxPer24Hours,null);
});
test('hash-preserving hashtag revision uses separate copy approval and retains exact owner audiovisual history across restart',async t=>{
 const f=fixture(t);f.add(1);const owner=structuredClone(f.store.getJob('item-1')!.state.ownerReview),qa=structuredClone(f.store.getJob('item-1')!.state.qa);await f.grant();assert.equal((await f.controller().tick()).state,'publication_queued');const d=f.drafts.get('draft-1'),s=f.store.getJob('item-1')!.state;
 assert.equal(d.revision,2);assert.equal(d.approvedRevision,2);assert.equal(d.destinations[0].hashtags.split(' ').length,3);assert.deepEqual(s.ownerReview,owner);assert.deepEqual(s.qa,qa);assert(publicationCopyMatches(s,d));assert.equal(f.calls.hashes,1);
 f.restart();assert.equal((await f.controller().tick()).state,'original_publication_queued');assert.equal(f.calls.edits,1);assert.equal(f.calls.queues,1);d.destinations[0].caption='Changed after approval';assert.equal(publicationCopyMatches(s,d),false);
});
test('lost copy response reconciles exact revised draft without repeating PUT or assuming an upload',async t=>{
 const f=fixture(t);f.add(1);await f.grant();f.loseEdit();assert.equal((await f.controller().tick()).state,'original_publication_reconciliation_required');assert.equal(f.calls.queues,0);f.restart();assert.deepEqual(await f.controller().reconcile('item-1'),{copyReconciled:true});assert.equal((await f.controller().tick()).state,'publication_queued');assert.equal(f.calls.edits,1);assert.equal(f.calls.queues,1);
});
test('lost queue receipt protects all later Reels and original reconciliation never uploads twice',async t=>{
 const f=fixture(t);f.add(1);f.add(2);await f.grant();f.loseQueue();assert.equal((await f.controller().tick()).state,'original_publication_reconciliation_required');await f.controller().reconcile('item-1');assert.equal((await f.controller().tick()).state,'original_publication_reconciliation_required');assert.equal(f.calls.queues,1);f.confirm(1);assert.equal((await f.controller().tick()).state,'publication_cadence_wait');assert.equal(f.calls.queues,1);
});
test('duplicate scheduled triggers share the existing publication lease and dispatch only once',async t=>{const f=fixture(t);f.add(1);f.add(2);await f.grant();const results=await Promise.all([f.controller().tick(),f.controller().tick()]);assert.equal(results.filter(r=>r.state==='publication_queued').length,1);assert.equal(results.filter(r=>r.state==='publication_busy').length,1);assert.equal(f.calls.queues,1);assert.equal(f.calls.edits,1);});
test('failed integrity, expired/paused authority and unverified independent formats cannot publish',async t=>{
 const f=fixture(t);f.add(1);await f.grant();f.controller().control('page-publication-policy:controlled','pause',true);assert.equal((await f.controller().tick()).state,'publication_disabled');f.controller().control('page-publication-policy:controlled','resume',true);f.failHash();assert.equal((await f.controller().tick()).state,'original_publication_reconciliation_required');assert.equal(f.calls.approvals,0);assert.equal(f.calls.queues,0);
 const p={accountId:'page',graphId:'123',contentType:'text',enabled:false,maxPer24Hours:null,minimumHours:null};assert.equal((await f.controller().streamProposal(p)).enabled,false);assert.equal((await f.controller().streams('page')).find(x=>x.contentType==='text')!.minimumHours,null);await assert.rejects(()=>f.controller().authorize({version:'page-publication-policy.v1',id:'text',accountId:'page',graphId:'123',contentType:'text',expiresAt:null,maxPer24Hours:5,minimumHours:3,maxTotal:null},true),/proposal-only/);
});
test('tag selection is bounded, relevant and multilingual; no authority transfer to changed AV decisions',()=>{
 assert.equal(relevantReelTags({title:'เรื่อง',idea:'watering can',category:'living_objects',languageStrategy:{captionLanguages:['th']}},'').split(' ').length,3);
 assert.throws(()=>relevantReelTags({},'#a #b #c #d #e #f'),/at most five/);assert.throws(()=>relevantReelTags({},'#a #a'),/unique/);
 assert.equal(relevantReelTags({},'','Caption #a #b #c #d #e'),'');assert.throws(()=>relevantReelTags({},'#extra','Caption #a #b #c #d #e'),/at most five/);
 const d:any={revision:2,videoId:'v',contentType:'reel',scheduledAt:null,destinations:[{accountId:'page',selectedVariantId:'variant',applyBranding:false,caption:'c',hashtags:'#a #b #c'}]},s:any={videoId:'v',variantId:'variant',variantSha256:'vhash',qa:{sha256:'sha'},ownerReview:{decision:'approve'}};s.publicationCopy={revision:2,payloadHash:draftFingerprint(d),videoId:'v',variantId:'variant',sha256:'sha',variantSha256:'vhash',reviewHash:stableHash(s.ownerReview),qaHash:stableHash(s.qa),caption:'c',hashtags:'#a #b #c',accountId:'page'};assert(publicationCopyMatches(s,d));s.ownerReview.decision='reject';assert.equal(publicationCopyMatches(s,d),false);
});
