const API_BASE = '/api';

export const api = {
  // Accounts & Categories
  async getAccounts() {
    const res = await fetch(`${API_BASE}/accounts`);
    return res.json();
  },
  async getCategories() {
    const res = await fetch(`${API_BASE}/accounts/categories/all`);
    return res.json();
  },
  async createAccount(data: any) {
    const res = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async updateAccount(id: string, data: any) {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async reconnectAccount(id: string) {
    const res = await fetch(`${API_BASE}/accounts/${id}/reconnect`, { method: 'POST' });
    return res.json();
  },
  async testAccountHealth(id: string) {
    const res = await fetch(`${API_BASE}/accounts/${id}/test-health`, { method: 'POST' });
    return res.json();
  },
  async createCategory(data: any) {
    const res = await fetch(`${API_BASE}/accounts/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Publishing
  async getVideos(categoryId?: string) {
    const url = categoryId ? `${API_BASE}/publishing/videos?categoryId=${categoryId}` : `${API_BASE}/publishing/videos`;
    const res = await fetch(url);
    return res.json();
  },
  async uploadVideo(formData: FormData) {
    const res = await fetch(`${API_BASE}/publishing/upload`, {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },
  async createPost(data: any) {
    const res = await fetch(`${API_BASE}/publishing/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async getPosts() {
    const res = await fetch(`${API_BASE}/publishing/posts`);
    return res.json();
  },
  async getQueue() {
    const res = await fetch(`${API_BASE}/publishing/queue`);
    return res.json();
  },
  async retryDestination(id: string) {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/retry`, { method: 'POST' });
    return res.json();
  },
  async cancelDestination(id: string) {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/cancel`, { method: 'POST' });
    return res.json();
  },
  async confirmAssistedPublish(id: string, data: any) {
    const res = await fetch(`${API_BASE}/publishing/destinations/${id}/confirm-assisted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Branding
  async getBrandKits() {
    const res = await fetch(`${API_BASE}/branding/kits`);
    return res.json();
  },
  async updateBrandKit(accountId: string, brandKit: any) {
    const res = await fetch(`${API_BASE}/branding/kits/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandKit }),
    });
    return res.json();
  },
  async renderPreview(videoId: string, brandKit: any) {
    const res = await fetch(`${API_BASE}/branding/render-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, brandKit }),
    });
    return res.json();
  },

  // Inbox
  async getComments(params: Record<string, string>) {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/inbox/comments?${q}`);
    return res.json();
  },
  async replyComment(id: string, text: string) {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return res.json();
  },
  async reactComment(id: string, reaction = 'like') {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    });
    return res.json();
  },
  async updateCommentStatus(id: string, status: string, awaitingReply?: boolean) {
    const res = await fetch(`${API_BASE}/inbox/comments/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, awaitingReply }),
    });
    return res.json();
  },

  // Activity
  async getActivity(limit = 50) {
    const res = await fetch(`${API_BASE}/activity?limit=${limit}`);
    return res.json();
  },

  // Analytics
  async getAnalyticsOverview() {
    const res = await fetch(`${API_BASE}/analytics/overview`);
    return res.json();
  },

  // Pipeline
  async getPipelineStatus() {
    const res = await fetch(`${API_BASE}/pipeline/status`);
    return res.json();
  },
  async importPipelineFile(filePath: string, title?: string, categoryId?: string) {
    const res = await fetch(`${API_BASE}/pipeline/import-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, title, categoryId }),
    });
    return res.json();
  },
  async updateWatchDir(path: string) {
    const res = await fetch(`${API_BASE}/pipeline/watch-dir`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return res.json();
  },

  // Browser Bridge
  async launchBrowserSession(accountId: string) {
    const res = await fetch(`${API_BASE}/bridge/launch-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    return res.json();
  },
};
