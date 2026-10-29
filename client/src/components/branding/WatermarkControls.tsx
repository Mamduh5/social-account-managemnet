import React, { useState } from 'react';
import { BrandKit } from '../../types';
import { Shield } from 'lucide-react';
import { brandingElements, resolveBrandingMode } from '../../../../server/src/domain/branding-layout';

export interface WatermarkControlsProps {
  brandKit: BrandKit;
  setBrandKit: React.Dispatch<React.SetStateAction<BrandKit>>;
}

export const WatermarkControls: React.FC<WatermarkControlsProps> = ({
  brandKit,
  setBrandKit,
}) => {
  const [showCustomSafeArea, setShowCustomSafeArea] = useState(false);
  const elements = brandingElements(brandKit);

  const applySafeAreaPreset = (preset: 'tiktok_9_16' | 'facebook_16_9') => {
    if (preset === 'tiktok_9_16') {
      setBrandKit(prev => ({
        ...prev,
        safeArea: { top: 120, bottom: 280, left: 40, right: 120 },
      }));
    } else {
      setBrandKit(prev => ({
        ...prev,
        safeArea: { top: 60, bottom: 80, left: 40, right: 80 },
      }));
    }
  };

  return (
    <div className="bg-surface-card border border-border rounded-2xl p-5 space-y-4 text-xs shadow-xs">
      <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
        2. Branding Mode & Text
      </label>

      <fieldset className="space-y-2">
        <legend className="text-slate-300 font-semibold mb-1.5">Branding Mode</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            ['none', 'No Watermark'],
            ['moving', 'Moving Watermark Only'],
            ['moving_and_caption', 'Moving Watermark + Bottom Caption'],
            ['caption', 'Bottom Caption Only'],
          ] as const).map(([mode, label]) => (
            <label key={mode} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors hover:border-terracotta-500/50 focus-within:outline focus-within:outline-2 focus-within:outline-honey-400 ${resolveBrandingMode(brandKit) === mode ? 'border-terracotta-500 bg-terracotta-500/15 text-terracotta-300' : 'border-border bg-surface text-slate-300'}`}>
              <input type="radio" name="branding-mode" value={mode} checked={resolveBrandingMode(brandKit) === mode}
                onChange={() => setBrandKit(prev => ({ ...prev, mode, enableSignature: mode === 'caption' || mode === 'moving_and_caption' }))}
                className="accent-terracotta-600" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!elements.moving} className={`space-y-4 ${elements.moving ? '' : 'opacity-50'}`}>
      <legend className="sr-only">Moving watermark settings</legend>
      {/* Watermark Text */}
      <div>
        <label className="block text-slate-300 font-semibold mb-1">Watermark Handle / Text</label>
        <input
          aria-label="Watermark Handle / Text"
          type="text"
          value={brandKit.text || ''}
          onChange={(e) => setBrandKit(prev => ({ ...prev, text: e.target.value }))}
          placeholder="@SocialCommandCenter"
          className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500 font-mono"
        />
      </div>

      {/* Movement Presets */}
      <div>
        <label className="block text-slate-300 font-semibold mb-1.5">Movement Animation Preset</label>
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
              aria-pressed={brandKit.movementPreset === preset.id}
              className={`py-2 px-3 rounded-xl border font-bold text-center transition-all cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed ${
                brandKit.movementPreset === preset.id
                  ? 'border-terracotta-500 bg-terracotta-500/15 text-terracotta-300 shadow-xs'
                  : 'border-border bg-surface text-slate-400 hover:border-slate-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Speed & Interval */}
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
            className="w-full accent-terracotta-500"
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
            className="w-full accent-terracotta-500"
          />
        </div>
      </div>

      </fieldset>

      {/* Opacity is moving-only; font scale also sizes the bottom brand label. */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-300 font-semibold mb-1">
            Watermark Opacity ({Math.round((brandKit.opacity || 0.85) * 100)}%)
          </label>
          <input
            type="range"
            aria-label="Watermark Opacity"
            disabled={!elements.moving}
            min="0.2"
            max="1.0"
            step="0.05"
            value={brandKit.opacity || 0.85}
            onChange={(e) => setBrandKit(prev => ({ ...prev, opacity: Number(e.target.value) }))}
            className="w-full accent-terracotta-500"
          />
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1">
            Font Scale ({brandKit.fontSize || 26}px)
          </label>
          <input
            type="range"
            aria-label="Font Scale"
            disabled={!elements.moving && !elements.caption}
            min="16"
            max="48"
            value={brandKit.fontSize || 26}
            onChange={(e) => setBrandKit(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
            className="w-full accent-terracotta-500"
          />
        </div>
      </div>

      {/* Safe Area Configuration */}
      <div className="pt-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-terracotta-400" /> Safe-Area Boundaries
          </label>
          <button
            type="button"
            onClick={() => setShowCustomSafeArea(!showCustomSafeArea)}
            aria-expanded={showCustomSafeArea}
            className="scc-link-action text-[11px]"
          >
            {showCustomSafeArea ? 'Hide Custom' : 'Adjust Margins →'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applySafeAreaPreset('tiktok_9_16')}
            aria-pressed={brandKit.safeArea?.top === 120 && brandKit.safeArea?.bottom === 280 && brandKit.safeArea?.left === 40 && brandKit.safeArea?.right === 120}
            className={`flex-1 py-1 px-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
              brandKit.safeArea?.top === 120 && brandKit.safeArea?.bottom === 280 && brandKit.safeArea?.left === 40 && brandKit.safeArea?.right === 120
                ? 'border-terracotta-500 bg-terracotta-500/10 text-terracotta-300'
                : 'border-border bg-surface text-slate-400 hover:border-slate-600'
            }`}
          >
            TikTok 9:16 Preset
          </button>
          <button
            type="button"
            onClick={() => applySafeAreaPreset('facebook_16_9')}
            aria-pressed={brandKit.safeArea?.top === 60 && brandKit.safeArea?.bottom === 80 && brandKit.safeArea?.left === 40 && brandKit.safeArea?.right === 80}
            className={`flex-1 py-1 px-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
              brandKit.safeArea?.top === 60 && brandKit.safeArea?.bottom === 80 && brandKit.safeArea?.left === 40 && brandKit.safeArea?.right === 80
                ? 'border-terracotta-500 bg-terracotta-500/10 text-terracotta-300'
                : 'border-border bg-surface text-slate-400 hover:border-slate-600'
            }`}
          >
            Facebook 16:9 Preset
          </button>
        </div>

        {showCustomSafeArea && (
          <div className="grid grid-cols-4 gap-2 pt-2 bg-surface p-3 rounded-xl border border-border">
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Top (px)</label>
              <input
                type="number"
                value={brandKit.safeArea?.top ?? 120}
                onChange={(e) => setBrandKit(prev => ({
                  ...prev,
                  safeArea: { ...prev.safeArea!, top: Number(e.target.value) }
                }))}
                className="w-full bg-surface-card border border-border rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Bottom (px)</label>
              <input
                type="number"
                value={brandKit.safeArea?.bottom ?? 280}
                onChange={(e) => setBrandKit(prev => ({
                  ...prev,
                  safeArea: { ...prev.safeArea!, bottom: Number(e.target.value) }
                }))}
                className="w-full bg-surface-card border border-border rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Left (px)</label>
              <input
                type="number"
                value={brandKit.safeArea?.left ?? 40}
                onChange={(e) => setBrandKit(prev => ({
                  ...prev,
                  safeArea: { ...prev.safeArea!, left: Number(e.target.value) }
                }))}
                className="w-full bg-surface-card border border-border rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Right (px)</label>
              <input
                type="number"
                value={brandKit.safeArea?.right ?? 120}
                onChange={(e) => setBrandKit(prev => ({
                  ...prev,
                  safeArea: { ...prev.safeArea!, right: Number(e.target.value) }
                }))}
                className="w-full bg-surface-card border border-border rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
              />
            </div>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-border space-y-2">
        <label htmlFor="account-brand-caption" className="block font-semibold text-slate-300">Account Default Bottom Caption</label>
        <input
          id="account-brand-caption"
          type="text"
          value={brandKit.signatureText ?? ''}
          onChange={(e) => setBrandKit(prev => ({ ...prev, signatureText: e.target.value }))}
          placeholder="Brand name, slogan, or call-to-action"
          className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
        />
        <p className="text-[11px] text-slate-400">Saved for this account with Save Brand Kit. Both bottom-caption modes use this text. Thai and English are supported.</p>
      </div>
    </div>
  );
};
