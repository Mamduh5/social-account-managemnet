export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  account_count?: number;
}

export interface ConnectorCapabilities {
  canReadProfile?: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canReadPostMetrics?: boolean;
  canUploadDraft?: boolean;
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

export interface BrandKit {
  mode?: 'none' | 'moving' | 'moving_and_caption' | 'caption';
  watermarkType: 'moving_text' | 'static_text' | 'logo_overlay';
  text?: string;
  logoPath?: string;
  movementPreset: 'smooth_sine' | 'corner_jump' | 'diagonal_bounce' | 'static_corner';
  speedSeconds?: number;
  intervalSeconds?: number;
  fontSize?: number;
  opacity?: number;
  fontColor?: string;
  boxBgColor?: string;
  boxBgOpacity?: number;
  safeArea?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  enableSignature?: boolean;
  signatureText?: string;
}

export interface Account {
  id: string;
  category_id: string | null;
  category_name?: string;
  category_color?: string;
  category_slug?: string;
  platform: 'facebook' | 'tiktok';
  account_type: 'page' | 'personal' | 'business';
  name: string;
  handle: string;
  avatar_url: string;
  status: 'connected' | 'expired' | 'failed' | 'disconnected';
  connector_mode: 'official_api' | 'browser_bridge' | 'simulator';
  public_url?: string;
  external_id?: string | null;
  description?: string;
  notes?: string;
  is_demo?: number;
  archived_at?: string | null;
  identity_verified_at?: string | null;
  connection_status?: string;
  grantedScopes?: string[];
  settings?: { defaultCaption?: string; defaultHashtags?: string; applyBranding?: boolean };
  created_at?: string;
  updated_at?: string;
  brand_kit_json?: string;
  brandKit?: BrandKit;
  health_status: string;
  last_health_check?: string;
  capabilities?: ConnectorCapabilities;
}

export interface BrandedVideo {
  id: string;
  video_id: string;
  preset_name: string;
  movement_preset: string;
  watermark_text: string;
  file_path: string;
  previewUrl: string;
  downloadUrl: string;
  file_size: number;
  duration: number;
  width: number;
  height: number;
  aspect_ratio: string;
  thumbnail_path?: string | null;
  brand_kit_json?: string;
  sha256?: string;
  created_at: string;
}

export type DestinationMediaMode = 'original' | 'saved_variant' | 'dispatch_branding';

export type PipelineDiscoveryErrorKind =
  | 'unsupported_endpoint'
  | 'auth_failure'
  | 'timeout'
  | 'offline'
  | 'malformed_response'
  | 'invalid_cursor'
  | 'incomplete_history'
  | 'upstream_error';

export interface DiscoveredPipelineJob {
  jobId: string;
  title: string;
  topic?: string;
  status?: string;
  aspectRatio: string | null;
  durationSeconds: number | null;
  displayStatus: string;
  videoUrl: string | null;
  thumbnailUrl?: string | null;
  videoObjectKey?: string;
  storageState?: string;
  storageLabel?: string;
  storageDetail?: string;
  isImported: boolean;
  importedVideoId?: string;
  importEligible?: boolean;
  ineligibleReason?: string;
  createdAt: string | null;
  updatedAt: string | null;
  incompleteMetadata?: string[];
  tags?: string[];
  provider?: string;
  workflow?: string;
}

export interface PipelineHealthStatus {
  reachable: boolean;
  status: 'connected' | 'offline' | 'error';
  apiUrl: string;
  totalProjects: number;
  completedJobsCount: number;
  lastChecked: string;
  error?: string;
  errorKind?: PipelineDiscoveryErrorKind;
}

export interface PipelineJobsQueryParams {
  q?: string;
  status?: string;
  aspectRatio?: string;
  importState?: 'all' | 'imported' | 'unimported';
  sort?: 'recent' | 'created' | 'oldest' | 'name';
  limit?: number;
  cursor?: string | null;
}

export interface PipelineJobsPageResponse {
  jobs: DiscoveredPipelineJob[];
  count: number;
  totalMatched?: number;
  page?: {
    limit: number;
    returned: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  sourceContract?: 'library_v1' | 'legacy_jobs' | 'offline' | 'error';
  historyComplete?: boolean;
  incompleteReason?: string;
  discoveryError?: string;
  error?: string;
  errorKind?: PipelineDiscoveryErrorKind;
  health?: PipelineHealthStatus;
}

export interface VideoItem {
  id: string;
  title: string;
  source_type: 'manual_upload' | 'pipeline_import' | 'webhook';
  original_filename: string;
  file_path: string;
  file_size: number;
  duration: number;
  width: number;
  height: number;
  aspect_ratio: string;
  thumbnail_path?: string;
  thumbnailUrl?: string;
  streamUrl?: string;
  pipeline_job_id?: string;
  category_id?: string;
  category_name?: string;
  category_color?: string;
  metadata?: any;
  branded_variants?: BrandedVideo[];
  created_at: string;
}

export interface PublishingDestination {
  content_type?: 'reel' | 'text' | 'image' | 'multi_image' | 'link';
  submission_state?: string | null;
  id: string;
  post_id: string;
  post_title?: string;
  scheduled_at?: string | null;
  account_id: string;
  is_demo?: number;
  account_name: string;
  account_handle: string;
  platform: 'facebook' | 'tiktok';
  avatar_url?: string;
  category_name?: string;
  category_color?: string;
  caption: string;
  hashtags: string;
  apply_branding: number;
  branded_video_path?: string;
  selected_variant_id?: string | null;
  status: 'draft' | 'scheduled' | 'preparing' | 'branding' | 'uploading' | 'awaiting_confirmation' | 'published' | 'failed' | 'cancelled';
  progress: number;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  remote_post_id?: string;
  remote_post_url?: string;
  published_at?: string;
  verification_status: 'unverified' | 'confirmed' | 'failed';
  confirmation_source?: string;
  updated_at: string;
}

export interface PublishingPost {
  content_type?: 'reel' | 'text' | 'image' | 'multi_image' | 'link';
  id: string;
  video_id: string;
  title: string;
  video_title: string;
  aspect_ratio: string;
  duration: number;
  thumbnail_path?: string;
  scheduled_at?: string;
  status: 'draft' | 'scheduled' | 'processing' | 'completed' | 'partial_failure' | 'failed' | 'cancelled';
  selected_variant_id?: string | null;
  destinations: PublishingDestination[];
  created_at: string;
}

export interface CommentItem {
  id: string;
  account_id: string;
  is_demo?: number;
  account_name: string;
  account_handle: string;
  account_avatar?: string;
  category_id?: string;
  category_name?: string;
  category_color?: string;
  platform: 'facebook' | 'tiktok';
  external_comment_id: string;
  parent_comment_id?: string;
  replies?: CommentItem[];
  author_name: string;
  author_avatar?: string;
  content: string;
  created_time: string;
  like_count: number;
  status: 'unread' | 'pending' | 'handled' | 'hidden';
  awaiting_reply: number;
  has_replied: number;
  reply_text?: string;
  reply_id?: string;
  video_title?: string;
  native_url?: string;
  source?: string;
}

export interface VideoPerformanceItem {
  destination_id: string;
  post_id: string;
  video_id: string;
  video_title: string;
  thumbnail_path?: string | null;
  account_id: string;
  account_name: string;
  account_handle: string;
  account_avatar?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  platform: 'facebook' | 'tiktok';
  remote_post_id: string;
  remote_post_url: string;
  published_at?: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  observed_at?: string | null;
  source: string;
  provenance_status: string;
  status_detail?: string | null;
}

export interface SyncState {
  id: string;
  account_id: string;
  target: string;
  last_attempt_at?: string;
  last_success_at?: string;
  status: string;
  error_message?: string;
  records_synced: number;
  updated_at: string;
}

export interface AnalyticsOverviewResponse {
  totals: {
    total_views: number | null;
    total_likes: number | null;
    total_comments: number | null;
    total_shares: number | null;
    total_followers?: number | null;
    total_followers_gained?: number | null;
    total_accounts?: number;
    total_synced_videos?: number;
    avg_engagement_rate?: number;
    last_sync_time?: string | null;
  };
  platformComparison: any[];
  categoryComparison: any[];
  accountRankings: any[];
  dailyTrends: any[];
  videoPerformance: VideoPerformanceItem[];
  syncStates: SyncState[];
  isSimulatedNotice: string;
}

export interface ActivityEvent {
  id: string;
  type: 'publish_success' | 'publish_failure' | 'comment_received' | 'comment_replied' | 'account_alert' | 'viral_spike' | 'system' | string;

