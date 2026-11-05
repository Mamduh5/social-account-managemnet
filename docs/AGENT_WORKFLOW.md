# API-first agent workflow

The shared TypeScript CLI lets Codex, Gemini, shell scripts and other agents use the existing Gemini Autopilot and SCC APIs. Agents supply creative decisions, captions and hashtags. Existing application workers generate, assemble, brand and dispatch. This CLI adds no provider, server, polling daemon, publishing engine or UI.

For asynchronous generation, independent preparation tasks and compact recovery handoff, follow [non-blocking agent work](AGENT_NONBLOCKING_WORK.md). After `start`, continue useful work with `work-next`; inspect results in a later invocation using one `refresh`. Do not wait in an LLM session for Gemini.

For optional unattended preparation, use the [agent runner](AGENT_RUNNER.md). It reuses these tasks and handoffs, remains disabled by default, and requires separate owner authorization and OS schedule configuration before automatic execution.

Use Node and the repository's installed dependencies. Run from the SCC repository:

```powershell
npm --silent run agent -- help
npm --silent run agent -- context
npm --silent run agent -- context --account ACCOUNT_ID
npm --silent run agent -- discover
```

Every command writes one compact `agent-workflow.v1` JSON object. Use `--silent` to suppress npm's own banner. Success has `{version,ok:true,command,data}`; failure has `{version,ok:false,command,error:{code,message,uncertain}}` and exits nonzero. Input is UTF-8 JSON from `--input file.json` or `--input -` (stdin); no shell-escaped JSON is needed. Read commands do not request a social sync or model call.

Defaults are SCC `http://localhost:3001`, Pipeline `http://localhost:8080`, and the separate `.data/agent/agent.db` receipt/knowledge database. Override with `--scc`, `--pipeline`, `--state`, or `SCC_AGENT_SCC_URL`, `SCC_AGENT_PIPELINE_URL`, `SCC_AGENT_STATE`. Only HTTP(S) loopback origins without credentials or paths are accepted. Credentials and dotenv files are never loaded. Existing applications must already be running through their supported controllers; this CLI never starts, restarts or resumes them. Source changes here do not activate a frozen owner release.

Context and analytics return 20 records by default; use `--limit 1..100 --offset N` for bounded pages. Their existing SCC endpoints still read full lists internally. Pipeline discovery returns its native cursor for subsequent pages. `summary` reads only saved IDs, step outcomes and the latest five related notes; `jobs` lists compact runs and their pinned targets.

## Generate, import and prepare

First retrieve context and choose an exact account ID, its category and existing brand kit. The optional Page context includes the existing sanitized voice, rules and branding fingerprint. Follow the [Page A creative playbook](content/PAGE_A_CREATIVE_PLAYBOOK.md) when preparing that Page's content. Library presence and technical acceptance do not establish creative suitability.

Save `request.json`:

```json
{
  "title": "A robot rescues a seedling",
  "generation": {
    "title": "A robot rescues a seedling",
    "idea": "A small garden robot notices a seedling bending in rain and builds a tiny shelter. Clear cause and effect, expressive physical action, native sound.",
    "sceneCount": 1,
    "aspectRatio": "9:16"
  },
  "content": {
    "accountId": "ACCOUNT_ID",
    "caption": "Small acts can protect a new beginning.",
    "hashtags": "#ShortStory #GardenRobot",
    "scheduledAt": "2099-01-01T18:30:00+07:00",
    "applyBranding": true
  }
}
```

Choose a real future time when authorized. The timestamp must include a timezone; SCC normalizes it to UTC and keeps its Asia/Bangkok scheduling semantics. Omitting it prepares an immediate-publication draft, which still requires separate approval and queue actions. `categoryId` and `selectedVariantId` are optional content fields. `applyBranding:true` uses the destination's existing brand kit and queue renderer; it creates no new preset and never edits the master. Agents author the caption/hashtags using account context and prior knowledge; no additional text-model request is invoked.

Only after explicit authorization for generation:

```powershell
npm --silent run agent -- start --run garden-001 --input request.json --allow-generation
```

This journals intent and submits one text-only `POST /gemini-autopilot/queue`. `prompt` can replace `idea`, with exactly one supplied. Dense Mode is explicit: `generation_settings.v1`, `dense_performance`, `performance_tempo:2`; Gemini retains its native 10-second scene duration. Existing provider limits, readiness, paused state and scheduler remain authoritative. A submitted project can remain pending or blocked. The CLI never changes global settings, resumes the scheduler, forces a scene, switches providers or touches Flow. A flag records an authorization supplied by the operator; it does not authorize the agent to generate on its own.

Generation continues through existing workers after the CLI exits. Continue independent work now; inspect once in a later invocation:

```powershell
npm --silent run agent -- work-next
npm --silent run agent -- refresh --run garden-001
npm --silent run agent -- advance --run garden-001
```

