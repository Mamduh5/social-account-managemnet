import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import {localAccess} from './local-access.js';
import {initializeDatabase} from './db/schema.js';
import {seedInitialData} from './db/seed.js';
import {db,uploadsDir,rendersDir} from './db/database.js';
import {indexExistingIdentities} from './services/accounts.service.js';
import {queueService} from './services/queue.service.js';
import {syncService} from './services/sync.service.js';
import {contentAssistantService} from './services/content-assistant.service.js';
import {eventService} from './services/events.service.js';
import {publishingRepo} from './repositories/publishing.repo.js';
import {publishingStartupHold} from './domain/runtime-recovery.js';
import {generalPostsReady} from './db/general-posts-schema.js';
import {calendarSchemaReady} from './db/calendar-schema.js';
import {emptyCapabilities} from './connectors/registry.js';
import {accountsRouter} from './routes/accounts.routes.js';
import {connectionsRouter} from './routes/connections.routes.js';
import {publishingRouter} from './routes/publishing.routes.js';
import {generalPublishingRouter} from './routes/general-publishing.routes.js';
import {assistantRouter} from './routes/content-assistant.routes.js';
import {groupsRouter} from './routes/groups-workspace.routes.js';
import {brandingRouter} from './routes/branding.routes.js';
import {inboxRouter} from './routes/inbox.routes.js';
import {activityRouter} from './routes/activity.routes.js';
import {analyticsRouter} from './routes/analytics.routes.js';
import {pipelineRouter} from './routes/pipeline.routes.js';
import {bridgeRouter} from './routes/bridge.routes.js';
import {eventsRouter} from './routes/events.routes.js';
import {runtimeControlRouter} from './routes/runtime.routes.js';
import {calendarRouter} from './routes/calendar.routes.js';
import {operatorRouter} from './routes/operator-workspace.routes.js';
import {testDataInventoryRouter} from './routes/test-data-inventory.routes.js';
import {testDataMetadataRouter} from './routes/test-data-metadata.routes.js';

const app=express(),server=http.createServer(app);
const port=Number(process.env.PORT||3001),managed=process.env.SCC_OWNER_MANAGED==='true';
const paused=process.env.SCC_ISOLATED_TEST==='true'&&process.env.SCC_PAUSE_WORKERS==='true';
let ready=false,stopping=false,publishingHold:string|null=null,mutableRequests=0;
app.use(localAccess);
app.use(cors({origin:['http://localhost:5180','http://127.0.0.1:5180']}));
app.use(express.json());
app.get('/api/health',(_req,res)=>res.status(ready&&!stopping?200:503).json({
 status:ready&&!stopping?'ok':'starting',ready,app:'Social Command Center',version:'1.12.0',
 releaseRevision:process.env.SCC_RELEASE_REVISION||null,instance:managed?'owner':process.env.SCC_ISOLATED_TEST==='true'?'review':'standalone',
 instanceId:process.env.SCC_RUNTIME_INSTANCE_ID||null,publishingHold,syncEnabled:ready&&!stopping&&!paused,
 timestamp:new Date().toISOString(),timezone:'Asia/Bangkok'
}));
app.use((req,res,next)=>{if(!ready||stopping)return res.status(503).json({error:'Application is starting or stopping'});if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!req.path.startsWith('/api/internal/runtime/')){mutableRequests++;let completed=false;const done=()=>{if(!completed){completed=true;mutableRequests--;}};res.once('finish',done);res.once('close',done);}next();});
function busy(){return queueService.activeJobCount>0||syncService.activeSynchronization||contentAssistantService.activeGenerations>0||mutableRequests>0;}
function shutdown(){
 if(stopping)return;stopping=true;ready=false;queueService.stop();syncService.stop();eventService.closeAll();
 server.close(()=>{try{db.close();}finally{process.exit(0);}});server.closeAllConnections();
}
async function boot(){
 // Claim the port before schema initialization, recovery or any scheduler starts.
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 if(managed&&!generalPostsReady(db))throw new Error('OWNER_SCHEMA_MAINTENANCE_REQUIRED');
 if(managed&&!calendarSchemaReady(db))throw new Error('OWNER_V111_SCHEMA_MAINTENANCE_REQUIRED');
 initializeDatabase();if(process.env.SCC_SEED_DEMOS!=='false')seedInitialData();indexExistingIdentities();
 app.use('/uploads/renders',express.static(rendersDir,{acceptRanges:true}));
 app.use('/uploads',express.static(uploadsDir,{acceptRanges:true}));
 app.use('/api/accounts',accountsRouter);app.use('/api/connections',connectionsRouter);
 app.get('/api/connectors/capabilities',(_req,res)=>res.json({capabilities:emptyCapabilities,notice:'Actual capabilities are resolved per account. Local preparation does not grant API permissions.'}));
 app.use('/api/assistant',assistantRouter);app.use('/api/groups',groupsRouter);
 app.use('/api/calendar',calendarRouter);
 app.use('/api/operator',operatorRouter);
 app.use('/api/test-data',testDataInventoryRouter);
 app.use('/api/test-data-metadata',testDataMetadataRouter);
 app.use('/api/publishing',generalPublishingRouter);app.use('/api/publishing',publishingRouter);
 app.use('/api/branding',brandingRouter);app.use('/api/inbox',inboxRouter);app.use('/api/activity',activityRouter);app.use('/api/analytics',analyticsRouter);app.use('/api/pipeline',pipelineRouter);app.use('/api/bridge',bridgeRouter);app.use('/api/events',eventsRouter);
 if(managed)app.use('/api/internal/runtime',runtimeControlRouter({token:process.env.SCC_RUNTIME_CONTROL_TOKEN||'',busy,shutdown}));
 const clientDist=path.resolve(process.env.SCC_CLIENT_DIST||path.resolve(process.cwd(),'client/dist'));
 if(fs.existsSync(clientDist)){app.use(express.static(clientDist));app.use((req,res,next)=>{if(req.method==='GET'&&!req.path.startsWith('/api')&&!req.path.startsWith('/uploads'))return res.sendFile(path.join(clientDist,'index.html'),{dotfiles:'allow'});next();});}
 publishingHold=managed?publishingStartupHold(publishingRepo.getStartupSafetyJobs()):null;
 if(!publishingHold&&!paused)queueService.start();else if(publishingHold)console.warn('[Runtime] '+publishingHold);
 if(!paused)syncService.start();ready=true;
 console.log('[Server] Ready on loopback port '+port+'; release '+(process.env.SCC_RELEASE_REVISION||'development'));
}
process.on('SIGINT',()=>{if(!busy())shutdown();else console.warn('[Runtime] Shutdown deferred: an operation is active.');});
process.on('SIGTERM',()=>{if(!busy())shutdown();else console.warn('[Runtime] Shutdown deferred: an operation is active.');});
process.on('uncaughtException',(error:any)=>{console.error('[Runtime] Fatal error; code '+String(error?.code||'UNCAUGHT'));queueService.stop();syncService.stop();process.exit(1);});
process.on('unhandledRejection',()=>console.error('[Runtime] An asynchronous operation failed; inspect its bounded status in the application.'));
void boot().catch((error:any)=>{console.error('[Runtime] Startup failed: '+(error?.code==='EADDRINUSE'?'PORT_IN_USE':['OWNER_SCHEMA_MAINTENANCE_REQUIRED','OWNER_V111_SCHEMA_MAINTENANCE_REQUIRED'].includes(error?.message)?error.message:'BOOT_FAILURE'));queueService.stop();syncService.stop();server.close();try{db.close();}catch{}process.exit(1);});
