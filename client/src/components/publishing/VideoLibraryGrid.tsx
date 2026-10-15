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
                  onClick={() => onImportPipelineFile(file.fullPath, file.filename)}
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
                  onClick={() => onSelectVideo(vid.id, vid.title)}
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
  );
};
