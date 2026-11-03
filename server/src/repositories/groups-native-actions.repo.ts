import { db } from '../db/database.js';
import { contentWorkspaceRepo } from './content-workspace.repo.js';
import type { GroupNativeActionDto, GroupNativeActionEvent } from '../domain/groups-native-actions.js';

/** Existing append-only workspace audit is the durable ledger; no owner-schema migration. */
export const groupsNativeActionsRepo = {
  transaction<T>(work: () => T): T { return db.transaction(work)(); },
  list(groupId?: string): GroupNativeActionDto[] {
    const rows = db.prepare("SELECT entity_id,detail_json FROM content_workspace_audit WHERE action='group_native_intent_saved' ORDER BY rowid").all() as {entity_id:string;detail_json:string}[];
    const intents = rows.map(row => JSON.parse(row.detail_json) as GroupNativeActionDto);
    return rows.map(row => {
      const intent = JSON.parse(row.detail_json) as GroupNativeActionDto;
      const events = (db.prepare("SELECT detail_json FROM content_workspace_audit WHERE entity_id=? AND action='group_native_outcome_recorded_unverified' ORDER BY rowid").all(row.entity_id) as {detail_json:string}[]).map(event => JSON.parse(event.detail_json) as GroupNativeActionEvent);
      return { ...intent, supersededById: intents.find(next => next.supersedesActionId === intent.id)?.id || null, events, revision: events.length + 1, state: events.at(-1)?.state || intent.state };
    }).filter(action => !groupId || action.groupId === groupId);
  },
  get(id: string) { return this.list().find(action => action.id === id); },
  save(intent: GroupNativeActionDto) { contentWorkspaceRepo.audit(intent.id, 'group_native_intent_saved', 1, intent); },
  event(id: string, revision: number, event: GroupNativeActionEvent) { contentWorkspaceRepo.audit(id, 'group_native_outcome_recorded_unverified', revision, event); },
};
