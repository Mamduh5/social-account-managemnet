import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fingerprint, type OwnerConfiguration } from '../scripts/lib/owner-runtime-core.js';
import {
  verifyOwnerRelease, candidateOwnerConfiguration, assertCandidateOwnerConfiguration,
  configurationFingerprint, assertConfigurationFingerprint, assertBuildInputsMatch, assertNoSchemaChange,
  acquireOwnerMaintenance, OwnerMaintenanceError,
  type OwnerReleaseManifest,
} from '../scripts/lib/owner-release-core.js';

const revision = 'a'.repeat(40), nextRevision = 'b'.repeat(40);
const temporaryRoots: string[] = [];
function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-release-core-'));
  temporaryRoots.push(workspace);
  const root = path.join(workspace, '.data', 'releases', revision);
  fs.mkdirSync(root, { recursive: true });
  const hashes: Record<string, string> = {};
  for (const name of ['server/src/index.ts', 'server/src/loopback-proxy.ts', 'scripts/owner-runtime.ts',
    'scripts/lib/owner-runtime-core.ts', 'client/index.html', 'client/assets/main.js', 'server/src/db/schema.ts']) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const bytes = Buffer.from('Fixture ' + name);
    fs.writeFileSync(file, bytes);
    hashes[name] = fingerprint(bytes);
  }
  const manifest: OwnerReleaseManifest = { revision, hashes };
  const save = () => fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(manifest));
  save();
  const config: OwnerConfiguration = {
    workspaceRoot: workspace, releaseRoot: root, releaseRevision: revision,
    dataDir: path.join(workspace, '.data'), envFile: path.join(workspace, '.env'),
    clientDist: path.join(root, 'client'), providerConfig: path.join(workspace, '.data', 'provider.json'),
    nodePath: process.execPath, runtimeDir: path.join(workspace, '.data', 'runtime'),
  };
  return { workspace, root, hashes, manifest, save, config };
}
afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('scc-release-core-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('complete frozen bundle verifies without changing its files', () => {
  const f = fixture();
  const before = fs.readFileSync(path.join(f.root, 'release.json'));
  const result = verifyOwnerRelease(f.root, revision);
  assert.equal(result.fileCount, Object.keys(f.hashes).length);
  assert.equal(result.manifestFingerprint, fingerprint(before));
  assert.deepEqual(result.manifest, f.manifest);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'release.json')), before);
});

test('modified, missing and unmanifested runtime files fail closed', () => {
  const f = fixture(), entry = path.join(f.root, 'server', 'src', 'index.ts');
  const original = fs.readFileSync(entry);
  fs.writeFileSync(entry, 'Changed');
  assert.throws(() => verifyOwnerRelease(f.root, revision), /hash mismatch/);
  fs.writeFileSync(entry, original);
  fs.unlinkSync(entry);
  assert.throws(() => verifyOwnerRelease(f.root, revision));
  fs.writeFileSync(entry, original);
  fs.writeFileSync(path.join(f.root, 'unexpected.js'), 'Unexpected');
  assert.throws(() => verifyOwnerRelease(f.root, revision), /unexpected file/);
});

test('empty or incomplete manifests cannot authorize an unverified entrypoint', () => {
  const f = fixture();
  f.manifest.hashes = {};
  f.save();
  assert.throws(() => verifyOwnerRelease(f.root, revision), /required/);
  f.manifest.hashes = { ...f.hashes };
  delete f.manifest.hashes['scripts/owner-runtime.ts'];
  f.save();
  assert.throws(() => verifyOwnerRelease(f.root, revision), /required/);
});

