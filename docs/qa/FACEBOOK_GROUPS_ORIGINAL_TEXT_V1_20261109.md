# Groups V1: original text destinations — 9 November 2026

The first separately authorized Reel share is **published in the observed native UI**: [actual Group receipt](https://www.facebook.com/groups/2214946398974915/posts/2568461086956776/). The [first-post report](FACEBOOK_GROUPS_FIRST_POST_READINESS_20261109.md) records its exact one-submission accounting and SCC receipt. It was completed before original-text engineering. Autonomous Items 1–4 remain closed; existing Page streams and Flow are unchanged.

**Later 9 November follow-up: ORIGINAL TEXT PUBLISHED.** An Antigravity attempt prematurely charged the original discussion without an isolated browser. After the owner personally confirmed zero prior Post clicks and authorized one bounded continuation, the shared SCC executor published [the original discussion](https://www.facebook.com/groups/2214946398974915/posts/2568574890278729/) as World at **16:34 Bangkok**. Its original grant/input and one charge are unchanged; SCC has one unverified/native-observation receipt. The [shared execution and recovery report](SCC_GROUPS_AGENT_INDEPENDENT_20261109.md) supersedes the earlier local-state/runtime limits below. A dedicated signed-in SCC Chrome and common native CLI executor now exist; standalone claim is disabled and managed readiness precedes charging. The initial uncertain response was reconciled read-only, without another Post click.

## Existing and added capability

Existing Groups Workspace already registers a Group with its Page binding, membership observations, category, rules/revisions, captured text/media handoffs, reminders, receipt history and native submission intents. It already supports original discussion text; it is not limited to Reel links. No owner database migration, new provider, browser platform, server or timer was needed.

The missing part was independent durable **original-text scheduling and standing authorization**. `scripts/agent/group-text-publication.ts` now reuses `AgentStore` jobs, transactions, immutable inputs, operation claims and knowledge observations. `scripts/agent.ts` exposes it through seven commands. It does not change Page queue records, publication grants, counters, approvals or generation accounting.

| Concern | Implemented behavior |
| --- | --- |
| Exact destination | Numeric canonical Group, existing SCC Group ID, exact Page account/Graph identity, observed native profile alias and current rules fingerprint. Current membership, source Page and captured context are rechecked before admission. A Group registration grants no publication authority. |
| Allowed format | Original text only; nonempty existing SCC post handoff, no attached media, no existing receipt or changed context. Images/memes require a later separately supported format and matching generation/publication authority. |
| Authorization | Explicit owner action creates either one exact prepared text hash/time grant or a distinct bounded weekly text grant. At most seven days; immutable ID/limits/expiry; no silent renewal. Weekly authority cannot change an already queued text/hash/time or override a revoked/held original. |
| Schedule | Independent sidecar destination records original prepared ID/text hash, target, UTC time and explicit Bangkok timezone. They survive reopening the store; no PC-downtime replay. A local due slot is not a Facebook-native scheduled post. |
| Limits | Owner-selected text submission total, rolling 24-hour count and minimum spacing, shared across text grants for that registry. Code caps are conservative admission bounds, not a claim of Facebook's safe posting rate. The earlier Reel share remains in its original ledger and linked receipt. |
| Pause and recovery | Registry, grant and destination controls are independent. Revoked, submitted, expired or overdue originals cannot be rearmed by Resume. Missed slots beyond the explicit lateness allowance hold without a submission. Pending moderation and uncertain originals block further text submissions in the same registry, not unrelated Page work. |
| One remote attempt | A fresh native identity/composer/rules observation is required. An atomic claim charges the grant and saves intent **before** the UI click. A second/concurrent claim never returns another dispatch packet. Restrictions, pending moderation and uncertain outcomes do not refund or trigger retries. |
| Actual outcome | Append-only observations distinguish `published`, `pending_approval`, `restricted` and `uncertain`; published requires a post permalink in the exact Group. Later moderation reconciliation preserves original outcomes and charges. This sidecar outcome is separate from the existing SCC handoff receipt field; save the actual receipt through Groups Workspace as well. No Graph API verification is implied. |

## Historical real local state before Antigravity's attempted execution

- Registry: `group-channel:01469297b59e21b9b9cf02803898c461`, linked to SCC `group-aa9a94da-d2a9-4ad1-9078-f41c4b19ad8c`, revision 3, [the selected AI short-film Group](https://www.facebook.com/groups/2214946398974915/).
- Acting Page: World / โลกจริงหลุดบท, `acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978`, Graph `1428270437036294`, native profile `61595592674364`. Member only, not administrator.
- Relevant About guidance permits presentation/exchange of AI/mobile short-film work and production techniques under Facebook community rules. No additional numbered rules were displayed. General post moderation and standalone-link policy remain unknown; no native scheduling control was observed. Empty original-text composer was observed as World; this task's live publication proof is the Reel share, not a new original-text submission.
- New original discussion handoff: **`gprep-3d136bd8-3f1a-4d14-bfd4-b1808a67851c`**, saved through the existing SCC preparation API with fresh revision/source binding, no media, no receipt and no drift. It asks which visual storytelling technique other creators would prioritize. This is locally authored draft copy, not a claimed provider generation.
- **Zero new text publication grants, zero scheduled text destinations, zero original-text submissions.** The owner approved only the first exact Reel share; a later actual time window, limits and text publication scope are still needed.

Prepared text:

> เวลาเล่าเรื่องสั้นด้วย AI โดยไม่ใช้บทพูด ทุกคนทำอย่างไรให้คนดูเข้าใจความรู้สึกของตัวละครครับ?
>
> ถ้าต้องเลือกปรับแค่อย่างเดียวระหว่างท่าทาง จังหวะตัดต่อ และมุมกล้อง จะเริ่มจากอะไร เพราะอะไรครับ อยากชวนแลกเปลี่ยนเทคนิคจากงานที่แต่ละคนลองทำกัน

The registry observation records that the timestamp is the contemporaneous earlier handoff save, not an extracted Facebook event time. Fresh pre-submit observations are required later. Private idempotent setup, real readback, the earlier approved share and validation logs are retained in `.data/group-first-post-20261109/`. No original handoff, publication or failed session was replaced.

## Operating commands

Use the workspace CLI with its existing loopback SCC client and original agent store:

```powershell
npm --silent run agent -- group-text-status
npm --silent run agent -- group-text-register --input <observed-group.json> --owner-authorized
npm --silent run agent -- group-text-authorize --input <owner-grant.json> --owner-authorized
npm --silent run agent -- group-text-schedule --input <exact-slot.json>
npm --silent run agent -- group-text-claim --input <fresh-native-observation.json>
npm --silent run agent -- group-text-record --input <actual-outcome.json>
npm --silent run agent -- group-text-control --input <control.json> --owner-authorized
```

`--owner-authorized` records an existing explicit instruction; it is never permission to invent a grant. A weekly grant supplies `id`, `registryId`, `mode:"weekly"`, `startsAt`, `expiresAt`, `formats:["text"]`, `maxSubmissions`, `maxPer24Hours`, `minimumHours`, `maxLatenessMinutes`, and explicit `allowUnknownModeration`. An exact-post grant instead uses `mode:"exact_post"`, `maxSubmissions:1` and adds `preparedId`, the content's `stableHash`, and exact `scheduledAt`. No grant example in this report is an active authorization.

A slot supplies `id`, `registryId`, `grantId`, `preparedId`, `scheduledAt`, `timeZone:"Asia/Bangkok"`. `claim` takes `destinationId` and `observation`: `observedAt`, actual `source`, `groupUrl`, `graphId`, `profileId`, verified `joined:true`, `textComposerObserved:true`, `rulesRead:true`, moderation state and notes. Never attest these without viewing the actual native UI. After checking the exact dispatch packet, use the existing authorized visible Facebook session to submit **once**, then record the response. No repeat owner approval is needed for an unchanged eligible operation already within its actual grant.

An outcome supplies `commandId`, `destinationId`, actual `state`, `observedAt`, `source`, `accountId`, `groupUrl`, notes and a real Group post `url` when published. It is not a remote command. Save that same receipt in the existing Groups Workspace; its unverified provenance is retained. On uncertainty reconcile the original UI/receipt before doing anything else. Controls supply `commandId`, `target` (`registry`, `grant`, `destination`), exact resource `id`, and `action` (`pause`, `resume`, `revoke`).

## Runtime limit and acceptance

**Prepared: yes. Durably scheduled under a future matching grant: supported locally. Interactive native submission: supported by the observed Facebook composer and existing authorized computer-use workflow. Unattended scheduled submission: not established or activated.**

The existing `server/src/connectors/browser-bridge.ts` explicitly reports `canPublish:false` and `canSchedule:false`. The running frozen AgentRunner has no supported callable executor for this personal-session Group composer. The new CLI truthfully returns `automaticSubmission:false`, `runtimeExecutor:"not_configured"`, `providerApi:false`; it does not register a misleading successful worker. A future unattended runtime would need an explicitly supported callable native executor and its own live proof. Development-time browser access and a successful interactive share do not prove that capability. Old hardcoded native-Group demo scripts were not run or reused. No private endpoint, cookie copying, security bypass or paid fallback was added.

The installed owner release, startup task and Page production processes were not restarted or repinned. This source/CLI addition is available in the workspace; it is not a claim that the frozen owner UI has gained a Group scheduling screen. No additional real Group publication was used as a test.

Validation: **93 isolated tests passed**: ten new original-text tests, 40 existing AgentRunner tests, 12 workflow-safety tests, 13 Group-domain tests and 18 native-action tests. The new tests cover restart persistence, exact revision/time binding, pending/uncertain reconciliation, cadence across grants, stale context/media rejection, overdue holds and concurrent claims charging once. Existing server-related suites received fresh disposable `SCC_DATA_DIR` values with `SCC_ISOLATED_TEST=true` and paused workers; none used the owner database.

`npm run typecheck:agent`, `npx tsc --noEmit`, `npm run build:client`, real `group-text-status` and `git diff --check` passed. The client build emitted the existing large-chunk advisory. No claim of full-suite or unattended live original-text acceptance is made. Final owner status remained ready at release `bfba4690a39bafae0c7ec8403efd8a0373dd9dbb`, backend PID 1464/proxy PID 26580, sync enabled, no global publishing hold. The first Group handoff still had exactly one receipt-history entry on final readback. No restart, release repin, Git commit/push, extra spending or second real Group submission was performed.
