import React, { useEffect, useState } from 'react';
import { Account } from '../../types';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
export function ConnectionModal({
  account,
  onClose,
  onChanged,
}: {
  account: Account;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [setup, setSetup] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(true);
  const [engagement, setEngagement] = useState(true);
  const [selection, setSelection] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      api.connectionSetup(account.id),
      api.connectionCandidates(account.id),
    ])
      .then(([s, c]) => {
        setSetup(s);
        setCandidates(c.candidates);
        if (c.candidates?.length === 1) {
          setSelection(c.candidates[0].id);
        }
      })
      .catch((e) => setError(e.message));
  }, [account.id]);
  async function action(kind: string, data: any = {}) {
    setBusy(true);
    setError('');
    try {
      const result = await api.accountAction(account.id, kind, data);
      if (result.authorizationUrl)
        window.location.assign(result.authorizationUrl);
      else {
        onChanged();
        onClose();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal isOpen onClose={onClose} title={`Connect API - ${account.name}`}>
      <div className="text-xs space-y-4">
        <p>
          {account.handle} | {account.platform} | {account.account_type}
        </p>
        <p className="text-slate-400">
          Registration is saved independently. Use official consent to verify
          this identity; passwords are entered only on the platform.
        </p>
        {setup && (
          <div className="bg-surface p-3 rounded-xl space-y-2">
            <p>
              {setup.ready
                ? 'Developer app configured; real authorization is pending.'
                : 'Authorization Required - Developer-app setup pending'}
            </p>
            {setup.missing?.length > 0 && (
              <p>Missing server configuration: {setup.missing.join(', ')}</p>
            )}
            <p>{setup.message}</p>
            <a
              href={setup.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-terracotta-400"
            >
              Official setup instructions
            </a>
          </div>
        )}
        {!!candidates.length && (
          <div className="space-y-3">
            <label className="block">
              Authorized identity
              <select
                className="w-full bg-surface p-2 rounded-xl"
                value={selection}
                onChange={(e) => {
                  setSelection(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">Choose the correct Page/account</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.username ? '@' + c.username : ''} ({c.id})
                  </option>
                ))}
              </select>
            </label>
            {selection && (
              <p>Meta/platform granted permissions: {candidates.find(c => c.id === selection)?.scopes?.join(', ') || 'None'}.</p>
            )}
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm this is the registered account {account.handle}.
            </label>
            <button
              disabled={!selection || !confirmed || busy}
              className="bg-terracotta-600 text-white px-3 py-2 rounded-xl"
              onClick={() =>
                action('select', {
                  externalId: selection,
                  confirmIdentity: confirmed,
                })
              }
            >
              Link Authorized Identity
            </button>
          </div>
        )}
        {account.platform === 'facebook' && (
          <div className="space-y-2 bg-surface/50 p-2.5 rounded-xl border border-white/5">
            <p className="text-slate-300 font-medium">Read-only analytics and comment retrieval are requested by default.</p>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={publishing}
                onChange={(e) => setPublishing(e.target.checked)}
              />
              Request Page video publishing permissions (pages_manage_posts)
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={engagement}
                onChange={(e) => setEngagement(e.target.checked)}
              />
              Request comment moderation and reply permissions (pages_manage_engagement)
            </label>
          </div>
        )}
        {account.platform === 'tiktok' && (
          <div className="space-y-1 bg-surface/50 p-2.5 rounded-xl border border-white/5 text-slate-300">
            <p className="font-medium">Personal account type is preserved.</p>
            <p className="text-slate-400">
              Read-only Display API video engagement counters (video.list) and profile identity (user.info.basic) will be requested. Video publishing and comment moderation require TikTok Accounts API access approval for owned accounts.
            </p>
          </div>
        )}
        <button
          disabled={!setup?.ready || busy}
          className="bg-terracotta-600 text-white px-3 py-2 rounded-xl disabled:opacity-50"
          onClick={() => action('start', { publishing, engagement })}
        >
          Start Official Authorization
        </button>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy} onClick={() => action('browser-handoff')}>
            Set Up Browser Handoff
          </button>
          <button disabled={busy} onClick={() => action('disconnect')}>
            Disconnect
          </button>
          {account.platform === 'tiktok' && account.identity_verified_at && (
            <button disabled={busy} onClick={() => action('refresh')}>
              Renew API Token
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-rose-400">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
