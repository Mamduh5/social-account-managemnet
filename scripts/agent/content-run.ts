import {z} from 'zod';
import {AgentContent} from './content.js';
import {AgentRunner} from './runner.js';
import {AgentStore,stableHash} from './store.js';
import {compactWork} from './work-queue.js';

const request=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),brief:z.string().min(1).max(1200),editorialRules:z.string().min(1).max(2000)}).strict();
/** Compose existing context, work queue and research into one executor-neutral draft task. */
export async function prepareResearchTask(content:AgentContent,runner:AgentRunner,accountId:string,raw:unknown){
  const input=request.parse(raw),prior=content.store.getWork(input.id);
  const identity=stableHash({accountId,...input});
  if(prior){if(prior.payload?.content?.requestHash!==identity)throw new Error('Task ID already has different content');return {task:compactWork(prior),reused:true};}
  const detected=await runner.detect();
  if(!detected.executors.some(e=>e.available&&e.capabilities?.liveResearch))throw new Error('live_research_capability_unavailable: configure an authenticated supported live-research executor before assigning this task');
  const context=await content.context(accountId),{account,voice,rules,contextFingerprint}=context.page;
  const recent=content.store.listKnowledge({accountId,limit:8}).filter(k=>k.resourceId?.startsWith('research:')&&(k.evidence as any)?.validUntil&&Date.parse((k.evidence as any).validUntil)>Date.now()).slice(0,2).map(k=>({text:k.text,evidence:k.evidence}));
  const payload={content:{version:'agent-content.v1',format:'text',origin:content.scc.client.origin,contextFingerprint,requestHash:identity,responseContract:'agent-content-result.v1',requiresLiveResearch:true,
    page:{account:{id:account.id,name:account.name},rules,voice:{language:voice.profile?.language,tone:voice.profile?.tone,prohibitedPhrases:voice.profile?.prohibitedPhrases},editorialRules:input.editorialRules},
    brief:input.brief,research:recent,analytics:{confirmedRanked:context.analytics?.totalConfirmedRanked??0,missingIsZero:false},media:{},evidenceCheckedAt:context.checkedAt}};
  return {task:compactWork(content.work.add({id:input.id,kind:'text_post',title:'Research and prepare one useful Page post',accountId,priority:90,payload})),capabilities:detected.executors.map(({command,args,...c})=>c),contextBytes:Buffer.byteLength(JSON.stringify(payload)),networkCalls:context.networkCalls};
}
export function researchReceipt(content:AgentContent,runner:AgentRunner,store:AgentStore,id:string){
  const saved=content.status(id),task=store.getWork(id)!,session=store.runnerSessions({taskId:id,limit:1})[0];
  let result:any;try{result=typeof task.result==='string'?JSON.parse(task.result):task.result;}catch{}
  return {version:'agent-content-receipt.v1',taskId:id,status:task.status,claimReleased:!task.owner&&!task.leaseUntil,preparation:saved.task.preparation??null,save:saved.save,
    invocation:session?{id:session.id,status:session.status,usage:session.usage,researchAudit:session.researchAudit,httpRequests:session.preparationHttpRequests,startedAt:session.startedAt,finishedAt:session.finishedAt,preparationError:session.preparationError??null}:null,
    content:result?.content??null,research:result?.research??null,handoff:result?.handoff??null,remainingClaims:runner.status().active.length,networkCalls:0};
}
