import { db } from '../db/database.js';
import { ffmpegService, BrandKitOptions } from './ffmpeg.service.js';
import { getConnector } from '../connectors/registry.js';
import { eventService } from './events.service.js';

export class QueueService {
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Restart recovery: Reset any jobs stuck in transitory states on server restart
    this.recoverInterruptedJobs();

    // Start background processing loop every 2 seconds
    this.intervalTimer = setInterval(() => {
      this.processNextJobs();
    }, 2000);

    console.log('[QueueService] Background publishing worker started.');
  }

  stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
    console.log('[QueueService] Background publishing worker stopped.');
  }

  private recoverInterruptedJobs() {
    const stuckJobs = db.prepare(`
      SELECT id, status FROM publishing_destinations
      WHERE status IN ('preparing', 'branding', 'uploading')
    `).all() as { id: string; status: string }[];

    if (stuckJobs.length > 0) {
      console.log(`[QueueService] Recovering ${stuckJobs.length} interrupted publishing destinations...`);
      const resetStmt = db.prepare(`
        UPDATE publishing_destinations
        SET status = 'preparing', progress = 0, error_message = 'Interrupted by server restart, auto-resuming...'
        WHERE id = ?
      `);
      for (const job of stuckJobs) {
        resetStmt.run(job.id);
      }
    }
  }

  async processNextJobs() {
    // 1. Check for scheduled posts that are due
    const nowIso = new Date().toISOString();
    const dueScheduled = db.prepare(`
      SELECT pd.id, pd.post_id
      FROM publishing_destinations pd
      JOIN publishing_posts p ON pd.post_id = p.id
      WHERE pd.status = 'scheduled'
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= datetime('now'))
    `).all() as { id: string; post_id: string }[];

    for (const due of dueScheduled) {
      db.prepare("UPDATE publishing_destinations SET status = 'preparing', progress = 0 WHERE id = ?").run(due.id);
      db.prepare("UPDATE publishing_posts SET status = 'processing' WHERE id = ?").run(due.post_id);
    }

    // 2. Fetch up to 2 queued/preparing jobs to process concurrently
    const pendingJobs = db.prepare(`
      SELECT 
        pd.id, pd.post_id, pd.account_id, pd.caption, pd.hashtags,
        pd.apply_branding, pd.branding_override_json, pd.status,
        pd.retry_count, pd.max_retries,
        p.title, p.scheduled_at,
        v.file_path as original_video_path,
        a.platform, a.name as account_name, a.handle as account_handle,
        a.connector_mode, a.access_token, a.external_id, a.brand_kit_json, a.status as account_status
      FROM publishing_destinations pd
      JOIN publishing_posts p ON pd.post_id = p.id
      JOIN videos v ON p.video_id = v.id
      JOIN accounts a ON pd.account_id = a.id
      WHERE pd.status IN ('preparing', 'branding')
      LIMIT 2
    `).all() as any[];

    for (const job of pendingJobs) {
      this.executeDestinationJob(job).catch((err) => {
        console.error(`[QueueService] Destination job ${job.id} error:`, err);
      });
    }
  }

  private async executeDestinationJob(job: any) {
    try {
      // Step A: Branding
      let finalVideoPath = job.original_video_path;

      if (job.apply_branding) {
        this.updateDestinationStatus(job.id, 'branding', 10);

        let brandKit: BrandKitOptions;
        if (job.branding_override_json) {
          try {
            brandKit = JSON.parse(job.branding_override_json);
          } catch {
            brandKit = JSON.parse(job.brand_kit_json || '{}');
          }
        } else {
          brandKit = JSON.parse(job.brand_kit_json || '{}');
        }

        finalVideoPath = await ffmpegService.renderBrandedVideo(
          job.original_video_path,
          brandKit,
          (pct) => {
            const mappedProgress = Math.min(40, 10 + Math.round(pct * 0.3));
            this.updateDestinationStatus(job.id, 'branding', mappedProgress);
          }
        );

        db.prepare('UPDATE publishing_destinations SET branded_video_path = ? WHERE id = ?').run(
          finalVideoPath,
          job.id
        );
      }

      // Step B: Uploading via Account Connector
      this.updateDestinationStatus(job.id, 'uploading', 45);

      const connector = getConnector({
        connector_mode: job.connector_mode,
        platform: job.platform,
        access_token: job.access_token,
      });

      const result = await connector.publishVideo(
        {
          id: job.account_id,
          name: job.account_name,
          handle: job.account_handle,
          platform: job.platform,
          access_token: job.access_token,
          external_id: job.external_id,
          status: job.account_status,
          connector_mode: job.connector_mode,
        },
        {
          destinationId: job.id,
          postId: job.post_id,
          accountId: job.account_id,
          videoPath: finalVideoPath,
          title: job.title,
          caption: job.caption,
          hashtags: job.hashtags,
          applyBranding: !!job.apply_branding,
          scheduledAt: job.scheduled_at,
        },
        (pct, stage) => {
          this.updateDestinationStatus(
            job.id,
            stage === 'published' ? 'published' : 'uploading',
            45 + Math.round(pct * 0.55)
          );
        }
      );

      // Step C: Success Confirmation
      db.prepare(`
        UPDATE publishing_destinations
        SET status = 'published', progress = 100, remote_post_id = ?,
            remote_post_url = ?, published_at = datetime('now'),
            verification_status = ?, error_message = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(result.remotePostId, result.remotePostUrl, result.verificationStatus, job.id);

      // Log activity event
      db.prepare(`
        INSERT INTO activity_events (id, type, account_id, title, message, severity)
        VALUES (?, 'publish_success', ?, ?, ?, 'success')
      `).run(
        `act-${Date.now()}`,
        job.account_id,
        `Published to ${job.account_name}`,
        `Video "${job.title}" successfully published to ${job.account_name} (${job.platform}).`
      );

      eventService.broadcast('destination_updated', {
        destinationId: job.id,
        status: 'published',
        progress: 100,
        remotePostUrl: result.remotePostUrl,
      });

      this.syncParentPostStatus(job.post_id);
    } catch (err: any) {
      console.error(`[QueueService] Publishing failed for destination ${job.id}:`, err.message);

      const retryCount = (job.retry_count || 0) + 1;
      const canRetry = retryCount <= (job.max_retries || 3);

      if (canRetry) {
        db.prepare(`
          UPDATE publishing_destinations
          SET status = 'preparing', retry_count = ?, error_message = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(retryCount, `Retry ${retryCount}/${job.max_retries}: ${err.message}`, job.id);
      } else {
        db.prepare(`
          UPDATE publishing_destinations
          SET status = 'failed', error_message = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(err.message, job.id);

        db.prepare(`
          INSERT INTO activity_events (id, type, account_id, title, message, severity)
          VALUES (?, 'publish_failure', ?, ?, ?, 'error')
        `).run(
          `act-${Date.now()}`,
          job.account_id,
          `Publish Failed for ${job.account_name}`,
          `Failed to publish video "${job.title}": ${err.message}`
        );
      }

      eventService.broadcast('destination_updated', {
        destinationId: job.id,
        status: canRetry ? 'preparing' : 'failed',
        error: err.message,
      });

      this.syncParentPostStatus(job.post_id);
    }
  }

  private updateDestinationStatus(destinationId: string, status: string, progress: number) {
    db.prepare(`
      UPDATE publishing_destinations
      SET status = ?, progress = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, progress, destinationId);

    eventService.broadcast('destination_updated', {
      destinationId,
      status,
      progress,
    });
  }

  private syncParentPostStatus(postId: string) {
    const dests = db.prepare('SELECT status FROM publishing_destinations WHERE post_id = ?').all(postId) as { status: string }[];
    if (dests.length === 0) return;

    const allPublished = dests.every((d) => d.status === 'published');
    const allFailed = dests.every((d) => d.status === 'failed');
    const anyFailed = dests.some((d) => d.status === 'failed');
    const anyProcessing = dests.some((d) => ['preparing', 'branding', 'uploading', 'awaiting_confirmation'].includes(d.status));

    let newStatus = 'processing';
    if (allPublished) newStatus = 'completed';
    else if (allFailed) newStatus = 'failed';
    else if (anyFailed && !anyProcessing) newStatus = 'partial_failure';

    db.prepare("UPDATE publishing_posts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, postId);
  }
}

export const queueService = new QueueService();
