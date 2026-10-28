import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from '../api/client';
import { groupsApi } from '../api/content-workspace';
import type { Account } from '../types';
import type { GroupEligibility, GroupListFilters, GroupMembershipInput, GroupPackageDto, GroupPlanDto, GroupPlanInput, GroupPreparedDto, GroupReminderDto } from '../../../server/src/domain/groups';
import { createGroupsRequestGuard, emptyGroupDraft } from './groups-selection';

export interface GroupForm extends GroupPlanInput {
  accountId: string; membership: GroupPlanDto['membership']; category: string; notes: string; rules: string;
  rulesReviewedAt: string; shortlisted: boolean; archived: boolean; reviewedAt: string; eligibility: GroupEligibility;
}
const emptyEligibility = (): GroupEligibility => ({ pagesCanJoin: 'unknown', promotionalRestrictions: '', questions: [], participationApproval: 'unknown', postModeration: 'unknown' });
export const emptyGroupForm = (): GroupForm => ({ name: '', url: '', identityType: 'page', accountId: '', membership: 'unknown', category: '', notes: '', rules: '', rulesReviewedAt: '', shortlisted: false, archived: false, reviewedAt: '', eligibility: emptyEligibility() });
function groupForm(group: GroupPlanDto): GroupForm {
  return { name: group.name, url: group.url, identityType: group.identity_type, accountId: group.account_id || '', membership: group.membership, category: group.category, notes: group.notes, rules: group.rules, rulesReviewedAt: group.rules_reviewed_at || '', shortlisted: group.shortlisted, archived: !!group.archivedAt, reviewedAt: group.reviewedAt || '', eligibility: { ...group.eligibility, questions: group.eligibility.questions.map(q => ({ ...q })) }, revision: group.revision };
}
export interface GroupLibraryItem { id: string; kind: 'image' | 'video'; title: string }

