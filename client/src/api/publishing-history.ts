import type { PublishingDestination } from '../types';
import { request, ApiError } from './http';
import type { HistoryPeriod, HistoryTimestamp } from '../../../server/src/domain/publishing-history';
export type { HistoryPeriod, HistoryTimestamp };
export interface HistoryFilters {
  timestamp: HistoryTimestamp;
  direction: 'desc' | 'asc';
  period: HistoryPeriod;
  date: string;
  fromDate: string;
  toDate: string;
  outcome: 'all' | 'completed' | 'failed';
  status: string;
  platform: '' | 'facebook' | 'tiktok';
  limit: number;
}
export interface HistoryPage {
  items: PublishingDestination[];
  total: number; limit: number; offset: number; hasMore: boolean;
  timestamp: HistoryTimestamp; direction: 'asc' | 'desc'; startAt: string | null; endAt: string | null;
}
export interface ActiveQueuePage { queue: PublishingDestination[]; total: number; limit: number; hasMore: boolean }
export const publishingHistoryApi = {
  async history(filters: HistoryFilters, offset: number, signal?: AbortSignal): Promise<HistoryPage> {
    const query = new URLSearchParams({ ...filters, limit: String(filters.limit), offset: String(offset) });
    const result = await request<HistoryPage>(`/api/publishing/history?${query}`, { signal });
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0 || !Number.isInteger(result.limit) || !Number.isInteger(result.offset)) throw new ApiError('Publishing history returned an incomplete response. Retry the read.',200);
    return result;
  },
  async active(signal?: AbortSignal): Promise<ActiveQueuePage> {
    const result = await request<ActiveQueuePage>('/api/publishing/queue/active', { signal });
    if (!Array.isArray(result.queue) || !Number.isSafeInteger(result.total) || result.total < 0) throw new ApiError('The active queue returned an incomplete response. Retry the read.',200);
    return result;
  },
};
