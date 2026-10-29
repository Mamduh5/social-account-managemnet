import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { publicationCommand, acknowledgePublicationCommand } from '../api/publication-command';
import { publishingHistoryApi } from '../api/publishing-history';
import { useFeatureActive } from '../features/FeatureActivity';
import { useResourceRefresh } from '../api/resource-events';
import {
  Account,
  VideoItem,
  PublishingDestination,
  DiscoveredPipelineJob,
  PipelineHealthStatus,
  DestinationMediaMode,
  PipelineJobsQueryParams,
  PipelineDiscoveryErrorKind,
} from '../types';
import {
  brandingElements,
  resolveBrandingMode,
  type BrandingMode,
} from '../../../server/src/domain/branding-layout';

export interface DestinationConfigEntry {
  caption: string;
  hashtags: string;
  mediaMode: DestinationMediaMode;
  selectedVariantId: string | null;
  applyBranding: boolean;
  brandingOverride?: any;
}

export interface ImportJobNotice {
  type: 'imported' | 'already_imported';
  message: string;
  videoId: string;
}

export interface EffectiveDispatchBrandingDescription {
  mode: BrandingMode;
  modeLabel: string;
  watermarkType: 'moving_text' | 'static_text' | 'logo_overlay';
  effectiveWatermarkText: string;
  isWatermarkTextExplicitlyEmpty: boolean;
  effectiveSignatureText: string;
  movementPreset: string;
  opacityPct: string;
  rendersMovingWatermark: boolean;
  rendersStaticWatermark: boolean;
  rendersBottomCaption: boolean;
  hasVisibleBranding: boolean;
  shortBadge: string;
  cardDescription: string;
  reviewSummary: string;
  warningMessage?: string;
  configSource: 'frozen_override' | 'account_live';
  scheduleResolutionNote: string;
}

