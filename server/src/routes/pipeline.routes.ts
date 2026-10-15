import { Router } from 'express';
import { pipelineService } from '../services/pipeline.service.js';

export const pipelineRouter = Router();

// GET /api/pipeline/status - returns health and summary of running pipeline
pipelineRouter.get('/status', async (_req, res) => {
  try {
    const { health, jobs } = await pipelineService.getPipelineStatusSummary();
    const watchDir = pipelineService.getWatchDirectory();
    const files = pipelineService.scanWatchDirectory();

    res.json({
      health,
      jobs,
      jobsCount: jobs.length,
      apiUrl: pipelineService.getPipelineApiUrl(),
      watchDir,
      files,
      fileCount: files.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/jobs - list discovered completed jobs from the AI video pipeline
pipelineRouter.get('/jobs', async (_req, res) => {
  try {
    const jobs = await pipelineService.discoverPipelineJobs();
    res.json({ jobs, count: jobs.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message, jobs: [] });
  }
});

// POST /api/pipeline/import-job - import a specific completed video from the AI pipeline
pipelineRouter.post('/import-job', async (req, res) => {
  const { jobId, categoryId, title } = req.body;
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  try {
    const result = await pipelineService.importPipelineJob({
      jobId,
      categoryId,
      customTitle: title,
    });
    res.json({
      success: true,
      videoId: result.videoId,
      alreadyExisted: result.alreadyExisted,
      message: result.alreadyExisted ? 'Video already imported' : 'Video imported successfully from pipeline',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/sync - synchronize/discover latest completed jobs
pipelineRouter.post('/sync', async (_req, res) => {
  try {
    const health = await pipelineService.checkPipelineHealth();
    if (!health.reachable) {
      return res.status(503).json({ error: 'Upstream AI video pipeline is not reachable', health });
    }
    const jobs = await pipelineService.discoverPipelineJobs();
    res.json({ success: true, count: jobs.length, jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/pipeline/api-url - configure pipeline API endpoint
pipelineRouter.put('/api-url', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  pipelineService.setPipelineApiUrl(url);
  res.json({ success: true, apiUrl: pipelineService.getPipelineApiUrl() });
});

// PUT /api/pipeline/watch-dir - configure local watch directory
pipelineRouter.put('/watch-dir', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath) return res.status(400).json({ error: 'path is required' });
  pipelineService.setWatchDirectory(newPath);
  res.json({ success: true, watchDir: newPath });
});

// POST /api/pipeline/import-file - import from local file
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

// POST /api/pipeline/webhook - Webhook endpoint for upstream ai-video-pipeline completion
pipelineRouter.post('/webhook', async (req, res) => {
  const { jobId, finalVideoPath, title } = req.body;

  try {
    if (jobId) {
      const result = await pipelineService.importPipelineJob({
        jobId,
        customTitle: title,
      });
      return res.json({ success: true, videoId: result.videoId, message: 'Imported via webhook job ID' });
    }

    if (finalVideoPath) {
      const videoId = await pipelineService.importVideoFile({
        filePath: finalVideoPath,
        title: title || `Pipeline Job ${jobId || Date.now()}`,
        pipelineJobId: jobId,
      });
      return res.json({ success: true, videoId, message: 'Video imported successfully via file webhook' });
    }

    return res.status(400).json({ error: 'jobId or finalVideoPath is required' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
