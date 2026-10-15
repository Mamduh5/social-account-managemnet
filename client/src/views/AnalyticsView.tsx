import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { HelpCircle, BarChart3, TrendingUp, Users, Eye, ThumbsUp, MessageSquare, Share2 } from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAnalyticsOverview().then((res) => {
      setData(res);
      setLoading(false);
    });
  }, []);

  if (loading || !data) {
    return (
      <div className="bg-surface-card border border-border rounded-2xl p-12 text-center text-slate-400">
        Loading analytics engine...
      </div>
    );
  }

  const { totals, platformComparison, categoryComparison, accountRankings, isSimulatedNotice } = data;

  return (
    <div className="space-y-6">
      {/* Notice Banner: Honest Demo Labeling */}
      <div className="p-4 bg-terracotta-500/10 border border-terracotta-500/25 rounded-2xl text-xs text-terracotta-300 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="w-4 h-4 text-terracotta-400 shrink-0" />
          <span>{isSimulatedNotice}</span>
        </div>
        <span className="text-[10px] bg-terracotta-500/20 text-terracotta-300 px-2.5 py-0.5 rounded-md font-mono uppercase font-bold shrink-0">
          Real data only
        </span>
      </div>

      {/* Aggregate Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Views</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {Number(totals?.total_views || 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-sage-400 mt-1 font-medium">Across authorized data sources</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Likes</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {Number(totals?.total_likes || 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">From retrieved snapshots</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Comments</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {Number(totals?.total_comments || 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">Viewer dialogue</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Shares</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {Number(totals?.total_shares || 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">Viral distribution</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Followers Gained</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            +{Number(totals?.total_followers_gained || 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-sage-400 mt-1 font-medium">From retrieved snapshots</p>
        </div>

        <div className="bg-surface-card border border-border p-4 rounded-2xl shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Engagement Rate</p>
          <h3 className="text-xl font-black text-slate-100 mt-1">
            {totals?.avg_engagement_rate ?? '0'}%
          </h3>
          <p className="text-[10px] text-sage-400 mt-1 font-medium">From retrieved snapshots</p>
        </div>
      </div>

      {/* Comparisons: Facebook vs TikTok & Category Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Facebook vs TikTok Breakdown */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
          <h3 className="text-base font-bold text-slate-100 mb-1">Platform Performance: Facebook vs TikTok</h3>
          <p className="text-xs text-slate-400 mb-4">Comparing reach and engagement across connected networks</p>

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
                    {Number(acc.current_followers).toLocaleString()}
                  </td>
                  <td className="py-3 text-sage-400 font-bold">{acc.engagement_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
