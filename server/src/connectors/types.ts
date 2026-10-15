export interface ConnectorCapabilities {
  canPublish: boolean;
  canSchedule: boolean;
  canReadComments: boolean;
  canReply: boolean;
  canReact: boolean;
  canReadInsights: boolean;
  canReceiveEvents: boolean;
  requiresManualConfirmation: boolean;
  supportedVideoFormats: string[];
  maxVideoSizeMb: number;
  maxDurationSeconds: number;
}

export interface ConnectionHealth {
  status: 'connected' | 'expired' | 'failed' | 'disconnected';
  healthStatus: string;
  tokenExpiresAt?: string;
  lastCheckedAt: string;
  warnings?: string[];
}

export interface PublishDestinationPayload {
  destinationId: string;
  postId: string;
  accountId: string;
  videoPath: string;
  title: string;
  caption: string;
  hashtags: string;
  applyBranding: boolean;
  scheduledAt?: string;
}

export interface PublishResult {
  success: boolean;
  remotePostId?: string;
  remotePostUrl?: string;
  verificationStatus: 'confirmed' | 'unverified' | 'failed';
  errorMessage?: string;
  publishedAt?: string;
}

export interface CommentFetchResult {
  externalCommentId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdTime: string;
  likeCount: number;
  nativeUrl?: string;
}

export interface AccountConnector {
  getCapabilities(): ConnectorCapabilities;
  verifyHealth(account: any): Promise<ConnectionHealth>;
  publishVideo(account: any, payload: PublishDestinationPayload, onProgress?: (pct: number, stage: string) => void): Promise<PublishResult>;
  fetchComments(account: any, options?: { postId?: string; limit?: number }): Promise<CommentFetchResult[]>;
  replyComment(account: any, commentId: string, text: string): Promise<{ success: boolean; replyId?: string; errorMessage?: string }>;
  reactComment(account: any, commentId: string, reaction: string): Promise<{ success: boolean; errorMessage?: string }>;
  fetchInsights(account: any, timeframe?: string): Promise<any>;
}
