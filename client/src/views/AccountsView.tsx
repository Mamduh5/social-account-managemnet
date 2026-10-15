import React, { useState } from 'react';
import { api } from '../api/client';
import { Layers, Plus, Users } from 'lucide-react';
import { CategoryCard } from '../components/accounts/CategoryCard';
import { AccountCard } from '../components/accounts/AccountCard';
import { ConnectAccountModal } from '../components/accounts/ConnectAccountModal';
import { CreateCategoryModal } from '../components/accounts/CreateCategoryModal';
import { useAccounts } from '../hooks/useAccounts';

interface Props {
  onNavigateToBranding: (accountId: string) => void;
  selectedCategory: string;
}

export const AccountsView: React.FC<Props> = ({ onNavigateToBranding, selectedCategory }) => {
  const {
    accounts,
    categories,
    testingHealthId,
    loadData,
    testHealth,
    reconnect,
    changeMode,
  } = useAccounts();

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
    color: '#D95D39',
  });

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAcc.name || !newAcc.handle) return;
    try {
      await api.createAccount({
        ...newAcc,
        categoryId: newAcc.categoryId || categories[0]?.id || '',
      });
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
      setNewCat({ name: '', description: '', color: '#D95D39' });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 sm:p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Channel Workspaces
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>Social Media Accounts & Workspaces</span>
            <span className="text-xs bg-surface text-slate-300 px-2.5 py-0.5 rounded-full border border-border font-semibold">
              {filteredAccounts.length} Connected
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage your Facebook Pages, TikTok accounts, and brand identity kits
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          <button
            onClick={() => setShowCatModal(true)}
            className="px-3.5 py-2 bg-surface hover:bg-surface-hover text-slate-200 border border-border rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Layers className="w-3.5 h-3.5 text-terracotta-400" /> New Category
          </button>
          <button
            onClick={() => {
              if (!newAcc.categoryId && categories.length > 0) {
                setNewAcc(prev => ({ ...prev, categoryId: categories[0].id }));
              }
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-terracotta-600/25 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> Connect Account
          </button>
        </div>
      </div>

      {/* Content Categories Cards (Grid selector preserved for tests) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const catAccCount = accounts.filter(a => a.category_id === cat.id).length;
          return (
            <CategoryCard
              key={cat.id}
              category={cat}
              accountCount={catAccCount}
            />
          );
        })}
      </div>

      {/* Accounts List (Grid selector preserved for tests) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredAccounts.map((acc) => (
          <AccountCard
            key={acc.id}
            account={acc}
            isTestingHealth={testingHealthId === acc.id}
            onTestHealth={testHealth}
            onReconnect={reconnect}
            onModeChange={changeMode}
            onNavigateToBranding={onNavigateToBranding}
          />
        ))}
      </div>

      {/* Modals */}
      <ConnectAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        categories={categories}
        formData={newAcc}
        setFormData={setNewAcc}
        onSubmit={handleCreateAccount}
      />

      <CreateCategoryModal
        isOpen={showCatModal}
        onClose={() => setShowCatModal(false)}
        formData={newCat}
        setFormData={setNewCat}
        onSubmit={handleCreateCategory}
      />
    </div>
  );
};
