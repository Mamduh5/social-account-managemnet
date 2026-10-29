import { db } from '../db/database.js';
import {
  type CalendarItem,
  type CampaignStatus,
  type CampaignSummary,
  type PlanOrigin,
  formatBangkokDateTime,
} from '../domain/content-calendar.js';

export class CalendarRepository {
  ready(): boolean {
    const table = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='publishing_campaigns'")
      .get();
    return !!table;
  }

  private campaignSummaries(field?:'id'|'account_id',value?:string): CampaignSummary[] {
    const rows=db.prepare(`
      WITH Selected AS (
        SELECT c.*,a.name account_name,a.handle account_handle,a.platform
        FROM publishing_campaigns c JOIN accounts a ON a.id=c.account_id ${field?'WHERE c.'+field+'=?':''}
      ), DraftCounts AS (
        SELECT d.campaign_id,COUNT(*) total_drafts,SUM(CASE WHEN d.status='draft' THEN 1 ELSE 0 END) raw_drafts
        FROM publishing_drafts d JOIN Selected c ON c.id=d.campaign_id
        WHERE d.queued_post_id IS NULL AND d.status<>'rejected' GROUP BY d.campaign_id
      ), DestinationCounts AS (
        SELECT d.campaign_id,COUNT(*) total_dests,SUM(d.status='published') published,SUM(d.status='scheduled') scheduled,SUM(d.status='failed') failed
        FROM publishing_destinations d JOIN Selected c ON c.id=d.campaign_id WHERE d.status<>'cancelled' GROUP BY d.campaign_id
      )
      SELECT c.*,drafts.total_drafts,drafts.raw_drafts,dests.total_dests,dests.published,dests.scheduled,dests.failed
      FROM Selected c LEFT JOIN DraftCounts drafts ON drafts.campaign_id=c.id LEFT JOIN DestinationCounts dests ON dests.campaign_id=c.id
      ORDER BY c.created_at DESC,c.id DESC
    `).all(...(field?[value]:[])) as any[];
    return rows.map(row=>({id:row.id,accountId:row.account_id,accountName:row.account_name,accountHandle:row.account_handle,platform:row.platform,
      name:row.name,editorialScope:row.editorial_scope,startDate:row.start_date,endDate:row.end_date,days:row.days,maxPublications:row.max_publications,
      status:row.status as CampaignStatus,origin:row.origin as PlanOrigin,approvedRevision:row.approved_revision,approvedHash:row.approved_hash,approvedAt:row.approved_at,
      itemsCount:(row.total_drafts||0)+(row.total_dests||0),publishedCount:row.published||0,scheduledCount:row.scheduled||0,draftCount:row.raw_drafts||0,failedCount:row.failed||0,
      createdAt:row.created_at,updatedAt:row.updated_at}));
  }

  getCampaigns(accountId?: string): CampaignSummary[] { return this.ready()?this.campaignSummaries(accountId?'account_id':undefined,accountId):[]; }

  getCampaignById(id: string): CampaignSummary | null { return this.ready()?this.campaignSummaries('id',id)[0]||null:null; }

