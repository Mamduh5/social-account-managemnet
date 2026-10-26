import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Sparkles,
  User,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  ExternalLink,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Edit3,
  Layers,
  Image as ImageIcon,
  FileText,
  Link as LinkIcon,
  Film,
  Info,
  ShieldAlert,
  ChevronRight,
  X,
} from 'lucide-react';
import { useCalendar } from '../hooks/useCalendar';
import { useAccounts } from '../hooks/useAccounts';
import {
  CalendarItem,
  CampaignPlanInput,
  CampaignSummary,
  PlanItemInput,
  CampaignReview,
} from '../types/calendar';
import { PostContentType } from '../types/general-posts';
import { calendarApi } from '../api/calendar';

interface Props {
  selectedCategory?: string;
}

export const CalendarView: React.FC<Props> = () => {
  const { accounts } = useAccounts();
  const facebookPages = accounts.filter(
    (a) => !a.archived_at && a.platform === 'facebook' && a.account_type === 'page'
  );

  const defaultPage = facebookPages[0];

  const {
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
    refresh,
    approveCampaign,
    pauseCampaign,
    resumeCampaign,
    publishNow,
    cancelItem,
    editItem,
    createPlan,
  } = useCalendar(defaultPage?.id);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [reviewingCampaignId,setReviewingCampaignId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<CalendarItem | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [editTime, setEditTime] = useState('');
  const [activeTab, setActiveTab] = useState<'calendar' | 'campaigns'>('calendar');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');

  // Active target account
  const currentAccount = accounts.find((a) => a.id === (selectedAccountId || defaultPage?.id));

  // Active campaign for selected account
  const activeCampaign = useMemo(() => {
    const selected = campaigns.find(c => c.id === selectedCampaignId && c.accountId === (selectedAccountId || defaultPage?.id));
    if (selected) return selected;
    return campaigns.find(
      (c) =>
        c.accountId === (selectedAccountId || defaultPage?.id) &&
        ['draft', 'awaiting_approval', 'active', 'paused'].includes(c.status)
    );
  }, [campaigns, selectedAccountId, defaultPage?.id, selectedCampaignId]);

  // Group items by Bangkok date string (YYYY-MM-DD)
  const groupedByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();

    // Generate day buckets for the selected range (7, 14, 30 days)
    const now = new Date();
    for (let i = 0; i < selectedDays; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      map.set(dateKey, []);
    }

    // Place items in corresponding buckets
    for (const item of items) {
      if (selectedCampaignId && activeCampaign?.id === selectedCampaignId && item.campaignId !== selectedCampaignId) continue;
      let dateKey = 'Unscheduled';
      if (item.scheduledAt) {
        dateKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(item.scheduledAt));
      }
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(item);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items, selectedDays, selectedCampaignId, activeCampaign?.id]);

  const handleOpenEdit = (item: CalendarItem) => {
    setEditingItem(item);
    setEditCaption(item.caption);
    setEditHashtags(item.hashtags);
    setEditTime(item.scheduledAtBangkok || '');
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      await editItem(editingItem.id, {
        caption: editCaption,
        hashtags: editHashtags,
        scheduledAt: editTime || undefined,
      });
      setEditingItem(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save changes');
    }
  };

  const getContentTypeIcon = (type: PostContentType) => {
    switch (type) {
      case 'text':
        return <FileText className="w-3.5 h-3.5 text-blue-400" />;
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
      case 'multi_image':
        return <Layers className="w-3.5 h-3.5 text-purple-400" />;
      case 'link':
        return <LinkIcon className="w-3.5 h-3.5 text-amber-400" />;
      case 'reel':
        return <Film className="w-3.5 h-3.5 text-rose-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Published
          </span>
        );
      case 'scheduled':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Scheduled
          </span>
        );
      case 'paused':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30 flex items-center gap-1">
            <Pause className="w-3 h-3" /> Paused
          </span>
        );
      case 'approved':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            Approved
          </span>
        );
      case 'awaiting_approval':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Awaiting Approval
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-600/30 text-slate-400 border border-slate-600/30">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Range Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-terracotta-500/20 text-terracotta-400 flex items-center justify-center">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Content Calendar & Planner
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-terracotta-500/15 text-terracotta-300 border border-terracotta-500/30">
                  V1.11
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Plan, review, batch-approve and schedule multi-day publications for authorized Pages.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Target Account Selector */}
          <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-400">Page:</span>
            <select
              aria-label="Calendar Page"
              value={selectedAccountId || defaultPage?.id || ''}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-transparent font-semibold text-slate-200 outline-none cursor-pointer"
            >
              {facebookPages.map((page) => (
                <option key={page.id} value={page.id} className="bg-surface text-slate-200">
                  {page.name} ({page.handle})
                </option>
              ))}
            </select>
          </div>

          {/* Days Range Selector */}
          <div className="flex items-center bg-surface border border-border rounded-xl p-0.5 text-xs font-semibold">
            <button
              onClick={() => setSelectedDays(7)}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                selectedDays === 7 ? 'bg-terracotta-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setSelectedDays(14)}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                selectedDays === 14 ? 'bg-terracotta-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              14 Days
            </button>
            <button
              onClick={() => setSelectedDays(30)}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                selectedDays === 30 ? 'bg-terracotta-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              30 Days
            </button>
          </div>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3.5 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-terracotta-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            New Campaign Plan
          </button>
          <button onClick={()=>setImportModalOpen(true)} disabled={!currentAccount} className="px-3.5 py-1.5 bg-surface hover:bg-surface-hover border border-border text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <Sparkles className="w-3.5 h-3.5" /> Import Prepared Plan
          </button>

          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 bg-surface hover:bg-surface-hover border border-border text-slate-300 rounded-xl cursor-pointer"
            title="Refresh Calendar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scheduler Health & Offline Limitation Notice */}
      <div className="bg-surface/70 border border-border rounded-2xl p-4 space-y-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-slate-200">Scheduler Operational (Local PC Loopback)</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-honey-400" />
              Bangkok Time: <strong className="text-slate-100">{health?.currentTimeBangkok || 'Synchronizing...'}</strong>
            </span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-3">
            <span>Scheduled: <strong className="text-slate-200">{health?.scheduledJobs ?? 0}</strong></span>
            <span>Active: <strong className="text-slate-200">{health?.activeJobs ?? 0}</strong></span>
            <span>Paused Campaigns: <strong className="text-slate-200">{health?.pausedCampaignsCount ?? 0}</strong></span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span>
            {health?.offlineNotice ||
              'Scheduled jobs require the local machine to be awake. Overdue jobs are held safely for explicit review on startup rather than flooded.'}
          </span>
        </p>
      </div>

      {/* Campaign Approval & Status Banner */}
      {campaigns.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Campaign to review
          <select aria-label="Campaign to review" value={campaigns.some(c=>c.id===selectedCampaignId) ? selectedCampaignId : ''} onChange={e=>setSelectedCampaignId(e.target.value)} className="bg-surface border border-border rounded-xl p-2 text-slate-200">
            <option value="">All Page items</option>
            {campaigns.filter(c=>c.accountId===(selectedAccountId || defaultPage?.id)).map(c=><option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
          </select>
        </label>
      )}
      {activeCampaign ? (
        <div className="bg-surface-card border border-border/80 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Active Campaign:</span>
                <h3 className="text-sm font-bold text-slate-100">{activeCampaign.name}</h3>
                {getStatusBadge(activeCampaign.status)}
                <span className="text-[10px] px-2 py-0.5 rounded bg-surface text-slate-400 border border-border">
                  {activeCampaign.origin === 'gemini_prepared' ? '✨ Prepared externally' : '👤 Manual'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Page: <strong className="text-slate-200">{activeCampaign.accountName} ({activeCampaign.accountHandle})</strong> •{' '}
                {activeCampaign.days}-Day Plan ({activeCampaign.startDate} to {activeCampaign.endDate}) •{' '}
                {activeCampaign.itemsCount} total posts ({activeCampaign.publishedCount} published,{' '}
                {activeCampaign.scheduledCount} scheduled, {activeCampaign.draftCount} drafts)
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Approval schedules this Page's exact saved captions, media and times, up to {activeCampaign.maxPublications} publications. Other Pages remain independent.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {['draft', 'awaiting_approval'].includes(activeCampaign.status) && (
                <button
                  onClick={() => setReviewingCampaignId(activeCampaign.id)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Entire Campaign (Batch)
                </button>
              )}

              {activeCampaign.status === 'active' && (
                <button
                  onClick={() => pauseCampaign(activeCampaign.id)}
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause Campaign
                </button>
              )}

              {activeCampaign.status === 'paused' && (
                <button
                  onClick={() => resumeCampaign(activeCampaign.id)}
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume Campaign
                </button>
              )}
            </div>
          </div>

          {activeCampaign.approvedHash && (
            <div className="text-[10px] text-slate-400 bg-background/50 border border-border/50 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
              <span>
                Cryptographic Approval Binding:{' '}
                <code className="text-slate-300 font-mono">{activeCampaign.approvedHash.slice(0, 24)}...</code>
              </span>
              <span className="text-slate-400">
                Material edits automatically invalidate this approval.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface/50 border border-dashed border-border rounded-2xl p-4 text-center text-xs text-slate-400 flex items-center justify-between">
          <span>No active multi-day campaign plan for this Page. Create a plan to schedule 7 to 30 days in one action.</span>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3 py-1 bg-surface hover:bg-surface-hover text-slate-200 border border-border rounded-lg text-xs font-semibold cursor-pointer"
          >
            Create Plan
          </button>
        </div>
      )}

      {/* Calendar Days Timeline Grid */}
      <div className="space-y-4">
        {groupedByDay.map(([dayDate, dayItems]) => {
          const isToday =
            dayDate ===
            new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Bangkok',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date());

          return (
            <div
              key={dayDate}
              className={`border rounded-2xl p-4 transition-all ${
                isToday
                  ? 'bg-surface/90 border-terracotta-500/40 shadow-sm'
                  : 'bg-surface/40 border-border/70 hover:border-border'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      isToday
                        ? 'bg-terracotta-500 text-white'
                        : 'bg-surface text-slate-300 border border-border'
                    }`}
                  >
                    {dayDate}
                  </span>
                  {isToday && (
                    <span className="text-[10px] text-terracotta-300 font-semibold uppercase tracking-wider">
                      Today (Bangkok)
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  {dayItems.length === 0 ? 'No posts planned' : `${dayItems.length} post${dayItems.length > 1 ? 's' : ''}`}
                </span>
              </div>

              {/* Day Posts */}
              {dayItems.length === 0 ? (
                <div className="py-3 text-center text-xs text-slate-400">
                  No publication planned for this date.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dayItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-surface-card border border-border rounded-xl p-3.5 space-y-2.5 hover:border-slate-600/60 transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Post Header: Type, Time, Origin */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {getContentTypeIcon(item.contentType)}
                            <span className="text-xs font-bold text-slate-200 capitalize">
                              {item.contentType.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {getStatusBadge(item.status)}
                          </div>
                        </div>

                        {/* Title & Caption */}
                        <h4 className="text-xs font-semibold text-slate-100 line-clamp-1 mt-1">
                          {item.title}
                        </h4>
                        <p className="text-[10px] text-slate-400">{item.accountName} ({item.accountHandle}){item.campaignName ? ` • ${item.campaignName}` : ''}</p>
                        <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                          {item.caption}
                        </p>
                        <details className="text-[11px] text-slate-300 mt-1">
                          <summary className="cursor-pointer text-terracotta-400">Review full caption</summary>
                          <p className="whitespace-pre-wrap break-words mt-1">{item.caption}</p>
                        </details>
                        {item.hashtags && (
                          <p className="text-[10px] text-terracotta-400 font-medium line-clamp-1">
                            {item.hashtags}
                          </p>
                        )}

                        {/* Media previews */}
                        {item.media && item.media.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                            {item.media.map((m, idx) => (
                              <img
                                key={m.id || idx}
                                src={m.previewUrl || m.url}
                                alt={m.altText || 'Media'}
                                className="w-12 h-12 object-cover rounded-lg border border-border shrink-0"
                              />
                            ))}
                          </div>
                        )}

                        {/* Video thumbnail */}
                        {item.thumbnailUrl && (
                          <div className="pt-1">
                            <img
                              src={item.thumbnailUrl}
                              alt="Video thumbnail"
                              className="w-full h-24 object-cover rounded-lg border border-border"
                            />
                          </div>
                        )}

                        {/* Link preview */}
                        {item.linkUrl && (
                          <a
                            href={item.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 truncate pt-1"
                          >
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            {item.linkUrl}
                          </a>
                        )}

                        {/* Receipt if Published */}
                        {item.receipt?.remotePostUrl && (
                          <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] text-emerald-300 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{item.status === 'published' && item.receipt.confirmationSource === 'api' && item.receipt.verificationStatus === 'confirmed' ? 'Facebook API verified post' : 'Saved publication receipt'}</span>
                              <a
                                href={item.receipt.remotePostUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline flex items-center gap-0.5 text-emerald-200 hover:text-white"
                              >
                                View Live <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono truncate">
                              ID: {item.receipt.remotePostId}
                            </div>
                            <div className="text-[9px] text-slate-400">Source: {item.receipt.confirmationSource || 'unavailable'} • Verification: {item.receipt.verificationStatus || 'unverified'}</div>
                          </div>
                        )}

                        {/* Error info */}
                        {item.errorMessage && (
                          <div className="mt-1 p-1.5 bg-rose-500/10 border border-rose-500/20 rounded text-[10px] text-rose-300">
                            {item.errorMessage}
                          </div>
                        )}
                      </div>

                      {/* Footer Details & Action Buttons */}
                      <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-slate-400">
                        <div className="flex items-center gap-1">
                          {item.origin === 'gemini_prepared' ? (
                            <span className="text-terracotta-400 font-semibold flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> Prepared
                            </span>
                          ) : (
                            <span className="text-slate-400 flex items-center gap-0.5">
                              <User className="w-2.5 h-2.5" /> Manual
                            </span>
                          )}
                          <span>•</span>
                          <span>{item.scheduledAtBangkok ? item.scheduledAtBangkok.slice(11, 16) : 'Draft'}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          {['scheduled', 'draft', 'approved'].includes(item.status) && (
                            <button
                              onClick={() => publishNow(item.id)}
                              disabled={actionLoading}
                              title="Publish Now (Override schedule)"
                              className="p-1 hover:bg-surface text-slate-300 hover:text-emerald-400 rounded transition-colors cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(item)}
                            title="Edit Post"
                            className="p-1 hover:bg-surface text-slate-300 hover:text-blue-400 rounded transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          {['draft', 'scheduled', 'failed'].includes(item.status) && (
                            <button
                              onClick={() => cancelItem(item.id)}
                              disabled={actionLoading}
                              title="Cancel / Delete Post"
                              className="p-1 hover:bg-surface text-slate-300 hover:text-rose-400 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-card border border-border rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-terracotta-400" />
                Edit Planned Post
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Caption</label>
                <textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  rows={4}
                  className="w-full bg-background border border-border rounded-xl p-2.5 text-slate-200 outline-none focus:border-terracotta-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Hashtags</label>
                <input
                  type="text"
                  value={editHashtags}
                  onChange={(e) => setEditHashtags(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-2 text-slate-200 outline-none focus:border-terracotta-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Scheduled Publication Time (Asia/Bangkok)
                </label>
                <input
                  type="text"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  placeholder="YYYY-MM-DDTHH:mm:ss+07:00"
                  className="w-full bg-background border border-border rounded-xl p-2 text-slate-200 outline-none focus:border-terracotta-500 font-mono text-[11px]"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Specify date and time in Asia/Bangkok time.
                </p>
              </div>

              {editingItem.status === 'approved' && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    Material changes to this post will invalidate its approval and return it to draft state.
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                onClick={() => setEditingItem(null)}
                className="px-3.5 py-1.5 bg-surface hover:bg-surface-hover text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      {reviewingCampaignId && <CampaignReviewModal campaignId={reviewingCampaignId} onClose={()=>setReviewingCampaignId(null)} onApprove={async review=>{await approveCampaign(review.campaign.id,{accountId:review.account.id,expectedHash:review.expectedApprovalHash});setReviewingCampaignId(null);}} />}
      {importModalOpen && currentAccount && <PreparedPlanModal accountId={currentAccount.id} accountName={`${currentAccount.name} (${currentAccount.handle})`} onClose={()=>setImportModalOpen(false)} onImported={async()=>{await refresh();setImportModalOpen(false);}} />}
      {createModalOpen && (
        <CreatePlanModal
          accountId={selectedAccountId || defaultPage?.id || ''}
          accountName={currentAccount?.name || 'Authorized Page'}
          onClose={() => setCreateModalOpen(false)}
          onCreate={async (plan) => {
            await createPlan(plan);
            setCreateModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

const CampaignReviewModal:React.FC<{campaignId:string;onClose:()=>void;onApprove:(review:CampaignReview)=>Promise<void>}> = ({campaignId,onClose,onApprove}) => {
  const [review,setReview]=useState<CampaignReview | null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const load=async()=>{setBusy(true);setError('');setReview(null);try{setReview(await calendarApi.getCampaignReview(campaignId));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  useEffect(()=>{void load();},[campaignId]);
  return <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label="Review Exact Campaign" className="bg-surface-card border border-border rounded-2xl max-w-3xl w-full p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
    <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-100">Review Exact Campaign</h3><button onClick={onClose} aria-label="Close campaign review"><X className="w-4 h-4 text-slate-400" /></button></div>
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    {review ? <>
      <p className="text-xs text-slate-200">Publishing as <strong>{review.account.name} ({review.account.handle})</strong> • Graph ID: {review.account.graphId || 'unverified'}</p>
      <p className="text-xs text-slate-400">{review.campaign.name} • {review.items.length} items • Maximum {review.campaign.maxPublications} publications • {review.campaign.startDate} to {review.campaign.endDate} (Asia/Bangkok)</p>
      <p className="text-xs text-amber-300">Approval schedules these exact saved revisions. Changes to the content, Page identity, media, branding or schedule require a fresh review.</p>
      <div className="space-y-3">{review.items.map(item=><article key={item.id} className="border border-border rounded-xl p-3 space-y-2 text-xs text-slate-300">
        <h4 className="font-bold text-slate-100">{item.title}</h4><p>{item.contentType} • Revision {item.revision} • {item.scheduledAtBangkok || 'No schedule'}</p>
        <p className="whitespace-pre-wrap break-words">{item.caption}</p>{item.hashtags && <p className="whitespace-pre-wrap">{item.hashtags}</p>}
        {item.media.length>0 && <div className="flex gap-2 overflow-x-auto">{item.media.map(media=><img key={media.id} src={media.previewUrl || media.url} alt={media.altText || 'Selected image'} className="w-24 h-24 rounded-lg object-cover" />)}</div>}
        {item.videoId && <p>Selected master video: {item.videoTitle || item.videoId} ({item.videoId})</p>}
        <details><summary className="cursor-pointer">Exact media and branding details</summary><pre className="whitespace-pre-wrap break-words text-[10px] mt-1">{JSON.stringify(item.approvalDetails,null,2)}</pre></details>
      </article>)}</div>
    </> : <p className="text-xs text-slate-400">{busy?'Loading current campaign snapshot...':'Reload the current campaign before approving.'}</p>}
    <div className="flex justify-end gap-2"><button onClick={onClose} className="px-3 py-2 text-xs text-slate-300">Cancel</button><button onClick={load} disabled={busy} className="px-3 py-2 text-xs text-slate-300 border border-border rounded-xl">Reload Review</button><button disabled={!review||busy} onClick={async()=>{if(!review)return;setBusy(true);try{await onApprove(review);}catch(e:any){setError(e.message);setReview(null);}finally{setBusy(false);}}} className="px-4 py-2 bg-emerald-600 rounded-xl text-white text-xs font-bold disabled:opacity-50">Approve Reviewed Campaign</button></div>
  </div></div>;
};

const PreparedPlanModal: React.FC<{accountId:string;accountName:string;onClose:()=>void;onImported:()=>Promise<void>}> = ({accountId,accountName,onClose,onImported}) => {
  const [context,setContext] = useState<any>(null);
  const [prepared,setPrepared] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [copied,setCopied] = useState(false);
  useEffect(()=>{
    let active=true;
    fetch(`/api/operator/pages/${encodeURIComponent(accountId)}/context`).then(async response=>{
      const body=await response.json();
      if(!response.ok) throw new Error(body.error || 'Page brief unavailable');
      if(active)setContext(body);
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[accountId]);
  const importPlan=async()=>{
    setBusy(true);setError('');
    try {
      const body=JSON.parse(prepared);
      if(body.plan?.accountId!==accountId)throw new Error('Prepared plan must use the selected Page account ID');
      if(!body.contextFingerprint)throw new Error('Paste the prepared plan with its Page contextFingerprint');
      const response=await fetch('/api/operator/plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'Prepared plan could not be saved');
      await onImported();
    } catch(e:any){setError(e.message || 'Paste valid prepared-plan JSON');}
    finally{setBusy(false);}
  };
  return <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div role="dialog" aria-modal="true" aria-label="Import Prepared Plan" className="bg-surface-card border border-border rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between"><h3 className="font-bold text-sm text-slate-100">Import Prepared Plan</h3><button onClick={onClose} aria-label="Close prepared plan" className="text-slate-400"><X className="w-4 h-4" /></button></div>
      <p className="text-xs text-slate-200">Destination Page: <strong>{accountName}</strong></p>
      <p className="text-xs text-slate-400">Use this Page brief with your creative operator, such as Codex or Gemini in Antigravity. Paste the prepared plan here to save unapproved campaign drafts. Review and approval remain separate owner actions.</p>
      {error && <p role="alert" className="text-xs text-rose-300 p-2 rounded-lg bg-rose-500/10">{error}</p>}
      <details className="text-xs text-slate-300"><summary className="cursor-pointer">Page brief and available media</summary><pre className="text-[10px] bg-background p-2 mt-2 rounded-lg whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{context?JSON.stringify(context,null,2):'Loading Page brief...'}</pre></details>
      <button disabled={!context} onClick={async()=>{try{await navigator.clipboard.writeText(JSON.stringify(context,null,2));setCopied(true);}catch{setError('Copy the Page brief from the expanded text.');}}} className="px-3 py-1.5 bg-surface border border-border rounded-xl text-xs text-slate-200 disabled:opacity-50">{copied?'Page Brief Copied':'Copy Page Brief'}</button>
      <label className="block text-xs text-slate-300">Prepared plan JSON<textarea aria-label="Prepared plan JSON" value={prepared} onChange={e=>setPrepared(e.target.value)} rows={10} placeholder={'{"contextFingerprint":"from Page brief","plan":{"accountId":"'+accountId+'",...}}'} className="mt-1 w-full bg-background border border-border rounded-xl p-2.5 text-slate-200 font-mono text-[11px]" /></label>
      <div className="flex justify-end gap-2"><button onClick={onClose} className="px-3 py-2 text-xs text-slate-300">Cancel</button><button onClick={importPlan} disabled={busy||!context||!prepared.trim()} className="px-4 py-2 rounded-xl bg-terracotta-600 text-white text-xs font-bold disabled:opacity-50">{busy?'Saving Drafts...':'Save Prepared Drafts'}</button></div>
    </div>
  </div>;
};

interface CreatePlanModalProps {
  accountId: string;
  accountName: string;
  onClose: () => void;
  onCreate: (plan: CampaignPlanInput) => Promise<void>;
}

const CreatePlanModal: React.FC<CreatePlanModalProps> = ({
  accountId,
  accountName,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [editorialScope, setEditorialScope] = useState('');
  const [captions, setCaptions] = useState('');
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [startDate, setStartDate] = useState(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const items: PlanItemInput[] = [];
      const start = new Date(`${startDate}T10:00:00+07:00`);
      const enteredCaptions = captions.split('\n').map(value => value.trim()).filter(Boolean);
      if (!enteredCaptions.length || enteredCaptions.length > days) throw new Error(`Enter between 1 and ${days} captions, one per line.`);
      const count = enteredCaptions.length;
      for (let i = 0; i < count; i++) {
        const postDate = new Date(start.getTime() + i * 86400000);
        const scheduledTimeBangkok = `${postDate.toISOString().slice(0, 10)}T10:00:00+07:00`;

        items.push({
          title: `Day ${i + 1}: ${enteredCaptions[i].slice(0, 100)}`,
          contentType: 'text',
          caption: enteredCaptions[i],
          hashtags: '',
          attachments: [],
          scheduledAt: scheduledTimeBangkok,
        });
      }

      await onCreate({
        accountId,
        name,
        editorialScope,
        days,
        startDate,
        origin: 'manual',
        maxPublications: count,
        items,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-card border border-border rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-terracotta-400" />
            Create Campaign Plan for {accountName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-slate-300 block mb-1">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-border rounded-xl p-2.5 text-slate-200 outline-none focus:border-terracotta-500"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-300 block mb-1">Editorial Scope</label>
            <textarea
              value={editorialScope}
              onChange={(e) => setEditorialScope(e.target.value)}
              rows={2}
              className="w-full bg-background border border-border rounded-xl p-2 text-slate-200 outline-none focus:border-terracotta-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Schedule Duration</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value) as any)}
                className="w-full bg-background border border-border rounded-xl p-2 text-slate-200 outline-none"
              >
                <option value={7}>7 Days (1 post/day)</option>
                <option value={14}>14 Days (1 post/day)</option>
                <option value={30}>30 Days (Demonstration)</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Start Date (Bangkok)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-background border border-border rounded-xl p-2 text-slate-200 outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="campaign-captions" className="font-semibold text-slate-300 block mb-1">Manual captions (one per day, one per line)</label>
            <textarea id="campaign-captions" value={captions} onChange={e=>setCaptions(e.target.value)} rows={5} className="w-full bg-background border border-border rounded-xl p-2 text-slate-200 outline-none focus:border-terracotta-500" />
            <p className="text-[10px] text-slate-400 mt-1">Only your entered content is saved. Use Import Prepared Plan for externally prepared captions and selected media.</p>
          </div>

          <div className="p-3 bg-surface border border-border rounded-xl text-[11px] text-slate-300 space-y-1">
            <span className="font-semibold text-slate-200 block">Draft-First Guarantee:</span>
            <span>
              Your entered captions will be saved as manual drafts. Nothing will be published or queued until you explicitly click "Approve Entire Campaign".
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-surface hover:bg-surface-hover text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create {days}-Day Plan
          </button>
        </div>
      </div>
    </div>
  );
};
