import React from 'react';
import { Category } from '../../types';

export interface ConnectAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  formData: {
    name: string;
    handle: string;
    platform: string;
    accountType: string;
    categoryId: string;
    connectorMode: string;
    accessToken: string;
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string;
    handle: string;
    platform: string;
    accountType: string;
    categoryId: string;
    connectorMode: string;
    accessToken: string;
  }>>;
  onSubmit: (e: React.FormEvent) => void;
}

export const ConnectAccountModal: React.FC<ConnectAccountModalProps> = ({
  isOpen,
  onClose,
  categories,
  formData: newAcc,
  setFormData: setNewAcc,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl">
        <h3 className="text-lg font-black text-slate-100 mb-1">Connect Social Media Account</h3>
        <p className="text-xs text-slate-400 mb-4">Add a new Facebook Page or TikTok account to manage</p>

        <form onSubmit={onSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">Platform</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setNewAcc(prev => ({ ...prev, platform: 'facebook', accountType: 'page' }))}
                className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  newAcc.platform === 'facebook' 
                    ? 'border-blue-500 bg-blue-500/15 text-blue-300' 
                    : 'border-border bg-surface text-slate-400 hover:border-slate-600'
                }`}
              >
                Facebook Page
              </button>
              <button
                type="button"
                onClick={() => setNewAcc(prev => ({ ...prev, platform: 'tiktok', accountType: 'business' }))}
                className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  newAcc.platform === 'tiktok' 
                    ? 'border-rose-500 bg-rose-500/15 text-rose-300' 
                    : 'border-border bg-surface text-slate-400 hover:border-slate-600'
                }`}
              >
                TikTok Account
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Account Display Name</label>
            <input
              type="text"
              required
              placeholder="e.g. ObjectToLife Studio"
              value={newAcc.name}
              onChange={(e) => setNewAcc(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Handle / Username</label>
            <input
              type="text"
              required
              placeholder="e.g. @object.to.life"
              value={newAcc.handle}
              onChange={(e) => setNewAcc(prev => ({ ...prev, handle: e.target.value }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Category Workspace</label>
            <select
              value={newAcc.categoryId}
              onChange={(e) => setNewAcc(prev => ({ ...prev, categoryId: e.target.value }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500 cursor-pointer"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Connection Mode</label>
            <select
              value={newAcc.connectorMode}
              onChange={(e) => setNewAcc(prev => ({ ...prev, connectorMode: e.target.value }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500 cursor-pointer"
            >
              <option value="simulator">Simulator (High-Fidelity Demo)</option>
              <option value="official_api">Official API (Requires Access Token)</option>
              <option value="browser_bridge">Browser Bridge (Playwright Assisted)</option>
            </select>
          </div>

          {newAcc.connectorMode === 'official_api' && (
            <div>
              <label className="block text-slate-300 font-semibold mb-1">OAuth Access Token</label>
              <input
                type="password"
                placeholder="EAA..."
                value={newAcc.accessToken}
                onChange={(e) => setNewAcc(prev => ({ ...prev, accessToken: e.target.value }))}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface hover:bg-surface-hover text-slate-300 rounded-xl font-medium border border-border transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4.5 py-2 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl font-bold shadow-md shadow-terracotta-600/25 transition-all cursor-pointer active:scale-95"
            >
              Save Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
