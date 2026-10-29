# Owner content reset and architecture maintenance

The owner authorized one local checkpoint, SCC content reset and additive migration on 29 October 2026. Release activation and Git push remain excluded. This procedure never modifies Pipeline sources, calls social providers or deletes media files.

Run only from the clean committed source with the original owner configuration:

```text
node --import tsx scripts/owner-content-maintenance.ts --execute --expect-current FROZEN_SHA --expect-source CHECKPOINT_SHA
```

The procedure acquires the existing owner-update and maintenance exclusion markers, uses the frozen controller's authenticated idle-only shutdown, checks process identity and reserves owner loopback ports. It uses SQLite backup, verifies full recovery on a separate copy, rehearses the reset and migration and boots both frozen and source backends on separate copies with workers paused and outbound networking blocked. The printed exact inventory requires an `APPLY <fingerprint>` review handshake. The owner database stays unchanged until that handshake.

Every known table has an explicit delete/retain policy. Unknown tables and changed append-only triggers stop maintenance. Group delete triggers are suspended and recreated inside the same reset transaction; foreign keys remain enabled. Accounts, identity aliases, category relationships, OAuth records, voice configuration, operating limits, essential settings, command receipts and reply/provider-accounting evidence survive unchanged. Ordinary content and cleanup classification settings are removed. One checksummed safety receipt retains destination IDs, remote receipts, original outcomes and unresolved manual handoffs. It grants no replay permission. Existing provider ledger files stay byte-identical; draft creation accounting survives content removal.

The pre-reset backup is created before deletion. Reset verifies its own transaction before a separate verified pre-migration backup and additive schema transaction. The original database is modified in place and is never replaced by a rehearsal. A private report contains exact counts, identities, backup SHA256 values, compatibility evidence and media hashes. Artifacts reside under `.data/owner-content-maintenance/<run>/` with current-user/SYSTEM permissions. Do not share the backups or raw report publicly: backups contain encrypted credentials and owner content.

## Runtime and activation

The frozen release accepts the additive SQLite schema, but its Activity API permits deleting reset safety evidence and its reply guard uses disposable local comment IDs. It must remain stopped after reset. The official maintenance markers prevent current-user Startup from restarting it; the Startup entry, release pointer, environment, certificates and credentials are not changed. Source adds a remote-comment identity guard and protects reset receipts. Source `owner:update --check` reports schema prerequisites and verified retirement of the original three manual holds.

A new immutable release needs separate owner authorization. The updater's conservative database-source compatibility gate still requires explicit maintenance/compatibility review before activation; this tool does not override it, prepare a bundle, change the release pointer or start the owner. A future authorized activation must validate the final report, exact marker nonce/run directory and process absence before releasing those retained exclusion markers. Never remove an unrelated or replaced lock, and never bypass the managed controller with a watcher.

Normal account synchronization can create fresh account observations after approved startup. Existing Pipeline/watch-directory sources and all media bytes remain available; explicit discovery/import can rediscover cleared videos. The reset does not disable integrations or remove upstream content.

## Recovery

1. Preserve the entire private run directory, both backups, report and exclusion markers. Inspect `report.json` to distinguish pre-mutation failure, committed reset and committed migration. Never blindly rerun after an uncertain failure.
2. Keep owner processes stopped and ports reserved during recovery. Verify the backup SHA256 against the report and open a new separate rehearsal copy using SQLite backup. Require `integrity_check=ok` and zero foreign-key violations. Compare the exact account/identity fingerprints and schema with the report.
3. Prefer forward correction. The architecture change is additive; an old compatible reader can ignore its table/indexes. Do not drop command/safety receipts or refund provider accounting to roll back code.
4. Restoring deleted ordinary content requires a separate deliberate recovery decision because it can resurrect publishing jobs and stale observations. Do not automatically restore any pre-reset data. If explicitly authorized, rehearse the restoration, keep all prior uncertain/manual holds and newer safety receipts, verify no newer observations will be overwritten, then use an offline SQLite restore into the original database under a newly verified maintenance exclusion. Never replace it with the review copy or raw-copy live WAL files.
5. Resolve the frozen-release safety incompatibility before releasing the retained maintenance markers or allowing Startup to run. No social posting, deletion, refresh or reconciliation is part of this recovery procedure.
