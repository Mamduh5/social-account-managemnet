import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { brandingElements, resolveBrandingMode, getBrandingLayout, calculateBrandingPosition } from '../server/src/domain/branding-layout.js';

// Dynamic import is deliberate: even a direct invocation must never open owner data.
fs.mkdirSync(path.resolve('.data/test-runs'), { recursive: true });
const testRoot = fs.mkdtempSync(path.resolve('.data/test-runs/branding-quality-'));
process.env.SCC_DATA_DIR = testRoot;
let service: import('../server/src/services/ffmpeg.service.js').FFmpegService;
before(async () => {
  const { FFmpegService } = await import('../server/src/services/ffmpeg.service.js');
  service = new FFmpegService();
});
const base = { watermarkType: 'moving_text' as const, movementPreset: 'smooth_sine' as const,
  text: '@MOVING_SENTINEL', signatureText: 'แก้บัคยาวๆๆ Brand', enableSignature: true, fontSize: 32 };
const frame = { width: 1080, height: 1920, duration: 1, aspectRatio: '9:16', sizeBytes: 0 };
const sha = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function ffmpeg(args: string[], binary = false) {
  const result = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString());
  return binary ? result.stdout : result.stdout.toString();
}

test('four primary modes construct only their selected elements; no backing behind either text element', () => {
  assert.equal(service.buildWatermarkFilter({ ...base, mode: 'moving', text: '' }, frame), '',
    'explicit empty moving text must not receive a fallback or cause an empty drawtext encode');
  const captionWithEmptyMoving = service.buildWatermarkFilter({ ...base, mode: 'moving_and_caption', text: '' }, frame);
  assert.equal((captionWithEmptyMoving.match(/drawtext=/g) || []).length, 1);
  assert.ok(captionWithEmptyMoving.includes(base.signatureText));
  const expected = { none: [false, false], moving: [true, false], moving_and_caption: [true, true], caption: [false, true] };
  for (const [mode, [moving, caption]] of Object.entries(expected)) {
    const kit = { ...base, mode: mode as any };
    assert.deepEqual(brandingElements(kit), { mode, moving, caption });
    const filter = service.buildWatermarkFilter(kit, frame);
    assert.equal(filter.includes('MOVING_SENTINEL'), moving);
    assert.equal(filter.includes('แก้บัคยาวๆๆ Brand'), caption);
    assert.equal((filter.match(/drawtext=/g) || []).length, Number(moving) + Number(caption));
    if (!moving) assert.equal(filter.includes('sin('), false, 'caption-only must omit the motion filter entirely');
    if (moving) assert.match(filter, /box=0:borderw=1/);
    assert.equal(filter.includes('boxcolor='), false, 'neither element may configure any background color');
    assert.equal(filter.includes('box=1'), false, 'neither element may enable a text box');
    assert.equal((filter.match(/box=0/g) || []).length, Number(moving) + Number(caption));
    if (mode === 'none') assert.equal(filter, '');
  }
});

test('legacy presets retain text, optional caption, static motion and original serialized values', () => {
  const legacy = { ...base, movementPreset: 'static_corner' as const, boxBgOpacity: 0.55 };
  const before = JSON.stringify(legacy);
  assert.equal(resolveBrandingMode(legacy), 'moving_and_caption');
  const filter = service.buildWatermarkFilter(legacy, frame);
  assert.equal(filter.includes('sin('), false);
  assert.ok(filter.includes('MOVING_SENTINEL'));
  assert.ok(filter.includes('แก้บัคยาวๆๆ Brand'));
  assert.equal(resolveBrandingMode({ ...legacy, enableSignature: false }), 'moving');
  assert.equal(JSON.stringify(legacy), before);
});

test('preview layout scales proportionally and keeps all movement presets inside both safe areas', () => {
  assert.throws(() => service.buildWatermarkFilter({ ...base,
    safeArea: { top: 800, bottom: 800, left: 40, right: 80 } },
  { ...frame, width: 1920, height: 1080, aspectRatio: '16:9' }), /Safe-area margins leave no room/);
  for (const [width, height, aspectRatio] of [[1080, 1920, '9:16'], [1920, 1080, '16:9']] as const) {
    const layout = getBrandingLayout(base, { width, height, aspectRatio });
    const half = getBrandingLayout(base, { width: width / 2, height: height / 2, aspectRatio });
    assert.equal(layout.fontSize, half.fontSize * 2);
    assert.equal(layout.captionFontSize, half.captionFontSize * 2);
    if (aspectRatio === '9:16') assert.equal(layout.safeArea.right, 120);
    assert.equal(layout.captionBottom, aspectRatio === '9:16' ? 220 : 70, 'lower fixed caption offset must remain shared by preview and export');
    for (const preset of ['smooth_sine', 'corner_jump', 'diagonal_bounce', 'static_corner'] as const) {
      for (let t = 0; t <= 30; t += 0.1) {
        const pos = calculateBrandingPosition({ t, containerWidth: width, containerHeight: height,
          textWidth: 400, textHeight: 40, preset, safeArea: layout.movingSafeArea });
        assert.ok(pos.x >= layout.movingSafeArea.left - 1e-6);
        assert.ok(pos.y >= layout.movingSafeArea.top - 1e-6);
        assert.ok(pos.x + 400 <= width - layout.movingSafeArea.right + 1e-6);
        assert.ok(pos.y + 40 <= height - layout.movingSafeArea.bottom + 1e-6);
      }
    }
  }
});

