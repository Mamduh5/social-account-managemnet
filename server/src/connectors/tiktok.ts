import fs from 'fs';
import {
  AccountConnector,
  ConnectorCapabilities,
  ConnectionHealth,
  PublishDestinationPayload,
  PublishResult,
  CommentFetchResult,
  PostMetricsResult,
  AccountMetricsResult,
} from './types.js';

export class TikTokConnector implements AccountConnector {
  private baseUrl = 'https://open.tiktokapis.com/v2';

  getCapabilities(): ConnectorCapabilities {
    return {
      canPublish: false,
      canSchedule: false, // Standard TikTok Creator API does not support remote scheduled queueing
      canReadPostMetrics: true, // Supported via TikTok Display API (video.list, video.query)
      canReadComments: false, // Requires TikTok for Business Accounts API access approval (supports both Personal and Business accounts)
      canReply: false, // Requires TikTok for Business Accounts API comment moderation access (comment.list.manage)
      canReact: false,
      canReadInsights: false,
      canReceiveEvents: false,
      requiresManualConfirmation: true, // Personal account & unaudited integration requires manual confirmation / browser handoff
      supportedVideoFormats: ['mp4', 'mov', 'webm'],
      maxVideoSizeMb: 500,
      maxDurationSeconds: 600,
    };
  }

