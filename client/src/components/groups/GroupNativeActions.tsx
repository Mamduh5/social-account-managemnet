import React, { useState } from 'react';
import type { GroupNativeActionDto, GroupNativeActionState, GroupNativeOutcomeInput } from '../../../../server/src/domain/groups-native-actions';
import { groupNativeActionExport } from '../../../../server/src/domain/groups-native-actions';

const fieldClass = 'w-full min-w-0 bg-surface border border-border rounded-xl px-3 py-2 text-sm';
const buttonClass = 'scc-btn-secondary text-sm';
const closed: GroupNativeActionState[] = ['blocked','restricted','membership_approved','membership_rejected','published','failed_before_submission'];
const label = (state: string) => state.replaceAll('_', ' ');

export function GroupNativeActions({ actions, busy, disabled, prepareJoin, record, reviewUnsent }: {
  actions: GroupNativeActionDto[]; busy: boolean; disabled: boolean;
  prepareJoin: () => void; record: (id: string, input: GroupNativeOutcomeInput) => void;
  reviewUnsent: (action: GroupNativeActionDto) => void;
}) {
  return <div className="border-t border-border pt-3 space-y-3">
    <h4 className="font-semibold">Native Page participation handoffs</h4>
    <p className="text-xs text-slate-400">Local handoffs and observations only. Verify the Page identity in Facebook before acting. A started or uncertain submission must be reconciled without submitting again. Pending membership or post moderation does not mean publication.</p>
    <button className={buttonClass} disabled={busy || disabled} onClick={prepareJoin}>Prepare one Page membership handoff</button>
    {actions.map(action => <details key={action.id} className="rounded-lg border border-border p-3 space-y-2">
      <summary className="text-sm cursor-pointer">{action.kind === 'join' ? 'Page membership' : 'Group post'} · {label(action.state)} · {action.accountName}</summary>
      <p className="text-xs break-words">{action.accountId} · {action.groupUrl}</p>
      {action.supersededById && <p className="text-xs text-honey-400">Unsent handoff replaced after explicit review. Use {action.supersededById}.</p>}
      {action.reasons.length > 0 && <ul className="list-disc pl-5 text-xs text-honey-400">{action.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      <button className={buttonClass} onClick={() => {
        const text = groupNativeActionExport(action);
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${action.id}.txt`; anchor.click(); URL.revokeObjectURL(url);
      }}>Export native action handoff</button>
      <ol className="text-xs space-y-2">{action.events.map((event, index) => <li key={index} className="border-l-2 border-border pl-2"><p>{label(event.state)} · {event.observedAt} · {event.source} / unverified</p><p className="whitespace-pre-wrap break-words">{event.notes}</p>{event.url && <a href={event.url} target="_blank" rel="noopener noreferrer" className="underline break-all">Observed Group link</a>}</li>)}</ol>
      {!action.supersededById && !action.events.some(event => event.state === 'submission_started') && ['prepared','blocked','awaiting_owner','failed_before_submission'].includes(action.state) && <UnsentReview busy={busy || disabled} review={() => reviewUnsent(action)} />}
      {!action.supersededById && !closed.includes(action.state) && <NativeOutcomeForm key={`${action.id}:${action.revision}`} action={action} busy={busy || disabled} record={input => record(action.id, input)} />}
    </details>)}
  </div>;
}

function UnsentReview({ busy, review }: { busy: boolean; review: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return <div className="space-y-2"><label className="flex gap-2 text-xs"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} />I re-reviewed the saved Group rules and exact Page identity. This handoff has never been submitted.</label><button className={buttonClass} disabled={busy || !confirmed} onClick={review}>Review unsent handoff</button></div>;
}

function NativeOutcomeForm({ action, busy, record }: { action: GroupNativeActionDto; busy: boolean; record: (input: GroupNativeOutcomeInput) => void }) {
  const started = action.events.some(event => event.state === 'submission_started');
  const options: GroupNativeOutcomeInput['state'][] = started ? ['uncertain', ...(action.kind === 'join' ? ['request_pending','membership_approved','membership_rejected'] as const : ['pending_approval','published'] as const), 'restricted'] : ['awaiting_owner','submission_started','restricted','failed_before_submission'];
  const [state, setState] = useState<GroupNativeOutcomeInput['state']>(options[0]);
  const [notes, setNotes] = useState(''), [url, setUrl] = useState(''), [confirmed, setConfirmed] = useState(false);
  return <div className="space-y-2">
    <label className="block text-sm">Observed native action state<select className={fieldClass} disabled={busy} value={state} onChange={event => { setState(event.target.value as typeof state); setConfirmed(false); }}>{options.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
    {state === 'submission_started' && <p className="text-xs text-honey-400">Record this immediately before the single Facebook submit action. Afterward, inspect the existing request or post if the browser fails; never press Submit again.</p>}
    <label className="block text-sm">Observation evidence and next step<textarea className={fieldClass} disabled={busy} rows={2} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    <label className="block text-sm">Observed Group or resulting post URL<input className={fieldClass} disabled={busy} value={url} onChange={event => setUrl(event.target.value)} /></label>
    <label className="flex gap-2 text-xs"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I observed the named Page identity and reviewed the Group rules. This records my observation without independent verification.</label>
    <button className={buttonClass} disabled={busy || !confirmed || !notes.trim() || state === 'published' && !url.trim()} onClick={() => record({ state, revision: action.revision, accountId: action.accountId, observedAt: new Date().toISOString(), source: 'owner_entered', notes, url: url || undefined, confirmIdentity: confirmed, confirmRules: confirmed })}>Record native action observation</button>
  </div>;
}
