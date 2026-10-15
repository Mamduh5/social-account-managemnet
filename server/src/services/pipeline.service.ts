import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { db, uploadsDir } from '../db/database.js';
import { ffmpegService } from './ffmpeg.service.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';

export interface DiscoveredPipelineVideo {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  modifiedAt: string;
  isImported: boolean;
  importedVideoId?: string;
}

export interface DiscoveredPipelineJob {
  jobId: string;
  title: string;
  aspectRatio: string;
  durationSeconds: number;
  displayStatus: string;
  videoUrl: string;
  videoObjectKey?: string;
  isImported: boolean;
  importedVideoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineHealthStatus {
  reachable: boolean;
  status: 'connected' | 'offline';
  apiUrl: string;
  totalProjects: number;
  completedJobsCount: number;
  lastChecked: string;
  error?: string;
}

export class PipelineService {
  getPipelineApiUrl(): string {
    const setting = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('pipeline_api_url') as { value: string } | undefined;
    return setting?.value || process.env.PIPELINE_API_URL || 'http://localhost:8080';
  }

  setPipelineApiUrl(newUrl: string): void {
    const cleanUrl = newUrl.replace(/\/+$/, '');
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('pipeline_api_url', cleanUrl);
  }

  getWatchDirectory(): string {
    const setting = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('pipeline_watch_dir') as { value: string } | undefined;
    return setting?.value || 'D:\\Mamduh\\Personal\\ai-video-pipeline\\.tmp-live-validation';
  }

  setWatchDirectory(newPath: string): void {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run('pipeline_watch_dir', newPath);
  }

  async checkPipelineHealth(): Promise<PipelineHealthStatus> {
    const apiUrl = this.getPipelineApiUrl();
    const now = new Date().toISOString();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${apiUrl}/scene-video-jobs`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          reachable: false,
          status: 'offline',
          apiUrl,
          totalProjects: 0,
          completedJobsCount: 0,
          lastChecked: now,
          error: `HTTP error ${res.status}: ${res.statusText}`,
        };
      }

      const data = await res.json() as any;
      const projects = data.projects || [];
      const completed = projects.filter((p: any) => 
        p.video_url && (p.status === 'completed' || (p.display_status && p.display_status.toLowerCase().includes('completed')))
      );

      return {
        reachable: true,
        status: 'connected',
        apiUrl,
        totalProjects: projects.length,
        completedJobsCount: completed.length,
        lastChecked: now,
      };
    } catch (err: any) {
      return {
        reachable: false,
        status: 'offline',
        apiUrl,
        totalProjects: 0,
        completedJobsCount: 0,
        lastChecked: now,
        error: err.name === 'AbortError' ? 'Connection timed out' : err.message,
      };
    }
  }

  async getPipelineStatusSummary(): Promise<{ health: PipelineHealthStatus; jobs: DiscoveredPipelineJob[] }> {
    const apiUrl = this.getPipelineApiUrl();
    const now = new Date().toISOString();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${apiUrl}/scene-video-jobs`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          health: {
            reachable: false,
            status: 'offline',
            apiUrl,
            totalProjects: 0,
            completedJobsCount: 0,
            lastChecked: now,
            error: `HTTP error ${res.status}: ${res.statusText}`,
          },
          jobs: [],
        };
      }

      const data = await res.json() as any;
      const projects = data.projects || [];
      const completedProjects = projects.filter((p: any) => 
        p.video_url && (p.status === 'completed' || (p.display_status && p.display_status.toLowerCase().includes('completed')))
      );

      const jobs: DiscoveredPipelineJob[] = [];
      for (const p of completedProjects) {
        const existing = publishingRepo.getVideoByPipelineJobId(p.id);
        const fullVideoUrl = p.video_url.startsWith('http') ? p.video_url : `${apiUrl}${p.video_url}`;

        jobs.push({
          jobId: p.id,
          title: p.title || `AI Video ${p.id.slice(0, 8)}`,
          aspectRatio: p.aspect_ratio || '9:16',
          durationSeconds: p.duration_seconds || 0,
          displayStatus: p.display_status || 'Completed',
          videoUrl: fullVideoUrl,
          videoObjectKey: p.video_object_key,
          isImported: !!existing,
          importedVideoId: existing?.id,
          createdAt: p.created_at || now,
          updatedAt: p.updated_at || now,
        });
      }