  async verifyHealth(account: any): Promise<ConnectionHealth> {
    if (!account.access_token) {
      return {
        status: 'disconnected',
        healthStatus: 'Missing TikTok Creator Access Token',
        lastCheckedAt: new Date().toISOString(),
        warnings: ['Connect your TikTok account via OAuth or enter access token.'],
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/user/info/?fields=open_id,display_name`, {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
        },
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json()) as any;

      if (data.error && data.error.code !== 'ok') {
        return {
          status: 'expired',
          healthStatus: `TikTok API Error: ${data.error.message || 'Token expired'}`,
          lastCheckedAt: new Date().toISOString(),
          warnings: [data.error.message],
        };
      }

      if (account.external_id && (!data.data?.user?.open_id || data.data.user.open_id !== account.external_id)) {
        throw new Error('Authorized TikTok identity mismatch');
      }
      return {
        status: 'connected',
        healthStatus: `Connected as TikTok Creator: ${data.data?.user?.display_name || account.name}`,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        status: 'failed',
        healthStatus: `Network error: ${err.message}`,
        lastCheckedAt: new Date().toISOString(),
        warnings: [err.message],
      };
    }
  }

  async publishVideo(
    account: any,
    payload: PublishDestinationPayload,
    onProgress?: (pct: number, stage: string) => void
  ): Promise<PublishResult> {
    let scopes: string[] = [];
    try {
      scopes = JSON.parse(account.granted_scopes_json || '[]');
    } catch {}

    if (!scopes.includes('video.publish')) {
      throw new Error(
        'TikTok Direct Post requires official video.publish scope approval. Under TikTok consumer developer policies, internal utility tools do not qualify for direct posting. Owned-account publishing via the separate TikTok for Business Accounts API requires business partner approval. Use browser-assisted manual publishing.'
      );
    }

    if (payload.applyBranding) {
      console.warn('[TikTok] Warning: Content Posting API guidelines prohibit third-party watermarks/logos on uploaded videos.');
    }

    if (!fs.existsSync(payload.videoPath)) {
      throw new Error(`Video file not found at ${payload.videoPath}`);
    }

    onProgress?.(10, 'querying_creator_info');
    const creatorInfo = await this.queryCreatorInfo(account);
    if (!creatorInfo.success) {
      throw new Error(creatorInfo.errorMessage || 'Failed to query TikTok creator publishing permissions');
    }

    const privacyLevel = (payload as any).privacyLevel || creatorInfo.privacyLevelOptions?.[0] || 'SELF_ONLY';

    onProgress?.(25, 'initializing_upload');
    const initResult = await this.initDirectPost(account, {
      videoPath: payload.videoPath,
      title: payload.caption || payload.title,
      privacyLevel,
      isAigc: true,
    });

    if (!initResult.success || !initResult.publishId || !initResult.uploadUrl) {
      throw new Error(initResult.errorMessage || 'Failed to initialize TikTok video publishing');
    }

    payload.onRemoteCreated?.(initResult.publishId);

    onProgress?.(50, 'transferring_media');
    const uploadSuccess = await this.uploadVideoBinary(initResult.uploadUrl, payload.videoPath, (pct) => {
      onProgress?.(50 + Math.round(pct * 0.3), 'uploading');
    });

    if (!uploadSuccess) {
      throw new Error('Failed to upload video binary to TikTok storage endpoint');
    }

    onProgress?.(85, 'verifying_status');
    const statusResult = await this.pollPublishStatus(account, initResult.publishId);
    if (!statusResult.success) {
      throw new Error(statusResult.errorMessage || 'TikTok publishing processing failed');
    }

    return {
      success: true,
      remotePostId: statusResult.remotePostId,
      remotePostUrl: statusResult.remotePostId
        ? `https://www.tiktok.com/@${account.handle.replace(/^@/, '')}/video/${statusResult.remotePostId}`
        : undefined,
      verificationStatus: 'confirmed',
      publishedAt: new Date().toISOString(),
    };
  }

  async queryCreatorInfo(account: any): Promise<{
    success: boolean;
    privacyLevelOptions?: string[];
    maxVideoPostDurationSec?: number;
    commentDisabled?: boolean;
    duetDisabled?: boolean;
    stitchDisabled?: boolean;
    errorMessage?: string;
  }> {
    if (!account.access_token) return { success: false, errorMessage: 'Missing TikTok access token' };
    try {
      const res = await fetch(`${this.baseUrl}/post/publish/creator_info/query/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json()) as any;
      if (data.error && data.error.code !== 'ok') {
        return { success: false, errorMessage: data.error.message || 'Failed to query creator info' };
      }
      const c = data.data;
      return {
        success: true,
        privacyLevelOptions: c?.privacy_level_options || ['SELF_ONLY'],
        maxVideoPostDurationSec: c?.max_video_post_duration_sec || 600,
        commentDisabled: !!c?.comment_disabled,
        duetDisabled: !!c?.duet_disabled,
        stitchDisabled: !!c?.stitch_disabled,
      };
    } catch (err: any) {
      return { success: false, errorMessage: err.message };
    }
  }

  async initDirectPost(
    account: any,
    params: {
      videoPath: string;
      title: string;
      privacyLevel: string;
      disableComment?: boolean;
      disableDuet?: boolean;
      disableStitch?: boolean;
      isAigc?: boolean;
      brandOrganic?: boolean;
      brandContent?: boolean;
    }
  ): Promise<{
    success: boolean;
    publishId?: string;
    uploadUrl?: string;
    errorMessage?: string;
  }> {
    if (!account.access_token) return { success: false, errorMessage: 'Missing TikTok access token' };
    try {
      const stats = fs.statSync(params.videoPath);
      const res = await fetch(`${this.baseUrl}/post/publish/video/init/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title: params.title.slice(0, 2200),
            privacy_level: params.privacyLevel,
            disable_comment: !!params.disableComment,
            disable_duet: !!params.disableDuet,
            disable_stitch: !!params.disableStitch,
            is_aigc: !!params.isAigc,
            brand_organic_toggle: !!params.brandOrganic,
            brand_content_toggle: !!params.brandContent,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: stats.size,
            chunk_size: stats.size,
            total_chunk_count: 1,
          },
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data = (await res.json()) as any;
      if (data.error && data.error.code !== 'ok') {
        return { success: false, errorMessage: data.error.message || 'TikTok publish init failed' };
      }
      return {
        success: true,
        publishId: data.data?.publish_id,
        uploadUrl: data.data?.upload_url,
      };
    } catch (err: any) {
      return { success: false, errorMessage: err.message };
    }
  }

  async uploadVideoBinary(
    uploadUrl: string,
    videoPath: string,
    onProgress?: (pct: number) => void
  ): Promise<boolean> {
    try {
      const buffer = fs.readFileSync(videoPath);
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
        },
        body: buffer,
        signal: AbortSignal.timeout(60000),
      });
      onProgress?.(100);
      return res.ok || res.status === 201;
    } catch {
      return false;
    }
  }

  async pollPublishStatus(
    account: any,
    publishId: string,
    maxAttempts = 15
  ): Promise<{
    success: boolean;
    remotePostId?: string;
    errorMessage?: string;
  }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/post/publish/status/fetch/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${account.access_token}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({ publish_id: publishId }),
          signal: AbortSignal.timeout(15000),
        });
        const data = (await res.json()) as any;
        if (data.error && data.error.code !== 'ok') {
          return { success: false, errorMessage: data.error.message };
        }
        const status = data.data?.status;
        if (status === 'PUBLISH_COMPLETE') {
          const ids = data.data?.publicly_available_post_id;
          const remotePostId = Array.isArray(ids) && ids.length > 0 ? String(ids[0]) : publishId;
          return { success: true, remotePostId };
        }
        if (status === 'FAILED') {
          return { success: false, errorMessage: data.data?.fail_reason || 'TikTok video publishing failed' };
        }
      } catch (err: any) {
        if (attempt === maxAttempts) return { success: false, errorMessage: err.message };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { success: false, errorMessage: 'TikTok publishing status verification timed out' };
  }

  async fetchComments(account: any, options?: { postId?: string; limit?: number }): Promise<CommentFetchResult[]> {
    if (!account.access_token) return [];
    try {
      const res = await fetch(`${this.baseUrl}/comment/list/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_id: options?.postId,
          max_count: options?.limit || 20,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json()) as any;
      if (json.data?.comments) {
        return json.data.comments.map((c: any) => ({
          externalCommentId: c.id,
          authorName: c.user?.display_name || 'TikTok User',
          authorId: c.user?.open_id,
          parentCommentId: c.parent_comment_id || undefined,
          content: c.text || '',
          createdTime: c.create_time ? new Date(c.create_time * 1000).toISOString() : new Date().toISOString(),
          likeCount: c.digg_count || 0,
          nativeUrl: `https://www.tiktok.com/@${account.handle.replace(/^@/, '')}/video/${options?.postId}`,
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async replyComment(account: any, commentId: string, text: string): Promise<{ success: boolean; replyId?: string; errorMessage?: string }> {
    if (!account.access_token) {
      return {
        success: false,
        errorMessage: 'TikTok comment replies require approved Accounts API access (comment.list.manage scope), which supports owned Personal and Business accounts upon business developer approval. Use the Native Platform Handoff button to reply on TikTok.',
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/comment/reply/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment_id: commentId,
          text,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json()) as any;
      if (json.data?.reply_id) {
        return { success: true, replyId: json.data.reply_id };
      }
      return {
        success: false,
        errorMessage: json.error?.message || 'TikTok Accounts API reply denied. Check app review status.',
      };
    } catch (err: any) {
      return { success: false, errorMessage: err.message };
    }
  }

  async reactComment(_account: any, _commentId: string, _reaction: string): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'TikTok official API does not support remote comment liking. Use Native Handoff.',
    };
  }

  async fetchInsights(account: any, _timeframe?: string): Promise<any> {
    if (!account.access_token) return null;
    try {
      const res = await fetch(`${this.baseUrl}/user/info/?fields=open_id,display_name`, {
        headers: { Authorization: `Bearer ${account.access_token}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json()) as any;
      return data.data?.user || null;
    } catch {
      return null;
    }
  }

  async fetchPostMetrics(account: any, remotePostId: string, _remotePostUrl?: string): Promise<PostMetricsResult> {
    if (!account.access_token) {
      return {
        remotePostId,
        viewCount: null,
        likeCount: null,
        commentCount: null,
        shareCount: null,
        source: 'tiktok_display_api',
        status: 'auth_required',
        errorMessage: 'TikTok Display API requires OAuth authorization with video.list scope.',
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/video/query/?fields=id,title,view_count,like_count,comment_count,share_count`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: {
            video_ids: [remotePostId],
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json()) as any;

      if (json.error && json.error.code !== 'ok') {
        const isAuth = ['access_token_invalid', 'scope_not_authorized', 'token_expired'].includes(json.error.code);
        const isRateLimit = json.error.code === 'rate_limit_exceeded' || res.status === 429;
        return {
          remotePostId,
          viewCount: null,
          likeCount: null,
          commentCount: null,
          shareCount: null,
          source: 'tiktok_display_api',
          status: isAuth ? 'auth_required' : 'failed',
          errorMessage: json.error.message || (isRateLimit ? 'TikTok API rate limit reached' : 'TikTok Display API error'),
        };
      }

      const video = json.data?.videos?.[0];
      if (!video) {
        return {
          remotePostId,
          viewCount: null,
          likeCount: null,
          commentCount: null,
          shareCount: null,
          source: 'tiktok_display_api',
          status: 'failed',
          errorMessage: 'Video not found in TikTok account library',
        };
      }

      return {
        remotePostId,
        viewCount: typeof video.view_count === 'number' ? video.view_count : null,
        likeCount: typeof video.like_count === 'number' ? video.like_count : null,
        commentCount: typeof video.comment_count === 'number' ? video.comment_count : null,
        shareCount: typeof video.share_count === 'number' ? video.share_count : null,
        source: 'tiktok_display_api',
        status: 'confirmed',
        extraMetrics: {
          title: video.title || '',
        },
      };
    } catch (err: any) {
      return {
        remotePostId,
        viewCount: null,
        likeCount: null,
        commentCount: null,
        shareCount: null,
        source: 'tiktok_display_api',
        status: 'failed',
        errorMessage: err.message,
      };
    }
  }

  async fetchVideoList(
    account: any,
    options?: { maxCount?: number; cursor?: number }
  ): Promise<{
    videos: Array<{
      id: string;
      title: string;
      viewCount: number | null;
      likeCount: number | null;
      commentCount: number | null;
      shareCount: number | null;
    }>;
    cursor?: number;
    hasMore?: boolean;
    errorMessage?: string;
  }> {
    if (!account.access_token) {
      return { videos: [], errorMessage: 'TikTok access token required.' };
    }
    try {
      const res = await fetch(`${this.baseUrl}/video/list/?fields=id,title,view_count,like_count,comment_count,share_count`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_count: options?.maxCount || 20,
          ...(options?.cursor ? { cursor: options.cursor } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json()) as any;
      if (json.error && json.error.code !== 'ok') {
        return { videos: [], errorMessage: json.error.message || 'Failed to list TikTok videos' };
      }
      const videos = (json.data?.videos || []).map((v: any) => ({
        id: v.id,
        title: v.title || '',
        viewCount: typeof v.view_count === 'number' ? v.view_count : null,
        likeCount: typeof v.like_count === 'number' ? v.like_count : null,
        commentCount: typeof v.comment_count === 'number' ? v.comment_count : null,
        shareCount: typeof v.share_count === 'number' ? v.share_count : null,
      }));
      return {
        videos,
        cursor: json.data?.cursor,
        hasMore: !!json.data?.has_more,
      };
    } catch (err: any) {
      return { videos: [], errorMessage: err.message };
    }
  }

  async fetchAccountMetrics(account: any): Promise<AccountMetricsResult> {
    if (!account.access_token) {
      return {
        followersTotal: null,
        source: 'tiktok_display_api',
        status: 'auth_required',
        errorMessage: 'TikTok access token required for account statistics.',
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/user/info/?fields=open_id,display_name,follower_count,following_count,likes_count`, {
        headers: { Authorization: `Bearer ${account.access_token}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json()) as any;
      let u = data.data?.user;
      if (data.error && data.error.code !== 'ok') {
        // Fall back to basic user info if stats scope is ungranted
        try {
          const fallbackRes = await fetch(`${this.baseUrl}/user/info/?fields=open_id,display_name`, {
            headers: { Authorization: `Bearer ${account.access_token}` },
            signal: AbortSignal.timeout(15000),
          });
          const fallbackData = (await fallbackRes.json()) as any;
          if (fallbackData.data?.user) {
            u = fallbackData.data.user;
          } else {
            return {
              followersTotal: null,
              source: 'tiktok_display_api',
              status: 'failed',
              errorMessage: data.error.message,
            };
          }
        } catch {
          return {
            followersTotal: null,
            source: 'tiktok_display_api',
            status: 'failed',
            errorMessage: data.error.message,
          };
        }
      }

      return {
        followersTotal: typeof u?.follower_count === 'number' ? u.follower_count : null,
        followingTotal: typeof u?.following_count === 'number' ? u.following_count : null,
        likesTotal: typeof u?.likes_count === 'number' ? u.likes_count : null,
        source: 'tiktok_display_api',
        status: 'confirmed',
      };
    } catch (err: any) {
      return {
        followersTotal: null,
        source: 'tiktok_display_api',
        status: 'failed',
        errorMessage: err.message,
      };
    }
  }
}
