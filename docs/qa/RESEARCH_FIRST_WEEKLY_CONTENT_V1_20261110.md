# Research-first weekly content V1

Engineering implementation, 10 November 2026 (Asia/Bangkok). This record is not a production activation, generation grant, weekly publication authorization, or live-provider acceptance. No commit or push was made.

## Existing capabilities and the gap

SCC already had dated AgentResearch findings, exact Page editorial identities, the Global Social Persona & Relationship Policy, draft-first Page/Group preparation, the AgentRunner and its usage accounting, image scopes/trial history, Gemini production reservations, seven-day campaigns, exact campaign/draft review, publishing workers, native Group text schedules/execution, receipts and nullable analytics. Missing was a consolidated durable weekly research/idea/slot record and an owner workflow connecting those components.

The new record uses append-only `weekly_plan_saved` entries in the existing `content_workspace_audit` table. It adds no database, owner migration, timer, autonomous framework or publishing scheduler. Existing workspace/schema readiness is required. Every mutation uses the current revision; authorized slots keep their original idea, format and time.

## Research and ideas

`Collect saved research` reads a bounded set of the selected Pages' published destinations and confirmed official-API metric snapshots. Confirmed zero remains zero; unavailable counters remain null. It exports only a count of visible official-API own-post comments. Raw comment bodies, author names, avatars and personal IDs are excluded. The owner can select a relevant comment in Inbox and enter an anonymized summary with its `scc:comment:<id>` reference; the service checks Page, official source, visibility and published-post ownership.

The intake also supports owner references, permitted public primary resources and authorized observations from selected registered Groups. Evidence records preserve classification, source reference, observation/expiry, privacy, relevance confirmation, provenance and limitations. Owner-attested facts remain explicitly not independently verified. Identical content cannot gain freshness just by changing timestamps. Future/invalid dates and freshness longer than seven days are rejected. Group links bind the exact registered Group. Private evidence is not an accepted intake class.

The designated historical Developer Group pilot can supply its three proposed topics, labeled as an interpretation from one saved, non-reverified discussion. Participant names/quotes and its stronger popularity conclusions are excluded. Its report date is conservatively treated as start of day; importing the report does not refresh that date.

`Queue evidence analysis` creates one evidence-only `audience_research` task in the existing AgentStore. It does not invoke a model itself. The configured existing AgentRunner/executor supplies any later inference, with unchanged budget, quota and usage-accounting admission. The result contract requires exact Page/Group, evidence IDs, audience, usefulness, original contribution, format/rationale, factual dependencies, confidence and limitations. Unknown sources/destinations and invalid results cannot become selected ideas. Source text is untrusted data, never execution authority. Manual ideas use the same traceability contract.

Format choices are ordinary concise text, image/meme, image plus contextual caption, or Reel. No native colored-background support is claimed. The common persona policy, Page voice/editorial rules and exact Group rules travel with preparation. Reactions are evidence, never the sole ranking criterion or a causal result.

## Owner workflow and real queue handoff

Open **Content Calendar & Planner → Research-first weekly content**:

1. Create a seven-day Bangkok plan with exact registered Pages/Groups. End date is exclusive. Collect saved observations and add relevant references.
2. Queue/import an analysis result or enter an evidence-backed idea. Select ideas, formats and publication times. Slot edits remain local until saved; other mutations wait for save/discard.
3. Approve the current planning revision. This approves the plan only. Explicitly request preparation for selected slots. No media-generation or publication grant is created by either action.
4. Reuse `PageContent` for text and image concepts, and `AgentContent` for Group text and video story planning. Original deterministic task/job IDs survive restart and lost responses. A failure in one selected lane retains a hold while other lanes continue. Expired evidence and missed windows hold; no backlog replay occurs.
5. Refresh/materialize the original completed preparation. Page text becomes an unapproved draft; images without separate authority remain `awaiting_imagery`. Ready Page drafts are linked, without copying, into one existing seven-day campaign per Page. Only the original unchanged unapproved/unqueued draft revision can be linked. Existing approved/active campaigns are not extended or edited.
6. Review the actual campaign with the existing exact-content campaign review. Its existing explicit approval/queue action performs publication authorization and scheduling. No weekly endpoint calls campaign approval or a social connector.
7. Prepared Group text can enter the existing `GroupTextPublication` local lane only by supplying a matching existing registry and exact-post/weekly grant. The existing lane enforces identity, rules, expiry, content binding and duplicate fences. This does not create a grant, submit natively, or add a timer. Repeated weekly handoff reads the original schedule rather than dispatching again.
8. Refresh outcomes to retain actual destination, format, receipt/publication time and confirmed snapshots. Group receipts retain their original owner-entered/unverified status. Subsequent collection reads actual published history; it does not infer a universal strategy or change account identity.

