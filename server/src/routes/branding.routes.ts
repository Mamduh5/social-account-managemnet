import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { BrandKitOptions, ffmpegService } from '../services/ffmpeg.service.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { rendersDir } from '../db/database.js';

export const brandingRouter = Router();

// GET all account brand kits
brandingRouter.get('/kits', (_req, res) => {
  const accounts = accountsRepo.getAllAccounts();

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

  accountsRepo.updateBrandKit(req.params.accountId, JSON.stringify(brandKit));
  res.json({ success: true, message: 'Brand kit updated' });
});

// GET all branded variants for a specific master video
brandingRouter.get('/variants/:videoId', (req, res) => {
  const variants = publishingRepo.getBrandedVideosByVideoId(req.params.videoId);
  const mapped = variants.map(v => ({
    ...v,
    previewUrl: `/uploads/renders/${path.basename(v.file_path)}`,
    downloadUrl: `/uploads/renders/${path.basename(v.file_path)}`,
  }));
  res.json({ variants: mapped });
});

// DELETE a branded variant (removes only the render file, preserves master video)
brandingRouter.delete('/variants/:variantId', (req, res) => {
  const variant = publishingRepo.getBrandedVideoById(req.params.variantId);
  if (!variant) return res.status(404).json({ error: 'Branded variant not found' });

  // Guard: Ensure we never delete a file outside rendersDir or delete original master
  const resolvedPath = path.resolve(variant.file_path);
  const resolvedRenders = path.resolve(rendersDir);
  if (resolvedPath.startsWith(resolvedRenders) && fs.existsSync(resolvedPath)) {
    try {
      fs.unlinkSync(resolvedPath);
    } catch (e: any) {
      console.warn(`[BrandingRouter] Could not unlink rendered file: ${e.message}`);
    }
  }

  publishingRepo.deleteBrandedVideo(req.params.variantId);
  res.json({ success: true, message: 'Branded variant removed. Master video remains untouched.' });
});

// TEST RENDER / EXPORT a video with brand kit settings & save as a library variant
brandingRouter.post('/render-preview', async (req, res) => {
  const { videoId, brandKit, presetName } = req.body as { 
    videoId: string; 
    brandKit: BrandKitOptions;
    presetName?: string;
  };

  if (!videoId || !brandKit) {
    return res.status(400).json({ error: 'videoId and brandKit are required' });
  }

  const video = publishingRepo.getVideoById(videoId);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    const renderedPath = await ffmpegService.renderBrandedVideo(video.file_path, brandKit);
    const filename = path.basename(renderedPath);
    const previewUrl = `/uploads/renders/${filename}`;
    const stats = fs.statSync(renderedPath);
    const meta = await ffmpegService.probeVideo(renderedPath);
    const renderSha256 = await ffmpegService.computeFileSha256(renderedPath);

    // Generate thumbnail for rendered variant
    const variantId = `brnd-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const thumbName = `${variantId}_thumb.jpg`;
    const thumbPath = path.resolve(rendersDir, thumbName);
    await ffmpegService.generateThumbnail(renderedPath, thumbPath);

    // Save persistent record in branded_videos table
    publishingRepo.insertBrandedVideo({
      id: variantId,
      videoId: video.id,
      presetName: presetName || brandKit.movementPreset || 'moving_watermark',
      movementPreset: brandKit.movementPreset || 'smooth_sine',
      watermarkText: brandKit.text || '@SocialCommandCenter',
      filePath: renderedPath,
      fileSize: stats.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      aspectRatio: meta.aspectRatio,
      thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
      brandKitJson: JSON.stringify(brandKit),
      sha256: renderSha256,
    });

    res.json({
      success: true,
      variantId,
      renderedPath,
      previewUrl,
      downloadUrl: previewUrl,
      sha256: renderSha256,
      metadata: meta,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Rendering failed: ${err.message}` });
  }
});
