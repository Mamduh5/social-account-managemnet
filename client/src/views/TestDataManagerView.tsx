import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Database, Search } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { DiscoveredPipelineJob, PipelineJobsPageResponse } from '../types';
import { HiddenWatchFilePage, TestDataDetail, TestDataPage, TestDataPreview, TestDataRecord, TestDataSelection, WatchFilePage } from '../types/test-data';

const typeLabels: Record<string, string> = {
  account: 'Account', category: 'Category', video: 'Master video', branded_video: 'Branded video',
  publishing_post: 'Publishing post', publishing_draft: 'Publishing draft', assistant_draft: 'Content assistant draft',
  campaign: 'Content plan', group_plan: 'Group plan', group_prepared_content: 'Group prepared content',
};
const classifications: Record<TestDataRecord['classification'], string> = {
  confirmed_demo: 'Confirmed test', owner_marked_test: 'Owner-marked test', unknown: 'Unknown', owner_marked_keep: 'Owner-marked keep',
};
const eligibilityLabels: Record<TestDataRecord['eligibility'], string> = {
  safe: 'Safe to remove', review: 'Review dependencies', protected: 'Protected', unsupported: 'Unsupported',
};
const keyFor = (record: TestDataSelection) => JSON.stringify([record.type, record.id]);
const labelFor = (record: TestDataSelection) => typeLabels[record.type] || record.type;
const choiceClass = 'bg-surface border border-border rounded-lg px-2 py-2 text-slate-100 w-full';
type Mode = 'records' | 'pipeline' | 'hidden' | 'watch';
type PipelineJob = DiscoveredPipelineJob & {hidden?: boolean;ownerClassification?: TestDataRecord['classification'];sourceFingerprint?: string};

