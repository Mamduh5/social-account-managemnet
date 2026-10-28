import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { provisionalVoice, type OwnerVoiceProfile } from '../domain/content-assistant.js';

export interface AssistantDraftRow {
  id: string; account_id: string; kind: string; content: string; revision: number;
  status: 'draft' | 'approved' | 'rejected'; source: string; provider: string;
  context_json: string; flags_json: string; approved_revision: number | null; destination_key: string;
}
export const contentWorkspaceRepo = {
  ready(){return ['owner_voice_profiles','assistant_drafts','content_workspace_audit','content_operating_limits','facebook_group_plans','group_prepared_content'].every(name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));},
  audit(entityId: string, action: string, revision: number | null = null, detail: object = {}) {
    db.prepare('INSERT INTO content_workspace_audit(id,entity_id,action,revision,detail_json) VALUES (?,?,?,?,?)')
      .run(randomUUID(), entityId, action, revision, JSON.stringify(detail));
  },
  auditTrail(id: string) { return db.prepare('SELECT * FROM content_workspace_audit WHERE entity_id=? ORDER BY created_at,id').all(id); },
  videoMetadata(id: string) { return db.prepare('SELECT title,width,height,duration FROM videos WHERE id=?').get(id) as {title:string;width:number;height:number;duration:number}|undefined; },
  replyContext(accountId: string,commentId: string) {
    const comment=db.prepare("SELECT id,account_id,destination_id,content,parent_comment_id,external_comment_id,source FROM comments WHERE id=? AND account_id=? AND platform='facebook'").get(commentId,accountId) as any;
    if (!comment) return undefined;
    const post=comment.destination_id?db.prepare('SELECT caption FROM publishing_destinations WHERE id=? AND account_id=?').get(comment.destination_id,accountId) as any:null;
    const thread=db.prepare("SELECT content FROM comments WHERE account_id=? AND destination_id IS ? AND source='meta_graph_api' AND (parent_comment_id=? OR external_comment_id=?) ORDER BY created_time LIMIT 20").all(accountId,comment.destination_id,comment.parent_comment_id||comment.external_comment_id,comment.parent_comment_id||comment.external_comment_id) as {content:string}[];
    return {comment,post,thread};
  },
  profile(accountId: string): { profile: OwnerVoiceProfile; revision: number } {
    const row = db.prepare('SELECT profile_json,revision FROM owner_voice_profiles WHERE account_id=?').get(accountId) as any;
    return row ? { profile: JSON.parse(row.profile_json), revision: row.revision } : { profile: { ...provisionalVoice }, revision: 0 };
  },
  saveProfile(accountId: string, profile: OwnerVoiceProfile) {
    db.prepare(`INSERT INTO owner_voice_profiles(account_id,profile_json) VALUES (?,?)
      ON CONFLICT(account_id) DO UPDATE SET profile_json=excluded.profile_json, revision=owner_voice_profiles.revision+1, updated_at=datetime('now')`)
      .run(accountId, JSON.stringify(profile));
    this.audit(accountId, 'voice_profile_saved', this.profile(accountId).revision);
  },
  drafts(accountId?: string) {
    return accountId
      ? db.prepare('SELECT * FROM assistant_drafts WHERE account_id=? ORDER BY created_at DESC,rowid DESC').all(accountId) as AssistantDraftRow[]
      : db.prepare('SELECT * FROM assistant_drafts ORDER BY created_at DESC,rowid DESC LIMIT 200').all() as AssistantDraftRow[];
  },
  draft(id: string) { return db.prepare('SELECT * FROM assistant_drafts WHERE id=?').get(id) as AssistantDraftRow | undefined; },
  insertDraft(input: { accountId: string; kind: string; content: string; source: string; provider: string; context: object; flags: string[] }) {
    const id = `adraft-${randomUUID()}`;
    db.prepare(`INSERT INTO assistant_drafts(id,account_id,kind,content,source,provider,context_json,flags_json,destination_key) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, input.accountId, input.kind, input.content, input.source, input.provider, JSON.stringify(input.context), JSON.stringify(input.flags), `account:${input.accountId}`);
    this.audit(id, 'draft_created', 1, { source: input.source, provider: input.provider });
    return this.draft(id)!;
  },
  editDraft(id: string, revision: number, content: string, accountId: string) {
    const result = db.prepare(`UPDATE assistant_drafts SET content=?,account_id=?,destination_key=?,revision=revision+1,status='draft',approved_revision=NULL,updated_at=datetime('now') WHERE id=? AND revision=?`)
      .run(content, accountId, `account:${accountId}`, id, revision);
    if (!result.changes) throw new Error('Draft revision changed; reload before editing');
    this.audit(id, 'draft_edited_approval_invalidated', revision + 1); return this.draft(id)!;
  },
  review(id: string, revision: number, accountId: string, approve: boolean) {
    const result = db.prepare(`UPDATE assistant_drafts SET status=?,approved_revision=?,updated_at=datetime('now') WHERE id=? AND revision=? AND account_id=? AND destination_key=?`)
      .run(approve ? 'approved' : 'rejected', approve ? revision : null, id, revision, accountId, `account:${accountId}`);
    if (!result.changes) throw new Error('Exact draft revision and destination are required');
    this.audit(id, approve ? 'draft_approved' : 'draft_rejected', revision, { accountId }); return this.draft(id)!;
  },
  batchReview(items:{id:string;revision:number;accountId:string}[]) { return db.transaction(()=>items.map(item=>this.review(item.id,item.revision,item.accountId,true)))(); },
  limits() { return db.prepare('SELECT * FROM content_operating_limits WHERE id=1').get() as { paused: number; max_batch_size: number; daily_draft_limit: number }; },
  updateLimits(paused: boolean, batch: number, daily: number) {
    db.prepare('UPDATE content_operating_limits SET paused=?,max_batch_size=?,daily_draft_limit=? WHERE id=1').run(paused ? 1 : 0, batch, daily);
    this.audit('assistant_limits', 'limits_updated', null, { paused, batch, daily }); return this.limits();
  },
  generatedToday() { return (db.prepare("SELECT COUNT(*) count FROM assistant_drafts WHERE source IN ('provider','fixture') AND date(created_at)=date('now')").get() as any).count as number; },
  groups() { return db.prepare('SELECT * FROM facebook_group_plans ORDER BY created_at DESC,rowid DESC').all() as any[]; },
  group(id: string) { return db.prepare('SELECT * FROM facebook_group_plans WHERE id=?').get(id) as any; },
  saveGroup(id: string | undefined, input: { name: string; url: string; identityType: string; accountId: string | null; membership: string; category: string; notes: string; rules: string; rulesReviewedAt: string | null }) {
    const groupId = id || `group-${randomUUID()}`;
    db.prepare(`INSERT INTO facebook_group_plans(id,name,url,identity_type,account_id,membership,category,notes,rules,rules_reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,identity_type=excluded.identity_type,account_id=excluded.account_id,membership=excluded.membership,category=excluded.category,notes=excluded.notes,rules=excluded.rules,rules_reviewed_at=excluded.rules_reviewed_at,updated_at=datetime('now')`)
      .run(groupId,input.name,input.url,input.identityType,input.accountId,input.membership,input.category,input.notes,input.rules,input.rulesReviewedAt);
    this.audit(groupId, id ? 'group_updated_unverified' : 'group_registered_unverified'); return this.group(groupId);
  },
  prepared(groupId: string) { return db.prepare('SELECT * FROM group_prepared_content WHERE group_id=? ORDER BY created_at DESC,rowid DESC').all(groupId) as any[]; },
  preparedById(id: string) { return db.prepare('SELECT * FROM group_prepared_content WHERE id=?').get(id) as any; },
  prepare(groupId: string, kind: string, content: string, threadUrl: string | null) {
    const id = `gprep-${randomUUID()}`;
    db.prepare('INSERT INTO group_prepared_content(id,group_id,kind,content,thread_url) VALUES (?,?,?,?,?)').run(id,groupId,kind,content,threadUrl);
    this.audit(id, 'group_content_prepared'); return this.preparedById(id);
  },
  receipt(id: string, url: string, note: string) {
    // The first receipt is a legacy historical record. Corrections are appended in
    // group_receipt_events by the Groups service and must not rewrite this record.
    db.prepare("UPDATE group_prepared_content SET status='receipt_recorded_unverified',receipt_note=CASE WHEN receipt_url IS NULL THEN ? ELSE receipt_note END,receipt_url=COALESCE(receipt_url,?),updated_at=datetime('now') WHERE id=?").run(note,url,id);
    return this.preparedById(id);
  },
};