`status` and `advance` reuse generation observations for five minutes; `refresh` explicitly reads current project/recovery evidence once. Incomplete work returns progress/blockers and `next:work-next`, with no import or draft creation. Completed work with a final video imports through SCC's existing source-aware, checksum-verified import service, then saves a single unapproved Reel draft. Original Pipeline project ID and source metadata remain on the SCC master. No auto approval or publication occurs. Import/preparation requires this explicit later `advance`; it is not a new background worker. SCC continues queued schedules independently after explicit queueing, while the PC and application remain available.

For an existing Gemini project, avoid generation entirely:

```json
{"title":"Existing completed film","projectId":"EXISTING_GEMINI_PROJECT_ID"}
```

Use that as `--input` to `start` without `--allow-generation`, then `advance --input content.json` using just the content object shown above. `discover` lists existing completed videos through SCC's `scene-video-library.v1` adapter, with pagination, import eligibility and incomplete-history information. `media --run garden-001` reads imported metadata and available quality/provenance information. Unknown quality remains unknown. This Gemini workflow refuses to attach a Flow project; Flow remains under manual owner control.

To import a selected completed library video from any existing provider, use `import --input selected-video.json` with `{"projectId":"COMPLETED_PROJECT_ID","categoryId":"CATEGORY_ID","title":"Library title"}` (category/title optional). SCC validates availability and deduplicates by source/project. This invokes no generation or publication. A completed Flow artifact can be imported while Flow generation remains manual; the Gemini `start`/`advance` workflow still requires a Gemini project.

For different destination accounts or times, use distinct stable run IDs with the same existing `projectId` and separate content. SCC reuses the imported master and owns independent destinations/schedules. Do not create extra runs to retry an uncertain generation or publication.

## Review and separately queue

```powershell
npm --silent run agent -- review --run garden-001
```

Review returns the exact title, media, destination, caption, hashtags, branding selection, normalized schedule, revision and `payloadHash`. Save these exact fields in `approval.json`:

```json
{"revision":1,"accountId":"ACCOUNT_ID","payloadHash":"COPY_THE_64_CHARACTER_HASH_FROM_REVIEW"}
```

After separate owner authorization for each action:

```powershell
npm --silent run agent -- approve --run garden-001 --input approval.json --owner-authorized
npm --silent run agent -- schedule --run garden-001 --input approval.json --owner-authorized
```

Approval is not dispatch. `schedule` queues the already approved exact draft in SCC's existing scheduler; with no scheduled time it queues immediate publication. No new or conflicting scheduler is added. Edits invalidate review hashes and revisions. Do not run either action without actual owner authorization of that content, destination and time. During implementation these commands are tested only against isolated fixtures.

Read outcomes with `status` and `history`. Status reads the saved post's independent destination outcomes, remote receipt and confirmation/verification fields; a queued draft is not labeled published. History accepts the existing `status`, `outcome`, `platform`, `timestamp`, `period`, `date`, `fromDate`, `toDate`, `direction`, `limit`, `offset` filters in an input JSON object. Manual handoffs remain awaiting exact confirmation; an elapsed deadline or remote ID alone does not prove publication. No retry/cancel/confirmation/public reply operation is exposed here.

## Analytics, lessons and handoff

```powershell
npm --silent run agent -- analytics --account ACCOUNT_ID
npm --silent run agent -- analytics --destination DESTINATION_ID
npm --silent run agent -- knowledge --account ACCOUNT_ID --limit 10
npm --silent run agent -- summary --run garden-001
npm --silent run agent -- jobs --limit 10
```

Analytics reads existing SCC snapshots; it does not contact a social provider or trigger refresh. Confirmed cumulative views are ranked relative to other confirmed observations. Missing or unconfirmed statistics remain null, and confirmed numeric zero remains zero. Rank is descriptive, not causal evidence. Destination history retains source, observation time and provenance status.

Record an observation using `remember --input lesson.json`:

```json
{
  "id":"garden-001-observation-1",
  "kind":"observation",
  "accountId":"ACCOUNT_ID",
  "resourceId":"garden-001",
  "text":"The latest saved snapshot has confirmed views but no available share count.",
  "source":"scc_saved_analytics",
  "evidence":{"destinationId":"DESTINATION_ID","observedAt":"COPY_OBSERVATION_TIME","views":0,"shares":null}
}
```

Use `kind:"assumption"` for unproven lessons such as an explanation for performance. Observations require an explicit source; all entries remain operator-authored and are not independently verified by the CLI. Stable entry IDs prevent duplicate notes. These compact records live in the shared agent sidecar, separate from immutable SCC analytics and its existing Page context/audits. A new agent can read `summary`, `knowledge` and `review` instead of full logs. Retain/backup the sidecar for cross-session recovery. Store no credentials in input or notes.

## Duplicate handling and recovery

Keep the same `--run` and exact input until its outcome is known. Repeated successful commands reuse receipts. A run ID with changed input or a completed step with changed content is rejected. Known IDs and request payloads are durably recorded with SQLite WAL/FULL synchronization before returning. Atomic operation claims exclude concurrent submissions; successful/rejected receipts are immutable. The database is identified as an agent sidecar before writable access; existing owner databases are refused.

