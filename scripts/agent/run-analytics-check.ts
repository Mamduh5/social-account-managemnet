import 'dotenv/config';
import { db } from '../../server/src/db/database.js';
import { accountsRepo } from '../../server/src/repositories/accounts.repo.js';
import { analyticsRepo } from '../../server/src/repositories/analytics.repo.js';
import { AgentStore } from './store.js';

export async function runAnalyticsCheck(destinationId = 'dest-c12e9330-d01f-435d-86cc-1b1c222b7c03', sccUrl = 'http://localhost:3001') {
  console.log(`[AnalyticsCheck] Running check for destination ${destinationId}...`);
  const accountId = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';

  // 1. Trigger official API sync via SCC endpoint
  let syncResult: any = null;
  try {
    const syncRes = await fetch(`${sccUrl}/api/analytics/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    syncResult = await syncRes.json();
    console.log('[AnalyticsCheck] Sync response:', syncResult);
  } catch (err: any) {
    console.warn('[AnalyticsCheck] Sync request failed:', err.message);
  }

  // 2. Query recorded metrics for destination
  const history = analyticsRepo.getPostHistory(destinationId);
  const latestSnapshot = history.length > 0 ? history[0] : null;

  // 3. Query current post record
  const dest = db.prepare(`
    SELECT pd.*, pp.title as post_title
    FROM publishing_destinations pd
    JOIN publishing_posts pp ON pd.post_id = pp.id
    WHERE pd.id = ?
  `).get(destinationId) as any;

  const result = {
    destinationId,
    remotePostId: dest?.remote_post_id,
    remotePostUrl: dest?.remote_post_url,
    publishedAt: dest?.published_at,
    checkedAt: new Date().toISOString(),
    syncStatus: syncResult?.result?.status || 'unknown',
    hasConfirmedMetrics: !!latestSnapshot && latestSnapshot.provenance_status === 'confirmed',
    metrics: {
      views: latestSnapshot?.view_count ?? null,
      likes: latestSnapshot?.like_count ?? null,
      comments: latestSnapshot?.comment_count ?? null,
      shares: latestSnapshot?.share_count ?? null,
    },
    provenance: latestSnapshot?.source ?? 'unavailable',
    predictionComparison: {
      ownerPredictedViews: '0-10',
      ownerPredictedEngagement: 0,
      actualViews: latestSnapshot?.view_count ?? 'unavailable',
      actualEngagement: latestSnapshot ? ((latestSnapshot.like_count || 0) + (latestSnapshot.comment_count || 0) + (latestSnapshot.share_count || 0)) : 'unavailable',
    }
  };

  console.log('[AnalyticsCheck] Verified Check Result:', JSON.stringify(result, null, 2));

  // 4. Record to agent store knowledge if store is available
  try {
    const store = new AgentStore('.data/agent/agent.db');
    store.recordKnowledge({
      id: `analytics-observation:${destinationId}:${Date.now()}`,
      kind: 'observation',
      accountId,
      resourceId: destinationId,
      text: `Analytics check executed for Node.js Shutdown post (${destinationId}). Views: ${result.metrics.views ?? 'unavailable'}, Likes: ${result.metrics.likes ?? 'unavailable'}, Comments: ${result.metrics.comments ?? 'unavailable'}, Shares: ${result.metrics.shares ?? 'unavailable'}.`,
      source: `${sccUrl}/api/analytics`,
      evidence: result,
    });
    store.close();
  } catch (e: any) {
    console.warn('[AnalyticsCheck] Failed to record knowledge:', e.message);
  }

  return result;
}

if (process.argv[1]?.endsWith('run-analytics-check.ts')) {
  runAnalyticsCheck().catch(err => {
    console.error('Fatal check error:', err);
    process.exit(1);
  });
}
