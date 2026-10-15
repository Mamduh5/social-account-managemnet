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

export interface DiscoveredPipelineJob {
  jobId: string;
  title: string;
  aspectRatio: string;
  durationSeconds: number;
  displayStatus: string;
  videoUrl: string;
  videoObjectKey?: string;
  isImported: boolean;
  importedVideoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineHealthStatus {
  reachable: boolean;
  status: 'connected' | 'offline';
  apiUrl: string;
  totalProjects: number;
  completedJobsCount: number;
  lastChecked: string;
  error?: string;
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
  id: string;
  post_id: string;
  post_title?: string;
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
  updated_at: string;
}

export interface PublishingPost {
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
  author_name: string;
  author_avatar?: string;
  content: string;
  created_time: string;
  like_count: number;
  status: 'unread' | 'pending' | 'handled' | 'hidden';
  awaiting_reply: number;
  has_replied: number;
  reply_text?: string;
  video_title?: string;
  native_url?: string;
}

export interface ActivityEvent {
  id: string;
  type: 'publish_success' | 'publish_failure' | 'comment_received' | 'comment_replied' | 'account_alert' | 'viral_spike' | 'system';
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
}
