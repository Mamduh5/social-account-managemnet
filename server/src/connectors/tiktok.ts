import fs from 'fs';
import { AccountConnector, ConnectorCapabilities, ConnectionHealth, PublishDestinationPayload, PublishResult, CommentFetchResult } from './types.js';

export class TikTokConnector implements AccountConnector {
  private baseUrl = 'https://open.tiktokapis.com/v2';

  getCapabilities(): ConnectorCapabilities {
    return {
      canPublish: false,
      canSchedule: false, // Standard TikTok Creator API does not support remote scheduled queueing
      canReadComments: false, // Requires special TikTok Enterprise Partner access
      canReply: false, // Native platform handoff required
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

  async fetchComments(_account: any): Promise<CommentFetchResult[]> {
    // Honest: Standard TikTok Content Posting API does not expose read_comments for creators.
    return [];
  }

  async replyComment(_account: any, _commentId: string, _text: string): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'TikTok official API restricts comment replies to verified enterprise partners. Use the Native Platform Handoff button to reply on TikTok.',
    };
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
      });
      const data = await res.json() as any;
      return data.data?.user || null;
    } catch {
      return null;
    }
  }
}
