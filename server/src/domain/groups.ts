/** Manual Groups planning contracts. These records never prove a Facebook action occurred. */
export type GroupMembershipStatus = 'unknown' | 'not_member' | 'request_pending' | 'member' | 'admin' | 'request_rejected' | 'request_withdrawn' | 'participation_restricted';
export const groupMembershipStatuses: readonly GroupMembershipStatus[] = ['unknown', 'not_member', 'request_pending', 'member', 'admin', 'request_rejected', 'request_withdrawn', 'participation_restricted'];
export interface GroupEligibility {
  pagesCanJoin: 'unknown' | 'yes' | 'no';
  promotionalRestrictions: string;
  questions: { question: string; answer: string }[];
  participationApproval: 'unknown' | 'required' | 'not_required' | 'approved' | 'restricted';
  postModeration: 'unknown' | 'required' | 'not_required';
}
export function defaultGroupEligibility(): GroupEligibility {
  return { pagesCanJoin: 'unknown', promotionalRestrictions: '', questions: [], participationApproval: 'unknown', postModeration: 'unknown' };
}
export interface GroupMembershipObservation {
  id: string; groupId: string; accountId: string; status: GroupMembershipStatus;
  observedAt: string | null; notes: string; source: 'owner_entered'; verified: false; createdAt: string;
  groupIdentity?: { canonicalKey: string | null; url: string | null } | null;
}
export interface GroupReadiness {
  state: 'needs_review' | 'not_ready' | 'reviewed_for_manual_handoff';
  reasons: string[]; membershipAllowsParticipation: boolean;
  publishingPermission: 'owner_review_required'; verified: false;
}
export interface GroupPlanDto {
  id: string; name: string; url: string; identity_type: 'page' | 'personal'; account_id: string | null;
  membership: GroupMembershipStatus; category: string; notes: string; rules: string;
  rules_reviewed_at: string | null; created_at: string; updated_at: string;
  canonicalKey: string | null; canonicalUrl: string | null; originalUrl: string; actingPageId: string | null;
  shortlisted: boolean; archivedAt: string | null; reviewedAt: string | null; revision: number; legacyDuplicate: boolean;
  eligibility: GroupEligibility; membershipObservations: GroupMembershipObservation[]; readiness: GroupReadiness;
  permissionVerified: false; source: 'owner_entered'; automationSupported: false;
}
export interface GroupPlanInput {
  id?: string; name: string; url: string; identityType: 'page' | 'personal'; accountId?: string | null;
  membership?: GroupMembershipStatus; category?: string; notes?: string; rules?: string; rulesReviewedAt?: string | null;
  shortlisted?: boolean; archived?: boolean; reviewedAt?: string | null; eligibility?: GroupEligibility; revision?: number; expectedRevision?: number;
}
export interface GroupListFilters { query?: string; accountId?: string; membership?: GroupMembershipStatus; category?: string; shortlisted?: boolean; archived?: boolean }
export interface GroupMembershipInput { status: GroupMembershipStatus; observedAt: string; notes?: string; accountId?: string; revision?: number; expectedRevision?: number }
export interface GroupSourcePage { id: string; name: string; externalId: string | null }
export interface GroupMedia { kind: 'image' | 'video'; id: string; title: string; url: string }
export interface GroupHandoffContext {
  version: 1 | 2;
  group: { name: string; url: string; identityType: 'page' | 'personal'; accountId: string | null; membership: GroupMembershipStatus; rules: string; rulesReviewedAt: string | null; notes: string; revision?: number; eligibility?: GroupEligibility; reviewedAt?: string | null; archivedAt?: string | null; membershipObservationId?: string | null };
  sourcePage: GroupSourcePage | null; relevance: string; media: GroupMedia[]; reminderAt: string | null;
}
export interface GroupReceiptEvent { id: string; preparedId: string; url: string; note: string; source: 'owner_entered'; verified: false; recordedAt: string; supersedesId: string | null }
export interface GroupPreparedDto {
  id: string; group_id: string; kind: 'post' | 'reply'; content: string; thread_url: string | null; status: string;
  receipt_url: string | null; receipt_note: string | null; created_at: string; updated_at: string;
  handoffContext: GroupHandoffContext | null; contextCaptured: boolean; receiptHistory: GroupReceiptEvent[];
  latestReceipt: GroupReceiptEvent | null; reminderState: 'active' | 'cancelled' | 'dismissed';
}
export interface GroupPrepareInput {
  kind: 'post' | 'reply'; content: string; threadUrl?: string; accountId?: string; sourcePageId?: string;
  relevance?: string; media?: { kind: 'image' | 'video'; id: string }[]; reminderAt?: string; revision?: number;
}
export interface GroupReceiptInput { url: string; note?: string; confirmOwnerEntered: boolean }
export interface GroupReminderInput { state: 'cancelled' | 'dismissed'; note?: string }
export interface GroupReminderDto { preparedId: string; groupId: string; groupName: string; sourcePage: GroupSourcePage | null; reminderAt: string; overdue: boolean; content: string; status: 'pending_manual_action'; publicationVerified: false }
export interface GroupPackageDto {
  prepared: GroupPreparedDto; group: GroupHandoffContext['group'] & { permissionVerified: false };
  sourcePage: GroupSourcePage | null; media: GroupMedia[]; relevance: string; reminderAt: string | null;
  planChanged: boolean; sourcePageUnavailable: boolean; contextCaptured: boolean; publicationVerified: false;
  nativeUrl: string; publicationStatus: 'unpublished_manual_handoff' | 'owner_receipt_recorded_unverified';
  text: string; driftWarnings: string[]; readiness: GroupReadiness; receiptHistory: GroupReceiptEvent[];
  reminderState: 'active' | 'cancelled' | 'dismissed';
}
export interface GroupCanonicalIdentity { originalUrl: string; canonicalUrl: string; canonicalKey: string; groupToken: string }
export interface GroupThreadIdentity extends GroupCanonicalIdentity { postId: string; commentId: string | null; replyCommentId: string | null }
const reservedGroupTokens = new Set(['create', 'feed', 'discover', 'search', 'joins', 'joined', 'yourgroups', 'groups', 'notifications']);