test('manifest rejects traversal, Windows path aliases, invalid hashes and revision mismatch', () => {
  const f = fixture();
  for (const name of ['../outside.ts', '/outside.ts', 'client/../outside.ts', 'client\\asset.js', 'C:/outside.ts',
    'client/asset.js:stream', 'client/assets/asset.js.', 'client/CON', 'CLIENT/INDEX.HTML']) {
    f.manifest.hashes = { ...f.hashes, [name]: 'c'.repeat(64) };
    f.save();
    assert.throws(() => verifyOwnerRelease(f.root, revision), name);
  }
  f.manifest.hashes = { ...f.hashes, 'client/index.html': 'invalid' };
  f.save();
  assert.throws(() => verifyOwnerRelease(f.root, revision), /invalid/);
  f.manifest.hashes = f.hashes;
  f.manifest.revision = nextRevision;
  f.save();
  assert.throws(() => verifyOwnerRelease(f.root, revision), /revision/);
  assert.throws(() => verifyOwnerRelease(f.root, nextRevision), /directory/);
});

test('directory junctions cannot redirect bundled client assets outside the release', () => {
  const f = fixture();
  const outside = path.join(f.workspace, 'outside-assets');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'main.js'), 'Fixture client/assets/main.js');
  fs.renameSync(path.join(f.root, 'client', 'assets'), path.join(f.root, 'saved-assets'));
  fs.symlinkSync(outside, path.join(f.root, 'client', 'assets'), 'junction');
  assert.throws(() => verifyOwnerRelease(f.root, revision), /regular files|symlink|escapes/);
});

test('candidate changes only release identity and keeps original data, environment and configuration', () => {
  const { config } = fixture();
  const candidate = candidateOwnerConfiguration(config, nextRevision);
  assert.equal(candidate.releaseRoot, path.join(config.workspaceRoot, '.data', 'releases', nextRevision));
  assert.equal(candidate.clientDist, path.join(candidate.releaseRoot, 'client'));
  assert.equal(candidate.releaseRevision, nextRevision);
  for (const key of ['workspaceRoot', 'dataDir', 'envFile', 'providerConfig', 'nodePath', 'runtimeDir'] as const) {
    assert.equal(candidate[key], config[key]);
    assert.throws(() => assertCandidateOwnerConfiguration(config, { ...candidate, [key]: path.join(config.workspaceRoot, 'different') }));
  }
  assert.throws(() => candidateOwnerConfiguration(config, 'dirty-' + revision));
  assert.throws(() => assertCandidateOwnerConfiguration(config, { ...candidate, extraSetting: 'new' } as OwnerConfiguration));
});

test('stale owner configuration blocks activation and key order does not invent a change', () => {
  const { config } = fixture();
  const captured = configurationFingerprint(config);
  const reordered = Object.fromEntries(Object.entries(config).reverse()) as unknown as OwnerConfiguration;
  assert.doesNotThrow(() => assertConfigurationFingerprint(reordered, captured));
  assert.throws(() => assertConfigurationFingerprint({ ...config, providerConfig: path.join(config.workspaceRoot, '.data', 'changed.json') }, captured), /changed/);
  assert.throws(() => assertConfigurationFingerprint(config, 'invalid'), /changed/);
});

test('build receipts require the exact current and committed source including added or deleted files', () => {
  const inputs = { 'client/src/App.tsx': 'a'.repeat(40), 'client/package.json': 'b'.repeat(40) };
  const reversed = Object.fromEntries(Object.entries(inputs).reverse());
  assert.doesNotThrow(() => assertBuildInputsMatch(inputs, reversed, inputs));
  assert.throws(() => assertBuildInputsMatch(inputs, { ...inputs, 'client/new.ts': 'c'.repeat(40) }, inputs), /changed/);
  assert.throws(() => assertBuildInputsMatch(inputs, inputs, { 'client/src/App.tsx': inputs['client/src/App.tsx'] }), /commit/);
  assert.throws(() => assertBuildInputsMatch(inputs, inputs, { ...inputs, 'client/package.json': 'd'.repeat(40) }), /commit/);
  assert.throws(() => assertBuildInputsMatch({}, {}, {}), /nonempty/);
  assert.throws(() => assertBuildInputsMatch({ '../outside': 'a'.repeat(40) }, inputs, inputs), /canonical/);
});

