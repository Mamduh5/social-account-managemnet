import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ActivityEvent } from '../types';
import { 
  Activity, CheckCircle2, AlertTriangle, AlertCircle, 
  Info, RefreshCw 
} from 'lucide-react';

export const ActivityView: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [severityFilter, setSeverityFilter] = useState('');

  const loadData = async () => {
    try {
      const res = await api.getActivity(100);
      setEvents(res.events || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredEvents = severityFilter
    ? events.filter(e => e.severity === severityFilter)
    : events;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 sm:p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Studio Timeline
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>Activity & Notification Feed</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time audit log of publishing completions, comment notifications, and system events
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500 cursor-pointer"
          >
            <option value="">All Severities</option>
            <option value="success">Success Only</option>
            <option value="info">Info Only</option>
            <option value="warning">Warnings Only</option>
            <option value="error">Errors Only</option>
          </select>

          <button
            onClick={loadData}
            className="p-2 bg-surface hover:bg-surface-hover border border-border rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Refresh Activity"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Activity List */}
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No activity events recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((evt) => (
              <div 
                key={evt.id}
                className="bg-surface p-4 rounded-xl border border-border flex items-start gap-3.5 hover:border-slate-600 transition-all text-xs shadow-xs"
              >
                <div className="mt-0.5 shrink-0">
                  {evt.severity === 'success' && <CheckCircle2 className="w-4 h-4 text-sage-400" />}
                  {evt.severity === 'warning' && <AlertTriangle className="w-4 h-4 text-honey-400" />}
                  {evt.severity === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                  {evt.severity === 'info' && <Info className="w-4 h-4 text-blue-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-100 text-sm leading-tight">{evt.title}</span>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap font-mono">{evt.created_at}</span>
                  </div>

                  <p className="text-slate-300 text-xs mt-1 leading-relaxed">{evt.message}</p>

                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 flex-wrap">
                    {evt.account_name && (
                      <span className="text-terracotta-400 font-semibold">{evt.account_name}</span>
                    )}
                    {evt.category_name && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: evt.category_color || '#D95D39' }} />
                        {evt.category_name}
                      </span>
                    )}
                    <span className="uppercase text-[9px] font-mono tracking-wider px-1.5 py-0.5 rounded-md bg-surface-hover border border-border">
                      {evt.type}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
