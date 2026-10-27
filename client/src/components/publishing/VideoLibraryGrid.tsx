import React, { useState } from 'react';
import { 
  VideoItem, 
  DiscoveredPipelineJob, 
  PipelineHealthStatus,
  BrandedVideo 
} from '../../types';
import { 
  Sparkles, 
  Film, 
  Play, 
  Download, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  Layers, 
  X,
  Volume2,
  Send
} from 'lucide-react';

export interface VideoLibraryGridProps {
  videos: VideoItem[];
  pipelineFiles: any[];
  pipelineJobs?: DiscoveredPipelineJob[];
  pipelineHealth?: PipelineHealthStatus | null;
  syncingPipeline?: boolean;
  selectedVideoId: string;
  onSelectVideo: (videoId: string, title: string) => void;
  onSelectVideoVariant?: (videoId: string, variantId: string, title?: string) => void;
  onImportPipelineFile: (filePath: string, filename: string) => void;
  onImportPipelineJob?: (jobId: string, title?: string) => void;
  onSyncPipeline?: () => void;
  onDeleteBrandedVariant?: (variantId: string) => void;
}

export const VideoLibraryGrid: React.FC<VideoLibraryGridProps> = ({
  videos,
  pipelineFiles,
  pipelineJobs = [],
  pipelineHealth,
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

  const [importingJobId, setImportingJobId] = useState<string | null>(null);

  const handleImportJob = async (jobId: string, title: string) => {
    if (!onImportPipelineJob) return;
    setImportingJobId(jobId);
    try {
      await onImportPipelineJob(jobId, title);
    } finally {
      setImportingJobId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. UPSTREAM AI VIDEO PIPELINE DISCOVERY SECTION */}
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-terracotta-400" />
                <span>AI Video Pipeline Integration</span>
              </h3>
              {pipelineHealth?.reachable ? (
                <span className="text-[10px] bg-sage-500/15 text-sage-300 border border-sage-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage-400 animate-pulse" />
                  Live Connected ({pipelineHealth.apiUrl})
                </span>
              ) : (
                <span className="text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold">
                  Pipeline Offline ({pipelineHealth?.apiUrl || 'localhost:8080'})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Completed videos ready to import directly from your running Flow & Gemini video pipeline
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onSyncPipeline}
              disabled={syncingPipeline}
              className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border text-slate-300 hover:text-white light:hover:text-slate-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-terracotta-400 ${syncingPipeline ? 'animate-spin' : ''}`} />
              {syncingPipeline ? 'Syncing...' : 'Sync from Pipeline'}
            </button>
          </div>
        </div>

        {/* Pipeline Jobs Grid */}
        {pipelineJobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pipelineJobs.slice(0, 6).map((job) => (
              <div key={job.jobId} className="bg-surface p-3.5 rounded-xl border border-border flex items-center justify-between text-xs hover:border-slate-600 transition-colors">
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-terracotta-500/15 text-terracotta-300 border border-terracotta-500/20 font-bold">
                      {job.aspectRatio}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {job.durationSeconds}s
                    </span>
                  </div>
                  <p className="font-bold text-slate-200 truncate">{job.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">{job.displayStatus}</p>
                </div>

                {job.isImported ? (
                  <span className="text-[10px] text-sage-400 font-bold px-2 py-1 bg-sage-500/10 border border-sage-500/20 rounded-lg shrink-0 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> In Library
                  </span>
                ) : (
                  <button
                    onClick={() => handleImportJob(job.jobId, job.title)}
                    disabled={importingJobId === job.jobId}
                    className="px-3 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs whitespace-nowrap cursor-pointer transition-colors active:scale-95 shrink-0"
                  >
                    {importingJobId === job.jobId ? 'Importing...' : 'Import'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-slate-500 bg-surface/50 rounded-xl border border-dashed border-border">
            {pipelineHealth?.reachable 
              ? 'No completed videos found in upstream pipeline currently.' 
              : 'Upstream AI video pipeline is not currently responding. Videos in your library remain fully accessible.'}
          </div>
        )}
      </div>

      {/* 2. SAVED MASTER VIDEOS & BRANDED VARIANTS LIBRARY */}
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Film className="w-4 h-4 text-terracotta-400" />
              <span>Video Library & Branding Versions</span>
              <span className="text-xs bg-surface px-2 py-0.5 rounded-full text-slate-400 border border-border font-semibold">
                {videos.length} Masters
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Immutable master videos and their non-destructive moving watermark renders
            </p>
          </div>
        </div>

        {videos.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs bg-surface/30 rounded-2xl border border-dashed border-border">
            <Film className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
            No videos in library yet. Import a video from the AI pipeline above or upload an MP4.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {videos.map((vid) => {
              const isSelected = selectedVideoId === vid.id;
              const hasBranded = (vid.branded_variants?.length || 0) > 0;
              const streamUrl = vid.streamUrl || `/uploads/${vid.file_path.split(/[/\\]/).pop()}`;
              const thumbUrl = vid.thumbnailUrl || (vid.thumbnail_path ? `/uploads/${vid.thumbnail_path.split(/[/\\]/).pop()}` : null);

              return (
                <div
                  key={vid.id}
                  className={`bg-surface border rounded-2xl overflow-hidden transition-all shadow-xs flex flex-col justify-between ${
                    isSelected ? 'border-terracotta-500 ring-2 ring-terracotta-500/20' : 'border-border hover:border-slate-600'
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
                        {vid.aspect_ratio}
                      </span>
                      <span className="absolute top-2 right-2 text-[10px] bg-black/80 backdrop-blur-xs text-white px-2 py-0.5 rounded-md font-mono">
                        {vid.duration.toFixed(1)}s
                      </span>

                      {/* Play Master Overlay Button */}
                      <button
                        onClick={() => setActivePreview({
                          url: streamUrl,
                          title: vid.title,
                          isBranded: false,
                          aspectRatio: vid.aspect_ratio,
                          duration: vid.duration,
                        })}
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
                          <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>{(vid.file_size / 1024 / 1024).toFixed(1)} MB</span>
                            <span>•</span>
                            <span className="uppercase text-terracotta-400 font-bold">{vid.source_type.replace('_', ' ')}</span>
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
                          className="flex-1 py-1.5 bg-surface-card hover:bg-terracotta-600 text-slate-200 hover:text-white border border-border hover:border-terracotta-500 rounded-xl font-bold text-xs transition-colors cursor-pointer active:scale-95 text-center"
                        >
                          Use Master for Post
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePreview({
                            url: streamUrl,
                            title: vid.title,
                            isBranded: false,
                            aspectRatio: vid.aspect_ratio,
                            duration: vid.duration,
                          })}
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
                                  onClick={() => onSelectVideoVariant(vid.id, variant.id, `${vid.title} (${variant.watermark_text})`)}
                                  className="px-2 py-0.5 bg-terracotta-500/15 hover:bg-terracotta-500/25 text-terracotta-300 border border-terracotta-500/30 rounded-lg cursor-pointer flex items-center gap-1 text-[10px] font-bold transition-all active:scale-95"
                                  title="Select and publish this branded version"
                                >
                                  <Send className="w-2.5 h-2.5" />
                                  <span>Publish</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setActivePreview({
                                  url: variant.previewUrl,
                                  title: `${vid.title} (${variant.watermark_text})`,
                                  isBranded: true,
                                  aspectRatio: variant.aspect_ratio,
                                  duration: variant.duration,
                                  watermarkText: variant.watermark_text,
                                })}
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
        )}
      </div>

      {/* 4. REAL IN-BROWSER PLAYBACK MODAL */}
      {activePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-card border border-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <span>{activePreview.title}</span>
                  {activePreview.isBranded ? (
                    <span className="text-[10px] bg-terracotta-500/20 text-terracotta-300 border border-terracotta-500/30 px-2 py-0.5 rounded-full font-mono">
                      Branded MP4 ({activePreview.watermarkText})
                    </span>
                  ) : (
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono">
                      Original Master (Unbranded)
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>Aspect: {activePreview.aspectRatio || 'Auto'}</span>
                  <span>•</span>
                  <span>HTTP Range Seeking Enabled</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-sage-400"><Volume2 className="w-3 h-3" /> Audio Track Active</span>
                </p>
              </div>

              <button
                onClick={() => setActivePreview(null)}
                aria-label="Close Preview"
                title="Close Preview"
                className="p-1.5 text-slate-400 hover:text-white light:hover:text-slate-100 rounded-lg hover:bg-surface cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-black flex items-center justify-center flex-1 min-h-[360px] overflow-hidden">
              <video
                controls
                autoPlay
                playsInline
                src={activePreview.url}
                className="max-h-[500px] w-full object-contain rounded-xl"
              />
            </div>

            <div className="p-3.5 bg-surface border-t border-border flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">
                {activePreview.isBranded ? 'Non-destructive export from FFmpeg' : 'Source master video is immutable and untouched'}
              </span>
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
    </div>
  );
};