test('database source additions, removals or changes require separate maintenance for promotion and rollback', () => {
  const { manifest } = fixture();
  const next = { ...manifest, revision: nextRevision, hashes: { ...manifest.hashes, 'client/index.html': 'f'.repeat(64) } };
  assert.doesNotThrow(() => assertNoSchemaChange(manifest, next));
  for (const hashes of [
    { ...next.hashes, 'server/src/db/schema.ts': 'e'.repeat(64) },
    { ...next.hashes, 'server/src/db/new.ts': 'e'.repeat(64) },
    Object.fromEntries(Object.entries(next.hashes).filter(([name]) => !name.startsWith('server/src/db/'))),
  ]) {
    const changed = { ...next, hashes };
    assert.throws(() => assertNoSchemaChange(manifest, changed), /maintenance/);
    assert.throws(() => assertNoSchemaChange(changed, manifest), /maintenance/);
  }
});

function maintenanceFixture() {
  const f = fixture();
  fs.mkdirSync(f.config.runtimeDir, { recursive: true });
  return {
    ...f, run: path.join(f.workspace, '.data', 'fixture-update'),
    update: path.join(f.config.runtimeDir, 'owner-update.lock'),
    maintenance: path.join(f.config.runtimeDir, 'maintenance.lock'),
  };
}

test('maintenance markers are exclusive, nonce-bound and released idempotently', () => {
  const f = maintenanceFixture();
  const held = acquireOwnerMaintenance(f.config, f.run);
  const update = JSON.parse(fs.readFileSync(f.update, 'utf8'));
  const maintenance = JSON.parse(fs.readFileSync(f.maintenance, 'utf8'));
  assert.equal(update.runDirectory, f.run);
  assert.equal(maintenance.runDirectory, f.run);
  assert.notEqual(update.nonce, maintenance.nonce);
  assert.throws(() => acquireOwnerMaintenance(f.config, f.run), { code: 'EEXIST' });
  assert.equal(JSON.parse(fs.readFileSync(f.update, 'utf8')).nonce, update.nonce);
  held.release();
  assert.equal(fs.existsSync(f.update), false);
  assert.equal(fs.existsSync(f.maintenance), false);
  assert.doesNotThrow(() => held.release());
});

test('a preexisting maintenance marker is preserved when acquiring the second lock fails', () => {
  const f = maintenanceFixture();
  fs.writeFileSync(f.maintenance, 'Other maintenance owner');
  assert.throws(() => acquireOwnerMaintenance(f.config, f.run), { code: 'EEXIST' });
  assert.equal(fs.existsSync(f.update), false);
  assert.equal(fs.readFileSync(f.maintenance, 'utf8'), 'Other maintenance owner');
});

test('initial and partial write failures close every owned descriptor and release created markers', () => {
  for (const failureAt of [1, 2]) {
    const f = maintenanceFixture(), descriptors: number[] = [];
    let writes = 0;
    assert.throws(() => acquireOwnerMaintenance(f.config, f.run, {
      writeFile(fd, bytes) {
        descriptors.push(fd);
        if (++writes === failureAt) {
          if (failureAt === 2) fs.writeSync(fd, bytes.subarray(0, 35));
          throw new Error('Fixture write failure');
        }
        fs.writeFileSync(fd, bytes);
      },
    }), /Fixture write failure/);
    for (const fd of descriptors) assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' });
    assert.equal(fs.existsSync(f.update), false);
    assert.equal(fs.existsSync(f.maintenance), false);
  }
});

test('cleanup attempts both locks after an unlink failure and retains only pending work for retry', () => {
  const f = maintenanceFixture(), attempted: string[] = [];
  let fail = true;
  const held = acquireOwnerMaintenance(f.config, f.run, {
    unlinkFile(file) {
      attempted.push(file);
      if (file === f.maintenance && fail) throw new Error('Fixture unlink failure');
      fs.unlinkSync(file);
    },
  });
  assert.throws(() => held.release(), error => error instanceof AggregateError && error.errors.length === 1);
  assert.deepEqual(attempted, [f.maintenance, f.update]);
  assert.equal(fs.existsSync(f.update), false);
  assert.equal(fs.existsSync(f.maintenance), true);
  fail = false;
  held.release();
  assert.deepEqual(attempted, [f.maintenance, f.update, f.maintenance]);
  assert.doesNotThrow(() => held.release());
});