  account_id?: string;
  account_name?: string;
  account_platform?: string;
  category_id?: string;
  category_name?: string;
  category_color?: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  created_at: string;
}

export interface AccountsResponse {
  accounts: Account[];
}

export interface CategoriesResponse {
  categories: Category[];
}

export interface VideosResponse {
  videos: VideoItem[];
}

export interface PostsResponse {
  posts: PublishingPost[];
}

export interface QueueResponse {
  queue: PublishingDestination[];
}

export interface CommentsResponse {
  comments: CommentItem[];
  stats?: {
    total: number;
    unread_count: number;
    awaiting_reply_count: number;
  };
}

export interface ActivityResponse {
  events: ActivityEvent[];
}

export interface PipelineStatusResponse {
  health?: PipelineHealthStatus;
  jobs?: DiscoveredPipelineJob[];
  jobsCount?: number;
  totalMatched?: number;
  page?: {
    limit: number;
    returned: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  sourceContract?: 'library_v1' | 'legacy_jobs' | 'offline' | 'error';
  historyComplete?: boolean;
  incompleteReason?: string;
  discoveryError?: string;
  errorKind?: PipelineDiscoveryErrorKind;
  apiUrl?: string;
  watchDir?: string;
  files?: Array<{
    filename: string;
    fullPath: string;
    sizeBytes: number;
    modifiedAt: string;
    isImported: boolean;
    importedVideoId?: string;
  }>;
  fileCount?: number;
  watchIdentityIncomplete?: boolean;
}
