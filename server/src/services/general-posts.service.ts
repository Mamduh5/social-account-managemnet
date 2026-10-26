import {contentWorkspaceRepo} from '../repositories/content-workspace.repo.js';
import {createHash,randomUUID} from 'node:crypto';
import {normalizeDraft,type DraftInput} from '../domain/general-posts.js';
import {generalPostsRepo as repo} from '../repositories/general-posts.repo.js';
import {publishingRepo} from '../repositories/publishing.repo.js';
import {accountsRepo} from '../repositories/accounts.repo.js';
import {getConnector} from '../connectors/registry.js';
import {imageById,verifiedImagePath} from './image-media.service.js';
import {publishingService} from './publishing.service.js';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function pagePostCapabilities(account:any) {
  const caps=account&&!account.archived_at?getConnector(account).getCapabilities():null;
  const supportedPostTypes=account?.platform==='facebook'&&account?.account_type==='page'&&caps?.canPublish?['text','image','multi_image','link','reel']:(caps?.canPublish?['reel']:[]);
  return {supportedPostTypes,reason:supportedPostTypes.length?undefined:'Official Page publishing authorization is required. TikTok publishing remains unavailable.'};
}
export function draftDto(row:any){if(!row)return null;return {...JSON.parse(row.payload_json),id:row.id,revision:row.revision,status:row.status,approvedRevision:row.approved_revision,queuedPostId:row.queued_post_id,createdAt:row.created_at,updatedAt:row.updated_at};}
export class GeneralPostsService {
  requireReady(){if(!repo.ready())throw new Error('V1.10 requires the explicit offline maintenance migration');}
  validate(raw:unknown):DraftInput {
    const data=normalizeDraft(raw);
    for(const d of data.destinations){
      const account=accountsRepo.getAccountById(d.accountId) as any;
      if(!account||account.archived_at)throw new Error('Select an active registered destination account');
      if(data.contentType!=='reel'&&(account.platform!=='facebook'||account.account_type!=='page'))throw new Error('General posts are supported only for Facebook Pages');
      if(data.contentType==='reel'&&d.selectedVariantId&&d.selectedVariantId!=='original'){
        const variant=publishingRepo.getBrandedVideoById(d.selectedVariantId);
        if(!variant||variant.video_id!==data.videoId)throw new Error('Branded variant does not belong to the selected master video');
      }
      for(const a of d.attachments){const image=imageById(a.mediaId);if(!image)throw new Error('Image not found');verifiedImagePath(image);}
    }
    if(data.contentType==='reel'&&!publishingRepo.getVideoById(data.videoId!))throw new Error('Video not found');
    return data;
  }
  list(){this.requireReady();return repo.list().map(draftDto);}
  get(id:string){this.requireReady();const row=repo.get(id);if(!row)throw new Error('Draft not found');return draftDto(row);}
  save(raw:unknown,id?:string,revision?:number){
    this.requireReady();const data=this.validate(raw),draftId=id||'draft-'+randomUUID();
    if(id&&(!Number.isInteger(revision)||revision!<1))throw new Error('Current draft revision is required');
    return repo.transaction(()=>{
    let lineage:any={};
    if(id){
      const existing=repo.get(id);if(!existing)throw new Error('Draft not found');
      // Origin is immutable; subsequent editable revisions retain their original source.
      const original=JSON.parse(existing.payload_json).assistantSource;
      if(original)data.assistantSource=original;else delete data.assistantSource;
    }else if(data.assistantSource){
      const origin=contentWorkspaceRepo.draft(data.assistantSource.draftId);
      if(!origin||origin.kind==='reply'||origin.status!=='approved'||origin.revision!==data.assistantSource.revision||origin.approved_revision!==origin.revision||data.destinations.length!==1||data.destinations[0].accountId!==origin.account_id||data.destinations[0].caption!==origin.content)throw new Error('Assistant transfer requires the exact approved source revision, text and destination');
      lineage={assistantSource:data.assistantSource,sourceContextHash:hash(origin.context_json),sourceOutputHash:hash(origin.content),provider:origin.provider,source:origin.source};
    }
    repo.save(draftId,data,id?revision:undefined);const row=repo.get(draftId);repo.audit(draftId,row.revision,id?'edited':'created',hash(row.payload_json),lineage);return draftDto(row);});
  }
  approveBatch(items:{id:string,revision:number}[],campaignContext?:{campaignId:string}){
    this.requireReady();if(!Array.isArray(items)||!items.length||items.length>50)throw new Error('Select 1–50 draft revisions');
    return repo.transaction(()=>items.map(item=>{
      const row=repo.get(item.id);if(!row||row.revision!==item.revision||row.status==='queued')throw new Error('Draft changed or already queued');
      if(row.campaign_id!== (campaignContext?.campaignId || null) && (row.campaign_id || campaignContext))throw new Error('Use campaign batch approval for campaign drafts');
      const data=this.validate(JSON.parse(row.payload_json));
      for(const d of data.destinations){if(!pagePostCapabilities(accountsRepo.getAccountById(d.accountId)).supportedPostTypes.includes(data.contentType))throw new Error('Destination does not support this post type');}
      repo.approve(item.id,item.revision,hash(row.payload_json));repo.audit(item.id,item.revision,'approved',hash(row.payload_json),{accountIds:data.destinations.map(d=>d.accountId)});return draftDto(repo.get(item.id));
    }));
  }
  reject(id:string,revision:number){this.requireReady();return repo.transaction(()=>{const row=repo.get(id);if(!row)throw new Error('Draft not found');repo.reject(id,revision);repo.audit(id,revision,'rejected',hash(row.payload_json));return draftDto(repo.get(id));});}
  queue(id:string,revision:number,campaignContext?:{campaignId:string}){
    this.requireReady();return repo.transaction(()=>{
      const row=repo.get(id);
      if(row && row.campaign_id!== (campaignContext?.campaignId || null) && (row.campaign_id || campaignContext))throw new Error('Use campaign batch approval to queue campaign drafts');
      if(!row||row.status!=='approved'||row.revision!==revision||row.approved_revision!==revision||row.approved_hash!==hash(row.payload_json))throw new Error('Approve the exact current content revision and destinations before scheduling');
      const data=this.validate(JSON.parse(row.payload_json));
      if(data.scheduledAt&&Date.parse(data.scheduledAt)<=Date.now())throw new Error('Scheduled time must be a valid future date');
      for(const d of data.destinations)if(!pagePostCapabilities(accountsRepo.getAccountById(d.accountId)).supportedPostTypes.includes(data.contentType))throw new Error('Destination publishing capability is unavailable');
      let postId:string;
      if(data.contentType==='reel'){
        postId=publishingService.createPost({videoId:data.videoId!,title:data.title,scheduledAt:data.scheduledAt,destinations:data.destinations}).postId;
        const destinations=publishingRepo.getPostDestinationRows(postId);
        for(const d of destinations)repo.attach(d.id,'reel',null,id,revision,[]);
      }else{
        postId='post-'+randomUUID();
        const destinations=data.destinations.map(d=>({id:'dest-'+randomUUID(),accountId:d.accountId,caption:d.caption,hashtags:d.hashtags,applyBranding:0,status:(data.scheduledAt?'scheduled':'preparing') as 'scheduled'|'preparing'}));
        publishingRepo.createPostWithDestinations({postId,videoId:null,title:data.title,scheduledAt:data.scheduledAt,postStatus:data.scheduledAt?'scheduled':'processing',destinations});
        repo.setPostType(postId,data.contentType);
        destinations.forEach((d,i)=>repo.attach(d.id,data.contentType,data.destinations[i].linkUrl||null,id,revision,data.destinations[i].attachments));
      }
      repo.queued(id,revision,postId);repo.audit(id,revision,'queued',hash(row.payload_json),{postId,scheduledAt:data.scheduledAt,timeZone:'Asia/Bangkok'});
      return {draft:draftDto(repo.get(id)),postId};
    });
  }
}
export const generalPostsService=new GeneralPostsService();
