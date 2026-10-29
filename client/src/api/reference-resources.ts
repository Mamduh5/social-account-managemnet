import { api } from './client';
import { resourceRevision, type Resource } from './resource-events';

function sharedRead<T>(resource: Resource, read: () => Promise<T>) {
  let cached: { revision: number; until: number; value: Promise<T> } | undefined;
  return () => {
    const revision = resourceRevision(resource);
    if (cached && cached.revision === revision && cached.until > Date.now()) return cached.value;
    const entry = { revision, until: Date.now() + 15_000, value: read() };
    cached = entry;
    entry.value.catch(() => { if (cached === entry) cached = undefined; });
    return entry.value;
  };
}

/** Shared short-lived reference reads; forms remain owned by their feature. */
export const readAccounts = sharedRead('accounts', () => api.getAccounts());
export const readAllAccounts = sharedRead('accounts', () => api.getAccounts(true));
export const readCategories = sharedRead('categories', () => api.getCategories());
