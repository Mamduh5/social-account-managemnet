import React from 'react';
import { Account } from '../../types';
import { GeneralPostType } from '../../types/general-posts';
import { useGeneralPosts } from '../../hooks/useGeneralPosts';

const inputClass = 'w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-terracotta-500';
const buttonClass = 'px-3 py-2 rounded-xl border border-border bg-surface text-xs font-semibold hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed';
const cardClass = 'bg-surface-card border border-border rounded-2xl p-5 space-y-4';
const typeLabels = { text: 'Text-only', image: 'Single image', multi_image: 'Multiple images', link: 'Link' };
interface Props { accounts: Account[]; contentType: GeneralPostType; onContentTypeChange: (type: GeneralPostType) => void; onQueued: () => void }

export function GeneralPostComposer({ accounts, contentType, onContentTypeChange, onQueued }: Props) {
  const draft = useGeneralPosts(accounts, contentType, onContentTypeChange, onQueued);
  const imagePost = contentType === 'image' || contentType === 'multi_image';
  const savedDrafts = draft.drafts.filter(d => d.contentType !== 'reel');
  const approved = draft.current?.status === 'approved' && draft.current.approvedRevision === draft.current.revision && !draft.dirty && draft.allSupported;
  return <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
    <form className="xl:col-span-8 space-y-5" onSubmit={e => { e.preventDefault(); void draft.save(); }}>
      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold">{typeLabels[contentType]} Page draft</h3>
          <button type="button" className={buttonClass} onClick={draft.newDraft}>New Draft</button>
        </div>
        <p className="text-xs text-slate-400">Draft-only mode is enabled. Save, review and approve first; dispatch is a separate explicit action. TikTok general posts are unavailable.</p>
        <label className="block space-y-1 text-xs font-semibold">Draft title
          <input aria-label="Draft title" value={draft.title} onChange={e => draft.setTitle(e.target.value)} disabled={draft.locked || draft.busy} required maxLength={250} className={inputClass} />
        </label>
        {draft.current && <p className="text-xs text-slate-300">Revision {draft.current.revision} · <span className="uppercase">{draft.current.status}</span>{draft.dirty && ' · Unsaved changes; approval required again'}</p>}
      </section>

      {imagePost && <section className={cardClass}>
        <h3 className="font-semibold text-sm">Images</h3>
        <p className="text-xs text-slate-400">Upload JPEG or PNG originals up to 4 MB each. Preview preserves the full image. No automatic crop or watermark. Order and alternative text are set separately for each destination below.</p>
        <label className="block text-xs font-semibold space-y-2">Upload images
          <input aria-label="Upload images" type="file" accept="image/jpeg,image/png" multiple={contentType === 'multi_image'} disabled={draft.busy || draft.locked} className={inputClass}
            onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) void draft.upload(files); }} />
        </label>
        {draft.images.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-72 overflow-y-auto">
          {draft.images.map(image => <button key={image.id} data-library-media-id={image.id} type="button" aria-label={'Add image ' + image.original_filename} disabled={draft.busy || draft.locked} onClick={() => draft.addImage(image.id)} className="p-2 text-left bg-surface rounded-xl border border-border disabled:opacity-40">
            <img src={image.previewUrl} alt={image.original_filename} className="w-full h-24 object-contain rounded-lg" />
            <span className="block truncate text-[10px] mt-1">{image.original_filename}</span>
            <span className="text-[10px] text-slate-400">{image.width} × {image.height} · Add to selected</span>
          </button>)}
        </div>}
      </section>}

      <section className={cardClass}>
        <h3 className="text-sm font-bold">Destination accounts</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {accounts.map(account => {
            const capability = draft.capabilities[account.id];
            const supported = capability?.supportedPostTypes.includes(contentType) === true;
            const selected = draft.selectedIds.includes(account.id);
            return <label key={account.id} className={'p-3 rounded-xl border text-xs flex items-start gap-2 ' + (selected ? 'border-terracotta-500 bg-terracotta-500/10' : 'border-border bg-surface')}>
              <input type="checkbox" aria-label={'Select Page destination ' + account.name} checked={selected} onChange={() => draft.toggleAccount(account.id)} disabled={draft.busy || draft.locked || ((account.platform !== 'facebook' || account.account_type !== 'page') && !selected)} />
              <span className="min-w-0"><span className="font-semibold">{account.is_demo ? 'DEMO: ' : ''}{account.name}</span><span className="block text-slate-400 mt-1">{account.platform} · {supported ? account.is_demo ? 'Local simulator only' : 'Page API available' : capability?.reason || (capability ? 'This post type is unavailable' : 'Checking capability…')}</span></span>
            </label>;
          })}
          {!accounts.length && <p className="text-xs text-slate-400">Register a Facebook Page or show demo targets to prepare a draft.</p>}
        </div>
        {draft.selectedIds.map(accountId => {
          const account = accounts.find(a => a.id === accountId);
          const destination = draft.destinations[accountId];
          if (!destination) return null;
          const supported = draft.capabilities[accountId]?.supportedPostTypes.includes(contentType);
          return <fieldset key={accountId} disabled={draft.busy || draft.locked} className="border border-border rounded-xl p-4 space-y-3" data-draft-account-id={accountId}>
            <legend className="px-2 text-xs font-semibold">{account?.name || accountId}</legend>
            {!supported && <p className="text-xs text-rose-300">Draft preparation is available. API approval and dispatch require supported Page authorization for this post type.</p>}
            <label className="block text-xs space-y-1">Text / caption
              <textarea aria-label={'Caption for ' + (account?.name || accountId)} value={destination.caption} onChange={e => draft.updateDestination(accountId, { caption: e.target.value })} className={inputClass} rows={5} maxLength={60000} required={contentType === 'text'} />
            </label>
            <label className="block text-xs space-y-1">Hashtags (optional)
              <input aria-label={'Hashtags for ' + (account?.name || accountId)} value={destination.hashtags || ''} onChange={e => draft.updateDestination(accountId, { hashtags: e.target.value })} className={inputClass} />
            </label>
            {contentType === 'link' && <label className="block text-xs space-y-1">Public link (HTTP or HTTPS)
              <input aria-label={'Link for ' + (account?.name || accountId)} type="url" required value={destination.linkUrl || ''} onChange={e => draft.updateDestination(accountId, { linkUrl: e.target.value })} placeholder="https://example.com/article" className={inputClass} />
            </label>}
            {imagePost && <div className="space-y-3" aria-label={'Image order for ' + (account?.name || accountId)}>
              {!destination.attachments.length && <p className="text-xs text-slate-400">Upload or add an image from the library above.</p>}
              {destination.attachments.map((attachment, index) => {
                const image = draft.images.find(i => i.id === attachment.mediaId);
                const move = (delta: number) => {
                  const next = [...destination.attachments];
                  [next[index], next[index + delta]] = [next[index + delta], next[index]];
                  draft.updateAttachments(accountId, next);
                };
                return <div key={attachment.mediaId} data-media-id={attachment.mediaId} className="bg-surface border border-border rounded-xl p-3 flex gap-3">
                  <img src={image?.previewUrl} alt={attachment.altText || image?.original_filename || 'Uploaded image'} className="w-20 h-20 object-contain shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs truncate">{index + 1}. {image?.original_filename || attachment.mediaId}</p>
                    <input aria-label={'Alternative text image ' + (index + 1) + ' for ' + (account?.name || accountId)} value={attachment.altText || ''} onChange={e => draft.updateAttachments(accountId, destination.attachments.map((a, i) => i === index ? { ...a, altText: e.target.value } : a))} className={inputClass} maxLength={1000} placeholder="Alternative text (optional)" />
                    <div className="flex flex-wrap gap-2">
                      {contentType === 'multi_image' && <><button type="button" className={buttonClass} aria-label={'Move image ' + (index + 1) + ' up for ' + (account?.name || accountId)} disabled={index === 0} onClick={() => move(-1)}>Move up</button><button type="button" className={buttonClass} aria-label={'Move image ' + (index + 1) + ' down for ' + (account?.name || accountId)} disabled={index === destination.attachments.length - 1} onClick={() => move(1)}>Move down</button></>}
                      <button type="button" className={buttonClass} aria-label={'Remove image ' + (index + 1) + ' for ' + (account?.name || accountId)} onClick={() => draft.updateAttachments(accountId, destination.attachments.filter((_, i) => i !== index))}>Remove</button>
                    </div>
                  </div>
                </div>;
              })}
            </div>}
          </fieldset>;
        })}
      </section>

      <section className={cardClass}>
        <label className="flex gap-2 text-sm items-center"><input type="checkbox" aria-label="Prepare scheduled draft" checked={draft.scheduled} onChange={e => draft.setScheduled(e.target.checked)} disabled={draft.busy || draft.locked} />Prepare a scheduled draft</label>
        {draft.scheduled && <label className="block text-xs space-y-2">Target date and time (Asia/Bangkok)
          <input aria-label="Draft schedule Asia/Bangkok" type="datetime-local" value={draft.scheduleTime} onChange={e => draft.setScheduleTime(e.target.value)} required disabled={draft.busy || draft.locked} className={inputClass} />
        </label>}
        <p className="text-xs text-slate-400">The saved time and exact destinations are part of the review. Scheduling requires approval followed by Queue Approved Draft. The local server and PC must remain available.</p>
        {draft.error && <p role="alert" className="text-sm text-rose-300">{draft.error}</p>}
        <p role="status" className="text-xs text-slate-300">{draft.notice}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={draft.busy || draft.locked} className="px-4 py-2 rounded-xl bg-terracotta-600 text-white font-semibold text-sm disabled:opacity-40">Save Draft</button>
          <button type="button" onClick={() => void draft.action('approve')} disabled={draft.busy || draft.dirty || draft.locked || approved || !draft.allSupported} className={buttonClass}>Approve Exact Revision</button>
          <button type="button" onClick={() => void draft.action('reject')} disabled={draft.busy || draft.dirty || draft.locked} className={buttonClass}>Reject Draft</button>
          <button type="button" onClick={() => void draft.action('queue')} disabled={draft.busy || !approved || draft.locked} className={buttonClass}>Queue Approved Draft</button>
        </div>
      </section>
    </form>

    <aside className="xl:col-span-4 space-y-4">
      <section className={cardClass}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Saved Drafts</h3><button type="button" className={buttonClass} onClick={() => void draft.loadLibrary().catch(() => {})}>Refresh Drafts</button></div>
        <p className="text-xs text-slate-400">Review each revision and its destinations before selecting drafts for batch approval. Approval alone does not queue content.</p>
        <button type="button" className={buttonClass} disabled={draft.busy || !draft.batchIds.length} onClick={() => void draft.batchApprove()}>Batch Approve Selected ({draft.batchIds.length})</button>
        <div className="space-y-3 max-h-[650px] overflow-y-auto">
          {savedDrafts.map(item => <div key={item.id} data-draft-id={item.id} className={'p-3 rounded-xl border space-y-2 ' + (draft.current?.id === item.id ? 'border-terracotta-500' : 'border-border')}>
            <div className="flex gap-2 items-start">
              <input type="checkbox" aria-label={'Select draft for batch approval ' + item.title} checked={draft.batchIds.includes(item.id)} disabled={item.status === 'queued' || draft.busy} onChange={e => draft.setBatchIds(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} />
              <button type="button" onClick={() => draft.loadDraft(item)} className="text-left min-w-0" aria-label={'Load draft ' + item.title}><span className="block font-semibold text-sm break-words">{item.title}</span><span className="text-[11px] text-slate-400">{typeLabels[item.contentType as GeneralPostType]} · revision {item.revision} · {item.status}</span></button>
            </div>
            <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-3">{item.destinations[0]?.caption}</p>
            <p className="text-[10px] text-slate-400">{item.destinations.length} destination(s){item.scheduledAt ? ' · ' + new Date(item.scheduledAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false }) + ' Asia/Bangkok' : ''}</p>
          </div>)}
          {!savedDrafts.length && <p className="text-xs text-slate-400">No saved Page drafts yet.</p>}
        </div>
      </section>
    </aside>
  </div>;
}