export function describeDispatchBranding(
  account: Pick<Account, 'name' | 'handle' | 'brandKit' | 'brand_kit_json'>,
  options?: { brandingOverride?: any; isScheduled?: boolean }
): EffectiveDispatchBrandingDescription {
  let rawKit: any = {};
  let configSource: 'frozen_override' | 'account_live' = 'account_live';
  let invalidOverride = false;

  if (options?.brandingOverride !== undefined && options?.brandingOverride !== null) {
    configSource = 'frozen_override';
    if (typeof options.brandingOverride === 'string') {
      try {
        rawKit = JSON.parse(options.brandingOverride);
      } catch {
        rawKit = {};
        invalidOverride = true;
      }
    } else if (typeof options.brandingOverride === 'object') {
      rawKit = options.brandingOverride;
    } else invalidOverride = true;
    if (!rawKit || typeof rawKit !== 'object' || Array.isArray(rawKit)) { rawKit = {}; invalidOverride = true; }
  } else if (account.brandKit && typeof account.brandKit === 'object') {
    rawKit = account.brandKit;
  } else if (account.brand_kit_json) {
    try {
      rawKit = JSON.parse(account.brand_kit_json);
    } catch {
      rawKit = {};
    }
  }

  const mode = resolveBrandingMode(rawKit || {});
  const elements = brandingElements(rawKit || {});
  const watermarkType: 'moving_text' | 'static_text' | 'logo_overlay' =
    rawKit?.watermarkType || 'moving_text';
  const movementPreset: string = rawKit?.movementPreset || 'smooth_sine';

  // Exact backend nullish-coalescing semantics from queue.service.ts:
  // text: brandKit.text ?? job.account_handle
  // Explicitly empty string "" stays ""; null/undefined falls back to account.handle.
  const effectiveWatermarkText =
    rawKit?.text !== undefined && rawKit?.text !== null
      ? String(rawKit.text)
      : account.handle ?? '';
  const isWatermarkTextExplicitlyEmpty =
    rawKit?.text === '' || effectiveWatermarkText.length === 0;

  const effectiveSignatureText =
    rawKit?.signatureText !== undefined && rawKit?.signatureText !== null
      ? String(rawKit.signatureText)
      : '';

  const opacityPct =
    typeof rawKit?.opacity === 'number' && Number.isFinite(rawKit.opacity)
      ? `${Math.round(Math.max(0, Math.min(1, rawKit.opacity)) * 100)}%`
      : '85%';

  const isStaticWatermark = movementPreset === 'static_corner';
  const hasActiveWatermarkElement = Boolean(
    elements.moving && effectiveWatermarkText.length > 0 && (typeof rawKit?.opacity !== 'number' || rawKit.opacity > 0)
  );
  const rendersMovingWatermark = hasActiveWatermarkElement && !isStaticWatermark;
  const rendersStaticWatermark = hasActiveWatermarkElement && isStaticWatermark;
  const rendersBottomCaption = Boolean(
    elements.caption && effectiveSignatureText.length > 0
  );
  const hasVisibleBranding =
    rendersMovingWatermark || rendersStaticWatermark || rendersBottomCaption;

  const scheduleResolutionNote =
    configSource === 'frozen_override'
      ? `Frozen branding override: this exact branding configuration is saved on the destination and will not change if ${account.name}'s Brand Kit is edited before dispatch.`
      : options?.isScheduled
        ? `Live account branding at dispatch: reads ${account.name}'s saved Brand Kit when the scheduled time arrives (edits to Account Branding before dispatch will apply).`
        : `Live account branding at dispatch: reads ${account.name}'s saved Brand Kit when the queue worker dispatches this destination.`;

  if (invalidOverride) return { mode, modeLabel: 'Invalid frozen branding', watermarkType, effectiveWatermarkText, isWatermarkTextExplicitlyEmpty, effectiveSignatureText, movementPreset, opacityPct, rendersMovingWatermark: false, rendersStaticWatermark: false, rendersBottomCaption: false, hasVisibleBranding: false, shortBadge: 'Review required', cardDescription: 'Frozen branding is invalid and cannot be used.', reviewSummary: 'Invalid frozen branding — publication will be held for review.', warningMessage: 'Frozen branding is invalid; owner review is required.', configSource, scheduleResolutionNote: 'The invalid override will not be replaced by account branding.' };

  if (mode === 'none') {
    return {
      mode,
      modeLabel: 'No Watermark (Disabled in Brand Kit)',
      watermarkType,
      effectiveWatermarkText,
      isWatermarkTextExplicitlyEmpty,
      effectiveSignatureText,
      movementPreset,
      opacityPct,
      rendersMovingWatermark: false,
      rendersStaticWatermark: false,
      rendersBottomCaption: false,
      hasVisibleBranding: false,
      shortBadge: 'No watermark configured',
      cardDescription: `${account.name}'s Brand Kit mode is set to "No Watermark". Dispatching will not render any watermark or caption overlay.`,
      reviewSummary: `No visible branding — ${account.name}'s Brand Kit is set to "No Watermark" (mode: none)`,
      warningMessage: `${account.name}'s Brand Kit is set to "No Watermark". Dispatching in this mode produces no visible branding overlay.`,
      configSource,
      scheduleResolutionNote,
    };
  }

  if (mode === 'caption') {
    if (rendersBottomCaption) {
      return {
        mode,
        modeLabel: 'Bottom Caption Only',
        watermarkType,
        effectiveWatermarkText,
        isWatermarkTextExplicitlyEmpty,
        effectiveSignatureText,
        movementPreset,
        opacityPct,
        rendersMovingWatermark: false,
        rendersStaticWatermark: false,
        rendersBottomCaption: true,
        hasVisibleBranding: true,
        shortBadge: `Caption only: "${effectiveSignatureText}"`,
        cardDescription: `Renders ${account.name}'s fixed bottom caption ("${effectiveSignatureText}") during queue dispatch. No moving watermark.`,
        reviewSummary: `Bottom caption only: "${effectiveSignatureText}" (no moving watermark)`,
        configSource,
        scheduleResolutionNote,
      };
    }

    return {
      mode,
      modeLabel: 'Bottom Caption Only (Empty Text)',
      watermarkType,
      effectiveWatermarkText,
      isWatermarkTextExplicitlyEmpty,
      effectiveSignatureText,
      movementPreset,
      opacityPct,
      rendersMovingWatermark: false,
      rendersStaticWatermark: false,
      rendersBottomCaption: false,
      hasVisibleBranding: false,
      shortBadge: 'No visible branding (empty caption)',
      cardDescription: `${account.name}'s Brand Kit is set to "Bottom Caption Only", but caption text is empty.`,
      reviewSummary: `No visible branding — Bottom Caption Only mode has empty caption text`,
      warningMessage: `${account.name}'s Brand Kit is set to "Bottom Caption Only", but signatureText is empty. No visible branding will be rendered.`,
      configSource,
      scheduleResolutionNote,
    };
  }

  // mode is 'moving' or 'moving_and_caption'
  if (!hasActiveWatermarkElement && !rendersBottomCaption) {
    return {
      mode,
      modeLabel: 'Watermark Text Empty (No Visible Output)',
      watermarkType,
      effectiveWatermarkText,
      isWatermarkTextExplicitlyEmpty: true,
      effectiveSignatureText,
      movementPreset,
      opacityPct,
      rendersMovingWatermark: false,
      rendersStaticWatermark: false,
      rendersBottomCaption: false,
      hasVisibleBranding: false,
      shortBadge: 'No visible branding (empty text)',
      cardDescription: `Watermark text for ${account.name} is explicitly empty (""). No visible watermark will be rendered at dispatch.`,
      reviewSummary: `No visible branding — watermark text is explicitly empty ("")`,
      warningMessage: `Watermark text for ${account.name} is explicitly empty (""). Dispatching will produce no visible watermark.`,
      configSource,
      scheduleResolutionNote,
    };
  }

  if (!hasActiveWatermarkElement && rendersBottomCaption) {
    return {
      mode,
      modeLabel: 'Bottom Caption Only (Watermark Text Empty)',
      watermarkType,
      effectiveWatermarkText,
      isWatermarkTextExplicitlyEmpty: true,
      effectiveSignatureText,
      movementPreset,
      opacityPct,
      rendersMovingWatermark: false,
      rendersStaticWatermark: false,
      rendersBottomCaption: true,
      hasVisibleBranding: true,
      shortBadge: `Caption: "${effectiveSignatureText}" (watermark empty)`,
      cardDescription: `Watermark text is explicitly empty (""); only bottom caption "${effectiveSignatureText}" will be rendered at dispatch.`,
      reviewSummary: `Bottom caption "${effectiveSignatureText}" only (watermark text is explicitly empty "")`,
      warningMessage: `Moving watermark text is explicitly empty (""); only the bottom caption "${effectiveSignatureText}" will be rendered.`,
      configSource,
      scheduleResolutionNote,
    };
  }

  const watermarkKindLabel = rendersStaticWatermark ? 'Static watermark' : 'Moving watermark';

  if (rendersBottomCaption) {
    return {
      mode,
      modeLabel: rendersStaticWatermark
        ? 'Static Watermark + Bottom Caption'
        : 'Moving Watermark + Bottom Caption',
      watermarkType,
      effectiveWatermarkText,
      isWatermarkTextExplicitlyEmpty: false,
      effectiveSignatureText,
      movementPreset,
      opacityPct,
      rendersMovingWatermark,
      rendersStaticWatermark,
      rendersBottomCaption: true,
      hasVisibleBranding: true,
      shortBadge: `${effectiveWatermarkText} • ${movementPreset} + caption`,
      cardDescription: `Renders ${account.name}'s ${watermarkKindLabel.toLowerCase()} "${effectiveWatermarkText}" (${movementPreset}) and bottom caption "${effectiveSignatureText}" during queue dispatch.`,
      reviewSummary: `${watermarkKindLabel} "${effectiveWatermarkText}" (${movementPreset}) + bottom caption "${effectiveSignatureText}"`,
      configSource,
      scheduleResolutionNote,
    };
  }

  return {
    mode,
    modeLabel: rendersStaticWatermark ? 'Static Corner Watermark' : 'Moving Watermark Only',
    watermarkType,
    effectiveWatermarkText,
    isWatermarkTextExplicitlyEmpty: false,
    effectiveSignatureText,
    movementPreset,
    opacityPct,
    rendersMovingWatermark,
    rendersStaticWatermark,
    rendersBottomCaption: false,
    hasVisibleBranding: true,
    shortBadge: `${effectiveWatermarkText} • ${movementPreset}`,
    cardDescription: `Renders ${account.name}'s ${watermarkKindLabel.toLowerCase()} "${effectiveWatermarkText}" (${movementPreset}) during queue dispatch.`,
    reviewSummary: `${watermarkKindLabel} "${effectiveWatermarkText}" (${movementPreset})${
      mode === 'moving_and_caption' ? ' (bottom caption text is empty)' : ''
    }`,
    configSource,
    scheduleResolutionNote,
  };
}

