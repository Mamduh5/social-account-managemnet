/** Shared by the browser preview and FFmpeg; no I/O or runtime dependencies. */
export type BrandingMode = 'none' | 'moving' | 'moving_and_caption' | 'caption';
export interface BrandingOptions {
  mode?: BrandingMode;
  watermarkType?: 'moving_text' | 'static_text' | 'logo_overlay';
  text?: string;
  signatureText?: string;
  enableSignature?: boolean;
  movementPreset?: 'smooth_sine' | 'corner_jump' | 'diagonal_bounce' | 'static_corner';
  speedSeconds?: number;
  intervalSeconds?: number;
  fontSize?: number;
  opacity?: number;
  fontColor?: string;
  safeArea?: { top: number; bottom: number; left: number; right: number };
}
export const BRANDING_MODES: { id: BrandingMode; label: string }[] = [
  { id: 'none', label: 'No Watermark' },
  { id: 'moving', label: 'Moving Watermark Only' },
  { id: 'moving_and_caption', label: 'Moving Watermark + Bottom Caption' },
  { id: 'caption', label: 'Bottom Caption Only' },
];
export function resolveBrandingMode(kit: BrandingOptions): BrandingMode {
  if (kit.mode && BRANDING_MODES.some(item => item.id === kit.mode)) return kit.mode;
  return kit.enableSignature ? 'moving_and_caption' : 'moving';
}
export function brandingElements(kit: BrandingOptions) {
  const mode = resolveBrandingMode(kit);
  return { mode, moving: mode === 'moving' || mode === 'moving_and_caption', caption: mode === 'caption' || mode === 'moving_and_caption' };
}
const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;

// Conservative advance estimate keeps long labels inside the safe area without
// depending on browser-only measurement. Thai combining marks have no advance.
function fitFont(text: string, fontSize: number, available: number) {
  let units = 0;
  for (const char of text) units += /\p{Mark}/u.test(char) ? 0 : /\s/u.test(char) ? 0.5 : 1;
  return Math.max(1, Math.min(fontSize, available / Math.max(1, units)));
}
export function getBrandingLayout(kit: BrandingOptions, frame: { width: number; height: number; aspectRatio: string }) {
  const scale = Math.min(frame.width, frame.height) / 1080;
  const vertical = frame.aspectRatio === '9:16';
  const defaults = vertical ? { top: 120, bottom: 280, left: 40, right: 120 } : { top: 60, bottom: 80, left: 40, right: 80 };
  const safeArea = {
    top: bounded(kit.safeArea?.top, defaults.top, 0, 800) * scale,
    bottom: bounded(kit.safeArea?.bottom, defaults.bottom, 0, 800) * scale,
    left: bounded(kit.safeArea?.left, defaults.left, 0, 400) * scale,
    right: bounded(kit.safeArea?.right, defaults.right, 0, 400) * scale,
  };
  const outline = Math.max(1, Math.round(scale));
  const shadow = Math.max(1, Math.round(scale));
  const padding = outline + shadow + Math.max(1, scale);
  const captionPadding = Math.max(2, Math.round(10 * scale));
  const available = Math.max(1, frame.width - safeArea.left - safeArea.right - 2 * padding);
  const baseFont = bounded(kit.fontSize, 26, 8, 120) * scale;
  const fontSize = fitFont(kit.text ?? '@SocialCommand', baseFont, available);
  const captionFontSize = fitFont(kit.signatureText ?? '', Math.max(24 * scale, baseFont - 2 * scale), Math.max(1, available - 2 * captionPadding));
  // Keep the fixed caption near the bottom; moving-text safe margins stay unchanged.
  const captionBottom = safeArea.bottom * 0.75 + captionPadding;
  const movingSafeArea = {
    top: safeArea.top + padding,
    bottom: safeArea.bottom + padding + (brandingElements(kit).caption && kit.signatureText ? captionFontSize * 1.6 + captionPadding * 2 + 14 * scale : 0),
    left: safeArea.left + padding,
    right: safeArea.right + padding,
  };
  return { scale, fontSize, captionFontSize, safeArea, movingSafeArea, outline, shadow, padding, captionPadding, captionBottom, fontFamily: 'Tahoma' };
}
export function calculateBrandingPosition(params: {
  t: number; containerWidth: number; containerHeight: number; textWidth: number; textHeight: number;
  preset: NonNullable<BrandingOptions['movementPreset']>; safeArea: NonNullable<BrandingOptions['safeArea']>;
  speedSeconds?: number; intervalSeconds?: number; scale?: number;
}) {
  const { t, containerWidth: w, containerHeight: h, textWidth: tw, textHeight: th, safeArea: s } = params;
  const maxX = Math.max(s.left, w - tw - s.right), maxY = Math.max(s.top, h - th - s.bottom);
  const dx = maxX - s.left, dy = maxY - s.top;
  const period = bounded(params.speedSeconds, 14, 1, 3600), interval = bounded(params.intervalSeconds, 6, 1, 3600);
  if (params.preset === 'smooth_sine') return { x: s.left + dx * (1 + Math.sin(2 * Math.PI * t / period)) / 2, y: s.top + dy * (1 + Math.cos(2 * Math.PI * t / period)) / 2 };
  if (params.preset === 'corner_jump') {
    const step = Math.floor(t / interval) % 4;
    return { x: step === 1 || step === 2 ? maxX : s.left, y: step >= 2 ? maxY : s.top };
  }
  if (params.preset === 'diagonal_bounce') return { x: s.left + Math.abs((t * 100 * (params.scale ?? 1)) % (dx * 2 || 1) - dx), y: s.top + Math.abs((t * 60 * (params.scale ?? 1)) % (dy * 2 || 1) - dy) };
  return { x: maxX, y: s.top };
}
