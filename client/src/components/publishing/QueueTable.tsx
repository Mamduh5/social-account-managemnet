import React, { useState } from 'react';
import { HandoffModal } from './HandoffModal';
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
  const [handoffId, setHandoffId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Publishing Queue & Post History</h3>
            <p className="text-xs text-slate-400">
              Independent per-destination status, progress, and retry controls
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="px-3.5 py-1.5 bg-surface hover:bg-surface-hover text-slate-200 rounded-xl text-xs font-semibold border border-border transition-colors cursor-pointer self-start sm:self-auto"
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
              const isInterrupted = item.status === 'preparing' && item.error_message?.startsWith('Interrupted by server restart');
              const isFailed = item.status === 'failed' || isInterrupted;
              const isPublished = item.status === 'published';
              const isProcessing = ['preparing', 'branding', 'uploading'].includes(item.status);

              return (
                <div 
                  data-destination-id={item.id}
                  key={item.id} 
                  className={`bg-surface p-4 rounded-2xl border transition-all shadow-xs ${
                    isFailed ? 'border-rose-500/40 bg-rose-950/10' :
                    isPublished ? 'border-sage-500/30' : 'border-border'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img 
                        src={item.avatar_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150'} 
                        alt={item.account_name} 
                        className="w-10 h-10 rounded-xl object-cover border border-border shrink-0" 
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-100 text-sm truncate">{item.account_name}</h4>
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                            item.platform === 'facebook' ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                          }`}>
                            {item.platform}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">{item.post_title}</p>
                        {item.status === 'scheduled' && item.scheduled_at && (
                          <p className="text-xs text-slate-300 mt-1">Scheduled for {new Date(item.scheduled_at).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })} (Asia/Bangkok)</p>
                        )}
                      </div>
                    </div>

                    {/* Status badge & Actions */}
                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                      {item.is_demo ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface border border-border text-slate-400">
                          Simulator
                        </span>
                      ) : item.confirmation_source === 'api' || (!item.confirmation_source && item.verification_status === 'confirmed') ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> API Dispatch
                        </span>
                      ) : item.status === 'scheduled' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface border border-border text-slate-400">Pending Dispatch</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                          Manual Handoff
                        </span>
                      )}
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${
                        isPublished ? 'bg-sage-500/15 text-sage-400 border-sage-500/30' :
                        isFailed ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                        isProcessing ? 'bg-honey-500/15 text-honey-300 border-honey-500/30 animate-pulse' :
                        'bg-surface-hover text-slate-300 border-border'
                      }`}>
                        {item.is_demo ? 'DEMO: ' : ''}{item.status === 'awaiting_confirmation' ? 'Awaiting Manual Confirmation' : item.status}
                      </span>

                      {item.status === 'awaiting_confirmation' && <button className="text-terracotta-400 font-bold" onClick={() => setHandoffId(item.id)}>Open Prepared Package</button>}
                      {/* Retries only this destination! */}
                      {isFailed && (
                        <button
                          onClick={() => onRetry(item.id)}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Retry Destination
                        </button>
                      )}

                      {(isProcessing || item.status === 'scheduled') && (
                        <button
                          onClick={() => onCancel(item.id)}
                          className="px-2.5 py-1 bg-surface hover:bg-surface-hover text-slate-400 hover:text-slate-200 border border-border rounded-xl text-xs font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}

                      {isPublished && item.remote_post_url && (
                        <a
                          href={item.remote_post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-surface hover:bg-surface-hover text-terracotta-400 border border-border rounded-xl text-xs font-medium flex items-center gap-1"
                        >
                          View Post <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {isProcessing && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1 font-medium">
                        <span>Stage: {item.is_demo ? 'DEMO: ' : ''}{item.status === 'awaiting_confirmation' ? 'Awaiting Manual Confirmation' : item.status}...</span>
                        <span>{item.progress}%</span>
                      </div>
                      <div className="w-full bg-surface-hover rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-terracotta-500 to-honey-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress || 10}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error details */}
                  {isFailed && item.error_message && (
                    <div className="mt-2.5 p-2.5 bg-rose-950/20 border border-rose-900/40 rounded-xl text-xs text-rose-300 flex items-start gap-2">
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
      {handoffId && <HandoffModal destinationId={handoffId} onClose={() => setHandoffId(null)} onConfirmed={onRefresh} />}
    </div>
  );
};
