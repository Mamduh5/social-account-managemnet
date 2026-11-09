import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium,type Browser,type Page} from 'playwright';
import type {AgentStore} from './store.js';
import {GROUP_BROWSER_REGISTRY,groupBrowserPort,type GroupBrowserConfig} from './group-browser-binding.js';
export type {GroupBrowserConfig} from './group-browser-binding.js';

const runFile=promisify(execFile);
export const GROUP_BROWSER_PORT=9235;

/** A local browser transport, never an assertion of Facebook posting permission.
 * Uses the Browser Bridge's per-account profile directory without reading/copying cookies. */
export class GroupBrowser {
  readonly configPath:string;
  constructor(readonly dataRoot:string,readonly store?:AgentStore){this.configPath=path.join(dataRoot,'agent','group-browser.json');if(store)this.adoptLegacy();}
  private legacy():GroupBrowserConfig|null{return fs.existsSync(this.configPath)?JSON.parse(fs.readFileSync(this.configPath,'utf8')):null;}
  private adoptLegacy(){const old=this.legacy();if(!old||!this.store)return;this.store.transaction(()=>{const registry=this.store!.runnerState<Record<string,GroupBrowserConfig>>(GROUP_BROWSER_REGISTRY)??{};if(registry[old.accountId]){if(registry[old.accountId].endpoint!==old.endpoint||registry[old.accountId].profilePath!==old.profilePath)throw Error('Existing legacy account profile/port binding cannot change');return;}this.validate({...registry,[old.accountId]:old});this.store!.setRunnerState(GROUP_BROWSER_REGISTRY,{...registry,[old.accountId]:old});});}
  private validate(registry:Record<string,GroupBrowserConfig>){const ports=new Set<number>();for(const [accountId,config] of Object.entries(registry)){const port=groupBrowserPort(config);if(config.accountId!==accountId||config.profilePath!==this.profile(accountId)||ports.has(port))throw Error('Duplicate port or cross-account browser profile binding');ports.add(port);}}
  inventory(){const registry={...(this.store?.runnerState<Record<string,GroupBrowserConfig>>(GROUP_BROWSER_REGISTRY)??{})},old=this.legacy();if(old&&!registry[old.accountId])registry[old.accountId]=old;this.validate(registry);return Object.values(registry);}
  config(accountId?:string):GroupBrowserConfig|null{if(!accountId)accountId=this.legacy()?.accountId;return accountId?this.inventory().find(c=>c.accountId===accountId)??null:null;}
  private profile(accountId:string){if(!/^acc-[a-zA-Z0-9-]+$/.test(accountId))throw Error('Invalid existing SCC account');return path.resolve(this.dataRoot,'browser-profiles',accountId);}
  private async listener(port?:number){
    if(process.platform!=='win32')throw Error('Managed browser process verification currently supports Windows only');
    if(port!==undefined&&(!Number.isInteger(port)||port<9235||port>9299))throw Error('Unreserved account debug port');
    const script=port===undefined?'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -ge 9235 -and $_.LocalPort -le 9299} | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress':`Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress`;
    const r=await runFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000}).catch(e=>{if(e.stdout?.trim())throw e;return {stdout:''};});
    const value=r.stdout.trim()?JSON.parse(r.stdout):[];return Array.isArray(value)?value:[value];
  }
  reserveAccount(accountId:string,occupiedPorts:number[]=[]){
    if(!this.store)throw Error('Original SCC store required to reserve a separate account browser');
    return this.store.transaction(()=>{const registry=this.store!.runnerState<Record<string,GroupBrowserConfig>>(GROUP_BROWSER_REGISTRY)??{};this.validate(registry);if(registry[accountId])return registry[accountId];const used=new Set([...Object.values(registry).map(groupBrowserPort),...occupiedPorts,9235]);let port=9236;while(used.has(port)&&port<=9299)port++;if(port>9299)throw Error('No unreserved account browser port available');const config={accountId,profilePath:this.profile(accountId),endpoint:`http://127.0.0.1:${port}`,pid:0,startedAt:''};const next={...registry,[accountId]:config};this.validate(next);this.store!.setRunnerState(GROUP_BROWSER_REGISTRY,next);return config;});
  }
  private save(config:GroupBrowserConfig){if(!this.store)throw Error('SCC store required to persist account browser process binding');this.store.transaction(()=>{const registry=this.store!.runnerState<Record<string,GroupBrowserConfig>>(GROUP_BROWSER_REGISTRY)??{},old=registry[config.accountId];if(!old||old.endpoint!==config.endpoint||old.profilePath!==config.profilePath)throw Error('Original account port reservation changed');const next={...registry,[config.accountId]:config};this.validate(next);this.store!.setRunnerState(GROUP_BROWSER_REGISTRY,next);});}
  async start(accountId:string,groupUrl:string){
    const url=new URL(groupUrl);if(url.origin!=='https://www.facebook.com'||!/^\/groups\/(?:\d+\/|feed\/)$/.test(url.pathname)||url.search||url.hash)throw Error('Exact canonical Group or native Groups feed URL required');
    const old=this.config(accountId)??this.reserveAccount(accountId,(await this.listener()).map(p=>p.LocalPort)),port=groupBrowserPort(old);if((await this.listener(port)).length){if(!old.pid)throw Error('Reserved account browser port is occupied; no attach or takeover');return this.status(accountId);}
    const profilePath=this.profile(accountId);if(old.profilePath!==profilePath||old.accountId!==accountId)throw Error('Dedicated profile cannot silently change identity');
    const candidates=[path.join(process.env.ProgramFiles??'C:\\Program Files','Google','Chrome','Application','chrome.exe'),path.join(process.env.LOCALAPPDATA??'','Google','Chrome','Application','chrome.exe')];
    const exe=candidates.find(p=>fs.existsSync(p));if(!exe)throw Error('Installed Google Chrome unavailable; no download or fallback');
    fs.mkdirSync(profilePath,{recursive:true});fs.mkdirSync(path.dirname(this.configPath),{recursive:true});
    const child=spawn(exe,[`--user-data-dir=${profilePath}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--enable-automation','--no-first-run','--no-default-browser-check','--new-window','--start-minimized',groupUrl],{detached:true,stdio:'ignore',windowsHide:true});
    await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
    const config={...old,pid:child.pid!,startedAt:new Date().toISOString()};this.save(config);
    for(let i=0;i<20;i++){try{const status=await this.status(accountId);if(status.transportReady)return status;}catch{}await new Promise(r=>setTimeout(r,250));}
    return {transportReady:false,reason:'Dedicated browser starting or process verification failed',config};
  }
  async connect(accountId?:string):Promise<{browser:Browser;config:GroupBrowserConfig}>{
    const config=this.config(accountId);if(!config||config.accountId!==(accountId??config.accountId)||config.profilePath!==this.profile(config.accountId))throw Error(`Dedicated SCC browser is not configured for account ${accountId??'(unspecified)'}`);const port=groupBrowserPort(config);
    const listeners=await this.listener(port);if(!listeners.length||listeners.some(p=>p.LocalAddress!=='127.0.0.1'||p.OwningProcess!==config.pid))throw Error(`Dedicated debug endpoint for ${config.accountId} is absent, non-loopback or owned by a different process`);
    const browser=await chromium.connectOverCDP(config.endpoint,{timeout:7000});
    try{const session=await browser.newBrowserCDPSession();const {arguments:args}=await session.send('Browser.getBrowserCommandLine');await session.detach();
      if(!args.includes(`--user-data-dir=${config.profilePath}`)||!args.includes('--remote-debugging-address=127.0.0.1')||!args.includes(`--remote-debugging-port=${port}`))throw Error(`CDP browser does not match the dedicated persistent profile for ${config.accountId}`);
      return {browser,config};
    }catch(e){await browser.close();throw e;}
  }
  async status(accountId?:string){
    let connection:Awaited<ReturnType<GroupBrowser['connect']>>|undefined;
    try{connection=await this.connect(accountId);return {transportReady:true,config:connection.config,pages:connection.browser.contexts()[0]?.pages().map(p=>({url:p.url()}))??[],authenticationVerified:false,notice:'Transport isolation only. Normal sign-in and exact account/Group/composer identity checks are still required.'};}
    catch(e){return {transportReady:false,config:this.config(accountId),reason:(e as Error).message};}
    finally{if(connection)await connection.browser.close();}
  }
  async withPage<T>(accountId:string,action:(page:Page,config:GroupBrowserConfig)=>Promise<T>):Promise<T>{
    const {browser,config}=await this.connect(accountId);try{if(config.accountId!==accountId)throw Error('Dedicated browser belongs to another SCC account');const context=browser.contexts()[0];if(!context)throw Error('Dedicated browser has no persistent context');const pages=context.pages();if(pages.length!==1)throw Error(`Keep exactly one working tab in the dedicated browser for ${accountId}; no arbitrary tab selection`);return await action(pages[0],config);}finally{await browser.close();}
  }
}
