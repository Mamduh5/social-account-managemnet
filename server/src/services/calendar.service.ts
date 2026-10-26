import { randomUUID, createHash } from 'node:crypto';
import { db } from '../db/database.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { generalPostsRepo } from '../repositories/general-posts.repo.js';
import { calendarRepo } from '../repositories/calendar.repo.js';
import {
  type CampaignPlanInput,
  type PlanItemInput,
  type CalendarItem,
  type CampaignSummary,
  campaignPlanSchema,
  normalizePlanItems,
  calculateCampaignApprovalHash,
  formatBangkokDateTime,
  parseBangkokScheduledTime,
} from '../domain/content-calendar.js';
import { generalPostsService, pagePostCapabilities } from './general-posts.service.js';
import { publishingService } from './publishing.service.js';
import { activityRepo } from '../repositories/activity.repo.js';
import { eventService } from './events.service.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export class CalendarService {
  requireReady() {
    if (!calendarRepo.ready()) {
      throw new Error('Content Calendar schema is not initialized. Complete V1.10+ migration first.');
    }
  }

  getHealth() {
    const now = new Date();
    const bangkokTime = formatBangkokDateTime(now);
    const pausedCampaigns = calendarRepo.getCampaigns().filter((c) => c.status === 'paused');
    const queue = publishingRepo.getLiveQueue();
    const scheduled = queue.filter((q) => q.status === 'scheduled');
    const inProgress = queue.filter((q) => ['preparing', 'branding', 'uploading'].includes(q.status));
    const stuck = publishingRepo.getStuckJobs();

    return {
      status: 'ok',
      timezone: 'Asia/Bangkok',
      currentTimeUtc: now.toISOString(),
      currentTimeBangkok: bangkokTime,
      activeJobs: inProgress.length,
      scheduledJobs: scheduled.length,
      pausedCampaignsCount: pausedCampaigns.length,
      stuckJobsCount: stuck.length,
      offlineNotice:
        'Social Command Center runs on the local PC. Scheduled posts are dispatched only when the PC and server are active at the scheduled time. If the PC is offline during a scheduled time, jobs are held safely for owner review upon startup rather than flooded.',
    };
  }

  getCampaigns(accountId?: string): CampaignSummary[] {
    this.requireReady();
    return calendarRepo.getCampaigns(accountId);
  }

  getCampaignById(id: string): CampaignSummary {
    this.requireReady();
    const campaign = calendarRepo.getCampaignById(id);
    if (!campaign) throw new Error('Campaign not found');
    return campaign;
  }

  getCalendarItems(filter: {
    accountId?: string;
    campaignId?: string;
    startDate?: string;
    endDate?: string;
    days?: number;
  } = {}): CalendarItem[] {
    this.requireReady();

    // If days specified (7, 14, 30), calculate start & end if omitted
    let startDate = filter.startDate;
    let endDate = filter.endDate;

    if (filter.days && !startDate) {
      const now = new Date();
      startDate = now.toISOString();
      const end = new Date(now.getTime() + filter.days * 86400000);
      endDate = end.toISOString();
    }

    return calendarRepo.getCalendarItems({
      accountId: filter.accountId,
      campaignId: filter.campaignId,
      startDate,
      endDate,
    });
  }

  createCampaignPlan(raw: unknown): { campaign: CampaignSummary; items: CalendarItem[] } {
    this.requireReady();
    const parsed = campaignPlanSchema.parse(raw);

    // 1. Verify Destination Account
    const account = accountsRepo.getAccountById(parsed.accountId) as any;
    if (!account || account.archived_at) {
      throw new Error('Destination account not found or is archived');
    }
    if (account.platform !== 'facebook' || account.account_type !== 'page') {
      throw new Error('Content Calendar publishing currently supports authorized Facebook Pages');
    }
    const caps = pagePostCapabilities(account);
    if (!caps.supportedPostTypes.length) {
      throw new Error('Selected Page lacks authorized publishing capabilities');
    }

    // 2. Validate Items & Capabilities
    const normalizedItems = normalizePlanItems(parsed.items, parsed.accountId);
    for (const item of normalizedItems) {
      if (!caps.supportedPostTypes.includes(item.contentType)) {
        throw new Error(
          `Post "${item.title}" uses type "${item.contentType}" which is unsupported for this destination`
        );
      }
    }

    // 3. Calculate Date Bounds (Bangkok)
    const startDateObj = new Date(`${parsed.startDate}T00:00:00+07:00`);
    const endDateObj = new Date(startDateObj.getTime() + parsed.days * 86400000);
    const endDateStr = endDateObj.toISOString().slice(0, 10);

    const campaignId = parsed.id || `camp-${randomUUID()}`;
    if (calendarRepo.getCampaignById(campaignId)) throw new Error('Campaign already exists; edit its current draft instead');

    // 4. Save in single transaction
    const savedDraftIds: string[] = [];
    db.transaction(() => {
      calendarRepo.saveCampaign({
        id: campaignId,
        accountId: parsed.accountId,
        name: parsed.name,
        editorialScope: parsed.editorialScope,
        startDate: parsed.startDate,
        endDate: endDateStr,
        days: parsed.days,
        maxPublications: parsed.maxPublications,
        origin: parsed.origin,
        status: 'draft',
      });

      for (const item of normalizedItems) {
        // Construct GeneralPost draft input
        const draftInput = {
          title: item.title,
          contentType: item.contentType,
          scheduledAt: item.scheduledAtUtc,
          videoId: item.videoId,
          destinations: [
            {
              accountId: parsed.accountId,
              caption: item.caption,
              hashtags: item.hashtags,
              linkUrl: item.linkUrl,
              attachments: item.attachments || [],
            },
          ],
        };

        const saved = generalPostsService.save(draftInput);
        savedDraftIds.push(saved.id);
        calendarRepo.setDraftCampaign(saved.id, campaignId, parsed.origin);
      }
    })();

    const campaign = this.getCampaignById(campaignId);
    const items = calendarRepo.getCalendarItems({ campaignId });

    activityRepo.logEvent({
      type: 'campaign_created',
      accountId: parsed.accountId,
      title: `Plan created: ${parsed.name}`,
      message: `Created ${parsed.days}-day content plan with ${normalizedItems.length} planned posts. (Origin: ${parsed.origin})`,
      severity: 'info',
    });

    return { campaign, items };
  }

  submitCampaignForApproval(campaignId: string): CampaignSummary {
    this.requireReady();
    const campaign = this.getCampaignById(campaignId);
    if (campaign.status !== 'draft') {
      throw new Error(`Campaign cannot be submitted for approval from status: ${campaign.status}`);
    }

    calendarRepo.updateCampaignStatus(campaignId, 'awaiting_approval');
    return this.getCampaignById(campaignId);
  }

  /**
   * One-time campaign approval:
   * 1. Validates all drafts in the campaign.
   * 2. Binds exact destination account, content revisions, attached media, and scheduled publication times.
   * 3. Computes cryptographic SHA-256 fingerprint (approved_hash).
   * 4. Approves drafts and queues them into publishing queue with status: 'scheduled'.
   * 5. Sets campaign status to 'active'.
   */
  approveCampaign(campaignId: string): {
    campaign: CampaignSummary;
    queuedCount: number;
    approvedHash: string;
  } {
    this.requireReady();
    const campaign = this.getCampaignById(campaignId);
    if (!['draft', 'awaiting_approval'].includes(campaign.status)) {
      throw new Error(`Campaign cannot be approved from status: ${campaign.status}`);
    }

    const items = calendarRepo.getCalendarItems({ campaignId }).filter(item => item.status !== 'cancelled');
    const draftItems = items.filter((i) => i.sourceType === 'draft');

    if (draftItems.length === 0) {
      throw new Error('Campaign has no unapproved drafts to approve');
    }
    if (items.length > campaign.maxPublications) {
      throw new Error(
        `Campaign post count (${items.length}) exceeds maximum authorized publications (${campaign.maxPublications})`
      );
    }

    // Ensure all items strictly belong to the campaign account
    for (const item of draftItems) {
      if (item.accountId !== campaign.accountId) {
        throw new Error(
          `Security violation: Item ${item.id} belongs to account ${item.accountId}, not campaign account ${campaign.accountId}`
        );
      }
    }

    // Build hash binding
    const hashData: Array<{ id: string; revision: number; payloadHash: string; scheduledAt: string }> = [];
    for (const item of draftItems) {
      const rawDraft = generalPostsRepo.get(item.draftId!);
      if (!rawDraft) throw new Error(`Draft ${item.draftId} not found`);
      hashData.push({
        id: rawDraft.id,
        revision: rawDraft.revision,
        payloadHash: hash(rawDraft.payload_json),
        scheduledAt: item.scheduledAt || '',
      });
    }

    for (const item of items.filter(item => item.sourceType === 'destination')) {
      const destination = publishingRepo.getDestinationById(item.id) as any;
      hashData.push({id:item.id,revision:item.revision,payloadHash:hash(JSON.stringify(destination)),scheduledAt:item.scheduledAt || ''});
    }
    const approvedHash = calculateCampaignApprovalHash({
      campaignId,
      accountId: campaign.accountId,
      items: hashData,
    });

    let queuedCount = 0;
    db.transaction(() => {
      // 1. Batch approve drafts
      generalPostsService.approveBatch(
        draftItems.map((d) => ({ id: d.draftId!, revision: d.revision }))
      );

      // 2. Queue all approved drafts into publishing destinations with campaign_id
      for (const item of draftItems) {
        const queued = generalPostsService.queue(item.draftId!, item.revision);
        const destinations = publishingRepo.getPostDestinationRows(queued.postId);
        for (const dest of destinations) {
          calendarRepo.setDestinationCampaign(dest.id, campaignId, campaign.origin);
        }
        calendarRepo.setPostCampaign(queued.postId, campaignId, campaign.origin);
        queuedCount++;
      }

      // 3. Mark campaign active & approved
      calendarRepo.updateCampaignStatus(
        campaignId,
        'active',
        (campaign.approvedRevision || 0) + 1,
        approvedHash,
        new Date().toISOString()
      );
    })();

    activityRepo.logEvent({
      type: 'campaign_approved',
      accountId: campaign.accountId,
      title: `Campaign Approved: ${campaign.name}`,
      message: `Batch approved ${queuedCount} posts for ${campaign.accountName}. Bounded hash: ${approvedHash.slice(0, 12)}...`,
      severity: 'success',
    });

    eventService.broadcast('campaign_updated', { campaignId, status: 'active', approvedHash });

    return {
      campaign: this.getCampaignById(campaignId),
      queuedCount,
      approvedHash,
    };
  }

  pauseCampaign(campaignId: string): CampaignSummary {
    this.requireReady();
    const campaign = this.getCampaignById(campaignId);
    if (campaign.status !== 'active') {
      throw new Error(`Only active campaigns can be paused. Current status: ${campaign.status}`);
    }

    calendarRepo.updateCampaignStatus(campaignId, 'paused');

    activityRepo.logEvent({
      type: 'campaign_paused',
      accountId: campaign.accountId,
      title: `Campaign Paused: ${campaign.name}`,
      message: `Automatic publishing for campaign "${campaign.name}" has been paused by the owner.`,
      severity: 'warning',
    });

    eventService.broadcast('campaign_updated', { campaignId, status: 'paused' });
    return this.getCampaignById(campaignId);
  }

  resumeCampaign(campaignId: string): CampaignSummary {
    this.requireReady();
    const campaign = this.getCampaignById(campaignId);
    if (campaign.status !== 'paused') {
      throw new Error(`Only paused campaigns can be resumed. Current status: ${campaign.status}`);
    }

    return db.transaction(() => {
    // Hold jobs atomically before campaign dispatch becomes active again.
    const items = calendarRepo.getCalendarItems({ campaignId });
    const now = Date.now();
    for (const item of items) {
      if (
        item.sourceType === 'destination' &&
        ['scheduled', 'paused'].includes(item.status) &&
        item.scheduledAt &&
        Date.parse(item.scheduledAt) <= now
      ) {
        publishingRepo.resetStuckJob(
          item.destinationId!,
          'Interrupted by server restart/review hold: job became overdue while campaign was paused. Explicit owner review required.'
        );
      }
    }

    calendarRepo.updateCampaignStatus(campaignId, 'active');

    activityRepo.logEvent({
      type: 'campaign_resumed',
      accountId: campaign.accountId,
      title: `Campaign Resumed: ${campaign.name}`,
      message: `Campaign "${campaign.name}" resumed. Overdue posts are held for review; future posts will publish as scheduled.`,
      severity: 'info',
    });

    eventService.broadcast('campaign_updated', { campaignId, status: 'active' });
    return this.getCampaignById(campaignId);
    })();
  }

  /**
   * Immediate Publish Override:
   * Publishes an eligible scheduled destination immediately without waiting for its scheduled time.
   */
  async publishItemNow(itemId: string): Promise<{ success: boolean; message: string }> {
    this.requireReady();
    const dest = publishingRepo.getDestinationById(itemId);
    if (dest) {
      if (dest.status !== 'scheduled' || dest.remote_post_id || (dest as any).remote_post_url || (dest as any).submission_state || dest.error_message) {
        throw new Error('Only an unsubmitted scheduled item without a review hold can be published now');
      }
      const campaignId = (dest as any).campaign_id;
      if (campaignId && this.getCampaignById(campaignId).status !== 'active') throw new Error('Campaign must be active before an immediate override');
      const account = accountsRepo.getAccountById(dest.account_id);
      if (!pagePostCapabilities(account).supportedPostTypes.includes((dest as any).content_type || 'reel')) throw new Error('Destination publishing capability is unavailable');
      return db.transaction(() => {
        const previousTime = (db.prepare('SELECT scheduled_at FROM publishing_posts WHERE id=?').get(dest.post_id) as any)?.scheduled_at;
        const immediateTime = new Date().toISOString();
        db.prepare("UPDATE publishing_posts SET scheduled_at=?,updated_at=datetime('now') WHERE id=?").run(immediateTime,dest.post_id);
        publishingRepo.updateDestinationStatus(dest.id, 'preparing', 0);
        publishingRepo.updateParentPostStatus(dest.post_id, 'processing');
        // This explicit owner override binds a new campaign approval to the changed time.
        if (campaignId) {
          const campaign = this.getCampaignById(campaignId);
          const items = calendarRepo.getCalendarItems({campaignId}).filter(item=>item.status!=='cancelled');
          const approvedHash = calculateCampaignApprovalHash({campaignId,accountId:campaign.accountId,items:items.map(item=>({id:item.id,revision:item.revision,payloadHash:hash(JSON.stringify(publishingRepo.getDestinationById(item.id))),scheduledAt:item.scheduledAt || ''}))});
          calendarRepo.updateCampaignStatus(campaignId,'active',(campaign.approvedRevision || 0)+1,approvedHash,immediateTime);
        }
        activityRepo.logEvent({type:'calendar_immediate_override',accountId:dest.account_id,title:'Owner requested immediate publication',message:`Destination ${dest.id}; previous schedule ${previousTime || 'none'}; explicit override ${immediateTime}`,severity:'warning'});
        eventService.broadcast('destination_updated', { destinationId: dest.id, status: 'preparing', progress: 0 });
        return { success: true, message: 'Item queued for immediate publication' };
      })();
    }

    const draft = generalPostsRepo.get(itemId);
    if (draft) {
      if (draft.status !== 'approved') throw new Error('Draft must be approved before immediate publication');
      if (JSON.parse(draft.payload_json).scheduledAt) throw new Error('Schedule is part of approval; edit and approve the exact immediate draft first');
      const queued = generalPostsService.queue(itemId, draft.revision);
      return { success: true, message: `Draft queued immediately as post ${queued.postId}` };
    }

    throw new Error('Item not found');
  }

  editItem(
    itemId: string,
    updates: { caption?: string; hashtags?: string; scheduledAt?: string; linkUrl?: string }
  ): CalendarItem {
    this.requireReady();
    const draft = generalPostsRepo.get(itemId);
    if (draft) {
      return db.transaction(() => {
      const payload = JSON.parse(draft.payload_json);
      const dest = payload.destinations?.[0];
      if (updates.caption !== undefined) dest.caption = updates.caption;
      if (updates.hashtags !== undefined) dest.hashtags = updates.hashtags;
      if (updates.linkUrl !== undefined) dest.linkUrl = updates.linkUrl;
      if (updates.scheduledAt !== undefined) {
        payload.scheduledAt = parseBangkokScheduledTime(updates.scheduledAt);
      }

      // Material edit clears approval!
      generalPostsService.save(payload, itemId, draft.revision);

      // If draft was part of an approved campaign, invalidate campaign approval
      if (draft.campaign_id) {
        calendarRepo.updateCampaignStatus(draft.campaign_id, 'draft', null, null, null);
      }

      const items = calendarRepo.getCalendarItems();
      const updated = items.find((i) => i.id === itemId);
      return updated!;
      })();
    }

    const dest = publishingRepo.getDestinationById(itemId);
    if (dest) {
      const campaignId = (dest as any).campaign_id;
      if (!campaignId) throw new Error('Queued publication history is immutable; create a new draft to revise it');
      return db.transaction(() => {
        const campaign = this.getCampaignById(campaignId);
        const rows = db.prepare("SELECT * FROM publishing_destinations WHERE campaign_id=? AND status NOT IN ('published','cancelled') ORDER BY id").all(campaignId) as any[];
        if (!rows.some(row=>row.id===itemId)) throw new Error('Published/cancelled history cannot be edited');
        if (rows.some(row=>!['scheduled','failed'].includes(row.status)||row.remote_post_id||row.remote_post_url||row.submission_state)) throw new Error('Campaign has in-flight or uncertain submissions; reconcile before editing');
        let replacementId = '';
        // Keep the original approved/queued history. Recreate only unsubmitted
        // pending items as drafts and cancel their old queue rows atomically.
        for (const row of rows) {
          const original = row.approval_draft_id && generalPostsRepo.get(row.approval_draft_id);
          if (!original) throw new Error('Saved source draft is required to revise a queued campaign item');
          const payload = JSON.parse(original.payload_json);
          const saved = generalPostsService.save(payload);
          calendarRepo.setDraftCampaign(saved.id,campaignId,campaign.origin);
          db.prepare("UPDATE publishing_destinations SET status='cancelled',error_message='Replaced by unapproved campaign revision',updated_at=datetime('now') WHERE id=?").run(row.id);
          publishingRepo.updateParentPostStatus(row.post_id,'failed');
          if (row.id===itemId) replacementId=saved.id;
        }
        calendarRepo.updateCampaignStatus(campaignId,'draft',null,null,null);
        return this.editItem(replacementId,updates);
      })();
    }

    throw new Error('Item not found');
  }

  cancelItem(itemId: string): { success: boolean } {
    this.requireReady();
    const dest = publishingRepo.getDestinationById(itemId);
    if (dest) {
      publishingRepo.cancelDestination(itemId);
      return { success: true };
    }
    const draft = generalPostsRepo.get(itemId);
    if (draft) {
      generalPostsService.reject(itemId, draft.revision);
      return { success: true };
    }
    throw new Error('Item not found');
  }
}

export const calendarService = new CalendarService();
