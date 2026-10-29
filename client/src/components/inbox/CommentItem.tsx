import React from 'react';
import { CommentItem as CommentItemType } from '../../types';
import { 
  Heart, MessageSquare, Check, CheckCircle2, 
  ExternalLink, AlertCircle, Send 
} from 'lucide-react';

export interface CommentItemProps {
  comment: CommentItemType;
  isReplying: boolean;
  replyText: string;
  replySubmitting: boolean;
  replyError: { message: string; nativeUrl?: string } | null;
  onToggleReply: () => void;
  onReplyTextChange: (text: string) => void;
  onSendReply: (commentId: string) => void;
  onReact: (commentId: string) => void;
  onStatusChange: (commentId: string, status: string) => void;
}

export const CommentCard: React.FC<CommentItemProps> = ({
  comment: cmt,
  isReplying,
  replyText,
  replySubmitting,
  replyError,
  onToggleReply,
  onReplyTextChange,
  onSendReply,
  onReact,
  onStatusChange,
}) => {
  // A synced platform reply can also be the saved send receipt. Match its remote
  // identity, never its text: distinct replies may legitimately say the same thing.
  const savedReply = cmt.reply_id ? cmt.replies?.find((reply) =>
    reply.external_comment_id === cmt.reply_id &&
    reply.account_id === cmt.account_id &&
    reply.platform === cmt.platform &&
    reply.parent_comment_id === cmt.external_comment_id
  ) : undefined;

  return (
    <div 
      className={`bg-surface-card border rounded-2xl p-5 transition-all shadow-xs ${
        cmt.awaiting_reply ? 'border-terracotta-500/40 bg-terracotta-500/5' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Author & Content */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <img 
            src={cmt.author_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'} 
            alt={cmt.author_name} 
            className="w-10 h-10 rounded-full object-cover border border-border shrink-0 shadow-xs" 
          />
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-100">{cmt.author_name}</span>
              <span className="text-slate-500">•</span>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md border ${
                cmt.platform === 'facebook' ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
              }`}>
                {cmt.platform}
              </span>
              <span className="text-slate-400">on <strong className="text-slate-200">{cmt.account_name}</strong></span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-500 text-[11px]">{cmt.created_time}</span>
            </div>

            <p className="text-sm text-slate-100 font-medium py-1 leading-relaxed">"{cmt.content}"</p>

            <div className="flex items-center gap-3 text-xs text-slate-400 pt-0.5">
              <span className="text-slate-400 text-[11px]">Video: <strong className="text-slate-300 font-medium">{cmt.video_title}</strong></span>
            </div>

            {/* Threaded Reply if already sent - preserves p:has-text("Replied by") */}
            {cmt.has_replied && cmt.reply_text && !savedReply && (
              <div className="mt-3 p-3.5 bg-surface rounded-xl border border-border text-xs">
                <p className="font-bold text-terracotta-400 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Replied by {cmt.account_name}:
                </p>
                <p className="text-slate-200 leading-relaxed">"{cmt.reply_text}"</p>
              </div>
            )}

            {/* Nested Platform Replies */}
            {cmt.replies && cmt.replies.length > 0 && (
              <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
                {cmt.replies.map((reply) => (
                  <div key={reply.id} className="p-2.5 bg-surface/70 rounded-xl border border-border text-xs space-y-1">
                    {cmt.has_replied && reply === savedReply && (
                      <p className="font-bold text-terracotta-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Replied by {cmt.account_name}:
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <img
                        src={reply.author_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60'}
                        alt={reply.author_name}
                        className="w-5 h-5 rounded-full object-cover border border-border shrink-0"
                      />
                      <span className="font-bold text-slate-200 text-[11px]">{reply.author_name}</span>
                      <span className="text-slate-500 text-[10px]">•</span>
                      <span className="text-slate-500 text-[10px]">{reply.created_time}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] pl-7">"{reply.content}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Status Pill & Quick Native Link */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
            cmt.status === 'handled' ? 'bg-sage-500/15 text-sage-400 border-sage-500/30' :
            cmt.status === 'pending' ? 'bg-honey-500/15 text-honey-400 border-honey-500/30' :
            'bg-terracotta-500/15 text-terracotta-400 border-terracotta-500/30 animate-pulse'
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
      <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onReact(cmt.id)}
            className="scc-btn-secondary text-xs"
          >
            <Heart className="w-3.5 h-3.5 text-rose-400" />
            <span>{cmt.like_count || 0} Likes</span>
          </button>

          <button
            onClick={onToggleReply}
            aria-expanded={isReplying}
            className="px-3.5 py-1.5 bg-terracotta-500/15 hover:bg-terracotta-500/25 text-terracotta-300 border border-terracotta-500/30 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {isReplying ? 'Close Reply' : 'Reply'}
          </button>
        </div>

        {/* Status Toggle */}
        <div className="flex items-center gap-2">
          {cmt.status !== 'handled' && (
            <button
              onClick={() => onStatusChange(cmt.id, 'handled')}
              className="scc-link-action text-xs"
            >
              <Check className="w-3.5 h-3.5" /> Mark Handled
            </button>
          )}
          {cmt.status === 'handled' && (
            <button
              onClick={() => onStatusChange(cmt.id, 'unread')}
              className="scc-link-action text-xs"
            >
              Mark Unread
            </button>
          )}
        </div>
      </div>

      {/* Inline Reply Composer */}
      {isReplying && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Replying as <strong className="text-slate-200">{cmt.account_name}</strong></span>
            {cmt.platform === 'tiktok' && (
              <span className="text-honey-400 text-[11px] font-medium">
                Note: TikTok official API restricts remote comments. Native handoff available below.
              </span>
            )}
          </div>

          <textarea
            aria-label={`Reply to ${cmt.author_name}`}
            rows={2}
            value={replyText}
            onChange={(e) => onReplyTextChange(e.target.value)}
            placeholder={`Write a genuine reply to ${cmt.author_name}...`}
            className="w-full bg-surface border border-border rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500"
          />

          {/* Platform API Restriction Honest Fallback */}
          {replyError && (
            <div role="alert" className="p-3.5 bg-honey-950/20 border border-honey-900/40 rounded-xl text-xs text-honey-300 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-honey-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{replyError.message}</p>
                  <p className="text-[11px] text-honey-400 opacity-80 mt-0.5">
                    Use the button on the right to open the comment directly on {cmt.platform}.
                  </p>
                </div>
              </div>

              {replyError.nativeUrl && (
                <a
                  href={replyError.nativeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-honey-500 hover:bg-honey-400 text-slate-950 rounded-xl font-bold whitespace-nowrap flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  Open on {cmt.platform.toUpperCase()} <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onToggleReply}
              className="scc-btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSendReply(cmt.id)}
              disabled={replySubmitting || !replyText.trim()}
              aria-busy={replySubmitting || undefined}
              className="scc-btn-primary scc-btn-consequential text-xs"
            >
              <Send className="w-3.5 h-3.5" />
              {replySubmitting ? 'Sending...' : 'Send Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
