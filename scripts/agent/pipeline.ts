import { ApiError, type JsonClient } from './http.js';

export interface PipelineCreateInput {
  title: string;
  idea?: string;
  prompt?: string;
  sceneCount?: number;
  aspectRatio?: string;
}

export interface GeminiQueueRequest {
  gemini_workflow?: 'standalone_10s_auto_v1';
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
  scenes?: Array<{order:number;status:string;clip_url?:string;generation_request?:Record<string,any>}>;
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
  gemini_workflow?: string;
  account_policy?: {mode?:string;account_id?:string};
  starting_image?: unknown;
  subject_reference?: unknown;
  audio_policy?:string;
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
  const scenes = input.sceneCount ?? 1;
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

  async productionStatus():Promise<Record<string,any>> {
    const r=await this.client.get<Record<string,any>>('/gemini-autopilot');
    const s=r?.scheduler;
    if(r?.provider!=='gemini_web'||!s||!Array.isArray(s.queue)||typeof s.enabled!=='boolean'||typeof r.worker_enabled!=='boolean'||typeof r.recovery_status?.submission_unresolved!=='boolean'||!Number.isInteger(s.configured_submission_cap)||s.configured_submission_cap<1||!Number.isInteger(s.submissions_this_window)||s.submissions_this_window<0)throw new ApiError(200,'invalid_production_admission',false);
    return {available:r.available===true,workerEnabled:r.worker_enabled,nativeEnabled:s.enabled,activeRunId:s.active_run??null,observationLocked:!!s.observation_token,unresolved:r.recovery_status.submission_unresolved,
      cap:s.configured_submission_cap,used:s.submissions_this_window,windowStartedAt:s.window_started_at??null,providerAllowance:null,
      accountUsage:s.account_usage??{},applicationWindowHours:s.window_hours??null,accountWaitNext:s.account_selection_wait?.next_recheck_at??null,
      providerBlock:s.block_reason??s.provider_observation?.status??null,
      recoveryHold:['reconciliation_required','result_recovery_pending'].includes(s.block_reason),
      accountingHold:!!s.recovery_only||!!s.storage_block||s.block_reason==='external_submission_accounting',
      availability:r.availability_status??null,blockers:(r.quota_timing?.remaining_blockers??[]).filter((x:string)=>x!=='autopilot_paused'),
      nextCheckAt:r.availability_status?.next_recheck_at??r.quota_timing?.application_fallback_at??null,
      boundedRequests:Object.entries(r.force_retry_status??{}).map(([jobId,v]:[string,any])=>({jobId,...v}))};
  }

  /** Only fresh checks and the existing bounded worker request can submit work. */
  checkProductionAvailability(){return this.client.post<Record<string,any>>('/gemini-autopilot/recover',{action:'availability_check'});}
  observeProductionUsage(){return this.client.post<Record<string,any>>('/gemini-autopilot/check',{});}
  reconcileProductionRecovery(){return this.client.post<Record<string,any>>('/gemini-autopilot/recover',{action:'reconcile_recovery'});}
  async prepareProduction(input:PipelineCreateInput,accountId:string):Promise<{projectId:string}> {
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(accountId))throw new Error('Invalid Gemini account identity');
    const request=geminiQueueRequest(input);
    if(request.scene_count!==1||request.aspect_ratio!=='9:16')throw new Error('Standalone Gemini production requires one portrait scene');
    const r=await this.client.post<{job_id?:string}>('/gemini-autopilot/queue',{...request,gemini_workflow:'standalone_10s_v1',account_policy:{mode:'specific',account_id:accountId}});
    try{projectPath(r.job_id!);}catch{throw new ApiError(202,'invalid_pipeline_create_response',true);}
    return {projectId:r.job_id!};
  }
  async verifyProduction(projectId:string,input:PipelineCreateInput,accountId:string,requirePlanned=false){
    const p=await this.project(projectId),expected=geminiQueueRequest(input),s=p.generation_settings;
    if(p.topic!==expected.idea || p.scene_count!==1 || p.scene_seconds!==10 || p.aspect_ratio!=='9:16' || p.audio_policy!=='clip_native' || p.gemini_workflow!=='standalone_10s_v1' || s?.version!=='generation_settings.v1' || s?.mode!=='dense_performance' || s.performance_tempo!==2 || p.account_policy?.mode!=='specific' || p.account_policy.account_id!==accountId || p.starting_image || p.subject_reference)throw new Error('Original project differs from authorized standalone production intent');
    if(requirePlanned){const r=p.scenes?.[0]?.generation_request,g=r?.generation_settings;
      if(p.scenes?.length!==1 || r?.scene_order!==1 || r.duration_seconds!==10 || r.aspect_ratio!=='9:16' || r.reference_mode!=='none' || r.start_frame || r.initial_frame || g?.version!=='generation_settings.v1' || g?.mode!=='dense_performance' || g.performance_tempo!==2)throw new Error('Saved scene request differs from the text-only native-audio contract');
    }
    return {projectId};
  }
  async submitProduction(projectId:string,requestId:string){projectPath(projectId);
    const result=await this.client.post<Record<string,any>>('/gemini-autopilot/force-retry',{job_id:projectId,scene_order:1,request_id:requestId,confirmed:true});
    const status=result?.force_retry_status;
    if(status?.job_id!==projectId || status.request_id!==requestId || typeof status.in_progress!=='boolean')throw new ApiError(202,'invalid_bounded_request_response',true);
    return result;
  }
  recoverProduction(projectId:string,runId:string){projectPath(projectId);if(!/^[A-Za-z0-9_-]{1,128}$/.test(runId))throw new Error('Invalid original run');return this.client.post('/gemini-autopilot/projects/'+encodeURIComponent(projectId)+'/video-recovery/'+encodeURIComponent(runId)+'/recover',{});}
  async productionArtifact(projectId:string,maxBytes:number){
    const project=await this.project(projectId),url=this.mediaURL(project.video_url,projectId);
    if(project.status!=='completed'||!url)throw new Error('Original completed artifact is required');
    const client=this.client as JsonClient;
    if(typeof client.media!=='function')throw new Error('Bounded artifact verification is unavailable');
    return client.media(new URL(url).pathname,maxBytes);
  }

  async create(input: PipelineCreateInput): Promise<{ projectId: string }> {
    const request = geminiQueueRequest(input);
    if(request.scene_count!==1 || request.aspect_ratio!=='9:16') throw new Error('New Gemini agent tasks require one complete portrait ten-second text-only scene. Experimental projects require explicit Pipeline review.');
    request.gemini_workflow='standalone_10s_auto_v1';
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
        submissionIntent:run?.submission_intent===true,acknowledged:run?.submission_acknowledged===true,resolution:run?.resolution??null},
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
      // Legacy omitted scene counts meant two. The new saved workflow binds one.
      const expected = geminiQueueRequest({...expectedInput,sceneCount:expectedInput.sceneCount??(project.gemini_workflow?.startsWith('standalone_10s_')?1:2)});
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
