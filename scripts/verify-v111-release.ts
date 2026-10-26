import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { calendarSchemaReady } from '../server/src/db/calendar-schema.js';
import { fingerprint, privateDirectory, readJson, redactRuntimeLog, writeJson } from './lib/owner-runtime-core.js';

interface ReleaseManifest { revision: string; hashes: Record<string, string> }
const root = path.resolve(__dirname, '..');
const preparationRoot = path.join(root, '.data', 'v111-integration');
const smokeRoot = path.join(preparationRoot, '20261026', 'frozen-smoke');
const port = 3198;
const base = 'http://127.0.0.1:' + port;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function inside(directory: string, candidate: string) {
  const relative = path.relative(directory, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function hashFile(file: string) { return fingerprint(fs.readFileSync(file)); }
async function fetchJson(endpoint: string) {
  const response = await fetch(base + endpoint, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error('Frozen smoke API failed: ' + endpoint + ' (' + response.status + ')');
  return response.json() as Promise<any>;
}
async function copyDatabase(sourcePath: string, target: string) {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try { await source.backup(target); } finally { source.close(); }
  const copy = new Database(target, { readonly: true, fileMustExist: true });
  try {
    if (copy.pragma('integrity_check', { simple: true }) !== 'ok' || (copy.pragma('foreign_key_check') as unknown[]).length) throw new Error('Smoke database copy validation failed');
  } finally { copy.close(); }
}
async function waitForExit(child: ChildProcess, timeout = 5000) {
  for (let elapsed = 0; elapsed < timeout; elapsed += 100) {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    await sleep(100);
  }
  return false;
}
async function main() {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) if (!['--release-dir', '--database'].includes(args[index]) || !args[index + 1]) throw new Error('Usage: --release-dir FROZEN_RELEASE --database OFFLINE_REHEARSAL_COPY');
  const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const releaseName = option('--release-dir'), databaseName = option('--database');
  if (!releaseName || !databaseName) throw new Error('Provide the frozen --release-dir and an offline --database rehearsal copy');
  const releaseDir = fs.realpathSync(path.resolve(releaseName));
  const sourcePath = fs.realpathSync(path.resolve(databaseName));
  if (!inside(preparationRoot, sourcePath)) throw new Error('Smoke source must be an offline copy inside .data/v111-integration; never use the owner database');
  const manifest = readJson(path.join(releaseDir, 'release.json')) as ReleaseManifest;
  if (!/^[a-f0-9]{40}$/.test(manifest.revision) || path.basename(releaseDir) !== manifest.revision || !inside(path.join(root, '.data', 'releases'), releaseDir)) throw new Error('Frozen release path/revision mismatch');
  const entries = Object.entries(manifest.hashes);
  if (!entries.length) throw new Error('Release manifest is empty');
  for (const [name, expected] of entries) {
    const absolute = path.resolve(releaseDir, name);
    if (!inside(releaseDir, absolute) || !inside(releaseDir, fs.realpathSync(absolute)) || hashFile(absolute) !== expected) throw new Error('Frozen manifest hash mismatch: ' + name);
  }
  if (!manifest.hashes['server/src/index.ts'] || !manifest.hashes['client/index.html']) throw new Error('Frozen source/client entrypoints are absent from the manifest');
  const sourceHash = hashFile(sourcePath);
  privateDirectory(smokeRoot);
  const run = fs.mkdtempSync(path.join(smokeRoot, 'run-'));
  privateDirectory(run);
  const appDir = path.join(run, 'app'); fs.mkdirSync(appDir);
  await copyDatabase(sourcePath, path.join(appDir, 'social_command_center.db'));
  const inspected = new Database(path.join(appDir, 'social_command_center.db'), { readonly: true, fileMustExist: true });
  try {
    if (!calendarSchemaReady(inspected)) throw new Error('Prepared smoke source lacks the complete V1.11 calendar schema');
    if ((inspected.prepare('SELECT count(*) n FROM publishing_campaigns').get() as { n: number }).n !== 0) throw new Error('Expected zero owner campaigns; smoke must not approve or activate content');
  } finally { inspected.close(); }
  const envFile = path.join(run, 'isolated.env');
  fs.writeFileSync(envFile, '# Frozen release smoke only. No owner environment is loaded.\n');
  const wrapper = path.join(run, 'blocked-server.cjs');
  fs.writeFileSync(wrapper, 'globalThis.fetch = async () => { console.error("[Frozen smoke] PROVIDER_FETCH_BLOCKED"); throw new Error("All provider calls are blocked in frozen smoke"); };\nvoid import(' + JSON.stringify(pathToFileURL(path.join(releaseDir, 'server', 'src', 'index.ts')).href) + ');\n');
  const logs: Record<string, string> = {};
  const checks: string[] = ['all ' + entries.length + ' frozen manifest hashes match'];
  async function runChild(dataDir: string, label: string, expectLegacyRefusal = false) {
    const instance = 'frozen-smoke-' + randomUUID();
    const control = randomBytes(32).toString('hex');
    const child = spawn(process.execPath, ['--import', 'tsx', wrapper], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, PORT: String(port), SCC_DATA_DIR: dataDir,
        SCC_CLIENT_DIST: path.join(releaseDir, 'client'), DOTENV_CONFIG_PATH: envFile,
        SCC_OWNER_MANAGED: 'true', SCC_ISOLATED_TEST: 'true', SCC_PAUSE_WORKERS: 'true', SCC_SEED_DEMOS: 'false',
        SCC_ASSISTANT_PROVIDER_CONFIG: '', SCC_ASSISTANT_FIXTURES: 'false',
        SCC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 61).toString('base64'),
        SCC_RELEASE_REVISION: manifest.revision, SCC_RUNTIME_INSTANCE_ID: instance, SCC_RUNTIME_CONTROL_TOKEN: control,
      },
    });
    let output = '', verifiedInstance = false;
    child.stdout!.on('data', data => { output += data.toString(); });
    child.stderr!.on('data', data => { output += data.toString(); });
    child.on('error', error => { output += error.message; });
    try {
      if (expectLegacyRefusal) {
        if (!await waitForExit(child, 15000)) throw new Error('Managed legacy fixture did not refuse startup');
        if (child.exitCode !== 1 || !output.includes('OWNER_V111_SCHEMA_MAINTENANCE_REQUIRED')) throw new Error('Managed legacy fixture failed without the expected maintenance guard');
        const legacy = new Database(path.join(dataDir, 'social_command_center.db'), { readonly: true, fileMustExist: true });
        try { if (legacy.prepare("SELECT name FROM sqlite_master WHERE name='publishing_campaigns'").get()) throw new Error('Managed startup silently added the calendar'); } finally { legacy.close(); }
        checks.push('managed V1.10 fixture refuses startup before calendar DDL');
        return;
      }
      let health: any;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) throw new Error('Frozen managed process exited before readiness');
        try { health = await fetchJson('/api/health'); if (health.ready) break; } catch {}
        await sleep(100);
      }
      if (!health?.ready || health.version !== '1.11.0' || health.releaseRevision !== manifest.revision || health.instance !== 'owner' || health.instanceId !== instance || health.syncEnabled !== false) throw new Error('Frozen managed health/version/instance/worker boundary mismatch');
      verifiedInstance = true;
      checks.push('managed frozen health is 1.11.0 at exact revision with workers paused');
      const campaigns = await fetchJson('/api/calendar/campaigns');
      if (!Array.isArray(campaigns.campaigns) || campaigns.campaigns.length) throw new Error('Smoke calendar must remain empty/unapproved');
      await fetchJson('/api/calendar/health');
      const capabilities = await fetchJson('/api/connectors/capabilities');
      if (!capabilities.capabilities) throw new Error('Connector capability API is unavailable');
      await fetchJson('/api/branding/kits');
      checks.push('calendar, capability and branding APIs are ready; no campaign approved or queued');
      for (const [name, expected] of entries.filter(([name]) => name.startsWith('client/'))) {
        const response = await fetch(base + '/' + name.slice('client/'.length), { signal: AbortSignal.timeout(2000) });
        if (!response.ok || fingerprint(Buffer.from(await response.arrayBuffer())) !== expected) throw new Error('Served frozen client mismatch: ' + name);
      }
      checks.push('every served client asset matches the frozen manifest');
      if (output.includes('PROVIDER_FETCH_BLOCKED')) throw new Error('A provider request was attempted despite paused workers');
    } finally {
      if (verifiedInstance && child.exitCode === null) {
        try { await fetch(base + '/api/internal/runtime/shutdown', { method: 'POST', headers: { 'x-scc-runtime-control': control }, signal: AbortSignal.timeout(2000) }); } catch {}
      }
      if (!await waitForExit(child, 3000)) { child.kill(); await waitForExit(child, 3000); }
      logs[label] = redactRuntimeLog(output);
      fs.writeFileSync(path.join(run, label + '.log'), logs[label]);
    }
  }
  try {
    await runChild(appDir, 'ready');
    const legacyDir = path.join(run, 'legacy-app'); fs.mkdirSync(legacyDir);
    await copyDatabase(sourcePath, path.join(legacyDir, 'social_command_center.db'));
    const legacy = new Database(path.join(legacyDir, 'social_command_center.db'), { fileMustExist: true });
    try {
      legacy.pragma('foreign_keys=OFF');
      legacy.transaction(() => {
        legacy.exec('DROP INDEX idx_drafts_campaign; DROP INDEX idx_posts_campaign; DROP INDEX idx_dest_campaign;');
        for (const table of ['publishing_drafts', 'publishing_posts', 'publishing_destinations']) {
          legacy.exec('ALTER TABLE ' + table + ' DROP COLUMN campaign_id'); legacy.exec('ALTER TABLE ' + table + ' DROP COLUMN origin');
        }
        legacy.exec('DROP TABLE publishing_campaigns');
      })();
    } finally { legacy.close(); }
    await runChild(legacyDir, 'legacy-refusal', true);
    if (hashFile(sourcePath) !== sourceHash) throw new Error('Offline source copy was changed during frozen smoke');
    checks.push('offline source copy is byte-identical; only disposable copies were started');
    const receipt = { verifiedAt: new Date().toISOString(), revision: manifest.revision, releaseDir, runDirectory: run, sandboxPort: port, manifestFiles: entries.length, sourceCopySha256: sourceHash, checks, ownerDatabaseOpened: false, ownerConfigurationChanged: false, providerCalls: 0, campaignApprovalOrQueueActions: 0, passed: true };
    writeJson(path.join(run, 'receipt.json'), receipt);
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    writeJson(path.join(run, 'failure.json'), { failedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error), revision: manifest.revision, ownerDatabaseOpened: false });
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
