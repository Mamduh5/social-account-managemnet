import { accountsRepo } from '../repositories/accounts.repo.js';
import { Router } from 'express';
import { getConnector } from '../connectors/registry.js';
import { inboxRepo } from '../repositories/inbox.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';
import { syncService } from '../services/sync.service.js';
import { contentWorkspaceRepo as workspace } from '../repositories/content-workspace.repo.js';
import { replyDraftsService } from '../services/reply-drafts.service.js';

export const inboxRouter = Router();

// GET comments with rich filtering and threading
inboxRouter.get('/comments', (req, res) => {
  const { platform, categoryId, accountId, status, awaitingReply, search, limit } = req.query;

  const comments = inboxRepo.getComments({
    includeDemos: req.query.includeDemos === 'true',
    platform: platform as string,
    categoryId: categoryId as string,
    accountId: accountId as string,
    status: status as string,
    awaitingReply: awaitingReply as string,
    search: search as string,
    limit: limit as string,
  });

  const stats = inboxRepo.getInboxStats(req.query.includeDemos === 'true');

  res.json({
    comments,
    stats,
    notice: 'Engagement is available only with authorized data. Use Open Native Account in Accounts for native engagement when official comment reply API is not authorized.',
  });
});

// SYNC comments on demand
inboxRouter.post('/sync', async (req, res) => {
  const { accountId } = req.body;
  if (accountId) {
    const result = await syncService.syncAccount(accountId);
    return res.json({ success: result.success, result, message: result.message });
  }

  const result = await syncService.syncAllAccounts();
  return res.json({ success: result.success, result, message: result.message });
});

// REPLY to comment
inboxRouter.post('/comments/:id/reply', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Reply text is required' });

  const comment = inboxRepo.getCommentWithAccount(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (workspace.ready() && workspace.auditTrail(`reply-comment:${comment.account_id}:${comment.id}`).some((entry:any)=>entry.action==='reply_submission_intent'))
    return res.status(409).json({error:'A reviewed reply submission already exists for this comment. Reconcile it in Content Assistant; sending again is blocked.'});

  const account = accountsRepo.getAccountById(comment.account_id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  if (account.platform==='facebook' && !account.is_demo && workspace.ready()) {
    try {
      const result=await replyDraftsService.sendManual(comment.id,{accountId:account.id,text});
      if (!result.success) return res.status(409).json({error:result.notice,nativeUrl:comment.native_url,...result});
      activityRepo.logEvent({type:'comment_replied',accountId:account.id,title:'Verified Facebook Page reply',message:'Owner-written reply identity, parent comment and exact text verified through the official API.',severity:'info'});
      return res.json(result);
    } catch (error:any) { return res.status(400).json({error:error.message,nativeUrl:comment.native_url}); }
  }

  const connector = getConnector(account);
  const result = await connector.replyComment(account, comment.external_comment_id, text);

  if (result.success) {
    inboxRepo.markReplied(req.params.id, text, result.replyId);

    activityRepo.logEvent({
      type: 'comment_replied',
      accountId: comment.account_id,
      title: `Replied on ${comment.platform.toUpperCase()}`,
      message: `Replied to ${comment.author_name}: "${text.substring(0, 50)}..."`,
      severity: 'info',
    });

    return res.json({ success: true, replyId: result.replyId });
  } else {
    return res.status(400).json({
      error: result.errorMessage || 'Failed to post reply.',
      nativeUrl: comment.native_url,
    });
  }
});

// REACT / LIKE comment
inboxRouter.post('/comments/:id/react', async (req, res) => {
  const { reaction } = req.body;
  const comment = inboxRepo.getCommentWithAccount(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const account = accountsRepo.getAccountById(comment.account_id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const connector = getConnector(account);
  const result = await connector.reactComment(account, comment.external_comment_id, reaction || 'like');

  if (result.success) {
    inboxRepo.incrementLike(req.params.id);
    return res.json({ success: true });
  } else {
    return res.status(400).json({ error: result.errorMessage || 'Failed to react' });
  }
});

// UPDATE comment status (unread -> pending -> handled -> hidden)
inboxRouter.put('/comments/:id/status', (req, res) => {
  const { status, awaitingReply } = req.body;
  const awaitingReplyVal = awaitingReply !== undefined ? (awaitingReply ? 1 : 0) : null;
  inboxRepo.updateCommentStatus(req.params.id, status, awaitingReplyVal);
  res.json({ success: true });
});