## Operational boundaries

Existing authorized Page workers can continue while the owner performs other work, subject to their current runtime, approval, quota and recovery contracts. This implementation has not repinned or restarted the owner release or scheduled agent host. The new application and agent code must be activated through the existing release workflow before these controls operate in production.

New image generation requires fresh explicit bounded authority through existing exact-concept image scopes; the old standing trial cannot automatically adopt a weekly image concept. Existing grants, charges, failures, media, reservations and receipts are retained. No entitlement or capacity is inferred from subscription names, installed tools or model-pool exhaustion.

Reel selection prepares a story plan through the current AgentRunner. It does not automatically convert arbitrary weekly stories into Gemini production submissions. The existing validated production concept/scope/admission workflow remains required. No Flow changes, paid fallback or provider request occurred for verification.

Group discussion intake is supplied authorized observation, not an unattended scraper. Group publication continues through the existing shared native executor and its live preflight; no new unattended-execution guarantee is made. Unavailable research sources, authentication, media scope, context bounds, quota and missed times remain visible holds.

## Verification

Offline fixtures exercise the actual service/SQLite/AgentStore contracts without provider usage or social actions. Browser fixtures intercept all API calls and use an isolated static client; they do not establish live provider or owner-runtime acceptance.

- Weekly domain/service integration: **17/17 passed**. Includes exact campaign review/queue handoff, zero/null metrics, privacy and provenance, Group registry/grant binding, per-lane holds, interrupted handoff/restart identity, concurrent owner edits, editable oversize-brief holds and read-only overdue Group reconciliation.
- Weekly AgentRunner/AgentStore integration: **17/17 passed**, including full persona context admitted at the normal 16,000-byte bound, source freshness before executor probing, no automatic imagery scope from the old trial, exact output/source traceability, no orphan intent from an overlong brief and preserved owner-attestation qualifiers.
- Related existing agent regressions: **93/93 passed**; existing standing-image regressions **10/10 passed**.
- Existing calendar suite: **22/22 passed** after correcting one elapsed hardcoded 10:00 Bangkok fixture to tomorrow's Bangkok date. No production future-time guard was weakened.
- Final backend `npx tsc --noEmit`, agent `npm run typecheck:agent` and production `npm run build:client`: **passed**. Vite retains its existing nonblocking bundle-size advisory.
- Final browser fixture: **7/7 checks passed**: evidence/provenance, uncertain-intent locks, verified-fact payload and form preservation, strict editable fields/Bangkok date limits, planning-only approval, existing-only Group grant handoff, desktop dark/mobile light without browser exceptions or horizontal overflow. Evidence: `.data/test-runs/weekly-content-browser/1794308768063/` (`result.json`, desktop/mobile screenshots).
- Final full `npm test`: **1,101 tests passed, 0 failed, all 107 suites passed**. The initial run exposed only the elapsed calendar fixture described above; its focused rerun and the final complete run passed. Logs remain local under `.data/weekly-content-validation/npm-test.log` and `npm-test-final.log`.
- Final `git diff --check`: **passed**. No files were staged or committed, no push occurred, and unrelated pre-existing dirty work was preserved.

## Exact source files

- `server/src/domain/weekly-content.ts`
- `server/src/repositories/weekly-content.repo.ts`
- `server/src/services/weekly-content.service.ts`
- `server/src/services/weekly-agent-bridge.ts`
- `server/src/routes/weekly-content.routes.ts`
- `server/src/index.ts`
- `scripts/agent/weekly-content.ts`
- `scripts/agent.ts`
- `scripts/agent/runner.ts`
- `scripts/agent/page-content.ts`
- `scripts/agent/page-image-policy.ts`
- `client/src/api/weekly-content.ts`
- `client/src/components/content/WeeklyContentPlanner.tsx`
- `client/src/views/CalendarView.tsx`
- `test/weekly_content.test.ts`
- `test/agent_weekly_content.test.ts`
- `test/content_calendar.test.ts` (future-date fixture correction only)
- `test/e2e/weekly_content_fixture_acceptance.ts`

This QA record is additional documentation. Pre-existing unrelated uncommitted files, including the Developer pilot report and Antigravity wrapper edits, were preserved.
