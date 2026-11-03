import fs from 'node:fs';
import path from 'node:path';
import {AgentStore, type KnowledgeInput} from './agent/store.js';
import {JsonClient, ApiError} from './agent/http.js';
import {PipelineAdapter} from './agent/pipeline.js';
import {SccAdapter} from './agent/scc.js';
import {AgentWorkflow, WorkflowError, type WorkflowInput, type ContentInput, type ExactApproval} from './agent/workflow.js';
import {compactWork} from './agent/work-queue.js';
import {AgentRunner} from './agent/runner.js';
import {configureRunner} from './agent/runner-config.js';
import {manageSchedule} from './agent/runner-schedule.js';
import {AgentContent} from './agent/content.js';
import {AgentResearch} from './agent/research.js';

const version = 'agent-workflow.v1';
const commands = {
  context: 'Accounts, categories, branding and optional Page voice (--account).',
  discover: 'Completed Pipeline library page; --input contains optional filters/cursor.',
  import: 'Import a selected completed library project through SCC deduplication; --input projectId/categoryId/title.',
  media: 'Imported media metadata and available quality/provenance for --run.',
  start: 'Durably register --run and attach projectId or submit Gemini generation (--allow-generation).',
  advance: 'Use cached generation evidence, then explicitly import/prepare a completed result. Optional --input content.',
  status: 'Cached Gemini progress/recovery plus current SCC draft/publication; no generation wait.',
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
  refresh: 'Fetch one bounded generation/recovery snapshot, save it, then continue independent work.',
  handoff: 'Cached generations, recovery holds, prepared work, available tasks and decisions; zero HTTP.',
  intent: 'Read exact saved creation/preparation input for --run; zero HTTP.',
  'recovery-note': 'Record ended/unavailable browser control locally for --run; never interacts with the browser.',
  'work-add': 'Save independent task/idea/prompt context from --input without invoking any model.',
  'work-list': 'List durable local tasks with --limit and --offset; zero HTTP.',
  'work-next': 'Recommend useful available work; --input owner/commandId optionally claims it.',
  'work-claim': 'Claim --task with --input owner/commandId; lease excludes concurrent agents.',
  'work-save': 'Save exact claimed task result as prepared/done/blocked/ready; no automatic execution.',
  'work-show': 'Read --task including its durable context, prompts and result.',
  'work-history': 'Read compact immutable revisions for --task.',
  'content-context': 'Cached compact Page voice, library, analytics and Groups; --account, optional --input {refresh:true}.',
  'content-enqueue': 'Choose up to three suitable formats from --input topic/formats/brief/maxTasks/groupId and --account; deduplicated preparation only.',
  'content-persist': 'Save the exact prepared --task result through SCC draft/Group workflows; never approves, queues or generates.',
  'content-status': 'Read compact saved content-preparation receipt for --task; zero HTTP.',
  'content-reconcile': 'Read back a known --input {id} after uncertain content save for --task; no repeated write.',
  groups: 'Read compact stored Group context; optional --account or --input {id}. No membership or provider changes.',
  'group-package': 'Read existing manual handoff using --input {id}; never opens Facebook.',
  'research-save': 'Store dated compact findings and source URLs from supported agent tools; --input, optional --account.',
  'research-status': 'Reuse fresh findings for --input {topic}, optional --account; zero HTTP.',
  'runner-config': 'Read defaults/configuration; --input replaces validated settings. Disabled by default.',
  'runner-status': 'Compact queue, invocations, budgets and saved schedule status; zero provider HTTP.',
  'runner-show': 'Read one durable executor receipt and saved result using --run INVOCATION_ID.',
  'runner-detect': 'Probe installed executor help only; never starts a model session.',
  'runner-tick': 'One bounded eligibility check; --schedule ID consumes an armed one-time trigger exactly once.',
  'runner-control': '--input action enable/disable/pause/resume/stop/wake; enable requires owner authorization.',
  'runner-recover': 'Explicit review and release of a held invocation; requires --owner-authorized.',
  'runner-schedule': '--input action export/install/remove/status, optional schedule mode once/date/time/timeZone. OS registration requires --owner-authorized.',
};

