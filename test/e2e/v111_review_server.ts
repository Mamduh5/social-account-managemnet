// Fixture-only calendar acceptance: every external transport is blocked.
if(process.env.SCC_ISOLATED_TEST!=='true'||!process.env.SCC_DATA_DIR||process.env.PORT!=='3196'||!process.env.SCC_CLIENT_DIST)throw new Error('Explicit isolated calendar review required');
process.env.SCC_PAUSE_WORKERS='true';process.env.SCC_ASSISTANT_PROVIDER_CONFIG='';
globalThis.fetch=async()=>{throw new Error('All provider traffic is blocked during calendar review');};
void import('../../server/src/index.js');
