import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {applyGroupsMaintenance, assertGroupsRehearsal} from './lib/groups-maintenance-activation.js';
import {assertDatabaseIntegrity, assertLegacyTablesPreserved, databaseFingerprints, groupsArtifactPath, migrateCheckedGroupsDatabase} from './lib/groups-maintenance.js';
import {acquireOwnerMaintenance, assertConfigurationFingerprint, assertCandidateOwnerConfiguration, configurationFingerprint, verifyOwnerRelease} from './lib/owner-release-core.js';
import {inspectReleaseSource, verifyCommittedRelease} from './lib/owner-release-prepare.js';
import {fingerprint, privateDirectory, processIdentity, readJson, redactRuntimeLog, startupScript, validateOwnerConfiguration, writeJson, type OwnerConfiguration, type OwnerState} from './lib/owner-runtime-core.js';
import {groupsSchemaReady} from '../server/src/db/groups-schema.js';
import {assertOwnerQueueSafe} from '../server/src/domain/runtime-recovery.js';

const root = path.resolve(__dirname, '..');
const configFile = path.join(root, '.data', 'runtime', 'owner-config.json');
const help = 'Separate owner-approved Groups maintenance only. No automatic stop/start/build.\n' +
  'node --import tsx scripts/apply-groups-maintenance.ts --apply --expect-current SHA --preparation PATH --rehearsal PATH\n' +
  'Requires a clean committed source, immutable prepared release, successful copy rehearsal, and an already stopped owner.';