export function resolveDestinationMediaPayload(
  conf: DestinationConfigEntry,
  activeVideo: VideoItem | undefined
): {
  mediaMode: DestinationMediaMode;
  applyBranding: number;
  selectedVariantId: string | null;
  isValid: boolean;
  validationError?: string;
} {
  if (conf.mediaMode === 'original') {
    return {
      mediaMode: 'original',
      applyBranding: 0,
      selectedVariantId: 'original',
      isValid: true,
    };
  }

  if (conf.mediaMode === 'saved_variant') {
    const variantId = conf.selectedVariantId && conf.selectedVariantId !== 'original' ? conf.selectedVariantId : null;
    if (!variantId) {
      return {
        mediaMode: 'saved_variant',
        applyBranding: 0,
        selectedVariantId: null,
        isValid: false,
        validationError: 'Select a saved branded version or choose another media mode.',
      };
    }
    const matchingVariant = (activeVideo?.branded_variants || []).find((v) => v.id === variantId);
    if (!matchingVariant) {
      return {
        mediaMode: 'saved_variant',
        applyBranding: 0,
        selectedVariantId: variantId,
        isValid: false,
        validationError: 'The selected saved branded version does not belong to the current master video.',
      };
    }
    return {
      mediaMode: 'saved_variant',
      applyBranding: 0,
      selectedVariantId: variantId,
      isValid: true,
    };
  }

  // 'dispatch_branding'
  return {
    mediaMode: 'dispatch_branding',
    applyBranding: 1,
    selectedVariantId: null,
    isValid: true,
  };
}

