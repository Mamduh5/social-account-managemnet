import { Router } from 'express';
import { getConnector } from '../connectors/registry.js';
import { inboxRepo } from '../repositories/inbox.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';

export const inboxRouter = Router();

// GET comments with rich filtering
inboxRouter.get('/comments', (req, res) => {
  const { platform, categoryId, accountId, status, awaitingReply, search, limit } = req.query;

  const comments = inboxRepo.getComments({
    platform: platform as string,
    categoryId: categoryId as string,
    accountId: accountId as string,
    status: status as string,
    awaitingReply: awaitingReply as string,
    search: search as string,
    limit: limit as string,
  });

  const stats = inboxRepo.getInboxStats();

  res.json({ comments, stats });
});

// REPLY to comment
inboxRouter.post('/comments/:id/reply', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Reply text is required' });

  const comment = inboxRepo.getCommentWithAccount(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const connector = getConnector(comment);
  const result = await connector.replyComment(comment, comment.external_comment_id, text);

  if (result.success) {
    inboxRepo.markReplied(req.params.id, text);

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

  const connector = getConnector(comment);
  const result = await connector.reactComment(comment, comment.external_comment_id, reaction || 'like');

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
