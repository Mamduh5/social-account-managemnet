import type Database from 'better-sqlite3';
import { canonicalGroupIdentity, defaultGroupEligibility, groupMembershipStatuses } from '../domain/groups.js';
import { snapshotOriginalTables, assertOriginalTablesPreserved, type TableProjection } from './v111-migration.js';

const requiredColumns: Record<string, string[]> = {
  group_plan_extensions: ['group_id', 'canonical_key', 'canonical_url', 'original_url', 'acting_page_id', 'shortlisted', 'archived_at', 'reviewed_at', 'eligibility_json', 'revision', 'legacy_duplicate'],
  group_membership_observations: ['id', 'group_id', 'account_id', 'status', 'observed_at', 'notes', 'source', 'verified', 'created_at'],
  group_receipt_events: ['id', 'prepared_id', 'url', 'note', 'source', 'verified', 'recorded_at', 'supersedes_id'],
  group_reminder_states: ['prepared_id', 'state', 'note', 'updated_at'],
};
const appendOnlyTriggers = ['group_membership_no_update', 'group_membership_no_delete', 'group_receipts_no_update', 'group_receipts_no_delete'];
const columns = (db: Database.Database, table: string) => new Set((db.prepare('PRAGMA table_info(' + table + ')').all() as { name: string }[]).map(row => row.name));

/** Fail closed for an existing installation until explicit offline maintenance has completed. */
export function groupsSchemaReady(db: Database.Database): boolean {
  for (const [table, expected] of Object.entries(requiredColumns)) {
    const present = columns(db, table);
    if (!expected.every(column => present.has(column))) return false;
  }
  const index = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_group_active_page_identity'").get() as { sql: string } | undefined;
  if (!index || !/CREATE\s+UNIQUE\s+INDEX/i.test(index.sql) || !/canonical_key\s*,\s*acting_page_id/i.test(index.sql) || !/WHERE\s+archived_at\s+IS\s+NULL/i.test(index.sql) || !/legacy_duplicate\s*=\s*0/i.test(index.sql)) return false;
  const indexInfo = db.prepare('PRAGMA index_list(group_plan_extensions)').all() as { name: string; unique: number; partial: number }[];
  if (!indexInfo.some(row => row.name === 'idx_group_active_page_identity' && row.unique === 1 && row.partial === 1)) return false;
  for (const [name, table, expected] of [
    ['idx_group_membership_history', 'group_membership_observations', ['group_id', 'created_at', 'id']],
    ['idx_group_receipt_history', 'group_receipt_events', ['prepared_id', 'recorded_at', 'id']],
  ] as const) {
    const historyIndex = db.prepare("SELECT tbl_name FROM sqlite_master WHERE type='index' AND name=?").get(name) as { tbl_name: string } | undefined;
    const fields = (db.prepare('PRAGMA index_info(' + name + ')').all() as { name: string }[]).map(row => row.name);
    if (historyIndex?.tbl_name !== table || fields.join(',') !== expected.join(',')) return false;
  }
  if (!appendOnlyTriggers.every(name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name))) return false;
  return !db.prepare('SELECT 1 FROM facebook_group_plans g LEFT JOIN group_plan_extensions e ON e.group_id=g.id WHERE e.group_id IS NULL LIMIT 1').get();
}

function assertPrerequisites(db: Database.Database) {
  const expected: Record<string, string[]> = {
    accounts: ['id'],
    facebook_group_plans: ['id', 'url', 'identity_type', 'account_id', 'membership', 'created_at'],
    group_prepared_content: ['id', 'group_id', 'receipt_url', 'receipt_note', 'created_at', 'updated_at'],
    content_workspace_audit: ['id', 'entity_id', 'action', 'detail_json'],
  };
  for (const [table, fields] of Object.entries(expected)) {
    const present = columns(db, table);
    if (!fields.every(field => present.has(field))) throw new Error('The existing Groups Planning workspace is required before Groups maintenance');
  }
}

