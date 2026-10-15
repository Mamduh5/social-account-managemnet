import React from 'react';
import { Account } from '../../types';
import { PlatformBadge } from '../common/Badge';
import { 
  CheckCircle2, AlertCircle, RefreshCw, Settings2, ExternalLink 
} from 'lucide-react';

export interface AccountCardProps {
  account: Account;
  isTestingHealth: boolean;
  onTestHealth: (id: string) => void;
  onReconnect: (id: string) => void;
  onModeChange: (account: Account, newMode: string) => void;
  onNavigateToBranding: (id: string) => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account: acc,
  isTestingHealth,
  onTestHealth,
  onReconnect,
  onModeChange,
  onNavigateToBranding,
}) => {
  const isHealthy = acc.status === 'connected';

  return (
    <div 
      className={`bg-surface-card border rounded-xl p-5 transition-all ${
        isHealthy ? 'border-border' : 'border-amber-500/50 bg-amber-950/10'
      }`}
    >
      {/* Account Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <img 
            src={acc.avatar_url} 
            alt={acc.name} 
            className="w-12 h-12 rounded-xl object-cover border border-slate-700" 
          />
          <div>
            <h3 className="text-base font-bold text-white">{acc.name}</h3>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>{acc.handle}</span>
              <span className="text-slate-600">•</span>
              <span className="capitalize">{acc.account_type}</span>
            </p>
          </div>
        </div>

        <PlatformBadge platform={acc.platform} />
      </div>

      {/* Status and Health */}
      <div className="mt-4 p-3 bg-surface rounded-lg border border-border/80 flex items-center justify-between text-xs">
        <div>
          <div className="flex items-center gap-1.5 font-medium">
            {isHealthy ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
            <span className={isHealthy ? 'text-slate-200' : 'text-amber-300'}>
              {acc.health_status}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Category: <span className="text-slate-300 font-medium">{acc.category_name || 'Unassigned'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTestHealth(acc.id)}
            disabled={isTestingHealth}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-xs transition-colors"
            title="Check Health"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingHealth ? 'animate-spin' : ''}`} />
          </button>

          {!isHealthy && (
            <button
              onClick={() => onReconnect(acc.id)}
              className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-xs font-semibold"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Connector Mode Selector */}
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-slate-400 font-medium">Connector Mode:</span>
        <select
          value={acc.connector_mode}
          onChange={(e) => onModeChange(acc, e.target.value)}
          className="bg-surface text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500"
        >
          <option value="simulator">Simulator (High-Fidelity Demo)</option>
          <option value="official_api">Official API (Graph/TikTok API)</option>
          <option value="browser_bridge">Browser Bridge (Playwright)</option>
        </select>
      </div>

      {/* Capabilities Honest Matrix */}
      <div className="mt-3 pt-3 border-t border-slate-800/80">
        <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
          Discovered Capabilities
        </p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className={`px-2 py-0.5 rounded font-medium ${
            acc.capabilities?.canPublish ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {acc.capabilities?.canPublish ? '✓ Publish' : '✕ Publish'}
          </span>
          <span className={`px-2 py-0.5 rounded font-medium ${
            acc.capabilities?.canSchedule ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {acc.capabilities?.canSchedule ? '✓ Schedule' : '✕ Schedule'}
          </span>
          <span className={`px-2 py-0.5 rounded font-medium ${
            acc.capabilities?.canReadComments ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {acc.capabilities?.canReadComments ? '✓ Comments' : '✕ Comments (Handoff)'}
          </span>
          <span className={`px-2 py-0.5 rounded font-medium ${
            acc.capabilities?.canReply ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {acc.capabilities?.canReply ? '✓ Reply' : '✕ Reply (Handoff)'}
          </span>
          <span className={`px-2 py-0.5 rounded font-medium ${
            acc.capabilities?.canReadInsights ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {acc.capabilities?.canReadInsights ? '✓ Insights' : '✕ Insights'}
          </span>
        </div>
      </div>

      {/* Footer Links */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
        <button
          onClick={() => onNavigateToBranding(acc.id)}
          className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
        >
          <Settings2 className="w-3.5 h-3.5" /> Edit Brand Kit
        </button>

        <a 
          href={acc.platform === 'facebook' ? `https://facebook.com/${acc.handle.replace('@', '')}` : `https://tiktok.com/${acc.handle}`}
          target="_blank" 
          rel="noreferrer"
          className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[11px]"
        >
          View Native <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};
