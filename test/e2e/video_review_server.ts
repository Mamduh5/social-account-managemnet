// Separate browser fixture: real review UI/routes/AgentStore/media verification,
// local copied media only, no owner writes, provider workers or publishing API.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {AgentStore} from '../../scripts/agent/store.js';
import {JsonClient} from '../../scripts/agent/http.js';
import {SccAdapter} from '../../scripts/agent/scc.js';
import {OwnerVideoReviews} from '../../scripts/agent/video-review.js';
import {videoReviewRouter} from '../../server/src/routes/video-review.routes.js';
import {VideoReviewService} from '../../server/src/services/video-review.service.js';
import {localAccess} from '../../server/src/local-access.js';

const root=path.resolve(process.env.SCC_DATA_DIR??''),port=3198;
if(process.env.SCC_ISOLATED_TEST!=='true'||!root.includes(path.join('.data','agent','video-review-20261105','browser-')))throw new Error('Explicit isolated browser fixture directory required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'seed.json'),'utf8')),origin='http://localhost:'+port,targets={scc:origin,pipeline:'http://localhost:8080'};
const store=new AgentStore(path.join(root,'agent.db')),app=express();app.use(localAccess);app.use(express.json());
for(const row of fixture.items){if(!store.getJob(row.id)){store.createJob(row.id,{production:true,concept:row.concept,targets});store.patchState(row.id,row.state);store.setRunnerState('fixture.draft:'+row.draft.id,row.draft);}}
store.setRunnerState('production.items',fixture.items.map((x:any)=>x.id));store.setRunnerState('production.config',{enabled:true,maxBacklogItems:8,maxBacklogBytes:536870912,reservationBytes:67108864});
process.env.PORT=String(port);process.env.SCC_AGENT_STATE=path.join(root,'agent.db');process.env.SCC_AGENT_SCC_URL=origin;
const service=new VideoReviewService();
app.use('/api/video-review',videoReviewRouter(service));
app.get('/api/operator/pages/:id/context',(req,res)=>req.params.id===fixture.page.id?res.json({account:fixture.page,rules:[],contextFingerprint:'isolated-fixture',voice:{}}):res.status(404).json({error:'Fixture Page unavailable'}));
app.get('/api/publishing/videos/:id',(req,res)=>{const row=fixture.items.find((x:any)=>x.media.id===req.params.id);res.status(row?200:404).json(row?{video:row.media}:{error:'Fixture video missing'});});
app.get('/api/publishing/drafts/:id',(req,res)=>{const d=store.runnerState('fixture.draft:'+req.params.id);res.status(d?200:404).json(d?{draft:d}:{error:'Fixture draft missing'});});
app.put('/api/publishing/drafts/:id',(req,res)=>{const d=store.runnerState<any>('fixture.draft:'+req.params.id);if(!d||d.revision!==req.body.revision||d.queuedPostId)return res.status(409).json({error:'Fixture revision conflict'});const {revision,...body}=req.body;const next={...d,...body,revision:revision+1,status:'draft',approvedRevision:null};store.setRunnerState('fixture.draft:'+d.id,next);res.json({draft:next});});
app.get('/api/publishing/history',(_req,res)=>res.json({items:[],hasMore:false}));
app.get('/api/accounts',(_req,res)=>res.json({accounts:[fixture.page]}));app.get('/api/accounts/categories',(_req,res)=>res.json({categories:[]}));
app.get('/api/events',(_req,res)=>{res.setHeader('content-type','text/event-stream');res.write(': isolated fixture\n\n');});
app.get('/api/health',(_req,res)=>res.json({status:'ok',instance:'isolated-video-review-fixture'}));
app.use('/uploads',express.static(path.join(root,'uploads')));
app.use('/api',(_req,res)=>res.status(404).json({error:'Unsupported in isolated review fixture. No external operation was sent.'}));
app.get('/',(_req,res)=>{const html=fs.readFileSync(path.resolve('client/dist/index.html'),'utf8');res.send(html.replace('<body>','<body><div style="padding:8px;background:#713f12;color:white;font:14px sans-serif">ISOLATED REVIEW FIXTURE — decisions never affect owner content</div>'));});app.use(express.static(path.resolve('client/dist')));
const server=app.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({fixture:true,url:origin+'/?view=video-review',root})));
process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
