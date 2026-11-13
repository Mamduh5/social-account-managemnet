import { db } from '../db/database.js';
import { contentWorkspaceRepo } from './content-workspace.repo.js';
import type { WeeklyPlan } from '../domain/weekly-content.js';

/** Append-only revisions in the existing content workspace. No schema upgrade or scheduler. */
export const weeklyContentRepo = {
  ready() { return contentWorkspaceRepo.ready(); },
  get(id: string): WeeklyPlan | undefined {
    const row = db.prepare("SELECT detail_json FROM content_workspace_audit WHERE entity_id=? AND action='weekly_plan_saved' ORDER BY rowid DESC LIMIT 1").get(id) as { detail_json: string } | undefined;
    return row ? JSON.parse(row.detail_json) : undefined;
  },
  list(): WeeklyPlan[] {
    return (db.prepare("SELECT detail_json FROM content_workspace_audit WHERE rowid IN (SELECT MAX(rowid) FROM content_workspace_audit WHERE action='weekly_plan_saved' GROUP BY entity_id) ORDER BY rowid DESC LIMIT 52").all() as { detail_json: string }[]).map(row => JSON.parse(row.detail_json));
  },
  save(plan: WeeklyPlan, expectedRevision: number) {
    return db.transaction(() => {
      const previous = this.get(plan.id);
      if ((previous?.revision ?? 0) !== expectedRevision) throw new Error('Weekly plan changed; reload the current revision');
      if (Buffer.byteLength(JSON.stringify(plan)) > 512 * 1024) throw new Error('Weekly plan exceeds the V1 evidence bound');
      const saved = { ...plan, revision: expectedRevision + 1 };
      contentWorkspaceRepo.audit(plan.id, 'weekly_plan_saved', saved.revision, saved);
      return saved;
    })();
  },
  transaction<T>(fn: () => T): T { return db.transaction(fn)(); },
  topicCandidates(accountId:string){const published=db.prepare("SELECT d.id,p.title,d.caption FROM publishing_destinations d JOIN publishing_posts p ON p.id=d.post_id WHERE d.account_id=? AND d.status='published' ORDER BY d.published_at DESC LIMIT 50").all(accountId) as any[];const drafts=(db.prepare("SELECT id,payload_json FROM publishing_drafts WHERE status IN ('draft','approved') ORDER BY updated_at DESC LIMIT 100").all() as any[]).flatMap(d=>{const p=JSON.parse(d.payload_json);return p.destinations?.some((x:any)=>x.accountId===accountId)?[{id:d.id,title:p.title,caption:p.destinations.filter((x:any)=>x.accountId===accountId).map((x:any)=>x.caption).join(' ')}]:[];});return [...published,...drafts];},
  published(accountId: string) {
    return db.prepare(`SELECT d.id,d.caption,d.content_type,d.remote_post_id,d.remote_post_url,d.published_at,d.confirmation_source,d.verification_status
      FROM publishing_destinations d WHERE d.account_id=? AND d.status='published' AND d.remote_post_id IS NOT NULL
      ORDER BY d.published_at DESC LIMIT 20`).all(accountId) as any[];
  },
  metric(destinationId: string) {
    return db.prepare(`SELECT observed_at,like_count,comment_count,share_count,source,provenance_status FROM post_metrics_snapshots
      WHERE destination_id=? AND source='meta_graph_api' AND provenance_status='confirmed' ORDER BY observed_at DESC,rowid DESC LIMIT 1`).get(destinationId) as any;
  },
  comment(id: string, accountId: string) {
    return db.prepare(`SELECT c.id,c.account_id,c.destination_id,c.created_time FROM comments c
      JOIN publishing_destinations d ON d.id=c.destination_id AND d.account_id=c.account_id
      WHERE c.id=? AND c.account_id=? AND c.source='meta_graph_api' AND c.platform='facebook'
        AND c.status<>'hidden' AND d.status='published' AND d.remote_post_id IS NOT NULL`).get(id, accountId) as any;
  },
  commentCount(destinationId: string, accountId: string) {
    return (db.prepare("SELECT COUNT(*) n FROM comments WHERE destination_id=? AND account_id=? AND source='meta_graph_api' AND platform='facebook' AND status<>'hidden'").get(destinationId, accountId) as { n: number }).n;
  },
};
