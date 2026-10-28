import React, { useState } from 'react';
import { GeneralPostComposer } from '../components/publishing/GeneralPostComposer';
import { PostContentType } from '../types/general-posts';
import {
  Upload,
  Film,
  Check,
  Clock,
  Layers,
  Send,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Wand2,
  ShieldCheck,
} from 'lucide-react';
import {
  usePublishing,
  resolveDestinationMediaPayload,
  describeDispatchBranding,
} from '../hooks/usePublishing';
import { DestinationConfigCard } from '../components/publishing/DestinationConfigCard';
import { QueueTable } from '../components/publishing/QueueTable';
import { VideoLibraryGrid } from '../components/publishing/VideoLibraryGrid';
import { Modal } from '../components/common/Modal';

interface Props {
  selectedCategory?: string;
}

export const PublishingView: React.FC<Props> = () => {
  const [postType, setPostType] = useState<PostContentType>('reel');
  const [inspectMediaModal, setInspectMediaModal] = useState<{
    url: string;
    title: string;
    aspectRatio: string;
  } | null>(null);

  const {
    activeTab,
    setActiveTab,
    showDemoAccounts,
    setShowDemoAccounts,
    videos,
    accounts,
    queue,
    pipelineFiles,
    pipelineJobs,
    pipelineHealth,
    pipelineQuery,
    updatePipelineQuery,
    pipelinePage,
    pipelineTotalMatched,
    pipelineSourceContract,
    pipelineHistoryComplete,
    pipelineIncompleteReason,
    pipelineLoading,
    pipelineLoadingMore,
    pipelineError,
    loadMorePipelineJobs,
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
  } = usePublishing();

  const targets = accounts.filter((a) => selectedAccountIds.includes(a.id));
  const apiTargets = targets.filter((a) => !a.is_demo && a.capabilities?.canPublish);
  const manualTargets = targets.filter((a) => !a.is_demo && !a.capabilities?.canPublish);
  const demoTargets = targets.filter((a) => a.is_demo);
  const manualOnly = targets.length > 0 && manualTargets.length === targets.length;
  const apiOnly = targets.length > 0 && apiTargets.length === targets.length;
  const demoOnly = targets.length > 0 && demoTargets.length === targets.length;

  const activeVideo = videos.find((v) => v.id === selectedVideoId);
  const activeVariant =
    selectedVariantId && selectedVariantId !== 'original' && selectedVariantId !== 'dispatch_branding'
      ? activeVideo?.branded_variants?.find((b) => b.id === selectedVariantId)
      : undefined;

  const masterStreamUrl = activeVideo
    ? activeVideo.streamUrl || `/uploads/${activeVideo.file_path.split(/[/\\]/).pop()}`
    : '';
  const previewVideoUrl = activeVariant ? activeVariant.previewUrl : masterStreamUrl;

  // Compute per-destination review rows and validation status
  const destinationReviewRows = targets.map((acc) => {
    const conf = destinationConfig[acc.id] || {
      caption: postTitle,
      hashtags: '',
      mediaMode: 'original' as const,
      selectedVariantId: 'original',
      applyBranding: false,
    };
    const resolved = resolveDestinationMediaPayload(conf, activeVideo);
    const chosenVariant =
      resolved.mediaMode === 'saved_variant' && resolved.selectedVariantId
        ? activeVideo?.branded_variants?.find((v) => v.id === resolved.selectedVariantId)
        : undefined;

    const brandingInfo = describeDispatchBranding(acc, {
      brandingOverride: conf.brandingOverride,
      isScheduled,
    });

    return {
      account: acc,
      config: conf,
      resolved,
      chosenVariant,
      brandingInfo,
    };
  });

  const invalidDestinationRows = destinationReviewRows.filter((r) => !r.resolved.isValid);
  const hasInvalidDestinationMedia = invalidDestinationRows.length > 0;
  const hasAnyDispatchBranding = destinationReviewRows.some(
    (r) => r.resolved.mediaMode === 'dispatch_branding'
  );

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Reels use the existing video workflow. General Page posts are prepared as drafts for explicit review and approval. Opening a native handoff never marks content published.
      </p>

      {/* Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab('compose')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'compose'
                ? 'bg-terracotta-600 text-white shadow-md shadow-terracotta-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface'
            }`}
          >
            Compose &amp; Publish
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'queue'
                ? 'bg-terracotta-600 text-white shadow-md shadow-terracotta-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface'
            }`}
          >
            <span>Publishing Queue</span>
            {queue.filter((q) => ['preparing', 'branding', 'uploading'].includes(q.status)).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-honey-400 animate-pulse" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'library'
                ? 'bg-terracotta-600 text-white shadow-md shadow-terracotta-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface'
            }`}
          >
            <span>Video Library</span>
            <span className="text-[10px] bg-surface px-1.5 py-0.5 rounded-md text-slate-400 border border-border">
              {videos.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="video/mp4,video/*"
            className="hidden"
          />
          {(activeTab !== 'compose' || postType === 'reel') && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3.5 py-1.5 bg-surface hover:bg-surface-hover text-slate-200 border border-border rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
            >
              <Upload className="w-3.5 h-3.5 text-terracotta-400" />
              {uploading ? `Uploading ${uploadProgress}%...` : 'Upload MP4'}
            </button>
          )}
        </div>
      </div>

      {uploadError && (
        <div role="alert" className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300">
          {uploadError}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={showDemoAccounts}
          onChange={(e) => setShowDemoAccounts(e.target.checked)}
        />
        Show demo publishing targets (simulated only)
      </label>

      {activeTab === 'compose' && (
        <div className="bg-surface-card border border-border rounded-2xl p-4 space-y-2">
          <label className="text-xs font-bold block text-slate-200" htmlFor="post-content-type">
            Post type
          </label>
          <select
            id="post-content-type"
            aria-label="Post type"
            value={postType}
            onChange={(e) => setPostType(e.target.value as PostContentType)}
            className="w-full sm:w-80 bg-surface border border-border rounded-xl px-3 py-2 text-sm text-slate-100"
          >
            <option value="reel">Reel / Video (existing workflow)</option>
            <option value="text">Facebook Page: Text-only</option>
            <option value="image">Facebook Page: Single image</option>
            <option value="multi_image">Facebook Page: Multiple images</option>
            <option value="link">Facebook Page: Link</option>
          </select>
        </div>
      )}

      {activeTab === 'compose' && postType !== 'reel' && (
        <GeneralPostComposer
          accounts={accounts}
          contentType={postType}
          onContentTypeChange={setPostType}
          onQueued={() => {
            void loadData();
            setActiveTab('queue');
          }}
        />
      )}

      {/* TAB 1: COMPOSE & MULTI-DESTINATION PUBLISHING */}
      {activeTab === 'compose' && postType === 'reel' && (
        <form onSubmit={handlePublishSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Sequential Workflow (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* STEP 1. Selected Source Video & Default Media Mode */}
            <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label
                  htmlFor="master-video-select"
                  className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
                >
                  <Film className="w-4 h-4 text-terracotta-400" /> 1. Selected Master Video
                </label>
                <button
                  type="button"
                  onClick={() => setActiveTab('library')}
                  className="text-xs text-terracotta-400 hover:text-terracotta-300 font-semibold cursor-pointer self-start sm:self-auto"
                >
                  Browse Pipeline &amp; Library →
                </button>
              </div>

              {videos.length > 1 && (
                <div>
                  <select
                    id="master-video-select"
                    aria-label="Select Master Video"
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500"
                  >
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title} ({v.aspect_ratio}, {v.duration ? `${v.duration.toFixed(1)}s` : 'N/A'},{' '}
                        {v.branded_variants?.length || 0} saved variants)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mediaSelectionNotice && (
                <div
                  role="status"
                  data-testid="master-switch-revalidation-notice"
                  className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 flex items-start justify-between gap-2 text-xs text-amber-300"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{mediaSelectionNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMediaSelectionNotice('')}
                    className="text-amber-300 hover:text-white text-[11px] font-bold shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {activeVideo ? (
                <>
                  <div className="bg-surface p-4 rounded-xl border border-border flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-100 text-sm truncate">{activeVideo.title}</h4>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-slate-300">{activeVideo.original_filename}</span>
                        <span>•</span>
                        <span className="font-mono">{activeVideo.aspect_ratio}</span>
                        <span>•</span>
                        <span>{activeVideo.duration.toFixed(1)}s duration</span>
                        <span>•</span>
                        <span className="uppercase text-[10px] text-terracotta-400 font-bold">
                          {activeVideo.source_type}
                        </span>
                      </p>
                    </div>
                    <span className="text-xs bg-sage-500/10 text-sage-400 border border-sage-500/20 px-2.5 py-1 rounded-md font-semibold shrink-0">
                      Master Ready
                    </span>
                  </div>

                  {/* Quick-Apply Default Media Mode Across All Destinations */}
                  <div className="p-3.5 bg-surface/70 rounded-xl border border-border space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-terracotta-400" />
                        <span>Quick-Apply Media Mode to All Destinations:</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {selectedVariantId === 'dispatch_branding'
                          ? 'Apply Account Branding at Dispatch (Final render pending)'
                          : activeVariant
                            ? `Saved Branded Version (${activeVariant.watermark_text})`
                            : 'Original — Unbranded Master'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedVariantId('original')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          selectedVariantId === 'original' || !selectedVariantId
                            ? 'bg-blue-500/15 border-blue-500 text-blue-300 shadow-xs'
                            : 'bg-surface border-border text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        <span>Original Master (Unbranded)</span>
                      </button>

                      {activeVideo.branded_variants?.map((variant) => {
                        const isChosen = selectedVariantId === variant.id;
                        return (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => setSelectedVariantId(variant.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                              isChosen
                                ? 'bg-terracotta-500/15 border-terracotta-500 text-terracotta-300 shadow-xs'
                                : 'bg-surface border-border text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-terracotta-400" />
                            <span className="truncate max-w-[180px]">Branded: {variant.watermark_text}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({variant.movement_preset})</span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setSelectedVariantId('dispatch_branding')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          selectedVariantId === 'dispatch_branding'
                            ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-xs'
                            : 'bg-surface border-border text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <Wand2 className="w-3 h-3 text-amber-400" />
                        <span>Apply Account Branding at Dispatch</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 border border-dashed border-border rounded-xl">
                  <p className="text-xs text-slate-400 mb-2">No video selected yet</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Upload Video
                  </button>
                </div>
              )}

              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">
                  Campaign / Post Title
                </label>
                <input
                  aria-label="Campaign / Post Title"
                  type="text"
                  required
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="e.g. Morning Espresso Comes to Life Episode 1"
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-terracotta-500"
                />
              </div>
            </div>

            {/* STEP 2 & 3. Destination Accounts & Per-Destination Media Mode Configuration */}
            <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-terracotta-400" /> 2. Destination Accounts (
                    {selectedAccountIds.length} Selected)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Select target accounts and configure each destination&apos;s exact media mode and caption
                  </p>
                </div>
                <button
                  type="button"
                  onClick={selectAllAccounts}
                  className="text-xs text-terracotta-400 hover:text-terracotta-300 font-semibold cursor-pointer self-start sm:self-auto"
                >
                  {selectedAccountIds.length === accounts.length
                    ? 'Deselect All'
                    : `Select All ${accounts.length} Accounts`}
                </button>
              </div>

              {/* Exact grid class preserved for automated tests */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {accounts.map((acc) => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  return (
                    <div
                      key={acc.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select destination ${acc.name}`}
                      aria-pressed={isSelected}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleAccountSelection(acc.id);
                        }
                      }}
                      onClick={() => toggleAccountSelection(acc.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-terracotta-500 bg-terracotta-500/10 shadow-xs'
                          : 'border-border bg-surface hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={acc.avatar_url || '/avatar.svg'}
                          alt={acc.name}
                          className="w-8 h-8 rounded-lg object-cover border border-border shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-100 leading-tight truncate">
                            {acc.is_demo ? 'DEMO: ' : ''}
                            {acc.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded ${
                                acc.platform === 'facebook'
                                  ? 'text-blue-400 bg-blue-500/10'
                                  : 'text-rose-400 bg-rose-500/10'
                              }`}
                            >
                              {acc.platform}
                            </span>
                            {acc.is_demo ? (
                              <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                Simulator
                              </span>
                            ) : acc.capabilities?.canPublish ? (
                              <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 flex items-center gap-0.5">
                                <span className="w-1 h-1 rounded-full bg-emerald-400"></span> API Publish
                              </span>
                            ) : (
                              <span className="text-[9px] font-semibold text-slate-400 bg-slate-500/10 px-1.5 py-0.2 rounded border border-slate-500/20">
                                Manual Handoff
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                          isSelected
                            ? 'bg-terracotta-600 border-terracotta-500 text-white'
                            : 'border-border bg-surface-card'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Per-Destination Explicit Media Mode & Caption Configuration */}
              {selectedAccountIds.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      3. Per-Destination Media Mode &amp; Captions
                    </p>
                    {selectedAccountIds.length > 1 && (
                      <button
                        type="button"
                        onClick={copyFirstCaptionToAll}
                        className="text-xs text-terracotta-400 hover:text-terracotta-300 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" /> Apply 1st Config to All
                      </button>
                    )}
                  </div>

                  {selectedAccountIds.map((accId) => {
                    const acc = accounts.find((a) => a.id === accId);
                    if (!acc) return null;
                    const conf = destinationConfig[accId] || {
                      caption: postTitle,
                      hashtags: '',
                      mediaMode: 'original' as const,
                      selectedVariantId: 'original',
                      applyBranding: false,
                    };

                    return (
                      <DestinationConfigCard
                        key={accId}
                        account={acc}
                        selectedVideo={activeVideo}
                        config={conf}
                        isScheduled={isScheduled}
                        onConfigChange={(id, updates) => {
                          setDestinationConfig((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], ...updates },
                          }));
                        }}
                        onMediaModeChange={setDestinationMediaMode}
                        onPreviewMedia={(url, title, aspectRatio) =>
                          setInspectMediaModal({ url, title, aspectRatio })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* STEP 4. Schedule or Publish Immediately */}
            <div className="bg-surface-card border border-border rounded-2xl p-5 text-xs shadow-xs space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
                  <Clock className="w-4 h-4 text-terracotta-400" /> 4. Publishing Schedule
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsScheduled(false)}
                    className={`py-2 px-3 rounded-xl border font-bold transition-all cursor-pointer ${
                      !isScheduled
                        ? 'border-terracotta-500 bg-terracotta-500/15 text-terracotta-300'
                        : 'border-border bg-surface text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    Publish Immediately
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScheduled(true)}
                    className={`py-2 px-3 rounded-xl border font-bold transition-all cursor-pointer ${
                      isScheduled
                        ? 'border-terracotta-500 bg-terracotta-500/15 text-terracotta-300'
                        : 'border-border bg-surface text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    Schedule for Later
                  </button>
                </div>

                {isScheduled && (
                  <div className="mt-3 p-3 bg-surface rounded-xl border border-border">
                    <label htmlFor="schedule-datetime-input" className="block text-slate-300 font-semibold mb-1">
                      Target Date &amp; Time (Timezone: Asia/Bangkok)
                    </label>
                    <input
                      id="schedule-datetime-input"
                      type="datetime-local"
                      required={isScheduled}
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full bg-surface-card border border-border rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
                    />
                  </div>
                )}
              </div>

              {/* STEP 5. Final Publishing Review Before Queueing */}
              <div
                data-testid="final-publishing-review"
                className="pt-4 border-t border-border space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-terracotta-400" />
                    5. Final Publishing Review
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Verify exact media file and delivery mode per destination
                  </span>
                </div>

                {!activeVideo || destinationReviewRows.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-surface border border-dashed border-border text-slate-400 text-xs">
                    Select a master video and at least one destination account above to review exact media dispatch details.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {destinationReviewRows.map((row) => {
                      const { account: acc, resolved, chosenVariant, brandingInfo } = row;
                      const deliveryLabel = acc.is_demo
                        ? 'Simulator'
                        : acc.capabilities?.canPublish
                          ? 'Official API Upload'
                          : 'Manual Package Handoff';

                      return (
                        <div
                          key={acc.id}
                          data-testid={`review-row-${acc.id}`}
                          className={`p-3 rounded-xl border space-y-1.5 ${
                            !resolved.isValid ||
                            (resolved.mediaMode === 'dispatch_branding' && !brandingInfo.hasVisibleBranding)
                              ? 'bg-amber-500/10 border-amber-500/50'
                              : 'bg-surface border-border'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-bold text-slate-100 flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  acc.platform === 'facebook' ? 'bg-blue-400' : 'bg-rose-400'
                                }`}
                              />
                              <span>{acc.name}</span>
                              <span className="text-[10px] font-normal text-slate-400 uppercase">
                                ({acc.platform} • {deliveryLabel})
                              </span>
                            </div>

                            <span className="text-[11px] font-semibold text-slate-300">
                              {isScheduled
                                ? scheduleTime
                                  ? `Scheduled: ${scheduleTime} (Asia/Bangkok)`
                                  : 'Schedule time required'
                                : 'Action: Immediate Dispatch'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1 border-t border-border/50">
                            <div>
                              <span className="text-slate-400">Master Video: </span>
                              <strong className="text-slate-200">{activeVideo.title}</strong>{' '}
                              <span className="font-mono text-[10px] text-slate-400">
                                ({activeVideo.original_filename})
                              </span>
                            </div>

                            <div>
                              <span className="text-slate-400">Effective Mode: </span>
                              {resolved.mediaMode === 'original' && (
                                <strong className="text-blue-300">Original — Unbranded Master</strong>
                              )}
                              {resolved.mediaMode === 'saved_variant' && (
                                <strong className="text-emerald-300">Saved Branded Version</strong>
                              )}
                              {resolved.mediaMode === 'dispatch_branding' && (
                                <strong className="text-amber-300">
                                  Apply Account Branding at Dispatch ({brandingInfo.modeLabel})
                                </strong>
                              )}
                            </div>
                          </div>

                          <div className="text-[11px] flex flex-wrap items-center justify-between gap-2 pt-0.5">
                            {resolved.mediaMode === 'original' && (
                              <span className="text-slate-300 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span>
                                  File to publish:{' '}
                                  <code className="font-mono text-blue-300">{activeVideo.original_filename}</code> (No watermark)
                                </span>
                              </span>
                            )}

                            {resolved.mediaMode === 'saved_variant' &&
                              (chosenVariant ? (
                                <span className="text-slate-300 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span>
                                    Selected Variant: <strong>{chosenVariant.preset_name}</strong> (&ldquo;
                                    {chosenVariant.watermark_text}&rdquo; •{' '}
                                    <code className="font-mono text-emerald-300">
                                      {chosenVariant.file_path.split(/[\\/]/).pop()}
                                    </code>
                                    )
                                  </span>
                                </span>
                              ) : (
                                <span className="text-amber-300 font-semibold flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>{resolved.validationError}</span>
                                </span>
                              ))}

                            {resolved.mediaMode === 'dispatch_branding' && (
                              <div className="w-full space-y-1.5">
                                <div className="text-slate-300 flex flex-wrap items-center gap-2">
                                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                                    Final render pending
                                  </span>
                                  <span>{brandingInfo.reviewSummary}</span>
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {brandingInfo.scheduleResolutionNote}
                                </div>
                                {brandingInfo.warningMessage && (
                                  <div
                                    data-testid={`review-branding-warning-${acc.id}`}
                                    className="flex items-start gap-1.5 text-[11px] text-amber-300 font-semibold"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                    <span>{brandingInfo.warningMessage}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {manualTargets.length > 0 && (
                  <div className="p-3 rounded-xl bg-surface border border-border text-[11px] text-slate-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Manual confirmation safeguard:</strong> {manualTargets.map((m) => m.name).join(', ')} will prepare a native upload package and remain in{' '}
                      <code>awaiting_confirmation</code> until you record the verified published URL.
                    </span>
                  </div>
                )}

                {hasInvalidDestinationMedia && (
                  <div
                    role="alert"
                    data-testid="invalid-media-selection-alert"
                    className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-300 flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Complete media selection for{' '}
                      <strong>{invalidDestinationRows.map((r) => r.account.name).join(', ')}</strong> before queueing.
                    </span>
                  </div>
                )}
              </div>

              {submitError && (
                <p role="alert" className="mt-3 text-sm text-red-400">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                aria-label={
                  isScheduled
                    ? 'Schedule Post'
                    : apiOnly
                      ? 'Publish via API'
                      : manualOnly
                        ? 'Prepare for Manual Publishing'
                        : demoOnly
                          ? 'Run Demo Publishing'
                          : 'Publish via API & Prepare Manual'
                }
                disabled={
                  submitting ||
                  !selectedVideoId ||
                  selectedAccountIds.length === 0 ||
                  hasInvalidDestinationMedia
                }
                className="mt-2 w-full py-3 bg-terracotta-600 hover:bg-terracotta-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-terracotta-600/25 text-sm transition-all cursor-pointer active:scale-[0.99]"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isScheduled
                    ? `Schedule Post to ${selectedAccountIds.length} Destinations`
                    : apiOnly
                      ? `Publish via API (${selectedAccountIds.length} Destinations)`
                      : manualOnly
                        ? `Prepare for Manual Publishing (${selectedAccountIds.length} Destinations)`
                        : demoOnly
                          ? `Run Demo Publishing (${selectedAccountIds.length} Destinations)`
                          : `Publish via API (${apiTargets.length}) & Prepare Manual (${manualTargets.length})`}
                </span>
                <span className="sr-only">Publish Now Enqueue &amp; Publish</span>
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Video Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-surface-card border border-border rounded-2xl p-5 sticky top-20 shadow-xs space-y-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Source &amp; Variant Media Preview
                </h3>
                <p className="text-[11px] text-slate-400">
                  Inspect the actual video file on disk before dispatching to the publishing queue
                </p>
              </div>

              {activeVideo ? (
                <div className="space-y-3">
                  <div className="relative bg-black rounded-xl overflow-hidden border border-border flex items-center justify-center min-h-[340px]">
                    <video
                      key={previewVideoUrl}
                      controls
                      src={previewVideoUrl}
                      className="max-h-[460px] w-full object-contain"
                    />
                  </div>

                  <div className="p-3.5 bg-surface rounded-xl border border-border text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-100 truncate">{postTitle || activeVideo.title}</p>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                          activeVariant
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                        }`}
                      >
                        {activeVariant
                          ? `Previewing Saved Variant: ${activeVariant.watermark_text}`
                          : 'Previewing Original Master (Unbranded)'}
                      </span>
                    </div>

                    {hasAnyDispatchBranding && !activeVariant && (
                      <div
                        data-testid="dispatch-preview-honesty-note"
                        className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          <strong>Final render pending:</strong> The player above shows the unbranded original master. Destinations set to{' '}
                          <strong>Apply Account Branding at Dispatch</strong> will be processed by FFmpeg during queue dispatch according to each destination&apos;s branding configuration.
                        </span>
                      </div>
                    )}

                    <p className="text-slate-400 text-[11px]">
                      Selected Destinations: {selectedAccountIds.length} account
                      {selectedAccountIds.length === 1 ? '' : 's'}
                    </p>
                    <p className="text-slate-500 text-[10px]">
                      Aspect: {activeVideo.aspect_ratio} • Duration: {activeVideo.duration.toFixed(1)}s • Source:{' '}
                      {activeVideo.source_type}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="min-h-[300px] flex items-center justify-center border border-dashed border-border rounded-xl text-slate-500 text-xs">
                  Select a video to see preview
                </div>
              )}
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: PUBLISHING QUEUE & HISTORY */}
      {activeTab === 'queue' && (
        <QueueTable
          queue={queue}
          onRetry={handleRetryDestination}
          onCancel={handleCancelDestination}
          onRefresh={loadData}
        />
      )}

      {/* TAB 3: VIDEO LIBRARY & AI PIPELINE IMPORT */}
      {activeTab === 'library' && (
        <VideoLibraryGrid
          videos={videos}
          pipelineFiles={pipelineFiles}
          pipelineJobs={pipelineJobs}
          pipelineHealth={pipelineHealth}
          pipelineQuery={pipelineQuery}
          onUpdatePipelineQuery={updatePipelineQuery}
          pipelinePage={pipelinePage}
          pipelineTotalMatched={pipelineTotalMatched}
          pipelineSourceContract={pipelineSourceContract}
          pipelineHistoryComplete={pipelineHistoryComplete}
          pipelineIncompleteReason={pipelineIncompleteReason}
          pipelineLoading={pipelineLoading}
          pipelineLoadingMore={pipelineLoadingMore}
          pipelineError={pipelineError}
          onLoadMorePipelineJobs={loadMorePipelineJobs}
          importingJobIds={importingJobIds}
          importJobErrors={importJobErrors}
          importJobNotices={importJobNotices}
          importingFilePaths={importingFilePaths}
          importFileErrors={importFileErrors}
          syncingPipeline={syncingPipeline}
          selectedVideoId={selectedVideoId}
          onSelectVideo={(id, title) => {
            setPostType('reel');
            setSelectedVideoId(id);
            setSelectedVariantId('original');
            setPostTitle(title);
            setActiveTab('compose');
          }}
          onSelectVideoVariant={(videoId, variantId, title) => {
            setPostType('reel');
            handleSelectVideoVariant(videoId, variantId, title);
          }}
          onImportPipelineFile={handleImportPipelineFile}
          onImportPipelineJob={handleImportPipelineJob}
          onSyncPipeline={handleSyncPipeline}
          onDeleteBrandedVariant={handleDeleteBrandedVariant}
        />
      )}

      {/* Modal for explicit per-destination media preview */}
      <Modal
        isOpen={Boolean(inspectMediaModal)}
        onClose={() => setInspectMediaModal(null)}
        title={inspectMediaModal?.title || 'Media Preview'}
        subtitle={
          inspectMediaModal
            ? `Aspect Ratio: ${inspectMediaModal.aspectRatio} • Actual File Preview`
            : undefined
        }
        maxWidth="max-w-xl"
        manageFocus
        scrollBody
      >
        {inspectMediaModal && (
          <div className="space-y-4 min-h-0 overflow-y-auto">
            <div className="p-3 bg-black rounded-xl border border-border flex items-center justify-center">
              <video
                controls
                autoPlay
                playsInline
                src={inspectMediaModal.url}
                className="max-h-[460px] w-full object-contain rounded-lg"
              />
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-border/70">
              <span className="text-slate-400">
                Inspecting actual media file on disk
              </span>
              <button
                type="button"
                aria-label="Close Media Preview"
                onClick={() => setInspectMediaModal(null)}
                className="px-3.5 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-xl font-semibold text-slate-200 cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
