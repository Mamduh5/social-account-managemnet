import { z } from 'zod';
import { weeklyContentRepo as repo } from '../repositories/weekly-content.repo.js';
import { calendarService } from './calendar.service.js';
import { operatorWorkspaceService } from './operator-workspace.service.js';
import { WeeklyContentService } from './weekly-content.service.js';
import { ExistingWeeklyAgentBridge, type WeeklyAgentBridge } from './weekly-agent-bridge.js';
import { weeklyHash, weeklySelectionHash, weekWindow, slotEvidenceHold, type WeeklyPlan } from '../domain/weekly-content.js';
import {redactContentSecrets} from '../domain/content-assistant.js';

const ids=z.array(z.string().min(1).max(200)).min(1).max(100).refine(v=>new Set(v).size===v.length);
const selection=z.object({revision:z.number().int().positive(),slotIds:ids}).strict();
const imageBudget=z.object({maxTotalImages:z.number().int().min(1).max(60),maxImagesPer24Hours:z.number().int().min(1).max(20),maxPendingItems:z.number().int().min(1).max(6)}).strict();
const authorization=selection.extend({expectedHash:z.string().min(1),expiresAt:z.string().datetime({offset:true}),confirm:z.literal(true),operations:z.object({prepare:z.boolean(),materialize:z.boolean(),publishExact:z.boolean()}).strict(),groupScopes:z.array(z.object({slotId:z.string(),registryId:z.string().startsWith('group-channel:'),grantId:z.string().startsWith('group-grant:')}).strict()).max(21).default([]),imageBudget:imageBudget.optional()}).strict();

/** One explicit bounded owner action, followed only by the existing AgentRunner trigger.
 * Future generated content never inherits publication approval from this grant. */
