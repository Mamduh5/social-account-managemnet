import { Router } from 'express';
import { pipelineService, PipelineJobsQuery } from '../services/pipeline.service.js';

export const pipelineRouter = Router();

function parsePipelineQuery(raw: Record<string, any>): PipelineJobsQuery {
  const limitRaw = raw.limit !== undefined ? Number(raw.limit) : undefined;
  const sortRaw = typeof raw.sort === 'string' ? raw.sort.trim() : undefined;
  const importStateRaw = typeof raw.importState === 'string' ? raw.importState.trim() : undefined;

  return {
    q: typeof raw.q === 'string' ? raw.q : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    aspectRatio: typeof raw.aspectRatio === 'string' ? raw.aspectRatio : undefined,
    importState:
      importStateRaw === 'imported' || importStateRaw === 'unimported' || importStateRaw === 'all'
        ? importStateRaw
        : undefined,
    sort:
      sortRaw === 'recent' || sortRaw === 'created' || sortRaw === 'oldest' || sortRaw === 'name'
        ? sortRaw
        : undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    cursor: typeof raw.cursor === 'string' && raw.cursor.trim() ? raw.cursor.trim() : null,
    includeHidden: raw.includeHidden === 'true',
  };
}

// GET /api/pipeline/status - returns health and summary of running pipeline
pipelineRouter.get('/status', async (req, res) => {
  try {
    const query = parsePipelineQuery(req.query as Record<string, any>);
    const summary = await pipelineService.getPipelineStatusSummary(query);
    const watchDir = pipelineService.getWatchDirectory();
    const watchFiles = pipelineService.scanWatchDirectory({includeHidden:true});
    const files = watchFiles.filter(file=>file.visibilitySupported && !file.hidden);

    res.json({
      health: summary.health,
      jobs: summary.jobs,
      jobsCount: summary.jobs.length,
      totalMatched: summary.totalMatched,
      page: summary.page,
      sourceContract: summary.sourceContract,
      historyComplete: summary.historyComplete,
      incompleteReason: summary.incompleteReason,
      discoveryError: summary.error,
      errorKind: summary.errorKind,
      apiUrl: pipelineService.getPipelineApiUrl(),
      watchDir,
      files,
      fileCount: files.length,
      watchIdentityIncomplete: watchFiles.some(file=>!file.visibilitySupported),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/jobs - list discovered jobs from the AI video pipeline with search, filter, sort & pagination
pipelineRouter.get('/jobs', async (req, res) => {
  try {
    const query = parsePipelineQuery(req.query as Record<string, any>);
    const result = await pipelineService.queryPipelineJobs(query);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      error: err.message,
      errorKind: 'upstream_error',
      jobs: [],
      count: 0,
      page: { limit: 12, returned: 0, hasMore: false, nextCursor: null },
      sourceContract: 'offline',
      historyComplete: false,
    });
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
pipelineRouter.post('/sync', async (req, res) => {
  try {
    const query = parsePipelineQuery((req.body || req.query || {}) as Record<string, any>);
    const result = await pipelineService.queryPipelineJobs(query);
    if (!result.health.reachable || result.error) {
      const httpStatus = result.errorKind === 'auth_failure' ? 401 : result.errorKind === 'invalid_cursor' ? 400 : 503;
      return res.status(httpStatus).json({
        error: result.error || result.health.error || 'Upstream AI video pipeline is not reachable',
        errorKind: result.errorKind,
        health: result.health,
        jobs: [],
        count: 0,
        page: result.page,
        sourceContract: result.sourceContract,
        historyComplete: false,
      });
    }
    res.json({
      success: true,
      count: result.jobs.length,
      totalMatched: result.totalMatched,
      jobs: result.jobs,
      page: result.page,
      sourceContract: result.sourceContract,
      historyComplete: result.historyComplete,
      incompleteReason: result.incompleteReason,
      health: result.health,
    });
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
    const result = await pipelineService.importVideoFileWithStatus({
      filePath,
      title,
      categoryId,
      pipelineJobId,
    });
    res.json({
      success: true,
      videoId: result.videoId,
      alreadyExisted: result.alreadyExisted,
      message: result.alreadyExisted ? 'Local video file already imported' : 'Local video file imported into library',
    });
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
      return res.json({
        success: true,
        videoId: result.videoId,
        alreadyExisted: result.alreadyExisted,
        message: 'Imported via webhook job ID',
      });
    }

    if (finalVideoPath) {
      const result = await pipelineService.importVideoFileWithStatus({
        filePath: finalVideoPath,
        title: title || `Pipeline Job ${jobId || Date.now()}`,
        pipelineJobId: jobId,
      });
      return res.json({
        success: true,
        videoId: result.videoId,
        alreadyExisted: result.alreadyExisted,
        message: 'Video imported successfully via file webhook',
      });
    }

    return res.status(400).json({ error: 'jobId or finalVideoPath is required' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
