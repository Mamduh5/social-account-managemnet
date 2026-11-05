import {createHash} from 'node:crypto';
import {ApiError,type JsonClient} from './http.js';

type JsonObject = Record<string, any>;
export interface PrepareReelInput {
  title: string;
  videoId: string;
  accountId: string;
  caption: string;
  hashtags?: string;
  scheduledAt?: string | null;
  selectedVariantId?: string | null;
  applyBranding?: boolean;
}
export interface ExactDraftInput {revision: number; accountId: string; payloadHash: string;}
export interface PrepareContentInput extends PrepareReelInput {categoryId?: string;}
export interface GeneralPreparation {title:string;contentType:'text'|'image'|'reel';videoId?:string;scheduledAt:null;destinations:Array<{accountId:string;caption:string;hashtags:string;attachments:Array<{mediaId:string;altText:string}>;applyBranding:boolean}>;}

function pick(value: JsonObject | undefined, keys: string[]): JsonObject {
  return Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value![key]]));
}
function queryString(query: Record<string, unknown>, keys: string[]): string {
  const params=new URLSearchParams();
  for(const key of keys) if(query[key]!==undefined && query[key]!==null && query[key]!=='') params.set(key,String(query[key]));
  return params.size?'?'+params.toString():'';
}
function canonical(value: any): any {
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));
  return value;
}
function draftPayload(draft: JsonObject): JsonObject {
  return {
    ...pick(draft,['title','contentType','assistantSource','videoId','scheduledAt']),
    destinations:(draft.destinations || []).map((destination:JsonObject)=>pick(destination,['accountId','caption','hashtags','linkUrl','attachments','selectedVariantId','applyBranding','brandingOverride'])),
  };
}
export function draftFingerprint(draft: JsonObject): string {
  return createHash('sha256').update(JSON.stringify(canonical({id:draft.id,revision:draft.revision,...draftPayload(draft)}))).digest('hex');
}
function compactDraft(draft: JsonObject): JsonObject {
  return {...pick(draft,['id','revision','status','approvedRevision','queuedPostId']),...draftPayload(draft),payloadHash:draftFingerprint(draft),timeZone:'Asia/Bangkok'};
}
function preparationBody(input:PrepareReelInput): JsonObject {
  if(!input || !input.accountId || !input.videoId || !input.title?.trim() || typeof input.caption!=='string') throw new Error('Reel preparation requires title, videoId, accountId and an agent-authored caption');
  if(input.scheduledAt && (!/(?:Z|[+-]\d{2}:\d{2})$/.test(input.scheduledAt) || !Number.isFinite(Date.parse(input.scheduledAt)))) throw new Error('Scheduled time requires explicit ISO timezone');
  return {title:input.title.trim(),contentType:'reel',videoId:input.videoId,scheduledAt:input.scheduledAt?new Date(input.scheduledAt).toISOString():null,
    destinations:[{accountId:input.accountId,caption:input.caption,hashtags:input.hashtags || '',attachments:[],
      applyBranding:input.applyBranding!==false,...(input.selectedVariantId!==undefined?{selectedVariantId:input.selectedVariantId}:{})}]};
}
function preparedResult(draft:JsonObject): JsonObject {
  return {draft:compactDraft(draft),payloadHash:draftFingerprint(draft),requiresOwnerApproval:true};
}
function resourceId(value:unknown): value is string {
  return typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);
}
function validDraft(value:unknown): value is JsonObject {
  const draft=value as JsonObject;
  return !!draft && typeof draft==='object' && !Array.isArray(draft) && resourceId(draft.id) && Number.isInteger(draft.revision) && draft.revision>0 &&
    typeof draft.status==='string' && typeof draft.title==='string' && typeof draft.contentType==='string' && Array.isArray(draft.destinations) && draft.destinations.length>0;
}
function postDraft(result:JsonObject,operation:string,expected:{id?:string;revision?:number;payload:JsonObject;status:string}):JsonObject {
  const draft=result?.draft;
  if(!validDraft(draft) || (expected.id!==undefined && draft.id!==expected.id) || (expected.revision!==undefined && draft.revision!==expected.revision) ||
    draft.status!==expected.status || JSON.stringify(canonical(draftPayload(draft)))!==JSON.stringify(canonical(expected.payload))) {
    throw new ApiError(200,'invalid_scc_'+operation+'_response',true);
  }
  return draft;
}
function pageOptions(options:{limit?:number;offset?:number}):{limit:number;offset:number} {
  const limit=options.limit ?? 20,offset=options.offset ?? 0;
  if(!Number.isInteger(limit) || limit<1 || limit>100 || !Number.isSafeInteger(offset) || offset<0) throw new Error('Use limit 1-100 and a nonnegative integer offset');
  return {limit,offset};
}
const kitKeys=['mode','watermarkType','text','movementPreset','speedSeconds','intervalSeconds','fontSize','opacity','fontColor','safeArea','enableSignature','signatureText'];
const capabilityKeys=['canReadProfile','canPublish','canSchedule','canReadPostMetrics','canReadInsights','canReadComments','canReply','canReact','canReceiveEvents','requiresManualConfirmation','reason'];
function compactAccount(account:JsonObject): JsonObject {
  return {...pick(account,['id','name','handle','platform','account_type','category_id','category_name','connection_status','identity_verified_at','is_demo']),
    capabilities:pick(account.capabilities,capabilityKeys),brandKit:pick(account.brandKit,kitKeys)};
}
function compactVoice(voice:JsonObject):JsonObject {
  const p=voice.profile??{},take=(key:string,n:number)=>Array.isArray(p[key])?p[key].slice(0,n):[];
  return {revision:voice.revision,profile:{...pick(p,['editorialPurpose','language','tone','typicalLength','humor','emojiPreference','hashtagPreference','provisional']),
    editorialSubjects:take('editorialSubjects',8),preferredPhrases:take('preferredPhrases',5),
    // Preserve every prohibition. Examples/facts are excerpts; never truncate a fact mid-sentence.
    prohibitedPhrases:take('prohibitedPhrases',30),approvedExamples:take('approvedExamples',1),approvedFacts:take('approvedFacts',4),faqAnswers:take('faqAnswers',2)},
    excerpt:true,notice:'Use only supplied facts. Additional voice examples/facts were omitted when present; prohibitions are retained.'};
}

