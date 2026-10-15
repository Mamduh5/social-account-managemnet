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
    <div className="bg-surface p-3.5 rounded-lg border border-border text-xs space-y-2">
      <div className="flex items-center justify-between font-semibold text-slate-200">
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${acc.platform === 'facebook' ? 'bg-blue-400' : 'bg-rose-400'}`} />
          {acc.name} ({acc.platform})
        </span>

        <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={config.applyBranding}
            onChange={(e) => onConfigChange(acc.id, { applyBranding: e.target.checked })}
            className="rounded border-slate-700 text-indigo-600 focus:ring-0"
          />
          Apply Moving Watermark
        </label>
      </div>

      <textarea
        rows={2}
        value={config.caption}
        onChange={(e) => onConfigChange(acc.id, { caption: e.target.value })}
        placeholder={`Custom caption for ${acc.name}...`}
        className="w-full bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
      />

      <input
        type="text"
        value={config.hashtags}
        onChange={(e) => onConfigChange(acc.id, { hashtags: e.target.value })}
        placeholder="#hashtags"
        className="w-full bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none focus:border-indigo-500"
      />
    </div>
  );
};
