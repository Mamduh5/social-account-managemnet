# V1.12 Social Content and Engagement Autopilot

27 October 2026, Asia/Bangkok. **Prepared source; owner upgrade and every live publication remain separate approval gates.**

The owner clarified during this assignment that Codex should prepare content directly. The creative operator is therefore **Codex**, using the existing local application APIs. No Antigravity/Gemini execution is claimed. No new model adapter, API key, paid provider or application generation request was introduced or used.

## Current owner runtime and preservation

Read-only `/api/health` verifies the owner is running **1.11.0**, frozen revision `7ed0860969885d96bd44c55f1ec33274e6d1b906`, on loopback 3001 with normal sync enabled and no publishing hold. Earlier V1.10 references in the rollout documents are historical observations. This assignment has not activated V1.12, migrated the owner database or restarted the backend/proxy. Its V1.12 changes need a separately authorized matched-release upgrade.

`scripts/inspect-v112-owner.ts` opens the original database read-only, performs bounded official Graph GETs and writes private evidence under `.data/v112-owner/`. Baseline/final comparisons preserve the release pointer, environment, provider configuration and request ledger, account credentials/identity/settings, identity aliases, existing posts/destinations, master/variant records and 82 referenced master/variant/thumbnail files. Stored image hashes also match actual bytes. Account/publication comparisons exclude only ordinary synchronization timestamps/status fields. Owner voice profiles and new draft/campaign rows are the explicitly authorized additions through supported APIs, not direct SQL writes.

The original three manual holds compare exactly: `dest-mvf5hdwf-19hi`, `dest-mvf5j24q-ub0y`, `dest-mvf5j24r-rw4x`. The queue remains **49 published, 9 failed, 3 awaiting_confirmation**, with no new scheduled or active destination. No retry, reset, cancellation or confirmation was applied to existing jobs. TikTok Personal authorization and history are preserved. No push, external deployment, public social action, reauthorization or upstream AI Video Pipeline change occurred.

## Two independent real Pages

Authenticated, read-only Graph `/me?fields=id,name` checks matched each saved Graph identity. Public profile IDs were not substituted for Graph IDs.

| Page | Internal account | Verified Graph ID | Observed authorization |
| --- | --- | --- | --- |
| แก้บัคยาวๆๆ | `acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5` | `409347032254077` | Connected; identity check passed; latest normal sync successful |
| โลกจริงหลุดบท | `acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978` | `1428270437036294` | Persisted state remains `limited`; identity check passed; latest normal sync successful |

Both currently expose granted Page publishing, scheduling, comment-read and reply capabilities. Those are authorization capabilities, not proof that V1.12 general publishing or replies passed live acceptance. Page B's limited-state warning remains visible; no reconnect or status rewrite was used to hide it.

Separate provisional Thai voice profiles were saved using the owner's stated purposes: development/testing for Page A and AI entertainment for Page B. They have no writing samples and do not claim learned owner voice. The running V1.11 profile format retains this distinction in tone and owner-supplied purpose facts. V1.12 additionally exposes explicit editorial-purpose/topic fields. Neither Page was enrolled in another Page's campaign.

## What V1.11 was reused

The existing calendar remains the campaign store and UI: 7/14/30-day plans, Page selection, proposed Bangkok times, draft revisions, campaign submission, batch approval, pause/resume and unified publication receipts. Existing general-post drafts, Reels/manual Publish Now, media library, branding renderer, durable publishing queue, restart/overdue holds, remote-ID reconciliation and analytics continue to provide the actual workflow. Content Assistant voice/review/audit records, Inbox comments and Groups registry/prepared-content records are reused.

No second dashboard, autonomous reply worker, cloud scheduler, replacement queue or embedded LLM integration was added. Existing loopback/same-origin access checks protect the new APIs; these are not public remote-agent endpoints.

## New external operator and approval behavior

