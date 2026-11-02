import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const APPLICATION_ID = 0x53434147;

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  }
  throw new Error('Expected JSON data without undefined or non-finite values.');
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export interface AgentJob {
  id: string;
  inputHash: string;
  input: unknown;
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type OperationStatus = 'pending' | 'succeeded' | 'rejected' | 'uncertain';
export interface AgentOperation {
  jobId: string;
  step: string;
  requestHash: string;
  request: unknown;
  status: OperationStatus;
  response: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeInput {
  id?: string;
  kind: 'observation' | 'assumption';
  accountId?: string;
  resourceId?: string;
  text: string;
  source?: string;
  evidence?: unknown;
}
export interface AgentKnowledge extends Omit<KnowledgeInput, 'id' | 'accountId' | 'resourceId' | 'source' | 'evidence'> {
  id: string;
  accountId: string | null;
  resourceId: string | null;
  source: string | null;
  evidence: unknown;
  createdAt: string;
}

function required(value: string, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + field + '.');
  return value;
}
function bound(value: number | undefined): number {
  return Math.min(100, Math.max(1, Number.isFinite(value) ? Math.trunc(value!) : 20));
}

/** Independent, durable agent receipts. This module never opens the application's database. */
export class AgentStore {
  private db: Database.Database;

  constructor(filename: string) {
    if (filename === ':memory:') throw new Error('Agent state must use a durable sidecar file.');
    const resolved = path.resolve(filename);
    if (existsSync(resolved)) {
      // Identify first, before opening for writes or changing journal mode.
      const probe = new Database(resolved, { readonly: true, fileMustExist: true });
      try {
        if (probe.pragma('application_id', { simple: true }) !== APPLICATION_ID) {
          throw new Error('Refusing a database that is not an agent sidecar.');
        }
      } finally { probe.close(); }
    }
    mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new Database(resolved);
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      PRAGMA application_id = ${APPLICATION_ID};
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, input_json TEXT NOT NULL,
        state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS operations (
        job_id TEXT NOT NULL REFERENCES jobs(id), step TEXT NOT NULL, request_hash TEXT NOT NULL,
        request_json TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending','succeeded','rejected','uncertain')),
        response_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(job_id,step)
      );
      CREATE TABLE IF NOT EXISTS knowledge (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('observation','assumption')),
        account_id TEXT, resource_id TEXT, text TEXT NOT NULL, source TEXT, evidence_json TEXT,
        created_at TEXT NOT NULL, input_hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_context ON knowledge(account_id,resource_id,created_at);
    `);
    // Only marked agent sidecars reach this point. Historical requests cannot be reconstructed.
    const columns = this.db.pragma('table_info(operations)') as { name: string }[];
    if (!columns.some(column => column.name === 'request_json')) this.db.exec('ALTER TABLE operations ADD COLUMN request_json TEXT');
  }

  createJob(id: string, input: unknown): AgentJob {
    required(id, 'job id');
    const hash = stableHash(input);
    this.db.transaction(() => {
      const now = new Date().toISOString();
      this.db.prepare('INSERT OR IGNORE INTO jobs VALUES (?,?,?,?,?,?)').run(id, hash, canonical(input), '{}', now, now);
      if (this.getJob(id)!.inputHash !== hash) throw new Error('Job id already belongs to different input.');
    }).immediate();
    return this.getJob(id)!;
  }

  getJob(id: string): AgentJob | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as Record<string, string> | undefined;
    return row ? { id: row.id, inputHash: row.input_hash, input: JSON.parse(row.input_json), state: JSON.parse(row.state_json), createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  listJobs(limit?: number): AgentJob[] {
    const rows = this.db.prepare('SELECT id FROM jobs ORDER BY created_at DESC,id LIMIT ?').all(bound(limit)) as { id: string }[];
    return rows.map(row => this.getJob(row.id)!);
  }

  updateState(id: string, state: Record<string, unknown>): AgentJob {
    const result = this.db.prepare('UPDATE jobs SET state_json=?,updated_at=? WHERE id=?').run(canonical(state), new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error('Unknown job id.');
    return this.getJob(id)!;
  }

  patchState(id: string, patch: Record<string, unknown>): AgentJob {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (!job) throw new Error('Unknown job id.');
      return this.updateState(id, { ...job.state, ...patch });
    }).immediate();
  }

  getOperation(jobId: string, step: string): AgentOperation | null {
    const row = this.db.prepare('SELECT * FROM operations WHERE job_id=? AND step=?').get(jobId, step) as Record<string, string> | undefined;
    return row ? { jobId: row.job_id, step: row.step, requestHash: row.request_hash, request: row.request_json == null ? null : JSON.parse(row.request_json), status: row.status as OperationStatus, response: row.response_json === null ? null : JSON.parse(row.response_json), createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  claimOperation(jobId: string, step: string, request: unknown): { claimed: boolean; operation: AgentOperation } {
    required(step, 'operation step');
    const hash = stableHash(request);
    return this.db.transaction(() => {
      const existing = this.getOperation(jobId, step);
      if (existing) {
        if (existing.requestHash !== hash) throw new Error('Operation step already belongs to a different request.');
        return { claimed: false, operation: existing };
      }
      const now = new Date().toISOString();
      this.db.prepare('INSERT INTO operations (job_id,step,request_hash,request_json,status,response_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(jobId, step, hash, canonical(request), 'pending', null, now, now);
      return { claimed: true, operation: this.getOperation(jobId, step)! };
    }).immediate();
  }

  finishOperation(jobId: string, step: string, status: Exclude<OperationStatus, 'pending'>, response: unknown): AgentOperation {
    if (!['succeeded', 'rejected', 'uncertain'].includes(status)) throw new Error('Invalid operation status.');
    this.db.transaction(() => {
      const existing = this.getOperation(jobId, step);
      if (!existing) throw new Error('Operation must be claimed before completion.');
      if (existing.status === 'succeeded' || existing.status === 'rejected') {
        if (existing.status !== status || stableHash(existing.response) !== stableHash(response)) throw new Error('Terminal operation receipt is immutable.');
        return;
      }
      this.db.prepare('UPDATE operations SET status=?,response_json=?,updated_at=? WHERE job_id=? AND step=?').run(status, canonical(response), new Date().toISOString(), jobId, step);
    }).immediate();
    return this.getOperation(jobId, step)!;
  }

  recordKnowledge(input: KnowledgeInput): AgentKnowledge {
    if (!['observation', 'assumption'].includes(input.kind)) throw new Error('Knowledge kind must be observation or assumption.');
    required(input.text, 'knowledge text', 4000);
    if (input.kind === 'observation' && !input.source?.trim()) throw new Error('Observations require an explicit source.');
    const id = input.id ? required(input.id, 'knowledge id') : randomUUID();
    const value = { kind: input.kind, text: input.text, accountId: input.accountId ?? null, resourceId: input.resourceId ?? null, source: input.source ?? null, evidence: input.evidence ?? null };
    const hash = stableHash(value);
    this.db.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO knowledge VALUES (?,?,?,?,?,?,?,?,?)').run(id, input.kind, value.accountId, value.resourceId, input.text, value.source, canonical(value.evidence), new Date().toISOString(), hash);
      const existing = this.db.prepare('SELECT input_hash FROM knowledge WHERE id=?').get(id) as { input_hash: string };
      if (existing.input_hash !== hash) throw new Error('Knowledge id already belongs to a different entry.');
    }).immediate();
    return this.readKnowledge(this.db.prepare('SELECT * FROM knowledge WHERE id=?').get(id) as Record<string, string>);
  }

  listKnowledge(options: { accountId?: string; resourceId?: string; limit?: number } = {}): AgentKnowledge[] {
    const clauses: string[] = [];
    const args: (string | number)[] = [];
    if (options.accountId) { clauses.push('account_id=?'); args.push(options.accountId); }
    if (options.resourceId) { clauses.push('resource_id=?'); args.push(options.resourceId); }
    args.push(bound(options.limit));
    return (this.db.prepare('SELECT * FROM knowledge' + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') + ' ORDER BY created_at DESC,id LIMIT ?').all(...args) as Record<string, string>[]).map(row => this.readKnowledge(row));
  }

  private readKnowledge(row: Record<string, string>): AgentKnowledge {
    return { id: row.id, kind: row.kind as AgentKnowledge['kind'], accountId: row.account_id, resourceId: row.resource_id, text: row.text, source: row.source, evidence: JSON.parse(row.evidence_json), createdAt: row.created_at };
  }

  close(): void { this.db.close(); }
}