Gemini text queue and SCC draft creation do not accept an effective server idempotency key. A timeout, lost response, malformed success or interrupted pending intent therefore holds the step. There is no blind POST retry. Find the original exact project/draft in the application, then supply its known ID:

```json
{"projectId":"ORIGINAL_PROJECT_ID"}
```

```powershell
npm --silent run agent -- reconcile --run garden-001 --input recovered-project.json
```

For uncertain draft creation, use `{"draftId":"ORIGINAL_DRAFT_ID"}`. Reconciliation performs reads, validates the original request (including the saved Gemini generation snapshot or complete draft content), and attaches that resource without resubmission. An identical story in another project cannot be automatically distinguished: the operator must identify the original resource. Pending generation/draft creation stays held until explicit reconciliation. An interrupted/uncertain import can safely reuse SCC's source/project deduplication; an interrupted/uncertain approval or queue can read back the exact draft receipt. Definitively rejected requests remain recorded; inspect the cause and prepare a corrected, separately identified run attached to the existing project instead of resubmitting generation.

The run pins both application URLs. SCC's configured Pipeline source must exactly match the CLI Pipeline URL, including hostname spelling; use `--pipeline` to match it. The integration never rewrites application configuration. Transport errors expose status codes instead of raw provider bodies, and follow no redirects.

## Validation and implementation scope

```powershell
npm run typecheck:agent
npm test
npx tsc --noEmit
npm run build:client
```

`npm test` provisions separate databases per suite. Agent integration tests use a fake loopback Gemini/Pipeline contract, real SCC import/draft/queue services, local fixture media, and simulated provider results. They do not load owner credentials, run real generation, publish social content, migrate production data or activate a release. Backend and UI repositories of AI Video Pipeline are inspected for compatibility and remain unchanged. See [implementation report](qa/AGENT_WORKFLOW_IMPLEMENTATION.md) for results and limits.


## Gemini standalone production (4 November 2026)

New `gemini_web` agent tasks prepare one complete native ten-second portrait 9:16 scene from text, with native audio and Dense Performance 2x. No image upload or continuation is part of this production path. The review-first UI stores `standalone_10s_v1` and waits for explicit scene authorization. Agent creation, already gated by its explicit allowGeneration authorization, and the explicit automatic UI choice use `standalone_10s_auto_v1`; they still obey the existing scheduler and limits. Queue creation itself is not a provider submission, and a disabled scheduler stays disabled.

Choose an immediate visual hook, one consequential development and a visible payoff. Suitable concepts include living objects, visual comedy, transformations, surprising interactions, miniature action and emotional micro-stories. Do not shorten a multi-scene script into an overloaded scene. Specify subject identity, causal physical action and native sound. Omit spoken-delivery, speaker and dialogue-preservation boilerplate for empty dialogue.

Image-conditioned, multi-scene and other custom Gemini configurations remain available through explicit Pipeline review as experimental. Do not create those through autonomous agent production. Historical configurations and saved request bytes remain intact; never replay or migrate old requests into the new policy. No Flow defaults, image roles, prompts, generation or scheduling are changed.

Keep stable task IDs and saved submission intents. An uncertain result permits observation and exact-turn recovery only, never a duplicate request. Owner-controlled security verification may be required; do not automate refresh loops or CAPTCHA interaction. Technical acceptance is separate from visual and listening acceptance. A qualified clip may be imported as an immutable SCC master, rendered with the target Page moving watermark and saved as an unapproved, unscheduled draft. Publication and receipts retain their separate exact-revision approval and queue gates.

## Quota-aware bounded Gemini production (4 November 2026)

The optional production controller runs one bounded step on the existing AgentRunner trigger and delegates execution to the existing Pipeline worker. It introduces no timer, account rotation, quota reset, Flow change or public publishing loop. It stays disabled until an explicit account/Page/submission-count/expiry scope is supplied. Do not install a recurring trigger before a successful owner-authorized bounded live cycle.

Production and Facebook observation are independent. A completed original clip enters the technical/creative QA backlog; the next authorized concept may proceed without any engagement threshold. Text preparation retains existing executor budgets. The controller can observe/recover video work when the text-model budget is exhausted. Normal independent preparation tasks may still run during provider waits.

Use production-status and production-config to inspect/configure five-hour fallback observations, target three requests per bounded cycle, an eight-item/512 MiB backlog, 64 MiB per pending master reservation, 1 GiB minimum free storage, five-minute observations and at most two exact-turn recovery checks. The five-hour interval is a planning/recheck assumption, never a counter reset or video allowance. Explicit provider recheck dates and native application/account/weekly restrictions take precedence. The target counts dispatch attempts, including uncertain/failed ones; it does not promise useful clips.

Save a distinct fictional gemini-concept.v1 with production-enqueue. Fields: version, fictional:true, accountId, title, idea, hook, development, payoff and category (living_objects, visual_comedy, transformation, surprising_interaction, miniature_action or emotional_micro_story). The existing runner can also prepare that exact object from Page context and dated saved research. Do not invent trends or repeat an unrelated concept across Pages for volume.

