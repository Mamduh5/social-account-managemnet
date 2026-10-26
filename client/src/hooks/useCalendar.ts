import { useState, useEffect, useCallback } from 'react';
import {
  CalendarHealth,
  CalendarItem,
  CampaignPlanInput,
  CampaignSummary,
} from '../types/calendar';
import { calendarApi } from '../api/calendar';

export function useCalendar(initialAccountId?: string) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [health, setHealth] = useState<CalendarHealth | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId || '');
  const [selectedDays, setSelectedDays] = useState<7 | 14 | 30>(7);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAccountId && initialAccountId) setSelectedAccountId(initialAccountId);
  }, [initialAccountId, selectedAccountId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, campaignsRes, itemsRes] = await Promise.all([
        calendarApi.getHealth().catch(() => null),
        calendarApi.getCampaigns(selectedAccountId || undefined).catch(() => ({ campaigns: [] })),
        calendarApi.getItems({
          accountId: selectedAccountId || undefined,
          days: selectedDays,
        }).catch(() => ({ items: [] })),
      ]);

      setHealth(healthRes);
      setCampaigns(campaignsRes.campaigns);
      setItems(itemsRes.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load content calendar');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, selectedDays]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApproveCampaign = async (campaignId: string, review:{accountId:string;expectedHash:string}) => {
    setActionLoading(true);
    setError(null);
    try {
      await calendarApi.approveCampaign(campaignId,review);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to approve campaign');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await calendarApi.pauseCampaign(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to pause campaign');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await calendarApi.resumeCampaign(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to resume campaign');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublishNow = async (itemId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await calendarApi.publishNow(itemId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to immediately publish item');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelItem = async (itemId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await calendarApi.cancelItem(itemId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel item');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditItem = async (
    itemId: string,
    updates: { caption?: string; hashtags?: string; scheduledAt?: string; linkUrl?: string }
  ) => {
    setActionLoading(true);
    setError(null);
    try {
      await calendarApi.editItem(itemId, updates);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to edit calendar item');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePlan = async (plan: CampaignPlanInput) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await calendarApi.createPlan(plan);
      await loadData();
      return res;
    } catch (err: any) {
      setError(err.message || 'Failed to create campaign plan');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  return {
    items,
    campaigns,
    health,
    selectedAccountId,
    setSelectedAccountId,
    selectedDays,
    setSelectedDays,
    loading,
    actionLoading,
    error,
    setError,
    refresh: loadData,
    approveCampaign: handleApproveCampaign,
    pauseCampaign: handlePauseCampaign,
    resumeCampaign: handleResumeCampaign,
    publishNow: handlePublishNow,
    cancelItem: handleCancelItem,
    editItem: handleEditItem,
    createPlan: handleCreatePlan,
  };
}
