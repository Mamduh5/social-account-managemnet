import { ApiError, type JsonClient } from './http.js';

export interface PipelineCreateInput {
  title: string;
  idea?: string;
  prompt?: string;
  sceneCount?: number;
  aspectRatio?: string;
}

export interface GeminiQueueRequest {
  title: string;
  idea: string;
  scene_count: number;
  aspect_ratio: '9:16' | '16:9';
  generation_settings: { version: 'generation_settings.v1'; mode: 'dense_performance'; performance_tempo: 2 };
}

type Detail = { code?: string; message?: string; next_retry_at?: string };
interface ProjectResponse {
  created_at?: string;
  updated_at?: string;
  error?: string;
  scenes?: Array<{order:number;status:string;clip_url?:string}>;
  id?: string;
  title?: string;
  topic?: string;
  provider?: string;
  autopilot?: { provider?: string; review_status?: string };
  status?: string;
  display_status?: string;
  current_step?: string;
  scene_count?: number;
  accepted_count?: number;
  scene_seconds?: number;
  aspect_ratio?: string;
  generation_settings?: { version?: string; mode?: string; performance_tempo?: number };
  generation_resolution?: string;
  acceptance_type?: string;
  video_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  next_automatic_at?: string;
  diagnostic?: Detail;
  blockers?: Detail[];
  next_action?: { type?: string; background?: boolean };
}

export interface PipelineStatus {
  projectId: string;
  provider: 'gemini_web';
  state: string;
  displayStatus: string | null;
  step: string | null;
  progress: { accepted: number | null; total: number | null };
  blockers: { code: string; message: string | null; nextRetryAt: string | null }[];
  nextAutomaticAt: string | null;
  background: boolean;
  media: {
    videoUrl: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    aspectRatio: string | null;
    resolution: string | null;
    acceptanceType: string | null;
    creativeReview: string | null;
  };
}

const states = new Set(['pending', 'running', 'completed', 'failed', 'awaiting_external_generation', 'awaiting_review', 'awaiting_human_decision', 'conformance_attention_required']);
function projectPath(id: string): string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw new Error('Invalid Pipeline project ID.');
  return '/scene-video-jobs/' + encodeURIComponent(id);
}
function text(value: unknown, limit = 240): string | null {
  return typeof value === 'string' && value.length ? value.slice(0, limit) : null;
}
function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Exact text-only creation contract; no settings, scheduler, Flow, or retry endpoints. */
export function geminiQueueRequest(input: PipelineCreateInput): GeminiQueueRequest {
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['title', 'idea', 'prompt', 'sceneCount', 'aspectRatio'].includes(key))) throw new Error('Invalid Gemini creation fields.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('A title of 1-200 characters is required.');
  if ((input.idea === undefined) === (input.prompt === undefined)) throw new Error('Provide exactly one idea or prompt.');
  const idea = input.idea ?? input.prompt;
  if (typeof idea !== 'string' || !idea.trim() || Buffer.byteLength(idea, 'utf8') > 12000) throw new Error('An idea or prompt of at most 12000 UTF-8 bytes is required.');
  const scenes = input.sceneCount ?? 2;
  if (!Number.isInteger(scenes) || scenes < 1 || scenes > 20) throw new Error('sceneCount must be 1-20; the saved provider maximum may be lower.');
  const aspect = input.aspectRatio ?? '9:16';
  if (aspect !== '9:16' && aspect !== '16:9') throw new Error('aspectRatio must be 9:16 or 16:9.');
  return {
    title: input.title.trim(), idea: idea.trim(), scene_count: scenes, aspect_ratio: aspect,
    generation_settings: { version: 'generation_settings.v1', mode: 'dense_performance', performance_tempo: 2 },
  };
}

export class PipelineAdapter {
  constructor(private readonly client: Pick<JsonClient, 'get' | 'post' | 'origin'>) {}

