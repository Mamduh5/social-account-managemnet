import { Router } from 'express';
import { db } from '../db/database.js';
import { ffmpegService, BrandKitOptions } from '../services/ffmpeg.service.js';

export const brandingRouter = Router();

// GET all account brand kits
brandingRouter.get('/kits', (_req, res) => {
  const accounts = db.prepare(`
    SELECT a.id, a.name, a.handle, a.platform, a.brand_kit_json,
           c.name as category_name, c.color as category_color
    FROM accounts a
    LEFT JOIN categories c ON a.category_id = c.id
    ORDER BY a.name ASC
  `).all() as any[];

  const kits = accounts.map((acc) => ({
    accountId: acc.id,
    accountName: acc.name,
    accountHandle: acc.handle,
    platform: acc.platform,
    categoryName: acc.category_name,
    categoryColor: acc.category_color,
    brandKit: acc.brand_kit_json ? JSON.parse(acc.brand_kit_json) : null,
  }));

  res.json({ kits });
});

// UPDATE brand kit for an account
brandingRouter.put('/kits/:accountId', (req, res) => {
  const { brandKit } = req.body;
  if (!brandKit) return res.status(400).json({ error: 'brandKit payload is required' });

  db.prepare(`
    UPDATE accounts
    SET brand_kit_json = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(brandKit), req.params.accountId);

  res.json({ success: true, message: 'Brand kit updated' });
});

// TEST RENDER a video with brand kit settings
brandingRouter.post('/render-preview', async (req, res) => {
  const { videoId, brandKit } = req.body as { videoId: string; brandKit: BrandKitOptions };

  if (!videoId || !brandKit) {
    return res.status(400).json({ error: 'videoId and brandKit are required' });
  }

  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId) as any;
  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    const renderedPath = await ffmpegService.renderBrandedVideo(video.file_path, brandKit);
    // Relative URL for streaming
    const filename = renderedPath.split(/[/\\]/).pop();
    const previewUrl = `/uploads/renders/${filename}`;

    res.json({
      success: true,
      renderedPath,
      previewUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Rendering failed: ${err.message}` });
  }
});
