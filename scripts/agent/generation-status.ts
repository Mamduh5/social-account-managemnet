import {AgentStore,stableHash} from './store.js';
import {PipelineAdapter} from './pipeline.js';
import {ApiError} from './http.js';

const timeoutCodes=new Set(['provider_timeout','result_correlation_uncertain','reconciliation_required','result_recovery_pending','browser_connection_lost']);
const technicalCodes=new Set(['planner_failed','planning_failed','invalid_media','conformance_failed','artifact_storage','assembly_failed','provider_failed','provider_refused']);
function timestamp(value:unknown):number|null {const n=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(n)?n:null;}
export function generationView(saved:Record<string,any>,now:Date):Record<string,any> {
  const age=Math.max(0,now.getTime()-(timestamp(saved.lastConfirmedProgressAt)??now.getTime()));
  const pace=age>=15*60000?'suspected_stall':age>=5*60000?'slow':'normal';
  const e=saved.evidence,p=e?.project;
  let condition='unknown';
  if(p?.state==='completed'&&p.media.videoUrl)condition='completed';
  else if(saved.browserControl||e?.recovery.required||e?.session.unresolved&&!e.session.active||
    ['reconciliation_required','recovery_pending','uncertain'].includes(e?.run.status)||
    timeoutCodes.has(e?.failure?.code)||p?.blockers.some((b:any)=>timeoutCodes.has(b.code))||p?.state==='completed')condition='recovery_required';
  else if(p?.state==='failed'&&technicalCodes.has(e?.failure?.code)&&!e?.session.unresolved)condition='technical_failure';
  else if(p?.state==='failed'||p?.state==='awaiting_human_decision'||p?.state==='conformance_attention_required')condition='recovery_required';
  else if(p)condition=pace==='normal'?'in_progress':pace;
  return {...saved,condition,pace,stale:now.getTime()>Date.parse(saved.nextCheckAt),
    elapsedWithoutConfirmedProgressSeconds:Math.floor(age/1000),
    timingAssessment:'Elapsed-time heuristic; neither a timeout nor an unchanged message proves provider failure.',
    retryPermitted:false,browserInteractionPermitted:false,agentShouldWait:false,
    next:condition==='completed'?'inspect_video_then_advance':condition==='technical_failure'?'inspect_saved_failure_and_work_next':'work-next'};
}

export function compactGeneration(snapshot:Record<string,any>|null):Record<string,any>|null {
  if(!snapshot)return null;
  return {projectId:snapshot.projectId,condition:snapshot.condition,pace:snapshot.pace,checkedAt:snapshot.checkedAt,
    lastConfirmedProgressAt:snapshot.lastConfirmedProgressAt,nextCheckAt:snapshot.nextCheckAt,stale:snapshot.stale,
    progress:snapshot.evidence?.project.progress??null,original:snapshot.evidence?.original??null,firstSubmission:snapshot.firstSubmission??null,
    session:snapshot.evidence?.session??null,failure:snapshot.evidence?.failure??null,recovery:snapshot.evidence?.recovery??null,
    browserControl:snapshot.browserControl??null,refreshError:snapshot.refreshError??null,
    agentShouldWait:false,retryPermitted:false,browserInteractionPermitted:false};
}

