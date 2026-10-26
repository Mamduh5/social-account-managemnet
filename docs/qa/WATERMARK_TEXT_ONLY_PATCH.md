# V1.11 branding follow-up: text only, no caption panels

26 October 2026, Asia/Bangkok. Ready for owner visual review after local validation. No commit, push, deployment, production restart or publishing was performed.

## Focused change

The previous orange caption came from FFmpeg `box=1:boxcolor=#B94E30:boxborderw=...` and the corresponding Canvas `fillRect`. Both are removed. Moving text and bottom caption now use only white glyphs (or the existing configured moving-text color), a thin outline and a subtle shadow. Every emitted `drawtext` has `box=0`; there is no `boxcolor` or background rectangle behind either branding element. The unused caption background-color helper was removed.

The change retains the caption's font, text and size. At the owner's follow-up request, the fixed caption is slightly lower: 70px down in the default 1080 x 1920 layout and 20px down in the default 1920 x 1080 layout. The shared footer offset is `safeArea.bottom * 0.75 + captionPadding`; moving-watermark margins and motion remain unchanged. Caption-only omits the moving filter entirely. Combined mode emits both independent text-only elements. No-watermark remains a byte-identical copy of the master with no encode. Account default captions, per-video overrides, Thai/English text, existing presets and all four primary selections remain intact:

| Selection | Moving text | Fixed bottom text | Background behind branding |
| --- | --- | --- | --- |
| No Watermark | No | No | None |
| Moving Watermark Only | Yes | No | None |
| Moving Watermark + Bottom Caption | Yes | Yes | None |
| Bottom Caption Only | No | Yes | None |

Canvas and FFmpeg use the same shared layout and the same caption style: outline 1px and shadow offset 1px at 1080p, black outline alpha 0.7 and shadow alpha 0.4. Those effects follow the glyphs; they do not fill the surrounding text bounds. The renderer cache version is now `branding-quality-v3-text-only`, keeping older orange-panel variants accessible while generating distinct new artifacts.

## Visual proof

Artifacts are isolated under `.data/watermark-text-only/20261026/`. Previous QA outputs remain in their original directory unchanged.

- [Orange-before versus text-only-after contact sheet](../../.data/watermark-text-only/20261026/visual/comparison-contact-sheet.png)
- [All eight playable samples and bright/dark comparisons](../../.data/watermark-text-only/20261026/visual/index.html)
- [Same-frame live preview versus actual export](../../.data/watermark-text-only/20261026/browser-runs/run-p6GPwW/preview-export-comparison.png)
- [Exact filters, source/output hashes and playback results](../../.data/watermark-text-only/20261026/visual/manifest.json)

| Mode | 9:16 at 1080 x 1920 | 16:9 at 1920 x 1080 |
| --- | --- | --- |
| No Watermark | [MP4](../../.data/watermark-text-only/20261026/visual/portrait-none.mp4) | [MP4](../../.data/watermark-text-only/20261026/visual/landscape-none.mp4) |
| Moving Watermark Only | [MP4](../../.data/watermark-text-only/20261026/visual/portrait-moving.mp4) | [MP4](../../.data/watermark-text-only/20261026/visual/landscape-moving.mp4) |
| Moving Watermark + Bottom Caption | [MP4](../../.data/watermark-text-only/20261026/visual/portrait-moving_and_caption.mp4) | [MP4](../../.data/watermark-text-only/20261026/visual/landscape-moving_and_caption.mp4) |
| Bottom Caption Only | [MP4](../../.data/watermark-text-only/20261026/visual/portrait-caption.mp4) | [MP4](../../.data/watermark-text-only/20261026/visual/landscape-caption.mp4) |

The samples reuse the exact prepared natural-footage masters from the previous QA, including their bright/dark exposure stress segments. No additional scaling, cropping or exposure change is introduced in this follow-up. The portrait source originally had 720 x 1280 resolution and was upscaled once in the prior QA preparation; landscape is native 1080p. Before references use the frozen orange-caption renderer, not a re-created mockup. Source hashes and no-watermark copies are checked.

## Verification

- Before the final placement tweak: **246/246 tests across 22 isolated files PASS**, including eight targeted branding tests. Server/operations typechecks and isolated client build passed. The eight natural-footage text-only samples completed browser playback and all ten before/after samples decoded fully.
- After lowering the caption: rebuilt the isolated client, refreshed the eight visual samples/contact sheet and ran **11 focused Studio checks PASS**. Those checks verify all four modes have zero orange panel pixels, caption-only has no upper moving ink, saved/override text, no-watermark byte identity and historical variant access. The live Canvas and actual FFmpeg caption geometry match within three pixels; separate engine anti-aliasing is not claimed pixel-identical.
- No full regression or long playback repeat was performed for the small placement tweak. The latest visual manifest explicitly records that lightweight refresh.
- Final browser proof and screenshots are in `.data/watermark-text-only/20261026/browser-runs/run-p6GPwW/`. Logs are `regression.log`, `targeted-tests.log`, `client-build-lower-caption.log` and `browser-lower-caption.log`.
- Snapshot comparison: 32 of 39 preexisting files remain byte-identical; the seven changed preexisting files are only the three branding implementation files, three branding test/harness files and the earlier branding QA report. `preservation.json` lists every file. The queue is byte-identical.

The matched-frame browser comparison uses a generated master fixture. Its top-left timestamp box is part of that source fixture, not added branding; the bottom custom caption is text-only in both images.

## Why the running owner export can still show black panels

A read-only health/config/source check confirmed the owner remains on frozen V1.10 release `cccf9390542199fb18ae442753eba87088c9b255`, serving its frozen client bundle. That release's FFmpeg renderer still contains `box=1:boxcolor=black@...` for both text elements. Editing the working tree or preview does not replace that already-running renderer. Rendering through the owner backend therefore does not exercise this patch. Its renderer and any older cached variants can retain the previous appearance.

Fresh exports from the matching isolated patched backend were checked and are panel-free. No owner restart or release repointing was done: the earlier instruction to stop before production deployment/restart remains in force. Activating the fix in the owner app requires the later matched server/client release; bot/calendar work and campaign approval are separate.

## Preservation and rollout

All 39 preexisting dirty/untracked files were copied and hashed before editing under `prepatch/`. Only three branding implementation files change: `ffmpeg.service.ts`, `branding-layout.ts`, and `WatermarkCanvas.tsx`, plus their branding tests/harnesses and QA documentation. Bot, calendar, queue, schema, runtime, account and routing implementations are byte-identical to this follow-up's prepatch state. The owner database is not opened by the test harnesses, and no protected queue item is changed.

No migration is required. Old variants keep their saved appearance and remain available; they are not overwritten or automatically re-rendered. Review runs on separate loopback 3197 with a separate database/key/client/media, paused workers and all provider fetches blocked. No Gemini request is used. V1.11 bot/calendar work, campaign approval and production rollout remain pending and untouched. A matched client/server release still requires separate authorization; this task stops at visual review.
