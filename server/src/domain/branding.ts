/**
 * Domain Logic: Watermark Positioning, Movement Formulas, and Safe-Area Boundaries
 * Pure functions free of I/O, database, or external library dependencies.
 */

import { BrandKitConfig, SafeAreaConfig, WatermarkMovementPreset } from './types.js';

export interface Resolution {
  width: number;
  height: number;
  aspectRatio: string;
}

export const DEFAULT_SAFE_AREAS: Record<string, SafeAreaConfig> = {
  '9:16': { top: 120, bottom: 280, left: 40, right: 120 },
  '16:9': { top: 60, bottom: 80, left: 40, right: 80 },
  default: { top: 60, bottom: 80, left: 40, right: 80 },
};

export function resolveSafeArea(aspectRatio: string, customSafeArea?: Partial<SafeAreaConfig>): SafeAreaConfig {
  const defaults = DEFAULT_SAFE_AREAS[aspectRatio] || DEFAULT_SAFE_AREAS.default;
  return {
    top: customSafeArea?.top ?? defaults.top,
    bottom: customSafeArea?.bottom ?? defaults.bottom,
    left: customSafeArea?.left ?? defaults.left,
    right: customSafeArea?.right ?? defaults.right,
  };
}

/**
 * Calculates (x, y) coordinates for a watermark at timestamp `t` in seconds.
 * Units: pixels relative to the top-left of the canvas/video frame.
 * Both the HTML5 Canvas preview and FFmpeg filter use equivalent mathematical representations.
 */
export function calculateWatermarkPosition(params: {
  t: number;
  containerWidth: number;
  containerHeight: number;
  textWidth: number;
  textHeight: number;
  preset: WatermarkMovementPreset;
  safeArea: SafeAreaConfig;
  speedSeconds?: number;
  intervalSeconds?: number;
}): { x: number; y: number } {
  const {
    t,
    containerWidth,
    containerHeight,
    textWidth,
    textHeight,
    preset,
    safeArea,
    speedSeconds = 14,
    intervalSeconds = 6,
  } = params;

  const minX = safeArea.left;
  const maxX = Math.max(minX, containerWidth - textWidth - safeArea.right);
  const minY = safeArea.top;
  const maxY = Math.max(minY, containerHeight - textHeight - safeArea.bottom);

  const spanX = maxX - minX;
  const spanY = maxY - minY;

  switch (preset) {
    case 'smooth_sine': {
      const period = Math.max(1, speedSeconds);
      const x = minX + spanX * (1 + Math.sin((2 * Math.PI * t) / period)) / 2;
      const y = minY + spanY * (1 + Math.cos((2 * Math.PI * t) / period)) / 2;
      return { x, y };
    }

    case 'corner_jump': {
      const interval = Math.max(1, intervalSeconds);
      const cycle = interval * 4;
      const step = Math.floor((t % cycle) / interval);
      switch (step) {
        case 0: return { x: minX, y: minY };
        case 1: return { x: maxX, y: minY };
        case 2: return { x: maxX, y: maxY };
        case 3: default: return { x: minX, y: maxY };
      }
    }

    case 'diagonal_bounce': {
      const period = Math.max(1, speedSeconds);
      const normTx = (t * 100) % (spanX * 2 || 1);
      const normTy = (t * 60) % (spanY * 2 || 1);
      const x = minX + Math.abs(normTx - spanX);
      const y = minY + Math.abs(normTy - spanY);
      return { x, y };
    }

    case 'static_corner':
    default:
      return { x: maxX, y: minY };
  }
}
