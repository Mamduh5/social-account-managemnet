import React from 'react';
import { Account } from '../../types';
import { Search } from 'lucide-react';

export interface CommentFiltersProps {
  platformFilter: string;
  setPlatformFilter: (p: string) => void;
  accountFilter: string;
  setAccountFilter: (a: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  awaitingReplyOnly: boolean;
  setAwaitingReplyOnly: (val: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  accounts: Account[];
  onSearchSubmit: (e: React.FormEvent) => void;
}

export const CommentFilters: React.FC<CommentFiltersProps> = ({
  platformFilter,
  setPlatformFilter,
  accountFilter,
  setAccountFilter,
  statusFilter,
  setStatusFilter,
  awaitingReplyOnly,
  setAwaitingReplyOnly,
  searchQuery,
  setSearchQuery,
  accounts,
  onSearchSubmit,
}) => {
  return (
    <div className="bg-surface-card border border-border p-4 rounded-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Platform Filter */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Platform:</span>
          <div className="flex rounded-lg border border-slate-800 bg-surface p-0.5">
            {[
              { id: '', label: 'All' },
              { id: 'facebook', label: 'Facebook' },
              { id: 'tiktok', label: 'TikTok' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatformFilter(p.id)}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  platformFilter === p.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Account Filter */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Account:</span>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="bg-surface border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.platform})</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="unread">Unread</option>
            <option value="pending">Pending</option>
            <option value="handled">Handled</option>
          </select>
        </div>

        {/* Awaiting Response Toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-medium">
          <input
            type="checkbox"
            checked={awaitingReplyOnly}
            onChange={(e) => setAwaitingReplyOnly(e.target.checked)}
            className="rounded border-slate-700 text-indigo-600 focus:ring-0"
          />
          Needs Response Only
        </label>
      </div>

      {/* Search */}
      <form onSubmit={onSearchSubmit} className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search comment contents, viewer names, or video titles..."
          className="w-full bg-surface border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
      </form>
    </div>
  );
};
