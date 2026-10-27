import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { 
  HelpCircle, BarChart3, TrendingUp, Users, Eye, ThumbsUp, MessageSquare, 
  Share2, RefreshCw, ExternalLink, ShieldCheck, Clock, CheckCircle2, AlertTriangle, Filter, Sparkles
} from 'lucide-react';
import { AnalyticsOverviewResponse, VideoPerformanceItem, Account, Category } from '../types';
import { RecordObservationModal } from '../components/analytics/RecordObservationModal';

export const AnalyticsView: React.FC = () => {
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Filters
  const [platformFilter, setPlatformFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Observation Modal state
  const [selectedVideoForObs, setSelectedVideoForObs] = useState<VideoPerformanceItem | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      const [res, accRes, catRes] = await Promise.all([
        api.getAnalyticsOverview({
          platform: platformFilter || undefined,
          accountId: accountFilter || undefined,
          categoryId: categoryFilter || undefined,
        }),
        api.getAccounts(),
        api.getCategories(),
      ]);
      setData(res);
      setAccounts(accRes.accounts.filter((a: Account) => !a.is_demo));
      setCategories(catRes.categories);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [platformFilter, accountFilter, categoryFilter]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await api.syncAnalytics(accountFilter || undefined);
      if (res.success && res.result?.status === 'success') {
        setSyncFeedback({
          text: res.result.message || 'Synchronization complete. Platform metrics updated.',
          isError: false,
        });
      } else {
        const msg = res.message || res.result?.message || 'Official API authorization required for automated synchronization. Connect live credentials in Accounts or record verified observations.';
        setSyncFeedback({
          text: msg,
          isError: true,
        });
      }
      await loadAnalytics();
    } catch (err: any) {
      setSyncFeedback({
        text: `Sync failed: ${err.message}`,
        isError: true,
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncFeedback(null), 8000);
    }
  };

  if (loading || !data) {
    return (
      <div className="bg-surface-card border border-border rounded-2xl p-12 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-terracotta-400" />
        Loading genuine social analytics engine...
      </div>
    );
  }

  const { totals, platformComparison, categoryComparison, accountRankings, videoPerformance, syncStates, isSimulatedNotice } = data;

  return (
    <div className="space-y-6">
      {/* Notice Banner: Honest Demo & Provenance Labeling */}
      <div className="p-4 bg-terracotta-500/10 border border-terracotta-500/25 rounded-2xl text-xs text-terracotta-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="w-4 h-4 text-terracotta-400 shrink-0" />
          <span>{isSimulatedNotice}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] bg-terracotta-500/20 text-terracotta-300 px-2.5 py-0.5 rounded-md font-mono uppercase font-bold">
            Real data only
          </span>
          {totals?.last_sync_time && (
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3 text-slate-500" />
              Last sync: {new Date(totals.last_sync_time).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Action Bar & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface-card p-5 rounded-2xl border border-border shadow-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </div>

          {/* Platform Filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="bg-surface border border-border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500 cursor-pointer"
          >
            <option value="">All Platforms</option>
            <option value="facebook">Facebook Only</option>
            <option value="tiktok">TikTok Only</option>
          </select>

          {/* Account Filter */}
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="bg-surface border border-border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500 cursor-pointer"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.platform})
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-surface border border-border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500 cursor-pointer"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Sync Button & Status */}
        <div className="flex items-center gap-3">
          {syncFeedback && (
            <span className={`text-xs font-medium px-3 py-1.5 rounded-xl border flex items-center gap-1.5 animate-in fade-in max-w-md ${
              syncFeedback.isError
                ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
                : 'text-sage-300 bg-sage-500/15 border-sage-500/30'
            }`}>
              {syncFeedback.isError ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-sage-400 shrink-0" />
              )}
              <span>{syncFeedback.text}</span>
            </span>
          )}

          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-4 py-2 bg-terracotta-600 hover:bg-terracotta-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-terracotta-600/25 cursor-pointer active:scale-95 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Synchronizing...' : 'Synchronize Now'}</span>
          </button>
        </div>
      </div>

      {/* Aggregate Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Views</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {totals?.total_views !== null && totals?.total_views !== undefined
              ? Number(totals.total_views).toLocaleString()
              : 'Unavailable'}
          </h3>
          <p className="text-[10px] text-sage-400 mt-1 font-medium">Across verified data sources</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Likes</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {totals?.total_likes !== null && totals?.total_likes !== undefined
              ? Number(totals.total_likes).toLocaleString()
              : 'Unavailable'}
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">From retrieved snapshots</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Comments</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {totals?.total_comments !== null && totals?.total_comments !== undefined
              ? Number(totals.total_comments).toLocaleString()
              : 'Unavailable'}
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">Viewer dialogue</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Shares</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {totals?.total_shares !== null && totals?.total_shares !== undefined
              ? Number(totals.total_shares).toLocaleString()
              : 'Unavailable'}
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">Viral distribution</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Followers Total</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {totals?.total_followers == null ? 'Unavailable' : Number(totals.total_followers).toLocaleString()}
          </h3>
          <p className="text-[10px] text-sage-400 mt-1 font-medium">Current audience</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Engagement Rate</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {totals?.total_views === null ? 'Unavailable' : `${totals?.avg_engagement_rate ?? '0'}%`}
          </h3>
          <p className="text-[10px] text-sage-400 mt-1 font-medium">Interactions / Views</p>
        </div>
      </div>

      {/* Comparisons: Facebook vs TikTok & Category Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Facebook vs TikTok Breakdown */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
          <h3 className="text-base font-bold text-slate-100 mb-1">Platform Performance: Facebook vs TikTok</h3>
          <p className="text-xs text-slate-400 mb-4">Comparing verified reach and engagement across connected networks</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {platformComparison?.map((p: any) => {
              const isFB = p.platform === 'facebook';
              return (
                <div 
                  key={p.platform} 
                  className={`p-4.5 rounded-2xl border ${
                    isFB ? 'bg-blue-950/15 border-blue-500/25' : 'bg-rose-950/15 border-rose-500/25'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                      isFB ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    }`}>
                      {p.platform}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">{p.account_count} accounts</span>
                  </div>

                  <p className="text-2xl font-black text-slate-100 tracking-tight">{Number(p.total_views).toLocaleString()}</p>
                  <p className="text-[11px] text-slate-400 mb-3">Total Video Views</p>

                  <div className="space-y-2 pt-3 border-t border-border text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>Likes:</span>
                      <strong className="text-slate-100">{Number(p.total_likes).toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Comments:</span>
                      <strong className="text-slate-100">{Number(p.total_comments).toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Engagement Rate:</span>
                      <strong className="text-sage-400 font-bold">{p.avg_engagement_rate}%</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Performance Breakdown */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
          <h3 className="text-base font-bold text-slate-100 mb-1">AI Video Genre & Category Comparison</h3>
          <p className="text-xs text-slate-400 mb-4">Discover which AI production categories yield the highest viewer response</p>

          <div className="space-y-3">
            {categoryComparison?.map((cat: any, i: number) => {
              const maxViews = Math.max(...categoryComparison.map((c: any) => c.total_views));
              const pct = Math.round((cat.total_views / (maxViews || 1)) * 100);

              return (
                <div key={cat.id} className="bg-surface p-3.5 rounded-xl border border-border text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#D95D39' }} />
                      <span className="font-bold text-slate-100">{cat.name}</span>
                      {i === 0 && (
                        <span className="text-[9px] bg-honey-500/20 text-honey-300 border border-honey-500/30 px-1.5 py-0.2 rounded-md font-bold">
                          Top Performing
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-slate-200">
                      {Number(cat.total_views).toLocaleString()} views
                    </span>
                  </div>

                  <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden mb-2">
                    <div 
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: cat.color || '#D95D39' }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{cat.account_count} Connected Accounts</span>
                    <span>Avg Engagement: <strong className="text-sage-400">{cat.avg_engagement_rate}%</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Published Videos Performance Table (V1.5 Core Real Engagement Matrix) */}
      <div className="min-w-0 bg-surface-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-terracotta-400" />
              <span>Published Videos Performance & Engagement</span>
            </h3>
            <p className="text-xs text-slate-400">
              Granular metrics for published original and branded videos with full provenance tracking
            </p>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-xs [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
            <thead>
              <tr className="border-b border-border text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="pb-3 font-semibold">Video</th>
                <th className="pb-3 font-semibold">Account / Platform</th>
                <th className="pb-3 font-semibold text-right">Views</th>
                <th className="pb-3 font-semibold text-right">Likes</th>
                <th className="pb-3 font-semibold text-right">Comments</th>
                <th className="pb-3 font-semibold text-right">Shares</th>
                <th className="pb-3 font-semibold min-w-[180px]">Provenance & Verification</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {videoPerformance && videoPerformance.length > 0 ? (
                videoPerformance.map((v) => {
                  const isFB = v.platform === 'facebook';
                  const hasViews = v.views !== null && v.views !== undefined;
                  const isZeroConfirmed = v.views === 0 && v.provenance_status === 'confirmed';

                  return (
                    <tr key={v.destination_id} className="hover:bg-surface/50 transition-colors">
                      {/* Video Title & Thumbnail */}
                      <td className="py-3 font-medium text-slate-100 max-w-[200px]">
                        <p className="font-bold truncate text-slate-200">{v.video_title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">ID: {v.remote_post_id}</p>
                      </td>

                      {/* Account & Platform */}
                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md border ${
                            isFB ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                          }`}>
                            {v.platform}
                          </span>
                          <span className="text-slate-300 font-medium truncate">{v.account_name}</span>
                        </div>
                      </td>

                      {/* Views Count */}
                      <td className="py-3 text-right font-mono font-bold">
                        {hasViews ? (
                          isZeroConfirmed ? (
                            <span className="text-slate-400 bg-surface px-2 py-0.5 rounded-md border border-border">
                              0 <span className="text-[10px] text-sage-400 font-sans font-semibold">(Confirmed)</span>
                            </span>
                          ) : (
                            <span className="text-slate-100">{Number(v.views).toLocaleString()}</span>
                          )
                        ) : (
                          <span className="text-honey-400 bg-honey-500/10 px-2 py-0.5 rounded-md border border-honey-500/25 text-[10px]">
                            Unavailable
                          </span>
                        )}
                      </td>

                      {/* Likes Count */}
                      <td className="py-3 text-right font-mono text-slate-300">
                        {v.likes !== null && v.likes !== undefined ? Number(v.likes).toLocaleString() : '—'}
                      </td>

                      {/* Comments Count */}
                      <td className="py-3 text-right font-mono text-slate-300">
                        {v.comments !== null && v.comments !== undefined ? Number(v.comments).toLocaleString() : '—'}
                      </td>

                      {/* Shares Count */}
                      <td className="py-3 text-right font-mono text-slate-300">
                        {v.shares !== null && v.shares !== undefined ? Number(v.shares).toLocaleString() : '—'}
                      </td>

                      {/* Provenance Badge */}
                      <td className="py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-sage-400 shrink-0" />
                            <span className="min-w-0 break-words text-[11px] font-semibold text-slate-200 capitalize">
                              {v.source.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {v.observed_at && (
                            <p className="text-[10px] text-slate-500 font-mono">
                              {new Date(v.observed_at).toLocaleDateString()} {new Date(v.observed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 text-right space-x-1.5 whitespace-nowrap">
                        {v.remote_post_url && (
                          <a
                            href={v.remote_post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-hover text-slate-300 hover:text-white light:hover:text-slate-100 rounded-lg border border-border text-[11px] transition-colors"
                            title="Open native post"
                          >
                            <span>Post</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        <button
                          onClick={() => setSelectedVideoForObs(v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-terracotta-500/15 hover:bg-terracotta-500/25 text-terracotta-300 rounded-lg border border-terracotta-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Record verified observation"
                        >
                          Record Observation
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No published videos found matching the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account Rankings Table */}
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <h3 className="text-base font-bold text-slate-100 mb-1">Account Performance Leaderboard</h3>
        <p className="text-xs text-slate-400 mb-4">Detailed view and follower engagement across accounts with retrieved platform data</p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="pb-3 font-semibold">Account</th>
                <th className="pb-3 font-semibold">Platform</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold">Total Views</th>
                <th className="pb-3 font-semibold">Likes</th>
                <th className="pb-3 font-semibold">Comments</th>
                <th className="pb-3 font-semibold">Total Followers</th>
                <th className="pb-3 font-semibold">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accountRankings?.map((acc: any) => (
                <tr key={acc.id} className="hover:bg-surface/50 transition-colors">
                  <td className="py-3 font-bold text-slate-100 flex items-center gap-2.5">
                    <img 
                      src={acc.avatar_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150'} 
                      alt={acc.name} 
                      className="w-8 h-8 rounded-xl object-cover border border-border shrink-0" 
                    />
                    <div className="min-w-0">
                      <p className="leading-tight truncate">{acc.name}</p>
                      <p className="text-[10px] text-slate-400 font-normal font-mono">{acc.handle}</p>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md border ${
                      acc.platform === 'facebook' ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                    }`}>
                      {acc.platform}
                    </span>
                  </td>
                  <td className="py-3 text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acc.category_color || '#D95D39' }} />
                      <span className="truncate">{acc.category_name}</span>
                    </span>
                  </td>
                  <td className="py-3 font-mono font-semibold text-slate-100">
                    {Number(acc.total_views).toLocaleString()}
                  </td>
                  <td className="py-3 text-slate-300 font-mono">{Number(acc.total_likes).toLocaleString()}</td>
                  <td className="py-3 text-slate-300 font-mono">{Number(acc.total_comments).toLocaleString()}</td>
                  <td className="py-3 font-semibold text-slate-200 font-mono">
                    {acc.current_followers == null ? 'Unavailable' : Number(acc.current_followers).toLocaleString()}
                  </td>
                  <td className="py-3 text-sage-400 font-bold">{acc.engagement_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sync States & Connection Capabilities Overview */}
      {syncStates && syncStates.length > 0 && (
        <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-terracotta-400" />
            <span>Platform Synchronization Status</span>
          </h3>
          <p className="text-xs text-slate-400">
            Current status of official background polling cadence (15-min intervals) and connector capability health
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {syncStates.map((st) => (
              <div key={st.id} className="p-3.5 bg-surface border border-border rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 uppercase font-mono text-[11px]">{st.target} Sync</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${
                    st.status === 'success' ? 'bg-sage-500/15 text-sage-400 border-sage-500/25' :
                    st.status === 'auth_required' ? 'bg-honey-500/15 text-honey-400 border-honey-500/25' :
                    'bg-slate-500/15 text-slate-400 border-slate-500/25'
                  }`}>
                    {st.status}
                  </span>
                </div>
                {st.error_message && (
                  <p className="text-[11px] text-honey-300 opacity-90 leading-tight">
                    {st.error_message}
                  </p>
                )}
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-border">
                  <span>Records updated: {st.records_synced}</span>
                  <span>{st.last_success_at ? `Success: ${new Date(st.last_success_at).toLocaleTimeString()}` : 'Pending sync'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observation Modal */}
      {selectedVideoForObs && (
        <RecordObservationModal
          video={selectedVideoForObs}
          isOpen={Boolean(selectedVideoForObs)}
          onClose={() => setSelectedVideoForObs(null)}
          onSuccess={loadAnalytics}
        />
      )}
    </div>
  );
};
