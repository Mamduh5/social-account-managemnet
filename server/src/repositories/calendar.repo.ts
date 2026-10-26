import { db } from '../db/database.js';
import {
  type CalendarItem,
  type CampaignStatus,
  type CampaignSummary,
  type PlanOrigin,
  formatBangkokDateTime,
} from '../domain/content-calendar.js';
import { generalPostsRepo } from './general-posts.repo.js';

export class CalendarRepository {
  ready(): boolean {
    const table = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='publishing_campaigns'")
      .get();
    return !!table;
  }

  getCampaigns(accountId?: string): CampaignSummary[] {
    if (!this.ready()) return [];
    let query = `
      SELECT c.*, a.name as account_name, a.handle as account_handle, a.platform
      FROM publishing_campaigns c
      JOIN accounts a ON c.account_id = a.id
    `;
    const params: any[] = [];
    if (accountId) {
      query += ' WHERE c.account_id = ?';
      params.push(accountId);
    }
    query += ' ORDER BY c.created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((row) => {
      // Aggregate counts for items in this campaign
      const draftStats = db
        .prepare(`
          SELECT
            count(*) as total_drafts,
            sum(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_drafts,
            sum(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as raw_drafts
          FROM publishing_drafts
          WHERE campaign_id = ? AND queued_post_id IS NULL AND status != 'rejected'
        `)
        .get(row.id) as any;

      const destStats = db
        .prepare(`
          SELECT
            count(*) as total_dests,
            sum(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
            sum(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
            sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
          FROM publishing_destinations
          WHERE campaign_id = ? AND status != 'cancelled'
        `)
        .get(row.id) as any;

      const totalItems = (draftStats?.total_drafts || 0) + (destStats?.total_dests || 0);

      return {
        id: row.id,
        accountId: row.account_id,
        accountName: row.account_name,
        accountHandle: row.account_handle,
        platform: row.platform,
        name: row.name,
        editorialScope: row.editorial_scope,
        startDate: row.start_date,
        endDate: row.end_date,
        days: row.days,
        maxPublications: row.max_publications,
        status: row.status as CampaignStatus,
        origin: row.origin as PlanOrigin,
        approvedRevision: row.approved_revision,
        approvedHash: row.approved_hash,
        approvedAt: row.approved_at,
        itemsCount: totalItems,
        publishedCount: destStats?.published || 0,
        scheduledCount: destStats?.scheduled || 0,
        draftCount: draftStats?.raw_drafts || 0,
        failedCount: destStats?.failed || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  getCampaignById(id: string): CampaignSummary | null {
    if (!this.ready()) return null;
    const row = db
      .prepare(`
        SELECT c.*, a.name as account_name, a.handle as account_handle, a.platform
        FROM publishing_campaigns c
        JOIN accounts a ON c.account_id = a.id
        WHERE c.id = ?
      `)
      .get(id) as any;
    if (!row) return null;

    const draftStats = db
      .prepare(`
        SELECT
          count(*) as total_drafts,
          sum(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_drafts,
          sum(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as raw_drafts
        FROM publishing_drafts
        WHERE campaign_id = ? AND queued_post_id IS NULL AND status != 'rejected'
      `)
      .get(row.id) as any;

    const destStats = db
      .prepare(`
        SELECT
          count(*) as total_dests,
          sum(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
          sum(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
          sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM publishing_destinations
        WHERE campaign_id = ? AND status != 'cancelled'
      `)
      .get(row.id) as any;

    const totalItems = (draftStats?.total_drafts || 0) + (destStats?.total_dests || 0);

    return {
      id: row.id,
      accountId: row.account_id,
      accountName: row.account_name,
      accountHandle: row.account_handle,
      platform: row.platform,
      name: row.name,
      editorialScope: row.editorial_scope,
      startDate: row.start_date,
      endDate: row.end_date,
      days: row.days,
      maxPublications: row.max_publications,
      status: row.status as CampaignStatus,
      origin: row.origin as PlanOrigin,
      approvedRevision: row.approved_revision,
      approvedHash: row.approved_hash,
      approvedAt: row.approved_at,
      itemsCount: totalItems,
      publishedCount: destStats?.published || 0,
      scheduledCount: destStats?.scheduled || 0,
      draftCount: draftStats?.raw_drafts || 0,
      failedCount: destStats?.failed || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveCampaign(params: {
    id: string;
    accountId: string;
    name: string;
    editorialScope: string;
    startDate: string;
    endDate: string;
    days: number;
    maxPublications: number;
    origin: PlanOrigin;
    status?: CampaignStatus;
  }): void {
    db.prepare(`
      INSERT INTO publishing_campaigns (
        id, account_id, name, editorial_scope, start_date, end_date,
        days, max_publications, origin, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        editorial_scope = excluded.editorial_scope,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        days = excluded.days,
        max_publications = excluded.max_publications,
        origin = excluded.origin,
        status = excluded.status,
        updated_at = datetime('now')
    `).run(
      params.id,
      params.accountId,
      params.name,
      params.editorialScope,
      params.startDate,
      params.endDate,
      params.days,
      params.maxPublications,
      params.origin,
      params.status || 'draft'
    );
  }

  updateCampaignStatus(
    id: string,
    status: CampaignStatus,
    approvedRevision?: number | null,
    approvedHash?: string | null,
    approvedAt?: string | null
  ): void {
    // Undefined preserves approval metadata; explicit null must clear it.
    const row = db.prepare('SELECT approved_revision, approved_hash, approved_at FROM publishing_campaigns WHERE id=?').get(id) as any;
    if (!row) throw new Error('Campaign not found');
    db.prepare(`UPDATE publishing_campaigns SET status=?, approved_revision=?, approved_hash=?, approved_at=?, updated_at=datetime('now') WHERE id=?`).run(
      status,
      approvedRevision === undefined ? row.approved_revision : approvedRevision,
      approvedHash === undefined ? row.approved_hash : approvedHash,
      approvedAt === undefined ? row.approved_at : approvedAt,
      id
    );
  }

  setDraftCampaign(draftId: string, campaignId: string | null, origin: PlanOrigin = 'manual'): void {
    db.prepare(`
      UPDATE publishing_drafts
      SET campaign_id = ?, origin = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(campaignId, origin, draftId);
  }

  setDestinationCampaign(destId: string, campaignId: string | null, origin: PlanOrigin = 'manual'): void {
    db.prepare(`
      UPDATE publishing_destinations
      SET campaign_id = ?, origin = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(campaignId, origin, destId);
  }

  setPostCampaign(postId: string, campaignId: string | null, origin: PlanOrigin = 'manual'): void {
    db.prepare(`
      UPDATE publishing_posts
      SET campaign_id = ?, origin = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(campaignId, origin, postId);
  }

  isCampaignPaused(campaignId: string): boolean {
    if (!this.ready()) return false;
    const row = db
      .prepare("SELECT status FROM publishing_campaigns WHERE id = ?")
      .get(campaignId) as any;
    return row?.status === 'paused';
  }

  getPausedCampaignIds(): Set<string> {
    if (!this.ready()) return new Set();
    const rows = db
      .prepare("SELECT id FROM publishing_campaigns WHERE status = 'paused'")
      .all() as any[];
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Fetches unified calendar items:
   * 1. Publishing drafts (un-queued drafts that have a scheduledAt date or belong to a campaign)
   * 2. Publishing destinations (queued, scheduled, publishing, published, failed)
   */
  getCalendarItems(filter: {
    accountId?: string;
    campaignId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): CalendarItem[] {
    if (!this.ready()) return [];

    const items: CalendarItem[] = [];

    // --- A. Query Drafts ---
    const draftQuery = `
      SELECT d.*, c.name as campaign_name
      FROM publishing_drafts d
      LEFT JOIN publishing_campaigns c ON d.campaign_id = c.id
      WHERE d.queued_post_id IS NULL AND d.status != 'rejected'
    `;
    const draftRows = db.prepare(draftQuery).all() as any[];

    for (const d of draftRows) {
      try {
        const payload = JSON.parse(d.payload_json);
        const destination = payload.destinations?.[0];
        const accountId = destination?.accountId;
        if (!accountId) continue;
        if (filter.accountId && accountId !== filter.accountId) continue;
        if (filter.campaignId && d.campaign_id !== filter.campaignId) continue;

        const scheduledAt = payload.scheduledAt || null;
        if (filter.startDate && scheduledAt && scheduledAt < filter.startDate) continue;
        if (filter.endDate && scheduledAt && scheduledAt > filter.endDate) continue;

        const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as any;
        if (!account) continue;

        // Resolve media attachments
        const media: any[] = [];
        if (destination.attachments && Array.isArray(destination.attachments)) {
          for (const att of destination.attachments) {
            const img = db.prepare('SELECT * FROM media_images WHERE id = ?').get(att.mediaId) as any;
            if (img) {
              media.push({
                id: img.id,
                mediaId: img.id,
                previewUrl: `/api/publishing/images/${img.id}/content`,
                altText: att.altText || '',
                mimeType: img.mime_type,
              });
            }
          }
        }

        let videoTitle: string | null = null;
        let thumbnailUrl: string | null = null;
        if (payload.videoId) {
          const vid = db.prepare('SELECT * FROM videos WHERE id = ?').get(payload.videoId) as any;
          if (vid) {
            videoTitle = vid.title;
            thumbnailUrl = vid.thumbnail_path ? `/uploads/${vid.thumbnail_path.split(/[/\\]/).pop()}` : null;
          }
        }

        const origin = (d.origin || payload.origin || 'manual') as PlanOrigin;
        const status = (d.status === 'draft' ? 'draft' : d.status === 'approved' ? 'approved' : 'draft') as any;

        items.push({
          id: d.id,
          sourceType: 'draft',
          draftId: d.id,
          postId: null,
          destinationId: null,
          accountId,
          accountName: account.name,
          accountHandle: account.handle,
          platform: account.platform,
          avatarUrl: account.avatar_url || null,
          contentType: payload.contentType,
          title: payload.title || 'Untitled Draft',
          caption: destination.caption || '',
          hashtags: destination.hashtags || '',
          linkUrl: destination.linkUrl || null,
          media,
          videoId: payload.videoId || null,
          videoTitle,
          thumbnailUrl,
          scheduledAt,
          scheduledAtBangkok: formatBangkokDateTime(scheduledAt),
          origin,
          status,
          revision: d.revision,
          approvedRevision: d.approved_revision,
          campaignId: d.campaign_id || null,
          campaignName: d.campaign_name || null,
          errorMessage: null,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        });
      } catch {}
    }

    // --- B. Query Queued / Published Destinations ---
    let destQuery = `
      SELECT
        pd.*,
        p.title as post_title, p.scheduled_at, p.content_type as post_content_type, p.video_id,
        v.title as video_title, v.thumbnail_path,
        a.name as account_name, a.handle as account_handle, a.platform, a.avatar_url,
        c.name as campaign_name, c.status as campaign_status
      FROM publishing_destinations pd
      JOIN publishing_posts p ON pd.post_id = p.id
      JOIN accounts a ON pd.account_id = a.id
      LEFT JOIN videos v ON p.video_id = v.id
      LEFT JOIN publishing_campaigns c ON pd.campaign_id = c.id
      WHERE 1=1
    `;
    const destParams: any[] = [];
    if (filter.accountId) {
      destQuery += ' AND pd.account_id = ?';
      destParams.push(filter.accountId);
    }
    if (filter.campaignId) {
      destQuery += ' AND pd.campaign_id = ?';
      destParams.push(filter.campaignId);
    }

    const destRows = db.prepare(destQuery).all(...destParams) as any[];

    for (const d of destRows) {
      const scheduledAt = d.scheduled_at || null;
      if (filter.startDate && scheduledAt && scheduledAt < filter.startDate) continue;
      if (filter.endDate && scheduledAt && scheduledAt > filter.endDate) continue;

      // Attachments
      const media: any[] = [];
      try {
        const attRows = generalPostsRepo.attachments(d.id);
        for (const att of attRows) {
          media.push({
            id: att.media_id,
            mediaId: att.media_id,
            previewUrl: `/api/publishing/images/${att.media_id}/content`,
            altText: att.alt_text || '',
            mimeType: att.mime_type,
          });
        }
      } catch {}

      const thumbnailUrl = d.thumbnail_path
        ? `/uploads/${d.thumbnail_path.split(/[/\\]/).pop()}`
        : null;

      // Status resolution (if campaign is paused and post is scheduled, show paused)
      let resolvedStatus = d.status;
      if (d.status === 'scheduled' && d.campaign_status === 'paused') {
        resolvedStatus = 'paused';
      }

      items.push({
        id: d.id,
        sourceType: 'destination',
        draftId: d.approval_draft_id || null,
        postId: d.post_id,
        destinationId: d.id,
        accountId: d.account_id,
        accountName: d.account_name,
        accountHandle: d.account_handle,
        platform: d.platform,
        avatarUrl: d.avatar_url || null,
        contentType: d.content_type || d.post_content_type || 'reel',
        title: d.post_title || 'Untitled Post',
        caption: d.caption || '',
        hashtags: d.hashtags || '',
        linkUrl: d.link_url || null,
        media,
        videoId: d.video_id || null,
        videoTitle: d.video_title || null,
        thumbnailUrl,
        scheduledAt,
        scheduledAtBangkok: formatBangkokDateTime(scheduledAt),
        origin: (d.origin || 'manual') as PlanOrigin,
        status: resolvedStatus,
        revision: d.approval_revision || 1,
        approvedRevision: d.approval_revision || null,
        campaignId: d.campaign_id || null,
        campaignName: d.campaign_name || null,
        receipt: {
          remotePostId: d.remote_post_id || null,
          remotePostUrl: d.remote_post_url || null,
          publishedAt: d.published_at || null,
          confirmationSource: d.confirmation_source || null,
          verificationStatus: d.verification_status || null,
        },
        errorMessage: d.error_message || null,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      });
    }

    // Sort items by scheduledAt ASC, fallback to createdAt ASC
    items.sort((a, b) => {
      const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    return items;
  }
}

export const calendarRepo = new CalendarRepository();
