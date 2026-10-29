import { useEffect, useRef } from 'react';
import { useFeatureActive } from '../features/FeatureActivity';

export type Resource = 'accounts' | 'categories' | 'publishing' | 'videos' | 'pipeline' | 'calendar' | 'inbox' | 'analytics' | 'activity' | 'groups' | 'assistant';
const eventName = 'scc:resources-changed';
const pending = new Set<Resource>();
let scheduled: ReturnType<typeof setTimeout> | undefined;
const revisions = new Map<Resource, number>();
export function resourceRevision(resource: Resource) { return revisions.get(resource) || 0; }

/** Notifications invalidate reads; they never execute commands or replay mutations. */
export function invalidateResources(resources: readonly Resource[]) {
  if (typeof window === 'undefined') return;
  resources.forEach(resource => { pending.add(resource); revisions.set(resource, resourceRevision(resource) + 1); });
  if (scheduled !== undefined) return;
  scheduled = setTimeout(() => {
    scheduled = undefined;
    const changed = [...pending]; pending.clear();
    window.dispatchEvent(new CustomEvent(eventName, { detail: changed }));
  }, 40);
}

export function useResourceRefresh(resources: readonly Resource[], refresh: () => unknown, refreshOnResume = false) {
  const active = useFeatureActive();
  const subscribed = useRef(false);
  const latest = useRef({ resources, refresh });
  latest.current = { resources, refresh };
  useEffect(() => {
    if (!active) return;
    if (subscribed.current && refreshOnResume) void latest.current.refresh();
    subscribed.current = true;
    const listener = (event: Event) => {
      const changed = (event as CustomEvent<Resource[]>).detail;
      if (changed.some(resource => latest.current.resources.includes(resource))) void latest.current.refresh();
    };
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [active, refreshOnResume]);
}

export function resourcesForCommand(url: string): Resource[] {
  const path = url.split('?')[0];
  if (/\/accounts\/categories(?:\/|$)/.test(path)) return ['categories'];
  if (/\/(accounts|connections)(?:\/|$)/.test(path)) return ['accounts'];
  if (/\/publishing\/(upload|images)(?:\/|$)/.test(path)) return ['videos'];
  if (/\/publishing(?:\/|$)/.test(path)) return ['publishing', 'calendar'];
  if (/\/calendar(?:\/|$)/.test(path)) return ['calendar', 'publishing'];
  if (/\/inbox(?:\/|$)/.test(path)) return ['inbox'];
  if (/\/analytics(?:\/|$)/.test(path)) return ['analytics'];
  if (/\/branding\/kits(?:\/|$)/.test(path)) return ['accounts'];
  if (/\/branding(?:\/|$)/.test(path)) return ['videos'];
  if (/\/pipeline(?:\/|$)/.test(path)) return ['pipeline', 'videos'];
  if (/\/groups(?:\/|$)/.test(path)) return ['groups'];
  if (/\/assistant(?:\/|$)/.test(path)) return ['assistant'];
  return [];
}
