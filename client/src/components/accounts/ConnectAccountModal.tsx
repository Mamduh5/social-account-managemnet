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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-card border border-border w-full max-w-md rounded-xl p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-1">Connect Social Media Account</h3>
        <p className="text-xs text-slate-400 mb-4">Add a new Facebook Page or TikTok account to manage</p>

        <form onSubmit={onSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Platform</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewAcc(prev => ({ ...prev, platform: 'facebook', accountType: 'page' }))}
                className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-2 ${
                  newAcc.platform === 'facebook' 
                    ? 'border-blue-500 bg-blue-500/20 text-blue-300' 
                    : 'border-slate-700 bg-surface text-slate-400'
                }`}
              >
                Facebook Page
              </button>
              <button
                type="button"
                onClick={() => setNewAcc(prev => ({ ...prev, platform: 'tiktok', accountType: 'business' }))}
                className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-2 ${
                  newAcc.platform === 'tiktok' 
                    ? 'border-rose-500 bg-rose-500/20 text-rose-300' 
                    : 'border-slate-700 bg-surface text-slate-400'
                }`}
              >
                TikTok Account
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Account Display Name</label>
            <input
              type="text"
              required
              placeholder="e.g. ObjectToLife Studio"
              value={newAcc.name}
              onChange={(e) => setNewAcc(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Handle / Username</label>
            <input
              type="text"
              required
              placeholder="e.g. @object.to.life"
              value={newAcc.handle}
              onChange={(e) => setNewAcc(prev => ({ ...prev, handle: e.target.value }))}
              className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Category Workspace</label>
            <select
              value={newAcc.categoryId}
              onChange={(e) => setNewAcc(prev => ({ ...prev, categoryId: e.target.value }))}
              className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Connection Mode</label>
            <select
              value={newAcc.connectorMode}
              onChange={(e) => setNewAcc(prev => ({ ...prev, connectorMode: e.target.value }))}
              className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="simulator">Simulator (High-Fidelity Demo)</option>
              <option value="official_api">Official API (Requires Access Token)</option>
              <option value="browser_bridge">Browser Bridge (Playwright Assisted)</option>
            </select>
          </div>

          {newAcc.connectorMode === 'official_api' && (
            <div>
              <label className="block text-slate-300 font-medium mb-1">OAuth Access Token</label>
              <input
                type="password"
                placeholder="EAA..."
                value={newAcc.accessToken}
                onChange={(e) => setNewAcc(prev => ({ ...prev, accessToken: e.target.value }))}
                className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-surface hover:bg-slate-800 text-slate-300 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold"
            >
              Save Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
