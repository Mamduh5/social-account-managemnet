import './helpers/require-isolated-db.js';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import express from 'express';
import { db, dataDir, uploadsDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { architectureSchemaReady, migrateArchitectureDatabase } from '../server/src/db/architecture-schema.js';
import { publishingService } from '../server/src/services/publishing.service.js';
import { publishingRepo } from '../server/src/repositories/publishing.repo.js';
import { activityRepo } from '../server/src/repositories/activity.repo.js';
import { pipelineService } from '../server/src/services/pipeline.service.js';
import { pipelineSourceFingerprint, pipelineVideoMatchesSource } from '../server/src/domain/pipeline-identity.js';
import { finalizeManualUpload } from '../server/src/services/manual-upload.service.js';
import { ffmpegService } from '../server/src/services/ffmpeg.service.js';
import { publishingRouter } from '../server/src/routes/publishing.routes.js';
import { deletionSnapshot, commitDeletion } from '../server/src/repositories/test-data-deletion.repo.js';

before(() => initializeDatabase());
after(() => db.close());
function account() {
  const id = randomUUID();
  db.prepare("INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,is_demo) VALUES (?,'facebook','page','Fixture',?,'disconnected','simulator',1)").run(id, id);
  return id;
}
function video(extra: { jobId?: string; source?: string } = {}) {
  const id = randomUUID(), file = path.join(uploadsDir, `${id}.mp4`);
  fs.writeFileSync(file, '0123456789');
  const sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  publishingRepo.insertVideo({ id, title: 'Synthetic master', sourceType: extra.jobId ? 'pipeline_import' : 'manual_upload', originalFilename: 'fixture.mp4', filePath: file, fileSize: 10, duration: 1, width: 10, height: 10, aspectRatio: '1:1', pipelineJobId: extra.jobId, metadataJson: JSON.stringify({ sha256, ...(extra.source ? { pipelineSourceFingerprint: pipelineSourceFingerprint(extra.source) } : {}) }) });
  return { id, file };
}

test('a committed command is replay-safe across lost responses, changed payloads, and history cleanup', () => {
  const master = video(), accountId = account(), commandId = randomUUID();
  const input = { commandId, videoId: master.id, title: 'Exact intent', destinations: [{ accountId, selectedVariantId: 'original' }] };
  const first = publishingService.createPost(input);
  assert.deepEqual(publishingService.createPost(input), first);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM publishing_posts WHERE id=?').get(first.postId)?.n, 1);
  assert.throws(() => publishingService.createPost({ ...input, title: 'Changed intent' }), /different content/);
  db.prepare("UPDATE publishing_destinations SET status='failed' WHERE post_id=?").run(first.postId);
  db.prepare("UPDATE publishing_posts SET status='failed' WHERE id=?").run(first.postId);
  const selection = [{type:'publishing_post',id:first.postId}];
  const snapshot = deletionSnapshot(db,selection);
  assert.ok(snapshot.records.every(record=>record.eligible));
  const auditId = randomUUID();
  commitDeletion(db,selection,snapshot.fingerprint,auditId);
  assert.throws(()=>activityRepo.deleteEvent(auditId),/retained safety/);
  assert.deepEqual(publishingService.createPost(input), first);
  assert.equal(db.prepare('SELECT 1 FROM publishing_posts WHERE id=?').get(first.postId), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM publishing_commands WHERE command_id=?').get(commandId)?.n, 1);
});

test('architecture maintenance is additive and rehearsed on a separate database', async () => {
  const copyPath = path.join(dataDir, 'maintenance-rehearsal.db');
  await db.backup(copyPath);
  const copy = new Database(copyPath);
  try {
    copy.exec('DROP TABLE publishing_commands');
    assert.equal(architectureSchemaReady(copy), false);
    const originalCount = db.prepare('SELECT COUNT(*) n FROM videos').get() as { n: number };
    const copyCount = copy.prepare('SELECT COUNT(*) n FROM videos').get() as { n: number };
    migrateArchitectureDatabase(copy);
    assert.equal(architectureSchemaReady(copy), true);
    assert.equal((copy.prepare('SELECT COUNT(*) n FROM videos').get() as { n: number }).n, copyCount.n);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM videos').get() as { n: number }).n, originalCount.n);
    assert.deepEqual(copy.pragma('foreign_key_check'), []);
  } finally { copy.close(); }
});

test('copy-only maintenance CLI cannot replace its source or an existing rehearsal', async () => {
  const source = path.join(dataDir,'offline-source.db'); await db.backup(source);
  const before = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const target = path.join(dataDir,'architecture-review','copy.db');
  const run = (output: string) => spawnSync(process.execPath,['--import','tsx','scripts/prepare-architecture-migration.ts','--database',source,'--copy-to',output],{cwd:path.resolve(__dirname,'..'),env:{...process.env,SCC_ISOLATED_TEST:'true',SCC_DATA_DIR:dataDir},encoding:'utf8'});
  const first = run(target); assert.equal(first.status,0,first.stderr); assert.equal(JSON.parse(first.stdout).sourceReplaced,false);
  assert.equal(run(target).status,1); assert.equal(run(source).status,1);
  assert.equal(createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before);
  const copy = new Database(target,{readonly:true}); try { assert.equal(architectureSchemaReady(copy),true); assert.deepEqual(copy.pragma('foreign_key_check'),[]); } finally {copy.close();}
});

test('Pipeline jobs and verified existing imports are qualified by their captured source', async () => {
  const jobId = randomUUID(), sourceA = 'http://fixture-a.invalid/api', sourceB = 'http://fixture-b.invalid/api';
  const a = video({ jobId, source: sourceA }), b = video({ jobId, source: sourceB });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('No upstream request is allowed in this fixture'); };
  try {
    for (const [source, expected] of [[sourceA, a.id], [sourceB, b.id]]) {
      db.prepare('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)').run('pipeline_api_url', source);
      assert.deepEqual(await pipelineService.importPipelineJob({ jobId }), { videoId: expected, alreadyExisted: true });
    }
    assert.equal(publishingRepo.getVideoByPipelineJobId(jobId, 'http://third.invalid/api'), undefined);
    assert.equal(pipelineVideoMatchesSource(JSON.stringify({ upstreamVideoUrl: sourceA + '/jobs/x/video' }), sourceA), true);
    assert.equal(pipelineVideoMatchesSource(JSON.stringify({ upstreamVideoUrl: sourceA + '/jobs/x/video' }), sourceB), false);
    assert.equal(pipelineVideoMatchesSource('{}', sourceA), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('failed staged uploads remove only newly owned artifacts and keep existing masters unchanged', async () => {
  const existing = video(), staging = path.join(uploadsDir, '.incoming'); fs.mkdirSync(staging, { recursive: true });
  const staged = path.join(staging, randomUUID() + '.mp4'); fs.writeFileSync(staged, 'bad media');
  const probe = ffmpegService.probeVideo;
  ffmpegService.probeVideo = async () => { throw new Error('Synthetic probe failure'); };
  try {
    await assert.rejects(finalizeManualUpload({ path: staged, originalname: 'fixture.mp4', size: 9 }, 'Failed fixture', null), /Synthetic probe/);
    assert.equal(fs.existsSync(staged), false);
    assert.equal(fs.readFileSync(existing.file, 'utf8'), '0123456789');
    assert.equal(db.prepare("SELECT 1 FROM videos WHERE title='Failed fixture'").get(), undefined);
  } finally { ffmpegService.probeVideo = probe; }
});

test('streaming handles suffix, oversized and unsatisfiable ranges without leaving the server unavailable', async () => {
  const master = video(), app = express(); app.use(express.json()); app.use('/api/publishing', publishingRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port, base = `http://127.0.0.1:${port}/api/publishing`;
  try {
    const suffix = await fetch(`${base}/videos/${master.id}/stream`, { headers: { Range: 'bytes=-3' } });
    assert.equal(suffix.status, 206); assert.equal(await suffix.text(), '789');
    const oversized = await fetch(`${base}/videos/${master.id}/stream`, { headers: { Range: 'bytes=8-100' } });
    assert.equal(oversized.status, 206); assert.equal(await oversized.text(), '89'); assert.equal(oversized.headers.get('content-length'), '2');
    const invalid = await fetch(`${base}/videos/${master.id}/stream`, { headers: { Range: 'bytes=100-200' } });
    assert.equal(invalid.status, 416); await invalid.arrayBuffer();
    const valid = await fetch(`${base}/videos/${master.id}/stream`); assert.equal(await valid.text(), '0123456789');
    const noCommand = await fetch(`${base}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(noCommand.status, 400); await noCommand.arrayBuffer();
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