production-start requires --owner-authorized and an input object containing id, geminiAccountId, pageAccountId, maxSubmissions (1–5) and expiresAt (explicit UTC ISO, within seven days). A flag records actual authorization; it does not grant it. Keep the same scope and operation identities across restarts. production-tick performs one step; it never waits in a generation/retry loop. Runner enablement and scheduling remain separate existing controls.

The controller creates paused review-first standalone_10s_v1 projects pinned to one Gemini account. It deliberately leaves the global Gemini scheduler disabled so historical queued projects cannot run accidentally. Every new generation uses one existing force-retry bounded request with a durable unique request identity, fresh supported availability and the complete saved ten-second/portrait/Dense/native-audio/no-image contract. No second provider worker exists.

Unknown creation/dispatch/recovery/import/branding/draft outcomes hold their durable operation instead of repeating a POST. production-reconcile --run ITEM_ID --input FILE reads and binds the known original project after lost creation. Original-turn recovery is import-only and bounded. Manual Google verification is human_action_required; no automated refresh or CAPTCHA handling exists. Generic terminal provider errors end the cycle. production-resume is for supported readiness after manual security intervention, not a failed-generation replacement. production-stop disables new work and preserves history. production-close --owner-authorized accepts only a verified resolved/unsubmitted original; it never clears native locks/counts or discards completed media.

production-review binds an actual owner's visual/listening decision to the immutable imported master SHA256. It requires itemId, sha256, decision accepted/rejected, visual/audio pass/fail, source owner, notes, caption and optional hashtags, with --owner-authorized. Rejected media remains quarantined and counts against backlog capacity. Accepted media uses existing SCC moving-watermark rendering and exact variant readback, then saves an unapproved unscheduled draft. Review a final variant before public approval; metadata does not prove creative quality. Uncertain renders/drafts require original receipt reconciliation through the existing SCC workflow; never rerender or recreate merely because a response was lost.

production-publication-plan is read-only. It checks the ready draft's exact Page/master/variant, complete saved history, independent minimum-hours and rolling-24-hour volume settings. Incomplete/uncertain history holds the recommendation. Even when due it requires exact owner approval through the existing SCC workflow. No standing Page posting authorization or recurring publication is inferred from a production scope. Proposed default cadence is one post per 24 hours; it is not an enabled schedule. External Groups remain manual and require verified rules/participation permissions.

production-observe optionally takes postId/accountId to track an existing confirmed official publication. It reads existing receipts and saved metrics at 1/24/72-hour checkpoints on the existing trigger; it makes no provider sync call. The recorded metric observation timestamps/sources remain visible and may be older than the checkpoint. Missing values/follower attribution remain unknown. SQLite publication timestamps are explicitly interpreted as UTC. Observation failures do not gate production.

Admission checks the pinned account's native application ledger as well as the global counter, and requires the project's own native force-retry status to be available after the fresh check. A capability check cannot add allowance. The live pilot exposed global count 1 alongside pinned-account count 4; the account guard correctly prevented a second provider submission. A matching blocked bounded-request receipt with no run/intent/ack is a conclusive admission failure, recorded separately from generation failure. Account-window eligibility mirrors the native predicate; the controller never changes the ledger or interprets application-window expiry as provider quota.

## Standing production and separate Page grants (4 November 2026)

The bounded pilot is historical. Enduring production uses production-policy with version gemini-production-policy.v1, a unique id, geminiAccountId, pageAccountId, pageGraphId, expiresAt (UTC ISO or null for no authorization expiry), targetPerWindow (3–5), planningWindowHours, maxPer24Hours and maxTotalSubmissions (integer or null). Authorizing requires --input FILE --owner-authorized and a verified Page identity. The recorded grant is immutable; limits can be changed by revoking/resolving the old policy and issuing a new grant ID. Revoked IDs cannot be rearmed. An authorization expiry such as thirty days is unrelated to Gemini's five-hour/general or weekly restrictions. No monthly Gemini reset is assumed.

The enduring cycle does not finish after one clip or one planning window. Its durable dispatch ledger spans windows and restarts. Local per-window, rolling-day and lifetime budgets count attempts conservatively, including failed/uncertain dispatches, and never delete history. They do not represent provider allowance. Native account/global restrictions, fresh video capability and the exact project's authoritative native admission remain required before every submission. Expired historical application windows are not rewritten; the native guard decides eligibility.

At a capacity boundary the controller performs the supported non-submitting Gemini observation, then fresh admission checks. Explicit provider/weekly recheck dates take precedence over fallback estimates. With no explicit date it schedules a later eligibility observation using the configured estimate; elapsed time alone never authorizes a video. It uses no accounting-release endpoint and never changes native caps/counters. Known quota-rejected no-video originals and conclusive runless native admission blocks may continue with a new durably counted dispatch sequence after eligibility passes. The same project is retained. Generic provider failures, unresolved creation/dispatch/import results and actual security checks hold for reconciliation/human attention. No refresh loop or challenge automation exists.

