# V1.12 offline UI/UX fixes

27 October 2026, Asia/Bangkok. **Source-level verification completed; browser visual acceptance pending.**

All four requested patches are implemented. Git was clean before work. The application and AI Video Pipeline were not launched or contacted. No development server, Docker container, Playwright session, browser, localhost request, provider request or automation was started. No owner database, publishing workflow, account workflow, scheduler or backend code was changed. No dependencies were installed, full build/full regression suite run, or commit/push made.

## Causes and changes

| Defect | Confirmed source cause | Fix |
| --- | --- | --- |
| Cozy Light contrast | `index.css` changed surface/body variables, but `themeTokens` and components explicitly set pale slate and accent Tailwind text colors. Those declarations override inherited body text in both themes. Several neutral controls also turn white on hover. | Extend the existing `.light` / `data-theme="light"` switch with light-scoped, text-only utility mappings to CSS foreground variables. Keep the default dark declarations and background/border palettes. Add explicit light hover colors to neutral controls, readable placeholders/disabled opacity, and a light selection color. Preserve solid-button white, dark text on honey buttons, and media colors. A narrowly applied `media-surface` keeps the fixed dark preview frame's guide text readable in Cozy Light while retaining its original Midnight Dark color; the separate SHA metadata strip uses a light surface in Cozy Light. |
| Account modal actions | The actions were inside the form's `max-h-[70vh] overflow-y-auto` area. The shared modal added padding/header/margins without bounding the complete card to the viewport. | Add an opt-in `scrollBody` modal layout with viewport height bounds (`vh` fallback, `dvh` support). Keep one native form; only its fields scroll. The wrapping, nonshrinking footer retains Cancel and Save. Existing handlers, required inputs, loading conditions, Escape/backdrop behavior and labels are preserved. Other modals retain their default layout. |
| Analytics collision | The eight-column performance table used auto sizing without horizontal cell gutters or a minimum width. Right-aligned Shares directly abutted the left-aligned Provenance heading, especially when compressed. | Add consistent cell gutters, a 960px table minimum and 180px provenance-column minimum inside a contained horizontal scroller. Let account/platform and provenance labels wrap. Calculations, data, timestamps, tooltips and actions are unchanged. Narrow viewports intentionally scroll the table horizontally. |
| Duplicate replies | `CommentItem` independently rendered the parent's saved `reply_text` receipt and the same remote reply in `replies`. `useInbox` replaces fetched comments and reloads after send; it does not append optimistic reply copies. `inbox.repo.ts` stores the parent receipt separately from synced child rows. | Match the saved receipt to a nested reply by remote ID, account, platform and parent. When that exact reply arrives, render its nested content once and retain the “Replied by” marker there. Keep the immediate saved receipt until a matching child exists. Preserve ordering, timestamps, counts, status and composer behavior. Distinct identical-text replies are retained. Backend/API contracts are unchanged. |

The reply trace reviewed `client/src/hooks/useInbox.ts`, `client/src/api/client.ts`, `server/src/repositories/inbox.repo.ts`, `server/src/services/sync.service.ts` and the saved-receipt path in `server/src/services/reply-drafts.service.ts`. These files were not modified.

## Exact modified files

Application source:

- `client/src/index.css` — existing-theme text mappings, state colors and dark-media foreground scope.
- `client/src/App.tsx` — light hover and selection colors.
- `client/src/components/accounts/ConnectAccountModal.tsx` — scrolling body and persistent footer.
- `client/src/components/common/Modal.tsx` — opt-in bounded layout and light close-button hover.
- `client/src/components/inbox/CommentItem.tsx` — exact-identity receipt rendering and adaptive explanatory text.
- `client/src/components/publishing/VideoLibraryGrid.tsx` — two neutral-control light hover colors only.
- `client/src/views/ActivityView.tsx` — neutral-control light hover.
- `client/src/views/AnalyticsView.tsx` — performance-table layout, neutral-control light hover and adaptive explanatory text.
- `client/src/views/BrandingStudioView.tsx` — preserve dark preview label contrast; light metadata/control surfaces only.
- `client/src/views/CalendarView.tsx` — receipt-link light hover only.
- `client/src/views/InboxView.tsx` — neutral-control light hover.

New focused tests:

- `test/connect_account_modal.test.ts` — 3 React server-rendering tests: form/footer containment, required fields, saving/edit/error labels and closed state.
- `test/inbox_reply_rendering.test.ts` — 4 React server-rendering tests: receipt before/after sync, distinct same-text replies/order, identity guards and submitting/composer state.
- `test/theme_contrast.test.ts` — 5 in-memory Tailwind/contrast tests: light neutral and tinted text, hover/focus compilation, default palettes, placeholders/disabled controls, media scope, solid accent hover precedence and valid selection selectors.

Documentation: `docs/qa/V1_12_OFFLINE_UI_FIXES.md` (this report).

## Offline verification

Commands run from the repository with already installed dependencies:

```powershell
node --import tsx --test test/theme_contrast.test.ts test/connect_account_modal.test.ts test/inbox_reply_rendering.test.ts
node client/node_modules/typescript/bin/tsc -p client/tsconfig.app.json --noEmit
git diff --check
```

Results: **12/12 tests passed**, zero failed/cancelled/skipped; client no-emit typecheck **passed**; diff whitespace check **passed** (Git reports only existing LF/CRLF conversion advisories). The CSS tests compile explicit candidates in memory and calculate at least 4.5:1 contrast for the tested light text/surface/tint combinations. They do not render a page or establish whole-application accessibility conformance. React server rendering invokes no effects or interaction handlers and starts no HTTP server.

The sandbox's workspace-ancestor path restriction initially prevented Node module resolution (`EPERM`). The successful checks used narrowly scoped execution outside that restriction. No application or browser permission was requested or used.

## Remaining acceptance

Browser visual acceptance is **pending owner permission**: compare Cozy Light and Midnight Dark; inspect desktop/narrow layouts, modal long-form scrolling and very short/mobile keyboard viewports; verify keyboard focus/native invalid-field scrolling; and inspect long analytics headings/values with horizontal table scrolling. Review a real saved reply before/after a future owner-controlled sync. Source tests preserve identities and states but do not prove live provider behavior.

The centralized foreground bridge covers the current inspected utility set. Future fixed dark surfaces with adaptive text should use an explicit media scope, and future new color/opacity utilities need the same contrast review. These source edits have not been built into or activated in the owner's frozen release.