function readConfiguration(): OwnerConfiguration {
  const current = readJson(configFile) as OwnerConfiguration;
  validateOwnerConfiguration(current);
  if (path.resolve(current.workspaceRoot) !== root || path.resolve(current.runtimeDir) !== path.dirname(configFile)) throw new Error('Wrong owner workspace');
  return current;
}
function privateReceipt(input: string, directory: string) {
  const absolute = path.resolve(input), actual = fs.realpathSync(absolute);
  const relative = path.relative(directory, actual);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || actual !== absolute || fs.lstatSync(absolute).isSymbolicLink() || !fs.statSync(actual).isFile()) throw new Error('Receipt must be a regular file in its private artifact directory');
  return readJson(actual);
}
function queueSafe(database: Database.Database) {
  const jobs = database.prepare(`SELECT pd.id,pd.status,p.scheduled_at,pd.remote_post_id,pd.submission_state
    FROM publishing_destinations pd JOIN publishing_posts p ON p.id=pd.post_id
    WHERE pd.status IN ('preparing','branding','uploading','scheduled')`).all() as {id:string;status:string;scheduled_at:string|null;remote_post_id:string|null;submission_state:string|null}[];
  const holds = database.prepare("SELECT id FROM publishing_destinations WHERE status='awaiting_confirmation' ORDER BY id").all() as {id:string}[];
  assertOwnerQueueSafe(jobs, holds.map(row => row.id));
  if (jobs.some(row => row.submission_state) || database.prepare("SELECT 1 FROM publishing_destinations WHERE status='failed' AND (remote_post_id IS NOT NULL OR submission_state IS NOT NULL) LIMIT 1").get()) throw new Error('Uncertain publication requires owner reconciliation');
  if (database.prepare("SELECT 1 FROM sync_states WHERE status='syncing' LIMIT 1").get()) throw new Error('Unfinished synchronization requires owner review');
}
async function reserve(port: number) {
  return await new Promise<net.Server>((resolve, reject) => {
    const server = net.createServer(socket => socket.destroy());
    server.once('error', () => reject(new Error('Owner/proxy port is occupied: ' + port)));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
function protectedFiles(current: OwnerConfiguration) {
  // Hash only. Never print environment values, session state, keys or credentials.
  const certificates = path.join(root, '.data', 'certs');
  const files = [current.envFile, current.providerConfig];
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Protected configuration cannot contain symlinks');
      if (entry.isDirectory()) visit(file); else if (entry.isFile()) files.push(file);
    }
  };
  visit(certificates);
  return Object.fromEntries(files.map(file => [file, fingerprint(fs.readFileSync(file))]));
}
function replaceFile(file: string, bytes: string) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, bytes, {flag:'wx'}); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) { console.log(help); return; }
  const options = new Map<string,string>();
  for (let index=0; index<args.length; index++) {
    const key=args[index];
    if (key==='--apply') { if (options.has(key)) throw new Error('Duplicate argument'); options.set(key,'true'); }
    else if (['--expect-current','--preparation','--rehearsal'].includes(key) && args[index+1] && !args[index+1].startsWith('--') && !options.has(key)) options.set(key,args[++index]);
    else throw new Error(help);
  }
  if (options.get('--apply')!=='true' || !/^[a-f0-9]{40}$/.test(options.get('--expect-current')||'') || !options.has('--preparation') || !options.has('--rehearsal')) throw new Error(help);
  const current=readConfiguration(), expectedFingerprint=configurationFingerprint(current);
  if (current.releaseRevision!==options.get('--expect-current')) throw new Error('Current release changed; maintenance must be reviewed again');
  const prepared=privateReceipt(options.get('--preparation')!,path.join(root,'.data','owner-updates'));
  assertConfigurationFingerprint(current,prepared.baseConfigurationFingerprint);
  const candidate=prepared.candidateConfiguration as OwnerConfiguration;
  assertCandidateOwnerConfiguration(current,candidate);
  if (prepared.previousRevision!==current.releaseRevision || prepared.revision!==candidate.releaseRevision) throw new Error('Preparation does not match this owner release');
  const source=inspectReleaseSource(root,candidate.releaseRevision);
  const verified=verifyCommittedRelease(root,candidate.releaseRoot,source);
  if (verified.manifestFingerprint!==prepared.manifestFingerprint || source.sourceFingerprint!==prepared.sourceFingerprint) throw new Error('Prepared release provenance changed');
  const rehearsal=privateReceipt(options.get('--rehearsal')!,path.join(root,'.data','groups-maintenance'));
  assertGroupsRehearsal(rehearsal,candidate,verified.manifest);
  const target=groupsArtifactPath(root,rehearsal.targetPath,true);
  if (fingerprint(fs.readFileSync(target))!==rehearsal.targetSha256) throw new Error('Rehearsal database changed');
  const rehearsed=new Database(target,{readonly:true,fileMustExist:true});
  try {assertDatabaseIntegrity(rehearsed);if(!groupsSchemaReady(rehearsed))throw new Error('Rehearsal schema is not ready');}finally{rehearsed.close();}
  const databasePath=path.join(current.dataDir,'social_command_center.db');
  if (fs.realpathSync(databasePath)!==databasePath) throw new Error('Owner database must remain at its original canonical path');
  if (!process.env.APPDATA) throw new Error('Current-user Startup path unavailable');
  const startupFile=path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Startup','SocialCommandCenter.vbs');
  const startupBytes=fs.existsSync(startupFile)?fs.readFileSync(startupFile,'utf8'):undefined;
  if (startupBytes!==undefined && (!startupBytes.includes('Social Command Center current-user startup') || !startupBytes.includes(configFile))) throw new Error('Startup ownership mismatch');
  const artifacts=path.join(root,'.data','groups-maintenance');
  privateDirectory(artifacts);
  const runDirectory=fs.mkdtempSync(path.join(artifacts,'apply-')); privateDirectory(runDirectory);
  const receiptFile=path.join(runDirectory,'maintenance.json');
  const receipt: Record<string,unknown>={kind:'groups_owner_maintenance',createdAt:new Date().toISOString(),previousConfiguration:current,candidateConfiguration:candidate,rehearsal:options.get('--rehearsal'),preparation:options.get('--preparation'),status:'pending',applicationStarted:false};
  writeJson(receiptFile,receipt);
  fs.copyFileSync(configFile,path.join(runDirectory,'previous-owner-config.json'),fs.constants.COPYFILE_EXCL);
  if (startupBytes!==undefined) fs.writeFileSync(path.join(runDirectory,'previous-startup.vbs'),startupBytes,{flag:'wx'});
  const protectedBefore=protectedFiles(current), ports: net.Server[]=[];
  let backupTables: ReturnType<typeof databaseFingerprints> | undefined;
  try {
    const result=await applyGroupsMaintenance({authorized:true,current,candidate,expectedConfigurationFingerprint:expectedFingerprint},{
      acquire:()=>acquireOwnerMaintenance(current,runDirectory).release,
      readConfiguration,
      verify:configuration=>verifyOwnerRelease(configuration.releaseRoot,configuration.releaseRevision).manifest,
      assertStopped:async()=>{
        const stateFile=path.join(current.runtimeDir,'owner-state.json');
        const state=fs.existsSync(stateFile)?readJson(stateFile) as OwnerState:undefined;
        if ([state?.backend,state?.proxy].some(process=>process && processIdentity(process.pid))) throw new Error('Owner processes must already be stopped; no stop was attempted');
        ports.push(await reserve(3001)); ports.push(await reserve(3443));
      },
      backup:async()=>{
        const backupFile=path.join(runDirectory,'owner-before-groups.db');
        const database=new Database(databasePath,{readonly:true,fileMustExist:true});
        try {
          assertDatabaseIntegrity(database); queueSafe(database);
          if (groupsSchemaReady(database)) throw new Error('Groups maintenance is already applied; replay is blocked');
          backupTables=databaseFingerprints(database);
          await database.backup(backupFile);
        } finally { database.close(); }
        const saved=new Database(backupFile,{readonly:true,fileMustExist:true});
        try { assertDatabaseIntegrity(saved); assertLegacyTablesPreserved(saved,backupTables!); } finally { saved.close(); }
        const backup={file:backupFile,sha256:fingerprint(fs.readFileSync(backupFile)),integrity:'ok',originalTables:backupTables,foreignKeyViolations:0};
        writeJson(path.join(runDirectory,'backup.json'),backup); return backup;
      },
      migrate:()=>{
        if (JSON.stringify(protectedFiles(current))!==JSON.stringify(protectedBefore)) throw new Error('Protected environment/provider/certificate files changed');
        const database=new Database(databasePath,{fileMustExist:true});
        try {
          database.pragma('foreign_keys=ON');
          assertLegacyTablesPreserved(database,backupTables!); queueSafe(database);
          const migration=migrateCheckedGroupsDatabase(database);
          if (JSON.stringify(protectedFiles(current))!==JSON.stringify(protectedBefore)) throw new Error('Protected files changed during maintenance');
          return migration;
        } finally { database.close(); }
      },
      promote:(configuration,expected)=>{
        const lock=path.join(current.runtimeDir,'controller.lock');
        const identity=processIdentity(process.pid); if (!identity) throw new Error('Cannot verify maintenance controller identity');
        const bytes=JSON.stringify({pid:process.pid,startedAt:identity.startedAt}),fd=fs.openSync(lock,'wx');
        try {
          fs.writeFileSync(fd,bytes); assertConfigurationFingerprint(readConfiguration(),expected);
          verifyOwnerRelease(configuration.releaseRoot,configuration.releaseRevision); writeJson(configFile,configuration);
        } finally { fs.closeSync(fd); if(fs.readFileSync(lock,'utf8')===bytes) fs.unlinkSync(lock); }
      },
      refreshStartup:configuration=>{
        const now=fs.existsSync(startupFile)?fs.readFileSync(startupFile,'utf8'):undefined;
        if (now!==startupBytes) throw new Error('Startup entry changed during maintenance');
        if (startupBytes!==undefined) replaceFile(startupFile,startupScript(configuration));
      },
      record:event=>{Object.assign(receipt,event,{updatedAt:new Date().toISOString()});writeJson(receiptFile,receipt);},
    });
    console.log(JSON.stringify({...result,receiptFile,next:'Owner must separately approve and run npm run owner:start. Cross-schema rollback requires reviewed maintenance; ordinary rollback remains blocked.'},null,2));
  } finally { for (const server of ports) server.close(); }
}
if (require.main===module) void main().catch(error=>{console.error(redactRuntimeLog(error.message));process.exitCode=1;});
