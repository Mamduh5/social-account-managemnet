import React, { useState, useMemo } from 'react';
import {
  VideoItem,
  DiscoveredPipelineJob,
  PipelineHealthStatus,
  PipelineJobsQueryParams,
} from '../../types';
import { ImportJobNotice } from '../../hooks/usePublishing';
import {
  Sparkles,
  Film,
  Play,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle,
  Layers,
  Volume2,
  Send,
  Search,
  AlertTriangle,
  AlertCircle,
  HardDrive,
  ChevronDown,
  Clock,
  Info,
} from 'lucide-react';
import { Modal } from '../common/Modal';

export interface VideoLibraryGridProps {
  videos: VideoItem[];
  pipelineFiles: any[];
  pipelineJobs?: DiscoveredPipelineJob[];
  pipelineHealth?: PipelineHealthStatus | null;
  pipelineQuery?: Required<Omit<PipelineJobsQueryParams, 'cursor'>>;
  onUpdatePipelineQuery?: (patch: Partial<Omit<PipelineJobsQueryParams, 'cursor'>>) => void;
  pipelinePage?: {
    limit: number;
    returned: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  pipelineTotalMatched?: number;
  pipelineSourceContract?: 'library_v1' | 'legacy_jobs' | 'offline' | 'error';
  pipelineHistoryComplete?: boolean;
  pipelineIncompleteReason?: string;
  pipelineLoading?: boolean;
  pipelineLoadingMore?: boolean;
  pipelineError?: string;
  onLoadMorePipelineJobs?: () => void;
  importingJobIds?: Record<string, boolean>;
  importJobErrors?: Record<string, string>;
  importJobNotices?: Record<string, ImportJobNotice>;
  importingFilePaths?: Record<string, boolean>;
  importFileErrors?: Record<string, string>;
  syncingPipeline?: boolean;
  selectedVideoId: string;
  onSelectVideo: (videoId: string, title: string) => void;
  onSelectVideoVariant?: (videoId: string, variantId: string, title?: string) => void;
  onImportPipelineFile: (filePath: string, filename: string, options?: { stayInLibrary?: boolean }) => void;
  onImportPipelineJob?: (
    jobId: string,
    title?: string,
    options?: { stayInLibrary?: boolean }
  ) => Promise<any> | void;
  onSyncPipeline?: () => void;
  onDeleteBrandedVariant?: (variantId: string) => void;
}

const DEFAULT_PAGE_SIZE = 12;

export const VideoLibraryGrid: React.FC<VideoLibraryGridProps> = ({
  videos,
  pipelineFiles = [],
  pipelineJobs = [],
  pipelineHealth,
  pipelineQuery,
  onUpdatePipelineQuery,
  pipelinePage,
  pipelineTotalMatched,
  pipelineSourceContract,
  pipelineHistoryComplete = true,
  pipelineIncompleteReason,
  pipelineLoading = false,
  pipelineLoadingMore = false,
  pipelineError = '',
  onLoadMorePipelineJobs,
  importingJobIds = {},
  importJobErrors = {},
  importJobNotices = {},
  importingFilePaths = {},
  importFileErrors = {},
  syncingPipeline = false,
  selectedVideoId,
  onSelectVideo,
  onSelectVideoVariant,
  onImportPipelineFile,
  onImportPipelineJob,
  onSyncPipeline,
  onDeleteBrandedVariant,
}) => {
  const [activePreview, setActivePreview] = useState<{
    url: string;
    title: string;
    isBranded: boolean;
    aspectRatio?: string;
    duration?: number;
    watermarkText?: string;
  } | null>(null);

  // Local fallback state when VideoLibraryGrid is rendered without external pipelineQuery state
  const [localPipeSearch, setLocalPipeSearch] = useState('');
  const [localPipeAspect, setLocalPipeAspect] = useState('all');
  const [localPipeStatus, setLocalPipeStatus] = useState('completed');
  const [localPipeImportState, setLocalPipeImportState] = useState<'all' | 'imported' | 'unimported'>('all');
  const [localPipeSort, setLocalPipeSort] = useState<'recent' | 'created' | 'oldest' | 'name'>('recent');
  const [localPipeVisibleCount, setLocalPipeVisibleCount] = useState(DEFAULT_PAGE_SIZE);
  const [localImportingIds, setLocalImportingIds] = useState<Record<string, boolean>>({});

  // Imported Library local search, filter, sort & bounded pagination
  const [libSearch, setLibSearch] = useState('');
  const [libAspect, setLibAspect] = useState('all');
  const [libSourceFilter, setLibSourceFilter] = useState('all');
  const [libSort, setLibSort] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [libVisibleCount, setLibVisibleCount] = useState(DEFAULT_PAGE_SIZE);

  const effectivePipeSearch = pipelineQuery ? pipelineQuery.q : localPipeSearch;
  const effectivePipeAspect = pipelineQuery ? pipelineQuery.aspectRatio : localPipeAspect;
  const effectivePipeStatus = pipelineQuery ? pipelineQuery.status : localPipeStatus;
  const effectivePipeImportState = pipelineQuery ? pipelineQuery.importState : localPipeImportState;
  const effectivePipeSort = pipelineQuery ? pipelineQuery.sort : localPipeSort;

  const hasActivePipelineFilters =
    Boolean(effectivePipeSearch.trim()) ||
    effectivePipeAspect !== 'all' ||
    effectivePipeStatus !== 'completed' ||
    effectivePipeImportState !== 'all';

  const handlePipeSearchChange = (value: string) => {
    setLocalPipeSearch(value);
    setLocalPipeVisibleCount(DEFAULT_PAGE_SIZE);
    if (onUpdatePipelineQuery) {
      onUpdatePipelineQuery({ q: value });
    }
  };

  const handlePipeAspectChange = (value: string) => {
    setLocalPipeAspect(value);
    setLocalPipeVisibleCount(DEFAULT_PAGE_SIZE);
    if (onUpdatePipelineQuery) {
      onUpdatePipelineQuery({ aspectRatio: value });
    }
  };

  const handlePipeStatusChange = (value: string) => {
    setLocalPipeStatus(value);
    setLocalPipeVisibleCount(DEFAULT_PAGE_SIZE);
    if (onUpdatePipelineQuery) {
      onUpdatePipelineQuery({ status: value });
    }
  };

  const handlePipeImportStateChange = (value: 'all' | 'imported' | 'unimported') => {
    setLocalPipeImportState(value);
    setLocalPipeVisibleCount(DEFAULT_PAGE_SIZE);
    if (onUpdatePipelineQuery) {
      onUpdatePipelineQuery({ importState: value });
    }
  };

  const handlePipeSortChange = (value: 'recent' | 'created' | 'oldest' | 'name') => {
    setLocalPipeSort(value);
    setLocalPipeVisibleCount(DEFAULT_PAGE_SIZE);
    if (onUpdatePipelineQuery) {
      onUpdatePipelineQuery({ sort: value });
    }
  };

  const clearPipelineFilters = () => {
    setLocalPipeSearch('');
    setLocalPipeAspect('all');
    setLocalPipeStatus('completed');
    setLocalPipeImportState('all');
    setLocalPipeSort('recent');
    setLocalPipeVisibleCount(DEFAULT_PAGE_SIZE);
    if (onUpdatePipelineQuery) {
      onUpdatePipelineQuery({
        q: '',
        aspectRatio: 'all',
        status: 'completed',
        importState: 'all',
        sort: 'recent',
      });
    }
  };

  // Filter & sort pipelineJobs locally as well so standalone component tests and client-side refinements are instant & accurate
  const filteredPipelineJobs = useMemo(() => {
    if (onUpdatePipelineQuery) return pipelineJobs;
    const q = effectivePipeSearch.trim().toLowerCase();
    const filtered = pipelineJobs.filter((job) => {
      if (q && !onUpdatePipelineQuery) {
        const hay = `${job.title} ${job.topic || ''} ${job.jobId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (effectivePipeAspect !== 'all') {
        if (effectivePipeAspect === 'unknown') {
          if (job.aspectRatio) return false;
        } else if (job.aspectRatio !== effectivePipeAspect) {
          return false;
        }
      }
      if (effectivePipeImportState === 'imported' && !job.isImported) return false;
      if (effectivePipeImportState === 'unimported' && job.isImported) return false;
      if (effectivePipeStatus && effectivePipeStatus !== 'all') {
        if (effectivePipeStatus === 'eligible') {
          if (job.importEligible === false) return false;
        } else if (effectivePipeStatus === 'completed') {
          const st = (job.status || job.displayStatus || '').toLowerCase();
          if (!st.includes('completed')) return false;
        } else {
          const st = (job.status || job.displayStatus || '').toLowerCase();
          if (!st.includes(effectivePipeStatus.toLowerCase())) return false;
        }
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (effectivePipeSort === 'name') {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      }
      if (effectivePipeSort === 'created') {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      }
      if (effectivePipeSort === 'oldest') {
        const ta = a.createdAt || a.updatedAt ? Date.parse(a.createdAt || a.updatedAt!) : Number.MAX_SAFE_INTEGER;
        const tb = b.createdAt || b.updatedAt ? Date.parse(b.createdAt || b.updatedAt!) : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      }
      const ta = a.updatedAt || a.createdAt ? Date.parse(a.updatedAt || a.createdAt!) : 0;
      const tb = b.updatedAt || b.createdAt ? Date.parse(b.updatedAt || b.createdAt!) : 0;
      return tb - ta;
    });

    return sorted;
  }, [
    pipelineJobs,
    effectivePipeSearch,
    effectivePipeAspect,
    effectivePipeImportState,
    effectivePipeStatus,
    effectivePipeSort,
  ]);

  const visiblePipelineJobs = useMemo(() => {
    if (onLoadMorePipelineJobs && pipelinePage) {
      return filteredPipelineJobs;
    }
    return filteredPipelineJobs.slice(0, localPipeVisibleCount);
  }, [filteredPipelineJobs, localPipeVisibleCount, onLoadMorePipelineJobs, pipelinePage]);

  const canLoadMorePipeline = Boolean(
    (pipelinePage?.hasMore && onLoadMorePipelineJobs) ||
      (!onLoadMorePipelineJobs && localPipeVisibleCount < filteredPipelineJobs.length)
  );

  const handleLoadMorePipeline = () => {
    if (pipelinePage?.hasMore && onLoadMorePipelineJobs) {
      onLoadMorePipelineJobs();
    } else {
      setLocalPipeVisibleCount((prev) => prev + DEFAULT_PAGE_SIZE);
    }
  };

  // Filter & sort Imported Library videos
  const filteredLibraryVideos = useMemo(() => {
    const q = libSearch.trim().toLowerCase();
    const filtered = videos.filter((vid) => {
      if (q) {
        const hay = `${vid.title} ${vid.original_filename} ${vid.id} ${vid.pipeline_job_id || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (libAspect !== 'all' && vid.aspect_ratio !== libAspect) return false;
      if (libSourceFilter !== 'all' && vid.source_type !== libSourceFilter) return false;
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (libSort === 'name') {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      }
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return libSort === 'oldest' ? ta - tb : tb - ta;
    });

    return sorted;
  }, [videos, libSearch, libAspect, libSourceFilter, libSort]);

  const visibleLibraryVideos = useMemo(
    () => filteredLibraryVideos.slice(0, libVisibleCount),
    [filteredLibraryVideos, libVisibleCount]
  );

  const handleImportJobClick = async (
    jobId: string,
    title: string,
    options?: { stayInLibrary?: boolean }
  ) => {
    if (!onImportPipelineJob) return;
    if (importingJobIds[jobId] || localImportingIds[jobId]) return;
    setLocalImportingIds((prev) => ({ ...prev, [jobId]: true }));
    try {
      await onImportPipelineJob(jobId, title, options);
    } finally {
      setLocalImportingIds((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  const formatShortDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* 1. PIPELINE VIDEOS — AVAILABLE FOR IMPORT FROM AI VIDEO PIPELINE */}
      <section
        aria-label="Pipeline Videos"
        data-testid="pipeline-videos-section"
        className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-terracotta-400" />
                <span>Pipeline Videos</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">
                (AI Video Pipeline Integration)
              </span>
              {pipelineHealth?.reachable ? (
                <span className="text-[10px] bg-sage-500/15 text-sage-300 border border-sage-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage-400 animate-pulse" />
                  Live Connected ({pipelineHealth.apiUrl})
                </span>
              ) : (
                <span className="text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Pipeline Offline ({pipelineHealth?.apiUrl || 'localhost:8080'})
                </span>
              )}
              {pipelineSourceContract && pipelineHealth?.reachable && (
                <span className="text-[10px] bg-surface px-2 py-0.5 rounded-full border border-border text-slate-300 font-mono">
                  {pipelineSourceContract === 'library_v1' ? 'Cursor Library API' : 'Project Feed API'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Browse, search, and import completed videos from your AI Video Pipeline, including older projects.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onSyncPipeline}
              disabled={syncingPipeline || pipelineLoading}
              className="px-3.5 py-2 bg-surface hover:bg-surface-hover border border-border text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-terracotta-400 ${
                  syncingPipeline || pipelineLoading ? 'animate-spin' : ''
                }`}
              />
              {syncingPipeline ? 'Syncing...' : 'Sync from Pipeline'}
            </button>
          </div>
        </div>

        {/* Incomplete History / Upstream Warning Banner */}
        {(!pipelineHistoryComplete || pipelineIncompleteReason) && pipelineHealth?.reachable && (
          <div
            role="status"
            data-testid="pipeline-incomplete-history-banner"
            className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-300"
          >
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Upstream history notice: </span>
              <span>
                {pipelineIncompleteReason ||
                  'Upstream pipeline results may be incomplete. Use title search to locate specific older projects.'}
              </span>
            </div>
          </div>
        )}

        {pipelineError && (
          <div
            role="alert"
            className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-center justify-between gap-3 text-xs text-rose-300"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{pipelineError}</span>
            </div>
            {onSyncPipeline && (
              <button
                type="button"
                onClick={onSyncPipeline}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Search, Filter & Sort Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 bg-surface p-3 rounded-xl border border-border">
          <div className="relative sm:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search Pipeline Videos"
              value={effectivePipeSearch}
              onChange={(e) => handlePipeSearchChange(e.target.value)}
              placeholder="Search pipeline videos by title or project ID..."
              className="w-full bg-surface-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500"
            />
          </div>

          <div>
            <select
              aria-label="Filter Pipeline Aspect Ratio"
              value={effectivePipeAspect}
              onChange={(e) => handlePipeAspectChange(e.target.value)}
              className="w-full bg-surface-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500"
            >
              <option value="all">All Aspect Ratios</option>
              <option value="9:16">9:16 Vertical</option>
              <option value="16:9">16:9 Landscape</option>
              <option value="unknown">Aspect Unreported</option>
            </select>
          </div>

          <div>
            <select
              aria-label="Filter Pipeline Status"
              value={effectivePipeStatus}
              onChange={(e) => handlePipeStatusChange(e.target.value)}
              className="w-full bg-surface-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500"
            >
              <option value="completed">Completed Videos</option>
              <option value="eligible">Ready to Import Only</option>
              <option value="all">All Pipeline Statuses</option>
            </select>
          </div>

          <div>
            <select
              aria-label="Filter Pipeline Import State"
              value={effectivePipeImportState}
              onChange={(e) => handlePipeImportStateChange(e.target.value as any)}
              className="w-full bg-surface-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500"
            >
              <option value="all">All Import States</option>
              <option value="unimported">Not Imported</option>
              <option value="imported">In Library</option>
            </select>

          </div>
          <div>
            <select
              aria-label="Sort Pipeline Videos"
              value={effectivePipeSort}
              onChange={(e) => handlePipeSortChange(e.target.value as any)}
              className="w-full bg-surface-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500"
            >
              <option value="recent">Updated (Newest)</option>
              <option value="created">Created (Newest)</option>
              <option value="name">Title (A–Z)</option>
            </select>
          </div>
        </div>

        {/* Pipeline Results Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 px-1">
          <span>
            Showing <strong className="text-slate-200">{visiblePipelineJobs.length}</strong>
            {pipelineTotalMatched !== undefined
              ? ` of ${pipelineTotalMatched} matching pipeline video${pipelineTotalMatched === 1 ? '' : 's'}`
              : filteredPipelineJobs.length !== visiblePipelineJobs.length
                ? ` of ${filteredPipelineJobs.length} loaded pipeline videos`
                : ` pipeline video${visiblePipelineJobs.length === 1 ? '' : 's'}`}
          </span>
          {hasActivePipelineFilters && (
            <button
              type="button"
              onClick={clearPipelineFilters}
              className="text-terracotta-400 hover:text-terracotta-300 font-semibold underline cursor-pointer"
            >
              Reset Pipeline Filters
            </button>
          )}
        </div>

        {/* Pipeline Jobs Grid or Distinct Empty States */}
        {visiblePipelineJobs.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {visiblePipelineJobs.map((job) => {
                const isImporting = Boolean(importingJobIds[job.jobId] || localImportingIds[job.jobId]);
                const jobError = importJobErrors[job.jobId];
                const jobNotice = importJobNotices[job.jobId];
                const canPreview = Boolean(job.videoUrl);
                const importAllowed = job.importEligible !== false;
                const createdLabel = formatShortDate(job.createdAt);
                const updatedLabel = formatShortDate(job.updatedAt);
                const hasIncompleteMeta = Boolean(job.incompleteMetadata && job.incompleteMetadata.length > 0);

                return (
                  <div
                    key={job.jobId}
                    data-testid={`pipeline-job-card-${job.jobId}`}
                    className="bg-surface p-4 rounded-xl border border-border flex flex-col justify-between text-xs hover:border-slate-600 transition-colors gap-3"
                  >
                    <div className="space-y-2">
                      {/* Metadata & Status Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                              job.aspectRatio
                                ? 'bg-terracotta-500/15 text-terracotta-300 border-terracotta-500/25'
                                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                            }`}
                          >
                            {job.aspectRatio || 'Aspect N/A'}
                          </span>
                          <span className="text-[10px] text-slate-300 font-mono bg-surface-card px-1.5 py-0.5 rounded border border-border">
                            {job.durationSeconds !== null && job.durationSeconds > 0
                              ? `${job.durationSeconds}s`
                              : 'Duration N/A'}
                          </span>
                          {job.storageLabel && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                              {job.storageLabel}
                            </span>
                          )}
                        </div>

                        {job.isImported ? (
                          <span className="text-[10px] text-sage-300 font-bold px-2 py-0.5 bg-sage-500/15 border border-sage-500/30 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> In Library
                          </span>
                        ) : importAllowed ? (
                          <span className="text-[10px] text-blue-300 font-semibold px-2 py-0.5 bg-blue-500/15 border border-blue-500/30 rounded-full">
                            Available to Import
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-300 font-semibold px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded-full">
                            Artifact Unavailable
                          </span>
                        )}
                      </div>

                      {/* Title & Exact Project Identity */}
                      <div>
                        <p className="font-bold text-slate-100 text-sm leading-snug break-words" title={job.title}>
                          {job.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 mt-1 font-mono">
                          <span title={`Exact Pipeline Project ID: ${job.jobId}`}>ID: {job.jobId}</span>
                          <span>•</span>
                          <span>{job.displayStatus}</span>
                        </div>
                      </div>

                      {/* Honest Timestamps & Incomplete Metadata Notice */}
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {updatedLabel
                            ? `Updated ${updatedLabel}`
                            : createdLabel
                              ? `Created ${createdLabel}`
                              : 'Timestamp unavailable'}
                        </span>
                        {hasIncompleteMeta && (
                          <span
                            title={`Missing upstream fields: ${job.incompleteMetadata?.join(', ')}`}
                            className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 font-medium"
                          >
                            Incomplete metadata ({job.incompleteMetadata?.join(', ')})
                          </span>
                        )}
                      </div>

                      {!importAllowed && job.ineligibleReason && (
                        <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">
                          {job.ineligibleReason}
                        </div>
                      )}

                      {jobNotice && (
                        <div className="text-[11px] text-sage-300 bg-sage-500/10 border border-sage-500/25 rounded-lg p-2 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-sage-400 shrink-0" />
                          <span>{jobNotice.message}</span>
                        </div>
                      )}

                      {jobError && (
                        <div
                          role="alert"
                          className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 space-y-1.5"
                        >
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <span>{jobError}</span>
                          </div>
                          <button
                            type="button"
                            disabled={isImporting}
                            onClick={() => handleImportJobClick(job.jobId, job.title, { stayInLibrary: true })}
                            className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-[10px] cursor-pointer"
                          >
                            Retry Import
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Action Footer */}
                    <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                      {canPreview ? (
                        <button
                          type="button"
                          onClick={() =>
                            setActivePreview({
                              url: job.videoUrl!,
                              title: `${job.title} (Pipeline Preview)`,
                              isBranded: false,
                              aspectRatio: job.aspectRatio || 'Auto',
                              duration: job.durationSeconds || undefined,
                            })
                          }
                          title="Preview Pipeline Video"
                          className="px-2.5 py-1.5 bg-surface-card hover:bg-surface-hover text-slate-200 border border-border rounded-lg font-semibold text-[11px] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Play className="w-3 h-3 text-terracotta-400 fill-terracotta-400" />
                          Preview
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">Preview unavailable</span>
                      )}

                      <div className="flex items-center gap-1.5">
                        {job.isImported ? (
                          job.importedVideoId ? (
                            <button
                              type="button"
                              onClick={() => handleImportJobClick(job.jobId, job.title)}
                              disabled={isImporting || !onImportPipelineJob}
                              title="Verify the stored master before opening it in the composer"
                              className="px-3 py-1.5 bg-sage-500/15 hover:bg-sage-500/25 disabled:opacity-50 text-sage-300 border border-sage-500/30 rounded-lg font-bold text-xs cursor-pointer transition-colors"
                            >
                              Use in Composer
                            </button>
                          ) : (
                            <span className="text-[11px] text-sage-400 font-bold px-2.5 py-1">
                              Already Imported
                            </span>
                          )
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleImportJobClick(job.jobId, job.title, { stayInLibrary: true })}
                              disabled={isImporting || !importAllowed}
                              title={!importAllowed ? job.ineligibleReason : 'Import into Library and continue browsing'}
                              className="px-2.5 py-1.5 bg-surface-card hover:bg-surface-hover disabled:opacity-50 text-slate-200 border border-border rounded-lg font-semibold text-[11px] cursor-pointer transition-colors"
                            >
                              {isImporting ? 'Importing...' : 'Import to Library'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleImportJobClick(job.jobId, job.title)}
                              disabled={isImporting || !importAllowed}
                              title={!importAllowed ? job.ineligibleReason : 'Import and open in Composer'}
                              className="px-3 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs whitespace-nowrap cursor-pointer transition-colors active:scale-95"
                            >
                              {isImporting ? 'Importing...' : 'Import'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {canLoadMorePipeline && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  data-testid="load-more-pipeline-jobs"
                  onClick={handleLoadMorePipeline}
                  disabled={pipelineLoadingMore}
                  className="px-5 py-2.5 bg-surface hover:bg-surface-hover border border-border rounded-xl text-xs font-bold text-slate-200 inline-flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <ChevronDown className="w-4 h-4 text-terracotta-400" />
                  {pipelineLoadingMore ? 'Loading Older Videos...' : 'Load Older Pipeline Videos'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Distinct Empty States: Offline vs No Matching Filters vs Zero Available Videos */
          <div
            data-testid="pipeline-empty-state"
            className="text-center py-8 px-4 text-xs text-slate-400 bg-surface/50 rounded-xl border border-dashed border-border space-y-2"
          >
            {pipelineLoading ? (
              <div role="status" className="font-semibold text-slate-200">Searching Pipeline videos...</div>
            ) : pipelineError && pipelineHealth?.reachable !== false ? (
              <div className="font-semibold text-slate-200">Pipeline results are unavailable. Retry the request above.</div>
            ) : canLoadMorePipeline ? (
              <><p>No matches on this page. More Pipeline videos are available.</p><button type="button" data-testid="load-more-pipeline-jobs" onClick={handleLoadMorePipeline} disabled={pipelineLoadingMore} className="px-5 py-2.5 bg-surface border border-border rounded-xl font-bold focus-visible:ring-2 focus-visible:ring-terracotta-500">{pipelineLoadingMore ? 'Loading Older Videos...' : 'Load Older Pipeline Videos'}</button></>
            ) : pipelineHealth && !pipelineHealth.reachable ? (
              <>
                <AlertCircle className="w-7 h-7 mx-auto text-rose-400/80 mb-1" />
                <div className="font-bold text-slate-200 text-sm">
                  AI Video Pipeline is Offline ({pipelineHealth.apiUrl})
                </div>
                <p className="max-w-lg mx-auto text-slate-400">
                  {pipelineHealth.error
                    ? `Connection failed (${pipelineHealth.error}). `
                    : 'Upstream AI video pipeline is not currently responding. '}
                  Start the pipeline service or click <strong>Sync from Pipeline</strong> to retry. Videos in your{' '}
                  <strong>Imported Library</strong> below remain fully accessible.
                </p>
              </>
            ) : hasActivePipelineFilters ? (
              <>
                <Search className="w-7 h-7 mx-auto text-slate-500 mb-1" />
                <div className="font-bold text-slate-200 text-sm">
                  No Pipeline Videos Match Your Search or Filters
                </div>
                <p className="max-w-md mx-auto text-slate-400">
                  No upstream videos matched your active query Criteria. Try clearing your filters or searching by a different keyword.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={clearPipelineFilters}
                    className="px-3.5 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-lg font-bold text-xs cursor-pointer"
                  >
                    Clear Pipeline Filters
                  </button>
                </div>
              </>
            ) : (
              <>
                <Sparkles className="w-7 h-7 mx-auto text-slate-500 mb-1" />
                <div className="font-bold text-slate-200 text-sm">
                  Zero Completed Videos Available in Pipeline
                </div>
                <p className="max-w-md mx-auto text-slate-400">
                  The AI Video Pipeline is connected, but there are currently no completed video projects ready for import.
                </p>
              </>
            )}
          </div>
        )}

        {/* Local Watch Directory Files (if any discovered) */}
        {pipelineFiles.length > 0 && (
          <div className="pt-4 border-t border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                <span>Local Watch Directory Files ({pipelineFiles.length})</span>
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {pipelineFiles.map((file) => {
                const isImportingFile = Boolean(importingFilePaths[file.fullPath]);
                const fileErr = importFileErrors[file.fullPath];
                return (
                  <div
                    key={file.fullPath}
                    className="bg-surface p-3 rounded-xl border border-border flex flex-col justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-200 truncate" title={file.filename}>
                          {file.filename}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      {file.isImported ? (
                        <span className="text-[10px] text-sage-300 font-bold px-2 py-0.5 bg-sage-500/15 border border-sage-500/30 rounded-lg shrink-0">
                          In Library
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isImportingFile}
                          onClick={() => onImportPipelineFile(file.fullPath, file.filename)}
                          className="px-3 py-1 bg-terracotta-600 hover:bg-terracotta-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs shrink-0 cursor-pointer"
                        >
                          {isImportingFile ? 'Importing...' : 'Import File'}
                        </button>
                      )}
                    </div>
                    {fileErr && <p className="text-[10px] text-rose-300">{fileErr}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 2. IMPORTED LIBRARY — SAVED MASTER VIDEOS & BRANDED VARIANTS */}
      <section
        aria-label="Imported Library"
        data-testid="imported-library-section"
        className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Film className="w-4 h-4 text-terracotta-400" />
              <span>Imported Library — Video Library &amp; Branding Versions</span>
              <span className="text-xs bg-surface px-2.5 py-0.5 rounded-full text-slate-300 border border-border font-semibold">
                {videos.length} Masters
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Immutable master videos stored in Social Command Center and their saved moving-watermark variants
            </p>
          </div>
        </div>

        {/* Imported Library Search & Filter Controls */}
        {videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-surface p-3 rounded-xl border border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search Imported Library"
                value={libSearch}
                onChange={(e) => {
                  setLibSearch(e.target.value);
                  setLibVisibleCount(DEFAULT_PAGE_SIZE);
                }}
                placeholder="Search imported masters by title or filename..."
                className="w-full bg-surface-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500"
              />
            </div>

            <div>
              <select
                aria-label="Filter Library Aspect Ratio"
                value={libAspect}
                onChange={(e) => {
                  setLibAspect(e.target.value);
                  setLibVisibleCount(DEFAULT_PAGE_SIZE);
                }}
                className="w-full bg-surface-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500"
              >
                <option value="all">All Aspect Ratios</option>
                <option value="9:16">9:16 Vertical</option>
                <option value="16:9">16:9 Landscape</option>
              </select>
            </div>

            <div>
              <select
                aria-label="Filter Library Source"
                value={libSourceFilter}
                onChange={(e) => {
                  setLibSourceFilter(e.target.value);
                  setLibVisibleCount(DEFAULT_PAGE_SIZE);
                }}
                className="w-full bg-surface-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500"
              >
                <option value="all">All Ingestion Sources</option>
                <option value="pipeline_import">Pipeline Import</option>
                <option value="manual_upload">Manual Upload</option>
              </select>
            </div>

            <div>
              <select
                aria-label="Sort Imported Library"
                value={libSort}
                onChange={(e) => setLibSort(e.target.value as any)}
                className="w-full bg-surface-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-terracotta-500"
              >
                <option value="recent">Imported Date (Newest)</option>
                <option value="oldest">Imported Date (Oldest)</option>
                <option value="name">Title (A–Z)</option>
              </select>
            </div>
          </div>
        )}

        {videos.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs bg-surface/30 rounded-2xl border border-dashed border-border">
            <Film className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
            No videos in library yet. Import a video from the AI pipeline above or upload an MP4.
          </div>
        ) : filteredLibraryVideos.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs bg-surface/30 rounded-2xl border border-dashed border-border space-y-2">
            <div>No imported master videos match your search or filter criteria.</div>
            <button
              type="button"
              onClick={() => {
                setLibSearch('');
                setLibAspect('all');
                setLibSourceFilter('all');
              }}
              className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-lg font-semibold text-slate-200 cursor-pointer"
            >
              Reset Library Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {visibleLibraryVideos.map((vid) => {
                const isSelected = selectedVideoId === vid.id;
                const hasBranded = (vid.branded_variants?.length || 0) > 0;
                const streamUrl = vid.streamUrl || `/uploads/${vid.file_path.split(/[/\\]/).pop()}`;
                const thumbUrl =
                  vid.thumbnailUrl ||
                  (vid.thumbnail_path ? `/uploads/${vid.thumbnail_path.split(/[/\\]/).pop()}` : null);

                return (
                  <div
                    key={vid.id}
                    className={`bg-surface border rounded-2xl overflow-hidden transition-all shadow-xs flex flex-col justify-between ${
                      isSelected
                        ? 'border-terracotta-500 ring-2 ring-terracotta-500/20'
                        : 'border-border hover:border-slate-600'
                    }`}
                  >
                    {/* Master Video Thumbnail & Quick Info */}
                    <div>
                      <div className="aspect-video bg-black relative overflow-hidden group">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt={vid.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-8 h-8 text-slate-600 opacity-60" />
                          </div>
                        )}

                        {/* Aspect Ratio & Duration Overlays */}
                        <span className="absolute top-2 left-2 text-[10px] bg-black/80 backdrop-blur-xs text-white px-2 py-0.5 rounded-md font-mono font-bold">
                          {vid.aspect_ratio || 'Aspect N/A'}
                        </span>
                        <span className="absolute top-2 right-2 text-[10px] bg-black/80 backdrop-blur-xs text-white px-2 py-0.5 rounded-md font-mono">
                          {vid.duration ? `${vid.duration.toFixed(1)}s` : 'Duration N/A'}
                        </span>

                        {/* Play Master Overlay Button */}
                        <button
                          type="button"
                          onClick={() =>
                            setActivePreview({
                              url: streamUrl,
                              title: vid.title,
                              isBranded: false,
                              aspectRatio: vid.aspect_ratio,
                              duration: vid.duration,
                            })
                          }
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 text-white font-bold text-xs transition-opacity cursor-pointer backdrop-blur-xs"
                        >
                          <Play className="w-6 h-6 fill-white text-white drop-shadow" />
                          <span>Play Master (Original)</span>
                        </button>
                      </div>

                      {/* Master Details */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-100 text-xs truncate" title={vid.title}>
                              {vid.title}
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span>{(vid.file_size / 1024 / 1024).toFixed(1)} MB</span>
                              <span>•</span>
                              <span className="uppercase text-terracotta-400 font-bold">
                                {vid.source_type.replace('_', ' ')}
                              </span>
                              {vid.pipeline_job_id && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-slate-400">Job: {vid.pipeline_job_id}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <span className="text-[9px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-1.5 py-0.5 rounded font-bold shrink-0">
                            Unbranded Master
                          </span>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onSelectVideo(vid.id, vid.title)}
                            className={`flex-1 py-1.5 border rounded-xl font-bold text-xs transition-colors cursor-pointer active:scale-95 text-center ${
                              isSelected
                                ? 'bg-terracotta-600 text-white border-terracotta-500'
                                : 'bg-surface-card hover:bg-terracotta-600 text-slate-200 hover:text-white border-border hover:border-terracotta-500'
                            }`}
                          >
                            {isSelected ? 'Selected Master Video' : 'Use Master for Post'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActivePreview({
                                url: streamUrl,
                                title: vid.title,
                                isBranded: false,
                                aspectRatio: vid.aspect_ratio,
                                duration: vid.duration,
                              })
                            }
                            className="p-1.5 bg-surface-card hover:bg-surface-hover text-slate-400 hover:text-slate-200 border border-border rounded-xl cursor-pointer"
                            title="Preview Master"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 3. Branded Variants Sub-List */}
                    {hasBranded && (
                      <div className="p-3 bg-surface-card/60 border-t border-border space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                          <span className="flex items-center gap-1.5 text-sage-400">
                            <Layers className="w-3.5 h-3.5" /> Branded Versions ({vid.branded_variants?.length})
                          </span>
                        </div>

                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {vid.branded_variants?.map((variant) => (
                            <div
                              key={variant.id}
                              className="p-2 bg-surface rounded-xl border border-border/80 flex items-center justify-between text-[11px] hover:border-slate-600 transition-colors"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="font-bold text-slate-200 truncate">{variant.watermark_text}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {variant.movement_preset} • {(variant.file_size / 1024 / 1024).toFixed(1)}MB
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {onSelectVideoVariant && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSelectVideoVariant(
                                        vid.id,
                                        variant.id,
                                        `${vid.title} (${variant.watermark_text})`
                                      )
                                    }
                                    className="px-2 py-0.5 bg-terracotta-500/15 hover:bg-terracotta-500/25 text-terracotta-300 border border-terracotta-500/30 rounded-lg cursor-pointer flex items-center gap-1 text-[10px] font-bold transition-all active:scale-95"
                                    title="Select and publish this branded version"
                                  >
                                    <Send className="w-2.5 h-2.5" />
                                    <span>Publish</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setActivePreview({
                                      url: variant.previewUrl,
                                      title: `${vid.title} (${variant.watermark_text})`,
                                      isBranded: true,
                                      aspectRatio: variant.aspect_ratio,
                                      duration: variant.duration,
                                      watermarkText: variant.watermark_text,
                                    })
                                  }
                                  className="p-1 hover:bg-surface-card text-terracotta-400 rounded-md cursor-pointer"
                                  title="Play Branded Variant"
                                >
                                  <Play className="w-3 h-3 fill-terracotta-400" />
                                </button>

                                <a
                                  href={variant.downloadUrl}
                                  download={`${vid.title}_branded.mp4`}
                                  className="p-1 hover:bg-surface-card text-slate-400 hover:text-slate-200 rounded-md cursor-pointer"
                                  title="Download MP4"
                                >
                                  <Download className="w-3 h-3" />
                                </a>

                                {onDeleteBrandedVariant && (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteBrandedVariant(variant.id)}
                                    className="p-1 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-md cursor-pointer"
                                    title="Remove Branded Variant (Never deletes Master)"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {libVisibleCount < filteredLibraryVideos.length && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setLibVisibleCount((prev) => prev + DEFAULT_PAGE_SIZE)}
                  className="px-5 py-2.5 bg-surface hover:bg-surface-hover border border-border rounded-xl text-xs font-bold text-slate-200 inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <ChevronDown className="w-4 h-4 text-terracotta-400" />
                  Load More Library Videos ({filteredLibraryVideos.length - libVisibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4. REAL IN-BROWSER PLAYBACK MODAL */}
      <Modal
        isOpen={Boolean(activePreview)}
        onClose={() => setActivePreview(null)}
        title={activePreview?.title || 'Video Preview'}
        subtitle={
          activePreview
            ? `${
                activePreview.isBranded
                  ? `Branded MP4 (${activePreview.watermarkText})`
                  : 'Original Master (Unbranded)'
              } • Aspect: ${activePreview.aspectRatio || 'Auto'} • HTTP Range Seeking Enabled`
            : undefined
        }
        maxWidth="max-w-2xl"
        manageFocus
        scrollBody
      >
        {activePreview && (
          <div className="space-y-4 min-h-0 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {activePreview.isBranded ? (
                <span className="text-[10px] bg-terracotta-500/20 text-terracotta-300 border border-terracotta-500/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                  Branded MP4 ({activePreview.watermarkText})
                </span>
              ) : (
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                  Original Master (Unbranded)
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] text-sage-400 font-medium">
                <Volume2 className="w-3.5 h-3.5" /> Audio Track Active
              </span>
            </div>

            <div className="p-4 bg-black rounded-xl border border-border flex items-center justify-center min-h-[320px] overflow-hidden">
              <video
                controls
                autoPlay
                playsInline
                src={activePreview.url}
                className="max-h-[480px] w-full object-contain rounded-xl"
              />
            </div>

            <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 text-[11px]">
                {activePreview.isBranded
                  ? 'Non-destructive export from FFmpeg'
                  : 'Source master video is immutable and untouched'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActivePreview(null)}
                  aria-label="Close Preview"
                  className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border text-slate-200 rounded-xl font-semibold cursor-pointer"
                >
                  Close Preview
                </button>
                <a
                  href={activePreview.url}
                  download
                  className="px-3 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" /> Download MP4
                </a>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
