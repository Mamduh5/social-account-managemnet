# Managed owner release updates and stale UI diagnosis

27 October 2026, Asia/Bangkok. **Diagnosis confirmed from files and process identity. No live deployment, stop, restart, build or browser test was performed by this investigation.**

## Confirmed cause

`npm run build:client` builds the working frontend into `client/dist` unless `SCC_CLIENT_BUILD_DIR` explicitly selects another output. `npm start`, `npm run owner:start` and `run_server.ps1` invoke the managed controller. That controller loads `.data/runtime/owner-config.json`, verifies the frozen release manifest, starts the frozen backend and supplies `SCC_CLIENT_DIST=config.clientDist`. The backend serves that directory. Restarting does not promote the working build.

Observed paths and revisions:

| Item | Verified value |
| --- | --- |
| Working checkout | `D:\Mamduh\Personal\social-account-managemnet` |
| Working HEAD | `bbfffb72996fcfe0405d8f525990a7a71f84a6c0` |
| Configured and recorded running release | `4c6fd0dd8fbd89020a419d2263bcc6baacf63b62` |
| `releaseRoot` | `D:\Mamduh\Personal\social-account-managemnet\.data\releases\4c6fd0dd8fbd89020a419d2263bcc6baacf63b62` |
| Configured `clientDist` | `D:\Mamduh\Personal\social-account-managemnet\.data\releases\4c6fd0dd8fbd89020a419d2263bcc6baacf63b62\client` |
| Working build | `D:\Mamduh\Personal\social-account-managemnet\client\dist` |
| Existing verified processes | Backend PID `2424`, proxy PID `8820`; creation timestamps and pinned entrypoints matched saved process identities |
| Frozen integrity | All **97** manifest files verified; no changed or unexpected file was accepted |

The frozen backend's committed source declares V1.12.0. This explains how the app can be V1.12 and still lack these later fixes. No HTTP health response was requested; revision evidence is configuration, state, manifest and matching live process identity.

| Artifact | Working `client/dist` | Configured frozen frontend |
| --- | --- | --- |
| JavaScript | `assets/index-DNOKT1h3.js`, 509,355 bytes | `assets/index-CEt-GSHz.js`, 508,065 bytes |
| CSS | `assets/index-DHC4wtJL.css`, 64,856 bytes | `assets/index-YGn65_w-.css`, 58,984 bytes |
| Cozy Light adaptive foregrounds | Present | Absent |
| Account form body/footer separation | Present | Absent; whole-form scroller remains |
| Analytics gutters/minimum width | Present | Absent |
| Exact reply identity matching | Present | Absent |

SHA256 evidence:

```text
working JS   07bb4de3537eb9e12bca84946fa647fe4f72b4efed9ca4f0c909c6662d8a1e8a
working CSS  51ccb9658ed889aa892b2fb75259f2fe8c804201783e37d4cf9be3410835cffd
frozen JS    9122b75717212fababcf253c9998d5a9f0aea50ead5e0fb90660e389be6f8065
frozen CSS   cbe754ce96678bb7c0a855e3ec2a5646c51a2bc71f9266646f14981ccf62f664
```

All four fixes are also present in working source. Static inspection of the built CSS confirms the light selector has higher specificity than its default Tailwind declaration, with the intended foreground variables and hover/media exceptions. Analytics sizing/gutters and the dynamic-viewport modal cap are compiled. The evidence supports a stale pinned bundle as the cause; it does not establish browser visual acceptance.

## Owner commands

First review and explicitly authorize a local Git checkpoint containing the intended application changes. The four UI fixes and update tooling are currently uncommitted. The owner's separate `client/package.json` and lockfile changes add a `social-account-managemnet: file:..` dependency/link; they were preserved and need an owner decision. The updater does not commit, stash, reset, install dependencies or silently omit dirty application inputs.

From the repository:

```powershell
npm run owner:update -- --check
```

This only reads configuration, Git metadata, manifest files and process identities. It does not build, contact HTTP, stop/start services or modify the pin. It reports dirty application inputs as a preparation blocker. Documentation/test-only changes may remain dirty because they are not runtime inputs.

After the approved checkpoint, prepare the exact source and matching frontend:

```powershell
npm run owner:update
```

Default behavior is preparation only. It captures client provenance, builds into a new private `.data/owner-updates/.../client-build` directory, invokes the established prepare-only packager, verifies the resulting immutable release against its exact Git source and manifest, and writes a candidate receipt. It leaves the active configuration and processes unchanged. An already prepared exact release is verified and reused without rebuilding or overwriting it.

After **separate owner approval for deployment/restart**, activate:

```powershell
npm run owner:update -- --apply
npm run owner:status
```

No manual `releaseRoot` edits, asset copying or preliminary stop command is required. `--revision <full-40-character-commit>` is optional when deliberately selecting a reviewed commit; working application inputs must match it exactly. The default is the reviewed, clean HEAD. Merely running `build:client` then restarting remains insufficient.

## Activation and rollback contract

