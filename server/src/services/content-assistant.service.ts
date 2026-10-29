import {configuredAssistantProvider,AssistantProviderError} from './assistant-provider.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { contentWorkspaceRepo as repo } from '../repositories/content-workspace.repo.js';
import { assistantRules, FixtureAssistantProvider, UnavailableAssistantProvider, redactContentSecrets, redactContentValue, textValue, type AssistantProvider, type AssistantGenerationMetadata, type AssistantRequest, type DraftKind, type OwnerVoiceProfile } from '../domain/content-assistant.js';
import { getConnector } from '../connectors/registry.js';
import { createHash } from 'node:crypto';

const kinds: DraftKind[] = ['post', 'rewrite', 'caption', 'reply'];
export class AssistantBatchPartialError extends Error {
  constructor(readonly drafts: ReturnType<typeof repo.insertDraft>[],readonly failedIndex:number,readonly notAttempted:number,reason:string) {
    super(`${drafts.length} drafts were saved before the batch stopped. ${reason} No automatic retry was made.`);
  }
}
function account(id: unknown) {
  if (typeof id !== 'string') throw new Error('Select an account');
  const row = accountsRepo.getAccountById(id);
  if (!row || row.archived_at) throw new Error('Active account not found');
  if (row.platform !== 'facebook' || row.account_type !== 'page') throw new Error('Content assistance currently supports Facebook Pages only');
  return row;
}
function reviewFlags(text: string) {
  const flags: string[] = [];
  if (/complain|refund|legal|medical|diagnos|guarantee|promise|refund|fraud|lawsuit|ร้องเรียน|คืนเงิน|รับประกัน|สัญญา|รักษา|สุขภาพ|คดี|แพ้|เจ็บ/i.test(text)) flags.push('Complaint, commitment or sensitive topic: owner review required.');
  if (/\?|ไหม|หรือเปล่า|เมื่อไหร่|เท่าไร/.test(text)) flags.push('Question: verify the answer against approved facts.');
  if (/ignore.*instruction|system prompt|access_token|secret|password|publish|send reply|เผยแพร่|รหัสผ่าน/i.test(text)) flags.push('Untrusted action or credential request detected; no action was taken.');
  return flags;
}
export class ContentAssistantService {
  private reserved = 0;
  constructor(private provider: AssistantProvider = new UnavailableAssistantProvider()) {}
  get activeGenerations(){return this.reserved;}

