# V1.6 Facebook OAuth, Reels API and scheduling acceptance

**Date:** 20 October 2026 (Asia/Bangkok). This report supersedes earlier V1.6 claims that conflated fixture, browser/manual and official API acceptance. It records the current milestone; it does not authorize another publication.

## Verification matrix

| Feature | Result | Evidence boundary |
| --- | --- | --- |
| Facebook OAuth callback, code exchange and existing-Page reauthorization | **LIVE PASS** | Owner completed consent and explicit identity linking; saved encrypted token passed a read-only Page identity check and survived restart before the protected schedule was created |
| Actual `pages_manage_posts` grant | **LIVE PASS** | Meta permission response and token debugging confirmed the grant; not inferred from the requested scope |
| Page identity reconciliation | **LIVE PASS** | Original/public `61563944843401` and verified Graph `409347032254077` remain associated with the original internal account |
| Official direct Facebook Reels API publication | **LIVE PASS** | One approved existing video, one destination, remote Reel `2657809668013982` |
| Remote URL, processing and public visibility | **LIVE PASS** | API ready/complete status, returned permalink and live Chrome player/Public badge |
| Queue completion without manual confirmation | **LIVE PASS** | Published, confirmed, `confirmation_source=api`, zero retries |
| One-hour schedule validation and due dispatch | **AUTOMATED PASS** | Isolated fixture stays idle before due, advances to due, publishes once with immediate Meta state and no replay |
| Real schedule persistence, selected derivative and queue display | **LIVE LOCAL PASS** | Schedule API HTTP 200; one scheduled destination, correct UTC/Bangkok time, file and Page; no early remote ID |
| Browser Schedule Post form submission | **NOT VERIFIED** | Date-entry automation created no job; database was reconciled before a single successful schedule API request |
| Scheduled Tesla Reel's actual public publication | **PENDING OWNER VERIFICATION** | Do not claim success based on saved status, a fixture or elapsed time |
| Facebook/TikTok engagement and analytics | **LIMITED EVIDENCE** | Connector parsing and sync fixtures; earlier browser/manual baselines and appended local snapshots are separate from blanket live API acceptance |
| TikTok official authorization, automatic publishing and sync acceptance | **PENDING NEXT MILESTONE** | Existing Personal Account and manual publishing history preserved; no Direct Post capability enabled |

## Facebook configuration and reauthorization diagnosis

The accepted setup used `META_GRAPH_VERSION=v26.0` and the exact callback:

```text
http://localhost:3001/api/connections/callback/facebook
```

The app OAuth redirect setting and server `META_REDIRECT_URI` must match HTTP, localhost, port 3001, full path and no trailing slash. `127.0.0.1` is not interchangeable for browser-cookie binding. The observed OAuth request's redirect URI matched this value; state/session checks passed.

The actual callback failure was **code exchange returning an access token without `expires_in`**, followed by an application rejection before permissions/Page discovery. It was not a confirmed Meta dashboard setting failure. The fix attempts long-lived exchange and verifies missing expiry via Meta `/debug_token`, including `is_valid`, app ownership and expiry. Explicit `expires_at=0` uses a bounded 24-hour local window, capped by data-access expiry. Unknown/invalid/expired metadata fails closed. The successful live reconnect used this missing-expiry verification path.

The service requests discovery/read scopes (`pages_show_list`, `pages_read_engagement`, `pages_read_user_content`) and selected operation scopes. Publishing requires actual `pages_manage_posts` plus engagement permission. Moderation requests `pages_manage_engagement`. Both operation grants were returned in the live reconnect. `/me/permissions` is checked; provided Page tasks filter effective grants. A request alone never enables a capability.

The original internal account `acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5` was retained. The owner-confirmed Graph ID alias was reserved on that same row; the old public identity remained reserved. The verified external ID is `409347032254077`. No display-name fallback, duplicate account, token-encryption bypass or CSRF exception was used. Generic code does not hardcode these acceptance IDs. Previously verified IDs remain strict; another account's identity claim is rejected.

OAuth state is random/hashed, bound to the browser cookie, account revision and ten-minute expiry, and exchanged once using compare-and-set. Redirect/scopes/candidates and saved tokens are encrypted with the existing base64 32-byte `SCC_TOKEN_ENCRYPTION_KEY` (AES-256-GCM). Failed reauthorization preserves saved credential bytes. Stage diagnostics use allowlisted references, numeric codes and HTTP statuses; no raw state, codes, cookies, tokens or secrets belong in reports.

