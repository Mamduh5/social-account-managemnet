import React, { useState } from 'react';
import { VideoPerformanceItem } from '../../types';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { X, Eye, ThumbsUp, MessageSquare, Share2, ShieldCheck, ExternalLink } from 'lucide-react';

interface Props {
  video: VideoPerformanceItem;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecordObservationModal: React.FC<Props> = ({ video, isOpen, onClose, onSuccess }) => {
  const [viewCount, setViewCount] = useState<number | string>(video.views ?? '');
  const [likeCount, setLikeCount] = useState<number | string>(video.likes ?? '');
  const [commentCount, setCommentCount] = useState<number | string>(video.comments ?? '');
  const [shareCount, setShareCount] = useState<number | string>(video.shares ?? '');
  const [source, setSource] = useState('manual');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.recordObservation({
        destinationId: video.destination_id,
        viewCount: viewCount !== '' ? Number(viewCount) : null,
        likeCount: likeCount !== '' ? Number(likeCount) : null,
        commentCount: commentCount !== '' ? Number(commentCount) : null,
        shareCount: shareCount !== '' ? Number(shareCount) : null,
        source,
        notes: notes.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record observation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Verified Observation" subtitle="Leave unknown counts blank. Provider provenance is assigned by the server." manageFocus scrollBody dismissible={!saving}>
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto min-h-0">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/25 rounded-xl text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Video Metadata context */}
          <div className="p-3.5 bg-surface rounded-xl border border-border space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                video.platform === 'facebook' ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
              }`}>
                {video.platform}
              </span>
              <span className="text-slate-400 text-[11px] font-mono">{video.account_name}</span>
            </div>
            <p className="font-bold text-slate-200 truncate pt-1">{video.video_title}</p>
            {video.remote_post_url && (
              <a
                href={video.remote_post_url}
                target="_blank"
                rel="noreferrer"
                className="text-terracotta-400 hover:underline text-[11px] flex items-center gap-1 pt-0.5"
              >
                <span>View Remote Post</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Metric Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Eye className="w-3 h-3 text-terracotta-400" /> Views / Plays
              </label>
              <input
                type="number"
                min="0"
                value={viewCount}
                onChange={(e) => setViewCount(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-terracotta-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <ThumbsUp className="w-3 h-3 text-terracotta-400" /> Likes / Reactions
              </label>
              <input
                type="number"
                min="0"
                value={likeCount}
                onChange={(e) => setLikeCount(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-terracotta-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-terracotta-400" /> Comments
              </label>
              <input
                type="number"
                min="0"
                value={commentCount}
                onChange={(e) => setCommentCount(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-terracotta-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Share2 className="w-3 h-3 text-terracotta-400" /> Shares
              </label>
              <input
                type="number"
                min="0"
                value={shareCount}
                onChange={(e) => setShareCount(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-terracotta-500"
                placeholder="0"
              />
            </div>
          </div>

          {/* Source Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Observation Provenance
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500 cursor-pointer"
            >
              <option value="browser_verified">Browser Verified (Platform Inspection / Studio)</option>
              <option value="manual">Manual Observation (Owner Check)</option>
              <option value="meta_graph_api">Meta Graph API (Verified Direct)</option>
              <option value="tiktok_api">TikTok Display API (Verified Direct)</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Verification Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500"
              placeholder="e.g. Verified via Facebook Page Insights modal"
            />
          </div>

          <p className="text-[10px] text-slate-500 italic">
            Note: Values will be persisted as a new timestamped snapshot in SQLite with provenance badge. Historical snapshots are strictly preserved.
          </p>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-surface hover:bg-surface-hover text-slate-300 rounded-xl text-xs font-semibold border border-border transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-terracotta-600 hover:bg-terracotta-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-terracotta-600/25 transition-all cursor-pointer active:scale-95"
            >
              {saving ? 'Recording...' : 'Save Observation'}
            </button>
          </div>
        </form>
    </Modal>
  );
};
