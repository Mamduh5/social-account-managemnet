# SCC owner Video Review and publication readiness — 5 November 2026

**Locally active:** SCC backend/UI and the existing AgentRunner are pinned to `fc5acf11c224935aac4d13af7da580bfd45b57e1`. Open **Video Review** in SCC's navigation, or http://localhost:3001/?view=video-review. The real backlog remains five videos: one previously accepted ready draft and four review candidates. No new real owner acceptance, publication policy activation, publication, diagnostic video generation or Git push was performed.

## Owner workflow

Select Needs review, Approved / ready, Rejected / held, Published or All videos. Each imported Gemini item shows its actual intended Page/Graph identity, portrait player, original/moving-watermark selection, native audio controls and volume, editable caption/hashtags, existing branding choices, technical and listening/creative status, immutable master/variant identity, draft revision, source conversation, saved review history and current hold/error. Published state requires a saved confirmed API publication receipt; merely queued or uncertain work is not labeled published.

For creative acceptance, watch the exact moving-watermark candidate, listen to it, and explicitly check the two visual/listening confirmations before **Approve creative & audio**. The action binds the Page, original master hash, reviewed variant hash, caption and exact draft revision. Approval is not publication approval. The source files stay immutable.

**Reject video** records an owner rejection; **Needs changes** keeps the item held while preserving technical evidence. Notes/rejection reasons are supported. Caption edits use the existing draft's revision CAS, and an existing safe same-master branding variant can be selected. Use the existing Branding Studio to prepare a corrected moving-text variant with the exact Page name and required portrait safe areas. The changed revision requires a new review. Queued/published originals cannot be edited through this queue.

Decisions and edits have durable command IDs and append-only audit observations in the existing marked AgentStore. The browser retains an unconfirmed command across reloads. A lost caption response is reconciled by reading the original draft at the expected revision and content, without repeating its PUT. A definite rejected revision conflict permits reload and a new reviewed command; an uncertain original cannot be bypassed with another command ID.

Owner acceptance is saved before bounded independent verification. Exact source master/variant bytes are rehashed, full media decode/audio checks are reused, and decoded audio identity is verified. The existing candidate, moving watermark and draft are adopted without importing, rendering or drafting again. The UI normally completes this step immediately; the existing AgentRunner backlog callback resumes accepted-but-interrupted validation after restart. It does not invoke a model or provider to process QA. Native provider work remains separately protected.

Owner decisions use the existing production and publication leases together, so rejection/editing cannot race a protected future publication dispatch or release its lease. Creative acceptance cannot transfer to modified media or draft revisions. Rejected/held files and audit history are preserved and still occupy backlog capacity; no automatic regeneration is introduced.

## Publication policy preparation

The policy panel is **preview-only for activation**. It displays the exact Page and supports rolling-24-hour volume, minimum interval and optional expiry, with Reels-only/approved-content-only safeguards. It can save an explicitly disabled proposal or revoke an exact existing Page policy; it cannot authorize or enable a new recurring policy. Original pending/uncertain submissions retain their reconciliation requirement. Existing Publishing Center/history remains the publication and receipt workflow; analytics handoff stays independent.

The actual read-only default proposal (one post per rolling 24 hours, minimum 24 hours) reported:

| Existing video | Preview result |
| --- | --- |
| ฟองน้ำฮีโร่ | Owner QA ready; proposed publication cadence currently holds it |
| โดนัทล้อเดียว | Owner quality review required |
| ผ้าห่มของลูกกุญแจขี้หนาว | Owner quality review required |
| ตราปั๊มไม้กับดาวดวงแรก | Owner quality review required |
| บัวรดน้ำจิ๋วกับต้นอ่อนขี้เซา | Owner quality review required |

This was an ephemeral eligibility preview, not an owner-selected standing policy or a promise of future eligibility. **Active Page publication policies remain empty.** No disabled proposal was saved to the real owner state by this assignment; proposal persistence and revocation were exercised only in isolated fixtures.

## Source and tests

- `ff5c92bba1375cef7804696abc4385cecdf8a8f5`: owner review UI, review-only HTTP/CLI bridge, versioned decisions/edits, bounded immutable-media verification, existing-runner advancement, disabled policy previews, tests and operating documentation.
- `fc5acf11c224935aac4d13af7da580bfd45b57e1`: final publication-operation concurrency guard and regression. This is the actual running application/agent source.

Main paths: `client/src/views/VideoReviewView.tsx` and navigation in `App.tsx`; `server/src/routes/video-review.routes.ts` and `services/video-review.service.ts`; `scripts/agent/video-review.ts`; existing `production.ts`, `scc.ts`, media QA and publication-policy services. The backend bridge has a fixed review-only command allowlist, same-origin local access and the original sidecar path. There is no arbitrary CLI, generation, publishing approval/queue or policy-activation endpoint. No new database schema, content library, watermark engine, generation worker or scheduler was introduced.

Verification:

- Full isolated SCC run: **81 suites, 805 tests passed, zero failures**. An old calendar fixture had a fixed 5 November 10:00 slot that expired during the work; only that test's clock was frozen. Production scheduling behavior was not changed. After the final concurrency guard, **86 focused review/production/publication tests passed**.
- Agent/backend TypeScript checks and production client build passed. Existing bundle-size notices remain nonblocking. `git diff --check` passed.
- Native Flow/frozen regression: **two packages, 64 top-level tests, 302 passing test/subtest events, zero failures, three opt-in skips**. No native source or live Flow generation changed.
- Real browser fixture acceptance: **ten cases passed** through the actual review UI, HTTP routes, subprocess bridge, disposable AgentStore and copied original media. Cases include portrait playback/volume/original-variant switching, explicit fixture acceptance and persistence, rejection, needs changes, caption revision, disabled policy preview/save, mobile dark/light layouts, missing audio and preview failure. No page JavaScript errors or horizontal overflow were observed. These are fixture decisions, not real owner audiovisual acceptance.
- The Chrome connector was unavailable; the repository's Playwright dependency launched an isolated headless Chrome profile. It did not attach to Gemini/Flow profiles. No bot/security action was taken.
- Read-only browser acceptance on the **actual activated SCC** verified all five exact real identities and truthful states, successful playback, untouched acceptance checkboxes, disabled approval without acknowledgments, mobile layout and the actual policy preview above. All owner decision/edit/proposal/publication mutations were blocked in that validation context. No listening quality was inferred from playback mechanics.

## Actual activation, preservation and current state

The guarded existing owner controller activated the immutable release with the original owner database. Its backup passed integrity checking with zero foreign-key violations: `.data/owner-updates/activate-6Pxz16/owner-before-update.db`, SHA256 `5939ca7084e1fcda09b4a368c1ed9a8cda811749f41765dae3895d8a8b804876`. AgentStore also received a WAL-safe integrity-checked backup, SHA256 `71281a6b08dcb62e74328452cec5149c0dc826b439037dbce1fc9ac8735f1543`. Prior immutable releases, configuration/activation receipts and rollback capability remain available; no database copy was restored over owner data.

SCC is ready on source `fc5acf1`, backend PID **18408**, HTTPS proxy **15808**, with normal sync and current-user Startup enabled. Pipeline remains `d87948aa97f8834946207476e951c51f8e5d145a` (PID 3088, `--gemini-only`); its UI remains `44f15f97e1a3d3ff23013dcaeae4aa418c6d2c4a` (PID 19376). Both companion worktrees are clean.

Generation stayed enabled during development. The SCC runner was paused only briefly for the guarded backend/agent release switch while idle. Task `SCC-Agent-19497b34ee3f` was replaced by **`SCC-Agent-746b97f5fdbb`** on the same original `.data/agent/agent.db`, pinned to `fc5acf1`. The unrelated isolated validation task was preserved. Runner is enabled, unpaused and authorized with unchanged budgets/limits. Its normal **11:20 Bangkok** scheduled host completed with OS result 0 and no model launch. No competing scheduler or manual diagnostic generation trigger was added. Temporary browser fixtures were stopped and never registered for Startup.

That normal tick reports the **pre-existing `context_limit` on next-concept preparation**, also present in the before-task 10:20 snapshot. This preparation issue was not caused or repaired by the review feature; configured context/model/quota limits were preserved. Review readiness runs independently before model admission, and the five existing media are available in the new interface. Future concept-context remediation is a separate remaining engineering item, not a request for routine quota-window approval.

At final preservation checks around **11:19–11:22 Bangkok**, backlog remained **5/8**, **22,200,416 bytes**: sponge ready and four candidates awaiting genuine owner listening/final creative acceptance. All original master and watermark bytes were rehashed and matched. All five real draft IDs, revision-1 unapproved/unqueued states, captions and destination bindings were preserved. Prior owner QA hashes, saved publication receipts and all 51 pre-existing Gemini run histories matched their baseline. No new real owner acceptance was recorded by Codex.

Flow's full enabled/scheduler/projects/credit snapshot matched exactly (53 projects; paused; twelve authorized/twelve spent/zero reserved/zero remaining). No Flow prompt, image, model, default, continuity, scheduling or generation behavior changed. The unfinished original film and accepted Scene 1 were not replaced. Native Gemini scheduling stays disabled; the standing scoped controller remains enabled with its original grant. No active/uncertain provider submission was present at the final snapshot. Application ledgers were two of four for both global and pinned account; true remaining provider allowance is unknown. No counter reset/refund or security bypass occurred.

Remaining owner work is now available directly in SCC: watch/listen and decide on the four candidates. Publication requires separate future authority and remains disabled. The pre-existing concept context limit is separately recorded above. No Page/Group/TikTok publication, Git push or external deployment occurred. Unrelated QA working files were preserved.

Private evidence: `.data/agent/video-review-20261105/` contains full/focused/native test logs, isolated browser fixtures/screenshots and receipts, live read-only browser acceptance, exact media/draft/QA/publication preservation, backups, source/manifest verification, managed activation receipts and actual runner snapshots. Rollback uses the existing guarded owner/agent controls, retaining newer data and protected originals; never reset counters, restore an older database or replay an uncertain submission.