/** HTTP-only adapter. It never imports the owner database, starts workers, or invokes an AI provider. */
export class SccAdapter {
  constructor(readonly client: JsonClient) {}

  async pageContext(accountId:string):Promise<JsonObject> {
    const data=await this.client.get<JsonObject>('/api/operator/pages/'+encodeURIComponent(accountId)+'/context');
    // This server-owned endpoint accepts only active real Facebook Pages. Its
    // DTO exposes verified Graph identity, not raw platform/account_type fields.
    if(data.account?.id!==accountId || !/^\d+$/.test(String(data.account.graphId??'')) || !data.account.identityVerifiedAt || !data.contextFingerprint || !Array.isArray(data.rules))throw new Error('Verified real Facebook Page context required');
    return {...pick(data,['account','brandKit','contextFingerprint','rules','notice']),voice:compactVoice(data.voice??{})};
  }

  /** Explicit portrait render for a reviewed Gemini production item; account defaults are untouched. */
  async brandProduction(videoId:string,accountId:string,onIntent?:(intent:JsonObject)=>void):Promise<JsonObject> {
    const context=await this.pageContext(accountId),media=await this.media(videoId);
    if(media.width*16!==media.height*9 || Math.abs(media.duration-10)>0.15 || !media.provenance.sha256)throw new Error('Expected verified ten-second portrait master');
    const brandKit={mode:'moving',watermarkType:'moving_text',text:context.account.name,movementPreset:'corner_jump',intervalSeconds:3,fontSize:36,opacity:0.6,fontColor:'white',safeArea:{top:180,bottom:420,left:90,right:180}};
    onIntent?.({videoId,accountId,graphId:context.account.graphId,sourceSha256:media.provenance.sha256,brandKit,presetName:'Gemini standalone portrait'});
    const result=await this.client.post<JsonObject>('/api/branding/render-preview',{videoId,brandKit,presetName:'Gemini standalone portrait'});
    if(!resourceId(result.variantId) || !/^[a-f0-9]{64}$/.test(result.sha256??''))throw new ApiError(200,'invalid_branding_response',true);
    const updated=await this.media(videoId),variant=updated.variants.find((v:JsonObject)=>v.id===result.variantId);
    if(updated.provenance.sha256!==media.provenance.sha256 || !variant || variant.sha256!==result.sha256 || variant.width*16!==variant.height*9 || Math.abs(variant.duration-10)>0.15)throw new ApiError(200,'unverified_branding_variant',true);
    return {variantId:variant.id,sha256:variant.sha256,contextFingerprint:context.contextFingerprint,brandKit};
  }
  async reconcileProductionBrand(variantId:string,intent:JsonObject):Promise<JsonObject>{
    const context=await this.pageContext(intent.accountId),media=await this.media(intent.videoId),raw=await this.client.get<JsonObject>('/api/publishing/videos/'+encodeURIComponent(intent.videoId));
    const v=raw.video?.branded_variants?.find((v:JsonObject)=>v.id===variantId);let kit:JsonObject;try{kit=typeof v?.brand_kit_json==='string'?JSON.parse(v.brand_kit_json):v?.brand_kit_json;}catch{throw new Error('Original render metadata unavailable');}
    const contains=(a:any,b:any):boolean=>b&&typeof b==='object'?Object.entries(b).every(([k,x])=>contains(a?.[k],x)):a===b;
    if(context.account.graphId!==intent.graphId||media.provenance.sha256!==intent.sourceSha256||v?.video_id!==intent.videoId||v?.preset_name!==intent.presetName||!contains(kit,intent.brandKit)||!/^[a-f0-9]{64}$/.test(v?.sha256??'')||v.width*16!==v.height*9||Math.abs(v.duration-10)>0.15)throw new Error('Variant differs from the saved original master, Page or branding intent');
    return {variantId:v.id,sha256:v.sha256,reconciled:true};
  }

