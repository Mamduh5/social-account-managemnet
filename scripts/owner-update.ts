import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import {
  readJson, writeJson, privateDirectory, validateOwnerConfiguration, fingerprint,
  processIdentity, isOwnedProcess, startupScript, redactRuntimeLog,
  type OwnerConfiguration, type OwnerState,
} from './lib/owner-runtime-core.js';
import {
  verifyOwnerRelease, configurationFingerprint, assertConfigurationFingerprint,
  assertCandidateOwnerConfiguration, acquireOwnerMaintenance,
} from './lib/owner-release-core.js';
import { inspectReleaseSource, prepareOwnerRelease } from './lib/owner-release-prepare.js';
import { activateOwnerRelease } from './lib/owner-release-activation.js';
import { assertOwnerQueueSafe } from '../server/src/domain/runtime-recovery.js';
import { retiredManualIds } from './lib/content-reset.js';
import { architectureSchemaReady } from '../server/src/db/architecture-schema.js';

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const configFile = path.join(root, '.data', 'runtime', 'owner-config.json');
const lastUpdateFile = path.join(root, '.data', 'runtime', 'last-owner-update.json');

function parseArguments() {
  let revision: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--revision') {
      revision = args[++index];
      if (!revision || !/^[a-f0-9]{40}$/.test(revision)) throw new Error('--revision requires an exact committed SHA');
    } else if (!['--apply', '--check', '--rollback', '--help'].includes(args[index])) {
      throw new Error('Use --check, --apply, --rollback or --revision SHA');
    }
  }
  if (args.includes('--check') && args.includes('--apply')) throw new Error('--check never activates a release');
  if (args.includes('--rollback') && revision) throw new Error('Rollback uses the saved previous configuration, not --revision');
  return { revision, apply: args.includes('--apply'), check: args.includes('--check'), rollback: args.includes('--rollback') };
}

function readConfiguration(): OwnerConfiguration {
  const config = readJson(configFile) as OwnerConfiguration;
  validateOwnerConfiguration(config);
  if (path.resolve(config.workspaceRoot) !== root || path.resolve(config.runtimeDir) !== path.dirname(configFile)) {
    throw new Error('Owner configuration belongs to another workspace');
  }
  return config;
}

function runtimeState(config: OwnerConfiguration): OwnerState | undefined {
  const file = path.join(config.runtimeDir, 'owner-state.json');
  return fs.existsSync(file) ? readJson(file) as OwnerState : undefined;
}

function ownedRuntime(config: OwnerConfiguration) {
  const state = runtimeState(config);
  return {
    stateRevision: state?.releaseRevision || null,
    backendPid: state?.backend && isOwnedProcess(state.backend, processIdentity(state.backend.pid)) ? state.backend.pid : null,
    proxyPid: state?.proxy && isOwnedProcess(state.proxy, processIdentity(state.proxy.pid)) ? state.proxy.pid : null,
  };
}

function startupFile() {
  if (!process.env.APPDATA) throw new Error('Current-user Startup location is unavailable');
  return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'SocialCommandCenter.vbs');
}

function inspectStartup() {
  const file = startupFile();
  if (!fs.existsSync(file)) return { file, enabled: false, contents: undefined };
  const contents = fs.readFileSync(file, 'utf8');
  if (!contents.includes('Social Command Center current-user startup') || !contents.includes(configFile)) {
    throw new Error('Startup entry ownership differs; it will not be overwritten');
  }
  return { file, enabled: true, contents };
}

function replaceStartup(file: string, contents: string) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, contents, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function lifecycle(config: OwnerConfiguration, action: 'start' | 'stop') {
  // Invoke the frozen controller; it retains authenticated idle-only stop,
  // process ownership, readiness, hash verification and restart holds.
  try {
    execFileSync(config.nodePath, ['--import', 'tsx', path.join(config.releaseRoot, 'scripts', 'owner-runtime.ts'), action, '--config', configFile], {
      cwd: root, windowsHide: true, stdio: 'pipe', maxBuffer: 1_000_000,
    });
  } catch {
    throw new Error(`Managed ${action} did not complete. Inspect private runtime logs; no forced termination or replay was attempted.`);
  }
}

async function portOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    const finish = (open: boolean) => { socket.destroy(); resolve(open); };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(true)); // Unknown is occupied.
  });
}

async function assertStopped(config: OwnerConfiguration) {
  const owned = ownedRuntime(config);
  if (owned.backendPid || owned.proxyPid || await portOpen(3001) || await portOpen(3443)) {
    throw new Error('Owner/proxy have not fully stopped; pointer and database remain unchanged');
  }
}

