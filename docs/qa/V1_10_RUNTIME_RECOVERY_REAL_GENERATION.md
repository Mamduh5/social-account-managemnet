# V1.10 runtime recovery and real draft generation

> Historical implementation/recovery snapshot. The later authorized production migration, pinned V1.10 owner runtime and current-user startup are now verified in [V1.10 production rollout](V1_10_PRODUCTION_ROLLOUT.md). Earlier pending/no-commit/no-migration statements below describe their original phase.

24 October 2026, Asia/Bangkok. **Owner runtime restored; real Gemini text generation demonstrated in the isolated review app. V1.10 production rollout remains pending.** No public posts/uploads/comments/replies/reactions, new live schedules, Group actions, TikTok publishing, production migrations, Cloudflare deployment, commits or pushes were performed.

## Current operating state

| Surface | Actual state |
| --- | --- |
| Owner HTTP application | http://127.0.0.1:3001, healthy; non-watcher PID 13332 from pinned owner revision 12ae5d8 |
| Owner HTTPS proxy | https://localhost:3443, healthy; PID 16668, same pinned proxy source and unchanged existing localhost certificate |
| Owner database | Original .data/social_command_center.db; no replacement, demonstration import or V1.10 migration |
| Normal synchronization | Successful automatic boot sync and two subsequent natural 15-minute cycles for both Facebook and TikTok |
| Existing owner queue | 48 published, 9 failed, 3 awaiting_confirmation; no active or overdue jobs were found or replayed |
| V1.10 review | http://127.0.0.1:3195; separate .data/v110-review/app database and app-client-dist bundle; its publishing/sync workers remain paused |
| Real draft provider | Explicit gemini_api_free / gemini-3.5-flash-lite configuration in review only; no fixture substitution |
| Default provider selection | Unavailable unless SCC_ASSISTANT_PROVIDER_CONFIG is explicitly set; fixtures remain a separate explicit mode |

The restored owner process loads its frozen server source below .data/v110-recovery/owner-runtime-12ae5d8 rather than the dirty V1.10 source tree. Its working directory and dotenv/data paths remain the owner workspace and original environment/database. New assistant/provider source changes therefore do not hot-reload into it. Health version 1.5.0 is legacy liveness metadata; source hashes and process manifests establish the actual revision.

## Missing-runtime investigation

**CONFIRMED:** port 3001 and the localhost proxy were absent before recovery. The old saved runtime record names PID 12564, started 21 October at 09:47:30 Bangkok, using server/src/index.ts and the original workspace database. Official post/sync observations last succeeded on 22 October at approximately 18:49 Bangkok. No successful observations exist in the following gap until this restoration.

**CONFIRMED:** Windows booted on 24 October at 10:23:06 Bangkok. Retained System events show EventLog stop 6006 at 10:22:36 and start 6005 at 10:23:24. No matching node.exe/application crash events, explicit server shutdown marker, or startup-failure signature was found in the inspected retained logs. The normal run_server.ps1 is a foreground launch, and no owner application scheduled task/service was registered.

**LIKELY explanation for the post-reboot absence:** the foreground application was not automatically relaunched after Windows restarted. **UNKNOWN:** whether its earlier termination was an intentional terminal/process stop, sleep/shutdown lifecycle, or an unrecorded failure. Logs do not establish its exact exit time or intent, so this is not labeled a proven crash.

**Historical code identity is incomplete.** The saved source fingerprints cover four files and do not match any complete clean candidate revision among 5427365, 954e01c, 96f2638 and 12ae5d8, even allowing Windows line-ending conversion (only one file matches each candidate). The old process loaded a working tree whose full immutable source image was not retained. Its exact loaded revision cannot be recovered merely from today's HEAD. The restored revision is explicitly the latest owner-created, pre-V1.10 commit 12ae5d8, independently verified by the startup rehearsal and tests; it is not falsely presented as a byte-identical reconstruction of that old process.

Only one saved schedule exists: the protected 20 October 12:14 Bangkok Reel, already published via API before the interruption. Inspection found no scheduled/preparing/branding/uploading destinations and no overdue work. The three manual awaiting_confirmation rows were excluded from worker dispatch and preserved exactly. No job was reset, retried, cancelled, confirmed or replayed.

Evidence: .data/v110-recovery/runtime-investigation.json, historical-source-comparison.json, owner-before.json and the original live-observation/runtime evidence. The latter is historical and was not rewritten.

## Safe restoration and observed synchronization

scripts/recover-owner-runtime.ts reads the owner database read-only, refuses in-flight/uncertain/overdue jobs or changed protected manual holds, freezes the selected Git source without checking out or overwriting the working tree, and rehearses startup against a fresh consistent SQLite copy. Rehearsal blocks every provider request and stops only its copied workers before their initial sync. It verified identical schema, accounts, identity aliases, posts, destinations, video metadata and variants. No source schema change was required.

