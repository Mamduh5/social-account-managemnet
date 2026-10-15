import { db } from '../db/database.js';
import { CommentEntity } from '../domain/types.js';

export interface CommentFilters {
  platform?: string;
  categoryId?: string;
  accountId?: string;
  status?: string;
  awaitingReply?: string;
  search?: string;
  limit?: string | number;
}

export class InboxRepository {
  getComments(filters: CommentFilters): any[] {
    let query = `
      SELECT c.*, a.name as account_name, a.handle as account_handle, a.avatar_url as account_avatar,
             cat.id as category_id, cat.name as category_name, cat.color as category_color
      FROM comments c
      JOIN accounts a ON c.account_id = a.id
      LEFT JOIN categories cat ON a.category_id = cat.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.platform) {
      query += ' AND c.platform = ?';
      params.push(filters.platform);
    }
    if (filters.categoryId) {
      query += ' AND cat.id = ?';
      params.push(filters.categoryId);
    }
    if (filters.accountId) {
      query += ' AND c.account_id = ?';
      params.push(filters.accountId);
    }
    if (filters.status && filters.status !== 'all') {
      query += ' AND c.status = ?';
      params.push(filters.status);
    }
    if (filters.awaitingReply === 'true') {
      query += ' AND c.awaiting_reply = 1';
    }
    if (filters.search) {
      query += ' AND (c.content LIKE ? OR c.author_name LIKE ? OR c.video_title LIKE ?)';
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY c.created_time DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(Number(filters.limit));
    }

    return db.prepare(query).all(...params);
  }

  getInboxStats(): { total: number; unread_count: number; awaiting_reply_count: number } {
    return db.prepare(`
      SELECT 
        count(*) as total,
        sum(case when status = 'unread' then 1 else 0 end) as unread_count,
        sum(case when awaiting_reply = 1 then 1 else 0 end) as awaiting_reply_count
      FROM comments
    `).get() as any;
  }

  getCommentWithAccount(commentId: string): any | undefined {
    return db.prepare(`
      SELECT c.*, a.platform, a.access_token, a.external_id, a.connector_mode, a.name as account_name, a.handle as account_handle
      FROM comments c
      JOIN accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `).get(commentId);
  }

  markReplied(commentId: string, replyText: string): void {
    db.prepare(`
      UPDATE comments
      SET has_replied = 1, awaiting_reply = 0, reply_text = ?, status = 'handled'
      WHERE id = ?
    `).run(replyText, commentId);
  }

  incrementLike(commentId: string): void {
    db.prepare('UPDATE comments SET like_count = like_count + 1 WHERE id = ?').run(commentId);
  }

  updateCommentStatus(commentId: string, status?: string, awaitingReply?: number | null): void {
    db.prepare(`
      UPDATE comments SET
        status = COALESCE(?, status),
        awaiting_reply = COALESCE(?, awaiting_reply)
      WHERE id = ?
    `).run(status, awaitingReply, commentId);
  }
}

export const inboxRepo = new InboxRepository();
