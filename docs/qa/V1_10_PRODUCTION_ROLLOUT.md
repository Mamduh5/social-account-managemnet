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

## Results

Preflight implementation and rollback procedure prepared. Live apply, exact release hash, private backup receipt, current-user startup entry test, owner browser results and final runtime/synchronization outcomes are recorded after those gates complete. A real reboot/sign-in test will not be claimed unless observed.
