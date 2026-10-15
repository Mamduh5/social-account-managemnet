import {
  AccountsResponse,
  CategoriesResponse,
  VideosResponse,
  PostsResponse,
  QueueResponse,
  CommentsResponse,
  ActivityResponse,
  PipelineStatusResponse,
  BrandKit,
} from '../types';

const API_BASE = '/api';

export const api = {
  // Accounts & Categories
  async getAccounts(): Promise<AccountsResponse> {
    const res = await fetch(`${API_BASE}/accounts`);
    return res.json();
  },
  async getCategories(): Promise<CategoriesResponse> {
    const res = await fetch(`${API_BASE}/accounts/categories/all`);
    return res.json();
  },
  async createAccount(data: any): Promise<{ success: boolean; id: string }> {
    const res = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async updateAccount(id: string, data: any): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async reconnectAccount(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/accounts/${id}/reconnect`, { method: 'POST' });
    return res.json();
  },
  async testAccountHealth(id: string): Promise<{ success: boolean; health: any }> {
    const res = await fetch(`${API_BASE}/accounts/${id}/test-health`, { method: 'POST' });
    return res.json();
  },
  async createCategory(data: any): Promise<{ success: boolean; id: string; slug?: string }> {
    const res = await fetch(`${API_BASE}/accounts/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Publishing
  async getVideos(categoryId?: string): Promise<VideosResponse> {
    const url = categoryId ? `${API_BASE}/publishing/videos?categoryId=${categoryId}` : `${API_BASE}/publishing/videos`;
    const res = await fetch(url);
    return res.json();
  },
  async uploadVideo(formData: FormData): Promise<{ success: boolean; videoId: string; title: string }> {
    const res = await fetch(`${API_BASE}/publishing/upload`, {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },
  async createPost(data: any): Promise<{ success: boolean; postId: string; destinationCount: number }> {
    const res = await fetch(`${API_BASE}/publishing/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async getPosts(): Promise<PostsResponse> {
    const res = await fetch(`${API_BASE}/publishing/posts`);
    return res.json();
  },
  async getQueue(): Promise<QueueResponse> {
    const res = await fetch(`${API_BASE}/publishing/queue`);
    return res.json();
  },
  async retryDestination(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/retry`, { method: 'POST' });
    return res.json();
  },
  async cancelDestination(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/cancel`, { method: 'POST' });
    return res.json();
  },
  async confirmAssistedPublish(id: string, data: any): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/confirm-assisted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Branding
  async getBrandKits(): Promise<{ kits: any[] }> {
    const res = await fetch(`${API_BASE}/branding/kits`);
    return res.json();
  },
  async updateBrandKit(accountId: string, brandKit: BrandKit): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/branding/kits/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandKit }),
    });
    return res.json();
  },
  async renderPreview(videoId: string, brandKit: BrandKit): Promise<{ success: boolean; renderedPath: string; previewUrl: string }> {
    const res = await fetch(`${API_BASE}/branding/render-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, brandKit }),
    });
    return res.json();
  },

  // Inbox
  async getComments(params: Record<string, string>): Promise<CommentsResponse> {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/inbox/comments?${q}`);
    return res.json();
  },
  async replyComment(id: string, text: string): Promise<{ success: boolean; replyId?: string; error?: string; nativeUrl?: string }> {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return res.json();
  },
  async reactComment(id: string, reaction = 'like'): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    });
    return res.json();
  },
  async updateCommentStatus(id: string, status: string, awaitingReply?: boolean): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, awaitingReply }),
    });
    return res.json();
  },

  // Activity
  async getActivity(limit = 50): Promise<ActivityResponse> {
    const res = await fetch(`${API_BASE}/activity?limit=${limit}`);
    return res.json();
  },

  // Analytics
  async getAnalyticsOverview(): Promise<any> {
    const res = await fetch(`${API_BASE}/analytics/overview`);
    return res.json();
  },

  // Pipeline
  async getPipelineStatus(): Promise<PipelineStatusResponse> {
    const res = await fetch(`${API_BASE}/pipeline/status`);
    return res.json();
  },
  async importPipelineFile(filePath: string, title?: string, categoryId?: string): Promise<{ success: boolean; videoId: string }> {
    const res = await fetch(`${API_BASE}/pipeline/import-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, title, categoryId }),
    });
    return res.json();
  },
  async updateWatchDir(path: string): Promise<{ success: boolean; watchDir: string }> {
    const res = await fetch(`${API_BASE}/pipeline/watch-dir`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return res.json();
  },

  // Browser Bridge
  async launchBrowserSession(accountId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/bridge/launch-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    return res.json();
  },
};
