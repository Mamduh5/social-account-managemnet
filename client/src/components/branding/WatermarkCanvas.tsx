import React, { useEffect, useRef, useState } from 'react';
import { BrandKit } from '../../types';
import { brandingElements, calculateBrandingPosition, getBrandingLayout } from '../../../../server/src/domain/branding-layout';
import { useFeatureActive } from '../../features/FeatureActivity';

export interface WatermarkCanvasProps {
  brandKit: BrandKit;
  width?: number;
  height?: number;
  aspectRatio?: '9:16' | '16:9';
  sourceUrl?: string;
  sourceWidth?: number;
  sourceHeight?: number;
}

export const WatermarkCanvas: React.FC<WatermarkCanvasProps> = ({
  brandKit, width, height, aspectRatio = '9:16', sourceUrl, sourceWidth, sourceHeight,
}) => {
  const active = useFeatureActive();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showGuides, setShowGuides] = useState(false);
  const is169 = aspectRatio === '16:9';
  // Render at actual video resolution, then scale the viewport with CSS. This
  // preserves glyph proportions and avoids the old preview-only 1.5x font size.
  const frameWidth = sourceWidth || (is169 ? 1920 : 1080);
  const frameHeight = sourceHeight || (is169 ? 1080 : 1920);
  const displayWidth = width || (is169 ? 480 : 320);
  const displayHeight = height || displayWidth * frameHeight / frameWidth;
  const elements = brandingElements(brandKit);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const W = canvas.width, H = canvas.height;
    const layout = getBrandingLayout(brandKit, { width: W, height: H, aspectRatio });
    let animationFrame = 0;
    const start = performance.now();

    const ink = (text: string, fontSize: number) => {
      ctx.font = `${fontSize}px ${layout.fontFamily}, sans-serif`;
      const metrics = ctx.measureText(text);
      const ascent = metrics.actualBoundingBoxAscent;
      const descent = metrics.actualBoundingBoxDescent;
      return { width: metrics.width, height: ascent + descent, ascent };
    };
    const renderFrame = () => {
      ctx.clearRect(0, 0, W, H);
      const video = videoRef.current;
      const t = sourceUrl && video ? video.currentTime : (performance.now() - start) / 1000;
      if (!sourceUrl) {
        const gradient = ctx.createLinearGradient(0, 0, W, H);
        gradient.addColorStop(0, '#6c777a'); gradient.addColorStop(1, '#10171a');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      if (elements.moving) {
        const text = brandKit.text ?? '@SocialCommand';
        const metrics = ink(text, layout.fontSize);
        const position = calculateBrandingPosition({
          t, containerWidth: W, containerHeight: H, textWidth: metrics.width,
          textHeight: metrics.height, preset: brandKit.movementPreset || 'smooth_sine',
          safeArea: layout.movingSafeArea, speedSeconds: brandKit.speedSeconds,
          intervalSeconds: brandKit.intervalSeconds, scale: layout.scale,
        });
        ctx.save();
        ctx.globalAlpha = Number.isFinite(brandKit.opacity) ? Math.max(0, Math.min(1, brandKit.opacity!)) : 0.85;
        ctx.lineJoin = 'round'; ctx.lineWidth = layout.outline * 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowOffsetX = layout.shadow; ctx.shadowOffsetY = layout.shadow;
        ctx.strokeText(text, position.x, position.y + metrics.ascent);
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(brandKit.fontColor || '') ? brandKit.fontColor! : '#FFFFFF';
        ctx.fillText(text, position.x, position.y + metrics.ascent);
        ctx.restore();
      }
      if (elements.caption && brandKit.signatureText) {
        const text = brandKit.signatureText;
        const metrics = ink(text, layout.captionFontSize);
        const x = (W - metrics.width) / 2;
        const y = H - metrics.height - layout.captionBottom;
        // Caption and moving branding are text-only: glyph outline/shadow,
        // never a filled banner. Match FFmpeg's border and shadow at native size.
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineWidth = layout.outline * 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowOffsetX = layout.shadow; ctx.shadowOffsetY = layout.shadow;
        ctx.strokeText(text, x, y + metrics.ascent);
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, x, y + metrics.ascent);
        ctx.restore();
      }
      if (showGuides) {
        const s = layout.safeArea;
        ctx.save(); ctx.strokeStyle = 'rgba(217,93,57,0.8)';
        ctx.lineWidth = Math.max(1, 2 * layout.scale);
        ctx.setLineDash([12 * layout.scale, 12 * layout.scale]);
        ctx.strokeRect(s.left, s.top, W - s.left - s.right, H - s.top - s.bottom);
        ctx.restore();
      }
      animationFrame = requestAnimationFrame(renderFrame);
    };
    renderFrame();
    return () => cancelAnimationFrame(animationFrame);
  }, [brandKit, aspectRatio, frameWidth, frameHeight, sourceUrl, showGuides, active]);

  return (
    <div className="max-w-full space-y-2">
      <div className="relative mx-auto max-w-full overflow-hidden rounded-xl border border-border bg-black"
        style={{ width: Math.min(displayWidth, displayHeight * frameWidth / frameHeight), aspectRatio: `${frameWidth} / ${frameHeight}` }}>
        {sourceUrl && <video key={sourceUrl} ref={videoRef} src={sourceUrl} controls loop muted playsInline autoPlay
          aria-label="Master Video Live Preview" className="absolute inset-0 w-full h-full object-contain" />}
        <canvas ref={canvasRef} width={frameWidth} height={frameHeight}
          aria-label="Live Branding Overlay" data-branding-mode={elements.mode}
          data-caption-text={brandKit.signatureText ?? ''}
          data-moving-enabled={elements.moving} data-caption-enabled={elements.caption}
          className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>
      <label className="flex items-center justify-center gap-2 text-[11px] text-slate-400 cursor-pointer">
        <input type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)} className="accent-terracotta-600" />
        Show Safe-Area Guides
      </label>
    </div>
  );
};
