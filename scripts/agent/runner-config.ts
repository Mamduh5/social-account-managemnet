import {z} from 'zod';
import {AgentStore,stableHash} from './store.js';
import {workKinds} from './work-queue.js';

export const executorSchema=z.object({
  id:z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  adapter:z.enum(['codex','gemini','json']),
  command:z.string().min(1).max(1000),args:z.array(z.string().max(2000)).max(30).default([]),
  kinds:z.array(z.enum(workKinds)).min(1).default(['research_concept','story_plan','scene_prompt','caption','record_lesson','analyze_performance','text_post','image_post','group_post','prepare_video','audience_research']),
  // Required for owner-supplied wrappers; prompts cannot establish process isolation.
  isolationReviewed:z.boolean().default(false),
}).strict();
export const runnerConfigSchema=z.object({
  version:z.literal('agent-runner.v1').default('agent-runner.v1'),
  enabled:z.boolean().default(false),paused:z.boolean().default(false),
  saveContentDrafts:z.boolean().default(false),
  intervalSeconds:z.number().int().min(60).max(86400).default(300),
  cooldownSeconds:z.number().int().min(0).max(86400).default(60),
  maxConcurrent:z.number().int().min(1).max(4).default(1),
  maxTasksPerRun:z.number().int().min(1).max(10).default(1),
  maxInvocationsPerDay:z.number().int().min(1).max(500).default(6),
  maxDurationSeconds:z.number().int().min(5).max(1800).default(180),
  maxAttempts:z.number().int().min(1).max(5).default(1),
  maxBacklog:z.number().int().min(1).max(10000).default(200),
  maxContextBytes:z.number().int().min(2048).max(32768).default(16000),
  maxOutputBytes:z.number().int().min(4096).max(2097152).default(262144),
  // Admission threshold, not a provider-side hard token cap. Unknown usage holds future calls.
  dailyTokenBudget:z.number().int().min(1).max(100000000).nullable().default(null),
  tokenReservation:z.number().int().min(1).max(10000000).default(12000),
  executors:z.array(executorSchema).max(10).default([
    executorSchema.parse({id:'codex',adapter:'codex',command:'codex'}),
    executorSchema.parse({id:'gemini',adapter:'gemini',command:'gemini'}),
  ]),
}).strict().superRefine((c,ctx)=>{
  if(new Set(c.executors.map(e=>e.id)).size!==c.executors.length)ctx.addIssue({code:'custom',message:'Executor IDs must be unique'});
  if(c.dailyTokenBudget!==null&&c.tokenReservation>c.dailyTokenBudget)ctx.addIssue({code:'custom',message:'Token reservation exceeds daily budget'});
  if(c.executors.some(e=>e.adapter!=='json'&&e.args.length))ctx.addIssue({code:'custom',message:'Built-in executors do not accept extra arguments'});
  if(c.executors.some(e=>e.adapter==='json'&&!e.isolationReviewed))ctx.addIssue({code:'custom',message:'Custom JSON wrappers require reviewed output-only isolation'});
});
export type RunnerConfig=z.infer<typeof runnerConfigSchema>;
export type ExecutorConfig=z.infer<typeof executorSchema>;
export const defaultRunnerConfig=()=>runnerConfigSchema.parse({});
export function getRunnerConfig(store:AgentStore):RunnerConfig {return runnerConfigSchema.parse(store.runnerState('config')??{});}
function authorizationHash(config:RunnerConfig):string {
  const {enabled,paused,...settings}=config;return stableHash(settings);
}
export function runnerAuthorized(store:AgentStore,config=getRunnerConfig(store)):boolean {
  return store.runnerState('authorization')?.configHash===authorizationHash(config);
}
export function configureRunner(store:AgentStore,input:unknown,ownerAuthorized=false):RunnerConfig {
  const config=runnerConfigSchema.parse(input);
  return store.transaction(()=>{
    if(config.enabled&&!ownerAuthorized&&!runnerAuthorized(store,config))throw new Error('Enabling or changing an enabled runner requires explicit owner authorization');
    if(ownerAuthorized)store.setRunnerState('authorization',{configHash:authorizationHash(config),at:new Date().toISOString()});
    store.setRunnerState('config',config);return config;
  });
}
