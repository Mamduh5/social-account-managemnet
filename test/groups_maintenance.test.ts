import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { prepareGroupsMigration, parseGroupsPreparationArguments, groupsMigrationSourceFiles } from '../scripts/prepare-groups-migration.js';
import { groupsArtifactPath } from '../scripts/lib/groups-maintenance.js';
import { groupsSchemaReady } from '../server/src/db/groups-schema.js';

const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-groups-rehearsal-'));
  const artifacts = path.join(workspaceRoot, '.data', 'groups-maintenance'); fs.mkdirSync(artifacts, { recursive: true });
  const source = path.join(artifacts, 'isolated-legacy.db');
  const db = new Database(source); db.pragma('foreign_keys=ON');
  db.exec(`
    CREATE TABLE accounts(id TEXT PRIMARY KEY,protected_value TEXT);
    INSERT INTO accounts VALUES ('page-a','fixture-sensitive-value-must-stay-out-of-report');
    CREATE TABLE facebook_group_plans(id TEXT PRIMARY KEY,name TEXT,url TEXT,identity_type TEXT,account_id TEXT REFERENCES accounts(id),membership TEXT,created_at TEXT);
    INSERT INTO facebook_group_plans VALUES ('old-group','Private fixture Group','https://facebook.com/groups/123/','page','page-a','member','2026-10-26 10:00:00');
    CREATE TABLE group_prepared_content(id TEXT PRIMARY KEY,group_id TEXT REFERENCES facebook_group_plans(id),receipt_url TEXT,receipt_note TEXT,created_at TEXT,updated_at TEXT);
    INSERT INTO group_prepared_content VALUES ('old-handoff','old-group','https://facebook.com/groups/123/posts/456/','old unverified note','2026-10-26 10:00:00','2026-10-26 10:05:00');
    CREATE TABLE content_workspace_audit(id TEXT PRIMARY KEY,entity_id TEXT,action TEXT,detail_json TEXT);
    INSERT INTO content_workspace_audit VALUES ('audit','old-handoff','group_handoff_context_saved','{"version":1}');
  `); db.close();
  return { workspaceRoot, artifacts, source, target: path.join(artifacts, 'prepared.db'), report: path.join(artifacts, 'prepared.json'), cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }) };
}

test('Copy-only Groups CLI defaults to help and requires explicit distinct options without an apply mode', () => {
  assert.equal(parseGroupsPreparationArguments([]), null); assert.equal(parseGroupsPreparationArguments(['--help']), null);
  assert.throws(() => parseGroupsPreparationArguments(['--source', 'a']), /all of/);
  assert.throws(() => parseGroupsPreparationArguments(['--source', 'a', '--target', 'b', '--report', 'c', '--apply', 'true']), /live apply is unavailable/);
  assert.throws(() => parseGroupsPreparationArguments(['--source', 'a', '--source', 'b', '--report', 'c']), /live apply is unavailable/);
  assert.equal(parseGroupsPreparationArguments(['--workspace', 'artifacts-only', '--source', 'a', '--target', 'b', '--report', 'c'])?.workspaceRoot, 'artifacts-only');
});

test('Rehearsal migrates only a new disposable copy, preserves its source, and emits hash-only evidence', async () => {
  const f = fixture();
  try {
    const sourceHash = hash(f.source); const report = await prepareGroupsMigration(f);
    assert.equal(hash(f.source), sourceHash); assert.equal(report.sourceSha256, sourceHash);
    assert.equal(report.targetSha256, hash(f.target)); assert.equal(report.liveApplyPerformed, false); assert.equal(report.sourceReplaced, false);
    assert.equal(report.originalTablesUnchanged, true); assert.equal(report.migration.groupsReady, true); assert.equal(report.migration.alreadyReady, false);
    const source = new Database(f.source, { readonly: true }); assert.equal(groupsSchemaReady(source), false); source.close();
    const target = new Database(f.target, { readonly: true }); assert.equal(groupsSchemaReady(target), true);
    assert.equal((target.prepare("SELECT protected_value FROM accounts WHERE id='page-a'").get() as any).protected_value, 'fixture-sensitive-value-must-stay-out-of-report'); target.close();
    const encoded = fs.readFileSync(f.report, 'utf8'); assert.doesNotMatch(encoded, /fixture-sensitive-value|old unverified note|Private fixture Group/);
    assert.equal(Object.keys(report.migrationSourceHashes).length, groupsMigrationSourceFiles.length);
    assert.notEqual(report.sourceRoot, f.workspaceRoot);
    assert.equal(report.migrationSourceHashes['server/src/domain/groups.ts'], hash(path.join(report.sourceRoot, 'server/src/domain/groups.ts')));
    assert.ok(report.originalTables.every(table => /^[a-f0-9]{64}$/.test(table.sha256)));
  } finally { f.cleanup(); }
});

