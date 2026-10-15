import { Router } from 'express';
import { db } from '../db/database.js';
import { getConnector } from '../connectors/registry.js';

export const inboxRouter = Router();

// GET comments with rich filtering
inboxRouter.get('/comments', (req, res) => {
  const { platform, categoryId, accountId, status, awaitingReply, search } = req.query;

  let query = `
    SELECT c.*, a.name as account_name, a.handle as account_handle, a.avatar_url as account_avatar,
           cat.id as category_id, cat.name as category_name, cat.color as category_color
    FROM comments c
    JOIN accounts a ON c.account_id = a.id
    LEFT JOIN categories cat ON a.category_id = cat.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (platform) {
    query += ' AND c.platform = ?';
    params.push(platform);
  }
  if (categoryId) {
    query += ' AND cat.id = ?';
    params.push(categoryId);
  }
  if (accountId) {
    query += ' AND c.account_id = ?';
    params.push(accountId);
  }
  if (status && status !== 'all') {
    query += ' AND c.status = ?';
    params.push(status);
  }
  if (awaitingReply === 'true') {
    query += ' AND c.awaiting_reply = 1';
  }
  if (search) {
    query += ' AND (c.content LIKE ? OR c.author_name LIKE ? OR c.video_title LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY c.created_time DESC';

  const comments = db.prepare(query).all(...params);

  // Return counts for inbox badge triage
  const stats = db.prepare(`
    SELECT 
      count(*) as total,
      sum(case when status = 'unread' then 1 else 0 end) as unread_count,
      sum(case when awaiting_reply = 1 then 1 else 0 end) as awaiting_reply_count
    FROM comments
  `).get() as any;

  res.json({ comments, stats });
});

// REPLY to comment
inboxRouter.post('/comments/:id/reply', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Reply text is required' });

  const comment = db.prepare(`
    SELECT c.*, a.platform, a.access_token, a.external_id, a.connector_mode, a.name as account_name, a.handle as account_handle
    FROM comments c
    JOIN accounts a ON c.account_id = a.id
    WHERE c.id = ?
  `).get(req.params.id) as any;

  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const connector = getConnector(comment);
  const result = await connector.replyComment(comment, comment.external_comment_id, text);

  if (result.success) {
    db.prepare(`
      UPDATE comments
      SET has_replied = 1, awaiting_reply = 0, reply_text = ?, status = 'handled'
      WHERE id = ?
    `).run(text, req.params.id);

    // Add activity event
    db.prepare(`
      INSERT INTO activity_events (id, type, account_id, title, message, severity)
      VALUES (?, 'comment_replied', ?, ?, ?, 'info')
    `).run(
      `act-${Date.now()}`,
      comment.account_id,
      `Replied on ${comment.platform.toUpperCase()}`,
      `Replied to ${comment.author_name}: "${text.substring(0, 50)}..."`
    );

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
  const comment = db.prepare(`
    SELECT c.*, a.platform, a.access_token, a.external_id, a.connector_mode, a.name as account_name, a.handle as account_handle
    FROM comments c
    JOIN accounts a ON c.account_id = a.id
    WHERE c.id = ?
  `).get(req.params.id) as any;

  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const connector = getConnector(comment);
  const result = await connector.reactComment(comment, comment.external_comment_id, reaction || 'like');

  if (result.success) {
    db.prepare('UPDATE comments SET like_count = like_count + 1 WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } else {
    return res.status(400).json({ error: result.errorMessage || 'Failed to react' });
  }
});

// UPDATE comment status (unread -> pending -> handled -> hidden)
inboxRouter.put('/comments/:id/status', (req, res) => {
  const { status, awaitingReply } = req.body;
  db.prepare(`
    UPDATE comments SET
      status = COALESCE(?, status),
      awaiting_reply = COALESCE(?, awaiting_reply)
    WHERE id = ?
  `).run(status, awaitingReply !== undefined ? (awaitingReply ? 1 : 0) : null, req.params.id);
  res.json({ success: true });
});