  async verifyReviewVariant(videoId:string,variantId:string,accountId:string):Promise<JsonObject>{
    const [context,raw]=await Promise.all([this.pageContext(accountId),this.client.get<JsonObject>('/api/publishing/videos/'+encodeURIComponent(videoId))]);
    const v=raw.video?.branded_variants?.find((x:JsonObject)=>x.id===variantId);let kit:JsonObject;try{kit=typeof v?.brand_kit_json==='string'?JSON.parse(v.brand_kit_json):v?.brand_kit_json;}catch{throw new Error('Variant branding proof unavailable');}
    if(v?.video_id!==videoId||kit?.text!==context.account.name||kit?.mode!=='moving'||kit?.watermarkType!=='moving_text'||!['corner_jump','smooth_sine','diagonal_bounce'].includes(kit?.movementPreset)||kit?.safeArea?.top<120||kit?.safeArea?.bottom<280||kit?.safeArea?.right<120||!Number.isFinite(kit?.safeArea?.top)||!Number.isFinite(kit?.safeArea?.bottom)||!Number.isFinite(kit?.safeArea?.right)||v.width*16!==v.height*9||Math.abs(v.duration-10)>.15||!/^[a-f0-9]{64}$/.test(v.sha256??''))throw new Error('Choose a portrait moving-text variant with the exact Page name and required safe areas');
    return {id:v.id,sha256:v.sha256,accountId,graphId:context.account.graphId};
  }

