import {AgentStore,stableHash,type AgentJob} from './store.js';
import {automaticPageBinding,pageMachineResult} from './page-reel-autonomy.js';
type Any=Record<string,any>;

/** Local eligibility only; callers must also verify the current SCC/native reads
 * under both existing leases before committing an archive. No restore or deletion. */
export function terminalArchiveBlock(store:AgentStore,j:AgentJob,now:number):string|null{
  const s=j.state as Any,c=(j.input as Any).concept,e=s.machineReviewEvaluation;
  if(s.terminalArchive||s.phase==='archived')return 'already_archived';
  if(c?.version!=='gemini-page-concept.v1'||!automaticPageBinding(store,c.accountId,now))return 'outside_automatic_page_scope';
  if(s.phase!=='needs_review'||s.ownerReview||s.qa||s.machineAcceptance||s.backlogHold||s.ownerReviewError)return 'protected_review_or_lifecycle';
  if(s.publicationPostId||s.publicationIntent||s.draftId||s.variantId||s.variantReview)return 'accepted_or_publication_original';
  if(!s.videoId||!s.media?.sha256||!s.technicalQa?.technicalPass||!s.technicalQa.fullDecode||s.technicalQa.sha256!==s.media.sha256||!s.candidateDraftId||!s.candidateVariantId||!s.candidateVariantSha256)return 'incomplete_media';
  if(!s.original?.runId||s.lastObservation?.project?.state!=='completed'||s.lastObservation?.session?.unresolved||s.lastObservation?.session?.active||store.getOperation(j.id,'production_import')?.status!=='succeeded')return 'original_unresolved';
  if(s.machineReviewHold!=='automated_visual_or_factual_hold'||e?.source!=='machine'||e.decision!=='hold'||e.taskId!==s.machineReviewTaskId||e.evidenceVersion!=='page-reel-evidence.v2'||e.resultContractVersion!=='page-reel-result.v2')return 'not_terminal_machine_quality';
  const task=store.getWork(e.taskId),p=task?.payload?.pageReelReview;
  if(!task||!['prepared','done'].includes(task.status)||p?.itemId!==j.id||p.scopeHash!==e.scopeHash||stableHash(task.result)!==e.resultHash)return 'review_not_completed_or_changed';
  try{const r=pageMachineResult.parse(JSON.parse(String(task.result)));if(r.decision!=='hold'||r.scopeHash!==e.scopeHash)return 'review_not_terminal_hold';}catch{return 'invalid_review_result';}
  if(store.jobOperations(j.id).some(op=>['pending','uncertain'].includes(op.status)||/publication/.test(op.step)))return 'protected_operation';
  if(store.runnerState('ownerReview.pendingEdit:'+j.id)||store.providerClaims().some(p=>p.runId===j.id||p.runId===s.original.runId))return 'protected_claim_or_edit';
  const cycle=s.cycleId?store.getJob(s.cycleId):null;if(cycle?.state.activeItem===j.id)return 'active_cycle';
  for(let offset=0;offset<store.workCount();offset+=100){for(const w of store.listWork(100,offset)){
    if(w.id!==e.taskId&&w.payload?.pageReelReview?.itemId!==j.id)continue;
    if(!['prepared','done','cancelled','failed'].includes(w.status)||store.runnerSessions({taskId:w.id}).some(r=>['reserved','running','recovery_required'].includes(r.status)||r.mayBeRunning))return 'protected_review_task';
  }}
  return null;
}
