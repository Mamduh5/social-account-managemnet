import fs from 'fs';
import path from 'path';
import { db, uploadsDir } from '../db/database.js';
import { ffmpegService } from './ffmpeg.service.js';

export interface DiscoveredPipelineVideo {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  modifiedAt: string;
  isImported: boolean;
  importedVideoId?: string;
}

export class PipelineService {
  getWatchDirectory(): string {
    const setting = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('pipeline_watch_dir') as { value: string } | undefined;
    return setting?.value || 'D:\\Mamduh\\Personal\\ai-video-pipeline\\.tmp-live-validation';
  }

  setWatchDirectory(newPath: string) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('pipeline_watch_dir', newPath);
  }

  scanWatchDirectory(): DiscoveredPipelineVideo[] {
    const dir = this.getWatchDirectory();
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files: DiscoveredPipelineVideo[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
          const fullPath = path.resolve(dir, entry.name);
          const stats = fs.statSync(fullPath);
          const existing = db.prepare('SELECT id FROM videos WHERE file_path = ? OR original_filename = ?').get(fullPath, entry.name) as { id: string } | undefined;

          files.push({
            filename: entry.name,
            fullPath,
            sizeBytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            isImported: !!existing,
            importedVideoId: existing?.id,
          });
        }
      }
    } catch (err: any) {
      console.error('[PipelineService] Error scanning watch directory:', err.message);
    }

    return files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  }

  async importVideoFile(params: {
    filePath: string;
    title?: string;
    categoryId?: string;
    pipelineJobId?: string;
  }): Promise<string> {
    const { filePath, title, categoryId, pipelineJobId } = params;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Video file does not exist: ${filePath}`);
    }

    const filename = path.basename(filePath);
    const videoTitle = title || filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const videoId = `vid-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    // Copy to persistent uploads store
    const destPath = path.resolve(uploadsDir, `${videoId}_${filename}`);
    fs.copyFileSync(filePath, destPath);

    // Extract metadata & thumbnail
    const meta = await ffmpegService.probeVideo(destPath);
    const thumbName = `${videoId}_thumb.jpg`;
    const thumbPath = path.resolve(uploadsDir, thumbName);
    await ffmpegService.generateThumbnail(destPath, thumbPath);

    db.prepare(`
      INSERT INTO videos (
        id, title, source_type, original_filename, file_path,
        file_size, duration, width, height, aspect_ratio,
        thumbnail_path, pipeline_job_id, category_id
      ) VALUES (?, ?, 'pipeline_import', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      videoId,
      videoTitle,
      filename,
      destPath,
      meta.sizeBytes,
      meta.duration,
      meta.width,
      meta.height,
      meta.aspectRatio,
      fs.existsSync(thumbPath) ? thumbPath : null,
      pipelineJobId || null,
      categoryId || null
    );

    // Add activity log
    db.prepare(`
      INSERT INTO activity_events (id, type, category_id, title, message, severity)
      VALUES (?, 'system', ?, ?, ?, 'info')
    `).run(
      `act-${Date.now()}`,
      categoryId || null,
      'AI Video Pipeline Import',
      `Imported "${videoTitle}" (${meta.aspectRatio}, ${meta.duration.toFixed(1)}s) from AI Video Pipeline.`
    );

    return videoId;
  }
}

export const pipelineService = new PipelineService();