  /** Reuse the Content Assistant voice and operator library; no model call. */
  async preparationContext(accountId:string):Promise<JsonObject> {
    const data=await this.client.get<JsonObject>('/api/operator/pages/'+encodeURIComponent(accountId)+'/context');
    if(data.account?.id!==accountId || !data.contextFingerprint || !data.voice || !Array.isArray(data.rules))throw new Error('Incomplete Page preparation context');
    const media=data.media??{};
    return {...pick(data,['account','rules','contextFingerprint','notice']),voice:compactVoice(data.voice),media:{
      images:(media.images??[]).slice(0,5).map((r:JsonObject)=>pick(r,['id','name','width','height','sha256'])),
      videos:(media.videos??[]).slice(0,5).map((r:JsonObject)=>pick(r,['id','title','width','height','duration','categoryId']))},
      mediaTruncated:(media.images?.length??0)>5||(media.videos?.length??0)>5};
  }

  async groups(accountId?:string):Promise<JsonObject[]> {
    const data=await this.client.get<JsonObject>('/api/groups'+queryString({accountId,archived:false},['accountId','archived']));
    if(!Array.isArray(data.groups))throw new Error('Invalid Group context');
    return data.groups.slice(0,20).map(compactGroup);
  }
  async group(id:string):Promise<JsonObject> {
    const data=await this.client.get<JsonObject>('/api/groups/'+encodeURIComponent(id)+'/review');
    if(data.group?.id!==id)throw new Error('Group identity mismatch');return compactGroup(data.group);
  }
  async groupPackage(id:string):Promise<JsonObject> {
    return this.client.get<JsonObject>('/api/groups/prepared/'+encodeURIComponent(id)+'/package');
  }
  async prepareGeneral(body:GeneralPreparation):Promise<JsonObject> {
    const result=await this.client.post<JsonObject>('/api/publishing/drafts',body);
    const draft=postDraft(result,'prepare',{payload:body,status:'draft'});
    if(draft.approvedRevision || draft.queuedPostId || draft.scheduledAt!==null)throw new ApiError(200,'invalid_scc_prepare_response',true);
    return preparedResult(draft);
  }
  async prepareGroup(groupId:string,body:JsonObject):Promise<JsonObject> {
    const result=await this.client.post<JsonObject>('/api/groups/'+encodeURIComponent(groupId)+'/prepared',body);
    const p=result.prepared;
    if(!resourceId(p?.id)||p.group_id!==groupId||p.kind!=='post'||p.content!==body.content||p.status!=='prepared'||p.handoffContext?.group?.revision!==body.revision)
      throw new ApiError(200,'invalid_group_prepare_response',true);
    return {prepared:p,publicationVerified:false,automaticPosting:false};
  }

  async context(accountId?: string,options:{limit?:number;offset?:number}={}): Promise<JsonObject> {
    const {limit,offset}=pageOptions(options);
    const [accountsResult,categoriesResult]=await Promise.all([
      this.client.get<JsonObject>('/api/accounts'),this.client.get<JsonObject>('/api/accounts/categories'),
    ]);
    const accounts=(accountsResult.accounts || []).filter((account:JsonObject)=>!account.archived_at).map(compactAccount);
    const result:JsonObject={accounts:accounts.slice(offset,offset+limit),totalAccounts:accounts.length,offset,limit,hasMore:offset+limit<accounts.length,
      categories:(categoriesResult.categories || []).map((category:JsonObject)=>pick(category,['id','name','slug','description','color'])),draftOnly:true};
    if(accountId) {
      const account=accounts.find((value:JsonObject)=>value.id===accountId);
      if(!account) throw new Error('Active SCC account not found');
      result.accounts=[account];result.totalAccounts=1;result.offset=0;result.hasMore=false;
      result.selectedAccount=account;
      if(account.platform==='facebook' && account.account_type==='page' && !account.is_demo) {
        const context=await this.client.get<JsonObject>('/api/operator/pages/'+encodeURIComponent(accountId)+'/context');
        result.pageContext=pick(context,['account','voice','brandKit','brandingFingerprint','contextFingerprint','rules','notice']);
      }
    }
    return result;
  }

