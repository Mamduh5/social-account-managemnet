import fs from 'node:fs';
import path from 'node:path';
import {AgentStore, type KnowledgeInput} from './agent/store.js';
import {JsonClient, ApiError} from './agent/http.js';
import {PipelineAdapter} from './agent/pipeline.js';
import {SccAdapter} from './agent/scc.js';
import {AgentWorkflow, WorkflowError, type WorkflowInput, type ContentInput, type ExactApproval} from './agent/workflow.js';

const version = 'agent-workflow.v1';
const commands = {
  context: 'Accounts, categories, branding and optional Page voice (--account).',
  discover: 'Completed Pipeline library page; --input contains optional filters/cursor.',
  import: 'Import a selected completed library project through SCC deduplication; --input projectId/categoryId/title.',
  media: 'Imported media metadata and available quality/provenance for --run.',
  start: 'Durably register --run and attach projectId or submit Gemini generation (--allow-generation).',
  advance: 'Check once, then import and prepare a draft when complete. Optional --input content.',
  status: 'Read saved IDs, Gemini progress, blockers and exact SCC draft.',
  review: 'Read the exact draft, revision, account and payloadHash for owner review.',
  approve: 'Approve reviewed revision; requires --owner-authorized and --input exact review.',
  schedule: 'Separately queue the approved schedule; requires --owner-authorized and --input exact review.',
  analytics: 'Existing observations and relative ranking (--account or --destination).',
  history: 'Bounded existing publication history; --input contains optional filters.',
  remember: 'Append knowledge from --input with kind observation/assumption and explicit source.',
  knowledge: 'Read bounded prior knowledge (--account, --run, --limit).',
  summary: 'Compact durable handoff for --run; does not poll applications.',
  jobs: 'Compact saved run list; does not poll applications.',
  reconcile: 'Attach original known projectId/draftId after an uncertain response; reads only.',
};

function parse(argv: string[]) {
  const command = argv[0] || 'help';
  const flags: Record<string,string|boolean> = {};
  const booleans = new Set(['allow-generation','owner-authorized']);
  const values = new Set(['input','run','account','destination','limit','offset','state','scc','pipeline']);
  for (let i=1; i<argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || (!booleans.has(key) && !values.has(key)) || key in flags)
      throw new WorkflowError('invalid_arguments', 'Use help for supported, nonrepeated flags.');
    if (booleans.has(key)) flags[key] = true;
    else {
      if (!argv[i+1] || argv[i+1].startsWith('--')) throw new WorkflowError('invalid_arguments', 'A flag value is missing.');
      flags[key] = argv[++i];
    }
  }
  return {command,flags};
}

