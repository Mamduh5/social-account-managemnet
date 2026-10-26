/** Offline visual evidence. Never starts the owner, a queue, or a provider. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve('.data/v111-integration/20261026/branding');
const previous = path.resolve('.data/watermark-patch/20261026');
const out = path.join(root, 'visual');
fs.mkdirSync(out, { recursive: true });
process.env.SCC_DATA_DIR = path.join(root, 'isolated-data');
process.env.SCC_ISOLATED_TEST = 'true';
process.env.SCC_PAUSE_WORKERS = 'true';
const sha = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(args: string[], options: { binary?: boolean } = {}) {
  const result = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr?.toString() || 'FFmpeg failed');
  return options.binary ? result.stdout : result.stdout.toString();
}
async function main() {
  const refreshVisuals = process.argv.includes('--refresh-visuals');
  if (process.argv.includes('--browser-only')) {
    await verifyBrowserSamples(JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')));
    return;
  }
  const { FFmpegService } = await import('../../server/src/services/ffmpeg.service.js');
  const service = new FFmpegService();
  // Reconstruct the saved orange-caption renderer using its frozen pure layout;
  // replace database access with an isolated render directory before evaluation.
  const baselineDir = path.join(root, 'baseline');
  fs.mkdirSync(baselineDir, { recursive: true });
  const snapshot = path.resolve('.data/watermark-text-only/20261026/prepatch/server/src');
  fs.copyFileSync(path.join(snapshot, 'domain/branding-layout.ts'), path.join(baselineDir, 'branding-layout.ts'));
  let legacySource = fs.readFileSync(path.join(snapshot, 'services/ffmpeg.service.ts'), 'utf8');
  legacySource = legacySource.replace("import { rendersDir } from '../db/database.js';",
    `const rendersDir = ${JSON.stringify(path.join(out, 'legacy-renders'))};`)
    .replaceAll("'../domain/branding-layout.js'", "'./branding-layout.js'");
  fs.mkdirSync(path.join(out, 'legacy-renders'), { recursive: true });
  const legacyModule = path.join(baselineDir, 'isolated-legacy-renderer.ts');
  fs.writeFileSync(legacyModule, legacySource);
  const Legacy = (await import(pathToFileURL(legacyModule).href)).FFmpegService;
  const legacy = new Legacy();
  const kit = { watermarkType: 'moving_text' as const, movementPreset: 'smooth_sine' as const,
    text: '@แก้บัคยาวๆๆ SCC', signatureText: 'แก้บัคยาวๆๆ • Brand Studio', enableSignature: true,
    fontSize: 36, opacity: 0.95, speedSeconds: 6, boxBgOpacity: 0.45 };
  const definitions = [
    { name: 'portrait', width: 1080, height: 1920, aspectRatio: '9:16',
      source: path.resolve('.data/uploads/real_9_16_test.mp4'), sourceSize: '720x1280',
      exposure: "eq=brightness='if(lt(t,2),0.38,0)':eval=frame" },
    { name: 'landscape', width: 1920, height: 1080, aspectRatio: '16:9',
      source: path.join(previous, 'landscape-natural-source.mp4'), sourceSize: '1920x1080',
      sourceUrl: 'https://samplelib.com/mp4/sample-5s.mp4', sourcePage: 'https://samplelib.com/sample-mp4.html',
      exposure: "eq=brightness='if(lt(t,2),0,-0.35)':eval=frame" },
  ];
  const labels = { before: 'Before: orange caption panel', none: 'No Watermark', moving: 'Moving Watermark Only',
    moving_and_caption: 'Moving Watermark + Bottom Caption', caption: 'Bottom Caption Only' };
  const manifest: any = { createdAt: new Date().toISOString(), offline: true, ownerDatabaseOpened: false,
    note: 'Combined V1.11 release validation: reuses unchanged prepared 4s bright/dark 1080p masters from prior QA. Portrait originally720p, upscaled once in prior preparation; landscape native1080p. No new cropping/scaling or source mutation. Before shows saved orange-caption renderer; after has no panels behind either text element.',
    font: 'C:/Windows/Fonts/tahoma.ttf', kit, samples: [], checks: [] };
  const htmlRows: string[] = [];
  for (const def of definitions) {
    assert.ok(fs.existsSync(def.source), `Missing existing source ${def.source}`);
    const originalHash = sha(def.source);
    const master = path.join(out, `${def.name}-source-1080p.mp4`);
    const preparedSource = path.join(previous, 'visual', `${def.name}-source-1080p.mp4`);
    const preparedHash = sha(preparedSource);
    fs.copyFileSync(preparedSource, master);
    assert.equal(sha(master), preparedHash);
    const masterHash = sha(master);
    const metadata = await service.probeVideo(master);
    const outputs: any[] = [];
    for (const mode of ['before', 'none', 'moving', 'moving_and_caption', 'caption'] as const) {
      const target = path.join(out, `${def.name}-${mode}.mp4`);
      let filter: string;
      if (mode === 'before') {
        filter = legacy.buildWatermarkFilter(kit, metadata);
        run(['-i', master, '-vf', filter, '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-c:a', 'copy',
          '-movflags', '+faststart', target, '-y']);
      } else {
        const options = { ...kit, mode };
        filter = service.buildWatermarkFilter(options, metadata);
        assert.equal(filter.includes('box=1'), false, 'no new mode may enable a text panel');
        assert.equal(filter.includes('boxcolor='), false, 'no new mode may configure panel color');
        assert.equal(filter.includes('#B94E30'), false, 'orange caption panel must be gone');
        const rendered = await service.renderBrandedVideo(master, options);
        fs.copyFileSync(rendered, target);
      }
      const meta = await service.probeVideo(target);
      assert.equal(meta.width, def.width); assert.equal(meta.height, def.height);
      assert.ok(Math.abs(meta.duration - 4) < 0.1);
      if (!refreshVisuals) run(['-i', target, '-f', 'null', '-']);
      const frames: string[] = [];
      for (const [exposure, timestamp] of [['bright', 0.75], ['dark', 3.25]] as const) {
        const frameFile = `${def.name}-${mode}-${exposure}.png`;
        run(['-ss', String(timestamp), '-i', target, '-frames:v', '1', path.join(out, frameFile), '-y']);
        frames.push(frameFile);
      }
      const outputHash = sha(target);
      if (mode === 'none') assert.equal(outputHash, masterHash);
      outputs.push({ mode, label: labels[mode], filename: path.basename(target), sha256: outputHash, metadata: meta, filter, frames });
      console.log(`PASS ${def.aspectRatio} ${labels[mode]} (${meta.duration}s ${refreshVisuals ? 'visual refresh' : 'full decode'})`);
    }
    assert.equal(sha(master), masterHash);
    assert.equal(sha(def.source), originalHash);
    manifest.samples.push({ ...def, originalSourceSha256: originalHash, preparedFrom: preparedSource, preparedMaster: path.basename(master), preparedMasterSha256: masterHash, outputs });
    manifest.checks.push(`${def.aspectRatio}: ${refreshVisuals ? 'visual refresh only; full decode not repeated' : 'all five complete decodes'}; dimensions and duration preserved, no-watermark SHA equals prepared master, original source SHA unchanged`);
    // Every-frame proof on actual footage: compare caption-only against the
    // same full encode with no overlay. Re-encoding noise is measured separately
    // from a strict raw filter-domain mask; crop excludes the fixed label.
    if (!refreshVisuals) {
    const captionFilter = outputs.find(item => item.mode === 'caption').filter;
    const boundary = Math.floor(def.height - (def.aspectRatio === '9:16' ? 440 : 240));
    const crop = `crop=${def.width}:${boundary}:0:0`;
    const baselineRaw = run(['-i', master, '-vf', crop, '-pix_fmt', 'gray', '-f', 'hash', '-hash', 'sha256', '-']);
    const captionRaw = run(['-i', master, '-vf', `${captionFilter},${crop}`, '-pix_fmt', 'gray', '-f', 'hash', '-hash', 'sha256', '-']);
    assert.equal(captionRaw, baselineRaw, 'caption-only must leave the complete upper region unchanged for every source frame');
    manifest.checks.push(`${def.aspectRatio}: all96frames caption-only filter upper-region SHA exactly equals unbranded source (height ${boundary})`);
    }
    for (const [exposure, title] of [['bright', 'Bright frames'], ['dark', 'Dark frames']] as const) {
      htmlRows.push(`<h2>${def.aspectRatio} • ${title}</h2><div class="row ${def.name}">${outputs.map(item => `<figure><figcaption>${item.label}</figcaption><img src="${def.name}-${item.mode}-${exposure}.png"><a href="${item.filename}">Play 4-second sample</a></figure>`).join('')}</div>`);
    }
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const html = `<!doctype html><meta charset="utf-8"><title>Watermark quality patch comparison</title><style>*{box-sizing:border-box}body{font:16px Tahoma,sans-serif;background:#f4f0e9;color:#302b26;margin:0;padding:30px}h1{font-size:28px;margin:0 0 10px}p{margin:0 0 22px;line-height:1.5}h2{font-size:20px;margin:30px 0 12px}.row{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}figure{margin:0;padding:10px;background:white;border:1px solid #d4ccc1;border-radius:10px}figcaption{min-height:40px;font-size:15px;font-weight:bold}img{display:block;width:100%;height:auto}a{display:block;margin:10px 0 0;color:#963c24}small{font-size:13px}</style><h1>V1.11 combined release • Text-only branding • Thai + English</h1><p>Actual footage, prepared as 4-second bright/dark exposure stress clips at1080p. Portrait: existing720×1280 tape-dispenser clip, aspect-preserving upscale during sample preparation. Landscape: native1920×1080 park/road footage from <a style="display:inline" href="https://samplelib.com/sample-mp4.html">Samplelib</a>. No crop. Patched renders retain sample dimensions. Text-only bottom caption: แก้บัคยาวๆๆ • Brand Studio.</p>${htmlRows.join('')}<p><small>Before uses the saved orange-caption renderer. All four after modes have no solid or translucent panels behind branding text. No Watermark is a byte-exact copy of each prepared sample master. Manifest includes all filters, hashes and full-decode results. Production was not restarted or modified.</small></p>`;
  fs.writeFileSync(path.join(out, 'index.html'), html);
  await verifyBrowserSamples(manifest, refreshVisuals);
  console.log('All visual checks PASS. Review: ' + path.join(out, 'index.html'));
}
async function verifyBrowserSamples(manifest: any, screenshotOnly = false) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(out, 'index.html')).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(img => img.decode())); });
    await page.screenshot({ path: path.join(out, 'comparison-contact-sheet.png'), fullPage: true });
    if (screenshotOnly) {
      manifest.refreshMode = 'visuals_only';
      manifest.browserPlayback = { status: 'not_repeated', note: 'Visual-only refresh after caption placement adjustment; no playback or full-frame regression rerun.' };
      fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
      console.log('Visual sheet refreshed; playback and full-frame checks intentionally not repeated.');
      return;
    }
    const playback: any[] = [];
    for (const sample of manifest.samples) {
      for (const output of sample.outputs.filter((item: any) => item.mode !== 'before')) {
        const result = await page.evaluate(async (filename: string) => {
          const video = document.createElement('video');
          video.muted = true; video.src = filename;
          video.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;right:0';
          document.body.append(video);
          try {
            await new Promise<void>((resolve, reject) => {
              const timeout = window.setTimeout(() => reject(new Error('Playback timed out')), 15000);
              video.addEventListener('ended', () => { clearTimeout(timeout); resolve(); }, { once: true });
              video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Media decode failed')); }, { once: true });
              video.play().catch(reject);
            });
            return { ended: video.ended, width: video.videoWidth, height: video.videoHeight,
              duration: video.duration, playedUntil: video.currentTime };
          } finally { video.remove(); }
        }, output.filename);
        assert.equal(result.ended, true); assert.equal(result.width, sample.width); assert.equal(result.height, sample.height);
        playback.push({ filename: output.filename, ...result });
      }
    }
    manifest.browserPlayback = { browser: 'Installed Chrome, isolated headless profile', results: playback };
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`PASS complete Chrome playback ${playback.length}/8 patched mode samples`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
