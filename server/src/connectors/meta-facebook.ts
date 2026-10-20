import fs from 'fs';
import { AccountConnector, ConnectorCapabilities, ConnectionHealth, PublishDestinationPayload, PublishResult, CommentFetchResult } from './types.js';

export class MetaFacebookConnector implements AccountConnector {
  constructor(private readonly polling = { attempts: 90, intervalMs: 2000 }) {}
  private get apiVersion(): string {
    return process.env.META_GRAPH_VERSION || 'v25.0';
  }
  private baseUrl = 'https://graph.facebook.com';

  getCapabilities(): ConnectorCapabilities {
    return {
      canPublish: true,
      canSchedule: true,
      canReadPostMetrics: true,
      canReadComments: true,
      canReply: true,
      canReact: true,
      canReadInsights: true,
      canReceiveEvents: false,
      requiresManualConfirmation: false,
      supportedVideoFormats: ['mp4', 'mov'],
      maxVideoSizeMb: 1024,
      maxDurationSeconds: 14400,
    };
  }

  async verifyHealth(account: any): Promise<ConnectionHealth> {
    if (!account.access_token) {
      return {
        status: 'disconnected',
        healthStatus: 'Missing Meta Page Access Token',
        lastCheckedAt: new Date().toISOString(),
        warnings: ['Configure Page Access Token in Account Settings to use Official Graph API.'],
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/${this.apiVersion}/me?fields=id,name`, { headers: { Authorization: `Bearer ${account.access_token}` }, signal: AbortSignal.timeout(20000) });
      const data = await res.json() as any;

      if (data.error) {
        return {
          status: 'expired',
          healthStatus: 'Meta authorization expired or required permissions are unavailable',
          lastCheckedAt: new Date().toISOString(),
          warnings: ['Reconnect through official Meta authorization'],
        };
      }

      if (!data.id || data.id !== account.external_id) throw new Error('Authorized Meta Page identity mismatch');
      return {
        status: 'connected',
        healthStatus: `Connected as Page: ${data.name || account.name}`,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        status: 'failed',
        healthStatus: 'Meta connection check failed; review identity, permissions and connectivity',
        lastCheckedAt: new Date().toISOString(),
        warnings: ['Reconnect through official Meta authorization'],
      };
    }
  }

  async publishVideo(
    account: any,
    payload: PublishDestinationPayload,
    onProgress?: (pct: number, stage: string) => void
  ): Promise<PublishResult> {
    if (!account.access_token) {
      throw new Error(`[Meta Graph API] Account "${account.name}" has no Page Access Token configured.`);
    }

    if (!fs.existsSync(payload.videoPath)) {
      throw new Error(`Video file not found at path: ${payload.videoPath}`);
    }

    if (onProgress) onProgress(10, 'preparing');

    const pageId = account.external_id || 'me';
    const stats = fs.statSync(payload.videoPath);
    const fileSize = stats.size;
    const description = `${payload.caption} ${payload.hashtags}`.trim();

    // A Reels error may follow a successful remote submission. Never create a
    // second standard-video publication to compensate for an uncertain outcome.
    return this.publishReel(account, pageId, payload, fileSize, description, onProgress);
  }

  private async publishReel(
    account: any,
    pageId: string,
    payload: PublishDestinationPayload,
    fileSize: number,
    description: string,
    onProgress?: (pct: number, stage: string) => void
  ): Promise<PublishResult> {
    // Phase 1: Initialize Reel Upload Session
    if (onProgress) onProgress(15, 'preparing');
    const initUrl = `${this.baseUrl}/${this.apiVersion}/${pageId}/video_reels`;
    const initRes = await fetch(initUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'start',
        access_token: account.access_token,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const initData = (await initRes.json()) as any;
    if (!initRes.ok || initData.error) {
      if (initData.error?.code === 200) {
        throw new Error(
          `[Meta Graph API Error 200]: Facebook Page Reels publishing requires 'pages_manage_posts' permission.`
        );
      }
      throw new Error(`[Meta Reels start] HTTP ${initRes.status}, code ${Number.isSafeInteger(initData.error?.code) ? initData.error.code : 'unknown'}. No automatic retry.`);
    }

    const videoId = initData.video_id;
    const uploadUrl = initData.upload_url;
    if (!videoId || !uploadUrl) {
      throw new Error('Meta Reels API did not return a valid video_id or upload_url');
    }
    payload.onRemoteCreated?.(String(videoId));
    const uploadTarget = new URL(uploadUrl);
    if (uploadTarget.protocol !== 'https:' || uploadTarget.hostname !== 'rupload.facebook.com' || uploadTarget.username || uploadTarget.password)
      throw new Error('Meta returned an unexpected upload host; reconcile the saved remote ID before retry.');
    console.info('[MetaReels]', JSON.stringify({ destinationId: payload.destinationId, stage: 'start', httpStatus: initRes.status, videoId }));

    // Phase 2: Upload Video Binary to rupload
    if (onProgress) onProgress(35, 'uploading');
    const fileBuffer = fs.readFileSync(payload.videoPath);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${account.access_token}`,
        offset: '0',
        file_size: fileSize.toString(),
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer,
      signal: AbortSignal.timeout(120000),
    });

    const uploadData = (await uploadRes.json().catch(() => ({}))) as any;
    if (!uploadRes.ok || uploadData.success !== true || uploadData.error)
      throw new Error(`[Meta Reels upload] HTTP ${uploadRes.status}; binary upload was not confirmed. Reconcile remote ID ${videoId} before retry.`);
    console.info('[MetaReels]', JSON.stringify({ destinationId: payload.destinationId, stage: 'upload', httpStatus: uploadRes.status, success: uploadData.success, videoId }));

    if (onProgress) onProgress(75, 'uploading');

    // Phase 3: Finish and Publish Reel
    const finishBody: Record<string, any> = {
      upload_phase: 'finish',
      access_token: account.access_token,
      video_id: videoId,
      video_state: payload.scheduledAt ? 'SCHEDULED' : 'PUBLISHED',
      description,
      title: payload.title,
    };

    if (payload.scheduledAt) {
      finishBody.scheduled_publish_time = Math.floor(new Date(payload.scheduledAt).getTime() / 1000);
    }

    const finishRes = await fetch(initUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finishBody),
      signal: AbortSignal.timeout(20000),
    });

    const finishData = (await finishRes.json()) as any;
    if (!finishRes.ok || finishData.success !== true || finishData.error)
      throw new Error(`[Meta Reels finish] HTTP ${finishRes.status}; publication was not confirmed. Reconcile remote ID ${videoId} before retry.`);
    console.info('[MetaReels]', JSON.stringify({ destinationId: payload.destinationId, stage: 'finish', httpStatus: finishRes.status, success: finishData.success, videoId }));

    if (onProgress) onProgress(90, 'processing');

    // Phase 4: Video Processing Status Check & URL Verification
    let reelUrl = '';
    for (let attempt = 0; attempt < this.polling.attempts; attempt++) {
      const statusRes = await fetch(
        `${this.baseUrl}/${this.apiVersion}/${videoId}?fields=status,permalink_url`,
        { headers: { Authorization: `Bearer ${account.access_token}` }, signal: AbortSignal.timeout(10000) }
      );
      const statusData = (await statusRes.json()) as any;
      if (!statusRes.ok || statusData.error)
        throw new Error(`[Meta Reels status] HTTP ${statusRes.status}; reconcile remote ID ${videoId} before retry.`);
      const status = statusData.status;
      if (status?.video_status === 'error' || ['uploading_phase', 'processing_phase', 'publishing_phase'].some(p => ['error', 'failed'].includes(status?.[p]?.status)))
        throw new Error(`Meta video processing failed for remote ID ${videoId}; no automatic retry.`);
      if (status?.video_status === 'ready' && status?.publishing_phase?.status === 'complete' && statusData.permalink_url) {
        const permalink = new URL(statusData.permalink_url, 'https://www.facebook.com');
        if (permalink.protocol !== 'https:' || !['www.facebook.com', 'facebook.com'].includes(permalink.hostname) || permalink.username || permalink.password)
          throw new Error('Meta returned an unexpected permalink; reconcile the saved remote ID.');
        reelUrl = permalink.href;
        console.info('[MetaReels]', JSON.stringify({ destinationId: payload.destinationId, stage: 'published', httpStatus: statusRes.status, videoId, videoStatus: status.video_status, publishingStatus: status.publishing_phase.status, permalink: reelUrl }));
        break;
      }
      if (attempt + 1 < this.polling.attempts) await new Promise(resolve => setTimeout(resolve, this.polling.intervalMs));
    }
    if (!reelUrl) throw new Error(`Meta processing is not confirmed complete for remote ID ${videoId}; reconcile before retry.`);

    if (onProgress) onProgress(100, 'published');

    return {
      success: true,
      remotePostId: videoId,
      remotePostUrl: reelUrl,
      verificationStatus: 'confirmed',
      publishedAt: new Date().toISOString(),
    };
  }

  private async publishStandardVideo(
    account: any,
    pageId: string,
    payload: PublishDestinationPayload,
    description: string,
    onProgress?: (pct: number, stage: string) => void
  ): Promise<PublishResult> {
    const postUrl = `${this.baseUrl}/${this.apiVersion}/${pageId}/videos`;
    const formData = new FormData();
    const fileBlob = new Blob([fs.readFileSync(payload.videoPath)], { type: 'video/mp4' });
    formData.append('source', fileBlob, 'video.mp4');
    formData.append('description', description);
    formData.append('title', payload.title);
    formData.append('access_token', account.access_token);

    if (payload.scheduledAt) {
      const unixTime = Math.floor(new Date(payload.scheduledAt).getTime() / 1000);
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', unixTime.toString());
    } else {
      formData.append('published', 'true');
    }

    if (onProgress) onProgress(50, 'uploading');

    const res = await fetch(postUrl, {
      method: 'POST',
      body: formData,
    });

    const result = (await res.json()) as any;
    if (result.error) {
      throw new Error(`[Meta Graph API Error ${result.error.code}]: ${result.error.message}`);
    }

    if (!res.ok || !result.id) throw new Error('Meta did not return a published video ID; reconcile before retry');
    if (onProgress) onProgress(100, 'published');

    const videoId = result.id;
    return {
      success: true,
      remotePostId: videoId,
      remotePostUrl: `https://www.facebook.com/reel/${videoId}`,
      verificationStatus: 'confirmed',
      publishedAt: new Date().toISOString(),
    };
  }

  async fetchComments(account: any, options?: { postId?: string; limit?: number }): Promise<CommentFetchResult[]> {
    if (!account.access_token) return [];
    const targetId = options?.postId || account.external_id || 'me';
    const fields = 'id,from,message,created_time,like_count,comment_count,parent,comments{id,from,message,created_time,like_count}';
    const url = `${this.baseUrl}/${this.apiVersion}/${targetId}/comments?fields=${encodeURIComponent(fields)}&access_token=${account.access_token}&limit=${options?.limit || 50}`;
    
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const json = await res.json() as any;
      if (json.error || !json.data) return [];
      
      const results: CommentFetchResult[] = [];
      for (const c of json.data) {
        results.push({
          externalCommentId: c.id,
          authorName: c.from?.name || 'Facebook User',
          authorId: c.from?.id,
          parentCommentId: c.parent?.id,
          content: c.message || '',
          createdTime: c.created_time || new Date().toISOString(),
          likeCount: c.like_count || 0,
          nativeUrl: `https://facebook.com/${c.id}`,
        });

        // Add nested replies if present
        if (c.comments?.data) {
          for (const reply of c.comments.data) {
            results.push({
              externalCommentId: reply.id,
              authorName: reply.from?.name || 'Facebook User',
              authorId: reply.from?.id,
              parentCommentId: c.id,
              content: reply.message || '',
              createdTime: reply.created_time || new Date().toISOString(),
              likeCount: reply.like_count || 0,
              nativeUrl: `https://facebook.com/${reply.id}`,
            });
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async replyComment(
    account: any,
    commentId: string,
    text: string
  ): Promise<{ success: boolean; replyId?: string; errorMessage?: string }> {
    if (!account.access_token) {
      return { success: false, errorMessage: 'Missing Meta Page Access Token' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/${this.apiVersion}/${commentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          access_token: account.access_token,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const json = await res.json() as any;
      if (json.error) {
        return { success: false, errorMessage: json.error.message };
      }
      return { success: true, replyId: json.id };
    } catch (err: any) {
      return { success: false, errorMessage: err.message };
    }
  }

  async reactComment(
    account: any,
    commentId: string,
    reaction: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    if (!account.access_token) {
      return { success: false, errorMessage: 'Missing Meta Page Access Token' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/${this.apiVersion}/${commentId}/likes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: account.access_token }),
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json() as any;
      if (json.error) return { success: false, errorMessage: json.error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, errorMessage: err.message };
    }
  }

  async fetchInsights(account: any, _timeframe?: string): Promise<any> {
    if (!account.access_token) return null;
    const pageId = account.external_id || 'me';
    // Meta June 2026 deprecation: query modern metrics with graceful fallback
    try {
      const res = await fetch(
        `${this.baseUrl}/${this.apiVersion}/${pageId}/insights?metric=page_impressions,page_engaged_users&access_token=${account.access_token}`,
        { signal: AbortSignal.timeout(15000) }
      );
      const json = await res.json() as any;
      return json.data || null;
    } catch {
      return null;
    }
  }

  async fetchPostMetrics(account: any, remotePostId: string, remotePostUrl?: string): Promise<any> {
    if (!account.access_token) {
      return {
        remotePostId,
        remotePostUrl,
        viewCount: null,
        likeCount: null,
        commentCount: null,
        shareCount: null,
        source: 'meta_graph_api',
        status: 'auth_required',
        errorMessage: 'Meta Page Access Token required for automated Graph API metrics retrieval.',
      };
    }

    try {
      const primaryFields = 'id,title,description,likes.summary(true),comments.summary(true)';
      const res = await fetch(
        `${this.baseUrl}/${this.apiVersion}/${remotePostId}?fields=${primaryFields}&access_token=${account.access_token}`,
        { signal: AbortSignal.timeout(15000) }
      );
      const json = await res.json() as any;

      if (json.error) {
        return {
          remotePostId,
          remotePostUrl,
          viewCount: null,
          likeCount: null,
          commentCount: null,
          shareCount: null,
          source: 'meta_graph_api',
          status: 'failed',
          errorMessage: json.error.message || 'Meta Graph API query error',
        };
      }

      let shareCount: number | null = null;
      try {
        const shareRes = await fetch(
          `${this.baseUrl}/${this.apiVersion}/${remotePostId}?fields=shares&access_token=${account.access_token}`,
          { signal: AbortSignal.timeout(5000) }
        );
        const shareJson = await shareRes.json() as any;
        if (typeof shareJson?.shares?.count === 'number') {
          shareCount = shareJson.shares.count;
        }
      } catch {
        // shares field may not exist on video/reels in some Graph API versions
      }

      let reelsPlays: number | null = null;
      let replaysCount: number | null = null;
      let totalPlays: number | null = null;
      let videoViews: number | null = null;
      let reachUnique: number | null = null;
      let avgWatchTimeMs: number | null = null;

      try {
        const insightsRes = await fetch(
          `${this.baseUrl}/${this.apiVersion}/${remotePostId}/video_insights?access_token=${account.access_token}`,
          { signal: AbortSignal.timeout(15000) }
        );
        const insightsJson = await insightsRes.json() as any;
        if (Array.isArray(insightsJson?.data)) {
          for (const item of insightsJson.data) {
            const val = item.values?.[0]?.value;
            if (typeof val === 'number') {
              if (item.name === 'blue_reels_play_count') reelsPlays = val;
              else if (item.name === 'fb_reels_replay_count') replaysCount = val;
              else if (item.name === 'fb_reels_total_plays') totalPlays = val;
              else if (item.name === 'total_video_views' || item.name === 'post_video_views') videoViews = val;
              else if (item.name === 'total_video_views_unique') reachUnique = val;
              else if (item.name === 'total_video_avg_time_watched') avgWatchTimeMs = val;
            }
          }
        }
      } catch {
        // video_insights failure should not fail base engagement metrics
      }

      const resolvedViewCount =
        reelsPlays ??
        totalPlays ??
        videoViews ??
        (typeof json.views === 'number' ? json.views : null);

      return {
        remotePostId,
        remotePostUrl,
        viewCount: resolvedViewCount,
        likeCount: json.likes?.summary?.total_count ?? null,
        commentCount: json.comments?.summary?.total_count ?? null,
        shareCount: shareCount ?? json.shares?.count ?? null,
        source: 'meta_graph_api',
        status: 'confirmed',
        extraMetrics: {
          title: json.title || '',
          description: json.description || '',
          reelsPlays,
          replaysCount,
          totalPlays,
          videoViews,
          reachUnique,
          avgWatchTimeSeconds: typeof avgWatchTimeMs === 'number' ? Math.round(avgWatchTimeMs / 1000) : null,
        },
      };
    } catch (err: any) {
      return {
        remotePostId,
        remotePostUrl,
        viewCount: null,
        likeCount: null,
        commentCount: null,
        shareCount: null,
        source: 'meta_graph_api',
        status: 'failed',
        errorMessage: err.message,
      };
    }
  }

  async fetchAccountMetrics(account: any): Promise<any> {
    if (!account.access_token) {
      return {
        followersTotal: null,
        source: 'meta_graph_api',
        status: 'auth_required',
        errorMessage: 'Meta Page Access Token required.',
      };
    }

    const pageId = account.external_id || 'me';
    try {
      const res = await fetch(
        `${this.baseUrl}/${this.apiVersion}/${pageId}?fields=followers_count,fan_count,name&access_token=${account.access_token}`,
        { signal: AbortSignal.timeout(15000) }
      );
      const json = await res.json() as any;
      if (json.error) {
        return {
          followersTotal: null,
          source: 'meta_graph_api',
          status: 'failed',
          errorMessage: json.error.message,
        };
      }

      return {
        followersTotal: json.followers_count ?? json.fan_count ?? null,
        source: 'meta_graph_api',
        status: 'confirmed',
      };
    } catch (err: any) {
      return {
        followersTotal: null,
        source: 'meta_graph_api',
        status: 'failed',
        errorMessage: err.message,
      };
    }
  }
}

