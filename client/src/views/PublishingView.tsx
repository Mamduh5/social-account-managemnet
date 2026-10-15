import React from 'react';
import { 
  Upload, Film, Check, Clock, Layers, Send, Sparkles 
} from 'lucide-react';
import { usePublishing } from '../hooks/usePublishing';
import { DestinationConfigCard } from '../components/publishing/DestinationConfigCard';
import { QueueTable } from '../components/publishing/QueueTable';
import { VideoLibraryGrid } from '../components/publishing/VideoLibraryGrid';

interface Props {
  selectedCategory?: string;
}

export const PublishingView: React.FC<Props> = () => {
  const {
    activeTab,
    setActiveTab,
    videos,
    accounts,
    queue,
    pipelineFiles,
    selectedVideoId,
    setSelectedVideoId,
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
    fileInputRef,
    submitting,
    loadData,
    handleFileUpload,
    handleImportPipelineFile,
    toggleAccountSelection,
    selectAllAccounts,
    copyFirstCaptionToAll,
    handlePublishSubmit,
    handleRetryDestination,
    handleCancelDestination,
  } = usePublishing();

  const activeVideo = videos.find(v => v.id === selectedVideoId);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('compose')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'compose'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface'
            }`}
          >
            Compose & Publish
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'queue'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface'
            }`}
          >
            <span>Publishing Queue</span>
            {queue.filter(q => ['preparing', 'branding', 'uploading'].includes(q.status)).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'library'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface'
            }`}
          >
            <span>Video Library</span>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
              {videos.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="video/mp4,video/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 bg-surface hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            {uploading ? `Uploading ${uploadProgress}%...` : 'Upload MP4'}
          </button>
        </div>
      </div>

      {/* TAB 1: COMPOSE & MULTI-DESTINATION PUBLISHING */}
      {activeTab === 'compose' && (
        <form onSubmit={handlePublishSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form & Destinations (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1. Video Selection */}
            <div className="bg-surface-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-indigo-400" /> 1. Selected Master Video
                </label>
                <button
                  type="button"
                  onClick={() => setActiveTab('library')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Change from Library →
                </button>
              </div>

              {activeVideo ? (
                <div className="bg-surface p-3.5 rounded-lg border border-border flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-white text-sm">{activeVideo.title}</h4>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{activeVideo.aspect_ratio}</span>
                      <span>•</span>
                      <span>{activeVideo.duration.toFixed(1)}s duration</span>
                      <span>•</span>
                      <span className="uppercase text-[10px] text-indigo-400 font-semibold">{activeVideo.source_type}</span>
                    </p>
                  </div>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-medium">
                    Master Ready
                  </span>
                </div>
              ) : (
                <div className="text-center py-6 border border-dashed border-slate-800 rounded-lg">
                  <p className="text-xs text-slate-400 mb-2">No video selected yet</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold"
                  >
                    Upload Video
                  </button>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-slate-300 text-xs font-semibold mb-1">Campaign / Post Title</label>
                <input
                  type="text"
                  required
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="e.g. Morning Espresso Comes to Life Episode 1"
                  className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* 2. Destination Accounts Selection */}
            <div className="bg-surface-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-400" /> 2. Destination Accounts ({selectedAccountIds.length} Selected)
                  </label>
                  <p className="text-[11px] text-slate-400">Publish to multiple Facebook Pages and TikTok accounts simultaneously</p>
                </div>
                <button
                  type="button"
                  onClick={selectAllAccounts}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  {selectedAccountIds.length === accounts.length ? 'Deselect All' : `Select All ${accounts.length} Accounts`}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {accounts.map((acc) => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => toggleAccountSelection(acc.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected 
                          ? 'border-indigo-500 bg-indigo-600/10' 
                          : 'border-slate-800 bg-surface/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <img 
                          src={acc.avatar_url} 
                          alt={acc.name} 
                          className="w-8 h-8 rounded-lg object-cover border border-slate-700" 
                        />
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">{acc.name}</p>
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded ${
                            acc.platform === 'facebook' ? 'text-blue-400 bg-blue-500/10' : 'text-rose-400 bg-rose-500/10'
                          }`}>
                            {acc.platform}
                          </span>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                        isSelected ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 bg-surface'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Per-Destination Customization */}
              {selectedAccountIds.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Platform-Specific Captions & Branding
                    </p>
                    {selectedAccountIds.length > 1 && (
                      <button
                        type="button"
                        onClick={copyFirstCaptionToAll}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> Apply 1st Caption to All
                      </button>
                    )}
                  </div>

                  {selectedAccountIds.map((accId) => {
                    const acc = accounts.find(a => a.id === accId);
                    if (!acc) return null;
                    const conf = destinationConfig[accId] || { caption: '', hashtags: '', applyBranding: true };

                    return (
                      <DestinationConfigCard
                        key={accId}
                        account={acc}
                        config={conf}
                        onConfigChange={(id, updates) => {
                          setDestinationConfig(prev => ({
                            ...prev,
                            [id]: { ...prev[id], ...updates }
                          }));
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Schedule or Publish Immediately */}
            <div className="bg-surface-card border border-border rounded-xl p-5 text-xs">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
                <Clock className="w-4 h-4 text-indigo-400" /> 3. Publishing Schedule
              </label>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setIsScheduled(false)}
                  className={`py-2 px-3 rounded-lg border font-semibold ${
                    !isScheduled ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-slate-800 bg-surface text-slate-400'
                  }`}
                >
                  Publish Immediately
                </button>
                <button
                  type="button"
                  onClick={() => setIsScheduled(true)}
                  className={`py-2 px-3 rounded-lg border font-semibold ${
                    isScheduled ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-slate-800 bg-surface text-slate-400'
                  }`}
                >
                  Schedule for Later
                </button>
              </div>

              {isScheduled && (
                <div className="mt-3 p-3 bg-surface rounded-lg border border-slate-800">
                  <label className="block text-slate-400 mb-1">Target Date & Time (Timezone: Asia/Bangkok)</label>
                  <input
                    type="datetime-local"
                    required={isScheduled}
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedVideoId || selectedAccountIds.length === 0}
                className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 text-sm transition-all"
              >
                <Send className="w-4 h-4" />
                {isScheduled
                  ? `Schedule Post to ${selectedAccountIds.length} Destinations`
                  : `Enqueue & Publish to ${selectedAccountIds.length} Destinations`}
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Video Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-surface-card border border-border rounded-xl p-5 sticky top-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Post Preview
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">Live video check before dispatching to queue</p>

              {activeVideo ? (
                <div className="space-y-3">
                  <div className="relative bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center min-h-[340px]">
                    <video
                      controls
                      src={`/uploads/${activeVideo.file_path.split(/[/\\]/).pop()}`}
                      className="max-h-[460px] w-full object-contain"
                    />
                  </div>

                  <div className="p-3 bg-surface rounded-lg border border-border text-xs space-y-1">
                    <p className="font-bold text-white">{postTitle || activeVideo.title}</p>
                    <p className="text-slate-400 text-[11px]">
                      Selected Destinations: {selectedAccountIds.length} accounts
                    </p>
                    <p className="text-slate-500 text-[10px]">
                      Video codec: H.264 / AAC • Aspect ratio: {activeVideo.aspect_ratio}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="min-h-[300px] flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
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
          selectedVideoId={selectedVideoId}
          onSelectVideo={(id, title) => {
            setSelectedVideoId(id);
            setPostTitle(title);
            setActiveTab('compose');
          }}
          onImportPipelineFile={handleImportPipelineFile}
        />
      )}
    </div>
  );
};
