import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { Account, BrandKit, VideoItem } from '../types';
import { 
  Sparkles, Save, Film, CheckCircle2, Eye, Play 
} from 'lucide-react';
import { WatermarkCanvas } from '../components/branding/WatermarkCanvas';
import { WatermarkControls } from '../components/branding/WatermarkControls';

interface Props {
  initialAccountId?: string;
  selectedCategory?: string;
}

export const BrandingStudioView: React.FC<Props> = ({ initialAccountId }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId || '');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  
  // Brand Kit State
  const [brandKit, setBrandKit] = useState<BrandKit>({
    watermarkType: 'moving_text',
    text: '@ObjectToLife',
    movementPreset: 'smooth_sine',
    speedSeconds: 12,
    intervalSeconds: 6,
    fontSize: 24,
    opacity: 0.85,
    fontColor: '#FFFFFF',
    boxBgColor: '#000000',
    boxBgOpacity: 0.45,
    safeArea: { top: 120, bottom: 280, left: 40, right: 120 },
    enableSignature: true,
    signatureText: 'Created with AI Video Engine',
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [accRes, vidRes] = await Promise.all([
        api.getAccounts(),
        api.getVideos(),
      ]);
      const accs = accRes.accounts || [];
      setAccounts(accs);
      setVideos(vidRes.videos || []);

      const targetId = selectedAccountId || accs[0]?.id;
      if (targetId) {
        setSelectedAccountId(targetId);
        const acc = accs.find((a: Account) => a.id === targetId);
        if (acc?.brandKit) {
          setBrandKit(acc.brandKit);
        }
      }

      if (vidRes.videos?.length > 0 && !selectedVideoId) {
        setSelectedVideoId(vidRes.videos[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedAccountId, selectedVideoId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectAccount = (accId: string) => {
    setSelectedAccountId(accId);
    const acc = accounts.find(a => a.id === accId);
    if (acc?.brandKit) {
      setBrandKit(acc.brandKit);
    }
    setRenderedPreviewUrl(null);
  };

  const handleSaveBrandKit = async () => {
    if (!selectedAccountId) return;
    setSaving(true);
    try {
      await api.updateBrandKit(selectedAccountId, brandKit);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestRenderFFmpeg = async () => {
    if (!selectedVideoId) return;
    setRendering(true);
    setRenderedPreviewUrl(null);
    try {
      const res = await api.renderPreview(selectedVideoId, brandKit);
      if (res.previewUrl) {
        setRenderedPreviewUrl(res.previewUrl);
      }
    } catch (err) {
      console.error('Test render failed:', err);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 sm:p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Studio Identity
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>Branding Studio & Moving Watermarks</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure dynamic moving watermarks, brand kits, and safe-area overlays per account
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
          <button
            onClick={handleSaveBrandKit}
            disabled={saving}
            className="px-4 py-2 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-terracotta-600/25 transition-all cursor-pointer active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save Brand Kit'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Brand Kit Parameters (6 cols) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Select Account */}
          <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-3">
              1. Select Social Account Brand Kit
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {accounts.map((acc) => {
                const isSelected = acc.id === selectedAccountId;
                return (
                  <button
                    key={acc.id}
                    onClick={() => handleSelectAccount(acc.id)}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-terracotta-500 bg-terracotta-500/10 shadow-xs'
                        : 'border-border bg-surface hover:border-slate-600'
                    }`}
                  >
                    <img 
                      src={acc.avatar_url} 
                      alt={acc.name} 
                      className="w-8 h-8 rounded-lg object-cover border border-border shrink-0" 
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 truncate">{acc.name}</p>
                      <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded ${
                        acc.platform === 'facebook' ? 'text-blue-400 bg-blue-500/10' : 'text-rose-400 bg-rose-500/10'
                      }`}>
                        {acc.platform}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Watermark Configuration Controls */}
          <WatermarkControls
            brandKit={brandKit}
            setBrandKit={setBrandKit}
          />
        </div>

        {/* Right Column: Interactive Simulator & FFmpeg Test Render (6 cols) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Live Simulator Viewport */}
          <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-terracotta-400" /> Live Watermark Motion Simulator
                </h3>
                <p className="text-[11px] text-slate-400">
                  Real-time preview rendered within TikTok & Meta safe boundaries
                </p>
              </div>
              <span className="text-[10px] bg-terracotta-500/15 text-terracotta-300 border border-terracotta-500/25 px-2 py-0.5 rounded-md font-mono">
                9:16 Canvas
              </span>
            </div>

            {/* Canvas element */}
            <div className="flex justify-center bg-black/75 p-4 sm:p-5 rounded-2xl border border-border shadow-inner">
              <WatermarkCanvas
                brandKit={brandKit}
                width={360}
                height={640}
              />
            </div>
          </div>

          {/* Real Backend FFmpeg Test Rendering */}
          <div className="bg-surface-card border border-border rounded-2xl p-5 text-xs shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Film className="w-4 h-4 text-terracotta-400" />
              <span>Test Render with Backend FFmpeg</span>
            </h3>
            <p className="text-[11px] text-slate-400 mb-3.5">
              Pre-renders the actual moving watermark onto a video file to verify encoding quality
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 mb-4">
              <select
                value={selectedVideoId}
                onChange={(e) => setSelectedVideoId(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500 cursor-pointer text-xs"
              >
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>{v.title} ({v.aspect_ratio})</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleTestRenderFFmpeg}
                disabled={rendering || !selectedVideoId}
                className="px-4 py-2 bg-terracotta-600 hover:bg-terracotta-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-md shadow-terracotta-600/25 transition-all whitespace-nowrap cursor-pointer active:scale-95"
              >
                <Play className="w-3.5 h-3.5" />
                {rendering ? 'Rendering with FFmpeg...' : 'Render Preview'}
              </button>
            </div>

            {renderedPreviewUrl && (
              <div className="mt-3 p-3.5 bg-surface rounded-xl border border-sage-500/40">
                <p className="font-bold text-sage-400 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> FFmpeg Render Complete!
                </p>
                <video
                  controls
                  autoPlay
                  src={renderedPreviewUrl}
                  className="rounded-xl max-h-[380px] w-full object-contain bg-black border border-border"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
