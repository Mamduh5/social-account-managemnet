import {createHash} from 'node:crypto';
import {db} from '../db/database.js';
import {accountsRepo} from '../repositories/accounts.repo.js';
import {contentWorkspaceRepo} from '../repositories/content-workspace.repo.js';
import {generalPostsRepo} from '../repositories/general-posts.repo.js';
import {publishingRepo} from '../repositories/publishing.repo.js';
import {getConnector} from '../connectors/registry.js';
import {redactContentValue, textValue, assistantRules} from '../domain/content-assistant.js';
import {campaignPlanSchema} from '../domain/content-calendar.js';
import {calendarService} from './calendar.service.js';
import {imageDto} from './image-media.service.js';

const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** External creative operators prepare drafts through the same validation as the UI.
 * This service never invokes a model, approves, queues, or calls a social provider. */
export class OperatorWorkspaceService {
  context(accountId:string) {
    calendarService.requireReady();
    const row=accountsRepo.getAccountById(accountId);
    if(!row || row.archived_at || row.is_demo || row.platform!=='facebook' || row.account_type!=='page') throw new Error('Select an active real Facebook Page');
    const account={id:row.id,name:row.name,handle:row.handle,graphId:row.external_id,
      identityVerifiedAt:row.identity_verified_at,connectionRevision:row.connection_revision,
      connectionStatus:row.connection_status,capabilities:getConnector(row).getCapabilities()};
    const voice=contentWorkspaceRepo.profile(accountId);
    const rawBrandKit=JSON.parse(row.brand_kit_json || '{}');
    const brandKit=Object.fromEntries(['mode','watermarkType','text','movementPreset','speedSeconds','intervalSeconds','fontSize','opacity','fontColor','safeArea','enableSignature','signatureText'].filter(key=>rawBrandKit[key]!==undefined).map(key=>[key,rawBrandKit[key]]));
    // Explicit allowlists: no credentials, local file paths or private pipeline metadata.
    const images=generalPostsRepo.images().map(imageDto).map((im:any)=>({id:im.id,name:im.original_filename,width:im.width,height:im.height,sha256:im.sha256,previewUrl:im.previewUrl}));
    const videos=publishingRepo.getAllVideos().map(v=>({id:v.id,title:v.title,width:v.width,height:v.height,duration:v.duration,categoryId:v.category_id}));
    const identity=redactContentValue({account,voice,brandKit,brandingFingerprint:fingerprint(rawBrandKit)});
    return {...identity,media:redactContentValue({images,videos}),
      contextFingerprint:fingerprint(identity),
      campaigns:calendarService.getCampaigns(accountId),rules:assistantRules,
      notice:'External operator context. Library presence is not media approval. Select suitable media and obtain owner approval of the exact draft. No model, publication or scheduling is invoked.'};
  }

  prepare(input:any) {
    const parsed=campaignPlanSchema.parse(input.plan);
    const context=this.context(parsed.accountId);
    if(input.contextFingerprint!==context.contextFingerprint) throw new Error('Page identity, voice or branding changed; reload operator context before preparing');
    const label=textValue(input.operatorLabel || 'External operator','Operator label',100,true);
    const runId=textValue(input.operatorRunId || '', 'Operator run ID',200);
    // A caller-supplied ID provides durable idempotency after uncertain local responses.
    if(!parsed.id) throw new Error('A stable campaign ID is required to prevent duplicate imports');
    const provenance={operatorLabel:label,operatorRunId:runId,verifiedByApplication:false,contextFingerprint:context.contextFingerprint,accountId:parsed.accountId,requestHash:fingerprint(parsed)};
    return db.transaction(()=>{
      const prior=contentWorkspaceRepo.auditTrail(parsed.id!) as any[];
      const recorded=prior.find(a=>a.action==='external_plan_prepared');
      if(recorded) {
        const details=JSON.parse(recorded.detail_json);
        if(details.requestHash!==provenance.requestHash || details.accountId!==parsed.accountId) throw new Error('Campaign ID already belongs to a different prepared payload');
        return {campaign:calendarService.getCampaignById(parsed.id!),items:calendarService.getCalendarItems({campaignId:parsed.id}),reused:true};
      }
      const saved=calendarService.createCampaignPlan(parsed);
      contentWorkspaceRepo.audit(saved.campaign.id,'external_plan_prepared',null,provenance);
      const campaign=calendarService.submitCampaignForApproval(saved.campaign.id);
      return {...saved,campaign,reused:false};
    })();
  }
}
export const operatorWorkspaceService=new OperatorWorkspaceService();
