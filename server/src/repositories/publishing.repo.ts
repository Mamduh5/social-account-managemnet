import {generalPostsReady} from '../db/general-posts-schema.js';
import { db } from '../db/database.js';
import { activityRepo } from './activity.repo.js';
import {
  VideoEntity,
  BrandedVideoEntity,
  PublishingPostEntity,
  PublishingDestinationEntity,
  DestinationStatus,
  PostStatus,
} from '../domain/types.js';

export interface PendingQueueJob {
  id: string; post_id: string; account_id: string; video_id: string | null;
  caption: string; hashtags: string; apply_branding: number; branding_override_json: string | null;
  branded_video_path: string | null; selected_variant_id: string | null; status: string;
  retry_count: number; max_retries: number; remote_post_id: string | null; submission_state: string | null;
  content_type: string; link_url: string | null; campaign_id: string | null; origin: string;
  title: string; scheduled_at: string | null; original_video_path: string | null; original_video_metadata_json: string | null;
  platform: string; account_name: string; account_handle: string; connector_mode: string;
  access_token: string | null; external_id: string | null; brand_kit_json: string | null; account_status: string;
}

export class PublishingRepository {
  // --- VIDEOS ---

  getAllVideos(categoryId?: string): (VideoEntity & { category_name?: string; category_color?: string; branded_variants?: BrandedVideoEntity[] })[] {
    let query = `
      SELECT v.*, c.name as category_name, c.color as category_color
      FROM videos v
      LEFT JOIN categories c ON v.category_id = c.id
    `;
    const params: any[] = [];
    if (categoryId) {
      query += ' WHERE v.category_id = ?';
      params.push(categoryId);
    }
    query += ' ORDER BY v.created_at DESC';

    const videos = db.prepare(query).all(...params) as any[];

    // Attach branded variants to each video
    const getBranded = db.prepare('SELECT * FROM branded_videos WHERE video_id = ? ORDER BY created_at DESC');
    for (const v of videos) {
      v.branded_variants = getBranded.all(v.id) as BrandedVideoEntity[];
    }

    return videos;
  }

  getVideoById(id: string): (VideoEntity & { branded_variants?: BrandedVideoEntity[] }) | undefined {
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as any;
    if (video) {
      video.branded_variants = db.prepare('SELECT * FROM branded_videos WHERE video_id = ? ORDER BY created_at DESC').all(id) as BrandedVideoEntity[];
    }
    return video;
  }

  getVideoByPipelineJobId(pipelineJobId: string): VideoEntity | undefined {
    return db.prepare('SELECT * FROM videos WHERE pipeline_job_id = ?').get(pipelineJobId) as any;
  }

