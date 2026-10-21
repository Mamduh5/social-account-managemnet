# V1.9 final engineering validation - 21 October 2026

V1.9 is code-complete for the scoped fixes; all final gates below passed. Natural live token renewal remains a separate acceptance gate. The existing backend, HTTPS proxy and read-only collector are deliberately preserved; they have not loaded these fixes. Rollout also requires the explicit nullable-statistics maintenance migration after observation, followed by a deliberate backend restart. No push, deployment, social publication, live refresh, live schema migration or historical data rewrite is authorized by this validation result.

## Defect A: temporary token endpoint failures expired authorization

The previous refresh catch treated every OAuthFailure with reason provider_rejected as invalid_grant. That included JSON HTTP 503 and 429 responses. The code now expires a TikTok connection only for the documented invalid_grant response under a compatible HTTP status; 429/5xx, network failures, timeouts, malformed/incomplete replies, unknown errors and local encryption/metadata errors preserve connection state and encrypted credentials. A late response cannot overwrite or expire a newer revision or disconnected account. Confirmed expired connections fail closed without repeatedly submitting the revoked refresh grant.

A failed proactive refresh may continue with a still-valid access token. A failed refresh of an expired token stops that synchronization before metric requests, preserves last_success_at and appends no synthetic snapshots. Later synchronization can renew and recover. Token rotation is encrypted before persistence; absent refresh-expiry metadata retains its previous bound. TikTok health checks also preserve connection state on temporary failures. Diagnostic metadata is allowlisted; arbitrary provider messages and log IDs are omitted from public errors/logs.

Implementation: server/src/services/connections.service.ts, services/oauth-diagnostics.ts, connectors/registry.ts, connectors/tiktok.ts and routes/accounts.routes.ts. Regression: test/tiktok_token_refresh.test.ts.

