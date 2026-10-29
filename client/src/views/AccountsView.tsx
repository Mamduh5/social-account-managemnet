import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Account } from '../types';
import { CategoryCard } from '../components/accounts/CategoryCard';
import { AccountCard } from '../components/accounts/AccountCard';
import {
  ConnectAccountModal,
  emptyAccountForm,
} from '../components/accounts/ConnectAccountModal';
import { ConnectionModal } from '../components/accounts/ConnectionModal';
import { CreateCategoryModal } from '../components/accounts/CreateCategoryModal';
import { useAccounts } from '../hooks/useAccounts';
interface Props {
  onNavigateToBranding: (id: string) => void;
  onPreparePublication: (id: string) => void;
  selectedCategory: string;
}
export const AccountsView: React.FC<Props> = ({
  onNavigateToBranding,
  onPreparePublication,
  selectedCategory,
}) => {
  const {
    accounts,
    error: resourceError,
    categories,
    testingHealthId,
    loadData,
    testHealth,
    reconnect,
  } = useAccounts();
  const [showAdd, setShowAdd] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [connection, setConnection] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyAccountForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [newCat, setNewCat] = useState({
    name: '',
    description: '',
    color: '#D95D39',
  });
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(
      'connectionAccount'
    );
    if (id && accounts.length) {
      setConnection(accounts.find((a) => a.id === id) || null);
      window.history.replaceState({}, '', '/');
    }
  }, [accounts]);
  useEffect(
    () => setPage(0),
    [showDemo, showArchived, search, selectedCategory]
  );
  function add() {
    setEditing(null);
    setForm(emptyAccountForm());
    setError('');
    setShowAdd(true);
  }
  function edit(a: Account) {
    setEditing(a);
    setForm({
      name: a.name,
      handle: a.public_url || a.handle,
      platform: a.platform,
      accountType: a.account_type,
      categoryId: a.category_id || '',
      avatarUrl: a.avatar_url || '',
      externalId: a.external_id || '',
      description: a.description || '',
      notes: a.notes || '',
      publishingPreferences: {
        defaultCaption: a.settings?.defaultCaption || '',
        defaultHashtags: a.settings?.defaultHashtags || '',
        applyBranding: a.settings?.applyBranding !== false,
      },
    });
    setError('');
    setShowAdd(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) await api.updateAccount(editing.id, form);
      else await api.createAccount(form);
      setShowAdd(false);
      setNotice(
        'Account saved. Configure Branding, Prepare Publication, or connect later using the account actions below.'
      );
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function archive(a: Account) {
    try {
      if (a.archived_at) await api.restoreAccount(a.id);
      else await api.archiveAccount(a.id);
      await loadData();
      setNotice(
        'Account updated. Publication history, branding and original videos are preserved.'
      );
    } catch (e: any) {
      setError(e.message);
    }
  }
  const filtered = accounts.filter(
    (a) =>
      (showArchived || !a.archived_at) &&
      (showDemo || !a.is_demo) &&
      (selectedCategory === 'all' ||
        a.category_id === selectedCategory ||
        a.category_slug === selectedCategory) &&
      `${a.name} ${a.handle}`.toLowerCase().includes(search.toLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div className="space-y-6">
      {resourceError && <p role="alert" className="text-sm text-rose-300">{resourceError} <button onClick={() => void loadData()} className="underline">Retry</button></p>}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-card p-5 rounded-2xl border border-border shadow-xs">
        <div>
          <h2 className="text-xl font-black">
            Social Media Accounts & Workspaces
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {accounts.filter((a) => !a.is_demo && !a.archived_at).length} real
            registered accounts - registration never requires credentials
          </p>
        </div>
        <div className="scc-action-row flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => setShowCat(true)}
            className="scc-btn-secondary"
          >
            New Category
          </button>
          <button
            onClick={add}
            className="scc-btn-primary"
          >
            Add Social Account
          </button>
          <button onClick={add} className="scc-btn-secondary">
            Connect Account
          </button>
        </div>
      </div>
      {notice && (
        <p role="status" className="text-xs text-sage-400 bg-sage-500/10 border border-sage-500/25 rounded-xl px-3 py-2">
          {notice}
        </p>
      )}
      {error && !showAdd && (
        <p role="alert" className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {categories.map((c) => (
          <CategoryCard
            key={c.id}
            category={c}
            accountCount={
              accounts.filter(
                (a) =>
                  a.category_id === c.id &&
                  !a.archived_at &&
                  (showDemo || !a.is_demo)
              ).length
            }
          />
        ))}
      </div>
      <div className="scc-action-row flex flex-wrap items-center gap-3 text-xs">
        <label>
          Find accounts{' '}
          <input
            className="bg-surface border border-border rounded-xl px-3 py-2 min-w-48"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={showDemo}
            onChange={(e) => setShowDemo(e.target.checked)}
          />
          Show demo accounts
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived accounts
        </label>
        <button
          onClick={async () => {
            try {
              await api.archiveDemos();
              await loadData();
              setNotice(
                'Demo accounts archived. History is preserved; restore with the demo and archive filters.'
              );
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          Archive Demo Accounts
        </button>
      </div>
      {!filtered.length && (
        <p className="text-slate-400 text-sm">
          No accounts match these filters. Add your first real account or show
          demo accounts.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filtered.slice(currentPage * 20, (currentPage + 1) * 20).map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            isTestingHealth={testingHealthId === a.id}
            onTestHealth={testHealth}
            onReconnect={reconnect}
            onNavigateToBranding={onNavigateToBranding}
            onPrepare={onPreparePublication}
            onEdit={edit}
            onConnect={setConnection}
            onArchive={archive}
          />
        ))}
      </div>
      <div className="scc-action-row flex flex-wrap gap-3 text-xs items-center">
        <button
          disabled={!currentPage}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous accounts
        </button>
        <span>
          Page {currentPage + 1} of {pages} | {filtered.length} accounts
        </span>
        <button
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          Next accounts
        </button>
      </div>
      <ConnectAccountModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        categories={categories}
        formData={form}
        setFormData={setForm}
        onSubmit={save}
        editing={!!editing}
        error={error}
        saving={saving}
      />
      <CreateCategoryModal
        isOpen={showCat}
        onClose={() => setShowCat(false)}
        formData={newCat}
        setFormData={setNewCat}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.createCategory(newCat);
            setShowCat(false);
            setNewCat({ name: '', description: '', color: '#D95D39' });
            await loadData();
          } catch (e: any) {
            setError(e.message);
          }
        }}
      />
      {connection && (
        <ConnectionModal
          account={connection}
          onClose={() => setConnection(null)}
          onChanged={loadData}
        />
      )}
    </div>
  );
};
