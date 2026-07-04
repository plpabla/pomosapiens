<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Session Notes and Focus-Rating Chart

- **Plan**: context/changes/session-notes-and-chart/plan.md
- **Scope**: All 4 phases (full-plan review)
- **Date**: 2026-07-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

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

### F1 — Global palette tokens changed beyond the single planned chart token

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/styles/global.css:16,33,67
- **Detail**: Phase 3 #2 scoped exactly one CSS addition: `--color-chart-focus: var(--color-blaze);`. That landed correctly. But the diff (commit 968307f "fix: color palette") *also* changed two app-wide tokens: `--color-ash` `#3d3830 → #8c8578` and `--muted-foreground` `#3d3830 → #8c8578` (in both the light `:root` and dark theme blocks). These are global tokens used across every page's muted/secondary text, not just the new note label / chart empty-state. The change is almost certainly beneficial — `#3d3830` on the `#1a0f0d` background was near-invisible, and the new `text-ash` note label + chart empty-state need readable contrast — but it's an undocumented global visual change bundled into a feature branch, and the plan's "What We're NOT Doing" explicitly limited palette work to "only a single new token for this one chart line."
- **Fix A ⭐ Recommended**: Document the palette adjustment as a plan addendum (note it's an accessibility/contrast fix the new `text-ash` elements surfaced).
  - Strength: Preserves a real contrast improvement; updates the source of truth so future reviews don't re-flag it. WCAG contrast on muted text improves everywhere.
  - Tradeoff: Plan gains scope after the fact; the global blast radius (every muted-text surface) isn't visually re-verified page-by-page.
  - Confidence: HIGH — the old value was unreadable on the dark background; lightening it is a clear improvement.
  - Blind spot: Haven't visually confirmed no page *intentionally* relied on the dimmer tone.
- **Fix B**: Scope the override to only the new elements (note label + chart empty-state) instead of mutating the global tokens.
  - Strength: Strict scope discipline; leaves the rest of the UI's theming untouched.
  - Tradeoff: Leaves `--color-ash`/`--muted-foreground` at the near-invisible `#3d3830` everywhere else — likely a pre-existing contrast bug left unfixed.
  - Confidence: MEDIUM — depends whether the dim tone is a bug or a deliberate choice elsewhere.
  - Blind spot: Other pages using `text-ash` may already be hard to read.
- **Decision**: FIXED via Fix A — palette adjustment documented as a plan addendum (plan.md ## Addenda).

### F2 — Note textarea has no maxLength; a >500-char note fails the whole submit

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/session/SessionRunner.tsx:186-193
- **Detail**: `endSessionSchema` caps `note` at 500 chars, but the `<Textarea>` has no `maxLength` attribute. A note over 500 chars is submitted, the API returns 400 ("note must be at most 500 characters"), and `handleRate` surfaces it via `ServerError` while keeping the user on the rating screen. It's recoverable (no data loss — the session isn't ended, the user can shorten and retry) but a client-side `maxLength={500}` would prevent the round-trip and the confusing error entirely. Edge case — 500 chars is a large note.
- **Fix**: Add `maxLength={500}` to the `<Textarea>` in SessionRunner so the client enforces the same cap as the schema.
- **Decision**: FIXED — `maxLength={500}` added to the Textarea (SessionRunner.tsx).