test('Thai/English punctuation is rendered literally with identical pixels to a UTF-8 textfile', () => {
  const text = "แก้บัค ไทย Owner's : [brand], 100% \\ path; %{n} English";
  const kit = { ...base, mode: 'moving' as const, text, movementPreset: 'static_corner' as const };
  const smallFrame = { ...frame, width: 720, height: 1280 };
  const directFilter = service.buildWatermarkFilter(kit, smallFrame);
  const textFile = path.join(testRoot, 'literal.txt');
  fs.writeFileSync(textFile, text, 'utf8');
  const escapedPath = textFile.replace(/\\/g, '/').replace(/:/g, '\\\\:');
  const start = directFilter.indexOf(':text=');
  const end = directFilter.indexOf(':fontsize=', start);
  assert.ok(start > 0 && end > start);
  const referenceFilter = directFilter.slice(0, start) + ':textfile=' + escapedPath + directFilter.slice(end);
  const render = (filter: string) => ffmpeg(['-f', 'lavfi', '-i', 'color=c=white:s=720x1280:d=0.04',
    '-vf', filter, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], true);
  assert.deepEqual(render(directFilter), render(referenceFilter), 'escaping must preserve exact literal glyph sequence');
});

test('real renders preserve master/audio/dimensions; none is byte-exact and variants remain accessible', async () => {
  const source = path.join(testRoot, 'master.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=gray:s=360x640:r=10:d=0.5', '-f', 'lavfi', '-i',
    'sine=frequency=440:duration=0.5', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', source, '-y']);
  const original = sha(source);
  const paths: string[] = [];
  for (const mode of ['none', 'moving', 'moving_and_caption', 'caption'] as const) {
    const output = await service.renderBrandedVideo(source, { ...base, mode });
    paths.push(output);
    const meta = await service.probeVideo(output);
    assert.equal(meta.width, 360); assert.equal(meta.height, 640); assert.equal(meta.hasAudio, true);
    assert.equal(meta.audioCodec, 'aac');
    ffmpeg(['-i', output, '-f', 'null', '-']); // decode the complete playable sample
    if (mode === 'none') assert.equal(sha(output), original);
    assert.equal(sha(source), original);
  }
  assert.equal(new Set(paths).size, 4);
  assert.equal(await service.renderBrandedVideo(source, { ...base, mode: 'caption' }), paths[3]);
  const oldHashes = paths.map(sha);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=360x640:r=10:d=0.5', '-c:v', 'libx264', source, '-y']);
  const changed = await service.renderBrandedVideo(source, { ...base, mode: 'caption' });
  assert.notEqual(changed, paths[3], 'changed content at same source path needs a new render key');
  assert.deepEqual(paths.map(sha), oldHashes, 'earlier variants must survive new renders');
});

test('caption-only has zero added pixels above its fixed label for every decoded frame', () => {
  const kit = { ...base, mode: 'caption' as const };
  const meta = { ...frame, width: 360, height: 640 };
  const filter = service.buildWatermarkFilter(kit, meta);
  const raw = ffmpeg(['-f', 'lavfi', '-i', 'color=c=gray:s=360x640:r=10:d=1', '-vf', filter,
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], true) as Buffer;
  const plain = ffmpeg(['-f', 'lavfi', '-i', 'color=c=gray:s=360x640:r=10:d=1',
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], true) as Buffer;
  const frameBytes = 360 * 640 * 3;
  assert.equal(raw.length / frameBytes, 10);
  for (let index = 0; index < 10; index++) {
    const offset = index * frameBytes;
    assert.deepEqual(raw.subarray(offset, offset + 360 * 500 * 3), plain.subarray(offset, offset + 360 * 500 * 3));
  }
  assert.notDeepEqual(raw, plain, 'the bottom label itself must remain visible');
});

test('concurrent identical renders publish one complete cache artifact without staging leftovers', async () => {
  const source = path.join(testRoot, 'concurrent-master.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=darkgreen:s=360x640:r=10:d=0.5', '-c:v', 'libx264', source, '-y']);
  const kit = { ...base, mode: 'moving_and_caption' as const, text: '@ConcurrentUnique' };
  const outputs = await Promise.all(Array.from({ length: 3 }, () => service.renderBrandedVideo(source, kit)));
  assert.equal(new Set(outputs).size, 1);
  for (const output of outputs) ffmpeg(['-i', output, '-f', 'null', '-']);
  const renderFiles = fs.readdirSync(path.join(testRoot, 'renders'));
  assert.equal(renderFiles.some(file => file.includes('.staging')), false);
  assert.equal(renderFiles.filter(file => file === path.basename(outputs[0])).length, 1);
});


test('caption pixels contain only glyph strokes and shadow, with transparent gaps instead of a filled panel', () => {
  const meta = { ...frame, width: 360, height: 640 };
  const filter = service.buildWatermarkFilter({ ...base, mode: 'caption', signatureText: 'I I', fontSize: 96 }, meta);
  const rgba = ffmpeg(['-f', 'lavfi', '-i', 'color=c=black@0:s=360x640:r=1:d=1,format=rgba',
    '-vf', filter, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'], true) as Buffer;
  let minX=360, maxX=-1, minY=640, maxY=-1, ink=0, orange=0;
  for(let y=0;y<640;y++) for(let x=0;x<360;x++) {
    const i=(y*360+x)*4;
    if(rgba[i+3]) {
      ink++; minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
      if(rgba[i]===185&&rgba[i+1]===78&&rgba[i+2]===48)orange++;
    }
  }
  assert.ok(ink>0, 'caption glyphs must be visible');
  assert.equal(orange,0,'orange panel pixels must be absent');
  const bounds=(maxX-minX+1)*(maxY-minY+1);
  assert.ok(ink/bounds<0.75,`text bounding box must retain transparent spaces, not a filled rectangle: ${ink}/${bounds}`);
});