  async pipelineOrigin(): Promise<string> {
    const status=await this.client.get<JsonObject>('/api/pipeline/status?limit=1');
    const url=new URL(status.apiUrl);
    if(url.username || url.password || !['http:','https:'].includes(url.protocol)) throw new Error('Invalid SCC Pipeline source URL');
    return url.origin+url.pathname.replace(/\/+$/,'');
  }

  async discover(query: Record<string,unknown>={}): Promise<JsonObject> {
    const result=await this.client.get<JsonObject>('/api/pipeline/jobs'+queryString(query,['q','status','aspectRatio','importState','sort','limit','cursor']));
    return {...pick(result,['count','totalMatched','page','sourceContract','historyComplete','incompleteReason','error','errorKind']),
      jobs:(result.jobs || []).map((job:JsonObject)=>pick(job,['jobId','title','topic','status','displayStatus','aspectRatio','durationSeconds','videoUrl','thumbnailUrl','storageState','storageLabel','isImported','importedVideoId','importEligible','ineligibleReason','createdAt','updatedAt','incompleteMetadata','tags','provider','workflow']))};
  }

  async importVideo(projectId:string,categoryId?:string,title?:string): Promise<JsonObject> {
    if(!projectId?.trim()) throw new Error('Pipeline project ID is required');
    const result=await this.client.post<JsonObject>('/api/pipeline/import-job',{jobId:projectId,categoryId,title});
    if(result?.success!==true || !resourceId(result.videoId) || typeof result.alreadyExisted!=='boolean') throw new ApiError(200,'invalid_scc_import_response',true);
    return pick(result,['success','videoId','alreadyExisted']);
  }

  async media(videoId:string): Promise<JsonObject> {
    const result=await this.client.get<JsonObject>('/api/publishing/videos/'+encodeURIComponent(videoId));
    const video=result.video;if(!video) throw new Error('SCC did not return video metadata');
    let metadata:JsonObject={};
    try {metadata=typeof video.metadata_json==='string'?JSON.parse(video.metadata_json):video.metadata || {};} catch {throw new Error('SCC video provenance metadata is invalid');}
    return {...pick(video,['id','title','source_type','pipeline_job_id','category_id','duration','width','height','aspect_ratio','file_size','streamUrl']),
      provenance:pick(metadata,['sha256','source','upstreamJobId','pipelineSourceFingerprint','hasAudio','videoCodec','audioCodec']),
      quality:pick(metadata,['acceptance_type','acceptanceType','creative_acceptance','creativeAcceptance','creative_review','creativeReview','conformance_status','conformanceStatus','resolution','generation_resolution']),
      qualityNotice:'Only persisted import metadata is reported. Missing conformance or creative acceptance remains unknown; library presence is not creative approval.',
      variants:(video.branded_variants || []).map((variant:JsonObject)=>pick(variant,['id','preset_name','duration','width','height','aspect_ratio','file_size','sha256','previewUrl','downloadUrl']))};
  }

  async prepare(input:PrepareReelInput): Promise<JsonObject> {
    const body=preparationBody(input);
    const result=await this.client.post<JsonObject>('/api/publishing/drafts',body);
    const draft=postDraft(result,'prepare',{payload:body,status:'draft'});
    if(draft.approvedRevision || draft.queuedPostId) throw new ApiError(200,'invalid_scc_prepare_response',true);
    return preparedResult(draft);
  }

  async getDraft(draftId:string): Promise<JsonObject> {
    const result=await this.client.get<JsonObject>('/api/publishing/drafts/'+encodeURIComponent(draftId));
    if(!validDraft(result?.draft) || result.draft.id!==draftId) throw new ApiError(200,'invalid_scc_draft_response',false);
    return result.draft;
  }

