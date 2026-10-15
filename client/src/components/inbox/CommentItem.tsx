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
  return (
    <div 
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
            onClick={() => onReact(cmt.id)}
            className="px-2.5 py-1 bg-surface hover:bg-slate-800 text-slate-300 border border-slate-700 rounded flex items-center gap-1.5 transition-colors"
          >
            <Heart className="w-3.5 h-3.5 text-rose-400" />
            <span>{cmt.like_count || 0} Likes</span>
          </button>

          <button
            onClick={onToggleReply}
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
              onClick={() => onStatusChange(cmt.id, 'handled')}
              className="text-slate-400 hover:text-emerald-400 flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> Mark Handled
            </button>
          )}
          {cmt.status === 'handled' && (
            <button
              onClick={() => onStatusChange(cmt.id, 'unread')}
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
            onChange={(e) => onReplyTextChange(e.target.value)}
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
              onClick={onToggleReply}
              className="px-3 py-1.5 bg-surface hover:bg-slate-800 text-slate-400 rounded text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSendReply(cmt.id)}
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
};