- `GET /api/operator/pages/:id/context` supplies an allowlisted Page identity, provisional voice, safe branding, available media metadata, Page campaigns and drafting rules. It excludes tokens, local file paths and private pipeline metadata. Library presence does not assert media approval or visual understanding.
- `POST /api/operator/plans` accepts `{contextFingerprint, plan, operatorLabel?, operatorRunId?}`. `plan` uses the existing calendar schema and requires a stable `id`. Page/voice/branding changes reject stale context. Exact repeated imports reuse their saved campaign; changed payloads cannot reuse its ID. Import creates drafts and `awaiting_approval`, never approval or queue work. Operator provenance is self-declared and explicitly unverified by the application.
- Calendar **Import Prepared Plan** copies the selected Page brief and imports external JSON inside the existing studio. Manual plan creation requires owner-entered text instead of repeating manufactured development achievements. Page name/handle, complete captions and receipt provenance are visible for review.
- Calendar guards enforce its maximum count, date window and exactly one matching Page destination, including edits made through other screens. Campaign drafts cannot use standalone approve/queue APIs to evade batch scope. Exact reviewed-payload approval, branding binding and fail-closed selected-media behavior are covered by the final acceptance checks.

The existing `gemini_prepared` origin remains compatible with historical records; it does not establish a model inference. The actual owner content in this assignment uses `manual` origin and explicit Codex titles/provenance.

## Actual Codex-operated owner draft preparation

Codex read the existing account, voice, calendar and draft APIs, saved separate provisional voice profiles, then used `POST /api/publishing/drafts` for the first Page A test. The saved draft is:

- ID: `draft-0b2ae8dd-a4e6-4d57-9509-b2cdd142c58f`, revision **1**.
- Title: `[OWNER APPROVAL REQUIRED — CODEX PREPARED] V1.12 Page A text test`.
- Destination: **แก้บัคยาวๆๆ**, Graph `409347032254077`, no other account.
- Type/media: text only, no attachments.
- Schedule: **none**. Any immediate live publication requires separate exact approval.
- State: `draft`, `approvedRevision=null`, `queuedPostId=null`.

Exact proposed caption:

```text
โพสต์ทดสอบระบบ Social Command Center 🌱

กำลังทดสอบขั้นตอนเตรียมเนื้อหา ตรวจทาน และเผยแพร่ไปยังเพจที่เลือกอย่างถูกต้อง

โพสต์นี้เป็นข้อความทดสอบสำหรับเพจ แก้บัคยาวๆๆ
```

Exact hashtags: `#SocialCommandCenter #ทดสอบระบบ`.

Open the owner app at `http://127.0.0.1:3001`, then **Publishing → Post type: Facebook Page: Text-only**, and load the exact saved title. It is ready for owner review, not approved or sent. Page A's seven-day campaign deliberately awaits the separately approved test publication and its verified live receipt, as requested.

Page B has its own campaign `camp-v112-codex-page-b-concepts-20261027`, titled `[DRAFT ONLY — CODEX] โลกจริงหลุดบท: 7 creative concepts`. Its seven text concepts cover Object to Life, Screen to Life and real-world fantasy, clearly marked as imaginary AI concepts. Proposed times are **28 October–3 November 2026, 19:00 Bangkok**, held only in unapproved drafts. There are no queue destinations, published claims or selected/produced videos. These are creative caption concepts; video/media selection and creative acceptance remain owner work. No synthetic achievement, viewer experience or engagement statistic is claimed. Private preparation receipt: `.data/v112-owner/prepared-drafts.json`.

## Engagement assistant

The external reply-context endpoint binds the exact Page/Graph identity, voice revision, actual official-API comment, source post and available conversation. Untrusted comment text is treated as data and credentials are redacted. External or manual text imports become editable reply drafts, with edit/profile/context changes invalidating approval. Approve/reject remain owner actions.

Sending requires an exact approved revision and a separate explicit Send Reply confirmation. A durable comment-scoped intent is stored before network submission. A second draft, concurrent request or restart cannot blindly resend an uncertain outcome. A returned remote ID is saved before read-only verification; confirmation requires matching ID, Page author, parent comment and exact text. Missing IDs/uncertain sends remain held. Manual Facebook Inbox Send uses the same receipt protection, preserving its explicit owner action. No automatic-reply mode exists.

Live GET checks read the two most recent stored Page A publications and the sole stored Page B publication. Each returned HTTP 200 with an empty, complete comment list. This verifies those **three specific reads**, not a Page-wide comment search or a real reply-quality result. There are no persisted real `meta_graph_api` comments available for genuine reply drafting in this owner database; no commenter or conversation was invented. The grounded draft/edit/reject/receipt behavior is isolated-tested. Real comment quality and live reply publication remain pending an actual suitable comment and exact owner authorization.

## Manual Facebook Groups handoffs

