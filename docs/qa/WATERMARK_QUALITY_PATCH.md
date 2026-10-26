#> The later [text-only caption follow-up](WATERMARK_TEXT_ONLY_PATCH.md) supersedes the orange caption styling in this historical report. Current moving and bottom branding are both text-only. Earlier variants and comparison artifacts remain preserved.

 Urgent watermark quality patch - 26 October 2026

Status: engineering, automated checks and agent visual inspection PASS; **ready for owner visual review**. Owner visual approval, V1.11 production rollout and campaign approval remain pending. No commit, push, deployment or production restart was performed.

## Root cause and existing implementation

The pre-patch `FFmpegService.buildWatermarkFilter()` in `server/src/services/ffmpeg.service.ts` always appended the main moving `drawtext`, with `box=1:boxcolor=black@0.45:boxborderw=8` by default. `WatermarkCanvas.tsx` independently drew a black translucent rectangle and border. This was deliberate overlay construction, not black pixels in the master or an encoder artifact.

The existing bottom caption is the separate **fixed centered signature**: `enableSignature` / `signatureText`. Its old FFmpeg treatment used white text at 0.6 opacity over `black@0.3`; Canvas used a different size and position. No separate hardcoded follow button was found in the inspected renderer/Studio. The patch retains that existing bottom element and saved text, gives it a solid terracotta label treatment, and makes it independently selectable. `static_corner` remains a movement preset; it is not the bottom-caption-only mode.

## Resulting behavior

| Primary selection | Moving text | Fixed bottom label | Render path |
| --- | --- | --- | --- |
| No Watermark | Absent | Absent | Byte-identical managed copy of source; no FFmpeg encode and no empty `-vf` |
| Moving Watermark Only | Present | Absent | One moving `drawtext`, `box=0` |
| Moving Watermark + Bottom Caption | Present | Present | Independent moving and fixed-label filters |
| Bottom Caption Only | Absent | Present | Only fixed-label filter; no moving text or motion expression |

New optional `mode` values are `none`, `moving`, `moving_and_caption`, `caption`. Kits without `mode` resolve from existing `enableSignature`; existing movement presets and saved `text` / `signatureText` are retained. Legacy box settings remain stored but no longer put a backing behind moving text. No saved owner kit was rewritten.

Moving text uses the installed Tahoma face for Thai and English, FreeType anti-aliasing and text shaping, with a fine outline and restrained shadow. The bottom label uses white Unicode text on solid `#B94E30`, without translucent black. Shared pure layout/motion functions in `server/src/domain/branding-layout.ts` drive Canvas and FFmpeg. Preview uses the selected master video and its actual resolution/time; the old preview-only 1.5x font multiplier is removed. Guides are optional and not exported. Both layouts honor safe margins, with a new 9:16 default right margin of 120px; saved explicit margins still win. Combined mode reserves separation above the label. Impossible margins fail clearly.

Overlay exports preserve source dimensions, frame rate and framing, copy the audio stream, and use H.264 CRF 18 instead of 22. There is no production scaling/cropping filter. A content-hash plus renderer-version cache avoids stale style/content reuse. Concurrent equivalent requests join one render; unique staging files become final variants only after completion and master-hash verification. Old render paths/files/records are retained.

## Customizable account and video caption text

- **Account Default Bottom Caption** uses the account name only when no saved `signatureText` exists. Existing saved text, including an explicit empty string, is preserved. `Save Brand Kit` persists that account's defaults through the existing JSON endpoint.
- **Use Per-Video Caption Override** exposes any owner-entered Unicode caption for the current preview/render. It applies identically in both modes containing a bottom caption. It is excluded when saving account defaults; changing account/video clears it. The exact effective settings are stored with the resulting variant.
- No CTA substitution is introduced. A brand name, Page name, slogan or owner-written call-to-action remains literal, including Thai marks, spacing, apostrophes, colons, commas, brackets, percent signs and backslashes. FFmpeg expansion is disabled and filter values are escaped at both parsing layers.
- Font Scale remains editable in caption-only mode. Moving opacity is disabled when moving text is absent. Async render/library responses cannot replace the current video's preview with stale results.

