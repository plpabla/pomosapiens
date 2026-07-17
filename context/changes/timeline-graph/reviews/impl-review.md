<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Focus Timeline (S-14)

- **Plan**: context/changes/timeline-graph/plan.md
- **Scope**: Phases 1-4 of 4 (full plan review)
- **Date**: 2026-07-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL (one planned item missing but checked off; minor drifts) |
| Scope Discipline | WARNING (benign extras) |
| Safety & Quality | WARNING (no criticals) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING (astro check fails on 22 pre-existing errors; lint/build/tests pass) |

## Automated verification results (2026-07-17)

- `npx astro check` — **FAIL**: 22 errors, 0 in timeline files (all pre-existing on main: ModePicker.tsx, SessionRunner.tsx, api/topics|material-formats [id].ts, cloudflare:test type resolution in integration tests, stale test mocks)
- `npm run lint` — PASS
- `npm run build` — PASS
- `npm test` — PASS (55 files, 338 tests)

## Findings

### F1 — Planned horizontal scroll wrapper never built but checked off as done

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/timeline/ (wrapper absent); src/components/timeline/TimeAxisHeader.tsx:9-11
- **Detail**: Plan Phase 2 #3 specified a horizontal scroll wrapper (min-width ~820px) so narrow screens scroll while axis and rows stay aligned. No `overflow-x`/`min-w`/820 exists anywhere under src/components/timeline, and `git log -S` shows it was never committed — yet Progress item 2.8 ("Horizontal scroll keeps axis/rows aligned") is checked off against commit 808c2b6. The comment at TimeAxisHeader.tsx:9-11 shows the horizontal scrollbar was treated as a bug and edge tick labels were re-anchored to eliminate it. On narrow screens the grid now compresses instead of scrolling.
- **Fix A ⭐ Recommended**: Record the compress-instead-of-scroll behavior as a plan addendum and correct Progress 2.8's wording, after confirming the page is usable at phone width.
  - Strength: Preserves what looks like a deliberate design decision (in-code comment) and makes the plan truthful again.
  - Tradeoff: Narrow-screen usability is unverified — blocks may become unreadably small in Week/Month.
  - Confidence: MED — deliberateness inferred from a code comment, not a documented decision.
  - Blind spot: Nobody has looked at /timeline at ~375px width.
- **Fix B**: Implement the wrapper per plan (`overflow-x-auto` container with `min-w-[820px]` around axis + rows).
  - Strength: Matches the plan and the design spec exactly.
  - Tradeoff: Reintroduces the scrollbar the implementer appears to have removed on purpose.
  - Confidence: MED — mechanically simple, but contradicts an apparent deliberate choice.
  - Blind spot: The original reason the scrollbar was considered a bug.
- **Decision**: FIXED via Fix B — wrapped `TimeAxisHeader` + `DayRow`s in `TimelineGrid.tsx` with `overflow-x-auto` / `min-w-[820px]`; scrollbar only appears when the viewport can't fit 820px. Progress 2.8 wording corrected in plan.md.

### F2 — "astro check passes" checked in all 4 phases but the command fails repo-wide

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/timeline-graph/plan.md:345 (Progress 1.1/2.1/3.1/4.1)
- **Detail**: `npx astro check` currently exits with 22 errors. None are in timeline code — all live in files this branch never touched (ModePicker.tsx, SessionRunner.tsx, api [id].ts routes, `cloudflare:test` module types in integration tests, stale `UseFocusTimerResult` mocks) — so they are pre-existing on main. But the gate as written ("Type checking passes: npx astro check") does not pass, and four checkboxes say it does. This is the L-08 gate; a gate that never goes green stops catching new errors.
- **Fix A ⭐ Recommended**: Queue a follow-up change to fix the 22 pre-existing errors repo-wide so the gate is meaningful again.
  - Strength: Restores a real type gate for every future plan; most errors are cheap (test mocks, missing cloudflare:test types config).
  - Tradeoff: Out of this change's scope; separate effort.
  - Confidence: HIGH — errors are enumerated and mostly mechanical.
  - Blind spot: The two `RejectExcessProperties` API-route errors may need actual design attention.
- **Fix B**: Annotate the plan's gate semantics as "no new errors in files touched by this change" and leave the repo errors alone.
  - Strength: Zero extra work; timeline files are genuinely clean.
  - Tradeoff: The gate stays permanently red and will keep producing this same finding in every future review.
  - Confidence: MED.
  - Blind spot: Whether the errors existed when the checkboxes were stamped (likely yes — files untouched by this branch).
- **Decision**: SKIPPED — user will fix soon (outside this triage session)

### F3 — 24h hour labels instead of the planned 12h Intl labels

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/timeline/dateRange.ts:139-141
- **Detail**: Plan Phase 2 #2 ("Labels formatted via Intl/12h") and the design spec ("6 AM–11 PM", "6 AM, 9 AM, 12 PM…") call for 12-hour labels. The implementation's `formatHour` is custom zero-padded 24h ("06:00", 24 → "00:00"), used by TimeAxisHeader.tsx:31 and HoursRangeSelect.tsx:29,46. No decision note exists anywhere in context/changes. Cosmetic but an undocumented deviation from both plan and design.
- **Fix A ⭐ Recommended**: Keep 24h and record it as a plan addendum.
  - Strength: 24h is arguably clearer for the product's locale and the code is already consistent.
  - Tradeoff: Diverges from the imported design spec.
  - Confidence: MED — depends on your preference, not on code evidence.
  - Blind spot: Whether the design's 12h choice mattered to you.
