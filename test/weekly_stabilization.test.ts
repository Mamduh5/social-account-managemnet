import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {AgentStore} from '../scripts/agent/store.js';
import {analyticsRouter} from '../server/src/routes/analytics.routes.js';
import {syncService} from '../server/src/services/sync.service.js';

async function listen(t:any,app:express.Express){
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  return 'http://127.0.0.1:'+(server.address() as any).port;
}

test('analytics sync accepts no body and empty JSON, validates account input and preserves permission holds',async t=>{
  const oldAll=syncService.syncAllAccounts,oldAccount=syncService.syncAccount;let all=0,account=0;
  t.after(()=>{syncService.syncAllAccounts=oldAll;syncService.syncAccount=oldAccount;});
  const hold={success:false,status:'auth_required',message:'Fixture: Page permission missing; retain authorization hold',results:{}};
  syncService.syncAllAccounts=async()=>{all++;return hold;};
  syncService.syncAccount=async id=>{account++;assert.equal(id,'page-fixture');return {...hold,metricsSynced:0,commentsSynced:0};};
  const app=express();app.use(express.json());app.use('/api/analytics',analyticsRouter);
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(500).json({error:error.message}));
  const origin=await listen(t,app);
  for(const body of [undefined,'{}']){
    const r=await fetch(origin+'/api/analytics/sync',{method:'POST',...(body?{body,headers:{'Content-Type':'application/json'}}:{})});
    assert.equal(r.status,200);const result=await r.json();assert.equal(result.success,false);assert.equal(result.result.status,'auth_required');assert.match(result.message,/permission missing/);
  }
  const r=await fetch(origin+'/api/analytics/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:'page-fixture'})});
  assert.equal(r.status,200);assert.equal((await r.json()).result.status,'auth_required');
  for(const accountId of [false,{},[],42,''])assert.equal((await fetch(origin+'/api/analytics/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId})})).status,400);
  assert.equal(all,2);assert.equal(account,1);
});

test('supersede actual CLI initializes the original store, keeps draft unchanged and reuses the routing hold',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'scc-editorial-cli-')),state=path.join(dir,'agent.db');t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const policy=JSON.parse(readFileSync('docs/content/THREE_PAGE_EDITORIAL_POLICY_20261106.json','utf8').replace(/^\uFEFF/,''));
  const destination=policy.entries.find((e:any)=>e.categories.includes('game_concept'));
  const store=new AgentStore(state);store.createJob('page-editorial:fixture-cli',policy);store.setRunnerState('page-editorial.policy','page-editorial:fixture-cli');store.close();
  const draft={id:'draft-cli',revision:1,status:'draft',approvedRevision:null,queuedPostId:null,title:'Isolated original',contentType:'text',scheduledAt:null,destinations:[{accountId:'source-page',caption:'Original fixture content',hashtags:'',attachments:[],applyBranding:false}]};
  const before=structuredClone(draft);let reads=0;const app=express();app.get('/api/publishing/drafts/draft-cli',(_req,res)=>{reads++;res.json({draft});});
  app.use((_req,res)=>res.status(500).json({error:'No mutation or provider request is authorized in this fixture'}));const origin=await listen(t,app);
  const input=path.join(dir,'request.json');writeFileSync(input,JSON.stringify({draftId:draft.id,destinationAccountId:destination.accountId,destinationGraphId:destination.graphId,reason:'ISOLATED owner-directed routing hold'}));
  const run=()=>promisify(execFile)(process.execPath,['--import','tsx','scripts/agent.ts','page-editorial-supersede','--owner-authorized','--state',state,'--scc',origin,'--input',input],{windowsHide:true,timeout:30000});
  await run();await run();assert.deepEqual(draft,before);assert.equal(reads,2);
  const peer=new AgentStore(state);try{assert.equal(peer.runnerState<string[]>('page-editorial.superseded')!.length,1);assert.deepEqual((peer.getJob('page-editorial-supersede:'+draft.id)!.input as any).sourceDraft,before);}finally{peer.close();}
  draft.status='queued';draft.queuedPostId='post-protected' as any;await assert.rejects(run);assert.equal(reads,3);
});
