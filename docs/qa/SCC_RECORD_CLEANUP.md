# Owner-selected SCC record cleanup

This source change makes the existing **Manage Demo & Test Data** workflow usable for local library records and resolved publishing history. It does not activate an owner release or perform cleanup on the owner database.

## Removal contract

- Accounts are never deleted here, including simulator accounts. Credentials, connections, identity aliases, OAuth sessions and account history remain unchanged. Account archiving stays in Accounts.
- Library records from SCC-managed uploads/imports, saved render records and explicitly selected terminal publishing histories can be removed together.
- Master files, render files, Pipeline projects and social-platform posts are never deleted or modified. Removing a library row removes its current database-backed selector entry; it does not reclaim disk space.
- Owner labels identify records. Marking a record Test is neither required nor a bypass of dependency and submission checks. Keep remains a deletion hold.
- Active jobs, awaiting-confirmation handoffs, future/invalid schedules and uncertain submission evidence remain protected. Campaign/approval lineage, provider accounting, engagement snapshots, comments and other unselected references are not silently removed or unlinked.

## Dependency selection

Select a library record and choose **Review Deletion**. When its complete bounded graph is removable, the review lists required render and publishing-post records. Choose **Add listed dependencies and review again** to select those exact records explicitly. The second preview shows every row, including the destination children of selected parent posts. Nothing is deleted by inspection, classification or adding dependencies.

The owner must type the exact `DELETE` phrase and invoke **Delete selected records**. Previews are one-use, expire after five minutes and bind the complete inspected snapshot. The immediate transaction rechecks eligibility and the snapshot, rejects concurrent changes, checks foreign keys and records its deletion audit atomically. A blocked record prevents the entire operation. The selection limit remains 25 explicit records; each selected post has a bounded destination review.

## Historical publication rules

Terminal parent statuses are `failed`, `cancelled`, `completed` and `partial_failure`. Child statuses must be `failed`, `cancelled` or `published`.

The historical Test Animation shape—one `partial_failure` post with two simulator `published` destinations and one failed destination—is supported. The account's current connection revision, grants or credentials are not rewritten or reset to make the graph qualify. The account itself is preserved.

A published non-simulator destination requires a complete confirmed receipt. Failed/cancelled rows with saved remote evidence and any row with an outstanding submission intent remain blocked until its outcome is reconciled. Confirmed history with live campaign, draft, analytics, inbox or accounting dependencies remains protected by those references.

Version 2 deletion audits retain the removed destination's account/post IDs, status, retry count, remote post ID/URL, confirmation/provenance and timestamps, plus parent/media identities. These receipts contain no account credentials or captions. Existing observational activity metadata remains unchanged and can refer to the removed identity through this retained receipt. Live foreign-key and accounting references continue to block removal.

## Discovery remains separate

Deleting an SCC library row leaves upstream Pipeline and watch-directory entries intact. Their discovery can show the source again, and an explicit import can create another SCC row. Use the existing source-scoped **Hide from SCC** action for discovery visibility. Pipeline and watch exclusions do not hide an already imported library master, and removing a master row does not automatically add a discovery exclusion.

## Verification

The cleanup regressions use disposable temporary databases and synthetic files. They cover explicit dependency selection, the legacy partial-failure graph, confirmed receipts, account/credential/identity/session preservation, immutable file bytes, retained audits, active/uncertain holds, draft/accounting references, stale previews, foreign-key rollback, origin checks and one-use commit. The browser component regression uses mocked API responses with all network requests blocked and verifies cancel/focus, dependency review, exact confirmation and in-flight dismissal protection.

Cleanup itself requires no schema migration. The wider source implementation adds a publishing-command receipt prerequisite and History indexes; see [architecture implementation and release implications](ARCHITECTURE_IMPLEMENTATION.md). Owner release activation and any real owner-selected cleanup remain separate operations.
