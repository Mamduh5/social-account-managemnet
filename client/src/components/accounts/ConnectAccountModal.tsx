import React, { useState } from 'react';
import { api } from '../../api/client';
import { Category } from '../../types';
import { Modal } from '../common/Modal';
export interface AccountFormState {
  name: string;
  handle: string;
  platform: string;
  accountType: string;
  categoryId: string;
  avatarUrl: string;
  externalId: string;
  description: string;
  notes: string;
  publishingPreferences: {
    defaultCaption: string;
    defaultHashtags: string;
    applyBranding: boolean;
  };
}
export const emptyAccountForm = (): AccountFormState => ({
  name: '',
  handle: '',
  platform: 'facebook',
  accountType: 'page',
  categoryId: '',
  avatarUrl: '',
  externalId: '',
  description: '',
  notes: '',
  publishingPreferences: {
    defaultCaption: '',
    defaultHashtags: '',
    applyBranding: true,
  },
});
interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  formData: AccountFormState;
  setFormData: React.Dispatch<React.SetStateAction<AccountFormState>>;
  onSubmit: (e: React.FormEvent) => void;
  editing?: boolean;
  error?: string;
  saving?: boolean;
}
export const ConnectAccountModal: React.FC<Props> = ({
  isOpen,
  onClose,
  categories,
  formData: f,
  setFormData,
  onSubmit,
  editing,
  error,
  saving,
}) => {
  const [avatarError, setAvatarError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const inputClass =
    'w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100';
  const field = (
    key:
      | 'name'
      | 'handle'
      | 'avatarUrl'
      | 'externalId'
      | 'description'
      | 'notes',
    label: string,
    required = false
  ) => (
    <label className="block text-slate-300 font-semibold">
      {label}
      <input
        className={inputClass}
        value={f[key]}
        required={required}
        onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.value }))}
      />
    </label>
  );
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Social Account' : 'Add Social Account'}
    >
      <form
        onSubmit={onSubmit}
        className="space-y-3 text-xs max-h-[70vh] overflow-y-auto p-1"
      >
        <p className="text-slate-400">
          Save a public identity without logging in. Ownership and profile
          information remain unverified until an authorized platform check.
        </p>
        <label className="block">
          Platform
          <select
            aria-label="Platform"
            className={inputClass}
            disabled={editing}
            value={f.platform}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                platform: e.target.value,
                accountType:
                  e.target.value === 'facebook' ? 'page' : 'personal',
              }))
            }
          >
            <option value="facebook">Facebook Page</option>
            <option value="tiktok">TikTok Account</option>
          </select>
        </label>
        {f.platform === 'tiktok' && (
          <label className="block">
            TikTok account type
            <select
              className={inputClass}
              value={f.accountType}
              onChange={(e) =>
                setFormData((p) => ({ ...p, accountType: e.target.value }))
              }
            >
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </select>
          </label>
        )}
        {field('handle', 'Public profile URL or username', true)}
        {field('name', 'Account Display Name', true)}
        <label className="block">
          Category Workspace
          <select
            className={inputClass}
            value={f.categoryId}
            onChange={(e) =>
              setFormData((p) => ({ ...p, categoryId: e.target.value }))
            }
          >
            <option value="">Unassigned</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {field('avatarUrl', 'Avatar image URL (optional HTTPS)')}
        <label className="block">
          Upload avatar (optional PNG, JPEG, WebP, up to 2 MB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadingAvatar}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadingAvatar(true);
              setAvatarError('');
              try {
                const result = await api.uploadAvatar(file);
                setFormData((p) => ({ ...p, avatarUrl: result.avatarUrl }));
              } catch (e: any) {
                setAvatarError(e.message);
              } finally {
                setUploadingAvatar(false);
              }
            }}
          />
        </label>
        {avatarError && (
          <p role="alert" className="text-rose-400">
            {avatarError}
          </p>
        )}

        {field('externalId', 'Platform account ID (optional, unverified)')}
        {field('description', 'Description (optional)')}
        {field('notes', 'Private local notes (optional)')}
        <label className="block">
          Default caption
          <textarea
            className={inputClass}
            value={f.publishingPreferences.defaultCaption}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                publishingPreferences: {
                  ...p.publishingPreferences,
                  defaultCaption: e.target.value,
                },
              }))
            }
          />
        </label>
        <label className="block">
          Default hashtags
          <input
            className={inputClass}
            value={f.publishingPreferences.defaultHashtags}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                publishingPreferences: {
                  ...p.publishingPreferences,
                  defaultHashtags: e.target.value,
                },
              }))
            }
          />
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={f.publishingPreferences.applyBranding}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                publishingPreferences: {
                  ...p.publishingPreferences,
                  applyBranding: e.target.checked,
                },
              }))
            }
          />
          Apply branding by default
        </label>
        {error && (
          <p role="alert" className="text-rose-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface rounded-xl"
          >
            Cancel
          </button>
          <button
            disabled={saving || uploadingAvatar}
            className="px-4 py-2 bg-terracotta-600 text-white rounded-xl font-bold"
          >
            {saving ? 'Saving...' : 'Save Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
