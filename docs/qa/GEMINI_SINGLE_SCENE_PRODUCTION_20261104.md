# Gemini standalone production checkpoint — 4 November 2026

> Historical source-only checkpoint. Later owner-authorized completion, commits, local activation and audio/draft results are recorded in [the unattended handoff](GEMINI_UNATTENDED_HANDOFF_20261104.md).

Implemented and verified as an uncommitted source checkpoint across Pipeline, its UI and the existing SCC agent. No provider generation was submitted. The running production API was not replaced; the new policy is not active in that binary yet.

## New Gemini production behavior

New recommended gemini_web creation uses one native ten-second portrait 9:16 scene, text only, native audio and Dense Performance 2x. New database defaults set Gemini scene_count to one; Flow remains two. Existing saved application preferences and project configurations are not migrated. The new-creation UI and omitted-count Gemini queue request recommend one scene independently of old saved multi-scene preferences.

The versioned standalone_10s_v1 workflow prepares a paused review-first project. The explicit automatic UI choice and the already-authorized agent creation route use standalone_10s_auto_v1, retaining the existing scheduler, account admission and submission cap. Queue creation is not itself a provider submission. The source does not resume a scheduler.

Image-conditioned, multi-scene, landscape and non-Dense new Gemini requests retain explicit review_first_v1 preparation as experimental. They cannot opt into the new standalone automatic workflow. The worker also blocks an experimental snapshot carrying a standalone automatic version. Historical unversioned generation contracts, saved prompt bytes, projects, results and recovery receipts retain compatibility; they are not rewritten or automatically reissued by this assignment. The existing production scheduler remains disabled.

Planning scopes the new standalone guidance through a Gemini-worker-only context flag. It requests an immediate hook, one consequential development and a complete visible payoff, with stable identities and purposeful physical action. It favors living objects, visual comedy, transformations, surprising interactions, miniature action and emotional micro-stories. It excludes compressed multi-scene drama, introductions, cliffhangers, long dialogue and extra plot added to meet a generic content target. New Gemini prompts keep sound effects and ambience and omit speaker/delivery/dialogue-preservation boilerplate when dialogue is empty. Owner-authored prompt edits retain their explicit editing contract.

## Source scope

Pipeline (D:/Mamduh/Personal/ai-video-pipeline): internal/appsettings/video.go changes only the Gemini new-database scene default. internal/contentplan/gemini_standalone.go and internal/ai/story_plan.go add explicitly opted-in Gemini planning guidance. internal/scenevideo/gemini_workflow.go, autopilot_planning.go, autopilot_subject_reference.go and autopilot.go snapshot/recognize the new workflows and reuse existing review and submission fences. internal/http/handler_gemini_autopilot.go and handler_scene_video_projects.go validate and expose the creation workflows. New Gemini standalone planner/HTTP/prompt/worker tests and an opt-in isolated preview cover these paths; the existing workflow creation test now checks normalized review-first replay identity.

UI (D:/Mamduh/Personal/ai-video-ui): NewVideoPage.tsx recommends one text-only scene and disables automatic experimental configurations. SceneProductionStudio.tsx and ProjectStudio.tsx expose the established review/recovery controls for the new version and label historical image/multi-scene Gemini projects experimental. GenerationSettingsFields.tsx has an optional Gemini-only copy flag whose default preserves Flow presentation. GeminiAuthorization.test.tsx adds creation/admission coverage; one Gemini-only expectation in SubjectReference.test.tsx now expects one scene.

SCC: scripts/agent/pipeline.ts defaults new requests to one scene, rejects new experimental production, and preserves read-only reconciliation of historical two-scene intents. workflow.ts preserves durable operation receipts and existing-job compatibility. runner.ts instructs Gemini concepts to use the complete ten-second structure. docs/AGENT_WORKFLOW.md updates the existing example and operating policy. Agent tests cover the new creation contract and historical recovery.

No flow_web/flow_manual adapter, Flow prompt builder, image pipeline, model setting, continuity rule, scheduler or shared generation default was changed. Shared planner/UI changes are explicitly opt-in for Gemini. No global text-only fallback exists.

## Verification