  async editReviewDraft(draftId:string,revision:number,caption:string,hashtags:string,variantId:string):Promise<JsonObject>{
    const draft=await this.getDraft(draftId);if(draft.revision!==revision||draft.queuedPostId||draft.destinations?.length!==1||draft.contentType!=='reel')throw new ApiError(409,'review_draft_revision_changed',false);
    const body={...draftPayload(draft),revision,destinations:[{...draft.destinations[0],caption,hashtags,selectedVariantId:variantId,applyBranding:false}]};
    const result=await this.client.put<JsonObject>('/api/publishing/drafts/'+encodeURIComponent(draftId),body);
    if(result?.draft?.id!==draftId||result.draft.revision!==revision+1||result.draft.approvedRevision||result.draft.queuedPostId)throw new ApiError(200,'unconfirmed_review_edit',true);return result.draft;
  }

  async review(draftId:string): Promise<JsonObject> {
    return preparedResult(await this.getDraft(draftId));
  }

  async reconcileDraft(draftId:string,expected:PrepareContentInput): Promise<JsonObject> {
    const draft=await this.getDraft(draftId);
    if(draft.status!=='draft' || draft.approvedRevision || draft.queuedPostId) throw new Error('Reconcile only an unapproved, unqueued draft from the original preparation intent');
    const body=preparationBody(expected);
    if(JSON.stringify(canonical(draftPayload(draft)))!==JSON.stringify(canonical(body))) throw new Error('Draft does not match the exact original preparation intent');
    return {...preparedResult(draft),reconciled:true};
  }

  private async exact(draftId:string,input:ExactDraftInput): Promise<JsonObject> {
    if(!Number.isInteger(input?.revision) || input.revision<1 || !input.accountId || !/^[a-f0-9]{64}$/.test(input.payloadHash || '')) throw new Error('Exact review requires revision, accountId and payloadHash');
    const draft=await this.getDraft(draftId);
    if(draft.revision!==input.revision || draft.destinations?.length!==1 || draft.destinations[0].accountId!==input.accountId || draftFingerprint(draft)!==input.payloadHash) throw new Error('Draft changed since review; review the exact current revision, account, content and schedule');
    return draft;
  }

  async approve(draftId:string,input:ExactDraftInput): Promise<JsonObject> {
    const draft=await this.exact(draftId,input);
    if(['approved','queued'].includes(draft.status) && draft.approvedRevision===input.revision) return {draft:compactDraft(draft),reused:true};
    const result=await this.client.post<JsonObject>('/api/publishing/drafts/'+encodeURIComponent(draftId)+'/approve',{revision:input.revision});
    const approved=postDraft(result,'approve',{id:draftId,revision:input.revision,payload:draftPayload(draft),status:'approved'});
    if(approved.approvedRevision!==input.revision || approved.queuedPostId) throw new ApiError(200,'invalid_scc_approve_response',true);
    return {draft:compactDraft(approved),reused:false};
  }

  async queue(draftId:string,input:ExactDraftInput): Promise<JsonObject> {
    const draft=await this.exact(draftId,input);
    if(draft.status==='queued' && draft.queuedPostId && draft.approvedRevision===input.revision) return {draft:compactDraft(draft),postId:draft.queuedPostId,reused:true};
    if(draft.status!=='approved' || draft.approvedRevision!==input.revision) throw new Error('Approve the exact current draft before queueing');
    const result=await this.client.post<JsonObject>('/api/publishing/drafts/'+encodeURIComponent(draftId)+'/queue',{revision:input.revision});
    const queued=postDraft(result,'queue',{id:draftId,revision:input.revision,payload:draftPayload(draft),status:'queued'});
    if(!resourceId(result?.postId) || result.postId!==queued.queuedPostId || queued.approvedRevision!==input.revision) throw new ApiError(200,'invalid_scc_queue_response',true);
    return {postId:result.postId,draft:compactDraft(queued),reused:false};
  }

