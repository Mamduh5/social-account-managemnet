import React from 'react';
import { Account } from '../../types';
import { PlatformBadge } from '../common/Badge';
interface Props {
  account: Account;
  isTestingHealth: boolean;
  onTestHealth: (id: string) => void;
  onReconnect: (id: string) => void;
  onModeChange?: (a: Account, m: string) => void;
  onNavigateToBranding: (id: string) => void;
  onPrepare: (id: string) => void;
  onEdit: (a: Account) => void;
  onConnect: (a: Account) => void;
  onArchive: (a: Account) => void;
}
export const AccountCard: React.FC<Props> = ({
  account: a,
  isTestingHealth,
  onTestHealth,
  onReconnect,
  onNavigateToBranding,
  onPrepare,
  onEdit,
  onConnect,
  onArchive,
}) => (
  <article
    data-account-id={a.id}
    className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs space-y-4"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex gap-3 min-w-0">
        {a.avatar_url ? (
          <img
            src={a.avatar_url}
            alt={a.name}
            className="w-12 h-12 rounded-2xl object-cover"
          />
        ) : (
          <span
            aria-label="Default avatar"
            className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center text-lg"
          >
            {a.name[0]}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="font-bold truncate">{a.name}</h3>
          <p className="text-xs text-slate-400">
            {a.handle} | {a.account_type}
          </p>
        </div>
      </div>
      <PlatformBadge platform={a.platform} />
    </div>
    <div className="bg-surface rounded-xl p-3 text-xs space-y-2">
      <p className="font-bold">
        {a.is_demo
          ? 'DEMO / SIMULATOR - no live connection'
          : a.archived_at
            ? 'Archived'
            : {
                registered: 'Registered / Not Connected',
                authorization_required: 'Authorization Required',
                connecting: 'Connecting',
                connected: 'Connected',
                limited: 'Limited Capabilities',
                expired: 'Expired',
                connection_error: 'Connection Error',
                disconnected: 'Disconnected',
              }[a.connection_status || 'registered']}
      </p>
      <p>{a.health_status}</p>
      <p>Category: {a.category_name || 'Unassigned'}</p>
      <p>
        {a.identity_verified_at
          ? 'Identity externally verified through authorization'
          : 'Public identity entered manually - unverified'}
      </p>
    </div>
    <p className="text-xs text-slate-400">
      Connection method:{' '}
      {a.is_demo
        ? 'Simulator'
        : a.connector_mode === 'browser_bridge'
          ? 'Browser-assisted manual workflow'
          : a.identity_verified_at
            ? 'Official API'
            : 'Not connected'}
    </p>
    <div className="flex flex-wrap gap-2 text-[11px]">
      {[
        ['Profile', a.capabilities?.canReadProfile],
        ['Analytics', a.capabilities?.canReadPostMetrics],
        ['Publish', a.capabilities?.canPublish],
        ['Comments', a.capabilities?.canReadComments],
        ['Reply', a.capabilities?.canReply],
        ['Insights', a.capabilities?.canReadInsights],
      ].map(([name, enabled]) => (
        <span key={String(name)} className="bg-surface rounded-md px-2 py-1">
          {enabled ? 'Available:' : 'Unavailable:'} {name}
          {a.is_demo && enabled ? ' (simulated)' : ''}
        </span>
      ))}
    </div>
    <div className="flex flex-wrap gap-3 text-xs text-terracotta-400 font-semibold">
      {!a.archived_at && (
        <>
          <button onClick={() => onNavigateToBranding(a.id)}>
            Configure Branding
          </button>
          <button onClick={() => onPrepare(a.id)}>Prepare Publication</button>
          {!a.is_demo && (
            <>
              <button onClick={() => onEdit(a)}>Edit Account</button>
              <button onClick={() => onConnect(a)}>Connect API</button>
              <button onClick={() => onConnect(a)}>
                Set Up Browser Handoff
              </button>
            </>
          )}
          <button disabled={isTestingHealth} onClick={() => onTestHealth(a.id)}>
            Check Health
          </button>
          <button
            onClick={() => (a.is_demo ? onReconnect(a.id) : onConnect(a))}
          >
            Reconnect
          </button>
        </>
      )}
      <button onClick={() => onArchive(a)}>
        {a.archived_at ? 'Restore Account' : 'Archive Account'}
      </button>
      <a
        href={
          a.public_url ||
          (a.platform === 'facebook'
            ? `https://www.facebook.com/${a.handle.replace('@', '')}`
            : `https://www.tiktok.com/${a.handle}`)
        }
        target="_blank"
        rel="noreferrer"
      >
        Open Native Account
      </a>
    </div>
  </article>
);
