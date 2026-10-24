import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Account } from '../types';
import { DraftAttachment, DraftDestination, DraftInput, GeneralPostType, ImageAsset, PostCapabilities, PublishingDraft } from '../types/general-posts';

const emptyDestination = (accountId: string, attachments: DraftAttachment[] = []): DraftDestination => ({ accountId, caption: '', hashtags: '', linkUrl: '', attachments: attachments.map(a => ({ ...a })) });
const normalized = (value: DraftInput) => ({ title: value.title, contentType: value.contentType, scheduledAt: value.scheduledAt || null,
  destinations: value.destinations.map(d => ({ ...emptyDestination(d.accountId), ...d, hashtags: d.hashtags || '', linkUrl: d.linkUrl || '', attachments: d.attachments || [] })) });
const bangkokTime = (value?: string | null) => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(' ', 'T') : '';

export function useGeneralPosts(accounts: Account[], contentType: GeneralPostType, onContentTypeChange: (type: GeneralPostType) => void, onQueued: () => void) {
  const [drafts, setDrafts] = useState<PublishingDraft[]>([]);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, PostCapabilities>>({});
  const [current, setCurrent] = useState<PublishingDraft | null>(null);
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<Record<string, DraftDestination>>({});
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [scheduled, setScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Draft-only mode. Saving or approving a draft does not publish it.');
  const accountIds = accounts.map(a => a.id).join(',');

  async function loadLibrary() {
    const [d, m] = await Promise.all([api.getPublishingDrafts(), api.getImages()]);
    setDrafts(d.drafts); setImages(m.images);
  }
  useEffect(() => { loadLibrary().catch(e => setError(e.message)); }, []);
  useEffect(() => {
    let active = true;
    Promise.all(accounts.map(async a => [a.id, await api.getPostCapabilities(a.id)] as const)).then(items => {
      if (active) setCapabilities(Object.fromEntries(items));
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [accountIds]);

  function input(): DraftInput {
    const stamp = scheduled && scheduleTime ? Date.parse(scheduleTime + '+07:00') : NaN;
    return { title, contentType, scheduledAt: scheduled && Number.isFinite(stamp) ? new Date(stamp).toISOString() : null,
      destinations: selectedIds.map(id => { const d = destinations[id] || emptyDestination(id, attachments); return { ...d, attachments: contentType === 'image' || contentType === 'multi_image' ? d.attachments : [], linkUrl: contentType === 'link' ? d.linkUrl || '' : '' }; }) };
  }
  const dirty = !current || scheduled !== Boolean(current.scheduledAt) || (scheduled && (!scheduleTime || !Number.isFinite(Date.parse(scheduleTime + '+07:00')))) || JSON.stringify(normalized(input())) !== JSON.stringify(normalized(current));
  const locked = current?.status === 'queued';
  const allSupported = selectedIds.length > 0 && selectedIds.every(id => capabilities[id]?.supportedPostTypes.includes(contentType));

  function loadDraft(draft: PublishingDraft) {
    if (draft.contentType === 'reel') { setError('Open Reel drafts through the video workflow.'); return; }
    onContentTypeChange(draft.contentType);
    setCurrent(draft); setTitle(draft.title);
    setSelectedIds(draft.destinations.map(d => d.accountId));
    setDestinations(Object.fromEntries(draft.destinations.map(d => [d.accountId, { ...emptyDestination(d.accountId), ...d }])));
    setAttachments(draft.destinations[0]?.attachments || []);
    setScheduled(Boolean(draft.scheduledAt)); setScheduleTime(bangkokTime(draft.scheduledAt));
    setError(''); setNotice('Loaded revision ' + draft.revision + '. Material edits require saving and approval again.');
  }
  function newDraft() {
    setCurrent(null); setTitle(''); setSelectedIds([]); setDestinations({}); setAttachments([]);
    setScheduled(false); setScheduleTime(''); setError(''); setNotice('New unpublished draft.');
  }
  function toggleAccount(accountId: string) {
    setSelectedIds(prev => prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId]);
    setDestinations(prev => prev[accountId] ? prev : { ...prev, [accountId]: emptyDestination(accountId, attachments) });
  }
  function updateDestination(id: string, update: Partial<DraftDestination>) {
    setDestinations(prev => ({ ...prev, [id]: { ...(prev[id] || emptyDestination(id, attachments)), ...update } }));
  }
  function updateAttachments(id: string, next: DraftAttachment[]) { updateDestination(id, { attachments: next }); }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'The request failed.'); }
    finally { setBusy(false); }
  }
  function save() { return run(async () => {
    if (!title.trim()) throw new Error('Enter a draft title.');
    if (!selectedIds.length) throw new Error('Select at least one supported Facebook Page destination.');
    if (scheduled && (!scheduleTime || !Number.isFinite(Date.parse(scheduleTime + '+07:00')) || Date.parse(scheduleTime + '+07:00') <= Date.now())) throw new Error('Choose a future time in Asia/Bangkok.');
    const result = await api.savePublishingDraft(input(), current?.id, current?.revision);
    loadDraft(result.draft); await loadLibrary(); setNotice('Draft saved. Nothing has been published.');
  }); }
  function action(action: 'approve' | 'reject' | 'queue') { return run(async () => {
    if (!current || dirty) throw new Error('Save the current revision before this action.');
    const result = await api.publishingDraftAction(current.id, action, current.revision);
    loadDraft(result.draft); await loadLibrary();
    setNotice(action === 'queue' ? 'Approved revision sent to the normal publishing queue.' : action === 'approve' ? 'Exact revision and destinations approved. It remains unpublished until explicitly queued.' : 'Draft rejected.');
    if (action === 'queue') onQueued();
  }); }
  function batchApprove() { return run(async () => {
    const selected = drafts.filter(d => batchIds.includes(d.id) && d.status !== 'queued').map(d => ({ id: d.id, revision: d.revision }));
    if (!selected.length) throw new Error('Select saved drafts for review.');
    await api.approvePublishingDraftBatch(selected); setBatchIds([]); await loadLibrary();
    if (current) { const res = await api.getPublishingDrafts(); const fresh = res.drafts.find(d => d.id === current.id); if (fresh && !dirty) loadDraft(fresh); }
    setNotice('Selected exact revisions approved. No drafts were queued.');
  }); }
  function upload(files: File[]) { return run(async () => {
    const uploaded: ImageAsset[] = [];
    for (const file of files) uploaded.push((await api.uploadImage(file)).image);
    await loadLibrary();
    const next = uploaded.map(m => ({ mediaId: m.id, altText: '' }));
    setAttachments(prev => contentType === 'image' ? next.slice(0, 1) : [...prev, ...next]);
    for (const id of selectedIds) {
      const prev = destinations[id]?.attachments || [];
      updateAttachments(id, contentType === 'image' ? next.slice(0, 1) : [...prev, ...next]);
    }
    setNotice('Original images saved locally. No crop or watermark has been applied.');
  }); }
  function addImage(id: string) {
    const item = { mediaId: id, altText: '' };
    setAttachments(prev => contentType === 'image' ? [item] : prev.some(a => a.mediaId === id) ? prev : [...prev, item]);
    for (const accountId of selectedIds) {
      const prev = destinations[accountId]?.attachments || [];
      updateAttachments(accountId, contentType === 'image' ? [item] : prev.some(a => a.mediaId === id) ? prev : [...prev, item]);
    }
  }
  return { drafts, images, capabilities, current, title, setTitle, selectedIds, destinations, scheduled, setScheduled, scheduleTime, setScheduleTime, batchIds, setBatchIds, busy, error, notice, dirty, locked, allSupported,
    loadDraft, newDraft, toggleAccount, updateDestination, updateAttachments, save, action, batchApprove, upload, addImage, loadLibrary };
}
