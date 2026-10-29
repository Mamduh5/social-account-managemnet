import { DraftInput, ImageAsset, PublishingDraft, PostCapabilities } from '../types/general-posts';
import { HiddenWatchFilePage, TestDataDetail, TestDataPage, TestDataPreview, TestDataSelection, WatchFilePage } from '../types/test-data';
import {
  AccountsResponse,
  CategoriesResponse,
  VideosResponse,
  PostsResponse,
  QueueResponse,
  CommentsResponse,
  ActivityResponse,
  PipelineStatusResponse,
  PipelineJobsPageResponse,
  BrandKit,
  AnalyticsOverviewResponse,
  VideoPerformanceItem,
} from '../types';

const API_BASE = '/api';
async function checked(res: Response) {
  const body = await res.json();
  if (!res.ok || body.error || body.success === false) throw new Error(body.error || body.message || 'Request failed');
  return body;
}


export const api = {
  async getTestData(type: string, search: string, offset: number, signal?: AbortSignal, filters?: {classification?: string; source?: string; eligibility?: string; status?: string}): Promise<TestDataPage> {
    const params = new URLSearchParams({ type, search, limit: '20', offset: String(offset) });
    for (const [key, value] of Object.entries(filters || {})) if (value) params.set(key, value);
    return checked(await fetch(`${API_BASE}/test-data?${params}`, { signal }));
  },
  async getTestDataDetail(record: TestDataSelection, signal?: AbortSignal): Promise<TestDataDetail> {
    const params = new URLSearchParams({type:record.type,id:record.id});
    return checked(await fetch(`${API_BASE}/test-data/detail?${params}`, {signal}));
  },
  async classifyTestData(record: TestDataSelection, classification: 'test'|'keep'|'clear', sourceFingerprint?: string | null): Promise<{type:string;id:string;classification:string}> {
    return checked(await fetch(`${API_BASE}/test-data-metadata/classify`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...record,classification,...(sourceFingerprint !== undefined ? {sourceFingerprint} : {})})}));
  },
  async setPipelineHidden(jobId: string, hidden: boolean, sourceFingerprint?: string | null, legacy = false): Promise<{jobId:string;hidden:boolean}> {
    return checked(await fetch(`${API_BASE}/test-data-metadata/pipeline-hidden`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId,hidden,...(sourceFingerprint !== undefined ? {sourceFingerprint} : {}),legacy})}));
  },
  async getHiddenPipeline(offset = 0): Promise<{items:{jobId:string;sourceFingerprint:string|null;currentSource:boolean;legacy:boolean;ownerClassification?:'owner_marked_test'|'owner_marked_keep'|'unknown'}[];limit:number;offset:number;hasMore:boolean}> {
    return checked(await fetch(`${API_BASE}/test-data-metadata/pipeline-hidden?offset=${offset}&limit=20`));
  },
  async getWatchFiles(offset = 0, visibility: 'all'|'visible'|'hidden' = 'all', signal?: AbortSignal): Promise<WatchFilePage> {
    const params = new URLSearchParams({offset:String(offset),limit:'20',visibility});
    return checked(await fetch(`${API_BASE}/test-data-metadata/watch-files?${params}`, {signal}));
  },
  async getHiddenWatchFiles(offset = 0, signal?: AbortSignal): Promise<HiddenWatchFilePage> {
    const params = new URLSearchParams({offset:String(offset),limit:'20'});
    return checked(await fetch(`${API_BASE}/test-data-metadata/watch-hidden?${params}`, {signal}));
  },
  async setWatchFileHidden(fileId: string, sourceFingerprint: string, hidden: boolean): Promise<{fileId:string;hidden:boolean}> {
    return checked(await fetch(`${API_BASE}/test-data-metadata/watch-hidden`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileId,sourceFingerprint,hidden})}));
  },
  async previewTestDataDeletion(records: TestDataSelection[]): Promise<TestDataPreview> {
    return checked(await fetch(`${API_BASE}/test-data/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }),
    }));
  },
  async deleteTestData(previewId: string, confirmation: string): Promise<{ deleted: TestDataSelection[]; count: number; auditId: string }> {
    return checked(await fetch(`${API_BASE}/test-data/delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ previewId, confirmation }),
    }));
  },
  // Accounts & Categories
  async getAccounts(includeArchived = false): Promise<AccountsResponse> {
    const res = await fetch(`${API_BASE}/accounts${includeArchived ? "?includeArchived=true" : ""}`);
    return checked(res);
  },
  async getCategories(): Promise<CategoriesResponse> {
    const res = await fetch(`${API_BASE}/accounts/categories/all`);
    return checked(res);
  },
  async createAccount(data: any): Promise<{ success: boolean; id: string }> {
    const res = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return checked(res);
  },
  async updateAccount(id: string, data: any): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return checked(res);
  },
  async reconnectAccount(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/accounts/${id}/reconnect`, { method: 'POST' });
    return checked(res);
  },
  async testAccountHealth(id: string): Promise<{ success: boolean; health: any }> {
    const res = await fetch(`${API_BASE}/accounts/${id}/test-health`, { method: 'POST' });
    return checked(res);
  },
  async createCategory(data: any): Promise<{ success: boolean; id: string; slug?: string }> {
    const res = await fetch(`${API_BASE}/accounts/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return checked(res);
  },

  async uploadAvatar(file: File) {
    const body = new FormData(); body.append('avatar',file);
    return checked(await fetch(`${API_BASE}/accounts/avatar`,{method:'POST',body}));
  },
  async accountAction(id: string, action: string, data: any = {}) {
    return checked(await fetch(`${API_BASE}/connections/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }));
  },
  async connectionSetup(id: string) { return checked(await fetch(`${API_BASE}/connections/${id}/setup`)); },
  async connectionCandidates(id: string) { return checked(await fetch(`${API_BASE}/connections/${id}/candidates`)); },
  async archiveAccount(id: string) { return checked(await fetch(`${API_BASE}/accounts/${id}`, { method: 'DELETE' })); },
  async restoreAccount(id: string) { return checked(await fetch(`${API_BASE}/accounts/${id}/restore`, { method: 'POST' })); },
  async archiveDemos() { return checked(await fetch(`${API_BASE}/accounts/archive-demos`, { method: 'POST' })); },
  async handoffPackage(id: string) { return checked(await fetch(`${API_BASE}/bridge/destinations/${id}/package`)); },

  // General Page posts are saved as drafts before explicit approval and dispatch.
  async getImages(): Promise<{ images: ImageAsset[] }> { return checked(await fetch(API_BASE + '/publishing/images')); },
  async uploadImage(file: File): Promise<{ image: ImageAsset }> {
    const body = new FormData(); body.append('image', file);
    return checked(await fetch(API_BASE + '/publishing/images', { method: 'POST', body }));
  },
  async getPublishingDrafts(): Promise<{ drafts: PublishingDraft[] }> { return checked(await fetch(API_BASE + '/publishing/drafts')); },
  async savePublishingDraft(data: DraftInput, id?: string, revision?: number): Promise<{ draft: PublishingDraft }> {
    return checked(await fetch(API_BASE + '/publishing/drafts' + (id ? '/' + encodeURIComponent(id) : ''), {
      method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, revision }),
    }));
  },
  async publishingDraftAction(id: string, action: 'approve' | 'reject' | 'queue', revision: number): Promise<{ draft: PublishingDraft }> {
    return checked(await fetch(API_BASE + '/publishing/drafts/' + encodeURIComponent(id) + '/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision }),
    }));
  },
  async approvePublishingDraftBatch(drafts: { id: string; revision: number }[]): Promise<{ drafts: PublishingDraft[] }> {
    return checked(await fetch(API_BASE + '/publishing/drafts/batch-approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drafts }),
    }));
  },
  async getPostCapabilities(accountId: string): Promise<PostCapabilities> { return checked(await fetch(API_BASE + '/publishing/post-capabilities/' + encodeURIComponent(accountId))); },

  // Publishing
  async getVideos(categoryId?: string): Promise<VideosResponse> {
    const url = categoryId ? `${API_BASE}/publishing/videos?categoryId=${categoryId}` : `${API_BASE}/publishing/videos`;
    const res = await fetch(url);
    return checked(res);
  },
  async uploadVideo(formData: FormData): Promise<{ success: boolean; videoId: string; title: string }> {
    const res = await fetch(`${API_BASE}/publishing/upload`, {
      method: 'POST',
      body: formData,
    });
    return checked(res);
  },
  async createPost(data: any): Promise<{ success: boolean; postId: string; destinationCount: number }> {
    const res = await fetch(`${API_BASE}/publishing/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return checked(res);
  },
  async getPosts(): Promise<PostsResponse> {
    const res = await fetch(`${API_BASE}/publishing/posts`);
    return checked(res);
  },
  async getQueue(): Promise<QueueResponse> {
    const res = await fetch(`${API_BASE}/publishing/queue`);
    return checked(res);
  },
  async retryDestination(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/retry`, { method: 'POST' });
    return checked(res);
  },
  async reconcileDestination(id: string): Promise<{ success: boolean; message?: string }> {
    return checked(await fetch(API_BASE + '/publishing/destinations/' + encodeURIComponent(id) + '/reconcile', { method: 'POST' }));
  },
  async cancelDestination(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/cancel`, { method: 'POST' });
    return checked(res);
  },
  async confirmAssistedPublish(id: string, data: any): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/confirm-assisted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return checked(res);
  },

  // Branding
  async getBrandKits(): Promise<{ kits: any[] }> {
    const res = await fetch(`${API_BASE}/branding/kits`);
    return checked(res);
  },
  async updateBrandKit(accountId: string, brandKit: BrandKit): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/branding/kits/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandKit }),
    });
    return checked(res);
  },
  async renderPreview(videoId: string, brandKit: BrandKit, presetName?: string): Promise<{
    success: boolean;
    renderedPath: string;
    previewUrl: string;
    downloadUrl: string;
    variantId?: string;
    sha256?: string;
    metadata?: any;
  }> {
    const res = await fetch(`${API_BASE}/branding/render-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, brandKit, presetName }),
    });
    return checked(res);
  },

  // Inbox
  async getComments(params: Record<string, string>): Promise<CommentsResponse> {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/inbox/comments?${q}`);
    return checked(res);
  },
  async replyComment(id: string, text: string): Promise<{ success: boolean; replyId?: string; error?: string; nativeUrl?: string }> {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return checked(res);
  },
  async reactComment(id: string, reaction = 'like'): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    });
    return checked(res);
  },
  async updateCommentStatus(id: string, status: string, awaitingReply?: boolean): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, awaitingReply }),
    });
    return checked(res);
  },

  async syncInbox(accountId?: string): Promise<{ success: boolean; result?: any; message?: string }> {
    const res = await fetch(`${API_BASE}/inbox/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    return res.json();
  },

  // Activity
  async getActivity(limit = 50): Promise<ActivityResponse> {
    const res = await fetch(`${API_BASE}/activity?limit=${limit}`);
    return checked(res);
  },

  // Analytics
  async getAnalyticsOverview(filter?: { platform?: string; accountId?: string; categoryId?: string }): Promise<AnalyticsOverviewResponse> {
    const q = filter ? new URLSearchParams(Object.entries(filter).filter(([_, v]) => Boolean(v)) as [string, string][]).toString() : '';
    const res = await fetch(`${API_BASE}/analytics/overview${q ? `?${q}` : ''}`);
    return checked(res);
  },
  async getVideoPerformance(filter?: { platform?: string; accountId?: string; categoryId?: string }): Promise<{ videos: VideoPerformanceItem[] }> {
    const q = filter ? new URLSearchParams(Object.entries(filter).filter(([_, v]) => Boolean(v)) as [string, string][]).toString() : '';
    const res = await fetch(`${API_BASE}/analytics/videos${q ? `?${q}` : ''}`);
    return checked(res);
  },
  async getVideoHistory(destinationId: string): Promise<{ history: any[] }> {
    const res = await fetch(`${API_BASE}/analytics/videos/${destinationId}/history`);
    return checked(res);
  },
  async syncAnalytics(accountId?: string): Promise<{ success: boolean; result?: any; message?: string }> {
    const res = await fetch(`${API_BASE}/analytics/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    return res.json();
  },
  async recordObservation(payload: {
    destinationId: string;
    viewCount?: number | null;
    likeCount?: number | null;
    commentCount?: number | null;
    shareCount?: number | null;
    source?: string;
    notes?: string;
  }): Promise<{ success: boolean; snapshot: any }> {
    const res = await fetch(`${API_BASE}/analytics/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return checked(res);
  },

  // Pipeline
  async getPipelineStatus(
    params?: Record<string, string | number | undefined | null>,
    signal?: AbortSignal
  ): Promise<PipelineStatusResponse> {
    const clean = params
      ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))
      : {};
    const q = new URLSearchParams(clean).toString();
    const res = await fetch(`${API_BASE}/pipeline/status${q ? `?${q}` : ''}`, { signal });
    return checked(res);
  },
  async getPipelineJobs(
    params?: Record<string, string | number | undefined | null>,
    signal?: AbortSignal
  ): Promise<PipelineJobsPageResponse> {
    const clean = params
      ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))
      : {};
    const q = new URLSearchParams(clean).toString();
    const res = await fetch(`${API_BASE}/pipeline/jobs${q ? `?${q}` : ''}`, { signal });
    return checked(res);
  },
  async importPipelineJob(jobId: string, title?: string, categoryId?: string): Promise<{ success: boolean; videoId: string; alreadyExisted?: boolean; message?: string }> {
    const res = await fetch(`${API_BASE}/pipeline/import-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, title, categoryId }),
    });
    return checked(res);
  },
  async syncPipeline(
    params?: Record<string, string | number | undefined | null>,
    signal?: AbortSignal
  ): Promise<PipelineJobsPageResponse & { success: boolean }> {
    const res = await fetch(`${API_BASE}/pipeline/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
      signal,
    });
    return checked(res);
  },
  async importPipelineFile(filePath: string, title?: string, categoryId?: string): Promise<{ success: boolean; videoId: string; alreadyExisted?: boolean; message?: string }> {
    const res = await fetch(`${API_BASE}/pipeline/import-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, title, categoryId }),
    });
    return checked(res);
  },
  async updateWatchDir(path: string): Promise<{ success: boolean; watchDir: string }> {
    const res = await fetch(`${API_BASE}/pipeline/watch-dir`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return checked(res);
  },
  async getBrandedVariants(videoId: string): Promise<{ variants: any[] }> {
    const res = await fetch(`${API_BASE}/branding/variants/${videoId}`);
    return checked(res);
  },
  async deleteBrandedVariant(variantId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/branding/variants/${variantId}`, { method: 'DELETE' });
    return checked(res);
  },

  // Browser Bridge
  async launchBrowserSession(accountId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/bridge/launch-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    return checked(res);
  },
};