production-policy reads the grant/status without network access. production-policy-revoke prevents new intent atomically while allowing the original submitted work to be observed/imported. production-stop additionally pauses the controller; it does not clear reservations. production-resume is an owner-authorized supported check after genuine human/security intervention, not an approval needed every quota window. Backlog/storage limits and actual QA continue to apply. No Facebook metrics threshold gates generation.

Final watermark QA can be durably recorded with production-variant-review --input FILE --owner-authorized: itemId, exact sha256, visual pass, masterAudioHash, variantAudioHash and actual-review notes. It requires an accepted original master, a ready draft, matching stored hashes and identical decoded audio hashes. It grants no publication authority.

Standing Page publication is a separate page-publication-policy.v1 record with id, accountId, graphId, expiresAt (ISO or null), maxPer24Hours, minimumHours and maxTotal (integer or null). Use page-publication-policy --input FILE --owner-authorized only after separate owner authorization for that exact Page/volume. There are no default Page grants. page-publication-policy-revoke --run POLICY_ID revokes it. Production/audio approval never creates a Page grant. The optional publisher uses the same AgentRunner trigger and existing SCC approval/queue service. It requires actual master and final-variant QA, exact reviewed caption/revision/destination/media, complete publication history and cadence admission. Identical master hashes already queued/published across Pages are held. Every approval and queue intent is durable.

A lost publication response holds its grant. page-publication-reconcile --run ITEM_ID reads the original exact draft/queue receipt; it never uploads again. A missing/ambiguous receipt stays held. The existing SCC queue owns Meta processing, reconciliation and final remote receipts. No Group or TikTok publication is added by these policies.

Activate only committed verified source through the existing AgentRunner Windows Task Scheduler workflow. The current-user task is hidden, uses IgnoreNew, and invokes the existing bounded scheduled host; there is no second polling daemon. Standing production gives this host extra bounded HTTP/recovery time without changing default preparation-only scheduling. Record the immutable source path, grant, enabled runner configuration and OS task receipt. The PC must remain on and signed in, and Google security checks remain manual.

To roll back safely: revoke the standing production grant, disable the existing runner, remove its recorded task through runner-schedule, and reconcile any active original before changing source. Retain the sidecar/owner database, original files, receipts and frozen release. No quota reset or database restoration is part of rollback.

After the owner finishes a real refresh/security handoff, production-resume acquires the same production lease, recovers the exact unresolved run before any fresh-workspace probe, imports/verifies its original media, and uses the audited reconcile_recovery action only for a proven completed stale recovery hold. It then checks fresh readiness. A known quota/weekly restriction resumes eligibility waiting under the same grant; security/identity/unknown evidence stays held. The resume operation itself submits no new generation. It never clears native locks/counters manually and never automates CAPTCHA interaction.

### External creator learning for Gemini

Standing Gemini production prepares a bounded `research_concept` task on the same AgentRunner when its Page's creator cache is stale. There is no second scheduler and no minimum own-Page engagement requirement. Research counts against the existing model budget; at most one attempt per rolling day, including failed or uncertain attempts. The research brief requests at most two public searches and four page opens. The custom executor has a three-minute process limit; its hosted tool-call counts are not independently available, so those search/open bounds are instructions, not a claimed measured hard tool cap. Access/security/rate limits end the attempt. No scraping service, hidden API, login or CAPTCHA handling is added.

The `gemini-creator-research.v1` report keeps up to six examples, source URLs, observation dates, exposed publication dates/duration, literal public performance displays, inspection type, comparison basis and limitations. Seek successful and ordinary Facebook examples of similar age/format from the same creator. Without opened Facebook evidence and visible metrics, classify the example `unclassified`. Missing counts are absent, not zero. Creator-site/YouTube evidence cannot establish Facebook performance. An inaccessible report is valid, cached for at most 24 hours; a complete matched report can remain fresh for at most seven days. Historical principles remain labeled hypotheses after freshness expires. Model-provided reports are always marked independently unverified; citations or model turn counts never prove a page visit.

Read `creator-research-status --account ACCOUNT`; `creator-research-save --account ACCOUNT --input FILE` admits the same strict report contract from supported read-only research. Only supplied finding/principle IDs may appear in a prepared concept's optional `researchUse`. The Gemini concept task receives compact reusable principles and independent local feedback, not a source script to copy. Require original subjects, actions and payoffs; no copied plot/punchline/characters, hidden reach estimates, algorithm claims or predictions based on viral outliers. If research is inaccessible, an explicitly hypothetical original concept remains possible after the bounded attempt; no fabricated successful/ordinary case is substituted. Existing own-Page analytics collection continues independently.

The Antigravity adapter routes only tagged Gemini concepts/research to the supplied generic result contract. The established Page A technical writer remains on its existing route. Pin the reviewed wrapper inside the immutable local agent release and enable its existing `prepare_video` and `research_concept` kinds along with `text_post`; do not point the scheduled runner at mutable source. No Flow planning, prompts, settings or generation behavior is changed.

### Gemini multilingual policy

