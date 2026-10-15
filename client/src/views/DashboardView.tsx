import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { Account, PublishingDestination, ActivityEvent, CommentItem } from '../types';
import { 
  CheckCircle2, AlertTriangle, Clock, Share2, MessageSquare, 
  Eye, ArrowUpRight, Film, PlusCircle 
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
      setAccounts(accRes.accounts || []);
      setQueue(qRes.queue || []);
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
            <p className="text-xs text-emerald-400 flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {accounts.filter(a => a.health_status.includes('Healthy')).length} healthy sessions
            </p>
          }
          icon={<Share2 className="w-6 h-6" />}
          iconBg="bg-indigo-500/10"
          iconColor="text-indigo-400"
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
            <p className="text-xs text-amber-400 flex items-center">
              {failedQueue.length > 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  {failedQueue.length} requires attention
                </>
              ) : (
                <span className="text-slate-400">All tasks nominal</span>
              )}
            </p>
          }
          icon={<Clock className="w-6 h-6" />}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-400"
        />

        <MetricCard
          label="Awaiting Response"
          value={comments.length}
          subValue={
            <p className="text-xs text-blue-400 flex items-center">
              <MessageSquare className="w-3.5 h-3.5 mr-1" /> Across FB & TikTok
            </p>
          }
          icon={<MessageSquare className="w-6 h-6" />}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-400"
        />

        <MetricCard
          label="Total Audience Views"
          value={analytics?.totals?.total_views ? Number(analytics.totals.total_views).toLocaleString() : '36,200'}
          subValue={
            <p className="text-xs text-emerald-400 flex items-center">
              <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> +14.2% this week
            </p>
          }
          icon={<Eye className="w-6 h-6" />}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
        />
      </div>

      {/* Accounts Command Matrix */}
      <div className="bg-surface-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Connected Social Accounts</span>
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                {filteredAccounts.length}
              </span>
            </h2>
            <p className="text-xs text-slate-400">Organized across your content production categories</p>
          </div>
          <button 
            onClick={() => onNavigate('accounts')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
          >
            Manage Accounts <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((acc) => (
            <div 
              key={acc.id} 
              className="bg-surface border border-border/80 hover:border-slate-600 rounded-xl p-4 transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <img 
                    src={acc.avatar_url} 
                    alt={acc.name} 
                    className="w-10 h-10 rounded-lg object-cover border border-slate-700" 
                  />
                  <div>
                    <h4 className="font-semibold text-white text-sm leading-snug">{acc.name}</h4>
                    <p className="text-xs text-slate-400">{acc.handle}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  acc.platform === 'facebook' 
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                    : 'bg-rose-600/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {acc.platform}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: acc.category_color || '#6366F1' }}
                  />
                  <span className="text-slate-300 truncate max-w-[130px]">{acc.category_name || 'Unassigned'}</span>
                </div>
                
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                  acc.status === 'connected' 
                    ? 'bg-emerald-500/10 text-emerald-400' 
                    : 'bg-amber-500/10 text-amber-400 animate-pulse'
                }`}>
                  {acc.status === 'connected' ? 'Connected' : 'Expired'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Split: Live Queue & Triage Inbox */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Publishing Queue */}
        <div className="bg-surface-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Active Publishing Queue</span>
                {activeQueue.length > 0 && (
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                    {activeQueue.length} in progress
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Destination uploads and background video rendering</p>
            </div>
            <button
              onClick={() => onNavigate('publishing')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              View All <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeQueue.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-800 rounded-lg">
              <Film className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-medium">Publishing queue is currently empty</p>
              <button
                onClick={() => onNavigate('publishing')}
                className="mt-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Create New Post
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeQueue.slice(0, 4).map((item) => (
                <div key={item.id} className="bg-surface p-3.5 rounded-lg border border-border">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-200">{item.account_name}</span>
                    <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-400">
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mb-2">{item.caption}</p>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${item.progress || 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Engagement Inbox Triage */}
        <div className="bg-surface-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Engagement Inbox</span>
                {comments.length > 0 && (
                  <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium">
                    {comments.length} awaiting response
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Recent comments needing operator attention</p>
            </div>
            <button
              onClick={() => onNavigate('inbox')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              Open Inbox <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {comments.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-800 rounded-lg">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-medium">All caught up!</p>
              <p className="text-xs text-slate-500">No unresolved comments across connected accounts.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.slice(0, 3).map((cmt) => (
                <div key={cmt.id} className="bg-surface p-3.5 rounded-lg border border-border hover:border-slate-700">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${cmt.platform === 'facebook' ? 'bg-blue-400' : 'bg-rose-400'}`} />
                      {cmt.author_name}
                    </span>
                    <span className="text-[10px] text-slate-500">on {cmt.account_name}</span>
                  </div>
                  <p className="text-xs text-slate-200 line-clamp-2 my-1">"{cmt.content}"</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px]">
                    <span className="text-slate-500">{cmt.video_title}</span>
                    <button
                      onClick={() => onNavigate('inbox')}
                      className="text-indigo-400 hover:text-indigo-300 font-medium"
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
      <div className="bg-surface-card border border-border rounded-xl p-5">
        <h3 className="text-base font-bold text-white mb-1">Live Activity Stream</h3>
        <p className="text-xs text-slate-400 mb-4">Real-time publishing milestones, alerts, and platform events</p>

        <div className="space-y-2.5">
          {activities.map((act) => (
            <div key={act.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface/50 border border-border/50 text-xs">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                act.severity === 'success' ? 'bg-emerald-400' :
                act.severity === 'warning' ? 'bg-amber-400' :
                act.severity === 'error' ? 'bg-rose-400' : 'bg-blue-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-200">{act.title}</span>
                  <span className="text-[10px] text-slate-500">{act.created_at}</span>
                </div>
                <p className="text-slate-400 mt-0.5">{act.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
