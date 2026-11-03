# Flexible autonomous content production — 3 November 2026

Implemented in the existing SCC agent CLI/sidecar/runner and a targeted Gemini attachment correction. No production draft, configuration, scheduler, credential, provider reservation or social post was changed. No live model or video generation was invoked. No service was restarted, deployed, committed or pushed. AI Video UI is unchanged.

## Reused workflows and new operations

The implementation reuses `AgentWorkQueue` claims, revisions and command deduplication; `AgentStore` knowledge/receipts; existing runner executor isolation and budgets; Content Assistant voice/rules through the operator Page context; saved analytics; the existing media library and Publishing draft service; and Groups Planning's review, preparation and manual-package endpoints. It does not add a database schema, publisher, provider controller or background polling service.

New operations are `content-context`, `content-enqueue`, `content-persist`, `content-status`, `content-reconcile`, `groups`, `group-package`, `research-save`, and `research-status`. All retain the `agent-workflow.v1` envelope. Usage and JSON contracts: [agent content guide](../AGENT_CONTENT.md).

Available preparation formats: existing video, image, text, Group post, research analysis and Gemini video story plan. Image creation and actual audiovisual review still require their separately reviewed capabilities; metadata does not prove creative acceptance. Gemini story planning does not submit a video. Flow remains owner-operated.

## Selection, persistence and efficiency

- Selection uses requested preferences, Page context, existing resources and dated evidence. A saved Gemini hold moves video planning behind independent work. Native generation-dependent tasks still require cached confirmed completion; independent tasks do not wait or poll.
- Context is cached for fifteen minutes, with bounded voice/media/analytics/Group projections. Full prohibitions are preserved; examples/facts are excerpts, and oversized task payloads are skipped rather than silently dropping restrictions. The original operator endpoint still sends its full underlying library.
- Up to three tasks are created atomically per enqueue request. Stable normalized topic/account/format/Group identities deduplicate work. Existing backlog, concurrency, invocation, attempt and token admission limits remain in force. There is no idle task factory or repeated model-research loop.
- Research requires source URLs, dates, uncertainty and a freshness window of at most seven days. Duplicate source evidence is reused; new timestamps alone cannot renew unchanged evidence. Findings are agent-supplied, not independently verified. Missing metrics remain unavailable, and small observations do not establish a trend.
- Default executors analyze supplied evidence with tools disabled. Live research is collected through supported external agent tools and imported using `research-save`; no new search subscription, hidden provider or paid fallback is activated.
- `saveContentDrafts` defaults to false. An authorized configuration can enable deterministic post-result saving through existing SCC draft/Group APIs. Model output cannot approve, queue, schedule or generate. Content HTTP operations have ten-second per-request bounds, within the existing scheduled-host process bound.
- Draft intent is saved before HTTP. Concurrent callers share that intent. Lost responses and crashes hold `pending`/`uncertain`, with no automatic write/model retry. Exact known resources can be reconciled read-only. Changed task results cannot attach older receipts. Saved outputs, resource IDs, knowledge and handoffs survive another agent process.
- Group preparation binds the exact rules/revision, acting identity, participation restrictions, relevance and compliance explanation. Rules drift and known restrictions block writes. Arbitrary natural-language compliance remains an agent assertion for owner review. No Group posting, joining, reminders or receipt fabrication is added.
- Unassigned runner tasks now exclude account-private knowledge. Research without an account uses only global findings rather than other accounts' records.

## Gemini recovery investigation

Read-only native evidence captured **3 November at 11:02 Asia/Bangkok** for project `330aaf23-17d6-4982-96c6-93ef3792673c`, original run `9d03bc99-1ff4-43f7-b095-68f3701bfd09`:

- The run remains `reconciliation_required`, accepted count 0, with its original submission and account identity hash retained. The native unresolved-submission hold remains in place. No new recovery POST was made in this assignment.
- The existing failed recovery record remains `download_failed` with `browser_unavailable`. The dedicated browser's target list is reachable and includes **two Gemini conversations**, including the exact original `/app/9cf695a4c3db1cca`. Only target metadata was read; no browser input, refresh, navigation or desktop control occurred.
- Source inspection found that `openRun` opened a generic account workspace before restoring its exact saved conversation. Generic selection rejects several busy nonidentical tabs. Its idle fallback cannot select a busy original. That attachment failure is collapsed into `browser_unavailable`, so endpoint health can succeed while recovery fails.
- A fixture reproduces the defect with the original, an unrelated busy conversation and a misleading prefix match. Generic opening fails; exact saved-conversation opening succeeds without touching the other tabs. Duplicate exact original tabs remain refused. This confirms the selector defect and is consistent with the live tab layout; it does not conclusively establish that it is the only live failure.

The correction passes the canonical saved conversation through the existing original-account opener, selects that exact tab first, and retains account-identity verification, prompt/turn correlation, safe restoration, reservation ownership, download validation and all uncertain-submission safeguards. If no exact tab exists, existing safe workspace restoration remains available. Flow and new-generation tab selection retain their existing path.

This is **source/fixture validation**, not successful live recovery. The installed Pipeline executable still identifies build `198a10dfea169b1e6825f344d170b48602a56b79` with modified sources. It was not replaced or restarted. SCC owner health remains 1.12.0 at frozen release `aa3d642fcd65e8da2a16d1bfd7ceb06e4d161e04`. The original provider outcome remains unknown. Applying the Pipeline correction at a safe runtime boundary and verifying the original result are separate owner operations; no automatic retry, replacement turn or lock release is authorized by these source changes.

## Validation

Focused SCC validation covers resource/format selection, Gemini holds with independent runner work, exact SCC text/image/Reel drafts, Group restrictions/drift, source freshness and deduplication, concurrent saves, uncertain-response read-back, schedule injection, compact/scoped context and resumption through a separate real CLI process. Actual SCC handlers use disposable databases/media, mocked executors/providers and guarded loopback-only HTTP. No real social queue item is created by the new content tests.

Final results: **136/136 SCC tests across 11 focused suites**, **15 focused Go test functions** (11 Gemini/browser/account/recovery and 4 Flow), `npm run typecheck:agent`, backend `npx tsc --noEmit`, and Git whitespace checks in both changed repositories all passed. Existing runner, scheduling/diagnostics, nonblocking work, SCC adapter, workflow safety, Pipeline adapter/integration and Group handoff regressions remain included. The full application suite was not repeated.

Private evidence: `.data/agent-flexible-validation/recovery-readonly.json`, `focused-results.json`, `focused-results-followup.json`, individual suite logs, `pipeline-tests.jsonl`, and `flow-tests.jsonl`. These artifacts are ignored and are not staged. The recovery fixture tests include account-identity rejection, original-result deduplication/backoff and reservation preservation; Flow fixtures cover uncertain submits, budgets, queue reload and human handoffs.

## Git and limits

All new changes are uncommitted. SCC changes are limited to agent operations/adapters/configuration/context scoping, focused tests and documentation. Pipeline changes are limited to exact original-tab attachment and its existing account/recovery plumbing/tests. AI Video UI has no changes. No live provider, real scheduled execution or production draft acceptance is claimed for these new capabilities. Production automation stays unmodified; activating a configured runner remains a separate authorization.
