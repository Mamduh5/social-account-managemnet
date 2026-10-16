import { db } from '../db/database.js';
import { PostMetricsSnapshot, AccountMetricsSnapshot, SyncStateEntity, VideoPerformanceItem } from '../domain/types.js';
import { randomUUID } from 'node:crypto';

export interface AnalyticsFilter {
  platform?: string;
  accountId?: string;
  categoryId?: string;
}

export class AnalyticsRepository {
  recordPostMetricSnapshot(data: Omit<PostMetricsSnapshot, 'id' | 'created_at'> & { id?: string }): PostMetricsSnapshot {
    const id = data.id || `pms-${randomUUID()}`;
    const observed_at = data.observed_at || new Date().toISOString();
    const created_at = new Date().toISOString();

    db.prepare(`
      INSERT INTO post_metrics_snapshots (
        id, destination_id, account_id, platform, remote_post_id,
        observed_at, view_count, like_count, comment_count, share_count,
        extra_metrics_json, source, provenance_status, status_detail, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.destination_id,
      data.account_id,
      data.platform,
      data.remote_post_id,
      observed_at,
      data.view_count,
      data.like_count,
      data.comment_count,
      data.share_count,
      data.extra_metrics_json || '{}',
      data.source,
      data.provenance_status,
      data.status_detail || null,
      created_at
    );

    // Also update destination table with last_synced_at
    db.prepare(`
      UPDATE publishing_destinations
      SET last_synced_at = ?, sync_status = 'synced'
      WHERE id = ?
    `).run(observed_at, data.destination_id);

    return {
      id,
      destination_id: data.destination_id,
      account_id: data.account_id,
      platform: data.platform,
      remote_post_id: data.remote_post_id,
      observed_at,
      view_count: data.view_count,
      like_count: data.like_count,
      comment_count: data.comment_count,
      share_count: data.share_count,
      extra_metrics_json: data.extra_metrics_json,
      source: data.source,
      provenance_status: data.provenance_status,
      status_detail: data.status_detail,
      created_at,
    };
  }

  recordAccountMetricSnapshot(data: Omit<AccountMetricsSnapshot, 'id'> & { id?: string }): void {
    const id = data.id || `ams-${randomUUID()}`;
    const observed_at = data.observed_at || new Date().toISOString();
    const date = data.date || observed_at.slice(0, 10);

    db.prepare(`
      INSERT INTO analytics_snapshots (
        id, account_id, date, views, likes, comments, shares,
        followers_total, followers_gain, watch_time_seconds, engagement_rate,
        is_simulated, observed_at, source, provenance_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.account_id,
      date,
      data.views_total || 0,
      data.likes_total || 0,
      data.comments_total || 0,
      data.shares_total || 0,
      data.followers_total || 0,
      data.followers_gain || 0,
      0,
      data.engagement_rate || 0,
      data.is_simulated ? 1 : 0,
      observed_at,
      data.source,
      data.provenance_status,
      data.notes || null
    );

    // Update account table with latest followers
    if (data.followers_total !== null && data.followers_total !== undefined) {
      db.prepare(`
        UPDATE accounts
        SET followers_count = ?, last_synced_at = ?
        WHERE id = ?
      `).run(data.followers_total, observed_at, data.account_id);
    }
  }

  getOverviewTotals(filter?: AnalyticsFilter): any {
    let where = 'WHERE a.is_demo = 0 AND a.archived_at IS NULL';
    const params: any[] = [];

    if (filter?.platform) {
      where += ' AND a.platform = ?';
      params.push(filter.platform);
    }
    if (filter?.accountId) {
      where += ' AND a.id = ?';
      params.push(filter.accountId);
    }
    if (filter?.categoryId) {
      where += ' AND a.category_id = ?';
      params.push(filter.categoryId);
    }

    // Sum up the most recent snapshot for each published destination
    const postTotals = db.prepare(`
      WITH LatestSnapshots AS (
        SELECT pms.*,
          ROW_NUMBER() OVER(PARTITION BY pms.destination_id ORDER BY pms.observed_at DESC) as rn
        FROM post_metrics_snapshots pms
        JOIN publishing_destinations pd ON pd.id = pms.destination_id
        JOIN accounts a ON a.id = pd.account_id
        ${where}
      )
      SELECT 
        sum(view_count) as total_views,
        sum(like_count) as total_likes,
        sum(comment_count) as total_comments,
        sum(share_count) as total_shares,
        count(DISTINCT destination_id) as total_synced_videos
      FROM LatestSnapshots
      WHERE rn = 1
    `).get(...params) as any;

    // Also get follower total from accounts
    const accountTotals = db.prepare(`
      SELECT 
        COALESCE(sum(followers_count), 0) as total_followers,
        count(id) as total_accounts,
        MAX(last_synced_at) as last_sync_time
      FROM accounts a
      ${where}
    `).get(...params) as any;

    const hasSnapshots = Boolean(postTotals && postTotals.total_synced_videos > 0);
    const views = hasSnapshots ? (postTotals.total_views ?? 0) : null;
    const engagements = (postTotals?.total_likes || 0) + (postTotals?.total_comments || 0) + (postTotals?.total_shares || 0);
    const avg_engagement_rate = (views !== null && views > 0) ? Number(((engagements / views) * 100).toFixed(2)) : 0;

    return {
      total_views: views,
      total_likes: hasSnapshots ? (postTotals?.total_likes ?? 0) : null,
      total_comments: hasSnapshots ? (postTotals?.total_comments ?? 0) : null,
      total_shares: hasSnapshots ? (postTotals?.total_shares ?? 0) : null,
      total_followers: accountTotals?.total_followers || 0,
      total_followers_gained: 0,
      total_accounts: accountTotals?.total_accounts || 0,
      total_synced_videos: postTotals?.total_synced_videos || 0,
      avg_engagement_rate,
      last_sync_time: accountTotals?.last_sync_time || null,
    };
  }

  getVideoPerformanceList(filter?: AnalyticsFilter): VideoPerformanceItem[] {
    let where = "WHERE pd.status = 'published' AND a.is_demo = 0 AND a.archived_at IS NULL";
    const params: any[] = [];

    if (filter?.platform) {
      where += ' AND a.platform = ?';
      params.push(filter.platform);
    }
    if (filter?.accountId) {
      where += ' AND a.id = ?';
      params.push(filter.accountId);
    }
    if (filter?.categoryId) {
      where += ' AND a.category_id = ?';
      params.push(filter.categoryId);
    }

    const query = `
      WITH LatestPostSnapshots AS (
        SELECT pms.*,
          ROW_NUMBER() OVER(PARTITION BY pms.destination_id ORDER BY pms.observed_at DESC) as rn
        FROM post_metrics_snapshots pms
      )
      SELECT 
        pd.id as destination_id,
        pd.post_id,
        v.id as video_id,
        v.title as video_title,
        v.thumbnail_path,
        a.id as account_id,
        a.name as account_name,
        a.handle as account_handle,
        a.avatar_url as account_avatar,
        cat.id as category_id,
        cat.name as category_name,
        cat.color as category_color,
        a.platform,
        pd.remote_post_id,
        pd.remote_post_url,
        pd.published_at,
        pms.view_count as views,
        pms.like_count as likes,
        pms.comment_count as comments,
        pms.share_count as shares,
        pms.observed_at,
        COALESCE(pms.source, 'browser_verified') as source,
        COALESCE(pms.provenance_status, 'confirmed') as provenance_status,
        pms.status_detail
      FROM publishing_destinations pd
      JOIN accounts a ON pd.account_id = a.id
      JOIN publishing_posts pp ON pd.post_id = pp.id
      JOIN videos v ON pp.video_id = v.id
      LEFT JOIN categories cat ON a.category_id = cat.id
      LEFT JOIN LatestPostSnapshots pms ON pms.destination_id = pd.id AND pms.rn = 1
      ${where}
      ORDER BY pd.published_at DESC
    `;

    return db.prepare(query).all(...params) as any[];
  }

  getPlatformComparison(): any[] {
    return db.prepare(`
      WITH LatestPostSnapshots AS (
        SELECT pms.*,
          ROW_NUMBER() OVER(PARTITION BY pms.destination_id ORDER BY pms.observed_at DESC) as rn
        FROM post_metrics_snapshots pms
        JOIN publishing_destinations pd ON pd.id = pms.destination_id
        JOIN accounts a ON a.id = pd.account_id
        WHERE a.is_demo = 0 AND a.archived_at IS NULL
      )
      SELECT 
        a.platform,
        count(DISTINCT a.id) as account_count,
        COALESCE(sum(lps.view_count), 0) as total_views,
        COALESCE(sum(lps.like_count), 0) as total_likes,
        COALESCE(sum(lps.comment_count), 0) as total_comments,
        COALESCE(sum(lps.share_count), 0) as total_shares,
        COALESCE(sum(a.followers_count), 0) as total_followers,
        round(
          case when sum(lps.view_count) > 0 
               then (CAST((sum(lps.like_count) + sum(lps.comment_count) + sum(lps.share_count)) AS FLOAT) / sum(lps.view_count)) * 100.0
               else 0.0 
          end, 2
        ) as avg_engagement_rate
      FROM accounts a
      LEFT JOIN publishing_destinations pd ON pd.account_id = a.id AND pd.status = 'published'
      LEFT JOIN LatestPostSnapshots lps ON lps.destination_id = pd.id AND lps.rn = 1
      WHERE a.is_demo = 0 AND a.archived_at IS NULL
      GROUP BY a.platform
    `).all();
  }

  getCategoryComparison(): any[] {
    return db.prepare(`
      WITH LatestPostSnapshots AS (
        SELECT pms.*,
          ROW_NUMBER() OVER(PARTITION BY pms.destination_id ORDER BY pms.observed_at DESC) as rn
        FROM post_metrics_snapshots pms
        JOIN publishing_destinations pd ON pd.id = pms.destination_id
        JOIN accounts a ON a.id = pd.account_id
        WHERE a.is_demo = 0 AND a.archived_at IS NULL
      )
      SELECT 
        c.id, c.name, c.color, c.slug,
        count(DISTINCT a.id) as account_count,
        COALESCE(sum(lps.view_count), 0) as total_views,
        COALESCE(sum(lps.like_count), 0) as total_likes,
        COALESCE(sum(lps.comment_count), 0) as total_comments,
        COALESCE(sum(lps.share_count), 0) as total_shares,
        round(
          case when sum(lps.view_count) > 0 
               then (CAST((sum(lps.like_count) + sum(lps.comment_count) + sum(lps.share_count)) AS FLOAT) / sum(lps.view_count)) * 100.0
               else 0.0 
          end, 2
        ) as avg_engagement_rate
      FROM categories c
      JOIN accounts a ON c.id = a.category_id
      LEFT JOIN publishing_destinations pd ON pd.account_id = a.id AND pd.status = 'published'
      LEFT JOIN LatestPostSnapshots lps ON lps.destination_id = pd.id AND lps.rn = 1
      WHERE a.is_demo = 0 AND a.archived_at IS NULL
      GROUP BY c.id
      ORDER BY total_views DESC
    `).all();
  }

  getAccountRankings(filter?: AnalyticsFilter): any[] {
    let where = 'WHERE a.is_demo = 0 AND a.archived_at IS NULL';
    const params: any[] = [];

    if (filter?.platform) {
      where += ' AND a.platform = ?';
      params.push(filter.platform);
    }
    if (filter?.categoryId) {
      where += ' AND a.category_id = ?';
      params.push(filter.categoryId);
    }

    return db.prepare(`
      WITH LatestPostSnapshots AS (
        SELECT pms.*,
          ROW_NUMBER() OVER(PARTITION BY pms.destination_id ORDER BY pms.observed_at DESC) as rn
        FROM post_metrics_snapshots pms
      )
      SELECT 
        a.id, a.name, a.handle, a.platform, a.avatar_url, a.last_synced_at,
        c.name as category_name, c.color as category_color,
        COALESCE(sum(lps.view_count), 0) as total_views,
        COALESCE(sum(lps.like_count), 0) as total_likes,
        COALESCE(sum(lps.comment_count), 0) as total_comments,
        COALESCE(sum(lps.share_count), 0) as total_shares,
        a.followers_count as current_followers,
        round(
          case when sum(lps.view_count) > 0 
               then (CAST((sum(lps.like_count) + sum(lps.comment_count) + sum(lps.share_count)) AS FLOAT) / sum(lps.view_count)) * 100.0
               else 0.0 
          end, 2
        ) as engagement_rate
      FROM accounts a
      LEFT JOIN categories c ON a.category_id = c.id
      JOIN publishing_destinations pd ON pd.account_id = a.id AND pd.status = 'published'
      JOIN LatestPostSnapshots lps ON lps.destination_id = pd.id AND lps.rn = 1
      ${where}
      GROUP BY a.id
      ORDER BY total_views DESC
    `).all(...params);
  }

  getDailyTrends(filter?: AnalyticsFilter): any[] {
    let where = 'WHERE a.is_demo = 0 AND a.archived_at IS NULL';
    const params: any[] = [];

    if (filter?.platform) {
      where += ' AND a.platform = ?';
      params.push(filter.platform);
    }
    if (filter?.accountId) {
      where += ' AND a.id = ?';
      params.push(filter.accountId);
    }

    // Group observations by date
    return db.prepare(`
      SELECT 
        date(pms.observed_at) as date,
        sum(case when a.platform = 'facebook' then pms.view_count else 0 end) as facebook_views,
        sum(case when a.platform = 'tiktok' then pms.view_count else 0 end) as tiktok_views,
        sum(pms.view_count) as total_views,
        sum(pms.like_count) as total_likes,
        sum(pms.comment_count) as total_comments
      FROM post_metrics_snapshots pms
      JOIN accounts a ON pms.account_id = a.id
      ${where}
      GROUP BY date(pms.observed_at)
      ORDER BY date ASC
    `).all(...params);
  }

  getPostHistory(destinationId: string): PostMetricsSnapshot[] {
    return db.prepare(`
      SELECT * FROM post_metrics_snapshots
      WHERE destination_id = ?
      ORDER BY observed_at ASC
    `).all(destinationId) as any[];
  }

  updateSyncState(accountId: string, target: 'metrics' | 'comments' | 'all', status: string, error?: string, recordsSynced = 0): void {
    const id = `sync-${accountId}-${target}`;
    const now = new Date().toISOString();
    const lastSuccess = status === 'success' ? now : null;

    db.prepare(`
      INSERT INTO sync_states (id, account_id, target, last_attempt_at, last_success_at, status, error_message, records_synced, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = COALESCE(excluded.last_success_at, sync_states.last_success_at),
        status = excluded.status,
        error_message = excluded.error_message,
        records_synced = excluded.records_synced,
        updated_at = excluded.updated_at
    `).run(id, accountId, target, now, lastSuccess, status, error || null, recordsSynced, now);

    db.prepare(`
      UPDATE accounts
      SET sync_status = ?, sync_error = ?, last_synced_at = COALESCE(?, last_synced_at)
      WHERE id = ?
    `).run(status, error || null, lastSuccess, accountId);
  }

  getSyncStates(): SyncStateEntity[] {
    return db.prepare(`SELECT * FROM sync_states ORDER BY updated_at DESC`).all() as any[];
  }
}

export const analyticsRepo = new AnalyticsRepository();