Gemini concept inputs use a bounded model view under the existing `maxContextBytes`; the saved task and research are never shortened. Duplicate QA observations already in `creatorLearning.localFeedback` are removed from generic memory first. Larger histories use recent concept titles, short idea excerpts and compact cached principles, retaining source IDs/links, dates, verification and uncertainty. Page rules, task requirements and multilingual/originality instructions remain intact. Omitted evidence is unavailable, not inferred. `context-admission:<taskId>` in runner state records the original/selected UTF-8 sizes, source payload hash and selection profile without appending a new observation each tick. Irreducible mandatory context stays held before a model invocation; unrelated preparation and backlog work can continue. This selection applies only to tagged `gemini-concept.v1` tasks and does not change Flow, Page A, model/output budgets or scheduling.

`gemini-multilingual.v1` applies only to Gemini creator research and concept preparation. Research relevant creators internationally, including ordinary comparators. The Thai Page name does not restrict the audience, spoken language, social captions or hashtags. This owner policy supersedes inherited Thai-only/default language preferences for Gemini; other Page rules still apply. English, Thai, other languages and dialogue-free visual stories are all eligible. Neither English nor Thai implies a reach advantage or penalty.

New Gemini preparation tasks require concept `languageStrategy`: `spokenLanguage` (`none` or a language tag such as `en`, `th`, `ja`, `pt-BR`), `dialogue` (empty for `none`, otherwise exact brief speech), `intendedAudience`, `rationale`, `evidenceBasis` (`hypothesis` or `verified_research`), `findingIds`, `captionLanguages` and `hashtagLanguages` (may be empty). Use natural ambience/foley when visuals suffice. Do not force dialogue, narration or subtitles. If speech helps, preserve its chosen language and exact brief wording in the Pipeline planning request. Publication-copy language choices do not request in-video subtitles.

Language selection follows the concept and evidence. Missing, stale or independently unverified evidence supports a hypothesis, not a proven optimization; verified claims require fresh independently verified supplied findings. Research may retain `languageObservation` with unknown spoken language/audience as null. Written captions and Page names do not establish speech language, geography or actual audience. Keep literal observations separate from inference.

Choose social captions and hashtags from the intended audience and actual reviewed video; multilingual copy and no hashtags are valid. The existing owner QA input remains authoritative and is passed unchanged to an unapproved, unscheduled draft. Language metadata is retained with the immutable concept, exposed in production status and attached to its QA evidence. It grants no publication approval or audiovisual PASS. Historical concepts without this metadata, saved prompts, existing drafts/media and recovery identities are not migrated or translated; original replay remains idempotent after research expires. Flow and Page A technical-writing contracts remain unchanged.

### Independent Gemini backlog and current operational status

The existing AgentRunner callback performs one `production-backlog-tick` after its generation step, including generation holds and exhausted text-model budgets. This uses the same production lease and existing SCC services; it adds no timer or generation worker. Backlog errors are held per item and do not poison the standing generation grant. Existing storage/backlog limits include known QA copies and candidate variants. Stop/disable controls remain authoritative.

The technical step downloads only the existing SCC master through the metadata's same-origin upload URL (or supported API stream), verifies exact size/SHA256, runs real FFprobe and a full video/audio decode, measures normalized stereo float PCM, and prepares twenty ordered contact-sheet samples. Tools are finite and shell-free. The master is immutable; analysis copies/artifacts are cached by SHA. Silence, full-scale/nonfinite samples and level measurements are evidence, not proof of listening quality or unwanted speech. No creative/listening PASS is generated automatically.

Technically valid clips may use SCC's existing Branding Studio and draft service to create a moving-watermark review candidate. Candidate drafts are unapproved, unqueued and unscheduled, with `needs_review` and a durable agent publication hold. The existing agent publisher still requires accepted master/audio and final variant QA plus separate Page authority. The standard SCC manual approval workflow is not bypassed or relabeled as a new server-side QA gate. Generic fallback copy describes AI fiction without inventing the unreviewed rendered plot; it follows the concept's intended caption language. Unsupported copy languages remain in review instead of silently switching languages. Qualified actual frame/signal observations can be saved with `production-candidate-review`; that action cannot accept audio or publication.

After genuine owner audiovisual acceptance, `production-review` adopts the exact existing candidate variant/draft rather than rendering or drafting again. An uncertain candidate write blocks acceptance until its original receipt is reconciled. `production-backlog-reconcile --run ITEM --input FILE` accepts exactly one known original `draftId` or `variantId`, performs reads only, and binds the master, destination, saved branding intent or exact original caption/revision. Missing/ambiguous proof stays held. `production-backlog-recheck --run ITEM` is limited to a failed pure technical read with no render/draft intent; it cannot clear or repeat a mutation or provider request.

For an uncertain immutable import, `production-import-reconcile --run ITEM --input {videoId}` verifies the saved completed Pipeline artifact against the exact SCC video's job/source fingerprint, bytes and hash, then resolves only that original import receipt without another POST. Use the supported `production-resume --owner-authorized` afterward to finish the known original and check readiness. This is exceptional reconciliation, not routine quota-window approval.

