import { Router } from 'express';
import { analyticsRepo, AnalyticsFilter } from '../repositories/analytics.repo.js';
import { syncService } from '../services/sync.service.js';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', (req, res) => {
  const filter: AnalyticsFilter = {
    platform: req.query.platform as string,
    accountId: req.query.accountId as string,
    categoryId: req.query.categoryId as string,
  };

  const totals = analyticsRepo.getOverviewTotals(filter);
  const platformComparison = analyticsRepo.getPlatformComparison();
  const categoryComparison = analyticsRepo.getCategoryComparison();
  const accountRankings = analyticsRepo.getAccountRankings(filter);
  const dailyTrends = analyticsRepo.getDailyTrends(filter);
  const videoPerformance = analyticsRepo.getVideoPerformanceList(filter);
  const syncStates = analyticsRepo.getSyncStates();

  res.json({
    totals,
    platformComparison,
    categoryComparison,
    accountRankings,
    dailyTrends,
    videoPerformance,
    syncStates,
    isSimulatedNotice: 'Real platform metrics with proven provenance. Demo data excluded.',
  });
});

analyticsRouter.get('/videos', (req, res) => {
  const filter: AnalyticsFilter = {
    platform: req.query.platform as string,
    accountId: req.query.accountId as string,
    categoryId: req.query.categoryId as string,
  };

  const videos = analyticsRepo.getVideoPerformanceList(filter);
  res.json({ videos });
});

analyticsRouter.get('/videos/:destinationId/history', (req, res) => {
  const history = analyticsRepo.getPostHistory(req.params.destinationId);
  res.json({ history });
});

analyticsRouter.post('/sync', async (req, res) => {
  const { accountId } = req.body;
  if (accountId) {
    const result = await syncService.syncAccount(accountId);
    return res.json({ success: result.success, result, message: result.message });
  }

  const result = await syncService.syncAllAccounts();
  return res.json({ success: result.success, result, message: result.message });
});

analyticsRouter.post('/observe', (req, res) => {
  const { destinationId, viewCount, likeCount, commentCount, shareCount, source, notes } = req.body;
  if (!destinationId) {
    return res.status(400).json({ error: 'destinationId is required' });
  }

  try {
    const snapshot = syncService.recordObservation({
      destinationId,
      viewCount: viewCount !== undefined && viewCount !== null ? Number(viewCount) : null,
      likeCount: likeCount !== undefined && likeCount !== null ? Number(likeCount) : null,
      commentCount: commentCount !== undefined && commentCount !== null ? Number(commentCount) : null,
      shareCount: shareCount !== undefined && shareCount !== null ? Number(shareCount) : null,
      source: source || 'browser_verified',
      notes,
    });
    return res.json({ success: true, snapshot });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
