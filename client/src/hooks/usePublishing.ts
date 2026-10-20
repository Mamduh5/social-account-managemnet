import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { 
  Account, 
  VideoItem, 
  PublishingPost, 
  PublishingDestination,
  DiscoveredPipelineJob,
  PipelineHealthStatus,
} from '../types';

export function usePublishing() {
  const [activeTab, setActiveTab] = useState<'compose' | 'queue' | 'library'>('compose');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [allAccounts, setAccounts] = useState<Account[]>([]);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const accounts = allAccounts.filter(a => showDemoAccounts || !a.is_demo);
  const [posts, setPosts] = useState<PublishingPost[]>([]);
  const [queue, setQueue] = useState<PublishingDestination[]>([]);
  const [pipelineFiles, setPipelineFiles] = useState<any[]>([]);
  const [pipelineJobs, setPipelineJobs] = useState<DiscoveredPipelineJob[]>([]);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealthStatus | null>(null);

  // Composer Form State
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('original');
  const [postTitle, setPostTitle] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [destinationConfig, setDestinationConfig] = useState<Record<string, { caption: string; hashtags: string; applyBranding: boolean; selectedVariantId?: string | null }>>({});

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submitting state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [syncingPipeline, setSyncingPipeline] = useState(false);

  const loadData = useCallback(async () => {
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
      const prepareId = sessionStorage.getItem('prepareAccountId');
      if (prepareId && aRes.accounts.some(a => a.id === prepareId && !a.is_demo)) { setSelectedAccountIds([prepareId]); sessionStorage.removeItem('prepareAccountId'); }
      setPosts(pRes.posts || []);
      setQueue(qRes.queue || []);
      setPipelineFiles(pipeRes.files || []);
      setPipelineJobs(pipeRes.jobs || []);
      if (pipeRes.health) {
        setPipelineHealth(pipeRes.health);
      }

      setSelectedVideoId(prev => prev || vRes.videos?.[0]?.id || '');
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Update default per-destination captions when video or accounts change
  useEffect(() => {
    const activeVideo = videos.find(v => v.id === selectedVideoId);
    if (!activeVideo) return;

    setPostTitle(prev => prev || activeVideo.title);

    setDestinationConfig(prev => {
      const newConfig = { ...prev };
      let changed = false;
      for (const acc of accounts) {
        if (!newConfig[acc.id]) {
          changed = true;
          const platformTag = acc.platform === 'tiktok' ? '#fyp #viral #ai' : '#AIArt #Creative';
          newConfig[acc.id] = {
            caption: acc.settings?.defaultCaption || `${activeVideo.title} — created with AI video synthesis`,
            hashtags: acc.settings?.defaultHashtags || '',
            applyBranding: acc.settings?.applyBranding !== false,
          };
        }
      }
      return changed ? newConfig : prev;
    });
  }, [selectedVideoId, accounts, videos]);

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

  const handleImportPipelineJob = async (jobId: string, title?: string) => {
    try {
      const res = await api.importPipelineJob(jobId, title);
      await loadData();
      if (res.videoId) {
        setSelectedVideoId(res.videoId);
        setActiveTab('compose');
      }
    } catch (err) {
      console.error('Error importing pipeline job:', err);
    }
  };

  const handleSyncPipeline = async () => {
    setSyncingPipeline(true);
    try {
      await api.syncPipeline();
      await loadData();
    } catch (err) {
      console.error('Error syncing pipeline:', err);
    } finally {
      setSyncingPipeline(false);
    }
  };

  const handleDeleteBrandedVariant = async (variantId: string) => {
    try {
      await api.deleteBrandedVariant(variantId);
      await loadData();
    } catch (err) {
      console.error('Error deleting branded variant:', err);
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

    setDestinationConfig(prev => {
      const updated = { ...prev };
      for (const id of selectedAccountIds) {
        if (id !== firstAccId) {
          updated[id] = {
            ...updated[id],
            caption: sourceConfig.caption,
            hashtags: sourceConfig.hashtags,
            applyBranding: sourceConfig.applyBranding,
          };
        }
      }
      return updated;
    });
  };

  const handleSelectVideoVariant = (videoId: string, variantId: string, title?: string) => {
    setSelectedVideoId(videoId);
    setSelectedVariantId(variantId);
    if (title) setPostTitle(title);
    setActiveTab('compose');
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideoId || selectedAccountIds.length === 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      let scheduledAt: string | null = null;
      if (isScheduled) {
        // The form explicitly displays Bangkok time, independent of browser TZ.
        const timestamp = Date.parse(`${scheduleTime}+07:00`);
        if (!scheduleTime || !Number.isFinite(timestamp) || timestamp <= Date.now())
          throw new Error('Choose a future date and time in Asia/Bangkok.');
        scheduledAt = new Date(timestamp).toISOString();
      }
      const destinations = selectedAccountIds.map(accountId => {
        const conf = destinationConfig[accountId] || { caption: postTitle, hashtags: '', applyBranding: true };
        const destVariantId = conf.selectedVariantId !== undefined 
          ? conf.selectedVariantId 
          : selectedVariantId;

        const isBrandedVariant = destVariantId && destVariantId !== 'original';
        return {
          accountId,
          caption: conf.caption,
          hashtags: conf.hashtags,
          applyBranding: isBrandedVariant ? 0 : (conf.applyBranding ? 1 : 0),
          selectedVariantId: destVariantId || null,
        };
      });

      await api.createPost({
        videoId: selectedVideoId,
        title: postTitle,
        scheduledAt,
        selectedVariantId: selectedVariantId || null,
        destinations,
      });

      await loadData();
      setActiveTab('queue');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Publishing request failed.');
      console.error('Publish submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryDestination = async (id: string) => {
    try {
      await api.retryDestination(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelDestination = async (id: string) => {
    try {
      await api.cancelDestination(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return {
    activeTab,
    setActiveTab,
    showDemoAccounts,
    setShowDemoAccounts,
    videos,
    accounts,
    posts,
    queue,
    pipelineFiles,
    pipelineJobs,
    pipelineHealth,
    syncingPipeline,
    selectedVideoId,
    setSelectedVideoId,
    selectedVariantId,
    setSelectedVariantId,
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
  };
}
