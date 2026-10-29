import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const resetSafetyType = 'scc_content_reset_safety';
const safetyTypes = [resetSafetyType, 'test_data_deleted', 'media_render_pinned'];
export const disposableTables = [
  'group_reminder_states', 'group_receipt_events', 'group_prepared_content',
  'group_membership_observations', 'group_plan_extensions', 'facebook_group_plans',
  'publishing_attachments', 'post_metrics_snapshots', 'comments', 'analytics_snapshots',
  'sync_states', 'publishing_draft_audit', 'publishing_drafts', 'publishing_destinations',
  'publishing_posts', 'publishing_campaigns', 'branded_videos', 'videos', 'media_images', 'assistant_drafts',
] as const;
const protectedTables = ['accounts', 'account_identities', 'categories', 'oauth_sessions',
  'owner_voice_profiles', 'content_operating_limits'] as const;
const mixedTables = ['app_settings', 'content_workspace_audit', 'activity_events'];
const settingsPredicate = "key LIKE 'cleanup:%'";
// Preserve the durable per-comment submission key and the corresponding evidence.
// Provider ledger files are outside this module and are never touched.
// Delete reviewed disposable actions only. Unknown audit actions are retained
// conservatively because they may represent accounting or submission evidence.
const auditPredicate = "action IN ('draft_approved','draft_edited_approval_invalidated','group_content_prepared','group_handoff_context_saved','group_registered_unverified','manual_group_handoff_prepared','manual_group_receipt_recorded_unverified','voice_profile_saved','group_updated_unverified','draft_exported','draft_rejected','manual_reply_explicit_send_review')";
const activityPredicate = `type NOT IN (${safetyTypes.map(s => `'${s}'`).join(',')})`;
const predicates: Record<string, string> = { app_settings: settingsPredicate, content_workspace_audit: auditPredicate, activity_events: activityPredicate };
const expectedTriggers: Record<string, string> = Object.fromEntries([
  ['group_membership', 'group_membership_observations', 'Membership observations are append-only'],
  ['group_receipts', 'group_receipt_events', 'Group receipt history is append-only'],
].flatMap(([prefix, table, message]) => ['update','delete'].map(operation => [
  `${prefix}_no_${operation}`,
  `CREATE TRIGGER ${prefix}_no_${operation} BEFORE ${operation.toUpperCase()} ON ${table} BEGIN SELECT RAISE(ABORT,'${message}'); END`,
])));
const rows = (db: Database.Database, table: string, where = '1=1') =>
  db.prepare(`SELECT * FROM "${table}" WHERE ${where} ORDER BY rowid`).all();
