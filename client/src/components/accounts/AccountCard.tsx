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
      className={`bg-surface-card border rounded-2xl p-5 transition-all shadow-xs ${
        isHealthy ? 'border-border' : 'border-honey-500/40 bg-honey-950/10'
      }`}
    >
      {/* Account Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img 
            src={acc.avatar_url} 
            alt={acc.name} 
            className="w-12 h-12 rounded-2xl object-cover border border-border shrink-0 shadow-xs" 
          />
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-100 truncate">{acc.name}</h3>
            <p className="text-xs text-slate-400 flex items-center gap-2 truncate">
              <span className="font-mono">{acc.handle}</span>
              <span className="text-slate-600">•</span>
              <span className="capitalize">{acc.account_type}</span>
            </p>
          </div>
        </div>

        <PlatformBadge platform={acc.platform} />
      </div>

      {/* Status and Health */}
      <div className="mt-4 p-3.5 bg-surface rounded-xl border border-border flex items-center justify-between text-xs">
        <div>
          <div className="flex items-center gap-1.5 font-semibold">
            {isHealthy ? (
              <CheckCircle2 className="w-4 h-4 text-sage-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-honey-400" />
            )}
            <span className={isHealthy ? 'text-slate-200' : 'text-honey-300'}>
              {acc.health_status}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Category: <span className="text-slate-200 font-medium">{acc.category_name || 'Unassigned'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTestHealth(acc.id)}
            disabled={isTestingHealth}
            className="p-1.5 hover:bg-surface-hover text-slate-400 hover:text-slate-200 rounded-lg text-xs transition-colors cursor-pointer"
            title="Check Health"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingHealth ? 'animate-spin text-terracotta-400' : ''}`} />
          </button>

          {!isHealthy && (
            <button
              onClick={() => onReconnect(acc.id)}
              className="px-2.5 py-1 bg-honey-500/15 hover:bg-honey-500/25 text-honey-300 border border-honey-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Connector Mode Selector */}
      <div className="mt-3.5 flex items-center justify-between text-xs">
        <span className="text-slate-400 font-medium">Connector Mode:</span>
        <select
          value={acc.connector_mode}
          onChange={(e) => onModeChange(acc, e.target.value)}
          className="bg-surface text-slate-200 border border-border rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-terracotta-500 cursor-pointer"
        >
          <option value="simulator">Simulator (High-Fidelity Demo)</option>
          <option value="official_api">Official API (Graph/TikTok API)</option>
          <option value="browser_bridge">Browser Bridge (Playwright)</option>
        </select>
      </div>

      {/* Capabilities Honest Matrix */}
      <div className="mt-3 pt-3 border-t border-border/80">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-2">
          Discovered Capabilities
        </p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className={`px-2 py-0.5 rounded-md font-medium border ${
            acc.capabilities?.canPublish ? 'bg-sage-500/10 text-sage-400 border-sage-500/20' : 'bg-surface-hover text-slate-500 border-border'
          }`}>
            {acc.capabilities?.canPublish ? '✓ Publish' : '✕ Publish'}
          </span>
          <span className={`px-2 py-0.5 rounded-md font-medium border ${
            acc.capabilities?.canSchedule ? 'bg-sage-500/10 text-sage-400 border-sage-500/20' : 'bg-surface-hover text-slate-500 border-border'
          }`}>
            {acc.capabilities?.canSchedule ? '✓ Schedule' : '✕ Schedule'}
          </span>
          <span className={`px-2 py-0.5 rounded-md font-medium border ${
            acc.capabilities?.canReadComments ? 'bg-sage-500/10 text-sage-400 border-sage-500/20' : 'bg-surface-hover text-slate-500 border-border'
          }`}>
            {acc.capabilities?.canReadComments ? '✓ Comments' : '✕ Comments (Handoff)'}
          </span>
          <span className={`px-2 py-0.5 rounded-md font-medium border ${
            acc.capabilities?.canReply ? 'bg-sage-500/10 text-sage-400 border-sage-500/20' : 'bg-surface-hover text-slate-500 border-border'
          }`}>
            {acc.capabilities?.canReply ? '✓ Reply' : '✕ Reply (Handoff)'}
          </span>
          <span className={`px-2 py-0.5 rounded-md font-medium border ${
            acc.capabilities?.canReadInsights ? 'bg-sage-500/10 text-sage-400 border-sage-500/20' : 'bg-surface-hover text-slate-500 border-border'
          }`}>
            {acc.capabilities?.canReadInsights ? '✓ Insights' : '✕ Insights'}
          </span>
        </div>
      </div>

      {/* Footer Links */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
        <button
          onClick={() => onNavigateToBranding(acc.id)}
          className="text-terracotta-400 hover:text-terracotta-300 font-semibold flex items-center gap-1.5 cursor-pointer"
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
