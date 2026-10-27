import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  inspectReleaseSource, prepareOwnerRelease, type ReleaseCommandRunner, type ReleasePreparationOptions,
} from '../scripts/lib/owner-release-prepare.js';
import { configurationFingerprint } from '../scripts/lib/owner-release-core.js';
import { fingerprint, type OwnerConfiguration } from '../scripts/lib/owner-runtime-core.js';

const revision = 'a'.repeat(40);
const previousRevision = 'b'.repeat(40);
const blobHash = (bytes: Buffer) => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const isInput = (name: string) => /^(server\/src\/|scripts\/|client\/|package[^/]*\.json$|tsconfig[^/]*\.json$)/.test(name);
const ordered = (value: Record<string, string>) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-release-prepare-'));
  const files: Record<string, Buffer> = Object.fromEntries([
    'server/src/index.ts', 'server/src/loopback-proxy.ts', 'server/src/domain/branding-layout.ts',
    'scripts/owner-runtime.ts', 'scripts/lib/owner-runtime-core.ts', 'scripts/package-owner-release.ts',
    'client/src/App.tsx', 'client/package.json', 'package.json', 'package-lock.json',
    'tsconfig.json', 'tsconfig.operations.json',
  ].map(name => [name, Buffer.from('// committed ' + name + '\n')]));
  const configuration: OwnerConfiguration = {
    workspaceRoot: root, releaseRoot: path.join(root, '.data', 'releases', previousRevision),
    releaseRevision: previousRevision, dataDir: path.join(root, '.data'), envFile: path.join(root, '.env'),
    clientDist: path.join(root, '.data', 'releases', previousRevision, 'client'),
    providerConfig: path.join(root, '.data', 'provider.json'), nodePath: process.execPath,
    runtimeDir: path.join(root, '.data', 'runtime'),
  };
  fs.mkdirSync(configuration.runtimeDir, { recursive: true });
  const ownerConfigFile = path.join(configuration.runtimeDir, 'owner-config.json');
  const ownerConfigBytes = JSON.stringify(configuration);
  fs.writeFileSync(ownerConfigFile, ownerConfigBytes);
  const npmCli = path.join(root, 'fixture-npm-cli.js');
  fs.writeFileSync(npmCli, '// mocked; never executed');
  const state = {
    status: [] as { status: string; name: string; from?: string }[],
    different: [] as string[], onBuild: undefined as (() => void) | undefined,
  };
  const calls: { command: string; args: string[] }[] = [];
  const inputs = () => ordered(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, blobHash(bytes)])));
  const clientInputs = () => ordered(Object.fromEntries(Object.entries(inputs()).filter(([name]) =>
    name.startsWith('client/') || ['package.json', 'package-lock.json', 'server/src/domain/branding-layout.ts'].includes(name))));
  const releaseRoot = path.join(root, '.data', 'releases', revision);
  function createRelease() {
    fs.mkdirSync(releaseRoot, { recursive: true });
    const hashes: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(files)) {
      if (name.startsWith('client/')) continue;
      const file = path.join(releaseRoot, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
      hashes[name] = fingerprint(bytes);
    }
    fs.mkdirSync(path.join(releaseRoot, 'client'), { recursive: true });
    fs.writeFileSync(path.join(releaseRoot, 'client', 'index.html'), '<!doctype html><title>Frozen fixture</title>');
    hashes['client/index.html'] = fingerprint(fs.readFileSync(path.join(releaseRoot, 'client', 'index.html')));
    fs.writeFileSync(path.join(releaseRoot, 'release.json'), JSON.stringify({
      revision, clientInputFingerprint: fingerprint(JSON.stringify(clientInputs())), hashes,
    }));
  }
  const run: ReleaseCommandRunner = (command, args, options) => {
    calls.push({ command, args });
    assert.equal(options.cwd, root);
    if (command === 'git') {
      if (args[0] === 'rev-parse') return revision + '\n';
      if (args[0] === 'status') {
        assert.deepEqual(args.slice(args.indexOf('--') + 1),
          ['server/src', 'scripts', 'client', ':(glob)package*.json', ':(glob)tsconfig*.json']);
        return state.status.filter(item => isInput(item.name) || (item.from && isInput(item.from)))
          .map(item => item.status + ' ' + item.name + '\0' + (item.from ? item.from + '\0' : '')).join('');
      }
      if (args[0] === 'diff') return state.different.filter(isInput).map(name => name + '\0').join('');
      if (args[0] === 'ls-tree') {
        // Real Git ls-tree rejects :(glob) pathspecs even though status/diff accept them.
        assert.ok(!args.some(argument => argument.includes(':(glob)')));
        return Object.entries(inputs()).map(([name, hash]) => '100644 blob ' + hash + '\t' + name + '\0').join('');
      }
      if (args[0] === 'hash-object') {
        assert.deepEqual(args, ['hash-object', '--no-filters', '--stdin-paths']);
        return options.input!.trimEnd().split('\n').map(file => blobHash(fs.readFileSync(file))).join('\n') + '\n';
      }
      throw new Error('Unexpected Git command: ' + args.join(' '));
    }
    assert.equal(command, configuration.nodePath);
    const at = (flag: string) => args[args.indexOf(flag) + 1];
    if (args.includes('--capture-input')) {
      fs.writeFileSync(at('--capture-input'), JSON.stringify({ inputs: clientInputs() }));
    } else if (args[0] === npmCli) {
      assert.deepEqual(args.slice(1), ['run', 'build:client']);
      assert.ok(options.env.SCC_CLIENT_BUILD_DIR!.startsWith(path.join(root, '.data', 'owner-updates') + path.sep));
      assert.notEqual(options.env.SCC_CLIENT_BUILD_DIR, path.join(root, 'client', 'dist'));
      fs.mkdirSync(options.env.SCC_CLIENT_BUILD_DIR!, { recursive: true });
      fs.writeFileSync(path.join(options.env.SCC_CLIENT_BUILD_DIR!, 'index.html'), '<!doctype html>');
      state.onBuild?.();
    } else if (args.includes('--prepare-only')) {
      assert.ok(!args.includes('--configure-owner'));
      assert.equal(at('--revision'), revision);
      assert.deepEqual(JSON.parse(fs.readFileSync(at('--build-input'), 'utf8')).inputs, clientInputs());
      createRelease();
    } else throw new Error('Unexpected preparation command: ' + args.join(' '));
    return 'offline fixture command completed\n';
  };
  const options: ReleasePreparationOptions = {
    run, npmCliPath: npmCli, environment: { SCC_ASSISTANT_FIXTURES: 'false' },
    makePrivateDirectory: directory => { fs.mkdirSync(directory, { recursive: true }); },
    now: () => new Date('2026-10-27T08:00:00Z'), id: () => 'fixture',
  };
  const unchanged = () => assert.equal(fs.readFileSync(ownerConfigFile, 'utf8'), ownerConfigBytes);
  const cleanup = () => {
    const target = fs.realpathSync(root);
    assert.equal(path.dirname(target).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(target).startsWith('scc-release-prepare-'));
    fs.rmSync(target, { recursive: true, force: true });
  };
  return { root, files, configuration, ownerConfigFile, state, calls, options, inputs, releaseRoot, createRelease, unchanged, cleanup };
}

