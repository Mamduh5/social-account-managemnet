# Groups V1 shared native execution — 9 November 2026

**Later multi-account correction:** [Developer/World isolation and Gemini recheck](SCC_GROUPS_MULTI_ACCOUNT_20261109.md) supersedes this report's original single-account port/configuration limitation. World remains on 9235; Developer has a distinct authenticated profile on 9236. Readiness and leases now bind the authorized account to its own endpoint. The original World publication evidence below remains unchanged. Developer's native Group readiness passed without a new post or grant.

**The original World discussion is PUBLISHED:** [actual Group post](https://www.facebook.com/groups/2214946398974915/posts/2568574890278729/). The owner personally confirmed that the earlier attempt never clicked Post, then explicitly authorized one bounded continuation. The shared dedicated-browser executor performed one native dispatch; read-only reconciliation verified the receipt and saved it in SCC. The original grant, input/schedule and one charge are unchanged. No new grant, refund, counter reset, Group expansion, scheduler, paid service, release repin or Git push occurred. Autonomous Items 1–4 remain closed; existing three-Page production continues.

Native dispatch: **16:34:44.840 Bangkok**. Facebook displayed creation time **16:34**. Published receipt observed and saved: **16:39:12.042 Bangkok**. SCC handoff status is `receipt_recorded_unverified`, with one receipt-history entry and `publicationVerified:false`; this is native-browser verification, not a Groups API result.

## Original claim and recovery decision

Original prepared handoff: `gprep-3d136bd8-3f1a-4d14-bfd4-b1808a67851c`. Original destination: `group-text:dest-world-orig-text-20261109`. Exact grant: `group-grant:grant-world-orig-text-20261109`.

The original database shows one charge at **15:21:47 Bangkok**, phase `submission_started`, no outcomes and a pending `native_submit` operation. Its exact slot is **15:21:44.632 Bangkok**, with **15 minutes** maximum lateness. Its unchanged grant expires **10 November at 15:21:38.632 Bangkok**. The later `.data/group-original-text-20261109/grant.json` contains different proposed times; it is not the immutable saved grant and was not used to renew it.

The saved claim asserts native Joined/composer/rules observations. Antigravity's worker report subsequently explicitly calls that payload synthetic/unobserved and identifies the ordering error. The saved isolation check at **15:41:03 Bangkok** says isolation failed and no dedicated browser existed. The current one-off script is a later revision, not immutable proof of every action of the original attempt. These reports support a **reported pre-dispatch stop**, but do not establish a complete contemporaneous zero-dispatch trace for the period after the claim. A missing receipt also does not prove that nothing was submitted.

Initial decision: **do not certify `not_dispatched`, refund, rearm or replay from the worker report alone**. A durable `scc_local_execution_audit` observation invalidated the earlier readiness attestation as proof, recorded the evidence hashes and placed a reconciliation-hold annotation on the original destination. Its original input/hash, pending operation, phase, submission count and grant/charge were preserved while the required owner clarification was pending.

The supported `group-text-reconcile-before-dispatch` command records a reviewed complete executor trace or explicit owner confirmation of zero remote dispatch. It requires actual owner-backed authority and an evidence SHA-256. It appends the conclusion and moves the destination to `stopped_before_dispatch`, retaining its original intent, duplicate fence and charge. **It does not make the operation eligible again, renew a grant, change the exact time or refund a submission.** It rejects an existing managed dispatch fence or recorded outcome. This transition was tested on isolated records, then applied only after the owner's personal zero-Post confirmation.

The owner replied: **“I personally confirm no Post click; authorize that one continuation now.”** The decision was saved at **16:29:53 Bangkok**, with a conservative fixed continuation endpoint of **16:54:23**, inside the owner's next-30-minutes authorization. `group-text-authorize-continuation` records this one immutable time amendment on the same proven non-dispatched original. It binds the same prepared ID, text hash, Group, Page, original input hash and original operation request hash, under the original unexpired one-post grant. It cannot exceed 30 minutes, change content or be renewed. The managed continuation retains `submissions:1`, the original charge/time and original scheduled intent; it does not create another grant or claim charge. A separate `nativeDispatchAt` records the actual click time for subsequent cadence checks.

The original `native_submit` request hash and complete original grant record were verified unchanged after publication. Only the original intent's outcome/status evolved through uncertainty to the actual published result. This was a specifically authorized continuation, not a silent extension of an overdue slot.

## Dedicated SCC browser

The existing Browser Bridge already uses installed Playwright and per-account persistent Chrome directories. The new CLI transport reuses that convention:

- Profile: `.data/browser-profiles/acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978`.
- Debug endpoint: **`http://127.0.0.1:9235`**, verified listening only on IPv4 loopback, owned by dedicated Chrome PID **7756** during acceptance.
- Distinct from personal Chrome PID **14608** and Gemini Pipeline Chrome PID **2068**, port **9224**. No input, navigation, account switching or cookie access/copying occurred in those instances.
- Chrome starts with a non-default `--user-data-dir`; connection checks the listener owner and Chrome's actual command-line profile/debug flags before controlling any page. Exactly one dedicated working tab is required. Existing occupied ports/profiles are not taken over.
- The owner signed in normally and selected World manually. No password/OTP input, profile import, automatic account switch, security bypass or paid dependency was added. Authentication persists through ordinary Chrome profile storage; future validity remains Facebook's decision.

Fresh `group-browser-check` at **16:08:47 Bangkok**, repeated successfully at **16:24:23 Bangkok**, verified the exact [AI short-film Group](https://www.facebook.com/groups/2214946398974915/), visible Joined state and an empty native original-post composer. The composer exposed `profile.php?id=61595592674364`; its native Business Suite reference also identified Graph Page `1428270437036294`, matching World / โลกจริงหลุดบท. The checks entered no text, clicked no Post control and closed the empty composer. This is live readiness proof, **not** original-text publication or a universal moderation exemption. General moderation remains unknown.

Supported transport references: [Playwright `connectOverCDP`](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp) supports Chromium connections, with lower fidelity than Playwright's own protocol; [Chrome's debugging changes](https://developer.chrome.com/blog/remote-debugging-port) require a non-default data directory for modern Chrome debugging. Actual attachment, profile/process binding and native UI were verified here rather than inferred from those documents. CDP itself grants no Facebook posting permission.

## One execution boundary for every caller

`scripts/agent/group-browser.ts` manages only the dedicated transport. `group-native-ui.ts` contains the single native text-post workflow. `group-text-execution.ts` connects that workflow to existing Group destinations, immutable grants, `AgentStore` operations, browser leases and SCC receipts. No agent-specific Windows coordinates, foreground-window selection, model call, private Meta endpoint or new timer is involved.

```powershell
npm --silent run agent -- group-text-status
npm --silent run agent -- group-text-next
npm --silent run agent -- group-browser-start --input <registry.json>
npm --silent run agent -- group-browser-status
npm --silent run agent -- group-browser-check --input <registry.json>
npm --silent run agent -- group-text-preflight --input <destination.json>
npm --silent run agent -- group-text-execute --input <destination.json>
npm --silent run agent -- group-text-reconcile-visible --input <destination.json>
```

`registry.json` contains `{"registryId":"group-channel:01469297b59e21b9b9cf02803898c461"}`. `destination.json` contains `{"destinationId":"group-text:dest-world-orig-text-20261109"}` for this original. Every caller receives the same compact SCC JSON contract; neither Codex nor Antigravity implements its own Post logic. The original was correctly refused while unreconciled. It became eligible only through the explicit owner-confirmed continuation, and is now terminal `published`. The CLI invocation itself supplies no missing authorization. Actual live execution from an Antigravity session was not repeated; the common boundary and concurrent-caller isolation were tested without another model session.

Administrative recovery commands are `group-text-reconcile-before-dispatch` and `group-text-authorize-continuation`, both with an explicit audited `--input` and `--owner-authorized`. The latter requires `commandId`, `destinationId`, original `preparedId`/`contentHash`, `authorizedAt`, `expiresAt`, owner-decision `evidenceSha256` and notes. These are not routine retry commands. Generic Resume, a new CLI invocation, a copied report or an expired window cannot create this authority.

For eligible future work the ordering is:

1. Read the existing destination/grant and current exact SCC Page/rules/prepared-text context; retain cadence, expiry, holds and overdue protections.
2. Acquire the existing store's durable dedicated-browser lease. Connect only to the pinned profile/process. Confirm normal sign-in, exact Group, Joined state, native composer Page ID and supported editor. Never match only a display name or switch identities automatically.
3. Prepare the exact authorized text and verify its rendered contents and enabled Post control. Browser/login/isolation/unsupported-composer failures here cause **zero claims and zero charges**.
4. Atomically claim the original once with fresh managed readiness. Standalone `group-text-claim` is disabled; agents cannot charge from a fabricated CLI observation alone. Custom/test agent stores and alternate SCC origins cannot invoke the owner's dedicated browser.
5. Recheck the composer and current exact SCC revision. Immediately before persisting the separate `native_ui_dispatch` fence, atomically recheck owner holds, lease ownership, the original grant window, exact-slot lateness and fresh readiness. Concurrent calls cannot dispatch twice. A crash or exception after that fence is uncertain until reconciled; no automatic retry. A managed failure before the fence records `stopped_before_dispatch`, retaining its charge and original operation.
6. Observe published, pending moderation, restricted or uncertain native results. Publication requires the original text, acting Page link and a unique exact-Group post permalink. The pre-click editor remains exact; receipt/duplicate matching alone permits Facebook's public rendering to collapse empty-paragraph spacing. Pending/restricted notices are read from native feedback rather than arbitrary feed posts. Keep the working tab available for reconciliation.
7. Append the actual outcome. Save a published URL through the existing SCC receipt endpoint with truthful browser-observation notes. A receipt-save timeout keeps the observed publication and durable uncertain receipt-save intent; it never repeats Post. Pending moderation stays charged and is not a retry trigger.

The caller may use `group-text-reconcile-visible` to inspect the existing dedicated tab without navigation, text preparation or Post. It appends the actual known receipt and updates the uncertain original dispatch without replay. Existing `group-text-record` also remains available for actual later owner/browser observations. Group holds remain independent of Page grants, queue workers, media and generation accounting. This is an agent-independent **invokable** executor; no unattended polling task or Facebook-native schedule was installed. The general Browser Bridge connector and frozen owner UI retain their existing capabilities; they were not repinned or represented as a Groups API connector.

The first live check after the one Post action returned `uncertain`: Facebook's feed rendered one line break where the exact editor had an empty paragraph. The uncertainty and original dispatch were retained. The public-display matcher was corrected without loosening pre-click text approval, and the same visible tab then yielded the original text, World author link and unique Group receipt. `group-text-reconcile-visible` saved the result without another Post click. Outcome history retains **uncertain → published**; the grant still has **one charge**, destination **one submission**, and there is exactly **one native dispatch fence**.

## Validation and actual publication

The new Group tests cover raw-claim rejection, readiness failures without charges, concurrent callers, one-click ordering, managed pre-dispatch stops, uncertain click responses, moderation and receipt failure. Isolated browser fixtures block external requests and exercise nested dialogs, exact profile identity, multiline text, one native-style click and resulting receipt/pending feedback. These fixtures are not Facebook publication proof. Existing AgentRunner, workflow-safety and Group control regressions were run separately with isolated databases.

**110 tests passed:** 23 Group workflow/execution/recovery tests, four isolated browser-adapter tests, 40 existing AgentRunner tests, 12 workflow-safety tests, 13 Group-domain tests and 18 native-action tests. Agent and application type checking, client build and `git diff --check` passed; the build retained its existing large-chunk advisory. This includes explicit continuation bounds, original grant/charge preservation, collapsed public spacing and read-only uncertainty reconciliation. No full-suite claim is made. The original-text publication is separately live-verified by its actual native receipt above. Final owner runtime stayed ready on release `bfba4690a39bafae0c7ec8403efd8a0373dd9dbb`, backend PID 1464/proxy PID 26580, sync enabled and no global publishing hold. Personal/Gemini browser process IDs also remained unchanged. No owner runtime restart or source release activation occurred.

Automatic approval review rejected an optional live duplicate-prevention check that would re-invoke the executor on the published original, because it could risk a second public post. It was not retried or bypassed. Read-only final ledger/receipt assertions and isolated duplicate tests supplied the verification instead; no new owner permission or further publication is needed.

Private evidence is in `.data/group-agent-independent-20261109/`, including original immutable records, hashed audit inputs, actual native empty-composer observation, successful CLI browser check, held original execution, process/profile status and validation logs. The prior Reel share receipt and all prior private artifacts remain intact.

**Completed:** the owner-confirmed premature claim was safely reconciled; the exact original was continued within fresh explicit timing authority, submitted once through the common dedicated-browser interface, and its actual Group receipt saved. No further submission of this original is authorized. Future different posts retain their own exact or bounded weekly authority, current native permission checks and original controls. General Group-wide moderation policy remains unknown; this one publication is not a universal approval exemption.
