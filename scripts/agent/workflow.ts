import { AgentStore, stableHash } from './store.js';
import { ApiError } from './http.js';
import { PipelineAdapter, geminiQueueRequest, type PipelineCreateInput } from './pipeline.js';
import { SccAdapter } from './scc.js';

export class WorkflowError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export interface ContentInput {
  accountId: string;
  caption: string;
  hashtags?: string;
  scheduledAt?: string;
  categoryId?: string;
  applyBranding?: boolean;
  selectedVariantId?: string;
}
export interface WorkflowInput {
  title: string;
  projectId?: string;
  generation?: PipelineCreateInput;
  content?: ContentInput;
}
export interface ExactApproval { revision: number; accountId: string; payloadHash: string }

/** A short-lived orchestrator. Application workers own all generation and dispatch. */
export class AgentWorkflow {
  constructor(readonly store: AgentStore, readonly pipeline: PipelineAdapter, readonly scc: SccAdapter,
    readonly targets: {pipeline: string; scc: string}) {}

  private job(id: string) {
    const job = this.store.getJob(id);
    if (!job) throw new WorkflowError('job_not_found', 'Unknown run ID. Use jobs to find saved work.');
    const input = job.input as WorkflowInput & {targets: {pipeline: string; scc: string}};
    if (stableHash(input.targets) !== stableHash(this.targets))
      throw new WorkflowError('target_changed', 'Use the original Pipeline and SCC URLs for this run.');
    // Receipts are authoritative even if a process ended before updating its cached state.
    const state = {...job.state};
    for (const [step,phase] of [['generation','generation_submitted'],['import','imported'],['prepare','draft'],['approve','approved'],['queue','queued']]) {
      const op = this.store.getOperation(id, step);
      if (op?.status !== 'succeeded') continue;
      const response = op.response as any;
      state.phase = phase;
      if (step === 'generation') state.projectId = response.projectId;
      if (step === 'import') state.videoId = response.videoId;
      if (step === 'prepare') state.draftId = response.draft.id;
      if (step === 'queue') state.postId = response.postId;
    }
    return { ...job, input, state };
  }

  private async operation<T>(id: string, step: string, request: unknown, action: () => Promise<T>,
    readBack?: () => Promise<T | undefined>): Promise<T> {
    const claim = this.store.claimOperation(id, step, request);
    if (!claim.claimed) {
      if (claim.operation.status === 'succeeded') return claim.operation.response as T;
      if (readBack && ['pending','uncertain'].includes(claim.operation.status)) {
        const known = await readBack();
        if (known !== undefined) {
          const winner = this.store.getOperation(id, step);
          if (winner?.status === 'succeeded') return winner.response as T;
          this.store.finishOperation(id, step, 'succeeded', known);
          return known;
        }
      }
      throw new WorkflowError(claim.operation.status === 'rejected' ? 'request_rejected' : 'reconciliation_required',
        `Step ${step} is ${claim.operation.status}. Inspect the saved run; do not repeat the submission.`);
    }
    try {
      const result = await action();
      const reconciled = this.store.getOperation(id, step);
      if (reconciled?.status === 'succeeded') return reconciled.response as T;
      this.store.finishOperation(id, step, 'succeeded', result);
      return result;
    } catch (error) {
      // A local validation failure has not submitted anything. Unknown failures remain fenced.
      const reconciled = this.store.getOperation(id, step);
      if (reconciled?.status === 'succeeded') return reconciled.response as T;
      const rejected = error instanceof WorkflowError || (error instanceof ApiError && !error.uncertain);
      this.store.finishOperation(id, step, rejected ? 'rejected' : 'uncertain',
        {code: error instanceof ApiError || error instanceof WorkflowError ? error.code : 'operation_failed'});
      throw error;
    }
  }

