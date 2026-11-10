import { useEffect, useRef, useState } from 'react';
import { weeklyContentApi as weekly, type EvidenceKind, type WeeklyEvidence, type WeeklyFormat, type WeeklyGroup, type WeeklyIdea, type WeeklyPlan, type WeeklySlot, type WeeklyTarget } from '../../api/weekly-content';

const inputClass = 'w-full min-w-0 bg-surface border border-border rounded-xl px-3 py-2 text-sm text-slate-100';
const buttonClass = 'scc-btn-secondary text-sm';
const primaryClass = 'scc-btn-primary text-sm';
const cardClass = 'rounded-xl border border-border bg-surface-card p-4 space-y-3 min-w-0';
const formats: { value: WeeklyFormat; label: string }[] = [{ value: 'text', label: 'Short native text' }, { value: 'image', label: 'Image / meme' }, { value: 'image_caption', label: 'Image + longer caption' }, { value: 'reel', label: 'Video / Reel' }];
const kinds: EvidenceKind[] = ['direct_observation', 'verified_fact', 'audience_opinion', 'repeated_question', 'interpretation', 'hypothesis', 'owner_reference'];
const dateLabel = (value: string) => !value || !Number.isFinite(Date.parse(value)) ? value || 'Not recorded' : new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' });
const bangkokInput = (value: string) => {
  if (!Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  return parts.replace(' ', 'T');
};
const bangkokIso = (value: string) => new Date(`${value}:00+07:00`).toISOString();
const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const lastPlanDay = (endDate: string) => new Date(Date.parse(`${endDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Weekly planning orchestrates existing queues; it never creates provider or publication grants. */
export function WeeklyContentPlanner() {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [targets, setTargets] = useState<WeeklyTarget[]>([]);
  const [groups, setGroups] = useState<WeeklyGroup[]>([]);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [slots, setSlots] = useState<WeeklySlot[]>([]);
  const [slotDirty, setSlotDirty] = useState(false);
  const [checkedSlots, setCheckedSlots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('Weekly content plan');
  const [startDate, setStartDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [analysisAccount, setAnalysisAccount] = useState('');
  const [brief, setBrief] = useState('');
  const [confirmPreparation, setConfirmPreparation] = useState(false);
  const currentId = useRef<string | null>(null);
  const working = useRef(false);

  const accept = (next: WeeklyPlan) => {
    setPlan(next); currentId.current = next.id; setSlots(next.slots || []); setSlotDirty(false);
    setCheckedSlots(previous => previous.filter(id => next.slots?.some(slot => slot.id === id)));
    setConfirmPreparation(false);
    setPlans(previous => [next, ...previous.filter(item => item.id !== next.id)]);
  };
  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Weekly planning is unavailable.'); }
    finally { working.current = false; setBusy(false); }
  };
  const loadIndex = async () => {
    const result = await weekly.index();
    setPlans(result.plans); setTargets(result.targets); setGroups(result.groups);
  };
  useEffect(() => { if (open) void run(loadIndex); }, [open]);
  const mutate = (action: (value: WeeklyPlan) => Promise<{ plan: WeeklyPlan }>, notice: string) => {
    if (!plan || slotDirty) return;
    const captured = plan.id;
    void run(async () => { const result = await action(plan); if (currentId.current === captured) { accept(result.plan); setMessage(notice); } });
  };
  const accountName = (id: string) => targets.find(target => target.accountId === id)?.name || id;
  const destinationName = (idea: WeeklyIdea) => idea.groupId ? `${groups.find(group => group.id === idea.groupId)?.name || idea.groupId} · ${accountName(idea.accountId)}` : accountName(idea.accountId);
  const updateSlot = (id: string, change: Partial<WeeklySlot>) => { setSlots(previous => previous.map(slot => slot.id === id ? { ...slot, ...change } : slot)); setSlotDirty(true); setConfirmPreparation(false); };
  const addSlot = (idea: WeeklyIdea) => {
    if (!plan) return;
    setSlots(previous => [...previous, { id: `weekly-slot-${crypto.randomUUID()}`, ideaId: idea.id, format: idea.recommendedFormat, scheduledAt: `${plan.startDate}T05:00:00.000Z` }]);
    setSlotDirty(true);
  };
  const ready = Boolean(plan && !slotDirty && !busy);

  return <details className={cardClass} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Research-first weekly content</summary>
    {open && <div className="space-y-4 pt-2">
      <p className="text-sm text-slate-400">Research → select ideas and formats → review seven days → prepare → use existing exact publication approvals. Planning approval, generation budgets and publication authority remain separate.</p>
      {error && <p role="alert" className="text-sm text-red-400 break-words">{error}</p>}
      {message && <p role="status" className="text-sm text-sage-400">{message}</p>}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm flex-1 min-w-48">Saved weekly plan<select className={`${inputClass} mt-1`} aria-label="Saved weekly plan" disabled={busy || slotDirty} value={plan?.id || ''} onChange={event => {
          const id = event.target.value; if (!id) { setPlan(null); currentId.current = null; setSlots([]); return; }
          void run(async () => { const result = await weekly.plan(id); accept(result.plan); });
        }}><option value="">Create or select a plan</option>{plans.map(item => <option key={item.id} value={item.id}>{item.name} · {item.startDate} to {item.endDate}</option>)}</select></label>
        <button type="button" className={buttonClass} disabled={busy || slotDirty} onClick={() => void run(async () => { await loadIndex(); if (plan) accept((await weekly.plan(plan.id)).plan); })}>Refresh weekly plan</button>
      </div>
      <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">Create a seven-day plan</summary>
        <form className="space-y-3 pt-3" onSubmit={event => { event.preventDefault(); void run(async () => { accept((await weekly.create({ name, startDate, targetAccountIds: targetIds, groupIds })).plan); setMessage('Seven-day plan saved. No generation or publication authorized.'); }); }}>
          <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Plan name<input className={`${inputClass} mt-1`} required maxLength={160} value={name} onChange={event => setName(event.target.value)} /></label><label className="text-sm">Start date · Asia/Bangkok<input className={`${inputClass} mt-1`} aria-label="Weekly plan start date" type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></label></div>
          <fieldset className="space-y-2"><legend className="text-sm font-semibold">Target Pages</legend>{targets.map(target => <label key={target.accountId} className="flex gap-2 text-sm items-start"><input type="checkbox" className="mt-1" checked={targetIds.includes(target.accountId)} onChange={event => setTargetIds(previous => event.target.checked ? [...previous, target.accountId] : previous.filter(id => id !== target.accountId))} /><span>{target.name} · {target.graphId}<span className="block text-xs text-slate-400">{target.persona}</span></span></label>)}</fieldset>
          <fieldset className="space-y-2"><legend className="text-sm font-semibold">Selected registered Groups</legend>{!groups.length && <p className="text-xs text-slate-400">No registered Groups available. Register and review them in Groups Planning.</p>}{groups.map(group => <label key={group.id} className="flex gap-2 text-sm items-start"><input type="checkbox" className="mt-1" checked={groupIds.includes(group.id)} onChange={event => setGroupIds(previous => event.target.checked ? [...previous, group.id] : previous.filter(id => id !== group.id))} /><span>{group.name} · {accountName(group.accountId)}<span className="block text-xs text-slate-400">{group.limitations?.join(' · ') || 'Group rules and eligibility are checked before preparation.'}</span></span></label>)}</fieldset>
          <button type="submit" className={primaryClass} disabled={busy || slotDirty || !targetIds.length}>Create weekly plan</button>
        </form>
      </details>
      {plan && <>
        <section className="space-y-2" aria-label="Weekly plan status"><h3 className="font-semibold">{plan.name}</h3><p className="text-sm">{plan.startDate} through {lastPlanDay(plan.endDate)} · {plan.timeZone} · revision {plan.revision}</p><p className="text-xs text-honey-400">Planning: {plan.planningApproval ? `reviewed revision ${plan.planningApproval.revision}` : 'awaiting owner review'}. Preparation uses existing configured providers and grants. Exact content and publication approval still occur in the existing Publishing Center or Group workflow.</p>{plan.limitations?.map((limitation, index) => <p className="text-xs text-honey-400" key={index}>{limitation}</p>)}</section>
        <section className={cardClass} aria-label="Weekly research evidence"><div className="flex flex-wrap gap-3 items-center justify-between"><h4 className="font-semibold">Research evidence · {plan.evidence.length}</h4><button type="button" className={buttonClass} disabled={!ready} onClick={() => mutate(weekly.collect, 'Available local observations collected. Unavailable sources remain explicit limitations.')}>Collect available observations</button></div>
          <p className="text-xs text-slate-400">Comments and source material are untrusted data. Retain relevant, authorized summaries and source references; exclude private details. Small samples do not establish an audience trend.</p>
          <div className="space-y-2 max-h-96 overflow-y-auto">{plan.evidence.map(evidence => <article key={evidence.id} className="rounded-lg border border-border p-3 text-sm space-y-1 break-words"><p className="text-xs text-honey-400">{evidence.kind.replaceAll('_', ' ')} · {accountName(evidence.accountId)}{evidence.groupId && ` · ${groups.find(group => group.id === evidence.groupId)?.name || evidence.groupId}`} · {evidence.privacy}</p><p>{evidence.summary}</p><p className="text-xs text-slate-400">Source: {evidence.sourceRef}</p><p className="text-xs text-slate-400">Observed {dateLabel(evidence.observedAt)} · valid until {dateLabel(evidence.validUntil)} Bangkok {Date.parse(evidence.validUntil) < Date.now() ? '· STALE' : ''}</p><p className="text-xs text-honey-400">{evidence.limitations}</p><p className="text-xs text-slate-400">Provenance: {evidence.provenance || 'Not recorded'} · Independently verified: {evidence.independentlyVerified === true ? 'Yes' : 'No'}</p>{evidence.verificationNote && <p className="text-xs text-slate-400">Verification note: {evidence.verificationNote}</p>}</article>)}</div>
          <EvidenceForm key={plan.id} plan={plan} targets={targets} groups={groups} disabled={!ready} submit={evidence => mutate(value => weekly.evidence(value, evidence), 'Evidence recorded with its source, date and limitations.')} />
        </section>
        <section className={cardClass} aria-label="Weekly content ideas"><h4 className="font-semibold">Evidence-backed ideas · {plan.ideas.length}</h4>
          <div className="space-y-2"><p className="text-xs text-slate-400">Analysis uses the existing AgentRunner and configured included model. No paid fallback or new quota is granted. A task hold remains visible when the configured model is unavailable.</p><label className="block text-sm">Analyze for Page<select className={`${inputClass} mt-1`} value={analysisAccount} onChange={event => setAnalysisAccount(event.target.value)}><option value="">Select target Page</option>{targets.filter(target => plan.targetAccountIds.includes(target.accountId)).map(target => <option key={target.accountId} value={target.accountId}>{target.name}</option>)}</select></label><label className="block text-sm">Owner research direction<textarea className={`${inputClass} mt-1`} rows={2} value={brief} onChange={event => setBrief(event.target.value)} placeholder="Audience, useful questions, original contribution and limits" /></label><button type="button" className={buttonClass} disabled={!ready || !analysisAccount || !plan.evidence.length} onClick={() => mutate(value => weekly.analyze(value, analysisAccount, brief), 'Analysis task saved to the existing AgentRunner. Inspect its result before importing candidates.')}>Queue evidence analysis</button>
            {plan.analysisTasks?.map(task => <div key={task.taskId} className="rounded border border-border p-2 text-xs space-y-1 break-words"><p>{accountName(task.accountId)} · {task.status} · task {task.taskId}</p>{task.hold && <p className="text-honey-400">Hold: {task.hold}</p>}<button type="button" className="underline disabled:opacity-40" disabled={!ready} onClick={() => mutate(value => weekly.importAnalysis(value, task.taskId), 'Validated analysis candidates imported with evidence links.')}>Import saved analysis result</button></div>)}
          </div>
          <div className="grid lg:grid-cols-2 gap-3">{plan.ideas.map(idea => <article key={idea.id} className="rounded-lg border border-border p-3 space-y-2 text-sm break-words"><p className="text-xs text-honey-400">{destinationName(idea)} · confidence {idea.confidence}</p><h5 className="font-semibold">{idea.topic}</h5><p>Audience: {idea.intendedAudience}</p><p>{idea.interestReason}</p><p>Original contribution: {idea.originalContribution}</p><p>Format: {formats.find(format => format.value === idea.recommendedFormat)?.label} · {idea.formatReason}</p><p className="text-xs text-slate-400">Evidence: {idea.evidenceIds.map(id => plan.evidence.find(evidence => evidence.id === id)?.summary || `Missing ${id}`).join(' · ')}</p>{idea.factualRequirements.map((value, index) => <p key={index} className="text-xs text-honey-400">Source requirement: {value}</p>)}{idea.limitations.map((value, index) => <p key={index} className="text-xs text-honey-400">{value}</p>)}<button type="button" className={buttonClass} disabled={busy} onClick={() => addSlot(idea)}>Add idea to weekly schedule</button></article>)}</div>
          <IdeaForm key={plan.id} plan={plan} targets={targets} groups={groups} disabled={!ready} submit={idea => mutate(value => weekly.edit(value, { ideas: [...value.ideas, idea] }), 'Owner idea saved with supporting evidence.')} />
        </section>
        <section className={cardClass} aria-label="Seven-day publication plan"><h4 className="font-semibold">Seven-day schedule · Asia/Bangkok</h4><p className="text-xs text-slate-400">Add the selected ideas above, then set their formats and dates. Text uses ordinary native text; colored backgrounds are not claimed. Dispatched or individually authorized content remains protected by server checks.</p>
          {!slots.length && <p className="text-sm text-slate-400">No content selected yet. A plan does not require publication every day.</p>}
          {slots.map(slot => { const idea = plan.ideas.find(item => item.id === slot.ideaId); const locked = Boolean(slot.preparation?.intentAt || slot.preparation?.taskId || slot.campaignId || slot.draftId || slot.preparedId); return <article key={slot.id} className="rounded-lg border border-border p-3 space-y-2 min-w-0"><label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={checkedSlots.includes(slot.id)} onChange={event => setCheckedSlots(previous => event.target.checked ? [...previous, slot.id] : previous.filter(id => id !== slot.id))} /><span className="font-semibold">{idea?.topic || 'Idea unavailable'}<span className="block text-xs text-slate-400 font-normal">{idea ? destinationName(idea) : slot.ideaId}</span></span></label><div className="grid sm:grid-cols-2 gap-3"><label className="text-xs">Format<select className={`${inputClass} mt-1`} aria-label={`Format for ${idea?.topic || slot.id}`} value={slot.format} disabled={busy || locked} onChange={event => updateSlot(slot.id, { format: event.target.value as WeeklyFormat })}>{formats.map(format => <option key={format.value} value={format.value}>{format.label}</option>)}</select></label><label className="text-xs">Publication time · Bangkok<input className={`${inputClass} mt-1`} aria-label={`Publication time for ${idea?.topic || slot.id}`} type="datetime-local" min={`${plan.startDate}T00:00`} max={`${lastPlanDay(plan.endDate)}T23:59`} value={bangkokInput(slot.scheduledAt)} disabled={busy || locked} onChange={event => { if (event.target.value) updateSlot(slot.id, { scheduledAt: bangkokIso(event.target.value) }); }} /></label></div><div className="text-xs text-slate-400 break-words space-y-1"><p>Preparation: {slot.preparation?.status || 'Not requested'}{slot.preparation?.taskId && ` · task ${slot.preparation.taskId}`}</p>{(slot.preparation?.hold || slot.hold) && <p className="text-honey-400">Hold: {slot.preparation?.hold || slot.hold}</p>}{slot.draftId && <p>Publishing draft: {slot.draftId} · review exact content in Publishing Center.</p>}{slot.campaignId && <p>Existing calendar campaign: {slot.campaignId}</p>}{slot.preparedId && <p>Group handoff: {slot.preparedId} · review in Groups Planning.</p>}{idea?.groupId && slot.preparedId && <GroupScheduleForm slot={slot} disabled={!ready} submit={(registryId, grantId) => mutate(value => weekly.scheduleGroup(value, slot.id, registryId, grantId), 'Group schedule saved under the identified existing grant; native execution remains with the shared executor.')} />}{slot.outcome && <details><summary className="cursor-pointer">Recorded publication / feedback outcome</summary><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(slot.outcome, null, 2)}</pre></details>}</div>{!locked && <button type="button" className="text-xs underline disabled:opacity-40" disabled={busy} onClick={() => { setSlots(previous => previous.filter(item => item.id !== slot.id)); setSlotDirty(true); }}>Remove planned item</button>}</article>; })}
          {slotDirty && <p role="status" className="text-sm text-honey-400">Schedule has unsaved changes. Save or discard them before another weekly action.</p>}
          <div className="flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={busy || !slotDirty} onClick={() => void run(async () => { accept((await weekly.edit(plan, { slots })).plan); setMessage('Schedule saved. Any affected planning approval must be reviewed again.'); })}>Save weekly schedule</button><button type="button" className={buttonClass} disabled={busy || !slotDirty} onClick={() => { setSlots(plan.slots); setSlotDirty(false); }}>Discard schedule edits</button><button type="button" className={buttonClass} disabled={!ready || !plan.slots.length} onClick={() => mutate(weekly.approvePlanning, 'Planning revision reviewed. Generation and exact publication approval remain separate.')}>Approve planning only</button></div>
          <div className="border-t border-border pt-3 space-y-3"><label className="flex gap-2 text-sm items-start"><input type="checkbox" className="mt-1" checked={confirmPreparation} onChange={event => setConfirmPreparation(event.target.checked)} /><span>Request preparation for the selected saved items using existing valid generation grants and limits. This grants no new budget and approves no public content.</span></label><div className="flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={!ready || !checkedSlots.length || !confirmPreparation || !plan.planningApproval} onClick={() => mutate(value => weekly.prepare(value, checkedSlots), 'Eligible preparation tasks saved. Review per-item holds; existing generation grants remain authoritative.')}>Prepare selected items</button><button type="button" className={buttonClass} disabled={!ready} onClick={() => mutate(weekly.materialize, 'Available preparation results handed to existing draft/campaign workflows. Exact publication approval is still required.')}>Import prepared content</button><button type="button" className={buttonClass} disabled={!ready} onClick={() => mutate(weekly.outcomes, 'Available publication receipts and feedback recorded. Missing metrics remain unavailable.')}>Record available outcomes</button></div><p className="text-xs text-slate-400">Existing workers and schedulers handle eligible work independently. Provider exhaustion, uncertain submissions, expired grants and missed windows remain holds. PC availability and provider authentication remain operational requirements.</p></div>
        </section>
      </>}
    </div>}
  </details>;
}

function GroupScheduleForm({ slot, disabled, submit }: { slot: WeeklySlot; disabled: boolean; submit: (registryId: string, grantId: string) => void }) {
  const [registryId, setRegistryId] = useState(slot.groupSchedule?.registryId || '');
  const [grantId, setGrantId] = useState(slot.groupSchedule?.grantId || '');
  const [confirmed, setConfirmed] = useState(false);
  return <details className="border-t border-border pt-2"><summary className="cursor-pointer">Existing Group grant handoff</summary><div className="space-y-2 pt-2">
    {slot.groupSchedule && <p>Group queue: {slot.groupSchedule.status} · {slot.groupSchedule.destinationId || 'No saved destination'}{slot.groupSchedule.hold && ` · Hold: ${slot.groupSchedule.hold}`}</p>}
    <label className="block">Existing Group channel registry<input className={`${inputClass} mt-1`} value={registryId} onChange={event => { setRegistryId(event.target.value); setConfirmed(false); }} placeholder="group-channel:…" disabled={Boolean(slot.groupSchedule)} /></label>
    <label className="block">Existing exact Group grant<input className={`${inputClass} mt-1`} value={grantId} onChange={event => { setGrantId(event.target.value); setConfirmed(false); }} placeholder="group-grant:…" disabled={Boolean(slot.groupSchedule)} /></label>
    <label className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I authorize this prepared text and saved time to enter the identified existing Group grant. No grant is created or extended.</span></label>
    <button type="button" className={buttonClass} disabled={disabled || !confirmed || !registryId.startsWith('group-channel:') || !grantId.startsWith('group-grant:')} onClick={() => { submit(registryId, grantId); setConfirmed(false); }}>{slot.groupSchedule ? 'Reconcile saved Group schedule' : 'Queue under existing Group grant'}</button>
    <p>Native execution continues through the existing shared executor. Queuing does not prove publication or guarantee unattended execution.</p>
  </div></details>;
}

function EvidenceForm({ plan, targets, groups, disabled, submit }: { plan: WeeklyPlan; targets: WeeklyTarget[]; groups: WeeklyGroup[]; disabled: boolean; submit: (evidence: Omit<WeeklyEvidence, 'id'>) => void }) {
  const [accountId, setAccountId] = useState(plan.targetAccountIds[0] || '');
  const [groupId, setGroupId] = useState('');
  const [kind, setKind] = useState<EvidenceKind>('owner_reference');
  const [summary, setSummary] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [observedAt, setObservedAt] = useState(bangkokInput(new Date().toISOString()));
  const [validUntil, setValidUntil] = useState(bangkokInput(new Date(Date.now() + 7 * 86400000).toISOString()));
  const [limitations, setLimitations] = useState('Owner-supplied evidence; sample size and claims require review.');
  const [verificationNote, setVerificationNote] = useState('');
  const [privacy, setPrivacy] = useState<WeeklyEvidence['privacy']>('owner_supplied');
  const [relevant, setRelevant] = useState(false);
  return <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm">Add owner research evidence</summary><form className="space-y-3 pt-3" onSubmit={event => { event.preventDefault(); submit({ accountId, ...(groupId ? { groupId } : {}), kind, summary, sourceRef, observedAt: bangkokIso(observedAt), validUntil: bangkokIso(validUntil), limitations, privacy, relevanceConfirmed: true, ...(kind === 'verified_fact' ? { verificationNote } : {}) }); }}>
    {kind === 'verified_fact' && <label className="block text-sm">Verification note<textarea className={`${inputClass} mt-1`} aria-label="Verification note" required maxLength={1000} rows={2} value={verificationNote} onChange={event => setVerificationNote(event.target.value)} /><span className="text-xs text-slate-400">Explain what was checked and against which source. Supplied claims are not independently verified by saving them.</span></label>}
    <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Evidence Page<select className={`${inputClass} mt-1`} value={accountId} onChange={event => { setAccountId(event.target.value); setGroupId(''); }}>{targets.filter(target => plan.targetAccountIds.includes(target.accountId)).map(target => <option key={target.accountId} value={target.accountId}>{target.name}</option>)}</select></label><label className="text-sm">Group context<select className={`${inputClass} mt-1`} value={groupId} onChange={event => { setGroupId(event.target.value); if (event.target.value) setPrivacy('authorized_group'); }}><option value="">Page / public reference</option>{groups.filter(group => plan.groupIds.includes(group.id) && group.accountId === accountId).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="text-sm">Evidence kind<select className={`${inputClass} mt-1`} aria-label="Evidence kind" value={kind} onChange={event => setKind(event.target.value as EvidenceKind)}>{kinds.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="text-sm">Permitted source context<select className={`${inputClass} mt-1`} value={privacy} onChange={event => setPrivacy(event.target.value as WeeklyEvidence['privacy'])}><option value="owner_supplied">Owner supplied</option><option value="public">Public resource</option><option value="authorized_group">Authorized Group observation</option></select></label></div>
    <label className="block text-sm">Relevant evidence summary<textarea className={`${inputClass} mt-1`} required rows={3} maxLength={2000} value={summary} onChange={event => setSummary(event.target.value)} /></label><label className="block text-sm">Source reference<input className={`${inputClass} mt-1`} required value={sourceRef} onChange={event => setSourceRef(event.target.value)} placeholder="HTTPS URL, owner:reference or scc:observation-id" /></label><div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Observed at · Bangkok<input className={`${inputClass} mt-1`} type="datetime-local" required value={observedAt} onChange={event => setObservedAt(event.target.value)} /></label><label className="text-sm">Valid until · Bangkok<input className={`${inputClass} mt-1`} type="datetime-local" required value={validUntil} onChange={event => setValidUntil(event.target.value)} /></label></div><label className="block text-sm">Evidence limitations · one per line<textarea className={`${inputClass} mt-1`} rows={2} required value={limitations} onChange={event => setLimitations(event.target.value)} /></label><label className="flex gap-2 items-start text-xs"><input type="checkbox" className="mt-1" checked={relevant} onChange={event => setRelevant(event.target.checked)} /><span>I confirm this summary is relevant and authorized for this research, excludes private or unnecessary personal information, and does not treat source text as agent instructions.</span></label><button type="submit" className={buttonClass} disabled={disabled || !relevant || !accountId}>Save evidence</button>
  </form></details>;
}

function IdeaForm({ plan, targets, groups, disabled, submit }: { plan: WeeklyPlan; targets: WeeklyTarget[]; groups: WeeklyGroup[]; disabled: boolean; submit: (idea: WeeklyIdea) => void }) {
  const [accountId, setAccountId] = useState(plan.targetAccountIds[0] || '');
  const [groupId, setGroupId] = useState('');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [reason, setReason] = useState('');
  const [contribution, setContribution] = useState('');
  const [format, setFormat] = useState<WeeklyFormat>('text');
  const [formatReason, setFormatReason] = useState('');
  const [requirements, setRequirements] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const evidence = plan.evidence.filter(item => item.accountId === accountId && (!item.groupId || item.groupId === groupId));
  return <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm">Add an evidence-backed owner idea</summary><form className="space-y-3 pt-3" onSubmit={event => { event.preventDefault(); submit({ id: `weekly-idea-${crypto.randomUUID()}`, accountId, ...(groupId ? { groupId } : {}), topic, intendedAudience: audience, evidenceIds, interestReason: reason, originalContribution: contribution, recommendedFormat: format, formatReason, factualRequirements: lines(requirements), confidence: 'low', limitations: ['Owner-proposed interpretation; evidence and suitability require review.'] }); }}>
    <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Idea Page<select className={`${inputClass} mt-1`} value={accountId} onChange={event => { setAccountId(event.target.value); setGroupId(''); setEvidenceIds([]); }}>{targets.filter(target => plan.targetAccountIds.includes(target.accountId)).map(target => <option key={target.accountId} value={target.accountId}>{target.name}</option>)}</select></label><label className="text-sm">Idea Group<select className={`${inputClass} mt-1`} value={groupId} onChange={event => { setGroupId(event.target.value); setEvidenceIds([]); }}><option value="">Page content</option>{groups.filter(group => plan.groupIds.includes(group.id) && group.accountId === accountId).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
    <label className="block text-sm">Topic<input className={`${inputClass} mt-1`} required value={topic} onChange={event => setTopic(event.target.value)} /></label><label className="block text-sm">Intended audience<input className={`${inputClass} mt-1`} required value={audience} onChange={event => setAudience(event.target.value)} /></label><label className="block text-sm">Why this may interest them<textarea className={`${inputClass} mt-1`} rows={2} required value={reason} onChange={event => setReason(event.target.value)} /></label><label className="block text-sm">Original contribution<textarea className={`${inputClass} mt-1`} rows={2} required value={contribution} onChange={event => setContribution(event.target.value)} /></label><fieldset className="space-y-2"><legend className="text-sm">Supporting evidence</legend>{!evidence.length && <p className="text-xs text-slate-400">Collect or save relevant research evidence first.</p>}{evidence.map(item => <label key={item.id} className="text-xs flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={evidenceIds.includes(item.id)} onChange={event => setEvidenceIds(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} /><span>{item.kind.replaceAll('_', ' ')}: {item.summary}</span></label>)}</fieldset><label className="block text-sm">Recommended format<select className={`${inputClass} mt-1`} value={format} onChange={event => setFormat(event.target.value as WeeklyFormat)}>{formats.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="block text-sm">Why this format fits<input className={`${inputClass} mt-1`} required value={formatReason} onChange={event => setFormatReason(event.target.value)} /></label><label className="block text-sm">Factual/source requirements · one per line<textarea className={`${inputClass} mt-1`} rows={2} value={requirements} onChange={event => setRequirements(event.target.value)} /></label><button type="submit" className={buttonClass} disabled={disabled || !evidenceIds.length || !accountId}>Save owner idea</button>
  </form></details>;
}
