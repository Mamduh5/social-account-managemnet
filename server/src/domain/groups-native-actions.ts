/** Native browser/manual handoffs only. No endpoint in this contract executes a Facebook action. */
export type GroupNativeActionKind = 'join' | 'post';
export type GroupNativeActionState = 'prepared' | 'blocked' | 'submission_started' | 'uncertain' | 'awaiting_owner' | 'restricted' | 'request_pending' | 'membership_approved' | 'membership_rejected' | 'pending_approval' | 'published' | 'failed_before_submission';
export interface GroupNativeActionEvent {
  state: GroupNativeActionState; observedAt: string; recordedAt: string;
  source: 'owner_entered' | 'agent_browser_observation'; notes: string; url: string | null;
  verified: false;
}
export interface GroupNativeActionDto {
  id: string; groupId: string; canonicalKey: string; groupUrl: string;
  accountId: string; accountName: string; externalPageId: string | null; groupRevision: number;
  kind: GroupNativeActionKind; preparedId: string | null; requestKey: string;
  contentFingerprint: string | null;
  supersedesActionId: string | null; supersededById: string | null;
  state: GroupNativeActionState; revision: number; createdAt: string; reasons: string[];
  handoffText: string; events: GroupNativeActionEvent[];
  automationSupported: false; publicationVerified: false;
}
export interface GroupNativeActionInput {
  kind: GroupNativeActionKind; preparedId?: string; requestKey: string; revision: number;
  supersedesActionId?: string; expectedActionRevision?: number; confirmIdentity?: boolean; confirmRules?: boolean;
}
export interface GroupNativeOutcomeInput {
  state: Exclude<GroupNativeActionState, 'prepared' | 'blocked'>;
  revision: number; accountId: string; observedAt: string;
  source: GroupNativeActionEvent['source']; notes: string; url?: string;
  confirmIdentity: boolean; confirmRules?: boolean;
}

/** Export current derived state with the immutable original packet; a saved file must carry replay holds. */
export function groupNativeActionExport(action: GroupNativeActionDto): string {
  const hold = action.supersededById ? `SUPERSEDED — DO NOT SUBMIT; use ${action.supersededById}.` :
    action.events.some(event => event.state === 'submission_started') ? 'REMOTE SUBMISSION WAS STARTED — RECONCILE ONLY; do not submit again.' :
    action.state === 'blocked' || action.state === 'restricted' || action.state === 'failed_before_submission' ? 'HELD — DO NOT SUBMIT. Review this unsent handoff and the recorded restriction first.' :
    'UNSUBMITTED LOCAL HANDOFF — confirm the exact Page identity and current Group rules before acting.';
  return `CURRENT NATIVE STATE: ${action.state} (observations unverified)\n${hold}\n${action.supersedesActionId ? `Reviewed unsent replacement of ${action.supersedesActionId}.\n` : ''}\n${action.handoffText}\n\nSAVED OBSERVATIONS — UNVERIFIED\n${action.events.map(event => `${event.observedAt} ${event.state} (${event.source}): ${event.notes}\n${event.url || ''}`).join('\n')}`;
}
