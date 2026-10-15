import React, { useEffect, useRef } from 'react';
import { BrandKit } from '../../types';

export interface WatermarkCanvasProps {
  brandKit: BrandKit;
  width?: number;
  height?: number;
  aspectRatio?: '9:16' | '16:9';
}

export const WatermarkCanvas: React.FC<WatermarkCanvasProps> = ({
  brandKit,
  width,
  height,
  aspectRatio = '9:16',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const is169 = aspectRatio === '16:9';
  const canvasW = width || (is169 ? 480 : 320);
  const canvasH = height || (is169 ? 270 : 568);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const startTime = Date.now();

    const renderFrame = () => {
      const now = Date.now();
      const t = (now - startTime) / 1000;

      const W = canvas.width;
      const H = canvas.height;

      // Draw background gradient (representing cozy cinematic video viewport)
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#1E1B18');
      grad.addColorStop(1, '#0C0A09');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Safe area visual outline
      const refH = is169 ? 1080 : 1920;
      const refW = is169 ? 1920 : 1080;
      const safeTop = (brandKit.safeArea?.top || (is169 ? 60 : 120)) * (H / refH);
      const safeBottom = (brandKit.safeArea?.bottom || (is169 ? 60 : 280)) * (H / refH);
      const safeLeft = (brandKit.safeArea?.left || (is169 ? 60 : 40)) * (W / refW);
      const safeRight = (brandKit.safeArea?.right || (is169 ? 60 : 120)) * (W / refW);

      ctx.strokeStyle = 'rgba(217, 93, 57, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(safeLeft, safeTop, W - safeLeft - safeRight, H - safeTop - safeBottom);
      ctx.setLineDash([]);

      // Safe area label
      ctx.fillStyle = 'rgba(217, 93, 57, 0.6)';
      ctx.font = '10px sans-serif';
      ctx.fillText(is169 ? 'Facebook / Landscape Safe Area' : 'TikTok / Mobile Safe Area', safeLeft + 8, safeTop + 14);

      // Calculate watermark text width & height
      const text = brandKit.text || '@Handle';
      const fontSize = (brandKit.fontSize || 24) * (W / refW) * 1.5;
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
  }, [brandKit, is169]);

  return (
    <div className="relative mx-auto w-fit rounded-2xl overflow-hidden border-2 border-border shadow-2xl bg-black">
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        className="block"
      />
      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-mono text-terracotta-300 border border-terracotta-500/30">
        {is169 ? '16:9 Landscape' : '9:16 Vertical'}
      </div>
    </div>
  );
};
