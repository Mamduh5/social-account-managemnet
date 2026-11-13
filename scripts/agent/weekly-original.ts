import {AgentStore,stableHash,type AgentJob} from './store.js';
type Any=Record<string,any>;
export function originalPreparationTime(store:AgentStore,job:AgentJob){const id=job.state.rescheduleId;if(!id)return (job.input as Any).scheduledAt;const record=typeof id==='string'&&id.startsWith('weekly-reschedule:')?store.getJob(id):null,p=record?.input as Any;if(!record||p.originalInputHash!==job.inputHash||p.taskId!==(job.input as Any).taskId||p.jobId!==job.id||p.publicationAuthorized!==false||!Number.isFinite(Date.parse(p.scheduledAt)))throw Error('Original weekly reschedule binding differs');return p.scheduledAt;}
export function weeklyPreparationTime(store:AgentStore,task:Any){const c=task.payload?.pageContent??task.payload?.content??task.payload?.weeklyVideo?.context,w=c?.weeklyResearch??task.payload?.weeklyResearch;if(!w)return undefined;const job=store.getJob('weekly-preparation:'+stableHash({origin:c?.origin,planId:w.planId,slotId:w.slotId}).slice(0,32));if(!job)return w.scheduledAt;const p=job.input as Any;if(p.taskId!==task.id||p.accountId!==task.accountId)throw Error('Original weekly task identity differs');return originalPreparationTime(store,job);}

/** Exact per-slot preparation authority; never image generation or publication. */
export function explicitWeeklyPreparation(store:AgentStore,task:Any){
 const p=task.payload?.pageContent,w=p?.weeklyResearch;if(!w)return false;
 const job=store.getJob('weekly-preparation:'+stableHash({origin:p.origin,planId:w.planId,slotId:w.slotId}).slice(0,32)),input=job?.input as Any;
 return !!job&&Number.isFinite(Date.parse(String(job.state.authorizedAt)))
 &&job.state.generationAuthorized===false&&job.state.publicationAuthorized===false
 &&input.taskId===task.id&&input.accountId===task.accountId
 &&input.graphId===p.request.graphId&&input.origin===p.origin
 &&input.planId===w.planId&&input.slotId===w.slotId
 &&['text','image','image_caption'].includes(input.format)
 &&(input.format==='text'?'text':'image')===p.format
 &&p.request.brief===input.topic+'\n'+input.brief
 &&p.request.editorialRules===input.editorialRules
 &&stableHash(w.evidence)===stableHash(input.evidence);
}
