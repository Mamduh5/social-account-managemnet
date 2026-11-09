import type {AgentStore} from './store.js';
export const GROUP_BROWSER_REGISTRY='group-browser.accounts';
export interface GroupBrowserConfig {accountId:string;profilePath:string;endpoint:string;pid:number;startedAt:string;}
export function groupBrowserPort(config:GroupBrowserConfig){const url=new URL(config.endpoint),port=Number(url.port);if(url.origin!==`http://127.0.0.1:${port}`||url.username||url.password||url.pathname!=='/'||url.search||url.hash||port<9235||port>9299||!Number.isInteger(port))throw Error('Account browser must use its reserved IPv4 loopback port');return port;}
export function groupBrowserLease(accountId:string){if(!accountId||accountId.length>200)throw Error('Exact SCC account required');return 'scc:facebook-group-browser:'+accountId;}
export function accountBrowserBinding(store:AgentStore,accountId:string){const config=store.runnerState<Record<string,GroupBrowserConfig>>(GROUP_BROWSER_REGISTRY)?.[accountId];if(!config||config.accountId!==accountId)throw Error(`Dedicated browser is not registered for SCC account ${accountId}`);groupBrowserPort(config);return config;}
export function matchesAccountBrowser(store:AgentStore,accountId:string,readiness:{accountId?:string;endpoint:string}){const config=accountBrowserBinding(store,accountId);return readiness.accountId===accountId&&readiness.endpoint===config.endpoint;}
