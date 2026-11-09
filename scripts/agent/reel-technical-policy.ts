import {z} from 'zod';
import {AgentStore,stableHash,type AgentJob} from './store.js';
import {automaticPageBinding,machineScope} from './page-reel-autonomy.js';
import {validatePageReelConcept,pageReelCaptionHold} from './page-reel-editorial.js';
type Any=Record<string,any>;
export const noCreativeReviewMode='owner_authorized_no_creative_review';
const schema=z.object({id:z.string().regex(/^[\w-]{1,70}$/),accountId:z.string(),graphId:z.string().regex(/^\d+$/),reason:z.string().min(20).max(2000)}).strict();
export function technicalPolicy(store:AgentStore,accountId:string){const id=store.runnerState<string>('production.noCreativeReview:'+accountId);return id?store.getJob(id):null;}
export function prospectiveTechnicalItem(store:AgentStore,item:AgentJob){
 const g=technicalPolicy(store,(item.input as Any).concept?.accountId),p=g?.input as Any,s=item.state as Any;
 if(!g||!g.state.enabled||g.state.revokedAt||p.excludedItemIds.includes(item.id)||s.terminalArchive||s.phase==='archived')return false;
 return p.inFlightItems.some((i:Any)=>i.id===item.id&&i.inputHash===item.inputHash)||Date.parse(item.createdAt)>=Date.parse(p.effectiveAt)&&!p.existingItemIds.includes(item.id);
}
/** Adds a prospective overlay to immutable grants; never replaces dispatch ledgers. */
export async function authorizeTechnicalPolicy(store:AgentStore,scc:any,targets:Any,raw:unknown,authorized=false,clock:()=>Date=()=>new Date()){
 if(!authorized)throw new Error('Explicit owner no-creative-review publication authorization required');
 const r=schema.parse(raw),id='reel-technical-policy:'+r.id,old=store.getJob(id);
 if(old){if(stableHash((old.input as Any).request)!==stableHash(r))throw new Error('Policy identity changed');return old;}
 const b=automaticPageBinding(store,r.accountId,+clock()),page=await scc.pageContext(r.accountId);
 if(!b||b.graphId!==r.graphId||page.account.graphId!==r.graphId)throw new Error('Existing exact Rai/Developer generation and Reel publication grants required');
 return store.transaction(()=>{
  for(const key of ['production.lease','publication.lease']){const lock=store.runnerState<Any>(key);if(lock&&Date.parse(lock.until)>+clock())throw new Error('Original work is busy');}
  if(stableHash(automaticPageBinding(store,r.accountId,+clock()))!==stableHash(b)||[b.generationPolicyId,b.publicationPolicyId].some(id=>stableHash((store.getJob(id)?.input as Any)?.targets)!==stableHash(targets)))throw new Error('Original Page grant targets or binding changed');
  if(technicalPolicy(store,r.accountId))throw new Error('Existing technical policy must be retained; no replacement or counter reset');
  const items=(store.runnerState<string[]>('production.items')??[]).map(id=>store.getJob(id)!).filter(j=>j&&(j.input as Any).concept?.accountId===r.accountId);
  const inFlight=items.filter(j=>['queued','planning','generating','recovering'].includes(String(j.state.phase))&&!j.state.videoId&&!j.state.qa&&!j.state.ownerReview&&!j.state.backlogHold&&!j.state.machineReviewTaskId&&!j.state.machineReviewEvaluation&&!j.state.terminalArchive);
  const input={version:'reel-technical-policy.v1',mode:noCreativeReviewMode,request:r,targets,binding:b,effectiveAt:clock().toISOString(),existingItemIds:items.map(j=>j.id),inFlightItems:inFlight.map(j=>({id:j.id,inputHash:j.inputHash,projectId:j.state.projectId??null})),excludedItemIds:items.filter(j=>!inFlight.includes(j)).map(j=>j.id)};
  store.createJob(id,input);store.patchState(id,{enabled:true,issuedAt:clock().toISOString()});store.setRunnerState('production.noCreativeReview:'+r.accountId,id);
  store.recordKnowledge({id:id+':authorization',kind:'observation',accountId:r.accountId,resourceId:id,source:'explicit_owner_no_creative_review_authorization',text:r.reason+' Creative quality and listening are not reviewed. Technical/source/identity/publication gates and owner rejections remain. Historical completed candidates are excluded; exact pending originals are enrolled without resubmission. No dispatch ledger changes.',evidence:input});return store.getJob(id)!;
 });
}
export function technicalPolicyHold(store:AgentStore,item:AgentJob,now=Date.now()):string|null {
 const s=item.state as Any,c=(item.input as Any).concept,g=technicalPolicy(store,c?.accountId),p=g?.input as Any,b=automaticPageBinding(store,c?.accountId,now);
 if(!prospectiveTechnicalItem(store,item))return 'outside_prospective_technical_policy';
 if(c?.version!=='gemini-page-concept.v1'||!b||stableHash(b)!==stableHash(p.binding)||stableHash((item.input as Any).targets)!==stableHash(p.targets))return 'technical_policy_or_page_changed';
 if(s.ownerReview||s.qa||s.backlogHold||s.ownerReviewError||s.machineReviewEvaluation||s.machineReviewTaskId||s.candidateReview?.visual==='fail'||s.candidateReview?.audio==='fail'||['failed','qa_failed','archived'].includes(s.phase))return 'existing_review_or_rejection_hold';
 try{validatePageReelConcept(store,c,now);}catch{return 'factual_source_review_required';}
 const q=s.technicalQa;if(!s.media?.technical||!q?.technicalPass||!q.fullDecode||q.sha256!==s.media.sha256||q.audio?.nonfiniteSamples!==0)return 'technical_integrity_required';
 const e=s.lastObservation;if(!s.original?.runId||e?.original?.runId!==s.original.runId||e?.project?.state!=='completed'||e.session?.active||e.session?.unresolved||store.getOperation(item.id,'production_import')?.status!=='succeeded')return 'original_generation_unresolved';
 return null;
}
export function currentTechnicalEligibility(store:AgentStore,item:AgentJob,draft:Any|null,variant:Any|null,now=Date.now()){
 const s=item.state as Any,r=s.policyEligibility,b=automaticPageBinding(store,(item.input as Any).concept.accountId,now),g=technicalPolicy(store,(item.input as Any).concept.accountId);
 if(technicalPolicyHold(store,item,now)||!draft||!variant||!r||!b||r.source!==noCreativeReviewMode||!g||r.policyId!==g.id||r.policyHash!==g.inputHash||r.creativeReviewed!==false||r.ownerReviewed!==false||r.listeningPerformed!==false||pageReelCaptionHold(draft.destinations?.[0]?.caption??'',draft.destinations?.[0]?.hashtags??''))return false;
 if(r.integrity?.fullDecode!==true||r.integrity.masterAudioHash!==r.integrity.variantAudioHash||r.integrity.variantSha256!==variant.sha256)return false;
 return stableHash(machineScope(item,draft,variant,b))===r.scopeHash;
}
export function publicationEvidence(state:Any):Any {return state.policyEligibility?.source===noCreativeReviewMode?state.policyEligibility:state.qa;}