test('failed reads are aggregated and retained for retry even when their error says ENOENT', () => {
  const f = maintenanceFixture(), attempted: string[] = [];
  let fail = true;
  const held = acquireOwnerMaintenance(f.config, f.run, {
    readFile(file) {
      attempted.push(file);
      if (fail) throw Object.assign(new Error('Fixture read failure'), { code: 'ENOENT' });
      return fs.readFileSync(file);
    },
  });
  assert.throws(() => held.release(), error => error instanceof AggregateError && error.errors.length === 2);
  assert.deepEqual(attempted, [f.maintenance, f.update]);
  assert.equal(fs.existsSync(f.update), true);
  assert.equal(fs.existsSync(f.maintenance), true);
  fail = false;
  held.release();
  assert.equal(fs.existsSync(f.update), false);
  assert.equal(fs.existsSync(f.maintenance), false);
});

test('another actor modifying an owned marker never authorizes removing that marker', () => {
  const f = maintenanceFixture();
  const held = acquireOwnerMaintenance(f.config, f.run);
  fs.writeFileSync(f.maintenance, 'Other actor record');
  assert.throws(() => held.release(), AggregateError);
  assert.equal(fs.readFileSync(f.maintenance, 'utf8'), 'Other actor record');
  assert.equal(fs.existsSync(f.update), false, 'Cleanup still attempts the other owned lock');
  assert.throws(() => held.release(), AggregateError);
  assert.equal(fs.readFileSync(f.maintenance, 'utf8'), 'Other actor record');
  fs.unlinkSync(f.maintenance);
  assert.doesNotThrow(() => held.release());
});

test('replacing an owned marker with another inode is preserved independently of its matching bytes', () => {
  const f = maintenanceFixture();
  const held = acquireOwnerMaintenance(f.config, f.run);
  const bytes = fs.readFileSync(f.maintenance);
  // Keep the original inode alive so the replacement cannot immediately reuse it.
  const displaced = path.join(f.config.runtimeDir, 'displaced-fixture.lock');
  fs.renameSync(f.maintenance, displaced);
  fs.writeFileSync(f.maintenance, bytes);
  assert.throws(() => held.release(), AggregateError);
  assert.deepEqual(fs.readFileSync(f.maintenance), bytes);
  assert.equal(fs.existsSync(f.update), false);
  fs.unlinkSync(f.maintenance);
  assert.doesNotThrow(() => held.release());
});

test('acquisition failure exposes retryable aggregate cleanup when a partial marker cannot be removed', () => {
  const f = maintenanceFixture();
  let failUnlink = true, fd: number | undefined;
  let failure: OwnerMaintenanceError | undefined;
  try {
    acquireOwnerMaintenance(f.config, f.run, {
      writeFile(descriptor, bytes) {
        fd = descriptor;
        fs.writeSync(descriptor, bytes.subarray(0, 20));
        throw new Error('Fixture partial write failure');
      },
      unlinkFile(file) {
        if (failUnlink) throw new Error('Fixture cleanup failure');
        fs.unlinkSync(file);
      },
    });
    assert.fail('Acquisition must fail');
  } catch (error) {
    assert.ok(error instanceof OwnerMaintenanceError);
    failure = error;
  }
  assert.ok(failure);
  assert.equal(failure.errors.length, 2);
  assert.match((failure.errors[0] as Error).message, /partial write/);
  assert.throws(() => fs.fstatSync(fd!), { code: 'EBADF' });
  assert.equal(fs.existsSync(f.update), true);
  failUnlink = false;
  failure.release();
  assert.equal(fs.existsSync(f.update), false);
  assert.doesNotThrow(() => failure!.release());
});