- Pipeline package gate: go test -json ./internal/browser/... ./internal/scenevideo ./internal/http ./internal/provideraccounts ./internal/ai ./internal/contentplan ./internal/appsettings — 11 packages, 841 top-level tests and 2,045 passing test/subtest events; zero failures, 46 opt-in skips. Real DOM fixtures used the existing UI node_modules. Existing Flow frozen prompt/planning, browser, image-role and scheduling regressions passed.
- After the final defensive automatic-snapshot guard, six focused standalone/review-first tests passed. The durable one-scene planning fixture saves a complete validated storyboard, reuses it without another planner request and submits no video.
- UI: 112 tests passed across seven focused Gemini/shared/Flow files. Typecheck and production build passed. Existing nonblocking Browserslist-age and bundle-size notices remain.
- SCC: all 73 isolated suites passed, 690 tests. This includes actual SQLite receipt persistence, lost-response fencing, immutable Pipeline import, moving-branding/draft preparation and separate approval/queue contracts using fixtures. The final agent contract run passed 50 tests. After the last historical-start guard adjustment, 14 focused tests and agent typecheck passed. These are fixture results, not permission to publish.
- git diff --check passed in all three repositories. No files were staged or committed.

Actual browser acceptance used the modified UI on 127.0.0.1:5197 and the real Pipeline creation handlers on an isolated fixture API at 127.0.0.1:8089. The browser created d8c9574c-d19d-4b19-ade1-c2f2aa258418 with standalone_10s_v1, one scene, ten seconds, portrait, Dense 2x and no image. Its review controls appeared. Selecting two scenes displayed the experimental notice and disabled automatic authorization. The preview used in-memory fixtures, no production database, no planner, no generation worker and zero provider calls. Unsupported recovery endpoints in this limited preview returned 404; production recovery remains covered by its normal regression tests. Both preview servers were stopped and the test browser tab closed. This verifies real UI/HTTP creation, not a live generated result or production activation.

## Recovered clip review

Original: .data/agent/gemini-input-isolation-20261104/text-control-recovered.mp4. SHA256 remains b1be81ca8edc621b4afe23bbceba3380b80dfdc418c67dd8804cabf5508b182c.

Actual visual review inspected 80 ordered samples across the ten-second clip plus the earlier ten-frame sheet. A small expressive excavator is caught in rain; the leaf grows/bends over it and becomes an umbrella. The visible sheltering payoff reads as a standalone living-object micro-story for โลกจริงหลุดบท. No preceding scene is needed to understand that action. This is sampled visual review, not a claim that every frame is artifact-free.

The owner first reported no sound, then heard sound in another player and described harsh/broken sounds, later suggesting they may be rain. The track is not silent: sample mean -27.9 dBFS, sample peak -0.2 dBFS, integrated loudness -23.6 LUFS, loudness range 4.2 LU and approximately 0 dBFS true peak. These measurements do not identify distortion or prove listening quality. No model listening was performed. The source of the perceived harshness and final clean-audio acceptance remain unresolved.

Creative acceptance is therefore held pending audio acceptance. The original was not imported into SCC, no moving-watermark variant was rendered and no owner draft was created. Conditional draft preparation was exercised in isolated tests. A Thai caption candidate is saved privately; it describes the visible leaf umbrella without inventing an unseen rescue. No audio processing was applied. The recovered clip was not substituted into the original film.

## Runtime and preservation

Production API remains PID 35704, bin/video-studio-api-scene2-repair-20261104.exe --gemini-only. A separate review executable was built at bin/video-studio-api-gemini-standalone-20261104.exe, SHA256 8b7e1baef3ab19a19acbe630ad02ebf0e889f515168ab1634c89a4afbe128e53; it was not activated.

Read-only production verification: Gemini scheduler disabled, no active run, submission_unresolved=false, application count three against unchanged cap four. Provider remaining video allowance remains unknown. Flow enabled, paused, 53 projects, zero reserved credits; observed totals are 12 authorized/12 spent/zero remaining. Original film 330aaf23-17d6-4982-96c6-93ef3792673c remains 1/2 accepted. Scene 1 was re-downloaded and its SHA256 still matches 77cb4c547d48140b7fadf9c2463b696f0c0833cf7ff41545eab2123d74bb8783.

No owner database mutation, production API restart, quota reset, new provider generation, automatic refresh, security-check interaction, SCC publication, schedule, Git commit, push or external deployment occurred. Source review and a deliberate safe local activation are the next implementation checkpoint. The recovered clip separately needs final listening acceptance before the conditional immutable import/watermark/unpublished-draft path can proceed.

Private evidence: .data/agent/gemini-single-scene-20261104/ contains package/agent/UI logs, the actual UI creation/admission receipts, runtime-preservation.json, creative-review.json, visual-80frames.jpg, audio-signal.txt and caption-candidate.txt. Existing diagnostic evidence and unrelated QA documents were preserved.