Activation retains the existing exact-commit path and hash contract. It validates both complete releases and original owner configuration; refuses schema-source differences requiring separate maintenance; acquires update/maintenance exclusion; invokes the frozen controller's authenticated, idle-only stop; then verifies the stopped boundary and a new SQLite online-backup/integrity receipt. Protected manual holds and uncertain/overdue submission gates are checked without resetting jobs.

The configuration is rechecked for drift and atomically changed under the controller lock. Only `releaseRoot`, `releaseRevision` and `clientDist` may differ. The original `.data`, `.env`, provider configuration, Node executable and runtime paths remain unchanged. No credentials, cookies, OAuth/session settings, certificates, media or database are replaced. The previous configuration, backup and release remain available. An already enabled current-user Startup entry is refreshed to the new pinned controller; an absent/disabled entry stays disabled. Maintenance exclusion is released before managed startup, avoiding nested controller-lock deadlock. An originally stopped owner stays stopped.

Review the saved previous release without activation:

```powershell
npm run owner:rollback
```

After owner approval for rollback/restart:

```powershell
npm run owner:rollback -- --apply
npm run owner:status
```

Rollback verifies the saved receipt against the current configuration, verifies both immutable releases, requires unchanged database source, makes another backup and promotes the saved previous configuration. It **never restores an old database over newer observations**. Old releases and backups are not deleted.

A failure before promotion retains the original pin; if the managed stop completed and the exact configuration is unchanged, the original running owner may be restarted after exclusion is released. A failure after promotion retains the candidate and records rollback instructions rather than guessing at database restoration or forcing process termination. The last-update receipt is retained even when candidate startup fails. Missing/stale receipts, configuration drift, unknown process ownership, active maintenance, unsafe queues, integrity failures or schema changes stop the workflow. Stale locks require ownership review; the updater does not remove another operation's lock.

The legacy low-level packager remains available for documented preparation/initial setup. Do not use `--configure-owner` as an update shortcut: it is not the managed promotion transaction and cannot promote a directory it already prepared. Normal updates use the owner commands above.

## Implementation and offline verification

Files changed by this investigation:

- `package.json` — `owner:update` and `owner:rollback` commands.
- `scripts/owner-update.ts` — read-only diagnosis and explicit prepare/apply/rollback orchestration.
- `scripts/lib/owner-release-core.ts` — immutable manifest, exact configuration/provenance and schema guards.
- `scripts/lib/owner-release-prepare.ts` — exact committed source gate, isolated build and prepare-only packaging.
- `scripts/lib/owner-release-activation.ts` — injected, testable maintenance/promotion/failure ordering.
- `test/owner_release_core.test.ts`, `test/owner_release_prepare.test.ts`, `test/owner_release_activation.test.ts` — focused offline fixtures/mocks.
- `README.md` and this report — owner operation and corrected build/start instructions.

No prior UI fix, owner dependency change or publishing/backend workflow was edited by this investigation. Existing release files, runtime configuration and process state were only read.

Verification performed with installed dependencies:

```powershell
node --import tsx --test test/owner_release_core.test.ts test/owner_release_prepare.test.ts test/owner_release_activation.test.ts
node client/node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --strict --skipLibCheck scripts/owner-update.ts scripts/lib/owner-release-core.ts scripts/lib/owner-release-prepare.ts scripts/lib/owner-release-activation.ts
node --import tsx scripts/owner-update.ts --check
git diff --check
```

Results: **40/40 focused tests passed**; targeted tooling typecheck **passed**; read-only diagnostic **passed**, verifying 97 frozen files and correctly refusing dirty source as a preparation candidate; whitespace check **passed** apart from Git's LF/CRLF conversion advisories. Test build/lifecycle commands are injected mocks. The tests cover lock acquisition/partial-write/cleanup failures, ownership and retries as well as release provenance, configuration preservation and activation/rollback ordering. The tests do not start any server, browser, worker or provider call, or open the owner database.

The owner-facing `npm.cmd run owner:update -- --check` wrapper also passed. Before/after SHA256 comparisons confirmed `owner-config.json` and `owner-state.json` were unchanged; existing verified process IDs remained `2424` / `8820`.

The broader `node client/node_modules/typescript/bin/tsc -p tsconfig.operations.json --noEmit` check remains **failing with seven existing diagnostics in six untouched scripts**: `capture-inbox-reply-screenshot.ts`, `capture-owner-ui-evidence.ts`, `check-live-comments.ts`, `verify-db-final-state.ts`, `verify-remote-reply-header.ts`, and `verify-remote-reply.ts`. Their diffs are empty; these unrelated errors were not changed to make the release-tool checks pass.

Actual building/preparation/promotion, backup creation, Startup entry refresh, graceful restart and rollback have **not** been exercised against the owner. They require the approved checkpoint and maintenance authorization. **Source-level diagnosis and offline verification are complete; owner deployment and browser visual acceptance remain pending.** No Git commit/push, runtime stop/restart, deployment, provider request or public action occurred.