async function waitForStopped(config: OwnerConfiguration) {
  // The existing controller signals the proxy after the backend drains. Give
  // that owned process a bounded exit window rather than racing its termination.
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { await assertStopped(config); return; }
    catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

async function backupOwner(config: OwnerConfiguration, runDirectory: string) {
  await assertStopped(config);
  const sourcePath = path.join(config.dataDir, 'social_command_center.db');
  const backupFile = path.join(runDirectory, 'owner-before-update.db');
  if (fs.existsSync(backupFile)) throw new Error('Backup target already exists');
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  let protectedFingerprint: string;
  try {
    const jobs = source.prepare(`SELECT pd.id,pd.status,p.scheduled_at,pd.remote_post_id,pd.submission_state
      FROM publishing_destinations pd JOIN publishing_posts p ON p.id=pd.post_id
      WHERE pd.status IN ('preparing','branding','uploading','scheduled')`).all() as any[];
    const holds = source.prepare("SELECT * FROM publishing_destinations WHERE status='awaiting_confirmation' ORDER BY id").all() as any[];
    assertOwnerQueueSafe(jobs, holds.map(row => row.id), Date.now(), retiredManualIds(source));
    if (jobs.some(row => row.submission_state) || source.prepare("SELECT 1 FROM publishing_destinations WHERE status='failed' AND (remote_post_id IS NOT NULL OR submission_state IS NOT NULL) LIMIT 1").get()) {
      throw new Error('Uncertain submission needs reconciliation before release maintenance');
    }
    if (source.prepare("SELECT 1 FROM sync_states WHERE status='syncing' LIMIT 1").get()) {
      throw new Error('Unfinished synchronization requires review before release maintenance');
    }
    protectedFingerprint = fingerprint(JSON.stringify(holds));
    await source.backup(backupFile);
  } finally { source.close(); }
  const copy = new Database(backupFile, { readonly: true, fileMustExist: true });
  try {
    if (copy.pragma('integrity_check', { simple: true }) !== 'ok' || (copy.pragma('foreign_key_check') as unknown[]).length) {
      throw new Error('Backup integrity validation failed');
    }
    if (fingerprint(JSON.stringify(copy.prepare("SELECT * FROM publishing_destinations WHERE status='awaiting_confirmation' ORDER BY id").all())) !== protectedFingerprint!) {
      throw new Error('Protected holds differ in backup');
    }
  } finally { copy.close(); }
  const receipt = { file: backupFile, sha256: fingerprint(fs.readFileSync(backupFile)), integrity: 'ok', foreignKeyViolations: 0, protectedFingerprint: protectedFingerprint! };
  writeJson(path.join(runDirectory, 'backup-receipt.json'), receipt);
  return receipt;
}

function promote(config: OwnerConfiguration, expectedFingerprint: string) {
  const lockFile = path.join(config.runtimeDir, 'controller.lock');
  const identity = processIdentity(process.pid);
  if (!identity) throw new Error('Could not verify release controller identity');
  const fd = fs.openSync(lockFile, 'wx');
  const bytes = JSON.stringify({ pid: process.pid, startedAt: identity.startedAt });
  try {
    fs.writeFileSync(fd, bytes);
    const current = readConfiguration();
    assertConfigurationFingerprint(current, expectedFingerprint);
    assertCandidateOwnerConfiguration(current, config);
    verifyOwnerRelease(config.releaseRoot, config.releaseRevision);
    writeJson(configFile, config);
  } finally {
    fs.closeSync(fd);
    if (fs.readFileSync(lockFile, 'utf8') === bytes) fs.unlinkSync(lockFile);
  }
}

async function main() {
  const options = parseArguments();
  if (args.includes('--help')) {
    console.log('owner:update [--check | --apply] [--revision COMMIT]\nDefault: prepare a clean committed release only. --check reads files/process identity without building or HTTP.\n--apply: prepare/reuse, gracefully stop if needed, verify backup, promote, and restart only if previously running.\nowner:rollback [--apply]: review or activate the saved previous release; never restore the database.');
    return;
  }
  const current = readConfiguration();
  const expectedFingerprint = configurationFingerprint(current);
  const verified = verifyOwnerRelease(current.releaseRoot, current.releaseRevision);
  if (options.check) {
    let source: unknown;
    try { source = { ready: true, revision: inspectReleaseSource(root, options.revision).revision }; }
    catch (error: any) { source = { ready: false, reason: error.message }; }
    const database = new Database(path.join(current.dataDir, 'social_command_center.db'), {readonly:true,fileMustExist:true});
    let architecture;
    try { architecture = {schemaReady:architectureSchemaReady(database),retiredManualHolds:retiredManualIds(database),activationRequiresSchemaCompatibilityReview:true}; }
    finally { database.close(); }
    console.log(JSON.stringify({ readOnly: true, configuredRevision: current.releaseRevision, releaseRoot: current.releaseRoot,
      clientDist: current.clientDist, workingClientDist: path.join(root, 'client', 'dist'), manifestFilesVerified: verified.fileCount,
      runtime: ownedRuntime(current), source, architecture, note: 'build:client does not promote the pinned owner release.' }, null, 2));
    return;
  }
  let candidate: OwnerConfiguration;
  let preparation: unknown;
  if (options.rollback) {
    if (!fs.existsSync(lastUpdateFile)) throw new Error('No saved owner update is available for rollback');
    const last = readJson(lastUpdateFile);
    const receiptPath = path.resolve(last.receiptFile);
    const relative = path.relative(path.join(root, '.data', 'owner-updates'), receiptPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || fs.lstatSync(receiptPath).isSymbolicLink()) {
      throw new Error('Saved rollback receipt must remain inside private owner-update artifacts');
    }
    const previous = readJson(receiptPath);
    if (previous.candidateFingerprint !== expectedFingerprint || !['applied', 'promoted', 'rollback_required'].includes(previous.status)) {
      throw new Error('Saved rollback does not match the current owner configuration');
    }
    candidate = previous.previousConfiguration;
    assertCandidateOwnerConfiguration(current, candidate);
    verifyOwnerRelease(candidate.releaseRoot, candidate.releaseRevision);
    if (!options.apply) {
      console.log(JSON.stringify({ preparedOnly: true, rollbackRevision: candidate.releaseRevision, activeRevision: current.releaseRevision,
        next: 'After owner approval: npm run owner:rollback -- --apply', databaseWillBeRestored: false }, null, 2));
      return;
    }
  } else {
    const prepared = prepareOwnerRelease(root, current, options.revision);
    candidate = prepared.candidateConfiguration;
    preparation = { receiptFile: prepared.receiptFile, manifestFingerprint: prepared.receipt.manifestFingerprint };
    if (!options.apply) {
      console.log(JSON.stringify({ preparedOnly: true, revision: candidate.releaseRevision, releaseRoot: candidate.releaseRoot,
        receiptFile: prepared.receiptFile, activeRevision: current.releaseRevision,
        next: 'After owner approval: npm run owner:update -- --apply' }, null, 2));
      return;
    }
  }
  if (candidate.releaseRevision === current.releaseRevision) {
    console.log('The selected immutable release is already configured; no restart or promotion was performed.');
    return;
  }
  const startup = inspectStartup();
  const updatesRoot = path.join(root, '.data', 'owner-updates');
  privateDirectory(updatesRoot);
  const runDirectory = fs.mkdtempSync(path.join(updatesRoot, options.rollback ? 'rollback-' : 'activate-'));
  privateDirectory(runDirectory);
  const receiptFile = path.join(runDirectory, 'activation.json');
  const receipt: Record<string, any> = { at: new Date().toISOString(), status: 'pending', previousConfiguration: current,
    candidateConfiguration: candidate, candidateFingerprint: configurationFingerprint(candidate), preparation, events: [] };
  writeJson(receiptFile, receipt);
  fs.copyFileSync(configFile, path.join(runDirectory, 'previous-owner-config.json'), fs.constants.COPYFILE_EXCL);
  if (startup.contents !== undefined) fs.writeFileSync(path.join(runDirectory, 'previous-startup.vbs'), startup.contents, { flag: 'wx' });
  const result = await activateOwnerRelease({ authorized: options.apply, current, candidate, expectedConfigurationFingerprint: expectedFingerprint }, {
    acquire: () => acquireOwnerMaintenance(current, runDirectory).release,
    readConfiguration,
    verify: configuration => verifyOwnerRelease(configuration.releaseRoot, configuration.releaseRevision).manifest,
    wasRunning: () => {
      const state = ownedRuntime(current);
      if ((state.backendPid || state.proxyPid) && state.stateRevision !== current.releaseRevision) {
        throw new Error('Running process release differs from configuration; investigate before maintenance');
      }
      return !!(state.backendPid || state.proxyPid);
    },
    stop: async configuration => { lifecycle(configuration, 'stop'); await waitForStopped(configuration); },
    backup: async () => {
      const backup = await backupOwner(current, runDirectory);
      receipt.backup = backup;
      writeJson(receiptFile, receipt);
      return backup;
    },
    promote,
    refreshStartup: configuration => {
      const now = inspectStartup();
      if (now.enabled !== startup.enabled || now.contents !== startup.contents) throw new Error('Startup entry changed during maintenance');
      if (startup.enabled) replaceStartup(startup.file, startupScript(configuration));
    },
    start: async configuration => lifecycle(configuration, 'start'),
    record: event => {
      receipt.events.push({ at: new Date().toISOString(), ...event });
      const statuses: Record<string, string> = {
        owner_release_activation_completed: 'applied',
        owner_release_activation_promoted: 'promoted',
        owner_release_activation_rollback_required: 'rollback_required',
        owner_release_activation_failed: 'failed',
      };
      if (statuses[String(event.event)]) receipt.status = statuses[String(event.event)];
      writeJson(receiptFile, receipt);
      if (['applied', 'promoted', 'rollback_required'].includes(receipt.status) &&
          configurationFingerprint(readConfiguration()) === receipt.candidateFingerprint) {
        writeJson(lastUpdateFile, { receiptFile });
      }
    },
  });
  console.log(JSON.stringify({ ...result, receiptFile, rollback: 'npm run owner:rollback -- --apply' }, null, 2));
}

void main().catch(error => { console.error(redactRuntimeLog(error.message)); process.exitCode = 1; });
