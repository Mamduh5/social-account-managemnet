import React from 'react';
import { Account } from '../../types';

export interface DestinationConfigCardProps {
  account: Account;
  config: {
    caption: string;
    hashtags: string;
    applyBranding: boolean;
  };
  onConfigChange: (accId: string, updates: Partial<{ caption: string; hashtags: string; applyBranding: boolean }>) => void;
}

export const DestinationConfigCard: React.FC<DestinationConfigCardProps> = ({
  account: acc,
  config,
  onConfigChange,
}) => {
  return (
    <div className="bg-surface p-4 rounded-xl border border-border text-xs space-y-2.5">
      <div className="flex items-center justify-between font-bold text-slate-200">
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${acc.platform === 'facebook' ? 'bg-blue-400' : 'bg-rose-400'}`} />
          {acc.name} ({acc.platform})
        </span>

        <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer font-medium hover:text-slate-200">
          <input
            type="checkbox"
            checked={config.applyBranding}
            onChange={(e) => onConfigChange(acc.id, { applyBranding: e.target.checked })}
            className="rounded border-border text-terracotta-600 focus:ring-0 accent-terracotta-600"
          />
          Apply Moving Watermark
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {acc.is_demo ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Demo Simulation Only
          </span>
        ) : acc.capabilities?.canPublish ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Publish via API
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/15 text-slate-300 border border-slate-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Prepare for Manual Publishing
          </span>
        )}
        <span className="text-[11px] text-slate-400">
          {acc.is_demo
            ? 'Simulated publishing for testing'
            : acc.capabilities?.canPublish
            ? 'Direct official API Reel upload & status verification'
            : acc.platform === 'tiktok'
            ? (acc.connection_status === 'connected' && acc.capabilities?.canReadPostMetrics
                ? 'Display API analytics authorized; manual publishing required by TikTok developer policy'
                : 'Manual publishing required; Display API analytics available upon OAuth authorization')
            : 'Prepares branded MP4 & caption package for browser upload'}
        </span>
      </div>
      <textarea
        rows={2}
        value={config.caption}
        onChange={(e) => onConfigChange(acc.id, { caption: e.target.value })}
        placeholder={`Custom caption for ${acc.name}...`}
        className="w-full bg-surface-card border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500 text-xs"
      />

      <input
        type="text"
        value={config.hashtags}
        onChange={(e) => onConfigChange(acc.id, { hashtags: e.target.value })}
        placeholder="#hashtags"
        className="w-full bg-surface-card border border-border rounded-xl px-3 py-1.5 text-slate-300 focus:outline-none focus:border-terracotta-500 text-xs font-mono"
      />
    </div>
  );
};