export function usePublishing() {
  const featureActive = useFeatureActive();
  const featureActiveRef = useRef(featureActive); featureActiveRef.current = featureActive;
  const [activeTab, setActiveTab] = useState<'compose' | 'queue' | 'library'>('compose');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [allAccounts, setAccounts] = useState<Account[]>([]);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const accounts = allAccounts.filter((a) => showDemoAccounts || !a.is_demo);
  const [queue, setQueue] = useState<PublishingDestination[]>([]);
  const [activeQueueTotal, setActiveQueueTotal] = useState(0);
  const [activeQueueHasMore, setActiveQueueHasMore] = useState(false);
  const [resourceError, setResourceError] = useState('');
  const videosSequence = useRef(0), accountsSequence = useRef(0), queueSequence = useRef(0);
  const [pipelineFiles, setPipelineFiles] = useState<any[]>([]);
  const [watchIdentityIncomplete, setWatchIdentityIncomplete] = useState(false);
  const [pipelineJobs, setPipelineJobs] = useState<DiscoveredPipelineJob[]>([]);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealthStatus | null>(null);

  // Pipeline Discovery & Pagination State
  const [pipelineQuery, setPipelineQueryState] = useState<Required<Omit<PipelineJobsQueryParams, 'cursor'>>>({
    q: '',
    status: 'completed',
    aspectRatio: 'all',
    importState: 'all',
    sort: 'recent',
    limit: 12,
  });
  const [pipelinePage, setPipelinePage] = useState<{
    limit: number;
    returned: number;
    hasMore: boolean;
    nextCursor: string | null;
  }>({
    limit: 12,
    returned: 0,
    hasMore: false,
    nextCursor: null,
  });
  const [pipelineTotalMatched, setPipelineTotalMatched] = useState<number | undefined>(undefined);
  const [pipelineSourceContract, setPipelineSourceContract] = useState<
    'library_v1' | 'legacy_jobs' | 'offline' | 'error'
  >('legacy_jobs');
  const [pipelineHistoryComplete, setPipelineHistoryComplete] = useState<boolean>(true);
  const [pipelineIncompleteReason, setPipelineIncompleteReason] = useState<string | undefined>(undefined);
  const [pipelineErrorKind, setPipelineErrorKind] = useState<PipelineDiscoveryErrorKind | undefined>(undefined);
  const [pipelineLoading, setPipelineLoading] = useState<boolean>(false);
  const [pipelineLoadingMore, setPipelineLoadingMore] = useState<boolean>(false);
  const [pipelineError, setPipelineError] = useState<string>('');

  // Per-video Import Tracking State
  const [importingJobIds, setImportingJobIds] = useState<Record<string, boolean>>({});
  const [importJobErrors, setImportJobErrors] = useState<Record<string, string>>({});
  const [importJobNotices, setImportJobNotices] = useState<Record<string, ImportJobNotice>>({});
  const [importingFilePaths, setImportingFilePaths] = useState<Record<string, boolean>>({});
  const [importFileErrors, setImportFileErrors] = useState<Record<string, string>>({});

  // Composer Form State
  const [selectedVideoId, setSelectedVideoIdState] = useState<string>('');
  const [selectedVariantId, setSelectedVariantIdState] = useState<string>('original');
  const [mediaSelectionNotice, setMediaSelectionNotice] = useState<string>('');
  const [postTitle, setPostTitle] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [destinationConfig, setDestinationConfig] = useState<Record<string, DestinationConfigEntry>>({});

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submitting state & synchronous lock
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [syncingPipeline, setSyncingPipeline] = useState(false);

  // Request-generation fencing & debounce refs for pipeline discovery
  const pipelineQueryRef = useRef(pipelineQuery);
  pipelineQueryRef.current = pipelineQuery;
  const discoverySeqRef = useRef(0);
  const filterGenerationRef = useRef(0);
  const discoveryAbortRef = useRef<AbortController | null>(null);
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPipelineDiscovery = useCallback(
    async (
      queryOverride?: Partial<PipelineJobsQueryParams>,
      options?: { append?: boolean; cursor?: string | null; silent?: boolean }
    ) => {
      if (!featureActiveRef.current) return;
      const effectiveQuery = {
        ...pipelineQueryRef.current,
        ...(queryOverride || {}),
      };
      const isAppend = Boolean(options?.append && options?.cursor);

      // Increment request sequence & abort any superseded in-flight request
      const reqSeq = ++discoverySeqRef.current;
      const filterGenAtStart = filterGenerationRef.current;
      if (discoveryAbortRef.current) {
        discoveryAbortRef.current.abort();
      }
      const controller = new AbortController();
      discoveryAbortRef.current = controller;
      setSyncingPipeline(false);
      setPipelineLoading(false);

      if (isAppend) {
        setPipelineLoadingMore(true);
      } else {
        setPipelineLoadingMore(false);
        if (!options?.silent) {
          setPipelineLoading(true);
        }
      }
      setPipelineError('');
      setPipelineErrorKind(undefined);

      try {
        const res = await api.getPipelineStatus(
          {
            q: effectiveQuery.q || undefined,
            status: effectiveQuery.status,
            aspectRatio: effectiveQuery.aspectRatio,
            importState: effectiveQuery.importState,
            sort: effectiveQuery.sort,
            limit: effectiveQuery.limit,
            cursor: isAppend ? options?.cursor : undefined,
          },
          controller.signal
        );

        // Fence 1: Discard stale response if a newer discovery/sync request has started
        if (reqSeq !== discoverySeqRef.current) {
          return;
        }
        // Fence 2: Never append a cursor page if search/filter/sort changed while in flight
        if (filterGenAtStart !== filterGenerationRef.current) {
          return;
        }

        setPipelineFiles(res.files || []);
        setWatchIdentityIncomplete(res.watchIdentityIncomplete === true);
        if (res.health) {
          setPipelineHealth(res.health);
        }
        if (res.sourceContract) {
          setPipelineSourceContract(res.sourceContract);
        }
        setPipelineHistoryComplete(res.historyComplete !== false);
        setPipelineIncompleteReason(res.incompleteReason);
        setPipelineTotalMatched(res.totalMatched);
        setPipelineErrorKind(res.errorKind);

        const reportedError =
          res.discoveryError ||
          (res.errorKind && res.errorKind !== 'incomplete_history' ? res.incompleteReason || res.health?.error : '');

        if (reportedError) {
          setPipelineError(reportedError);
          if (isAppend) {
            // Preserve already-loaded page 1 items when Load Older fails (e.g. expired cursor or timeout)
            if (res.errorKind === 'invalid_cursor') {
              setPipelinePage((prev) => ({ ...prev, hasMore: false, nextCursor: null }));
            }
            return;
          }
          setPipelineJobs([]);
          setPipelinePage({
            limit: effectiveQuery.limit,
            returned: 0,
            hasMore: false,
            nextCursor: null,
          });
          return;
        }

        const incomingJobs = res.jobs || [];
        setPipelineJobs((prev) => {
          if (!isAppend) return incomingJobs;
          const seen = new Set(prev.map((j) => j.jobId));
          const merged = [...prev];
          for (const item of incomingJobs) {
            if (!seen.has(item.jobId)) {
              seen.add(item.jobId);
              merged.push(item);
            }
          }
          return merged;
        });

        setPipelinePage(
          res.page || {
            limit: effectiveQuery.limit,
            returned: incomingJobs.length,
            hasMore: false,
            nextCursor: null,
          }
        );
      } catch (err: any) {
        if (err?.name === 'AbortError' || reqSeq !== discoverySeqRef.current) {
          return;
        }
        setPipelineError(err instanceof Error ? err.message : 'Failed to query AI Video Pipeline.');
      } finally {
        if (reqSeq === discoverySeqRef.current) {
          setPipelineLoading(false);
          setPipelineLoadingMore(false);
        }
      }
    },
    []
  );

  const loadVideos = useCallback(async () => {
    const token = ++videosSequence.current;
    try {
      const vRes = await api.getVideos();
      if (token !== videosSequence.current) return;
      const loadedVideos = vRes.videos || [];
      setVideos(loadedVideos);
      setSelectedVideoIdState((prev) => prev || loadedVideos[0]?.id || '');
    } catch (err) { if (token === videosSequence.current) setResourceError(err instanceof Error ? err.message : 'Video library unavailable.'); }
  }, []);
  const loadAccounts = useCallback(async () => {
    const token = ++accountsSequence.current;
    try {
      const aRes = await api.getAccounts();
      if (token !== accountsSequence.current) return;
      setAccounts(aRes.accounts || []);
      try {
        const prepareId = sessionStorage.getItem('prepareAccountId');
        if (prepareId && aRes.accounts.some((a) => a.id === prepareId && !a.is_demo)) {
          setSelectedAccountIds([prepareId]);
          sessionStorage.removeItem('prepareAccountId');
        }
      } catch {
        // Ignore sessionStorage SecurityError in restricted/blank origins
      }
    } catch (err) { if (token === accountsSequence.current) setResourceError(err instanceof Error ? err.message : 'Accounts unavailable.'); }
  }, []);
  const loadQueue = useCallback(async () => {
    const token = ++queueSequence.current;
    try {
      const result = await publishingHistoryApi.active();
      if (token !== queueSequence.current) return;
      setQueue(result.queue || []); setActiveQueueTotal(result.total); setActiveQueueHasMore(result.hasMore);
    } catch (err) { if (token === queueSequence.current) setResourceError(err instanceof Error ? err.message : 'Active queue unavailable.'); }
  }, []);
  useResourceRefresh(['publishing'], loadQueue);
  useResourceRefresh(['videos'], loadVideos);
  useResourceRefresh(['accounts'], loadAccounts);
  const refreshPublishing = useCallback(async () => {
    await loadQueue();
    window.dispatchEvent(new Event('scc:history-changed'));
  }, [loadQueue]);
  const loadOperationalData = useCallback(async () => {
    setResourceError('');
    await Promise.all([loadVideos(), loadAccounts(), loadQueue()]);
  }, [loadVideos, loadAccounts, loadQueue]);

  const loadData = useCallback(async () => {
    await Promise.all([
      loadOperationalData(),
      fetchPipelineDiscovery(undefined, { silent: true }),
    ]);
  }, [loadOperationalData, fetchPipelineDiscovery]);

  useEffect(() => {
    if (!featureActive) return;
    loadData();
    const onCleanupChanged = () => {
      // A failed refresh must not leave a newly hidden watch entry on screen.
      setPipelineFiles([]);
      void loadData();
    };
    window.addEventListener('scc:cleanup-changed', onCleanupChanged);
    let polling = false;
    const interval = setInterval(async () => { if (polling) return; polling = true; try { await loadQueue(); } finally { polling = false; } }, 5000);
    return () => {
      videosSequence.current++; accountsSequence.current++; queueSequence.current++;
      window.removeEventListener('scc:cleanup-changed', onCleanupChanged);
      clearInterval(interval);
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
      discoveryAbortRef.current?.abort();
    };
  }, [featureActive, loadData, loadQueue]);

  // Update pipeline query and fetch matching page 1 (with debouncing for rapid text search updates)
  const updatePipelineQuery = useCallback(
    async (
      patch: Partial<Omit<PipelineJobsQueryParams, 'cursor'>>,
      options?: { immediate?: boolean }
    ) => {
      const prev = pipelineQueryRef.current;
      const next = { ...prev, ...patch };
      setPipelineQueryState(next);
      pipelineQueryRef.current = next;

      // Increment filter generation immediately so any in-flight Load Older cursor response is fenced off
      filterGenerationRef.current += 1;
      discoverySeqRef.current += 1;
      setSyncingPipeline(false);
      setPipelineLoading(false);
      setPipelineJobs([]);
      setPipelinePage(prev => ({ ...prev, hasMore: false, nextCursor: null }));
      setPipelineLoadingMore(false);

      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }

      const patchKeys = Object.keys(patch);
      const isOnlySearchTyping =
        !options?.immediate &&
        patchKeys.length === 1 &&
        patchKeys[0] === 'q' &&
        typeof patch.q === 'string' &&
        patch.q.trim().length > 0;

      if (isOnlySearchTyping) {
        // Cancel any currently in-flight discovery request immediately and debounce the network fetch
        if (discoveryAbortRef.current) {
          discoveryAbortRef.current.abort();
        }
        setPipelineLoading(true);
        await new Promise<void>((resolve) => {
          searchDebounceTimerRef.current = setTimeout(async () => {
            searchDebounceTimerRef.current = null;
            await fetchPipelineDiscovery(next, { append: false });
            resolve();
          }, 120);
        });
        return;
      }

      await fetchPipelineDiscovery(next, { append: false });
    },
    [fetchPipelineDiscovery]
  );

  const loadMorePipelineJobs = useCallback(async () => {
    if (!pipelinePage.hasMore || !pipelinePage.nextCursor || pipelineLoadingMore || pipelineLoading) return;
    await fetchPipelineDiscovery(undefined, { append: true, cursor: pipelinePage.nextCursor });
  }, [pipelinePage, pipelineLoadingMore, pipelineLoading, fetchPipelineDiscovery]);

  // Safe master video switch: revalidates saved branded variant selections across composer & all destinations
  const setSelectedVideoId = useCallback(
    (nextVideoId: string) => {
        if (selectedVideoId === nextVideoId) return;
        const nextVideo = videos.find((v) => v.id === nextVideoId);
        const validVariantIds = new Set((nextVideo?.branded_variants || []).map((v) => v.id));
        const invalidatedAny = Object.values(destinationConfig).some(entry => entry.mediaMode === 'saved_variant' && (!entry.selectedVariantId || !validVariantIds.has(entry.selectedVariantId)));

        setSelectedVariantIdState((prevVar) => {
          if (prevVar === 'original' || prevVar === 'dispatch_branding') return prevVar;
          return validVariantIds.has(prevVar) ? prevVar : 'original';
        });

        setDestinationConfig((prevConfig) => {
          const updated = { ...prevConfig };
          let changed = false;
          for (const [accId, entry] of Object.entries(updated)) {
            if (entry.mediaMode === 'saved_variant') {
              if (!entry.selectedVariantId || !validVariantIds.has(entry.selectedVariantId)) {
                changed = true;
                updated[accId] = {
                  ...entry,
                  selectedVariantId: null,
                  applyBranding: false,
                };
              }
            }
          }
          return changed ? updated : prevConfig;
        });
        setMediaSelectionNotice(invalidatedAny && nextVideo ? `Switched master video to "${nextVideo.title}". Previously selected saved branded version does not belong to this master and was cleared — please select a valid variant or choose another media mode.` : '');

        if (nextVideo) {
          setPostTitle(nextVideo.title);
        }

        setSelectedVideoIdState(nextVideoId);
    },
    [videos, selectedVideoId, destinationConfig]
  );

  // Also revalidate if the currently selected video's variants array changes (e.g. a variant was deleted)
  useEffect(() => {
    const activeVideo = videos.find((v) => v.id === selectedVideoId);
    if (!activeVideo) return;
    const validVariantIds = new Set((activeVideo.branded_variants || []).map((v) => v.id));

    setSelectedVariantIdState((prevVar) => {
      if (prevVar === 'original' || prevVar === 'dispatch_branding') return prevVar;
      return validVariantIds.has(prevVar) ? prevVar : 'original';
    });

    setDestinationConfig((prevConfig) => {
      let changed = false;
      const updated = { ...prevConfig };
      for (const [accId, entry] of Object.entries(updated)) {
        if (entry.mediaMode === 'saved_variant' && entry.selectedVariantId && !validVariantIds.has(entry.selectedVariantId)) {
          changed = true;
          updated[accId] = {
            ...entry,
            selectedVariantId: null,
            applyBranding: false,
          };
        }
      }
      return changed ? updated : prevConfig;
    });
  }, [selectedVideoId, videos]);

  // Apply composer-level media mode/variant across all destinations so top-level and per-destination states never contradict
  const setSelectedVariantId = useCallback((variantOrMode: string) => {
    setSelectedVariantIdState(variantOrMode);
    setMediaSelectionNotice('');
    setDestinationConfig((prev) => {
      const updated = { ...prev };
      for (const accId of Object.keys(updated)) {
        if (variantOrMode === 'original') {
          updated[accId] = {
            ...updated[accId],
            mediaMode: 'original',
            selectedVariantId: 'original',
            applyBranding: false,
          };
        } else if (variantOrMode === 'dispatch_branding') {
          updated[accId] = {
            ...updated[accId],
            mediaMode: 'dispatch_branding',
            selectedVariantId: null,
            applyBranding: true,
          };
        } else {
          updated[accId] = {
            ...updated[accId],
            mediaMode: 'saved_variant',
            selectedVariantId: variantOrMode,
            applyBranding: false,
          };
        }
      }
      return updated;
    });
  }, []);

  // Set explicit media mode for a single destination account
  const setDestinationMediaMode = useCallback(
    (accountId: string, mediaMode: DestinationMediaMode, variantId?: string | null) => {
      setMediaSelectionNotice('');
      setDestinationConfig((prev) => {
        const existing = prev[accountId] || {
          caption: postTitle,
          hashtags: '',
          mediaMode: 'original',
          selectedVariantId: 'original',
          applyBranding: false,
        };

        let nextVariantId: string | null = null;
        if (mediaMode === 'original') {
          nextVariantId = 'original';
        } else if (mediaMode === 'saved_variant') {
          if (variantId !== undefined) {
            nextVariantId = variantId;
          } else {
            const activeVideo = videos.find((v) => v.id === selectedVideoId);
            const firstVariant = activeVideo?.branded_variants?.[0]?.id || null;
            nextVariantId =
              existing.selectedVariantId && existing.selectedVariantId !== 'original'
                ? existing.selectedVariantId
                : firstVariant;
          }
        } else {
          nextVariantId = null;
        }

        return {
          ...prev,
          [accountId]: {
            ...existing,
            mediaMode,
            selectedVariantId: nextVariantId,
            applyBranding: mediaMode === 'dispatch_branding',
          },
        };
      });
    },
    [postTitle, selectedVideoId, videos]
  );

  // Initialize default per-destination config when video or accounts load
  useEffect(() => {
    const activeVideo = videos.find((v) => v.id === selectedVideoId);
    if (!activeVideo) return;

    setPostTitle((prev) => prev || activeVideo.title);

    setDestinationConfig((prev) => {
      const newConfig = { ...prev };
      let changed = false;
      for (const acc of accounts) {
        if (!newConfig[acc.id]) {
          changed = true;
          let initialMode: DestinationMediaMode = 'original';
          let initialVariant: string | null = 'original';
          if (selectedVariantId === 'dispatch_branding') {
            initialMode = 'dispatch_branding';
            initialVariant = null;
          } else if (selectedVariantId && selectedVariantId !== 'original') {
            initialMode = 'saved_variant';
            initialVariant = selectedVariantId;
          }
          newConfig[acc.id] = {
            caption: acc.settings?.defaultCaption || `${activeVideo.title} — created with AI video synthesis`,
            hashtags: acc.settings?.defaultHashtags || '',
            mediaMode: initialMode,
            selectedVariantId: initialVariant,
            applyBranding: initialMode === 'dispatch_branding',
          };
        }
      }
      return changed ? newConfig : prev;
    });
  }, [selectedVideoId, selectedVariantId, accounts, videos]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(20);
    setUploadError('');

    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

    try {
      setUploadProgress(60);
      const res = await api.uploadVideo(formData);
      setUploadProgress(100);
      await loadVideos();
      if (res.videoId) {
        setSelectedVideoIdState(res.videoId);
        setPostTitle(res.title);
      }
    } catch (err: any) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload video file.');
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleImportPipelineFile = async (filePath: string, filename: string, options?: { stayInLibrary?: boolean }) => {
    if (importingFilePaths[filePath]) return;
    setImportingFilePaths((prev) => ({ ...prev, [filePath]: true }));
    setImportFileErrors((prev) => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });

    try {
      const res = await api.importPipelineFile(filePath, filename.replace(/\.mp4$/i, ''));
      await loadVideos();
      setPipelineFiles((prev) =>
        prev.map((f) => (f.fullPath === filePath ? { ...f, isImported: true, importedVideoId: res.videoId } : f))
      );
      if (res.videoId) {
        setSelectedVideoId(res.videoId);
        if (!options?.stayInLibrary) {
          setActiveTab('compose');
        }
      }
    } catch (err: any) {
      setImportFileErrors((prev) => ({
        ...prev,
        [filePath]: err instanceof Error ? err.message : 'Failed to import local video file.',
      }));
    } finally {
      setImportingFilePaths((prev) => ({ ...prev, [filePath]: false }));
    }
  };

  const handleImportPipelineJob = async (
    jobId: string,
    title?: string,
    options?: { stayInLibrary?: boolean }
  ): Promise<{ videoId?: string; alreadyExisted?: boolean } | undefined> => {
    if (importingJobIds[jobId]) return;
    setImportingJobIds((prev) => ({ ...prev, [jobId]: true }));
    setImportJobErrors((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });

    try {
      const res = await api.importPipelineJob(jobId, title);
      setPipelineJobs((prev) =>
        prev.map((job) =>
          job.jobId === jobId
            ? { ...job, isImported: true, importedVideoId: res.videoId, importEligible: true }
            : job
        )
      );
      setImportJobNotices((prev) => ({
        ...prev,
        [jobId]: {
          type: res.alreadyExisted ? 'already_imported' : 'imported',
          message: res.alreadyExisted
            ? 'Already in Imported Library — ready for publishing.'
            : 'Imported into Library successfully.',
          videoId: res.videoId,
        },
      }));

      await loadVideos();
      if (res.videoId) {
        setSelectedVideoId(res.videoId);
        if (title) setPostTitle(title);
        if (!options?.stayInLibrary) {
          setActiveTab('compose');
        }
      }
      return { videoId: res.videoId, alreadyExisted: res.alreadyExisted };
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Failed to import video from AI Video Pipeline.';
      setImportJobErrors((prev) => ({ ...prev, [jobId]: message }));
      return undefined;
    } finally {
      setImportingJobIds((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  const handleSyncPipeline = async () => {
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
    if (discoveryAbortRef.current) {
      discoveryAbortRef.current.abort();
    }
    const reqSeq = ++discoverySeqRef.current;
    filterGenerationRef.current += 1;
    const controller = new AbortController();
    discoveryAbortRef.current = controller;

    setSyncingPipeline(true);
    setPipelineLoading(false);
    setPipelineLoadingMore(false);
    setPipelineError('');
    setPipelineErrorKind(undefined);

    try {
      const res = await api.syncPipeline(
        {
          q: pipelineQueryRef.current.q || undefined,
          status: pipelineQueryRef.current.status,
          aspectRatio: pipelineQueryRef.current.aspectRatio,
          importState: pipelineQueryRef.current.importState,
          sort: pipelineQueryRef.current.sort,
          limit: pipelineQueryRef.current.limit,
        },
        controller.signal
      );
      if (reqSeq !== discoverySeqRef.current) return;
      if (res.health) setPipelineHealth(res.health);
      if (res.jobs) setPipelineJobs(res.jobs);
      if (res.page) setPipelinePage(res.page);
      if (res.sourceContract) setPipelineSourceContract(res.sourceContract);
      setPipelineHistoryComplete(res.historyComplete !== false);
      setPipelineIncompleteReason(res.incompleteReason);
      setPipelineTotalMatched(res.totalMatched);
      setPipelineErrorKind(res.errorKind);
    } catch (err: any) {
      if (err?.name === 'AbortError' || reqSeq !== discoverySeqRef.current) return;
      const errMsg = err instanceof Error ? err.message : 'Upstream AI video pipeline is not reachable.';
      setPipelineError(errMsg);
    } finally {
      if (reqSeq === discoverySeqRef.current) {
        setSyncingPipeline(false);
      }
    }
  };

  const handleDeleteBrandedVariant = async (variantId: string) => {
    try {
      await api.deleteBrandedVariant(variantId);
      await loadVideos();
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : 'Could not delete the branded variant.');
    }
  };

  const toggleAccountSelection = (accId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  const selectAllAccounts = () => {
    if (selectedAccountIds.length === accounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(accounts.map((a) => a.id));
    }
  };

  const copyFirstCaptionToAll = () => {
    if (selectedAccountIds.length === 0) return;
    const firstAccId = selectedAccountIds[0];
    const sourceConfig = destinationConfig[firstAccId];
    if (!sourceConfig) return;

    setDestinationConfig((prev) => {
      const updated = { ...prev };
      for (const id of selectedAccountIds) {
        if (id !== firstAccId) {
          updated[id] = {
            ...updated[id],
            caption: sourceConfig.caption,
            hashtags: sourceConfig.hashtags,
            mediaMode: sourceConfig.mediaMode,
            selectedVariantId: sourceConfig.selectedVariantId,
            applyBranding: sourceConfig.applyBranding,
          };
        }
      }
      return updated;
    });
  };

  const handleSelectVideoVariant = (videoId: string, variantId: string, title?: string) => {
    setSelectedVideoIdState(videoId);
    setSelectedVariantId(variantId);
    if (title) setPostTitle(title);
    setActiveTab('compose');
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Synchronous re-entrancy guard prevents duplicate submissions before React state re-renders
    if (submittingRef.current || submitting) return;
    if (!selectedVideoId || selectedAccountIds.length === 0) return;

    const activeVideo = videos.find((v) => v.id === selectedVideoId);
    if (!activeVideo) {
      setSubmitError('Selected master video is no longer available.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      let scheduledAt: string | null = null;
      if (isScheduled) {
        // The form explicitly displays Bangkok time, independent of browser TZ.
        const timestamp = Date.parse(`${scheduleTime}+07:00`);
        if (!scheduleTime || !Number.isFinite(timestamp) || timestamp <= Date.now()) {
          throw new Error('Choose a future date and time in Asia/Bangkok.');
        }
        scheduledAt = new Date(timestamp).toISOString();
      }

      const destinations = selectedAccountIds.map((accountId) => {
        const account = accounts.find((a) => a.id === accountId);
        const conf: DestinationConfigEntry = destinationConfig[accountId] || {
          caption: postTitle,
          hashtags: '',
          mediaMode: 'original',
          selectedVariantId: 'original',
          applyBranding: false,
        };

        const resolved = resolveDestinationMediaPayload(conf, activeVideo);
        if (!resolved.isValid) {
          throw new Error(
            `${account?.name || accountId}: ${resolved.validationError || 'Invalid media selection.'}`
          );
        }

        return {
          accountId,
          caption: conf.caption,
          hashtags: conf.hashtags,
          applyBranding: resolved.applyBranding === 1,
          selectedVariantId: resolved.selectedVariantId,
          brandingOverride: conf.brandingOverride,
        };
      });

      const topLevelVariant =
        selectedVariantId === 'dispatch_branding' ? null : selectedVariantId || 'original';

      const payload = {
        videoId: selectedVideoId,
        title: postTitle,
        scheduledAt,
        selectedVariantId: topLevelVariant,
        destinations,
      };
      const commandId = await publicationCommand(payload);
      await api.createPost({ ...payload, commandId });
      acknowledgePublicationCommand(commandId);

      await refreshPublishing();
      setActiveTab('queue');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Publishing request failed.');
      console.error('Publish submit failed:', err);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleRetryDestination = async (id: string) => {
    try {
      await api.retryDestination(id);
      await refreshPublishing();
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : 'Destination could not be retried.');
    }
  };

  const handleCancelDestination = async (id: string) => {
    try {
      await api.cancelDestination(id);
      await refreshPublishing();
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : 'Destination could not be cancelled.');
    }
  };

  return {
    activeTab,
    setActiveTab,
    showDemoAccounts,
    setShowDemoAccounts,
    videos,
    accounts,
    queue,
    activeQueueTotal,
    activeQueueHasMore,
    resourceError,
    pipelineFiles,
    watchIdentityIncomplete,
    pipelineJobs,
    pipelineHealth,
    pipelineQuery,
    updatePipelineQuery,
    pipelinePage,
    pipelineTotalMatched,
    pipelineSourceContract,
    pipelineHistoryComplete,
    pipelineIncompleteReason,
    pipelineErrorKind,
    pipelineLoading,
    pipelineLoadingMore,
    pipelineError,
    loadMorePipelineJobs,
    fetchPipelineDiscovery,
    importingJobIds,
    importJobErrors,
    importJobNotices,
    importingFilePaths,
    importFileErrors,
    syncingPipeline,
    selectedVideoId,
    setSelectedVideoId,
    selectedVariantId,
    setSelectedVariantId,
    setDestinationMediaMode,
    mediaSelectionNotice,
    setMediaSelectionNotice,
    handleSelectVideoVariant,
    postTitle,
    setPostTitle,
    isScheduled,
    setIsScheduled,
    scheduleTime,
    setScheduleTime,
    selectedAccountIds,
    destinationConfig,
    setDestinationConfig,
    uploading,
    uploadProgress,
    uploadError,
    fileInputRef,
    submitting,
    submitError,
    loadData,
    loadOperationalData,
    refreshPublishing,
    handleFileUpload,
    handleImportPipelineFile,
    handleImportPipelineJob,
    handleSyncPipeline,
    handleDeleteBrandedVariant,
    toggleAccountSelection,
    selectAllAccounts,
    copyFirstCaptionToAll,
    handlePublishSubmit,
    handleRetryDestination,
    handleCancelDestination,
  };
}
