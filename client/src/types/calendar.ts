import { PostContentType } from './general-posts';

export type PlanOrigin = 'manual' | 'gemini_prepared';

export type CampaignStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type CalendarItemStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'scheduled'
  | 'preparing'
  | 'branding'
  | 'uploading'
  | 'awaiting_confirmation'
  | 'published'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface CalendarMediaItem {
  id: string;
  mediaId?: string;
  url?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  altText?: string;
  mimeType?: string;
}

export interface CalendarItem {
  id: string;
  sourceType: 'draft' | 'destination';
  draftId: string | null;
  postId: string | null;
  destinationId: string | null;
  accountId: string;
  accountName: string;
  accountHandle: string;
  platform: 'facebook' | 'tiktok';
  avatarUrl?: string | null;
  contentType: PostContentType;
  title: string;
  caption: string;
  hashtags: string;
  linkUrl?: string | null;
  media: CalendarMediaItem[];
  videoId?: string | null;
  videoTitle?: string | null;
  thumbnailUrl?: string | null;
  scheduledAt: string | null;
  scheduledAtBangkok: string | null;
  origin: PlanOrigin;
  status: CalendarItemStatus;
  revision: number;
  approvedRevision?: number | null;
  campaignId?: string | null;
  campaignName?: string | null;
  receipt?: {
    remotePostId?: string | null;
    remotePostUrl?: string | null;
    publishedAt?: string | null;
    confirmationSource?: string | null;
    verificationStatus?: string | null;
  };
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  approvalDetails?: unknown;
}

export interface CampaignReview {
  campaign: CampaignSummary;
  account: {id:string;name:string;handle:string;graphId?:string|null};
  items: CalendarItem[];
  expectedApprovalHash: string;
}

export interface CampaignSummary {
  id: string;
  accountId: string;
  accountName: string;
  accountHandle: string;
  platform: 'facebook' | 'tiktok';
  name: string;
  editorialScope: string;
  startDate: string;
  endDate: string;
  days: number;
  maxPublications: number;
  status: CampaignStatus;
  origin: PlanOrigin;
  approvedRevision: number | null;
  approvedHash: string | null;
  approvedAt: string | null;
  itemsCount: number;
  publishedCount: number;
  scheduledCount: number;
  draftCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanItemInput {
  id?: string;
  title: string;
  contentType: PostContentType;
  caption: string;
  hashtags?: string;
  linkUrl?: string;
  attachments?: Array<{ mediaId: string; altText?: string }>;
  videoId?: string;
  selectedVariantId?: string | null;
  applyBranding?: boolean;
  scheduledAt: string;
}

export interface CampaignPlanInput {
  id?: string;
  accountId: string;
  name: string;
  editorialScope?: string;
  days: 7 | 14 | 30;
  startDate: string;
  origin?: PlanOrigin;
  maxPublications?: number;
  items: PlanItemInput[];
}

export interface CalendarHealth {
  status: string;
  timezone: string;
  currentTimeUtc: string;
  currentTimeBangkok: string | null;
  activeJobs: number;
  scheduledJobs: number;
  pausedCampaignsCount: number;
  stuckJobsCount: number;
  offlineNotice: string;
}
