# V1.10 controlled production rollout and current-user startup

Authorized 24 October 2026 (Asia/Bangkok): local Git checkpoint, verified WAL-safe backup, the documented V1.10 migration, deliberate owner restart and current-user startup. No social publication, new live schedule, reauthorization, paid-provider fallback, Cloudflare deployment or Git push is authorized.

## Baseline and maintenance gates

The earlier owner process was pinned to 12ae5d8, using the original .data/social_command_center.db and owner .env; its HTTPS proxy used the existing localhost certificate. The separate review application used .data/v110-review/app and its own built client/key. Those databases are never exchanged. At this rollout's fresh inspection another Windows boot had occurred (24 October 20:22 Bangkok), all recorded old PIDs were stale and ports 3001/3443/3195 were absent. The latest saved social sync attempts already reported network fetch failures; this is a pre-rollout baseline condition, not automatically a release regression.

A new private baseline is .data/v110-rollout/baseline.json. Recheck the live queue immediately before apply. The three protected manual destinations must compare exactly. Any in-flight, uncertain or overdue publication blocks migration. New source, tests, and operational documentation are checkpointed locally before maintenance; the final deployed hash and receipts will be recorded below.

The combined migration is the same copy-tested general-post/workspace schema, now one atomic transaction. It makes publishing_posts.video_id nullable, adds explicit content/attachment/draft state and empty workspace tables, and never copies review accounts, generated content or voice examples. All existing columns/rows, media references, receipts, identities, encrypted credentials and analytics are checked before commit. Backup uses SQLite's online backup API, not a raw copy of an active WAL database. Backup/control directories grant current-user and SYSTEM access only; the original encryption key stays in its original private configuration.

## Rollback — prepared before apply

1. Do not start or replay any publication to work around a failed gate. Preserve the private baseline, original .env/key, pinned 12ae5d8 source below .data/v110-recovery/owner-runtime-12ae5d8, original client/dist and existing TLS certificate.
2. The live queue and absence of owner/proxy listeners are checked again. The apply command creates maintenance.lock and temporarily reserves both loopback ports to exclude startup, makes a new consistent backup, verifies integrity/foreign keys/counts/hashes and writes backup-receipt.json before changing schema.
3. Any schema/workspace/data-validation exception rolls back the complete migration transaction. If apply fails before commit, leave the unchanged database in place and restart the previous pinned source only after a fresh queue check. Do not restore a backup unnecessarily.
4. If the new runtime fails after a complete migration, stop only its verified owned processes when idle. Take a fresh consistent post-failure backup. Prefer retaining the forward-migrated database and investigate/rehearse the prior source against a copy; it must not process any new general-post job. The old source is not assumed universally compatible with future new records.
5. Restore the pre-migration database only while owner/proxy are stopped and only after proving no newer account/token revision, analytics observation, publication receipt, comment, draft or other write would be lost. Compare all original table projections with the backup receipt. If anything advanced, stop and reconcile rather than overwriting it. Never copy a review/rehearsal database over production or move SQLite/WAL files piecemeal.
6. Keep the maintenance marker/startup disabled while recovery is unresolved. Report a blocker rather than starting a partially validated application.

## Release and startup operation

The release package is frozen from the local Git checkpoint under .data/releases/<exact-commit> with source/bundle checksums and a client-input provenance receipt. The owner configuration has fixed workspace, database, dotenv, provider-config, Node executable and bundle paths. The backend binds loopback before schema initialization or worker startup; its health response identifies 1.10.0 and the exact release revision. A second listener cannot start another scheduler.

Normal commands after configuration:

- npm run owner:start — idempotent start; backend readiness is verified before starting the HTTPS proxy.
- npm run owner:status — current release, owned PIDs, health, publishing hold and startup registration; no secrets.
- npm run owner:stop — authenticated local graceful stop, refused/deferred while a publication, synchronization, generation or other mutation is active; no job reset or forced backend kill.
- npm run owner:startup — install the current-user Startup-folder entry for the frozen owner controller only.
- npm run owner:disable — remove only this startup entry; running services are not stopped.

run_server.ps1 and npm start use the owner lifecycle controller. Developer/isolated scripts remain separate. On sign-in only the owner backend and proxy start; review port 3195 is never registered. The hidden startup entry uses the current user's normal permissions, fixed working directory/config and a pinned Node executable. No administrator/UAC request, firewall rule, public listener or Windows service is installed.

Managed startup holds publishing before recovery if it finds interrupted, due or uncertain work; those records are not reset or replayed. The application and analytics can remain available for review. Future authorized schedules are preserved. The controller's process/start-time/entrypoint checks prevent PID reuse from authorizing a stop, and its exclusive lifecycle lock prevents duplicate commands. Startup failures are recorded in private runtime logs with credential-like text redacted.

