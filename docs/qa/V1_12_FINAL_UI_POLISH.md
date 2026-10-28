# V1.12 final UI polish

28 October 2026. Source patch on `502f411c50c2f48b483b82e7ca4c21941042f443`.
**Ready for owner checkpoint. Not committed or deployed.** The running immutable
owner release was not changed, stopped or restarted.

## Groups empty search

The view previously rendered only selector options and had no empty feedback.
The hook knew only the filtered result, so an empty active/search result could
not distinguish an empty registry from saved or archived Groups.

- Show `No matching Groups` with an explanation of the search/filter result and
  a native keyboard-accessible `Clear Filters` button.
- Show `No Groups registered yet` and registration guidance when the unfiltered
  registry is also empty. An extra read-only list request is needed only when
  the filtered list is empty. Existing request-generation guards still apply.
- Clear all filters, including archive status. `All Groups` represents that
  unfiltered archive choice; initial entry still defaults to active Groups.
- Keep the selected Group (even outside the result), unsaved registry fields,
  new-Group form and handoff draft. Clearing filters never saves or resets them.
- Avoid announcing an empty registry while loading or when requests fail.
- Use existing theme-aware surfaces/text and a status region; no CSS/theme
  redesign or backend/API/schema change.

## Category dialog accessibility

CreateCategoryModal used a standalone overlay with no dialog semantics, initial
focus, background exclusion, Tab containment or restoration. The shared Modal
had dialog markup and Escape handling, but no focus management.

- Reuse Modal with a unique accessible title, `role="dialog"` and
  `aria-modal="true"`. Associate the category labels with their inputs.
- Opt this caller into focus management: focus Category Name on opening,
  contain Tab/Shift+Tab and focus attempts, and make background sibling branches
  inert while open. Restore their prior inert state and the original trigger's
  focus on closing when the trigger is still available.
- Keep listener setup stable while controlled form fields rerender; remove it
  on close/unmount. A removed trigger is handled without focusing a detached
  element. Other modal callers do not opt into the new focus behavior.
- Allow Escape, Cancel and the standard close button when safe. During an
  awaited submission, disable dismiss/submit controls and ignore Escape until
  the existing parent submit callback completes. Retain native required-name
  validation, submitted payload, error-retained values and parent close logic.
- Reuse the shared bounded scrolling layout for smaller viewports.

## Exact patch inventory

1. `client/src/hooks/useGroupsWorkspace.ts`
2. `client/src/views/GroupsWorkspaceView.tsx`
3. `client/src/components/common/Modal.tsx`
4. `client/src/components/accounts/CreateCategoryModal.tsx`
5. `test/groups_selection.test.ts`
6. `test/category_modal.test.ts` (new)
7. `docs/qa/V1_12_FINAL_UI_POLISH.md` (this report)

## Verification

All **68/68** selected tests passed, with zero final failures, skips or
cancellations. There are **13 new regression tests**.

| Suite | Passed | New coverage |
| --- | ---: | --- |
| groups_selection | 21/21 | Five actual-component cases: empty registry, all-filter keyboard reset with selected/unsaved content, new unsaved form, archived-only registry, loading/error feedback |
| category_modal | 8/8 | Actual keyboard focus/semantics, rerenders, both Tab directions, inert background, repeated Escape/Cancel/close, native validation and submission, pending submit, error-retained fields, removed trigger, external close and unmount cleanup |
| connect_account_modal | 3/3 | Existing shared-modal form, scroll/footer and saving-state checks |
| groups_domain | 13/13 | Existing identity, readiness and receipt rules |
| groups_external | 20/20 | Existing service/history/identity/receipt preservation |
| groups_handoffs | 3/3 | Existing manual handoff contracts |

The component suites bundle the real React components in memory (`write:false`)
and run native keyboard interactions in a disposable headless Edge process.
Every request is blocked, APIs are mocked, and page errors/outbound requests
are asserted empty. They start no application/server/listener. Backend suites
each used a separate disposable `SCC_DATA_DIR` under `.data/test-runs`, with
`SCC_SEED_DEMOS=false` and `SCC_ISOLATED_TEST=true`.

Commands from the project root, with the isolation variables set per suite:

```powershell
node --import tsx --test test/groups_selection.test.ts
node --import tsx --test test/category_modal.test.ts test/connect_account_modal.test.ts
node --import tsx --test test/groups_domain.test.ts
node --import tsx --test test/groups_external.test.ts
node --import tsx --test test/groups_handoffs.test.ts
node client/node_modules/typescript/bin/tsc --noEmit --incremental false -p client/tsconfig.app.json
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --types node --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --esModuleInterop test/category_modal.test.ts test/groups_selection.test.ts
git diff --check
```

Client and focused test no-emit typechecks passed. `git diff --check` passed.
The first Groups test run had two exact-label locator failures; switching the
new tests to accessible combobox names resolved them. The first ad hoc strict
test typecheck omitted Node types; the explicit `--types node` invocation above
passed. Neither required production/runtime changes or dependency installation.

## Later browser acceptance and boundaries

The keyboard checks are component behavior evidence, not full visual or
screen-reader acceptance. After a separately approved checkpoint/release:

1. Check both empty states, Clear Filters and preservation of existing and new
   unsaved forms in Warm Dark and Cozy Light at desktop and narrow widths.
2. Check the category dialog's bounded scrolling, footer/button reachability,
   focus outline/contrast, Escape and focus restoration in the actual app.
3. Check assistive-technology announcement of the status region/dialog, native
   color-picker interaction and physical mobile behavior. No broader
   accessibility or nested-modal guarantee is claimed by this focused patch.

No production account/category/Group writes, database/schema changes, migration,
Facebook actions, publishing, AI Video Pipeline work, server restart, rebuild,
release update, commit or push was performed. Existing F4 compatibility and
baseline operations diagnostics are outside this patch.