Provider semantics: [TikTok OAuth errors](https://developers.tiktok.com/docs/en/oauth-error-handling), [token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management), [API errors](https://developers.tiktok.com/docs/en/tiktok-api-v2-error-handling).

## Defect B: missing account fields became confirmed zero

The basic-profile fallback could label an account response confirmed with no statistics. SyncService then defaulted missing totals to zero, the repository repeated that coercion, and NOT NULL DEFAULT 0 storage enforced it. The fix validates successful, complete account responses, accepts only finite nonnegative numeric statistics, keeps explicit numeric zero, and carries unavailable fields as null. A response with no available statistics produces no account snapshot and does not establish a successful data synchronization. Genuine post counters and provenance remain independent and unchanged.

New snapshots use nullable account metrics and metric_contract_version=1. Follower overview/ranking reads use evidence-bearing snapshots rather than default accounts.followers_count=0; the frontend renders unavailable values explicitly. Existing old-schema account writes fail closed with a maintenance requirement while genuine post synchronization can continue. New isolated databases use the corrected schema; startup does not rebuild existing analytics tables.

Read-only historical inspection initially found 10 TikTok Display API candidates, from 2026-10-20T12:02:52.735Z through 2026-10-21T03:32:34.780Z. A later SELECT found 11 as the protected background process continued, plus 49 legacy Meta Graph API snapshots. Unsupported totals are identifiable from the historical connector contract. Zero followers/likes cannot always be reconstructed as real zero versus absent because raw responses/field presence were not persisted. These are candidate cohorts, not proof that every zero was false. Raw rows, timestamps, notes and provenance remain intact; safe read projections flag or mask ambiguous legacy fields. Post-level zeros and browser/manual observations are preserved.

[Maintenance instructions](V19_ACCOUNT_STATISTICS_MIGRATION.md) describe the explicit read-only inspection and later apply command. The idempotent migration creates/verifies a consistent backup, requires the finished observation window and absent protected backend/collector PIDs, then rebuilds only analytics_snapshots in one transaction. Indexes/triggers and every historical value survive. Unknown schemas/foreign-key failures roll back. It performs no automatic historical zero-to-null rewrite. This migration was tested only on fixtures and was not applied to owner data.

## Final automated gates

| Gate | Result |
| --- | --- |
| npm test | PASS; 158/158 tests across 13 isolated suites; 0 failures, skipped or cancelled |
| npx tsc --noEmit | PASS; exit 0, no diagnostics |
| npm run build:client | PASS; 1,951 modules; nullable client types included |
| Public-site build/check | PASS; 11 allowlisted files, 96 references, 63,771 bytes |
| Public-site static HTTP | PASS; 16 cases plus HEAD 200 / POST 405 |
| Public-site package:upload | PASS; 11 ZIP entries verified by size and SHA256; local package only |
| Worker syntax/source/package parity | PASS for executable source and packaged Worker |
| Cached Wrangler 4.151.3 dry run | PASS; 3.39 KiB executable, ASSETS binding, explicitly exited without upload |
| git diff --check | PASS |

The full suite covers 13 isolated test files. Focused refresh/security/health coverage is 54 tests; account statistics/migration coverage is 11. Relay/proxy suites cover 17 cases, generate disposable one-day TLS identities, validate certificates/hostnames and use ephemeral loopback ports. OpenSSL is needed for fixture certificate generation (available through Git for Windows on this host). No owner certificate/private key is used, and TLS verification is not disabled. All suites receive their own SCC_DATA_DIR; provider traffic is mocked. The client build emitted a non-failing Vite plugin-timing warning.

Refresh coverage includes the 30-minute proactive window, access renewal, rotated refresh credentials, ciphertext persistence, concurrency deduplication, success/failure revision races, disconnected-account preservation, temporary failures, confirmed revoked grants, subsequent-cycle recovery and zero synthetic failure snapshots. Statistics coverage includes numeric zero versus missing/null/unsupported values, failed/incomplete responses, genuine post preservation, old-schema write refusal, exact migration history preservation, index/trigger retention, rollback and idempotence.

## Live versus isolated boundaries

Existing V1.8 live OAuth and prior periodic Display API observations are historical live evidence; this task did not repeat consent or code exchange against TikTok. Current callback compatibility is established by isolated state/cookie/revision/CAS exchange and TLS tests. The existing public Worker routing had prior live read-only evidence in the owner's acceptance record; current source/package checks and Wrangler dry run do not constitute deployment or a new public acceptance.

The protected Facebook destination was already published with confirmation_source=api before this task. Its original scheduling inputs, destination, caption, derivative and publication history are preserved. Facebook OAuth/Reels/scheduling fixture suites passed; no live publishing or public-owner verification was performed here. Existing TikTok account identity, Personal type, records and metrics were preserved.

The natural observation window remains scheduled to finish at 19:20 Asia/Bangkok on 21 October 2026. Its expected refresh eligibility starts at 18:29:28.618, before access expiry at 18:59:28.618. No expiry, connection revision or token was manipulated, and no live refresh/sync API was triggered. Renewal must be supported by actual saved observation evidence; elapsed time is not a pass. The preserved old runtime will not exercise the new fixes until later maintenance.

## Git scope and operational preservation

Before this task, HEAD was 5427365 (V1.7). Uncommitted prior work included the public-site source/configuration/docs, local HTTPS proxy, callback relay/cookie/error handling, automatic refresh/sync/health integration, three new test suites and TikTok preparation documentation. Those relevant V1.8/V1.9 changes are included with the reviewed fixes; no unrelated working file was added. The public-site source is committed separately from the private application and regression/migration work.

Only source, tests, configuration and documentation are commit candidates. Environment files, encryption keys, SQLite/WAL/backups, observation records, certificates, media, build outputs, packages, preview screenshots and test logs remain ignored/local. Local validation evidence is under .data/final-validation-v19-20261021; natural observation files remain in their original directory. The environment, credentials/revision, account identities, protected publishing records, media metadata and process start times are compared read-only before/after. Final safety result: PASS at 2026-10-21T03:53:44.021Z; environment, credential/revision fields, identities, protected records, media metadata and all three process start times unchanged. The collector recorded four periodic cycles and natural renewal remained unobserved..