`production-status` reports the durable operation state, next known recheck, latest successful import, exact backlog/candidate holds and separate publication state. `production-inspect` refreshes account/global application admission through a read-only API observation; it is not a fresh browser capability check and never infers remaining provider quota. `runner-status` shows the actual scheduled-host receipt, installed task, model budgets and uncertain invocations. A fresh supported readiness check can resolve a conclusively stale human-action hold; real Google verification remains manual. Three counted dispatches may include a conclusive pre-provider block; history/counters are never refunded to reach a target.

### Controlled Reel publication

Standing Page publication remains separate from Gemini production and audiovisual review. For โลกจริงหลุดบท, the owner-authorized Reel policy targets three to five only when approved content exists, with a hard five per rolling 24 hours and at least three hours after the latest confirmed publication. There is no catch-up burst. Counts use saved confirmed timestamps and format identity; text/image posts do not consume the Reel allowance. Pending or uncertain originals hold conflicting dispatches. The existing AgentRunner and SCC queue remain the only dispatch path.

`page-publication-policy` can record an exact verified Page Reel grant with `contentType: reel`, `targetPer24Hours`, `maxPer24Hours`, `minimumHours`, `timeZone: Asia/Bangkok`, explicit expiry or null, and `maxTotal`. `page-publication-control --run POLICY_ID --input {action: pause|resume} --owner-authorized` pauses/resumes that same grant; revocation remains permanent. In-flight originals retain reconciliation requirements. There is no default grant for another Page, Group or TikTok.

An explicitly authorized `copyHashtags` policy may add three relevant hashtags (maximum five across caption and hashtag fields), chosen from reviewed subject, format and intended language. Captions and AI-fiction disclosures stay unchanged. A required draft edit uses revision CAS and an original durable operation; uncertainty permits only exact read-back reconciliation. The separate `publicationCopy` decision binds the new draft revision to unchanged master/variant hashes and the original owner audiovisual review. It does not rewrite or transfer that owner review. Changed media, caption or acceptance invalidates the copy decision. The publisher approves only the exact final revision and rehashes the actual master/variant before dispatch.

`publication-streams --account ACCOUNT_ID` exposes separate Reel, text-only and text+image queues, counters and policies. Text/image limits can be saved as explicitly disabled proposals with null/unconfigured frequencies; they cannot activate through this checkpoint. Existing Page A technical writing is unchanged. Video Review displays these streams independently. Owner-authorized future Group planning is one or two posts per individual Group per day, hard maximum two per rolling 24 hours, separate identity/rules/eligibility/accounting and duplicate safeguards. This is recorded planning only: no Group implementation or publication authority is added.

Video Review separates **Published today (Asia/Bangkok)** from **Rolling previous 24 hours**. Remaining allowance subtracts confirmed rolling receipts and protected queued/uncertain originals; a queued item is never labeled confirmed. A receipt expires from the rolling count exactly 24 hours after its confirmed timestamp. The view also shows last confirmation, next cadence eligibility, exact ready/held revisions, pending originals and Facebook links. Its existing publishing-resource events and a bounded display-clock refresh update read-only metadata without resetting the video editor or dispatching work. Missing/incomplete observations remain unknown. History uses bounded complete pagination and fails closed when completeness cannot be established.

The **Pause Reel publishing / Resume Reel publishing** controls change only the existing exact-Page grant. The fixed `video-review-publication-control` command binds command ID, policy ID, account, Graph identity and action; lost responses reconcile that same command. It cannot create a grant, change frequency, clear uncertainty or submit content. Pause is immediate and does not take or release an in-flight generation/publication lease.

The existing scheduled controller resumes original copy/approval/queue operations by exact read-back, including a crash after a durable response but before item adoption. It does not repeat an uncertain POST. For an original saved Reel ID with failed/interrupted processing, the existing SCC destination workflow exposes **read-only reconciliation**: exact stored Page/Graph/remote ID, existing connector credentials and a single Meta status GET. It never calls upload start, rupload or finish. The same trigger performs at most one such original check per policy step, spaced at least five minutes. Only verified API confirmation resolves its hold and releases active backlog capacity; media/history remain retained. Missing original IDs, changed identities, unavailable authorization and genuinely unprovable outcomes stay protected. A changed draft is held individually while the next valid accepted candidate may proceed. Gemini security holds and unavailable analytics do not gate this separate publication callback.

### Owner Video Review queue

Open **Video Review** in SCC, or `/?view=video-review`. This is a view of existing Gemini masters, variants, drafts and the marked AgentStore, not another library. Original and moving-watermark players retain portrait geometry, native controls and volume. Technical decode/signal evidence is separate from the owner's explicit visual/listening decision. The UI never supplies owner acceptance automatically.

`OwnerVideoReviews` binds each owner action to the exact Page/Graph identity, master SHA, watermarked SHA, draft ID/revision/fingerprint and review version. Decisions have durable command IDs and append-only observations. Approval is saved before bounded verification; full source hashes, decode and unchanged variant audio are independently revalidated. The existing candidate/draft is adopted without another import/render/draft. The existing AgentRunner backlog callback resumes any accepted-but-interrupted validation. No provider or model action is introduced by review.

