import {weeklyPreparationTime} from './weekly-original.js';
import { z } from 'zod';
import { AgentStore } from './store.js';

export const weeklyImageGrantSchema = z.object({
  version: z.literal('weekly-codex-images.v1'), id: z.string().regex(/^[\w-]{1,100}$/), planId: z.string().max(200),
  startsAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
  maxTotalImages: z.number().int().min(1).max(60), maxImagesPer24Hours: z.number().int().min(1).max(20),
  maxActiveImages: z.literal(1), maxPendingItems: z.number().int().min(1).max(6),
  provider: z.literal('codex_included'),
  concepts: z.array(z.object({ slotId: z.string(), taskId: z.string(), accountId: z.string(), graphId: z.string(), resultHash: z.string().regex(/^[a-f0-9]{64}$/), count: z.number().int().min(1).max(10) }).strict()).min(1).max(6),
}).strict();

/** Reservations are durable opening-image tasks, including failed/unknown attempts.
 * Daily accounting spans earlier grants for the selected Pages; expiry never refunds it. */
export function weeklyImageAdmission(store: AgentStore, input: Record<string, any>, now: number, excludeTask?: string): boolean {
  if (!input.weeklyPolicyId) return true;
  const grant = store.getJob(input.weeklyPolicyId), p = grant?.input as any;
  const parsed = weeklyImageGrantSchema.safeParse(p?.policy);
  if (!grant || !parsed.success || grant.state.enabled !== true || grant.state.revokedAt) return false;
  const policy = parsed.data;
  if (Date.parse(policy.startsAt) > now || Date.parse(policy.expiresAt) <= now) return false;
  const scope = input.plan ? { input } : store.getJob(input.scopeId);
  const parent = (scope?.input as any)?.plan?.taskId;
  const concept = policy.concepts.find(c => c.taskId === parent);
  if (!concept || (scope?.input as any)?.resultHash !== concept.resultHash || store.getWork(parent)?.accountId !== concept.accountId) return false;
  const research=store.getWork(parent)?.payload?.pageContent?.weeklyResearch;
  if(!research?.evidence?.length||research.evidence.some((e:any)=>Date.parse(e.validUntil)<=now||Date.parse(e.observedAt)>now+60000)||Date.parse(weeklyPreparationTime(store,store.getWork(parent)!))<=now)return false;
  const rows: any[] = [];
  if (store.workCount() > 10000) return false;
  for (let offset = 0; offset < store.workCount(); offset += 100) rows.push(...store.listWork(100, offset));
  const pages = new Set(policy.concepts.map(c => c.accountId));
  const images = rows.filter(t => t.id !== excludeTask && t.payload?.codexImage && pages.has(t.accountId));
  const own = images.filter(t => (store.getJob(t.payload.codexImage.scopeId)?.input as any)?.weeklyPolicyId === grant.id);
  const daily = images.filter(t => Date.parse(t.createdAt) > now - 86400000);
  const active = rows.filter(t => t.id !== excludeTask && t.payload?.codexImage && (t.status === 'claimed' || store.runnerSessions({ taskId: t.id }).some(s => ['reserved', 'running', 'recovery_required'].includes(s.status))));
  return own.length < policy.maxTotalImages && daily.length < policy.maxImagesPer24Hours && active.length < policy.maxActiveImages;
}
