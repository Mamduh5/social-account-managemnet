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

      <p className="text-slate-400">{acc.is_demo ? 'Demo simulation only' : acc.capabilities?.canPublish ? 'Authorized API dispatch' : 'Prepare MP4 for manual native publishing; confirmation required'}</p>
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