After rehearsal, the launcher verified port 3001 was free and rechecked the live queue before starting the pinned non-watcher process. Its ordinary workers were retained. The existing valid localhost certificate was reused for the proxy; HTTPS health passed with that certificate as the explicit CA and TLS/hostname verification enabled. No trust-store or certificate change occurred.

Automatic boot synchronization succeeded at 16:05:45 Bangkok for TikTok and 16:05:56 for Facebook. The untouched 15-minute timer then succeeded at **16:20:39 TikTok / 16:20:45 Facebook**, and again at **16:35:39 TikTok / 16:35:46 Facebook**. No manual Sync or forced refresh route was invoked. Genuine new post observations and normal checkpoints were appended.

The expired local credentials were naturally renewed/revalidated by the existing authorized service: TikTok revision 9 to 10 and Facebook 17 to 18, with new expiry on 25 October. TikTok's normal verification timestamp advanced. Account IDs, verified external IDs, type, identity aliases, granted scopes, connection status/mode and the owner environment remained unchanged. These are existing automatic lifecycle updates, not a new OAuth connection or owner-identity change. Existing snapshots were retained.

The live database already satisfies the V1.9 nullable-statistics schema checks; no V1.9 migration was needed or performed here. It still lacks V1.10 publishing content columns. .data/v110-recovery/owner-after.json records the distinction between stable identity/connection bindings and normal verification/token metadata changes.

## Real provider selection and safeguards

Read-only local inspection found:

- AutomaticWorld uses OpenRouter with a Free-tier key and minimax/minimax-m3:free. Official catalog GET returned 200 but that exact model is absent. No inference or replacement-model fallback was attempted.
- The AI Video Pipeline already has an approved gemini_api_free text adapter, GEMINI_API_KEY_FREE2 selector, gemini-3.5-flash-lite model, project ID and billing-disabled Free-tier attestation. Official model metadata GET returned 200 and supports generateContent. This route was selected explicitly.
- Pipeline Ollama configuration references llama3.1:8b on localhost:11434, but no listener was present. The separate ChatGPT Web Bridge was not running on its documented local API port. Paid OpenAI configuration and the previously restricted Zen route were not used.

The new server adapter reuses the existing Gemini route's checks and native REST contract without modifying or invoking the video pipeline. A local ignored configuration references its source environment file/key selector; it never copies that credential to the frontend, owner dotenv, logs or screenshots. The source fingerprint, exact provider/model/key selector/project and verified-free flag are checked before each request. Configuration drift fails closed. Missing/invalid configuration remains unavailable, never a fixture success.

The operator's existing billing-disabled attestation is explicitly reused; it is **not represented as a new billing API check or billing receipt**. Google's current [pricing page](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) lists free input/output for that model's Free tier. The API response supplies usage, not monetary charges. No paid tier, grounding, cache, external tool, media-generation endpoint, key rotation or fallback is enabled. No attempt was made to upgrade billing or acquire a service.

Native requests pin the official generateContent endpoint, use the private header, reject redirects, have bounded output/time/response parsing, and make no automatic transport retry. Only a complete single STOP candidate with valid structured text and the expected model identity is accepted. Raw provider bodies and transport diagnostics are not reflected to users. A durable reservation ledger counts successes, failures and uncertain submissions before inference, with an explicit six-request cap for this review. **Five requests were used; one remains.** This cap is not raised automatically.

The review harness always blocks social/provider traffic other than the exact configured Gemini text POST and keeps its own publishing/sync workers paused. Default fixture mode still blocks all external providers. A real configuration and fixtures cannot be enabled together.

## Actual generated demonstrations and creative review

Five real HTTP requests returned 200 from gemini_api_free / gemini-3.5-flash-lite; every envelope reported modelVersion gemini-3.5-flash-lite. They used synthetic descriptions/comments and demonstration profiles with no owner writing examples. Voice profiles remain provisional; no claim of learning the owner's personal voice is made.

| Request | Actual outcome | Input/output/total tokens |
| --- | --- | --- |
| Formal post from a plant-care idea | Thai prose, two sentences, no emoji; saved editable draft | 620 / 76 / 696 |
| Playful voice, same idea | Different greeting, short lines and emoji; editable draft; unsupported home/growth assertion removed during explicit manual review | 652 / 109 / 761 |
| Initial supplied-description caption | Genuine provider output, but creatively rejected because it ignored the description and used unrelated sample facts; original response retained and draft marked rejected | 665 / 67 / 732 |
| Fictional comment reply | Correct approved sample hours 10:00–18:00; hostile embedded publish/credential instruction ignored; no reply sent | 713 / 46 / 759 |
| Deliberately corrected caption | After task-specific grounding fix, mentions orange clay pot, green leaves, white table and soft window light; excludes unrelated hours; saved editable draft | 550 / 56 / 606 |