function parse(argv: string[]) {
  const command = argv[0] || 'help';
  const flags: Record<string,string|boolean> = {};
  const booleans = new Set(['allow-generation','owner-authorized']);
  const values = new Set(['input','run','task','account','destination','limit','offset','state','scc','pipeline','schedule']);
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
    if(flags.schedule&&(command!=='runner-tick'||!/^[a-zA-Z0-9_-]{1,100}$/.test(String(flags.schedule))))throw new WorkflowError('invalid_arguments','Use --schedule with a saved one-time ID on runner-tick only.');
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
    const statePath=path.resolve(String(flags.state || process.env.SCC_AGENT_STATE || path.resolve(__dirname,'../.data/agent/agent.db')));
    const local = () => store ||= new AgentStore(statePath);
    const contentScc=new SccAdapter(new JsonClient(sccClient.origin,{timeoutMs:10_000}));
    const content=()=>new AgentContent(local(),contentScc);
    const runner=()=>new AgentRunner(local(),path.join(path.dirname(statePath),'runner'),undefined,undefined,id=>content().persist(id));
    const workflow = () => new AgentWorkflow(local(),pipeline,scc,{scc:sccClient.origin,pipeline:pipelineClient.origin});
    const run = () => {
      if (typeof flags.run !== 'string' || !flags.run) throw new WorkflowError('run_required', 'Supply the stable --run ID.');
      return flags.run;
    };
    const task=()=>{if(typeof flags.task!=='string'||!flags.task)throw new WorkflowError('task_required','Supply --task with the saved task ID.');return flags.task;};
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
      case 'refresh': data = await workflow().refresh(run()); break;
      case 'handoff': data = workflow().handoff(limit); break;
      case 'intent': data = workflow().intent(run()); break;
      case 'recovery-note': data = workflow().recoveryNote(run(),input); break;
      case 'work-add': data = {task:compactWork(workflow().work.add(input)),automaticExecution:false}; break;
      case 'work-list': data = workflow().work.list(limit,offset); break;
      case 'work-next': data = workflow().work.next(flags.input?input:undefined); break;
      case 'work-claim': data = workflow().work.claim(task(),input); break;
      case 'work-save': data = workflow().work.save(input); break;
      case 'work-show': data = workflow().work.show(task()); break;
      case 'work-history': data = {taskId:task(),revisions:local().workHistory(task(),limit).map(row=>compactWork(row as Record<string,any>))}; break;
      case 'content-context':
        if(Object.keys(input).some(k=>k!=='refresh')||input.refresh!==undefined&&typeof input.refresh!=='boolean')throw new Error('Supply only optional refresh:true/false');
        data=await content().context(account!,input.refresh===true);break;
      case 'content-enqueue': data=await content().enqueue(account!,input);break;
      case 'content-persist':
        if(flags.input)throw new Error('Content persist uses the exact saved task result; no input override');
        data=await content().persist(task());break;
      case 'content-status': data=content().status(task());break;
      case 'content-reconcile':
        if(Object.keys(input).some(k=>k!=='id')||typeof input.id!=='string'||!input.id)throw new Error('Supply the known original resource id');
        data=await content().reconcile(task(),input.id);break;
      case 'groups':
      case 'group-package':
        if(Object.keys(input).some(k=>k!=='id')||input.id!==undefined&&typeof input.id!=='string')throw new Error('Supply only an optional id');
        if(command==='group-package'&&!input.id)throw new Error('Supply the prepared handoff id');
        data=command==='group-package'?await contentScc.groupPackage(input.id):input.id?{group:await contentScc.group(input.id)}:{groups:await contentScc.groups(account)};break;
      case 'research-save': data=new AgentResearch(local()).save(input,account);break;
      case 'research-status':
        if(Object.keys(input).some(k=>k!=='topic'))throw new Error('Supply only topic');
        data=new AgentResearch(local()).status(input.topic,account);break;
      case 'runner-config': data=flags.input?configureRunner(local(),input,flags['owner-authorized']===true):runner().config(); break;
      case 'runner-status': data=runner().status(); break;
      case 'runner-show': data=runner().show(run()); break;
      case 'runner-detect': data=await runner().detect(); break;
      case 'runner-control': {
        if(Object.keys(input).some(k=>k!=='action')||!['enable','disable','pause','resume','stop','wake'].includes(input.action))throw new Error('Supply a supported runner control action');
        data=runner().control(input.action,flags['owner-authorized']===true);break;
      }
      case 'runner-recover': data=runner().reconcile(input,flags['owner-authorized']===true);break;
      case 'runner-schedule': data=await manageSchedule(local(),path.resolve(__dirname,'..'),statePath,input,flags['owner-authorized']===true);break;
      case 'runner-tick': {
        const controller=new AbortController(),abort=()=>controller.abort();process.on('SIGINT',abort);process.on('SIGTERM',abort);
        const scheduleId=typeof flags.schedule==='string'?flags.schedule:undefined;
        try{data=await runner().tick(controller.signal,scheduleId);}finally{
          process.off('SIGINT',abort);process.off('SIGTERM',abort);
          if(scheduleId){
            const directory=path.join(path.dirname(statePath),'runner','scheduled');fs.mkdirSync(directory,{recursive:true});
            // Each attempted dispatch gets its own evidence file; duplicates cannot overwrite the original.
            const file=path.join(directory,scheduleId+'-'+Date.now()+'-'+process.pid+'.json');
            fs.writeFileSync(file,JSON.stringify({version,at:new Date().toISOString(),scheduleId,
              execution:local().runnerState('schedule-once:'+scheduleId),result:data??null,
              status:runner().status(),handoff:workflow().handoff(limit)}),{encoding:'utf8',flag:'wx'});
          }
        }break;
      }
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
