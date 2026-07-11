<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Refactor React Components

- **Plan**: context/changes/refactor-react-components/plan.md
- **Scope**: Phases 1–8 of 8 (full plan)
- **Date**: 2026-07-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-verified at review time: `npm run lint` clean, `npm test` 220/220 pass (32 files), `npm run build` succeeds. E2E is environment-gated (Supabase + Playwright not running at review time); the plan's Progress records each phase's affected e2e as green, with a documented pre-existing `session-capture` flake unrelated to this work (Phase 2 note).

## Findings

### F1 — Tile island consolidation shifts CompletedSessionActions from `client:visible` to eager hydration

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/session/SessionTile.tsx:40 (and src/pages/dashboard.astro)
- **Detail**: The old dashboard mounted three islands per tile; `CompletedSessionActions` was `client:visible` (lazy-hydrate on scroll). Phase 6 folds the whole list into one `<SessionList client:load>` island, so nested `CompletedSessionActions` (with its Edit dialog) now hydrates eagerly with the list instead of when scrolled into view. Output/behavior is preserved — this is a hydration-timing/JS-cost delta only, capped at the 50-row session limit. This is a direct, plan-sanctioned consequence of the island consolidation (plan §Performance Considerations frames it as a net reduction in hydration entry points), and the tradeoff (fewer boundaries vs. eager hydration of edit dialogs) is not explicitly called out.
- **Fix**: Accept as intended — the 50-row cap makes eager hydration negligible; optionally add a one-line note to the plan's Performance Considerations acknowledging the `visible → load` timing shift so future readers don't read it as accidental.
- **Decision**: FIXED — added note to plan.md's Performance Considerations section

### F2 — EnergyPicker presets fetch split changes failure isolation vs. the old single Promise.all

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/session/EnergyPicker.tsx:24-42
- **Detail**: Originally topics + formats + presets loaded in one `Promise.all`, so any single failure left all three empty behind the error banner. Phase 3/7 loads topics/formats via `useTopicsAndFormats` and presets in a separate effect (`loadError = catalogLoadError ?? presetsLoadError`). If only the presets fetch fails, topics/formats now still populate (previously blank). The error banner still renders the same string and the form still renders, so no user-facing regression — a subtle resilience improvement. This split is explicitly mandated by the plan ("useCatalog must not swallow the presets fetch"), so it is intended, but it is a genuine behavior delta against the "byte-identical parity" bar and is worth recording.
- **Fix**: Accept — the divergence is plan-required and strictly more resilient; no code change needed.
- **Decision**: ACCEPTED — plan-required, strictly more resilient, no code change needed

### F3 — `useCatalog` uses raw `fetch` + inline `throw` instead of the Phase 1 `fetchJson` helper the plan named

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/session/useCatalog.ts:18-25
- **Detail**: Phase 3's contract said the hook fetches `/api/topics` + `/api/material-formats` "in a `Promise.all` via `fetchJson`". The implementation instead does raw `fetch` with an inline `if (!r.ok) throw` inside the `Promise.all`, caught to `loadError`. Behavior is equivalent (throws on `!ok`, mapped to the same `loadError` string), but it bypasses the very helper Phase 1 promoted to eliminate hand-rolled fetch+unwrap — a minor internal inconsistency, not a defect.
- **Fix**: Optionally route the two GETs through `fetchJson` to match the plan's stated mechanism and the de-duplication intent; leave as-is if the inline shape reads more clearly for the parallel load.
- **Decision**: FIXED — routed both GETs through `fetchJson` in useCatalog.ts; updated EditSessionDialog.test.tsx's exact-fetch-args assertion to match the new call shape (`expect.anything()` for the options object). Lint clean, full suite (220/220) passes.