function parseFacebookGroup(value: unknown): { originalUrl: string; parsed: URL; segments: string[]; groupToken: string } {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('A valid Facebook Group URL is required');
  const originalUrl = value;
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { throw new Error('A valid Facebook Group URL is required'); }
  if (parsed.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port) throw new Error('Use an HTTPS facebook.com Group URL');
  // Reject escaped separators/dot segments before URL normalisation can reinterpret them.
  const rawPath = value.trim().replace(/^https:\/\/[^/]+/i, '').split(/[?#]/, 1)[0];
  if (rawPath.includes('%') || rawPath.includes('\\') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath) || /\/{2,}/.test(rawPath)) throw new Error('Use a direct Facebook Group URL without encoded path segments');
  const segments = parsed.pathname.split('/').filter(Boolean);
  const groupToken = segments[1] || '';
  if (segments[0] !== 'groups' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(groupToken) || reservedGroupTokens.has(groupToken.toLowerCase())) throw new Error('Use a native Facebook Group URL');
  // A registration may be pasted from its post permalink, but arbitrary subpaths are not identities.
  if (segments.length > 2 && !(segments.length === 4 && ['posts', 'permalink'].includes(segments[2]) && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segments[3]))) throw new Error('Use a Group URL or native Group post permalink');
  return { originalUrl, parsed, segments, groupToken };
}

/** Numeric IDs and vanity names remain distinct until the owner has reliable alias evidence. */
export function canonicalGroupIdentity(value: unknown): GroupCanonicalIdentity {
  const { originalUrl, groupToken } = parseFacebookGroup(value);
  const normalizedToken = /^\d+$/.test(groupToken) ? groupToken : groupToken.toLowerCase();
  return { originalUrl, groupToken: normalizedToken, canonicalKey: `${/^\d+$/.test(groupToken) ? 'id' : 'slug'}:${normalizedToken}`, canonicalUrl: `https://www.facebook.com/groups/${normalizedToken}/` };
}