`publicAccount()` supplies a nonpersisting account-name caption fallback. On-the-fly queue rendering uses saved account defaults, so save the desired kit before using that workflow. Rendering a selected variant uses its saved exact artifact. Source inspection confirms `publishing.service.ts` checks master/variant association, and `queue.service.ts` passes the same selected/rendered path to API and manual-handoff connectors. Routing, authorization, review holds and publication intent rules are unchanged. The sole branding adjustment inside the already-dirty queue file is `brandKit.text || job.account_handle` -> `brandKit.text ?? job.account_handle`, preserving an intentional empty string.

## Visual review artifacts

Private local artifacts live under `.data/watermark-patch/20261026/` and remain ignored.

- [Labeled comparison contact sheet](../../.data/watermark-patch/20261026/visual/comparison-contact-sheet.png)
- [All playable samples and full-resolution bright/dark frame comparisons](../../.data/watermark-patch/20261026/visual/index.html)
- [Source/output hashes, exact filters, dimensions, full decode and browser playback evidence](../../.data/watermark-patch/20261026/visual/manifest.json)

| Mode | 9:16, 1080 x 1920 | 16:9, 1920 x 1080 |
| --- | --- | --- |
| No Watermark | [MP4](../../.data/watermark-patch/20261026/visual/portrait-none.mp4) | [MP4](../../.data/watermark-patch/20261026/visual/landscape-none.mp4) |
| Moving Watermark Only | [MP4](../../.data/watermark-patch/20261026/visual/portrait-moving.mp4) | [MP4](../../.data/watermark-patch/20261026/visual/landscape-moving.mp4) |
| Moving Watermark + Bottom Caption | [MP4](../../.data/watermark-patch/20261026/visual/portrait-moving_and_caption.mp4) | [MP4](../../.data/watermark-patch/20261026/visual/landscape-moving_and_caption.mp4) |
| Bottom Caption Only | [MP4](../../.data/watermark-patch/20261026/visual/portrait-caption.mp4) | [MP4](../../.data/watermark-patch/20261026/visual/landscape-caption.mp4) |
| Pre-patch combined reference | [MP4](../../.data/watermark-patch/20261026/visual/portrait-before.mp4) | [MP4](../../.data/watermark-patch/20261026/visual/landscape-before.mp4) |

