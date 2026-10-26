// Deliberately isolated: no social or AI provider endpoint is allowed.
if (process.env.SCC_ISOLATED_TEST !== 'true' || !process.env.SCC_DATA_DIR || !process.env.SCC_CLIENT_DIST || process.env.PORT !== '3197') throw new Error('Watermark review requires explicit isolated configuration');
process.env.SCC_PAUSE_WORKERS = 'true';
process.env.SCC_ASSISTANT_PROVIDER_CONFIG = '';
globalThis.fetch = async () => { throw new Error('All provider traffic is blocked in watermark review'); };
void import('../../server/src/index.js');
