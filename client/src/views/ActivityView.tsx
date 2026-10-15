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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 rounded-xl border border-border">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <span>Activity & Notification Feed</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time audit log of publishing completions, comment notifications, and system events
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-surface border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">All Severities</option>
            <option value="success">Success Only</option>
            <option value="info">Info Only</option>
            <option value="warning">Warnings Only</option>
            <option value="error">Errors Only</option>
          </select>

          <button
            onClick={loadData}
            className="p-2 bg-surface hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 transition-colors"
            title="Refresh Activity"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Activity List */}
      <div className="bg-surface-card border border-border rounded-xl p-5">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No activity events recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((evt) => (
              <div 
                key={evt.id}
                className="bg-surface p-4 rounded-xl border border-border/80 flex items-start gap-3.5 hover:border-slate-700 transition-all text-xs"
              >
                <div className="mt-0.5">
                  {evt.severity === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {evt.severity === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                  {evt.severity === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                  {evt.severity === 'info' && <Info className="w-4 h-4 text-blue-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white text-sm leading-tight">{evt.title}</span>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">{evt.created_at}</span>
                  </div>

                  <p className="text-slate-300 text-xs mt-1">{evt.message}</p>

                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                    {evt.account_name && (
                      <span className="text-indigo-400 font-medium">{evt.account_name}</span>
                    )}
                    {evt.category_name && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: evt.category_color || '#6366F1' }} />
                        {evt.category_name}
                      </span>
                    )}
                    <span className="uppercase text-[9px] font-mono tracking-wider px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
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