test('Rehearsal is repeatable from a prepared copy without changing its sidecars or appending imports', async () => {
  const f = fixture();
  try {
    await prepareGroupsMigration(f); const preparedHash = hash(f.target);
    const second = await prepareGroupsMigration({ workspaceRoot: f.workspaceRoot, source: f.target, target: path.join(f.artifacts, 'prepared-again.db'), report: path.join(f.artifacts, 'prepared-again.json') });
    assert.equal(hash(f.target), preparedHash); assert.equal(second.migration.alreadyReady, true);
    const db = new Database(second.targetPath, { readonly: true });
    assert.equal((db.prepare('SELECT count(*) n FROM group_membership_observations').get() as any).n, 1);
    assert.equal((db.prepare('SELECT count(*) n FROM group_receipt_events').get() as any).n, 1); db.close();
  } finally { f.cleanup(); }
});

test('Rehearsal rejects sources outside its isolated artifact directory and never reserves outputs', async () => {
  const f = fixture();
  try {
    const outside = path.join(f.workspaceRoot, 'owner-like-original.db'); fs.copyFileSync(f.source, outside); const before = hash(outside);
    await assert.rejects(prepareGroupsMigration({ ...f, source: outside }), /inside .data\/groups-maintenance/);
    assert.equal(hash(outside), before); assert.equal(fs.existsSync(f.target), false); assert.equal(fs.existsSync(f.report), false);
    await assert.rejects(prepareGroupsMigration({ ...f, target: outside }), /inside .data\/groups-maintenance/);
  } finally { f.cleanup(); }
});

test('Rehearsal never overwrites any existing output or aliases the source/report/target', async () => {
  const f = fixture();
  try {
    fs.writeFileSync(f.target, 'existing artifact'); const before = hash(f.target);
    await assert.rejects(prepareGroupsMigration(f), /already exists/); assert.equal(hash(f.target), before); assert.equal(fs.existsSync(f.report), false);
    fs.rmSync(f.target); fs.writeFileSync(f.report, 'existing report'); const reportBefore = hash(f.report);
    await assert.rejects(prepareGroupsMigration(f), /already exists/); assert.equal(hash(f.report), reportBefore); assert.equal(fs.existsSync(f.target), false);
    fs.rmSync(f.report);
    await assert.rejects(prepareGroupsMigration({ ...f, report: f.target }), /different files/);
    await assert.rejects(prepareGroupsMigration({ ...f, target: f.source }), /already exists/);
  } finally { f.cleanup(); }
});

test('Artifact guards reject a directory junction that resolves outside isolated rehearsal storage', () => {
  const f = fixture();
  try {
    const outside = path.join(f.workspaceRoot, 'outside'); fs.mkdirSync(outside);
    const junction = path.join(f.artifacts, 'linked'); fs.symlinkSync(outside, junction, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => groupsArtifactPath(f.workspaceRoot, path.join(junction, 'copy.db'), false), /resolves outside/);
    fs.copyFileSync(f.source, path.join(outside, 'source.db'));
    assert.throws(() => groupsArtifactPath(f.workspaceRoot, path.join(junction, 'source.db'), true), /ordinary isolated copy/);
  } finally { f.cleanup(); }
});
