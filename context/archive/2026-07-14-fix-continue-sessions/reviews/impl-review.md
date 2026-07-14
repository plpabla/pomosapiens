<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Preserve break on continue + preset-carrying redirect after break

- **Plan**: context/changes/fix-continue-sessions/plan.md
- **Scope**: Phase 1 & 2 of 2 (both complete)
- **Date**: 2026-07-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `mode` reverted to `useState`, reintroducing bug 9.1 (last-used mode not restored on SSR)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/session/EnergyPicker.tsx:35-36
- **Detail**: The prior design read `mode` directly from `useLastMode()` (a `useSyncExternalStore` store) specifically so it is SSR-hydration-safe — see the docstring in `useLastMode.ts:6-9` and the regression comment in `EnergyPicker.test.tsx:2` ("mode initialisation must be SSR-safe — no localStorage on first render"). Phase 2 changed this to `const [mode, setMode] = useState<Mode>(isMode(initialMode) ? initialMode : lastMode)`. During Astro's server render + client hydration, `useSyncExternalStore` returns the **server** snapshot (`"preset_1"`) on the first (hydration) render. The `useState` initializer captures that frozen value; when the store re-renders post-hydration with the real localStorage value (e.g. `"preset_3"`), `lastMode` updates but `mode` does not. Net effect: on a **plain visit to `/session/new`** (no `initialMode` query param), a returning user's last-used preset chip is no longer pre-selected — it always shows P1. The redirect case (Phase 2's `initialMode` present) is unaffected. The plan itself specified this local-`useState` approach (Phase 2 §4), so the plan was flawed here. The existing regression test at `EnergyPicker.test.tsx:35` still passes because Testing Library does a client-only render (no hydration), so it cannot reproduce the SSR path — the guardrail is blind to this regression.
- **Fix**: Keep `mode` reactive to the store; use an override only for the URL prefill. Replace the `useState<Mode>` with:
  ```ts
  const [modeOverride, setModeOverride] = useState<Mode | null>(isMode(initialMode) ? initialMode : null);
  const mode = modeOverride ?? lastMode;
  function handleModeChange(next: Mode) {
    setModeOverride(next);
    persistMode(next);
  }
  ```
  This preserves URL-prefill precedence (count-up after continue), restores reactive last-mode on plain visits, and still persists on change.
  - Strength: Restores the exact SSR-safe invariant `useLastMode` was built for; keeps Phase 2's prefill behavior intact; small, local edit.
  - Tradeoff: Minor — one hook shape change; `handleModeChange` unchanged in behavior.
  - Confidence: HIGH — matches documented `useSyncExternalStore` hydration semantics (server snapshot returned during hydration render) and the prior working design.
  - Blind spot: Not verified against a live SSR reload since `npm test` can't exercise hydration; recommend a manual reload of `/session/new` with a non-P1 last mode.
- **Decision**: FIXED — applied override + derived-mode (EnergyPicker.tsx:35-42); lint + 7 EnergyPicker unit tests green.

### F2 — Stale topic/format reconciliation implemented as derived value, not the planned effect

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/session/EnergyPicker.tsx:45-49
- **Detail**: The plan (Phase 2 §4 and Critical Details) called for "an effect gated on catalog-loaded that resets `topicId`/`materialFormatId` to null". The implementation instead **derives** `resolvedTopicId`/`resolvedFormatId` during render and feeds those to the form and submit. This is a benign, arguably better deviation (no extra render, no state-syncing effect, React-Compiler-friendly). Correctness holds: a stale id is masked and never selectable, and submit uses the resolved (null) value. Raw `topicId` state retains the stale id but is never surfaced. No action needed — noted for plan-vs-actual transparency.
- **Fix**: None — accept the derived approach.
- **Decision**: ACCEPTED — observation only, no action.

### F3 — Unplanned `loaded` field added to `useTopicsAndFormats`

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/session/useCatalog.ts:9,36
- **Detail**: `useCatalog.ts` is not in the plan's file list, but Phase 2 §4 requires a "catalog-loaded" signal for reconciliation. The hook already tracked `loaded` internally; the change only exposes it in the return type. Minimal, additive, and directly in service of a planned change — not scope creep.
- **Fix**: None — necessary support for the planned reconciliation.
- **Decision**: ACCEPTED — observation only, no action.