  private byIds(table:'accounts'|'videos'|'media_images',ids:Iterable<string>) {
    const unique=[...new Set(ids)].filter(Boolean),rows=new Map<string,any>();
    for(let offset=0;offset<unique.length;offset+=500) {
      const batch=unique.slice(offset,offset+500);
      for(const row of db.prepare(`SELECT * FROM ${table} WHERE id IN (${batch.map(()=>'?').join(',')})`).all(...batch) as any[])rows.set(row.id,row);
    }
    return rows;
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
    let draftQuery = `
      SELECT d.*, c.name as campaign_name
      FROM publishing_drafts d
      LEFT JOIN publishing_campaigns c ON d.campaign_id = c.id
      WHERE d.queued_post_id IS NULL AND d.status != 'rejected'
    `;
    const draftParams:string[]=[];
    if(filter.campaignId){draftQuery+=' AND d.campaign_id=?';draftParams.push(filter.campaignId);}
    const draftRows = db.prepare(draftQuery).all(...draftParams) as any[];
    const payloads=new Map<string,any>();
    for(const draft of draftRows) {
      try {
        const payload=JSON.parse(draft.payload_json),accountId=payload.destinations?.[0]?.accountId,scheduledAt=payload.scheduledAt;
        if(!accountId || filter.accountId&&filter.accountId!==accountId || filter.startDate&&scheduledAt&&scheduledAt<filter.startDate || filter.endDate&&scheduledAt&&scheduledAt>filter.endDate)continue;
        payloads.set(draft.id,payload);
      } catch { /* Preserve legacy behavior: malformed drafts cannot be displayed. */ }
    }
    const accounts=this.byIds('accounts',[...payloads.values()].map(payload=>payload.destinations[0].accountId));
    const videos=this.byIds('videos',[...payloads.values()].map(payload=>payload.videoId));
    const images=this.byIds('media_images',[...payloads.values()].flatMap(payload=>Array.isArray(payload.destinations[0].attachments)?payload.destinations[0].attachments.map((attachment:any)=>attachment.mediaId):[]));

    for (const d of draftRows) {
      try {
        const payload = payloads.get(d.id);
        if(!payload)continue;
        const destination = payload.destinations?.[0];
        const accountId = destination?.accountId;
        if (!accountId) continue;
        if (filter.accountId && accountId !== filter.accountId) continue;
        if (filter.campaignId && d.campaign_id !== filter.campaignId) continue;

        const scheduledAt = payload.scheduledAt || null;
        if (filter.startDate && scheduledAt && scheduledAt < filter.startDate) continue;
        if (filter.endDate && scheduledAt && scheduledAt > filter.endDate) continue;

        const account = accounts.get(accountId);
        if (!account) continue;

        // Resolve media attachments
        const media: any[] = [];
        if (destination.attachments && Array.isArray(destination.attachments)) {
          for (const att of destination.attachments) {
            const img = images.get(att.mediaId);
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
          const vid = videos.get(payload.videoId);
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

    if(filter.startDate){destQuery+=' AND (p.scheduled_at IS NULL OR p.scheduled_at>=?)';destParams.push(filter.startDate);}
    if(filter.endDate){destQuery+=' AND (p.scheduled_at IS NULL OR p.scheduled_at<=?)';destParams.push(filter.endDate);}
    const destRows = db.prepare(destQuery).all(...destParams) as any[];
    const attachments=new Map<string,any[]>();
    for(let offset=0;offset<destRows.length;offset+=500) {
      const batch=destRows.slice(offset,offset+500);
      const rows=db.prepare(`SELECT a.*,m.mime_type FROM publishing_attachments a JOIN media_images m ON m.id=a.media_id
        WHERE a.destination_id IN (${batch.map(()=>'?').join(',')}) ORDER BY a.destination_id,a.position`).all(...batch.map(row=>row.id)) as any[];
      for(const row of rows){if(!attachments.has(row.destination_id))attachments.set(row.destination_id,[]);attachments.get(row.destination_id)!.push(row);}
    }

    for (const d of destRows) {
      const scheduledAt = d.scheduled_at || null;
      if (filter.startDate && scheduledAt && scheduledAt < filter.startDate) continue;
      if (filter.endDate && scheduledAt && scheduledAt > filter.endDate) continue;

      // Attachments
      const media: any[] = [];
      try {
        const attRows = attachments.get(d.id)||[];
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
      // Current editable drafts precede retained destination receipts at the same scheduled instant.
      return timeA - timeB || Number(b.sourceType === 'draft') - Number(a.sourceType === 'draft') || a.id.localeCompare(b.id);
    });

    return items;
  }
}

export const calendarRepo = new CalendarRepository();
