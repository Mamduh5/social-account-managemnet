# Architecture implementation — source review checkpoint

Owner authorization: 29 October 2026, Asia/Bangkok. Baseline checkout: `3dc7c6f5391ab679cab571f87eeebfc45dd8fa69`.

This work changes the source checkout only. It does not activate a release, restart an owner process, change owner data, call a social provider, modify the upstream AI Video Pipeline, or authorize a commit/push.

Later owner authorization separately permits one local checkpoint, controlled SCC content reset and additive database maintenance, in that order. The guarded procedure and rollback are documented in [owner content maintenance](OWNER_CONTENT_MAINTENANCE.md). This does not permit release activation or push. Actual run receipts remain private under `.data/owner-content-maintenance`; this source document describes the procedure, not a claim that the owner operation has already run.

## Implemented boundaries

1. **SCC record cleanup:** explicit dependency selection supports resolved local terminal histories, including the historical partial-failure simulator shape. Every account, credential, connection and original media byte is retained. Active/uncertain/manual holds and unselected accounting/engagement/approval references remain protected. Confirmed remote receipts survive local history removal in a versioned deletion audit. See [cleanup contract](SCC_RECORD_CLEANUP.md).
2. **Publishing History:** one row per existing destination, stable newest-first server pagination, Created/Scheduled/Updated clocks, completed/failed/status/platform filters, Bangkok date/week/month/rolling/custom ranges. A separate bounded active queue keeps operational work independent of history browsing. No attempt/history copies are synthesized.
3. **Frontend ownership:** visited features retain editors behind hidden/inert sections; activity context suspends their subscriptions, polling, previews and modal focus traps. General-post forms/history filters survive Publishing tabs. Shared reference reads and resource invalidation replace category divergence. Reads use fencing; Calendar and Analytics distinguish failure from an empty result. Inbox preserves structured native fallback errors.
4. **HTTP and notifications:** typed bounded HTTP transport never automatically retries commands. Existing SSE supplies versioned resource-change notifications, heartbeat and slow-client handling. Reconnect/focus resynchronizes authoritative HTTP state. There is no new WebSocket service or durable event replay requirement.
5. **Backend reliability:** reference-aware render removal; global queue capacity; account-scoped sync coalescing; nullable coverage-aware analytics; Bangkok daily cumulative observations; validated manual provenance/counts; bounded comment/reply cursor traversal; account-qualified threads; explicit partial generation results; staged upload compensation; framework range serving; batched calendar reads.
6. **Identity and command safety:** Pipeline discovery/import reuse is qualified by captured source identity. Ambiguous legacy imports require review. The Reel HTTP create command requires a stable command ID, with an immutable result receipt that survives SCC history cleanup.

## History contract

- `GET /api/publishing/history`: `timestamp=created|scheduled|updated`, `direction=desc|asc`, `period=all|today|date|week|last7|month|last30|custom`, owner dates, outcome/status/platform, bounded limit/offset. The domain module defines the exact accepted parameter names and validates conflicting/invalid input.
- Calendar weeks start Monday. Date ranges are inclusive owner dates converted to exclusive next-midnight UTC boundaries. Bangkok is always the displayed date basis.
- Null schedules sort last. Identical timestamps use the destination ID as a deterministic tie breaker.
- `GET /api/publishing/queue/active` is bounded and includes manual holds. Existing `/queue` remains compatible with existing consumers.
- Retry, cancel, reconciliation and manual receipt operate on existing destination identity. Refetch retains the current history page and filters.

## Publication command contract

`POST /api/publishing/posts` requires `commandId` in JSON or `Idempotency-Key` in the header. Preserve it until the result is confirmed. Same ID plus the same canonical payload returns the original result; changed content with that ID is rejected. The frontend retains only a content fingerprint and pending command ID in session storage, with an in-memory fallback. There is no automatic retry.

Internal calendar/general-draft workflows retain their existing exact-approval contracts. Command receipts deliberately have no cascading post foreign key. Explicit history removal cannot turn an old command into a new submission.

## Migration and owner release implications

**This source requires explicit schema maintenance before owner activation.** Fresh isolated databases create `publishing_commands` and History expression indexes. Existing databases are not silently upgraded by startup. Managed startup refuses the missing prerequisite with `OWNER_ARCHITECTURE_SCHEMA_MAINTENANCE_REQUIRED`.

The additive schema contains command ID, canonical payload hash, original local post ID and result receipt; it contains no caption, token or credential body. Its indexes support History time queries. Existing publishing/account/media rows are not rewritten.

`scripts/prepare-architecture-migration.ts --database SOURCE --copy-to NEW_COPY` opens the source read-only, takes a SQLite backup into a new file under `.data/architecture-review`, applies the additive migration to that copy and checks integrity/foreign keys. It has no live apply, replacement, restart or activation mode. This tool has not been run against owner data during implementation.

Production use still requires a separately authorized controlled maintenance operation: compatible pinned release, idle/protected queue evidence, verified WAL-safe backup, copy rehearsal, atomic migration, unchanged credentials/certificates and documented rollback. Preserve command receipts when rolling back or reconciling newer observations. Never copy a review database over the owner database. See [existing rollout and rollback procedure](V1_10_PRODUCTION_ROLLOUT.md).

## Verification and practical limits

All automated databases/files are disposable fixtures. Browser tests bundle real React components, block external requests and exercise native keyboard behavior. Provider tests use mocked transports. These checks are not live social-platform acceptance, owner-data cleanup, or visual acceptance of the running frozen release.

The standard test runner now uses OS-temporary `scc-test-runs` directories and isolated/paused-worker flags. The legacy comprehensive suite refuses unsafe direct invocation before importing the application database.

Checkpoint verification: **510/510 tests passed across 58 isolated suites**, zero failures and zero skips, including the final History browser checks and the new maintenance/replay safeguards. Backend TypeScript, frontend TypeScript, targeted maintenance-tool TypeScript, client build and `git diff --check` passed. The broad `tsconfig.operations.json` check still reports seven pre-existing errors in six unrelated capture/live-check scripts; those scripts were not changed or executed against providers.

Full-suite checkpoint evidence is the private temporary log `scc-checkpoint-final-1793271673277.log` in the current user's OS temp directory. No owner data was used. The build reports a non-blocking 500 kB chunk-size warning (approximately 652 kB before gzip / 167 kB gzip for the main JavaScript bundle).

## Remaining refinement candidates

- Cleanup retains a conservative unknown-schema/JSON dependency scan; large-inventory latency has not been benchmarked on owner data.
- Groups list hydration, Dashboard summary payloads and render-pin lookup can be narrowed further without changing their authoritative identities.
- The single client bundle produces a size warning; feature chunking is a separate measured optimization, not a release blocker.
- Further extraction of the Reel composer/media rules and typed Assistant editorial subflows can follow these resource boundaries. Their current safety contracts remain in place.
- Durable event replay is intentionally absent; reconnect resynchronization is the supported recovery mechanism.
- Production maintenance/activation, owner workflow acceptance and live-provider verification remain separate from this source implementation.