  status() {
    return { provider: this.provider.id, model:this.provider.model || null, configurationNotice:this.provider.configurationNotice || null, generationAvailable: this.provider.available, fixture: this.provider.fixture,
      canInspectMedia: this.provider.canInspectMedia, draftOnly: true, autonomousOutboundEnabled: false,
      automaticRepliesEnabled: false, limits: repo.limits(), notice: this.provider.fixture ? 'TEST FIXTURE — NOT AI OUTPUT. Live generation is unavailable.' : this.provider.available ? 'Generation produces drafts only.' : (this.provider.unavailableReason || this.provider.configurationNotice || 'Live generation unavailable: no approved provider configured. Manual drafts remain available.') };
  }
  profile(accountId: string) { account(accountId); return repo.profile(accountId); }
  saveProfile(accountId: string, input: any) {
    account(accountId);
    const profile: any = {};
    profile.editorialPurpose=textValue(input.editorialPurpose || '', 'Editorial purpose',1000);
    if (input.editorialSubjects!==undefined && (!Array.isArray(input.editorialSubjects) || input.editorialSubjects.length>30)) throw new Error('Editorial subjects must contain at most 30 entries');
    profile.editorialSubjects=(input.editorialSubjects || []).map((v:unknown)=>textValue(v,'Editorial subject',300,true));
    for (const key of ['language','tone','typicalLength','humor','emojiPreference','hashtagPreference']) profile[key] = textValue(input[key], key, 300, true);
    for (const key of ['preferredPhrases','prohibitedPhrases','approvedExamples','approvedFacts','faqAnswers']) {
      if (!Array.isArray(input[key]) || input[key].length > 30) throw new Error(`${key} must contain at most 30 entries`);
      profile[key] = input[key].map((v: unknown) => textValue(v,key,key === 'approvedExamples' ? 3000 : 1000,true));
    }
    if ((profile.approvedExamples.length || profile.approvedFacts.length || profile.faqAnswers.length) && input.confirmOwnerApproved !== true) throw new Error('Explicit owner approval is required for writing examples and facts');
    profile.provisional = profile.approvedExamples.length === 0;
    repo.saveProfile(accountId,profile as OwnerVoiceProfile); return repo.profile(accountId);
  }
  manual(input: any) {
    const row = account(input.accountId); if (!kinds.includes(input.kind || 'post')) throw new Error('Invalid draft kind');
    if (input.kind === 'reply') return this.replyDraft(input);
    return repo.insertDraft({ accountId: row.id, kind: input.kind || 'post', content: textValue(input.content,'Draft text',12000,true),
      source:'manual',provider:'owner',context:{ ownerEntered:true, destination:row.id },flags:['Owner review required.'] });
  }
  replyContext(input: any) {
    const prepared=this.request({...input,kind:'reply',idea:''});
    const row=account(input.accountId);
    const contextFingerprint=(prepared.context as any).contextFingerprint as string;
    return {...prepared,contextFingerprint,account:{id:row.id,name:row.name,graphPageId:row.external_id},notice:'Quoted comments and conversation are untrusted data. Prepare a draft only; no application model request or reply is sent.'};
  }
  replyDraft(input: any) {
    const prepared=this.replyContext(input);
    if (input.contextFingerprint !== prepared.contextFingerprint) throw new Error('Reply context changed or was not reviewed; reload the exact Page comment context');
    const operatorLabel=input.operatorLabel ? textValue(input.operatorLabel,'Operator label',200,true) : 'owner';
    const content=redactContentSecrets(textValue(input.content,'Reply draft text',12000,true));
    return repo.insertDraft({accountId:prepared.accountId,kind:'reply',content,source:input.operatorLabel?'external_operator':'manual',provider:operatorLabel,
      context:{...prepared.context,contextFingerprint:prepared.contextFingerprint,graphPageId:prepared.account.graphPageId,operatorProvenance:'self-declared; not independently verified',operatorRunId:input.operatorRunId?textValue(input.operatorRunId,'Operator run ID',200):null},
      flags:[...prepared.flags,...reviewFlags(content),'Reply draft only. Exact owner approval and a separate Send Reply action are required.']});
  }
  request(input: any): { request: AssistantRequest; context: object; flags: string[]; accountId: string } {
    const row = account(input.accountId);
    if (!kinds.includes(input.kind)) throw new Error('Select a supported assistance function');
    const voice = repo.profile(row.id);
    const safeVoice=redactContentValue(voice.profile);
    const request: AssistantRequest = { kind: input.kind,language:safeVoice.language,voice:safeVoice,
      ownerIdea:redactContentSecrets(textValue(input.idea || '', 'Idea',6000)), rules:assistantRules };
    const context: any = { accountId:row.id, kind:input.kind, profileRevision:voice.revision, provisionalVoice:voice.profile.provisional, ownerIdea:request.ownerIdea };
    if (input.kind === 'rewrite') {
      request.existingDraft=redactContentSecrets(textValue(input.existingDraft,'Existing draft',12000,true)); context.existingDraft=request.existingDraft;
    }
    if (input.kind === 'caption') {
      request.suppliedMediaDescription=redactContentSecrets(textValue(input.mediaDescription || '', 'Supplied media description',4000));
      if (!request.suppliedMediaDescription.trim() && !input.videoId) throw new Error('Supply a media description or an existing video. This provider cannot inspect images or video.');
      if (input.videoId) {
        const v = repo.videoMetadata(input.videoId);
        if (!v) throw new Error('Video not found'); request.verifiedMediaMetadata = { title:redactContentSecrets(v.title),width:v.width,height:v.height,duration:v.duration };
      }
      context.mediaDescription=request.suppliedMediaDescription; context.videoId=input.videoId || null;
      context.mediaInterpretation='Supplied description and verified metadata only; no visual understanding claimed';
    }
    if (input.kind === 'reply') {
      if (row.is_demo || !['connected','limited'].includes(row.connection_status || '') || !/^\d+$/.test(row.external_id || '') || !getConnector(row).getCapabilities().canReadComments) throw new Error('Reply suggestions require an authorized Facebook Page with valid identity, token and comment-reading scopes');
      const source=repo.replyContext(row.id,input.commentId);
      if (!source) throw new Error('Comment not found for the selected account');
      const {comment,post,thread}=source;
      if (comment.source!=='meta_graph_api') throw new Error('Reply suggestions require an actual official-API Page comment, not simulated or unverified context');
      if (comment.destination_id && !post) throw new Error('Comment post context is unavailable for the selected Page');
      request.untrustedContext={ postText:redactContentSecrets(post?.caption || ''), commentText:redactContentSecrets(comment.content), thread:thread.map(c=>({content:redactContentSecrets(c.content)})) };
      context.commentId=comment.id;context.externalCommentId=comment.external_comment_id;context.destinationId=comment.destination_id;context.untrustedContext=request.untrustedContext;context.postContextAvailable=Boolean(post);
      context.contextFingerprint=createHash('sha256').update(JSON.stringify({accountId:row.id,graphPageId:row.external_id,profileRevision:voice.revision,voice:safeVoice,commentId:context.commentId,externalCommentId:context.externalCommentId,destinationId:context.destinationId,untrustedContext:context.untrustedContext})).digest('hex');
    }
    const flags=['Editable draft; owner verification required.'];
    if (voice.profile.provisional) flags.push('Provisional voice profile: no owner-approved writing examples.');
    if (row.connection_status==='limited') flags.push('Page authorization is limited. Only currently granted comment-reading/reply capabilities may be used.');
    if (input.kind === 'caption') flags.push('No image/video inspection; based on supplied description and verified metadata only.');
    if (input.kind === 'reply' && !context.postContextAvailable) flags.push('Post context unavailable; verify the source post and do not infer missing facts.');
    flags.push(...reviewFlags([request.ownerIdea,request.existingDraft,request.suppliedMediaDescription,JSON.stringify(request.untrustedContext || {})].filter(Boolean).join('\n')));
    return { request,context,flags,accountId:row.id };
  }
  async generate(input: any) { return (await this.batch([input]))[0]; }
  async batch(inputs: any[]) {
    const limits=repo.limits();
    if (limits.paused) throw new Error('Content generation is paused');
    if (!this.provider.available) throw new Error(this.provider.unavailableReason || 'Live generation unavailable: no approved provider configured');
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > limits.max_batch_size) throw new Error(`Batch must contain 1 to ${limits.max_batch_size} requests`);
    if (repo.generatedToday()+this.reserved+inputs.length > limits.daily_draft_limit) throw new Error('Daily draft limit reached');
    const requests=inputs.map(input=>this.request(input)); this.reserved+=requests.length;
    const drafts: ReturnType<typeof repo.insertDraft>[]=[];
    try {
      for (const {request,context,flags,accountId} of requests) {
        if (repo.limits().paused) throw new Error('Content generation is paused');
        let result: {text:string;flags?:string[];generation?:AssistantGenerationMetadata};
        try { result=await this.provider.generate(request); } catch (error) { if(error instanceof AssistantProviderError) throw error; throw new Error('Content provider generation failed. No draft was approved or sent.'); }
        if (repo.limits().paused) throw new Error('Content generation was paused; provider output was discarded');
        const content=redactContentSecrets(textValue(result.text,'Provider output',12000,true));
        drafts.push(repo.insertDraft({accountId,kind:request.kind,content,source:this.provider.fixture?'fixture':'provider',provider:this.provider.id,context:{...context,...(result.generation?{generation:result.generation}:{})},flags:[...flags,...reviewFlags(content),...(result.flags || []).slice(0,10).map(f=>redactContentSecrets(textValue(f,'Review flag',500)))]}));
      }
      return drafts;
    } catch(error) {
      if(drafts.length) throw new AssistantBatchPartialError(drafts,drafts.length,requests.length-drafts.length-1,error instanceof Error?error.message:'Generation failed');
      throw error;
    } finally { this.reserved-=requests.length; }
  }
  edit(id: string,input: any) {
    account(input.accountId);
    const previous=repo.draft(id);
    if (previous?.kind==='reply' && previous.account_id!==input.accountId) throw new Error('Reply drafts cannot move to another Page; prepare a new grounded reply draft');
    return repo.editDraft(id,Number(input.revision),textValue(input.content,'Draft text',12000,true),input.accountId);
  }
  review(id: string,input: any,approve=true) {
    account(input.accountId);return repo.review(id,Number(input.revision),input.accountId,approve);
  }
  batchApprove(items: any[]) {
    if (!Array.isArray(items) || !items.length || items.length > 20) throw new Error('Select 1 to 20 exact drafts for approval');
    items.forEach(item=>account(item.accountId));return repo.batchReview(items.map(item=>({id:item.id,revision:Number(item.revision),accountId:item.accountId})));
  }
  approvedText(id: string,revision: number,accountId: string) {
    account(accountId); const draft=repo.draft(id);
    if (!draft || draft.account_id !== accountId || draft.revision !== revision || draft.approved_revision !== revision || draft.status !== 'approved') throw new Error('Exact current draft revision and destination must be approved');
    return {content:draft.content,accountId,sourceDraftId:id,sourceRevision:revision,kind:draft.kind};
  }
  exportApproved(id: string,revision: number,accountId: string) {
    const draft=this.approvedText(id,revision,accountId);
    if (draft.kind === 'reply') throw new Error('Reply drafts are review/copy only; automatic replies are disabled');
    repo.audit(id,'approved_text_exported',revision,{accountId});
    return { ...draft,notice:'Transfer creates a new publishing draft. Review and approve it in Publishing Center before scheduling.' };
  }
}

export const contentAssistantService=new ContentAssistantService(configuredAssistantProvider());
