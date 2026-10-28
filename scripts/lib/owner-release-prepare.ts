import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  fingerprint, privateDirectory, redactRuntimeLog, validateOwnerConfiguration, writeJson,
  type OwnerConfiguration,
} from './owner-runtime-core.js';
import {
  candidateOwnerConfiguration, configurationFingerprint, verifyOwnerRelease,
} from './owner-release-core.js';

const sourcePaths = ['server/src', 'scripts', 'client', ':(glob)package*.json', ':(glob)tsconfig*.json'];
// ls-tree does not accept glob pathspec magic. These match the packager's
// committed source and client provenance inputs; status/diff above stay broader.
const treePaths = ['server/src', 'scripts', 'client', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.operations.json'];
const exactRevision = /^[a-f0-9]{40}$/;

export interface ReleaseCommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  encoding: 'utf8' | null;
  input?: string;
}
export type ReleaseCommandRunner = (command: string, args: string[], options: ReleaseCommandOptions) => string | Buffer;

/** Injection is limited to command execution and local artifact plumbing for offline tests. */
export interface ReleasePreparationOptions {
  run?: ReleaseCommandRunner;
  makePrivateDirectory?: typeof privateDirectory;
  verifyRelease?: typeof verifyOwnerRelease;
  environment?: NodeJS.ProcessEnv;
  npmCliPath?: string;
  now?: () => Date;
  id?: () => string;
}

const defaultRunner: ReleaseCommandRunner = (command, args, options) => execFileSync(command, args, {
  ...options, windowsHide: true, maxBuffer: 20_000_000,
});
function command(root: string, options: ReleasePreparationOptions, name: string, args: string[], input?: string) {
  return (options.run || defaultRunner)(name, args, {
    cwd: root, env: options.environment || process.env, encoding: 'utf8', input,
  }).toString();
}
function git(root: string, options: ReleasePreparationOptions, args: string[], input?: string) {
  return command(root, options, 'git', args, input);
}
function orderedEntries(entries: [string, string][]) {
  return Object.fromEntries(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
function changedStatusFiles(status: string) {
  const records = status.split('\0').filter(Boolean);
  const files: string[] = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    files.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) files.push(records[++index] || '(missing rename source)');
  }
  return files;
}

/** Inspect only Git metadata. Documentation/test edits do not make an application release dirty. */
export function inspectReleaseSource(root: string, revision?: string, options: ReleasePreparationOptions = {}) {
  const workspace = path.resolve(root);
  const selected = revision ?? git(workspace, options, ['rev-parse', '--verify', 'HEAD']).trim();
  if (!exactRevision.test(selected)) throw new Error('Release preparation requires an exact 40-character committed revision');
  let committed: string;
  try { committed = git(workspace, options, ['rev-parse', '--verify', selected + '^{commit}']).trim(); }
  catch { throw new Error('Selected release revision is not an available Git commit: ' + selected); }
  if (committed !== selected) throw new Error('Selected release revision must identify the commit itself');
  const dirty = changedStatusFiles(git(workspace, options, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...sourcePaths]));
  const different = git(workspace, options, ['diff', '--name-only', '-z', selected, '--', ...sourcePaths]).split('\0').filter(Boolean);
  const changed = [...new Set([...dirty, ...different])].sort();
  if (changed.length) {
    throw new Error('Release application inputs must be clean and match the selected commit. Preserve and checkpoint these files before updating:\n' + changed.map(file => '  ' + file).join('\n'));
  }
  const tree = git(workspace, options, ['ls-tree', '-r', '-z', selected, '--', ...treePaths]);
  const entries: [string, string][] = tree.split('\0').filter(Boolean).map(record => {
    const match = /^(\d+) blob ([a-f0-9]{40,64})\t([^\x00-\x1f]+)$/.exec(record);
    if (!match || !['100644', '100755'].includes(match[1])) throw new Error('Release application inputs must contain only regular committed files');
    return [match[3], match[2]];
  });
  if (!entries.length) throw new Error('Selected commit contains no release application inputs');
  const inputs = orderedEntries(entries);
  return { revision: selected, inputs, sourceFingerprint: fingerprint(JSON.stringify(inputs)), clean: true as const };
}

function isPackagedSource(name: string) {
  return name.startsWith('server/src/') || name.startsWith('scripts/') ||
    ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.operations.json'].includes(name);
}
function buildInputs(inputs: Record<string, string>) {
  return orderedEntries(Object.entries(inputs).filter(([name]) => name.startsWith('client/') ||
    ['package.json', 'package-lock.json', 'server/src/domain/branding-layout.ts', 'server/src/domain/groups.ts'].includes(name)));
}
export function verifyCommittedRelease(root: string, releaseRoot: string, source: ReturnType<typeof inspectReleaseSource>, options: ReleasePreparationOptions = {}) {
  const verified = (options.verifyRelease || verifyOwnerRelease)(releaseRoot, source.revision);
  const names = Object.keys(source.inputs).filter(isPackagedSource);
  const sourceSet = new Set(names);
  if (!names.length || names.some(name => !Object.hasOwn(verified.manifest.hashes, name)) ||
      Object.keys(verified.manifest.hashes).some(name => !name.startsWith('client/') && !sourceSet.has(name))) {
    throw new Error('Frozen release source file set does not match the selected commit');
  }
  // Hash raw frozen bytes as Git blobs without clean filters: CRLF conversion must
  // not conceal a bundle whose canonical committed source bytes were changed.
  const hashes = git(root, options, ['hash-object', '--no-filters', '--stdin-paths'],
    names.map(name => path.join(releaseRoot, ...name.split('/'))).join('\n') + '\n').trim().split(/\r?\n/);
  if (hashes.length !== names.length || names.some((name, index) => hashes[index] !== source.inputs[name])) {
    throw new Error('Frozen release source bytes do not match the exact selected commit');
  }
  if (verified.manifest.clientInputFingerprint !== fingerprint(JSON.stringify(buildInputs(source.inputs)))) {
    throw new Error('Frozen client build provenance does not match the selected commit');
  }
  return verified;
}