Each sample has four seconds of actual footage, with controlled exposure preparation to stress both bright and dark frames. Portrait uses the existing `real_9_16_test.mp4` tape-dispenser footage, originally 720 x 1280, upscaled once with Lanczos during sample preparation. Landscape uses native 1920 x 1080 [Samplelib park/traffic footage](https://samplelib.com/sample-mp4.html); the downloaded source URL and hash are in the manifest. Original source bytes remain untouched. These prepared QA masters are separate files; no-watermark outputs match their prepared masters byte-for-byte. The production renderer does not perform this sample preparation or exposure adjustment.

The sheet contains 20 labeled before/after bright/dark frames. Agent inspection of the sheet and full-resolution frames found the moving panel removed, sharp Thai/English glyphs, readable text on bright/dark regions, a recognizable fixed label and correct element selection. This is agent visual inspection; owner creative approval remains pending.

## Final verification

| Check | Result | Evidence |
| --- | --- | --- |
| Targeted real branding tests | **7/7 PASS** | `test/branding_quality.test.ts`; private `targeted-tests.log` |
| Full regression | **245/245 PASS, 22 isolated test files**, zero failed/cancelled/skipped | private `regression-final.log`, `validation-summary.json` |
| Server typecheck | PASS | `npx tsc --noEmit`; `server-typecheck-final.log` |
| Operations typecheck | PASS | `npx tsc --project tsconfig.operations.json`; `operations-typecheck-final.log` |
| Client typecheck/build | PASS | `npm run build:client`; `client-build-final.log`, isolated candidate bundle |
| Studio browser acceptance | **10/10 PASS**, zero page errors/prohibited requests | `test/e2e/watermark_studio_acceptance.ts`; `browser-acceptance-final.log`; screenshots/result in `browser-runs/run-MjIw1i/` |
| Sample complete decoding | **10/10 PASS** (eight patched, two before) | visual manifest |
| Sample complete browser playback | **8/8 PASS**, ended at native 1080p dimensions | manifest `browserPlayback`; private `visual-playback.log` |
| Caption-only absence of moving overlay | No moving filter; all **96 frames per aspect ratio** have exact raw-filter upper-region hashes equal to the source | visual manifest; test also checks all ten frames of an independent fixture |
| No-watermark invariance | Prepared-master SHA256 equals output SHA256 in both aspects; API download also byte-identical | manifest and Studio browser acceptance |
| Literal Unicode/escaping | Exact raw RGB equality against UTF-8 textfile reference | targeted test |
| Legacy presets/variants | Serialization unchanged; historical variant remains listed/downloadable; earlier files survive new content-key renders | targeted and browser checks |
| Concurrent rendering | Three equivalent calls share completed output, full decode succeeds, no staging files remain | targeted test |
| Preexisting V1.11 work | All **23** original dirty/untracked files preserved; 22 byte-identical, queue differs only by the documented `??` substitution | private `preservation.json`, `preexisting-work/manifest.json`, `tracked.patch` |

The first regression run failed only on an old 80px default-right-margin expectation. The test now expects the required 120px default and separately verifies a saved explicit 80px override. The final full run is green. Patch-scoped whitespace checks pass. Repository-wide `git diff --check` still reports preexisting trailing whitespace in dirty `client/src/App.tsx:5`; it was deliberately preserved.

## Reproduction and boundaries

Run from the workspace root, using only isolated paths:

```powershell
npx tsx --test test/branding_quality.test.ts
npm test
npx tsc --noEmit
npx tsc --project tsconfig.operations.json
$env:SCC_CLIENT_BUILD_DIR = Join-Path (Get-Location) '.data/watermark-patch/20261026/client'
npm run build:client
npx tsx test/e2e/watermark_studio_acceptance.ts
npx tsx test/e2e/branding_visual_acceptance.ts
```

The visual harness uses the retained private pre-patch renderer in `baseline/` and the source clips identified above; keep these artifacts for reproducing this comparison. The baseline source revision was `2900b749fbc4452123ec459b3566e7be2a52622f`. Browser checks use installed Chrome/Edge or an available Playwright executable. The separate Studio review runs only on 127.0.0.1:3197 with its own database, key, bundle and media. Review workers are paused and **all provider fetches are blocked**, including Gemini. The temporary review server was stopped after acceptance. Automated provider tests use transport mocks; no application Gemini request was consumed.

No test harness opened the owner database. No owner migration, database replacement, campaign/plan approval, queue action, connection change, new schedule, social upload/post/reply/reaction, owner restart or pipeline change was performed. The three protected manual destinations were left outside every test path; this report does not claim a new live-row comparison or live platform acceptance. No production artifact or owner configuration was replaced.

## Migration and rollout

**No database migration is required for this branding patch.** Optional mode and caption settings use existing brand-kit/variant JSON fields. Existing media and variant records stay accessible; old outputs retain their old appearance until a new derivative is deliberately rendered.

After owner visual approval, a separately authorized release must package the matching server and client, including the shared layout module, through the existing frozen owner-release procedure. An older renderer does not understand the new explicit modes. Do not copy the review database or bundle over the owner installation. V1.11 schema rollout, seven-day campaign approval and any public posting remain independent, pending owner decisions. This task stops before commit, deployment, production restart or campaign activation.
