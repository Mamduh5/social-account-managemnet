import fs from 'fs';
import { ffmpegService, BrandKitOptions } from './ffmpeg.service.js';
import { getConnector } from '../connectors/registry.js';
import { eventService } from './events.service.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';
import { resolveParentPostStatus } from '../domain/publishing.js';
import { DestinationStatus } from '../domain/types.js';

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

  recoverInterruptedJobs() {
    const stuckJobs = publishingRepo.getStuckJobs();

    if (stuckJobs.length > 0) {
      console.log(`[QueueService] Recovering ${stuckJobs.length} interrupted publishing destinations...`);
      for (const job of stuckJobs) {
        publishingRepo.resetStuckJob(job.id, 'Interrupted by server restart, auto-resuming...');
      }
    }
  }

  async processNextJobs() {
    // 1. Check for scheduled posts that are due
    const dueScheduled = publishingRepo.getDueScheduledDestinations();

    for (const due of dueScheduled) {
      publishingRepo.updateDestinationStatus(due.id, 'preparing', 0);
      publishingRepo.updateParentPostStatus(due.post_id, 'processing');
    }

    // 2. Fetch up to 2 queued/preparing jobs to process concurrently
    const pendingJobs = publishingRepo.getPendingQueueJobs(2);

    for (const job of pendingJobs) {
      this.executeDestinationJob(job).catch((err) => {
        console.error(`[QueueService] Destination job ${job.id} error:`, err);
      });
    }
  }

  private async executeDestinationJob(job: any) {
    try {
      // Step A: Video Version & Branding Resolution
      let finalVideoPath = job.original_video_path;

      if (job.branded_video_path && fs.existsSync(job.branded_video_path)) {
        // Pre-rendered branded variant explicitly selected and verified on disk
        finalVideoPath = job.branded_video_path;
        console.log(`[QueueService] Destination ${job.id} using pre-rendered branded variant: ${finalVideoPath}`);
      } else if (job.apply_branding) {
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

        publishingRepo.updateDestinationBrandedPath(job.id, finalVideoPath);
      } else {
        // Original unbranded video published directly
        publishingRepo.updateDestinationBrandedPath(job.id, finalVideoPath);
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
      publishingRepo.markDestinationPublished({
        destinationId: job.id,
        remotePostId: result.remotePostId,
        remotePostUrl: result.remotePostUrl,
        verificationStatus: result.verificationStatus,
      });

      // Log activity event
      activityRepo.logEvent({
        type: 'publish_success',
        accountId: job.account_id,
        title: `Published to ${job.account_name}`,
        message: `Video "${job.title}" successfully published to ${job.account_name} (${job.platform}).`,
        severity: 'success',
      });

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
        publishingRepo.retryDestination(
          job.id,
          retryCount,
          `Retry ${retryCount}/${job.max_retries}: ${err.message}`
        );
      } else {
        publishingRepo.markDestinationFailed(job.id, err.message);

        activityRepo.logEvent({
          type: 'publish_failure',
          accountId: job.account_id,
          title: `Publish Failed for ${job.account_name}`,
          message: `Failed to publish video "${job.title}": ${err.message}`,
          severity: 'error',
        });
      }

      eventService.broadcast('destination_updated', {
        destinationId: job.id,
        status: canRetry ? 'preparing' : 'failed',
        error: err.message,
      });

      this.syncParentPostStatus(job.post_id);
    }
  }

  updateDestinationStatus(destinationId: string, status: DestinationStatus, progress: number) {
    publishingRepo.updateDestinationStatus(destinationId, status, progress);

    eventService.broadcast('destination_updated', {
      destinationId,
      status,
      progress,
    });
  }

  syncParentPostStatus(postId: string) {
    const dests = publishingRepo.getDestinationsByPostId(postId);
    if (dests.length === 0) return;

    const newStatus = resolveParentPostStatus(dests.map((d) => d.status));
    publishingRepo.updateParentPostStatus(postId, newStatus);
  }
}

export const queueService = new QueueService();
