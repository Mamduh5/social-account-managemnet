import React from 'react';
import { PublishingDestination } from '../../types';
import { RotateCcw, ExternalLink, AlertCircle } from 'lucide-react';

export interface QueueTableProps {
  queue: PublishingDestination[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRefresh: () => void;
}

export const QueueTable: React.FC<QueueTableProps> = ({
  queue,
  onRetry,
  onCancel,
  onRefresh,
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-surface-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Publishing Queue & Post History</h3>
            <p className="text-xs text-slate-400">
              Independent per-destination status, progress, and retry controls
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 bg-surface hover:bg-slate-800 text-slate-300 rounded text-xs font-medium border border-slate-700"
          >
            Refresh Queue
          </button>
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No items in the publishing queue.
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((item) => {
              const isFailed = item.status === 'failed';
              const isPublished = item.status === 'published';
              const isProcessing = ['preparing', 'branding', 'uploading', 'awaiting_confirmation'].includes(item.status);

              return (
                <div 
                  key={item.id} 
                  className={`bg-surface p-4 rounded-xl border transition-all ${
                    isFailed ? 'border-rose-500/40 bg-rose-950/10' :
                    isPublished ? 'border-emerald-500/30' : 'border-border'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <img 
                        src={item.avatar_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150'} 
                        alt={item.account_name} 
                        className="w-10 h-10 rounded-lg object-cover border border-slate-700"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{item.account_name}</h4>
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            item.platform === 'facebook' ? 'bg-blue-500/20 text-blue-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {item.platform}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{item.post_title}</p>
                      </div>
                    </div>

                    {/* Status badge & Actions */}
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                        isPublished ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        isFailed ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        isProcessing ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse' :
                        'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {item.status}
                      </span>

                      {/* Retries only this destination! */}
                      {isFailed && (
                        <button
                          onClick={() => onRetry(item.id)}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Retry Destination
                        </button>
                      )}

                      {isProcessing && (
                        <button
                          onClick={() => onCancel(item.id)}
                          className="px-2.5 py-1 bg-surface hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 rounded text-xs font-medium"
                        >
                          Cancel
                        </button>
                      )}

                      {isPublished && item.remote_post_url && (
                        <a
                          href={item.remote_post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-surface hover:bg-slate-800 text-indigo-400 border border-indigo-500/30 rounded text-xs font-medium flex items-center gap-1"
                        >
                          View Post <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {isProcessing && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Stage: {item.status}...</span>
                        <span>{item.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress || 10}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error details */}
                  {isFailed && item.error_message && (
                    <div className="mt-2.5 p-2.5 bg-rose-950/30 border border-rose-900/50 rounded text-xs text-rose-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Publication Error (Retry Available):</p>
                        <p className="text-[11px] text-rose-400 mt-0.5">{item.error_message}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