/** Append-only local observations; Pipeline retains all execution/recovery ownership. */
export class GenerationStatus {
  constructor(readonly store:AgentStore,readonly pipeline:PipelineAdapter,readonly scope:string,readonly clock:()=>Date=()=>new Date()){}
  cached(id:string) {const saved=this.store.generationSnapshot(id);return saved?generationView(saved,this.clock()):null;}
  async read(id:string,projectId:string,force=false):Promise<Record<string,any>> {
    const cached=this.cached(id);
    if(!force&&cached&&(!cached.stale||cached.condition==='completed'))return {...cached,cached:true};
    return this.refresh(id,projectId);
  }
  async refresh(id:string,projectId:string):Promise<Record<string,any>> {
    const prior=this.store.generationSnapshot(id),now=this.clock();
    let evidence:Record<string,any>;
    try {evidence=await this.pipeline.inspect(projectId);}catch(error){
      const saved=this.store.recordGeneration(id,{...(prior||{}),projectId,checkedAt:now.toISOString(),nextCheckAt:new Date(now.getTime()+5*60000).toISOString(),
        lastConfirmedProgressAt:prior?.lastConfirmedProgressAt??this.store.getJob(id)?.createdAt??now.toISOString(),
        refreshError:{code:error instanceof ApiError?error.code:'observation_unavailable'},evidence:prior?.evidence??null});
      return {...generationView(saved,now),stale:true,cached:!!prior};
    }
    // Ignore observation timestamps, unchanged generating notices and repeated recovery checks.
    const progressHash=stableHash({accepted:evidence.project.progress.accepted,runId:evidence.original.runId,acknowledged:evidence.run.acknowledged,
      plannedScenes:evidence.plannedScenes,clips:evidence.scenes.filter((s:any)=>s.hasClip).map((s:any)=>s.order),complete:!!evidence.project.media.videoUrl});
    const sourceTime=timestamp(evidence.run.at)??timestamp(evidence.createdAt)??now.getTime();
    const before=prior?.evidence;
    const progressed=!!prior?.progressHash&&prior.progressHash!==progressHash&&(
      evidence.project.progress.accepted>(before?.project.progress.accepted??0)||evidence.plannedScenes>(before?.plannedScenes??0)||
      evidence.scenes.filter((s:any)=>s.hasClip).length>(before?.scenes.filter((s:any)=>s.hasClip).length??0)||
      evidence.run.acknowledged&&(!before?.run.acknowledged||evidence.original.runId!==before?.original.runId)||
      !!evidence.project.media.videoUrl&&!before?.project.media.videoUrl);
    const progressAt=progressed?now.toISOString():prior?.lastConfirmedProgressAt??new Date(Math.min(sourceTime,now.getTime())).toISOString();
    const original={...prior?.evidence?.original,...Object.fromEntries(Object.entries(evidence.original).filter(([,value])=>value!==null))};
    evidence={...evidence,original};
    const firstSubmission={...original,...Object.fromEntries(Object.entries(prior?.firstSubmission||{}).filter(([,value])=>value!==null))};
    let snapshot:Record<string,any>={projectId,checkedAt:now.toISOString(),nextCheckAt:new Date(now.getTime()+5*60000).toISOString(),lastConfirmedProgressAt:progressAt,
      progressHash,evidence,firstSubmission,browserControl:prior?.browserControl??null};
    snapshot={...snapshot,condition:generationView(snapshot,now).condition};
    const saved=this.store.recordGeneration(id,snapshot);
    // Only explicit native completion with a final artifact releases our local admission claim.
    if(saved.condition==='completed'&&!evidence.session.unresolved)this.store.releaseProvider(this.scope,id);
    return {...generationView(saved,now),cached:false};
  }
  noteBrowserEnd(id:string,input:{state:'ended'|'unavailable';reason:string}) {
    if(!input||Object.keys(input).some(k=>!['state','reason'].includes(k))||!['ended','unavailable'].includes(input.state)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>500)
      throw new Error('Browser note requires ended/unavailable state and a concise reason');
    const prior=this.store.generationSnapshot(id),job=this.store.getJob(id);if(!job)throw new Error('Unknown run');
    const now=this.clock();
    const snapshot={...(prior||{}),projectId:prior?.projectId??job.state.projectId??null,checkedAt:now.toISOString(),
      nextCheckAt:prior?.nextCheckAt??now.toISOString(),lastConfirmedProgressAt:prior?.lastConfirmedProgressAt??job.createdAt,
      evidence:prior?.evidence??null,browserControl:{state:input.state,reason:input.reason,recordedAt:now.toISOString(),source:'operator_report'}};
    const saved=this.store.recordGeneration(id,{...snapshot,condition:generationView(snapshot,now).condition});
    return generationView(saved,now);
  }
}
