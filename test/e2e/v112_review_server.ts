// Dedicated browser fixture process. It cannot target the owner database or send provider traffic.
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const dataRoot=path.resolve('.data/v112-acceptance');
const selected=path.resolve(process.env.SCC_DATA_DIR || '');
if(process.env.SCC_ISOLATED_TEST!=='true' || process.env.PORT!=='3199' || !selected.startsWith(dataRoot+path.sep) || path.resolve(process.env.SCC_CLIENT_DIST || '')!==path.resolve('.data/v112-client')) throw new Error('Dedicated isolated V1.12 browser fixture configuration required');
process.env.SCC_PAUSE_WORKERS='true';
process.env.SCC_SEED_DEMOS='false';
process.env.SCC_ASSISTANT_PROVIDER_CONFIG='';
process.env.SCC_ASSISTANT_FIXTURES='false';
process.env.SCC_OWNER_MANAGED='false';
process.env.SCC_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,112).toString('base64');
const blocked=()=>{fs.appendFileSync(path.join(selected,'blocked-provider-attempts.log'),'blocked external transport attempt\n');throw new Error('All provider traffic is blocked in V1.12 browser fixtures');};
globalThis.fetch=async()=>blocked();
(http as any).request=blocked;(http as any).get=blocked;
(https as any).request=blocked;(https as any).get=blocked;
syncBuiltinESMExports();
void (async()=>{
  // The manual composer also reads upstream pipeline health. Keep that existing path offline locally.
  const {pipelineService}=await import('../../server/src/services/pipeline.service.js');
  pipelineService.getPipelineStatusSummary=async()=>({health:{reachable:false,status:'offline',apiUrl:'fixture://offline',totalProjects:0,completedJobsCount:0,lastChecked:new Date().toISOString(),error:'Isolated fixture; no upstream request'},jobs:[]});
  await import('../../server/src/index.js');
})();
