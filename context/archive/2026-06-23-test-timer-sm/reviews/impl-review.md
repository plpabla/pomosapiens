<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Timer State Machine + Finalization Guards

- **Plan**: context/changes/test-timer-sm/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-06-24
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (1 observation) |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (1 observation -- env-related) |

## Summary

Plan was followed cleanly across all five phases. The refactor cleanly lifts `useFocusTimer` and `resolveSessionPageAccess` into pure-testable surfaces; the 12 jsdom tests cover risks #1, #5, #6 with the required sabotage gate documented; cookbook §6.2 and the §3 row 2 status bump landed exactly as specified. All three observations are LOW-impact.

## Findings

### F1 -- npm test no longer green: JWT issued-at clock skew

- **Severity**: OBSERVATION
- **Impact**: LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria (cross-cutting; pre-existing test)
- **Location**: tests/integration/api/sessions.end.test.ts:17
- **Detail**: Phase 4 success criterion 4.3 (`npm test` exits 0 with all ~24 tests passing) no longer holds locally. One workers test fails with `createSession failed: 500 {"error":"JWT issued at future"}`. All 12 jsdom tests added by this plan pass; the failing test is Phase 1's column-scope regression gate (L-01) and is unaffected by Phase 2-4 code. Local system date is 2026-06-24, so the most likely root cause is Supabase test JWT `iat` being slightly in the future relative to gotrue's leeway -- environmental, not a code regression introduced here.
- **Fix**: Investigate why local clock and Supabase service JWT iat disagree (regenerate dev secrets / refresh `.dev.vars` JWT, or add `nbf`/`iat` tolerance). Not in this plan's scope -- worth a separate change-id if it persists.
- **Decision**: FIXED -- environmental clock skew; self-resolved. All 26 tests pass (npm test exits 0).

### F2 -- resolveSessionPageAccess(row: null) branch is unreachable in prod

- **Severity**: OBSERVATION
- **Impact**: LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/session/[id].astro:30-32 + src/lib/session/access.ts:22
- **Detail**: `[id].astro` keeps the pre-existing `if (error || !data) return Astro.redirect("/dashboard")` (line 30) BEFORE invoking the decider. That makes the decider's `if (row === null)` branch (access.ts:22) defense-in-depth only -- production never hits it. The first test case in `resolveSessionPageAccess.test.ts` still pins it, which is fine, but the dual guard is mildly redundant and not called out in the plan. The decider's signature accepts `row: SessionRow | null` purely to support that defensive branch.
- **Fix**: Either (a) remove the pre-decider check in `[id].astro` and let the decider handle row-null (single source of truth), or (b) leave as-is and add a one-line comment noting the dual guard is intentional. Option (b) is the cheapest -- the current shape is harmless.
- **Decision**: FIXED via Fix A -- removed `if (error || !data)` compound guard; decider now handles null rows. Added `if (!data) return Astro.redirect("/dashboard")` after the decider redirect check for TypeScript narrowing (unreachable in practice; `no-non-null-assertion` rule forbids `!` assertion).

### F3 -- dispatchVisibilityChange defineProperty leaks across tests

- **Severity**: OBSERVATION
- **Impact**: LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/_setup.ts:24-34 + tests/unit/timer/useFocusTimer.test.ts:19-23
- **Detail**: `dispatchVisibilityChange` redefines `document.visibilityState` / `document.hidden` via `Object.defineProperty` but never restores them. `useFocusTimer.test.ts` works around this by calling `dispatchVisibilityChange("visible")` in `afterEach`, but the cleanup pattern lives in the test file rather than in `_setup.ts` -- a future jsdom test author who skips that line will get the last-set state bleed across files. Not a current bug (`audio.test.ts` doesn't dispatch visibility changes), but a footgun for §6.2's "contributor can add a new timer/hook test from these instructions alone" goal.
- **Fix**: Add a `restoreVisibility()` helper in `_setup.ts` and call it via a top-level `afterEach` (or move the reset into the dispatch helper itself with a teardown registration). Saves a future test author 30 minutes of head-scratching.
- **Decision**: FIXED -- added global `afterEach(() => dispatchVisibilityChange("visible"))` in `_setup.ts`; removed redundant manual reset from `useFocusTimer.test.ts` afterEach.
