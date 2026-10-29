import {
  CalendarHealth,
  CalendarItem,
  CampaignPlanInput,
  CampaignSummary,
  CampaignReview,
} from '../types/calendar';

import { request as httpRequest } from './http';
const BASE_URL = '/api/calendar';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return httpRequest<T>(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

}

export const calendarApi = {
  getHealth(): Promise<CalendarHealth> {
    return request<CalendarHealth>('/health');
  },

  getCampaigns(accountId?: string): Promise<{ campaigns: CampaignSummary[] }> {
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    return request<{ campaigns: CampaignSummary[] }>(`/campaigns${q}`);
  },

  getCampaignById(id: string): Promise<{ campaign: CampaignSummary }> {
    return request<{ campaign: CampaignSummary }>(`/campaigns/${encodeURIComponent(id)}`);
  },

  getItems(filter?: {
    accountId?: string;
    campaignId?: string;
    days?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{ items: CalendarItem[] }> {
    const params = new URLSearchParams();
    if (filter?.accountId) params.set('accountId', filter.accountId);
    if (filter?.campaignId) params.set('campaignId', filter.campaignId);
    if (filter?.days) params.set('days', String(filter.days));
    if (filter?.startDate) params.set('startDate', filter.startDate);
    if (filter?.endDate) params.set('endDate', filter.endDate);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<{ items: CalendarItem[] }>(`/items${qs}`);
  },

  createPlan(
    plan: CampaignPlanInput
  ): Promise<{ campaign: CampaignSummary; items: CalendarItem[] }> {
    return request<{ campaign: CampaignSummary; items: CalendarItem[] }>('/plan', {
      method: 'POST',
      body: JSON.stringify(plan),
    });
  },

  submitForApproval(campaignId: string): Promise<{ campaign: CampaignSummary }> {
    return request<{ campaign: CampaignSummary }>(
      `/campaigns/${encodeURIComponent(campaignId)}/submit-for-approval`,
      { method: 'POST' }
    );
  },

  approveCampaign(
    campaignId: string,
    review: {accountId:string;expectedHash:string}
  ): Promise<{ campaign: CampaignSummary; queuedCount: number; approvedHash: string }> {
    return request<{ campaign: CampaignSummary; queuedCount: number; approvedHash: string }>(
      `/campaigns/${encodeURIComponent(campaignId)}/approve`,
      { method: 'POST',body:JSON.stringify(review) }
    );
  },

  getCampaignReview(campaignId:string):Promise<CampaignReview>{return request<CampaignReview>(`/campaigns/${encodeURIComponent(campaignId)}/review`);},

  pauseCampaign(campaignId: string): Promise<{ campaign: CampaignSummary }> {
    return request<{ campaign: CampaignSummary }>(
      `/campaigns/${encodeURIComponent(campaignId)}/pause`,
      { method: 'POST' }
    );
  },

  resumeCampaign(campaignId: string): Promise<{ campaign: CampaignSummary }> {
    return request<{ campaign: CampaignSummary }>(
      `/campaigns/${encodeURIComponent(campaignId)}/resume`,
      { method: 'POST' }
    );
  },

  publishNow(itemId: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(
      `/items/${encodeURIComponent(itemId)}/publish-now`,
      { method: 'POST' }
    );
  },

  editItem(
    itemId: string,
    updates: { caption?: string; hashtags?: string; scheduledAt?: string; linkUrl?: string }
  ): Promise<{ item: CalendarItem }> {
    return request<{ item: CalendarItem }>(`/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  cancelItem(itemId: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    });
  },
};
