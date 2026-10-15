import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CommentItem, Account, Category } from '../types';
import { 
  MessageSquare, Heart, Check, Clock, ExternalLink, 
  Send, Filter, Search, CheckCircle2, AlertCircle, RefreshCw 
} from 'lucide-react';

interface Props {
  selectedCategory: string;
}

export const InboxView: React.FC<Props> = ({ selectedCategory }) => {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<{ total: number; unread_count: number; awaiting_reply_count: number }>({
    total: 0,
    unread_count: 0,
    awaiting_reply_count: 0,
  });

  // Filters
  const [platformFilter, setPlatformFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [awaitingReplyOnly, setAwaitingReplyOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Active reply modal / state
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<{ message: string; nativeUrl?: string } | null>(null);

  const loadData = async () => {
    try {
      const [cmtRes, accRes, catRes] = await Promise.all([
        api.getComments({
          platform: platformFilter,
          accountId: accountFilter,
          categoryId: selectedCategory !== 'all' ? selectedCategory : '',
          status: statusFilter,
          awaitingReply: awaitingReplyOnly ? 'true' : '',
          search: searchQuery,
        }),
        api.getAccounts(),
        api.getCategories(),
      ]);

      setComments(cmtRes.comments || []);
      if (cmtRes.stats) setStats(cmtRes.stats);
      setAccounts(accRes.accounts || []);
      setCategories(catRes.categories || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, [platformFilter, accountFilter, statusFilter, awaitingReplyOnly, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleSendReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    setReplySubmitting(true);
    setReplyError(null);

    try {
      const res = await api.replyComment(commentId, replyText);
      if (res.success) {
        setReplyText('');
        setActiveReplyId(null);
        await loadData();
      } else {
        setReplyError({
          message: res.error || 'Reply not supported via this connection.',
          nativeUrl: res.nativeUrl,
        });
      }
    } catch (err: any) {
      setReplyError({ message: err.message });
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleReact = async (commentId: string) => {
    try {
      await api.reactComment(commentId);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (commentId: string, newStatus: string) => {
    try {
      await api.updateCommentStatus(commentId, newStatus, newStatus === 'handled' ? false : undefined);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 rounded-xl border border-border">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <span>Unified Engagement Inbox</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Read, reply, and moderate comments across all connected Facebook Pages & TikTok accounts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-surface border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-slate-300">Awaiting Reply:</span>
            <span className="text-white font-bold">{stats.awaiting_reply_count || 0}</span>
          </div>

          <div className="px-3 py-1.5 bg-surface border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-slate-300">Unread:</span>
            <span className="text-white font-bold">{stats.unread_count || 0}</span>
          </div>

          <button
            onClick={loadData}
            className="p-2 bg-surface hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 transition-colors"
            title="Refresh Comments"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-card border border-border p-4 rounded-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Platform Filter */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Platform:</span>
            <div className="flex rounded-lg border border-slate-800 bg-surface p-0.5">
              {[
                { id: '', label: 'All' },
                { id: 'facebook', label: 'Facebook' },
                { id: 'tiktok', label: 'TikTok' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatformFilter(p.id)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    platformFilter === p.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Account Filter */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Account:</span>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="bg-surface border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.platform})</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="unread">Unread</option>
              <option value="pending">Pending</option>
              <option value="handled">Handled</option>
            </select>
          </div>

          {/* Awaiting Response Toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-medium">
            <input
              type="checkbox"
              checked={awaitingReplyOnly}
              onChange={(e) => setAwaitingReplyOnly(e.target.checked)}
              className="rounded border-slate-700 text-indigo-600 focus:ring-0"
            />
            Needs Response Only
          </label>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search comment contents, viewer names, or video titles..."
            className="w-full bg-surface border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </form>
      </div>

      {/* Comments List */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <div className="bg-surface-card border border-border rounded-xl p-12 text-center text-slate-500 text-sm">
            No comments match the selected filters.
          </div>
        ) : (
          comments.map((cmt) => {
            const isReplying = activeReplyId === cmt.id;
            return (
              <div 
                key={cmt.id}
                className={`bg-surface-card border rounded-xl p-5 transition-all ${
                  cmt.awaiting_reply ? 'border-indigo-500/40 bg-indigo-950/10' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Author & Content */}
                  <div className="flex items-start gap-3 flex-1">
                    <img 
                      src={cmt.author_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'} 
                      alt={cmt.author_name} 
                      className="w-10 h-10 rounded-full object-cover border border-slate-700 shrink-0" 
                    />
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-bold text-white">{cmt.author_name}</span>
                        <span className="text-slate-500">•</span>
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          cmt.platform === 'facebook' ? 'bg-blue-500/20 text-blue-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {cmt.platform}
                        </span>
                        <span className="text-slate-400">on <strong className="text-slate-300">{cmt.account_name}</strong></span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-500 text-[11px]">{cmt.created_time}</span>
                      </div>

                      <p className="text-sm text-slate-100 font-medium py-1">"{cmt.content}"</p>

                      <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                        <span className="text-slate-500 text-[11px]">Video: {cmt.video_title}</span>
                      </div>

                      {/* Threaded Reply if already sent */}
                      {cmt.has_replied && cmt.reply_text && (
                        <div className="mt-3 p-3 bg-surface rounded-lg border border-slate-800 text-xs">
                          <p className="font-semibold text-indigo-400 mb-1 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Replied by {cmt.account_name}:
                          </p>
                          <p className="text-slate-300">"{cmt.reply_text}"</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Status Pill & Quick Native Link */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      cmt.status === 'handled' ? 'bg-emerald-500/20 text-emerald-400' :
                      cmt.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-400 animate-pulse'
                    }`}>
                      {cmt.status}
                    </span>

                    {cmt.native_url && (
                      <a
                        href={cmt.native_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1"
                        title="Open original thread on platform"
                      >
                        Native <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Action Bar */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleReact(cmt.id)}
                      className="px-2.5 py-1 bg-surface hover:bg-slate-800 text-slate-300 border border-slate-700 rounded flex items-center gap-1.5 transition-colors"
                    >
                      <Heart className="w-3.5 h-3.5 text-rose-400" />
                      <span>{cmt.like_count || 0} Likes</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveReplyId(isReplying ? null : cmt.id);
                        setReplyError(null);
                      }}
                      className="px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {isReplying ? 'Close Reply' : 'Reply'}
                    </button>
                  </div>

                  {/* Status Toggle */}
                  <div className="flex items-center gap-2">
                    {cmt.status !== 'handled' && (
                      <button
                        onClick={() => handleStatusChange(cmt.id, 'handled')}
                        className="text-slate-400 hover:text-emerald-400 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Mark Handled
                      </button>
                    )}
                    {cmt.status === 'handled' && (
                      <button
                        onClick={() => handleStatusChange(cmt.id, 'unread')}
                        className="text-slate-500 hover:text-slate-300"
                      >
                        Mark Unread
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Reply Composer */}
                {isReplying && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Replying as <strong>{cmt.account_name}</strong></span>
                      {cmt.platform === 'tiktok' && (
                        <span className="text-amber-400 text-[11px]">
                          Note: TikTok official API restricts remote comments. Native handoff available below.
                        </span>
                      )}
                    </div>

                    <textarea
                      rows={2}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Write a genuine reply to ${cmt.author_name}...`}
                      className="w-full bg-surface border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />

                    {/* Platform API Restriction Honest Fallback */}
                    {replyError && (
                      <div className="p-3 bg-amber-950/30 border border-amber-900/60 rounded-lg text-xs text-amber-300 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">{replyError.message}</p>
                            <p className="text-[11px] text-amber-400/80 mt-0.5">
                              Use the button on the right to open the comment directly on {cmt.platform}.
                            </p>
                          </div>
                        </div>

                        {replyError.nativeUrl && (
                          <a
                            href={replyError.nativeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded font-bold whitespace-nowrap flex items-center gap-1"
                          >
                            Open on {cmt.platform.toUpperCase()} <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveReplyId(null)}
                        className="px-3 py-1.5 bg-surface hover:bg-slate-800 text-slate-400 rounded text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendReply(cmt.id)}
                        disabled={replySubmitting || !replyText.trim()}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {replySubmitting ? 'Sending...' : 'Send Reply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
