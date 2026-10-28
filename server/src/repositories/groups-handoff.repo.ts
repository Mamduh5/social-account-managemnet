import { db } from '../db/database.js';
import { contentWorkspaceRepo } from './content-workspace.repo.js';
import type { GroupHandoffContext } from '../domain/groups.js';

/** Snapshots remain in their original append-only audit records, including version 1. */
export const groupsHandoffRepo = {
  transaction<T>(work: () => T): T { return db.transaction(work)(); },
  context(id: string): GroupHandoffContext | undefined {
    const row = db.prepare("SELECT detail_json FROM content_workspace_audit WHERE entity_id=? AND action='group_handoff_context_saved' ORDER BY rowid LIMIT 1").get(id) as {detail_json:string}|undefined;
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