export class WeeklyBatchService {
  readonly content:WeeklyContentService;
  constructor(readonly bridge:WeeklyAgentBridge=new ExistingWeeklyAgentBridge(),readonly clock:()=>Date=()=>new Date()){this.content=new WeeklyContentService(bridge,clock);}
  async review(id:string,raw:unknown){
    const r=selection.parse(raw),p=this.content.get(id);
    if(r.slotIds.some(id=>!p.slots.some(s=>s.id===id)))throw Error('Unknown selected slot');
    const slots=p.slots.filter(s=>r.slotIds.includes(s.id));
    const targets=[...new Set(slots.map(s=>p.ideas.find(i=>i.id===s.ideaId)!.accountId))].map(accountId=>({accountId,contextFingerprint:operatorWorkspaceService.context(accountId).contextFingerprint}));
    const campaigns=[...new Set(slots.map(s=>s.campaignId).filter((id):id is string=>!!id))]
      .map(id=>calendarService.getCampaignReview(id))
      .filter(c=>['draft','awaiting_approval'].includes(c.campaign.status) && c.items.every(i=>
        i.contentType!=='reel' && slots.some(s=>s.draftId===i.draftId && !slotEvidenceHold(p,s,+this.clock()))));
    let images:any={concepts:[],reviewHash:null},imageHold:string|null=null;
    const imageSlots=slots.filter(s=>['image','image_caption'].includes(s.format)&&s.preparation?.taskId&&!s.draftId);
    if(imageSlots.length){try{images=await this.bridge.run('imageReview',{planId:id,slotIds:imageSlots.map(s=>s.id)});}catch(e){imageHold=message(e);}}
    const review={selectionHash:weeklySelectionHash(p,r.slotIds),slotIds:r.slotIds,targets,campaigns,images,imageHold,
      slots:slots.map(s=>({...s,idea:p.ideas.find(i=>i.id===s.ideaId),hold:slotEvidenceHold(p,s,+this.clock())||s.preparation?.hold||(!s.draftId&&!s.preparedId?'Future final content still requires its mandatory exact review':null)})),
      policy:'Only these selected items and current exact campaign snapshots are authorized. World final media review and all text/image final-content review remain mandatory. No future changed or newly generated publication is approved.'};
    return {...review,hash:weeklyHash({selectionHash:review.selectionHash,targets, campaigns:campaigns.map(c=>({id:c.campaign.id,hash:c.expectedApprovalHash})),images:images.reviewHash})};
  }
  async authorize(id:string,raw:unknown){
    const r=authorization.parse(raw),key='week-auth-'+weeklyHash({id,expectedHash:r.expectedHash,expiresAt:r.expiresAt,operations:r.operations,groupScopes:r.groupScopes,imageBudget:r.imageBudget??null}).slice(0,32);
    let p=this.content.get(id);if(p.authorizations?.some(a=>a.id===key))return p;
    const review=await this.review(id,{revision:r.revision,slotIds:r.slotIds});
    if(review.hash!==r.expectedHash)throw Error('Selected content, evidence, context or exact publication snapshot changed since review');
    const now=+this.clock(),end=Date.parse(r.expiresAt),window=weekWindow(p.startDate);
    if(end<=now||end>window.end||end-now>7*86400000)throw Error('Weekly authority needs a future expiry within this seven-day plan');
    if(r.imageBudget&&(!review.images.concepts.length||review.imageHold||review.images.concepts.reduce((n:number,c:any)=>n+c.count,0)>r.imageBudget.maxTotalImages||review.images.concepts.length>r.imageBudget.maxPendingItems||r.imageBudget.maxImagesPer24Hours>r.imageBudget.maxTotalImages))throw Error('Review exact prepared image concepts and provide a sufficient explicit budget first');
    if(r.groupScopes.some(g=>!r.slotIds.includes(g.slotId)||!p.ideas.find(i=>i.id===p.slots.find(s=>s.id===g.slotId)?.ideaId)?.groupId))throw Error('Group authority must bind a selected Group slot');
    p=this.content.get(id);
    if(weeklySelectionHash(p,r.slotIds)!==review.selectionHash||review.targets.some(t=>operatorWorkspaceService.context(t.accountId).contextFingerprint!==t.contextFingerprint)||review.campaigns.some(c=>calendarService.getCampaignReview(c.campaign.id).expectedApprovalHash!==c.expectedApprovalHash))throw Error('Selected content or exact publication context changed during review');
    if((p.authorizations?.length??0)>=20)throw Error('Review bounded weekly authorization history before adding more grants');
    const grant={id:key,issuedAt:this.clock().toISOString(),expiresAt:r.expiresAt,selectionHash:review.selectionHash,slotIds:r.slotIds,operations:r.operations,targets:review.targets,campaigns:r.operations.publishExact?review.campaigns.map(c=>({id:c.campaign.id,accountId:c.account.id,expectedHash:c.expectedApprovalHash})):[],groupScopes:r.groupScopes,
      ...(r.imageBudget?{imageBudget:{...r.imageBudget,expectedHash:review.images.reviewHash,slotIds:review.images.concepts.map((c:any)=>c.slotId)}}:{}),state:{phase:'authorized',campaigns:{},groups:{},nextCheckAt:null} as Record<string,any>};
    p.authorizations=[...(p.authorizations??[]),grant];p=repo.save({...p,updatedAt:this.clock().toISOString()},p.revision);
    // Exact current campaigns are local transactional operations. New output is excluded forever.
    for(const c of grant.campaigns){
      try{repo.transaction(()=>{p=this.content.get(id);const a=p.authorizations!.find(a=>a.id===key)!;const result=calendarService.approveCampaign(c.id,{accountId:c.accountId,expectedHash:c.expectedHash});a.state.campaigns[c.id]={state:'queued',...result};p=repo.save(p,p.revision);});}
      catch(e){p=this.content.get(id);p.authorizations!.find(a=>a.id===key)!.state.campaigns[c.id]={state:'held',hold:message(e)};p=repo.save(p,p.revision);}
    }
    return p;
  }
  private saveState(id:string,grantId:string,patch:Record<string,any>){const p=this.content.get(id),a=p.authorizations!.find(a=>a.id===grantId)!;a.state={...a.state,...patch};return repo.save({...p,updatedAt:this.clock().toISOString()},p.revision);}
  async advance(id?:string){
    const candidates=(id?[this.content.get(id)]:repo.list()).flatMap(p=>(p.authorizations??[]).map(a=>({p,a}))).filter(({a})=>Date.parse(a.expiresAt)>+this.clock()&&(!a.state.nextCheckAt||Date.parse(a.state.nextCheckAt)<=+this.clock()));
    const selected=candidates.find(({a})=>!a.state.leaseUntil||Date.parse(a.state.leaseUntil)<=+this.clock());
    if(!selected)return {state:'no_authorized_weekly_work',actions:0};
    const {a}=selected,planId=selected.p.id;
    const acquired=repo.transaction(()=>{const p=this.content.get(planId),current=p.authorizations!.find(g=>g.id===a.id)!;if(current.state.leaseUntil&&Date.parse(current.state.leaseUntil)>+this.clock())return false;current.state.leaseUntil=new Date(+this.clock()+300000).toISOString();repo.save(p,p.revision);return true;});
    if(!acquired)return {state:'weekly_work_owned',actions:0};
    let actions=0;
    try{
      let p=this.content.get(planId);
      if(weeklySelectionHash(p,a.slotIds)!==a.selectionHash)throw Error('Authorized selected content changed; new owner review required');
      const eligible=a.slotIds.filter(slotId=>{const slot=p.slots.find(s=>s.id===slotId)!;const accountId=p.ideas.find(i=>i.id===slot.ideaId)!.accountId;try{return a.targets.find(t=>t.accountId===accountId)?.contextFingerprint===operatorWorkspaceService.context(accountId).contextFingerprint;}catch{return false;}});
      if(a.operations.prepare){const next=p.slots.find(s=>eligible.includes(s.id)&&(!s.preparation?.intentAt||s.preparation.status==='not_queued')&&s.preparation?.status!=='held');if(next){await (next.preparation?.intentAt?this.content.resumePreparation(planId,{revision:p.revision,slotIds:[next.id],confirmPreparation:true},weeklySelectionHash(p,[next.id])):this.content.prepare(planId,{revision:p.revision,slotIds:[next.id],confirmPreparation:true},weeklySelectionHash(p,[next.id])));actions++;}}
      p=this.content.get(planId);
      if(a.operations.materialize){const original=p.slots.filter(s=>eligible.includes(s.id)&&s.preparation?.taskId&&!s.campaignId&&!s.preparedId&&!s.production);
        if(original.length){const status=await this.bridge.run('status',{taskIds:original.map(s=>s.preparation!.taskId)});const ready=original.filter(s=>status.tasks?.some((t:any)=>t.taskId===s.preparation!.taskId&&['prepared','done'].includes(t.status))).map(s=>s.id);if(ready.length){await this.content.materialize(planId,{revision:this.content.get(planId).revision,slotIds:ready});actions++;}}}
      p=this.content.get(planId);const current=p.authorizations!.find(g=>g.id===a.id)!;
      const video=p.slots.find(s=>eligible.includes(s.id)&&s.production);if(video){try{const status=await this.bridge.run('videoAdmit',{planId,slotId:video.id});p=this.content.get(planId);p.slots.find(s=>s.id===video.id)!.production=status;repo.save(p,p.revision);}catch{/* Existing production retains its exact original recovery state. */}}
      if(a.imageBudget&&!current.state.imageIntent){this.saveState(planId,a.id,{imageIntent:'original_authorization_intent'});try{const result=await this.bridge.run('imageAuthorize',{id:a.id,planId,slotIds:a.imageBudget.slotIds,expectedHash:a.imageBudget.expectedHash,startsAt:a.issuedAt,expiresAt:a.expiresAt,maxTotalImages:a.imageBudget.maxTotalImages,maxImagesPer24Hours:a.imageBudget.maxImagesPer24Hours,maxPendingItems:a.imageBudget.maxPendingItems});this.saveState(planId,a.id,{imageResult:result});actions++;}catch(e){this.saveState(planId,a.id,{imageHold:message(e)});}}
      for(const g of a.groupScopes){p=this.content.get(planId);const scope=p.authorizations!.find(v=>v.id===a.id)!;if(scope.state.groups[g.slotId]||!p.slots.find(s=>s.id===g.slotId)?.preparedId)continue;try{await this.content.scheduleGroup(planId,{revision:p.revision,...g,confirmSchedule:true});p=this.content.get(planId);p.authorizations!.find(v=>v.id===a.id)!.state.groups[g.slotId]='existing_group_lane';repo.save(p,p.revision);actions++;}catch(e){p=this.content.get(planId);p.authorizations!.find(v=>v.id===a.id)!.state.groups[g.slotId]={hold:message(e)};repo.save(p,p.revision);}}
      this.content.outcomes(planId,{revision:this.content.get(planId).revision});
      this.saveState(planId,a.id,{phase:'advancing',hold:null});
      return {state:'weekly_advanced',planId,authorizationId:a.id,actions};
    }catch(e){this.saveState(planId,a.id,{hold:message(e)});return {state:'weekly_hold',planId,actions};}
    finally{this.saveState(planId,a.id,{leaseUntil:null,nextCheckAt:new Date(+this.clock()+60000).toISOString()});}
  }
}
function message(e:unknown){return redactContentSecrets(e instanceof Error?e.message:'Original weekly operation held; inspect its saved identity').slice(0,1500);}
export const weeklyBatchService=new WeeklyBatchService();
