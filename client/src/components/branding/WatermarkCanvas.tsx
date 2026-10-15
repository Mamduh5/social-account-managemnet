import React, { useEffect, useRef } from 'react';
import { BrandKit } from '../../types';

export interface WatermarkCanvasProps {
  brandKit: BrandKit;
  width?: number;
  height?: number;
}

export const WatermarkCanvas: React.FC<WatermarkCanvasProps> = ({
  brandKit,
  width = 320,
  height = 568,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

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

  return (
    <div className="relative mx-auto w-fit rounded-xl overflow-hidden border-2 border-slate-700 shadow-2xl bg-black">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
      />
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-[10px] font-mono text-indigo-300 border border-indigo-500/30">
        9:16 Canvas
      </div>
    </div>
  );
};