## Assistant and browser acceptance boundaries

Reuse the existing explicit gemini_api_free / gemini-3.5-flash-lite configuration, source fingerprint and durable ledger. Five of six requests were already used. Do not reset/increase the cap or import synthetic demonstration voices. Provider generation remains an explicit user action; no background generation or automatic replies are enabled. Missing config or exhausted limits must remain honestly unavailable. Existing real-provider review evidence is sufficient; rollout testing need not consume the final request.

Owner browser acceptance uses the actual registered Page, existing owner media thumbnails and new clearly labeled owner review drafts. It never copies review-instance examples/accounts into production and never queues content. Groups UI/capability checks must not invent membership or a real group address; full fixture handoff evidence remains separately identified if no owner group is registered. No private comment is sent to a model. Screenshots containing owner information stay in ignored private rollout artifacts.

## Verified results — 24 October 2026, Asia/Bangkok

**Owner V1.10 is running.** The deployed source checkpoint and local release commit are **cccf9390542199fb18ae442753eba87088c9b255**. Source and client assets are frozen under .data/releases/cccf9390542199fb18ae442753eba87088c9b255; release.json verifies 82 files. The client build's canonical Git input hashes match this commit exactly. Later documentation/browser-selector corrections do not change the deployed application. No Git push or Cloudflare deployment was performed.

| Gate | Actual evidence |
| --- | --- |
| Automated suite | **229/229 PASS across 20 isolated test files**, zero failures; includes atomic rollback, manual-hold preservation, duplicate-port refusal, authenticated idle-only stop and startup ownership checks |
| Application typecheck | **PASS**: npx tsc --noEmit |
| Operations typecheck | **PASS**: npx tsc --project tsconfig.operations.json |
| Isolated client build | **PASS**: npm run build:client with SCC_CLIENT_BUILD_DIR=.data/v110-rollout/client-candidate; client typecheck included; original client/dist untouched by this rollout |
| Owner browser | **9 PASS**, zero page errors and zero prohibited mutation attempts; one additional persisted Group handoff check not run because no owner group is registered |
| HTTP / HTTPS | Both **200**, version **1.10.0**, instance **owner**, exact deployed revision; HTTPS validated with the unchanged existing localhost certificate, including hostname verification |
| Served bundle | Every served client file matches the pinned manifest SHA256 |
| Runtime after installed-entry test | Backend **PID 16604**, proxy **PID 8164**; only 127.0.0.1:3001 and 127.0.0.1:3443 listen; review port 3195 remains closed |
| Automatic sync | Successful automatic Facebook/TikTok boot sync on initial V1.10 launch and again after installed-entry cold start; latest 22:08:36 / 22:08:30 Bangkok. No manual sync or forced refresh was triggered. A subsequent 15-minute cycle was not required or claimed for this rollout |
| Owner database | Original .data/social_command_center.db, migrated in place as one transaction; integrity **ok**, zero foreign-key violations |
| Protected queue | **48 published / 9 failed / 3 awaiting_confirmation**, unchanged. No active, uncertain-dispatch or due job existed at maintenance. All original fields of the three protected rows compare exactly |
| Credential boundary | Original environment digest, encrypted credentials, scopes and identity aliases unchanged; actual secret-value scan of runtime logs and frontend assets found **zero matches** |

### Backup, migration and preservation

The fresh consistent pre-migration backup is **.data/v110-rollout/owner-pre-v110-20261024-cccf939.db**. Its SHA256 is **4a747007d1efee07cd50177e5005472047bac23300887bd1fc93be5daf963eba**. Backup integrity is ok with zero foreign-key violations; backup-receipt.json was written before migration. The backup and control folders grant current user and SYSTEM access only. The original .env/encryption key and existing TLS certificate/key remain in place.

All original row values across **14 tables** were compared inside the migration transaction before commit. The resulting schema contains **24 tables**. New workspace tables were empty immediately after migration except their default limits row: no review records, fixture accounts, provider examples or voice samples were copied. V1.9 nullable-statistics maintenance was already satisfied; no additional V1.9 migration was applied.

| Existing data | Before | After owner browser / automatic sync |
| --- | ---: | ---: |
| Accounts / identity aliases | 8 / 5 | 8 / 5 |
| Videos / branded variants | 23 / 15 | 23 / 15 |
| Publishing posts / destinations | 30 / 60 | 30 / 60 |
| Account analytics snapshots | 180 | 182 |
| Post metric snapshots | 499 | 511 |

