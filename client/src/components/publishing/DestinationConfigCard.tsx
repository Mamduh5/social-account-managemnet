import React from 'react';
import {
  Film,
  Sparkles,
  Wand2,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Account, BrandedVideo, DestinationMediaMode, VideoItem } from '../../types';
import { DestinationConfigEntry, describeDispatchBranding } from '../../hooks/usePublishing';

export interface DestinationConfigCardProps {
  account: Account;
  selectedVideo?: VideoItem;
  config: DestinationConfigEntry;
  isScheduled?: boolean;
  onConfigChange: (accId: string, updates: Partial<DestinationConfigEntry>) => void;
  onMediaModeChange: (accId: string, mode: DestinationMediaMode, variantId?: string | null) => void;
  onPreviewMedia?: (url: string, title: string, aspectRatio: string) => void;
}

const MODE_ORDER: DestinationMediaMode[] = ['original', 'saved_variant', 'dispatch_branding'];

export const DestinationConfigCard: React.FC<DestinationConfigCardProps> = ({
  account: acc,
  selectedVideo,
  config,
  isScheduled = false,
  onConfigChange,
  onMediaModeChange,
  onPreviewMedia,
}) => {
  const savedVariants: BrandedVideo[] = selectedVideo?.branded_variants || [];
  const activeMode: DestinationMediaMode = config.mediaMode || 'original';

  const radioRefs = React.useRef<Record<DestinationMediaMode, HTMLDivElement | null>>({
    original: null,
    saved_variant: null,
    dispatch_branding: null,
  });

  const selectedSavedVariant =
    activeMode === 'saved_variant' && config.selectedVariantId
      ? savedVariants.find((v) => v.id === config.selectedVariantId)
      : undefined;

  const isSavedVariantInvalid = activeMode === 'saved_variant' && !selectedSavedVariant;

  const brandingInfo = React.useMemo(
    () =>
      describeDispatchBranding(acc, {
        brandingOverride: config.brandingOverride,
        isScheduled,
      }),
    [acc, config.brandingOverride, isScheduled]
  );

  const originalStreamUrl =
    selectedVideo?.streamUrl ||
    (selectedVideo?.file_path
      ? `/uploads/${selectedVideo.file_path.split(/[\\/]/).pop()}`
      : '');

  const focusAndSelectMode = (targetMode: DestinationMediaMode) => {
    onMediaModeChange(acc.id, targetMode);
    radioRefs.current[targetMode]?.focus();
  };

  const handleRadioKeyDown = (e: React.KeyboardEvent, currentMode: DestinationMediaMode) => {
    const idx = MODE_ORDER.indexOf(currentMode);
    if (idx === -1) return;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusAndSelectMode(e.key === 'Home' ? MODE_ORDER[0] : MODE_ORDER[MODE_ORDER.length - 1]);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
      focusAndSelectMode(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = MODE_ORDER[(idx - 1 + MODE_ORDER.length) % MODE_ORDER.length];
      focusAndSelectMode(prev);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      focusAndSelectMode(currentMode);
    }
  };

  const captionInputId = `dest-caption-${acc.id}`;
  const hashtagsInputId = `dest-hashtags-${acc.id}`;
  const variantSelectId = `dest-variant-select-${acc.id}`;

  return (
    <div
      data-testid={`destination-config-card-${acc.id}`}
      className="bg-surface p-4 rounded-2xl border border-border text-xs space-y-4 transition-colors"
    >
      {/* Destination Header & Capability Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              acc.platform === 'facebook' ? 'bg-blue-400' : 'bg-rose-400'
            }`}
          />
          <div className="min-w-0">
            <div className="font-bold text-slate-100 text-sm truncate">
              {acc.name}{' '}
              <span className="text-xs font-normal text-slate-400">
                (@{acc.handle} • {acc.platform === 'facebook' ? 'Facebook Page' : 'TikTok'})
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {acc.is_demo ? (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Demo Simulation Only
            </span>
          ) : acc.capabilities?.canPublish ? (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Publish via API
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/15 text-slate-300 border border-slate-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Prepare for Manual Publishing
            </span>
          )}
        </div>
      </div>

      {/* Explicit Media Selection Model */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200">
            Destination Media Selection
          </span>
          <span className="text-[11px] text-slate-400">
            Choose exact video output for {acc.name}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label={`Media mode for ${acc.name}`}
          className="grid grid-cols-1 md:grid-cols-3 gap-2.5"
        >
          {/* Option 1: Original — Unbranded Master */}
          <div
            ref={(el) => {
              radioRefs.current.original = el;
            }}
            role="radio"
            aria-checked={activeMode === 'original'}
            tabIndex={activeMode === 'original' ? 0 : -1}
            data-testid={`media-mode-original-${acc.id}`}
            onClick={() => onMediaModeChange(acc.id, 'original')}
            onKeyDown={(e) => handleRadioKeyDown(e, 'original')}
            className={`cursor-pointer rounded-xl p-3 border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 flex flex-col justify-between gap-2 ${
              activeMode === 'original'
                ? 'bg-terracotta-500/15 border-terracotta-500/60 text-slate-100 shadow-sm'
                : 'bg-surface-card border-border/80 text-slate-300 hover:border-slate-500/60 hover:bg-surface-elevated/40'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5 font-bold text-xs text-slate-100">
                  <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  Original — Unbranded Master
                </span>
                <span
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                    activeMode === 'original'
                      ? 'border-terracotta-400 bg-terracotta-500'
                      : 'border-slate-500'
                  }`}
                >
                  {activeMode === 'original' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Uses the immutable master file directly. No watermark is applied.
              </p>
            </div>
            <div className="pt-1.5 border-t border-border/50 flex items-center justify-between gap-1 text-[10px]">
              <span className="font-mono text-slate-300 truncate" title={selectedVideo?.original_filename || 'No master selected'}>
                {selectedVideo
                  ? `${selectedVideo.original_filename} (${selectedVideo.aspect_ratio})`
                  : 'Select a master video'}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold shrink-0">
                Unbranded
              </span>
            </div>
          </div>

          {/* Option 2: Saved Branded Version */}
          <div
            ref={(el) => {
              radioRefs.current.saved_variant = el;
            }}
            role="radio"
            aria-checked={activeMode === 'saved_variant'}
            tabIndex={activeMode === 'saved_variant' ? 0 : -1}
            data-testid={`media-mode-saved-variant-${acc.id}`}
            onClick={() => onMediaModeChange(acc.id, 'saved_variant')}
            onKeyDown={(e) => handleRadioKeyDown(e, 'saved_variant')}
            className={`cursor-pointer rounded-xl p-3 border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 flex flex-col justify-between gap-2 ${
              activeMode === 'saved_variant'
                ? isSavedVariantInvalid
                  ? 'bg-amber-500/15 border-amber-500/70 text-slate-100 shadow-sm'
                  : 'bg-terracotta-500/15 border-terracotta-500/60 text-slate-100 shadow-sm'
                : 'bg-surface-card border-border/80 text-slate-300 hover:border-slate-500/60 hover:bg-surface-elevated/40'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5 font-bold text-xs text-slate-100">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Saved Branded Version
                </span>
                <span
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                    activeMode === 'saved_variant'
                      ? 'border-terracotta-400 bg-terracotta-500'
                      : 'border-slate-500'
                  }`}
                >
                  {activeMode === 'saved_variant' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Uses a pre-rendered branded MP4 belonging to this master video.
              </p>
            </div>
            <div className="pt-1.5 border-t border-border/50 flex items-center justify-between gap-1 text-[10px]">
              <span className="text-slate-300 truncate">
                {savedVariants.length > 0
                  ? `${savedVariants.length} saved render${savedVariants.length === 1 ? '' : 's'} available`
                  : 'No saved renders for this master'}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded font-semibold shrink-0 border ${
                  savedVariants.length > 0
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {savedVariants.length > 0 ? 'Pre-rendered' : 'None saved'}
              </span>
            </div>
          </div>

          {/* Option 3: Apply Account Branding at Dispatch */}
          <div
            ref={(el) => {
              radioRefs.current.dispatch_branding = el;
            }}
            role="radio"
            aria-checked={activeMode === 'dispatch_branding'}
            tabIndex={activeMode === 'dispatch_branding' ? 0 : -1}
            data-testid={`media-mode-dispatch-branding-${acc.id}`}
            onClick={() => onMediaModeChange(acc.id, 'dispatch_branding')}
            onKeyDown={(e) => handleRadioKeyDown(e, 'dispatch_branding')}
            className={`cursor-pointer rounded-xl p-3 border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 flex flex-col justify-between gap-2 ${
              activeMode === 'dispatch_branding'
                ? !brandingInfo.hasVisibleBranding
                  ? 'bg-amber-500/15 border-amber-500/70 text-slate-100 shadow-sm'
                  : 'bg-terracotta-500/15 border-terracotta-500/60 text-slate-100 shadow-sm'
                : 'bg-surface-card border-border/80 text-slate-300 hover:border-slate-500/60 hover:bg-surface-elevated/40'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5 font-bold text-xs text-slate-100">
                  <Wand2 className="w-3.5 h-3.5 text-terracotta-400 shrink-0" />
                  Apply Account Branding at Dispatch
                </span>
                <span
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                    activeMode === 'dispatch_branding'
                      ? 'border-terracotta-400 bg-terracotta-500'
                      : 'border-slate-500'
                  }`}
                >
                  {activeMode === 'dispatch_branding' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {brandingInfo.cardDescription}
              </p>
            </div>
            <div className="pt-1.5 border-t border-border/50 flex items-center justify-between gap-1 text-[10px]">
              <span
                className="font-mono text-slate-300 truncate"
                title={brandingInfo.shortBadge}
              >
                {brandingInfo.shortBadge}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold shrink-0">
                Final render pending
              </span>
            </div>
          </div>
        </div>

        {/* Active Mode Details & Action Strip */}
        {activeMode === 'original' && selectedVideo && (
          <div
            data-testid={`media-detail-original-${acc.id}`}
            className="bg-surface-card border border-border/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
          >
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">
                  Original Master File: <code className="font-mono text-[11px]">{selectedVideo.original_filename}</code>
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Resolution {selectedVideo.width}×{selectedVideo.height} ({selectedVideo.aspect_ratio}) •{' '}
                {selectedVideo.duration ? `${selectedVideo.duration.toFixed(1)}s` : 'Duration N/A'} • Unbranded master will be sent as-is.
              </div>
            </div>
            {onPreviewMedia && originalStreamUrl && (
              <button
                type="button"
                onClick={() =>
                  onPreviewMedia(
                    originalStreamUrl,
                    `${selectedVideo.title} — Original Unbranded Master`,
                    selectedVideo.aspect_ratio || '9:16'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated text-slate-200 border border-border text-[11px] font-semibold transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
              >
                <Play className="w-3 h-3 text-blue-400 fill-blue-400" />
                Preview Original File
              </button>
            )}
          </div>
        )}

        {activeMode === 'saved_variant' && (
          <div
            data-testid={`media-detail-saved-variant-${acc.id}`}
            className={`rounded-xl p-3 border space-y-2.5 ${
              isSavedVariantInvalid
                ? 'bg-amber-500/10 border-amber-500/40'
                : 'bg-surface-card border-border/80'
            }`}
          >
            {savedVariants.length === 0 ? (
              <div className="flex items-start gap-2 text-amber-300 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    No saved branded versions exist for &ldquo;{selectedVideo?.title || 'this master video'}&rdquo;.
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Render a saved version in <strong>Branding Studio</strong> first, or switch this destination to{' '}
                    <strong>Apply Account Branding at Dispatch</strong> or <strong>Original — Unbranded Master</strong>.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label htmlFor={variantSelectId} className="text-[11px] font-semibold text-slate-200">
                    Select Saved Branded Version for {acc.name}:
                  </label>
                  {selectedSavedVariant && onPreviewMedia && (
                    <button
                      type="button"
                      onClick={() =>
                        onPreviewMedia(
                          selectedSavedVariant.previewUrl,
                          `${selectedVideo?.title || 'Video'} — Branded (${selectedSavedVariant.preset_name})`,
                          selectedSavedVariant.aspect_ratio || selectedVideo?.aspect_ratio || '9:16'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
                    >
                      <Play className="w-3 h-3 fill-emerald-400" />
                      Preview Branded File
                    </button>
                  )}
                </div>

                <select
                  id={variantSelectId}
                  aria-label={`Saved branded version for ${acc.name}`}
                  value={selectedSavedVariant ? selectedSavedVariant.id : ''}
                  onChange={(e) => onMediaModeChange(acc.id, 'saved_variant', e.target.value || null)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500"
                >
                  <option value="">-- Choose a saved branded version --</option>
                  {savedVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.preset_name} • Watermark: &ldquo;{v.watermark_text}&rdquo; ({v.movement_preset}, {v.aspect_ratio})
                    </option>
                  ))}
                </select>

                {selectedSavedVariant ? (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300 pt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      Selected file:{' '}
                      <code className="font-mono text-emerald-300">
                        {selectedSavedVariant.file_path.split(/[\\/]/).pop()}
                      </code>
                    </span>
                    <span className="text-slate-500">•</span>
                    <span>Watermark: &ldquo;{selectedSavedVariant.watermark_text}&rdquo;</span>
                    <span className="text-slate-500">•</span>
                    <span>Preset: {selectedSavedVariant.movement_preset}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Explicit variant selection is required before queueing.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeMode === 'dispatch_branding' && (
          <div
            data-testid={`media-detail-dispatch-branding-${acc.id}`}
            className={`rounded-xl p-3 space-y-2 border ${
              !brandingInfo.hasVisibleBranding
                ? 'bg-amber-500/10 border-amber-500/40'
                : 'bg-surface-card border-border/80'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  Dynamic Account Branding Configuration ({acc.name}) — {brandingInfo.modeLabel}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Final render pending
              </span>
            </div>
            <div className="text-[11px] text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Account: <strong>{acc.name}</strong> (@{acc.handle})
              </span>
              <span className="text-slate-500">•</span>
              <span>
                Branding Mode: <strong className="text-slate-100">{brandingInfo.modeLabel}</strong>
              </span>
              <span className="text-slate-500">•</span>
              <span>
                Watermark Text:{' '}
                <code className="font-mono text-terracotta-300">
                  {brandingInfo.mode === 'none'
                    ? 'N/A (mode: none)'
                    : brandingInfo.isWatermarkTextExplicitlyEmpty
                      ? '(empty — no text)'
                      : brandingInfo.effectiveWatermarkText}
                </code>
              </span>
              {(brandingInfo.rendersMovingWatermark || brandingInfo.rendersStaticWatermark) && (
                <>
                  <span className="text-slate-500">•</span>
                  <span>
                    Movement Preset:{' '}
                    <code className="font-mono text-slate-200">{brandingInfo.movementPreset}</code>
                  </span>
                </>
              )}
              {brandingInfo.rendersBottomCaption && (
                <>
                  <span className="text-slate-500">•</span>
                  <span>
                    Bottom Caption:{' '}
                    <code className="font-mono text-slate-200">{brandingInfo.effectiveSignatureText}</code>
                  </span>
                </>
              )}
              <span className="text-slate-500">•</span>
              <span>Opacity: {brandingInfo.opacityPct}</span>
              <span className="text-slate-500">•</span>
              <span>
                Source:{' '}
                <strong className="text-slate-200">
                  {brandingInfo.configSource === 'frozen_override'
                    ? 'Frozen destination override'
                    : 'Live account brand kit'}
                </strong>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {brandingInfo.cardDescription}
            </p>
            <div
              data-testid={`dispatch-schedule-note-${acc.id}`}
              className="text-[11px] text-slate-300 bg-surface/60 border border-border/60 rounded-lg px-2.5 py-1.5"
            >
              {brandingInfo.scheduleResolutionNote}
            </div>
            {brandingInfo.warningMessage && (
              <div
                role="status"
                data-testid={`dispatch-branding-warning-${acc.id}`}
                className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 font-medium"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{brandingInfo.warningMessage}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Caption & Hashtags Inputs */}
      <div className="grid grid-cols-1 gap-2.5 pt-1">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor={captionInputId} className="text-[11px] font-semibold text-slate-300">
              Post Caption for {acc.name}
            </label>
            <span className="text-[10px] text-slate-400">{(config.caption || '').length} chars</span>
          </div>
          <textarea
            id={captionInputId}
            rows={2}
            value={config.caption}
            onChange={(e) => onConfigChange(acc.id, { caption: e.target.value })}
            placeholder={`Custom caption for ${acc.name}...`}
            className="w-full bg-surface-card border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500 text-xs"
          />
        </div>

        <div>
          <label htmlFor={hashtagsInputId} className="block text-[11px] font-semibold text-slate-300 mb-1">
            Hashtags for {acc.name}
          </label>
          <input
            id={hashtagsInputId}
            type="text"
            value={config.hashtags}
            onChange={(e) => onConfigChange(acc.id, { hashtags: e.target.value })}
            placeholder="#hashtags"
            className="w-full bg-surface-card border border-border rounded-xl px-3 py-1.5 text-slate-300 focus:outline-none focus:border-terracotta-500 text-xs font-mono"
          />
        </div>
      </div>
    </div>
  );
};
