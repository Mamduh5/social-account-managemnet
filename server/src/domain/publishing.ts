/**
 * Domain Logic: Publishing Lifecycle, State Transitions, and Retry Rules
 * Pure functions free of database or Express dependencies.
 */

import { DestinationStatus, PostStatus } from './types.js';

export function resolveParentPostStatus(destinationStatuses: DestinationStatus[]): PostStatus {
  if (destinationStatuses.length === 0) return 'processing';

  const allPublished = destinationStatuses.every((s) => s === 'published');
  if (allPublished) return 'completed';

  const allFailed = destinationStatuses.every((s) => s === 'failed');
  if (allFailed) return 'failed';

  const anyFailed = destinationStatuses.some((s) => s === 'failed');
  const anyProcessing = destinationStatuses.some((s) =>
    ['preparing', 'branding', 'uploading', 'awaiting_confirmation', 'scheduled'].includes(s)
  );

  if (anyFailed && !anyProcessing) {
    return 'partial_failure';
  }

  return 'processing';
}

export function canRetryDestination(status: DestinationStatus, retryCount: number, maxRetries: number = 3): boolean {
  if (!['failed', 'cancelled'].includes(status)) return false;
  return retryCount <= maxRetries;
}

export function canCancelDestination(status: DestinationStatus): boolean {
  return ['scheduled', 'preparing', 'branding'].includes(status);
}
