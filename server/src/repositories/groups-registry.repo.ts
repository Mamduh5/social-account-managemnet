import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { groupsSchemaReady } from '../db/groups-schema.js';
import type { GroupEligibility, GroupMembershipObservation, GroupMembershipStatus, GroupReceiptEvent } from '../domain/groups.js';

export interface GroupExtensionRow {
  group_id: string; canonical_key: string | null; canonical_url: string | null; original_url: string;
  acting_page_id: string | null; shortlisted: number; archived_at: string | null; reviewed_at: string | null;
  eligibility_json: string; revision: number; legacy_duplicate: number;
}

/** Local planning metadata only. No platform calls, token access, or publishing destinations. */
export const groupsRegistryRepo = {
  ready() { return groupsSchemaReady(db); },
  transaction<T>(work: () => T): T { return db.transaction(work)(); },
  extension(id: string) { return db.prepare('SELECT * FROM group_plan_extensions WHERE group_id=?').get(id) as GroupExtensionRow | undefined; },
  duplicate(key: string, pageId: string, exceptId: string) {
    return db.prepare('SELECT group_id FROM group_plan_extensions WHERE canonical_key=? AND acting_page_id=? AND archived_at IS NULL AND group_id<>? LIMIT 1').get(key, pageId, exceptId) as {group_id: string} | undefined;
  },
  saveExtension(input: Omit<GroupExtensionRow, 'eligibility_json'> & {eligibility: GroupEligibility}) {
    db.prepare(`INSERT INTO group_plan_extensions(group_id,canonical_key,canonical_url,original_url,acting_page_id,shortlisted,archived_at,reviewed_at,eligibility_json,revision,legacy_duplicate)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET canonical_key=excluded.canonical_key,canonical_url=excluded.canonical_url,
      acting_page_id=excluded.acting_page_id,shortlisted=excluded.shortlisted,archived_at=excluded.archived_at,reviewed_at=excluded.reviewed_at,
      eligibility_json=excluded.eligibility_json,revision=excluded.revision,legacy_duplicate=excluded.legacy_duplicate`)
      .run(input.group_id,input.canonical_key,input.canonical_url,input.original_url,input.acting_page_id,input.shortlisted,input.archived_at,input.reviewed_at,JSON.stringify(input.eligibility),input.revision,input.legacy_duplicate);
  },
  observations(id: string): GroupMembershipObservation[] {
    const rows=db.prepare('SELECT * FROM group_membership_observations WHERE group_id=? ORDER BY rowid').all(id) as {id:string;group_id:string;account_id:string;status:GroupMembershipStatus;observed_at:string|null;notes:string;created_at:string}[];
    const contexts=db.prepare(`SELECT a.entity_id,a.detail_json FROM content_workspace_audit a JOIN group_membership_observations o ON o.id=a.entity_id
      WHERE o.group_id=? AND a.action='group_membership_identity_saved' ORDER BY a.rowid`).all(id) as {entity_id:string;detail_json:string}[];
    const identities=new Map<string,{accountId:string;canonicalKey:string|null;url:string|null}>();
    for (const context of contexts) {
      const detail=JSON.parse(context.detail_json);
      if (!identities.has(context.entity_id) && detail.groupId===id) identities.set(context.entity_id,detail);
    }
    // Earlier explicit observations captured their canonical key in the existing
    // audit. Do not infer an uncaptured identity from the plan's current URL.
    const legacy=db.prepare("SELECT detail_json FROM content_workspace_audit WHERE entity_id=? AND action='group_membership_observed_unverified' ORDER BY rowid").all(id) as {detail_json:string}[];
    for (const audit of legacy) {
      const detail=JSON.parse(audit.detail_json);
      if (typeof detail.observationId==='string' && !identities.has(detail.observationId)) identities.set(detail.observationId,{accountId:detail.accountId,canonicalKey:detail.canonicalKey||null,url:null});
    }
    return rows.map(row=>{
      const identity=identities.get(row.id);
      return {id:row.id,groupId:row.group_id,accountId:row.account_id,status:row.status,observedAt:row.observed_at,notes:row.notes,source:'owner_entered',verified:false,createdAt:row.created_at,
        groupIdentity:identity?.accountId===row.account_id?{canonicalKey:identity.canonicalKey,url:identity.url}:null};
    });
  },
  observe(groupId: string, accountId: string, status: GroupMembershipStatus, observedAt: string | null, notes: string) {
    const id=`gmobs-${randomUUID()}`;
    db.prepare("INSERT INTO group_membership_observations(id,group_id,account_id,status,observed_at,notes,source,verified) VALUES (?,?,?,?,?,?,'owner_entered',0)").run(id,groupId,accountId,status,observedAt,notes);
    return id;
  },
  updateMembership(groupId: string, membership: GroupMembershipStatus) {
    db.prepare("UPDATE facebook_group_plans SET membership=?,updated_at=datetime('now') WHERE id=?").run(membership,groupId);
    db.prepare('UPDATE group_plan_extensions SET revision=revision+1,reviewed_at=NULL WHERE group_id=?').run(groupId);
  },
  receipts(preparedId: string): GroupReceiptEvent[] {
    const rows=db.prepare('SELECT * FROM group_receipt_events WHERE prepared_id=? ORDER BY rowid').all(preparedId) as {id:string;prepared_id:string;url:string;note:string;recorded_at:string;supersedes_id:string|null}[];
    return rows.map(row=>({id:row.id,preparedId:row.prepared_id,url:row.url,note:row.note,source:'owner_entered',verified:false,recordedAt:row.recorded_at,supersedesId:row.supersedes_id}));
  },
  receipt(preparedId: string, url: string, note: string, supersedesId: string | null) {
    const id=`greceipt-${randomUUID()}`;
    db.prepare("INSERT INTO group_receipt_events(id,prepared_id,url,note,source,verified,supersedes_id) VALUES (?,?,?,?,'owner_entered',0,?)").run(id,preparedId,url,note,supersedesId);
    return id;
  },
  reminderState(preparedId: string): 'active'|'cancelled'|'dismissed' {
    const row=db.prepare('SELECT state FROM group_reminder_states WHERE prepared_id=?').get(preparedId) as {state:'active'|'cancelled'|'dismissed'}|undefined;
    return row?.state || 'active';
  },
  setReminderState(preparedId: string, state: 'active'|'cancelled'|'dismissed', note: string) {
    db.prepare(`INSERT INTO group_reminder_states(prepared_id,state,note) VALUES (?,?,?) ON CONFLICT(prepared_id) DO UPDATE SET state=excluded.state,note=excluded.note,updated_at=datetime('now')`).run(preparedId,state,note);
  },
};
