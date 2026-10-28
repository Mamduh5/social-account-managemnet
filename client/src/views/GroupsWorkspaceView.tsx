import React, { useEffect, useRef, useState } from 'react';
import type { GroupEligibility, GroupListFilters, GroupMembershipStatus, GroupPackageDto } from '../../../server/src/domain/groups';
import { canonicalGroupIdentity } from '../../../server/src/domain/groups';
import { useGroupsWorkspace } from '../hooks/useGroupsWorkspace';

const inputClass = 'w-full min-w-0 bg-surface border border-border rounded-lg p-2 text-sm text-slate-100';
const buttonClass = 'px-3 py-2 rounded-lg border border-border text-sm bg-surface hover:bg-surface-hover disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-honey-400';
const cardClass = 'min-w-0 bg-surface-card border border-border rounded-xl p-4 space-y-3';
const membershipOptions: { value: GroupMembershipStatus; label: string }[] = [
  { value: 'unknown', label: 'Unknown' }, { value: 'not_member', label: 'Not a member' },
  { value: 'request_pending', label: 'Request pending' }, { value: 'member', label: 'Member' }, { value: 'admin', label: 'Admin' },
  { value: 'request_rejected', label: 'Request rejected' }, { value: 'request_withdrawn', label: 'Request withdrawn' },
  { value: 'participation_restricted', label: 'Participation restricted' },
];
const membershipLabel = (value: GroupMembershipStatus) => membershipOptions.find(o => o.value === value)?.label || value;
const dateLabel = (value?: string | null) => !value ? 'Not recorded' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value} (date only)` : new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) + ' Bangkok';

export function GroupsWorkspaceView() {
  const w = useGroupsWorkspace();
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [filters, setFilters] = useState<GroupListFilters>({ archived: false });
  const [membership, setMembership] = useState<GroupMembershipStatus>('unknown');
  const [observedAt, setObservedAt] = useState('');
  const [observationNotes, setObservationNotes] = useState('');
  const group = w.selectedGroup;
  const actorChanged = !!group && (w.form.identityType !== group.identity_type || (w.form.identityType === 'page' && w.form.accountId !== group.account_id));
  const groupChanged = !!group && (() => { try { return canonicalGroupIdentity(w.form.url).canonicalKey !== group.canonicalKey; } catch { return false; } })();
  useEffect(() => { setMembership(group?.membership || 'unknown'); setObservedAt(''); setObservationNotes(''); }, [group?.id, group?.account_id, group?.url, group?.membership]);
  const choices = group && !w.groups.some(g => g.id === group.id) ? [group, ...w.groups] : w.groups;
  const field = <K extends keyof typeof w.form>(name: K, value: (typeof w.form)[K]) => w.setForm(f => ({ ...f, [name]: value }));
  const eligibility = <K extends keyof GroupEligibility>(name: K, value: GroupEligibility[K]) => w.setForm(f => ({ ...f, eligibility: { ...f.eligibility, [name]: value } }));
  const resumeReview = () => { if (group) void w.run(async () => { if (await w.selectGroup(group)) reviewHeading.current?.focus(); }); };
  const selectGroup = (id: string) => { const selected = choices.find(g => g.id === id); if (selected) void w.run(async () => { await w.selectGroup(selected); }); else w.newGroup(); };
  const clearFilters = () => { const cleared: GroupListFilters = {}; setFilters(cleared); void w.run(() => w.refresh(cleared)); };
  const copy = (text: string, message: string) => void w.run(async () => { await navigator.clipboard.writeText(text); w.setMessage(message); });

  return <div className="space-y-5 max-w-6xl">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-2xl font-bold">Groups Planning</h2><p className="text-sm text-slate-400 mt-1">Register external Groups, review Page membership, and prepare manual handoffs.</p></div>
      <a className={buttonClass} href="https://www.facebook.com/search/groups/" target="_blank" rel="noopener noreferrer">Open Facebook Group search</a>
    </div>
    <div className="border border-honey-500/30 bg-honey-500/5 text-honey-400 rounded-xl p-4 text-sm">All membership, rules, approvals and receipts are owner entered and unverified. Opening Facebook never changes status. Membership approval does not grant permission to post. Page API publishing cannot target a Group.</div>
    {w.error && <p role="alert" className="text-red-400">{w.error}</p>}
    {w.message && <p role="status" className="text-sage-400">{w.message}</p>}

    {w.reminders.length > 0 && <section className={cardClass}>
      <h3 className="font-semibold">Pending manual posting reminders</h3><p className="text-xs text-slate-400">Due labels update while this view is open. No background notifications or automatic posting.</p>
      {w.reminders.map(r => <div key={r.preparedId} className="flex flex-wrap gap-2 items-center border-t border-border pt-2">
        <button className={`${buttonClass} flex-1 text-left`} disabled={w.busy} onClick={() => void w.run(() => w.openPackage(r.preparedId, r.groupId))}>{Date.parse(r.reminderAt) <= w.now ? 'Due · ' : ''}{r.groupName} · {r.sourcePage?.name || 'Personal profile (manual)'} · {dateLabel(r.reminderAt)}</button>
        <button className={buttonClass} disabled={w.busy} onClick={() => void w.run(() => w.updateReminder(r.preparedId, 'cancelled'))}>Cancel reminder</button>
        <button className={buttonClass} disabled={w.busy} onClick={() => void w.run(() => w.updateReminder(r.preparedId, 'dismissed'))}>Dismiss reminder</button>
      </div>)}
    </section>}

    <section className={cardClass} aria-label="Group filters">
      <h3 className="font-semibold">Find saved Groups</h3>
      <form className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" onSubmit={e => { e.preventDefault(); void w.run(() => w.refresh(filters)); }}>
        <label className="text-sm">Search saved Groups<input aria-label="Search saved Groups" className={`${inputClass} mt-1`} value={filters.query || ''} onChange={e => setFilters(f => ({ ...f, query: e.target.value }))} /></label>
        <label className="text-sm">Acting Page<select className={`${inputClass} mt-1`} value={filters.accountId || ''} onChange={e => setFilters(f => ({ ...f, accountId: e.target.value || undefined }))}><option value="">All Pages / personal handoffs</option>{w.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="text-sm">Membership filter<select className={`${inputClass} mt-1`} value={filters.membership || ''} onChange={e => setFilters(f => ({ ...f, membership: e.target.value as GroupMembershipStatus || undefined }))}><option value="">All membership states</option>{membershipOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className="text-sm">Category filter<input className={`${inputClass} mt-1`} value={filters.category || ''} onChange={e => setFilters(f => ({ ...f, category: e.target.value || undefined }))} /></label>
        <label className="text-sm">Archive status<select className={`${inputClass} mt-1`} value={filters.archived === undefined ? 'all' : filters.archived ? 'archived' : 'active'} onChange={e => setFilters(f => ({ ...f, archived: e.target.value === 'all' ? undefined : e.target.value === 'archived' }))}><option value="all">All Groups</option><option value="active">Active Groups</option><option value="archived">Archived Groups</option></select></label>
        <div className="flex flex-wrap gap-3 items-end"><label className="flex gap-2 items-center text-sm py-2"><input type="checkbox" checked={!!filters.shortlisted} onChange={e => setFilters(f => ({ ...f, shortlisted: e.target.checked ? true : undefined }))} />Shortlisted only</label><button className={buttonClass} disabled={w.busy} type="submit">Apply filters</button><button className={buttonClass} disabled={w.busy} type="button" onClick={clearFilters}>Clear Filters</button></div>
      </form>
      {!w.busy && !w.error && w.hasRegisteredGroups !== null && w.groups.length === 0 && <div role="status" className="rounded-lg border border-border bg-surface p-3 text-sm space-y-1">
        <p className="font-semibold">{w.hasRegisteredGroups ? 'No matching Groups' : 'No Groups registered yet'}</p>
        <p className="text-slate-400">{w.hasRegisteredGroups ? 'The current search and filter combination returned no results. Use Clear Filters to show all saved Groups.' : 'Register your first Group using the Group registry form below.'}</p>
        <p className="text-xs text-slate-400">Your selected Group, form edits and handoff draft are unchanged.</p>
      </div>}
    </section>

    <div className="grid lg:grid-cols-2 gap-5 items-start">
      <section className={cardClass}>
        <div className="flex flex-wrap justify-between gap-2 items-center"><h3 className="font-semibold">Group registry</h3><button className={buttonClass} onClick={w.newGroup}>New group plan</button></div>
        <label className="block text-sm">Saved group<select aria-label="Saved group plan" className={`${inputClass} mt-1`} value={group?.id || ''} onChange={e => selectGroup(e.target.value)}><option value="">Select a group plan</option>{choices.map(g => <option key={g.id} value={g.id}>{g.shortlisted ? '★ ' : ''}{g.name} · {w.accounts.find(a => a.id === g.account_id)?.name || (g.identity_type === 'personal' ? 'Personal manual' : 'Page unavailable')} · {membershipLabel(g.membership)}{g.archivedAt ? ' · Archived' : ''} (unverified)</option>)}</select></label>
        <label className="block text-sm">Group name<input className={`${inputClass} mt-1`} value={w.form.name} onChange={e => field('name', e.target.value)} /></label>
        <label className="block text-sm">Group URL<input placeholder="https://www.facebook.com/groups/…" className={`${inputClass} mt-1`} value={w.form.url} onChange={e => field('url', e.target.value)} /></label>
        {group && <div className="text-xs text-slate-400 break-all space-y-2"><p>Stable Group key: {group.canonicalKey || 'Legacy URL requires review'}</p><p>Originally registered URL: {group.originalUrl}</p>{group.legacyDuplicate && <p className="text-honey-400">Preserved legacy duplicate. Review and archive duplicate active plans manually.</p>}{group.canonicalUrl && <a className={`${buttonClass} inline-block`} href={group.canonicalUrl} target="_blank" rel="noopener noreferrer">Open Group in Facebook</a>}</div>}
        <label className="block text-sm">Intended posting identity<select aria-label="Intended posting identity" className={`${inputClass} mt-1`} value={w.form.identityType} onChange={e => w.setForm(f => ({ ...f, identityType: e.target.value as 'page' | 'personal', accountId: '', membership: 'unknown' }))}><option value="page">Facebook Page</option><option value="personal">Personal profile (manual)</option></select></label>
        {w.form.identityType === 'page' && <label className="block text-sm">Intended Page<select aria-label="Group intended Page" className={`${inputClass} mt-1`} value={w.form.accountId} onChange={e => w.setForm(f => ({ ...f, accountId: e.target.value, membership: 'unknown' }))}><option value="">Select Page</option>{w.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
        {w.form.identityType === 'personal' && <p className="text-xs text-slate-400">Manual identity only. No personal Facebook account or verified membership is created.</p>}
        <label className="block text-sm">Category<input className={`${inputClass} mt-1`} value={w.form.category} onChange={e => field('category', e.target.value)} /></label>
        <label className="block text-sm">Notes<textarea className={`${inputClass} mt-1`} rows={2} value={w.form.notes} onChange={e => field('notes', e.target.value)} /></label>
        <div className="flex flex-wrap gap-4 text-sm"><label className="flex gap-2 items-center"><input type="checkbox" checked={w.form.shortlisted} onChange={e => field('shortlisted', e.target.checked)} />Shortlisted</label><label className="flex gap-2 items-center"><input type="checkbox" checked={w.form.archived} onChange={e => field('archived', e.target.checked)} />Archived</label></div>

        <div className="border-t border-border pt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 ref={reviewHeading} tabIndex={-1} className="font-semibold">Eligibility and owner review</h4><button className={buttonClass} disabled={w.busy || !group || w.hasUnsavedChanges} onClick={resumeReview}>Resume Review</button></div>
          <p className="text-xs text-slate-400">Last owner review: {dateLabel(group?.reviewedAt)}. Opening review does not mark it complete or perform a Facebook action.</p>
          {(actorChanged || groupChanged) && <p role="status" className="text-xs text-honey-400">Changing the acting identity clears participation approval and membership answers. Changing the Group also clears its eligibility and rules. Save the change, then review the new context.</p>}
          {group && !group.reviewedAt && <p className="text-xs text-honey-400">Owner re-review required: confirm the saved Group, acting identity, eligibility and answers before marking review complete.</p>}
          <label className="block text-sm">Pages can join<select className={`${inputClass} mt-1`} value={w.form.eligibility.pagesCanJoin} onChange={e => eligibility('pagesCanJoin', e.target.value as GroupEligibility['pagesCanJoin'])}><option value="unknown">Unknown</option><option value="yes">Yes (owner observed)</option><option value="no">No (owner observed)</option></select></label>
          <label className="block text-sm">Owner-supplied group rules<textarea className={`${inputClass} mt-1`} rows={4} value={w.form.rules} onChange={e => field('rules', e.target.value)} /></label>
          <label className="block text-sm">Rules last reviewed<input type="date" className={`${inputClass} mt-1`} value={w.form.rulesReviewedAt} onChange={e => field('rulesReviewedAt', e.target.value)} /></label>
          <label className="block text-sm">Promotional restrictions<textarea className={`${inputClass} mt-1`} rows={2} value={w.form.eligibility.promotionalRestrictions} onChange={e => eligibility('promotionalRestrictions', e.target.value)} /></label>
          <fieldset className="space-y-3"><legend className="text-sm">Membership questions and owner-provided answers</legend>{w.form.eligibility.questions.map((q, index) => <div key={index} className="border border-border rounded-lg p-2 space-y-2"><label className="block text-xs">Question {index + 1}<textarea className={`${inputClass} mt-1`} rows={2} value={q.question} onChange={e => eligibility('questions', w.form.eligibility.questions.map((item, i) => i === index ? { ...item, question: e.target.value } : item))} /></label><label className="block text-xs">Owner answer {index + 1}<textarea className={`${inputClass} mt-1`} rows={2} value={q.answer} onChange={e => eligibility('questions', w.form.eligibility.questions.map((item, i) => i === index ? { ...item, answer: e.target.value } : item))} /></label><button className={buttonClass} disabled={w.busy} onClick={() => eligibility('questions', w.form.eligibility.questions.filter((_, i) => i !== index))}>Remove question {index + 1}</button></div>)}<button className={buttonClass} disabled={w.busy} onClick={() => eligibility('questions', [...w.form.eligibility.questions, { question: '', answer: '' }])}>Add membership question</button></fieldset>
          <label className="block text-sm">Participation approval<select className={`${inputClass} mt-1`} value={w.form.eligibility.participationApproval} onChange={e => eligibility('participationApproval', e.target.value as GroupEligibility['participationApproval'])}><option value="unknown">Unknown</option><option value="required">Required / pending</option><option value="not_required">Not required (owner observed)</option><option value="approved">Approved (owner observed)</option><option value="restricted">Restricted</option></select></label>
          <label className="block text-sm">Post moderation<select className={`${inputClass} mt-1`} value={w.form.eligibility.postModeration} onChange={e => eligibility('postModeration', e.target.value as GroupEligibility['postModeration'])}><option value="unknown">Unknown</option><option value="required">Posts require moderation</option><option value="not_required">Not required (owner observed)</option></select></label>
        </div>
        <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={w.busy} onClick={() => void w.run(() => w.saveGroup())}>Save group plan</button><button className={buttonClass} disabled={w.busy || !group} onClick={() => void w.run(() => w.saveGroup(true))}>Save and mark owner review complete</button></div>
        {group && <div className="border-t border-border pt-3 text-sm space-y-2"><h4 className="font-semibold">Readiness: {group.readiness.state === 'reviewed_for_manual_handoff' ? 'Owner review recorded' : group.readiness.state === 'not_ready' ? 'Participation needs attention' : 'Needs review'}</h4><p className="text-xs text-slate-400">Informational and unverified. The owner must decide whether each post complies with Group rules, even when membership is approved.</p>{group.readiness.reasons.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1">{group.readiness.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}</div>}

        {group && <div className="border-t border-border pt-3 space-y-3">
          <h4 className="font-semibold">Membership observations</h4><p className="text-sm">Current status: {membershipLabel(group.membership)} (owner entered, unverified)</p>
          {group.identity_type === 'page' ? <><p className="text-xs text-slate-400">Acting Page: {w.accounts.find(a => a.id === group.account_id)?.name || group.account_id}. Record only what you observed after using Facebook yourself.</p>
            <label className="block text-sm">Observed membership status<select aria-label="Membership/admin (unverified)" className={`${inputClass} mt-1`} disabled={w.busy} value={membership} onChange={e => setMembership(e.target.value as GroupMembershipStatus)}>{membershipOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label className="block text-sm">Observation date<input type="date" className={`${inputClass} mt-1`} disabled={w.busy} value={observedAt} onChange={e => setObservedAt(e.target.value)} /></label>
            <label className="block text-sm">Membership observation notes<textarea className={`${inputClass} mt-1`} rows={2} disabled={w.busy} value={observationNotes} onChange={e => setObservationNotes(e.target.value)} /></label>
            <button className={buttonClass} disabled={w.busy || !observedAt || w.hasUnsavedChanges} onClick={() => void w.run(async () => { await w.recordMembership({ status: membership, observedAt, notes: observationNotes }); setObservationNotes(''); })}>Record owner membership observation</button>
          </> : <p className="text-xs text-slate-400">Personal handoffs retain their historical notes. Page membership observations require a saved acting Page.</p>}
          {w.hasUnsavedChanges && <p className="text-xs text-honey-400">Save registry changes before recording membership or preparing a handoff.</p>}
          <ol className="max-h-48 overflow-y-auto space-y-2 text-xs">{group.membershipObservations.map(o => <li key={o.id} className="border border-border rounded-lg p-2"><p>{membershipLabel(o.status)} · {w.accounts.find(a => a.id === o.accountId)?.name || o.accountId}</p><p className="break-words text-slate-400">Observed Group: {o.groupIdentity?.url || o.groupIdentity?.canonicalKey || 'Not captured in this historical observation'}</p><p className="text-slate-400">Observed: {dateLabel(o.observedAt)} · Recorded: {dateLabel(o.createdAt)} · owner entered / unverified</p>{o.notes && <p className="whitespace-pre-wrap">{o.notes}</p>}</li>)}</ol>
        </div>}
      </section>

      <section className="min-w-0 space-y-5">
        <div className={cardClass}>
          <h3 className="font-semibold">Prepare a manual handoff</h3><p className="text-xs text-slate-400">Preparation saves a local draft. It does not join, contact or publish to the Group.</p>
          {group && <p className="text-sm text-honey-400">Saved destination: {group.name} · {group.identity_type === 'page' ? w.accounts.find(a => a.id === group.account_id)?.name || 'Page unavailable' : 'Personal profile (manual)'}. Save registry changes before preparing.</p>}
          {group?.identity_type === 'personal' && <label className="block text-sm">Source Page (optional; posting identity remains personal)<select aria-label="Group source Page" className={`${inputClass} mt-1`} value={w.draft.sourcePageId} onChange={e => w.setDraft(d => ({ ...d, sourcePageId: e.target.value }))}><option value="">No source Page</option>{w.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          <label className="block text-sm">Prepared content type<select className={`${inputClass} mt-1`} value={w.draft.kind} onChange={e => w.setDraft(d => ({ ...d, kind: e.target.value as 'post' | 'reply', threadUrl: '' }))}><option value="post">Post</option><option value="reply">Reply draft</option></select></label>
          <label className="block text-sm">Native thread URL {w.draft.kind === 'reply' ? '(required)' : '(optional)'}<input className={`${inputClass} mt-1`} value={w.draft.threadUrl} onChange={e => w.setDraft(d => ({ ...d, threadUrl: e.target.value }))} /></label>
          <label className="block text-sm">Prepared group text<textarea aria-label="Prepared group text" className={`${inputClass} mt-1`} rows={5} value={w.draft.content} onChange={e => w.setDraft(d => ({ ...d, content: e.target.value }))} /></label>
          <label className="block text-sm">Why this content fits this Group<textarea aria-label="Group content relevance" className={`${inputClass} mt-1`} rows={2} value={w.draft.relevance} onChange={e => w.setDraft(d => ({ ...d, relevance: e.target.value }))} /></label>
          <label className="block text-sm">Manual posting reminder (Asia/Bangkok)<input aria-label="Group posting reminder" type="datetime-local" className={`${inputClass} mt-1`} value={w.draft.reminderAt} onChange={e => w.setDraft(d => ({ ...d, reminderAt: e.target.value }))} /></label>
          <fieldset className="space-y-1 max-h-40 overflow-y-auto"><legend className="text-sm">Existing media for owner review (selection order)</legend>{w.media.map(m => { const key = `${m.kind}:${m.id}`; return <label key={key} className="flex gap-2 text-xs"><input type="checkbox" checked={w.draft.selectedMedia.includes(key)} onChange={e => w.setDraft(d => ({ ...d, selectedMedia: e.target.checked ? [...d.selectedMedia, key] : d.selectedMedia.filter(k => k !== key) }))} />{w.draft.selectedMedia.includes(key) ? `${w.draft.selectedMedia.indexOf(key) + 1}. ` : ''}{m.kind} · {m.title}</label>; })}{!w.media.length && <p className="text-xs text-slate-400">No existing media. Text-only handoffs remain available.</p>}</fieldset>
          <button className={buttonClass} disabled={w.busy || !group || !!group.archivedAt || w.hasUnsavedChanges || !w.draft.content.trim()} onClick={() => void w.run(w.savePrepared)}>Save manual handoff</button>
          <div className="space-y-2">{w.prepared.map(p => <button key={p.id} className={`${buttonClass} w-full text-left`} disabled={w.busy} onClick={() => void w.run(() => w.openPackage(p.id))}><span className="block text-xs text-honey-400">{p.kind} · {p.status === 'prepared' ? 'Unpublished manual handoff' : 'Owner receipt recorded — unverified'}</span><span className="block truncate">{p.content}</span><span className="block text-xs text-slate-400">Reminder: {p.reminderState}</span></button>)}</div>
        </div>

        {w.handoff && <div className={cardClass}>
          <h3 className="font-semibold">Manual handoff package</h3><pre className="whitespace-pre-wrap break-words text-xs text-slate-300 max-h-64 overflow-y-auto">{w.handoff.text}</pre>
          <p className="text-sm text-honey-400">{w.handoff.sourcePage ? `Source Page: ${w.handoff.sourcePage.name} · ${w.handoff.sourcePage.id}` : 'Source Page not captured'} · {w.handoff.group.identityType === 'page' ? 'Post as the named Page' : 'Post as your personal profile manually'}</p>
          {w.handoff.driftWarnings.length > 0 && <div role="alert" className="text-sm text-honey-400"><p>Review required before any manual action:</p><ul className="list-disc pl-5">{w.handoff.driftWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
          <div className="flex flex-wrap gap-2">{w.handoff.media.map(m => <a key={`${m.kind}:${m.id}`} className={buttonClass} href={m.url} target="_blank" rel="noopener noreferrer">Open {m.kind}: {m.title}</a>)}</div>
          <button className={buttonClass} onClick={() => copy(w.handoff!.prepared.content, 'Group caption copied. Nothing published.')}>Copy Caption</button>
          <div className="flex flex-wrap gap-2"><a className={buttonClass} href={w.handoff.nativeUrl} target="_blank" rel="noopener noreferrer">Open native group or thread</a><button className={buttonClass} onClick={() => copy(w.handoff!.text, 'Manual package copied. Nothing published.')}>Copy handoff package</button><button className={buttonClass} onClick={() => {
            const url = URL.createObjectURL(new Blob([w.handoff!.text], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `group-handoff-${w.handoff!.prepared.id}.txt`; a.click(); URL.revokeObjectURL(url);
          }}>Export handoff package</button></div>
          {w.handoff.reminderAt && <div className="text-xs space-y-2"><p>Reminder: {dateLabel(w.handoff.reminderAt)} · {w.handoff.reminderState}</p>{w.handoff.reminderState === 'active' && w.handoff.prepared.status === 'prepared' && <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={w.busy} onClick={() => void w.run(() => w.updateReminder(w.handoff!.prepared.id, 'cancelled'))}>Cancel reminder</button><button className={buttonClass} disabled={w.busy} onClick={() => void w.run(() => w.updateReminder(w.handoff!.prepared.id, 'dismissed'))}>Dismiss reminder</button></div>}</div>}
          <ReceiptForm key={`${w.handoff.prepared.id}:${w.handoff.prepared.latestReceipt?.id || ''}`} handoff={w.handoff} busy={w.busy} submit={(url, note, confirmed) => void w.run(() => w.recordReceipt(url, note, confirmed))} />
        </div>}
      </section>
    </div>
  </div>;
}

function ReceiptForm({ handoff, busy, submit }: { handoff: GroupPackageDto; busy: boolean; submit: (url: string, note: string, confirmed: boolean) => void }) {
  const [url, setUrl] = useState(handoff.prepared.latestReceipt?.url || handoff.prepared.receipt_url || '');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return <details><summary className="text-sm cursor-pointer">{handoff.receiptHistory.length ? 'Append an owner receipt correction' : 'Record an owner-entered publication receipt'}</summary>
    <p className="text-xs text-slate-400 mt-2">This records your statement, without external verification. Corrections preserve earlier receipts. Reply receipts must match the prepared thread and saved reply target.</p>
    <label className="block text-sm mt-2">Group post receipt URL<input className={`${inputClass} mt-1`} disabled={busy} value={url} onChange={e => { setUrl(e.target.value); setConfirmed(false); }} /></label>
    <label className="block text-sm mt-2">Receipt note<textarea className={`${inputClass} mt-1`} rows={2} disabled={busy} value={note} onChange={e => { setNote(e.target.value); setConfirmed(false); }} /></label>
    <label className="flex gap-2 items-start text-xs my-3"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />This is an owner-entered, unverified receipt for this exact Group and prepared thread.</label>
    <button className={buttonClass} disabled={busy || !confirmed || !url.trim()} onClick={() => { submit(url, note, confirmed); setConfirmed(false); }}>{handoff.receiptHistory.length ? 'Append manual receipt correction' : 'Record manual group receipt'}</button>
    <ol className="space-y-2 text-xs mt-3">{handoff.receiptHistory.map(r => <li key={r.id} className="border border-border rounded-lg p-2 break-words"><a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">{r.url}</a><p>{dateLabel(r.recordedAt)} · owner entered / unverified{r.supersedesId ? ' · correction' : ''}</p>{r.note && <p className="whitespace-pre-wrap">{r.note}</p>}</li>)}</ol>
  </details>;
}
