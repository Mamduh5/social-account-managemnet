import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {dataDir} from '../db/database.js';

const commands={list:'video-review-list',decide:'video-review-decide',edit:'video-review-edit',preview:'video-review-policy-preview',proposal:'video-review-policy-save',revoke:'video-review-policy-revoke',publicationStatus:'video-review-publication-status',publicationControl:'video-review-publication-control',pageContent:'page-content-operations-status',imagePolicyControl:'standing-image-control',generalProposal:'general-policy-proposal'} as const;
export type ReviewAction=keyof typeof commands;
/** Fixed review-only bridge to the frozen agent. No arbitrary command/path,
 * generation, publication approval, scheduling or policy activation surface. */
export class VideoReviewService {
  constructor(private readonly execute?:(action:ReviewAction,input?:unknown)=>Promise<unknown>){}
  async run(action:ReviewAction,input?:unknown){if(this.execute)return this.execute(action,input);
    const state=path.resolve(process.env.SCC_AGENT_STATE||path.join(dataDir,'agent','agent.db'));
    if(!fs.existsSync(state))throw new Error('Agent review state is unavailable; no database was created');
    const script=path.resolve(__dirname,'../../../scripts/agent.ts'),loader=pathToFileURL(require.resolve('tsx')).href;
    const args=['--import',loader,script,commands[action],'--state',state,'--scc',process.env.SCC_AGENT_SCC_URL||'http://localhost:'+(process.env.PORT||3001),'--pipeline',process.env.SCC_AGENT_PIPELINE_URL||'http://localhost:8080'];
    if(input!==undefined)args.push('--input','-');if(['decide','edit','proposal','revoke','publicationControl','imagePolicyControl','generalProposal'].includes(action))args.push('--owner-authorized');
    return new Promise<unknown>((resolve,reject)=>{
      const child=execFile(process.execPath,args,{cwd:path.dirname(path.dirname(script)),windowsHide:true,timeout:120000,maxBuffer:1024*1024,encoding:'utf8'},(error,stdout)=>{
        try{const result=JSON.parse(stdout.trim());if(result.ok!==true)throw new Error(result.error?.message||'Review action could not complete');if(error)throw error;resolve(result.data);}catch(e){reject(e instanceof Error?e:new Error('Review service unavailable; retain the same action identity'));}
      });child.stdin?.end(input===undefined?'':JSON.stringify(input));
    });
  }
}
export const videoReviewService=new VideoReviewService();
