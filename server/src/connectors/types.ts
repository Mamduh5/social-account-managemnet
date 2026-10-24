export interface ConnectorCapabilities {
  supportedPostTypes?: Array<'video' | 'text' | 'image' | 'multi_image' | 'link'>;
  canReadProfile?: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canReadPostMetrics: boolean;
  canReadComments: boolean;
  canReply: boolean;
  canReact: boolean;
  canReadInsights: boolean;
  canReceiveEvents: boolean;
  requiresManualConfirmation: boolean;
  canUploadDraft?: boolean;
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
  /** An unavailable health check does not establish a connection-state change. */
  preserveConnection?: boolean;
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
  /** Persist the single remote upload before subsequent network operations. */
  onRemoteCreated?: (remoteId: string) => void;
}

export interface PublishResult {
  success: boolean;
  remotePostId?: string;
  remotePostUrl?: string;
  verificationStatus: 'confirmed' | 'unverified' | 'failed';
  errorMessage?: string;
  publishedAt?: string;
}

/** General Page posts use local image bytes; no remote URL is fetched by the server. */
export interface PagePostPayload {
  destinationId: string;
  postId: string;
  accountId: string;
  contentType: 'text' | 'image' | 'multi_image' | 'link';
  caption: string;
  hashtags: string;
  linkUrl?: string;
  attachments: Array<{
    id: string;
    path: string;
    mimeType: string;
    altText?: string;
    remoteId?: string;
  }>;
  /** An existing post is reconciled read-only; it must never be submitted again. */
  remotePostId?: string;
  /** Callbacks must durably persist intent/IDs before the next network operation. */
  onSubmissionStarted: (stage: string, attachmentId?: string) => void;
  onAttachmentUploaded: (attachmentId: string, remoteId: string) => void;
  onRemoteCreated: (remoteId: string) => void;
}

export interface CommentFetchResult {
  externalCommentId: string;
  authorName: string;
  authorAvatar?: string;
  authorId?: string;
  parentCommentId?: string;
  content: string;
  createdTime: string;
  likeCount: number;
  nativeUrl?: string;
}

export interface PostMetricsResult {
  remotePostId: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  extraMetrics?: Record<string, any>;
  source: string;
  status: 'confirmed' | 'auth_required' | 'unsupported' | 'failed';
  errorMessage?: string;
}

export interface AccountMetricsResult {
  followersTotal: number | null;
  followersGain?: number;
  viewsTotal?: number | null;
  likesTotal?: number | null;
  commentsTotal?: number | null;
  sharesTotal?: number | null;
  followingTotal?: number | null;
  source: string;
  status: 'confirmed' | 'auth_required' | 'unsupported' | 'failed';
  errorMessage?: string;
}

export interface AccountConnector {
  getCapabilities(): ConnectorCapabilities;
  verifyHealth(account: any): Promise<ConnectionHealth>;
  publishVideo(account: any, payload: PublishDestinationPayload, onProgress?: (pct: number, stage: string) => void): Promise<PublishResult>;
  publishPost?(account: any, payload: PagePostPayload, onProgress?: (pct: number, stage: string) => void): Promise<PublishResult>;
  fetchComments(account: any, options?: { postId?: string; limit?: number }): Promise<CommentFetchResult[]>;
  replyComment(account: any, commentId: string, text: string): Promise<{ success: boolean; replyId?: string; errorMessage?: string }>;
  reactComment(account: any, commentId: string, reaction: string): Promise<{ success: boolean; errorMessage?: string }>;
  fetchInsights(account: any, timeframe?: string): Promise<any>;
  fetchPostMetrics?(account: any, remotePostId: string, remotePostUrl?: string): Promise<PostMetricsResult | null>;
  fetchAccountMetrics?(account: any): Promise<AccountMetricsResult | null>;
}
