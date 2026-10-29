import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { Account, PublishingDestination, ActivityEvent, CommentItem } from '../types';
import { 
  CheckCircle2, AlertTriangle, Clock, Share2, MessageSquare, 
  Eye, ArrowUpRight, Film, PlusCircle, Sparkles 
} from 'lucide-react';
import { MetricCard } from '../components/common/MetricCard';

interface Props {
  onNavigate: (tab: string) => void;
  selectedCategory: string;
}

export const DashboardView: React.FC<Props> = ({ onNavigate, selectedCategory }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [queue, setQueue] = useState<PublishingDestination[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [accRes, qRes, cmtRes, actRes, anaRes] = await Promise.all([
        api.getAccounts(),
        api.getQueue(),
        api.getComments({ awaitingReply: 'true', limit: '5' }),
        api.getActivity(6),
        api.getAnalyticsOverview(),
      ]);
      setAccounts((accRes.accounts || []).filter((a: Account) => !a.is_demo));
      setQueue((qRes.queue || []).filter((q: PublishingDestination) => !q.is_demo));
      setComments(cmtRes.comments || []);
      setActivities(actRes.events || []);
      setAnalytics(anaRes);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const filteredAccounts = selectedCategory === 'all'
    ? accounts
    : accounts.filter(a => a.category_id === selectedCategory || a.category_slug === selectedCategory);

  const activeQueue = queue.filter(q => ['preparing', 'branding', 'uploading', 'awaiting_confirmation', 'scheduled'].includes(q.status));
  const failedQueue = queue.filter(q => q.status === 'failed');

  return (
    <div className="space-y-6">
      {/* Studio Hearth Greeting Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-surface-card via-surface-card to-surface border border-border p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-sage-400 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400">
                Creative Studio Hub
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
              Welcome back to your Creative Studio
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Monitor multi-account distribution, animated watermarks, and audience conversations across Facebook & TikTok.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={() => onNavigate('publishing')}
              className="px-3.5 py-2 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-terracotta-600/25 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Compose New Video
            </button>
          </div>
        </div>
      </div>

      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Connected Accounts"
          value={
            <>
              {accounts.filter(a => a.status === 'connected').length}{' '}
              <span className="text-sm font-normal text-slate-400">/ {accounts.length}</span>
            </>
          }
          subValue={
            <p className="text-xs text-sage-400 flex items-center font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 shrink-0" />
              {accounts.filter(a => {
                if (a.status !== 'connected') return false;
                if (a.connection_status === 'expired' || a.connection_status === 'connection_error' || a.connection_status === 'disconnected') return false;
                if (a.health_status?.toLowerCase().includes('authorization required') || a.health_status?.toLowerCase().includes('expired')) return false;
                return true;
              }).length} healthy sessions
            </p>
          }
          icon={<Share2 className="w-5 h-5" />}
          iconBg="bg-sage-500/15"
          iconColor="text-sage-400"
        />

        <MetricCard
          label="Publishing Queue"
          value={
            <>
              {activeQueue.length}{' '}
              <span className="text-sm font-normal text-slate-400">active</span>
            </>
          }
          subValue={
            <p className="text-xs text-honey-400 flex items-center font-medium">
              {failedQueue.length > 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 mr-1 shrink-0" />
                  {failedQueue.length} requires attention
                </>
              ) : (
                <span className="text-slate-400 font-normal">All tasks nominal</span>
              )}
            </p>
          }
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-honey-500/15"
          iconColor="text-honey-400"
        />

        <MetricCard
          label="Awaiting Response"
          value={comments.length}
          subValue={
            <p className="text-xs text-terracotta-400 flex items-center font-medium">
              <MessageSquare className="w-3.5 h-3.5 mr-1 shrink-0" /> Across FB & TikTok
            </p>
          }
          icon={<MessageSquare className="w-5 h-5" />}
          iconBg="bg-terracotta-500/15"
          iconColor="text-terracotta-400"
        />

        <MetricCard
          label="Total Audience Views"
          value={analytics?.totals?.total_views ? Number(analytics.totals.total_views).toLocaleString() : 'No platform data'}
          subValue={
            <p className="text-xs text-sage-400 flex items-center font-medium">
              <ArrowUpRight className="w-3.5 h-3.5 mr-1 shrink-0" /> Retrieved real platform data only
            </p>
          }
          icon={<Eye className="w-5 h-5" />}
          iconBg="bg-indigo-500/15"
          iconColor="text-indigo-400"
        />
      </div>

      {/* Accounts Command Matrix */}
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>Connected Social Accounts</span>
              <span className="text-xs bg-surface text-slate-300 px-2 py-0.5 rounded-full border border-border">
                {filteredAccounts.length}
              </span>
            </h2>
            <p className="text-xs text-slate-400">Organized across your content production categories</p>
          </div>
          <button 
            onClick={() => onNavigate('accounts')}
            className="scc-link-action self-start sm:self-auto"
          >
            Manage Accounts <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((acc) => (
            <div 
              key={acc.id} 
              className="bg-surface border border-border hover:border-slate-600 rounded-xl p-4 transition-all duration-200 shadow-xs"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <img 
                    src={acc.avatar_url || '/avatar.svg'}
                    alt={acc.name} 
                    className="w-10 h-10 rounded-xl object-cover border border-border shrink-0" 
                  />
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-100 text-sm leading-snug truncate">{acc.name}</h4>
                    <p className="text-xs text-slate-400 truncate">{acc.handle}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${
                  acc.platform === 'facebook' 
                    ? 'bg-blue-600/15 text-blue-400 border-blue-500/25' 
                    : 'bg-rose-600/15 text-rose-400 border-rose-500/25'
                }`}>
                  {acc.platform}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-border/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span 
                    className="w-2 h-2 rounded-full shrink-0" 
                    style={{ backgroundColor: acc.category_color || '#D95D39' }}
                  />
                  <span className="text-slate-300 truncate max-w-[130px] font-medium">{acc.category_name || 'Unassigned'}</span>
                </div>
                
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border shrink-0 ${
                  acc.status === 'connected' 
                    ? 'bg-sage-500/10 text-sage-400 border-sage-500/20' 
                    : 'bg-honey-500/10 text-honey-400 border-honey-500/20 animate-pulse'
                }`}>
                  {acc.connection_status === 'limited' ? 'Limited Capabilities' : acc.connection_status === 'registered' ? 'Registered / Not Connected' : acc.connection_status?.replaceAll('_', ' ') || 'Not Connected'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Split: Live Queue & Triage Inbox */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Publishing Queue */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Active Publishing Queue</span>
                {activeQueue.length > 0 && (
                  <span className="text-xs bg-honey-500/20 text-honey-300 border border-honey-500/30 px-2 py-0.5 rounded-full font-semibold">
                    {activeQueue.length} in progress
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Destination uploads and background video rendering</p>
            </div>
            <button
              onClick={() => onNavigate('publishing')}
              className="scc-link-action"
            >
              View All <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeQueue.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <Film className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-60" />
              <p className="text-sm text-slate-400 font-medium">Publishing queue is currently empty</p>
              <button
                onClick={() => onNavigate('publishing')}
                className="mt-3 px-3.5 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm shadow-terracotta-600/20"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Create New Post
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeQueue.slice(0, 4).map((item) => (
                <div key={item.id} className="bg-surface p-3.5 rounded-xl border border-border">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-200">{item.account_name}</span>
                    <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-surface-hover text-terracotta-400 border border-border">
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mb-2">{item.caption}</p>
                  <div className="w-full bg-surface-hover rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-terracotta-500 to-honey-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${item.progress || 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Engagement Inbox Triage */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Engagement Inbox</span>
                {comments.length > 0 && (
                  <span className="text-xs bg-terracotta-500/20 text-terracotta-300 border border-terracotta-500/30 px-2 py-0.5 rounded-full font-semibold">
                    {comments.length} awaiting response
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Recent comments needing operator attention</p>
            </div>
            <button
              onClick={() => onNavigate('inbox')}
              className="scc-link-action"
            >
              Open Inbox <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {comments.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <CheckCircle2 className="w-8 h-8 text-sage-400 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-medium">All caught up!</p>
              <p className="text-xs text-slate-500 mt-0.5">No unresolved comments across connected accounts.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.slice(0, 3).map((cmt) => (
                <div key={cmt.id} className="bg-surface p-3.5 rounded-xl border border-border hover:border-slate-600 transition-all">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${cmt.platform === 'facebook' ? 'bg-blue-400' : 'bg-rose-400'}`} />
                      {cmt.author_name}
                    </span>
                    <span className="text-[10px] text-slate-400">on {cmt.account_name}</span>
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2 my-1 leading-relaxed">"{cmt.content}"</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/80 text-[11px]">
                    <span className="text-slate-500 truncate max-w-[200px]">{cmt.video_title}</span>
                    <button
                      onClick={() => onNavigate('inbox')}
                      className="scc-link-action shrink-0"
                    >
                      Reply in Inbox →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <h3 className="text-base font-bold text-slate-100 mb-1">Live Activity Stream</h3>
        <p className="text-xs text-slate-400 mb-4">Real-time publishing milestones, alerts, and platform events</p>

        <div className="space-y-2.5">
          {activities.map((act) => (
            <div key={act.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-border text-xs">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                act.severity === 'success' ? 'bg-sage-400 shadow-xs shadow-sage-400/50' :
                act.severity === 'warning' ? 'bg-honey-400 shadow-xs shadow-honey-400/50' :
                act.severity === 'error' ? 'bg-rose-400 shadow-xs shadow-rose-400/50' : 'bg-blue-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200">{act.title}</span>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{act.created_at}</span>
                </div>
                <p className="text-slate-400 mt-0.5 leading-relaxed">{act.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
