import fs from 'fs';
import { AccountConnector, ConnectorCapabilities, ConnectionHealth, PublishDestinationPayload, PublishResult, CommentFetchResult } from './types.js';

export class MetaFacebookConnector implements AccountConnector {
  private apiVersion = process.env.META_GRAPH_VERSION || 'unconfigured';
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
    const postUrl = `${this.baseUrl}/${this.apiVersion}/${pageId}/videos`;

    // Construct FormData for video upload
    const formData = new FormData();
    const fileBlob = new Blob([fs.readFileSync(payload.videoPath)], { type: 'video/mp4' });
    formData.append('source', fileBlob, 'video.mp4');
    formData.append('description', `${payload.caption} ${payload.hashtags}`.trim());
    formData.append('title', payload.title);
    formData.append('access_token', account.access_token);

    if (payload.scheduledAt) {
      const unixTime = Math.floor(new Date(payload.scheduledAt).getTime() / 1000);
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', unixTime.toString());
    } else {
      formData.append('published', 'true');
    }

    if (onProgress) onProgress(40, 'uploading');

    const res = await fetch(postUrl, {
      method: 'POST',
      body: formData,
    });

    const result = await res.json() as any;

    if (result.error) {
      throw new Error(`[Meta Graph API Error ${result.error.code}]: ${result.error.message}`);
    }

    if (!res.ok || !result.id) throw new Error('Meta did not return a published video ID; reconcile before retry');
    if (onProgress) onProgress(100, 'awaiting_confirmation');

    const videoId = result.id;
    return {
      success: true,
      remotePostId: videoId,
      remotePostUrl: `https://facebook.com/${videoId}`,
      verificationStatus: 'unverified',
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
      const fields = 'views,description,title,likes.summary(true),comments.summary(true),shares';
      const res = await fetch(
        `${this.baseUrl}/${this.apiVersion}/${remotePostId}?fields=${fields}&access_token=${account.access_token}`,
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

      return {
        remotePostId,
        remotePostUrl,
        viewCount: typeof json.views === 'number' ? json.views : null,
        likeCount: json.likes?.summary?.total_count ?? null,
        commentCount: json.comments?.summary?.total_count ?? null,
        shareCount: json.shares?.count ?? null,
        source: 'meta_graph_api',
        status: 'confirmed',
        extraMetrics: {
          title: json.title || '',
          description: json.description || '',
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

