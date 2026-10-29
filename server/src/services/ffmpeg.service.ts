import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { rendersDir } from '../db/database.js';
import { brandingElements, getBrandingLayout } from '../domain/branding-layout.js';
import type { BrandingMode } from '../domain/branding-layout.js';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
  sizeBytes: number;
  hasAudio?: boolean;
  videoCodec?: string;
  audioCodec?: string;
}

export interface BrandKitOptions {
  mode?: BrandingMode;
  watermarkType: 'moving_text' | 'static_text' | 'logo_overlay';
  text?: string;
  logoPath?: string;
  movementPreset: 'smooth_sine' | 'corner_jump' | 'diagonal_bounce' | 'static_corner';
  speedSeconds?: number;
  intervalSeconds?: number;
  fontSize?: number;
  opacity?: number;
  fontColor?: string;
  boxBgColor?: string;
  boxBgOpacity?: number;
  safeArea?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  enableSignature?: boolean;
  signatureText?: string;
}

export class FFmpegService {
  private fontPath: string;
  private activeRenders = new Map<string, Promise<string>>();
  isRendering(filePath: string) { return this.activeRenders.has(path.resolve(filePath)); }

  constructor() {
    // One Unicode face for Thai and English keeps glyph metrics consistent with
    // the Tahoma Canvas preview. No font substitution for Thai combining marks.
    const candidates = ['C:/Windows/Fonts/tahoma.ttf', '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'];
    this.fontPath = candidates.find(file => fs.existsSync(file)) || 'Tahoma';
  }

