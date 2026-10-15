import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import { Account, BrandKit, VideoItem } from '../types';
import { 
  Sparkles, Sliders, Play, Save, Film, CheckCircle2, 
  RotateCcw, Eye, Shield, Layers, HelpCircle 
} from 'lucide-react';

interface Props {
  initialAccountId?: string;
  selectedCategory: string;
}

export const BrandingStudioView: React.FC<Props> = ({ initialAccountId, selectedCategory }) => {
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

  // Canvas ref for live interactive watermark simulation
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const loadData = async () => {
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
  };

  useEffect(() => {
    loadData();
  }, []);

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

  // Live Canvas Watermark Animation Simulator
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = Date.now();

    const renderFrame = () => {
      const now = Date.now();
      const t = (now - startTime) / 1000;

      const W = canvas.width;
      const H = canvas.height;

      // Draw background gradient (representing video viewport)
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#0F172A');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Safe area visual outline
      const safeTop = (brandKit.safeArea?.top || 120) * (H / 1920);
      const safeBottom = (brandKit.safeArea?.bottom || 280) * (H / 1920);
      const safeLeft = (brandKit.safeArea?.left || 40) * (W / 1080);
      const safeRight = (brandKit.safeArea?.right || 120) * (W / 1080);

      ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(safeLeft, safeTop, W - safeLeft - safeRight, H - safeTop - safeBottom);
      ctx.setLineDash([]);

      // Safe area label
      ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
      ctx.font = '10px sans-serif';
      ctx.fillText('TikTok / Mobile Safe Area', safeLeft + 8, safeTop + 14);

      // Calculate watermark text width & height
      const text = brandKit.text || '@Handle';
      const fontSize = (brandKit.fontSize || 24) * (W / 1080) * 1.5;
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textMetrics = ctx.measureText(text);
      const textW = textMetrics.width;
      const textH = fontSize * 1.2;

      let x = safeLeft;
      let y = safeTop;

      const preset = brandKit.movementPreset || 'smooth_sine';
      const speed = brandKit.speedSeconds || 12;

      if (preset === 'smooth_sine') {
        const spanX = W - textW - safeLeft - safeRight;
        const spanY = H - textH - safeTop - safeBottom;
        x = safeLeft + (spanX * (1 + Math.sin((2 * Math.PI * t) / speed))) / 2;
        y = safeTop + (spanY * (1 + Math.cos((2 * Math.PI * t) / speed))) / 2;
      } else if (preset === 'corner_jump') {
        const interval = brandKit.intervalSeconds || 6;
        const step = Math.floor(t / interval) % 4;
        if (step === 0) {
          x = safeLeft;
          y = safeTop;
        } else if (step === 1) {
          x = W - textW - safeRight;
          y = safeTop;
        } else if (step === 2) {
          x = W - textW - safeRight;
          y = H - textH - safeBottom;
        } else {
          x = safeLeft;
          y = H - textH - safeBottom;
        }
      } else if (preset === 'diagonal_bounce') {
        const spanX = W - textW - safeLeft - safeRight;
        const spanY = H - textH - safeTop - safeBottom;
        x = safeLeft + Math.abs(((t * 80) % (spanX * 2)) - spanX);
        y = safeTop + Math.abs(((t * 50) % (spanY * 2)) - spanY);
      } else {
        // Static
        x = W - textW - safeRight;
        y = safeTop;
      }

      // Draw Box Background
      ctx.fillStyle = `rgba(0, 0, 0, ${brandKit.boxBgOpacity ?? 0.45})`;
      ctx.fillRect(x - 6, y - textH + 4, textW + 12, textH + 6);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 6, y - textH + 4, textW + 12, textH + 6);

      // Draw Text
      ctx.fillStyle = `rgba(255, 255, 255, ${brandKit.opacity ?? 0.85})`;
      ctx.fillText(text, x, y);

      // Draw optional signature
      if (brandKit.enableSignature && brandKit.signatureText) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        const sigMetrics = ctx.measureText(brandKit.signatureText);
        ctx.fillText(brandKit.signatureText, (W - sigMetrics.width) / 2, H - 20);
      }

      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [brandKit]);

  const currentAcc = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 rounded-xl border border-border">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span>Branding Studio & Moving Watermarks</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure dynamic moving watermarks, brand kits, and safe-area overlays per account
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveBrandKit}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition-all"
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
          <div className="bg-surface-card border border-border rounded-xl p-5">
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
                    className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-600/10'
                        : 'border-slate-800 bg-surface hover:border-slate-700'
                    }`}
                  >
                    <img 
                      src={acc.avatar_url} 
                      alt={acc.name} 
                      className="w-8 h-8 rounded-lg object-cover border border-slate-700" 
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{acc.name}</p>
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

          {/* Watermark Configuration Form */}
          <div className="bg-surface-card border border-border rounded-xl p-5 space-y-4 text-xs">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
              2. Watermark & Movement Preset
            </label>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Watermark Handle / Text</label>
              <input
                type="text"
                value={brandKit.text || ''}
                onChange={(e) => setBrandKit(prev => ({ ...prev, text: e.target.value }))}
                placeholder="@YourAccountHandle"
                className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Movement Animation Preset</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'smooth_sine', label: 'Smooth Sine Wave' },
                  { id: 'corner_jump', label: 'Corner Interval Jump' },
                  { id: 'diagonal_bounce', label: 'Diagonal Bounce' },
                  { id: 'static_corner', label: 'Static Corner' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setBrandKit(prev => ({ ...prev, movementPreset: preset.id as any }))}
                    className={`py-2 px-3 rounded-lg border font-semibold text-center ${
                      brandKit.movementPreset === preset.id
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                        : 'border-slate-800 bg-surface text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Speed / Cycle Time ({brandKit.speedSeconds || 12}s)
                </label>
                <input
                  type="range"
                  min="4"
                  max="30"
                  value={brandKit.speedSeconds || 12}
                  onChange={(e) => setBrandKit(prev => ({ ...prev, speedSeconds: Number(e.target.value) }))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Corner Hop Interval ({brandKit.intervalSeconds || 6}s)
                </label>
                <input
                  type="range"
                  min="2"
                  max="15"
                  value={brandKit.intervalSeconds || 6}
                  onChange={(e) => setBrandKit(prev => ({ ...prev, intervalSeconds: Number(e.target.value) }))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Watermark Opacity ({Math.round((brandKit.opacity || 0.85) * 100)}%)
                </label>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={brandKit.opacity || 0.85}
                  onChange={(e) => setBrandKit(prev => ({ ...prev, opacity: Number(e.target.value) }))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Font Size ({brandKit.fontSize || 24}px)
                </label>
                <input
                  type="range"
                  min="16"
                  max="48"
                  value={brandKit.fontSize || 24}
                  onChange={(e) => setBrandKit(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            {/* Signature option */}
            <div className="pt-3 border-t border-slate-800">
              <label className="flex items-center gap-2 font-semibold text-slate-300 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={brandKit.enableSignature}
                  onChange={(e) => setBrandKit(prev => ({ ...prev, enableSignature: e.target.checked }))}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                Include Lower Digital Signature / Copyright
              </label>

              {brandKit.enableSignature && (
                <input
                  type="text"
                  value={brandKit.signatureText || ''}
                  onChange={(e) => setBrandKit(prev => ({ ...prev, signatureText: e.target.value }))}
                  placeholder="e.g. Crafted with AI Video Engine"
                  className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Simulator & FFmpeg Test Render (6 cols) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Live Simulator Viewport */}
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-indigo-400" /> Live Watermark Motion Simulator
                </h3>
                <p className="text-[11px] text-slate-400">
                  Real-time preview rendered within TikTok & Meta safe boundaries
                </p>
              </div>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">
                9:16 Canvas
              </span>
            </div>

            {/* Canvas element */}
            <div className="flex justify-center bg-black/60 p-4 rounded-xl border border-slate-800">
              <canvas
                ref={canvasRef}
                width={360}
                height={640}
                className="rounded-lg shadow-2xl max-w-full h-auto border border-slate-700"
              />
            </div>
          </div>

          {/* Real Backend FFmpeg Test Rendering */}
          <div className="bg-surface-card border border-border rounded-xl p-5 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
              <Film className="w-4 h-4 text-indigo-400" />
              <span>Test Render with Backend FFmpeg</span>
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              Pre-renders the actual moving watermark onto a video file to verify encoding quality
            </p>

            <div className="flex items-center gap-3 mb-4">
              <select
                value={selectedVideoId}
                onChange={(e) => setSelectedVideoId(e.target.value)}
                className="flex-1 bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>{v.title} ({v.aspect_ratio})</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleTestRenderFFmpeg}
                disabled={rendering || !selectedVideoId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow transition-all whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {rendering ? 'Rendering with FFmpeg...' : 'Render Preview'}
              </button>
            </div>

            {renderedPreviewUrl && (
              <div className="mt-3 p-3 bg-surface rounded-lg border border-indigo-500/40">
                <p className="font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> FFmpeg Render Complete!
                </p>
                <video
                  controls
                  autoPlay
                  src={renderedPreviewUrl}
                  className="w-full max-h-[320px] rounded bg-black object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
