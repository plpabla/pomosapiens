<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UI Improvements Bundle (S-12)

- **Plan**: context/changes/ui-improvements/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2, both complete per Progress)
- **Date**: 2026-07-12
- **Verdict**: REJECTED (at time of review; all 4 findings triaged and fixed on 2026-07-12 — see Decision fields below)
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | FAIL |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | FAIL |

## Findings

### F1 — E2E suite currently fails on HEAD (regression introduced after plan closure)

- **Severity**: CRITICAL
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/e2e/session-note.spec.ts:54 (symptom); root cause likely src/pages/dashboard.astro / new dashboard islands (unconfirmed)
- **Detail**: `npm run test:e2e` fails: `session-note.spec.ts` hits a Playwright strict-mode violation — `getByText(noteText)` resolves to 2 elements: the expected `<p>` note text, and a second `<code>` element dumping raw JSON (`{ "sessions": [ [0, {"id ...`) that happens to contain the note text as a substring. Grepping this repo's entire `src/` tree for a literal `<code` tag returns zero matches, so this element is not authored in this codebase's React/Astro components — it is very likely Astro's dev-toolbar island-props inspector (tests run against `npm run dev` per `playwright.config.ts`), now surfacing session data because a new client-hydrated island was added to `/dashboard`. The plan's own Progress checklist shows `2.3 E2E suite passes` was checked green at commit `381e077`; the three unplanned commits below (`56b6682`, `3842a14`, `8089cad`) all landed after that checkpoint, and `git log 381e077..8089cad` confirms none of them re-ran or re-verified the e2e suite before this review. Whether or not the exact toolbar theory is right, this is a live, reproducible failure on the current branch tip, directly contradicting Phase 2's own stated Automated Verification bullet.
- **Fix A**: Reproduce with the dev server running, inspect `/dashboard`'s live DOM for the offending `<code>` element, and confirm the Astro dev-toolbar theory; if confirmed, scope the test's locator to the app's root content container (e.g. `page.getByRole("main").getByText(noteText)`) so toolbar-injected DOM never intersects assertions — apply the same scoping across other `getByText` assertions that don't already use `getByRole`/`getByLabel` scoping.
  - Strength: Fixes the flake at its true source (test isolation from dev-only tooling) without touching production code; other e2e specs already prefer `getByRole` per this repo's locator rules, so this brings `session-note.spec.ts` in line with the rest of the suite.
  - Tradeoff: If the theory is wrong and the JSON dump is actually a real app-code leak (e.g., debug output that would also ship to a production build), this fix would mask a real bug instead of removing it.
  - Confidence: MED — the `<code`-in-`src` grep is strong negative evidence for app-authored output, but not a live-DOM confirmation.
  - Blind spot: Haven't opened a live browser against `npm run dev` to directly inspect the second matched element's ancestry.
- **Fix B**: Root-cause first — run `npm run dev`, open `/dashboard` signed in, and use browser devtools to inspect the `<code>` element's location in the DOM tree (main document vs. a shadow root) before deciding on Fix A vs. a code-level removal.
  - Strength: Removes ambiguity before committing to a test-only fix; if it's a genuine leak, this catches it before it reaches users.
  - Tradeoff: Costs a few extra minutes of manual verification versus just applying Fix A and re-running the suite.
  - Confidence: HIGH — this is the standard way to root-cause a DOM-matching flake.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B, root-caused first). Reproduced the failure via `npm run test:e2e` (2 of 3 raw runs failed) and via an instrumented one-off spec that retried the session flow until it caught the duplicate `<code>` element. Its ancestry confirmed `CODE > PRE > DIV.section-content > SECTION`, and a sibling `<code>` in the same DOM read `astro preferences disable devToolbar` inside an `ASTRO-DEV-TOOLBAR-WINDOW` element — conclusively Astro's dev toolbar (dev-only, stripped from production builds), not an app-code leak. Applied a locator fix: scoped the note assertion to the session-history `<ul>` (`page.getByRole("list").getByText(noteText)`) in both `tests/e2e/session-note.spec.ts:54` and `tests/e2e/session-edit.spec.ts:58` (same `noteText` collision class — found while checking for other affected assertions). 5/5 reruns of `session-note.spec.ts` passed after the fix, plus a full `npm run test:e2e` run (14/14 passed). Other unscoped `getByText` calls in the suite (star ratings, duration strings) don't collide with the toolbar's raw-JSON dump shape, so left untouched per scope discipline.