Reconnect from the existing account at port 3001, complete fresh Meta consent in the same browser, review actual grants, select and explicitly link the correct identity. Preserve the key. Do not disconnect to work around an expiry error or replay a consumed callback. Environment/key maintenance and server restarts must wait until the protected publication is no longer pending and the owner approves the maintenance boundary.

## Direct Reels live evidence

| Item | Recorded result |
| --- | --- |
| Page | `409347032254077` (original public identity `61563944843401`) |
| Local post | `post-05e9fbb6-e7f2-4aad-9433-8d2febd04ecd` |
| Destination | `dest-mvg5hn6o-ydio` |
| Remote video ID | `2657809668013982` |
| Public permalink | [facebook.com/reel/2657809668013982/](https://www.facebook.com/reel/2657809668013982/) |
| START | HTTP 200, returned remote video ID |
| Binary upload | HTTP 200, `success:true`, 4,129,943 bytes transferred |
| FINISH | HTTP 200, `success:true` |
| Remote video status | `ready` |
| Uploading / processing / publishing phases | `complete` / `complete` / `complete` |
| Publish status/time | `published`, `2026-10-20T03:55:42+0000` (10:55:42 Bangkok) |
| Copyright check at final read | Complete, `matches_found:false` |
| Queue result | `published`, `verification_status=confirmed`, `confirmation_source=api`, retry count 0 |
| Browser observation | Returned URL loaded the correct Page's Reel and Public badge |

Only one publication was approved and performed. The original master SHA256 was unchanged, prior posts/variants/history and other account tokens were preserved, and no TikTok destination or new generated video was created. Normal sync appended observations and updated sync timestamps; historical snapshots were not overwritten.

The connector performs start -> persist unverified remote ID -> HTTPS rupload -> finish -> bounded status/permalink polling. It requires ready video, complete publishing phase and accepted Facebook permalink before the queue completes automatically. FINISH success or a guessed URL alone is insufficient. There is no standard-video fallback after a Reels error. Real submissions do not automatically retry; a saved remote ID blocks blind explicit retry pending reconciliation. Published/manual-confirmed and restart-held destinations are excluded from dispatch. New separately created posts still need content/history duplicate checks.

Earlier Facebook Reels `2030865660948720` and `1456974179666566`, and earlier TikTok publications, retain **manual** provenance. Those records were not converted into API acceptance.

## Protected scheduled Tesla derivative

**Owner public verification is pending. Keep the existing scheduling process operational. Do not stop/restart it, cancel/reschedule/duplicate/manually publish the job, or change its caption, video or destination.**

| Item | Saved value |
| --- | --- |
| Local post | `post-74051364-849a-4195-b132-d76c19fa10ca` |
| Destination | `dest-mvg66513-ttjf` |
| Facebook Page | `409347032254077` |
| Bangkok posting time | **20 October 2026, 12:14 PM Asia/Bangkok** |
| Stored UTC | `2026-10-20T05:14:00.000Z` |
| Source video | `vid-mvf58d3n-a7ob`, Phuket - The VIP Parking Shortcut |
| Selected derivative | `derivative-tesla-phuket-vertical-309152f94938-v1` |
| Render basename | `tesla_phuket_vip_vertical_309152f94938_v1.mp4` (ignored runtime media) |
| Media | 1080x1920, 10.000 seconds, 300 frames at 30 fps, AAC stereo copied unchanged |
| Composition | Full landscape picture over blurred 9:16 background, owner approved; no stretched/cropped-away essential action |
| Source invariance | Original SHA256 matches the saved ingestion hash; separate derivative, no AI credits |
| Extra branding | Disabled; use this exact pre-rendered derivative |
| Creation response | Schedule API HTTP 200, one post and one destination |
| State at finalization baseline | `scheduled`, no remote ID/URL yet; actual public result pending |

Caption (hashtags stored separately):

```text
Tesla Roadster - VIP parking shortcut?
AI-generated fantasy video. For entertainment only; not a verified Tesla feature.
```

```text
#Tesla #Roadster #AIVideo
```

The schedule is **local**, not a Meta-native scheduled upload. The UI converts Bangkok wall-clock input to UTC ISO; the backend requires future timestamps with explicit timezone. The two-second worker uses SQLite `julianday` to release due work and publishes immediately without sending an elapsed scheduled time back to Meta. The queue displays the Bangkok target, Pending Dispatch/Scheduled and a pre-dispatch Cancel control. While protected, do not use that control. PC/server availability and valid authorization at dispatch are operational prerequisites; no cloud wake-up timer is installed.

Fixed scheduling defects: incompatible raw timestamp string comparison, timezone-free form transport, elapsed schedule forwarded to Meta, and retry/future-work paths that could bypass timing. The fixture advances only an isolated database's time; it is not proof that this future public Reel has appeared.

## Final verification and commit scope

Required gates: `npm test` (66 tests/eight suites, isolated data), `npx tsc --noEmit`, `npm run build:client`, `git diff --check`, staged-path/credential scan and read-only schedule/process comparison. Optional browser/upstream suites were not rerun during finalization. The live server must remain running throughout.

Relevant tests: `facebook_reauthorization.test.ts` (11), `meta_reels_publishing.test.ts` (5), `reels_queue_acceptance.test.ts` (5), `official_api_authorization.test.ts` (8), `real_accounts.test.ts` (15), `analytics.test.ts` (7), `domain_and_repositories.test.ts` (5), `social_command_center.test.ts` (10).

Finalization results on 20 October 2026:

| Check | Result |
| --- | --- |
| Full working-tree backend tests | **66/66 PASS**, eight isolated suites |
| Exact staged-source backend tests, without the uncommitted TikTok-only edit | **66/66 PASS**, exported index, separate test storage |
| Backend typecheck, working tree and staged source | **PASS** |
| Frontend production build | **PASS**, including frontend typecheck |
| Patch formatting and relative documentation links | **PASS** |
| Staged runtime paths and real local credential/token comparison | **PASS**, no findings; fixture strings are synthetic |
| Protected schedule fields and core record counts against the finalization baseline | **UNCHANGED**, still scheduled before due |
| Server on port 3001 | Same process `21424`; no restart/stop performed |

Only ignored build/test artifacts and finalization evidence were produced locally. Tests did not target the owner database. Normal background synchronization may append observations or update sync timestamps independently; it does not authorize changes to the protected publication.

### Files in the milestone commit

34 files: 10 documentation, 6 frontend, 12 backend and 6 test files. The pre-existing `server/src/connectors/tiktok.ts` working-tree edit is deliberately excluded.

- Documentation: `README.md`, `AGENTS.md`, `docs/PROJECT_MAP.md`; QA reports `ACCEPTANCE_REPORT.md`, `FIRST_REAL_SOCIAL_INTEGRATION.md`, `OFFICIAL_API_AUTHORIZATION_ACCEPTANCE.md`, `REAL_ACCOUNT_ONBOARDING_ACCEPTANCE.md`, `REAL_BRANDED_PUBLISHING_ACCEPTANCE.md`, `REAL_ENGAGEMENT_ANALYTICS_ACCEPTANCE.md`, `REFACTOR_REPORT.md`.
- Frontend: `client/src/components/accounts/ConnectionModal.tsx`, `client/src/components/publishing/DestinationConfigCard.tsx`, `client/src/components/publishing/QueueTable.tsx`, `client/src/hooks/usePublishing.ts`, `client/src/types/index.ts`, `client/src/views/PublishingView.tsx`.
- Backend: `server/src/connectors/{meta-facebook,registry,types}.ts`, `server/src/domain/publishing.ts`, `server/src/repositories/{account-connections,publishing}.repo.ts`, `server/src/routes/connections.routes.ts`, `server/src/services/{connections,publishing,queue,sync}.service.ts`, `server/src/services/oauth-diagnostics.ts`.
- Tests: `test/domain_and_repositories.test.ts`, `test/facebook_reauthorization.test.ts`, `test/meta_reels_publishing.test.ts`, `test/official_api_authorization.test.ts`, `test/real_accounts.test.ts`, `test/reels_queue_acceptance.test.ts`.

Commit the intended Facebook/shared OAuth, queue, schedule, UI, tests and sanitized documentation. Preserve the pre-existing TikTok-only connector fallback edit uncommitted; no new TikTok implementation is part of this finalization. `.data`, databases/backups, media, provider logs, tokens, keys, `.env`, browser sessions, dependencies and client build outputs stay untracked. Do not push. After the commit, wait for the owner's next instruction.

## Remaining limits

- Scheduled public publication and browser schedule-form submission are not live-verified.
- Bounded status polling can stop before a long-running remote operation finishes. Reconcile the persisted remote ID; never blindly reupload.
- Missing-expiry tokens have a conservative local expiry; reauthorization may be needed earlier than a provider's nonexpiring status suggests.
- Per-account grants/provider field availability limit sync; aggregate sync success is not blanket live metrics/reply acceptance.
- TikTok Personal remains preserved. Live Login Kit/HTTPS setup, Direct Post creator/privacy/status workflow, required product/scopes and automatic synchronization acceptance remain the next milestone. Existing adapter/fixture code does not enable Direct Post in the registry.
- Loopback deployment only; public OAuth/network exposure is outside this accepted milestone. The health endpoint still has a legacy version label.
