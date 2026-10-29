import { db } from '../db/database.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { inboxRepo } from '../repositories/inbox.repo.js';
import { contentWorkspaceRepo as repo } from '../repositories/content-workspace.repo.js';
import { contentAssistantService, type ContentAssistantService } from './content-assistant.service.js';
import { getConnector } from '../connectors/registry.js';
import type { AccountConnector } from '../connectors/types.js';

type Attempt = {draftId:string;revision:number;accountId:string;commentId:string;externalCommentId:string;content:string;graphPageId:string;replyId?:string;remoteUrl?:string;confirmed?:boolean};
/** Explicit owner sending only. The existing durable audit stores intent before the network. */
export class ReplyDraftsService {
  constructor(private assistant:ContentAssistantService=contentAssistantService,private connectorFor:(account:any)=>AccountConnector=getConnector) {}
  private key(accountId:string,commentId:string){return `reply-comment:${accountId}:${commentId}`;}
  private attempt(key:string,accountId?:string,externalCommentId?:string):Attempt|undefined {
    // A content reset may remove the local comment row. Remote identity remains
    // stable when synchronization imports that same comment with a new local ID.
    const row=db.prepare(`SELECT detail_json FROM content_workspace_audit
      WHERE (entity_id=? OR (entity_id LIKE 'reply-comment:%' AND json_valid(detail_json)
        AND json_extract(detail_json,'$.accountId')=? AND json_extract(detail_json,'$.externalCommentId')=?))
      AND action IN ('reply_submission_intent','reply_remote_created','reply_receipt_confirmed') ORDER BY rowid DESC LIMIT 1`).get(key,accountId??null,externalCommentId??null) as any;
    return row?JSON.parse(row.detail_json):undefined;
  }
  status(id:string,accountId:string) {
    const draft=repo.draft(id);
    if (!draft || draft.account_id!==accountId || draft.kind!=='reply') throw new Error('Reply draft not found for the selected Page');
    const context=JSON.parse(draft.context_json);
    const attempt=this.attempt(this.key(accountId,context.commentId),accountId,context.externalCommentId);
    return {state:attempt?.confirmed?'confirmed':attempt?'held_for_reconciliation':'not_sent',replyId:attempt?.replyId || null,remoteUrl:attempt?.remoteUrl || null,
      submittedRevision:attempt?.revision || null,currentRevision:draft.revision,sameDraft:!attempt || attempt.draftId===id,automaticRepliesEnabled:false};
  }
  async sendManual(commentId:string,input:{accountId:string;text:string}) {
    const comment=inboxRepo.getCommentWithAccount(commentId);
    if (this.attempt(this.key(input.accountId,commentId),input.accountId,comment?.external_comment_id)) throw new Error('A reply submission already exists for this comment. Reconcile it in Content Assistant; sending again is blocked');
    const context=this.assistant.replyContext({accountId:input.accountId,commentId});
    const draft=this.assistant.replyDraft({...input,commentId,content:input.text,contextFingerprint:context.contextFingerprint});
    if (draft.content!==input.text) throw new Error('Credential-like text was redacted. Review the saved reply draft in Content Assistant before approval or sending');
    // The Inbox Send Reply click explicitly reviews the owner's exact manual text.
    this.assistant.review(draft.id,{accountId:input.accountId,revision:draft.revision});
    repo.audit(draft.id,'manual_reply_explicit_send_review',draft.revision,{accountId:input.accountId,commentId});
    return {...await this.send(draft.id,{accountId:input.accountId,revision:draft.revision,confirmSend:true}),draftId:draft.id};
  }
  async send(id:string,input:any) {
    if (input.confirmSend!==true) throw new Error('Explicit Send Reply confirmation is required');
    const approved=this.assistant.approvedText(id,Number(input.revision),input.accountId);
    const draft=repo.draft(id)!;
    if (approved.kind!=='reply' || draft.source==='fixture') throw new Error('An approved real-context reply draft is required');
    const context=JSON.parse(draft.context_json);
    const prepared=this.assistant.replyContext({accountId:input.accountId,commentId:context.commentId});
    if (!context.contextFingerprint || prepared.contextFingerprint!==context.contextFingerprint) throw new Error('Reply source context or Page identity changed; prepare and review a new reply draft');
    const account=accountsRepo.getAccountById(input.accountId)!;
    const connector=this.connectorFor(account);
    if (!connector.getCapabilities().canReply || !connector.verifyCommentReply) throw new Error('Authorized Page reply and receipt verification permissions are required');
    const key=this.key(account.id,context.commentId);
    const attempt:Attempt={draftId:id,revision:draft.revision,accountId:account.id,commentId:context.commentId,externalCommentId:context.externalCommentId,content:draft.content,graphPageId:String(account.external_id)};
    db.transaction(()=>{
      if (this.attempt(key,account.id,context.externalCommentId)) throw new Error('A reply submission already exists for this comment. Reconcile it; sending again is blocked');
      const comment=inboxRepo.getCommentWithAccount(context.commentId);
      if (!comment || comment.has_replied || comment.reply_id) throw new Error('This comment already has a reply or is unavailable');
      repo.audit(key,'reply_submission_intent',draft.revision,attempt);
      repo.audit(id,'reply_submission_intent',draft.revision,{commentId:context.commentId,accountId:account.id});
    }).immediate();
    try {
      const result=await connector.replyComment(account,attempt.externalCommentId,attempt.content);
      if (result.replyId) {
        attempt.replyId=result.replyId;
        repo.audit(key,'reply_remote_created',draft.revision,attempt);
        repo.audit(id,'reply_remote_created',draft.revision,{replyId:result.replyId});
        return await this.verify(key,attempt,account,connector);
      }
    } catch { /* Unknown remote outcome: keep the durable hold, never replay. */ }
    return {success:false,...this.status(id,account.id),notice:'Reply outcome is uncertain or unsupported. No automatic retry is allowed; inspect the native thread.'};
  }
  async reconcile(id:string,input:any) {
    const draft=repo.draft(id);
    if (!draft || draft.account_id!==input.accountId || draft.kind!=='reply') throw new Error('Reply draft not found for selected Page');
    const context=JSON.parse(draft.context_json),key=this.key(input.accountId,context.commentId),attempt=this.attempt(key,input.accountId,context.externalCommentId);
    if (!attempt || attempt.draftId!==id || !attempt.replyId) throw new Error('No saved remote reply ID is available; inspect the native thread without resending');
    if (attempt.confirmed) return {success:true,...this.status(id,input.accountId)};
    const account=accountsRepo.getAccountById(input.accountId);
    if (!account || account.archived_at || String(account.external_id)!==attempt.graphPageId) throw new Error('Original Page identity is required for reconciliation');
    return this.verify(key,attempt,account,this.connectorFor(account));
  }
  private async verify(key:string,attempt:Attempt,account:any,connector:AccountConnector) {
    let receipt;
    try {receipt=await connector.verifyCommentReply?.(account,attempt.replyId!,attempt.externalCommentId,attempt.content);} catch { /* Preserve the remote ID and review hold. */ }
    if (receipt?.confirmed && receipt.replyId===attempt.replyId) {
      attempt.confirmed=true;attempt.remoteUrl=receipt.remoteUrl;
      db.transaction(()=>{
        repo.audit(key,'reply_receipt_confirmed',attempt.revision,attempt);
        repo.audit(attempt.draftId,'reply_receipt_confirmed',attempt.revision,{replyId:attempt.replyId,remoteUrl:attempt.remoteUrl,accountId:attempt.accountId});
        inboxRepo.markReplied(attempt.commentId,attempt.content,attempt.replyId);
      })();
    }
    return {success:!!attempt.confirmed,...this.status(attempt.draftId,attempt.accountId),notice:attempt.confirmed?'Page identity, parent comment and exact reply text verified through the official API.':'Remote reply saved; verification unavailable or incomplete. Use read-only receipt reconciliation, never resend.'};
  }
}
export const replyDraftsService=new ReplyDraftsService();