      jobs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return {
        health: {
          reachable: true,
          status: 'connected',
          apiUrl,
          totalProjects: projects.length,
          completedJobsCount: completedProjects.length,
          lastChecked: now,
        },
        jobs,
      };
    } catch (err: any) {
      return {
        health: {
          reachable: false,
          status: 'offline',
          apiUrl,
          totalProjects: 0,
          completedJobsCount: 0,
          lastChecked: now,
          error: err.name === 'AbortError' ? 'Connection timed out' : err.message,
        },
        jobs: [],
      };
    }
  }

  async discoverPipelineJobs(): Promise<DiscoveredPipelineJob[]> {
    const apiUrl = this.getPipelineApiUrl();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${apiUrl}/scene-video-jobs`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`[PipelineService] Upstream returned HTTP ${res.status}`);
        return [];
      }

      const data = await res.json() as any;
      const projects = data.projects || [];

      // Filter for valid completed projects that have final videos
      const completedProjects = projects.filter((p: any) => 
        p.video_url && (p.status === 'completed' || (p.display_status && p.display_status.toLowerCase().includes('completed')))
      );

      const jobs: DiscoveredPipelineJob[] = [];
      for (const p of completedProjects) {
        const existing = publishingRepo.getVideoByPipelineJobId(p.id);
        const fullVideoUrl = p.video_url.startsWith('http') ? p.video_url : `${apiUrl}${p.video_url}`;

        jobs.push({
          jobId: p.id,
          title: p.title || `AI Video ${p.id.slice(0, 8)}`,
          aspectRatio: p.aspect_ratio || '9:16',
          durationSeconds: p.duration_seconds || 0,
          displayStatus: p.display_status || 'Completed',
          videoUrl: fullVideoUrl,
          videoObjectKey: p.video_object_key,
          isImported: !!existing,
          importedVideoId: existing?.id,
          createdAt: p.created_at || new Date().toISOString(),
          updatedAt: p.updated_at || new Date().toISOString(),
        });
      }

      return jobs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (err: any) {
      console.error('[PipelineService] Error discovering upstream pipeline jobs:', err.message);
      return [];
    }
  }

  async importPipelineJob(params: {
    jobId: string;
    categoryId?: string;
    customTitle?: string;
  }): Promise<{ videoId: string; alreadyExisted: boolean }> {
    const { jobId, categoryId, customTitle } = params;
    const apiUrl = this.getPipelineApiUrl();

    // 1. Check if already imported to prevent duplicates
    const existing = publishingRepo.getVideoByPipelineJobId(jobId);
    if (existing) {
      return { videoId: existing.id, alreadyExisted: true };
    }

    // 2. Fetch specific job metadata from pipeline API
    const metaRes = await fetch(`${apiUrl}/scene-video-jobs/${jobId}`);
    if (!metaRes.ok) {
      throw new Error(`Failed to fetch metadata for job ${jobId}: ${metaRes.statusText}`);
    }
    const jobData = await metaRes.json() as any;
    const videoTitle = customTitle || jobData.title || `Pipeline Job ${jobId.slice(0, 8)}`;

    const videoId = `vid-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const filename = `${videoId}_master.mp4`;
    const destPath = path.resolve(uploadsDir, filename);

    // 3. Download the actual video stream from the pipeline into uploads
    const videoStreamUrl = `${apiUrl}/scene-video-jobs/${jobId}/artifacts/video`;
    const videoDownloadRes = await fetch(videoStreamUrl);
    if (!videoDownloadRes.ok || !videoDownloadRes.body) {
      throw new Error(`Failed to download video artifact from ${videoStreamUrl}: ${videoDownloadRes.statusText}`);
    }

    const fileStream = fs.createWriteStream(destPath);
    await pipeline(videoDownloadRes.body as any, fileStream);

    // Validate downloaded file
    const fileStats = fs.statSync(destPath);
    if (fileStats.size < 1000) {
      fs.unlinkSync(destPath);
      throw new Error(`Downloaded video file is corrupt or empty (${fileStats.size} bytes)`);
    }

    // 4. Compute original master SHA256 hash to lock in immutability record
    const sha256 = await ffmpegService.computeFileSha256(destPath);

    // 5. Probe video metadata with ffprobe
    const meta = await ffmpegService.probeVideo(destPath);

    // 6. Generate thumbnail
    const thumbName = `${videoId}_thumb.jpg`;
    const thumbPath = path.resolve(uploadsDir, thumbName);
    await ffmpegService.generateThumbnail(destPath, thumbPath);

    // 7. Store in database
    publishingRepo.insertVideo({
      id: videoId,
      title: videoTitle,
      sourceType: 'pipeline_import',
      originalFilename: `${jobId}.mp4`,
      filePath: destPath,
      fileSize: fileStats.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      aspectRatio: meta.aspectRatio,
      thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
      pipelineJobId: jobId,
      categoryId: categoryId || null,
      metadataJson: JSON.stringify({
        sha256,
        source: 'ai_video_pipeline',
        upstreamJobId: jobId,
        hasAudio: meta.hasAudio,
        videoCodec: meta.videoCodec,
        audioCodec: meta.audioCodec,
        upstreamVideoUrl: videoStreamUrl,
      }),
    });

    // 8. Log activity event
    activityRepo.logEvent({
      type: 'system',
      title: 'AI Video Pipeline Ingestion',
      message: `Successfully imported "${videoTitle}" (${meta.aspectRatio}, ${meta.duration.toFixed(1)}s, ${(fileStats.size / 1024 / 1024).toFixed(1)}MB) from AI Video Pipeline.`,
      severity: 'info',
    });

    return { videoId, alreadyExisted: false };
  }

  // Fallback: Scan local watch directory if configured
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

    // Compute original SHA256
    const sha256 = await ffmpegService.computeFileSha256(destPath);

    // Extract metadata & thumbnail
    const meta = await ffmpegService.probeVideo(destPath);
    const thumbName = `${videoId}_thumb.jpg`;
    const thumbPath = path.resolve(uploadsDir, thumbName);
    await ffmpegService.generateThumbnail(destPath, thumbPath);

    publishingRepo.insertVideo({
      id: videoId,
      title: videoTitle,
      sourceType: 'pipeline_import',
      originalFilename: filename,
      filePath: destPath,
      fileSize: meta.sizeBytes,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      aspectRatio: meta.aspectRatio,
      thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
      pipelineJobId: pipelineJobId || null,
      categoryId: categoryId || null,
      metadataJson: JSON.stringify({
        sha256,
        source: 'local_file_import',
        hasAudio: meta.hasAudio,
        videoCodec: meta.videoCodec,
        audioCodec: meta.audioCodec,
      }),
    });

    activityRepo.logEvent({
      type: 'system',
      title: 'Video File Import',
      message: `Imported "${videoTitle}" (${meta.aspectRatio}, ${meta.duration.toFixed(1)}s) into library.`,
      severity: 'info',
    });

    return videoId;
  }
}

export const pipelineService = new PipelineService();
