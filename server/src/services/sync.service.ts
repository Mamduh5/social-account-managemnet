import { db } from '../db/database.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { analyticsRepo } from '../repositories/analytics.repo.js';
import { inboxRepo } from '../repositories/inbox.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';
import { getConnector } from '../connectors/registry.js';
import { eventsService } from './events.service.js';
import { ProvenanceSource, ProvenanceStatus } from '../domain/types.js';

export interface ManualObservationPayload {
  destinationId: string;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  source?: ProvenanceSource;
  notes?: string;
}

export class SyncService {
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private intervalMs = 15 * 60 * 1000; // 15 minutes default conservative polling

  start(intervalMs?: number): void {
    if (intervalMs) this.intervalMs = intervalMs;
    if (this.timer) clearInterval(this.timer);

    console.log(`[SyncService] Starting background synchronization service (interval: ${Math.round(this.intervalMs / 1000)}s)...`);
    this.timer = setInterval(() => {
      this.syncAllAccounts().catch((err) => {
        console.error('[SyncService] Background sync error:', err.message);
      });
    }, this.intervalMs);

    // Initial check on boot
    setTimeout(() => {
      this.syncAllAccounts().catch(() => {});
    }, 5000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncAllAccounts(): Promise<{ success: boolean; status: string; message: string; results: Record<string, any> }> {
    if (this.isSyncing) return { success: false, status: 'busy', message: 'Synchronization already in progress.', results: {} };
    this.isSyncing = true;
    const results: Record<string, any> = {};
    let totalSynced = 0;
    let anyAuthRequired = false;

    try {
      const accounts = accountsRepo.getActiveRealAccounts();
      for (const acc of accounts) {
        try {
          const res = await this.syncAccount(acc.id);
          results[acc.id] = res;
          totalSynced += (res.metricsSynced || 0) + (res.commentsSynced || 0);
          if (res.status === 'auth_required' || !res.success) {
            anyAuthRequired = true;
          }
        } catch (err: any) {
          results[acc.id] = { success: false, error: err.message, status: 'failed' };
          analyticsRepo.updateSyncState(acc.id, 'all', 'failed', err.message, 0);
        }
      }
    } finally {
      this.isSyncing = false;
    }

    if (totalSynced > 0) {
      return {
        success: true,
        status: 'success',
        message: `Successfully synchronized ${totalSynced} items from official platform APIs.`,
        results,
      };
    }

    return {
      success: false,
      status: anyAuthRequired ? 'auth_required' : 'unavailable',
      message: 'Official API authorization required for automated synchronization. Connect live credentials in Accounts or record verified observations.',
      results,
    };
  }

  async syncAccount(accountId: string): Promise<{
    success: boolean;
    metricsSynced: number;
    commentsSynced: number;
    status: string;
    message?: string;
  }> {
    const account = accountsRepo.getAccountById(accountId);
    if (!account || account.archived_at || account.is_demo) {
      return { success: false, metricsSynced: 0, commentsSynced: 0, status: 'skipped' };
    }

    analyticsRepo.updateSyncState(accountId, 'all', 'syncing');
    const connector = getConnector(account);
    const capabilities = connector.getCapabilities();

    let metricsSynced = 0;
    let commentsSynced = 0;
    let syncError: string | undefined;

    // 1. Sync Account-Level Metrics
    try {
      if (connector.fetchAccountMetrics) {
        const accMetrics = await connector.fetchAccountMetrics(account);
        if (accMetrics && accMetrics.status === 'confirmed') {
          analyticsRepo.recordAccountMetricSnapshot({
            account_id: account.id,
            observed_at: new Date().toISOString(),
            date: new Date().toISOString().slice(0, 10),
            followers_total: accMetrics.followersTotal,
            followers_gain: accMetrics.followersGain || 0,
            views_total: accMetrics.viewsTotal || 0,
            likes_total: accMetrics.likesTotal || 0,
            comments_total: accMetrics.commentsTotal || 0,
            shares_total: accMetrics.sharesTotal || 0,
            engagement_rate: 0,
            source: accMetrics.source as ProvenanceSource,
            provenance_status: 'confirmed',
            is_simulated: 0,
          });
        }
      }
    } catch (err: any) {
      console.warn(`[SyncService] Account metrics sync failed for ${account.name}:`, err.message);
    }

    // 2. Sync Post-Level Metrics for Published Destinations
    const destinations = db.prepare(`
      SELECT pd.*, pp.title as post_title, v.title as video_title
      FROM publishing_destinations pd
      JOIN publishing_posts pp ON pd.post_id = pp.id
      JOIN videos v ON pp.video_id = v.id
      WHERE pd.account_id = ? AND pd.status = 'published' AND pd.remote_post_id IS NOT NULL
    `).all(accountId) as any[];

    for (const dest of destinations) {
      try {
        if (connector.fetchPostMetrics) {
          const postMetric = await connector.fetchPostMetrics(account, dest.remote_post_id, dest.remote_post_url);
          if (postMetric) {
            // Find prior snapshot to calculate differences
            const priorSnapshot = db.prepare(`
              SELECT * FROM post_metrics_snapshots
              WHERE destination_id = ?
              ORDER BY observed_at DESC LIMIT 1
            `).get(dest.id) as any;

            if (postMetric.status === 'confirmed') {
              analyticsRepo.recordPostMetricSnapshot({
                destination_id: dest.id,
                account_id: account.id,
                platform: account.platform,
                remote_post_id: dest.remote_post_id,
                observed_at: new Date().toISOString(),
                view_count: postMetric.viewCount,
                like_count: postMetric.likeCount,
                comment_count: postMetric.commentCount,
                share_count: postMetric.shareCount,
                extra_metrics_json: JSON.stringify(postMetric.extraMetrics || {}),
                source: postMetric.source as ProvenanceSource,
                provenance_status: 'confirmed',
                status_detail: 'Synchronized via official connector',
              });
              metricsSynced++;

              // Detect changes and log events
              if (priorSnapshot && typeof priorSnapshot.view_count === 'number' && typeof postMetric.viewCount === 'number') {
                if (postMetric.viewCount > priorSnapshot.view_count) {
                  activityRepo.logEvent({
                    type: 'engagement_increased',
                    accountId: account.id,
                    title: `Views Increased on ${account.platform.toUpperCase()}`,
                    message: `Post "${dest.caption.slice(0, 35)}..." views changed from ${priorSnapshot.view_count} to ${postMetric.viewCount}.`,
                    severity: 'success',
                  });
                }
              }
            } else if (postMetric.status === 'auth_required') {
              syncError = postMetric.errorMessage || 'Authorization required for automated synchronization.';
            }
          }
        }
      } catch (err: any) {
        console.warn(`[SyncService] Post metrics sync failed for destination ${dest.id}:`, err.message);
      }

      // 3. Sync Comments if supported
      try {
        if (capabilities.canReadComments) {
          const comments = await connector.fetchComments(account, { postId: dest.remote_post_id, limit: 50 });
          for (const cmt of comments) {
            const { isNew } = inboxRepo.upsertComment({
              account_id: account.id,
              destination_id: dest.id,
              platform: account.platform,
              external_comment_id: cmt.externalCommentId,
              parent_comment_id: cmt.parentCommentId,
              author_name: cmt.authorName,
              author_avatar: cmt.authorAvatar,
              author_id: cmt.authorId,
              content: cmt.content,
              created_time: cmt.createdTime,
              like_count: cmt.likeCount,
              video_title: dest.post_title || dest.video_title,
              native_url: cmt.nativeUrl,
              source: account.platform === 'facebook' ? 'meta_graph_api' : 'tiktok_accounts_api',
            });

            if (isNew) {
              commentsSynced++;
              activityRepo.logEvent({
                type: 'new_comment_detected',
                accountId: account.id,
                title: `New Comment on ${account.platform.toUpperCase()}`,
                message: `From ${cmt.authorName}: "${cmt.content.slice(0, 45)}..."`,
                severity: 'info',
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`[SyncService] Comments sync failed for destination ${dest.id}:`, err.message);
      }
    }

    const hasSyncedData = (metricsSynced + commentsSynced) > 0;
    const finalStatus = syncError
      ? 'auth_required'
      : (hasSyncedData ? 'success' : 'auth_required');
    const finalMessage = syncError || (hasSyncedData ? undefined : 'Official API authorization required for automated synchronization. Connect live credentials in Accounts or record verified observations.');

    analyticsRepo.updateSyncState(accountId, 'all', finalStatus, finalMessage, metricsSynced + commentsSynced);

    // Broadcast SSE update
    eventsService.broadcast('analytics:synced', {
      accountId,
      accountName: account.name,
      metricsSynced,
      commentsSynced,
      status: finalStatus,
      timestamp: new Date().toISOString(),
    });

    return {
      success: hasSyncedData && !syncError,
      metricsSynced,
      commentsSynced,
      status: finalStatus,
      message: finalMessage,
    };
  }

  recordObservation(payload: ManualObservationPayload): any {
    const dest = db.prepare(`
      SELECT pd.*, a.platform, a.name as account_name
      FROM publishing_destinations pd
      JOIN accounts a ON pd.account_id = a.id
      WHERE pd.id = ?
    `).get(payload.destinationId) as any;

    if (!dest) throw new Error('Publishing destination not found');

    const observed_at = new Date().toISOString();
    const source = payload.source || 'browser_verified';

    // Prior snapshot
    const prior = db.prepare(`
      SELECT * FROM post_metrics_snapshots
      WHERE destination_id = ?
      ORDER BY observed_at DESC LIMIT 1
    `).get(dest.id) as any;

    const snapshot = analyticsRepo.recordPostMetricSnapshot({
      destination_id: dest.id,
      account_id: dest.account_id,
      platform: dest.platform,
      remote_post_id: dest.remote_post_id,
      observed_at,
      view_count: payload.viewCount ?? null,
      like_count: payload.likeCount ?? null,
      comment_count: payload.commentCount ?? null,
      share_count: payload.shareCount ?? null,
      source,
      provenance_status: 'confirmed',
      status_detail: payload.notes || 'Recorded verified observation',
    });

    // Detect changes
    if (prior && typeof prior.view_count === 'number' && typeof payload.viewCount === 'number') {
      if (payload.viewCount > prior.view_count) {
        activityRepo.logEvent({
          type: 'engagement_increased',
          accountId: dest.account_id,
          title: `Verified Views Increased (${dest.platform.toUpperCase()})`,
          message: `Post "${dest.caption.slice(0, 35)}..." views increased from ${prior.view_count} to ${payload.viewCount}.`,
          severity: 'success',
        });
      }
    } else {
      activityRepo.logEvent({
        type: 'observation_recorded',
        accountId: dest.account_id,
        title: `Observation Recorded (${dest.platform.toUpperCase()})`,
        message: `Baseline observation recorded for post "${dest.caption.slice(0, 35)}...": ${payload.viewCount ?? 0} views, ${payload.likeCount ?? 0} likes.`,
        severity: 'info',
      });
    }

    analyticsRepo.updateSyncState(dest.account_id, 'all', 'success', undefined, 1);

    eventsService.broadcast('analytics:synced', {
      accountId: dest.account_id,
      timestamp: observed_at,
      destinationId: dest.id,
    });

    return snapshot;
  }
}

export const syncService = new SyncService();