  async computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`File not found for hash calculation: ${filePath}`));
      }
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  probeVideo(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'stream=index,codec_type,codec_name,width,height,duration',
        '-of', 'json',
        filePath
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          return resolve(this.fallbackProbe(filePath));
        }
        try {
          const json = JSON.parse(stdout);
          const vStream = json.streams?.find((s: any) => s.codec_type === 'video') || json.streams?.[0] || {};
          const aStream = json.streams?.find((s: any) => s.codec_type === 'audio');

          const width = Number(vStream.width) || 1080;
          const height = Number(vStream.height) || 1920;
          const duration = Number(vStream.duration) || 10;
          const ratio = width > height ? '16:9' : '9:16';
          const stats = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
          resolve({
            duration,
            width,
            height,
            aspectRatio: ratio,
            sizeBytes: stats,
            hasAudio: !!aStream,
            videoCodec: vStream.codec_name,
            audioCodec: aStream?.codec_name,
          });
        } catch {
          resolve(this.fallbackProbe(filePath));
        }
      });

      proc.on('error', () => {
        resolve(this.fallbackProbe(filePath));
      });
    });
  }

  private fallbackProbe(filePath: string): VideoMetadata {
    const stats = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    return {
      duration: 15,
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      sizeBytes: stats,
      hasAudio: true,
      videoCodec: 'h264',
      audioCodec: 'aac',
    };
  }

  generateThumbnail(videoPath: string, thumbnailPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('ffmpeg', [
        '-ss', '00:00:01.000',
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        thumbnailPath,
        '-y'
      ]);

      proc.on('close', (code) => {
        resolve(code === 0 && fs.existsSync(thumbnailPath));
      });
      proc.on('error', () => resolve(false));
    });
  }

  buildWatermarkFilter(brandKit: BrandKitOptions, metadata: VideoMetadata): string {
    const elements = brandingElements(brandKit);
    if (elements.mode === 'none') return '';
    const layout = getBrandingLayout(brandKit, metadata);
    if ((elements.moving && (brandKit.text ?? '@SocialCommand') &&
      (layout.movingSafeArea.top + layout.movingSafeArea.bottom + layout.fontSize * 1.6 > metadata.height ||
       layout.movingSafeArea.left + layout.movingSafeArea.right + layout.fontSize > metadata.width)) ||
      (elements.caption && brandKit.signatureText &&
       layout.safeArea.top + layout.captionBottom + layout.captionFontSize * 1.6 + layout.captionPadding > metadata.height)) {
      throw new Error('Safe-area margins leave no room for this branding. Reduce the margins or font size.');
    }
    // Escape AVOption values, then filtergraph syntax. spawn() bypasses shells.
    // expansion=none makes percent signs and %{...} literal owner text.
    const option = (value: string) => value
      .replace(/[\\':]/g, '\\$&')
      .replace(/[\\'\[\],;]/g, '\\$&');
    const num = (value: number) => Number(value.toFixed(4));
    const font = `fontfile=${option(this.fontPath)}:text_shaping=1:expansion=none:ft_load_flags=default`;
    const color = /^#[0-9a-f]{6}$/i.test(brandKit.fontColor || '') ? brandKit.fontColor! : 'white';
    const opacity = Number.isFinite(brandKit.opacity) ? Math.max(0, Math.min(1, brandKit.opacity!)) : 0.85;
    const s = layout.movingSafeArea;
    const minX = num(s.left), minY = num(s.top);
    const dx = `max(0,w-tw-${num(s.left + s.right)})`;
    const dy = `max(0,h-th-${num(s.top + s.bottom)})`;
    const period = Number.isFinite(brandKit.speedSeconds) ? Math.max(1, brandKit.speedSeconds!) : 14;
    const interval = Number.isFinite(brandKit.intervalSeconds) ? Math.max(1, brandKit.intervalSeconds!) : 6;
    let x = `${minX}+${dx}`, y = `${minY}`;
    if (brandKit.movementPreset === 'smooth_sine' || !brandKit.movementPreset) {
      x = `${minX}+${dx}*(1+sin(2*PI*t/${period}))/2`;
      y = `${minY}+${dy}*(1+cos(2*PI*t/${period}))/2`;
    } else if (brandKit.movementPreset === 'corner_jump') {
      x = `${minX}+if(lt(mod(t,${interval * 4}),${interval}),0,if(lt(mod(t,${interval * 4}),${interval * 3}),${dx},0))`;
      y = `${minY}+if(gte(mod(t,${interval * 4}),${interval * 2}),${dy},0)`;
    } else if (brandKit.movementPreset === 'diagonal_bounce') {
      x = `${minX}+abs(mod(t*${num(100 * layout.scale)},max(1,${dx}*2))-${dx})`;
      y = `${minY}+abs(mod(t*${num(60 * layout.scale)},max(1,${dy}*2))-${dy})`;
    }
    const filters: string[] = [];
    if (elements.moving && (brandKit.text ?? '@SocialCommand')) {
      filters.push(`drawtext=${font}:text=${option(brandKit.text ?? '@SocialCommand')}:fontsize=${num(layout.fontSize)}:fontcolor=${color}@${opacity}:box=0:borderw=${layout.outline}:bordercolor=black@${num(0.7 * opacity)}:shadowcolor=black@${num(0.4 * opacity)}:shadowx=${layout.shadow}:shadowy=${layout.shadow}:x='${x}':y='${y}'`);
    }
    // The existing fixed, centered signature is the bottom brand label. Its
    // text remains signatureText for saved-kit compatibility; no CTA fallback.
    if (elements.caption && brandKit.signatureText) {
      filters.push(`drawtext=${font}:text=${option(brandKit.signatureText)}:fontsize=${num(layout.captionFontSize)}:fontcolor=white:box=0:borderw=${layout.outline}:bordercolor=black@0.7:shadowcolor=black@0.4:shadowx=${layout.shadow}:shadowy=${layout.shadow}:x=(w-tw)/2:y=h-th-${num(layout.captionBottom)}`);
    }
    return filters.join(',');
  }

  async renderBrandedVideo(
    sourceVideoPath: string,
    brandKit: BrandKitOptions,
    onProgress?: (progressPct: number) => void
  ): Promise<string> {
    if (!fs.existsSync(sourceVideoPath)) {
      throw new Error(`Master video file not found at: ${sourceVideoPath}`);
    }

    const metadata = await this.probeVideo(sourceVideoPath);
    const filterStr = this.buildWatermarkFilter(brandKit, metadata);

    // Include immutable content and renderer version: old variants stay usable,
    // changed masters at the same path cannot reuse stale branding.
    const hashBefore = await this.computeFileSha256(sourceVideoPath);
    const hash = crypto
      .createHash('sha256')
      .update('branding-quality-v3-text-only\0' + hashBefore + JSON.stringify(brandKit) + filterStr)
      .digest('hex')
      .substring(0, 16);

    const outPath = path.resolve(rendersDir, `branded_${hash}.mp4`);

    // Guard: Output path MUST be strictly distinct from source path
    if (path.resolve(sourceVideoPath) === path.resolve(outPath)) {
      throw new Error(`IMMUTABILITY VIOLATION: Output path matches source path! ${outPath}`);
    }

    const active = this.activeRenders.get(outPath);
    if (active) {
      const completed = await active;
      onProgress?.(100);
      return completed;
    }
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
      onProgress?.(100);
      return outPath;
    }
    const render = this.writeBrandedVariant(sourceVideoPath, outPath, metadata, filterStr, hashBefore, onProgress);
    this.activeRenders.set(outPath, render);
    try {
      return await render;
    } finally {
      if (this.activeRenders.get(outPath) === render) this.activeRenders.delete(outPath);
    }
  }

  private async writeBrandedVariant(
    sourceVideoPath: string, outPath: string, metadata: VideoMetadata,
    filterStr: string, hashBefore: string, onProgress?: (progressPct: number) => void
  ): Promise<string> {
    // Never expose partial bytes under a cache key or overwrite a completed
    // variant while FFmpeg is still working. Concurrent callers join one job.
    const stagingPath = path.resolve(rendersDir, `.${path.basename(outPath, '.mp4')}.${crypto.randomUUID()}.staging.mp4`);
    try {
      if (!filterStr) {
        // No overlay means byte-for-byte passthrough, not an empty -vf/encode.
        await fs.promises.copyFile(sourceVideoPath, stagingPath);
        if (await this.computeFileSha256(stagingPath) !== hashBefore) throw new Error('CRITICAL INTEGRITY FAILURE: No-watermark copy does not match master');
      } else {
        await new Promise<void>((resolve, reject) => {
          const audioArgs = metadata.hasAudio ? ['-c:a', 'copy'] : ['-an'];
          const proc = spawn('ffmpeg', [
            '-i', sourceVideoPath, '-vf', filterStr, '-c:v', 'libx264',
            '-preset', 'fast', '-crf', '18', '-movflags', '+faststart',
            ...audioArgs, stagingPath, '-y'
          ]);
          const totalSeconds = metadata.duration || 10;
          let stderr = '';
          proc.stderr.on('data', data => {
            stderr = (stderr + data.toString()).slice(-6000);
            const timeMatch = data.toString().match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (timeMatch && onProgress) {
              const currentSecs = Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
              onProgress(Math.min(99, Math.round(currentSecs / totalSeconds * 100)));
            }
          });
          proc.on('close', code => {
            if (code === 0 && fs.existsSync(stagingPath) && fs.statSync(stagingPath).size > 0) resolve();
            else reject(new Error(`FFmpeg rendering failed with exit code ${code}: ${stderr.slice(-2000)}`));
          });
          proc.on('error', reject);
        });
      }
      if (await this.computeFileSha256(sourceVideoPath) !== hashBefore) throw new Error('CRITICAL INTEGRITY FAILURE: Master video was altered during rendering!');
      // A different process may have completed the same content key meanwhile.
      // Preserve its artifact; otherwise publish the complete file atomically.
      if (!fs.existsSync(outPath) || fs.statSync(outPath).size <= 1000) await fs.promises.rename(stagingPath, outPath);
      onProgress?.(100);
      return outPath;
    } finally {
      await fs.promises.rm(stagingPath, { force: true });
    }
  }
}

export const ffmpegService = new FFmpegService();
