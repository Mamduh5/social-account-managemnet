import {randomUUID} from 'node:crypto';
import {AgentStore,stableHash} from './store.js';

export const workKinds=['analyze_performance','research_concept','story_plan','scene_prompt','opening_image','review_video','caption','record_lesson'] as const;
export interface WorkInput {id:string;kind:typeof workKinds[number];title:string;priority?:number;accountId?:string;runId?:string;waitForRunId?:string;payload?:unknown;}
export interface ClaimInput {owner:string;commandId:string;leaseSeconds?:number;}
export interface SaveWorkInput {id:string;owner:string;commandId:string;claimToken:string;revision:number;status:'ready'|'prepared'|'blocked'|'done';result?:unknown;}
const short=(value:unknown,max=200)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
function keys(input:any,allowed:string[]) {if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))throw new Error('Unsupported work input fields');}
export function compactWork(task:Record<string,any>):Record<string,any> {
  const {payload,result,claimToken,...compact}=task;
  return {...compact,hasPayload:payload!==null&&payload!==undefined,hasResult:result!==null&&result!==undefined};
}

/** Assigns local preparation work to agents. Never invokes a model, browser or provider. */
export class AgentWorkQueue {
  constructor(readonly store:AgentStore,readonly clock:()=>Date=()=>new Date()){}

  add(input:WorkInput) {
    keys(input,['id','kind','title','priority','accountId','runId','waitForRunId','payload']);
    if(!short(input.id)||!short(input.title)||!workKinds.includes(input.kind)||!Number.isInteger(input.priority??50)||(input.priority??50)<0||(input.priority??50)>100)
      throw new Error('Work requires a stable ID, supported kind, title, and priority 0-100');
    for(const key of ['accountId','runId','waitForRunId'] as const)if(input[key]!==undefined&&!short(input[key]))throw new Error('Invalid work scope');
    for(const id of [input.runId,input.waitForRunId])if(id&&!this.store.getJob(id))throw new Error('Work references an unknown run');
    if(JSON.stringify(input.payload??null).length>64000)throw new Error('Work payload exceeds 64 KiB');
    const now=this.clock().toISOString();
    return this.store.transaction(()=>{
      const counts=this.store.workStatusCounts(),pending=Object.entries(counts).filter(([status])=>status!=='done').reduce((n,[,count])=>n+count,0);
      const limit=this.store.runnerState('config')?.maxBacklog??200;
      if(!this.store.getWork(input.id)&&pending>=limit)throw new Error('Agent work backlog limit reached; complete or review existing tasks');
      const saved=this.store.addWork(input.id,input,{...input,payload:input.payload??null,priority:input.priority??50,status:'ready',revision:1,result:null,owner:null,claimToken:null,leaseUntil:null,
        requirements:input.kind==='opening_image'?['Use an available independent image capability; never reuse a locked Gemini video session.']:[],createdAt:now,updatedAt:now});
      this.store.setRunnerState('wake',now);return saved;
    });
  }

  available(task:Record<string,any>):boolean {
    if(this.store.runnerSessions({taskId:task.id}).some(s=>['reserved','running','recovery_required'].includes(s.status)))return false;
    if(task.status!=='ready' && !(task.status==='claimed'&&Date.parse(task.leaseUntil)<=this.clock().getTime()))return false;
    if(task.waitForRunId && this.store.generationSnapshot(task.waitForRunId)?.condition!=='completed')return false;
    return true;
  }

  next(input?:ClaimInput) {
    if(!input){const task=this.store.workCandidates().find(row=>this.available(row));return task?{task:compactWork(task),next:'work-claim'}:{task:null,next:'add_useful_independent_work'};}
    this.validateClaim(input);
    return this.store.workCommand(input.commandId,{action:'next',...input},()=>{
      const task=this.store.workCandidates().find(row=>this.available(row));
      return task?this.claimSnapshot(task,input):{task:null,next:'add_useful_independent_work'};
    });
  }

  claim(id:string,input:ClaimInput) {
    this.validateClaim(input);
    return this.store.workCommand(input.commandId,{action:'claim',id,...input},()=>{
      const task=this.store.getWork(id);if(!task)throw new Error('Unknown work ID');
      if(this.store.runnerSessions({taskId:id}).some(s=>['reserved','running','recovery_required'].includes(s.status)))throw new Error('Work has an active or recovery-required runner claim');
      if(!this.available(task)&&task.status!=='prepared')throw new Error('Work is claimed, blocked, done or waiting for a completed generation');
      return this.claimSnapshot(task,input);
    });
  }

  private validateClaim(input:ClaimInput) {
    keys(input,['owner','commandId','leaseSeconds']);
    if(!short(input.owner)||!short(input.commandId)||!Number.isInteger(input.leaseSeconds??900)||(input.leaseSeconds??900)<30||(input.leaseSeconds??900)>3600)
      throw new Error('Claim requires owner, stable commandId and leaseSeconds 30-3600');
  }
  private claimSnapshot(task:Record<string,any>,input:ClaimInput) {
    const now=this.clock();
    const saved=this.store.saveWork({...task,status:'claimed',owner:input.owner,claimToken:randomUUID(),leaseUntil:new Date(now.getTime()+(input.leaseSeconds??900)*1000).toISOString(),revision:task.revision+1,updatedAt:now.toISOString()});
    return {task:saved,next:'perform_independent_work_then_work_save',automaticExecution:false};
  }

  save(input:SaveWorkInput) {
    keys(input,['id','owner','commandId','claimToken','revision','status','result']);
    if(!short(input.id)||!short(input.owner)||!short(input.commandId)||!short(input.claimToken)||!Number.isInteger(input.revision)||!['ready','prepared','blocked','done'].includes(input.status))
      throw new Error('Work save requires exact claim owner, token, revision, commandId and supported status');
    if(JSON.stringify(input.result??null).length>64000)throw new Error('Work result exceeds 64 KiB');
    return this.store.workCommand(input.commandId,{action:'save',...input},()=>{
      const task=this.store.getWork(input.id);
      if(!task||task.status!=='claimed'||task.owner!==input.owner||task.claimToken!==input.claimToken||task.revision!==input.revision||Date.parse(task.leaseUntil)<=this.clock().getTime())
        throw new Error('Work claim expired or changed; inspect the current task before saving');
      if(['prepared','done'].includes(input.status)&&input.result===undefined)throw new Error('Prepared or completed work requires a saved result');
      const saved=this.store.saveWork({...task,status:input.status,result:input.result===undefined?task.result:input.result,owner:null,claimToken:null,leaseUntil:null,revision:task.revision+1,updatedAt:this.clock().toISOString()});
      return {task:compactWork(saved),resultHash:stableHash(saved.result),automaticGeneration:false};
    });
  }

  list(limit=20,offset=0) {
    if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid work offset');
    const total=this.store.workCount();
    return {tasks:this.store.listWork(limit,offset).map(task=>({...compactWork(task),available:this.available(task)})),total,limit,offset,hasMore:offset+limit<total};
  }
  show(id:string) {const task=this.store.getWork(id);if(!task)throw new Error('Unknown work ID');return {task,available:this.available(task)};}
}
