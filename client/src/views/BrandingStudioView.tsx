import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { Account, BrandKit, VideoItem, BrandedVideo } from '../types';
import { 
  Sparkles, Save, Film, CheckCircle2, Eye, Play, Download, Trash2, ShieldCheck, RefreshCw, AlertCircle
} from 'lucide-react';
import { WatermarkCanvas } from '../components/branding/WatermarkCanvas';
import { WatermarkControls } from '../components/branding/WatermarkControls';
import { resolveBrandingMode } from '../../../server/src/domain/branding-layout';

interface Props {
  initialAccountId?: string;
  selectedCategory?: string;
}

export const BrandingStudioView: React.FC<Props> = ({ initialAccountId }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId || '');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const currentVideoId = useRef(selectedVideoId);
  currentVideoId.current = selectedVideoId;
  const variantsRequest = useRef(0);
  const [variants, setVariants] = useState<BrandedVideo[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  
  // Account defaults and per-video overrides are deliberately separate.
  const [brandKit, setBrandKit] = useState<BrandKit>({
    watermarkType: 'moving_text', text: '', movementPreset: 'smooth_sine',
    speedSeconds: 12, intervalSeconds: 6, fontSize: 26, opacity: 0.85,
    fontColor: '#FFFFFF', signatureText: '',
  });
  const [captionOverride, setCaptionOverride] = useState<string | null>(null);
  const effectiveBrandKit: BrandKit = captionOverride === null ? brandKit : { ...brandKit, signatureText: captionOverride };
  const renderKey = JSON.stringify([selectedVideoId, selectedAccountId, effectiveBrandKit]);
  const latestRenderKey = useRef(renderKey);
  latestRenderKey.current = renderKey;
  const kitForAccount = (account: Account): BrandKit => ({
    watermarkType: 'moving_text', text: account.handle, movementPreset: 'smooth_sine',
    fontSize: 26, opacity: 0.85, ...account.brandKit,
    signatureText: account.brandKit?.signatureText === undefined ? account.name : account.brandKit.signatureText,
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderedPreview, setRenderedPreview] = useState<{
    previewUrl: string;
    downloadUrl: string;
    sha256?: string;
    variantId?: string;
  } | null>(null);

  const loadVariants = useCallback(async (vidId: string) => {
    if (!vidId || vidId !== currentVideoId.current) return;
    const request = ++variantsRequest.current;
    setLoadingVariants(true);
    try {
      const res = await api.getBrandedVariants(vidId);
      if (request === variantsRequest.current && vidId === currentVideoId.current) setVariants(res.variants || []);
    } catch (err) {
      console.error('Failed to load variants:', err);
    } finally {
      if (request === variantsRequest.current && vidId === currentVideoId.current) setLoadingVariants(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [accRes, vidRes] = await Promise.all([
        api.getAccounts(),
        api.getVideos(),
      ]);
      const accs = accRes.accounts || [];
      setAccounts(accs);
      const vids = vidRes.videos || [];
      setVideos(vids);

      const targetId = initialAccountId || accs[0]?.id;
      if (targetId) {
        setSelectedAccountId(targetId);
        const acc = accs.find((a: Account) => a.id === targetId);
        if (acc) setBrandKit(kitForAccount(acc));
      }

      if (vids.length > 0) {
        setSelectedVideoId(vids[0].id);

      }
    } catch (err) {
      console.error(err);
    }
  }, [initialAccountId, loadVariants]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setCaptionOverride(null);
    setVariants([]);
    if (selectedVideoId) loadVariants(selectedVideoId);
  }, [selectedVideoId, loadVariants]);

  useEffect(() => { setRenderedPreview(null); }, [renderKey]);

  const handleSelectAccount = (accId: string) => {
    setSelectedAccountId(accId);
    const acc = accounts.find(a => a.id === accId);
    if (acc) setBrandKit(kitForAccount(acc));
    setCaptionOverride(null);
    setRenderedPreview(null);
  };

  const handleSaveBrandKit = async () => {
    if (!selectedAccountId) return;
    setSaving(true);
    try {
      await api.updateBrandKit(selectedAccountId, brandKit);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setAccounts(prev => prev.map(account => account.id === selectedAccountId ? { ...account, brandKit: { ...brandKit } } : account));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestRenderFFmpeg = async () => {
    if (!selectedVideoId) return;
    setRendering(true);
    setRenderError(null);
    setRenderedPreview(null);
    const requestedKey = renderKey;
    try {
      const res = await api.renderPreview(selectedVideoId, effectiveBrandKit, `${resolveBrandingMode(effectiveBrandKit)}_${brandKit.movementPreset}`);
      if (res.previewUrl && latestRenderKey.current === requestedKey) {
        setRenderedPreview({
          previewUrl: res.previewUrl,
          downloadUrl: res.downloadUrl || res.previewUrl,
          sha256: res.sha256,
          variantId: res.variantId,
        });
        await loadVariants(selectedVideoId);
      }
    } catch (err: any) {
      console.error('Test render failed:', err);
      setRenderError(err.message || 'Rendering failed');
    } finally {
      setRendering(false);
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    try {
      await api.deleteBrandedVariant(variantId);
      if (renderedPreview?.variantId === variantId) {
        setRenderedPreview(null);
      }
      await loadVariants(selectedVideoId);
    } catch (err) {
      console.error('Failed to delete variant:', err);
    }
  };

  const activeVideo = videos.find(v => v.id === selectedVideoId);
  const is169 = activeVideo?.aspect_ratio === '16:9';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-5 sm:p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Studio Identity
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-sage-500/15 text-sage-400 border border-sage-500/30 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3" /> Non-Destructive Invariance
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <span>Branding Studio & Moving Watermarks</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure dynamic moving watermarks, brand kits, and safe-area overlays. Master videos remain permanently immutable.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
          <button
            onClick={handleSaveBrandKit}
            disabled={saving || !selectedAccountId}
            className="scc-btn-primary text-xs"
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
                    aria-pressed={isSelected}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-terracotta-500 bg-terracotta-500/10 shadow-xs'
                        : 'border-border bg-surface hover:border-slate-600'
                    }`}
                  >
                    <img 
                      src={acc.avatar_url || '/avatar.svg'}
                      alt={acc.name} 
                      className="w-8 h-8 rounded-lg object-cover border border-border shrink-0" 
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 truncate">{acc.is_demo ? 'DEMO: ' : ''}{acc.name}</p>
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
          <div className="bg-surface-card border border-border rounded-2xl p-5 space-y-3 text-xs">
            <label className="flex items-center gap-2 font-semibold text-slate-300 cursor-pointer">
              <input type="checkbox" checked={captionOverride !== null}
                onChange={e => setCaptionOverride(e.target.checked ? brandKit.signatureText ?? '' : null)}
                className="accent-terracotta-600" />
              Use Per-Video Caption Override
            </label>
            {captionOverride !== null && (
              <div>
                <label htmlFor="video-brand-caption" className="block font-semibold text-slate-300 mb-1">Per-Video Bottom Caption</label>
                <input id="video-brand-caption" type="text" value={captionOverride}
                  onChange={e => setCaptionOverride(e.target.value)}
                  placeholder="Custom brand name, slogan, or call-to-action"
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500" />
              </div>
            )}
            <p className="text-[11px] text-slate-400">Applies to this render and live preview in both bottom-caption modes. Save Brand Kit saves the account default above. Changing the account or video clears this override.</p>
          </div>
        </div>

        {/* Right Column: Interactive Simulator & FFmpeg Test Render (6 cols) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Live Simulator Viewport */}
          <div className="bg-surface-card border border-border rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-terracotta-400" /> Live Branding Preview
                </h3>
                <p className="text-[11px] text-slate-400">
                  Live preview over the selected master video; safe-area guides are optional ({is169 ? 'Facebook 16:9' : 'TikTok 9:16'})
                </p>
              </div>
              <span className="text-[10px] bg-terracotta-500/15 text-terracotta-300 border border-terracotta-500/25 px-2 py-0.5 rounded-md font-mono">
                {is169 ? '16:9 Landscape' : '9:16 Vertical'}
              </span>
            </div>

            {/* Canvas element */}
            <div className="media-surface flex justify-center bg-black/75 p-4 sm:p-5 rounded-2xl border border-border shadow-inner">
              <WatermarkCanvas
                brandKit={effectiveBrandKit}
                sourceUrl={activeVideo?.streamUrl || (activeVideo ? `/api/publishing/videos/${encodeURIComponent(activeVideo.id)}/stream` : undefined)}
                sourceWidth={activeVideo?.width}
                sourceHeight={activeVideo?.height}
                aspectRatio={is169 ? '16:9' : '9:16'}
                width={is169 ? 440 : 320}
                height={is169 ? 248 : 568}
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
              Renders the selected branding mode into a separate output file. Master video remains strictly untouched.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 mb-4">
              <select
                aria-label="Master Video"
                value={selectedVideoId}
                onChange={(e) => setSelectedVideoId(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500 cursor-pointer text-xs"
              >
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} ({v.aspect_ratio || '9:16'} • {Math.round(v.duration || 0)}s)
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleTestRenderFFmpeg}
                disabled={rendering || !selectedVideoId}
                className="scc-btn-primary whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {rendering ? 'Rendering with FFmpeg...' : 'Render Preview'}
              </button>
            </div>

            {renderError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{renderError}</span>
              </div>
            )}

            {renderedPreview && (
              <div className="mt-3 p-4 bg-surface rounded-xl border border-sage-500/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold text-sage-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> FFmpeg Render Complete!
                  </p>
                  <a
                    href={renderedPreview.downloadUrl}
                    download
                    className="px-3 py-1.5 bg-sage-600/20 hover:bg-sage-600/30 text-sage-300 border border-sage-500/40 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> Download MP4
                  </a>
                </div>

                <video
                  controls
                  autoPlay
                  src={renderedPreview.previewUrl}
                  className="rounded-xl max-h-[340px] w-full object-contain bg-black border border-border"
                />

                {renderedPreview.sha256 && (
                  <div className="p-2.5 bg-black/40 light:bg-surface rounded-lg border border-border text-[10px] font-mono text-slate-400 flex items-center justify-between">
                    <span className="text-slate-500">Render SHA256:</span>
                    <span className="truncate max-w-[280px] text-slate-300">{renderedPreview.sha256}</span>
                  </div>
                )}
              </div>
            )}

            {/* List of Branded Variants for this Video */}
            <div className="mt-6 pt-5 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-terracotta-400" />
                  Existing Branded Variants ({variants.length})
                </h4>
                <button
                  onClick={() => loadVariants(selectedVideoId)}
                  disabled={loadingVariants}
                  className="scc-btn-secondary text-[11px]"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingVariants ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {variants.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic py-2">
                  No branded versions rendered for this video yet. Click "Render Preview" above to generate one.
                </p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {variants.map((v) => (
                    <div
                      key={v.id}
                      className="p-2.5 bg-surface rounded-xl border border-border flex flex-wrap items-center justify-between gap-3 text-xs hover:border-slate-600 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-slate-200 truncate">
                            {v.preset_name || v.movement_preset}
                          </span>
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-terracotta-500/15 text-terracotta-300 border border-terracotta-500/20">
                            {v.movement_preset}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          Watermark: "{v.watermark_text}" • {v.width}x{v.height} • {(v.file_size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setRenderedPreview({
                            previewUrl: v.previewUrl,
                            downloadUrl: v.downloadUrl || v.previewUrl,
                            sha256: v.sha256,
                            variantId: v.id,
                          })}
                          title="Preview in Player"
                          aria-label="Preview in Player"
                          className="scc-icon-btn"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={v.downloadUrl || v.previewUrl}
                          download
                          title="Download Watermarked File"
                          aria-label="Download Watermarked File"
                          className="scc-icon-btn"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleDeleteVariant(v.id)}
                          title="Delete variant (Master video is preserved)"
                          aria-label="Delete variant (Master video is preserved)"
                          className="scc-icon-btn text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
