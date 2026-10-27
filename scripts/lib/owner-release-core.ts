import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fingerprint, validateOwnerConfiguration, type OwnerConfiguration } from './owner-runtime-core.js';

export interface OwnerReleaseManifest {
  revision: string;
  hashes: Record<string, string>;
  clientInputFingerprint?: string;
}

const requiredFiles = [
  'server/src/index.ts',
  'server/src/loopback-proxy.ts',
  'scripts/owner-runtime.ts',
  'scripts/lib/owner-runtime-core.ts',
  'client/index.html',
];
const revisionPattern = /^[a-f0-9]{40}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

function relativeName(name: string) {
  // Use portable Git-style names; reject Windows aliases and alternate streams too.
  const parts = name.split('/');
  if (!name || parts.some(part => !part || part === '.' || part === '..' ||
    /[\\\x00-\x1f:*?"<>|]/.test(part) || /[. ]$/.test(part) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Release paths must be canonical relative file names');
  }
  return parts;
}

function regularFile(root: string, name: string) {
  const parts = relativeName(name);
  let absolute = root;
  for (let index = 0; index < parts.length; index++) {
    absolute = path.join(absolute, parts[index]);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error('Release paths must contain only regular files and directories');
    }
  }
  const resolved = path.relative(root, fs.realpathSync(absolute));
  if (!resolved || resolved === '..' || resolved.startsWith('..' + path.sep) || path.isAbsolute(resolved)) {
    throw new Error('Release file escapes the frozen bundle');
  }
  return absolute;
}

/** Read and verify an immutable bundle; never start a process or change its files. */
export function verifyOwnerRelease(releaseRoot: string, expectedRevision: string) {
  const root = path.resolve(releaseRoot);
  if (!path.isAbsolute(releaseRoot) || !revisionPattern.test(expectedRevision) || path.basename(root) !== expectedRevision) {
    throw new Error('Release directory must match its exact committed revision');
  }
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink() ||
      path.relative(root, fs.realpathSync(root)) !== '') {
    throw new Error('Release root must be a canonical directory without symlinks');
  }
  const manifestFile = regularFile(root, 'release.json');
  const manifestBytes = fs.readFileSync(manifestFile);
  const manifest = JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/, '')) as OwnerReleaseManifest;
  if (!manifest || manifest.revision !== expectedRevision || !manifest.hashes ||
      typeof manifest.hashes !== 'object' || Array.isArray(manifest.hashes)) {
    throw new Error('Release manifest revision or file map is invalid');
  }
  const entries = Object.entries(manifest.hashes);
  if (!entries.length || requiredFiles.some(name => !Object.hasOwn(manifest.hashes, name))) {
    throw new Error('Release manifest lacks required runtime or client entrypoints');
  }
  const seen = new Set<string>();
  for (const [name, expected] of entries) {
    relativeName(name);
    if (name.toLowerCase() === 'release.json' || seen.has(name.toLowerCase()) || typeof expected !== 'string' || !sha256Pattern.test(expected)) {
      throw new Error('Release manifest contains an invalid or aliased file entry');
    }
    seen.add(name.toLowerCase());
    if (fingerprint(fs.readFileSync(regularFile(root, name))) !== expected) {
      throw new Error('Frozen release file hash mismatch: ' + name);
    }
  }
  function visit(directory: string, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      relativeName(name);
      if (entry.isSymbolicLink()) throw new Error('Frozen releases cannot contain symlinks');
      if (entry.isDirectory()) visit(path.join(directory, entry.name), name + '/');
      else if (!entry.isFile() || (name !== 'release.json' && !Object.hasOwn(manifest.hashes, name))) {
        throw new Error('Frozen release contains an unexpected file: ' + name);
      }
    }
  }
  visit(root);
  const manifestFingerprint = fingerprint(manifestBytes);
  if (fingerprint(fs.readFileSync(regularFile(root, 'release.json'))) !== manifestFingerprint) {
    throw new Error('Release manifest changed during verification');
  }
  return { manifest, manifestFingerprint, fileCount: entries.length };
}

function canonical(value: Record<string, unknown>) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}

export function configurationFingerprint(configuration: OwnerConfiguration) {
  validateOwnerConfiguration(configuration);
  return fingerprint(canonical(configuration as unknown as Record<string, unknown>));
}

/** Detect a stale preparation before replacing the active configuration. */
export function assertConfigurationFingerprint(configuration: OwnerConfiguration, expectedFingerprint: string) {
  if (!sha256Pattern.test(expectedFingerprint) || configurationFingerprint(configuration) !== expectedFingerprint) {
    throw new Error('Owner configuration changed after preparation; activation is blocked');
  }
}

export function assertCandidateOwnerConfiguration(current: OwnerConfiguration, candidate: OwnerConfiguration) {
  validateOwnerConfiguration(current);
  validateOwnerConfiguration(candidate);
  const retained = (value: OwnerConfiguration) => {
    const { releaseRoot: _root, releaseRevision: _revision, clientDist: _client, ...rest } = value;
    return canonical(rest);
  };
  if (retained(current) !== retained(candidate)) {
    throw new Error('Candidate may change only the pinned release, revision and client bundle');
  }
}

export function candidateOwnerConfiguration(current: OwnerConfiguration, revision: string): OwnerConfiguration {
  validateOwnerConfiguration(current);
  if (!revisionPattern.test(revision)) throw new Error('Candidate requires an exact committed revision');
  const releaseRoot = path.join(current.workspaceRoot, '.data', 'releases', revision);
  const candidate = { ...current, releaseRoot, releaseRevision: revision, clientDist: path.join(releaseRoot, 'client') };
  assertCandidateOwnerConfiguration(current, candidate);
  return candidate;
}

