import { Router } from 'express';
import { pipelineService } from '../services/pipeline.service.js';

export const pipelineRouter = Router();

pipelineRouter.get('/status', (_req, res) => {
  const watchDir = pipelineService.getWatchDirectory();
  const files = pipelineService.scanWatchDirectory();
  res.json({
    watchDir,
    files,
    fileCount: files.length,
  });
});

pipelineRouter.put('/watch-dir', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath) return res.status(400).json({ error: 'path is required' });
  pipelineService.setWatchDirectory(newPath);
  res.json({ success: true, watchDir: newPath });
});

pipelineRouter.post('/import-file', async (req, res) => {
  const { filePath, title, categoryId, pipelineJobId } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath is required' });

  try {
    const videoId = await pipelineService.importVideoFile({
      filePath,
      title,
      categoryId,
      pipelineJobId,
    });
    res.json({ success: true, videoId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook endpoint for upstream ai-video-pipeline completion
pipelineRouter.post('/webhook', async (req, res) => {
  const { jobId, finalVideoPath, title, categorySlug } = req.body;
  if (!finalVideoPath) {
    return res.status(400).json({ error: 'finalVideoPath is required' });
  }

  try {
    const videoId = await pipelineService.importVideoFile({
      filePath: finalVideoPath,
      title: title || `Pipeline Job ${jobId}`,
      pipelineJobId: jobId,
    });
    res.json({ success: true, videoId, message: 'Video imported successfully via webhook' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
