import React from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { useInbox } from '../hooks/useInbox';
import { CommentFilters } from '../components/inbox/CommentFilters';
import { CommentCard } from '../components/inbox/CommentItem';

interface Props {
  selectedCategory: string;
}

export const InboxView: React.FC<Props> = ({ selectedCategory }) => {
  const {
    comments,
    accounts,
    stats,
    platformFilter,
    setPlatformFilter,
    accountFilter,
    setAccountFilter,
    statusFilter,
    setStatusFilter,
    awaitingReplyOnly,
    setAwaitingReplyOnly,
    searchQuery,
    setSearchQuery,
    activeReplyId,
    setActiveReplyId,
    replyText,
    setReplyText,
    replySubmitting,
    replyError,
    setReplyError,
    loadData,
    handleSendReply,
    handleReact,
    handleStatusChange,
  } = useInbox(selectedCategory);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Header and Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 sm:p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> Community Dialogue
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>Unified Engagement Inbox</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Read, reply, and moderate comments across all connected Facebook Pages & TikTok accounts
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0 flex-wrap">
          <div className="px-3 py-1.5 bg-surface border border-border rounded-xl text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-terracotta-400" />
            <span className="text-slate-400">Awaiting Reply:</span>
            <span className="text-slate-100 font-bold">{stats.awaiting_reply_count || 0}</span>
          </div>

          <div className="px-3 py-1.5 bg-surface border border-border rounded-xl text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-honey-400" />
            <span className="text-slate-400">Unread:</span>
            <span className="text-slate-100 font-bold">{stats.unread_count || 0}</span>
          </div>

          <button
            onClick={loadData}
            className="p-2 bg-surface hover:bg-surface-hover border border-border rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Refresh Comments"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <CommentFilters
        platformFilter={platformFilter}
        setPlatformFilter={setPlatformFilter}
        accountFilter={accountFilter}
        setAccountFilter={setAccountFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        awaitingReplyOnly={awaitingReplyOnly}
        setAwaitingReplyOnly={setAwaitingReplyOnly}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        accounts={accounts}
        onSearchSubmit={handleSearchSubmit}
      />

      {/* Comments List */}
      <div className="space-y-3.5">
        {comments.length === 0 ? (
          <div className="bg-surface-card border border-border rounded-2xl p-12 text-center text-slate-400 text-sm shadow-xs">
            No comments match the selected filters.
          </div>
        ) : (
          comments.map((cmt) => (
            <CommentCard
              key={cmt.id}
              comment={cmt}
              isReplying={activeReplyId === cmt.id}
              replyText={replyText}
              replySubmitting={replySubmitting}
              replyError={replyError}
              onToggleReply={() => {
                setActiveReplyId(activeReplyId === cmt.id ? null : cmt.id);
                setReplyError(null);
              }}
              onReplyTextChange={setReplyText}
              onSendReply={handleSendReply}
              onReact={handleReact}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </div>
  );
};
