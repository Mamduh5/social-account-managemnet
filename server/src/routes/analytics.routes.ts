import { Router } from 'express';
import { analyticsRepo } from '../repositories/analytics.repo.js';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', (_req, res) => {
  const totals = analyticsRepo.getOverviewTotals();
  const platformComparison = analyticsRepo.getPlatformComparison();
  const categoryComparison = analyticsRepo.getCategoryComparison();
  const accountRankings = analyticsRepo.getAccountRankings();
  const dailyTrends = analyticsRepo.getDailyTrends();

  res.json({
    totals,
    platformComparison,
    categoryComparison,
    accountRankings,
    dailyTrends,
    isSimulatedNotice: 'Note: Metrics currently represent simulated baseline data for connected accounts.',
  });
});
