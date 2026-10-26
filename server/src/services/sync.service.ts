import { db } from '../db/database.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { analyticsRepo } from '../repositories/analytics.repo.js';
import { inboxRepo } from '../repositories/inbox.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';
import { getConnector, hasActiveApiAuthorization } from '../connectors/registry.js';
import { ensureFreshToken, refreshConnection } from './connections.service.js';
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
  private bootTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private intervalMs = 15 * 60 * 1000; // 15 minutes default conservative polling

  get activeSynchronization(){return this.isSyncing;}

  start(intervalMs?: number): void {
    if (intervalMs) {
      this.intervalMs = intervalMs;
    } else {
      this.intervalMs = this.resolveIntervalMs();
    }
    if (this.timer) clearInterval(this.timer);
    if (this.bootTimer) clearTimeout(this.bootTimer);

    console.log(`[SyncService] Starting background synchronization service (interval: ${Math.round(this.intervalMs / 1000)}s)...`);
    this.timer = setInterval(() => {
      this.syncAllAccounts().catch((err) => {
        console.error('[SyncService] Background sync error:', err.message);
      });
    }, this.intervalMs);

    // Initial check on boot
    this.bootTimer = setTimeout(() => {
      this.bootTimer = null;
      this.syncAllAccounts().catch(() => {});
    }, 5000);
  }

  private resolveIntervalMs(): number {
    if (process.env.SCC_SYNC_INTERVAL_MS) {
      const ms = parseInt(process.env.SCC_SYNC_INTERVAL_MS, 10);
      if (Number.isFinite(ms) && ms >= 5000) return ms;
    }
    if (process.env.SCC_SYNC_INTERVAL_MINUTES) {
      const min = parseFloat(process.env.SCC_SYNC_INTERVAL_MINUTES);
      if (Number.isFinite(min) && min >= 0.1) return Math.round(min * 60 * 1000);
    }
    return 15 * 60 * 1000;
  }

  stop(): void {
    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
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
    commentsStatus?: string;
  }> {
    let account: any = accountsRepo.getAccountById(accountId);
    if (!account || account.archived_at || account.is_demo) {
      return { success: false, metricsSynced: 0, commentsSynced: 0, status: 'skipped' };
    }

    // Proactively refresh or revalidate token if near expiry or expired
    if (account.platform === 'tiktok' || account.platform === 'facebook') {
      try {
        account = (await ensureFreshToken(account)) || account;
      } catch (err: any) {
        const isAuth = err.reason === 'invalid_grant' || err.reason === 'expired_token' || err.reason === 'invalid_token_metadata';
        const status = isAuth ? 'auth_required' : 'failed';
        analyticsRepo.updateSyncState(accountId, 'all', status, err.message, 0);
        return { success: false, metricsSynced: 0, commentsSynced: 0, status, message: err.message };
      }
    }
    if (!account || account.archived_at || account.is_demo) {
      return { success: false, metricsSynced: 0, commentsSynced: 0, status: 'skipped' };
    }

    analyticsRepo.updateSyncState(accountId, 'all', 'syncing');
    let connector = getConnector(account);
    let capabilities = connector.getCapabilities();

    let metricsSynced = 0;
    let commentsSynced = 0;
    let accountMetricsSynced = 0;
    let syncError: string | undefined;
    let apiFailure: string | undefined;
    let commentsFailure: string | undefined;
    let commentReads=0;
    let refreshAttempted = false;

    // 1. Sync Account-Level Metrics
    try {
      if (connector.fetchAccountMetrics) {
        let accMetrics = await connector.fetchAccountMetrics(account);
        if (
          accMetrics &&
          accMetrics.status === 'auth_required' &&
          account.platform === 'tiktok' &&
          !refreshAttempted &&
          account.refresh_token &&
          account.refresh_expires_at &&
          Date.parse(account.refresh_expires_at) > Date.now()
        ) {
          try {
            refreshAttempted = true;
            account = await refreshConnection(account.id);
            connector = getConnector(account);
            capabilities = connector.getCapabilities();
            if (connector.fetchAccountMetrics) {
              accMetrics = await connector.fetchAccountMetrics(account);
            }
          } catch (rErr: any) {
            if (rErr.reason === 'invalid_grant') syncError = rErr.message;
            else apiFailure = rErr.message;
          }
        }
        const hasNumericAccountMetrics = accMetrics && [accMetrics.followersTotal, accMetrics.followingTotal, accMetrics.followersGain,
          accMetrics.viewsTotal, accMetrics.likesTotal, accMetrics.commentsTotal, accMetrics.sharesTotal]
          .some((value) => typeof value === 'number' && Number.isFinite(value));
        if (accMetrics && accMetrics.status === 'confirmed' && hasNumericAccountMetrics) {
          analyticsRepo.recordAccountMetricSnapshot({
            account_id: account.id,
            observed_at: new Date().toISOString(),
            date: new Date().toISOString().slice(0, 10),
            followers_total: accMetrics.followersTotal,
            followers_gain: accMetrics.followersGain ?? null,
            following_total: accMetrics.followingTotal ?? null,
            views_total: accMetrics.viewsTotal ?? null,
            likes_total: accMetrics.likesTotal ?? null,
            comments_total: accMetrics.commentsTotal ?? null,
            shares_total: accMetrics.sharesTotal ?? null,
            engagement_rate: null,
            source: accMetrics.source as ProvenanceSource,
            provenance_status: 'confirmed',
            is_simulated: 0,
          });
          accountMetricsSynced++;
          if (typeof accMetrics.followersTotal === 'number') {
            db.prepare("UPDATE accounts SET followers_count=?, updated_at=datetime('now') WHERE id=?").run(accMetrics.followersTotal, account.id);
          }
        } else if (accMetrics?.status === 'failed') {
          apiFailure = accMetrics.errorMessage || 'Account statistics API failed.';
        } else if (accMetrics?.status === 'auth_required' && !apiFailure) {
          syncError = accMetrics.errorMessage || 'Authorization required for account statistics.';
        } else if (accMetrics?.status === 'unsupported' || (accMetrics?.status === 'confirmed' && !hasNumericAccountMetrics)) {
          apiFailure = accMetrics.errorMessage || 'Account statistics are unavailable; no numeric account metrics were returned.';
        }
      }
    } catch (err: any) {
      apiFailure = err.message;
      console.warn(`[SyncService] Account metrics sync failed for ${account.name}:`, err.message);
    }

    // 2. Sync Post-Level Metrics for Published Destinations
    const destinations = db.prepare(`
      SELECT pd.*, pp.title as post_title, COALESCE(v.title,pp.title) as video_title
      FROM publishing_destinations pd
      JOIN publishing_posts pp ON pd.post_id = pp.id
      LEFT JOIN videos v ON pp.video_id = v.id
      WHERE pd.account_id = ? AND pd.status = 'published' AND pd.remote_post_id IS NOT NULL
    `).all(accountId) as any[];

    for (const dest of destinations) {
      try {
        if (connector.fetchPostMetrics) {
          let postMetric = await connector.fetchPostMetrics(account, dest.remote_post_id, dest.remote_post_url);
          if (
            postMetric &&
            postMetric.status === 'auth_required' &&
            account.platform === 'tiktok' &&
            !refreshAttempted &&
            account.refresh_token &&
            account.refresh_expires_at &&
            Date.parse(account.refresh_expires_at) > Date.now()
          ) {
            try {
              refreshAttempted = true;
              account = await refreshConnection(account.id);
              connector = getConnector(account);
              capabilities = connector.getCapabilities();
              if (capabilities.canReadPostMetrics && connector.fetchPostMetrics) {
                postMetric = await connector.fetchPostMetrics(account, dest.remote_post_id, dest.remote_post_url);
              }
            } catch (rErr: any) {
              if (rErr.reason === 'invalid_grant') syncError = rErr.message;
              else apiFailure = rErr.message;
            }
          }
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
            } else if (postMetric.status === 'auth_required' && !apiFailure) {
              syncError = postMetric.errorMessage || 'Authorization required for automated synchronization.';
            } else if (postMetric.status === 'failed') {
              apiFailure = postMetric.errorMessage || 'Platform API returned an error.';
            }
          }
        }
      } catch (err: any) {
        apiFailure = err.message;
        console.warn(`[SyncService] Post metrics sync failed for destination ${dest.id}:`, err.message);
      }

      // 3. Sync Comments if supported
      try {
        if (capabilities.canReadComments) {
          const comments = await connector.fetchComments(account, { postId: dest.remote_post_id, limit: 50 });
          commentReads++;
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
              status: 'unread',
              awaiting_reply: 1,
              has_replied: 0,
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
        commentsFailure='Comment synchronization failed; existing comments were preserved. Verify Page permissions and provider availability.';
        console.warn(`[SyncService] Comments sync failed for destination ${dest.id}.`);
      }
    }

    const isAuthorized = hasActiveApiAuthorization(account);
    const hasSyncedData = (metricsSynced + commentsSynced + accountMetricsSynced) > 0;
    const commentsStatus=commentsFailure?'failed':!capabilities.canReadComments?'auth_required':commentReads?'success':'unavailable';
    if (destinations.length) analyticsRepo.updateSyncState(accountId,'comments',commentsStatus,commentsFailure || (commentsStatus==='auth_required'?'Official comment-reading permissions are unavailable.':commentsStatus==='unavailable'?'No supported comment source was read.':undefined),commentsSynced);
    const finalStatus = syncError
      ? 'auth_required'
      : commentsFailure ? 'failed' : (apiFailure && !hasSyncedData
        ? 'failed'
        : (isAuthorized || hasSyncedData ? 'success' : 'auth_required'));
    const finalMessage = syncError || commentsFailure || (apiFailure && !hasSyncedData ? apiFailure : (isAuthorized || hasSyncedData ? undefined : 'Official API authorization required for automated synchronization. Connect live credentials in Accounts or record verified observations.'));

    analyticsRepo.updateSyncState(accountId, 'all', finalStatus, finalMessage, metricsSynced + commentsSynced + accountMetricsSynced);

    // Broadcast SSE update
    eventsService.broadcast('analytics:synced', {
      accountId,
      accountName: account.name,
      metricsSynced,
      commentsSynced,
      accountMetricsSynced,
      status: finalStatus,
      timestamp: new Date().toISOString(),
    });

    return {
      success: (isAuthorized || hasSyncedData) && !syncError && !commentsFailure && (!apiFailure || hasSyncedData),
      metricsSynced,
      commentsSynced,
      status: finalStatus,
      message: finalMessage,
      commentsStatus,
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