  async create(input: PipelineCreateInput): Promise<{ projectId: string }> {
    const request = geminiQueueRequest(input);
    // Text-only queue creation has no upstream idempotency contract. The caller
    // must durably save its intent before entering here and never blindly repeat.
    const result = await this.client.post<{ job_id?: string }>('/gemini-autopilot/queue', request);
    try { projectPath(result?.job_id as string); }
    catch { throw new ApiError(202, 'invalid_pipeline_create_response', true); }
    return { projectId: result.job_id! };
  }

  async status(projectId: string): Promise<PipelineStatus> {
    return this.project(projectId).then(project => this.compact(project));
  }

  /** Read-only admission. Native locks and accounting remain authoritative. */
  async admission():Promise<{allowed:boolean;code:string;workerEnabled:boolean;schedulerEnabled:boolean}> {
    const r=await this.client.get<Record<string,any>>('/gemini-autopilot');
    if(r?.provider!=='gemini_web'||!r.scheduler||!Array.isArray(r.scheduler.queue)||typeof r.worker_enabled!=='boolean'||
      typeof r.scheduler.enabled!=='boolean'||typeof r.recovery_status?.submission_unresolved!=='boolean'||!Array.isArray(r.quota_timing?.remaining_blockers)||
      !Number.isInteger(r.scheduler.configured_submission_cap)||r.scheduler.configured_submission_cap<1||r.scheduler.configured_submission_cap>20||
      !Number.isInteger(r.scheduler.submissions_this_window)||r.scheduler.submissions_this_window<0)
      throw new ApiError(200,'invalid_gemini_admission_response',false);
    const s=r.scheduler,recovery=r.recovery_status||{};
    let code='ready';
    if(r.available!==true)code='provider_unavailable';
    else if(s.active_run||s.observation_token||recovery.submission_unresolved)code='provider_session_locked';
    else if(s.recovery_only||s.block_reason||s.storage_block)code='provider_recovery_or_accounting_hold';
    else if((r.quota_timing?.remaining_blockers||[]).length||
      (typeof s.configured_submission_cap==='number'&&s.submissions_this_window>=s.configured_submission_cap))code='provider_capacity_wait';
    else if(s.queue.some((item:any)=>item.paused!==true&&!['completed','failed','skipped'].includes(item.status)))code='provider_work_pending';
    return {allowed:code==='ready',code,workerEnabled:r.worker_enabled,schedulerEnabled:s.enabled===true};
  }

  /** One bounded invocation, two existing GETs; never checks the browser or waits for a clip. */
  async inspect(projectId:string):Promise<Record<string,any>> {
    const [project,overview]=await Promise.all([this.project(projectId),this.client.get<Record<string,any>>('/gemini-autopilot')]);
    if(overview?.provider!=='gemini_web'||!Array.isArray(overview.scheduler?.queue))throw new ApiError(200,'invalid_gemini_observation_response',false);
    const item=overview.scheduler.queue.find((row:any)=>row.job_id===projectId);
    if(!item)throw new ApiError(200,'missing_gemini_queue_identity',false);
    const run=(item.runs||[]).at(-1);
    const recovery=overview.recovery_status?.job_id===projectId?overview.recovery_status:{};
    let conversationUrl:string|null=null;
    try {const u=new URL(run?.evidence?.provider_context_url);if(u.protocol==='https:'&&u.hostname==='gemini.google.com'&&/^\/app\/[A-Za-z0-9_-]+$/.test(u.pathname)&&!u.search&&!u.hash&&!u.username&&!u.password)conversationUrl=u.href;}catch{}
    const failure=run?.diagnostic||item.failure_history?.at(-1)||project.diagnostic||(run?.failure?{code:run.failure}:null);
    return {project:this.compact(project),createdAt:project.created_at??null,updatedAt:project.updated_at??null,
      plannedScenes:project.scenes?.length??0,scenes:(project.scenes||[]).map(s=>({order:s.order,status:s.status,hasClip:!!s.clip_url})),
      original:{projectId,runId:run?.id??null,sceneOrder:run?.scene_order??null,accountId:run?.account_id??null,conversationUrl},
      run:{status:run?.status??null,at:run?.at??null,expiresAt:run?.expires_at??null,finishedAt:run?.finished_at??null,
        submissionIntent:run?.submission_intent===true,acknowledged:run?.submission_acknowledged===true},
      session:{active:!!run&&overview.scheduler.active_run===run.id,activeRunId:overview.scheduler.active_run??null,
        observationLocked:!!overview.scheduler.observation_token,providerSession:text(run?.session,120),unresolved:recovery.submission_unresolved===true,
        nativeBlock:text(overview.scheduler.block_reason,80)},
      recovery:{state:text(recovery.state,80),required:recovery.needs_recovery===true,attempts:item.recovery_attempts??0,
        outcome:text(item.last_recovery_outcome,100),submissionOutcome:text(recovery.submission_outcome,80),
        nextRetryAt:text(recovery.next_retry_at||item.next_retry_at,40),canRecover:recovery.can_recover_video===true,
        nextAction:text(recovery.next_action),retryMaySubmit:recovery.next_retry_may_submit===true},
      failure:failure?{code:text(failure.code,80),stage:text(failure.stage,80),message:text(failure.message),at:text(failure.occurred_at,40)}:null,
      providerNotice:text(recovery.provider_notice),error:text(project.error)};
  }

