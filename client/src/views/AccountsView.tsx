import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Account, Category } from '../types';
import { 
  CheckCircle2, AlertCircle, RefreshCw, Plus, ShieldCheck, 
  ExternalLink, Settings2, Trash2, Globe, Layers, Eye
} from 'lucide-react';

interface Props {
  onNavigateToBranding: (accountId: string) => void;
  selectedCategory: string;
}

export const AccountsView: React.FC<Props> = ({ onNavigateToBranding, selectedCategory }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingHealthId, setTestingHealthId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);

  // Form states
  const [newAcc, setNewAcc] = useState({
    name: '',
    handle: '',
    platform: 'facebook',
    accountType: 'page',
    categoryId: '',
    connectorMode: 'simulator',
    accessToken: '',
  });

  const [newCat, setNewCat] = useState({
    name: '',
    description: '',
    color: '#6366F1',
  });

  const loadData = async () => {
    try {
      const [accRes, catRes] = await Promise.all([
        api.getAccounts(),
        api.getCategories(),
      ]);
      setAccounts(accRes.accounts || []);
      setCategories(catRes.categories || []);
      if (!newAcc.categoryId && catRes.categories?.length > 0) {
        setNewAcc(prev => ({ ...prev, categoryId: catRes.categories[0].id }));
      }
    } catch (err) {
      console.error('Failed to load accounts/categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTestHealth = async (id: string) => {
    setTestingHealthId(id);
    try {
      await api.testAccountHealth(id);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setTestingHealthId(null);
    }
  };

  const handleReconnect = async (id: string) => {
    try {
      await api.reconnectAccount(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleModeChange = async (account: Account, newMode: string) => {
    try {
      await api.updateAccount(account.id, { connectorMode: newMode });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAcc.name || !newAcc.handle) return;
    try {
      await api.createAccount(newAcc);
      setShowAddModal(false);
      setNewAcc({
        name: '',
        handle: '',
        platform: 'facebook',
        accountType: 'page',
        categoryId: categories[0]?.id || '',
        connectorMode: 'simulator',
        accessToken: '',
      });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat.name) return;
    try {
      await api.createCategory(newCat);
      setShowCatModal(false);
      setNewCat({ name: '', description: '', color: '#6366F1' });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredAccounts = selectedCategory === 'all'
    ? accounts
    : accounts.filter(a => a.category_id === selectedCategory || a.category_slug === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 rounded-xl border border-border">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Social Media Accounts & Workspaces</span>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
              {filteredAccounts.length} Connected
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage your Facebook Pages, TikTok accounts, and brand identity kits
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowCatModal(true)}
            className="px-3 py-2 bg-surface hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" /> New Category
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Connect Account
          </button>
        </div>
      </div>

      {/* Content Categories Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const catAccCount = accounts.filter(a => a.category_id === cat.id).length;
          return (
            <div key={cat.id} className="bg-surface-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <h4 className="font-bold text-white text-sm">{cat.name}</h4>
                </div>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  {catAccCount} accounts
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2 line-clamp-2">{cat.description}</p>
            </div>
          );
        })}
      </div>

      {/* Accounts List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredAccounts.map((acc) => {
          const isHealthy = acc.status === 'connected';
          return (
            <div 
              key={acc.id} 
              className={`bg-surface-card border rounded-xl p-5 transition-all ${
                isHealthy ? 'border-border' : 'border-amber-500/50 bg-amber-950/10'
              }`}
            >
              {/* Account Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img 
                    src={acc.avatar_url} 
                    alt={acc.name} 
                    className="w-12 h-12 rounded-xl object-cover border border-slate-700" 
                  />
                  <div>
                    <h3 className="text-base font-bold text-white">{acc.name}</h3>
                    <p className="text-xs text-slate-400 flex items-center gap-2">
                      <span>{acc.handle}</span>
                      <span className="text-slate-600">•</span>
                      <span className="capitalize">{acc.account_type}</span>
                    </p>
                  </div>
                </div>

                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                  acc.platform === 'facebook' 
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                    : 'bg-rose-600/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {acc.platform}
                </span>
              </div>

              {/* Status and Health */}
              <div className="mt-4 p-3 bg-surface rounded-lg border border-border/80 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-1.5 font-medium">
                    {isHealthy ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className={isHealthy ? 'text-slate-200' : 'text-amber-300'}>
                      {acc.health_status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Category: <span className="text-slate-300 font-medium">{acc.category_name || 'Unassigned'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTestHealth(acc.id)}
                    disabled={testingHealthId === acc.id}
                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-xs transition-colors"
                    title="Check Health"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingHealthId === acc.id ? 'animate-spin' : ''}`} />
                  </button>

                  {!isHealthy && (
                    <button
                      onClick={() => handleReconnect(acc.id)}
                      className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-xs font-semibold"
                    >
                      Reconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Connector Mode Selector */}
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Connector Mode:</span>
                <select
                  value={acc.connector_mode}
                  onChange={(e) => handleModeChange(acc, e.target.value)}
                  className="bg-surface text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="simulator">Simulator (High-Fidelity Demo)</option>
                  <option value="official_api">Official API (Graph/TikTok API)</option>
                  <option value="browser_bridge">Browser Bridge (Playwright)</option>
                </select>
              </div>

              {/* Capabilities Honest Matrix */}
              <div className="mt-3 pt-3 border-t border-slate-800/80">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
                  Discovered Capabilities
                </p>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className={`px-2 py-0.5 rounded font-medium ${
                    acc.capabilities?.canPublish ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {acc.capabilities?.canPublish ? '✓ Publish' : '✕ Publish'}
                  </span>
                  <span className={`px-2 py-0.5 rounded font-medium ${
                    acc.capabilities?.canSchedule ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {acc.capabilities?.canSchedule ? '✓ Schedule' : '✕ Schedule'}
                  </span>
                  <span className={`px-2 py-0.5 rounded font-medium ${
                    acc.capabilities?.canReadComments ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {acc.capabilities?.canReadComments ? '✓ Comments' : '✕ Comments (Handoff)'}
                  </span>
                  <span className={`px-2 py-0.5 rounded font-medium ${
                    acc.capabilities?.canReply ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {acc.capabilities?.canReply ? '✓ Reply' : '✕ Reply (Handoff)'}
                  </span>
                  <span className={`px-2 py-0.5 rounded font-medium ${
                    acc.capabilities?.canReadInsights ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {acc.capabilities?.canReadInsights ? '✓ Insights' : '✕ Insights'}
                  </span>
                </div>
              </div>

              {/* Footer Links */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <button
                  onClick={() => onNavigateToBranding(acc.id)}
                  className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
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
        })}
      </div>

      {/* Modal: Connect Account */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-card border border-border w-full max-w-md rounded-xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Connect Social Media Account</h3>
            <p className="text-xs text-slate-400 mb-4">Add a new Facebook Page or TikTok account to manage</p>

            <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
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
                  onClick={() => setShowAddModal(false)}
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
      )}

      {/* Modal: New Category */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-card border border-border w-full max-w-md rounded-xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Create Content Category</h3>
            <p className="text-xs text-slate-400 mb-4">Group social accounts by AI video production theme</p>

            <form onSubmit={handleCreateCategory} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Micro Commercials"
                  value={newCat.name}
                  onChange={(e) => setNewCat(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Short summary of this content category"
                  value={newCat.description}
                  onChange={(e) => setNewCat(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Workspace Accent Color</label>
                <input
                  type="color"
                  value={newCat.color}
                  onChange={(e) => setNewCat(prev => ({ ...prev, color: e.target.value }))}
                  className="w-16 h-8 bg-transparent cursor-pointer rounded"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCatModal(false)}
                  className="px-3.5 py-2 bg-surface hover:bg-slate-800 text-slate-300 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold"
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
