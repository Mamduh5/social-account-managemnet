import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {
  activateOwnerRelease, type OwnerReleaseActivationOperations, type OwnerReleaseActivationPlan,
} from '../scripts/lib/owner-release-activation.js';
import { candidateOwnerConfiguration, configurationFingerprint } from '../scripts/lib/owner-release-core.js';
import type { OwnerConfiguration } from '../scripts/lib/owner-runtime-core.js';

// Pure injected fixtures: no process, database, filesystem, network or runtime calls.
function fixture(initiallyRunning = true) {
  const root = path.join(os.tmpdir(), 'scc-owner-activation-fixture');
  const revision = 'a'.repeat(40), releaseRoot = path.join(root, '.data', 'releases', revision);
  const current: OwnerConfiguration = {
    workspaceRoot: root, releaseRoot, releaseRevision: revision,
    dataDir: path.join(root, '.data'), envFile: path.join(root, '.env'),
    clientDist: path.join(releaseRoot, 'client'), providerConfig: path.join(root, '.data', 'provider.json'),
    nodePath: process.execPath, runtimeDir: path.join(root, '.data', 'runtime'),
  };
  const candidate = candidateOwnerConfiguration(current, 'b'.repeat(40));
  const plan: OwnerReleaseActivationPlan = {
    authorized: true, current, candidate, expectedConfigurationFingerprint: configurationFingerprint(current),
  };
  const calls: string[] = [], records: Record<string, unknown>[] = [];
  let active = current, locked = false, running = initiallyRunning;
  const backup = { integrity: 'verified-fixture' };
  const ops: OwnerReleaseActivationOperations = {
    acquire() {
      calls.push('acquire'); assert.equal(locked, false); locked = true;
      let owned = true;
      return () => { if (owned) { calls.push('release'); locked = false; owned = false; } };
    },
    readConfiguration() { calls.push('read'); return active; },
    verify(config) {
      calls.push('verify:' + config.releaseRevision[0]);
      return { revision: config.releaseRevision, hashes: { 'server/src/db/schema.ts': 'c'.repeat(64) } };
    },
    wasRunning() { calls.push('wasRunning'); return running; },
    async stop() { calls.push('stop'); assert.equal(locked, true); running = false; },
    async backup() { calls.push('backup'); assert.equal(locked, true); assert.equal(running, false); return backup; },
    promote(config, expected) {
      calls.push('promote'); assert.equal(locked, true);
      assert.equal(configurationFingerprint(active), expected); active = config;
    },
    refreshStartup() { calls.push('refreshStartup'); assert.equal(locked, true); },
    async start(config) {
      calls.push('start:' + config.releaseRevision[0]); assert.equal(locked, false);
      assert.equal(configurationFingerprint(config), configurationFingerprint(active)); running = true;
    },
    record(event) { records.push(event); },
  };
  return { plan, ops, calls, records, backup, active: () => active, locked: () => locked,
    setActive: (config: OwnerConfiguration) => { active = config; } };
}

test('explicit authorization is required before acquiring or invoking any injected operation', async () => {
  const f = fixture();
  await assert.rejects(() => activateOwnerRelease({ ...f.plan, authorized: false }, f.ops), /authorization/);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.records, []);
});

test('verified activation stops, backs up, promotes and refreshes startup before releasing and restarting', async () => {
  const f = fixture();
  const result = await activateOwnerRelease(f.plan, f.ops);
  assert.deepEqual(f.calls, ['acquire', 'read', 'verify:a', 'verify:b', 'wasRunning', 'stop', 'backup',
    'read', 'promote', 'refreshStartup', 'release', 'start:b']);
  assert.deepEqual(result, { revision: f.plan.candidate.releaseRevision, restarted: true, backup: f.backup });
  assert.equal(f.active().releaseRevision, f.plan.candidate.releaseRevision);
  assert.equal(f.locked(), false);
});

test('an originally stopped runtime stays stopped after activation', async () => {
  const f = fixture(false);
  const result = await activateOwnerRelease(f.plan, f.ops);
  assert.equal(result.restarted, false);
  assert.ok(f.calls.includes('stop')); assert.ok(f.calls.includes('backup'));
  assert.ok(!f.calls.some(call => call.startsWith('start:')));
  assert.equal(f.locked(), false);
});

test('invalid candidate and stale preparation fail before a stop or backup', async () => {
  const invalid = fixture();
  await assert.rejects(() => activateOwnerRelease({ ...invalid.plan,
    candidate: { ...invalid.plan.candidate, providerConfig: path.join(invalid.plan.current.dataDir, 'changed.json') },
  }, invalid.ops), /only the pinned release/);
  assert.deepEqual(invalid.calls, []);
  const stale = fixture();
  stale.setActive({ ...stale.plan.current, providerConfig: path.join(stale.plan.current.dataDir, 'changed.json') });
  await assert.rejects(() => activateOwnerRelease(stale.plan, stale.ops), /configuration changed/);
  assert.deepEqual(stale.calls, ['acquire', 'read', 'release']);
});

test('both release manifests and unchanged database sources are required before stopping', async () => {
  const f = fixture();
  f.ops.verify = config => {
    f.calls.push('verify:' + config.releaseRevision[0]);
    return { revision: config.releaseRevision, hashes: {
      'server/src/db/schema.ts': (config.releaseRevision === f.plan.current.releaseRevision ? 'c' : 'd').repeat(64),
    } };
  };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /schema maintenance/);
  assert.deepEqual(f.calls, ['acquire', 'read', 'verify:a', 'verify:b', 'release']);
});

