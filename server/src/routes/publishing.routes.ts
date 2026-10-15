import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db, uploadsDir } from '../db/database.js';
import { ffmpegService } from '../services/ffmpeg.service.js';

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

    db.prepare(`
      INSERT INTO videos (
        id, title, source_type, original_filename, file_path,
        file_size, duration, width, height, aspect_ratio,
        thumbnail_path, category_id
      ) VALUES (?, ?, 'manual_upload', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      videoId,
      title,
      file.originalname,
      file.path,
      file.size,
      meta.duration,
      meta.width,
      meta.height,
      meta.aspectRatio,
      fs.existsSync(thumbPath) ? thumbPath : null,
      categoryId
    );

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
  let query = `
    SELECT v.*, c.name as category_name, c.color as category_color
    FROM videos v
    LEFT JOIN categories c ON v.category_id = c.id
  `;
  const params: any[] = [];
  if (categoryId) {
    query += ' WHERE v.category_id = ?';
    params.push(categoryId);
  }
  query += ' ORDER BY v.created_at DESC';

  const videos = db.prepare(query).all(...params);
  res.json({ videos });
});

// GET single video
publishingRouter.get('/videos/:id', (req, res) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.json({ video });
});

// CREATE Post with Multi-Destination Targets
publishingRouter.post('/posts', (req, res) => {
  const { videoId, title, scheduledAt, destinations } = req.body;

  if (!videoId || !title || !destinations || !Array.isArray(destinations) || destinations.length === 0) {
    return res.status(400).json({ error: 'Video, Title, and at least one destination account are required.' });
  }

  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const postId = `post-${Date.now().toString(36)}`;
  const isScheduled = !!scheduledAt;
  const initialPostStatus = isScheduled ? 'scheduled' : 'processing';
  const initialDestStatus = isScheduled ? 'scheduled' : 'preparing';

  const insertPost = db.prepare(`
    INSERT INTO publishing_posts (id, video_id, title, scheduled_at, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertDest = db.prepare(`
    INSERT INTO publishing_destinations (
      id, post_id, account_id, caption, hashtags, apply_branding,
      branding_override_json, status, progress
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const insertTx = db.transaction(() => {
    insertPost.run(postId, videoId, title, scheduledAt || null, initialPostStatus);

    for (const dest of destinations) {
      const destId = `dest-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      insertDest.run(
        destId,
        postId,
        dest.accountId,
        dest.caption || title,
        dest.hashtags || '',
        dest.applyBranding !== undefined ? (dest.applyBranding ? 1 : 0) : 1,
        dest.brandingOverride ? JSON.stringify(dest.brandingOverride) : null,
        initialDestStatus
      );
    }
  });

  insertTx();

  res.json({ success: true, postId, destinationCount: destinations.length });
});

// GET all posts and their destinations
publishingRouter.get('/posts', (_req, res) => {
  const posts = db.prepare(`
    SELECT p.*, v.title as video_title, v.aspect_ratio, v.duration, v.thumbnail_path
    FROM publishing_posts p
    JOIN videos v ON p.video_id = v.id
    ORDER BY p.created_at DESC
  `).all() as any[];

  const getDests = db.prepare(`
    SELECT pd.*, a.name as account_name, a.handle as account_handle, a.platform, a.avatar_url,
           c.name as category_name, c.color as category_color
    FROM publishing_destinations pd
    JOIN accounts a ON pd.account_id = a.id
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE pd.post_id = ?
  `);

  const enriched = posts.map((post) => ({
    ...post,
    destinations: getDests.all(post.id),
  }));

  res.json({ posts: enriched });
});

// GET live publishing queue
publishingRouter.get('/queue', (_req, res) => {
  const queue = db.prepare(`
    SELECT pd.*, p.title as post_title, p.scheduled_at,
           v.thumbnail_path, v.aspect_ratio,
           a.name as account_name, a.handle as account_handle, a.platform, a.avatar_url,
           c.name as category_name, c.color as category_color
    FROM publishing_destinations pd
    JOIN publishing_posts p ON pd.post_id = p.id
    JOIN videos v ON p.video_id = v.id
    JOIN accounts a ON pd.account_id = a.id
    LEFT JOIN categories c ON a.category_id = c.id
    ORDER BY 
      CASE pd.status
        WHEN 'uploading' THEN 1
        WHEN 'branding' THEN 2
        WHEN 'preparing' THEN 3
        WHEN 'awaiting_confirmation' THEN 4
        WHEN 'scheduled' THEN 5
        WHEN 'failed' THEN 6
        ELSE 7
      END ASC,
      pd.updated_at DESC
  `).all();

  res.json({ queue });
});

// RETRY a single failed destination (Preserves successful destinations!)
publishingRouter.post('/destinations/:id/retry', (req, res) => {
  const dest = db.prepare('SELECT * FROM publishing_destinations WHERE id = ?').get(req.params.id) as any;
  if (!dest) return res.status(404).json({ error: 'Destination not found' });

  db.prepare(`
    UPDATE publishing_destinations
    SET status = 'preparing', progress = 0, error_message = NULL, retry_count = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.params.id);

  db.prepare("UPDATE publishing_posts SET status = 'processing', updated_at = datetime('now') WHERE id = ?")
    .run(dest.post_id);

  res.json({ success: true, message: 'Destination queued for retry.' });
});

// CANCEL a destination
publishingRouter.post('/destinations/:id/cancel', (req, res) => {
  db.prepare(`
    UPDATE publishing_destinations
    SET status = 'cancelled', progress = 0, updated_at = datetime('now')
    WHERE id = ? AND status IN ('scheduled', 'preparing', 'branding')
  `).run(req.params.id);
  res.json({ success: true });
});

// CONFIRM ASSISTED PUBLISHING (for Browser Bridge)
publishingRouter.post('/destinations/:id/confirm-assisted', (req, res) => {
  const { remotePostUrl, remotePostId } = req.body;
  db.prepare(`
    UPDATE publishing_destinations
    SET status = 'published', progress = 100, verification_status = 'confirmed',
        remote_post_url = ?, remote_post_id = ?, published_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(remotePostUrl || 'https://facebook.com', remotePostId || `bridge-manual-${Date.now()}`, req.params.id);

  res.json({ success: true, message: 'Assisted publishing marked as confirmed.' });
});
