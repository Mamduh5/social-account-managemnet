import React from 'react';
import { themeTokens } from '../../theme/tokens';

export interface PlatformBadgeProps {
  platform: 'facebook' | 'tiktok';
  className?: string;
}

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({ platform, className = '' }) => {
  const token = themeTokens.platforms[platform] || themeTokens.platforms.facebook;
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${token.badge} ${className}`}
    >
      {platform}
    </span>
  );
};

export interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className = '' }) => {
  const statusToken = (themeTokens.statuses as Record<string, any>)[status] || {
    badge: 'bg-surface-hover text-slate-300 border border-border',
  };

  return (
    <span
      className={`text-[11px] font-medium px-2 py-0.5 rounded-md capitalize border ${statusToken.badge} ${className}`}
    >
      {label || status.replace(/_/g, ' ')}
    </span>
  );
};