async function main() {
  let store: AgentStore | undefined;
  let command = 'help';
  try {
    const parsed = parse(process.argv.slice(2)); command = parsed.command;
    const flags = parsed.flags;
    if (command === 'help') {
      process.stdout.write(JSON.stringify({version,ok:true,commands,usage:'npm --silent run agent -- <command> [--run stable-id] [--input file.json|-] [--scc http://localhost:3001] [--pipeline http://localhost:8080] [--state .data/agent/agent.db]',
        safety:'Draft first. Explicit generation and separate exact owner approval/queue flags are required. A flag records authorization; it does not grant it. No automatic uncertain retries or global worker controls.'})+'\n');
      return;
    }
    if (!(command in commands)) throw new WorkflowError('unknown_command', 'Use help for supported commands.');
    let input: any = {};
    if (flags.input) {
      const filename = String(flags.input);
      const raw = filename === '-' ? fs.readFileSync(0,'utf8') : fs.readFileSync(path.resolve(filename),'utf8');
      if (Buffer.byteLength(raw) > 128*1024) throw new WorkflowError('input_too_large', 'JSON input must be at most 128 KiB.');
      input = JSON.parse(raw.replace(/^\uFEFF/,''));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WorkflowError('invalid_input', 'Input must be a JSON object.');
    }
    const sccClient = new JsonClient(String(flags.scc || process.env.SCC_AGENT_SCC_URL || 'http://localhost:3001'), {timeoutMs: 90_000});
    const pipelineClient = new JsonClient(String(flags.pipeline || process.env.SCC_AGENT_PIPELINE_URL || 'http://localhost:8080'), {timeoutMs: 15_000});
    const scc = new SccAdapter(sccClient);
    const pipeline = new PipelineAdapter(pipelineClient);
    const local = () => store ||= new AgentStore(String(flags.state || process.env.SCC_AGENT_STATE || path.resolve(__dirname,'../.data/agent/agent.db')));
    const workflow = () => new AgentWorkflow(local(),pipeline,scc,{scc:sccClient.origin,pipeline:pipelineClient.origin});
    const run = () => {
      if (typeof flags.run !== 'string' || !flags.run) throw new WorkflowError('run_required', 'Supply the stable --run ID.');
      return flags.run;
    };
    const account = typeof flags.account === 'string' ? flags.account : undefined;
    const limit = flags.limit === undefined ? 20 : Number(flags.limit);
    if (!Number.isInteger(limit) || limit<1 || limit>100) throw new WorkflowError('invalid_limit', 'limit must be 1 to 100.');
    const offset = flags.offset === undefined ? 0 : Number(flags.offset);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new WorkflowError('invalid_offset', 'offset must be a nonnegative whole number.');
    let data: unknown;
    switch(command) {
      case 'context': data = await scc.context(account,{limit,offset}); break;
      case 'discover': data = await scc.discover({...input,limit:input.limit ?? Math.min(limit,50)}); break;
      case 'import': {
        if (Object.keys(input).some(key=>!['projectId','categoryId','title'].includes(key)) ||
          typeof input.projectId !== 'string' || !input.projectId ||
          ['categoryId','title'].some(key=>input[key]!==undefined && typeof input[key]!=='string'))
          throw new WorkflowError('invalid_input','Supply the selected projectId and optional categoryId/title.');
        if (await scc.pipelineOrigin() !== pipelineClient.origin)
          throw new WorkflowError('pipeline_source_mismatch','Use SCC\'s configured Pipeline source URL.');
        data = await scc.importVideo(input.projectId,input.categoryId,input.title); break;
      }
      case 'media': {
        const saved = workflow().summary(run());
        if (!saved.videoId) throw new WorkflowError('media_not_ready', 'Advance the completed project to import media first.');
        data = await scc.media(saved.videoId as string); break;
      }
      case 'start': data = await workflow().start(run(),input as WorkflowInput,flags['allow-generation'] === true); break;
      case 'advance': data = await workflow().advance(run(), flags.input ? input as ContentInput : undefined); break;
      case 'status': data = await workflow().status(run()); break;
      case 'summary': data = workflow().summary(run()); break;
      case 'review': data = await workflow().review(run()); break;
      case 'approve': data = await workflow().approve(run(),input as ExactApproval, flags['owner-authorized'] === true); break;
      case 'schedule': data = await workflow().schedule(run(),input as ExactApproval, flags['owner-authorized'] === true); break;
      case 'reconcile': data = await workflow().reconcile(run(),input); break;
      case 'analytics': data = await scc.analytics(account,typeof flags.destination === 'string' ? flags.destination : undefined,{limit,offset}); break;
      case 'history': data = await scc.history({...input,limit:input.limit ?? limit,offset:input.offset ?? offset}); break;
      case 'remember': data = local().recordKnowledge(input as KnowledgeInput); break;
      case 'knowledge': data = {entries:local().listKnowledge({accountId:account,resourceId:typeof flags.run === 'string' ? flags.run : undefined,limit})}; break;
      case 'jobs': data = {jobs:local().listJobs(limit).map(job=>{
        const targets = (job.input as WorkflowInput & {targets:{scc:string;pipeline:string}}).targets;
        const {knowledge,...summary} = new AgentWorkflow(local(),pipeline,scc,targets).summary(job.id);
        return {...summary,targets};
      })}; break;
    }
    process.stdout.write(JSON.stringify({version,ok:true,command,data})+'\n');
  } catch (error) {
    const code = error instanceof ApiError || error instanceof WorkflowError ? error.code :
      error instanceof SyntaxError ? 'invalid_json' : 'validation_or_state_error';
    const message = error instanceof ApiError || error instanceof WorkflowError ? error.message :
      error instanceof Error && !('path' in error) ? error.message : 'Input or local state could not be read.';
    process.stdout.write(JSON.stringify({version,ok:false,command,error:{code,message,
      uncertain:error instanceof ApiError ? error.uncertain : code === 'reconciliation_required'}})+'\n');
    process.exitCode = 1;
  } finally { store?.close(); }
}
void main();
