# Pilot 01 Rai image preparation correction

This records the initial `35ef8dd` checkpoint. The later owner-authorized time review, 14,813-byte context, actual included-model output and exact stopped-result recovery are documented in [the operational stabilization report](SCC_OPERATIONAL_STABILIZATION_20261113.md). Its private `completion.json` records final live adoption and activated release; the original missed-time hold below is historical.

13 November 2026, Asia/Bangkok. Scope: the existing plan `week-0f7984fb-be0d-4c34-bc7e-935d879f5c45`, slot `slot-rai-promptpay-01`. Engineering and supported local activation are authorized; image generation, new grants, publication, quota changes, spending and Git push are excluded.

## Diagnosis

The original CLI handoff is `weekly-preparation:af104eda61bd6121d992135df3504d57`; its immutable input names task `weekly-content-af104eda61bd6121d992135df3504d57`. The job exists with empty state, but the task does not exist. The original enqueue saved its intent before PageContent admission failed. There is no completed text/imagery preparation to adopt or fabricate.

Even with optional cached research and previous-post excerpts omitted, the original PageContent payload is 13,265 UTF-8 bytes: request 6,730, weekly evidence/context 2,722, Page context 2,462 and editorial context 1,021, plus envelope fields. Generic instructions add 3,274 bytes and the old enqueue estimate adds another 1,000: 17,539 bytes against the unchanged 16,000-byte input cap. The old runner also appended separate weekly instructions. Thai character counts do not equal UTF-8 byte counts.

`weekly-image-review` combined absent-task and wrong-account checks under `Original weekly task identity differs`. Here the problem is the missing task, not evidence of an account mismatch. It now identifies the unqueued original handoff; genuine identity mismatches still fail closed.

## Compatible correction

- Weekly Page tasks use one concise closed-evidence preparation contract, rather than generic live-research/creator-discovery instructions plus a weekly suffix. It retains factual uncertainty, owner attestation, original source dates, privacy, Page/persona rules, imagery requirements and separate authorization/review boundaries.
- Weekly preparation does not load unrelated optional cache/history excerpts. The complete selected request, editorial rules, Page identity/voice/rules and weekly evidence remain unchanged. Historical tasks are not rewritten; result validation and duplicate-content checks remain in place.
- Enqueue and AgentRunner serialize the same task envelope and measure its actual UTF-8 bytes. Inputs above the existing cap remain blocked before executor detection, claims or charges. Configuration, output limits, providers, grants and counters are unchanged.
- An unqueued handoff can reuse its original deterministic task ID. A missing historical noncanonical ID cannot silently become a replacement task. Existing prepared, active, uncertain and recovery-held originals retain their protections.

## Verification and live boundary

The exact original handoff was replayed only in an online-backed-up isolated sidecar, using a clearly fixed pre-deadline clock of `2026-11-13T02:56:00Z`. It admitted at **15,946 / 16,000 bytes**, with unchanged job input hash, task ID, reviewed brief, editorial rules and evidence. No model was called and no result or image was fabricated for this replay.

Focused isolated agent, PageContent/images, runner, Antigravity wrapper/model selection, scheduling and release-safety suites: **157/157 passed**. Agent and backend typechecks passed. Regression coverage includes one invocation across restart, no duplicate task/grant, immutable provenance, irreducible contexts, missing historical identities and zero-charge holds. The full repository workflow and managed release results are recorded in the completion report/private evidence.

The original scheduled time was **13 November 2026, 10:00 Bangkok** (`2026-11-13T03:00:00Z`). It elapsed during investigation. A second isolated replay with the current clock correctly returned `Missed weekly preparation slot requires owner review; no catch-up`, made zero HTTP calls, left the job unchanged and created no task. The live original remains untouched and cannot yet reach image authorization. Owner review of that missed slot is required through the existing operating rules; this correction adds no rescheduling, successor-grant or catch-up mechanism.

Private evidence: `.data/rai-pilot-fix-20261113/`, including the original sidecar backup, isolated copies, exact replay proof, test logs and hash-only preservation snapshots. The live plan, reviewed PromptPay concept and owner-attested BOT provenance have not been revised. This is engineering validation, not independent verification of the supplied statistics, creative acceptance or live-provider acceptance.
