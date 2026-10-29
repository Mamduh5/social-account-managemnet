import fs from 'fs';
import path from 'path';
import { randomUUID, createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'stream/promises';
import { db, uploadsDir } from '../db/database.js';
import { ffmpegService } from './ffmpeg.service.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';
import { fingerprintPipelineSource, getOwnerClassification, isPipelineHidden, isWatchFileHidden } from './test-data-metadata.service.js';

export interface DiscoveredPipelineVideo {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  modifiedAt: string;
  isImported: boolean;
  importedVideoId?: string;
  fileId?: string | null;
  sourceFingerprint?: string | null;
  hidden?: boolean;
  visibilitySupported?: boolean;
  visibilityReason?: string;
}

export interface DiscoveredPipelineJob {
  jobId: string;
  hidden?: boolean;
  sourceFingerprint?: string;
  ownerClassification?: 'owner_marked_test' | 'owner_marked_keep' | 'unknown';
  title: string;
  topic?: string;
  status: string;
  displayStatus: string;
  aspectRatio: string | null;
  durationSeconds: number | null;
  videoUrl: string | null;
  thumbnailUrl?: string | null;
  videoObjectKey?: string;
  storageState?: string;
  storageLabel?: string;
  storageDetail?: string;
  isImported: boolean;
  importedVideoId?: string;
  importEligible: boolean;
  ineligibleReason?: string;
  createdAt: string | null;
  updatedAt: string | null;
  incompleteMetadata: string[];
  tags?: string[];
  provider?: string;
  workflow?: string;
}

export type PipelineDiscoveryErrorKind =
  | 'unsupported_endpoint'
  | 'auth_failure'
  | 'timeout'
  | 'offline'
  | 'malformed_response'
  | 'invalid_cursor'
  | 'incomplete_history'
  | 'upstream_error';

export interface PipelineHealthStatus {
  reachable: boolean;
  status: 'connected' | 'offline' | 'error';
  apiUrl: string;
  totalProjects: number;
  completedJobsCount: number;
  lastChecked: string;
  error?: string;
  errorKind?: PipelineDiscoveryErrorKind;
}

export interface PipelineJobsQuery {
  q?: string;
  status?: string;
  aspectRatio?: string;
  importState?: 'all' | 'imported' | 'unimported';
  sort?: 'recent' | 'created' | 'oldest' | 'name';
  limit?: number;
  cursor?: string | null;
  includeHidden?: boolean;
}

export interface PipelineJobsPageResult {
  jobs: DiscoveredPipelineJob[];
  count: number;
  totalMatched?: number;
  page: {
    limit: number;
    returned: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  sourceContract: 'library_v1' | 'legacy_jobs' | 'offline' | 'error';
  historyComplete: boolean;
  incompleteReason?: string;
  error?: string;
  errorKind?: PipelineDiscoveryErrorKind;
  health: PipelineHealthStatus;
}

const DEFAULT_PAGE_LIMIT = 12;
const MAX_PAGE_LIMIT = 50;
const MAX_UPSTREAM_SCAN_PAGES = 10;

const SUPPORTED_LIBRARY_VERSIONS = new Set(['scene-video-library.v1', 'library_v1']);
const UPSTREAM_ALLOWED_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'failed',
  'awaiting_external_generation',
  'awaiting_review',
  'awaiting_human_decision',
  'conformance_attention_required',
]);
const UPSTREAM_ALLOWED_SORTS = new Set(['recent', 'created', 'name']);

export class PipelineService {
  private inFlightJobImports = new Map<string, Promise<{ videoId: string; alreadyExisted: boolean }>>();
  private inFlightFileImports = new Map<string, Promise<{ videoId: string; alreadyExisted: boolean }>>();
  private activeTempFiles = new Set<string>();

  public discoveryTimeoutMs = Number(process.env.SCC_PIPELINE_DISCOVERY_TIMEOUT_MS) || 4500;
  public downloadTimeoutMs = Number(process.env.SCC_PIPELINE_DOWNLOAD_TIMEOUT_MS) || 60_000;
  public maxImportBytes = Number(process.env.SCC_MAX_IMPORT_BYTES) || 500 * 1024 * 1024;

  constructor(options?: {
    discoveryTimeoutMs?: number;
    downloadTimeoutMs?: number;
    maxImportBytes?: number;
  }) {
    if (typeof options?.discoveryTimeoutMs === 'number' && options.discoveryTimeoutMs > 0) {
      this.discoveryTimeoutMs = options.discoveryTimeoutMs;
    }
    if (typeof options?.downloadTimeoutMs === 'number' && options.downloadTimeoutMs > 0) {
      this.downloadTimeoutMs = options.downloadTimeoutMs;
    }
    if (typeof options?.maxImportBytes === 'number' && options.maxImportBytes > 0) {
      this.maxImportBytes = options.maxImportBytes;
    }
  }

  getPipelineApiUrl(): string {
    const setting = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('pipeline_api_url') as { value: string } | undefined;
    return setting?.value || process.env.PIPELINE_API_URL || 'http://localhost:8080';
  }

  setPipelineApiUrl(newUrl: string): void {
    const cleanUrl = newUrl.replace(/\/+$/, '');
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('pipeline_api_url', cleanUrl);
  }

  getWatchDirectory(): string {
    const setting = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('pipeline_watch_dir') as { value: string } | undefined;
    return setting?.value || 'D:\\Mamduh\\Personal\\ai-video-pipeline\\.tmp-live-validation';
  }

  setWatchDirectory(newPath: string): void {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('pipeline_watch_dir', newPath);
  }

  private canonicalizePath(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }

