import fs from 'fs';
import { AccountConnector, ConnectorCapabilities, ConnectionHealth, PublishDestinationPayload, PublishResult, CommentFetchResult } from './types.js';

export class TikTokConnector implements AccountConnector {
  private baseUrl = 'https://open.tiktokapis.com/v2';

  getCapabilities(): ConnectorCapabilities {
    return {
      canPublish: false,
      canSchedule: false, // Standard TikTok Creator API does not support remote scheduled queueing
      canReadPostMetrics: true, // Supported via TikTok Display API (video.list, video.query)
      canReadComments: false, // Requires TikTok Accounts API access approval
      canReply: false, // Requires TikTok Accounts API comment moderation access
      canReact: false,
      canReadInsights: false,
      canReceiveEvents: false,
      requiresManualConfirmation: false,
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
      const data = await res.json() as any;

      if (data.error && data.error.code !== 'ok') {
        return {
          status: 'expired',
          healthStatus: `TikTok API Error: ${data.error.message || 'Token expired'}`,
          lastCheckedAt: new Date().toISOString(),
          warnings: [data.error.message],
        };
      }

      if (!data.data?.user?.open_id || data.data.user.open_id !== account.external_id) throw new Error('Authorized TikTok identity mismatch');
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
    throw new Error('TikTok API publishing is pending creator privacy controls, app approval and status verification. Use browser-assisted manual publishing.');
  }

  async fetchComments(account: any, options?: { postId?: string; limit?: number }): Promise<CommentFetchResult[]> {
    // If access token and comment moderation scope are present via TikTok Accounts API:
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
      const json = await res.json() as any;
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
        errorMessage: 'TikTok comment replies require approved Accounts API access (comment.list.manage scope). Use the Native Platform Handoff button to reply on TikTok.',
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
      const json = await res.json() as any;
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
      const data = await res.json() as any;
      return data.data?.user || null;
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
      const json = await res.json() as any;

      if (json.error && json.error.code !== 'ok') {
        return {
          remotePostId,
          remotePostUrl,
          viewCount: null,
          likeCount: null,
          commentCount: null,
          shareCount: null,
          source: 'tiktok_display_api',
          status: 'failed',
          errorMessage: json.error.message || 'TikTok Display API error',
        };
      }

      const video = json.data?.videos?.[0];
      if (!video) {
        return {
          remotePostId,
          remotePostUrl,
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
        remotePostUrl,
        viewCount: video.view_count ?? null,
        likeCount: video.like_count ?? null,
        commentCount: video.comment_count ?? null,
        shareCount: video.share_count ?? null,
        source: 'tiktok_display_api',
        status: 'confirmed',
        extraMetrics: {
          title: video.title || '',
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
        source: 'tiktok_display_api',
        status: 'failed',
        errorMessage: err.message,
      };
    }
  }

  async fetchAccountMetrics(account: any): Promise<any> {
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
      const data = await res.json() as any;
      if (data.error && data.error.code !== 'ok') {
        return {
          followersTotal: null,
          source: 'tiktok_display_api',
          status: 'failed',
          errorMessage: data.error.message,
        };
      }

      const u = data.data?.user;
      return {
        followersTotal: u?.follower_count ?? null,
        followingTotal: u?.following_count ?? null,
        likesTotal: u?.likes_count ?? null,
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