test('release source inspection selects exact HEAD and permits documentation/test-only changes', () => {
  const f = fixture();
  try {
    f.state.status = [{ status: ' M', name: 'docs/review.md' }, { status: '??', name: 'test/new.test.ts' }];
    f.state.different = ['docs/review.md'];
    const inspected = inspectReleaseSource(f.root, undefined, f.options);
    assert.equal(inspected.revision, revision);
    assert.deepEqual(inspected.inputs, f.inputs());
    assert.equal(inspected.clean, true);
    assert.ok(f.calls.every(call => call.command === 'git'));
    f.unchanged();
  } finally { f.cleanup(); }
});

test('staged, unstaged, untracked, deleted and renamed application inputs block preparation before any artifacts or build', () => {
  const f = fixture();
  try {
    f.state.status = [
      { status: 'M ', name: 'client/package.json' }, { status: ' M', name: 'client/src/App.tsx' },
      { status: '??', name: 'scripts/new.ts' }, { status: ' D', name: 'server/src/removed.ts' },
      { status: 'R ', name: 'scripts/renamed.ts', from: 'scripts/original.ts' },
    ];
    f.state.different = ['package-lock.json', 'tsconfig.operations.json'];
    assert.throws(() => prepareOwnerRelease(f.root, f.configuration, revision, f.options), error => {
      const message = (error as Error).message;
      for (const name of ['client/package.json', 'client/src/App.tsx', 'scripts/new.ts', 'server/src/removed.ts',
        'scripts/renamed.ts', 'scripts/original.ts', 'package-lock.json', 'tsconfig.operations.json']) assert.ok(message.includes(name));
      return true;
    });
    assert.ok(!fs.existsSync(path.join(f.root, '.data', 'owner-updates')));
    assert.ok(f.calls.every(call => call.command === 'git'));
    f.unchanged();
  } finally { f.cleanup(); }
});

