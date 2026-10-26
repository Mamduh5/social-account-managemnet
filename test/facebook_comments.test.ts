import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,dataDir} from '../server/src/db/database.js';
import {initializeDatabase} from '../server/src/db/schema.js';
import {MetaFacebookConnector} from '../server/src/connectors/meta-facebook.js';
import {SyncService} from '../server/src/services/sync.service.js';
import {seal} from '../server/src/services/token-protection.js';

const originalFetch=globalThis.fetch;
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
before(()=>{assert.match(dataDir,/test-runs/i);initializeDatabase();process.env.SCC_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,63).toString('base64');process.env.META_GRAPH_VERSION='v26.0';});
after(()=>{globalThis.fetch=originalFetch;db.close();});

test('Facebook comments distinguish genuine empty responses from permission, HTTP, malformed and network failures without leaking diagnostics',async()=>{
  const connector=new MetaFacebookConnector();let calls=0;
  globalThis.fetch=(async(url:any,init:any)=>{calls++;assert.ok(!String(url).includes('COMMENT_TOKEN'));assert.equal(init.headers.Authorization,'Bearer COMMENT_TOKEN');return response({data:[]});}) as any;
  assert.deepEqual(await connector.fetchComments({access_token:'COMMENT_TOKEN',external_id:'123'},{postId:'123_456'}),[]);assert.equal(calls,1);
  for (const [body,status] of [[{error:{message:'access_token=COMMENT_TOKEN'}},200],[{data:[]},403],[{},200],[{data:null},200],[{data:{}},200]] as const) {
    globalThis.fetch=(async()=>response(body,status)) as any;
    await assert.rejects(()=>connector.fetchComments({access_token:'COMMENT_TOKEN'},{postId:'123_456'}),error=>{assert.match(String(error),/synchronization failed/);assert.doesNotMatch(String(error),/COMMENT_TOKEN/);return true;});
  }
  globalThis.fetch=(async()=>{throw new Error('failed url access_token=COMMENT_TOKEN');}) as any;
  await assert.rejects(()=>connector.fetchComments({access_token:'COMMENT_TOKEN'}),error=>{assert.doesNotMatch(String(error),/COMMENT_TOKEN|failed url/);return true;});
  await assert.rejects(()=>connector.fetchComments({}),/authorized Page token/);
});

function accountFixture(commentGrant=true) {
  const id=`comments-page-${randomUUID()}`,postId=`comments-post-${randomUUID()}`,destinationId=`comments-dest-${randomUUID()}`;
  db.prepare(`INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,external_id,access_token,token_expires_at,identity_verified_at,granted_scopes_json,connection_status)
    VALUES (?,'facebook','page','Comment fixture',?,'connected','official_api','123',?,?,?,?,'connected')`).run(id,id,seal('SYNC_COMMENT_TOKEN'),new Date(Date.now()+86400000).toISOString(),new Date().toISOString(),JSON.stringify(['pages_read_engagement',...(commentGrant?['pages_read_user_content']:[])]));
  db.prepare("INSERT INTO publishing_posts(id,title,content_type) VALUES (?,'Saved post','text')").run(postId);
  db.prepare("INSERT INTO publishing_destinations(id,post_id,account_id,caption,status,remote_post_id) VALUES (?,?,?,'Actual saved caption','published','123_456')").run(destinationId,postId,id);
  db.prepare("INSERT INTO comments(id,account_id,destination_id,platform,external_comment_id,author_name,content,created_time,source) VALUES (?,?,?,'facebook','789','Reader','Existing actual comment','2026-10-26','meta_graph_api')").run(`existing-${id}`,id,destinationId);
  return {id,destinationId};
}
function providerComments(body:unknown,status=200,onComment?:()=>void) {
  globalThis.fetch=(async(url:any)=>{
    const parsed=new URL(String(url));
    if(parsed.pathname.endsWith('/comments')){onComment?.();return response(body,status);}
    if(parsed.searchParams.get('fields')?.includes('followers_count'))return response({id:'123',followers_count:0});
    if(parsed.pathname.endsWith('/video_insights'))return response({data:[]});
    return response({id:'123_456',likes:{summary:{total_count:0}},comments:{summary:{total_count:0}},shares:{count:0}});
  }) as any;
}

test('Comment provider failure records a visible partial sync while preserving genuine metrics and existing comments',async()=>{
  const {id,destinationId}=accountFixture();providerComments({error:{message:'access_token=SYNC_COMMENT_TOKEN'}},403);
  const result=await new SyncService().syncAccount(id);
  assert.equal(result.success,false);assert.equal(result.status,'failed');assert.equal(result.commentsStatus,'failed');assert.equal(result.commentsSynced,0);
  assert.match(result.message!,/Comment synchronization failed/);assert.doesNotMatch(result.message!,/SYNC_COMMENT_TOKEN/);
  assert.equal((db.prepare('SELECT count(*) n FROM post_metrics_snapshots WHERE destination_id=?').get(destinationId) as any).n,1);
  assert.equal((db.prepare('SELECT count(*) n FROM comments WHERE account_id=?').get(id) as any).n,1);
  assert.equal((db.prepare("SELECT status FROM sync_states WHERE account_id=? AND target='comments'").get(id) as any).status,'failed');
  providerComments({data:[]});const empty=await new SyncService().syncAccount(id);
  assert.equal(empty.commentsStatus,'success');assert.equal(empty.success,true);assert.equal(empty.commentsSynced,0);
  assert.equal((db.prepare('SELECT count(*) n FROM comments WHERE account_id=?').get(id) as any).n,1,'An empty latest response never deletes historical comments');
});

test('Missing comment-reading grants remain unavailable even when account/post metrics synchronize successfully',async()=>{
  const {id}=accountFixture(false);let commentCalls=0;providerComments({data:[]},200,()=>commentCalls++);
  const result=await new SyncService().syncAccount(id);
  assert.equal(result.success,true,'Genuine metrics may synchronize independently');assert.equal(result.commentsStatus,'auth_required');assert.equal(commentCalls,0);
  const state=db.prepare("SELECT status,error_message FROM sync_states WHERE account_id=? AND target='comments'").get(id) as any;
  assert.equal(state.status,'auth_required');assert.match(state.error_message,/comment-reading permissions/);
});