- **Fix B**: Switch `formatHour` to 12h via `Intl.DateTimeFormat` per plan.
  - Strength: Matches the design spec exactly; single-function change.
  - Tradeoff: Slightly wider labels; churn on a purely cosmetic axis.
  - Confidence: HIGH — isolated pure function with tests.
  - Blind spot: None significant.
- **Decision**: Fixed via Fix A — kept 24h format; recorded as a Review Addendum in plan.md.

### F4 — setColor can throw uncaught from a click handler

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/timeline/useTimelineColors.ts:28-32
- **Detail**: `store.setItems` (collectionStore.ts:61-67) is intentionally unguarded — callers are expected to surface write errors. `useTimelineColors.setColor` doesn't catch, so in Safari private mode or on quota exhaustion, clicking a preset in ColorPaletteDialog throws an unhandled exception from the click handler (no error boundary in the tree). The plan's contract called this store usage "fail-open"; color preferences are cosmetic.
- **Fix**: Wrap the `store.setItems` call in try/catch inside `setColor`, mirroring the fail-open `persist` in useHoursRange.ts.
- **Decision**: FIXED — wrapped `store.setItems` in try/catch in `setColor`, mirroring `useHoursRange.ts`'s fail-open pattern.

### F5 — Persisted hours range lacks range validation (persistence itself was unplanned)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/timeline/useHoursRange.ts:7-14
- **Detail**: The plan kept hoursRange as plain TimelineApp state; the implementation added localStorage persistence (key `pomosapiens.timeline.hours_range`) — benign scope creep, but its `isHoursRange` guard only checks both fields are numbers. A corrupt value like `{"start":23,"end":6}` or `{"start":5,"end":5}` passes and makes `axisPercent` (layout.ts:38) divide by zero or a negative span — NaN/negative positions on every block and tick, persisting across reloads. The UI keeps values legal, but the store is the trust boundary.
- **Fix**: Extend the guard to `Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 24 && start < end`; mention the persistence addition in the plan addendum.
- **Decision**: FIXED — `isHoursRange` now validates integer bounds and `start < end`.

### F6 — All-sessions SSR fetch grows without bound

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/timeline.astro:18-24
- **Detail**: The query drops `.limit(50)` with no date bound — the "all sessions" variant the plan explicitly allowed and whose cost the plan's Performance section accepted at single-user scale. Every session is serialized into the island's HTML props and rescanned by deriveTimelineView per state change. Fine today; degrades linearly forever.
- **Fix**: None required now. If payload growth ever matters, add `.gte("started_at", <now - 365d>)` plus a separate min-date fetch for nav clamping.
- **Decision**: SKIPPED

### F7 — layout.ts end-time edge cases deviate from the planned clamp

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/timeline/layout.ts:46-57
- **Detail**: Plan: in-progress sessions derive end from `started_at + duration_seconds`, "else clamp to axis end". Implementation falls back to `?? 0`, yielding a min-width block at the start time instead. Separately, a midnight-crossing session (end < start) collapses to min width at its start, silently dropping the overflow — plan declared midnight-crossing out of scope but specified right-edge clamping. No crash either way; arguably better UX than a full-width block.
- **Fix**: Clamp derived end to end-of-visible-axis when `end < start`, or add a comment documenting the chosen fallback.
- **Decision**: FIXED — `blockPosition` now clamps to axis end both when duration is unknown and when the computed end precedes start (midnight crossing); existing unit tests still pass.

### F8 — "today" computed via new Date() during render goes stale past midnight

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/timeline/TimelineApp.tsx:65
- **Detail**: `startOfDay(new Date())` in render is impure; React Compiler assumes purity and may cache it, so a tab left open past midnight keeps yesterday's "today" (row highlight, canGoNext) until the next interaction. The hydration gate itself is correct (mirrors LocalDateTime.tsx), so there's no SSR mismatch — only staleness.
- **Fix**: Acceptable as-is; if it matters, derive "today" from a useSyncExternalStore tick.
- **Decision**: SKIPPED

### F9 — Benign unplanned extras (component split, hours persistence, end=24 option, Topbar link)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/Topbar.astro:10; src/components/timeline/HoursRangeSelect.tsx:11-12; commit 09d78ad
- **Detail**: Four additions the plan never described, all verified benign: (1) commit 09d78ad split TimelineApp into Toolbar/TimelineGrid/TimelineShell/DateNav/etc. — verified faithful decomposition, all state contracts intact in useTimelineViewState/deriveView; (2) hours-range persistence (see F5); (3) hours end options extend to 24 (midnight) vs the plan's 11 PM cap — documented only in a code comment; (4) Topbar Timeline nav link, committed after the plan close-out (5830ab3). All respect the change's guardrails (no API/DB changes, localStorage only).
- **Fix**: One short plan addendum listing the four extras so future reviews don't re-flag them.
- **Decision**: FIXED — added a Review Addenda entry in plan.md listing all four extras.

### F10 — Legend color-dot recolor button has a 10px hit target

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/timeline/Legend.tsx:29
- **Detail**: The clickable color dot is `size-2.5` (10px) — well under the ~24px minimum touch-target guidance. It does carry a proper aria-label.
- **Fix**: Pad the button's hit area (e.g. p-1.5 with negative margin) while keeping the visual dot small.
- **Decision**: FIXED — button hit area grown to `size-6` (24px) with an inner `size-2.5` span carrying the visible dot color.

## Scope guardrails — all respected

No fake/seeded data; navigation clamped to [earliest session period, current period]; no DB migration, API change, or new endpoint (only dep added: @uiw/react-color); no pagination; no Recharts.
