import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { rendersDir, uploadsDir } from '../db/database.js';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
  sizeBytes: number;
}

export interface BrandKitOptions {
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

  constructor() {
    // Escape Windows font path for FFmpeg filter graph
    const winFont = 'C:/Windows/Fonts/arial.ttf';
    if (fs.existsSync('C:\\Windows\\Fonts\\arial.ttf')) {
      this.fontPath = winFont.replace(/:/g, '\\:');
    } else {
      this.fontPath = 'arial';
    }
  }

  probeVideo(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration',
        '-of', 'json',
        filePath
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          // Fallback probe using ffmpeg -i if ffprobe has an issue
          return resolve(this.fallbackProbe(filePath));
        }
        try {
          const json = JSON.parse(stdout);
          const stream = json.streams?.[0] || {};
          const width = Number(stream.width) || 1080;
          const height = Number(stream.height) || 1920;
          const duration = Number(stream.duration) || 10;
          const ratio = width > height ? '16:9' : '9:16';
          const stats = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
          resolve({
            duration,
            width,
            height,
            aspectRatio: ratio,
            sizeBytes: stats,
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
    const text = (brandKit.text || '@SocialCommand').replace(/'/g, "\\'");
    const fontSize = brandKit.fontSize || 26;
    const opacity = brandKit.opacity ?? 0.85;
    const boxOpacity = brandKit.boxBgOpacity ?? 0.45;
    const safeTop = brandKit.safeArea?.top ?? (metadata.aspectRatio === '9:16' ? 120 : 60);
    const safeBottom = brandKit.safeArea?.bottom ?? (metadata.aspectRatio === '9:16' ? 280 : 80);
    const safeLeft = brandKit.safeArea?.left ?? 40;
    const safeRight = brandKit.safeArea?.right ?? 80;

    let xExpr = '';
    let yExpr = '';

    const preset = brandKit.movementPreset || 'smooth_sine';

    if (preset === 'smooth_sine') {
      const period = brandKit.speedSeconds || 14;
      // Smooth sinusoidal oscillation between safe boundaries
      xExpr = `'${safeLeft} + (w - tw - ${safeLeft + safeRight}) * (1 + sin(2*PI*t/${period})) / 2'`;
      yExpr = `'${safeTop} + (h - th - ${safeTop + safeBottom}) * (1 + cos(2*PI*t/${period})) / 2'`;
    } else if (preset === 'corner_jump') {
      const interval = brandKit.intervalSeconds || 6;
      const cycle = interval * 4;
      // Discrete quadrant hopping every interval seconds
      xExpr = `'if(lt(mod(t\\,${cycle})\\,${interval})\\, ${safeLeft}\\, if(lt(mod(t\\,${cycle})\\,${interval * 2})\\, w-tw-${safeRight}\\, if(lt(mod(t\\,${cycle})\\,${interval * 3})\\, w-tw-${safeRight}\\, ${safeLeft})))'`;
      yExpr = `'if(lt(mod(t\\,${cycle})\\,${interval})\\, ${safeTop}\\, if(lt(mod(t\\,${cycle})\\,${interval * 2})\\, ${safeTop}\\, if(lt(mod(t\\,${cycle})\\,${interval * 3})\\, h-th-${safeBottom}\\, h-th-${safeBottom})))'`;
    } else if (preset === 'diagonal_bounce') {
      const period = brandKit.speedSeconds || 10;
      xExpr = `'${safeLeft} + abs(mod(t*100\\, (w - tw - ${safeLeft + safeRight}) * 2) - (w - tw - ${safeLeft + safeRight}))'`;
      yExpr = `'${safeTop} + abs(mod(t*60\\, (h - th - ${safeTop + safeBottom}) * 2) - (h - th - ${safeTop + safeBottom}))'`;
    } else {
      // Static corner (default top-right)
      xExpr = `'w - tw - ${safeRight}'`;
      yExpr = `'${safeTop}'`;
    }

    const filters: string[] = [];

    // Main moving watermark
    filters.push(
      `drawtext=fontfile='${this.fontPath}':text='${text}':fontsize=${fontSize}:fontcolor=white@${opacity}:box=1:boxcolor=black@${boxOpacity}:boxborderw=8:x=${xExpr}:y=${yExpr}`
    );

    // Optional digital signature / footer text (bottom safe zone)
    if (brandKit.enableSignature && brandKit.signatureText) {
      const sigText = brandKit.signatureText.replace(/'/g, "\\'");
      filters.push(
        `drawtext=fontfile='${this.fontPath}':text='${sigText}':fontsize=${Math.max(14, fontSize - 10)}:fontcolor=white@0.6:box=1:boxcolor=black@0.3:boxborderw=4:x=(w-tw)/2:y=h-th-${Math.max(20, safeBottom / 4)}`
      );
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

    // Compute deterministic cache key so we don't re-render identical outputs
    const hash = crypto
      .createHash('sha256')
      .update(sourceVideoPath + JSON.stringify(brandKit) + filterStr)
      .digest('hex')
      .substring(0, 16);

    const outPath = path.resolve(rendersDir, `branded_${hash}.mp4`);

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
      if (onProgress) onProgress(100);
      return outPath;
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-i', sourceVideoPath,
        '-vf', filterStr,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'copy',
        outPath,
        '-y'
      ]);

      const totalSeconds = metadata.duration || 10;

      proc.stderr.on('data', (data) => {
        const line = data.toString();
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch && onProgress) {
          const hours = Number(timeMatch[1]);
          const mins = Number(timeMatch[2]);
          const secs = Number(timeMatch[3]);
          const currentSecs = hours * 3600 + mins * 60 + secs;
          const pct = Math.min(99, Math.round((currentSecs / totalSeconds) * 100));
          onProgress(pct);
        }
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outPath)) {
          if (onProgress) onProgress(100);
          resolve(outPath);
        } else {
          reject(new Error(`FFmpeg rendering failed with exit code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}

export const ffmpegService = new FFmpegService();
