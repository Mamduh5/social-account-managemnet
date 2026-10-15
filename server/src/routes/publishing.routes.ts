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
  const videos = publishingRepo.getAllVideos(categoryId);
  res.json({ videos });
});

// GET single video
publishingRouter.get('/videos/:id', (req, res) => {
  const video = publishingRepo.getVideoById(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.json({ video });
});

// CREATE Post with Multi-Destination Targets
publishingRouter.post('/posts', (req, res) => {
  try {
    const result = publishingService.createPost({
      videoId: req.body.videoId,
      title: req.body.title,
      scheduledAt: req.body.scheduledAt,
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
    publishingService.confirmAssistedPublish(req.params.id, remotePostUrl, remotePostId);
    res.json({ success: true, message: 'Assisted publishing marked as confirmed.' });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});
