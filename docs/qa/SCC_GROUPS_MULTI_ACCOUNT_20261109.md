# Groups multi-account browser isolation — 9 November 2026

**PASS: account-specific browser isolation and Developer native readiness. Gemini inside Antigravity rechecked the same SCC CLI successfully. No Developer Group publication was authorized or attempted.** World retains its working profile, process, port 9235, posts, receipts and accounting. No commit, push, restart of the owner runtime, paid fallback or new scheduling architecture was introduced.

## Corrected execution boundary

The original implementation stored one browser configuration and required `http://127.0.0.1:9235` in readiness proofs. It correctly refused Developer rather than using World's session. The correction retains the existing text preparation, exact grants, independent destination queue, native composer checks, duplicate fences, accounting and outcome/receipt workflow.

Browser bindings now live under `group-browser.accounts` in the existing `AgentStore`. The original `.data/agent/group-browser.json` is adopted without rewriting it. Per-account metadata retains account ID, persistent profile, reserved loopback endpoint, process ID and start time. Atomic store transactions allocate distinct unused ports; occupied ports are skipped. Profile/port assignments cannot silently move to another account. Current binding inventory:

| SCC Page | Account ID | Native profile / Graph ID | Persistent profile | Local endpoint | Verified PID |
| --- | --- | --- | --- | --- | --- |
| World / โลกจริงหลุดบท | `acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978` | `61595592674364` / `1428270437036294` | `.data/browser-profiles/acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978` | `127.0.0.1:9235` | 7756, unchanged |
| Developer / แก้บัคยาวๆๆ | `acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5` | `61563944843401` / `409347032254077` | `.data/browser-profiles/acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5` | `127.0.0.1:9236` | 29460 |

Developer's existing persistent profile was already authenticated. Fresh native UI links verified both its own native Page ID and Graph asset ID; no login request, cookie copying or automatic account switch was needed. Other accounts use the same reservation mechanism and their own normal sign-in when required. An initial login hold names the exact account rather than falling back to another Page. Existing numeric native identity requirements remain explicit; unknown aliases are not guessed from display names.

Before attachment, SCC validates the selected account's metadata, unique reserved port, IPv4-loopback listener ownership and actual Chrome command-line profile/debug flags. `withPage(accountId)` connects to that exact account. Readiness proofs carry account ID and the endpoint verified by the actual driver. Claim, continuation and dispatch-fence checks compare them with the same account's durable binding. A different account or wrong port fails before a charge. Supplying an explicit `--account` inconsistent with the authorized destination also fails. The account is selected from the saved authorized destination, never from whichever Chrome window happens to be active.

Browser leases are per account; existing unresolved legacy global leases remain respected. The one-click fence, exact revision/time binding, scope expiry, quota/cadence controls and uncertain-submission reconciliation are unchanged. Personal Chrome PID 14608 and Gemini Pipeline Chrome PID 2068 / port 9224 remained separate and untouched. No desktop-window selection or foreground automation was added.

## Native Developer membership evidence

`group-browser-groups` opens Facebook's native **Your Groups** control under the verified Developer identity, requires the joined-list heading, and reads Group links only from that list's main region. It does not open Chrome history, inspect cookies or infer membership from feed posts or recent-visit metadata.

The native listing reported **34 Groups**. The bounded capture observed **20 rendered entries**, marked **partial**. Those entries are membership-list observations, not 20 verified publishing destinations. The owner-requested minimal cross-account proof uses one relevant destination:

- **Antigravity Thailand**: https://www.facebook.com/groups/3912978409003324/
- SCC Group: `group-a6b055e7-9cbf-4537-a7ea-74e3658515b6`.
- Group text registry: `group-channel:64090e04fdd267e715cb9765192a0055`.
- Discovery: `group-discovery:7a4080df-a722-4d72-88ae-94d5d00862a6`.
- Fresh native inspection confirmed Joined, exact Developer identity and an empty original-text composer. No text or Post click occurred.
- Visible About/rules showed six numbered rules: no selling; stay on topic; no self-promotion, spam or unrelated links; no hate/bullying; remain polite; respect privacy. The visible snapshot is retained. Undisplayed material and global moderation are not claimed verified.

`group-browser-register` requires the same account's fresh discovery, then independently rechecks native identity, Joined, composer and visible About. It reuses the existing SCC Groups API and sidecar text registry. Existing Page/Group plans are not silently retargeted or rewritten. Browser observations retain their provenance separately from SCC's conservative owner-entered/unverified registry wrapper. The selected Group remains **`needs_review`**, `publishingPermission:owner_review_required`, `permissionVerified:false`; readiness does not grant publication authority.

