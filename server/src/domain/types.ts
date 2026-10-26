/**
 * Domain Entities & Value Objects for Social Command Center
 */

export type PlatformType = 'facebook' | 'tiktok';
export type ConnectorMode = 'official_api' | 'browser_bridge' | 'simulator';
export type AccountStatus = 'connected' | 'expired' | 'failed' | 'disconnected';
export type AccountType = 'page' | 'personal' | 'business';

export type PostStatus = 'draft' | 'scheduled' | 'processing' | 'completed' | 'partial_failure' | 'failed';
export type DestinationStatus = 
  | 'scheduled' 
  | 'preparing' 
  | 'branding' 
  | 'uploading' 
  | 'awaiting_confirmation' 
  | 'published' 
  | 'failed' 
  | 'cancelled';

export type WatermarkMovementPreset = 'smooth_sine' | 'corner_jump' | 'diagonal_bounce' | 'static_corner';

export interface SafeAreaConfig {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface BrandKitConfig {
  mode?: import('./branding-layout.js').BrandingMode;
  watermarkType: 'moving_text' | 'static_text' | 'logo_overlay';
  text?: string;
  logoPath?: string;
  movementPreset: WatermarkMovementPreset;
  speedSeconds?: number;
  intervalSeconds?: number;
  fontSize?: number;
  opacity?: number;
  fontColor?: string;
  boxBgColor?: string;
  boxBgOpacity?: number;
  safeArea?: SafeAreaConfig;
  enableSignature?: boolean;
  signatureText?: string;
}

export interface AccountEntity {
  id: string;
  name: string;
  handle: string;
  platform: PlatformType;
  account_type: AccountType;
  category_id: string | null;
  avatar_url: string;
  status: AccountStatus;
  connector_mode: ConnectorMode;
  is_demo?: number;
  archived_at?: string | null;
  public_url?: string;
  description?: string;
  notes?: string;
  identity_verified_at?: string | null;
  connection_status?: string;
  connection_revision?: number;
  granted_scopes_json?: string;
  token_expires_at?: string | null;
  refresh_token?: string | null;
  access_token?: string | null;
  external_id?: string | null;
  brand_kit_json?: string | null;
  settings_json?: string | null;
  health_status: string;
  last_health_check?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryEntity {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  created_at: string;
  account_count?: number;
}

export interface VideoEntity {
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
  thumbnail_path?: string | null;
  pipeline_job_id?: string | null;
  category_id?: string | null;
  metadata_json?: string | null;
  created_at: string;
}

export interface BrandedVideoEntity {
  id: string;
  video_id: string;
  preset_name: string;
  movement_preset: WatermarkMovementPreset;
  watermark_text: string;
  file_path: string;
  file_size: number;
  duration: number;
  width: number;
  height: number;
  aspect_ratio: string;
  thumbnail_path?: string | null;
  brand_kit_json: string;
  sha256?: string | null;
  created_at: string;
}

export interface PublishingPostEntity {
  id: string;
  video_id: string | null;
  content_type?: string;
  title: string;
  scheduled_at?: string | null;
  status: PostStatus;
  selected_variant_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishingDestinationEntity {
  id: string;
  post_id: string;
  account_id: string;
  caption: string;
  hashtags: string;
  apply_branding: number;
  branding_override_json?: string | null;
  branded_video_path?: string | null;
  selected_variant_id?: string | null;
  status: DestinationStatus;
  progress: number;
  remote_post_id?: string | null;
  remote_post_url?: string | null;
  error_message?: string | null;
  retry_count: number;
  max_retries: number;
  published_at?: string | null;
  verification_status?: 'confirmed' | 'unverified' | 'failed' | null;
  last_synced_at?: string | null;
  sync_status?: string | null;
  created_at: string;
  updated_at: string;
}

export type ProvenanceSource = 
  | 'meta_graph_api'
  | 'tiktok_display_api'
  | 'tiktok_accounts_api'
  | 'browser_verified'
  | 'manual_observation'
  | 'simulated';

export type ProvenanceStatus =
  | 'confirmed'
  | 'estimated'
  | 'unavailable'
  | 'auth_required'
  | 'stale';

export interface PostMetricsSnapshot {
  id: string;
  destination_id: string;
  account_id: string;
  platform: PlatformType;
  remote_post_id: string;
  observed_at: string;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  extra_metrics_json?: string | null;
  source: ProvenanceSource;
  provenance_status: ProvenanceStatus;
  status_detail?: string | null;
  created_at: string;
}

export interface AccountMetricsSnapshot {
  id: string;
  account_id: string;
  observed_at: string;
  date: string;
  followers_total: number | null;
  followers_gain: number | null;
  views_total: number | null;
  likes_total: number | null;
  comments_total: number | null;
  shares_total: number | null;
  engagement_rate: number | null;
  following_total?: number | null;
  watch_time_seconds?: number | null;
  source: ProvenanceSource;
  provenance_status: ProvenanceStatus;
  is_simulated: number;
  notes?: string | null;
}

export interface SyncStateEntity {
  id: string;
  account_id: string;
  target: 'metrics' | 'comments' | 'all';
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  status: 'idle' | 'syncing' | 'success' | 'failed' | 'auth_required';
  error_message?: string | null;
  records_synced: number;
  cursor_data?: string | null;
  updated_at: string;
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
  platform: PlatformType;
  remote_post_id: string;
  remote_post_url: string;
  published_at?: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  observed_at?: string | null;
  source: ProvenanceSource;
  provenance_status: ProvenanceStatus;
  status_detail?: string | null;
}

export interface CommentEntity {
  id: string;
  account_id: string;
  destination_id?: string | null;
  platform: PlatformType;
  video_title?: string | null;
  author_name: string;
  author_avatar?: string | null;
  author_id?: string | null;
  content: string;
  status: 'unread' | 'pending' | 'handled' | 'hidden';
  awaiting_reply: number;
  reply_text?: string | null;
  reply_id?: string | null;
  has_replied: number;
  like_count: number;
  created_time: string;
  external_comment_id: string;
  parent_comment_id?: string | null;
  native_url?: string | null;
  source?: ProvenanceSource;
  last_synced_at?: string | null;
  created_at: string;
}

export interface ActivityEventEntity {
  id: string;
  type: string;
  account_id?: string | null;
  category_id?: string | null;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  metadata_json?: string | null;
  created_at: string;
}

