import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadsDir } from '../db/database.js';
import { ffmpegService } from '../services/ffmpeg.service.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { publishingService } from '../services/publishing.service.js';

export const publishingRouter = Router();

// Multer storage for manual MP4 uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = `upload-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.originalname.endsWith('.mp4')) {
      cb(null, true);
    } else {
      cb(new Error('Only MP4 and video files are supported'));
    }
  },
});

// Upload video manually
publishingRouter.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const file = req.file;
  const videoId = `vid-${Date.now().toString(36)}`;
  const title = req.body.title || file.originalname.replace(/\.[^/.]+$/, '');
  const categoryId = req.body.categoryId || null;

  try {
    const meta = await ffmpegService.probeVideo(file.path);
    const thumbPath = path.resolve(uploadsDir, `${videoId}_thumb.jpg`);
    await ffmpegService.generateThumbnail(file.path, thumbPath);

    publishingRepo.insertVideo({
      id: videoId,
      title,
      sourceType: 'manual_upload',
      originalFilename: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      aspectRatio: meta.aspectRatio,
      thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
      categoryId,
    });

    res.json({
      success: true,
      videoId,
      title,
      duration: meta.duration,
      aspectRatio: meta.aspectRatio,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Video processing failed: ${err.message}` });
  }
});

// GET video library
publishingRouter.get('/videos', (req, res) => {
  const categoryId = req.query.categoryId as string | undefined;
  const rawVideos = publishingRepo.getAllVideos(categoryId);
  const videos = rawVideos.map(v => {
    const filename = path.basename(v.file_path);
    const thumbFilename = v.thumbnail_path ? path.basename(v.thumbnail_path) : null;
    let meta: any = {};
    try { meta = JSON.parse(v.metadata_json || '{}'); } catch {}
    return {
      ...v,
      streamUrl: `/uploads/${filename}`,
      thumbnailUrl: thumbFilename ? `/uploads/${thumbFilename}` : null,
      metadata: meta,
      branded_variants: (v.branded_variants || []).map(b => ({
        ...b,
        previewUrl: `/uploads/renders/${path.basename(b.file_path)}`,
        downloadUrl: `/uploads/renders/${path.basename(b.file_path)}`,
      })),
    };
  });
  res.json({ videos });
});

// GET single video
publishingRouter.get('/videos/:id', (req, res) => {
  const video = publishingRepo.getVideoById(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  const filename = path.basename(video.file_path);
  const thumbFilename = video.thumbnail_path ? path.basename(video.thumbnail_path) : null;
  res.json({
    video: {
      ...video,
      streamUrl: `/uploads/${filename}`,
      thumbnailUrl: thumbFilename ? `/uploads/${thumbFilename}` : null,
      branded_variants: (video.branded_variants || []).map(b => ({
        ...b,
        previewUrl: `/uploads/renders/${path.basename(b.file_path)}`,
        downloadUrl: `/uploads/renders/${path.basename(b.file_path)}`,
      })),
    }
  });
});

// STREAM video with explicit HTTP Range support (206 Partial Content)
publishingRouter.get('/videos/:id/stream', (req, res) => {
  const video = publishingRepo.getVideoById(req.params.id);
  if (!video || !fs.existsSync(video.file_path)) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const stat = fs.statSync(video.file_path);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(video.file_path, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(video.file_path).pipe(res);
  }
});

// CREATE Post with Multi-Destination Targets
publishingRouter.post('/posts', (req, res) => {
  try {
    const result = publishingService.createPost({
      videoId: req.body.videoId,
      title: req.body.title,
      scheduledAt: req.body.scheduledAt,
      selectedVariantId: req.body.selectedVariantId,
      destinations: req.body.destinations,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    const statusCode = err.message === 'Video not found' ? 404 : 400;
    res.status(statusCode).json({ error: err.message });
  }
});

// GET all posts and their destinations
publishingRouter.get('/posts', (_req, res) => {
  const posts = publishingRepo.getAllPosts();
  res.json({ posts });
});

// GET live publishing queue
publishingRouter.get('/queue', (_req, res) => {
  const queue = publishingRepo.getLiveQueue();
  res.json({ queue });
});

// RETRY a single failed destination (Preserves successful destinations!)
publishingRouter.post('/destinations/:id/retry', (req, res) => {
  try {
    publishingService.retryDestination(req.params.id);
    res.json({ success: true, message: 'Destination queued for retry.' });
  } catch (err: any) {
    const statusCode = err.message === 'Destination not found' ? 404 : 400;
    res.status(statusCode).json({ error: err.message });
  }
});

// CANCEL a destination
publishingRouter.post('/destinations/:id/cancel', (req, res) => {
  const cancelled = publishingService.cancelDestination(req.params.id);
  res.json({ success: cancelled });
});

// CONFIRM ASSISTED PUBLISHING (for Browser Bridge)
publishingRouter.post('/destinations/:id/confirm-assisted', (req, res) => {
  const { remotePostUrl, remotePostId } = req.body;
  try {
    publishingService.confirmAssistedPublish(req.params.id, remotePostUrl, remotePostId, req.body.confirmAccount === true ? req.body.accountId : undefined);
    res.json({ success: true, message: 'Assisted publishing marked as confirmed.' });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});