  async analytics(accountId?:string,destinationId?:string,options:{limit?:number;offset?:number}={}): Promise<JsonObject> {
    const {limit,offset}=pageOptions(options);
    if(destinationId) {
      const result=await this.client.get<JsonObject>('/api/analytics/videos/'+encodeURIComponent(destinationId)+'/history');
      const history=result.history || [];
      return {destinationId,history:history.slice(offset,offset+limit).map((row:JsonObject)=>pick(row,['id','destination_id','account_id','view_count','like_count','comment_count','share_count','observed_at','source','provenance_status','status_detail','notes'])),
        total:history.length,offset,limit,hasMore:offset+limit<history.length,missingStatisticsAreZero:false};
    }
    const result=await this.client.get<JsonObject>('/api/analytics/videos'+queryString({accountId},['accountId']));
    const videos=(result.videos || []).map((row:JsonObject)=>{
      const projected=pick(row,['destination_id','post_id','video_id','video_title','account_id','account_name','platform','published_at','observed_at','source','provenance_status','status_detail']);
      for(const key of ['views','likes','comments','shares']) projected[key]=row.provenance_status==='confirmed' && typeof row[key]==='number' && Number.isFinite(row[key])?row[key]:null;
      return projected;
    });
    const ranked=videos.filter((row:JsonObject)=>row.views!==null).sort((a:JsonObject,b:JsonObject)=>b.views-a.views);
    return {videos:videos.slice(offset,offset+limit),total:videos.length,offset,limit,hasMore:offset+limit<videos.length,
      rankingByConfirmedViews:ranked.slice(offset,offset+limit).map((row:JsonObject)=>({destinationId:row.destination_id,views:row.views})),
      lowestConfirmedViews:[...ranked].reverse().slice(offset,offset+limit).map((row:JsonObject)=>({destinationId:row.destination_id,views:row.views})),
      totalConfirmedRanked:ranked.length,rankingHasMore:offset+limit<ranked.length,rankingScope:'all_saved_confirmed',unavailableViews:videos.length-ranked.length,missingStatisticsAreZero:false,
      interpretation:'Relative cumulative view ranking among confirmed observations only; not a causal lesson or daily gain.'};
  }

  async history(query:Record<string,unknown>={}): Promise<JsonObject> {
    const result=await this.client.get<JsonObject>('/api/publishing/history'+queryString(query,['status','outcome','platform','timestamp','period','date','fromDate','toDate','direction','limit','offset']));
    return {...pick(result,['total','limit','offset','hasMore','timestamp','direction','startAt','endAt']),items:(result.items || []).map((row:JsonObject)=>pick(row,['id','post_id','account_id','account_name','platform','post_title','content_type','status','progress','error_message','retry_count','scheduled_at','published_at','remote_post_id','remote_post_url','confirmation_source','verification_status','submission_state','updated_at']))};
  }

  /** Existing SCC route returns the full post list; only this exact publication is exposed. */
  async publication(postId:string): Promise<JsonObject> {
    if(!resourceId(postId)) throw new Error('A valid saved SCC post ID is required');
    const result=await this.client.get<JsonObject>('/api/publishing/posts');
    if(!Array.isArray(result?.posts)) throw new ApiError(200,'invalid_scc_publication_response',false);
    const matches=result.posts.filter((post:JsonObject)=>post?.id===postId);
    if(!matches.length) return {post:null,status:'unavailable',reason:'saved_post_not_found',postId};
    const post=matches[0];
    if(matches.length!==1 || !Array.isArray(post.destinations) || post.destinations.some((destination:JsonObject)=>!destination || destination.post_id!==postId)) throw new ApiError(200,'invalid_scc_publication_response',false);
    return {post:{...pick(post,['id','video_id','content_type','title','status','scheduled_at','created_at','updated_at']),
      destinations:post.destinations.map((destination:JsonObject)=>({...pick(destination,['id','post_id','account_id','account_name','account_handle','platform','is_demo','content_type','status','progress','error_message','retry_count','max_retries','remote_post_id','remote_post_url','published_at','confirmation_source','verification_status','submission_state','created_at','updated_at']),scheduled_at:post.scheduled_at ?? null}))}};
  }
}

function compactGroup(group:JsonObject):JsonObject {
  return {...pick(group,['id','name','url','identity_type','account_id','membership','category','notes','rules','rules_reviewed_at','reviewedAt','revision','eligibility','readiness','archivedAt']),source:'owner_entered',permissionVerified:false,automationSupported:false};
}