**Developer has zero Group text grants, zero scheduled/claimed Group destinations and zero new Group publications.** No new draft, exact approval, weekly grant or native submission was manufactured to make a test pass. A specific prepared revision and matching exact/bounded authorization remain necessary before any actual post.

## Same CLI for Codex, Antigravity and other agents

```powershell
npm --silent run agent -- group-browser-list
npm --silent run agent -- group-browser-start --account ACCOUNT_ID
npm --silent run agent -- group-browser-status --account ACCOUNT_ID
npm --silent run agent -- group-browser-groups --account ACCOUNT_ID
npm --silent run agent -- group-browser-register --input <selected-native-group.json> --owner-authorized
npm --silent run agent -- group-browser-check --input <registered-group.json>
npm --silent run agent -- group-text-next --account ACCOUNT_ID
```

Registration input is `{accountId,discoveryId,groupUrl}` and records actual existing owner registration authority. Composer-check input is `{accountId,registryId}`. Native membership listing grants no permission to join a new Group, post, generate media or broaden a weekly scope. Existing `group-text-preflight`, `group-text-execute` and `group-text-reconcile-visible` use the same saved destination and dynamically select its authorized account binding. No agent implements its own Facebook posting logic. No new timer or startup worker was installed; the frozen Page publishing runtime was not repinned.

## Actual Gemini-in-Antigravity recheck

The authenticated installed `agy models` catalog listed the existing included Gemini model. The recheck explicitly selected **`gemini-3.8-flash-medium`**, with no fallback or metered API.

The first headless session, `76aa23eb-ed59-46a5-bb37-6478c3c4112e`, reached Gemini but its command permission was denied before SCC commands could execute. Its receipt and reported **22,941 total tokens** remain preserved; a zero exit/provider SUCCESS was not treated as a readiness PASS.

A second bounded session used a **session-only exact allow-list for the five requested SCC diagnostic commands**. It used no dangerous permission-skip flag and made no permanent Antigravity settings change. Conversation **`f65ad440-ad42-4c11-99a7-a0b7a18caa8c`** completed with **42,503 reported total tokens** and no denied actions. Gemini executed browser inventory, Developer browser status, Developer Group registry read, the empty-composer check and the Developer-only next-destination read. Its report returned **`passed_readiness`**, port **9236**, `publicationAuthorized:false`, `published:false`, `claimsCharged:0`.

The result was independently corroborated by SCC's native-check record, newly observed at **17:52:09 Bangkok**, naming profile `61563944843401`, Graph `409347032254077`, the exact Antigravity Thailand URL and a verified empty composer. The initial result parser encountered a progress sentence before the final JSON; the final JSON line was locally schema-validated and checked against the native SCC observation without another model call. Raw provider output, both usage receipts and the initial parse result remain retained. No prior Argon failure/session or reservation was changed.

## Validation and preservation

**122 isolated tests passed:** 35 existing/new account-browser and Group execution/native-UI tests, four native membership/registration tests, 40 AgentRunner tests, 12 workflow-safety tests, 13 Group-domain tests and 18 native-action tests. Account tests cover legacy World preservation, durable independent ports, occupied-port avoidance, wrong-profile/endpoint/foreign-process rejection, per-account leases, non-9235 execution, wrong-account failure before charge, native-list-only discovery and manual-login holds.

`npm run typecheck:agent`, `npx tsc --noEmit`, `npm run build:client` and `git diff --check` passed. The client build retained its existing large-chunk advisory. Browser fixtures blocked external requests and used separate temporary profiles; server regressions used isolated databases. No full-suite claim or live Developer publication PASS is made.

Read-only preservation assertions verified World's entire original discussion job, operation history and grant against the prior receipt evidence, with no changes. Both prior World Group posts retain exactly one receipt-history entry:

- [Existing Reel share](https://www.facebook.com/groups/2214946398974915/posts/2568461086956776/).
- [Original discussion](https://www.facebook.com/groups/2214946398974915/posts/2568574890278729/).

The owner runtime remained ready on release `bfba4690a39bafae0c7ec8403efd8a0373dd9dbb`, backend PID 1464 / proxy PID 26580, sync enabled, no global publishing hold. All three Page publishing streams retain their original grants and workers. Private process/profile, native membership, registration, preservation, model-session and test evidence is retained under `.data/groups-multi-account-20261109/`; no sensitive artifact is tracked or committed.
