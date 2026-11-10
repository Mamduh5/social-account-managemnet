import { request } from './http';

export type WeeklyFormat = 'text' | 'image' | 'image_caption' | 'reel';
export type EvidenceKind = 'direct_observation' | 'verified_fact' | 'audience_opinion' | 'repeated_question' | 'interpretation' | 'hypothesis' | 'owner_reference';
export interface WeeklyEvidence {
  id: string;
  kind: EvidenceKind;
  summary: string;
  sourceRef: string;
  observedAt: string;
  validUntil: string;
  accountId: string;
  groupId?: string;
  limitations: string;
  privacy: 'public' | 'authorized_group' | 'owner_supplied';
  relevanceConfirmed: true;
  verificationNote?: string;
  provenance?: string;
  independentlyVerified?: boolean;
}
export interface WeeklyIdea {
  id: string;
  accountId: string;
  groupId?: string;
  topic: string;
  intendedAudience: string;
  evidenceIds: string[];
  interestReason: string;
  originalContribution: string;
  recommendedFormat: WeeklyFormat;
  formatReason: string;
  factualRequirements: string[];
  confidence: 'low' | 'medium' | 'high';
  limitations: string[];
}
export interface WeeklySlot {
  id: string;
  ideaId: string;
  format: WeeklyFormat;
  scheduledAt: string;
  preparation?: { taskId?: string; intentAt?: string; status: string; hold?: string };
  campaignId?: string;
  draftId?: string;
  preparedId?: string;
  production?: {itemId:string;status:string;hold?:string};
  groupSchedule?: { status: string; destinationId?: string; registryId: string; grantId: string; hold?: string };
  hold?: string;
  outcome?: Record<string, unknown> | null;
}
export interface WeeklyPlan {
  id: string;
  name: string;
  revision: number;
  startDate: string;
  endDate: string;
  timeZone: 'Asia/Bangkok';
  targetAccountIds: string[];
  groupIds: string[];
  evidence: WeeklyEvidence[];
  ideas: WeeklyIdea[];
  slots: WeeklySlot[];
  planningApproval: { revision: number; at: string } | null;
  analysisTasks: { taskId: string; accountId: string; status: string; hold?: string }[];
  limitations: string[];
  authorizations?: Array<{id:string;slotIds:string[];expiresAt:string;state:Record<string,unknown>}>;
}
export interface WeeklyTarget { accountId: string; graphId: string; name: string; persona: string }
export interface WeeklyGroup { id: string; name: string; accountId: string; rules: string; limitations: string[] }
export interface WeeklyIndex { plans: WeeklyPlan[]; targets: WeeklyTarget[]; groups: WeeklyGroup[] }
type PlanResult = { plan: WeeklyPlan };

function command<T>(path: string, body: unknown, method = 'POST') {
  return request<T>(`/api/weekly-content${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export const weeklyContentApi = {
  index: () => request<WeeklyIndex>('/api/weekly-content'),
  plan: (id: string) => request<PlanResult>(`/api/weekly-content/plans/${encodeURIComponent(id)}`),
  create: (body: { name: string; startDate: string; targetAccountIds: string[]; groupIds: string[] }) => command<PlanResult>('/plans', body),
  collect: (plan: WeeklyPlan) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/collect`, { revision: plan.revision }),
  evidence: (plan: WeeklyPlan, evidence: Omit<WeeklyEvidence, 'id' | 'provenance' | 'independentlyVerified'>) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/evidence`, { revision: plan.revision, evidence }),
  analyze: (plan: WeeklyPlan, accountId: string, brief: string) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/analyze`, { revision: plan.revision, accountId, brief }),
  importAnalysis: (plan: WeeklyPlan, taskId: string) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/import-analysis`, { revision: plan.revision, taskId }),
  edit: (plan: WeeklyPlan, changes: { name?: string; slots?: WeeklySlot[]; ideas?: WeeklyIdea[] }) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}`, {
    revision: plan.revision,
    ...changes,
    // Server-derived preparation, receipts and queue references are never editable input.
    ...(changes.slots ? { slots: changes.slots.map(({ id, ideaId, format, scheduledAt }) => ({ id, ideaId, format, scheduledAt })) } : {}),
  }, 'PUT'),
  approvePlanning: (plan: WeeklyPlan) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/approve-planning`, { revision: plan.revision }),
  prepare: (plan: WeeklyPlan, slotIds: string[]) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/prepare`, { revision: plan.revision, slotIds, confirmPreparation: true }),
  materialize: (plan: WeeklyPlan) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/materialize`, { revision: plan.revision }),
  outcomes: (plan: WeeklyPlan) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/outcomes`, { revision: plan.revision }),
  scheduleGroup: (plan: WeeklyPlan, slotId: string, registryId: string, grantId: string) => command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/schedule-group`, { revision: plan.revision, slotId, registryId, grantId, confirmSchedule: true }),
  batchReview: (plan:WeeklyPlan,slotIds:string[])=>command<{review:WeeklyBatchReview}>(`/plans/${encodeURIComponent(plan.id)}/batch-review`,{revision:plan.revision,slotIds}),
  authorizeWeek: (plan:WeeklyPlan,body:Record<string,unknown>)=>command<PlanResult>(`/plans/${encodeURIComponent(plan.id)}/authorize-week`,{revision:plan.revision,...body}),
};
export interface WeeklyBatchReview {hash:string;slotIds:string[];policy:string;imageHold:string|null;images:{reviewHash:string|null;concepts:Array<{slotId:string;taskId:string;count:number;continuity:string;frames:Array<{description:string;purpose:string;aspectRatio:string}>}>};slots:Array<WeeklySlot&{idea:WeeklyIdea;hold:string|null}>;campaigns:Array<{campaign:{id:string;name:string};account:{name:string};items:Array<{id:string;title:string;caption:string;hashtags:string;scheduledAt:string;media:Array<{id:string;previewUrl?:string;url?:string}>}>}>;}