All historical snapshots remain byte-equivalent as row projections. Added snapshots came from normal provider synchronization with existing provenance. Only the expected account sync timestamps/status/error/updated_at and published-destination last_synced_at advanced; all credentials, identities, publication status, remote IDs and receipts were preserved. **62 existing media files**, covering **67 stored references**, match their pre-maintenance sizes and SHA256 checksums.

Protected destinations remain dest-mvf5hdwf-19hi, dest-mvf5j24q-ub0y and dest-mvf5j24r-rw4x. Their original fields compare exactly to the fresh baseline. No reset, retry, cancel, confirm, schedule change, upload or publication was performed.

### Owner browser and assistant outcomes

The actual owner app saved **four new explicitly labeled OWNER REVIEW — UNPUBLISHED drafts**: Thai text, one image, ordered multiple images and a link to the existing registered Page. Images were existing owner thumbnails uploaded only to local storage. Text approval was bound to its exact revision/destination; editing cleared approval and returned it to draft. All four end unapproved, unqueued and unscheduled. The owner application's original publication tables remain 30/60. These are new local review drafts, not imported review demonstrations.

A fifth local item is an explicitly manual assistant draft, saved, approved and edited back to an unapproved revision. No model request or private-comment submission was made. The assistant exposes the tested **gemini_api_free / gemini-3.5-flash-lite** provider with generationAvailable=true, fixture=false, draftOnly=true and autonomousOutboundEnabled/automaticRepliesEnabled=false. The existing durable cap is **6 requests total; 5 used, 1 remaining**. Rollout usage is **0**. Missing configuration, provider failures, hostile-comment handling, reply non-execution and exhausted limits are covered by isolated automated tests. Actual synthetic model-generation evidence remains in the separate [real-provider report](V1_10_RUNTIME_RECOVERY_REAL_GENERATION.md); it is not relabeled as a new owner inference.

Owner voice profiles remain **0**; the UI displays the provisional default. No claim of learned owner voice or image understanding is made. The owner Groups registry remains **0**. The actual owner UI shows manual/unverified boundaries and disables saving a handoff without an owner group. No fictional group, membership or permission was inserted. Full saved registry/package behavior passed the earlier separate isolated browser acceptance and current isolated service tests; persisted owner-group handoff remains unverified until owner-supplied group information exists. No native Group/thread was opened.

Account and analytics views, existing Reel composer, video library and branding screen loaded successfully. The existing UI design is preserved. Private owner screenshots were inspected and remain under ignored .data/v110-rollout/browser. Two acceptance selectors were corrected to the existing Analytics heading and counted Video Library label; the checks resumed with the same saved drafts rather than creating duplicates. The final browser receipt contains 9 PASS plus the explicit Group limitation.

### Installed current-user startup test

Installed entry: **%APPDATA%/Microsoft/Windows/Start Menu/Programs/Startup/SocialCommandCenter.vbs**. It invokes the frozen release controller using the pinned Node path, explicit private configuration and fixed workspace. Startup is enabled. **npm run owner:disable** removes only this entry and leaves running services intact; use **npm run owner:stop** for an idle graceful stop. Re-enable with **npm run owner:startup**.

The installed entry was invoked while the app was already running: backend/proxy PIDs remained **20008 / 1896**, with no duplicate scheduler. A deliberate idle graceful stop then completed. Invoking the installed VBS started fresh owned processes **16604 / 8164**, with backend ready before proxy startup. HTTP, strict TLS, process ownership and served-release checks passed afterward. The initial PowerShell health-probe wrapper stalled; only that verified test-probe process was ended, while independent Node HTTP/TLS checks and controller logs established successful startup. Owner services were untouched by ending the probe.

**No real reboot/sign-in test was performed.** The mechanism has been tested through its actual installed entry point in the existing Windows session. No administrator/UAC elevation, service, public listener or firewall change occurred. Startup does not register or start the review app.

### Private evidence and remaining live gates

Private receipts are baseline.json, media-baseline.json, backup-receipt.json, migration-result.json, client-input.json, automated-tests.log, client-build.log, owner-verification.json, startup-test.json, final-receipts.json and browser/report.json under .data/v110-rollout. Owner configuration/process state and logs are under .data/runtime. None are tracked. Keep the backup and original key available; follow the rollback procedure above if future recovery is needed. Never restore this backup over the newer live synchronization/drafts without reconciliation.

The local rollout, migration, owner startup and draft workflows are verified. **General Facebook Page text/image/multi-image/link public publishing still requires separately authorized live acceptance.** Group membership/permissions and an actual owner manual handoff, TikTok publishing, owner voice quality, further AI generation and a real Windows sign-in remain separate gates. No new public social action, account reauthorization, AI Video Pipeline change, paid fallback, credit-limit increase, deployment or push occurred.
