import test, { before, after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { db, uploadsDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { pipelineService, PipelineService } from '../server/src/services/pipeline.service.js';
import { publishingRepo } from '../server/src/repositories/publishing.repo.js';
import { ffmpegService } from '../server/src/services/ffmpeg.service.js';

let browser: Browser;
let uiBundle: string;
let uiCss: string;
const realFetch = globalThis.fetch;
const realComputeSha = ffmpegService.computeFileSha256;
const realProbeVideo = ffmpegService.probeVideo;
const realGenerateThumb = ffmpegService.generateThumbnail;

before(async () => {
  assert.ok(process.env.SCC_DATA_DIR, 'SCC_DATA_DIR must be set for isolated testing');
  assert.notEqual(
    path.resolve(process.env.SCC_DATA_DIR),
    path.resolve(__dirname, '../.data'),
    'SCC_DATA_DIR must never point to production .data',
  );
  process.env.SCC_ISOLATED_TEST = 'true';
  initializeDatabase();
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');

  // Compile the REAL application CSS (client/src/index.css) using PostCSS + @tailwindcss/postcss
  const clientDir = path.resolve(__dirname, '../client');
  const clientRequire = createRequire(path.join(clientDir, 'package.json'));
  const postcss = clientRequire('postcss');
  const tailwindPostcss = clientRequire('@tailwindcss/postcss');
  const indexCssPath = path.join(clientDir, 'src/index.css');
  const rawCss = fs.readFileSync(indexCssPath, 'utf8');
  const compiledCss = await postcss([tailwindPostcss({ base: clientDir })]).process(rawCss, {
    from: indexCssPath,
  });
  uiCss = compiledCss.css;
  assert.ok(uiCss.length > 5000, 'Compiled real application CSS must be non-empty');

  // Build real PublishingView React bundle for Playwright UI tests
  const built = await build({
    absWorkingDir: clientDir,
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    stdin: {
      resolveDir: clientDir,
      loader: 'tsx',
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { PublishingView } from './src/views/PublishingView';
        (window as any).__name = (fn: any) => fn;
        (window as any).mountPublishing = () => {
          const root = createRoot(document.getElementById('root')!);
          root.render(<PublishingView />);
        };
      `,
    },
  });
  uiBundle = built.outputFiles[0].text;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
});

after(async () => {
  globalThis.fetch = realFetch;
  ffmpegService.computeFileSha256 = realComputeSha;
  ffmpegService.probeVideo = realProbeVideo;
  ffmpegService.generateThumbnail = realGenerateThumb;
  await browser?.close();
  db.close();
});

test('PipelineService discovery: exposes >6 results, paginates older videos via library_v1 cursor and legacy_jobs offset, and preserves honest incomplete metadata', async () => {
  // Generate 28 upstream items so older items sit beyond page 1 and well beyond the old 6-item limit
  const totalItems = 28;
  const upstreamLibraryItems = Array.from({ length: totalItems }, (_, i) => {
    const num = i + 1;
    const isOldest = num === totalItems;
    const isArchived = num === 3;
    const isMissingMeta = num === 4;
    const createdDate = new Date(Date.UTC(2026, 9, 28, 12, 0, 0) - i * 3600_000).toISOString();
    return {
      id: `job-pipe-${String(num).padStart(3, '0')}`,
      title: isOldest ? 'Oldest Historical Episode 028' : `Pipeline Video Episode ${String(num).padStart(3, '0')}`,
      topic: num % 2 === 0 ? 'debugging' : 'architecture',
      status: 'completed',
      display_status: 'Completed',
      created_at: isMissingMeta ? null : createdDate,
      updated_at: isMissingMeta ? null : createdDate,
      thumbnail_url: null,
      video_url: isArchived ? null : `/scene-video-jobs/job-pipe-${String(num).padStart(3, '0')}/artifacts/video`,
      duration_seconds: isMissingMeta ? null : 15 + (num % 10),
      aspect_ratio: isMissingMeta ? null : num % 3 === 0 ? '16:9' : '9:16',
      storage: isArchived
        ? { state: 'archived', label: 'Archived to Google Drive', detail: 'Evicted locally' }
        : { state: 'local', label: 'Available locally' },
    };
  });

  let useLegacyFallback = false;

  globalThis.fetch = (async (urlInput: any) => {
    const u = new URL(String(urlInput));
    if (u.pathname === '/scene-video-library') {
      if (useLegacyFallback) {
        return new Response('Not Found', { status: 404 });
      }
      const limit = Number(u.searchParams.get('limit') || '12');
      const cursor = u.searchParams.get('cursor');
      const q = (u.searchParams.get('q') || '').trim().toLowerCase();
      const sort = u.searchParams.get('sort') || 'recent';

      let list = [...upstreamLibraryItems];
      if (q) {
        list = list.filter((item) => `${item.title} ${item.topic} ${item.id}`.toLowerCase().includes(q));
      }
      if (sort === 'name') {
        list.sort((a, b) => a.title.localeCompare(b.title));
      }

      const startIdx = cursor ? parseInt(cursor.replace('cursor:', ''), 10) || 0 : 0;
      const sliced = list.slice(startIdx, startIdx + limit);
      const hasMore = startIdx + limit < list.length;

      return new Response(
        JSON.stringify({
          contract_version: 'library_v1',
          items: sliced,
          page: {
            limit,
            returned: sliced.length,
            has_more: hasMore,
            next_cursor: hasMore ? `cursor:${startIdx + limit}` : undefined,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (u.pathname === '/scene-video-jobs') {
      const limit = Number(u.searchParams.get('limit') || '15');
      const offset = Number(u.searchParams.get('offset') || '0');
      const sliced = upstreamLibraryItems.slice(offset, offset + limit);
      const hasMore = offset + limit < upstreamLibraryItems.length;
      return new Response(
        JSON.stringify({
          projects: sliced,
          total: upstreamLibraryItems.length,
          limit,
          offset,
          has_more: hasMore,
          next_offset: hasMore ? offset + limit : offset + sliced.length,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  // 1. Page 1 via library_v1 returns 12 items (> 6) and hasMore = true
  const page1 = await pipelineService.queryPipelineJobs({ limit: 12 });
  assert.equal(page1.sourceContract, 'library_v1');
  assert.equal(page1.jobs.length, 12);
  assert.equal(page1.page.hasMore, true);
  assert.equal(page1.page.nextCursor, 'cursor:12');

  // Verify archived item #3 and incomplete metadata item #4 are reported honestly
  const item3 = page1.jobs.find((j) => j.jobId === 'job-pipe-003')!;
  assert.equal(item3.importEligible, false);
  assert.equal(item3.videoUrl, null);
  assert.match(item3.ineligibleReason || '', /Archived to Google Drive/);

  const item4 = page1.jobs.find((j) => j.jobId === 'job-pipe-004')!;
  assert.equal(item4.aspectRatio, null, 'Missing aspect_ratio must not be fabricated as 9:16');
  assert.equal(item4.durationSeconds, null, 'Missing duration must not be fabricated');
  assert.equal(item4.createdAt, null, 'Missing created_at must not be fabricated as current time');
  assert.ok(item4.incompleteMetadata.includes('aspect_ratio'));
  assert.ok(item4.incompleteMetadata.includes('duration'));
  assert.ok(item4.incompleteMetadata.includes('timestamps'));

  // 2. Paginate through Page 2 and Page 3 to reach the oldest historical video (#28)
  const page2 = await pipelineService.queryPipelineJobs({ limit: 12, cursor: page1.page.nextCursor });
  assert.equal(page2.jobs.length, 12);
  assert.equal(page2.page.hasMore, true);

  const page3 = await pipelineService.queryPipelineJobs({ limit: 12, cursor: page2.page.nextCursor });
  assert.equal(page3.jobs.length, 4);
  assert.equal(page3.page.hasMore, false);
  assert.equal(page3.jobs.at(-1)?.jobId, 'job-pipe-028');
  assert.equal(page3.jobs.at(-1)?.title, 'Oldest Historical Episode 028');

  // 3. Search by title and filter by aspect ratio
  const searchResult = await pipelineService.queryPipelineJobs({ q: 'Oldest Historical' });
  assert.equal(searchResult.jobs.length, 1);
  assert.equal(searchResult.jobs[0].jobId, 'job-pipe-028');

  const landscapeResult = await pipelineService.queryPipelineJobs({ aspectRatio: '16:9', limit: 50 });
  assert.ok(landscapeResult.jobs.length > 0);
  assert.ok(landscapeResult.jobs.every((j) => j.aspectRatio === '16:9'));

  // 4. Legacy /scene-video-jobs fallback also walks offset pages and reaches item #28
  useLegacyFallback = true;
  const legacyPage1 = await pipelineService.queryPipelineJobs({ limit: 15 });
  assert.equal(legacyPage1.sourceContract, 'legacy_jobs');
  assert.equal(legacyPage1.jobs.length, 15);
  assert.equal(legacyPage1.page.hasMore, true);

  const legacyPage2 = await pipelineService.queryPipelineJobs({ limit: 15, cursor: legacyPage1.page.nextCursor });
  assert.equal(legacyPage2.jobs.some((j) => j.jobId === 'job-pipe-028'), true);
});

test('PipelineService import reliability: distinguishes offline vs empty inventory, handles failed imports cleanly, and prevents duplicate-import races', async () => {
  // 1. Offline Pipeline state
  globalThis.fetch = (async () => {
    throw new Error('ECONNREFUSED 127.0.0.1:8080');
  }) as typeof fetch;

  const offlineRes = await pipelineService.queryPipelineJobs();
  assert.equal(offlineRes.health.reachable, false);
  assert.equal(offlineRes.health.status, 'offline');
  assert.equal(offlineRes.sourceContract, 'offline');
  assert.equal(offlineRes.jobs.length, 0);

  // 2. Online Pipeline with zero available videos
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        contract_version: 'library_v1',
        items: [],
        page: { limit: 12, returned: 0, has_more: false },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const emptyRes = await pipelineService.queryPipelineJobs();
  assert.equal(emptyRes.health.reachable, true);
  assert.equal(emptyRes.health.status, 'connected');
  assert.equal(emptyRes.jobs.length, 0);

  // 3. Failed import cleans up partial files; retry succeeds; concurrent duplicate import downloads only once
  let artifactDownloadCalls = 0;
  let shouldFailDownload = true;
  const fakeVideoPayload = Buffer.alloc(4096, 'V');

  ffmpegService.computeFileSha256 = realComputeSha;
  ffmpegService.probeVideo = async () => ({
    duration: 18.5,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    sizeBytes: fakeVideoPayload.length,
    hasAudio: true,
    videoCodec: 'h264',
    audioCodec: 'aac',
  });
  ffmpegService.generateThumbnail = async (_inPath: string, outPath: string) => {
    fs.writeFileSync(outPath, 'thumb-bytes');
    return outPath;
  };

  globalThis.fetch = (async (urlInput: any) => {
    const u = new URL(String(urlInput));
    if (u.pathname === '/scene-video-jobs/job-race-001') {
      return new Response(
        JSON.stringify({
          id: 'job-race-001',
          title: 'Concurrent Import Race Test Video',
          status: 'completed',
          video_url: '/scene-video-jobs/job-race-001/artifacts/video',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (u.pathname === '/scene-video-jobs/job-race-001/artifacts/video') {
      artifactDownloadCalls++;
      if (shouldFailDownload) {
        return new Response('Artifact stream interrupted', { status: 502, statusText: 'Bad Gateway' });
      }
      await new Promise((r) => setTimeout(r, 40));
      return new Response(Readable.from([fakeVideoPayload]) as any, { status: 200 });
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  // First attempt fails with actionable error and creates no DB row
  await assert.rejects(
    () => pipelineService.importPipelineJob({ jobId: 'job-race-001' }),
    /Failed to download video artifact/
  );
  assert.equal(publishingRepo.getVideoByPipelineJobId('job-race-001'), undefined);

  // Retry with two concurrent requests for the exact same jobId
  shouldFailDownload = false;
  artifactDownloadCalls = 0;

  const [resA, resB] = await Promise.all([
    pipelineService.importPipelineJob({ jobId: 'job-race-001' }),
    pipelineService.importPipelineJob({ jobId: 'job-race-001' }),
  ]);

  assert.equal(artifactDownloadCalls, 1, 'Concurrent imports for the same jobId must coalesce into a single download');
  assert.equal(resA.videoId, resB.videoId);
  assert.equal(resA.alreadyExisted, false);
  assert.equal(resB.alreadyExisted, true);

  const countInDb = (
    db.prepare('SELECT count(*) as n FROM videos WHERE pipeline_job_id = ?').get('job-race-001') as any
  ).n;
  assert.equal(countInDb, 1, 'Exactly one video record may exist for job-race-001');

  // Subsequent import returns alreadyExisted = true without downloading again
  const resC = await pipelineService.importPipelineJob({ jobId: 'job-race-001' });
  assert.equal(resC.videoId, resA.videoId);
  assert.equal(resC.alreadyExisted, true);
  assert.equal(artifactDownloadCalls, 1);
});

test('TASK 01: Local-file source identity distinguishes identical basenames, detects content modifications, coalesces concurrent requests, and never reuses ambiguous DB records', async () => {
  ffmpegService.computeFileSha256 = realComputeSha;
  ffmpegService.probeVideo = async (filePath: string) => ({
    duration: 14,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    sizeBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 1024,
    hasAudio: true,
    videoCodec: 'h264',
    audioCodec: 'aac',
  });
  ffmpegService.generateThumbnail = async (_inPath: string, outPath: string) => {
    fs.writeFileSync(outPath, 'thumb-local');
    return true;
  };

  const baseDir = path.join(process.env.SCC_DATA_DIR!, 'local-identity-fixtures');
  const folderA = path.join(baseDir, 'folder-A');
  const folderB = path.join(baseDir, 'folder-B');
  const folderC = path.join(baseDir, 'folder-C');
  fs.mkdirSync(folderA, { recursive: true });
  fs.mkdirSync(folderB, { recursive: true });
  fs.mkdirSync(folderC, { recursive: true });

  // 1. Insert an ambiguous historical DB record with original_filename = 'scene.mp4' (missing sha256 & sourcePath)
  const ambiguousDestPath = path.join(uploadsDir, 'legacy_ambiguous_scene.mp4');
  fs.writeFileSync(ambiguousDestPath, 'legacy-ambiguous-bytes');
  publishingRepo.insertVideo({
    id: 'vid-legacy-ambiguous-scene',
    title: 'Legacy Ambiguous Scene',
    sourceType: 'pipeline_import',
    originalFilename: 'scene.mp4',
    filePath: ambiguousDestPath,
    fileSize: 22,
    duration: 10,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    metadataJson: JSON.stringify({ importedAt: '2026-01-01T00:00:00.000Z' }),
  });

  // 2. Different files with identical basenames: folder-A/scene.mp4 vs folder-B/scene.mp4
  const fileA = path.join(folderA, 'scene.mp4');
  const fileB = path.join(folderB, 'scene.mp4');
  fs.writeFileSync(fileA, 'UNIQUE-VIDEO-BYTES-FOLDER-A-111111');
  fs.writeFileSync(fileB, 'COMPLETELY-DIFFERENT-VIDEO-BYTES-FOLDER-B-222222');

  const importA1 = await pipelineService.importVideoFileWithStatus({ filePath: fileA, title: 'Folder A Scene' });
  assert.equal(importA1.alreadyExisted, false, 'Must not match legacy ambiguous record by basename');
  assert.notEqual(importA1.videoId, 'vid-legacy-ambiguous-scene');

  const importB1 = await pipelineService.importVideoFileWithStatus({ filePath: fileB, title: 'Folder B Scene' });
  assert.equal(importB1.alreadyExisted, false, 'Different file with identical basename scene.mp4 must NOT return Folder A videoId');
  assert.notEqual(importB1.videoId, importA1.videoId);

  const rowA = publishingRepo.getVideoById(importA1.videoId)!;
  const rowB = publishingRepo.getVideoById(importB1.videoId)!;
  assert.notEqual(rowA.file_path, rowB.file_path, 'Stored destination files must remain distinct');
  assert.equal(fs.readFileSync(rowA.file_path, 'utf8'), 'UNIQUE-VIDEO-BYTES-FOLDER-A-111111');
  assert.equal(fs.readFileSync(rowB.file_path, 'utf8'), 'COMPLETELY-DIFFERENT-VIDEO-BYTES-FOLDER-B-222222');

  // 3. Same file imported repeatedly (unchanged path, size, mtime, sha256)
  const importA2 = await pipelineService.importVideoFileWithStatus({ filePath: fileA, title: 'Folder A Scene Repeat' });
  assert.equal(importA2.alreadyExisted, true);
  assert.equal(importA2.videoId, importA1.videoId);

  // 4. Same file contents at a different source path (folder-C/copy_of_scene.mp4):
  // Distinguishes local-file source identity (folder-C vs folder-A) from content identity (matching sha256)
  const fileC = path.join(folderC, 'copy_of_scene.mp4');
  fs.writeFileSync(fileC, 'UNIQUE-VIDEO-BYTES-FOLDER-A-111111');
  const importC = await pipelineService.importVideoFileWithStatus({ filePath: fileC, title: 'Folder C Copy of A' });
  assert.equal(importC.alreadyExisted, false, 'Different source path has distinct local-file source identity');
  assert.notEqual(importC.videoId, importA1.videoId);
  const metaA = JSON.parse(publishingRepo.getVideoById(importA1.videoId)!.metadata_json);
  const metaC = JSON.parse(publishingRepo.getVideoById(importC.videoId)!.metadata_json);
  assert.equal(metaA.sha256, metaC.sha256, 'Both records preserve identical verified SHA-256 content identity');
  assert.notEqual(metaA.sourcePath, metaC.sourcePath, 'Both records preserve their distinct canonical sourcePath');

  // 5. Changed content at an existing source path (fileA overwritten with new video bytes)
  fs.writeFileSync(fileA, 'MODIFIED-NEW-RENDER-AT-SAME-PATH-FOLDER-A-999999999');
  const importAModified = await pipelineService.importVideoFileWithStatus({ filePath: fileA, title: 'Folder A Modified Scene' });
  assert.equal(importAModified.alreadyExisted, false, 'Modified file at existing sourcePath must create a new master record');
  assert.notEqual(importAModified.videoId, importA1.videoId);
  assert.equal(
    fs.readFileSync(rowA.file_path, 'utf8'),
    'UNIQUE-VIDEO-BYTES-FOLDER-A-111111',
    'Previously imported master file must remain strictly immutable'
  );

  // 6. Concurrent duplicate requests for the same new local file coalesce into a single import
  const fileConcurrent = path.join(folderC, 'concurrent_scene.mp4');
  fs.writeFileSync(fileConcurrent, 'CONCURRENT-LOCAL-FILE-BYTES-7777777');
  const [conc1, conc2] = await Promise.all([
    pipelineService.importVideoFileWithStatus({ filePath: fileConcurrent, title: 'Concurrent Local 1' }),
    pipelineService.importVideoFileWithStatus({ filePath: fileConcurrent, title: 'Concurrent Local 2' }),
  ]);
  assert.equal(conc1.videoId, conc2.videoId);
  assert.equal(conc1.alreadyExisted, false);
  assert.equal(conc2.alreadyExisted, true);
});

test('Corrupt stored master is never reused as verified source content', async () => {
  const source = path.join(process.env.SCC_DATA_DIR!, 'verified-reuse.mp4');
  fs.writeFileSync(source, 'first-video-content');
  const first = await pipelineService.importVideoFileWithStatus({ filePath: source });
  const stored = publishingRepo.getVideoById(first.videoId)!;
  fs.writeFileSync(stored.file_path, 'wrong-video-content');
  const second = await pipelineService.importVideoFileWithStatus({ filePath: source });
  assert.notEqual(second.videoId, first.videoId);
  assert.equal(fs.readFileSync(publishingRepo.getVideoById(second.videoId)!.file_path, 'utf8'), 'first-video-content');
  db.prepare('UPDATE videos SET pipeline_job_id = ? WHERE id = ?').run('corrupt-job-id', first.videoId);
  await assert.rejects(() => pipelineService.importPipelineJob({ jobId: 'corrupt-job-id' }), /cannot be verified/);
  const replacement = publishingRepo.getVideoById(second.videoId)!;
  fs.writeFileSync(replacement.file_path, 'x');
  const third = await pipelineService.importVideoFileWithStatus({ filePath: source });
  assert.notEqual(third.videoId, second.videoId, 'Truncated stored master must not be reused');
  fs.unlinkSync(publishingRepo.getVideoById(third.videoId)!.file_path);
  const fourth = await pipelineService.importVideoFileWithStatus({ filePath: source });
  assert.notEqual(fourth.videoId, third.videoId, 'Missing stored master must not be reused');
});

test('Final file collision never overwrites or deletes the existing file', async () => {
  const source = path.join(process.env.SCC_DATA_DIR!, 'collision-source.mp4');
  fs.writeFileSync(source, 'source-video');
  const realLink = fs.linkSync;
  let existing = '';
  fs.linkSync = ((from: fs.PathLike, to: fs.PathLike) => {
    existing = String(to);
    fs.writeFileSync(existing, 'unrelated-owner-content', { flag: 'wx' });
    return realLink(from, to);
  }) as typeof fs.linkSync;
  try {
    await assert.rejects(() => pipelineService.importVideoFileWithStatus({ filePath: source }), /EEXIST/);
    assert.equal(fs.readFileSync(existing, 'utf8'), 'unrelated-owner-content');
  } finally { fs.linkSync = realLink; }
});

test('Failed exclusive temp creation and failed database insertion preserve unrelated files', async () => {
  const source = path.join(process.env.SCC_DATA_DIR!, 'temp-collision-source.mp4');
  fs.writeFileSync(source, 'another-source-video');
  const realOpen = fs.openSync;
  let otherTemp = '';
  fs.openSync = ((file: fs.PathLike, flags: any, mode?: any) => {
    if (String(file).endsWith('.part') && flags === 'wx') {
      otherTemp = String(file);
      const otherFd = realOpen(otherTemp, 'wx');
      fs.writeSync(otherFd, 'other-process-data');
      fs.closeSync(otherFd);
    }
    return realOpen(file, flags, mode);
  }) as typeof fs.openSync;
  try {
    await assert.rejects(() => pipelineService.importVideoFileWithStatus({ filePath: source }), /EEXIST/);
    assert.equal(fs.readFileSync(otherTemp, 'utf8'), 'other-process-data');
  } finally { fs.openSync = realOpen; }

  const before = new Set(fs.readdirSync(uploadsDir));
  const realInsert = publishingRepo.insertVideo;
  publishingRepo.insertVideo = (() => { throw new Error('fixture database failure'); }) as typeof publishingRepo.insertVideo;
  try {
    await assert.rejects(() => pipelineService.importVideoFileWithStatus({ filePath: source }), /fixture database failure/);
    assert.deepEqual(new Set(fs.readdirSync(uploadsDir)), before);
    assert.equal(fs.readFileSync(otherTemp, 'utf8'), 'other-process-data');
  } finally { publishingRepo.insertVideo = realInsert; }
});

test('Separate service instances do not reuse unverified data or clean another instance temp file', async () => {
  const source = path.join(process.env.SCC_DATA_DIR!, 'two-instances.mp4');
  fs.writeFileSync(source, 'two-instance-source-content');
  const first = new PipelineService(), second = new PipelineService();
  const [a, b] = await Promise.all([first.importVideoFileWithStatus({ filePath: source }), second.importVideoFileWithStatus({ filePath: source })]);
  assert.equal(a.videoId, b.videoId);
  const foreignPart = path.join(uploadsDir, 'another-process-active.part');
  fs.writeFileSync(foreignPart, 'in-progress');
  assert.deepEqual(second.cleanupOrphanedPartFiles(0).removed, []);
  assert.equal(fs.readFileSync(foreignPart, 'utf8'), 'in-progress');
});

test('Separate processes cannot register duplicate local source identities', async () => {
  const source = path.join(process.env.SCC_DATA_DIR!, 'cross-process-source.mp4');
  fs.writeFileSync(source, 'cross-process-isolated-fixture');
  const program = `
    const { pipelineService } = await import('./server/src/services/pipeline.service.ts');
    const { ffmpegService } = await import('./server/src/services/ffmpeg.service.ts');
    const { db } = await import('./server/src/db/database.ts');
    ffmpegService.probeVideo = async () => ({ duration: 10, width: 1080, height: 1920, aspectRatio: '9:16', sizeBytes: 30, hasAudio: false });
    ffmpegService.generateThumbnail = async (_input, output) => { const fs = await import('node:fs'); fs.writeFileSync(output, 'fixture-thumb'); return true; };
    try { const result = await pipelineService.importVideoFileWithStatus({filePath: process.env.SCC_FIXTURE_SOURCE}); process.stdout.write(JSON.stringify({ok:true,id:result.videoId})); }
    catch (error) { process.stdout.write(JSON.stringify({ok:false,error:String(error)})); }
    finally { db.close(); }
  `;
  const run = () => new Promise<{ ok: boolean; id?: string; error?: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], { cwd: process.cwd(), env: { ...process.env, SCC_FIXTURE_SOURCE: source }, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += String(data); });
    child.stderr.on('data', data => { stderr += String(data); });
    child.on('error', reject);
    child.on('close', code => { if (code !== 0) return reject(new Error(`Isolated worker failed: ${stderr}`)); try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`Invalid worker result: ${stdout} ${stderr}`)); } });
  });
  const results = await Promise.all([run(), run()]);
  assert.ok(results.some(result => result.ok), 'At least one worker must complete');
  for (const result of results) if (!result.ok) assert.match(result.error || '', /SQLITE_BUSY|database is locked/i);
  const rows = db.prepare("SELECT id, file_path, metadata_json FROM videos WHERE original_filename = ?").all('cross-process-source.mp4') as any[];
  assert.equal(rows.length, 1);
  assert.equal(fs.readFileSync(rows[0].file_path, 'utf8'), 'cross-process-isolated-fixture');
  for (const result of results.filter(item => item.ok)) assert.equal(result.id, rows[0].id);
});

test('A source changed between hashing and copying is rejected without registration', async () => {
  const source = path.join(process.env.SCC_DATA_DIR!, 'changing-source.mp4');
  fs.writeFileSync(source, 'source-before-copy');
  const realCopy = fs.copyFileSync;
  fs.copyFileSync = ((from: fs.PathLike, to: fs.PathLike, flags?: number) => {
    if (String(from) === source) fs.writeFileSync(source, 'source-after-change');
    return realCopy(from, to, flags);
  }) as typeof fs.copyFileSync;
  try {
    await assert.rejects(() => pipelineService.importVideoFileWithStatus({ filePath: source }), /changed while being imported/);
    const rows = db.prepare("SELECT COUNT(*) AS n FROM videos WHERE original_filename = ?").get('changing-source.mp4') as { n: number };
    assert.equal(rows.n, 0);
  } finally { fs.copyFileSync = realCopy; }
});

test('TASK 03, 04 & 08: Upstream scene-video-library.v1 + projects compatibility, strict fallback rules, error classification, and download stream safety', async () => {
  // 1. Real upstream contract: api_version: "scene-video-library.v1" + projects array + query parameter mapping
  const observedUpstreamUrls: URL[] = [];
  globalThis.fetch = (async (urlInput: any) => {
    const u = new URL(String(urlInput));
    observedUpstreamUrls.push(u);
    if (u.pathname === '/scene-video-library') {
      // Upstream rejects empty query params and unknown status/sort values with 400
      for (const [k, v] of u.searchParams.entries()) {
        if (k !== 'q' && v === '') {
          return new Response(JSON.stringify({ error: `Empty query param ${k}` }), { status: 400 });
        }
      }
      const sortParam = u.searchParams.get('sort') || 'recent';
      if (!['recent', 'created', 'name'].includes(sortParam)) {
        return new Response(JSON.stringify({ error: `Unsupported sort ${sortParam}` }), { status: 400 });
      }
      const statusParam = u.searchParams.get('status') || '';
      if (statusParam && statusParam !== 'completed') {
        return new Response(JSON.stringify({ error: `Unsupported status ${statusParam}` }), { status: 400 });
      }

      return new Response(
        JSON.stringify({
          api_version: 'scene-video-library.v1',
          projects: [
            {
              id: 'proj-upstream-1',
              title: 'Newer Upstream Project',
              status: 'completed',
              display_status: 'Completed',
              created_at: '2026-10-28T09:00:00Z',
              updated_at: '2026-10-28T09:05:00Z',
              video_url: '/scene-video-jobs/proj-upstream-1/artifacts/video',
              duration_seconds: 21,
              aspect_ratio: '9:16',
              storage: { state: 'local', label: 'Available locally' },
            },
            {
              id: 'proj-upstream-2',
              title: 'Older Upstream Project (Archived)',
              status: 'completed',
              display_status: 'Completed',
              created_at: '2026-10-20T09:00:00Z',
              updated_at: '2026-10-20T09:05:00Z',
              video_url: null,
              duration_seconds: 15,
              aspect_ratio: '9:16',
              storage: { state: 'archived', label: 'Archived' },
            },
          ],
          page: {
            limit: 12,
            has_more: false,
            next_cursor: '',
          },
          sort: sortParam,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  // Global oldest-first cannot be guaranteed by the upstream contract.
  const oldestRes = await pipelineService.queryPipelineJobs({ status: 'eligible', sort: 'oldest' });
  assert.match(oldestRes.error || '', /not supported/i);
  const eligibleRes = await pipelineService.queryPipelineJobs({ status: 'eligible', sort: 'created' });
  assert.equal(eligibleRes.sourceContract, 'library_v1');
  assert.equal(eligibleRes.error, undefined);
  assert.equal(eligibleRes.jobs.length, 1, 'Archived project must be filtered out when status="eligible"');
  assert.equal(eligibleRes.jobs[0].jobId, 'proj-upstream-1');
  assert.equal(observedUpstreamUrls[0].searchParams.get('status'), 'completed');
  assert.equal(observedUpstreamUrls[0].searchParams.get('sort'), 'created');
  assert.equal(observedUpstreamUrls[0].searchParams.has('cursor'), false, 'Empty cursor must not be sent');

  // 2. Malformed response / unsupported version must fail closed with errorKind='malformed_response' and NOT fall back to /scene-video-jobs
  let legacyJobsCalled = false;
  globalThis.fetch = (async (urlInput: any) => {
    const u = new URL(String(urlInput));
    if (u.pathname === '/scene-video-library') {
      return new Response(JSON.stringify({ api_version: 'unknown.v99', projects: 'not-an-array' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.pathname === '/scene-video-jobs') {
      legacyJobsCalled = true;
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  const malformedRes = await pipelineService.queryPipelineJobs();
  assert.equal(malformedRes.errorKind, 'malformed_response');
  assert.match(malformedRes.error || '', /Unsupported upstream \/scene-video-library response version/);
  assert.equal(legacyJobsCalled, false, 'Must not fall back to /scene-video-jobs on malformed /scene-video-library payload');

  // 3. Auth failure (401/403) must fail closed with errorKind='auth_failure' and NOT fall back
  globalThis.fetch = (async () => new Response('Unauthorized', { status: 401 })) as typeof fetch;
  const authRes = await pipelineService.queryPipelineJobs();
  assert.equal(authRes.errorKind, 'auth_failure');
  assert.equal(authRes.health.status, 'error');

  // 4. Invalid/expired cursor (400 on cursor request) must report errorKind='invalid_cursor'
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'Invalid cursor token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  const cursorErrRes = await pipelineService.queryPipelineJobs({ cursor: 'expired-cursor-token' });
  assert.equal(cursorErrRes.errorKind, 'invalid_cursor');
  assert.match(cursorErrRes.error || '', /Invalid cursor token/);

  // 5. TASK 08: Download exceeding maxImportBytes aborts stream and cleans up .part file
  const strictService = new PipelineService({
    maxImportBytes: 1024, // 1 KB cap for test
    downloadTimeoutMs: 150,
  });

  globalThis.fetch = (async (urlInput: any) => {
    const u = new URL(String(urlInput));
    if (u.pathname === '/scene-video-jobs/job-oversized') {
      return new Response(
        JSON.stringify({
          id: 'job-oversized',
          title: 'Oversized Video',
          status: 'completed',
          video_url: '/scene-video-jobs/job-oversized/artifacts/video',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (u.pathname === '/scene-video-jobs/job-oversized/artifacts/video') {
      // Stream 4 KB (> 1 KB cap) without Content-Length header to test streaming byte counter
      return new Response(Readable.from([Buffer.alloc(2048, 'A'), Buffer.alloc(2048, 'B')]) as any, {
        status: 200,
      });
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  const existingParts = new Set(fs.readdirSync(uploadsDir).filter((f) => f.endsWith('.part')));
  await assert.rejects(
    () => strictService.importPipelineJob({ jobId: 'job-oversized' }),
    /exceeds maximum allowed import size/
  );
  const partFilesAfterOversized = fs.readdirSync(uploadsDir).filter((f) => f.endsWith('.part'));
  assert.deepEqual(new Set(partFilesAfterOversized), existingParts, 'Oversized stream must remove only its own .part file');

  // 6. TASK 08: Download timeout aborts hung stream and cleans up .part file
  globalThis.fetch = (async (urlInput: any, init?: any) => {
    const u = new URL(String(urlInput));
    if (u.pathname === '/scene-video-jobs/job-timeout') {
      return new Response(
        JSON.stringify({
          id: 'job-timeout',
          title: 'Hung Stream Video',
          status: 'completed',
          video_url: '/scene-video-jobs/job-timeout/artifacts/video',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (u.pathname === '/scene-video-jobs/job-timeout/artifacts/video') {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  await assert.rejects(
    () => strictService.importPipelineJob({ jobId: 'job-timeout' }),
    /timed out/i
  );

  // Orphan cleanup remains disabled because file ownership across processes is unknown.
  const orphanPart = path.join(uploadsDir, 'pipeline_orphan_test.mp4.deadbeef.part');
  fs.writeFileSync(orphanPart, 'stale-partial-bytes');
  const cleanupResult = pipelineService.cleanupOrphanedPartFiles(0);
  assert.deepEqual(cleanupResult.removed, []);
  assert.equal(fs.existsSync(orphanPart), true);
});

test('Discovery rejects repeated cursors and non-advancing legacy offsets and times out while reading body', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ api_version: 'scene-video-library.v1', projects: [{ id: 'page-item', title: 'Topic match', status: 'completed', video_url: '/v' }], page: { has_more: true, next_cursor: 'repeat' } }))) as typeof fetch;
  const repeated = await pipelineService.queryPipelineJobs({ cursor: 'repeat' });
  assert.equal(repeated.errorKind, 'malformed_response');
  globalThis.fetch = (async (input: any) => String(input).includes('/scene-video-library') ? new Response('', { status: 404 }) : new Response(JSON.stringify({ projects: [{ id: 'legacy-item', title: 'Video' }], has_more: true }))) as typeof fetch;
  const badOffset = await pipelineService.queryPipelineJobs();
  assert.equal(badOffset.errorKind, 'malformed_response');
  const service = new PipelineService({ discoveryTimeoutMs: 30 });
  globalThis.fetch = (async () => new Response(new ReadableStream({ start() {} }), { status: 200 })) as typeof fetch;
  const stalled = await service.queryPipelineJobs();
  assert.equal(stalled.errorKind, 'timeout');
});

test('Cursor discovery can reach eligible results beyond 1000 and keeps upstream topic matches', async () => {
  globalThis.fetch = (async (input: any) => {
    const u = new URL(String(input));
    const start = Number(u.searchParams.get('cursor') || 0);
    const count = Number(u.searchParams.get('limit') || 50);
    const q = u.searchParams.get('q');
    const total = q ? 1 : 1010;
    const entries = Array.from({ length: Math.min(count, total - start) }, (_, n) => ({ id: `old-${start + n}`, title: 'Video', status: 'completed', video_url: '/v' }));
    const next = start + entries.length;
    return new Response(JSON.stringify({ api_version: 'scene-video-library.v1', projects: entries, page: { has_more: next < total, next_cursor: next < total ? String(next) : null } }));
  }) as typeof fetch;
  let cursor: string | null = null, count = 0;
  do {
    const page = await pipelineService.queryPipelineJobs({ status: 'eligible', limit: 50, cursor });
    assert.equal(page.error, undefined);
    count += page.jobs.length;
    cursor = page.page.nextCursor;
  } while (cursor);
  assert.equal(count, 1010);
  const topic = await pipelineService.queryPipelineJobs({ q: 'topic-only', status: 'eligible' });
  assert.equal(topic.jobs.length, 1);
});

test('Legacy discovery continues to an older bounded segment when search has no early match', async () => {
  globalThis.fetch = (async (input: any) => {
    const u = new URL(String(input));
    if (u.pathname === '/scene-video-library') return new Response('', { status: 404 });
    const offset = Number(u.searchParams.get('offset') || 0);
    const limit = Number(u.searchParams.get('limit') || 100);
    const projects = Array.from({ length: Math.min(limit, 1010 - offset) }, (_, n) => ({ id: `legacy-${offset + n}`, title: offset + n === 1008 ? 'deep-target' : 'other', status: 'completed', video_url: '/v' }));
    const next = offset + projects.length;
    return new Response(JSON.stringify({ projects, has_more: next < 1010, next_offset: next }));
  }) as typeof fetch;
  const first = await pipelineService.queryPipelineJobs({ q: 'deep-target' });
  assert.equal(first.jobs.length, 0);
  assert.equal(first.historyComplete, false);
  assert.equal(first.page.nextCursor, 'legacy:1000:0');
  const second = await pipelineService.queryPipelineJobs({ q: 'deep-target', cursor: first.page.nextCursor });
  assert.equal(second.jobs[0].jobId, 'legacy-1008');
});

test('PublishingView UI: real compiled CSS, accurate dispatch branding modes, roving radio focus, shared Modal accessibility, async race fencing, and Cozy Light + Warm Dark viewports', async (t: TestContext) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page: Page = await context.newPage();
  page.setDefaultTimeout(8_000);

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.route('**/*', (route) => route.abort());

  t.after(async () => {
    await context.close();
    assert.deepEqual(pageErrors, []);
  });

  // Render against the REAL compiled application CSS (no test-only overflow or max-width hacks)
  await page.setContent('<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: uiCss });
  await page.addScriptTag({ content: uiBundle });

  // Install in-page mock API before mounting React bundle
  await page.evaluate(() => {
    const win = window as any;
    win.__name = (fn: any) => fn;
    win.submittedPosts = [];
    win.importedJobs = [];
    win.failNextImport = true;
    win.submitDelayMs = 0;
    win.pendingSearchResolvers = {};

    const mockVideos = [
      {
        id: 'vid-master-alpha',
        title: 'Alpha Master 9:16',
        source_type: 'pipeline_import',
        original_filename: 'alpha_master.mp4',
        file_path: '/uploads/alpha_master.mp4',
        streamUrl: 'data:video/mp4;base64,',
        file_size: 10485760,
        duration: 15.0,
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        created_at: '2026-10-27T10:00:00.000Z',
        branded_variants: [
          {
            id: 'var-alpha-1',
            video_id: 'vid-master-alpha',
            preset_name: 'Smooth Sine Alpha',
            movement_preset: 'smooth_sine',
            watermark_text: '@alpha.saved.watermark',
            file_path: '/renders/alpha_saved_1.mp4',
            previewUrl: 'data:video/mp4;base64,',
            downloadUrl: 'data:video/mp4;base64,',
            file_size: 11000000,
            duration: 15.0,
            width: 1080,
            height: 1920,
            aspect_ratio: '9:16',
            created_at: '2026-10-27T10:05:00.000Z',
          },
        ],
      },
      {
        id: 'vid-master-beta',
        title: 'Beta Master (No Saved Variants)',
        source_type: 'manual_upload',
        original_filename: 'beta_master.mp4',
        file_path: '/uploads/beta_master.mp4',
        streamUrl: 'data:video/mp4;base64,',
        file_size: 8388608,
        duration: 22.5,
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        created_at: '2026-10-28T08:00:00.000Z',
        branded_variants: [],
      },
    ];

    const mockAccounts = [
      {
        id: 'acc-page-a',
        platform: 'facebook',
        account_type: 'page',
        name: 'แก้บัคยาวๆๆ',
        handle: 'kaebugyao',
        avatar_url: '',
        status: 'connected',
        connector_mode: 'official_api',
        health_status: 'healthy',
        brandKit: {
          mode: 'moving',
          watermarkType: 'moving_text',
          text: '@kaebugyao.official',
          movementPreset: 'smooth_sine',
          opacity: 0.85,
        },
        capabilities: {
          canPublish: true,
          canSchedule: true,
          requiresManualConfirmation: false,
          supportedVideoFormats: ['mp4'],
          maxVideoSizeMb: 500,
          maxDurationSeconds: 180,
        },
      },
      {
        id: 'acc-page-b',
        platform: 'facebook',
        account_type: 'page',
        name: 'Engineering Digest TH',
        handle: 'engdigest.th',
        avatar_url: '',
        status: 'connected',
        connector_mode: 'official_api',
        health_status: 'healthy',
        brandKit: {
          mode: 'caption',
          watermarkType: 'moving_text',
          text: '@ignored.moving',
          signatureText: 'Engineering Digest Official',
          movementPreset: 'corner_jump',
          opacity: 0.9,
        },
        capabilities: {
          canPublish: true,
          canSchedule: true,
          requiresManualConfirmation: false,
          supportedVideoFormats: ['mp4'],
          maxVideoSizeMb: 500,
          maxDurationSeconds: 180,
        },
      },
      {
        id: 'acc-tiktok-c',
        platform: 'tiktok',
        account_type: 'personal',
        name: 'Creator TikTok Channel',
        handle: 'creator.tiktok',
        avatar_url: '',
        status: 'connected',
        connector_mode: 'browser_bridge',
        health_status: 'healthy',
        brandKit: {
          mode: 'moving',
          watermarkType: 'moving_text',
          text: '', // explicitly empty watermark text ("") to test TASK 02 UI honesty!
          movementPreset: 'diagonal_bounce',
          opacity: 0.85,
        },
        capabilities: {
          canPublish: false,
          canSchedule: true,
          requiresManualConfirmation: true,
          supportedVideoFormats: ['mp4'],
          maxVideoSizeMb: 500,
          maxDurationSeconds: 180,
        },
      },
    ];

    win.fixtureVideos = mockVideos;
    win.watchFiles = [
      {filename:'duplicate.mp4',fullPath:'C:/fixture/first/duplicate.mp4',sizeBytes:104857,modifiedAt:'2026-10-28T10:00:00.000Z',isImported:false},
      {filename:'duplicate.mp4',fullPath:'C:/fixture/second/duplicate.mp4',sizeBytes:209715,modifiedAt:'2026-10-28T10:00:01.000Z',isImported:true,importedVideoId:'vid-master-alpha'},
    ];
    win.hiddenWatchPaths = [];
    win.watchIdentityIncomplete = false;
    win.failWatchRefresh = false;
    win.discoveryRequests = 0;
    const allPipelineJobs = Array.from({ length: 16 }, (_, idx) => {
      const n = idx + 1;
      return {
        jobId: `pipe-ui-job-${String(n).padStart(2, '0')}`,
        title: n === 16 ? 'Historical Deep Archive Video 16' : `Upstream Pipeline Story ${String(n).padStart(2, '0')}`,
        status: 'completed',
        displayStatus: 'Completed',
        aspectRatio: n === 2 ? null : n % 2 === 0 ? '16:9' : '9:16',
        durationSeconds: n === 2 ? null : 12 + n,
        videoUrl: `blob:pipe-${n}`,
        isImported: false,
        importEligible: true,
        createdAt: n === 2 ? null : new Date(Date.UTC(2026, 9, 28, 10, 0, 0) - idx * 3600_000).toISOString(),
        updatedAt: n === 2 ? null : new Date(Date.UTC(2026, 9, 28, 10, 0, 0) - idx * 3600_000).toISOString(),
        incompleteMetadata: n === 2 ? ['aspect_ratio', 'duration', 'timestamps'] : [],
      };
    });

    win.fetch = async (input: any, init?: any) => {
      const urlStr = typeof input === 'string' ? input : input.url;
      const u = new URL(urlStr, 'http://localhost:3001');
      const method = (init?.method || 'GET').toUpperCase();

      const json = (data: any, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      if (u.pathname === '/api/publishing/videos') {
        return json({ videos: mockVideos });
      }
      if (u.pathname === '/api/accounts') {
        return json({ accounts: mockAccounts });
      }
      if (u.pathname === '/api/publishing/posts' && method === 'GET') {
        return json({ posts: [] });
      }
      if (u.pathname === '/api/publishing/queue') {
        return json({ queue: [] });
      }
      if (u.pathname === '/api/pipeline/sync') {
        if (win.holdSync) await new Promise<void>(resolve => { win.releaseSync = resolve; });
        return json({ success: true, jobs: [], page: { limit: 12, returned: 0, hasMore: false, nextCursor: null }, health: { reachable: true, status: 'connected' } });
      }
      if (u.pathname === '/api/pipeline/status' || u.pathname === '/api/pipeline/jobs') {
        win.discoveryRequests++;
        if (u.pathname === '/api/pipeline/status' && win.failWatchRefresh) {
          win.failWatchRefresh = false;
          throw new Error('Synthetic watch refresh failure');
        }
        const limit = Number(u.searchParams.get('limit') || '12');
        const cursor = u.searchParams.get('cursor');
        const q = (u.searchParams.get('q') || '').trim().toLowerCase();
        if (q && win.pendingSearchResolvers[q]) {
          await win.pendingSearchResolvers[q]();
        }
        if (q === 'fixture discovery failure') return json({ error: 'Fixture discovery unavailable' }, 503);
        let filtered = [...allPipelineJobs];
        if (q) {
          filtered = filtered.filter((j) => `${j.title} ${j.jobId}`.toLowerCase().includes(q));
        }
        const offset = cursor === 'page2' ? 12 : 0;
        const sliced = filtered.slice(offset, offset + limit);
        const hasMore = offset + limit < filtered.length;
        return json({
          health: {
            reachable: true,
            status: 'connected',
            apiUrl: 'http://localhost:8080',
            totalProjects: allPipelineJobs.length,
            completedJobsCount: allPipelineJobs.length,
            lastChecked: new Date().toISOString(),
          },
          jobs: sliced,
          jobsCount: sliced.length,
          totalMatched: filtered.length,
          page: {
            limit,
            returned: sliced.length,
            hasMore,
            nextCursor: hasMore ? 'page2' : null,
          },
          sourceContract: 'library_v1',
          historyComplete: true,
          files: win.watchFiles.filter((file: any) => !win.hiddenWatchPaths.includes(file.fullPath)),
          fileCount: win.watchFiles.filter((file: any) => !win.hiddenWatchPaths.includes(file.fullPath)).length,
          watchIdentityIncomplete: win.watchIdentityIncomplete,
        });
      }
      if (u.pathname === '/api/pipeline/import-job' && method === 'POST') {
        const body = JSON.parse(init.body);
        if (win.failNextImport) {
          win.failNextImport = false;
          return json({ error: 'Upstream artifact download timed out — please retry.' }, 500);
        }
        win.importedJobs.push(body.jobId);
        const match = allPipelineJobs.find((j) => j.jobId === body.jobId);
        if (match) {
          match.isImported = true;
          (match as any).importedVideoId = 'vid-master-alpha';
        }
        return json({
          success: true,
          videoId: 'vid-master-alpha',
          alreadyExisted: false,
          message: 'Video imported successfully',
        });
      }
      if (u.pathname === '/api/publishing/posts' && method === 'POST') {
        if (win.submitDelayMs > 0) {
          await new Promise((r) => setTimeout(r, win.submitDelayMs));
        }
        const body = JSON.parse(init.body);
        win.submittedPosts.push(body);
        return json({
          success: true,
          postId: `post-ui-${win.submittedPosts.length}`,
          destinationCount: body.destinations.length,
        });
      }
      return json({ success: true });
    };
    win.mountPublishing();
  });

  await page.getByLabel('Campaign / Post Title', { exact: true }).waitFor();

  // A cleanup event refreshes the actual selector and Pipeline discovery without clearing an unsaved title.
  const titleField = page.getByLabel('Campaign / Post Title', { exact: true });
  const originalTitle = await titleField.inputValue();
  await titleField.fill('Unsaved owner title');
  await page.waitForFunction(() => !!document.querySelector('option[value="vid-master-beta"]'));
  const requestsBefore = await page.evaluate(() => (window as any).discoveryRequests);
  await page.evaluate(() => {
    const win = window as any;
    win.hiddenFixtureVideo = win.fixtureVideos.splice(win.fixtureVideos.findIndex((v: any) => v.id === 'vid-master-beta'), 1)[0];
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.waitForFunction(() => !document.querySelector('option[value="vid-master-beta"]'));
  await page.waitForFunction((before: number) => (window as any).discoveryRequests > before, requestsBefore);
  assert.equal(await titleField.inputValue(), 'Unsaved owner title');
  await page.evaluate(() => {
    const win = window as any;
    win.fixtureVideos.push(win.hiddenFixtureVideo);
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.waitForFunction(() => !!document.querySelector('option[value="vid-master-beta"]'));
  await page.getByLabel('Select Master Video', {exact:true}).selectOption('vid-master-alpha');
  await titleField.fill('Unsaved owner title');
  await page.evaluate(() => {
    const win = window as any;
    win.selectedFixtureVideo = win.fixtureVideos.splice(win.fixtureVideos.findIndex((v: any) => v.id === 'vid-master-alpha'), 1)[0];
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.getByText(/selected master is no longer in the library/i).waitFor();
  assert.equal(await titleField.inputValue(), 'Unsaved owner title');
  assert.match(await page.getByLabel('Select Master Video', {exact:true}).locator('option:checked').innerText(), /previously selected video unavailable/i);
  await page.getByLabel('Select Master Video', {exact:true}).selectOption('vid-master-beta');
  await page.evaluate(() => {
    const win = window as any;
    win.fixtureVideos.unshift(win.selectedFixtureVideo);
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.waitForFunction(() => !!document.querySelector('option[value="vid-master-alpha"]'));
  await page.getByLabel('Select Master Video', {exact:true}).selectOption('vid-master-alpha');
  await titleField.fill(originalTitle);

  // Hiding one discovered path refreshes the watch list without hiding a same-name
  // independent entry or changing the imported master and unsaved composer.
  await titleField.fill('Keep my unsaved title');
  await page.getByRole('button', {name:/Video Library/}).click();
  await page.getByText('Local Watch Directory Files (2)', {exact:true}).waitFor();
  assert.equal(await page.getByText('duplicate.mp4',{exact:true}).count(),2);
  await page.evaluate(() => {
    (window as any).watchIdentityIncomplete=true;
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.getByRole('status').getByText(/watch-directory videos could not be identified reliably/i).waitFor();
  await page.evaluate(() => {
    const win=window as any;
    win.hiddenWatchPaths=['C:/fixture/first/duplicate.mp4'];
    win.watchIdentityIncomplete=false;
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.getByText('Local Watch Directory Files (1)', {exact:true}).waitFor();
  assert.equal(await page.getByText(/watch-directory videos could not be identified reliably/i).count(),0);
  assert.equal(await page.getByText('duplicate.mp4',{exact:true}).count(),1);
  assert.equal(await page.getByText('duplicate.mp4',{exact:true}).locator('..').locator('..').getByText('In Library',{exact:true}).count(),1);
  assert.equal(await page.getByTestId('imported-library-section').getByText('Alpha Master 9:16',{exact:true}).count(),1);
  await page.evaluate(() => {
    (window as any).hiddenWatchPaths=[];
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.getByText('Local Watch Directory Files (2)', {exact:true}).waitFor();
  await page.evaluate(() => {
    const win=window as any;
    win.hiddenWatchPaths=['C:/fixture/first/duplicate.mp4'];
    win.failWatchRefresh=true;
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.getByRole('alert').getByText('Synthetic watch refresh failure').waitFor();
  assert.equal(await page.getByText('duplicate.mp4',{exact:true}).count(),0,'failed post-cleanup refresh does not retain stale watch entries');
  await page.evaluate(() => {
    (window as any).hiddenWatchPaths=[];
    window.dispatchEvent(new Event('scc:cleanup-changed'));
  });
  await page.getByText('Local Watch Directory Files (2)', {exact:true}).waitFor();
  await page.getByRole('button',{name:'Compose & Publish',exact:true}).click();
  assert.equal(await titleField.inputValue(),'Keep my unsaved title');
  assert.equal(await page.getByLabel('Select Master Video',{exact:true}).inputValue(),'vid-master-alpha');
  await titleField.fill(originalTitle);

  // 1. Select all 3 destination accounts using accessible buttons + keyboard
  const selectPageA = page.getByRole('button', { name: 'Select destination แก้บัคยาวๆๆ', exact: true });
  const selectPageB = page.getByRole('button', { name: 'Select destination Engineering Digest TH', exact: true });
  const selectTikTokC = page.getByRole('button', { name: 'Select destination Creator TikTok Channel', exact: true });

  await selectPageA.click();
  await selectPageB.focus();
  await page.keyboard.press('Enter');
  await selectTikTokC.focus();
  await page.keyboard.press(' ');

  assert.equal(await selectPageA.getAttribute('aria-pressed'), 'true');
  assert.equal(await selectPageB.getAttribute('aria-pressed'), 'true');
  assert.equal(await selectTikTokC.getAttribute('aria-pressed'), 'true');

  // 2. TASK 07: Verify radiogroup arrow-key navigation moves actual DOM focus (document.activeElement) and updates selection
  const modeOriginalC = page.getByTestId('media-mode-original-acc-tiktok-c');
  await modeOriginalC.focus();
  await page.keyboard.press('ArrowRight'); // moves to 'saved_variant'
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'media-mode-saved-variant-acc-tiktok-c',
    'ArrowRight must move actual DOM focus to the next radio card'
  );
  await page.keyboard.press('ArrowDown'); // moves to 'dispatch_branding'
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'media-mode-dispatch-branding-acc-tiktok-c',
    'ArrowDown must move actual DOM focus to dispatch_branding radio card'
  );
  assert.equal(await page.getByTestId('media-mode-dispatch-branding-acc-tiktok-c').getAttribute('aria-checked'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'media-mode-original-acc-tiktok-c');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'media-mode-dispatch-branding-acc-tiktok-c');

  // 3. TASK 02 UI: Verify accurate branding descriptions for caption-only (Page B) and explicitly empty watermark text (TikTok C)
  await page.getByTestId('media-mode-dispatch-branding-acc-page-b').click();
  const detailPageB = await page.getByTestId('media-detail-dispatch-branding-acc-page-b').innerText();
  assert.match(detailPageB, /Bottom Caption Only/);
  assert.match(detailPageB, /Engineering Digest Official/);
  assert.equal(detailPageB.includes('renders Engineering Digest TH\'s moving watermark'), false);

  const detailTikTokC = await page.getByTestId('media-detail-dispatch-branding-acc-tiktok-c').innerText();
  assert.match(detailTikTokC, /\(empty — no text\)/, 'Explicitly empty text must not be replaced by fictional @creator.tiktok handle');
  assert.equal(await page.getByTestId('dispatch-branding-warning-acc-tiktok-c').isVisible(), true);
  assert.equal(await page.getByTestId('review-branding-warning-acc-tiktok-c').isVisible(), true);

  // Now set Page A = Original, Page B = Saved Variant (var-alpha-1), TikTok C = Dispatch Branding
  await page.getByTestId('media-mode-original-acc-page-a').click();
  await page.getByTestId('media-mode-saved-variant-acc-page-b').click();

  // 4. TASK 07: Verify shared Modal semantics on Preview Original File (role="dialog", aria-modal="true", Escape close, focus restoration)
  const previewOrigBtn = page
    .getByTestId('media-detail-original-acc-page-a')
    .getByRole('button', { name: 'Preview Original File', exact: true });
  await previewOrigBtn.focus();
  await previewOrigBtn.click();

  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  assert.ok(await dialog.getAttribute('aria-labelledby'), 'Dialog must have aria-labelledby');
  const focusInsideModal = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return Boolean(dlg && dlg.contains(document.activeElement));
  });
  assert.equal(focusInsideModal, true, 'Opening Modal must move focus inside dialog');

  // Close with Escape and verify focus returns to trigger button
  await page.keyboard.press('Escape');
  await assert.doesNotReject(() => dialog.waitFor({ state: 'detached' }));
  const restoredFocusText = await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText || '');
  assert.match(restoredFocusText, /Preview Original File/, 'Closing Modal via Escape must restore focus to trigger button');

  // 5. Switch master video from Alpha to Beta (0 saved variants) -> Page B invalidated & blocks submission
  await page.getByLabel('Select Master Video', { exact: true }).selectOption('vid-master-beta');
  assert.equal(await page.getByTestId('master-switch-revalidation-notice').isVisible(), true);
  assert.equal(await page.getByTestId('invalid-media-selection-alert').isVisible(), true);

  const submitBtn = page.locator('button[type="submit"]');
  assert.equal(await submitBtn.isDisabled(), true);

  // Switch back to Alpha Master and select var-alpha-1 for Page B
  await page.getByLabel('Select Master Video', { exact: true }).selectOption('vid-master-alpha');
  await page.getByLabel('Saved branded version for Engineering Digest TH', { exact: true }).selectOption('var-alpha-1');
  assert.equal(await submitBtn.isDisabled(), false);

  // 6. TASK 08: Rapid synchronous double-submit prevention
  await page.evaluate(() => {
    (window as any).submitDelayMs = 80;
    const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.click();
    btn.click();
  });
  await page.waitForFunction(() => (window as any).submittedPosts.length >= 1);
  await page.waitForTimeout(120);
  const submitted = await page.evaluate(() => (window as any).submittedPosts);
  assert.equal(submitted.length, 1, 'Synchronous double-click on submit must only enqueue one post');

  // 7. Switch to Video Library tab: verify >6 pipeline items, pagination, modal preview, and TASK 05 out-of-order search fencing
  await page.getByRole('button', { name: /Video Library/ }).click();
  await page.getByTestId('pipeline-videos-section').waitFor();

  // Every selected option must fit, including the native select arrow and padding.
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((tName) => document.documentElement.classList.toggle('light', tName === 'light'), theme);
    for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 1280, height: 600 }]) {
      await page.setViewportSize(vp);
      for (const label of ['Filter Pipeline Aspect Ratio', 'Filter Pipeline Status', 'Filter Pipeline Import State', 'Sort Pipeline Videos']) {
        const select = page.getByLabel(label, { exact: true });
        const options = await select.locator('option').evaluateAll((elements) => elements.map((option) => (option as HTMLOptionElement).value));
        for (const value of options) {
          await select.selectOption(value);
          const fit = await select.evaluate((element) => {
            const control = element as HTMLSelectElement;
            const style = getComputedStyle(control);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
            ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const text = control.selectedOptions[0].textContent || '';
            return { available: control.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20, required: ctx.measureText(text).width, text };
          });
          assert.ok(fit.available >= fit.required, `${label}: "${fit.text}" must fit in ${theme} at ${vp.width}x${vp.height}`);
        }
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false, `No horizontal page overflow in ${theme} at ${vp.width}x${vp.height}`);
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove('light'));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Reset Pipeline Filters', exact: true }).click();
  await page.getByTestId('pipeline-job-card-pipe-ui-job-01').waitFor();

  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((tName) => document.documentElement.classList.toggle('light', tName === 'light'), theme);
    await page.setViewportSize({ width: 390, height: 600 });
    const trigger = page.getByTestId('pipeline-job-card-pipe-ui-job-01').getByRole('button', { name: 'Preview', exact: true });
    await trigger.click();
    const libraryDialog = page.getByRole('dialog');
    await libraryDialog.waitFor();
    const closeBox = await libraryDialog.getByRole('button', { name: 'Close modal' }).boundingBox();
    assert.ok(closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height <= 600, 'Library preview close must stay inside short viewport');
    assert.equal(await libraryDialog.locator('video[controls]').count(), 1);
    await page.keyboard.press('Escape');
    await libraryDialog.waitFor({ state: 'detached' });
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  }
  await page.evaluate(() => document.documentElement.classList.remove('light'));
  await page.setViewportSize({ width: 1280, height: 720 });

  const initialCards = await page.locator('[data-testid^="pipeline-job-card-"]').count();
  assert.equal(initialCards, 12);

  // Load older pipeline videos (Page 2 -> total 16 cards)
  await page.getByTestId('load-more-pipeline-jobs').click();
  await page.getByTestId('pipeline-job-card-pipe-ui-job-16').waitFor();
  assert.equal(await page.locator('[data-testid^="pipeline-job-card-"]').count(), 16);

  // Test failed import feedback and retry on job #16
  const card16 = page.getByTestId('pipeline-job-card-pipe-ui-job-16');
  await card16.getByRole('button', { name: 'Import to Library', exact: true }).click();
  await card16.getByRole('alert').waitFor();
  await card16.getByRole('button', { name: 'Retry Import', exact: true }).click();
  await card16.getByRole('button', { name: 'Use in Composer', exact: true }).waitFor();
  await card16.getByRole('button', { name: 'Use in Composer', exact: true }).click();
  await page.getByLabel('Campaign / Post Title', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).importedJobs.filter((id: string) => id === 'pipe-ui-job-16').length), 2, 'Using an imported Pipeline video must reverify its stored master');
  await page.getByRole('button', { name: /Video Library/ }).click();

  // TASK 05: Out-of-order search response fencing
  await page.evaluate(() => {
    const win = window as any;
    win.pendingSearchResolvers['deep archive'] = () =>
      new Promise<void>((resolve) => {
        win.resolveSlowSearch = resolve;
      });
  });

  const pipeSearch = page.getByLabel('Search Pipeline Videos', { exact: true });
  await pipeSearch.fill('deep archive');
  await page.waitForTimeout(160); // allow debounce to fire slow search #1
  assert.equal(await page.getByText('Searching Pipeline videos...').isVisible(), true);
  assert.equal(await page.getByText('No Pipeline Videos Match Your Search or Filters').isVisible(), false);
  await pipeSearch.fill('story 01');
  await page.waitForTimeout(160); // fire fast search #2 ('story 01')
  await page.getByTestId('pipeline-job-card-pipe-ui-job-01').waitFor();

  // Now resolve the stale slow search #1 ('deep archive') AFTER search #2 has already rendered
  await page.evaluate(() => {
    if ((window as any).resolveSlowSearch) (window as any).resolveSlowSearch();
  });
  await page.waitForTimeout(60);
  assert.equal(
    await page.locator('[data-testid^="pipeline-job-card-"]').count(),
    1,
    'Stale out-of-order search response must be ignored'
  );
  assert.equal(await page.getByTestId('pipeline-job-card-pipe-ui-job-01').isVisible(), true);

  // Resolve an old request during the next search's debounce window.
  await pipeSearch.fill('deep archive');
  await page.waitForTimeout(160);
  await pipeSearch.fill('story 02');
  await page.evaluate(() => (window as any).resolveSlowSearch?.());
  await page.getByTestId('pipeline-job-card-pipe-ui-job-02').waitFor();
  assert.equal(await page.locator('[data-testid^="pipeline-job-card-"]').count(), 1);

  await pipeSearch.fill('fixture discovery failure');
  await page.getByText('Pipeline results are unavailable. Retry the request above.').waitFor();
  assert.equal(await page.getByText('No Pipeline Videos Match Your Search or Filters').isVisible(), false);

  await page.evaluate(() => { (window as any).holdSync = true; });
  await page.getByRole('button', { name: 'Sync from Pipeline', exact: true }).click();
  await page.waitForFunction(() => Boolean((window as any).releaseSync));
  await pipeSearch.fill('story 03');
  await page.getByTestId('pipeline-job-card-pipe-ui-job-03').waitFor();
  await page.evaluate(() => (window as any).releaseSync());
  await page.waitForTimeout(50);
  assert.equal(await page.getByRole('button', { name: 'Sync from Pipeline', exact: true }).isEnabled(), true);

  // Reset filters
  await page.getByRole('button', { name: 'Reset Pipeline Filters', exact: true }).click();
  await page.getByTestId('pipeline-job-card-pipe-ui-job-01').waitFor();

  // 8. TASK 09 & 10: Verify Desktop (1400x900), Short-Height (1280x600), and Mobile (390x844) in BOTH Warm Dark and Cozy Light themes
  await page.getByRole('button', { name: /Compose & Publish/ }).click();
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((tName) => {
      document.documentElement.classList.toggle('light', tName === 'light');
    }, theme);

    for (const vp of [
      { width: 1400, height: 900 },
      { width: 1280, height: 600 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      assert.equal(
        hasOverflow,
        false,
        `PublishingView must have zero horizontal overflow in ${theme} theme at ${vp.width}x${vp.height}`
      );
      await previewOrigBtn.click();
      const previewDialog = page.getByRole('dialog');
      await previewDialog.waitFor();
      const closeBox = await previewDialog.getByRole('button', { name: 'Close modal' }).boundingBox();
      assert.ok(closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height <= vp.height, 'Preview close button must stay inside the viewport');
      assert.equal(await previewDialog.locator('video[controls]').count(), 1);
      await page.keyboard.press('Escape');
      await previewDialog.waitFor({ state: 'detached' });
    }
  }
});
