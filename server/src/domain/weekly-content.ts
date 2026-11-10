import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseBangkokScheduledTime } from './content-calendar.js';

const id = z.string().trim().min(1).max(200);
const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.string().datetime({ offset: true });
export const weeklyFormats = ['text', 'image', 'image_caption', 'reel'] as const;
export const evidenceKinds = ['direct_observation', 'verified_fact', 'audience_opinion', 'repeated_question', 'interpretation', 'hypothesis', 'owner_reference'] as const;
export const evidenceInput = z.object({
  kind: z.enum(evidenceKinds), summary: text(2000), sourceRef: text(2048),
  observedAt: date, validUntil: date, accountId: id, groupId: id.optional(),
  limitations: text(1500), privacy: z.enum(['public', 'authorized_group', 'owner_supplied']),
  relevanceConfirmed: z.literal(true),
  verificationNote: z.string().trim().max(1000).optional(),
}).strict();
export type WeeklyEvidence = z.infer<typeof evidenceInput> & { id: string; provenance: string; independentlyVerified: boolean };
export const ideaInput = z.object({
  id, accountId: id, groupId: id.optional(), topic: text(200), intendedAudience: text(600),
  evidenceIds: z.array(id).min(1).max(15), interestReason: text(1500), originalContribution: text(1500),
  recommendedFormat: z.enum(weeklyFormats), formatReason: text(1500), factualRequirements: z.array(text(1000)).max(15),
  confidence: z.enum(['low', 'medium', 'high']), limitations: z.array(text(1000)).min(1).max(15),
}).strict();
export type WeeklyIdea = z.infer<typeof ideaInput>;
export const slotInput = z.object({ id, ideaId: id, format: z.enum(weeklyFormats), scheduledAt: text(80) }).strict();
export type WeeklySlot = z.infer<typeof slotInput> & {
  preparation?: { status: string; taskId?: string; jobId?: string; hold?: string; intentAt?: string; [key: string]: unknown };
  draftId?: string; draftRevision?: number; campaignId?: string; preparedId?: string; outcome?: Record<string, unknown>;
  groupSchedule?: { status: string; destinationId: string; registryId: string; grantId: string; hold?: string };
  production?: {itemId:string;status:string;hold?:string;candidateDraftId?:string|null;publicationPostId?:string|null;reviewRequired?:boolean};
};
export interface WeeklyPlan {
  version: 'weekly-content.v1'; id: string; name: string; revision: number;
  startDate: string; endDate: string; timeZone: 'Asia/Bangkok';
  targetAccountIds: string[]; groupIds: string[]; evidence: WeeklyEvidence[]; ideas: WeeklyIdea[]; slots: WeeklySlot[];
  planningApproval: { revision: number; at: string; hash: string } | null;
  analysisTasks: Array<{ taskId: string; accountId: string; status: string; hold?: string }>;
  limitations: string[]; createdAt: string; updatedAt: string;
  authorizations?: Array<{id:string;issuedAt:string;expiresAt:string;selectionHash:string;slotIds:string[];operations:{prepare:boolean;materialize:boolean;publishExact:boolean};campaigns:Array<{id:string;accountId:string;expectedHash:string}>;targets:Array<{accountId:string;contextFingerprint:string}>;groupScopes:Array<{slotId:string;registryId:string;grantId:string}>;imageBudget?:Record<string,any>;state:Record<string,any>}>;
}
export function weeklySelectionHash(p:WeeklyPlan,slotIds:string[]){const slots=p.slots.filter(s=>slotIds.includes(s.id)).map(({id,ideaId,format,scheduledAt})=>({id,ideaId,format,scheduledAt}));const ideas=p.ideas.filter(i=>slots.some(s=>s.ideaId===i.id));return weeklyHash({planId:p.id,startDate:p.startDate,endDate:p.endDate,slots,ideas,evidence:p.evidence.filter(e=>ideas.some(i=>i.evidenceIds.includes(e.id)))});}
export const weeklyHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function weekWindow(startDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(startDate + 'T00:00:00Z')) || new Date(startDate + 'T00:00:00Z').toISOString().slice(0, 10) !== startDate) throw new Error('Use a valid Bangkok start date');
  const start = Date.parse(startDate + 'T00:00:00+07:00');
  return { start, end: start + 7 * 86400000, endDate: new Date(Date.parse(startDate + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10) };
}
export function validateEvidence(evidence: z.infer<typeof evidenceInput>, now: number) {
  const observed = Date.parse(evidence.observedAt), until = Date.parse(evidence.validUntil);
  if (observed > now + 60000 || until <= observed || until - observed > 7 * 86400000) throw new Error('Evidence needs a real observation time and a freshness window of at most seven days');
  if (/^https?:/i.test(evidence.sourceRef)) {
    const url = new URL(evidence.sourceRef);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !url.hostname.includes('.') || /^(localhost|[\d.]+)$/.test(url.hostname)) throw new Error('Use a public HTTPS source without credentials, query or fragment');
    if (/(?:\.\.\.|placeholder|example-report)/i.test(url.pathname)) throw new Error('Supply an identifiable source page, not a placeholder citation');
    if (/(^|\.)facebook\.com$/i.test(url.hostname) && url.pathname.startsWith('/groups/') && !evidence.groupId) throw new Error('Facebook Group research requires the exact registered Group and authorized observation');
  } else if (!/^(owner:|scc:|docs\/content\/research\/)[\w./:-]+$/u.test(evidence.sourceRef)) throw new Error('Use a supported public source, owner reference or SCC evidence reference');
  if (evidence.kind === 'verified_fact' && !evidence.verificationNote?.trim()) throw new Error('A verified fact requires an explicit verification note; supplied claims are not independently verified');
  if (evidence.groupId && evidence.privacy !== 'authorized_group') throw new Error('Group evidence requires an authorized Group observation');
}
export function validateIdeasAndSlots(plan: WeeklyPlan, now: number) {
  const unique = (items: { id: string }[]) => new Set(items.map(v => v.id)).size === items.length;
  if (!unique(plan.ideas) || !unique(plan.slots)) throw new Error('Idea and slot IDs must be unique');
  if (plan.slots.length > 100 || plan.ideas.length > 100) throw new Error('Weekly V1 supports at most 100 ideas and slots');
  const window = weekWindow(plan.startDate);
  for (const idea of plan.ideas) {
    if (!plan.targetAccountIds.includes(idea.accountId) || (idea.groupId && !plan.groupIds.includes(idea.groupId))) throw new Error('Idea destination is outside this weekly plan');
    for (const evidenceId of idea.evidenceIds) {
      const evidence = plan.evidence.find(e => e.id === evidenceId);
      if (!evidence || evidence.accountId !== idea.accountId || (evidence.groupId && evidence.groupId !== idea.groupId)) throw new Error('Every idea needs supporting evidence for its exact Page or Group');
    }
  }
  for (const slot of plan.slots) {
    const idea = plan.ideas.find(i => i.id === slot.ideaId);
    if (!idea) throw new Error('Slot must reference an existing idea');
    slot.scheduledAt = parseBangkokScheduledTime(slot.scheduledAt);
    const at = Date.parse(slot.scheduledAt);
    if (at < window.start || at >= window.end) throw new Error('Slot must fall within the seven-day Bangkok window (end exclusive)');
    // Past slots may be retained as history. Admission, never this edit, enforces a future time.
    if (!Number.isFinite(now)) throw new Error('Invalid clock');
  }
  for (const accountId of plan.targetAccountIds) {
    if (plan.slots.filter(s => { const idea = plan.ideas.find(i => i.id === s.ideaId)!; return idea.accountId === accountId && !idea.groupId; }).length > 50) throw new Error('Each existing Page campaign supports at most 50 weekly publications');
  }
}
export function slotEvidenceHold(plan: WeeklyPlan, slot: WeeklySlot, now: number) {
  const idea = plan.ideas.find(i => i.id === slot.ideaId)!;
  const evidence = idea.evidenceIds.map(id => plan.evidence.find(e => e.id === id)!);
  if (Date.parse(slot.scheduledAt) <= now) return 'missed_publication_window_review_required';
  if (evidence.some(e => Date.parse(e.validUntil) <= now || Date.parse(e.validUntil) < Date.parse(slot.scheduledAt))) return 'fresh_evidence_required_for_preparation_and_publication';
  if (idea.groupId && slot.format !== 'text') return 'group_v1_text_only_separate_media_authority_required';
  return null;
}