export function useGroupsWorkspace() {
  const [groups, setGroups] = useState<GroupPlanDto[]>([]);
  const [hasRegisteredGroups, setHasRegisteredGroups] = useState<boolean | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupPlanDto | null>(null);
  const [form, updateForm] = useState<GroupForm>(emptyGroupForm);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [media, setMedia] = useState<GroupLibraryItem[]>([]);
  const [prepared, setPrepared] = useState<GroupPreparedDto[]>([]);
  const [draft, updateDraft] = useState(emptyGroupDraft);
  const [handoff, setHandoff] = useState<GroupPackageDto | null>(null);
  const [reminders, setReminders] = useState<GroupReminderDto[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(0);
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(true);
  const selection = useRef(createGroupsRequestGuard());
  const selectionToken = useRef(0);
  const packages = useRef(createGroupsRequestGuard());
  const lists = useRef(createGroupsRequestGuard());
  const registryRequests = useRef(createGroupsRequestGuard());
  const formEdits = useRef(0);
  const draftEdits = useRef(0);
  const filters = useRef<GroupListFilters>({ archived: false });

  const setForm: Dispatch<SetStateAction<GroupForm>> = value => { formEdits.current += 1; updateForm(value); };
  const setDraft: Dispatch<SetStateAction<ReturnType<typeof emptyGroupDraft>>> = value => { draftEdits.current += 1; updateDraft(value); };
  const acceptGroup = (group: GroupPlanDto, baseline: GroupForm, edit: number) => {
    setSelectedGroup(group);
    updateForm(current => {
      const next = groupForm(group);
      if (formEdits.current === edit) return next;
      // Rebase only fields edited since this request. Keep server revisions and
      // identity-dependent resets for fields the owner did not edit meanwhile.
      for (const key of Object.keys(next) as (keyof GroupForm)[]) {
        if (key !== 'revision' && key !== 'eligibility' && JSON.stringify(current[key]) !== JSON.stringify(baseline[key])) Object.assign(next, { [key]: current[key] });
      }
      const incoming = next.eligibility;
      next.eligibility = { ...incoming };
      for (const key of ['pagesCanJoin', 'promotionalRestrictions', 'participationApproval', 'postModeration'] as const) {
        if (current.eligibility[key] !== baseline.eligibility[key]) Object.assign(next.eligibility, { [key]: current.eligibility[key] });
      }
      if (JSON.stringify(current.eligibility.questions) !== JSON.stringify(baseline.eligibility.questions)) {
        next.eligibility.questions = current.eligibility.questions.flatMap((question, index) => {
          const before = baseline.eligibility.questions[index], saved = incoming.questions[index];
          if (!before) return [{ ...question }];
          if (JSON.stringify(question) === JSON.stringify(before)) return saved ? [{ ...saved }] : [];
          return [{ question: question.question !== before.question ? question.question : saved?.question || question.question,
            answer: question.answer !== before.answer ? question.answer : saved?.answer || '' }];
        });
      }
      return next;
    });
  };

  const run = async (task: () => Promise<void>) => {
    setPending(n => n + 1); setError(''); setMessage('');
    let token = selectionToken.current;
    try { const request = task(); token = selectionToken.current; await request; }
    catch (e) { if (mounted.current && selection.current.current(token)) setError(e instanceof Error ? e.message : 'Groups request failed'); }
    finally { if (mounted.current) setPending(n => Math.max(0, n - 1)); }
  };
  const refresh = async (nextFilters = filters.current) => {
    filters.current = nextFilters;
    const token = lists.current.begin();
    const [registry, remindersResult] = await Promise.all([groupsApi.list(nextFilters), groupsApi.reminders()]);
    // A filtered empty list can still have saved (including archived) Groups.
    const registered = registry.groups.length > 0 || (await groupsApi.list({})).groups.length > 0;
    if (!mounted.current || !lists.current.current(token)) return;
    setGroups(registry.groups); setHasRegisteredGroups(registered); setReminders(remindersResult.reminders);
  };
  const clearDependent = () => { packages.current.invalidate(); setPrepared([]); setHandoff(null); updateDraft(emptyGroupDraft()); };
  const selectGroup = async (group: GroupPlanDto | string): Promise<boolean> => {
    const token = selection.current.begin(); selectionToken.current = token;
    const request = registryRequests.current.begin(), edit = formEdits.current;
    const groupId = typeof group === 'string' ? group : group.id;
    const baseline = typeof group === 'string' ? emptyGroupForm() : groupForm(group);
    setSelectedGroup(typeof group === 'string' ? null : group); updateForm(baseline); clearDependent();
    try {
      const result = await groupsApi.review(groupId);
      if (!mounted.current || !selection.current.current(token) || !registryRequests.current.current(request)) return false;
      acceptGroup(result.group, baseline, edit); setPrepared(result.prepared); return true;
    } catch (e) { if (mounted.current && selection.current.current(token) && registryRequests.current.current(request)) throw e; return false; }
  };
  const newGroup = () => {
    selectionToken.current = selection.current.begin(); clearDependent();
    registryRequests.current.invalidate();
    setSelectedGroup(null); updateForm(emptyGroupForm()); setError(''); setMessage('');
  };
  const openPackage = async (id: string, group?: GroupPlanDto | string) => {
    if (group && !(await selectGroup(group))) return;
    const selectedToken = selectionToken.current, token = packages.current.begin();
    setHandoff(null);
    try {
      const result = await groupsApi.package(id);
      if (mounted.current && selection.current.current(selectedToken) && packages.current.current(token)) setHandoff(result);
    } catch (e) { if (mounted.current && selection.current.current(selectedToken) && packages.current.current(token)) throw e; }
  };
  const saveGroup = async (reviewComplete = false) => {
    const token = selectionToken.current, request = registryRequests.current.begin(), edit = formEdits.current, draftEdit = draftEdits.current;
    const baseline = form;
    const input = { ...form, reviewedAt: reviewComplete ? new Date().toISOString() : form.reviewedAt || null };
    const { group } = await groupsApi.save(input, selectedGroup?.id);
    const [review] = await Promise.all([groupsApi.review(group.id), refresh()]);
    if (mounted.current && selection.current.current(token) && registryRequests.current.current(request)) {
      acceptGroup(review.group, baseline, edit); setPrepared(review.prepared);
      packages.current.invalidate(); setHandoff(null);
      if (draftEdits.current === draftEdit) updateDraft(emptyGroupDraft());
      setMessage('Group plan saved as owner entered and unverified.');
    }
  };
  const recordMembership = async (input: GroupMembershipInput) => {
    if (!selectedGroup) return;
    const token = selectionToken.current, request = registryRequests.current.begin(), edit = formEdits.current, baseline = form;
    const { group } = await groupsApi.membership(selectedGroup.id, { ...input, accountId: selectedGroup.account_id || undefined, revision: selectedGroup.revision });
    await refresh();
    if (mounted.current && selection.current.current(token) && registryRequests.current.current(request)) {
      acceptGroup(group, baseline, edit);
      if (handoff) await openPackage(handoff.prepared.id);
      if (mounted.current && selection.current.current(token)) setMessage('Owner membership observation saved. Facebook has not verified it.');
    }
  };
  const savePrepared = async () => {
    if (!selectedGroup) return;
    const token = selectionToken.current, groupId = selectedGroup.id, edit = draftEdits.current;
    await groupsApi.prepare(groupId, { kind: draft.kind, content: draft.content, threadUrl: draft.threadUrl, relevance: draft.relevance, sourcePageId: draft.sourcePageId || undefined, reminderAt: draft.reminderAt ? `${draft.reminderAt}:00+07:00` : undefined, revision: selectedGroup.revision,
      media: draft.selectedMedia.map(key => { const item = media.find(m => `${m.kind}:${m.id}` === key); if (!item) throw new Error('Selected media is no longer available'); return { kind: item.kind, id: item.id }; }) });
    const result = await groupsApi.prepared(groupId); await refresh();
    if (mounted.current && selection.current.current(token)) {
      setPrepared(result.prepared);
      if (draftEdits.current === edit) updateDraft(emptyGroupDraft());
      setMessage('Manual handoff saved. Unpublished.');
    }
  };
  const recordReceipt = async (url: string, note: string, confirmOwnerEntered: boolean) => {
    if (!handoff || !selectedGroup) return;
    const token = selectionToken.current, id = handoff.prepared.id, groupId = selectedGroup.id;
    await groupsApi.receipt(id, { url, note, confirmOwnerEntered });
    const [nextPrepared, nextPackage] = await Promise.all([groupsApi.prepared(groupId), groupsApi.package(id)]); await refresh();
    if (mounted.current && selection.current.current(token)) { setPrepared(nextPrepared.prepared); setHandoff(nextPackage); setMessage('Owner receipt appended as unverified. No API publication claimed.'); }
  };
  const updateReminder = async (id: string, state: 'cancelled' | 'dismissed') => {
    const token = selectionToken.current;
    await groupsApi.reminder(id, { state }); await refresh();
    if (selectedGroup && mounted.current && selection.current.current(token)) {
      const result = await groupsApi.prepared(selectedGroup.id);
      if (!mounted.current || !selection.current.current(token)) return;
      setPrepared(result.prepared);
      if (handoff?.prepared.id === id) await openPackage(id);
      setMessage(`Reminder ${state}. Publication status has not changed.`);
    }
  };
  useEffect(() => {
    mounted.current = true;
    selectionToken.current = selection.current.begin();
    void run(async () => {
      await refresh();
      const [accountResult, images, videos] = await Promise.all([api.getAccounts(), api.getImages(), api.getVideos()]);
      if (!mounted.current) return;
      setAccounts(accountResult.accounts.filter(a => a.platform === 'facebook' && a.account_type === 'page' && !a.archived_at && !a.is_demo));
      setMedia([...images.images.map(m => ({ id: m.id, kind: 'image' as const, title: m.original_filename })), ...videos.videos.map(m => ({ id: m.id, kind: 'video' as const, title: m.title }))]);
    });
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => { mounted.current = false; selection.current.invalidate(); packages.current.invalidate(); lists.current.invalidate(); registryRequests.current.invalidate(); clearInterval(timer); };
  }, []);
  const hasUnsavedChanges = selectedGroup ? JSON.stringify(form) !== JSON.stringify(groupForm(selectedGroup)) : true;
  return { groups, hasRegisteredGroups, selectedGroup, form, setForm, accounts, media, prepared, draft, setDraft, handoff, reminders, now, error, message, setMessage, busy: pending > 0, hasUnsavedChanges,
    run, refresh, selectGroup, newGroup, openPackage, saveGroup, recordMembership, savePrepared, recordReceipt, updateReminder };
}