  insertVideo(data: {
    id: string;
    title: string;
    sourceType: 'manual_upload' | 'pipeline_import' | 'webhook';
    originalFilename: string;
    filePath: string;
    fileSize: number;
    duration: number;
    width: number;
    height: number;
    aspectRatio: string;
    thumbnailPath?: string | null;
    pipelineJobId?: string | null;
    categoryId?: string | null;
    metadataJson?: string | null;
  }): void {
    db.prepare(`
      INSERT INTO videos (
        id, title, source_type, original_filename, file_path,
        file_size, duration, width, height, aspect_ratio,
        thumbnail_path, pipeline_job_id, category_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.title,
      data.sourceType,
      data.originalFilename,
      data.filePath,
      data.fileSize,
      data.duration,
      data.width,
      data.height,
      data.aspectRatio,
      data.thumbnailPath || null,
      data.pipelineJobId || null,
      data.categoryId || null,
      data.metadataJson || '{}'
    );
  }

  // --- BRANDED VIDEOS (VARIANTS) ---

  insertBrandedVideo(data: {
    id: string;
    videoId: string;
    presetName: string;
    movementPreset: string;
    watermarkText: string;
    filePath: string;
    fileSize: number;
    duration: number;
    width: number;
    height: number;
    aspectRatio: string;
    thumbnailPath?: string | null;
    brandKitJson: string;
    sha256?: string | null;
  }): void {
    db.prepare(`
      INSERT OR REPLACE INTO branded_videos (
        id, video_id, preset_name, movement_preset, watermark_text,
        file_path, file_size, duration, width, height,
        aspect_ratio, thumbnail_path, brand_kit_json, sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.videoId,
      data.presetName,
      data.movementPreset,
      data.watermarkText,
      data.filePath,
      data.fileSize,
      data.duration,
      data.width,
      data.height,
      data.aspectRatio,
      data.thumbnailPath || null,
      data.brandKitJson,
      data.sha256 || null
    );
  }

  getBrandedVideosByVideoId(videoId: string): BrandedVideoEntity[] {
    return db.prepare('SELECT * FROM branded_videos WHERE video_id = ? ORDER BY created_at DESC').all(videoId) as any[];
  }

  getBrandedVideoById(id: string): BrandedVideoEntity | undefined {
    return db.prepare('SELECT * FROM branded_videos WHERE id = ?').get(id) as any;
  }

  deleteBrandedVideo(id: string): boolean {
    const res = db.prepare('DELETE FROM branded_videos WHERE id = ?').run(id);
    return res.changes > 0;
  }

  // --- POSTS & DESTINATIONS ---

  createPostWithDestinations(params: {
    postId: string;
    videoId: string | null;
    title: string;
    scheduledAt?: string | null;
    postStatus: PostStatus;
    selectedVariantId?: string | null;
    destinations: Array<{
      id: string;
      accountId: string;
      caption: string;
      hashtags: string;
      applyBranding: number;
      brandingOverrideJson?: string | null;
      brandedVideoPath?: string | null;
      selectedVariantId?: string | null;
      status: DestinationStatus;
    }>;
  }): void {
    const insertPost = db.prepare(`
      INSERT INTO publishing_posts (id, video_id, title, scheduled_at, status, selected_variant_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertDest = db.prepare(`
      INSERT INTO publishing_destinations (
        id, post_id, account_id, caption, hashtags, apply_branding,
        branding_override_json, branded_video_path, selected_variant_id, status, progress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const tx = db.transaction(() => {
      insertPost.run(
        params.postId,
        params.videoId,
        params.title,
        params.scheduledAt || null,
        params.postStatus,
        params.selectedVariantId || null
      );

      for (const dest of params.destinations) {
        insertDest.run(
          dest.id,
          params.postId,
          dest.accountId,
          dest.caption,
          dest.hashtags,
          dest.applyBranding,
          dest.brandingOverrideJson || null,
          dest.brandedVideoPath || null,
          dest.selectedVariantId || null,
          dest.status
        );
      }
    });

    tx();
  }

  getAllPosts(): any[] {
    const posts = db.prepare(`
      SELECT p.*, v.title as video_title, v.aspect_ratio, v.duration, v.thumbnail_path
      FROM publishing_posts p
      LEFT JOIN videos v ON p.video_id = v.id
      ORDER BY p.created_at DESC
    `).all() as any[];

    const getDests = db.prepare(`
      SELECT pd.*, a.name as account_name, a.handle as account_handle, a.platform, a.avatar_url, a.is_demo,
             c.name as category_name, c.color as category_color
      FROM publishing_destinations pd
      JOIN accounts a ON pd.account_id = a.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE pd.post_id = ?
    `);

    return posts.map((post) => ({
      ...post,
      destinations: getDests.all(post.id),
    }));
  }

  getLiveQueue(): any[] {
    return db.prepare(`
      SELECT pd.*, p.title as post_title, p.scheduled_at,
             v.thumbnail_path, v.aspect_ratio,
             a.name as account_name, a.handle as account_handle, a.platform, a.avatar_url, a.is_demo,
             c.name as category_name, c.color as category_color
      FROM publishing_destinations pd
      JOIN publishing_posts p ON pd.post_id = p.id
      LEFT JOIN videos v ON p.video_id = v.id
      JOIN accounts a ON pd.account_id = a.id
      LEFT JOIN categories c ON a.category_id = c.id
      ORDER BY
        CASE pd.status
          WHEN 'uploading' THEN 1
          WHEN 'branding' THEN 2
          WHEN 'preparing' THEN 3
          WHEN 'awaiting_confirmation' THEN 4
          WHEN 'scheduled' THEN 5
          WHEN 'failed' THEN 6
          ELSE 7
        END ASC,
        pd.updated_at DESC
    `).all();
  }

  getHandoffDestination(id: string): any {
    return db.prepare(`SELECT pd.*, v.file_path as original_video_path FROM publishing_destinations pd JOIN publishing_posts p ON pd.post_id=p.id JOIN videos v ON p.video_id=v.id WHERE pd.id=?`).get(id);
  }

  getDestinationById(id: string): PublishingDestinationEntity | undefined {
    return db.prepare('SELECT * FROM publishing_destinations WHERE id = ?').get(id) as any;
  }

  getPostDestinationRows(postId: string): any[] { return db.prepare('SELECT * FROM publishing_destinations WHERE post_id=?').all(postId) as any[]; }

  getDestinationsByPostId(postId: string): { status: DestinationStatus }[] {
    return db.prepare('SELECT status FROM publishing_destinations WHERE post_id = ?').all(postId) as any[];
  }

  updateDestinationStatus(destinationId: string, status: DestinationStatus, progress: number): void {
    db.prepare(`
      UPDATE publishing_destinations
      SET status = ?, progress = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, progress, destinationId);
  }

  updateDestinationBrandedPath(destinationId: string, path: string): void {
    db.prepare('UPDATE publishing_destinations SET branded_video_path = ? WHERE id = ?').run(path, destinationId);
  }

  pinDestinationRender(destinationId: string, accountId: string, postId: string, videoId: string, path: string, masterHash: string, renderHash: string, brandingOverride: string | null): void {
    db.transaction(() => {
      this.updateDestinationBrandedPath(destinationId, path);
      activityRepo.logEvent({ type: 'media_render_pinned', accountId, title: 'Publication render pinned', message: 'The destination render was pinned for safe retry.', severity: 'info', metadataJson: JSON.stringify({ destinationId, accountId, postId, videoId, path, masterHash, renderHash, brandingOverride }) });
    })();
  }

  getDestinationRenderPin(destinationId: string): any | undefined {
    const rows = db.prepare("SELECT metadata_json FROM activity_events WHERE type = 'media_render_pinned' ORDER BY rowid DESC").all() as Array<{metadata_json: string}>;
    for (const row of rows) {
      try { const pin = JSON.parse(row.metadata_json); if (pin.destinationId === destinationId) return pin; } catch { /* untrusted historical metadata */ }
    }
    return undefined;
  }

  markDestinationPublished(params: {
    destinationId: string;
    remotePostId?: string | null;
    remotePostUrl?: string | null;
    verificationStatus?: string | null;
    confirmationSource?: string | null;
  }): void {
    db.prepare(`
      UPDATE publishing_destinations
      SET status = 'published', progress = 100, remote_post_id = ?,
          remote_post_url = ?, published_at = datetime('now'),
          verification_status = ?, confirmation_source = ?, error_message = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      params.remotePostId || null,
      params.remotePostUrl || null,
      params.verificationStatus || 'confirmed',
      params.confirmationSource || null,
      params.destinationId
    );
  }

  recordRemoteUpload(id: string, remoteId: string) {
    db.prepare("UPDATE publishing_destinations SET remote_post_id=?,verification_status='unverified',updated_at=datetime('now') WHERE id=? AND status='uploading'").run(remoteId, id);
  }

  markAwaitingConfirmation(id: string, remoteId?: string, remoteUrl?: string) {
    db.prepare("UPDATE publishing_destinations SET status='awaiting_confirmation', progress=90, remote_post_id=?, remote_post_url=?, verification_status='unverified', updated_at=datetime('now') WHERE id=?").run(remoteId || null, remoteUrl || null, id);
  }

  markDestinationFailed(destinationId: string, errorMessage: string): void {
    db.prepare(`
      UPDATE publishing_destinations
      SET status = 'failed', error_message = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(errorMessage, destinationId);
  }

  retryDestination(destinationId: string, retryCount: number, message?: string): void {
    db.prepare(`
      UPDATE publishing_destinations
      SET status = 'preparing', progress = 0, retry_count = ?, error_message = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(retryCount, message || null, destinationId);
  }

  cancelDestination(destinationId: string): number {
    const result = db.prepare(`
      UPDATE publishing_destinations
      SET status = 'cancelled', progress = 0, updated_at = datetime('now')
      WHERE id = ? AND status IN ('scheduled', 'preparing', 'branding')
    `).run(destinationId);
    return result.changes;
  }

  updateParentPostStatus(postId: string, status: PostStatus): void {
    db.prepare("UPDATE publishing_posts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      status,
      postId
    );
  }

  // --- QUEUE WORKER QUERIES ---

  getStartupSafetyJobs():any[]{return db.prepare(`SELECT pd.id,pd.status,p.scheduled_at,pd.remote_post_id,${generalPostsReady(db)?'pd.submission_state':'NULL as submission_state'} FROM publishing_destinations pd JOIN publishing_posts p ON p.id=pd.post_id WHERE pd.status IN ('preparing','branding','uploading','scheduled')`).all();}

  getStuckJobs(): { id: string; status: string }[] {
    return db.prepare(`
      SELECT id, status FROM publishing_destinations
      WHERE status IN ('preparing', 'branding', 'uploading')
    `).all() as any[];
  }

  resetStuckJob(id: string, reason: string): void {
    db.prepare(`
      UPDATE publishing_destinations
      SET status = 'preparing', progress = 0, error_message = ?
      WHERE id = ?
    `).run(reason, id);
  }

  private hasCampaigns(): boolean {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='publishing_campaigns'").get();
  }

  getDueScheduledDestinations(): { id: string; post_id: string }[] {
    const hasCamp = this.hasCampaigns();
    const campaignFilter = hasCamp ? 'LEFT JOIN publishing_campaigns c ON pd.campaign_id = c.id' : '';
    const campaignClause = hasCamp ? "AND (pd.campaign_id IS NULL OR c.status = 'active')" : '';
    return db.prepare(`
      SELECT pd.id, pd.post_id
      FROM publishing_destinations pd
      JOIN publishing_posts p ON pd.post_id = p.id
      ${campaignFilter}
      WHERE pd.status = 'scheduled'
      AND julianday(p.scheduled_at) <= julianday('now')
      ${campaignClause}
    `).all() as any[];
  }

  getPendingQueueJobs(limit: number = 2): PendingQueueJob[] {
    const hasCamp = this.hasCampaigns();
    const campaignFilter = hasCamp ? 'LEFT JOIN publishing_campaigns c ON pd.campaign_id = c.id' : '';
    const campaignClause = hasCamp ? "AND (pd.campaign_id IS NULL OR c.status = 'active')" : '';
    return db.prepare(`
      SELECT
        pd.id, pd.post_id, pd.account_id, pd.caption, pd.hashtags,
        pd.apply_branding, pd.branding_override_json, pd.branded_video_path,
        pd.selected_variant_id, pd.status,
        pd.retry_count, pd.max_retries, pd.remote_post_id,
        ${generalPostsReady(db)?"pd.submission_state, pd.content_type, pd.link_url":"NULL as submission_state, 'reel' as content_type, NULL as link_url"},
        ${hasCamp ? "pd.campaign_id, pd.origin" : "NULL as campaign_id, 'manual' as origin"},
        p.title, p.scheduled_at, p.video_id,
        v.file_path as original_video_path, v.metadata_json as original_video_metadata_json,
        a.platform, a.name as account_name, a.handle as account_handle,
        a.connector_mode, a.access_token, a.external_id, a.brand_kit_json, a.status as account_status
      FROM publishing_destinations pd
      JOIN publishing_posts p ON pd.post_id = p.id
      LEFT JOIN videos v ON p.video_id = v.id
      JOIN accounts a ON pd.account_id = a.id
      ${campaignFilter}
      WHERE pd.status IN ('preparing', 'branding')
      AND (pd.error_message IS NULL OR pd.error_message NOT LIKE 'Interrupted by server restart%')
      AND (p.scheduled_at IS NULL OR julianday(p.scheduled_at) <= julianday('now'))
      ${campaignClause}
      LIMIT ?
    `).all(limit) as PendingQueueJob[];
  }
}

export const publishingRepo = new PublishingRepository();