const schema = (db: Database.Database) => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
export function verifyDatabase(db: Database.Database) {
  if (db.pragma('integrity_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('SQLite integrity or foreign-key verification failed');
}

export interface ResetPlan {
  version: 1;
  schemaFingerprint: string;
  fingerprint: string;
  tables: { table: string; before: number; remove: number; retain: number }[];
  protectedFingerprint: string;
  accountIdentities: { id: string; platform: string; account_type: string; external_id: string | null; status: string; archived: boolean; is_demo: number }[];
  awaitingManualIds: string[];
  triggersTemporarilySuspended: string[];
  mediaFilesRemoved: 0;
}

export function retainedFingerprint(db: Database.Database) {
  return digest(Object.fromEntries([...protectedTables, 'publishing_commands', ...mixedTables]
    .filter(table => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
    .map(table => [table, rows(db, table, predicates[table] ? `NOT (${predicates[table]})` : '1=1')
      // The newly appended reset receipt is validated separately.
      .filter((row: any) => table !== 'activity_events' || row.type !== resetSafetyType)])));
}

export function planContentReset(db: Database.Database): ResetPlan {
  verifyDatabase(db);
  if (db.pragma('foreign_keys', { simple: true }) !== 1) throw new Error('Foreign keys must remain enabled');
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[]).map(row => row.name);
  const known = [...disposableTables, ...protectedTables, ...mixedTables, 'publishing_commands'];
  if (tables.some(table => !known.includes(table)) || [...disposableTables, ...protectedTables, ...mixedTables].some(table => !tables.includes(table))) throw new Error('Unknown or incomplete SCC table inventory; review required');
  const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all() as {name:string;sql:string}[];
  if (triggers.length !== 4 || triggers.some(trigger => expectedTriggers[trigger.name] !== trigger.sql)) throw new Error('Append-only trigger definitions differ; review required');
  if (db.prepare("SELECT 1 FROM publishing_destinations WHERE status NOT IN ('draft','published','failed','cancelled','awaiting_confirmation') LIMIT 1").get()) throw new Error('Active or scheduled publishing requires reconciliation before reset');
  if (db.prepare("SELECT 1 FROM publishing_destinations WHERE status!='published' AND (remote_post_id IS NOT NULL OR submission_state IS NOT NULL) LIMIT 1").get()) throw new Error('Uncertain external submission requires reconciliation before reset');
  if (db.prepare("SELECT 1 FROM sync_states WHERE status='syncing' LIMIT 1").get()) throw new Error('Synchronization has not quiesced');
  if (db.prepare("SELECT 1 FROM oauth_sessions WHERE phase='exchanging' LIMIT 1").get()) throw new Error('OAuth exchange has not quiesced');
  const tablePlans = tables.map(table => {
    const before = rows(db, table).length;
    const remove = disposableTables.includes(table as any) ? before : predicates[table] ? rows(db, table, predicates[table]).length : 0;
    return { table, before, remove, retain: before - remove };
  });
  return {
    version: 1, schemaFingerprint: digest(schema(db)),
    fingerprint: digest(tables.map(table => [table, rows(db, table)])),
    protectedFingerprint: retainedFingerprint(db), tables: tablePlans,
    accountIdentities: (rows(db, 'accounts') as any[]).map(a => ({id:a.id,platform:a.platform,account_type:a.account_type,external_id:a.external_id,status:a.status,archived:!!a.archived_at,is_demo:a.is_demo})),
    awaitingManualIds: (rows(db,'publishing_destinations',"status='awaiting_confirmation'") as any[]).map(d => d.id).sort(),
    triggersTemporarilySuspended: ['group_membership_no_delete','group_receipts_no_delete'], mediaFilesRemoved: 0,
  };
}

export function resetContent(db: Database.Database, expected: ResetPlan, provenance: { commit: string; backupSha256: string; receiptId: string }) {
  if (!/^[a-f0-9]{40}$/.test(provenance.commit) || !/^[a-f0-9]{64}$/.test(provenance.backupSha256) || !/^reset-[a-f0-9-]+$/.test(provenance.receiptId)) throw new Error('Committed source and verified backup provenance are required');
  return db.transaction(() => {
    const actual = planContentReset(db);
    if (actual.fingerprint !== expected.fingerprint || actual.schemaFingerprint !== expected.schemaFingerprint) throw new Error('Reset inventory changed; no records deleted');
    const destinations = rows(db, 'publishing_destinations') as Record<string,unknown>[];
    const evidenceFields = ['id','post_id','account_id','platform','status','remote_post_id','remote_post_url','published_url','permalink','submission_state','submission_intent_at','confirmation_source','confirmed_at','created_at','updated_at','published_at','error_message'];
    const evidence = destinations.map(d => ({...Object.fromEntries(Object.keys(d).filter(key => evidenceFields.includes(key) || /^(submission_|remote_|verification_|confirmation_)/.test(key)).map(key => [key,d[key]])),originalRowFingerprint:digest(d)}));
    const evidenceBody = {version:1,kind:'owner_authorized_content_reset',...provenance,previousFingerprint:actual.fingerprint,
      awaitingManualIds:actual.awaitingManualIds, destinations:evidence, outcomesUnchanged:true, automaticReplayAllowed:false};
    const receipt = {...evidenceBody,checksum:digest(evidenceBody)};
    for (const name of actual.triggersTemporarilySuspended) db.exec(`DROP TRIGGER "${name}"`);
    // Each child table is explicitly emptied before its parents. FKs are never disabled.
    for (const table of disposableTables) db.prepare(`DELETE FROM "${table}"`).run();
    for (const table of mixedTables) db.prepare(`DELETE FROM "${table}" WHERE ${predicates[table]}`).run();
    for (const name of actual.triggersTemporarilySuspended) db.exec(expectedTriggers[name]);
    db.prepare('INSERT INTO activity_events(id,type,title,message,severity,metadata_json) VALUES(?,?,?,?,?,?)')
      .run(provenance.receiptId,resetSafetyType,'Owner-authorized SCC content reset','Publication evidence retained. Unresolved manual handoffs remain unverified; no replay is authorized.','warning',JSON.stringify(receipt));
    verifyDatabase(db);
    if (retainedFingerprint(db) !== actual.protectedFingerprint || digest(schema(db)) !== actual.schemaFingerprint) throw new Error('Protected account/configuration rows or schema changed');
    for (const table of disposableTables) if (rows(db,table).length) throw new Error('Disposable rows remain: '+table);
    return {receiptId:provenance.receiptId,deleted:actual.tables.map(t=>({table:t.table,count:t.remove})),after:tableCounts(db),protectedFingerprint:retainedFingerprint(db),integrity:'ok',foreignKeyViolations:0,mediaFilesRemoved:0};
  }).immediate();
}

export function tableCounts(db: Database.Database) {
  return Object.fromEntries((db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[])
    .map(({name}) => [name, (db.prepare(`SELECT COUNT(*) n FROM "${name}"`).get() as {n:number}).n]));
}

/** Only a complete, checksum-verified retirement receipt can replace the historical hold allowlist. */
export function retiredManualIds(db: Database.Database): string[] {
  const result = new Set<string>();
  for (const row of db.prepare('SELECT metadata_json FROM activity_events WHERE type=?').all(resetSafetyType) as {metadata_json:string}[]) {
    const parsed = JSON.parse(row.metadata_json), {checksum,...body} = parsed;
    if (digest(body) !== checksum || body.version !== 1 || body.kind !== 'owner_authorized_content_reset' || body.automaticReplayAllowed !== false || body.outcomesUnchanged !== true || !/^[a-f0-9]{40}$/.test(body.commit) || !/^[a-f0-9]{64}$/.test(body.backupSha256)) throw new Error('Invalid reset safety receipt');
    for (const id of body.awaitingManualIds) {
      if (!body.destinations.some((d:any) => d.id === id && d.status === 'awaiting_confirmation' && d.account_id && d.post_id)) throw new Error('Incomplete manual handoff retirement evidence');
      result.add(id);
    }
  }
  return [...result].sort();
}
