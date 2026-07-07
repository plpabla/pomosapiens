<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Tab Title Live Timer

- **Plan**: context/changes/tab-title-timer/plan.md
- **Scope**: Phases 1-3 of 3 (full plan)
- **Date**: 2026-07-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned `tabTitle.ts` running-title helper module

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/timer/tabTitle.ts:3
- **Detail**: The plan (Phase 1 change #3) said `SessionRunner` computes the running-title string inline and that "SessionRunner owns all display strings ... the hook stays generic". Implementation instead extracted `getRunningTabTitle(...)` into a new `src/lib/timer/tabTitle.ts` module (with its own `tabTitle.test.ts`), which was not listed in the plan's files. The alert-wording constants (`FOCUS_DONE`, `BREAK_OVER`) still live in `SessionRunner`, so display-string ownership is only partially moved. This is benign and arguably better — it makes the title-builder unit-testable and keeps `SessionRunner` lean — but it is an unplanned file.
- **Fix**: Accept the extraction and note it as a plan addendum (the module is tested and improves testability). No code change needed.
- **Decision**: ACCEPTED — recorded as plan addendum A-01 (2026-07-07). No code change.

### F2 — `useTabTitle` does not restore the title on an `alert` → `null` transition

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/timer/useTabTitle.ts:51-54
- **Detail**: The alert effect's cleanup clears the interval and removes the listener but never re-asserts `input.title`. If `alert` goes from set to `null` while `input.title` stays unchanged, the title-effect (keyed only on `input.title`) will not re-fire, so the tab can be left showing the last blink frame instead of the current title. This is **not a live bug** in this app: every path that clears the alert coincides with either a `title` change (take-a-break → 🌴 title) or an unmount (navigation), so the title effect always re-fires or the mount cleanup restores the default. It is a latent trap only if the generic hook is reused in a context where an alert clears without a concurrent title change.
- **Fix**: If the hook is later reused, add `document.title = alertA === null ? (titleRef.current ?? defaultRef.current) : ...` on the clear branch, or key the title effect so it re-runs when the alert clears. No change needed for current usage.
- **Decision**: FIXED — added a `titleRef` (synced via effect) and re-assert `titleRef.current ?? defaultRef.current` on the alert-clear branch of `useTabTitle.ts`. Lint clean, 151/151 tests pass.

### F3 — Visible-break navigation test exercises the null-audio fast path, not the chime-wait branch

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/unit/session/SessionRunner.break.test.tsx:119-127
- **Detail**: The "navigates immediately when the break completes on a visible tab (unchanged behavior)" test supplies `audioRef.current = null`, so it hits the `if (!audio) { window.location.assign("/dashboard"); return; }` short-circuit rather than the plan's actual unchanged path (wait for the chime `ended` event or the 5s fallback). The chime-`ended` / timeout branch of the gated navigate effect is therefore not covered by the new tests. Behavior is fail-safe and the branch predates this change, so risk is low.
- **Fix**: Optionally add a test that provides a mock audio element and asserts navigation fires on its `ended` event (and via the fake-timer 5s fallback).
- **Decision**: SKIPPED — pre-existing fail-safe branch, low risk; coverage left as-is.
