import { createHash, randomUUID } from 'node:crypto';
import { textValue } from '../domain/content-assistant.js';
import { canonicalGroupIdentity, parseGroupThreadIdentity } from '../domain/groups.js';
import type { GroupNativeActionDto, GroupNativeActionInput, GroupNativeActionState, GroupNativeOutcomeInput } from '../domain/groups-native-actions.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { groupsNativeActionsRepo as ledger } from '../repositories/groups-native-actions.repo.js';
import { groupsWorkspaceService as workspace } from './groups-workspace.service.js';

function timestamp(value: unknown) {
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Record the observation time with an explicit timezone');
  return new Date(value).toISOString();
}
function sameContext(action: GroupNativeActionDto) {
  const group = workspace.review(action.groupId).group;
  if (group.canonicalKey !== action.canonicalKey || group.account_id !== action.accountId || group.identity_type !== 'page') throw new Error('Group or acting Page changed; preserve the original action for reconciliation');
  return group;
}
const finalStates: GroupNativeActionState[] = ['blocked','restricted','membership_approved','membership_rejected','published','failed_before_submission'];
export const groupsNativeActionsService = {
  list(groupId: string) { workspace.review(groupId); return ledger.list(groupId); },
  prepare(groupId: string, input: GroupNativeActionInput): GroupNativeActionDto {
    return ledger.transaction(() => {
      if (!input || !['join','post'].includes(input.kind)) throw new Error('Select a Page join or prepared post handoff');
      const key = textValue(input.requestKey, 'Native action request key', 160, true);
      const group = workspace.review(groupId).group;
      const previous = ledger.list().find(action => action.requestKey === key);
      if (previous) {
        if (previous.groupId !== groupId || previous.kind !== input.kind || previous.preparedId !== (input.preparedId || null) || previous.accountId !== group.account_id || previous.canonicalKey !== group.canonicalKey || (previous.supersedesActionId || null) !== (input.supersedesActionId || null)) throw new Error('Native action request key already belongs to another intent');
        return previous; // A lost response never creates another attempt.
      }
      if (!Number.isInteger(input.revision) || input.revision !== group.revision) throw new Error('Group revision changed; reload before preparing a native action');
      if (group.identity_type !== 'page' || !group.account_id || !group.canonicalKey) throw new Error('Native actions require an exact existing Facebook Page and Group; no personal-profile fallback');
      const account = accountsRepo.getAccountById(group.account_id);
      if (!account || account.archived_at || account.is_demo || account.platform !== 'facebook' || account.account_type !== 'page') throw new Error('The acting Page is unavailable');
      const preparedId = input.kind === 'post' ? textValue(input.preparedId, 'Prepared Group post', 200, true) : null;
      if (input.kind === 'join' && input.preparedId) throw new Error('A join handoff cannot reference a post');
      // Include known failures: a new request key is not permission to retry a bounded native attempt.
      let supersedesActionId: string | null = null;
      if (input.supersedesActionId) {
        const previous = ledger.get(input.supersedesActionId);
        if (!previous || previous.groupId !== groupId || previous.accountId !== group.account_id || previous.canonicalKey !== group.canonicalKey || previous.kind !== input.kind) throw new Error('Reviewed replacement must retain the exact Page, Group and action kind');
        if (previous.supersededById || input.expectedActionRevision !== previous.revision || input.confirmIdentity !== true || input.confirmRules !== true) throw new Error('Confirm the current unsent intent revision, Page identity and reviewed rules before replacing it');
        if (previous.events.some(event => event.state === 'submission_started') || !['prepared','blocked','awaiting_owner','failed_before_submission'].includes(previous.state)) throw new Error('Only a never-submitted handoff can be reviewed and replaced; reconcile the original remote attempt');
        supersedesActionId = previous.id;
      }
      const priorActions = ledger.list().filter(action => !action.supersededById && action.id !== supersedesActionId && action.canonicalKey === group.canonicalKey && action.accountId === group.account_id && action.kind === input.kind);
      if (priorActions.some(action => input.kind === 'join' || action.preparedId === preparedId)) throw new Error('A native action already exists for this Page and Group intent; inspect it instead of submitting again');
      const reasons: string[] = [];
      if (group.archivedAt) reasons.push('The Group plan is archived.');
      if (group.eligibility.pagesCanJoin !== 'yes') reasons.push(group.eligibility.pagesCanJoin === 'no' ? 'This Group permits profiles only; do not switch identity.' : 'Page participation eligibility has not been established.');
      if (!group.rules.trim() || !group.rules_reviewed_at || group.eligibility.questions.some(q => !q.answer.trim())) reasons.push('Review Group rules and answer membership questions first.');
      let content = '', contentFingerprint: string | null = null;
      if (input.kind === 'join') {
        if (group.membership !== 'not_member') reasons.push(`Membership is ${group.membership}; no new join request is permitted.`);
      } else {
        const handoff = workspace.package(preparedId!);
        if (handoff.prepared.group_id !== groupId || handoff.prepared.kind !== 'post' || handoff.prepared.status !== 'prepared' || handoff.sourcePage?.id !== group.account_id) throw new Error('Select an unpublished prepared post for this exact Group and acting Page');
        if ((handoff.planChanged && !supersedesActionId) || handoff.sourcePageUnavailable || !handoff.contextCaptured || canonicalGroupIdentity(handoff.group.url).canonicalKey !== group.canonicalKey) reasons.push('The prepared handoff context changed; review it before posting.');
        if (group.readiness.state !== 'reviewed_for_manual_handoff') reasons.push(...group.readiness.reasons);
        if (!handoff.relevance.trim()) reasons.push('Record how the post is relevant to this Group.');
        contentFingerprint = createHash('sha256').update(JSON.stringify({content:handoff.prepared.content,media:handoff.media.map(item=>({kind:item.kind,id:item.id}))})).digest('hex');
        if (priorActions.some(action => action.contentFingerprint === contentFingerprint)) throw new Error('An identical native post intent already exists; inspect its outcome instead of preparing another submission');
        content = `Prepared post: ${handoff.prepared.id}\nGroup relevance: ${handoff.relevance}\nMedia in order:\n${handoff.media.map(item=>`${item.kind}: ${item.title} (${item.url})`).join('\n')}\n\n${handoff.prepared.content}\n${supersedesActionId ? '\nCurrent Group rules and identity were explicitly re-reviewed for this unsent replacement. The original prepared snapshot remains unchanged.' : ''}`;
      }
      const id = 'group-native-' + randomUUID(), createdAt = new Date().toISOString();
      const intent: GroupNativeActionDto = { id, groupId, canonicalKey: group.canonicalKey, groupUrl: group.url, accountId: account.id, accountName: account.name,
        externalPageId: account.external_id || null, groupRevision: group.revision, kind: input.kind, preparedId, requestKey: key, contentFingerprint, supersedesActionId, supersededById: null,
        state: reasons.length ? 'blocked' : 'prepared', revision: 1, createdAt, reasons, events: [], automationSupported: false, publicationVerified: false,
        handoffText: `FACEBOOK GROUP ${input.kind.toUpperCase()} HANDOFF — NO ACTION EXECUTED\nIntent: ${id}\nGroup: ${group.name}\nURL: ${group.url}\nAct as Page: ${account.name} (${account.id}; external ID ${account.external_id || 'unknown'})\nMembership: ${group.membership} (saved observation, unverified)\nRules: ${group.rules}\nQuestions: ${group.eligibility.questions.map(q => `${q.question}: ${q.answer}`).join('\n')}\nPosting moderation: ${group.eligibility.postModeration}\n${reasons.map(reason => `BLOCKED: ${reason}\n`).join('')}\n${content}\n\nUse the supported Facebook UI or hand this package to the owner. Verify the displayed Page identity and rules. Record submission_started before one remote submission. An interrupted/uncertain submission must be reconciled by reading its existing state; never submit again. Facebook restrictions or pending approval are not successful publication. No personal-profile fallback.` };
      ledger.save(intent); return intent;
    });
  },
  record(id: string, input: GroupNativeOutcomeInput): GroupNativeActionDto {
    return ledger.transaction(() => {
      const action = ledger.get(id); if (!action) throw new Error('Native action not found');
      if (action.supersededById) throw new Error('This unsent handoff was superseded by a reviewed replacement; inspect the replacement');
      if (!input || !Number.isInteger(input.revision) || input.revision !== action.revision) throw new Error('Native action revision changed; inspect the saved outcome before recording again');
      if (input.confirmIdentity !== true || input.accountId !== action.accountId) throw new Error('Confirm the exact acting Page identity; personal fallback is prohibited');
      if (!['owner_entered','agent_browser_observation'].includes(input.source)) throw new Error('Record the actual observation source');
      const allowed: GroupNativeActionState[] = ['submission_started','uncertain','awaiting_owner','restricted','request_pending','membership_approved','membership_rejected','pending_approval','published','failed_before_submission'];
      if (!allowed.includes(input.state)) throw new Error('Select a supported native observation state');
      if (finalStates.includes(action.state)) throw new Error('This native intent is closed; preserve its result and do not replay it');
      const started = action.events.some(event => event.state === 'submission_started');
      if (input.state === 'submission_started') {
        if (started || !['prepared','awaiting_owner'].includes(action.state)) throw new Error('A native submission was already started or is held; reconcile instead of retrying');
        const current = sameContext(action);
        const account = accountsRepo.getAccountById(action.accountId);
        if (!account || account.archived_at || account.is_demo || account.platform !== 'facebook' || account.account_type !== 'page') throw new Error('The captured acting Page is unavailable; do not submit');
        if ((account.external_id || null) !== action.externalPageId) throw new Error('The acting Page external identity changed; reconcile the captured handoff before any submission');
        if (current.revision !== action.groupRevision || input.confirmRules !== true) throw new Error('Group review changed or rules were not confirmed; do not submit');
        if (action.kind === 'post') {
          const handoff = workspace.package(action.preparedId!);
          if ((handoff.planChanged && !action.supersedesActionId) || handoff.sourcePageUnavailable || handoff.prepared.status !== 'prepared' || current.readiness.state !== 'reviewed_for_manual_handoff') throw new Error('Prepared post is no longer ready; do not submit');
        } else if (current.membership !== 'not_member' || current.eligibility.pagesCanJoin !== 'yes') throw new Error('Page membership eligibility changed; do not submit another request');
      } else if (['request_pending','membership_approved','membership_rejected','pending_approval','published','uncertain'].includes(input.state) && !started) throw new Error('Record the original submission intent before a remote outcome');
      if (action.kind === 'join' && ['pending_approval','published'].includes(input.state) || action.kind === 'post' && ['request_pending','membership_approved','membership_rejected'].includes(input.state)) throw new Error('Outcome does not match the native action kind');
      if (input.state === 'failed_before_submission' && started) throw new Error('A started submission has an uncertain outcome; reconcile rather than label it safe to retry');
      if (input.state === 'awaiting_owner' && started) throw new Error('A started submission remains uncertain; record uncertainty instead');
      const notes = textValue(input.notes, 'Native observation evidence and next step', 4000, true), observedAt = timestamp(input.observedAt);
      let url = input.url ? textValue(input.url, 'Native observation URL', 2048, true) : null;
      if (url && canonicalGroupIdentity(url).canonicalKey !== action.canonicalKey) throw new Error('Evidence must belong to the captured Group identity');
      if (input.state === 'published') {
        if (!url) throw new Error('A resulting Group post permalink is required');
        const thread = parseGroupThreadIdentity(url);
        if (thread.commentId || thread.replyCommentId) throw new Error('Use the resulting Group post permalink, not a comment');
      }
      ledger.event(id, action.revision + 1, { state: input.state, observedAt, recordedAt: new Date().toISOString(), source: input.source, notes, url, verified: false });
      return ledger.get(id)!;
    });
  },
};
