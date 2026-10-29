import React, { useState } from 'react';
import { api } from '../../api/client';
import { HandoffModal } from './HandoffModal';
import { PublishingDestination } from '../../types';
import { RotateCcw, ExternalLink, AlertCircle } from 'lucide-react';
import { usePublishingHistory } from '../../hooks/usePublishingHistory';
import type { HistoryPeriod, HistoryTimestamp } from '../../api/publishing-history';

export interface QueueTableProps {
  queue: PublishingDestination[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRefresh: () => void;
  activeTotal?: number;
  activeHasMore?: boolean;
  enabled?: boolean;
}

const DestinationList: React.FC<QueueTableProps & { title: string; timestamp?: HistoryTimestamp }> = ({
  queue,
  onRetry,
  onCancel,
  onRefresh,
  title,
  timestamp = 'updated',
}) => {
  const [reconcileError, setReconcileError] = useState('');
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  async function reconcile(id: string) {
    setReconcilingId(id); setReconcileError('');
    try { await api.reconcileDestination(id); onRefresh(); } catch (error) { setReconcileError(error instanceof Error ? error.message : 'Reconciliation failed.'); } finally { setReconcilingId(null); }
  }
  const [handoffId, setHandoffId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{title}</h3>
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

        {reconcileError && <p role="alert" className="text-xs text-rose-300 mb-3">{reconcileError}</p>}
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
              const requiresReconciliation = isFailed && Boolean(item.submission_state || item.remote_post_id);
              const isProcessing = ['preparing', 'branding', 'uploading'].includes(item.status);
              const displayTime = timestamp === 'created' ? item.created_at : timestamp === 'scheduled' ? item.scheduled_at : item.updated_at;
              const displayLabel = timestamp === 'created' ? 'Created' : timestamp === 'scheduled' ? 'Scheduled' : 'Updated';

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
                        src={item.avatar_url || '/avatar.svg'}
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
                        <p className="text-[10px] text-slate-400 uppercase mt-1">{(item.content_type || 'reel').replace('_', ' ')}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{displayLabel}: {displayTime ? new Date(displayTime.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(displayTime) ? '' : 'Z')).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false }) + ' (Asia/Bangkok)' : timestamp === 'scheduled' ? 'Not scheduled' : 'Unavailable'}</p>
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
                      {requiresReconciliation && <button disabled={reconcilingId === item.id} onClick={() => void reconcile(item.id)} className="px-3 py-1 text-xs rounded-xl bg-surface border border-border text-amber-300 disabled:opacity-40">{reconcilingId === item.id ? 'Checking…' : 'Reconcile Read-only'}</button>}
                      {/* Retries only this destination! */}
                      {isFailed && !requiresReconciliation && (
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
                        <p className="font-semibold">{requiresReconciliation ? 'Remote outcome requires reconciliation; replay is blocked' : 'Publication Error (Retry Available):'}</p>
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

const filterClass = 'bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-200';
export const QueueTable: React.FC<QueueTableProps> = ({ queue, onRetry, onCancel, onRefresh, activeTotal, activeHasMore, enabled = true }) => {
  const history = usePublishingHistory(enabled);
  const refresh = () => { onRefresh(); void history.refresh(); };
  const filters = history.filters;
  return <section className="space-y-4" aria-label="Publishing Queue & Post History">
    <h2 className="text-lg font-bold">Publishing Queue & Post History</h2>
    <details className="border border-border rounded-2xl p-3 bg-surface-card">
      <summary className="cursor-pointer text-sm font-semibold">Active queue ({activeTotal ?? queue.length})</summary>
      {activeHasMore && <p className="text-xs text-honey-400 mt-2">Showing the first {queue.length} active destinations. Browse all records with the status filters below.</p>}
      <DestinationList title="Active publishing destinations" queue={queue} onRetry={onRetry} onCancel={onCancel} onRefresh={refresh} />
    </details>
    <div className="bg-surface-card border border-border rounded-2xl p-4 space-y-3">
      <h3 className="font-semibold text-sm">Browse publishing history</h3>
      <p className="text-xs text-slate-400">One row per destination. Retries update the same record. Date filters use Asia/Bangkok; calendar weeks start Monday. Completed means published, including explicitly recorded manual confirmations.</p>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs space-y-1">Timestamp<select aria-label="History timestamp" className={`${filterClass} block`} value={filters.timestamp} onChange={e => history.updateFilters({ timestamp: e.target.value as HistoryTimestamp })}><option value="created">Created</option><option value="scheduled">Scheduled</option><option value="updated">Updated</option></select></label>
        <label className="text-xs space-y-1">Order<select aria-label="History order" className={`${filterClass} block`} value={filters.direction} onChange={e => history.updateFilters({ direction: e.target.value as 'asc' | 'desc' })}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label>
        <label className="text-xs space-y-1">Outcome<select aria-label="History outcome" className={`${filterClass} block`} value={filters.outcome} onChange={e => history.updateFilters({ outcome: e.target.value as typeof filters.outcome, status: '' })}><option value="all">All outcomes</option><option value="completed">Completed / Published</option><option value="failed">Failed</option></select></label>
        <label className="text-xs space-y-1">Status<select aria-label="History status" className={`${filterClass} block`} value={filters.status} onChange={e => history.updateFilters({ status: e.target.value, outcome: 'all' })}><option value="">All statuses</option>{['draft','scheduled','preparing','branding','uploading','awaiting_confirmation','published','failed','cancelled'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
        <label className="text-xs space-y-1">Platform<select aria-label="History platform" className={`${filterClass} block`} value={filters.platform} onChange={e => history.updateFilters({ platform: e.target.value as typeof filters.platform })}><option value="">All platforms</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option></select></label>
        <label className="text-xs space-y-1">Dates<select aria-label="History date period" className={`${filterClass} block`} value={filters.period} onChange={e => history.updateFilters({ period: e.target.value as HistoryPeriod })}><option value="all">All dates</option><option value="today">Today</option><option value="date">Specific date</option><option value="week">Calendar week</option><option value="last7">Last 7 days</option><option value="month">Calendar month</option><option value="last30">Last 30 days</option><option value="custom">Custom range</option></select></label>
        {['date','week','month'].includes(filters.period) && <label className="text-xs space-y-1">Date in selected period<input aria-label="History date" className={`${filterClass} block`} type="date" value={filters.date} onChange={e => history.updateFilters({ date: e.target.value })} /></label>}
        {filters.period === 'custom' && <><label className="text-xs space-y-1">From<input aria-label="History from date" className={`${filterClass} block`} type="date" value={filters.fromDate} onChange={e => history.updateFilters({ fromDate: e.target.value })} /></label><label className="text-xs space-y-1">Through<input aria-label="History through date" className={`${filterClass} block`} type="date" value={filters.toDate} onChange={e => history.updateFilters({ toDate: e.target.value })} /></label></>}
        <label className="text-xs space-y-1">Per page<select aria-label="History page size" className={`${filterClass} block`} value={filters.limit} onChange={e => history.updateFilters({ limit: Number(e.target.value) })}>{[20,50,100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      </div>
      <p className="text-xs text-slate-400">{filters.timestamp === 'created' ? 'Created: when this destination was registered.' : filters.timestamp === 'scheduled' ? 'Scheduled: planned publication time; unscheduled records appear last.' : 'Updated: most recent local destination change; records may move when their status changes.'}</p>
      {history.error && <p role="alert" className="text-xs text-rose-300">{history.error} <button className="underline" onClick={() => void history.refresh()}>Retry history read</button></p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs" aria-live="polite">
        <span>{history.loading ? 'Loading history…' : history.page ? `${history.page.total === 0 ? 0 : history.offset + 1}–${history.offset + history.page.items.length} of ${history.page.total} destinations` : 'History has not loaded.'}</span>
        <div className="flex gap-2"><button className="scc-btn-secondary" disabled={history.loading || history.offset === 0} onClick={() => history.setOffset(Math.max(0, history.offset - filters.limit))}>Previous history page</button><button className="scc-btn-secondary" disabled={history.loading || !history.page?.hasMore} onClick={() => history.setOffset(history.offset + filters.limit)}>Next history page</button><button className="scc-btn-secondary" disabled={history.loading} onClick={() => void history.refresh()}>Refresh history</button></div>
      </div>
    </div>
    {history.page && <DestinationList title="Destination history" timestamp={filters.timestamp} queue={history.page.items} onRetry={onRetry} onCancel={onCancel} onRefresh={refresh} />}
  </section>;
};
