import { publishingRepo } from '../repositories/publishing.repo.js';
import { canCancelDestination, canRetryDestination, resolveParentPostStatus } from '../domain/publishing.js';
import { PostStatus, DestinationStatus } from '../domain/types.js';

export interface CreatePostDestinationInput {
  accountId: string;
  caption?: string;
  hashtags?: string;
  applyBranding?: boolean;
  brandingOverride?: any;
}

export interface CreatePostInput {
  videoId: string;
  title: string;
  scheduledAt?: string | null;
  destinations: CreatePostDestinationInput[];
}

export class PublishingService {
  createPost(input: CreatePostInput): { postId: string; destinationCount: number } {
    const { videoId, title, scheduledAt, destinations } = input;

    if (!videoId || !title || !destinations || !Array.isArray(destinations) || destinations.length === 0) {
      throw new Error('Video, Title, and at least one destination account are required.');
    }

    const video = publishingRepo.getVideoById(videoId);
    if (!video) {
      throw new Error('Video not found');
    }

    const postId = `post-${Date.now().toString(36)}`;
    const isScheduled = !!scheduledAt;
    const initialPostStatus: PostStatus = isScheduled ? 'scheduled' : 'processing';
    const initialDestStatus: DestinationStatus = isScheduled ? 'scheduled' : 'preparing';

    const mappedDestinations = destinations.map((dest) => ({
      id: `dest-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      accountId: dest.accountId,
      caption: dest.caption || title,
      hashtags: dest.hashtags || '',
      applyBranding: dest.applyBranding !== undefined ? (dest.applyBranding ? 1 : 0) : 1,
      brandingOverrideJson: dest.brandingOverride ? JSON.stringify(dest.brandingOverride) : null,
      status: initialDestStatus,
    }));

    publishingRepo.createPostWithDestinations({
      postId,
      videoId,
      title,
      scheduledAt,
      postStatus: initialPostStatus,
      destinations: mappedDestinations,
    });

    return { postId, destinationCount: mappedDestinations.length };
  }

  retryDestination(destinationId: string): void {
    const dest = publishingRepo.getDestinationById(destinationId);
    if (!dest) {
      throw new Error('Destination not found');
    }

    if (!canRetryDestination(dest.status, dest.retry_count, dest.max_retries)) {
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

  confirmAssistedPublish(destinationId: string, remotePostUrl?: string, remotePostId?: string): void {
    const dest = publishingRepo.getDestinationById(destinationId);
    if (!dest) {
      throw new Error('Destination not found');
    }

    publishingRepo.markDestinationPublished({
      destinationId,
      remotePostId: remotePostId || `bridge-manual-${Date.now()}`,
      remotePostUrl: remotePostUrl || 'https://facebook.com',
      verificationStatus: 'confirmed',
    });

    const remainingDests = publishingRepo.getDestinationsByPostId(dest.post_id);
    const newParentStatus = resolveParentPostStatus(remainingDests.map((d) => d.status));
    publishingRepo.updateParentPostStatus(dest.post_id, newParentStatus);
  }
}

export const publishingService = new PublishingService();
