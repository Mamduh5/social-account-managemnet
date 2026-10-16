import { db } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { syncService } from '../server/src/services/sync.service.js';
import { analyticsRepo } from '../server/src/repositories/analytics.repo.js';

initializeDatabase();

async function seed() {
  console.log('Seeding V1.5 baseline verified observations...');

  // Check destination IDs
  const destinations = db.prepare(`
    SELECT pd.id, pd.post_id, pd.account_id, pd.remote_post_id, pd.remote_post_url, pd.status, a.platform
    FROM publishing_destinations pd
    JOIN accounts a ON pd.account_id = a.id
    WHERE pd.status = 'published' AND pd.remote_post_id IS NOT NULL
  `).all() as any[];

  console.log('Found published destinations:', destinations);

  // Baseline observations data
  const baselines = [
    {
      postId: '2030865660948720',
      views: 311,
      likes: 0,
      comments: 0,
      shares: 0,
      notes: 'Verified via Facebook Page Insights modal (311 plays, 4 reach, 3s avg watch time)',
    },
    {
      postId: '1456974179666566',
      views: 16,
      likes: 0,
      comments: 0,
      shares: 0,
      notes: 'Verified via Facebook Page Insights modal (16 plays, 0 reach, 1s avg watch time)',
    },
    {
      postId: '7697115798170782983',
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      notes: 'Verified via TikTok Creator Studio & native player (0 views, newly published personal account)',
    },
    {
      postId: '7697147128375725320',
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      notes: 'Verified via TikTok Creator Studio & native player (0 views, newly published personal account)',
    },
  ];

  for (const b of baselines) {
    const dest = destinations.find(d => d.remote_post_id === b.postId);
    if (!dest) {
      console.warn(`Destination for remote post ${b.postId} not found in database!`);
      continue;
    }

    // Check if snapshot already exists
    const existing = db.prepare(`
      SELECT * FROM post_metrics_snapshots WHERE destination_id = ?
    `).all(dest.id);

    if (existing.length === 0) {
      console.log(`Recording baseline observation for ${dest.platform} post ${b.postId} (dest: ${dest.id})...`);
      syncService.recordObservation({
        destinationId: dest.id,
        viewCount: b.views,
        likeCount: b.likes,
        commentCount: b.comments,
        shareCount: b.shares,
        source: 'browser_verified',
        notes: b.notes,
      });
    } else {
      console.log(`Snapshot already exists for destination ${dest.id} (${existing.length} records).`);
    }
  }

  // Also seed initial account metrics snapshots if not present
  const fbAccount = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';
  const ttAccount = 'acc-e0d55bef-1976-4213-92d8-4f949ee3e5f7';

  for (const accId of [fbAccount, ttAccount]) {
    const existing = db.prepare(`SELECT * FROM analytics_snapshots WHERE account_id = ? AND is_simulated = 0`).all(accId);
    if (existing.length === 0) {
      console.log(`Recording account metric baseline for ${accId}...`);
      analyticsRepo.recordAccountMetricSnapshot({
        account_id: accId,
        observed_at: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        followers_total: 0,
        followers_gain: 0,
        views_total: accId === fbAccount ? 327 : 0,
        likes_total: 0,
        comments_total: 0,
        shares_total: 0,
        engagement_rate: 0,
        source: 'browser_verified',
        provenance_status: 'confirmed',
        is_simulated: 0,
      });
    }
  }

  console.log('Seeding complete.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
