import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import { Account, VideoItem, PublishingPost, PublishingDestination } from '../types';
import { 
  Upload, Film, Check, AlertCircle, Clock, RotateCcw, 
  ExternalLink, Layers, Send, Calendar, Sparkles, X, Play, CheckCircle2 
} from 'lucide-react';

interface Props {
  selectedCategory: string;
}

export const PublishingView: React.FC<Props> = ({ selectedCategory }) => {
  const [activeTab, setActiveTab] = useState<'compose' | 'queue' | 'library'>('compose');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<PublishingPost[]>([]);
  const [queue, setQueue] = useState<PublishingDestination[]>([]);
  const [pipelineFiles, setPipelineFiles] = useState<any[]>([]);

  // Composer Form State
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [postTitle, setPostTitle] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [destinationConfig, setDestinationConfig] = useState<Record<string, { caption: string; hashtags: string; applyBranding: boolean }>>({});

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [vRes, aRes, pRes, qRes, pipeRes] = await Promise.all([
        api.getVideos(),
        api.getAccounts(),
        api.getPosts(),
        api.getQueue(),
        api.getPipelineStatus(),
      ]);
      setVideos(vRes.videos || []);
      setAccounts(aRes.accounts || []);
      setPosts(pRes.posts || []);
      setQueue(qRes.queue || []);
      setPipelineFiles(pipeRes.files || []);

      if (!selectedVideoId && vRes.videos?.length > 0) {
        setSelectedVideoId(vRes.videos[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Update default per-destination captions when video or title changes
  useEffect(() => {
    const activeVideo = videos.find(v => v.id === selectedVideoId);
    if (!activeVideo) return;

    if (!postTitle) {
      setPostTitle(activeVideo.title);
    }

    const newConfig: Record<string, { caption: string; hashtags: string; applyBranding: boolean }> = { ...destinationConfig };
    for (const acc of accounts) {
      if (!newConfig[acc.id]) {
        const platformTag = acc.platform === 'tiktok' ? '#fyp #viral #ai' : '#AIArt #Creative';
        newConfig[acc.id] = {
          caption: `${activeVideo.title} — created with AI video synthesis`,
          hashtags: platformTag,
          applyBranding: true,
        };
      }
    }
    setDestinationConfig(newConfig);
  }, [selectedVideoId, accounts]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(20);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

    try {
      setUploadProgress(60);
      const res = await api.uploadVideo(formData);
      setUploadProgress(100);
      await loadData();
      if (res.videoId) {
        setSelectedVideoId(res.videoId);
        setPostTitle(res.title);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleImportPipelineFile = async (filePath: string, filename: string) => {
    try {
      const res = await api.importPipelineFile(filePath, filename.replace('.mp4', ''));
      await loadData();
      if (res.videoId) {
        setSelectedVideoId(res.videoId);
        setActiveTab('compose');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleAccountSelection = (accId: string) => {
    setSelectedAccountIds(prev => 
      prev.includes(accId) ? prev.filter(id => id !== accId) : [...prev, accId]
    );
  };

  const selectAllAccounts = () => {
    if (selectedAccountIds.length === accounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(accounts.map(a => a.id));
    }
  };

  const copyFirstCaptionToAll = () => {
    if (selectedAccountIds.length === 0) return;
    const firstAccId = selectedAccountIds[0];
    const sourceConfig = destinationConfig[firstAccId];
    if (!sourceConfig) return;

    const updated = { ...destinationConfig };
    for (const id of selectedAccountIds) {
      updated[id] = {
        ...updated[id],
        caption: sourceConfig.caption,
        hashtags: sourceConfig.hashtags,
      };
    }
    setDestinationConfig(updated);
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideoId || selectedAccountIds.length === 0) return;

    setSubmitting(true);
    try {
      const destinations = selectedAccountIds.map(accId => ({
        accountId: accId,
        caption: destinationConfig[accId]?.caption || postTitle,
        hashtags: destinationConfig[accId]?.hashtags || '',
        applyBranding: destinationConfig[accId]?.applyBranding ?? true,
      }));

      await api.createPost({
        videoId: selectedVideoId,
        title: postTitle,
        scheduledAt: isScheduled ? scheduleTime : null,
        destinations,
      });

      await loadData();
      setActiveTab('queue');
    } catch (err) {
      console.error('Publish submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryDestination = async (destId: string) => {
    try {
      await api.retryDestination(destId);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelDestination = async (destId: string) => {
    try {
      await api.cancelDestination(destId);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

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
                  {selectedAccountIds.length === accounts.length ? 'Deselect All' : 'Select All 6 Accounts'}
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
                      <div key={accId} className="bg-surface p-3.5 rounded-lg border border-border text-xs space-y-2">
                        <div className="flex items-center justify-between font-semibold text-slate-200">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${acc.platform === 'facebook' ? 'bg-blue-400' : 'bg-rose-400'}`} />
                            {acc.name} ({acc.platform})
                          </span>

                          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={conf.applyBranding}
                              onChange={(e) => setDestinationConfig(prev => ({
                                ...prev,
                                [accId]: { ...prev[accId], applyBranding: e.target.checked }
                              }))}
                              className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                            />
                            Apply Moving Watermark
                          </label>
                        </div>

                        <textarea
                          rows={2}
                          value={conf.caption}
                          onChange={(e) => setDestinationConfig(prev => ({
                            ...prev,
                            [accId]: { ...prev[accId], caption: e.target.value }
                          }))}
                          placeholder={`Custom caption for ${acc.name}...`}
                          className="w-full bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                        />

                        <input
                          type="text"
                          value={conf.hashtags}
                          onChange={(e) => setDestinationConfig(prev => ({
                            ...prev,
                            [accId]: { ...prev[accId], hashtags: e.target.value }
                          }))}
                          placeholder="#hashtags"
                          className="w-full bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
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
        <div className="space-y-4">
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Publishing Queue & Post History</h3>
                <p className="text-xs text-slate-400">
                  Independent per-destination status, progress, and retry controls
                </p>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1.5 bg-surface hover:bg-slate-800 text-slate-300 rounded text-xs font-medium border border-slate-700"
              >
                Refresh Queue
              </button>
            </div>

            {queue.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No items in the publishing queue.
              </div>
            ) : (
              <div className="space-y-3">
                {queue.map((item) => {
                  const isFailed = item.status === 'failed';
                  const isPublished = item.status === 'published';
                  const isProcessing = ['preparing', 'branding', 'uploading', 'awaiting_confirmation'].includes(item.status);

                  return (
                    <div 
                      key={item.id} 
                      className={`bg-surface p-4 rounded-xl border transition-all ${
                        isFailed ? 'border-rose-500/40 bg-rose-950/10' :
                        isPublished ? 'border-emerald-500/30' : 'border-border'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <img 
                            src={item.avatar_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150'} 
                            alt={item.account_name} 
                            className="w-10 h-10 rounded-lg object-cover border border-slate-700"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-white text-sm">{item.account_name}</h4>
                              <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                item.platform === 'facebook' ? 'bg-blue-500/20 text-blue-400' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {item.platform}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">{item.post_title}</p>
                          </div>
                        </div>

                        {/* Status badge & Actions */}
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                            isPublished ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            isFailed ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                            isProcessing ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse' :
                            'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {item.status}
                          </span>

                          {/* Retries only this destination! */}
                          {isFailed && (
                            <button
                              onClick={() => handleRetryDestination(item.id)}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Retry Destination
                            </button>
                          )}

                          {isProcessing && (
                            <button
                              onClick={() => handleCancelDestination(item.id)}
                              className="px-2.5 py-1 bg-surface hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 rounded text-xs font-medium"
                            >
                              Cancel
                            </button>
                          )}

                          {isPublished && item.remote_post_url && (
                            <a
                              href={item.remote_post_url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 bg-surface hover:bg-slate-800 text-indigo-400 border border-indigo-500/30 rounded text-xs font-medium flex items-center gap-1"
                            >
                              View Post <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      {isProcessing && (
                        <div className="mt-3">
                          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                            <span>Stage: {item.status}...</span>
                            <span>{item.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${item.progress || 10}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Error details */}
                      {isFailed && item.error_message && (
                        <div className="mt-2.5 p-2.5 bg-rose-950/30 border border-rose-900/50 rounded text-xs text-rose-300 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">Publication Error (Retry Available):</p>
                            <p className="text-[11px] text-rose-400 mt-0.5">{item.error_message}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: VIDEO LIBRARY & AI PIPELINE IMPORT */}
      {activeTab === 'library' && (
        <div className="space-y-6">
          {/* AI Pipeline Direct Watch Folder */}
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>AI Video Pipeline Watcher</span>
                  <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
                    {pipelineFiles.length} Discovered
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Generated MP4 videos ready to be imported from Flow / Gemini pipeline artifacts
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pipelineFiles.slice(0, 6).map((file, i) => (
                <div key={i} className="bg-surface p-3 rounded-lg border border-border flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-slate-200 truncate">{file.filename}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB • {file.modifiedAt.slice(0, 10)}
                    </p>
                  </div>
                  {file.isImported ? (
                    <span className="text-[10px] text-emerald-400 font-semibold px-2 py-1 bg-emerald-500/10 rounded">
                      Imported
                    </span>
                  ) : (
                    <button
                      onClick={() => handleImportPipelineFile(file.fullPath, file.filename)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-xs whitespace-nowrap"
                    >
                      Import
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Master Video Library */}
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <h3 className="text-base font-bold text-white mb-3">Saved Master Videos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {videos.map((vid) => (
                <div 
                  key={vid.id}
                  className={`bg-surface border rounded-xl overflow-hidden hover:border-slate-600 transition-all ${
                    selectedVideoId === vid.id ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-border'
                  }`}
                >
                  <div className="aspect-video bg-black relative flex items-center justify-center">
                    <Film className="w-8 h-8 text-slate-700" />
                    <span className="absolute bottom-1 right-1 text-[10px] bg-black/80 text-white px-1.5 py-0.5 rounded font-mono">
                      {vid.duration.toFixed(1)}s
                    </span>
                  </div>
                  <div className="p-3 text-xs">
                    <h4 className="font-bold text-white truncate">{vid.title}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                      <span>{vid.aspect_ratio}</span>
                      <span className="uppercase text-[9px] text-indigo-400">{vid.source_type}</span>
                    </p>
                    <button
                      onClick={() => {
                        setSelectedVideoId(vid.id);
                        setPostTitle(vid.title);
                        setActiveTab('compose');
                      }}
                      className="mt-3 w-full py-1.5 bg-surface hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 hover:border-indigo-500 rounded font-semibold text-xs transition-colors"
                    >
                      Use for Post
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
