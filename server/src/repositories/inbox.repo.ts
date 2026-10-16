import { db } from '../db/database.js';
import { CommentEntity } from '../domain/types.js';
import { randomUUID } from 'node:crypto';

export interface CommentFilters {
  platform?: string;
  categoryId?: string;
  accountId?: string;
  status?: string;
  awaitingReply?: string;
  search?: string;
  limit?: string | number;
  includeDemos?: boolean;
}

export class InboxRepository {
  getComments(filters: CommentFilters): any[] {
    let query = `
      SELECT c.*, a.name as account_name, a.handle as account_handle, a.avatar_url as account_avatar,
             cat.id as category_id, cat.name as category_name, cat.color as category_color
      FROM comments c
      JOIN accounts a ON c.account_id = a.id
      LEFT JOIN categories cat ON a.category_id = cat.id
      WHERE a.archived_at IS NULL
    `;
    const params: any[] = [];
    if (!filters.includeDemos) query += ' AND a.is_demo=0';

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

    const rows = db.prepare(query).all(...params) as any[];

    // Structure threading: group replies under parents if parent_comment_id exists
    const commentMap = new Map<string, any>();
    const topLevel: any[] = [];

    for (const r of rows) {
      r.replies = [];
      commentMap.set(r.external_comment_id, r);
    }

    for (const r of rows) {
      if (r.parent_comment_id && commentMap.has(r.parent_comment_id)) {
        commentMap.get(r.parent_comment_id).replies.push(r);
      } else {
        topLevel.push(r);
      }
    }

    return topLevel;
  }

  upsertComment(c: Omit<CommentEntity, 'id' | 'created_at'> & { id?: string }): { id: string; isNew: boolean } {
    const existing = db.prepare(`
      SELECT id, status, awaiting_reply, has_replied FROM comments
      WHERE account_id = ? AND external_comment_id = ?
    `).get(c.account_id, c.external_comment_id) as any;

    const now = new Date().toISOString();

    if (existing) {
      db.prepare(`
        UPDATE comments SET
          like_count = ?,
          content = ?,
          last_synced_at = ?
        WHERE id = ?
      `).run(c.like_count, c.content, now, existing.id);

      return { id: existing.id, isNew: false };
    }

    const id = c.id || `cmt-${randomUUID()}`;
    db.prepare(`
      INSERT INTO comments (
        id, account_id, destination_id, platform, external_comment_id,
        parent_comment_id, author_name, author_avatar, author_id,
        content, created_time, like_count, status, awaiting_reply,
        has_replied, reply_text, reply_id, video_title, native_url,
        source, last_synced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      c.account_id,
      c.destination_id || null,
      c.platform,
      c.external_comment_id,
      c.parent_comment_id || null,
      c.author_name,
      c.author_avatar || null,
      c.author_id || null,
      c.content,
      c.created_time,
      c.like_count || 0,
      c.status || 'unread',
      c.awaiting_reply ?? 1,
      c.has_replied ?? 0,
      c.reply_text || null,
      c.reply_id || null,
      c.video_title || null,
      c.native_url || null,
      c.source || 'api',
      now,
      now
    );

    return { id, isNew: true };
  }

  getInboxStats(includeDemos = false): { total: number; unread_count: number; awaiting_reply_count: number } {
    return db.prepare(`
      SELECT 
        count(*) as total,
        sum(case when c.status = 'unread' then 1 else 0 end) as unread_count,
        sum(case when c.awaiting_reply = 1 then 1 else 0 end) as awaiting_reply_count
      FROM comments c JOIN accounts a ON c.account_id=a.id WHERE a.archived_at IS NULL AND (?=1 OR a.is_demo=0)
    `).get(includeDemos ? 1 : 0) as any;
  }

  getCommentWithAccount(commentId: string): any | undefined {
    return db.prepare(`
      SELECT c.*, a.platform, a.access_token, a.external_id, a.connector_mode, a.name as account_name, a.handle as account_handle
      FROM comments c
      JOIN accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `).get(commentId);
  }

  markReplied(commentId: string, replyText: string, replyId?: string): void {
    db.prepare(`
      UPDATE comments
      SET has_replied = 1, awaiting_reply = 0, reply_text = ?, reply_id = ?, status = 'handled'
      WHERE id = ?
    `).run(replyText, replyId || null, commentId);
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
