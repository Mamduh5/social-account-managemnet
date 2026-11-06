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
      CREATE TABLE IF NOT EXISTS agent_work (
        id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        priority INTEGER NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_work_history (
        task_id TEXT NOT NULL REFERENCES agent_work(id), revision INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL, PRIMARY KEY(task_id,revision)
      );
      CREATE TABLE IF NOT EXISTS agent_work_commands (
        id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, response_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_generation_observations (
        run_id TEXT NOT NULL REFERENCES jobs(id), sequence INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL, PRIMARY KEY(run_id,sequence)
      );
      CREATE TABLE IF NOT EXISTS agent_provider_claims (
        scope TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES jobs(id)
      );
      CREATE TABLE IF NOT EXISTS agent_runner_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agent_runner_sessions (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES agent_work(id),
        status TEXT NOT NULL, started_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runner_sessions ON agent_runner_sessions(status,started_at);
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

  jobOperations(jobId:string):AgentOperation[]{
    return (this.db.prepare('SELECT step FROM operations WHERE job_id=? ORDER BY step').all(jobId) as {step:string}[]).map(row=>this.getOperation(jobId,row.step)!);
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

  listKnowledge(options: { accountId?: string | null; resourceId?: string; limit?: number } = {}): AgentKnowledge[] {
    const clauses: string[] = [];
    const args: (string | number)[] = [];
    if (options.accountId===null) clauses.push('account_id IS NULL');
    else if (options.accountId) { clauses.push('account_id=?'); args.push(options.accountId); }
    if (options.resourceId) { clauses.push('resource_id=?'); args.push(options.resourceId); }
    args.push(bound(options.limit));
    return (this.db.prepare('SELECT * FROM knowledge' + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') + ' ORDER BY created_at DESC,id LIMIT ?').all(...args) as Record<string, string>[]).map(row => this.readKnowledge(row));
  }

  private readKnowledge(row: Record<string, string>): AgentKnowledge {
    return { id: row.id, kind: row.kind as AgentKnowledge['kind'], accountId: row.account_id, resourceId: row.resource_id, text: row.text, source: row.source, evidence: JSON.parse(row.evidence_json), createdAt: row.created_at };
  }

  /** Serializes local work claims/receipts; never holds a transaction across network calls. */
  transaction<T>(action:()=>T):T { return this.db.transaction(action).immediate(); }

  getWork(id:string):Record<string,any>|null {
    const row=this.db.prepare('SELECT snapshot_json FROM agent_work WHERE id=?').get(id) as {snapshot_json:string}|undefined;
    return row?JSON.parse(row.snapshot_json):null;
  }
  addWork(id:string,input:unknown,snapshot:Record<string,any>):Record<string,any> {
    return this.transaction(()=>{
      const hash=stableHash(input),row=this.db.prepare('SELECT input_hash FROM agent_work WHERE id=?').get(id) as {input_hash:string}|undefined;
      if(row) {if(row.input_hash!==hash)throw new Error('Task ID belongs to different input');return this.getWork(id)!;}
      this.db.prepare('INSERT INTO agent_work VALUES (?,?,?,?,?,?)').run(id,hash,canonical(snapshot),snapshot.priority,snapshot.status,snapshot.updatedAt);
      this.db.prepare('INSERT INTO agent_work_history VALUES (?,?,?)').run(id,snapshot.revision,canonical(snapshot));
      return snapshot;
    });
  }
  saveWork(snapshot:Record<string,any>):Record<string,any> {
    this.db.prepare('UPDATE agent_work SET snapshot_json=?,status=?,updated_at=? WHERE id=?').run(canonical(snapshot),snapshot.status,snapshot.updatedAt,snapshot.id);
    this.db.prepare('INSERT INTO agent_work_history VALUES (?,?,?)').run(snapshot.id,snapshot.revision,canonical(snapshot));
    return snapshot;
  }
  listWork(limit=20,offset=0):Record<string,any>[] {
    return (this.db.prepare('SELECT snapshot_json FROM agent_work ORDER BY priority DESC,id LIMIT ? OFFSET ?').all(bound(limit),offset) as {snapshot_json:string}[]).map(row=>JSON.parse(row.snapshot_json));
  }
  workCount():number {return (this.db.prepare('SELECT count(*) n FROM agent_work').get() as {n:number}).n;}
  workCandidates():Record<string,any>[] {
    return (this.db.prepare("SELECT snapshot_json FROM agent_work WHERE status IN ('ready','claimed') ORDER BY priority DESC,id").all() as {snapshot_json:string}[]).map(row=>JSON.parse(row.snapshot_json));
  }
  workHistory(id:string,limit=20):unknown[] {
    return (this.db.prepare('SELECT snapshot_json FROM agent_work_history WHERE task_id=? ORDER BY revision DESC LIMIT ?').all(id,bound(limit)) as {snapshot_json:string}[]).map(row=>JSON.parse(row.snapshot_json));
  }
  workCommand(id:string,request:unknown,action:()=>Record<string,any>):Record<string,any> {
    return this.transaction(()=>{
      required(id,'work command id');const hash=stableHash(request);
      const row=this.db.prepare('SELECT request_hash,response_json FROM agent_work_commands WHERE id=?').get(id) as {request_hash:string;response_json:string}|undefined;
      if(row){if(row.request_hash!==hash)throw new Error('Command ID belongs to different input');return JSON.parse(row.response_json);}
      const response=action();this.db.prepare('INSERT INTO agent_work_commands VALUES (?,?,?)').run(id,hash,canonical(response));return response;
    });
  }
  generationSnapshot(id:string):Record<string,any>|null {
    const row=this.db.prepare('SELECT snapshot_json FROM agent_generation_observations WHERE run_id=? ORDER BY sequence DESC LIMIT 1').get(id) as {snapshot_json:string}|undefined;
    return row?JSON.parse(row.snapshot_json):null;
  }
  recordGeneration(id:string,snapshot:Record<string,any>):Record<string,any> {
    return this.transaction(()=>{
      const latest=this.generationSnapshot(id);
      if(latest&&Date.parse(latest.checkedAt)>Date.parse(snapshot.checkedAt))return latest;
      const seq=(this.db.prepare('SELECT COALESCE(MAX(sequence),0)+1 n FROM agent_generation_observations WHERE run_id=?').get(id) as {n:number}).n;
      const saved={...snapshot,sequence:seq};
      this.db.prepare('INSERT INTO agent_generation_observations VALUES (?,?,?)').run(id,seq,canonical(saved));
      if(snapshot.condition==='completed'&&latest?.condition!=='completed')this.setRunnerState('wake',snapshot.checkedAt);
      return saved;
    });
  }
  generationHistory(id:string,limit=10):Record<string,any>[] {
    return (this.db.prepare('SELECT snapshot_json FROM agent_generation_observations WHERE run_id=? ORDER BY sequence DESC LIMIT ?').all(id,bound(limit)) as {snapshot_json:string}[]).map(row=>JSON.parse(row.snapshot_json));
  }
  reserveProvider(scope:string,id:string):boolean {
    return this.transaction(()=>{
      const row=this.db.prepare('SELECT run_id FROM agent_provider_claims WHERE scope=?').get(scope) as {run_id:string}|undefined;
      if(row)return row.run_id===id;
      this.db.prepare('INSERT INTO agent_provider_claims VALUES (?,?)').run(scope,id);return true;
    });
  }
  providerOwner(scope:string):string|null {
    return (this.db.prepare('SELECT run_id FROM agent_provider_claims WHERE scope=?').get(scope) as {run_id:string}|undefined)?.run_id??null;
  }
  providerClaims():Array<{scope:string;runId:string}> {
    return (this.db.prepare('SELECT scope,run_id FROM agent_provider_claims').all() as {scope:string;run_id:string}[]).map(row=>({scope:row.scope,runId:row.run_id}));
  }
  releaseProvider(scope:string,id:string):void {this.db.prepare('DELETE FROM agent_provider_claims WHERE scope=? AND run_id=?').run(scope,id);}

  runnerState<T=any>(key:string):T|null {
    const row=this.db.prepare('SELECT value_json FROM agent_runner_state WHERE key=?').get(key) as {value_json:string}|undefined;
    return row?JSON.parse(row.value_json):null;
  }
  setRunnerState(key:string,value:unknown):void {
    this.db.prepare('INSERT INTO agent_runner_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key,canonical(value));
  }
  runnerSession(id:string):Record<string,any>|null {
    const row=this.db.prepare('SELECT snapshot_json FROM agent_runner_sessions WHERE id=?').get(id) as {snapshot_json:string}|undefined;
    return row?JSON.parse(row.snapshot_json):null;
  }
  saveRunnerSession(row:Record<string,any>):void {
    this.db.prepare('INSERT INTO agent_runner_sessions VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,snapshot_json=excluded.snapshot_json').run(row.id,row.taskId,row.status,row.startedAt,canonical(row));
  }
  runnerSessions(options:{since?:string;active?:boolean;taskId?:string;status?:string;limit?:number}={}):Record<string,any>[] {
    const clauses:string[]=[],args:(string|number)[]=[];
    if(options.since){clauses.push('started_at>=?');args.push(options.since);}
    if(options.active)clauses.push("status IN ('reserved','running')");
    if(options.taskId){clauses.push('task_id=?');args.push(options.taskId);}
    if(options.status){clauses.push('status=?');args.push(options.status);}
    args.push(options.limit??1000);
    return (this.db.prepare('SELECT snapshot_json FROM agent_runner_sessions'+(clauses.length?' WHERE '+clauses.join(' AND '):'')+' ORDER BY started_at DESC,id DESC LIMIT ?').all(...args) as {snapshot_json:string}[]).map(row=>JSON.parse(row.snapshot_json));
  }
  workStatusCounts():Record<string,number> {
    return Object.fromEntries((this.db.prepare('SELECT status,count(*) n FROM agent_work GROUP BY status').all() as {status:string;n:number}[]).map(row=>[row.status,row.n]));
  }
  close(): void { this.db.close(); }
}
