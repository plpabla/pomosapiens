<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Chart Tooltip Context

- **Plan**: context/changes/chart-tooltip-context/plan.md
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-07-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — "Type checking" gate doesn't run the TS compiler; two type bugs slipped past Phase 1

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/chart-tooltip-context/plan.md:97 (Automated Verification), src/components/dashboard/FocusRatingChartTooltip.tsx:26
- **Detail**: The plan's automated gate reads "Type checking passes: `npm run lint`". Phase 1 (f8a8b91) marked all four automated checkboxes done, yet a follow-up fix commit (2412196) was needed to correct two real type errors: `duration_seconds` is `number | null` in `SessionListItem` but was passed unguarded to `tomatoCount`/`formatDuration`, and `AnonSessionApp` still narrowed to `{ started_at, focus_rating }`. Neither `npm run lint` (type-checked ESLint) nor `npm run build` (Astro/Vite, no `tsc`) runs the TypeScript compiler, so `.tsx`/`.astro` prop-wiring type errors are not caught by the stated gate. A `tsc --noEmit` on the changed files flags them; the current gate does not.
- **Fix**: Record as a lesson (the gate labeled "type checking" does not typecheck). A scoped compiler check is the durable fix, but note the tradeoff below before wiring it into CI.
  - Strength: Codifies a recurring, repo-wide blind spot — the same gap will hide any future `.astro`/`.tsx` type error, not just this one.
  - Tradeoff: A bare repo-wide `tsc --noEmit` currently fails on ~15 pre-existing errors in unrelated files (integration tests missing `cloudflare:test` types, stale `UseFocusTimerResult` mocks, `api/topics/[id].ts`), so it can't be bolted onto CI as-is without first cleaning those up or scoping the check.
  - Confidence: HIGH — reproduced directly: `tsc --noEmit` is clean on this change's files only after 2412196, and `npm run lint`/`npm run build` both pass without it.
  - Blind spot: Whether the project intends `astro check` as the eventual typecheck gate (not currently in `package.json` scripts).
- **Decision**: FIXED + ACCEPTED-AS-RULE: L-08 "Type checking" gate must actually run the compiler (context/foundation/lessons.md). Plan gate at plan.md:97 corrected to a whole-project `tsc --noEmit` filtered to the four touched files (direct file-list form drops tsconfig paths/jsx and false-positives); verified clean.

### F2 — Plan missed the second chart consumer (anon dashboard) with the identical narrowing bug

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/anon/AnonSessionApp.tsx:103
- **Detail**: The plan's "Current State Analysis" and change list only accounted for `dashboard.astro` as the chart's data source and fixed its `.map()` narrowing there. But `FocusRatingChart` has a second consumer — `AnonSessionApp.tsx` — which applied the same `.map((s) => ({ started_at, focus_rating }))` narrowing. Without the follow-up fix (2412196) the anon chart tooltip would render a blank energy pill and `NaN min.` (undefined `duration_seconds`/`energy_level`). The bug was correctly fixed, but only after the fact; the plan's file inventory was incomplete. This is an EXTRA (unplanned) file change, but a justified correctness fix, not scope creep.
- **Fix**: No code action — already fixed at 2412196. Note it as a plan-completeness gap: when widening a shared component's prop contract, enumerate all call sites (grep the component name), not just the one named in the trigger.
- **Decision**: FIXED — addendum added to plan.md ("Addendum (post-implementation, impl-review)" section) documenting the missed consumer and the grep-all-call-sites rule.

### F3 — Tooltip extracted to its own file vs. "inside FocusRatingChart.tsx" as planned

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/dashboard/FocusRatingChartTooltip.tsx:1
- **Detail**: Plan §Phase 1 items #2 twice specifies adding `CustomTooltip` "(same file)" inside `FocusRatingChart.tsx`. Implementation instead extracted it into a dedicated `FocusRatingChartTooltip.tsx` (refactor commit 6190ef5), moving `formatTick` and the `ChartSession` type along with it and re-importing them into the chart. This is a benign, arguably cleaner structure (the tooltip owns the shared type and formatter) and is consistent with the repo's extract-presentational-component habit. Noted only as a deviation from the written plan, not a defect.
- **Fix**: No action needed; optionally note the extraction in the plan as an addendum for traceability.
- **Decision**: SKIPPED — already covered by the F2 addendum in plan.md.

### F4 — Roadmap S-13 status left "not started" though the change is implemented

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:46
- **Detail**: This change added the S-13 row and detail block to the roadmap with updated outcome text (energy level, duration, 🍅 count, badges), satisfying the plan's "update roadmap S-13" step. But both the S-13 table row and the detail block still read `Status: not started` / `not started`, while `change.md` is `status: implemented`. Minor bookkeeping inconsistency.
- **Fix**: Set S-13 status to `done` (or `implementing`) in both the roadmap table row and the detail block to match `change.md`.
- **Decision**: FIXED — roadmap.md:46 and roadmap.md:276 both set to `done`.