/** Add only new tables; do not rewrite existing plans, handoffs, receipts, or audit events. */
export function initializeGroupsSchema(db: Database.Database): void {
  assertPrerequisites(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_plan_extensions (
      group_id TEXT PRIMARY KEY REFERENCES facebook_group_plans(id),
      canonical_key TEXT, canonical_url TEXT, original_url TEXT NOT NULL,
      acting_page_id TEXT REFERENCES accounts(id),
      shortlisted INTEGER NOT NULL DEFAULT 0 CHECK(shortlisted IN (0,1)),
      archived_at TEXT, reviewed_at TEXT, eligibility_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
      legacy_duplicate INTEGER NOT NULL DEFAULT 0 CHECK(legacy_duplicate IN (0,1))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_group_active_page_identity
      ON group_plan_extensions(canonical_key, acting_page_id)
      WHERE archived_at IS NULL AND canonical_key IS NOT NULL AND acting_page_id IS NOT NULL AND legacy_duplicate=0;
    CREATE TABLE IF NOT EXISTS group_membership_observations (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES facebook_group_plans(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      status TEXT NOT NULL CHECK(status IN ('unknown','not_member','request_pending','member','admin','request_rejected','request_withdrawn','participation_restricted')),
      observed_at TEXT, notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'owner_entered' CHECK(source='owner_entered'),
      verified INTEGER NOT NULL DEFAULT 0 CHECK(verified=0),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_group_membership_history ON group_membership_observations(group_id, created_at, id);
    CREATE TABLE IF NOT EXISTS group_receipt_events (
      id TEXT PRIMARY KEY, prepared_id TEXT NOT NULL REFERENCES group_prepared_content(id),
      url TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'owner_entered' CHECK(source='owner_entered'),
      verified INTEGER NOT NULL DEFAULT 0 CHECK(verified=0), recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      supersedes_id TEXT REFERENCES group_receipt_events(id)
    );
    CREATE INDEX IF NOT EXISTS idx_group_receipt_history ON group_receipt_events(prepared_id, recorded_at, id);
    CREATE TABLE IF NOT EXISTS group_reminder_states (
      prepared_id TEXT PRIMARY KEY REFERENCES group_prepared_content(id),
      state TEXT NOT NULL CHECK(state IN ('active','cancelled','dismissed')),
      note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS group_membership_no_update BEFORE UPDATE ON group_membership_observations BEGIN SELECT RAISE(ABORT,'Membership observations are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS group_membership_no_delete BEFORE DELETE ON group_membership_observations BEGIN SELECT RAISE(ABORT,'Membership observations are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS group_receipts_no_update BEFORE UPDATE ON group_receipt_events BEGIN SELECT RAISE(ABORT,'Group receipt history is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS group_receipts_no_delete BEFORE DELETE ON group_receipt_events BEGIN SELECT RAISE(ABORT,'Group receipt history is append-only'); END;
  `);
  const plans = db.prepare('SELECT id,url,identity_type,account_id,membership,created_at FROM facebook_group_plans ORDER BY id').all() as { id: string; url: string; identity_type: string; account_id: string | null; membership: string; created_at: string }[];
  const normalized = plans.map(plan => {
    let canonical: ReturnType<typeof canonicalGroupIdentity> | null = null;
    try { canonical = canonicalGroupIdentity(plan.url); } catch { /* Preserve unsupported legacy URLs for owner review. */ }
    return { plan, canonical, actor: plan.identity_type === 'page' ? plan.account_id : null };
  });
  const identityCounts = new Map<string, number>();
  for (const { canonical, actor } of normalized) if (canonical && actor) {
    const key = JSON.stringify([canonical.canonicalKey, actor]); identityCounts.set(key, (identityCounts.get(key) || 0) + 1);
  }
  const insertExtension = db.prepare('INSERT OR IGNORE INTO group_plan_extensions(group_id,canonical_key,canonical_url,original_url,acting_page_id,eligibility_json,legacy_duplicate) VALUES (?,?,?,?,?,?,?)');
  const insertObservation = db.prepare('INSERT OR IGNORE INTO group_membership_observations(id,group_id,account_id,status,observed_at,notes,created_at) VALUES (?,?,?,?,NULL,?,?)');
  for (const { plan, canonical, actor } of normalized) {
    const legacyDuplicate = canonical && actor && (identityCounts.get(JSON.stringify([canonical.canonicalKey, actor])) || 0) > 1;
    insertExtension.run(plan.id, canonical?.canonicalKey || null, canonical?.canonicalUrl || null, plan.url, actor, JSON.stringify(defaultGroupEligibility()), legacyDuplicate ? 1 : 0);
    if (actor) {
      const status = (groupMembershipStatuses as readonly string[]).includes(plan.membership) ? plan.membership : 'unknown';
      insertObservation.run('legacy-membership:' + plan.id, plan.id, actor, status, 'Imported legacy owner-entered status; the actual observation date was not recorded. Facebook verification is unavailable.', plan.created_at);
    }
  }
  const receipts = db.prepare('SELECT id,receipt_url,receipt_note,created_at,updated_at FROM group_prepared_content WHERE receipt_url IS NOT NULL').all() as { id: string; receipt_url: string; receipt_note: string | null; created_at: string; updated_at: string }[];
  const insertReceipt = db.prepare('INSERT OR IGNORE INTO group_receipt_events(id,prepared_id,url,note,recorded_at) VALUES (?,?,?,?,?)');
  for (const receipt of receipts) insertReceipt.run('legacy-receipt:' + receipt.id, receipt.id, receipt.receipt_url, receipt.receipt_note || '', receipt.updated_at || receipt.created_at);
}

function assertIntegrity(db: Database.Database) {
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Groups database integrity validation failed');
  if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Groups database foreign-key validation failed');
}
export interface GroupsMigrationResult {
  alreadyReady: boolean; groupsReady: true; integrity: 'ok'; foreignKeyViolations: 0;
  allOriginalRowsPreserved: true; originalTables: TableProjection[];
  planCount: number; legacyDuplicateCount: number; legacyUnresolvedIdentityCount: number;
}

/** Explicit offline migration; the caller must enforce backup, maintenance and release gates. */
export function migrateGroupsDatabase(db: Database.Database, validateBeforeCommit?: (database: Database.Database) => void): GroupsMigrationResult {
  if (db.inTransaction) throw new Error('Groups migration requires its own transaction');
  assertPrerequisites(db); assertIntegrity(db);
  return db.transaction((): GroupsMigrationResult => {
    const before = snapshotOriginalTables(db); const alreadyReady = groupsSchemaReady(db);
    if (!alreadyReady) initializeGroupsSchema(db);
    validateBeforeCommit?.(db);
    assertOriginalTablesPreserved(db, before);
    if (!groupsSchemaReady(db)) throw new Error('Groups schema is incomplete');
    assertIntegrity(db);
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    return { alreadyReady, groupsReady: true, integrity: 'ok', foreignKeyViolations: 0, allOriginalRowsPreserved: true,
      originalTables: before, planCount: count('SELECT count(*) n FROM facebook_group_plans'),
      legacyDuplicateCount: count('SELECT count(*) n FROM group_plan_extensions WHERE legacy_duplicate=1'),
      legacyUnresolvedIdentityCount: count('SELECT count(*) n FROM group_plan_extensions WHERE canonical_key IS NULL') };
  })();
}
