import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Database, Search } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { TestDataPage, TestDataPreview, TestDataRecord, TestDataSelection } from '../types/test-data';

const typeLabels: Record<string, string> = {
  account: 'Account', category: 'Category', video: 'Master video',
  branded_video: 'Branded video', publishing_post: 'Publishing post',
  publishing_draft: 'Publishing draft', assistant_draft: 'Content assistant draft',
  campaign: 'Content plan', group_plan: 'Group plan', group_prepared_content: 'Group prepared content',
};
const classificationLabels: Record<TestDataRecord['classification'], string> = {
  confirmed_demo: 'Confirmed demo', unknown: 'Unknown provenance', protected: 'Protected',
};
const selectionKey = (record: TestDataSelection) => JSON.stringify([record.type, record.id]);

export const TestDataManagerView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [type, setType] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<TestDataPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<TestDataSelection[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [preview, setPreview] = useState<TestDataPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const requestGeneration = useRef(0);
  const deleteInFlight = useRef(false);

  useEffect(() => () => { requestGeneration.current++; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPage(null);
    api.getTestData(type, search, offset, controller.signal).then(result => {
      if (!controller.signal.aborted) setPage(result);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load records');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [type, search, offset, retry]);

  const closeReview = () => {
    if (deleteInFlight.current) return;
    requestGeneration.current++;
    setReviewOpen(false);
    setPreview(null);
    setReviewError(null);
    setConfirmation('');
  };
  const openReview = async () => {
    if (!selected.length) return;
    const generation = ++requestGeneration.current;
    setReviewOpen(true);
    setPreview(null);
    setReviewError(null);
    setConfirmation('');
    setPreviewLoading(true);
    setOutcome(null);
    try {
      const result = await api.previewTestDataDeletion(selected);
      if (generation === requestGeneration.current) setPreview(result);
    } catch (err: unknown) {
      if (generation === requestGeneration.current) setReviewError(err instanceof Error ? err.message : 'Could not review this selection');
    } finally {
      if (generation === requestGeneration.current) setPreviewLoading(false);
    }
  };
  const confirmDeletion = async () => {
    if (!preview?.canDelete || confirmation !== preview.confirmationPhrase || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setReviewError(null);
    try {
      const result = await api.deleteTestData(preview.previewId, confirmation);
      requestGeneration.current++;
      setReviewOpen(false);
      setPreview(null);
      setConfirmation('');
      setSelected([]);
      setOutcome(`Deleted ${result.count} selected ${result.count === 1 ? 'record' : 'records'}.`);
      setRetry(n => n + 1);
    } catch (err: unknown) {
      // A failed or stale confirmation must never reuse the prior review.
      setPreview(null);
      setConfirmation('');
      setReviewError(`${err instanceof Error ? err.message : 'Deletion failed'}. Close this dialog and review the selection again.`);
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="w-4 h-4" />}>Back to Settings</Button>
      <div className="bg-surface-card p-5 sm:p-6 rounded-2xl border border-border shadow-xs space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400 flex items-center gap-1.5"><Database className="w-4 h-4" /> Data management</div>
        <h2 className="text-xl font-black text-slate-100">Manage Demo &amp; Test Data</h2>
        <p className="text-sm text-slate-400">Inspect records, their provenance and known relationships. Viewing this page does not change data.</p>
        <div role="note" className="rounded-xl border border-honey-500/30 bg-honey-500/10 p-3 text-xs leading-relaxed text-slate-200">
          Select only records you intend to remove. Unknown provenance does not mean test data; your selection is an explicit decision, not system verification. The server checks dependencies during review and again before deletion.
        </div>
      </div>

      <form className="bg-surface-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-end gap-3" onSubmit={event => { event.preventDefault(); setOffset(0); setSearch(searchInput.trim()); }}>
        <label className="text-xs font-semibold text-slate-300 flex flex-col gap-1.5 sm:w-48">Record type
          <select value={type} onChange={event => { setType(event.target.value); setOffset(0); }} className="bg-surface border border-border rounded-xl px-3 py-2 text-slate-100">
            <option value="all">All supported types</option>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-300 flex flex-col gap-1.5 flex-1">Search name or ID
          <input value={searchInput} onChange={event => setSearchInput(event.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2 text-slate-100" />
        </label>
        <Button type="submit" icon={<Search className="w-4 h-4" />}>Search</Button>
      </form>

      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <Button variant="danger" disabled={!selected.length} onClick={openReview}>Review Deletion</Button>
        <span className="text-xs text-slate-400">{selected.length} selected (maximum 25)</span>
        {selected.length > 0 && <Button variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>}
      </div>
      {outcome && <p role="status" className="rounded-xl border border-sage-500/30 bg-sage-500/10 p-3 text-sm text-slate-200">{outcome}</p>}

      <div aria-live="polite">
        {loading && <p className="p-5 text-sm text-slate-400">Loading records...</p>}
        {error && <div role="alert" className="p-5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-slate-200 space-y-3"><p>Could not load records: {error}</p><Button onClick={() => setRetry(n => n + 1)}>Try again</Button></div>}
        {!loading && !error && page?.records.length === 0 && <p className="p-5 rounded-xl border border-border bg-surface-card text-sm text-slate-400">No records found for these filters.</p>}
        {!loading && !error && page && page.records.length > 0 && <div className="space-y-3">
          {page.records.map(record => <article key={`${record.type}:${record.id}`} className="bg-surface-card border border-border rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="font-bold text-slate-100 break-words">{record.name || '(Unnamed record)'}</h3><p className="text-xs text-slate-400 mt-1">{typeLabels[record.type] || record.type} · <span className="font-mono break-all">{record.id}</span></p></div>
              <div className="flex flex-wrap gap-2"><span className="text-xs font-semibold rounded-lg border border-border bg-surface px-2 py-1 text-slate-200">{classificationLabels[record.classification] || record.classification}</span><span className="text-xs font-semibold rounded-lg border border-border bg-surface px-2 py-1 text-slate-200">{record.eligible ? 'Eligible for review' : 'Protected / unavailable'}</span></div>
            </div>
            <p className="text-xs text-slate-400">{record.updatedAt ? `Created or last updated: ${record.updatedAt}` : 'Creation or update time unavailable'}</p>
            <div className="text-xs leading-relaxed text-slate-300"><strong className="text-slate-100">Protection: </strong>{record.protection}</div>
            <div className="text-xs leading-relaxed text-slate-300"><strong className="text-slate-100">Known relationships:</strong>{record.dependencies.length ? <ul className="list-disc pl-5 mt-1 space-y-1">{record.dependencies.map((dependency, index) => <li key={index}>{dependency}</li>)}</ul> : <p className="mt-1">None reported for the relationships inspected.</p>}</div>
            <p className="text-xs text-slate-300"><strong className="text-slate-100">Deletion review: </strong>{record.eligibilityReason}</p>
            <label className="inline-flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" disabled={(!record.eligible || selected.length >= 25) && !selected.some(item => selectionKey(item) === selectionKey(record))} checked={selected.some(item => selectionKey(item) === selectionKey(record))} onChange={event => { const key = selectionKey(record), checked = event.target.checked; setSelected(current => checked && current.length < 25 ? [...current, {type: record.type, id: record.id}] : current.filter(item => selectionKey(item) !== key)); setOutcome(null); }} aria-label={`Select ${typeLabels[record.type] || record.type} ${record.name || record.id} (${record.id})`} /> Select for deletion review</label>
          </article>)}
        </div>}
      </div>
      {!loading && !error && page && <div className="flex flex-wrap items-center gap-3"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - page.limit))}>Previous</Button><span className="text-xs text-slate-400">Page {Math.floor(offset / page.limit) + 1}</span><Button disabled={!page.hasMore} onClick={() => setOffset(offset + page.limit)}>Next</Button></div>}
      <Modal isOpen={reviewOpen} onClose={closeReview} title="Review deletion" maxWidth="max-w-2xl" manageFocus initialFocusRef={cancelRef} dismissible={!deleting} scrollBody>
        <div className="overflow-y-auto min-h-0 space-y-4 text-sm text-slate-300">
          {previewLoading && <p role="status">Checking the selected records and dependencies...</p>}
          {reviewError && <p role="alert" className="text-rose-400">{reviewError}</p>}
          {preview && <>
            {preview.canDelete ? <p>Proposed deletion: <strong className="text-slate-100">{preview.total} database {preview.total === 1 ? 'row' : 'rows'}</strong>. This cannot be undone by the application.</p> : <p>No rows can be deleted from this selection. A blocked record prevents the entire operation, even if another record is individually eligible.</p>}
            {preview.records.map(record => <section key={selectionKey(record)} className="border border-border rounded-xl p-3 space-y-2">
              <p className="font-semibold text-slate-100 break-words">{typeLabels[record.type] || record.type}: {record.name || '(Unnamed record)'}</p>
              <p className="text-xs break-all">ID: {record.id}</p>
              <p className={record.eligible ? 'text-sage-400' : 'text-rose-400'}>{record.eligible ? 'Eligible' : 'Blocked'}: {record.reason}</p>
              <div><strong>Dependencies:</strong>{record.dependencies.length ? <ul className="list-disc pl-5">{record.dependencies.map((dependency, index) => <li key={index} className="break-words">{dependency}</li>)}</ul> : <p>None reported.</p>}</div>
              <div><strong>Rows to delete:</strong>{record.rows.length ? <ul className="list-disc pl-5">{record.rows.map(row => <li key={JSON.stringify([row.table,row.id])} className="break-all">{row.table}: {row.id}</li>)}</ul> : <p>None.</p>}</div>
            </section>)}
            {preview.additionalChanges.length > 0 && <div><strong className="text-slate-100">Additional changes:</strong><ul className="list-disc pl-5">{preview.additionalChanges.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul></div>}
            <div><strong className="text-slate-100">Unchanged:</strong><ul className="list-disc pl-5">{preview.unchanged.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
            {!preview.canDelete && <p role="alert" className="text-rose-400">This selection is blocked. Cancel and change the selection before reviewing again.</p>}
            {preview.canDelete && <label className="flex flex-col gap-1.5 text-slate-100 font-semibold">Type {preview.confirmationPhrase} to permanently delete these rows
              <input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" className="bg-surface border border-border rounded-xl px-3 py-2 text-slate-100" />
            </label>}
          </>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 shrink-0">
          <button ref={cancelRef} type="button" className="scc-btn-secondary" disabled={deleting} onClick={closeReview}>Cancel</button>
          <Button variant="danger" loading={deleting} disabled={!preview?.canDelete || confirmation !== preview.confirmationPhrase} onClick={confirmDeletion}>Delete selected records</Button>
        </div>
      </Modal>
    </div>
  );
};
