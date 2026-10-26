import { randomUUID } from 'node:crypto';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { validatePublishedUrl } from '../domain/account-identity.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { canCancelDestination, canRetryDestination, resolveParentPostStatus } from '../domain/publishing.js';
import { PostStatus, DestinationStatus } from '../domain/types.js';

export interface CreatePostDestinationInput {
  accountId: string;
  caption?: string;
  hashtags?: string;
  applyBranding?: boolean;
  brandingOverride?: any;
  selectedVariantId?: string | null;
}

export interface CreatePostInput {
  videoId: string;
  title: string;
  scheduledAt?: string | null;
  selectedVariantId?: string | null;
  destinations: CreatePostDestinationInput[];
}

export class PublishingService {
  createPost(input: CreatePostInput): { postId: string; destinationCount: number } {
    const { videoId, title, selectedVariantId, destinations } = input;
    let scheduledAt: string | null = null;
    if (input.scheduledAt !== undefined && input.scheduledAt !== null) {
      if (typeof input.scheduledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.scheduledAt))
        throw new Error('Scheduled time must be an ISO date with an explicit timezone.');
      const timestamp = Date.parse(input.scheduledAt);
      if (!Number.isFinite(timestamp) || timestamp <= Date.now())
        throw new Error('Scheduled time must be a valid future date.');
      scheduledAt = new Date(timestamp).toISOString();
    }

    if (!videoId || !title || !destinations || !Array.isArray(destinations) || destinations.length === 0) {
      throw new Error('Video, Title, and at least one destination account are required.');
    }

    const video = publishingRepo.getVideoById(videoId);
    if (!video) {
      throw new Error('Video not found');
    }

    const postId = `post-${randomUUID()}`;
    const isScheduled = !!scheduledAt;
    const initialPostStatus: PostStatus = isScheduled ? 'scheduled' : 'processing';
    const initialDestStatus: DestinationStatus = isScheduled ? 'scheduled' : 'preparing';

    if (new Set(destinations.map(d => d.accountId)).size !== destinations.length) throw new Error('Select each destination only once');
    const mappedDestinations = destinations.map((dest) => {
      const account = accountsRepo.getAccountById(dest.accountId) as any;
      if (!account || account.archived_at) throw new Error('Select an active registered account');
      const variantId = dest.selectedVariantId !== undefined 
        ? dest.selectedVariantId 
        : (selectedVariantId || null);

      let brandedVideoPath: string | null = null;
      let applyBranding = dest.applyBranding !== undefined ? (dest.applyBranding ? 1 : 0) : 1;

      if (variantId && variantId !== 'original') {
        const variant = publishingRepo.getBrandedVideoById(variantId);
        if (!variant || variant.video_id !== videoId) throw new Error('Branded variant does not belong to the selected master video');
        if (variant) {
          brandedVideoPath = variant.file_path;
          applyBranding = 0; // Pre-rendered branded variant selected; no need to re-render in worker
        }
      } else if (variantId === 'original') {
        brandedVideoPath = null;
        applyBranding = 0; // Explicitly unbranded master
      }

      return {
        id: `dest-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        accountId: dest.accountId,
        caption: dest.caption ?? title,
        hashtags: dest.hashtags || '',
        applyBranding,
        brandingOverrideJson: dest.brandingOverride ? JSON.stringify(dest.brandingOverride) : null,
        brandedVideoPath,
        selectedVariantId: variantId,
        status: initialDestStatus,
      };
    });

    publishingRepo.createPostWithDestinations({
      postId,
      videoId,
      title,
      scheduledAt,
      postStatus: initialPostStatus,
      selectedVariantId: selectedVariantId || null,
      destinations: mappedDestinations,
    });

    return { postId, destinationCount: mappedDestinations.length };
  }

  retryDestination(destinationId: string): void {
    const dest = publishingRepo.getDestinationById(destinationId);
    if (!dest) {
      throw new Error('Destination not found');
    }

    if ((dest as any).submission_state) throw new Error('Remote outcome requires read-only reconciliation before retry');
    const account = accountsRepo.getAccountById(dest.account_id) as any;
    if (!account?.is_demo && dest.remote_post_id && dest.status !== 'published')
      throw new Error('Reconcile the existing remote upload before retrying this destination.');

    const interrupted = dest.status === 'preparing' && dest.error_message?.startsWith('Interrupted by server restart');
    if (!interrupted && !canRetryDestination(dest.status, dest.retry_count, dest.max_retries)) {
      throw new Error(`Destination cannot be retried from status: ${dest.status}`);
    }

    publishingRepo.retryDestination(destinationId, 0);
    publishingRepo.updateParentPostStatus(dest.post_id, 'processing');
  }

  cancelDestination(destinationId: string): boolean {
    const dest = publishingRepo.getDestinationById(destinationId);
    if (!dest) return false;

    if (!canCancelDestination(dest.status)) {
      return false;
    }

    const changes = publishingRepo.cancelDestination(destinationId);
    if (changes > 0) {
      const remainingDests = publishingRepo.getDestinationsByPostId(dest.post_id);
      const newParentStatus = resolveParentPostStatus(remainingDests.map((d) => d.status));
      publishingRepo.updateParentPostStatus(dest.post_id, newParentStatus);
      return true;
    }
    return false;
  }

  confirmAssistedPublish(destinationId: string, remotePostUrl?: string, remotePostId?: string, confirmedAccountId?: string): void {
    const dest = publishingRepo.getDestinationById(destinationId);
    if (!dest) {
      throw new Error('Destination not found');
    }

    if (dest.status !== 'awaiting_confirmation') throw new Error('Only a destination awaiting manual confirmation can be confirmed');
    const account = accountsRepo.getAccountById(dest.account_id) as any;
    if (!account || account.archived_at || confirmedAccountId !== account.id) throw new Error('Confirm the exact destination account');
    if (!remotePostUrl) throw new Error('Published post URL is required');
    const url = validatePublishedUrl(account.platform, remotePostUrl);
    if (account.platform === 'tiktok' && new URL(url).pathname.split('/')[1].toLowerCase() !== account.handle.toLowerCase()) throw new Error('Published URL belongs to a different TikTok account');
    publishingRepo.markDestinationPublished({
      destinationId,
      remotePostId: remotePostId || `bridge-manual-${Date.now()}`,
      remotePostUrl: url,
      verificationStatus: 'confirmed',
      confirmationSource: 'manual',
    });

    const remainingDests = publishingRepo.getDestinationsByPostId(dest.post_id);
    const newParentStatus = resolveParentPostStatus(remainingDests.map((d) => d.status));
    publishingRepo.updateParentPostStatus(dest.post_id, newParentStatus);
  }
}

export const publishingService = new PublishingService();
