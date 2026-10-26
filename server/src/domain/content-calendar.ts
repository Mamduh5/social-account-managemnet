import { z } from 'zod';
import { createHash } from 'node:crypto';
import { postTypes, publicLink, type ContentType } from './general-posts.js';

export const planOrigins = ['manual', 'gemini_prepared'] as const;
export type PlanOrigin = typeof planOrigins[number];

export const campaignStatuses = [
  'draft',
  'awaiting_approval',
  'approved',
  'active',
  'paused',
  'completed',
  'cancelled',
] as const;
export type CampaignStatus = typeof campaignStatuses[number];

export const calendarItemStatuses = [
  'draft',
  'awaiting_approval',
  'approved',
  'scheduled',
  'preparing',
  'branding',
  'uploading',
  'awaiting_confirmation',
  'published',
  'failed',
  'cancelled',
  'paused',
] as const;
export type CalendarItemStatus = typeof calendarItemStatuses[number];

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
  contentType: ContentType;
  title: string;
  caption: string;
  hashtags: string;
  linkUrl?: string | null;
  media: Array<{
    id: string;
    mediaId?: string;
    url?: string;
    previewUrl?: string;
    thumbnailUrl?: string;
    altText?: string;
    mimeType?: string;
  }>;
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

export const planItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'Title is required').max(300),
  contentType: z.enum(postTypes),
  caption: z.string().max(60000).default(''),
  hashtags: z.string().max(2000).default(''),
  linkUrl: z.string().max(2048).optional(),
  attachments: z
    .array(
      z.object({
        mediaId: z.string().min(1),
        altText: z.string().max(1000).default(''),
      })
    )
    .max(10)
    .default([]),
  videoId: z.string().optional(),
  scheduledAt: z.string().min(1, 'Scheduled publication time is required'),
});
export type PlanItemInput = z.infer<typeof planItemSchema>;

export const campaignPlanSchema = z.object({
  id: z.string().optional(),
  accountId: z.string().min(1, 'Destination account ID is required'),
  name: z.string().trim().min(1, 'Campaign name is required').max(200),
  editorialScope: z.string().max(4000).default(''),
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(7),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').refine(value => Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value, 'Start date is invalid'),
  origin: z.enum(planOrigins).default('manual'),
  maxPublications: z.number().int().min(1).max(50).default(30),
  items: z.array(planItemSchema).min(1, 'Plan must contain at least one post').max(50),
});
export type CampaignPlanInput = z.infer<typeof campaignPlanSchema>;

/** Formats an ISO timestamp or date into Bangkok (UTC+7) representation */
export function formatBangkokDateTime(dateInput: string | Date | null | undefined): string | null {
  if (!dateInput) return null;
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(d.getTime())) return null;
  // Bangkok is UTC+7
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d).replace(',', '');
}

/** Parses Bangkok wall time or ISO string and returns UTC ISO string with validation */
export function parseBangkokScheduledTime(input: string): string {
  if (!input || typeof input !== 'string') throw new Error('Scheduled time is required');
  const explicit = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input);
  const wall = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(input);
  const day = input.slice(0, 10), parts = input.slice(11).match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  const validDay = Number.isFinite(Date.parse(day + 'T00:00:00Z')) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
  if ((!explicit && !wall) || !validDay || !parts || Number(parts[1]) > 23 || Number(parts[2]) > 59 || Number(parts[3] || 0) > 59) {
    throw new Error('Scheduled time is invalid. Provide an explicit ISO or Asia/Bangkok datetime.');
  }
  const parsed = new Date(wall ? input.replace(' ', 'T') + '+07:00' : input);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Scheduled time is invalid.');
  return parsed.toISOString();
}

/** Validates and normalizes campaign plan items */
export function normalizePlanItems(
  items: PlanItemInput[],
  accountId: string,
  now = Date.now()
): Array<PlanItemInput & { scheduledAtUtc: string }> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Campaign plan must have at least one post item');
  }

  const normalized: Array<PlanItemInput & { scheduledAtUtc: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const utcIso = parseBangkokScheduledTime(item.scheduledAt);

    // Validate type requirements
    if (item.contentType === 'text' && !item.caption.trim()) {
      throw new Error(`Item ${i + 1} (${item.title}): Text post requires non-empty caption`);
    }
    if (item.contentType === 'link') {
      if (!item.linkUrl) throw new Error(`Item ${i + 1} (${item.title}): Link post requires a link URL`);
      item.linkUrl = publicLink(item.linkUrl);
    }
    if (item.contentType === 'image' && item.attachments?.length !== 1) {
      throw new Error(`Item ${i + 1} (${item.title}): Image post requires exactly 1 image attachment`);
    }
    if (item.contentType === 'multi_image') {
      if (!item.attachments || item.attachments.length < 2 || item.attachments.length > 10) {
        throw new Error(`Item ${i + 1} (${item.title}): Multi-image post requires between 2 and 10 images`);
      }
    }
    if (item.contentType === 'reel' && !item.videoId) {
      throw new Error(`Item ${i + 1} (${item.title}): Reel requires a selected video`);
    }

    normalized.push({
      ...item,
      scheduledAtUtc: utcIso,
    });
  }

  return normalized;
}

/**
 * Calculates a cryptographic SHA-256 fingerprint of the campaign approval batch.
 * Binds:
 * - exact destination account ID
 * - items in deterministic order (draft ID / post ID, revision, payload hash, scheduled time, attachments)
 * Any material edit to any post in the campaign breaks the hash and invalidates approval.
 */
export function calculateCampaignApprovalHash(params: {
  campaignId: string;
  accountId: string;
  items: Array<{
    id: string;
    revision: number;
    payloadHash: string;
    scheduledAt: string;
  }>;
}): string {
  const sorted = [...params.items].sort((a, b) => a.id.localeCompare(b.id));
  const payload = {
    campaignId: params.campaignId,
    accountId: params.accountId,
    items: sorted.map((item) => ({
      id: item.id,
      revision: item.revision,
      hash: item.payloadHash,
      scheduledAt: item.scheduledAt,
    })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