  /** Attach a known exact project after an uncertain create, using reads only. */
  async reconcile(projectId: string, expectedInput?: PipelineCreateInput): Promise<PipelineStatus> {
    const project = await this.project(projectId);
    if (expectedInput) {
      const expected = geminiQueueRequest(expectedInput);
      const settings = project.generation_settings;
      // Pipeline normalizes/truncates display titles. The full saved idea plus
      // immutable generation snapshot bind recovery without display-name matching.
      if (project.topic !== expected.idea || project.scene_count !== expected.scene_count || project.aspect_ratio !== expected.aspect_ratio || project.scene_seconds !== 10 || settings?.version !== expected.generation_settings.version || settings?.mode !== expected.generation_settings.mode || settings?.performance_tempo !== 2) {
        throw new Error('The supplied Pipeline project does not match the saved creation intent.');
      }
    }
    return this.compact(project);
  }

  private async project(projectId: string): Promise<ProjectResponse> {
    const project = await this.client.get<ProjectResponse>(projectPath(projectId));
    if (!project || project.id !== projectId || project.autopilot?.provider !== 'gemini_web' || (project.provider !== undefined && project.provider !== 'gemini_web') || !states.has(project.status ?? '')) throw new Error('Invalid Gemini project response.');
    return project;
  }

  private mediaURL(value: unknown, projectId: string): string | null {
    if (typeof value !== 'string' || !value || value.includes('\\')) return null;
    try {
      const url = new URL(value, this.client.origin);
      if (url.origin !== this.client.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(projectPath(projectId) + '/')) return null;
      return url.href;
    } catch { return null; }
  }

  private compact(project: ProjectResponse): PipelineStatus {
    const blockers = [...(Array.isArray(project.blockers) ? project.blockers : []), ...(project.diagnostic ? [project.diagnostic] : [])];
    const seen = new Set<string>();
    return {
      projectId: project.id!, provider: 'gemini_web', state: project.status!,
      displayStatus: text(project.display_status), step: text(project.current_step, 80),
      progress: { accepted: count(project.accepted_count), total: count(project.scene_count) },
      blockers: blockers.filter(detail => detail && typeof detail.code === 'string' && !seen.has(detail.code) && Boolean(seen.add(detail.code))).slice(0, 8).map(detail => ({ code: detail.code!.slice(0, 80), message: text(detail.message), nextRetryAt: text(detail.next_retry_at, 40) })),
      nextAutomaticAt: text(project.next_automatic_at, 40), background: project.next_action?.background === true,
      media: {
        videoUrl: project.status === 'completed' ? this.mediaURL(project.video_url, project.id!) : null,
        thumbnailUrl: this.mediaURL(project.thumbnail_url, project.id!), durationSeconds: positive(project.duration_seconds),
        aspectRatio: text(project.aspect_ratio, 10), resolution: text(project.generation_resolution, 20),
        acceptanceType: text(project.acceptance_type, 40), creativeReview: text(project.autopilot?.review_status, 40),
      },
    };
  }
}