The existing registry retains Group URLs, notes, membership declarations and rules. New immutable handoff context captures the intended source Page, Group/rules snapshot, relevance, existing media and an optional Bangkok reminder, using the existing workspace audit without a migration. Copy Caption, Open Group, media links and pending manual reminders stay inside the current Groups view.

Later Group-plan changes do not retarget old handoffs or receipts. Drift and unavailable source Pages are flagged. Recording a completed native post requires an explicit owner-entered Group permalink; it closes only that handoff's reminder and remains `receipt_recorded_unverified`. Group activity is not counted as confirmed API publication. No deprecated Groups permission, private API, automatic Group comment retrieval or mass-posting path was introduced. No real Group registry/handoff was invented for the owner; browser evidence uses isolated fixtures.

## Verification

All final source gates passed. Development tests use disposable databases, fake credentials and blocked provider transports. Fixture approvals are not live social authorization.

| Gate | Final result / private evidence |
| --- | --- |
| `npm test` | **284/284 PASS across 27 isolated files**, 0 failed/cancelled/skipped; `.data/v112-regression-final.log`, `.data/v112-test-summary.json` |
| `npx tsc --noEmit` | PASS; `.data/v112-server-types.log` |
| `npx tsc -p tsconfig.operations.json --noEmit` | PASS; `.data/v112-operations-types.log` |
| `npm run build:client` | PASS; `.data/v112-client-build.log`; existing Vite bundle-size advisory remains (about 508 kB minified), no build error |
| Isolated final-source browser | **16/16 PASS**; `.data/v112-acceptance/run-1793034804661/report.json`, seven inspected screenshots; separate client bundle and paused server on 3199, subsequently stopped |
| Actual owner draft browser observation | PASS: exact title/caption/hashtags, only Page A selected, no schedule, queue disabled; `.data/v112-owner/browser-receipt.json`, `first-test-draft.png`; every non-GET/external browser request blocked, none attempted |
| Read-only owner identity/preservation | PASS; `.data/v112-owner/baseline.json`, `final.json`; protected rows and publication/media/provider/config projections unchanged |
| `git diff --check` | PASS; only local line-ending conversion advisories |

Focused coverage includes calendar **22/22**, general posts **17/17**, reply drafts **8/8**, Group handoffs **3/3**, operator workspace **3/3**, and Facebook comment failure honesty **3/3**. Full regression includes the two incoming reauthorization files unchanged in the working tree; they remain outside this assignment's local checkpoint.

The final browser run covers independent Page briefs/7- and 30-day draft imports, wrong-Page and missing/stale review hash rejection, exact campaign review/fixture scheduling/pause, edited approval invalidation, grounded reply approval/edit/rejection without sending, Group rules/relevance/caption-copy/media/reminders/drift/unverified receipts, manual Publish Now availability, restart persistence and exact fixture holds. It records **zero model calls, reply sends, provider transport attempts, external browser requests and browser exceptions**. Isolated service tests separately exercise exact API receipt matching, uncertain sends/IDs, concurrent/restarted duplicate refusal, overdue holds and missing selected media. There is no new live publication or live reply receipt to claim.

## Remaining live gates and offline operation

1. Review/approve the exact first Page A text action above. No live publication is authorized yet. A successful remote ID alone is insufficient: the existing publisher must verify the exact Page and published receipt/permalink; owner public review remains separate.
2. After a verified test result, prepare Page A's seven-day campaign for a fresh complete review. Page B's creative concepts stay independent and unapproved; attach/approve suitable media if converting them to Reels.
3. Separately authorize a matched V1.12 owner release upgrade. No new schema migration is needed by these extensions, but the existing calendar/workspace prerequisites and managed backup/startup procedure still apply. Never replace the owner database with a review copy.
4. Collect real grounded reply-quality evidence before any consideration of automatic replies. Group actions always require native owner publication and truthful manual receipt labeling.

Scheduled publishing depends on this PC, backend and local queue being online. There is no cloud dispatch while it is off. Interrupted/uncertain/overdue work is held for review at managed startup; resume does not flood overdue posts. Do not run `npm run dev` against the owner database to activate source changes; use the frozen-release maintenance procedure after upgrade approval.

The incoming changes to `connections.service.ts` and `facebook_reauthorization.test.ts` were preserved and excluded from V1.12 ownership. Local commits are permitted only for verified V1.12 work; nothing is pushed.
