import { db } from '../db/database.js';
import { contentWorkspaceRepo } from './content-workspace.repo.js';

/** V1.12 handoff metadata uses the existing append-only workspace audit. No schema change. */
export const groupsHandoffRepo = {
  transaction<T>(work: () => T): T { return db.transaction(work)(); },
  context(id: string): any | undefined {
    const row = db.prepare("SELECT detail_json FROM content_workspace_audit WHERE entity_id=? AND action='group_handoff_context_saved' ORDER BY rowid LIMIT 1").get(id) as any;
    return row ? JSON.parse(row.detail_json) : undefined;
  },
  saveContext(id: string, context: object) { contentWorkspaceRepo.audit(id, 'group_handoff_context_saved', null, context); },
  pending() { return db.prepare("SELECT * FROM group_prepared_content WHERE status='prepared' ORDER BY created_at,rowid").all() as any[]; },
  media(kind: string, id: string): any | undefined {
    if (kind === 'image') return db.prepare('SELECT id,original_filename AS title FROM media_images WHERE id=?').get(id);
    if (kind === 'video') return db.prepare('SELECT id,title FROM videos WHERE id=?').get(id);
    return undefined;
  },
};
