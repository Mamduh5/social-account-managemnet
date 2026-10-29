import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { BrandKitOptions, ffmpegService } from '../services/ffmpeg.service.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { rendersDir } from '../db/database.js';
import { BRANDING_MODES, brandingElements, resolveBrandingMode } from '../domain/branding-layout.js';
import { deleteBrandingVariant } from '../services/branding-artifacts.service.js';

// Preserve unknown legacy fields, but reject values that could break filter
// construction. Text stays literal Unicode; no template or CTA substitution.
function validateBrandKit(kit: any): string | undefined {
  if (!kit || typeof kit !== 'object' || Array.isArray(kit)) return 'brandKit must be an object';
  if (kit.mode !== undefined && !BRANDING_MODES.some(mode => mode.id === kit.mode)) return 'Unknown branding mode';
  for (const field of ['text', 'signatureText']) {
    if (kit[field] !== undefined && (typeof kit[field] !== 'string' || kit[field].length > 1000 || kit[field].includes('\0'))) return `${field} must be literal text of at most 1000 characters`;
  }
  for (const field of ['fontSize', 'opacity', 'speedSeconds', 'intervalSeconds']) {
    if (kit[field] !== undefined && !Number.isFinite(kit[field])) return `${field} must be a finite number`;
  }
  if (kit.safeArea !== undefined && (!kit.safeArea || typeof kit.safeArea !== 'object' || ['top', 'bottom', 'left', 'right'].some(field => kit.safeArea[field] !== undefined && (!Number.isFinite(kit.safeArea[field]) || kit.safeArea[field] < 0)))) return 'Safe-area margins must be nonnegative finite numbers';
}

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
  const validationError = validateBrandKit(brandKit);
  if (validationError) return res.status(400).json({ error: validationError });
  if (!accountsRepo.getAccountById(req.params.accountId)) return res.status(404).json({ error: 'Account not found' });

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
  try {
    const result = deleteBrandingVariant(req.params.variantId);
    if (!result) return res.status(404).json({error:'Branded variant not found'});
    return res.json(result);
  } catch (error:any) { return res.status(409).json({error:error.message}); }
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
  const validationError = validateBrandKit(brandKit);
  if (validationError) return res.status(400).json({ error: validationError });

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
      presetName: presetName || resolveBrandingMode(brandKit),
      movementPreset: brandKit.movementPreset || 'smooth_sine',
      watermarkText: brandingElements(brandKit).moving ? (brandKit.text ?? '@SocialCommand') : brandingElements(brandKit).caption ? (brandKit.signatureText ?? '') : '',
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