  async start(id: string, input: WorkflowInput, allowGeneration = false) {
    if (!id || id.length > 100 || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id))
      throw new WorkflowError('invalid_run_id', 'Use a stable run ID of 1 to 100 letters, digits, dots, underscores or dashes.');
    if (!input || Object.keys(input).some(key => !['title','projectId','generation','content'].includes(key)) || typeof input.title !== 'string' || !input.title.trim() || (!!input.projectId === !!input.generation))
      throw new WorkflowError('invalid_input', 'Supply a title and exactly one of projectId or generation.');
    if (input.generation && allowGeneration !== true)
      throw new WorkflowError('generation_authorization_required', 'Starting Gemini requires explicit allowGeneration=true.');
    if (input.generation) geminiQueueRequest(input.generation);
    if (input.content) this.validateContent(input.content);
    this.store.createJob(id, {...input, targets: this.targets});
    this.job(id);
    const created = await this.operation(id, 'generation', input.projectId ? {projectId: input.projectId} : input.generation,
      async () => {
        if (input.projectId) { await this.pipeline.reconcile(input.projectId); return {projectId: input.projectId}; }
        return this.pipeline.create(input.generation!);
      });
    this.store.patchState(id, {projectId: created.projectId});
    return this.summary(id);
  }

  summary(id: string) {
    const job = this.job(id);
    return {runId: id, phase: job.state.phase || 'registered', projectId: job.state.projectId,
      videoId: job.state.videoId, draftId: job.state.draftId, postId: job.state.postId, updatedAt: job.updatedAt,
      next: job.state.postId ? 'status_or_analytics' : job.state.phase === 'approved' ? 'schedule_requires_separate_authorization' : job.state.draftId ? 'review' : job.state.projectId ? 'advance' : 'reconcile',
      operations: ['generation','import','prepare','approve','queue'].map(step => {
        const op = this.store.getOperation(id, step);
        return op ? {step, status: op.status} : null;
      }).filter(Boolean), knowledge: this.store.listKnowledge({resourceId: id, limit: 5})};
  }

  async status(id: string) {
    const job = this.job(id);
    const projectId = job.state.projectId as string | undefined;
    const generation = projectId ? await this.pipeline.status(projectId) : undefined;
    const draft = job.state.draftId ? await this.scc.review(job.state.draftId as string) : undefined;
    const publication = job.state.postId ? await this.scc.publication(job.state.postId as string) : undefined;
    return {...this.summary(id), generation, draft, publication};
  }

  async advance(id: string, content?: ContentInput): Promise<Record<string, any>> {
    let job = this.job(id);
    const savedPreparation = this.store.getOperation(id, 'prepare');
    if (savedPreparation?.status === 'succeeded') {
      if (content) {
        this.validateContent(content);
        if (stableHash({title:job.input.title,videoId:job.state.videoId,...content}) !== savedPreparation.requestHash)
          throw new WorkflowError('request_changed', 'This run already prepared different content. Review its existing draft.');
      }
      return {...this.summary(id),draft:savedPreparation.response,cached:true};
    }
    const projectId = job.state.projectId as string | undefined;
    if (!projectId) throw new WorkflowError('reconciliation_required', 'Attach the original Gemini project before advancing.');
    const generation = await this.pipeline.status(projectId);
    if (generation.state !== 'completed' || !generation.media.videoUrl)
      return {...this.summary(id), generation, next: generation.state === 'failed' ? 'inspect_failure' : 'check_later', pollAfterSeconds: 60};
    const chosen = content || job.input.content;
    if (!chosen) return {...this.summary(id), generation, next: 'advance_with_content'};
    this.validateContent(chosen);
    if (chosen.scheduledAt && (!/(Z|[+-]\d{2}:\d{2})$/.test(chosen.scheduledAt) || !Number.isFinite(Date.parse(chosen.scheduledAt)) || Date.parse(chosen.scheduledAt) <= Date.now()))
      throw new WorkflowError('invalid_schedule', 'Use a future ISO timestamp with an explicit timezone.');
    const source = await this.scc.pipelineOrigin();
    if (source.replace(/\/+$/, '') !== this.targets.pipeline.replace(/\/+$/, ''))
      throw new WorkflowError('pipeline_source_mismatch', 'SCC uses a different Pipeline URL. Use its configured source URL; no configuration was changed.');
    const imported = await this.operation(id, 'import', {projectId, categoryId: chosen.categoryId, title: job.input.title},
      () => this.scc.importVideo(projectId, chosen.categoryId, job.input.title),
      // This existing endpoint deduplicates by source and project, including concurrent calls.
      () => this.scc.importVideo(projectId, chosen.categoryId, job.input.title));
    job = this.job(id);
    this.store.patchState(id, {videoId: imported.videoId});
    const preparedInput = {title: job.input.title, videoId: imported.videoId, ...chosen};
    const prepared = await this.operation(id, 'prepare', preparedInput, () => this.scc.prepare(preparedInput));
    this.store.patchState(id, {videoId: imported.videoId, draftId: prepared.draft.id});
    return {...this.summary(id), draft: prepared};
  }

  private validateContent(input: ContentInput) {
    if (!input || Object.keys(input).some(key => !['accountId','caption','hashtags','scheduledAt','categoryId','applyBranding','selectedVariantId'].includes(key)) ||
      typeof input.accountId !== 'string' || !input.accountId || typeof input.caption !== 'string' ||
      (input.applyBranding !== undefined && typeof input.applyBranding !== 'boolean') ||
      ['hashtags','scheduledAt','categoryId','selectedVariantId'].some(key => (input as any)[key] !== undefined && typeof (input as any)[key] !== 'string'))
      throw new WorkflowError('invalid_content', 'Content requires an exact accountId, agent-authored caption and supported content fields.');
  }

  async review(id: string): Promise<Record<string, any>> {
    const job = this.job(id);
    if (!job.state.draftId) throw new WorkflowError('draft_not_ready', 'Advance the completed project to prepare a draft first.');
    return {runId: id, ...await this.scc.review(job.state.draftId as string)};
  }

  async approve(id: string, exact: ExactApproval, ownerAuthorized: boolean): Promise<Record<string, any>> {
    if (ownerAuthorized !== true) throw new WorkflowError('owner_authorization_required', 'Exact owner authorization is required for approval.');
    this.validateExact(exact);
    const draftId = this.job(id).state.draftId as string;
    if (!draftId) throw new WorkflowError('draft_not_ready', 'No draft is saved for this run.');
    const result = await this.operation(id, 'approve', {draftId,...exact}, () => this.scc.approve(draftId, exact), async () => {
      const current = await this.scc.review(draftId);
      if (current.draft.payloadHash === exact.payloadHash && current.draft.revision === exact.revision &&
        current.draft.approvedRevision === exact.revision) return current;
      return undefined;
    });
    return {runId: id, ...result, next: 'schedule_requires_separate_authorization'};
  }

  async schedule(id: string, exact: ExactApproval, ownerAuthorized: boolean): Promise<Record<string, any>> {
    if (ownerAuthorized !== true) throw new WorkflowError('owner_authorization_required', 'A separate explicit owner authorization is required to queue publication.');
    this.validateExact(exact);
    const draftId = this.job(id).state.draftId as string;
    if (!draftId) throw new WorkflowError('draft_not_ready', 'No draft is saved for this run.');
    const result = await this.operation(id, 'queue', {draftId,...exact}, () => this.scc.queue(draftId, exact), async () => {
      const current = await this.scc.review(draftId);
      if (current.draft.payloadHash === exact.payloadHash && current.draft.revision === exact.revision && current.draft.queuedPostId)
        return {postId: current.draft.queuedPostId, draft: current.draft, reused: true};
      return undefined;
    });
    this.store.patchState(id, {postId: result.postId});
    return {runId: id, ...result, next: 'status_or_analytics'};
  }

  private validateExact(input: ExactApproval) {
    if (!input || Object.keys(input).some(key => !['revision','accountId','payloadHash'].includes(key)) ||
      !Number.isInteger(input.revision) || input.revision < 1 || typeof input.accountId !== 'string' || !input.accountId ||
      !/^[a-f0-9]{64}$/.test(input.payloadHash))
      throw new WorkflowError('invalid_approval', 'Supply only the exact revision, accountId and payloadHash returned by review.');
  }

  /** Operator supplies an exact known ID; this performs reads and never re-submits. */
  async reconcile(id: string, resource: {projectId?: string; draftId?: string}) {
    const job = this.job(id);
    if (!resource || Object.keys(resource).some(key => !['projectId','draftId'].includes(key)) ||
      ['projectId','draftId'].some(key => (resource as any)[key] !== undefined && (typeof (resource as any)[key] !== 'string' || !(resource as any)[key])))
      throw new WorkflowError('invalid_reconciliation', 'Supply only the original projectId or draftId.');
    if (resource.projectId && resource.draftId) throw new WorkflowError('invalid_reconciliation', 'Reconcile one resource at a time.');
    if (resource.projectId) {
      const op = this.store.getOperation(id, 'generation');
      if (!op || !['pending','uncertain'].includes(op.status)) throw new WorkflowError('invalid_reconciliation', 'Generation has no uncertain intent.');
      if (job.input.projectId && job.input.projectId !== resource.projectId) throw new WorkflowError('resource_mismatch', 'Use the original project ID.');
      await this.pipeline.reconcile(resource.projectId, job.input.generation);
      this.store.finishOperation(id, 'generation', 'succeeded', {projectId: resource.projectId, reconciled: true});
      this.store.patchState(id, {projectId: resource.projectId});
    } else if (resource.draftId) {
      const op = this.store.getOperation(id, 'prepare');
      if (!op || !['pending','uncertain'].includes(op.status)) throw new WorkflowError('invalid_reconciliation', 'Draft creation has no uncertain intent.');
      // The adapter compares canonical server content against the original exact request.
      if (!op.request) throw new WorkflowError('reconciliation_required', 'Saved draft input is unavailable.');
      const draft = await this.scc.reconcileDraft(resource.draftId, op.request as any);
      this.store.finishOperation(id, 'prepare', 'succeeded', draft);
      this.store.patchState(id, {draftId: resource.draftId});
    } else throw new WorkflowError('invalid_reconciliation', 'Supply the original projectId or draftId.');
    return this.summary(id);
  }
}
