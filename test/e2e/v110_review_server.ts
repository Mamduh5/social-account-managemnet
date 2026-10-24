// Isolated review only. Social traffic is always blocked; a configured text adapter has one exact endpoint.
if(process.env.SCC_ISOLATED_TEST!=='true'||!process.env.SCC_DATA_DIR||!process.env.SCC_CLIENT_DIST)throw new Error('Explicit isolated review configuration required');
process.env.SCC_PAUSE_WORKERS='true';
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 const allowed=process.env.SCC_ASSISTANT_PROVIDER_CONFIG&&process.env.SCC_ASSISTANT_FIXTURES!=='true'&&url==='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'&&init?.method==='POST';
 if(!allowed)throw new Error('Provider request is blocked in the isolated V1.10 review server');
 return nativeFetch(input,init);
};
void import('../../server/src/index.js').then(async()=>{
 const {queueService}=await import('../../server/src/services/queue.service.js');
 const {syncService}=await import('../../server/src/services/sync.service.js');
 queueService.stop();syncService.stop();
 console.log('[V1.10 review] Social providers blocked; review workers paused. Text generation requires explicit approved configuration.');
});