export const TestDataManagerView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [mode, setMode] = useState<Mode>('records');
  const [type, setType] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [classification, setClassification] = useState('');
  const [source, setSource] = useState('');
  const [eligibility, setEligibility] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [previousOffsets, setPreviousOffsets] = useState<number[]>([]);
  const [page, setPage] = useState<TestDataPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [inspected, setInspected] = useState<TestDataSelection | null>(null);
  const [detail, setDetail] = useState<TestDataDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineJobsPageResponse | null>(null);
  const [pipelineCursor, setPipelineCursor] = useState<string | null>(null);
  const [pipelinePrevious, setPipelinePrevious] = useState<(string | null)[]>([]);
  const [hiddenPage, setHiddenPage] = useState<{items:{jobId:string;sourceFingerprint:string|null;currentSource:boolean;legacy:boolean;ownerClassification?: TestDataRecord['classification']}[];limit:number;offset:number;hasMore:boolean} | null>(null);
  const [hiddenOffset, setHiddenOffset] = useState(0);
  const [pipelineBusy, setPipelineBusy] = useState<string | null>(null);
  const [watchVisibility, setWatchVisibility] = useState<'all'|'visible'|'hidden'>('all');
  const [watchOffset, setWatchOffset] = useState(0);
  const [watchPage, setWatchPage] = useState<WatchFilePage | null>(null);
  const [hiddenWatchPage, setHiddenWatchPage] = useState<HiddenWatchFilePage | null>(null);
  const [watchBusy, setWatchBusy] = useState<string | null>(null);
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
    if (mode !== 'records') return;
    const controller = new AbortController();
    setLoading(true); setError(null); setPage(null);
    api.getTestData(type, search, offset, controller.signal, {classification,source,eligibility,status}).then(result => {
      if (!controller.signal.aborted) setPage(result);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load records');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode, type, search, offset, retry, classification, source, eligibility, status]);
  useEffect(() => {
    if (!inspected) { setDetail(null); return; }
    const controller = new AbortController();
    setDetailLoading(true); setDetailError(null); setDetail(null);
    api.getTestDataDetail(inspected, controller.signal).then(result => { if (!controller.signal.aborted) setDetail(result); })
      .catch((err:unknown) => { if (!controller.signal.aborted) setDetailError(err instanceof Error ? err.message : 'Unable to load details'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [inspected, retry]);
  useEffect(() => {
    if (mode === 'records' || mode === 'watch') return;
    let current = true; const controller = new AbortController();
    setLoading(true); setError(null); setPipeline(null); setHiddenPage(null);
    const request = mode === 'pipeline'
      ? api.getPipelineJobs({includeHidden:'true',limit:20,cursor:pipelineCursor,q:search}, controller.signal).then(result => { if (current) setPipeline(result); })
      : api.getHiddenPipeline(hiddenOffset).then(result => { if (current) setHiddenPage(result); });
    request.catch((err:unknown) => { if (current) setError(err instanceof Error ? err.message : 'Unable to load Pipeline items'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [mode, pipelineCursor, hiddenOffset, search, retry]);
  useEffect(() => {
    if (mode !== 'watch') return;
    const controller = new AbortController();
    setLoading(true); setError(null); setWatchPage(null); setHiddenWatchPage(null);
    const request = watchVisibility === 'hidden'
      ? api.getHiddenWatchFiles(watchOffset,controller.signal).then(result=>{if(!controller.signal.aborted)setHiddenWatchPage(result);})
      : api.getWatchFiles(watchOffset,watchVisibility,controller.signal).then(result=>{if(!controller.signal.aborted)setWatchPage(result);});
    request.catch((err:unknown)=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Unable to load watch-directory entries');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[mode,watchVisibility,watchOffset,retry]);

  const resetPage = () => { setOffset(0); setPreviousOffsets([]); };
  const toggleRecord = (record: TestDataRecord, checked: boolean) => {
    const key = keyFor(record);
    setSelected(current => checked && current.length < 25 && !current.some(item => keyFor(item) === key)
      ? [...current, {type:record.type,id:record.id}] : current.filter(item => keyFor(item) !== key));
    setOutcome(null);
  };
  const mark = async (classification: 'test'|'keep'|'clear') => {
    if (!inspected || marking) return;
    setMarking(true); setDetailError(null);
    try {
      await api.classifyTestData(inspected, classification);
      setSelected(current => current.filter(item => keyFor(item) !== keyFor(inspected)));
      setOutcome(classification === 'clear' ? 'Owner classification removed.' : `Record marked as ${classification === 'test' ? 'Test' : 'Keep'} by the owner.`);
      setRetry(n => n + 1);
    } catch (err:unknown) { setDetailError(err instanceof Error ? err.message : 'Could not update classification'); }
    finally { setMarking(false); }
  };
  const setHidden = async (jobId:string, hidden:boolean, sourceFingerprint:string|null, legacy=false) => {
    if (pipelineBusy) return;
    setPipelineBusy(jobId); setError(null);
    try {
      await api.setPipelineHidden(jobId, hidden, sourceFingerprint, legacy);
      window.dispatchEvent(new Event('scc:cleanup-local'));
      setOutcome(hidden ? 'Pipeline item hidden from SCC. The upstream item was not changed.' : 'Pipeline item restored to SCC discovery.');
      setRetry(n => n + 1);
    } catch (err:unknown) { setError(err instanceof Error ? err.message : 'Could not update Pipeline visibility'); }
    finally { setPipelineBusy(null); }
  };
  const setWatchHidden = async (fileId:string, sourceFingerprint:string, hidden:boolean) => {
    if (watchBusy) return;
    setWatchBusy(fileId); setError(null);
    try {
      await api.setWatchFileHidden(fileId,sourceFingerprint,hidden);
      window.dispatchEvent(new Event('scc:cleanup-local'));
      setOutcome(hidden ? 'Watch-directory entry hidden from SCC. The source file and any imported master were not changed.' : 'Watch-directory exclusion removed. The entry will appear if the same source file is still available.');
      setRetry(n=>n+1);
    } catch (err:unknown) {setError(err instanceof Error?err.message:'Could not update watch-directory visibility');}
    finally {setWatchBusy(null);}
  };
  const markPipeline = async (jobId:string, classification:'test'|'keep'|'clear', sourceFingerprint:string) => {
    if (pipelineBusy) return;
    setPipelineBusy(jobId); setError(null);
    try {
      await api.classifyTestData({type:'pipeline_job',id:jobId},classification,sourceFingerprint);
      setOutcome(classification==='clear' ? 'Pipeline owner classification removed.' : `Pipeline item marked as ${classification === 'test' ? 'Test' : 'Keep'} by the owner.`);
      setRetry(n=>n+1);
    } catch (err:unknown) { setError(err instanceof Error ? err.message : 'Could not classify Pipeline item'); }
    finally { setPipelineBusy(null); }
  };
  const closeReview = () => {
    if (deleteInFlight.current) return;
    requestGeneration.current++; setReviewOpen(false); setPreview(null); setReviewError(null); setConfirmation('');
  };
  const openReview = async () => {
    if (!selected.length) return;
    const generation = ++requestGeneration.current;
    setReviewOpen(true); setPreview(null); setReviewError(null); setConfirmation(''); setPreviewLoading(true); setOutcome(null);
    try { const result = await api.previewTestDataDeletion(selected); if (generation === requestGeneration.current) setPreview(result); }
    catch (err:unknown) { if (generation === requestGeneration.current) setReviewError(err instanceof Error ? err.message : 'Could not review this selection'); }
    finally { if (generation === requestGeneration.current) setPreviewLoading(false); }
  };
  const confirmDeletion = async () => {
    if (!preview?.canDelete || confirmation !== preview.confirmationPhrase || deleteInFlight.current) return;
    deleteInFlight.current = true; setDeleting(true); setReviewError(null);
    try {
      const result = await api.deleteTestData(preview.previewId, confirmation);
      window.dispatchEvent(new Event('scc:cleanup-local'));
      requestGeneration.current++; setReviewOpen(false); setPreview(null); setConfirmation(''); setSelected([]); setInspected(null);
      setOutcome(`Deleted ${result.count} selected ${result.count === 1 ? 'record' : 'records'}.`); setRetry(n => n + 1);
    } catch (err:unknown) {
      setPreview(null); setConfirmation(''); setReviewError(`${err instanceof Error ? err.message : 'Deletion failed'}. Close this dialog and review the selection again.`);
    } finally { deleteInFlight.current = false; setDeleting(false); }
  };

  return <div className="space-y-5">
    <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="w-4 h-4" />}>Back to Settings</Button>
    <header className="bg-surface-card p-5 rounded-2xl border border-border space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400 flex items-center gap-1.5"><Database className="w-4 h-4" /> Data management</div>
      <h2 className="text-xl font-black text-slate-100">Manage Demo &amp; Test Data</h2>
      <p className="text-sm text-slate-400">Identify records by source and relationships before deciding what to remove. A title or simulator mode does not prove test provenance.</p>
    </header>
    <nav aria-label="Data inventory" className="flex flex-wrap gap-2">
      {([['records','SCC records'],['pipeline','Pipeline discovery'],['hidden','Hidden Pipeline items'],['watch','Watch-directory files']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={mode===value} onClick={() => {setMode(value);setError(null);setOutcome(null);}} className={mode===value?'scc-btn-primary':'scc-btn-secondary'}>{label}</button>)}
    </nav>
    {mode === 'records' && <form className="bg-surface-card border border-border rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" onSubmit={event => {event.preventDefault();resetPage();setSearch(searchInput.trim());}}>
      <label className="text-xs font-semibold text-slate-300">Record type<select value={type} onChange={event => {setType(event.target.value);resetPage();}} className={choiceClass}><option value="all">All types</option>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-300">Data classification<select value={classification} onChange={event => {setClassification(event.target.value);resetPage();}} className={choiceClass}><option value="">All classifications</option>{Object.entries(classifications).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-300">Source<select value={source} onChange={event => {setSource(event.target.value);resetPage();}} className={choiceClass}><option value="">All sources</option><option value="manual_upload">SCC upload</option><option value="pipeline_import">Pipeline import</option><option value="webhook">Webhook</option><option value="simulator">Simulator</option><option value="official_api">Official API</option><option value="browser_bridge">Browser bridge</option><option value="mixed">Mixed connectors</option><option value="publishing">Publishing</option><option value="manual">Manual</option><option value="provider">Provider</option><option value="fixture">Fixture</option><option value="unknown">Unknown</option></select></label>
      <label className="text-xs font-semibold text-slate-300">Deletion eligibility<select value={eligibility} onChange={event => {setEligibility(event.target.value);resetPage();}} className={choiceClass}><option value="">All eligibility</option>{Object.entries(eligibilityLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-300">Publishing status<input value={status} onChange={event => {setStatus(event.target.value);resetPage();}} placeholder="Any status" className={choiceClass} /></label>
      <label className="text-xs font-semibold text-slate-300">Search name or ID<div className="flex gap-2"><input value={searchInput} onChange={event => setSearchInput(event.target.value)} className={choiceClass} /><Button type="submit" icon={<Search className="w-4 h-4" />}>Search</Button></div></label>
    </form>}
    {mode === 'pipeline' && <form className="flex gap-2" onSubmit={event=>{event.preventDefault();setPipelineCursor(null);setPipelinePrevious([]);setSearch(searchInput.trim());}}><label className="flex-1 text-xs text-slate-300">Search Pipeline jobs<input value={searchInput} onChange={event=>setSearchInput(event.target.value)} className={choiceClass}/></label><Button type="submit">Search</Button></form>}
    <div className="flex flex-wrap items-center gap-3" aria-live="polite"><Button variant="danger" disabled={!selected.length} onClick={openReview}>Review Deletion</Button><span className="text-xs text-slate-400">{selected.length} selected (maximum 25)</span>{selected.length > 0 && <Button variant="ghost" onClick={()=>setSelected([])}>Clear selection</Button>}</div>
    {outcome && <p role="status" className="rounded-xl border border-sage-500/30 bg-sage-500/10 p-3 text-sm text-slate-200">{outcome}</p>}
    {loading && <p role="status" className="p-4 text-sm text-slate-400">Loading records...</p>}
    {error && <div role="alert" className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-slate-200 space-y-2"><p>Could not load records: {error}</p><Button onClick={()=>setRetry(n=>n+1)}>Try again</Button></div>}
    {!loading && !error && mode === 'records' && page && <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 items-start">
      <section aria-label="Records" className="rounded-2xl border border-border bg-surface-card overflow-hidden">
        {!page.records.length && <p className="p-5 text-sm text-slate-400">No records found in this segment for these filters.</p>}
        {page.records.map(record=>{
          const checked=selected.some(item=>keyFor(item)===keyFor(record));
          const selectable=record.classification!=='owner_marked_keep' && (record.eligible || record.eligibility==='review');
          return <article key={keyFor(record)} className="p-3 border-b border-border last:border-0 flex items-start gap-3">
            <input type="checkbox" className="mt-1" checked={checked} disabled={(!selectable || selected.length>=25) && !checked} onChange={event=>toggleRecord(record,event.target.checked)} aria-label={`Select ${labelFor(record)} ${record.name || record.id} (${record.id})`} />
            <div className="min-w-0 flex-1"><h3 className="font-bold text-sm text-slate-100 break-words">{record.name || '(Unnamed record)'}</h3><p className="text-xs text-slate-400 break-all">{labelFor(record)} · {record.id}</p><p className="text-xs text-slate-400">Source: {record.source || 'unknown'} · Status: {record.status || 'unknown'}</p><div className="flex flex-wrap gap-2 mt-1"><span className="text-xs border border-border rounded-md px-2 py-0.5 text-slate-300">{classifications[record.classification] || 'Unknown'}</span><span className="text-xs border border-border rounded-md px-2 py-0.5 text-slate-300">{eligibilityLabels[record.eligibility] || (record.eligible ? 'Safe to remove' : 'Unsupported')}</span></div>{!selectable && <p className="text-xs text-slate-400 mt-1">{record.eligibilityReason}</p>}</div>
            <Button size="sm" variant="ghost" onClick={()=>setInspected({type:record.type,id:record.id})} aria-label={`Inspect ${record.name || record.id} (${record.id})`}>Inspect</Button>
          </article>;
        })}
        {page.scanIncomplete && <p className="p-3 text-xs text-honey-400">The scan is incomplete; more records may match. Continue to inspect the next segment.</p>}
        <div className="flex flex-wrap gap-2 p-3"><Button disabled={!previousOffsets.length} onClick={()=>{setOffset(previousOffsets[previousOffsets.length-1]);setPreviousOffsets(p=>p.slice(0,-1));}}>Previous</Button><Button disabled={!page.hasMore} onClick={()=>{setPreviousOffsets(p=>[...p,offset]);setOffset(page.nextOffset ?? offset+page.limit);}}>Next</Button></div>
      </section>
      <aside aria-label="Record inspector" className="rounded-2xl border border-border bg-surface-card p-4 space-y-3 text-sm text-slate-300">
        <h3 className="font-bold text-slate-100">Record inspector</h3>
        {!inspected && <p>Select Inspect to see source evidence, relationships and available actions.</p>}
        {detailLoading && <p role="status">Loading details...</p>}
        {detailError && <p role="alert" className="text-rose-400">{detailError}</p>}
        {detail && <><div className="flex gap-3">{detail.thumbnailUrl && <img src={detail.thumbnailUrl} alt="" className="w-24 h-16 object-cover rounded-lg bg-black" />}<div className="min-w-0"><h4 className="font-bold text-slate-100 break-words">{detail.record.name || '(Unnamed record)'}</h4><p className="text-xs break-all">{labelFor(detail.record)} · {detail.record.id}</p><p className="text-xs">{classifications[detail.record.classification] || 'Unknown'} · {eligibilityLabels[detail.record.eligibility] || 'Unsupported'}</p></div></div>
          <p><strong>Removal:</strong> {detail.record.eligibilityReason}</p><p><strong>Source:</strong> {detail.record.source || 'unknown'} · <strong>Status:</strong> {detail.record.status || 'unknown'}</p>
          <div><strong>Source evidence</strong>{detail.evidence.length ? <ul className="list-disc pl-5 space-y-1">{detail.evidence.map((entry,i)=><li className="break-words" key={i}>{entry}</li>)}</ul> : <p>Stored source evidence is unavailable.</p>}</div>
          <div><strong>Relationships</strong>{detail.relationships.length ? <ul className="list-disc pl-5 space-y-1">{detail.relationships.map((entry,i)=><li className="break-words" key={i}>{entry}</li>)}</ul> : <p>None reported.</p>}{!detail.complete && <p className="text-honey-400">Relationship discovery is incomplete; removal is blocked until it can be reviewed.</p>}</div>
          {!!detail.links?.length && <div className="flex flex-wrap gap-2">{detail.links.map((link,i)=><Button key={`${keyFor(link)}:${i}`} size="sm" variant="ghost" onClick={()=>setInspected({type:link.type,id:link.id})}>{link.label}</Button>)}</div>}
          <div className="border-t border-border pt-3 space-y-2"><p className="text-xs">Owner labels are assertions for identification. They do not override safety checks. Remove a Keep designation before marking the record as Test.</p><div className="flex flex-wrap gap-2"><Button size="sm" disabled={marking || detail.record.classification==='owner_marked_keep'} onClick={()=>mark('test')}>Mark as Test</Button><Button size="sm" disabled={marking} onClick={()=>mark('keep')}>Mark as Keep</Button>{['owner_marked_test','owner_marked_keep'].includes(detail.record.classification) && <Button size="sm" variant="ghost" disabled={marking} onClick={()=>mark('clear')}>Remove classification</Button>}</div></div>
        </>}
      </aside>
    </div>}
    {!loading && !error && mode === 'pipeline' && pipeline && <section className="bg-surface-card border border-border rounded-2xl p-4 space-y-3">
      <p className="text-sm text-slate-300">These are upstream Pipeline items. Hiding affects SCC discovery only; Pipeline data is never deleted.</p>
      {pipeline.historyComplete === false && <p className="text-xs text-honey-400">Discovery is incomplete: {pipeline.incompleteReason || 'some upstream items may be unavailable.'}</p>}
      {!pipeline.jobs.length && <p className="text-sm text-slate-400">No Pipeline items found in this page.</p>}
      {(pipeline.jobs as PipelineJob[]).map(job=><article key={job.jobId} className="border-t border-border pt-3 flex flex-wrap gap-3 items-center">
        <div className="min-w-0 flex-1"><p className="font-semibold text-slate-100 break-words">{job.title || '(Untitled)'}</p><p className="text-xs text-slate-400 break-all">Pipeline job ID: {job.jobId}</p><p className="text-xs text-slate-400">{job.displayStatus || job.status || 'Unknown status'} · {job.isImported ? `SCC job-ID match: ${job.importedVideoId || 'ID unavailable'} (source unverified)` : 'No SCC match by job ID'} · {job.durationSeconds != null ? `${job.durationSeconds}s` : 'Duration unavailable'} · {classifications[job.ownerClassification || 'unknown']}</p>{!job.sourceFingerprint && <p className="text-xs text-honey-400">Source identity unavailable; classification and hiding are disabled.</p>}</div>
        <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!!pipelineBusy || !job.sourceFingerprint || job.ownerClassification==='owner_marked_keep'} onClick={()=>markPipeline(job.jobId,'test',job.sourceFingerprint!)}>Mark as Test</Button><Button size="sm" disabled={!!pipelineBusy || !job.sourceFingerprint} onClick={()=>markPipeline(job.jobId,'keep',job.sourceFingerprint!)}>Mark as Keep</Button>{job.ownerClassification && job.ownerClassification!=='unknown' && <Button size="sm" variant="ghost" disabled={!!pipelineBusy || !job.sourceFingerprint} onClick={()=>markPipeline(job.jobId,'clear',job.sourceFingerprint!)}>Remove classification</Button>}{job.hidden ? <Button disabled={!!pipelineBusy} onClick={()=>{setMode('hidden');setHiddenOffset(0);}}>Review hidden entries</Button> : <Button disabled={!!pipelineBusy || !job.sourceFingerprint} onClick={()=>setHidden(job.jobId,true,job.sourceFingerprint!)}>Hide from SCC</Button>}</div>
      </article>)}
      <div className="flex gap-2"><Button disabled={!pipelinePrevious.length} onClick={()=>{setPipelineCursor(pipelinePrevious[pipelinePrevious.length-1]);setPipelinePrevious(p=>p.slice(0,-1));}}>Previous</Button><Button disabled={!pipeline.page?.hasMore || !pipeline.page.nextCursor} onClick={()=>{setPipelinePrevious(p=>[...p,pipelineCursor]);setPipelineCursor(pipeline.page?.nextCursor || null);}}>Next</Button></div>
    </section>}
    {!loading && !error && mode === 'hidden' && hiddenPage && <section className="bg-surface-card border border-border rounded-2xl p-4 space-y-3">
      <p className="text-sm text-slate-300">These stable Pipeline IDs are hidden in SCC. Restoring them does not alter upstream data.</p>
      {!hiddenPage.items.length && <p className="text-sm text-slate-400">No hidden Pipeline items on this page.</p>}
      {hiddenPage.items.map(item=><div key={`${item.sourceFingerprint || 'legacy'}:${item.jobId}`} className="flex flex-wrap items-center gap-2 border-t border-border pt-3"><span className="text-xs font-mono text-slate-300 break-all flex-1">{item.jobId} · {classifications[item.ownerClassification || 'unknown']} · {item.legacy ? 'Legacy source unknown' : item.currentSource ? 'Current Pipeline source' : `Other source ${item.sourceFingerprint?.slice(0,12) || 'unknown'}`}</span><Button disabled={!!pipelineBusy} onClick={()=>setHidden(item.jobId,false,item.sourceFingerprint,item.legacy)}>Restore hidden item</Button></div>)}
      <div className="flex gap-2"><Button disabled={!hiddenOffset} onClick={()=>setHiddenOffset(Math.max(0,hiddenOffset-hiddenPage.limit))}>Previous</Button><Button disabled={!hiddenPage.hasMore} onClick={()=>setHiddenOffset(hiddenOffset+hiddenPage.limit)}>Next</Button></div>
    </section>}
    {mode === 'watch' && <section aria-label="Watch-directory files" className="bg-surface-card border border-border rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-slate-100">Watch-directory files</h3>
      <p className="text-sm text-slate-300">These are discovered filesystem entries, separate from SCC library records and Pipeline jobs. Hiding an entry changes only its visibility in SCC; the source file and any imported master remain unchanged.</p>
      <label className="block max-w-xs text-xs font-semibold text-slate-300">Watch visibility
        <select className={choiceClass} value={watchVisibility} onChange={event=>{setWatchVisibility(event.target.value as 'all'|'visible'|'hidden');setWatchOffset(0);}}>
          <option value="all">All current entries</option>
          <option value="visible">Visible items</option>
          <option value="hidden">Hidden items</option>
        </select>
      </label>
      {!loading && !error && watchPage && <>
        {!watchPage.sourceAvailable && <p className="text-sm text-honey-400">The configured watch directory is unavailable. Existing hidden entries can still be inspected and restored using Hidden items.</p>}
        {watchPage.scanIncomplete && <p className="text-sm text-honey-400">The watch-directory scan was incomplete; additional entries may exist.</p>}
        {watchPage.sourceAvailable && !watchPage.items.length && <p className="text-sm text-slate-400">No watch-directory entries found for this filter.</p>}
        {watchPage.items.map(file=><article key={file.fileId || file.fullPath} className="border-t border-border pt-3 flex flex-col sm:flex-row gap-3 items-start">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100 break-words">{file.filename || '(Unnamed file)'}</p>
            <p className="text-xs text-slate-400 break-all">Source path: {file.fullPath}</p>
            <p className="text-xs text-slate-400 break-all">File identity: {file.fileId || 'Unavailable'} · Source: {file.sourceFingerprint || 'Unavailable'}</p>
            <p className="text-xs text-slate-400">Size: {Number.isFinite(file.sizeBytes) ? file.sizeBytes.toLocaleString() + ' bytes' : 'Unavailable'} · Modified: {file.modifiedAt || 'Unavailable'}</p>
            <p className="text-xs text-slate-300">Provenance: Unknown · Visibility: {!file.visibilitySupported ? 'Unavailable pending identification' : file.hidden ? 'Hidden' : 'Visible'}</p>
            {file.isImported && <p className="text-xs text-slate-400">Possible SCC import match: {file.importedVideoId || 'ID unavailable'}; content identity is not verified here.</p>}
            {!file.visibilitySupported && <p className="text-xs text-honey-400">{file.visibilityReason || 'Reliable file identity is unavailable; hiding is disabled.'} This entry is excluded from normal discovery until it can be identified safely.</p>}
          </div>
          <Button disabled={!!watchBusy || !file.visibilitySupported || !file.fileId || !file.sourceFingerprint} onClick={()=>setWatchHidden(file.fileId!,file.sourceFingerprint!,!file.hidden)}>{file.hidden ? 'Restore' : 'Hide from SCC'}</Button>
        </article>)}
        <div className="flex gap-2"><Button disabled={!watchOffset} onClick={()=>setWatchOffset(Math.max(0,watchOffset-watchPage.limit))}>Previous</Button><Button disabled={!watchPage.hasMore} onClick={()=>setWatchOffset(watchOffset+watchPage.limit)}>Next</Button></div>
      </>}
      {!loading && !error && hiddenWatchPage && <>
        {!hiddenWatchPage.items.length && <p className="text-sm text-slate-400">No hidden watch-directory entries on this page.</p>}
        {hiddenWatchPage.items.map(file=><article key={`${file.sourceFingerprint}:${file.fileId}`} className="border-t border-border pt-3 flex flex-col sm:flex-row gap-3 items-start">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100 break-words">{file.filename || '(Unnamed file)'}</p>
            <p className="text-xs text-slate-400 break-all">Source path: {file.fullPath || 'Unavailable'}</p>
            <p className="text-xs text-slate-400 break-all">File identity: {file.fileId} · Source: {file.sourceFingerprint}</p>
            <p className="text-xs text-slate-400">Size: {Number.isFinite(file.sizeBytes) ? file.sizeBytes.toLocaleString() + ' bytes' : 'Unavailable'} · Modified: {file.modifiedAt || 'Unavailable'}</p>
            <p className="text-xs text-slate-300">Provenance: Unknown · Visibility: Hidden · {file.currentSource ? 'Current watch source' : 'Other watch source'} · {file.present === null ? 'Presence could not be checked' : file.present ? 'Same observed file is currently present' : 'Source file is missing or has changed'}</p>
          </div>
          <Button disabled={!!watchBusy} onClick={()=>setWatchHidden(file.fileId,file.sourceFingerprint,false)}>Restore</Button>
        </article>)}
        <div className="flex gap-2"><Button disabled={!watchOffset} onClick={()=>setWatchOffset(Math.max(0,watchOffset-hiddenWatchPage.limit))}>Previous</Button><Button disabled={!hiddenWatchPage.hasMore} onClick={()=>setWatchOffset(watchOffset+hiddenWatchPage.limit)}>Next</Button></div>
      </>}
    </section>}
    <Modal isOpen={reviewOpen} onClose={closeReview} title="Review deletion" maxWidth="max-w-2xl" manageFocus initialFocusRef={cancelRef} dismissible={!deleting} scrollBody>
      <div className="overflow-y-auto min-h-0 space-y-4 text-sm text-slate-300">
        {previewLoading && <p role="status">Checking the selected records and dependencies...</p>}{reviewError && <p role="alert" className="text-rose-400">{reviewError}</p>}
        {preview && <>{preview.canDelete ? <p>Proposed deletion: <strong className="text-slate-100">{preview.total} database {preview.total===1?'row':'rows'}</strong>. This cannot be undone by the application.</p> : <p>No rows can be deleted from this selection. A blocked record prevents the entire operation.</p>}
          {preview.records.map(record=><section key={keyFor(record)} className="border border-border rounded-xl p-3 space-y-2"><p className="font-semibold text-slate-100 break-words">{labelFor(record)}: {record.name || '(Unnamed record)'}</p><p className="text-xs break-all">ID: {record.id}</p><p className={record.eligible?'text-sage-400':'text-rose-400'}>{record.eligible?'Eligible':'Blocked'}: {record.reason}</p><div><strong>Dependencies:</strong>{record.dependencies.length ? <ul className="list-disc pl-5">{record.dependencies.map((dependency,i)=><li key={i} className="break-words">{dependency}</li>)}</ul> : <p>None reported.</p>}</div><div><strong>Rows to delete:</strong>{record.rows.length ? <ul className="list-disc pl-5">{record.rows.map(row=><li key={JSON.stringify([row.table,row.id])} className="break-all">{row.table}: {row.id}</li>)}</ul> : <p>None.</p>}</div></section>)}
          {preview.additionalChanges.length>0 && <div><strong className="text-slate-100">Additional changes:</strong><ul className="list-disc pl-5">{preview.additionalChanges.map((item,i)=><li key={i} className="break-words">{item}</li>)}</ul></div>}<div><strong className="text-slate-100">Unchanged:</strong><ul className="list-disc pl-5">{preview.unchanged.map((item,i)=><li key={i}>{item}</li>)}</ul></div>
          {!preview.canDelete && <p role="alert" className="text-rose-400">This selection is blocked. Cancel and change the selection before reviewing again.</p>}{preview.canDelete && <label className="flex flex-col gap-1.5 text-slate-100 font-semibold">Type {preview.confirmationPhrase} to permanently delete these rows<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" className={choiceClass}/></label>}
        </>}
      </div><div className="flex flex-wrap justify-end gap-2 pt-4 shrink-0"><button ref={cancelRef} type="button" className="scc-btn-secondary" disabled={deleting} onClick={closeReview}>Cancel</button><Button variant="danger" loading={deleting} disabled={!preview?.canDelete || confirmation!==preview.confirmationPhrase} onClick={confirmDeletion}>Delete selected records</Button></div>
    </Modal>
  </div>;
};
