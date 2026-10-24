import { AccountConnector, ConnectorCapabilities, ConnectionHealth, PublishDestinationPayload, PagePostPayload, PublishResult, CommentFetchResult } from './types.js';

export class SimulatorConnector implements AccountConnector {
  getCapabilities(): ConnectorCapabilities {
    return {
      canPublish: true,
      canSchedule: true,
      canReadPostMetrics: true,
      canReadComments: true,
      canReply: true,
      canReact: true,
      canReadInsights: true,
      canReceiveEvents: true,
      requiresManualConfirmation: false,
      supportedVideoFormats: ['mp4', 'mov', 'webm'],
      maxVideoSizeMb: 500,
      maxDurationSeconds: 600,
    };
  }

  async verifyHealth(account: any): Promise<ConnectionHealth> {
    if (account.status === 'expired') {
      return {
        status: 'expired',
        healthStatus: 'Simulated Session Expired (Click Reconnect)',
        lastCheckedAt: new Date().toISOString(),
        warnings: ['OAuth token expired 1 day ago. Refresh required.'],
      };
    }
    return {
      status: 'connected',
      healthStatus: 'Healthy (Simulated)',
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      lastCheckedAt: new Date().toISOString(),
    };
  }

  async publishPost(account:any,payload:PagePostPayload):Promise<PublishResult> {
    if (!account.is_demo || account.platform!=='facebook' || account.account_type!=='page') throw new Error('Simulator is restricted to persisted demo Pages');
    return {success:true,remotePostId:'sim-post-'+payload.destinationId,remotePostUrl:'https://www.facebook.com/'+account.external_id+'/posts/sim-'+payload.destinationId,verificationStatus:'confirmed'};
  }

  async publishVideo(
    account: any,
    payload: PublishDestinationPayload,
    onProgress?: (pct: number, stage: string) => void
  ): Promise<PublishResult> {
    if (account.status === 'expired') {
      throw new Error(`[Simulator] Account ${account.name} session is expired. Reconnect account before publishing.`);
    }

    // Step-by-step simulated progress with realistic latency
    if (onProgress) onProgress(15, 'preparing');
    await new Promise((r) => setTimeout(r, 600));

    if (onProgress) onProgress(45, 'uploading');
    await new Promise((r) => setTimeout(r, 800));

    if (onProgress) onProgress(80, 'awaiting_confirmation');
    await new Promise((r) => setTimeout(r, 600));

    if (onProgress) onProgress(100, 'published');

    const mockId = `sim-${account.platform}-${Date.now().toString(36)}`;
    const mockUrl =
      account.platform === 'facebook'
        ? `https://facebook.com/${account.handle.replace('@', '')}/videos/${mockId}`
        : `https://tiktok.com/${account.handle}/video/${mockId}`;

    return {
      success: true,
      remotePostId: mockId,
      remotePostUrl: mockUrl,
      verificationStatus: 'confirmed',
      publishedAt: new Date().toISOString(),
    };
  }

  async fetchComments(account: any, _options?: { postId?: string; limit?: number }): Promise<CommentFetchResult[]> {
    return [
      {
        externalCommentId: `sim-cmt-${Date.now()}`,
        authorName: 'Creative Explorer',
        authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80',
        content: `Simulated comment for ${account.name} regarding the latest video render!`,
        createdTime: new Date().toISOString(),
        likeCount: Math.floor(Math.random() * 20),
        nativeUrl: account.platform === 'facebook' ? 'https://facebook.com' : 'https://tiktok.com',
      },
    ];
  }

  async replyComment(
    account: any,
    commentId: string,
    text: string
  ): Promise<{ success: boolean; replyId?: string; errorMessage?: string }> {
    return {
      success: true,
      replyId: `sim-rep-${Date.now().toString(36)}`,
    };
  }

  async reactComment(
    account: any,
    commentId: string,
    reaction: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: true,
    };
  }

  async fetchInsights(account: any, timeframe?: string): Promise<any> {
    return {
      views: Math.floor(5000 + Math.random() * 3000),
      likes: Math.floor(400 + Math.random() * 200),
      comments: Math.floor(50 + Math.random() * 40),
      shares: Math.floor(25 + Math.random() * 20),
      isSimulated: true,
    };
  }

  async fetchPostMetrics(_account: any, remotePostId: string): Promise<any> {
    return {
      remotePostId,
      viewCount: Math.floor(1000 + Math.random() * 500),
      likeCount: Math.floor(50 + Math.random() * 30),
      commentCount: Math.floor(10 + Math.random() * 8),
      shareCount: Math.floor(5 + Math.random() * 4),
      source: 'simulated',
      status: 'confirmed',
    };
  }

  async fetchAccountMetrics(_account: any): Promise<any> {
    return {
      followersTotal: 1250,
      followersGain: 25,
      viewsTotal: 15400,
      likesTotal: 890,
      commentsTotal: 140,
      sharesTotal: 65,
      source: 'simulated',
      status: 'confirmed',
    };
  }
}

