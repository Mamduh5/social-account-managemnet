import type { GroupListFilters, GroupMembershipInput, GroupPackageDto, GroupPlanDto, GroupPlanInput, GroupPreparedDto, GroupPrepareInput, GroupReceiptInput, GroupReminderDto, GroupReminderInput } from '../../../server/src/domain/groups';
import { request as httpRequest } from './http';

async function request<T = any>(url:string,method='GET',body?:unknown): Promise<T> {
  return httpRequest<T>(`/api/${url}`,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
}
export const contentWorkspaceApi={
  assistant:(path:string,method='GET',body?:unknown)=>request(`assistant/${path}`,method,body),
  groups:(path='',method='GET',body?:unknown)=>request(`groups/${path}`,method,body),
  publishingDraft:(body:unknown)=>request('publishing/drafts','POST',body),
};

/** Typed manual Groups contracts; the generic assistant interface remains unchanged. */
export const groupsApi = {
  list: (filters: GroupListFilters = {}) => {
    const query = new URLSearchParams();
    if (filters.query) query.set('q', filters.query);
    if (filters.accountId) query.set('accountId', filters.accountId);
    if (filters.membership) query.set('membership', filters.membership);
    if (filters.category) query.set('category', filters.category);
    if (filters.shortlisted !== undefined) query.set('shortlisted', String(filters.shortlisted));
    if (filters.archived !== undefined) query.set('archived', String(filters.archived));
    return request<{ groups: GroupPlanDto[] }>(`groups/${query.size ? `?${query}` : ''}`);
  },
  save: (input: GroupPlanInput, id?: string) => request<{ group: GroupPlanDto }>(`groups/${id ? encodeURIComponent(id) : ''}`, id ? 'PUT' : 'POST', input),
  review: (id: string) => request<{ group: GroupPlanDto; prepared: GroupPreparedDto[]; publicationVerified: false }>(`groups/${encodeURIComponent(id)}/review`),
  membership: (id: string, input: GroupMembershipInput) => request<{ group: GroupPlanDto }>(`groups/${encodeURIComponent(id)}/membership`, 'POST', input),
  prepared: (id: string) => request<{ prepared: GroupPreparedDto[] }>(`groups/${encodeURIComponent(id)}/prepared`),
  prepare: (id: string, input: GroupPrepareInput) => request<{ prepared: GroupPreparedDto }>(`groups/${encodeURIComponent(id)}/prepared`, 'POST', input),
  package: (id: string) => request<GroupPackageDto>(`groups/prepared/${encodeURIComponent(id)}/package`),
  receipt: (id: string, input: GroupReceiptInput) => request<{ prepared: GroupPreparedDto }>(`groups/prepared/${encodeURIComponent(id)}/receipt`, 'POST', input),
  reminders: () => request<{ reminders: GroupReminderDto[] }>('groups/reminders'),
  reminder: (id: string, input: GroupReminderInput) => request<{ prepared: GroupPreparedDto }>(`groups/prepared/${encodeURIComponent(id)}/reminder`, 'POST', input),
};
