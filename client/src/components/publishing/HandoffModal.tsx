import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
export function HandoffModal({
  destinationId,
  onClose,
  onConfirmed,
}: {
  destinationId: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [url, setUrl] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .handoffPackage(destinationId)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [destinationId]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.confirmAssistedPublish(destinationId, {
        remotePostUrl: url,
        accountId: data.accountId,
        confirmAccount: confirm,
      });
      onConfirmed();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal isOpen onClose={onClose} title="Awaiting Manual Confirmation">
      <div className="space-y-4 text-xs">
        {data && (
          <>
            <p className="font-bold">
              {data.accountName} | {data.handle} | {data.platform}
            </p>
            <p>{data.notice}</p>
            <label className="block">
              Prepared caption
              <textarea
                readOnly
                value={`${data.caption}\n${data.hashtags}`}
                className="w-full bg-surface border border-border rounded-xl p-3"
                rows={4}
              />
            </label>
            <div className="flex flex-wrap gap-4 text-terracotta-400">
              <a href={data.downloadUrl} download>
                Download Prepared MP4
              </a>
              <a href={data.publicUrl} target="_blank" rel="noreferrer">
                Open Native Account
              </a>
              <a href={data.nativeUrl} target="_blank" rel="noreferrer">
                Open Native Publisher
              </a>
            </div>
            <form onSubmit={save} className="space-y-3">
              <label className="block">
                Published post URL
                <input
                  type="url"
                  required
                  className="bg-surface rounded-xl p-2 w-full"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                I published this video to {data.handle} and checked the
                destination account.
              </label>
              <button
                disabled={!confirm || !url || busy}
                className="bg-terracotta-600 text-white rounded-xl p-2 disabled:opacity-50"
              >
                Record Published URL
              </button>
              <p className="text-slate-400">
                This records your manual confirmation. The application has not
                independently verified the live post.
              </p>
            </form>
          </>
        )}
        {error && (
          <p role="alert" className="text-rose-400">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