Reject and Needs changes preserve original media, technical checks and history; they hold publication and still occupy backlog capacity. Caption/existing-variant edits use the original draft's revision CAS and clear earlier review readiness. Lost responses are reconciled by the same command identity and a read of the original updated draft; a new edit cannot bypass a pending original. Safe branding corrections use an existing same-master portrait moving-text variant with the exact Page name and required safe areas. Prepare such variants through the existing Branding Studio.

The local same-origin `/api/video-review` routes invoke only fixed review commands from the frozen release, on the same sidecar. There is no generation, queue, publication approval or policy activation endpoint. The owner review command records creative/listening acceptance only; existing independent publication services and receipts retain authority. Previously valid decisions cannot transfer to edited media or draft revisions.

The publication panel previews exact-Page Reel eligibility, rolling-day/interval limits, expiry, duplicates, uncertain originals and saved receipts. It can persist an **explicitly disabled proposal** or revoke an exact existing Page grant; it cannot activate recurring publication. No proposal confers authority. `video-review-policy-preview`, `video-review-policy-save` and `video-review-policy-revoke` expose those bounded paths. Legacy CLI review/recovery and historical configurations remain supported. Flow receives no policy or behavior change.
# Independent text/image preparation and future publication

`page-content-config --input FILE --owner-authorized` controls preparation only (`page-content-preparation.v1`): enabled, optional expiry, at most six task attempts per rolling 24 hours, bounded pending items and explicit verified Page entries with selected text/image formats, audience brief and editorial rules. It creates no publication policy. The existing AgentRunner callback queues one bounded research/writing task or persists one completed original per step; all model invocations use its existing budgets/concurrency/timeout. Failed, blocked and uncertain originals count as attempts. Stop preparation by saving the disabled configuration; protected original operations remain retained.

`page-content-status` reads the queue, selected language/audience/rationale, source evidence, limitations and imagery needs. The Publishing Center exposes the same status and the existing draft composer. New tasks use `page-content.v1`; old Page A tasks and Gemini/Flow routes retain their contracts. Relevant international examples and ordinary comparisons inform reusable principles, independently of own-Page analytics. Literal metrics, observation dates and access limits are retained; model assertions are independently unverified. No citations/turns are converted into measured tool counts. Research instructions bound hosted work to two searches/four opens; unavailable access is reported honestly, not bypassed. Fresh compact cached public findings are reusable for 24 hours; omitted sources are unavailable. Original reports remain durable. Repeated exact copy is held.

Completed `page-content-result.v1` work saves an unapproved, unscheduled text draft through existing SCC services. QA validates format, source identities/dates, claimed supporting URLs, hashtag syntax/count and Page fingerprint. It does not certify facts, originality, usefulness, clarity or creative quality. Actual owner review/approval of the exact draft remains necessary. Language and audience are concept/evidence choices, never assumed reach optimizations. Page A's permanent playbook remains binding, including its stricter hashtag and factual-evidence rules.

Image work saves an `awaiting_imagery` concept and original relevant image brief when the scheduled host has no configured admitted still-image provider. The interactive image tool is not an autonomous SCC provider. No Gemini video session or Flow image workflow is used. Upload JPEG/PNG through SCC's existing composer/library. `page-content-attach-images --task ID --input FILE --owner-authorized` binds exact uploaded IDs/hashes, ordered alt text, the result hash, explicit visualRelevance/legibility/consistency confirmations and notes. Existing upload validation/full decode and bounded byte rehashing are reused. It saves a single-image or supported multi-image unapproved draft; image binding does not approve publication. No unrelated placeholder is selected automatically.

`page-content-persist --task ID` advances a known completed preparation. A pending/uncertain original save is never repeated. `page-content-reconcile --task ID --input FILE` accepts only the known original `draftId` whose exact body matches. Modified Page context, result, images or revision is held; existing manual editing clears approval and needs renewed review. Original tasks, media and receipts remain retained.

The existing Page publication controller now has independent `text` and `image` branches (single/multiple images share the image stream). This is implementation readiness, not authority: no text/image grant or frequency is enabled by preparation. Future explicit per-Page/format grants use the same policy schema, lease, exact approval and SCC queue. Text/image publication requires the exact saved draft revision to be currently owner-approved; the agent never approves it. Separate format history, protected slots, rolling limits, minimum intervals, expiry, pause/revocation and lifetime budgets apply. A blocked stream does not block an independently eligible one. Uncertain queue responses read back the original draft/post; known remote general posts use SCC's existing GET-only reconciliation path, never a second upload. Unknown originals stay held. Existing Reel authority is unchanged.

Publishing Center's hypothetical policy preview is simulation only. Frequencies must be entered explicitly, and the preview neither saves nor activates a grant or queues content. Analytics stay in the existing publication/history services independently. Groups and TikTok general-post automation remain outside this workflow.