test('preparation rejects abbreviated revisions and changed owner paths without writing or invoking build commands', () => {
  const f = fixture();
  try {
    assert.throws(() => inspectReleaseSource(f.root, 'aaaaaaa', f.options), /exact 40-character/);
    assert.throws(() => prepareOwnerRelease(f.root, { ...f.configuration, dataDir: path.join(f.root, 'review') }, revision, f.options), /original database/);
    assert.equal(f.calls.length, 0);
    f.unchanged();
  } finally { f.cleanup(); }
});

test('new release captures inputs before an isolated build, packages prepare-only and binds the candidate to the prior configuration', () => {
  const f = fixture();
  try {
    const prepared = prepareOwnerRelease(f.root, f.configuration, revision, f.options);
    const commands = f.calls.filter(call => call.command !== 'git');
    assert.ok(commands[0].args.includes('--capture-input'));
    assert.deepEqual(commands[1].args.slice(1), ['run', 'build:client']);
    assert.ok(commands[2].args.includes('--prepare-only'));
    assert.equal(prepared.reused, false);
    assert.equal(prepared.receipt.baseConfigurationFingerprint, configurationFingerprint(f.configuration));
    assert.equal(prepared.receipt.previousRevision, previousRevision);
    assert.equal(prepared.candidateConfiguration.dataDir, f.configuration.dataDir);
    assert.equal(prepared.candidateConfiguration.envFile, f.configuration.envFile);
    assert.equal(prepared.candidateConfiguration.providerConfig, f.configuration.providerConfig);
    assert.equal(prepared.candidateConfiguration.releaseRoot, f.releaseRoot);
    assert.equal(prepared.receipt.ownerConfigurationChanged, false);
    assert.equal(prepared.receipt.applicationStarted, false);
    assert.ok(fs.existsSync(prepared.receiptFile));
    f.unchanged();
  } finally { f.cleanup(); }
});

test('a source edit during the build fails before packaging and leaves the active owner pointer untouched', () => {
  const f = fixture();
  try {
    f.state.onBuild = () => { f.state.status.push({ status: ' M', name: 'server/src/index.ts' }); };
    assert.throws(() => prepareOwnerRelease(f.root, f.configuration, revision, f.options), /server\/src\/index.ts/);
    assert.ok(!f.calls.some(call => call.args.includes('--prepare-only')));
    assert.ok(!fs.existsSync(f.releaseRoot));
    const updates = path.join(f.root, '.data', 'owner-updates');
    assert.ok(fs.existsSync(path.join(updates, fs.readdirSync(updates)[0], 'preparation-failed.json')));
    f.unchanged();
  } finally { f.cleanup(); }
});

test('an existing verified release with exact committed source and build provenance is reused without rebuilding or rewriting it', () => {
  const f = fixture();
  try {
    f.createRelease();
    const manifestFile = path.join(f.releaseRoot, 'release.json');
    const before = fs.readFileSync(manifestFile);
    const prepared = prepareOwnerRelease(f.root, f.configuration, revision, f.options);
    assert.equal(prepared.reused, true);
    assert.equal(prepared.receipt.buildDirectory, null);
    assert.deepEqual(fs.readFileSync(manifestFile), before);
    assert.ok(f.calls.every(call => call.command === 'git'));
    f.unchanged();
  } finally { f.cleanup(); }
});

test('self-consistent rewritten manifest and frozen source cannot bypass the canonical Git source check', () => {
  const f = fixture();
  try {
    f.createRelease();
    const sourceFile = path.join(f.releaseRoot, 'server', 'src', 'index.ts');
    fs.writeFileSync(sourceFile, '// rewritten source\n');
    const manifestFile = path.join(f.releaseRoot, 'release.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.hashes['server/src/index.ts'] = fingerprint(fs.readFileSync(sourceFile));
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    assert.throws(() => prepareOwnerRelease(f.root, f.configuration, revision, f.options), /source bytes.*selected commit/);
    assert.ok(!fs.existsSync(path.join(f.root, '.data', 'owner-updates')));
    f.unchanged();
  } finally { f.cleanup(); }
});

test('an existing bundle with mismatched client build provenance is rejected without rebuilding it', () => {
  const f = fixture();
  try {
    f.createRelease();
    const file = path.join(f.releaseRoot, 'release.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.clientInputFingerprint = '0'.repeat(64);
    fs.writeFileSync(file, JSON.stringify(manifest));
    assert.throws(() => prepareOwnerRelease(f.root, f.configuration, revision, f.options), /client build provenance/);
    assert.ok(f.calls.every(call => call.command === 'git'));
    f.unchanged();
  } finally { f.cleanup(); }
});