function singleReference(parsed: URL, name: string): string | null {
  const values = parsed.searchParams.getAll(name);
  if (!values.length) return null;
  if (values.length !== 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values[0])) throw new Error('Use an unambiguous Facebook comment reference');
  return values[0];
}
export function parseGroupThreadIdentity(value: unknown): GroupThreadIdentity {
  const { parsed, segments } = parseFacebookGroup(value);
  if (segments.length !== 4) throw new Error('Use a native Group post/thread permalink');
  const commentId = singleReference(parsed, 'comment_id'), replyCommentId = singleReference(parsed, 'reply_comment_id');
  if (replyCommentId && (!commentId || replyCommentId === commentId)) throw new Error('Use unambiguous parent and resulting reply references');
  return { ...canonicalGroupIdentity(value), postId: segments[3], commentId, replyCommentId };
}

/** Match owner-entered URL evidence only; this does not verify a Facebook comment exists. */
export function groupReceiptMatchesThread(preparedThread: string, receipt: string): boolean {
  const prepared = parseGroupThreadIdentity(preparedThread); const observed = parseGroupThreadIdentity(receipt);
  if (prepared.canonicalKey !== observed.canonicalKey || prepared.postId !== observed.postId) return false;
  const resultId = observed.replyCommentId || observed.commentId;
  if (!resultId) return false; // An unchanged post permalink cannot identify the resulting comment.
  if (!prepared.commentId) return true;
  // With a captured parent, a direct comment-only URL cannot establish its relationship.
  if (!observed.replyCommentId || resultId === prepared.commentId || resultId === prepared.replyCommentId) return false;
  // Nested-reply links can retain the root comment or explicitly name the saved reply target.
  return observed.commentId === prepared.commentId || observed.commentId === prepared.replyCommentId;
}

export function groupReadiness(input: {
  identityType: 'page' | 'personal'; membership: GroupMembershipStatus; eligibility: GroupEligibility;
  rules: string; rulesReviewedAt: string | null; reviewedAt: string | null; archivedAt: string | null; actingPageAvailable?: boolean;
}): GroupReadiness {
  const reasons: string[] = [];
  const membershipAllowsParticipation = input.membership === 'member' || input.membership === 'admin';
  let blocked = false;
  if (input.archivedAt) { reasons.push('This Group plan is archived.'); blocked = true; }
  if (input.identityType === 'personal') reasons.push('Personal identity remains a manual handoff; confirm the acting identity on Facebook.');
  if (input.identityType === 'page' && input.actingPageAvailable === false) { reasons.push('The acting Page is unavailable.'); blocked = true; }
  if (!membershipAllowsParticipation) { reasons.push('Record an owner-observed Member or Admin status before considering participation.'); blocked = true; }
  if (input.identityType === 'page' && input.eligibility.pagesCanJoin !== 'yes') {
    reasons.push(input.eligibility.pagesCanJoin === 'no' ? 'The owner recorded that Pages cannot join.' : 'Review whether this Group allows Pages.');
    if (input.eligibility.pagesCanJoin === 'no') blocked = true;
  }
  if (!input.rules.trim() || !input.rulesReviewedAt) reasons.push('Review and record the Group rules and review date.');
  if (!input.reviewedAt) reasons.push('Resume Review to record a current owner review.');
  if (input.eligibility.questions.some(item => !item.answer.trim())) reasons.push('Review unanswered membership questions.');
  if (input.eligibility.participationApproval !== 'approved' && input.eligibility.participationApproval !== 'not_required') {
    reasons.push(input.eligibility.participationApproval === 'restricted' ? 'Participation is restricted.' : 'Review participation approval requirements.');
    if (input.eligibility.participationApproval === 'restricted' || input.eligibility.participationApproval === 'required') blocked = true;
  }
  if (input.eligibility.postModeration === 'unknown') reasons.push('Review post moderation requirements.');
  // Even a complete owner review is informational, never permission or independent verification.
  return { state: blocked ? 'not_ready' : reasons.length ? 'needs_review' : 'reviewed_for_manual_handoff', reasons, membershipAllowsParticipation, publishingPermission: 'owner_review_required', verified: false };
}