/** Build provenance compares Git blob hashes, not timestamps or object key order. */
export function assertBuildInputsMatch(
  capturedInputs: Record<string, string>,
  currentInputs: Record<string, string>,
  committedInputs: Record<string, string>,
) {
  for (const inputs of [capturedInputs, currentInputs, committedInputs]) {
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || !Object.keys(inputs).length) {
      throw new Error('Build input receipts must contain a nonempty file map');
    }
    for (const [name, hash] of Object.entries(inputs)) {
      relativeName(name);
      if (typeof hash !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(hash)) {
        throw new Error('Build input receipts must contain canonical Git blob hashes');
      }
    }
  }
  if (canonical(capturedInputs) !== canonical(currentInputs)) {
    throw new Error('Build inputs changed after the tested build');
  }
  if (canonical(capturedInputs) !== canonical(committedInputs)) {
    throw new Error('Build inputs do not match the exact selected commit');
  }
}

export function assertNoSchemaChange(currentRelease: OwnerReleaseManifest, candidateRelease: OwnerReleaseManifest) {
  const databaseFiles = (manifest: OwnerReleaseManifest) => {
    const entries = Object.entries(manifest.hashes).filter(([name]) => name.startsWith('server/src/db/'));
    if (!entries.length) throw new Error('Database schema compatibility is unknown; separate maintenance is required');
    return canonical(Object.fromEntries(entries));
  };
  if (databaseFiles(currentRelease) !== databaseFiles(candidateRelease)) {
    throw new Error('Database source changed; separate schema maintenance is required before activation or rollback');
  }
}

export interface OwnerMaintenanceOptions {
  writeFile?: (fd: number, bytes: Buffer) => void;
  readFile?: (file: string) => Buffer;
  unlinkFile?: (file: string) => void;
}

/** A failed acquisition can retain markers; its cleanup remains explicitly retryable. */
export class OwnerMaintenanceError extends AggregateError {
  constructor(errors: unknown[], public readonly release: () => void) {
    super(errors, 'Maintenance acquisition failed and some owned markers could not be released', { cause: errors[0] });
    this.name = 'OwnerMaintenanceError';
  }
}

/** Acquire file markers only. No process inspection, startup, shutdown or provider call. */
export function acquireOwnerMaintenance(
  configuration: OwnerConfiguration,
  runDirectory: string,
  options: OwnerMaintenanceOptions = {},
) {
  validateOwnerConfiguration(configuration);
  if (!path.isAbsolute(runDirectory)) throw new Error('Maintenance run directory must be absolute');
  const write = options.writeFile ?? ((fd, bytes) => fs.writeFileSync(fd, bytes));
  const read = options.readFile ?? ((file) => fs.readFileSync(file));
  const unlink = options.unlinkFile ?? ((file) => fs.unlinkSync(file));
  type Marker = { file: string; fd?: number; identity?: fs.Stats; bytes: Buffer; written: boolean; removed: boolean };
  const markers: Marker[] = [];
  const absent = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

  function release() {
    const errors: unknown[] = [];
    for (const marker of [...markers].reverse()) {
      if (marker.fd !== undefined) {
        if (!marker.identity) {
          try { marker.identity = fs.fstatSync(marker.fd); } catch (error) { errors.push(error); }
        }
        try { fs.closeSync(marker.fd); marker.fd = undefined; } catch (error) { errors.push(error); }
      }
      if (marker.removed) continue;
      try {
        const actual = fs.lstatSync(marker.file);
        if (!marker.identity || actual.isSymbolicLink() || !actual.isFile() ||
            actual.dev !== marker.identity.dev || actual.ino !== marker.identity.ino) {
          throw new Error('Maintenance marker identity changed; it was preserved: ' + path.basename(marker.file));
        }
        const bytes = read(marker.file);
        // A failed write may have left only a prefix. A completed nonce record must match exactly.
        if (marker.written ? !bytes.equals(marker.bytes) :
            bytes.length > marker.bytes.length || !bytes.equals(marker.bytes.subarray(0, bytes.length))) {
          throw new Error('Maintenance marker contents changed; it was preserved: ' + path.basename(marker.file));
        }
        // Recheck after reading so a replaced file is never authorized by the earlier stat.
        const checked = fs.lstatSync(marker.file);
        if (checked.dev !== actual.dev || checked.ino !== actual.ino || checked.size !== actual.size ||
            checked.mtimeMs !== actual.mtimeMs || checked.ctimeMs !== actual.ctimeMs || checked.isSymbolicLink() || !checked.isFile()) {
          throw new Error('Maintenance marker identity changed during cleanup; it was preserved');
        }
        unlink(marker.file);
        marker.removed = true;
      } catch (error) {
        if (absent(error)) {
          try { fs.lstatSync(marker.file); errors.push(error); }
          catch (checked) {
            if (absent(checked)) marker.removed = true;
            else errors.push(error, checked);
          }
        } else errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Some owned maintenance markers could not be released; cleanup can be retried');
  }

  try {
    for (const name of ['owner-update.lock', 'maintenance.lock']) {
      const file = path.join(configuration.runtimeDir, name);
      const bytes = Buffer.from(JSON.stringify({ nonce: randomUUID(), pid: process.pid, runDirectory }));
      const fd = fs.openSync(file, 'wx');
      // Register ownership before fstat/write: either can fail after the exclusive create.
      const marker: Marker = {
        file, fd, bytes,
        written: false, removed: false,
      };
      markers.push(marker);
      marker.identity = fs.fstatSync(fd);
      write(fd, marker.bytes);
      marker.written = true;
    }
  } catch (error) {
    try { release(); } catch (cleanupError) { throw new OwnerMaintenanceError([error, cleanupError], release); }
    throw error;
  }
  return { release };
}
