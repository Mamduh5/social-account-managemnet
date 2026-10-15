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
    <div className="bg-surface-card border border-border p-4.5 rounded-2xl space-y-3.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Platform Filter - selector div.bg-surface button preserved */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Platform:</span>
          <div className="flex rounded-xl border border-border bg-surface p-0.5">
            {[
              { id: '', label: 'All' },
              { id: 'facebook', label: 'Facebook' },
              { id: 'tiktok', label: 'TikTok' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatformFilter(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  platformFilter === p.id 
                    ? 'bg-terracotta-600 text-white shadow-xs' 
                    : 'text-slate-400 hover:text-slate-200'
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
            className="bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500 cursor-pointer"
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
            className="bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="unread">Unread</option>
            <option value="pending">Pending</option>
            <option value="handled">Handled</option>
          </select>
        </div>

        {/* Awaiting Response Toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold hover:text-slate-100">
          <input
            type="checkbox"
            checked={awaitingReplyOnly}
            onChange={(e) => setAwaitingReplyOnly(e.target.checked)}
            className="rounded border-border text-terracotta-600 focus:ring-0 accent-terracotta-600"
          />
          Needs Response Only
        </label>
      </div>

      {/* Search */}
      <form onSubmit={onSearchSubmit} className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search comment contents, viewer names, or video titles..."
          className="w-full bg-surface border border-border rounded-xl pl-9.5 pr-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500"
        />
      </form>
    </div>
  );
};
