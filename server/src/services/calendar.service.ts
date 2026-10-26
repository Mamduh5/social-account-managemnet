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
import { brandingOverrideInput } from '../domain/general-posts.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown) => JSON.stringify(value, (_key,entry)=>entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b))) : entry);

function effectivePageBranding(account: any) {
  const stored = JSON.parse(account.brand_kit_json || '{}');
  return brandingOverrideInput.parse({watermarkType:'moving_text',text:account.handle,movementPreset:'smooth_sine',fontSize:26,opacity:0.85,...stored,signatureText:stored.signatureText === undefined ? account.name : stored.signatureText});
}

function requireCompatibleVariant(videoId: string | undefined, variantId: string | null | undefined, brandKit: unknown) {
  if (!variantId || variantId === 'original') return;
  const variant = publishingRepo.getBrandedVideoById(variantId);
  if (!variant || variant.video_id !== videoId) throw new Error('Branded variant does not belong to the selected master video');
  if (canonical(JSON.parse(variant.brand_kit_json)) !== canonical(brandKit)) {
    throw new Error('Selected variant branding is not compatible with the saved Page brand kit; render this Page branding instead');
  }
}

function requireCampaignSchedule(scheduledAt: string | null | undefined, campaign: { startDate: string; days: number }) {
  const start = Date.parse(`${campaign.startDate}T00:00:00+07:00`);
  const scheduled = scheduledAt ? Date.parse(scheduledAt) : NaN;
  if (!Number.isFinite(scheduled) || scheduled < start || scheduled >= start + campaign.days * 86400000) {
    throw new Error(`Every campaign post must have a schedule within its ${campaign.days}-day Asia/Bangkok window`);
  }
}

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
    if (normalizedItems.length > parsed.maxPublications) {
      throw new Error('Campaign post count exceeds maximum authorized publications');
    }
    for (const item of normalizedItems) {
      requireCampaignSchedule(item.scheduledAtUtc, parsed);
      if (item.contentType === 'reel') requireCompatibleVariant(item.videoId,item.selectedVariantId,effectivePageBranding(account));
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
              selectedVariantId: item.selectedVariantId,
              applyBranding: item.applyBranding,
              brandingOverride: item.contentType === 'reel' ? effectivePageBranding(account) : undefined,
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

  getCampaignReview(campaignId: string) {
    const campaign = this.getCampaignById(campaignId);
    const row = accountsRepo.getAccountById(campaign.accountId);
    if (!row || row.archived_at) throw new Error('Destination account not found or is archived');
    const account = {id:row.id,name:row.name,handle:row.handle,graphId:row.external_id,connectionRevision:row.connection_revision,identityVerifiedAt:row.identity_verified_at,brandKit:JSON.parse(row.brand_kit_json || '{}')};
    const items = calendarRepo.getCalendarItems({campaignId}).filter(item=>item.status!=='cancelled').map(item=>{
      const draft = item.sourceType === 'draft' ? generalPostsRepo.get(item.draftId!) : null;
      const destination = item.sourceType === 'destination' ? publishingRepo.getDestinationById(item.id) : null;
      return {...item,approvalDetails:draft ? JSON.parse(draft.payload_json) : {caption:item.caption,hashtags:item.hashtags,media:item.media,videoId:item.videoId,selectedVariantId:destination?.selected_variant_id,applyBranding:!!destination?.apply_branding,brandingOverride:destination?.branding_override_json ? JSON.parse(destination.branding_override_json) : null}};
    });
    const contentHash=calculateCampaignApprovalHash({campaignId,accountId:campaign.accountId,items:items.map(item=>({id:item.id,revision:item.revision,payloadHash:hash(JSON.stringify(item.approvalDetails)),scheduledAt:item.scheduledAt || ''}))});
    const expectedApprovalHash=hash(JSON.stringify({campaign:{id:campaign.id,accountId:campaign.accountId,name:campaign.name,editorialScope:campaign.editorialScope,startDate:campaign.startDate,days:campaign.days,maxPublications:campaign.maxPublications,status:campaign.status},account,contentHash}));
    return {campaign,account,items,expectedApprovalHash};
  }

  /**
   * One-time campaign approval:
   * 1. Validates all drafts in the campaign.
   * 2. Binds exact destination account, content revisions, attached media, and scheduled publication times.
   * 3. Computes cryptographic SHA-256 fingerprint (approved_hash).
   * 4. Approves drafts and queues them into publishing queue with status: 'scheduled'.
   * 5. Sets campaign status to 'active'.
   */
  approveCampaign(campaignId: string, review: {accountId:string;expectedHash:string}): {
    campaign: CampaignSummary;
    queuedCount: number;
    approvedHash: string;
  } {
    this.requireReady();
    const campaign = this.getCampaignById(campaignId);
    if (!['draft', 'awaiting_approval'].includes(campaign.status)) {
      throw new Error(`Campaign cannot be approved from status: ${campaign.status}`);
    }
    const currentReview=this.getCampaignReview(campaignId);
    if (!review || review.accountId!==campaign.accountId || !review.expectedHash || review.expectedHash!==currentReview.expectedApprovalHash) {
      throw new Error('Campaign or Page changed since review; reload and approve the exact current snapshot');
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
    for (const item of draftItems) {
      const rawDraft = generalPostsRepo.get(item.draftId!);
      if (!rawDraft) throw new Error(`Draft ${item.draftId} not found`);
      const payload = JSON.parse(rawDraft.payload_json);
      if (payload.destinations?.length !== 1 || payload.destinations[0].accountId !== campaign.accountId) {
        throw new Error('Campaign approval requires exactly one destination matching its Page');
      }
      requireCampaignSchedule(payload.scheduledAt, campaign);
      if (payload.contentType === 'reel') {
        requireCompatibleVariant(payload.videoId,payload.destinations[0].selectedVariantId,payload.destinations[0].brandingOverride);
      }
    }
    const approvedHash = currentReview.expectedApprovalHash;

    let queuedCount = 0;
    db.transaction(() => {
      // 1. Batch approve drafts
      generalPostsService.approveBatch(
        draftItems.map((d) => ({ id: d.draftId!, revision: d.revision })),
        { campaignId }
      );

      // 2. Queue all approved drafts into publishing destinations with campaign_id
      for (const item of draftItems) {
        const queued = generalPostsService.queue(item.draftId!, item.revision, { campaignId });
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
      if (publishingRepo.getPostDestinationRows(dest.post_id).length !== 1) throw new Error('Use the publishing workflow for a post with multiple destinations');
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
      if (draft.campaign_id) throw new Error('Use campaign batch approval before queuing a campaign draft');
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
        if (draft.campaign_id) requireCampaignSchedule(payload.scheduledAt, this.getCampaignById(draft.campaign_id));
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
      if (dest.status !== 'scheduled' || dest.remote_post_id || (dest as any).remote_post_url || (dest as any).submission_state || dest.error_message) {
        throw new Error('Only an unsubmitted scheduled item without a review hold can be cancelled here');
      }
      if (!publishingService.cancelDestination(itemId)) throw new Error('Item changed before cancellation; reload its current status');
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
