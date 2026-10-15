import { Router } from 'express';
import { db } from '../db/database.js';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', (_req, res) => {
  // Aggregate overall stats across all connected accounts
  const totals = db.prepare(`
    SELECT 
      sum(views) as total_views,
      sum(likes) as total_likes,
      sum(comments) as total_comments,
      sum(shares) as total_shares,
      sum(followers_gain) as total_followers_gained,
      sum(watch_time_seconds) as total_watch_time_seconds,
      round(avg(engagement_rate), 2) as avg_engagement_rate
    FROM analytics_snapshots
  `).get();

  // Platform breakdown: Facebook vs TikTok
  const platformComparison = db.prepare(`
    SELECT 
      a.platform,
      count(DISTINCT a.id) as account_count,
      sum(s.views) as total_views,
      sum(s.likes) as total_likes,
      sum(s.comments) as total_comments,
      sum(s.shares) as total_shares,
      sum(s.followers_gain) as total_followers_gain,
      round(avg(s.engagement_rate), 2) as avg_engagement_rate
    FROM accounts a
    JOIN analytics_snapshots s ON a.id = s.account_id
    GROUP BY a.platform
  `).all();

  // Category breakdown: Object to Life vs Screen to Life vs Cinematic AI
  const categoryComparison = db.prepare(`
    SELECT 
      c.id, c.name, c.color, c.slug,
      count(DISTINCT a.id) as account_count,
      sum(s.views) as total_views,
      sum(s.likes) as total_likes,
      sum(s.comments) as total_comments,
      sum(s.shares) as total_shares,
      round(avg(s.engagement_rate), 2) as avg_engagement_rate
    FROM categories c
    JOIN accounts a ON c.id = a.category_id
    JOIN analytics_snapshots s ON a.id = s.account_id
    GROUP BY c.id
    ORDER BY total_views DESC
  `).all();

  // Account level rankings
  const accountRankings = db.prepare(`
    SELECT 
      a.id, a.name, a.handle, a.platform, a.avatar_url,
      c.name as category_name, c.color as category_color,
      sum(s.views) as total_views,
      sum(s.likes) as total_likes,
      sum(s.comments) as total_comments,
      sum(s.shares) as total_shares,
      max(s.followers_total) as current_followers,
      round(avg(s.engagement_rate), 2) as engagement_rate
    FROM accounts a
    LEFT JOIN categories c ON a.category_id = c.id
    JOIN analytics_snapshots s ON a.id = s.account_id
    GROUP BY a.id
    ORDER BY total_views DESC
  `).all();

  // 7-day daily trend for time-series charts
  const dailyTrends = db.prepare(`
    SELECT 
      s.date,
      sum(case when a.platform = 'facebook' then s.views else 0 end) as facebook_views,
      sum(case when a.platform = 'tiktok' then s.views else 0 end) as tiktok_views,
      sum(s.views) as total_views,
      sum(s.likes) as total_likes,
      sum(s.comments) as total_comments
    FROM analytics_snapshots s
    JOIN accounts a ON s.account_id = a.id
    GROUP BY s.date
    ORDER BY s.date ASC
  `).all();

  res.json({
    totals,
    platformComparison,
    categoryComparison,
    accountRankings,
    dailyTrends,
    isSimulatedNotice: 'Note: Metrics currently represent simulated baseline data for connected accounts.',
  });
});
