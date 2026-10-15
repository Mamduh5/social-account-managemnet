import React from 'react';
import { VideoItem } from '../../types';
import { Sparkles, Film } from 'lucide-react';

export interface VideoLibraryGridProps {
  videos: VideoItem[];
  pipelineFiles: any[];
  selectedVideoId: string;
  onSelectVideo: (videoId: string, title: string) => void;
  onImportPipelineFile: (filePath: string, filename: string) => void;
}

export const VideoLibraryGrid: React.FC<VideoLibraryGridProps> = ({
  videos,
  pipelineFiles,
  selectedVideoId,
  onSelectVideo,
  onImportPipelineFile,
}) => {
  return (
    <div className="space-y-6">
      {/* AI Pipeline Direct Watch Folder */}
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-terracotta-400" />
              <span>AI Video Pipeline Watcher</span>
              <span className="text-xs bg-terracotta-500/15 text-terracotta-300 border border-terracotta-500/25 px-2 py-0.5 rounded-full font-semibold">
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
            <div key={i} className="bg-surface p-3.5 rounded-xl border border-border flex items-center justify-between text-xs">
              <div className="min-w-0 pr-2">
                <p className="font-bold text-slate-200 truncate">{file.filename}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB • {file.modifiedAt.slice(0, 10)}
                </p>
              </div>
              {file.isImported ? (
                <span className="text-[10px] text-sage-400 font-bold px-2 py-1 bg-sage-500/10 border border-sage-500/20 rounded-md shrink-0">
                  Imported
                </span>
              ) : (
                <button
                  onClick={() => onImportPipelineFile(file.fullPath, file.filename)}
                  className="px-3 py-1 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-lg font-bold text-xs whitespace-nowrap cursor-pointer transition-colors active:scale-95 shrink-0"
                >
                  Import
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Master Video Library */}
      <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
        <h3 className="text-base font-bold text-slate-100 mb-3">Saved Master Videos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {videos.map((vid) => (
            <div 
              key={vid.id}
              className={`bg-surface border rounded-2xl overflow-hidden hover:border-slate-600 transition-all shadow-xs ${
                selectedVideoId === vid.id ? 'border-terracotta-500 ring-2 ring-terracotta-500/20' : 'border-border'
              }`}
            >
              <div className="aspect-video bg-black relative flex items-center justify-center">
                <Film className="w-8 h-8 text-slate-600 opacity-60" />
                <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/80 text-white px-1.5 py-0.5 rounded font-mono">
                  {vid.duration.toFixed(1)}s
                </span>
              </div>
              <div className="p-3.5 text-xs">
                <h4 className="font-bold text-slate-100 truncate">{vid.title}</h4>
                <p className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span className="font-mono">{vid.aspect_ratio}</span>
                  <span className="uppercase text-[9px] text-terracotta-400 font-bold">{vid.source_type}</span>
                </p>
                <button
                  onClick={() => onSelectVideo(vid.id, vid.title)}
                  className="mt-3 w-full py-1.5 bg-surface-card hover:bg-terracotta-600 text-slate-300 hover:text-white border border-border hover:border-terracotta-500 rounded-xl font-bold text-xs transition-colors cursor-pointer active:scale-95"
                >
                  Use for Post
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