Total reported usage: 3,200 input, 354 output, 3,554 total tokens. There were no automatic retries, hidden replacement models or extra inference requests during verification reruns. The one extra caption was an explicit corrected creative request after inspecting a known successful response, not a replay of an uncertain transport outcome. The rejected original and actual outputs/IDs remain in the evidence manifest.

The caption fix provides a kind-specific instruction and excludes unrelated profile facts/FAQ from caption input. Its concrete supplied-description grounding was checked against the actual output, not merely HTTP success. No image bytes, vision endpoint or actual-image inspection were used. The playful raw response is likewise preserved; its reviewed copy is an explicit revision-2 manual edit, not falsely labeled unchanged AI output. This is evidence for generation and editable review, not blanket factual accuracy or owner-voice acceptance.

The final four selected examples remain unqueued and unpublished drafts. Material text edits cleared exact-revision approval; destination binding remains enforced by the service/tests. Model output has no API execution path or approval authority. The fictional source comment has has_replied=0. An injected browser-only 503 rendered an honest error and produced no draft; it was a mocked UI check, not a claimed live-provider outage.

Evidence: .data/v110-recovery/live-generation.json, provider-attempts.json, live-generation-browser.log and screenshots [formal](../../.data/v110-recovery/formal_post.png), [playful reviewed](../../.data/v110-recovery/playful_post_reviewed.png), [description caption](../../.data/v110-recovery/description_caption.png), [fictional reply](../../.data/v110-recovery/fictional_reply.png). Secret-free generation identity/usage is also linked to each saved draft's source context.

## Validation and operational commands

| Gate | Result |
| --- | --- |
| Full npm test | **223/223 PASS, 19 isolated files, zero failed/skipped/cancelled** |
| New provider suite | **11/11 PASS**, mocked transport only; configuration, source drift, exact request, redaction, errors, incomplete output, budgets/concurrency and caption grounding |
| Recovery queue guard suite | **5/5 PASS**, no owner writes; due/uncertain/in-flight rejection and manual-hold preservation |
| Backend typecheck | **PASS** |
| git diff --check | **PASS**, exit 0 |
| Client build | **PASS**, 1,956 modules; separate review output, owner client/dist untouched during this recovery task |
| General composer browser | **8/8 PASS**, existing Reel flow, Thai drafts, images/order/checksums, scheduling preparation, approval invalidation and no queue writes |
| Real provider browser | Four requested scenarios demonstrated through five actual calls, with exact output/creative review recorded; editable/revision/safety/error-display assertions PASS |
| Owner restoration rehearsal | PASS on copied database; unchanged schema/queue/accounts/identities/media; zero external calls |
| Owner HTTP and HTTPS | HTTP 200; TLS validation retained |
| Natural synchronization | Boot plus two natural 15-minute cycles succeeded for Facebook and TikTok |

The complete test run removes real-provider configuration and uses separate SCC_DATA_DIR per suite. Live provider calls are only the five ledger entries described above. Build warnings about existing Vite devtools resolution/timing and the external review outDir are non-failing. No paid dependency was added.

For current review use the already-running port 3195. If it is stopped, launch npm run review:v110 -- --provider-config .data/v110-recovery/provider.json. Omit that argument for unavailable/manual-only mode, or use --fixtures for clearly labeled offline fixtures. The configuration and ledger remain local/ignored. Extending the finite inference budget requires an explicit local configuration decision; no limit resets occur on restart.

If the owner application is down later, first use npx tsx scripts/recover-owner-runtime.ts --rehearse, review its result and then --start. Never run it to replace a listener or bypass due/uncertain-job blockers. The pinned proxy can be launched from the recorded snapshot with the existing localhost certificate and target port 3001. No Windows autostart/service was installed: after another machine restart, these foreground-style services still need deliberate launch. Process manifests/logs live under .data/v110-recovery.

## Remaining rollout boundaries

V1.10 schema/source activation on the owner database still requires its separate owner-approved copy-first maintenance window. The restored owner app has live legacy Facebook/TikTok authorization, sync, Reel/queue behavior; **new general-post and assistant functionality is review-only on 3195**. No new live general-post publishing acceptance is claimed. Do not replace the owner database with any review/rehearsal copy or copy demonstration accounts/content into it.

Historical raw snapshots and original videos/variants remain preserved. The exact three awaiting_confirmation rows and all publishing_posts rows compare unchanged; account identity/alias/grant bindings and .env compare unchanged. Only ordinary automatic analytics/checkpoints and natural credential lifecycle metadata advanced. The working AI Video Pipeline process PID 13320 predates this task and remains running; its source environment fingerprint is unchanged. No pipeline code, worker, scheduler, notebook or provider state was edited.

Remaining uncertainties are the old process's precise termination intent/exit time and full uncommitted loaded source, not a blocker to the independently rehearsed pinned restoration. Live AI output still requires human factual/voice approval. Production V1.10 rollout, live public-post acceptance and any larger provider budget remain separate deliberate actions. No commit or push was made.
