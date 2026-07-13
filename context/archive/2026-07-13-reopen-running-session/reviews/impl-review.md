<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Re-open a Running Session from the Dashboard (S-11)

- **Plan**: context/changes/reopen-running-session/plan.md
- **Scope**: Phase 1–2 of 2 (full plan)
- **Date**: 2026-07-13
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

### F1 — Unit tests added despite plan's "no unit/component test" guardrail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/unit/dashboard/ResumeButton.test.tsx (new); tests/unit/session/SessionTile.test.tsx:58-74 (added describe block)
- **Detail**: The plan's "What We're NOT Doing" (plan.md:34) and Testing Strategy (plan.md:118) both explicitly state "No unit/component test — coverage is the single e2e spec." The implementation added a new `ResumeButton.test.tsx` (2 tests) and a "SessionTile resume control" describe block (3 tests) to the existing `SessionTile.test.tsx`. The added coverage is benign and positive (all 12 tests pass, and the repo already carries component unit tests, so the guardrail was arguably over-tight), but it directly contradicts a documented scope decision and the plan was never updated to reflect the change — leaving the plan wrong as a source of truth.
- **Fix A ⭐ Recommended**: Reconcile the plan — update "What We're NOT Doing" and "Testing Strategy" to record that focused unit tests for `ResumeButton` render/navigation and `SessionTile` Resume gating were added alongside the e2e spec.
  - Strength: Keeps the plan accurate for future reviews/archival; preserves the extra coverage, which mirrors the repo's existing `SessionTile.test.tsx` convention.
  - Tradeoff: Plan edit after the fact; the original "single e2e spec" intent is retconned.
  - Confidence: HIGH — the repo already unit-tests these components; the tests pass.
  - Blind spot: None significant.
- **Fix B**: Remove the added unit tests to hold the plan's stated scope.
  - Strength: Strict scope discipline; e2e remains the single source of behavioral coverage as planned.
  - Tradeoff: Discards fast, cheap regression coverage (render + gating + navigation) that the e2e can't run without Supabase.
  - Confidence: MEDIUM — depends whether the team values the guardrail over the coverage.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A — plan.md "What We're NOT Doing" and "Testing Strategy" reconciled to record the added unit tests)

### F2 — `InProgressSessionActions` extraction deviates from the literal plan (already reconciled)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/dashboard/InProgressSessionActions.tsx (new); src/components/session/SessionTile.tsx:33
- **Detail**: The plan (§Implementation Approach, Phase 1 change #2) said to wrap `ResumeButton` + `AbandonButton` in a flex row *inside* `SessionTile`. The implementation instead extracted a dedicated `InProgressSessionActions` composition component and renders `<InProgressSessionActions sessionId={session.id} />`. This is an unplanned file, but it is explicitly blessed by lesson **L-07** (written during this change) and mirrors the existing `dashboard/CompletedSessionActions.tsx` precedent. No action needed — flagged only so the record shows the deviation was intentional and documented.
- **Fix**: None — deviation is documented via L-07 and matches repo precedent.
- **Decision**: ACKNOWLEDGED — no fix needed

### F3 — `ResumeButton` uses shadcn `Button` instead of the raw `<button>`+`cn()` the contract specified

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/dashboard/ResumeButton.tsx:9-19
- **Detail**: The Phase 1 contract specified a `<button type="button">` composed with `cn()` from `@/lib/utils`. The implementation uses the shadcn `<Button type="button" size="sm" className="w-full">`. This is a benign, arguably better choice — it inherits the design system's styling (and `Button` internally applies `cn()`), and a single static `className` needs no `cn()` merge. Accessible name "Resume" and role `button` are preserved, so e2e/unit locators are unaffected.
- **Fix**: None — the shadcn `Button` is the stronger convention here; contract wording was more prescriptive than necessary.
- **Decision**: ACKNOWLEDGED — no fix needed