test('failed stop releases the exclusion without backup, promotion or a blind restart', async () => {
  const f = fixture();
  f.ops.stop = async () => { f.calls.push('stop'); throw new Error('stop failed fixture'); };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /stop failed fixture/);
  assert.ok(!f.calls.includes('backup')); assert.ok(!f.calls.includes('promote'));
  assert.ok(!f.calls.some(call => call.startsWith('start:')));
  assert.equal(f.calls.at(-1), 'release'); assert.equal(f.locked(), false);
});

test('failed backup keeps the original pointer and restarts it only after releasing the exclusion', async () => {
  const f = fixture();
  f.ops.backup = async () => { f.calls.push('backup'); throw new Error('backup failed fixture'); };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /backup failed fixture/);
  assert.ok(!f.calls.includes('promote'));
  assert.deepEqual(f.calls.slice(-3), ['read', 'release', 'start:a']);
  assert.equal(f.active(), f.plan.current);
});

test('failed backup does not start a runtime that was already stopped', async () => {
  const f = fixture(false);
  f.ops.backup = async () => { f.calls.push('backup'); throw new Error('backup failed fixture'); };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /backup failed fixture/);
  assert.ok(!f.calls.some(call => call.startsWith('start:')));
  assert.equal(f.active(), f.plan.current);
  assert.equal(f.locked(), false);
});

test('configuration drift after backup blocks promotion and any automatic restart', async () => {
  const f = fixture();
  f.ops.backup = async () => {
    f.calls.push('backup');
    f.setActive({ ...f.plan.current, providerConfig: path.join(f.plan.current.dataDir, 'changed.json') });
    return f.backup;
  };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /configuration changed/);
  assert.ok(!f.calls.includes('promote'));
  assert.ok(!f.calls.some(call => call.startsWith('start:')));
  assert.equal(f.calls.at(-1), 'release'); assert.equal(f.locked(), false);
});

test('a promotion that changes the pointer then throws never rolls back or restarts the original', async () => {
  const f = fixture();
  f.ops.promote = config => { f.calls.push('promote'); f.setActive(config); throw new Error('post-rename failure'); };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /post-rename failure/);
  assert.equal(f.active().releaseRevision, f.plan.candidate.releaseRevision);
  assert.ok(!f.calls.some(call => call.startsWith('start:')));
  assert.ok(f.records.some(event => event.event === 'owner_release_activation_rollback_required'));
  assert.equal(f.locked(), false);
});

test('startup refresh failure leaves the promoted candidate and records an actionable rollback gate', async () => {
  const f = fixture();
  f.ops.refreshStartup = () => { f.calls.push('refreshStartup'); throw new Error('startup refresh failure'); };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /startup refresh failure/);
  assert.equal(f.active().releaseRevision, f.plan.candidate.releaseRevision);
  assert.ok(!f.calls.some(call => call.startsWith('start:')));
  assert.ok(f.records.some(event => /separately verified and authorized rollback/.test(String(event.recovery))));
  assert.equal(f.locked(), false);
});

test('candidate start failure keeps the promoted pointer and never performs automatic rollback', async () => {
  const f = fixture();
  f.ops.start = async config => {
    f.calls.push('start:' + config.releaseRevision[0]); assert.equal(f.locked(), false);
    throw new Error('candidate start failure');
  };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /candidate start failure/);
  assert.equal(f.active().releaseRevision, f.plan.candidate.releaseRevision);
  assert.equal(f.calls.filter(call => call === 'promote').length, 1);
  assert.ok(!f.calls.includes('start:a'));
  assert.ok(f.records.some(event => event.event === 'owner_release_activation_rollback_required'));
});

test('audit failure after stopping cannot leak the owned exclusion', async () => {
  const f = fixture();
  f.ops.backup = async () => { f.calls.push('backup'); throw new Error('backup failed fixture'); };
  f.ops.record = event => { if (event.event !== 'owner_release_activation_verified') throw new Error('audit failed fixture'); };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), AggregateError);
  assert.equal(f.locked(), false);
  assert.equal(f.calls.filter(call => call === 'release').length, 1);
});

test('failed acquisition never releases an exclusion this operation does not own', async () => {
  const f = fixture();
  f.ops.acquire = () => { f.calls.push('acquire'); throw new Error('another update owns exclusion'); };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /another update owns exclusion/);
  assert.deepEqual(f.calls, ['acquire']);
});

test('failed exclusion release blocks startup and records the maintenance recovery requirement', async () => {
  const f = fixture();
  f.ops.acquire = () => {
    f.calls.push('acquire');
    return () => { f.calls.push('release'); throw new Error('release failed fixture'); };
  };
  // This fixture supplies its own exclusion, so assertions about that exclusion
  // remain in the injected operations rather than touching a real lock file.
  f.ops.stop = async () => { f.calls.push('stop'); };
  f.ops.backup = async () => { f.calls.push('backup'); return f.backup; };
  f.ops.promote = config => { f.calls.push('promote'); f.setActive(config); };
  f.ops.refreshStartup = () => { f.calls.push('refreshStartup'); };
  await assert.rejects(() => activateOwnerRelease(f.plan, f.ops), /release failed fixture/);
  assert.ok(!f.calls.some(call => call.startsWith('start:')));
  assert.equal(f.active().releaseRevision, f.plan.candidate.releaseRevision);
  assert.ok(f.records.some(event => event.event === 'owner_release_activation_exclusion_release_failed'));
  assert.ok(f.records.some(event => event.event === 'owner_release_activation_rollback_required'));
});
