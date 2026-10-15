import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { Account, VideoItem, PublishingPost, PublishingDestination } from '../types';

export function usePublishing() {
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
      setPosts(pRes.posts || []);
      setQueue(qRes.queue || []);
      setPipelineFiles(pipeRes.files || []);

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
            caption: `${activeVideo.title} — created with AI video synthesis`,
            hashtags: platformTag,
            applyBranding: true,
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

  return {
    activeTab,
    setActiveTab,
    videos,
    accounts,
    posts,
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
  };
}
