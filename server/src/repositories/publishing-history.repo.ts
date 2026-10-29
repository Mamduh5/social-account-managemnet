import type Database from 'better-sqlite3';
import type { PublishingHistoryQuery } from '../domain/publishing-history.js';

const joins = `FROM publishing_destinations pd
  JOIN publishing_posts p ON p.id = pd.post_id
  JOIN accounts a ON a.id = pd.account_id
  LEFT JOIN categories c ON c.id = a.category_id`;
const fields = `pd.id, pd.post_id, pd.account_id, pd.caption, pd.hashtags,
  pd.apply_branding, pd.selected_variant_id, pd.status, pd.progress, pd.error_message,
  pd.retry_count, pd.max_retries, pd.remote_post_id, pd.remote_post_url, pd.published_at,
  pd.verification_status, pd.created_at, pd.updated_at,
  p.title AS post_title, p.scheduled_at, a.name AS account_name, a.handle AS account_handle,
  a.platform, a.avatar_url, a.is_demo, c.name AS category_name, c.color AS category_color`;
function selectFields(db: Database.Database) {
  const columns = new Set((db.prepare('PRAGMA table_info(publishing_destinations)').all() as { name: string }[]).map(column => column.name));
  return fields + ['confirmation_source', 'submission_state', 'content_type'].map(column => columns.has(column) ? `, pd.${column}` : `, ${column === 'content_type' ? "'reel'" : 'NULL'} AS ${column}`).join('');
}
/** No attempt join: one row is always one existing destination, including retries. */
export function readPublishingHistory(db: Database.Database, query: PublishingHistoryQuery) {
  const column = { created: 'pd.created_at', scheduled: 'p.scheduled_at', updated: 'pd.updated_at' }[query.timestamp];
  const where: string[] = [], params: (string | number)[] = [];
  const status = query.status || (query.outcome === 'completed' ? 'published' : query.outcome === 'failed' ? 'failed' : undefined);
  if (status) { where.push('pd.status = ?'); params.push(status); }
  if (query.platform) { where.push('a.platform = ?'); params.push(query.platform); }
  if (query.startAt) { where.push(`julianday(${column}) >= julianday(?)`); params.push(query.startAt); }
  if (query.endAt) { where.push(`julianday(${column}) < julianday(?)`); params.push(query.endAt); }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // julianday normalizes both SQLite UTC and ISO-offset timestamps; null schedules stay last.
  const direction = query.direction === 'asc' ? 'ASC' : 'DESC';
  return db.transaction(() => {
    const { total } = db.prepare(`SELECT COUNT(*) AS total ${joins} ${filter}`).get(...params) as { total: number };
    const items = db.prepare(`SELECT ${selectFields(db)} ${joins} ${filter}
      ORDER BY (julianday(${column}) IS NULL) ASC, julianday(${column}) ${direction}, pd.id ${direction}
      LIMIT ? OFFSET ?`).all(...params, query.limit, query.offset);
    return { items, total, limit: query.limit, offset: query.offset, hasMore: query.offset + items.length < total, timestamp: query.timestamp, direction: query.direction, startAt: query.startAt || null, endAt: query.endAt || null };
  })();
}

export function readActivePublishingQueue(db: Database.Database, limit = 100) {
  const count = db.prepare(`SELECT COUNT(*) AS total ${joins}
    WHERE pd.status IN ('preparing','branding','uploading','awaiting_confirmation','scheduled')`).get() as { total: number };
  const queue = db.prepare(`SELECT ${selectFields(db)} ${joins}
    WHERE pd.status IN ('preparing','branding','uploading','awaiting_confirmation','scheduled')
    ORDER BY CASE pd.status WHEN 'uploading' THEN 1 WHEN 'branding' THEN 2 WHEN 'preparing' THEN 3 WHEN 'awaiting_confirmation' THEN 4 ELSE 5 END,
    julianday(pd.updated_at) DESC, pd.id DESC LIMIT ?`).all(limit);
  return { queue, total: count.total, limit, hasMore: count.total > queue.length };
}
