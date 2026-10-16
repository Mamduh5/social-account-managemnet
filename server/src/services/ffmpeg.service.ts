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
  hasAudio?: boolean;
  videoCodec?: string;
  audioCodec?: string;
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
    // Helper to safely escape characters that break FFmpeg filter parsing (colons, single quotes, backslashes, percent)
    const escapeText = (str: string) => str
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'")
      .replace(/%/g, '\\%');

    const text = escapeText(brandKit.text || '@SocialCommand');
    const fontSize = brandKit.fontSize || 26;
    const opacity = brandKit.opacity ?? 0.85;
    const boxOpacity = brandKit.boxBgOpacity ?? 0.45;
    const boxBorder = 8;
    const safeTop = brandKit.safeArea?.top ?? (metadata.aspectRatio === '9:16' ? 120 : 60);
    const safeBottom = brandKit.safeArea?.bottom ?? (metadata.aspectRatio === '9:16' ? 280 : 80);
    const safeLeft = brandKit.safeArea?.left ?? 40;
    const safeRight = brandKit.safeArea?.right ?? 80;

    // Compensate for box border padding so the black background never protrudes into safe area margins
    const effSafeTop = safeTop + boxBorder;
    const effSafeBottom = safeBottom + boxBorder;
    const effSafeLeft = safeLeft + boxBorder;
    const effSafeRight = safeRight + boxBorder;

    let xExpr = '';
    let yExpr = '';

    const preset = brandKit.movementPreset || 'smooth_sine';

    if (preset === 'smooth_sine') {
      const period = brandKit.speedSeconds || 14;
      // Smooth sinusoidal oscillation between safe boundaries
      xExpr = `'${effSafeLeft} + (w - tw - ${effSafeLeft + effSafeRight}) * (1 + sin(2*PI*t/${period})) / 2'`;
      yExpr = `'${effSafeTop} + (h - th - ${effSafeTop + effSafeBottom}) * (1 + cos(2*PI*t/${period})) / 2'`;
    } else if (preset === 'corner_jump') {
      const interval = brandKit.intervalSeconds || 6;
      const cycle = interval * 4;
      // Discrete quadrant hopping every interval seconds
      xExpr = `'if(lt(mod(t\\,${cycle})\\,${interval})\\, ${effSafeLeft}\\, if(lt(mod(t\\,${cycle})\\,${interval * 2})\\, w-tw-${effSafeRight}\\, if(lt(mod(t\\,${cycle})\\,${interval * 3})\\, w-tw-${effSafeRight}\\, ${effSafeLeft})))'`;
      yExpr = `'if(lt(mod(t\\,${cycle})\\,${interval})\\, ${effSafeTop}\\, if(lt(mod(t\\,${cycle})\\,${interval * 2})\\, ${effSafeTop}\\, if(lt(mod(t\\,${cycle})\\,${interval * 3})\\, h-th-${effSafeBottom}\\, h-th-${effSafeBottom})))'`;
    } else if (preset === 'diagonal_bounce') {
      const period = brandKit.speedSeconds || 10;
      xExpr = `'${effSafeLeft} + abs(mod(t*100\\, (w - tw - ${effSafeLeft + effSafeRight}) * 2) - (w - tw - ${effSafeLeft + effSafeRight}))'`;
      yExpr = `'${effSafeTop} + abs(mod(t*60\\, (h - th - ${effSafeTop + effSafeBottom}) * 2) - (h - th - ${effSafeTop + effSafeBottom}))'`;
    } else {
      // Static corner (default top-right)
      xExpr = `'w - tw - ${effSafeRight}'`;
      yExpr = `'${effSafeTop}'`;
    }

    let fontFile = this.fontPath;
    if (/[ก-๙]/.test(brandKit.text || '') && fs.existsSync('C:\\Windows\\Fonts\\tahoma.ttf')) {
      fontFile = 'C\\:/Windows/Fonts/tahoma.ttf';
    }

    const filters: string[] = [];
    const fontColor = brandKit.fontColor || 'white';

    // Main moving watermark
    filters.push(
      `drawtext=fontfile='${fontFile}':text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}@${opacity}:box=1:boxcolor=black@${boxOpacity}:boxborderw=${boxBorder}:x=${xExpr}:y=${yExpr}`
    );

    // Optional digital signature / footer text (bottom safe zone)
    if (brandKit.enableSignature && brandKit.signatureText) {
      const sigText = escapeText(brandKit.signatureText);
      let sigFont = fontFile;
      if (/[ก-๙]/.test(brandKit.signatureText) && fs.existsSync('C:\\Windows\\Fonts\\tahoma.ttf')) {
        sigFont = 'C\\:/Windows/Fonts/tahoma.ttf';
      }
      filters.push(
        `drawtext=fontfile='${sigFont}':text='${sigText}':fontsize=${Math.max(14, fontSize - 10)}:fontcolor=white@0.6:box=1:boxcolor=black@0.3:boxborderw=4:x=(w-tw)/2:y=h-th-${Math.max(20, safeBottom / 4)}`
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

    // Guard: Output path MUST be strictly distinct from source path
    if (path.resolve(sourceVideoPath) === path.resolve(outPath)) {
      throw new Error(`IMMUTABILITY VIOLATION: Output path matches source path! ${outPath}`);
    }

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
      if (onProgress) onProgress(100);
      return outPath;
    }

    // Record master video SHA256 before render to ensure immutability
    const hashBefore = await this.computeFileSha256(sourceVideoPath);

    return new Promise((resolve, reject) => {
      const audioArgs = metadata.hasAudio ? ['-c:a', 'copy'] : ['-an'];

      const proc = spawn('ffmpeg', [
        '-i', sourceVideoPath,
        '-vf', filterStr,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        ...audioArgs,
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

      proc.on('close', async (code) => {
        if (code === 0 && fs.existsSync(outPath)) {
          try {
            // Strictly verify that master video was not modified
            const hashAfter = await this.computeFileSha256(sourceVideoPath);
            if (hashBefore !== hashAfter) {
              return reject(new Error('CRITICAL INTEGRITY FAILURE: Master video was altered during rendering!'));
            }
            if (onProgress) onProgress(100);
            resolve(outPath);
          } catch (err) {
            reject(err);
          }
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