  private verifyStoredMaster(row: { file_path: string; file_size: number; metadata_json: string }): boolean {
    let fd: number | undefined;
    try {
      const metadata = JSON.parse(row.metadata_json || '{}');
      if (!/^[a-f0-9]{64}$/i.test(metadata.sha256 || '') || !Number.isSafeInteger(Number(row.file_size)) || Number(row.file_size) <= 0) return false;
      fd = fs.openSync(row.file_path, 'r');
      const before = fs.fstatSync(fd);
      if (!before.isFile() || before.size !== Number(row.file_size)) return false;
      const hash = createHash('sha256');
      const buffer = Buffer.allocUnsafe(256 * 1024);
      let n: number;
      while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, n));
      const after = fs.fstatSync(fd);
      const pathAfter = fs.statSync(row.file_path);
      return before.size === after.size && before.mtimeMs === after.mtimeMs && before.dev === pathAfter.dev && before.ino === pathAfter.ino && hash.digest('hex') === metadata.sha256.toLowerCase();
    } catch { return false; } finally { if (fd !== undefined) fs.closeSync(fd); }
  }

  private getImportedVideosByPipelineJobIds(jobIds: string[]): Map<string, { id: string }> {
    const unique = Array.from(new Set(jobIds.map((id) => String(id || '').trim()).filter(Boolean)));
    const result = new Map<string, { id: string }>();
    if (unique.length === 0) return result;

    for (let i = 0; i < unique.length; i += 400) {
      const chunk = unique.slice(i, i + 400);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT id, pipeline_job_id FROM videos WHERE pipeline_job_id IN (${placeholders})`)
        .all(...chunk) as Array<{ id: string; pipeline_job_id: string }>;
      for (const row of rows) {
        if (row.pipeline_job_id && !result.has(row.pipeline_job_id)) {
          result.set(row.pipeline_job_id, { id: row.id });
        }
      }
    }
    return result;
  }

  private normalizeRawProjectBatch(rawProjects: any[], apiUrl: string): DiscoveredPipelineJob[] {
    const jobIds = rawProjects.map((p) => String(p?.id || p?.jobId || '').trim()).filter(Boolean);
    const importedMap = this.getImportedVideosByPipelineJobIds(jobIds);
    return rawProjects.map((p) => {
      const jobId = String(p?.id || p?.jobId || '').trim();
      return this.normalizeRawProject(p, apiUrl, importedMap.get(jobId) || null);
    });
  }

  private normalizeRawProject(p: any, apiUrl: string, existing?: { id: string } | null): DiscoveredPipelineJob {
    const jobId = String(p?.id || p?.jobId || '').trim();
    const sourceFingerprint = fingerprintPipelineSource(apiUrl);
    const resolvedExisting = existing !== undefined ? existing : (jobId ? publishingRepo.getVideoByPipelineJobId(jobId) : undefined);
    const rawTitle = typeof p?.title === 'string' ? p.title.trim() : '';
    const title = rawTitle || (jobId ? `Untitled Project (${jobId.slice(0, 8)})` : 'Untitled Project');
    const rawAspect = typeof p?.aspect_ratio === 'string' && p.aspect_ratio.trim() ? p.aspect_ratio.trim() : null;
    const rawDuration =
      typeof p?.duration_seconds === 'number' && Number.isFinite(p.duration_seconds) && p.duration_seconds > 0
        ? p.duration_seconds
        : null;
    const rawCreated = typeof p?.created_at === 'string' && p.created_at.trim() ? p.created_at.trim() : null;
    const rawUpdated = typeof p?.updated_at === 'string' && p.updated_at.trim() ? p.updated_at.trim() : null;

    const rawVideoUrl = typeof p?.video_url === 'string' && p.video_url.trim() ? p.video_url.trim() : null;
    const fullVideoUrl = rawVideoUrl
      ? rawVideoUrl.startsWith('http')
        ? rawVideoUrl
        : `${apiUrl}${rawVideoUrl.startsWith('/') ? '' : '/'}${rawVideoUrl}`
      : null;

    const rawThumbUrl = typeof p?.thumbnail_url === 'string' && p.thumbnail_url.trim() ? p.thumbnail_url.trim() : null;
    const fullThumbUrl = rawThumbUrl
      ? rawThumbUrl.startsWith('http')
        ? rawThumbUrl
        : `${apiUrl}${rawThumbUrl.startsWith('/') ? '' : '/'}${rawThumbUrl}`
      : null;

    const status = String(p?.status || '').trim().toLowerCase() || (p?.display_status ? String(p.display_status).trim().toLowerCase() : 'unknown');
    const displayStatus = typeof p?.display_status === 'string' && p.display_status.trim() ? p.display_status.trim() : (p?.status || 'Unknown');
    const isCompleted = status === 'completed' || displayStatus.toLowerCase().includes('completed');

    const storageState = p?.storage?.state ? String(p.storage.state) : undefined;
    const storageLabel = p?.storage?.label ? String(p.storage.label) : undefined;
    const storageDetail = p?.storage?.detail ? String(p.storage.detail) : undefined;

    const incompleteMetadata: string[] = [];
    if (!rawTitle) incompleteMetadata.push('title');
    if (!rawAspect) incompleteMetadata.push('aspect_ratio');
    if (rawDuration === null) incompleteMetadata.push('duration');
    if (!rawCreated && !rawUpdated) incompleteMetadata.push('timestamps');
    if (!fullVideoUrl) incompleteMetadata.push('video_url');

    let importEligible = Boolean(isCompleted && fullVideoUrl);
    let ineligibleReason: string | undefined;
    if (resolvedExisting) {
      importEligible = true;
    } else if (!isCompleted) {
      importEligible = false;
      ineligibleReason = `Project status is "${displayStatus}" (only completed videos can be imported)`;
    } else if (!fullVideoUrl) {
      importEligible = false;
      if (storageState === 'archived' || (storageLabel && storageLabel.toLowerCase().includes('archived'))) {
        ineligibleReason = `${storageLabel || 'Archived to Google Drive'} — local video file is evicted; restore in AI Video Pipeline to import`;
      } else {
        ineligibleReason = 'Final rendered video file is unavailable from upstream pipeline';
      }
    }

    return {
      jobId,
      hidden: jobId ? isPipelineHidden(db,jobId,sourceFingerprint) : false,
      sourceFingerprint,
      ownerClassification: jobId ? getOwnerClassification(db,'pipeline_job',jobId,sourceFingerprint) : 'unknown',
      title,
      topic: typeof p?.topic === 'string' && p.topic.trim() ? p.topic.trim() : undefined,
      status,
      displayStatus,
      aspectRatio: rawAspect,
      durationSeconds: rawDuration,
      videoUrl: fullVideoUrl,
      thumbnailUrl: fullThumbUrl,
      videoObjectKey: p?.video_object_key || undefined,
      storageState,
      storageLabel,
      storageDetail,
      isImported: !!resolvedExisting,
      importedVideoId: resolvedExisting?.id,
      importEligible,
      ineligibleReason,
      createdAt: rawCreated,
      updatedAt: rawUpdated,
      incompleteMetadata,
      tags: Array.isArray(p?.tags) ? p.tags.map((t: any) => String(t)) : undefined,
      provider: typeof p?.provider === 'string' ? p.provider : undefined,
      workflow: typeof p?.workflow === 'string' ? p.workflow : undefined,
    };
  }

  private validateAndExtractLibraryResponse(data: any): {
    valid: true;
    projects: any[];
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  } | {
    valid: false;
    error: string;
  } {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, error: 'Upstream /scene-video-library returned a malformed non-object payload.' };
    }

    const version = data.api_version ?? data.contract_version;
    if (typeof version !== 'string' || !version.trim()) {
      return { valid: false, error: 'Upstream /scene-video-library payload is missing required api_version.' };
    }
    if (!SUPPORTED_LIBRARY_VERSIONS.has(version)) {
      return { valid: false, error: `Unsupported upstream /scene-video-library response version: "${version}".` };
    }

    let rawList: any[];
    if (version === 'scene-video-library.v1') {
      if (!Array.isArray(data.projects)) {
        return { valid: false, error: 'Upstream /scene-video-library (scene-video-library.v1) payload is missing a valid "projects" array.' };
      }
      rawList = data.projects;
    } else {
      if (Array.isArray(data.projects)) {
        rawList = data.projects;
      } else if (Array.isArray(data.items)) {
        rawList = data.items;
      } else {
        return { valid: false, error: 'Upstream /scene-video-library payload is missing a valid projects/items collection.' };
      }
    }

    for (const item of rawList) {
      if (!item || typeof item !== 'object') {
        return { valid: false, error: 'Upstream /scene-video-library contained a malformed non-object project entry.' };
      }
      const id = String(item.id || item.jobId || '').trim();
      if (!id) {
        return { valid: false, error: 'Upstream /scene-video-library contained a project entry without an id.' };
      }
    }

    if (!data.page || typeof data.page !== 'object' || typeof data.page.has_more !== 'boolean') {
      return { valid: false, error: 'Upstream /scene-video-library payload is missing valid pagination metadata (page.has_more).' };
    }

    const hasMore = data.page.has_more;
    const rawNextCursor = data.page.next_cursor;
    if (hasMore && (typeof rawNextCursor !== 'string' || !rawNextCursor.trim())) {
      return { valid: false, error: 'Upstream /scene-video-library reported has_more=true without a valid next_cursor token.' };
    }
    if (!hasMore && rawNextCursor !== undefined && rawNextCursor !== null && typeof rawNextCursor !== 'string') {
      return { valid: false, error: 'Upstream /scene-video-library returned a non-string next_cursor.' };
    }

    const pageLimit = typeof data.page.limit === 'number' && data.page.limit > 0 ? data.page.limit : rawList.length || DEFAULT_PAGE_LIMIT;
    return {
      valid: true,
      projects: rawList,
      hasMore,
      nextCursor: hasMore ? String(rawNextCursor).trim() : null,
      limit: pageLimit,
    };
  }

  private matchesFilters(job: DiscoveredPipelineJob, query: PipelineJobsQuery): boolean {
    if (job.hidden && !query.includeHidden) return false;
    const statusFilter = (query.status || 'completed').trim().toLowerCase();
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'completed') {
        const isCompleted =
          (job.status === 'completed' || job.displayStatus.toLowerCase().includes('completed')) &&
          Boolean(job.videoUrl || job.storageState === 'archived' || job.isImported);
        if (!isCompleted) return false;
      } else if (statusFilter === 'eligible') {
        if (!job.importEligible) return false;
      } else if (job.status !== statusFilter && !job.displayStatus.toLowerCase().includes(statusFilter)) {
        return false;
      }
    }

    const q = (query.q || '').trim().toLowerCase();
    if (q) {
      const hay = `${job.title} ${job.topic || ''} ${job.jobId} ${(job.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    const aspect = (query.aspectRatio || 'all').trim();
    if (aspect && aspect !== 'all') {
      if (aspect === 'unknown') {
        if (job.aspectRatio !== null) return false;
      } else if (job.aspectRatio !== aspect) {
        return false;
      }
    }

    const importState = query.importState || 'all';
    if (importState === 'imported' && !job.isImported) return false;
    if (importState === 'unimported' && job.isImported) return false;

    return true;
  }

  private sortJobs(jobs: DiscoveredPipelineJob[], sort: PipelineJobsQuery['sort'] = 'recent'): DiscoveredPipelineJob[] {
    const copy = [...jobs];
    copy.sort((a, b) => {
      if (sort === 'name') {
        const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.jobId.localeCompare(b.jobId);
      }
      if (sort === 'created') {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        if (tb !== ta) return tb - ta;
        return a.jobId.localeCompare(b.jobId);
      }
      if (sort === 'oldest') {
        const ta = a.createdAt || a.updatedAt ? Date.parse(a.createdAt || a.updatedAt!) : Number.MAX_SAFE_INTEGER;
        const tb = b.createdAt || b.updatedAt ? Date.parse(b.createdAt || b.updatedAt!) : Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        return a.jobId.localeCompare(b.jobId);
      }
      // Default 'recent': updated_at desc, fallback created_at desc
      const ta = a.updatedAt || a.createdAt ? Date.parse(a.updatedAt || a.createdAt!) : 0;
      const tb = b.updatedAt || b.createdAt ? Date.parse(b.updatedAt || b.createdAt!) : 0;
      if (tb !== ta) return tb - ta;
      return a.jobId.localeCompare(b.jobId);
    });
    return copy;
  }

  private buildErrorPageResult(params: {
    limit: number;
    apiUrl: string;
    now: string;
    errorKind: PipelineDiscoveryErrorKind;
    errorMessage: string;
    reachable?: boolean;
    sourceContract?: PipelineJobsPageResult['sourceContract'];
  }): PipelineJobsPageResult {
    const reachable = params.reachable ?? false;
    const status: PipelineHealthStatus['status'] = reachable ? 'error' : 'offline';
    return {
      jobs: [],
      count: 0,
      page: { limit: params.limit, returned: 0, hasMore: false, nextCursor: null },
      sourceContract: params.sourceContract || (reachable ? 'error' : 'offline'),
      historyComplete: false,
      incompleteReason: params.errorMessage,
      error: params.errorMessage,
      errorKind: params.errorKind,
      health: {
        reachable,
        status,
        apiUrl: params.apiUrl,
        totalProjects: 0,
        completedJobsCount: 0,
        lastChecked: params.now,
        error: params.errorMessage,
        errorKind: params.errorKind,
      },
    };
  }

  private classifyNetworkError(err: any): { errorKind: 'timeout' | 'offline'; message: string } {
    if (
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError' ||
      /timed?\s*out|aborted/i.test(String(err?.message || ''))
    ) {
      return { errorKind: 'timeout', message: 'Connection to AI Video Pipeline timed out.' };
    }
    return {
      errorKind: 'offline',
      message: err?.message || 'Cannot reach AI Video Pipeline.',
    };
  }

  private async fetchDiscovery(url: string): Promise<Response> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(url, { signal: controller.signal });
          const chunks: Uint8Array[] = [];
          let total = 0;
          const reader = response.body?.getReader();
          if (reader) {
            try {
              while (true) {
                const part = await reader.read();
                if (part.done) break;
                total += part.value.byteLength;
                if (total > 16 * 1024 * 1024) { controller.abort(); throw new Error('Pipeline discovery response exceeds size limit'); }
                chunks.push(part.value);
              }
            } finally { reader.releaseLock(); }
          }
          const body = Buffer.concat(chunks, total);
          return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Pipeline discovery timed out')); }, this.discoveryTimeoutMs); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async checkPipelineHealth(): Promise<PipelineHealthStatus> {
    const apiUrl = this.getPipelineApiUrl();
    const now = new Date().toISOString();

    try {
      const res = await this.fetchDiscovery(`${apiUrl}/scene-video-library?limit=20`);

      if (res.ok) {
        let data: any;
        try {
          data = await res.json();
        } catch {
          return {
            reachable: true,
            status: 'error',
            apiUrl,
            totalProjects: 0,
            completedJobsCount: 0,
            lastChecked: now,
            error: 'Upstream /scene-video-library returned invalid JSON.',
            errorKind: 'malformed_response',
          };
        }
        const validated = this.validateAndExtractLibraryResponse(data);
        if (!validated.valid) {
          return {
            reachable: true,
            status: 'error',
            apiUrl,
            totalProjects: 0,
            completedJobsCount: 0,
            lastChecked: now,
            error: validated.error,
            errorKind: 'malformed_response',
          };
        }
        const normalized = this.normalizeRawProjectBatch(validated.projects, apiUrl);
        return {
          reachable: true,
          status: 'connected',
          apiUrl,
          totalProjects: normalized.length,
          completedJobsCount: normalized.filter((j) => j.importEligible).length,
          lastChecked: now,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          reachable: true,
          status: 'error',
          apiUrl,
          totalProjects: 0,
          completedJobsCount: 0,
          lastChecked: now,
          error: `Authentication failed with AI Video Pipeline (HTTP ${res.status}).`,
          errorKind: 'auth_failure',
        };
      }

      if (res.status !== 404 && res.status !== 405 && res.status !== 501) {
        return {
          reachable: false,
          status: 'offline',
          apiUrl,
          totalProjects: 0,
          completedJobsCount: 0,
          lastChecked: now,
          error: `HTTP error ${res.status}: ${res.statusText}`,
          errorKind: 'upstream_error',
        };
      }
    } catch (err: any) {
      const classified = this.classifyNetworkError(err);
      return {
        reachable: false,
        status: 'offline',
        apiUrl,
        totalProjects: 0,
        completedJobsCount: 0,
        lastChecked: now,
        error: classified.message,
        errorKind: classified.errorKind,
      };
    }

    // Legacy fallback health check when /scene-video-library returns 404/405/501
    try {
      const res = await this.fetchDiscovery(`${apiUrl}/scene-video-jobs`);

      if (!res.ok) {
        return {
          reachable: res.status === 401 || res.status === 403,
          status: res.status === 401 || res.status === 403 ? 'error' : 'offline',
          apiUrl,
          totalProjects: 0,
          completedJobsCount: 0,
          lastChecked: now,
          error: `HTTP error ${res.status}: ${res.statusText}`,
          errorKind: res.status === 401 || res.status === 403 ? 'auth_failure' : 'upstream_error',
        };
      }

      const data = await res.json() as any;
      if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) {
        return {
          reachable: true,
          status: 'error',
          apiUrl,
          totalProjects: 0,
          completedJobsCount: 0,
          lastChecked: now,
          error: 'Upstream /scene-video-jobs returned a malformed payload.',
          errorKind: 'malformed_response',
        };
      }
      const projects = data.projects;
      const totalProjects = typeof data.total === 'number' ? data.total : projects.length;
      const completed = projects.filter((p: any) =>
        p?.video_url && (p?.status === 'completed' || (p?.display_status && String(p.display_status).toLowerCase().includes('completed')))
      );

      return {
        reachable: true,
        status: 'connected',
        apiUrl,
        totalProjects,
        completedJobsCount: completed.length,
        lastChecked: now,
      };
    } catch (err: any) {
      const classified = this.classifyNetworkError(err);
      return {
        reachable: false,
        status: 'offline',
        apiUrl,
        totalProjects: 0,
        completedJobsCount: 0,
        lastChecked: now,
        error: classified.message,
        errorKind: classified.errorKind,
      };
    }
  }

  async queryPipelineJobs(query: PipelineJobsQuery = {}): Promise<PipelineJobsPageResult> {
    const apiUrl = this.getPipelineApiUrl();
    const now = new Date().toISOString();
    const limit = Math.max(1, Math.min(MAX_PAGE_LIMIT, Number(query.limit) || DEFAULT_PAGE_LIMIT));
    const statusFilter = (query.status || 'completed').trim().toLowerCase();
    const sort = query.sort || 'recent';
    if (sort === 'oldest') return this.buildErrorPageResult({ limit, apiUrl, now, errorKind: 'upstream_error', errorMessage: 'Global oldest-first sorting is not supported by the Pipeline API.', reachable: true });
    const q = (query.q || '').trim().slice(0, 200);
    const rawCursor = query.cursor !== undefined && query.cursor !== null && String(query.cursor).trim() !== ''
      ? String(query.cursor).trim()
      : null;

    // Validate offset: cursor syntax if an offset cursor was passed
    if (rawCursor && rawCursor.startsWith('offset:')) {
      const rawOffset = rawCursor.slice(7);
      if (!/^\d+$/.test(rawOffset)) {
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: 'invalid_cursor',
          errorMessage: 'Invalid pagination cursor offset. Please refresh the pipeline list.',
          reachable: true,
          sourceContract: 'error',
        });
      }
    }

    const buildLibraryUrl = (pageLimit: number, cursorToken: string | null) => {
      const params = new URLSearchParams();
      params.set('limit', String(Math.max(1, Math.min(100, pageLimit))));
      if (q) {
        params.set('q', q);
      }
      if (statusFilter === 'eligible') {
        params.set('status', 'completed');
      } else if (statusFilter && statusFilter !== 'all' && UPSTREAM_ALLOWED_STATUSES.has(statusFilter)) {
        params.set('status', statusFilter);
      }
      const upstreamSort = sort;
      if (UPSTREAM_ALLOWED_SORTS.has(upstreamSort)) {
        params.set('sort', upstreamSort);
      }
      if (cursorToken) {
        params.set('cursor', cursorToken);
      }
      return `${apiUrl}/scene-video-library?${params.toString()}`;
    };

    let shouldFallbackToLegacyJobs = false;

    // 1. Query upstream cursor-capable /scene-video-library endpoint
    if (!rawCursor || (!rawCursor.startsWith('offset:') && !rawCursor.startsWith('legacy:'))) {
      let res: Response;
      try {
        res = await this.fetchDiscovery(buildLibraryUrl(limit, rawCursor));
      } catch (err: any) {
        const classified = this.classifyNetworkError(err);
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: classified.errorKind,
          errorMessage: classified.message,
          reachable: false,
          sourceContract: 'offline',
        });
      }

      if (res.ok) {
        let data: any;
        try {
          data = await res.json();
        } catch {
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: 'malformed_response',
            errorMessage: 'Upstream /scene-video-library returned invalid JSON.',
            reachable: true,
            sourceContract: 'library_v1',
          });
        }

        const validated = this.validateAndExtractLibraryResponse(data);
        if (!validated.valid) {
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: 'malformed_response',
            errorMessage: validated.error,
            reachable: true,
            sourceContract: 'library_v1',
          });
        }

        if (rawCursor && validated.hasMore && validated.nextCursor === rawCursor) return this.buildErrorPageResult({ limit, apiUrl, now, errorKind: 'malformed_response', errorMessage: 'Upstream returned a non-advancing pagination cursor.', reachable: true, sourceContract: 'library_v1' });

        const normalized = this.normalizeRawProjectBatch(validated.projects, apiUrl).filter(j => this.matchesFilters(j, { ...query, q: undefined }));
        return {
          jobs: normalized,
          count: normalized.length,
          page: {
            limit,
            returned: normalized.length,
            hasMore: validated.hasMore,
            nextCursor: validated.nextCursor,
          },
          sourceContract: 'library_v1',
          historyComplete: true,
          health: {
            reachable: true,
            status: 'connected',
            apiUrl,
            totalProjects: normalized.length,
            completedJobsCount: normalized.filter((j) => j.importEligible).length,
            lastChecked: now,
          },
        };
      }

      // Handle non-200 responses from /scene-video-library explicitly
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        if (rawCursor) {
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: 'invalid_cursor',
            errorMessage: 'Cursor pagination is not supported by the current upstream endpoint. Refresh to reload.',
            reachable: true,
            sourceContract: 'error',
          });
        }
        shouldFallbackToLegacyJobs = true;
      } else if (res.status === 401 || res.status === 403) {
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: 'auth_failure',
          errorMessage: `Authentication or authorization failed with AI Video Pipeline (HTTP ${res.status}).`,
          reachable: true,
          sourceContract: 'error',
        });
      } else if (res.status === 400) {
        let errBody: any = {};
        try {
          errBody = await res.json();
        } catch {}
        const isCursorError =
          Boolean(rawCursor) ||
          errBody?.field === 'cursor' ||
          /cursor/i.test(String(errBody?.error || ''));
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: isCursorError ? 'invalid_cursor' : 'upstream_error',
          errorMessage: isCursorError
            ? `Pagination cursor is invalid or expired (${errBody?.error || 'HTTP 400'}). Refresh the pipeline list to start from page 1.`
            : `Upstream rejected library query: ${errBody?.error || 'HTTP 400 Bad Request'}`,
          reachable: true,
          sourceContract: 'library_v1',
        });
      } else {
        let errBody: any = {};
        try {
          errBody = await res.json();
        } catch {}
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: 'upstream_error',
          errorMessage: errBody?.error
            ? `Upstream pipeline error (HTTP ${res.status}): ${errBody.error}`
            : `Upstream pipeline returned HTTP ${res.status}: ${res.statusText}`,
          reachable: false,
          sourceContract: 'offline',
        });
      }
    } else if (!rawCursor.startsWith('legacy:')) {
      // Client-side filter/sort or offset cursor active: scan bounded pages from /scene-video-library
      let scanCursor: string | null = null;
      let pagesScanned = 0;
      let upstreamStillHasMore = false;
      const collectedRaw: any[] = [];
      const seenCursors = new Set<string>();

      while (pagesScanned < MAX_UPSTREAM_SCAN_PAGES) {
        let res: Response;
        try {
          res = await this.fetchDiscovery(buildLibraryUrl(100, scanCursor));
        } catch (err: any) {
          const classified = this.classifyNetworkError(err);
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: classified.errorKind,
            errorMessage: classified.message,
            reachable: false,
            sourceContract: 'offline',
          });
        }

        if (!res.ok) {
          if (pagesScanned === 0 && (res.status === 404 || res.status === 405 || res.status === 501)) {
            shouldFallbackToLegacyJobs = true;
            break;
          }
          if (res.status === 401 || res.status === 403) {
            return this.buildErrorPageResult({
              limit,
              apiUrl,
              now,
              errorKind: 'auth_failure',
              errorMessage: `Authentication or authorization failed with AI Video Pipeline (HTTP ${res.status}).`,
              reachable: true,
              sourceContract: 'error',
            });
          }
          let errBody: any = {};
          try {
            errBody = await res.json();
          } catch {}
          const isCursorErr = Boolean(scanCursor) && res.status === 400;
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: isCursorErr ? 'invalid_cursor' : 'upstream_error',
            errorMessage: errBody?.error
              ? `Upstream pipeline error (HTTP ${res.status}): ${errBody.error}`
              : `Upstream pipeline returned HTTP ${res.status}: ${res.statusText}`,
            reachable: res.status < 500,
            sourceContract: res.status < 500 ? 'library_v1' : 'offline',
          });
        }

        let data: any;
        try {
          data = await res.json();
        } catch {
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: 'malformed_response',
            errorMessage: 'Upstream /scene-video-library returned invalid JSON during scan.',
            reachable: true,
            sourceContract: 'library_v1',
          });
        }

        const validated = this.validateAndExtractLibraryResponse(data);
        if (!validated.valid) {
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: 'malformed_response',
            errorMessage: validated.error,
            reachable: true,
            sourceContract: 'library_v1',
          });
        }

        collectedRaw.push(...validated.projects);
        pagesScanned++;
        if (validated.hasMore && validated.nextCursor) {
          if (seenCursors.has(validated.nextCursor)) {
            return this.buildErrorPageResult({
              limit,
              apiUrl,
              now,
              errorKind: 'malformed_response',
              errorMessage: 'Upstream /scene-video-library returned a repeating pagination cursor.',
              reachable: true,
              sourceContract: 'library_v1',
            });
          }
          seenCursors.add(validated.nextCursor);
          scanCursor = validated.nextCursor;
          upstreamStillHasMore = true;
        } else {
          upstreamStillHasMore = false;
          break;
        }
      }

      if (!shouldFallbackToLegacyJobs) {
        const allNormalized = this.normalizeRawProjectBatch(collectedRaw, apiUrl);
        const filtered = allNormalized.filter((j) => this.matchesFilters(j, { ...query, q: undefined }));
        const sorted = this.sortJobs(filtered, sort);
        let offset = 0;
        if (rawCursor) {
          if (!rawCursor.startsWith('offset:')) {
            return this.buildErrorPageResult({
              limit,
              apiUrl,
              now,
              errorKind: 'invalid_cursor',
              errorMessage: 'Pagination cursor does not match the active client-side filter mode. Refresh to start from page 1.',
              reachable: true,
              sourceContract: 'library_v1',
            });
          }
          offset = parseInt(rawCursor.slice(7), 10);
          if (!Number.isFinite(offset) || offset < 0 || (offset > 0 && offset >= sorted.length)) {
            return this.buildErrorPageResult({
              limit,
              apiUrl,
              now,
              errorKind: 'invalid_cursor',
              errorMessage: 'Pagination cursor is out of range for the current filter results. Refresh to start from page 1.',
              reachable: true,
              sourceContract: 'library_v1',
            });
          }
        }

        const sliced = sorted.slice(offset, offset + limit);
        const hasMore = offset + limit < sorted.length;
        const nextCursor = hasMore ? `offset:${offset + limit}` : null;
        const historyComplete = !upstreamStillHasMore;

        return {
          jobs: sliced,
          count: sliced.length,
          totalMatched: sorted.length,
          page: {
            limit,
            returned: sliced.length,
            hasMore,
            nextCursor,
          },
          sourceContract: 'library_v1',
          historyComplete,
          errorKind: !historyComplete ? 'incomplete_history' : undefined,
          incompleteReason: !historyComplete
            ? `Scanned first ${collectedRaw.length} upstream projects (bounded ${MAX_UPSTREAM_SCAN_PAGES}-page scan limit reached); older matching videos may exist. Use title search to narrow results.`
            : undefined,
          health: {
            reachable: true,
            status: 'connected',
            apiUrl,
            totalProjects: collectedRaw.length,
            completedJobsCount: allNormalized.filter((j) => j.importEligible).length,
            lastChecked: now,
          },
        };
      }
    }

    // 2. Compatibility Fallback: Query /scene-video-jobs ONLY when /scene-video-library returned 404/405/501
    if (sort !== 'recent') return this.buildErrorPageResult({ limit, apiUrl, now, errorKind: 'upstream_error', errorMessage: 'This legacy Pipeline supports browsing only in recent order.', reachable: true, sourceContract: 'legacy_jobs' });
    const legacyCursor = rawCursor?.startsWith('legacy:') ? /^legacy:(\d+):(\d+)$/.exec(rawCursor) : null;
    if (rawCursor?.startsWith('legacy:') && !legacyCursor) return this.buildErrorPageResult({ limit, apiUrl, now, errorKind: 'invalid_cursor', errorMessage: 'Invalid legacy pagination cursor.', reachable: true, sourceContract: 'legacy_jobs' });
    const segmentStart = legacyCursor ? Number(legacyCursor[1]) : 0;
    const seenIds = new Set<string>();
    const allProjects: any[] = [];
    let currentOffset = segmentStart;
    let pagesFetched = 0;
    let upstreamHasMore = false;
    let reportedTotal: number | undefined;

    while (pagesFetched < MAX_UPSTREAM_SCAN_PAGES) {
      let res: Response;
      try {
        const url = `${apiUrl}/scene-video-jobs?limit=100&offset=${currentOffset}`;
        res = await this.fetchDiscovery(url);
      } catch (err: any) {
        const classified = this.classifyNetworkError(err);
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: classified.errorKind,
          errorMessage: classified.message,
          reachable: false,
          sourceContract: 'offline',
        });
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: 'auth_failure',
            errorMessage: `Authentication or authorization failed with AI Video Pipeline (HTTP ${res.status}).`,
            reachable: true,
            sourceContract: 'error',
          });
        }
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: 'upstream_error',
          errorMessage: `HTTP error ${res.status}: ${res.statusText}`,
          reachable: false,
          sourceContract: 'offline',
        });
      }

      let data: any;
      try {
        data = await res.json();
      } catch {
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: 'malformed_response',
          errorMessage: 'Upstream /scene-video-jobs returned invalid JSON.',
          reachable: true,
          sourceContract: 'legacy_jobs',
        });
      }

      if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) {
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: 'malformed_response',
          errorMessage: 'Upstream /scene-video-jobs payload is missing a valid "projects" array.',
          reachable: true,
          sourceContract: 'legacy_jobs',
        });
      }

      const projects = data.projects;
      if (typeof data.total === 'number') {
        reportedTotal = data.total;
      }

      let addedInPage = 0;
      for (const p of projects) {
        if (!p || typeof p !== 'object') {
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: 'malformed_response',
            errorMessage: 'Upstream /scene-video-jobs contained a malformed project entry.',
            reachable: true,
            sourceContract: 'legacy_jobs',
          });
        }
        const id = String(p.id || p.jobId || '').trim();
        if (!id) {
          return this.buildErrorPageResult({
            limit,
            apiUrl,
            now,
            errorKind: 'malformed_response',
            errorMessage: 'Upstream /scene-video-jobs contained a project entry without an id.',
            reachable: true,
            sourceContract: 'legacy_jobs',
          });
        }
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allProjects.push(p);
          addedInPage++;
        }
      }

      pagesFetched++;
      if (data.has_more && (!Number.isSafeInteger(data.next_offset) || data.next_offset <= currentOffset || addedInPage === 0)) return this.buildErrorPageResult({ limit, apiUrl, now, errorKind: 'malformed_response', errorMessage: 'Upstream returned a non-advancing legacy page.', reachable: true, sourceContract: 'legacy_jobs' });
      if (data.has_more && typeof data.next_offset === 'number' && data.next_offset > currentOffset && addedInPage > 0) {
        currentOffset = data.next_offset;
        upstreamHasMore = true;
      } else {
        upstreamHasMore = false;
        break;
      }
    }

    const allNormalized = this.normalizeRawProjectBatch(allProjects, apiUrl);
    const completedEligibleCount = allNormalized.filter((j) => j.importEligible).length;
    const filtered = allNormalized.filter((j) => this.matchesFilters(j, query));
    const sorted = this.sortJobs(filtered, sort);

    let offset = 0;
    if (rawCursor) {
      if (legacyCursor) {
        offset = Number(legacyCursor[2]);
      } else if (rawCursor.startsWith('offset:')) {
        offset = parseInt(rawCursor.slice(7), 10);
      } else if (/^\d+$/.test(rawCursor)) {
        offset = parseInt(rawCursor, 10);
      } else {
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: 'invalid_cursor',
          errorMessage: 'Invalid pagination cursor for legacy jobs endpoint.',
          reachable: true,
          sourceContract: 'legacy_jobs',
        });
      }
      if (!Number.isFinite(offset) || offset < 0 || (offset > 0 && offset >= sorted.length)) {
        return this.buildErrorPageResult({
          limit,
          apiUrl,
          now,
          errorKind: 'invalid_cursor',
          errorMessage: 'Pagination offset is out of range.',
          reachable: true,
          sourceContract: 'legacy_jobs',
        });
      }
    }

    const sliced = sorted.slice(offset, offset + limit);
    const segmentHasMore = offset + limit < sorted.length;
    const hasMore = segmentHasMore || upstreamHasMore;
    const nextCursor = segmentHasMore ? `legacy:${segmentStart}:${offset + limit}` : upstreamHasMore ? `legacy:${currentOffset}:0` : null;
    const historyComplete = segmentStart === 0 && !upstreamHasMore && (reportedTotal === undefined || allProjects.length >= reportedTotal);

    return {
      jobs: sliced,
      count: sliced.length,
      totalMatched: sorted.length,
      page: {
        limit,
        returned: sliced.length,
        hasMore,
        nextCursor,
      },
      sourceContract: 'legacy_jobs',
      historyComplete,
      errorKind: !historyComplete ? 'incomplete_history' : undefined,
      incompleteReason: !historyComplete
        ? upstreamHasMore ? `Searching this segment of ${allProjects.length} projects only; load older to inspect the next segment.` : 'Results cover this segment; earlier segments were queried separately.'
        : undefined,
      health: {
        reachable: true,
        status: 'connected',
        apiUrl,
        totalProjects: reportedTotal ?? allProjects.length,
        completedJobsCount: completedEligibleCount,
        lastChecked: now,
      },
    };
  }

  async getPipelineStatusSummary(query: PipelineJobsQuery = {}): Promise<{
    health: PipelineHealthStatus;
    jobs: DiscoveredPipelineJob[];
    page: PipelineJobsPageResult['page'];
    totalMatched?: number;
    sourceContract: PipelineJobsPageResult['sourceContract'];
    historyComplete: boolean;
    incompleteReason?: string;
    error?: string;
    errorKind?: PipelineDiscoveryErrorKind;
  }> {
    const result = await this.queryPipelineJobs({
      limit: query.limit || DEFAULT_PAGE_LIMIT,
      ...query,
    });
    return {
      health: result.health,
      jobs: result.jobs,
      page: result.page,
      totalMatched: result.totalMatched,
      sourceContract: result.sourceContract,
      historyComplete: result.historyComplete,
      incompleteReason: result.incompleteReason,
      error: result.error,
      errorKind: result.errorKind,
    };
  }

  async discoverPipelineJobs(query: PipelineJobsQuery = {}): Promise<DiscoveredPipelineJob[]> {
    const result = await this.queryPipelineJobs({
      limit: query.limit || MAX_PAGE_LIMIT,
      ...query,
    });
    return result.jobs;
  }

  // Disabled: age and this instance's in-memory set cannot prove file ownership
  // or another process's inactivity. Recovery needs an owner-reviewed design.
  cleanupOrphanedPartFiles(maxAgeMs = 15 * 60 * 1000): {
    scanned: number;
    removed: string[];
    activeSkipped: string[];
  } {
    void maxAgeMs;
    return { scanned: 0, removed: [], activeSkipped: [] };
  }

  async importPipelineJob(params: {
    jobId: string;
    categoryId?: string;
    customTitle?: string;
  }): Promise<{ videoId: string; alreadyExisted: boolean }> {
    const jobId = String(params.jobId || '').trim();
    if (!jobId) {
      throw new Error('jobId is required');
    }

    // 1. Check if already imported in DB with verified file on disk
    const existing = publishingRepo.getVideoByPipelineJobId(jobId);
    if (existing) {
      if (!this.verifyStoredMaster(existing as any)) throw new Error('Existing Pipeline master cannot be verified; owner review is required.');
      return { videoId: existing.id, alreadyExisted: true };
    }

    // 2. Coalesce concurrent in-flight imports for the exact same jobId
    const inFlight = this.inFlightJobImports.get(jobId);
    if (inFlight) {
      const joined = await inFlight;
      return { videoId: joined.videoId, alreadyExisted: true };
    }

    const importPromise = this.performPipelineJobImport({
      jobId,
      categoryId: params.categoryId,
      customTitle: params.customTitle,
    });
    this.inFlightJobImports.set(jobId, importPromise);

    try {
      return await importPromise;
    } finally {
      this.inFlightJobImports.delete(jobId);
    }
  }

  private async performPipelineJobImport(params: {
    jobId: string;
    categoryId?: string;
    customTitle?: string;
  }): Promise<{ videoId: string; alreadyExisted: boolean }> {
    const { jobId, categoryId, customTitle } = params;
    const apiUrl = this.getPipelineApiUrl();

    // Re-check DB before network calls
    const existingBeforeFetch = publishingRepo.getVideoByPipelineJobId(jobId);
    if (existingBeforeFetch) {
      if (!this.verifyStoredMaster(existingBeforeFetch as any)) throw new Error('Existing Pipeline master cannot be verified; owner review is required.');
      return { videoId: existingBeforeFetch.id, alreadyExisted: true };
    }

    // Fetch specific job metadata from pipeline API
    let metaRes: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      metaRes = await fetch(`${apiUrl}/scene-video-jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal });
      clearTimeout(timeout);
    } catch (err: any) {
      throw new Error(
        `Cannot reach AI Video Pipeline at ${apiUrl} to fetch job "${jobId}": ${err.name === 'AbortError' ? 'Connection timed out' : err.message}`
      );
    }

    if (!metaRes.ok) {
      throw new Error(`Failed to fetch metadata for job "${jobId}" (HTTP ${metaRes.status}: ${metaRes.statusText})`);
    }

    const jobData = await metaRes.json() as any;
    if (jobData.storage?.state === 'archived' || (jobData.video_url === null && jobData.storage?.label)) {
      throw new Error(
        `Cannot import job "${jobId}": ${jobData.storage?.label || 'Video artifact is archived to Google Drive'}. Restore the local video in AI Video Pipeline first.`
      );
    }

    const videoTitle = (customTitle || jobData.title || `Pipeline Job ${jobId.slice(0, 8)}`).trim();
    const videoId = `vid-${randomUUID()}`;
    const filename = `${videoId}_master.mp4`;
    fs.mkdirSync(uploadsDir, { recursive: true });
    const destPath = path.resolve(uploadsDir, filename);
    const tempPath = path.resolve(uploadsDir, `${videoId}_master.${randomUUID().slice(0, 8)}.part`);
    const thumbName = `${videoId}_thumb.jpg`;
    const thumbPath = path.resolve(uploadsDir, thumbName);

    const videoStreamUrl = `${apiUrl}/scene-video-jobs/${encodeURIComponent(jobId)}/artifacts/video`;
    const downloadController = new AbortController();
    const downloadTimeout = setTimeout(() => {
      downloadController.abort(new Error(`Timed out while downloading video artifact for job "${jobId}"`));
    }, this.downloadTimeoutMs);

    let tempFd: number | null = null;
    let tempOwned = false, destOwned = false, thumbOwned = false;
    this.activeTempFiles.add(tempPath);

    try {
      // Exclusive temporary file creation ('wx' fails if path already exists)
      tempFd = fs.openSync(tempPath, 'wx');
      tempOwned = true;

      let videoDownloadRes: Response;
      try {
        videoDownloadRes = await fetch(videoStreamUrl, { signal: downloadController.signal });
      } catch (err: any) {
        if (downloadController.signal.aborted || err?.name === 'AbortError') {
          throw new Error(`Timed out while downloading video artifact for job "${jobId}"`);
        }
        throw err;
      }

      if (!videoDownloadRes.ok || !videoDownloadRes.body) {
        throw new Error(`Failed to download video artifact (HTTP ${videoDownloadRes.status}: ${videoDownloadRes.statusText})`);
      }

      const contentLengthHeader = videoDownloadRes.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredBytes = Number(contentLengthHeader);
        if (Number.isFinite(declaredBytes) && declaredBytes > this.maxImportBytes) {
          downloadController.abort();
          throw new Error(
            `Video artifact for job "${jobId}" (${declaredBytes} bytes) exceeds maximum allowed import size (${this.maxImportBytes} bytes)`
          );
        }
      }

      const maxBytes = this.maxImportBytes;
      let streamedBytes = 0;
      const sizeGuardStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          streamedBytes += chunk.length;
          if (streamedBytes > maxBytes) {
            callback(
              new Error(
                `Video artifact for job "${jobId}" exceeds maximum allowed import size (${maxBytes} bytes)`
              )
            );
            return;
          }
          callback(null, chunk);
        },
      });

      const fileStream = fs.createWriteStream(tempPath, { fd: tempFd, autoClose: true });
      tempFd = null; // fileStream now owns the file descriptor

      try {
        await pipeline(videoDownloadRes.body as any, sizeGuardStream, fileStream, {
          signal: downloadController.signal,
        });
      } catch (err: any) {
        if (downloadController.signal.aborted || err?.name === 'AbortError') {
          throw new Error(`Timed out while downloading video artifact for job "${jobId}"`);
        }
        throw err;
      } finally {
        clearTimeout(downloadTimeout);
      }

      const fileStats = fs.statSync(tempPath);
      if (fileStats.size < 1000) {
        fs.unlinkSync(tempPath);
        throw new Error(`Downloaded video file for "${jobId}" is corrupt or incomplete (${fileStats.size} bytes)`);
      }

      fs.linkSync(tempPath, destPath);
      destOwned = true;
      fs.unlinkSync(tempPath);
      tempOwned = false;

      // Compute original master SHA256 hash to lock in immutability record
      const sha256 = await ffmpegService.computeFileSha256(destPath);

      // Probe video metadata with ffprobe
      const meta = await ffmpegService.probeVideo(destPath);

      // Generate thumbnail
      fs.closeSync(fs.openSync(thumbPath, 'wx'));
      thumbOwned = true;
      await ffmpegService.generateThumbnail(destPath, thumbPath);

      // Atomic check-and-insert inside SQLite transaction to eliminate race conditions
      const txResult = db.transaction(() => {
        const raceExisting = publishingRepo.getVideoByPipelineJobId(jobId);
        if (raceExisting) {
          if (!this.verifyStoredMaster(raceExisting as any)) throw new Error('Existing Pipeline master cannot be verified; owner review is required.');
          return { videoId: raceExisting.id, alreadyExisted: true };
        }

        publishingRepo.insertVideo({
          id: videoId,
          title: videoTitle,
          sourceType: 'pipeline_import',
          originalFilename: `${jobId}.mp4`,
          filePath: destPath,
          fileSize: fileStats.size,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          aspectRatio: meta.aspectRatio,
          thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
          pipelineJobId: jobId,
          categoryId: categoryId || null,
          metadataJson: JSON.stringify({
            sha256,
            source: 'ai_video_pipeline',
            upstreamJobId: jobId,
            hasAudio: meta.hasAudio,
            videoCodec: meta.videoCodec,
            audioCodec: meta.audioCodec,
            upstreamVideoUrl: videoStreamUrl,
          }),
        });

        activityRepo.logEvent({
          type: 'system',
          title: 'AI Video Pipeline Ingestion',
          message: `Successfully imported "${videoTitle}" (${meta.aspectRatio}, ${meta.duration.toFixed(1)}s, ${(fileStats.size / 1024 / 1024).toFixed(1)}MB) from AI Video Pipeline.`,
          severity: 'info',
        });

        return { videoId, alreadyExisted: false };
      })();

      if (txResult.alreadyExisted) {
        if (destOwned && fs.existsSync(destPath)) fs.unlinkSync(destPath);
        if (thumbOwned && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      }

      return txResult;
    } catch (err) {
      clearTimeout(downloadTimeout);
      if (tempFd !== null) {
        try { fs.closeSync(tempFd); } catch {}
      }
      if (tempOwned && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
      if (destOwned && fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch {}
      }
      if (thumbOwned && fs.existsSync(thumbPath)) {
        try { fs.unlinkSync(thumbPath); } catch {}
      }
      throw err;
    } finally {
      this.activeTempFiles.delete(tempPath);
    }
  }

  private findVerifiedExistingVideoForLocalFile(params: {
    canonicalSourcePath: string;
    sourceSize: number;
    sourceSha256: string;
    pipelineJobId?: string;
  }): { id: string } | undefined {
    const { canonicalSourcePath, sourceSize, sourceSha256, pipelineJobId } = params;
    const normalizedJobId = pipelineJobId ? String(pipelineJobId).trim() : '';

    // 1. If explicit job identity is provided, verify both job identity AND content identity (sha256)
    if (normalizedJobId) {
      const jobRows = db
        .prepare('SELECT id, file_path, file_size, metadata_json FROM videos WHERE pipeline_job_id = ? ORDER BY created_at DESC')
        .all(normalizedJobId) as Array<{ id: string; file_path: string; file_size: number; metadata_json: string }>;

      for (const row of jobRows) {
        if (!row.file_path || !fs.existsSync(row.file_path)) continue;
        try {
          const st = fs.statSync(row.file_path);
          if (!st.isFile() || st.size <= 0) continue;
          const meta = JSON.parse(row.metadata_json || '{}');
          if (typeof meta.sha256 === 'string' && meta.sha256.trim() && meta.sha256 === sourceSha256 && this.verifyStoredMaster(row)) {
            return { id: row.id };
          }
        } catch {
          continue;
        }
      }
      return undefined;
    }

    // 2. Local-file import: require verified local-file source identity (canonical sourcePath) AND content identity (sha256 + size)
    // Never match by basename (original_filename) or reuse ambiguous historical records lacking sourcePath/sha256.
    const rows = db
      .prepare('SELECT id, file_path, file_size, pipeline_job_id, metadata_json FROM videos ORDER BY created_at DESC')
      .all() as Array<{
        id: string;
        file_path: string;
        file_size: number;
        pipeline_job_id: string | null;
        metadata_json: string;
      }>;

    for (const row of rows) {
      if (row.pipeline_job_id) continue;
      if (!row.file_path || !fs.existsSync(row.file_path)) continue;
      try {
        const storedStats = fs.statSync(row.file_path);
        if (!storedStats.isFile() || storedStats.size <= 0) continue;

        const meta = JSON.parse(row.metadata_json || '{}');
        if (!meta || typeof meta.sha256 !== 'string' || !meta.sha256.trim()) {
          // Ambiguous historical database record without verified content hash — never reuse
          continue;
        }
        if (meta.sha256 !== sourceSha256) {
          // Content identity differs (different file or modified content at same path)
          continue;
        }
        if (Number(row.file_size) > 0 && Number(row.file_size) !== sourceSize) {
          continue;
        }

        const storedCanonical = this.canonicalizePath(row.file_path);
        const recordedSourceCanonical =
          typeof meta.sourcePath === 'string' && meta.sourcePath.trim()
            ? this.canonicalizePath(meta.sourcePath)
            : null;

        if ((recordedSourceCanonical === canonicalSourcePath || storedCanonical === canonicalSourcePath) && this.verifyStoredMaster(row)) {
          return { id: row.id };
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  // Fallback: Scan local watch directory if configured
  getWatchSourceFingerprint(): string | null {
    try {
      const resolved=fs.realpathSync(this.getWatchDirectory());
      if(!fs.statSync(resolved).isDirectory()) return null;
      const identity=process.platform==='win32'?path.resolve(resolved).toLowerCase():path.resolve(resolved);
      return createHash('sha256').update(JSON.stringify(['watch-source-v1',identity])).digest('hex');
    } catch {return null;}
  }

  scanWatchDirectory(options?:{includeHidden?:boolean}): DiscoveredPipelineVideo[] {
    const dir = this.getWatchDirectory();
    if (!fs.existsSync(dir)) {
      return [];
    }

    // Batch-load verified local-file import records once
    const verifiedBySourcePath = new Map<
      string,
      Array<{ id: string; sourceSize?: number; sourceMtimeMs?: number; sha256: string }>
    >();

    try {
      const rows = db
        .prepare('SELECT id, file_path, file_size, metadata_json FROM videos ORDER BY created_at DESC')
        .all() as Array<{ id: string; file_path: string; file_size: number; metadata_json: string }>;

      for (const row of rows) {
        if (!row.file_path || !fs.existsSync(row.file_path)) continue;
        try {
          const meta = JSON.parse(row.metadata_json || '{}');
          if (!meta || typeof meta.sha256 !== 'string' || !meta.sha256.trim()) continue;
          if (typeof meta.sourcePath !== 'string' || !meta.sourcePath.trim()) continue;
          const canonSource = this.canonicalizePath(meta.sourcePath);
          const list = verifiedBySourcePath.get(canonSource) || [];
          list.push({
            id: row.id,
            sourceSize: typeof meta.sourceSize === 'number' ? meta.sourceSize : Number(row.file_size) || undefined,
            sourceMtimeMs: typeof meta.sourceMtimeMs === 'number' ? meta.sourceMtimeMs : undefined,
            sha256: meta.sha256,
          });
          verifiedBySourcePath.set(canonSource, list);
        } catch {
          continue;
        }
      }
    } catch {
      // A missing or unreadable inventory cannot establish import associations.
      throw new Error('Watch directory import-reference inspection is unavailable.');
    }

    const files: DiscoveredPipelineVideo[] = [];
    const sourceFingerprint=this.getWatchSourceFingerprint();
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
          const fullPath = path.resolve(dir, entry.name);
          const canonicalFull = this.canonicalizePath(fullPath);
          const stats = fs.statSync(fullPath);
          // The path is source-scoped and bound to the observed file version. A replacement
          // or metadata change produces a different ID; no file bytes are read or modified.
          let fileId:string|null=null;
          try {
            const canonicalRoot=fs.realpathSync(dir);
            const actual=fs.realpathSync(fullPath);
            const relative=path.relative(canonicalRoot,actual);
            const info=fs.statSync(actual,{bigint:true});
            const norm=(value:string)=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
            const rootFingerprint=createHash('sha256').update(JSON.stringify(['watch-source-v1',norm(canonicalRoot)])).digest('hex');
            const after=fs.statSync(fullPath,{bigint:true});
            if(sourceFingerprint && rootFingerprint===sourceFingerprint && relative && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative)
              && info.isFile() && info.size>=0n && info.mtimeNs>0n && info.ctimeNs>0n
              && info.dev===after.dev && info.ino===after.ino && info.size===after.size
              && info.mtimeNs===after.mtimeNs && info.ctimeNs===after.ctimeNs && info.birthtimeNs===after.birthtimeNs
              && Number(info.size)===stats.size && Number(info.dev)===stats.dev && Number(info.ino)===stats.ino
              && Math.abs(Number(info.mtimeNs)/1_000_000-stats.mtimeMs)<1
              && Math.abs(Number(info.ctimeNs)/1_000_000-stats.ctimeMs)<1
              && Math.abs(Number(info.birthtimeNs)/1_000_000-stats.birthtimeMs)<1) {
              const fileInfo=[norm(actual),info.size.toString(),info.mtimeNs.toString(),info.ctimeNs.toString(),info.birthtimeNs.toString(),info.dev.toString(),info.ino.toString()];
              fileId=createHash('sha256').update(JSON.stringify(['watch-file-v1',sourceFingerprint,...fileInfo])).digest('hex');
            }
          } catch { /* Report a non-actionable entry when the identity cannot be established. */ }

          const candidates = verifiedBySourcePath.get(canonicalFull) || [];
          const matched = candidates.find(
            (c) =>
              c.sourceSize === stats.size &&
              (c.sourceMtimeMs === undefined || Math.abs(c.sourceMtimeMs - stats.mtimeMs) < 1)
          );

          files.push({
            filename: entry.name,
            fullPath,
            sizeBytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            isImported: Boolean(matched),
            importedVideoId: matched?.id,
            fileId,
            sourceFingerprint,
            visibilitySupported:!!fileId,
            visibilityReason:fileId?undefined:'Canonical file identity is unavailable; hiding is not supported.',
          });
        }
      }
    } catch {
      throw new Error('Watch directory scan incomplete; no partial results are available.');
    }

    // Resolve saved exclusions outside the filesystem catch: malformed metadata or a DB
    // failure must not silently return a partially filtered list.
    for(const file of files) file.hidden=!!file.fileId && !!file.sourceFingerprint && isWatchFileHidden(db,file.sourceFingerprint,file.fileId);
    const visible=options?.includeHidden?files:files.filter(file=>file.visibilitySupported&&!file.hidden);
    return visible.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  }

  async importVideoFile(params: {
    filePath: string;
    title?: string;
    categoryId?: string;
    pipelineJobId?: string;
  }): Promise<string> {
    const res = await this.importVideoFileWithStatus(params);
    return res.videoId;
  }

  async importVideoFileWithStatus(params: {
    filePath: string;
    title?: string;
    categoryId?: string;
    pipelineJobId?: string;
  }): Promise<{ videoId: string; alreadyExisted: boolean }> {
    const { filePath, title, categoryId, pipelineJobId } = params;
    const resolvedInput = path.resolve(filePath);
    if (!fs.existsSync(resolvedInput)) {
      throw new Error(`Video file does not exist: ${filePath}`);
    }

    const canonicalSourcePath = this.canonicalizePath(resolvedInput);
    const sourceStats = fs.statSync(canonicalSourcePath);
    if (!sourceStats.isFile() || sourceStats.size <= 0) {
      throw new Error(`Video file is empty or not a regular file: ${filePath}`);
    }
    if (sourceStats.size > this.maxImportBytes) {
      throw new Error(
        `Video file "${path.basename(canonicalSourcePath)}" (${sourceStats.size} bytes) exceeds maximum allowed import size (${this.maxImportBytes} bytes)`
      );
    }

    const normalizedJobId = pipelineJobId ? String(pipelineJobId).trim() : '';
    const inFlightKey = `${canonicalSourcePath}::${sourceStats.size}::${sourceStats.mtimeMs}::${normalizedJobId}`;

    const inFlight = this.inFlightFileImports.get(inFlightKey);
    if (inFlight) {
      const joined = await inFlight;
      return { videoId: joined.videoId, alreadyExisted: true };
    }

    const promise = (async () => {
      const sourceSha256 = await ffmpegService.computeFileSha256(canonicalSourcePath);
      const afterHash = fs.statSync(canonicalSourcePath);
      if (afterHash.size !== sourceStats.size || afterHash.mtimeMs !== sourceStats.mtimeMs || afterHash.ino !== sourceStats.ino || afterHash.dev !== sourceStats.dev) throw new Error('Source file changed while being verified; please retry once it is complete.');

      const existingVerified = this.findVerifiedExistingVideoForLocalFile({
        canonicalSourcePath,
        sourceSize: sourceStats.size,
        sourceSha256,
        pipelineJobId: normalizedJobId || undefined,
      });

      if (existingVerified) {
        return { videoId: existingVerified.id, alreadyExisted: true };
      }

      const filename = path.basename(canonicalSourcePath);
      const videoTitle = (title || filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')).trim();
      const videoId = `vid-${randomUUID()}`;

      fs.mkdirSync(uploadsDir, { recursive: true });
      const destPath = path.resolve(uploadsDir, `${videoId}_${filename}`);
      const tempPath = path.resolve(uploadsDir, `${videoId}_${filename}.${randomUUID().slice(0, 8)}.part`);
      const thumbName = `${videoId}_thumb.jpg`;
      const thumbPath = path.resolve(uploadsDir, thumbName);

      let tempOwned = false, destOwned = false, thumbOwned = false;
      this.activeTempFiles.add(tempPath);
      try {
        // Reserve the temporary path exclusively before copying, so failures are
        // cleaned up only when this operation actually created that path.
        fs.closeSync(fs.openSync(tempPath, 'wx'));
        tempOwned = true;
        fs.copyFileSync(canonicalSourcePath, tempPath);
        const copiedStats = fs.statSync(tempPath);
        if (copiedStats.size <= 0) {
          throw new Error(`Copied video file is empty: ${filePath}`);
        }

        const copiedSha256 = await ffmpegService.computeFileSha256(tempPath);
        if (copiedSha256 !== sourceSha256) {
          throw new Error(`Source file "${filename}" changed while being imported; please retry once the file is complete.`);
        }

        fs.linkSync(tempPath, destPath);
        destOwned = true;
        fs.unlinkSync(tempPath);
        tempOwned = false;

        const meta = await ffmpegService.probeVideo(destPath);
        fs.closeSync(fs.openSync(thumbPath, 'wx'));
        thumbOwned = true;
        await ffmpegService.generateThumbnail(destPath, thumbPath);

        const txResult = db.transaction(() => {
          const raceExisting = this.findVerifiedExistingVideoForLocalFile({
            canonicalSourcePath,
            sourceSize: copiedStats.size,
            sourceSha256: copiedSha256,
            pipelineJobId: normalizedJobId || undefined,
          });
          if (raceExisting) {
            return { videoId: raceExisting.id, alreadyExisted: true };
          }

          publishingRepo.insertVideo({
            id: videoId,
            title: videoTitle,
            sourceType: 'pipeline_import',
            originalFilename: filename,
            filePath: destPath,
            fileSize: copiedStats.size,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            aspectRatio: meta.aspectRatio,
            thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
            pipelineJobId: normalizedJobId || null,
            categoryId: categoryId || null,
            metadataJson: JSON.stringify({
              sha256: copiedSha256,
              source: 'local_file_import',
              sourcePath: canonicalSourcePath,
              sourceSize: copiedStats.size,
              sourceMtimeMs: sourceStats.mtimeMs,
              hasAudio: meta.hasAudio,
              videoCodec: meta.videoCodec,
              audioCodec: meta.audioCodec,
            }),
          });

          activityRepo.logEvent({
            type: 'system',
            title: 'Video File Import',
            message: `Imported "${videoTitle}" (${meta.aspectRatio}, ${meta.duration.toFixed(1)}s) into library.`,
            severity: 'info',
          });

          return { videoId, alreadyExisted: false };
        })();

        if (txResult.alreadyExisted) {
          if (destOwned && fs.existsSync(destPath)) fs.unlinkSync(destPath);
          if (thumbOwned && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }

        return txResult;
      } catch (err) {
        if (tempOwned && fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch {}
        }
        if (destOwned && fs.existsSync(destPath)) {
          try { fs.unlinkSync(destPath); } catch {}
        }
        if (thumbOwned && fs.existsSync(thumbPath)) {
          try { fs.unlinkSync(thumbPath); } catch {}
        }
        throw err;
      } finally {
        this.activeTempFiles.delete(tempPath);
      }
    })();

    this.inFlightFileImports.set(inFlightKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlightFileImports.delete(inFlightKey);
    }
  }
}

export const pipelineService = new PipelineService();