/** Prepare/reuse immutable assets and a candidate receipt. Never activate or start the owner. */
export function prepareOwnerRelease(root: string, configuration: OwnerConfiguration, revision?: string, options: ReleasePreparationOptions = {}) {
  validateOwnerConfiguration(configuration);
  const workspace = path.resolve(root);
  if (workspace.toLowerCase() !== path.resolve(configuration.workspaceRoot).toLowerCase()) {
    throw new Error('Release preparation must use the configured owner workspace');
  }
  const source = inspectReleaseSource(workspace, revision, options);
  const candidate = candidateOwnerConfiguration(configuration, source.revision);
  const baseConfigurationFingerprint = configurationFingerprint(configuration);
  const now = options.now || (() => new Date());
  const id = (options.id || randomUUID)();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Preparation identifier must be a safe directory name');
  const runDirectory = path.join(workspace, '.data', 'owner-updates', now().toISOString().replace(/[:.]/g, '-') + '-' + id);
  const reused = fs.existsSync(candidate.releaseRoot);
  let verified = reused ? verifyCommittedRelease(workspace, candidate.releaseRoot, source, options) : undefined;
  const makePrivate = options.makePrivateDirectory || privateDirectory;
  makePrivate(path.dirname(runDirectory));
  if (fs.existsSync(runDirectory)) throw new Error('Release preparation artifacts already exist; use a new preparation identifier');
  makePrivate(runDirectory);
  const buildDirectory = path.join(runDirectory, 'client-build');
  const buildInputFile = path.join(runDirectory, 'client-input.json');
  const runLogged = (label: string, args: string[]) => {
    try {
      const output = command(workspace, {
        ...options,
        environment: { ...(options.environment || process.env), SCC_CLIENT_BUILD_DIR: buildDirectory },
      }, configuration.nodePath, args);
      fs.writeFileSync(path.join(runDirectory, label + '.log'), redactRuntimeLog(output), { flag: 'wx' });
    } catch (error) {
      const failure = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
      fs.writeFileSync(path.join(runDirectory, label + '.log'), redactRuntimeLog([
        failure.message, failure.stdout?.toString(), failure.stderr?.toString(),
      ].filter(Boolean).join('\n')), { flag: 'wx' });
      throw new Error('Release ' + label + ' failed; inspect private preparation logs in ' + runDirectory);
    }
  };
  try {
    if (!reused) {
      const npmCli = options.npmCliPath || (options.environment || process.env).npm_execpath ||
        path.join(path.dirname(configuration.nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (!fs.existsSync(npmCli)) throw new Error('Installed npm CLI is unavailable; no dependency installation was attempted');
      const packager = path.join(workspace, 'scripts', 'package-owner-release.ts');
      runLogged('capture-input', ['--import', 'tsx', packager, '--capture-input', buildInputFile]);
      runLogged('client-build', [npmCli, 'run', 'build:client']);
      // Covers backend/controller edits as well as the packager's client input gate.
      const afterBuild = inspectReleaseSource(workspace, source.revision, options);
      if (afterBuild.sourceFingerprint !== source.sourceFingerprint) throw new Error('Release application inputs changed during the build');
      runLogged('package', ['--import', 'tsx', packager, '--prepare-only', '--revision', source.revision,
        '--client-dir', buildDirectory, '--build-input', buildInputFile]);
      verified = verifyCommittedRelease(workspace, candidate.releaseRoot, source, options);
    }
    const receipt = {
      preparedAt: now().toISOString(), revision: source.revision, previousRevision: configuration.releaseRevision,
      baseConfigurationFingerprint, sourceFingerprint: source.sourceFingerprint,
      releaseRoot: candidate.releaseRoot, runDirectory, reused,
      buildDirectory: reused ? null : buildDirectory, buildInputFile: reused ? null : buildInputFile,
      manifestFingerprint: verified!.manifestFingerprint, manifestFiles: verified!.fileCount,
      candidateConfiguration: candidate, ownerConfigurationChanged: false, applicationStarted: false,
    };
    const receiptFile = path.join(runDirectory, 'preparation.json');
    writeJson(path.join(runDirectory, 'candidate-owner-config.json'), candidate);
    writeJson(receiptFile, receipt);
    return { revision: source.revision, releaseRoot: candidate.releaseRoot, candidateConfiguration: candidate,
      manifest: verified!.manifest, receipt, receiptFile, reused };
  } catch (error) {
    writeJson(path.join(runDirectory, 'preparation-failed.json'), {
      failedAt: now().toISOString(), revision: source.revision, baseConfigurationFingerprint,
      ownerConfigurationChanged: false, applicationStarted: false,
      error: redactRuntimeLog(error instanceof Error ? error.message : String(error)),
    });
    throw error;
  }
}