### F2 — Three unplanned commits landed after the plan's own close-out, touching ~15 files outside plan scope

- **Severity**: WARNING
- **Impact**: HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Scope Discipline
- **Location**: commits `56b6682` (feat: improve Session summary tiles), `3842a14` (refactor: Session tile composition), `8089cad` (fix(ui-improvements): remove phantom scrollbar on the pages) — all dated after `1495cba chore(ui-improvements): close out plan (epilogue)`
- **Detail**: The plan (`context/changes/ui-improvements/plan.md`) and its brief describe five small cosmetic edits scoped to `format.ts`, `SessionTags.tsx`, `SessionRunner.tsx`, `EnergyPicker.tsx`, `AnonSessionApp.tsx`, `SessionStartForm.tsx`, and their tests. The actual branch also ships a full dashboard session-actions overhaul that is nowhere in that scope: `DeleteSessionButton.tsx` removed and replaced by new `DeleteSessionDialog.tsx` + `SessionActionsMenu.tsx`; `EditSessionDialog.tsx` gained a controlled/uncontrolled dual-mode API; `AbandonButton.tsx`, `ConfirmActionButton.tsx`, `CompletedSessionActions.tsx` all reworked; `SessionTile.tsx` decomposed into four new child components (`DurationLabel.tsx`, `EnergyPill.tsx`, `SessionSummaryRow.tsx`, `SessionTileCorner.tsx`); plus a `Layout.astro`/`dashboard.astro`/`session/[id].astro`/`session/new.astro` layout fix. No `change.md` or plan anywhere in `context/changes/` or `context/archive/` documents this work — `change.md` for `ui-improvements` still states the narrow S-12 title and scope while `status: implemented` now covers substantially more than what it describes. This also correlates with F1: the e2e regression appeared specifically after these commits.
- **Fix A ⭐ Recommended**: Split this out — create a fresh `context/changes/<new-id>` (e.g. `dashboard-actions-menu`) via `/10x-new`, backfill a plan/plan-brief describing what actually shipped in `56b6682`/`3842a14`/`8089cad`, and let `ui-improvements`' plan.md stand as-is (it already accurately describes only Phase 1+2).
  - Strength: Keeps `ui-improvements`' own audit trail honest (it already passed its own review criteria) while giving the larger refactor the plan/review treatment its size warrants; doesn't require touching already-shipped, working code.
  - Tradeoff: Documentation happens after the fact, and F1's regression still needs root-causing regardless of which change-id it's filed under.
  - Confidence: HIGH — this repo's own workflow (`/10x-new` → `/10x-plan` → `/10x-implement` → `/10x-impl-review`) is built for exactly this kind of retroactive backfill, and other changes in `context/archive/` show the addendum pattern.
  - Blind spot: Doesn't address why this landed on the `ui-improvements` branch without a plan in the first place — a process question outside this review's scope.
- **Fix B**: Revert `56b6682`, `3842a14`, `8089cad` off this branch and re-land them later through the normal plan → implement flow.
  - Strength: Keeps `ui-improvements`' history scoped exactly to S-12, matching its plan word-for-word.
  - Tradeoff: These commits already rewired `tests/e2e/session-delete.spec.ts` and `tests/e2e/session-edit.spec.ts` to match the new dashboard UI, and removed `DeleteSessionButton.tsx` entirely — reverting risks re-breaking those specs and losing already-working code for no correctness gain.
  - Confidence: MEDIUM — feasible, but the coupling between the refactor and its own test updates makes a clean revert nontrivial.
  - Blind spot: Haven't checked whether anything else on this branch or a sibling branch already depends on `SessionActionsMenu`/`DeleteSessionDialog`.
- **Decision**: FIXED (lighter variant of Fix A). Did not spin up a full `/10x-new` change-id/plan; instead added an "Addendum" section to `context/changes/ui-improvements/change.md` naming the three unplanned commits, listing the files/components they touch, and stating explicitly that `plan.md` does not cover this work.

