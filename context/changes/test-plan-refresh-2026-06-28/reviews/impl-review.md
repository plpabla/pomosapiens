<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Test Plan Refresh 2026-06-28

- **Plan**: context/changes/test-plan-refresh-2026-06-28/plan.md
- **Scope**: Full plan (Phases 1-3)
- **Date**: 2026-06-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Verification run during review:

- `npm test -- tests/unit/session/EnergyPicker.test.tsx` -> 2/2 pass
- `npm run lint` -> pass
- Plan-drift sub-agent: 10/10 planned items MATCH
- All `## Progress` checkboxes backed by commits b78af5d (P1) / cfbfec3 (P2) / 4229aa3 (P3)

## Findings

### F1 -- Topic-name timestamp collision under parallel workers

- **Severity**: WARNING
- **Impact**: LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/session-capture.spec.ts:21
- **Detail**: Topic seed name is `e2e-topic-${Date.now()}`. If Playwright workers fire `beforeAll` within the same millisecond against a user that happens to be shared or recycled, the `(owner_id, name)` unique constraint on `public.topics` rejects the second insert and flakes the suite. The plan itself prescribed the `Date.now()` pattern, so this is also a plan-level oversight.
- **Fix**: Append a short random suffix to the seed name: `` `e2e-topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` ``.
  - Strength: Eliminates the millisecond-window race regardless of whether `setupTwoUsers` ever recycles a user.
  - Tradeoff: None -- string-cosmetic.
  - Confidence: HIGH -- standard parallel-test isolation pattern.
  - Blind spot: None.
- **Decision**: FIXED -- appended random suffix `${Math.random().toString(36).slice(2, 8)}` to seed name.

### F2 -- Epilogue commit smuggles unplanned scope under "close out plan"

- **Severity**: WARNING
- **Impact**: MEDIUM -- real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: commit 2bb4a6c
- **Detail**: The "close out plan (epilogue)" commit message claims "Final SHA write-back into Phase 3 Progress rows + change.md -> implemented", but the actual diff also adds a new 496-line `context/foundation/arch.md` (full system architecture document), reformats `src/db/database.types.ts` (semicolons + line joining), edits `context/foundation/lessons.md`, resaves `.github/workflows/ci.yml` (EOF newline), and touches ~10 archive-folder docs. None of these are in the plan's "Changes Required" or "Desired End State". Code/test behavior is unaffected, but the commit message hides the change set from future archaeology and `arch.md` is a substantive new foundation doc that bypassed the plan/research/review pipeline.
- **Fix A (Recommended)**: Document `arch.md` (and the other unrelated edits) as an addendum in `context/changes/test-plan-refresh-2026-06-28/change.md` Notes so future reviewers don't mistake it for unauthored drift; leave the existing commit as-is.
  - Strength: Preserves landed work; updates the source-of-truth paper trail without rewriting history.
  - Tradeoff: Commit message remains misleading on its own.
  - Confidence: HIGH -- repo's change.md routinely captures discovered scope.
  - Blind spot: None.
- **Fix B**: Split the epilogue: keep 2bb4a6c for the actual Progress / change.md write-back, move `arch.md` (and any other unrelated diffs) to a separate commit (or new change folder).
  - Strength: Restores commit-message honesty.
  - Tradeoff: History rewrite on a shared branch is risky and delivers no behavior change.
  - Confidence: MEDIUM -- depends on remote state of `test-sessions-ext`.
  - Blind spot: Haven't verified whether the branch is already pushed/merged.
- **Decision**: FIXED via Fix A -- addendum added to change.md documenting the extra scope in 2bb4a6c.

### F3 -- Risk-pin header comment missing on new .tsx test

- **Severity**: OBSERVATION
- **Impact**: LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/session/EnergyPicker.test.tsx:1
- **Detail**: Sibling jsdom tests (`useFocusTimer.test.ts`, `resolveSessionPageAccess.test.ts`) open with a `// Pins ...` header comment naming the test-plan row or lesson they guard. The new file omits it. Plan's stated purpose ("pin Risk #7") makes this header high-signal at zero cost.
- **Fix**: Prepend `// Pins context/foundation/test-plan.md S2 Risk #7 (picker fetch silent failure)` as the first line of the test file.
- **Decision**: FIXED -- prepended `// Pins context/foundation/test-plan.md S2 Risk #7 (picker fetch silent failure)` as line 1.

### F4 -- Start button render not explicitly asserted

- **Severity**: OBSERVATION
- **Impact**: LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/unit/session/EnergyPicker.test.tsx:19
- **Detail**: Plan Phase 1 said "energy buttons AND Start button must still render". Implementation asserts only `getByRole("button", { name: "Medium" })`. The Medium-button check satisfies the canonical degraded-mode proof the plan also called out, so this is borderline.
- **Fix**: Add `expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();` in both `it()` blocks.
- **Decision**: FIXED -- added `getByRole("button", { name: /start/i })` assertion in both it() blocks.

### F5 -- Unscoped `getByText(topicName)` on dashboard

- **Severity**: OBSERVATION
- **Impact**: LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/session-capture.spec.ts:77-78
- **Detail**: Dashboard chip assertions use bare `page.getByText(topicName)`. Safe today, but if any future dashboard surface (filter, dropdown, archive list) surfaces topic names, the assertion may match a non-chip node.
- **Fix**: Scope to the history card with `.first()` or `page.getByRole("listitem").filter(...).getByText(topicName)`.
- **Decision**: FIXED -- scoped assertions to `.first()`, consistent with the "medium" chip check already on line 76.
