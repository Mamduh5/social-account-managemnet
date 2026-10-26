import { calendarRepo } from '../repositories/calendar.repo.js';
import {generalPostsRepo} from '../repositories/general-posts.repo.js';
import {verifiedImagePath} from './image-media.service.js';
import fs from 'fs';
import { ffmpegService, BrandKitOptions } from './ffmpeg.service.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { bridgeConnector, getConnector } from '../connectors/registry.js';
import { ensureFreshToken } from './connections.service.js';
import { eventService } from './events.service.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';
import { resolveParentPostStatus } from '../domain/publishing.js';
import { DestinationStatus } from '../domain/types.js';

export class QueueService {
  private isRunning = false;
  private inFlight = new Set<string>();
  private intervalTimer: NodeJS.Timeout | null = null;

  get activeJobCount(){return this.inFlight.size;}

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
        publishingRepo.resetStuckJob(job.id, 'Interrupted by server restart; review native publication before explicit retry.');
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
    if (this.inFlight.has(job.id)) return;
    const current = publishingRepo.getDestinationById(job.id);
    if (!current || !['preparing', 'branding'].includes(current.status) || current.error_message?.startsWith('Interrupted by server restart')) return;
    if (job.scheduled_at && (!Number.isFinite(Date.parse(job.scheduled_at)) || Date.parse(job.scheduled_at) > Date.now())) return;
    if (job.campaign_id && (!calendarRepo.ready() || calendarRepo.getCampaignById(job.campaign_id)?.status !== 'active')) return;
    this.inFlight.add(job.id);
    try {
      const initialAccount = accountsRepo.getAccountById(job.account_id) as any;
      if (!initialAccount || initialAccount.archived_at) throw new Error('Account is archived or unavailable');
      if (job.content_type && job.content_type !== 'reel') {
        await this.executeGeneralPost(job);
        return;
      }
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

        brandKit = { ...brandKit, watermarkType: brandKit.watermarkType || 'moving_text', text: brandKit.text ?? job.account_handle, movementPreset: brandKit.movementPreset || 'smooth_sine' };
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

      let account = accountsRepo.getAccountById(job.account_id) as any;
      if (!account || account.archived_at) throw new Error('Account is archived or unavailable');
      try {
        account = (await ensureFreshToken(account)) || account;
      } catch (err: any) {
        console.warn('[QueueService] Token freshness check error:', err.message);
      }
      const resolved = getConnector(account);
      const connector = !account.is_demo && !resolved.getCapabilities().canPublish ? bridgeConnector : resolved;
      const result = await connector.publishVideo(
        account,
        {
          destinationId: job.id,
          postId: job.post_id,
          accountId: job.account_id,
          videoPath: finalVideoPath,
          title: job.title,
          caption: job.caption,
          hashtags: job.hashtags,
          applyBranding: !!job.apply_branding,
          // The local queue owns scheduling. Once due, publish immediately;
          // do not ask Meta to schedule again using an already elapsed time.
          scheduledAt: undefined,
          onRemoteCreated: (remoteId) => publishingRepo.recordRemoteUpload(job.id, remoteId),
        },
        (pct, stage) => {
          this.updateDestinationStatus(
            job.id,
            stage === 'awaiting_confirmation' ? 'awaiting_confirmation' : 'uploading',
            45 + Math.round(pct * 0.55)
          );
        }
      );

      if (!result.success) throw new Error(result.errorMessage || 'Connector did not confirm success');
      if (!account.is_demo && result.verificationStatus !== 'confirmed') {
        publishingRepo.markAwaitingConfirmation(job.id, result.remotePostId, result.remotePostUrl);
        eventService.broadcast('destination_updated', { destinationId: job.id, status: 'awaiting_confirmation', progress: 90 });
        this.syncParentPostStatus(job.post_id);
        return;
      }
      // Step C: Success Confirmation
      publishingRepo.markDestinationPublished({
        destinationId: job.id,
        remotePostId: result.remotePostId,
        remotePostUrl: result.remotePostUrl,
        verificationStatus: result.verificationStatus,
        confirmationSource: account.is_demo ? 'simulator' : 'api',
      });

      // Log activity event
      activityRepo.logEvent({
        type: 'publish_success',
        accountId: job.account_id,
        title: `${account.is_demo ? 'Demo simulated publication' : 'Published'} to ${job.account_name}`,
        message: `${account.is_demo ? "SIMULATED: " : ""}Video "${job.title}" successfully published to ${job.account_name} (${job.platform}).`,
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
      const account = accountsRepo.getAccountById(job.account_id) as any;
      const canRetry = !!account?.is_demo && retryCount <= (job.max_retries || 3);

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
    } finally {
      this.inFlight.delete(job.id);
    }
  }

  async executeGeneralPost(job:any, reconcileOnly=false) {
    const current=publishingRepo.getDestinationById(job.id) as any;
    if(!current) throw new Error('Destination not found');
    if(current.submission_state && !current.remote_post_id) throw new Error('Remote outcome is uncertain; reconcile in the native Page before any retry. Automatic replay is blocked.');
    if(reconcileOnly&&!current.remote_post_id)throw new Error('No saved remote post ID; native reconciliation is required');
    const storedAccount=accountsRepo.getAccountById(job.account_id) as any;
    const account=reconcileOnly?storedAccount:await ensureFreshToken(storedAccount);
    if(!account||account.archived_at||account.platform!=='facebook'||account.account_type!=='page')throw new Error('General publishing requires an active Facebook Page');
    const connector=getConnector(account);
    if(!connector.getCapabilities().canPublish||!connector.publishPost)throw new Error('General Page publishing authorization is unavailable');
    const attachments=current.remote_post_id?[]:generalPostsRepo.attachments(job.id).map(a=>({id:a.media_id,path:verifiedImagePath({...a,file_path:a.file_path,id:a.media_id}),mimeType:a.mime_type,altText:a.alt_text,remoteId:a.remote_id||undefined}));
    if(!reconcileOnly)this.updateDestinationStatus(job.id,'uploading',45);
    const result=await connector.publishPost(account,{
      destinationId:job.id,postId:job.post_id,accountId:job.account_id,contentType:current.content_type,
      caption:current.caption,hashtags:current.hashtags,linkUrl:current.link_url||undefined,
      attachments,remotePostId:current.remote_post_id||undefined,
      onSubmissionStarted:(stage,attachmentId)=>generalPostsRepo.submissionStarted(job.id,stage,attachmentId),
      onAttachmentUploaded:(id,remoteId)=>generalPostsRepo.attachmentUploaded(job.id,id,remoteId),
      onRemoteCreated:remoteId=>{publishingRepo.recordRemoteUpload(job.id,remoteId);generalPostsRepo.remoteCreated(job.id);}
    });
    if(!result.success||result.verificationStatus!=='confirmed'||!result.remotePostId||!result.remotePostUrl)throw new Error('Page publication was not confirmed; use read-only reconciliation.');
    publishingRepo.markDestinationPublished({destinationId:job.id,remotePostId:result.remotePostId,remotePostUrl:result.remotePostUrl,verificationStatus:'confirmed',confirmationSource:account.is_demo?'simulator':'api'});
    activityRepo.logEvent({type:'publish_success',accountId:job.account_id,title:account.is_demo?'SIMULATED Page post':'Page post confirmed',message:job.title||'General Page post',severity:'success'});
    eventService.broadcast('destination_updated',{destinationId:job.id,status:'published',progress:100});
    this.syncParentPostStatus(job.post_id);
  }

  async reconcileGeneralDestination(id:string) {
    const destination=publishingRepo.getDestinationById(id) as any;
    if(!destination||destination.content_type==='reel'||!destination.content_type)throw new Error('Select a general Page destination');
    if(destination.status==='published')return;
    if(!['failed','awaiting_confirmation','preparing'].includes(destination.status)||this.inFlight.has(id))throw new Error('Destination is busy');
    this.inFlight.add(id);
    try {await this.executeGeneralPost({...destination,post_id:destination.post_id,account_id:destination.account_id},true);} finally {this.inFlight.delete(id);}
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