### F3 — SessionActionsMenu hand-rolls a dropdown instead of using the project's Radix pattern

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency / Safety & Quality
- **Location**: src/components/dashboard/SessionActionsMenu.tsx:1-96
- **Detail**: `SessionActionsMenu` implements its own dropdown with manual `mousedown`/`keydown` listeners — no focus trap, no roving-tabindex/arrow-key navigation, and focus is not restored to the trigger button on close. The project already depends on `radix-ui`, and every other overlay in the codebase (`src/components/ui/dialog.tsx`) is a thin wrapper around a Radix primitive. This reimplements outside-click/escape handling Radix provides for free, and is more brittle (a `mousedown` inside a future portal-rendered child would be misread as "outside").
- **Fix A ⭐ Recommended**: Add a `dropdown-menu.tsx` shadcn/Radix wrapper following the exact pattern `dialog.tsx` uses, and refactor `SessionActionsMenu` to consume it.
  - Strength: Eliminates the accessibility gaps (focus trap, roving tabindex, focus restoration) for free, and matches this repo's established "wrap Radix primitives" convention rather than introducing a second overlay implementation style.
  - Tradeoff: Touches an already-shipped, tested component; requires re-verifying `tests/e2e/session-delete.spec.ts` / `session-edit.spec.ts`, which were updated in `56b6682` to target the current menu's behavior.
  - Confidence: HIGH — `dialog.tsx` is a direct template to copy, and `radix-ui` is already an installed dependency (no new package).
  - Blind spot: Haven't measured whether swapping menus changes any DOM structure the two e2e specs assert on directly.
- **Fix B**: Keep the custom implementation but harden it — add a focus trap, roving tabindex, and restore focus to the trigger on close.
  - Strength: Smaller diff, no dependency-shape change.
  - Tradeoff: Still bespoke code to maintain long-term against a codebase convention that otherwise standardizes on Radix.
  - Confidence: MEDIUM — patches the immediate gaps without resolving the underlying inconsistency.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A). Ran `npx shadcn@latest add dropdown-menu` to generate `src/components/ui/dropdown-menu.tsx` (radix-ui already installed, no new dependency), then rewrote `SessionActionsMenu.tsx` to consume `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` instead of the hand-rolled `mousedown`/`keydown` listeners. External API (`onEdit`/`onDelete` props) is unchanged, so `CompletedSessionActions.tsx` needed no changes. As anticipated in the finding's blind spot, Radix portals `DropdownMenuContent` to `document.body`, which broke `tests/e2e/session-delete.spec.ts`'s row-scoped `targetRow.getByRole("menuitem", ...)` queries (same portal-scoping issue that test's own comment already called out for its confirm dialog) -- fixed by querying the menu items at page scope instead of row scope. Also discovered and fixed a pre-existing gap: jsdom has no `PointerEvent` constructor, so `fireEvent.pointerDown`/`fireEvent.click` in unit tests never satisfy Radix's `event.button === 0` open-gate on `DropdownMenuTrigger` -- broke `tests/unit/dashboard/CompletedSessionActions.test.tsx` and `tests/unit/session/SessionTile.test.tsx` (which now render the menu through this component for the first time). Added a `PointerEvent` polyfill (extends `MouseEvent`) to the shared `tests/unit/_setup.ts`, and switched those two files' menu-open interaction from `fireEvent.click` to `fireEvent.pointerDown` to match Radix's actual trigger handler. Full `npm run test:e2e` (14/14), `npx vitest run` (289/289), and `npm run lint` pass after the change.

### F4 — EditSessionDialog's uncontrolled mode is now dead in production

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/dashboard/EditSessionDialog.tsx:26-30,74-99
- **Detail**: The dual controlled/uncontrolled mode (`props.open ?? internalOpen`, conditional `DialogTrigger`) was added to support the new `SessionActionsMenu`-driven flow, but the only production call site (`CompletedSessionActions.tsx`) always passes `open`/`onOpenChange`. The uncontrolled branch (internal state + built-in trigger button) is now exercised only by unit tests, not the running app.
- **Fix**: Either drop the uncontrolled branch (always require `open`/`onOpenChange` from the caller) or leave it — it's test-covered and low-risk either way; flagging for awareness rather than requiring action.
- **Decision**: FIXED. Made `open`/`onOpenChange` required props on `EditSessionDialog`, removed `internalOpen` state and the conditional `DialogTrigger`/built-in "Edit" button. `CompletedSessionActions.tsx` needed no change (already passes both props). Updated `tests/unit/dashboard/EditSessionDialog.test.tsx` to render through a small `ControlledDialog` harness (owns `open` state, starts `true`) instead of clicking a trigger that no longer exists. `npx eslint`, `npx astro check`, and `npx vitest run tests/unit/dashboard/EditSessionDialog.test.tsx` (5/5) all pass.
