# Timer State Machine + Finalization Guards -- Plan Brief

> Full plan: `context/changes/test-timer-sm/plan.md`

## What & Why

Phase 2 of the testing rollout (test-plan §3 row 2). Build the cheapest-layer regression net for three high-risk timer concerns: tab-background reconcile (risk #1), stuck-open SSR redirect cascade (risk #5), and audio chime invocation at focus-end (risk #6). The why: the test-plan §2 risk response table already names these as the top failure scenarios this product must protect against, and the cheapest test that gives real signal for each is jsdom-level -- no Playwright needed.

## Starting Point

Phase 1 of the rollout (testing-api-contract) shipped 14 Vitest integration tests against the API layer using a single `workers` project in `vitest.config.ts`; the `jsdom` project is reserved as a commented placeholder and has zero tests. SessionRunner.tsx owns the timer state machine inline (tick + visibilitychange + audio prime, all useEffects in one component); session/[id].astro inlines the row-existence / ended / abandoned-age redirect rules in its frontmatter.

## Desired End State

A second `jsdom` Vitest project runs ~10 new tests alongside the existing 14. The timer state machine lives in a `useFocusTimer` hook and is tested via `renderHook` + fake timers. The SSR redirect cascade lives in a pure `resolveSessionPageAccess(row, nowMs, focusPresetSeconds)` decider and is tested via direct calls. The L-02 audio contract is locked at both the Stage-2 prime step and the focus-end fire step. The 50-min SSR vs 2-hour API threshold inconsistency is pinned (not fixed) with `TODO(S-05)` markers. Cookbook §6.2 is filled in.

## Key Decisions Made

| Decision                | Choice                                                             | Why (1 sentence)                                                                                        | Source |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------ |
| Test target             | Extract a `useFocusTimer` hook from SessionRunner                  | Pure-testable surface beats full-component render; pays the refactor cost once for cheap tests forever. | Plan   |
| SSR redirect coverage   | Extract `resolveSessionPageAccess` from .astro into a pure decider | `.astro` frontmatter is uneconomical to unit-test; the decider is.                                      | Plan   |
| Threshold inconsistency | Lock current behavior with TODO(S-05)                              | This is a test phase; S-05 owns the actual reconciliation.                                              | Plan   |
| Time mocking            | `vi.useFakeTimers` faking setTimeout + Date + queueMicrotask       | Deterministic and matches L-03's wall-clock-derive pattern.                                             | Plan   |
| Audio mocking           | Stub global `Audio` constructor with a factory + instance array    | jsdom's HTMLAudioElement is hollow; constructor stub gives access to per-instance mocks.                | Plan   |
| Hook extraction shape   | `useFocusTimer` React hook (not pure reducer)                      | Keeps the visibilitychange / audio effects co-located with their state.                                 | Plan   |
| Audio coverage scope    | Both Stage-2 prime AND focus-end fire                              | Locks the full L-02 contract; single-side coverage leaves silent regressions.                           | Plan   |
| Required sabotage gate  | Only the abandoned-threshold one (loosen to Infinity -> fails)     | User-confirmed minimal gate; positive assertions catch the reconcile + audio regressions inline.        | Plan   |

## Scope

**In scope:**

- Add jsdom Vitest project + setup file + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` dev deps
- Extract `useFocusTimer` hook from SessionRunner.tsx (behavior-preserving refactor)
- Extract `resolveSessionPageAccess` from session/[id].astro into `src/lib/session/access.ts`
- Tests: `tests/unit/timer/useFocusTimer.test.ts` (5 tests, risk #1), `tests/unit/session/resolveSessionPageAccess.test.ts` (5 tests, risk #5), `tests/unit/timer/audio.test.ts` (2 tests, risk #6)
- One sabotage gate (abandoned threshold)
- Fill cookbook §6.2 in test-plan.md; bump §3 row 2 to `complete`; update §8 freshness ledger

**Out of scope:**

- Reconciling the 50-min SSR vs 2-hour API threshold (S-05's job)
- Playwright / e2e (test-plan §3 Phase 4)
- Testing through `session/[id].astro` itself (covered by Phase 4 e2e)
- Cross-browser autoplay automation (uncoverable in jsdom; manual Safari smoke is the only signal)
- Additional sabotage gates beyond the abandoned-threshold one
- Refactoring EnergyPicker or other session components

## Architecture / Approach

Refactor first, test second. Phase 1 lifts the timer state machine into `useFocusTimer` and the redirect rules into `resolveSessionPageAccess` -- no tests yet, manual smoke proves the refactor preserves behavior. Phases 2-4 author tests against the new pure surfaces. Phase 5 fills the cookbook and closes the rollout phase. The two test files target the two extracted modules independently; the audio test re-uses the timer hook with a stubbed `Audio` global.

## Phases at a Glance

| Phase                                          | What it delivers                                                            | Key risk                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Vitest jsdom project + production refactors | jsdom project wired; `useFocusTimer` + `resolveSessionPageAccess` extracted | Refactor changes observable behavior (caught by manual smoke)                |
| 2. Timer tests (risk #1)                       | 5 tests pinning tick, reconcile, hidden-elapsed flip, stop-early            | Microtask + fake-timer race conditions on React 19 + RTL                     |
| 3. Stuck-open SSR guard tests (risk #5)        | 5 pure-function tests + required sabotage gate                              | Boundary semantics (`>` vs `>=`) drift from source                           |
| 4. Audio tests (risk #6)                       | 2 tests pinning L-02 prime + fire                                           | `vi.stubGlobal` leak across files; React `act()` warnings                    |
| 5. Cookbook §6.2 + status bump                 | Canonical jsdom pattern documented; rollout phase closed                    | §6.2 doesn't transfer to a contributor reading cold (test in Phase 5 manual) |

**Prerequisites:** Phase 1 of the rollout (testing-api-contract) is complete and merged. `npm test` works locally against the workers project.
**Estimated effort:** ~3-4 sessions across 5 phases. Bulk is in Phase 1 (refactor + tooling) and Phase 2 (first real jsdom test asserting a fake-timer + visibilitychange interaction).

## Open Risks & Assumptions

- **React 19 + Testing Library hook timing.** `act()` boundaries around `vi.advanceTimersByTime` may need tuning; if `act` warnings start fighting fake timers, fall back to wrapping every advance in an explicit `await act(async () => { vi.advanceTimersByTime(...); })` form.
- **`useFocusTimer` is behavior-preserving by construction.** Phase 1 manual smoke is the only verification of this -- the extraction is mechanical but the assumption is load-bearing for Phases 2-4.
- **`vi.stubGlobal('Audio', ...)` semantics across the jsdom project.** Assumed to be per-test-file via `beforeEach`/`afterEach`. If state leaks across files, the audio test will need a Vitest project-level setup.
- **The `2 * focusPresetSeconds` formula is the canonical source of truth for the abandoned threshold.** S-05 will remove it; until then, both the source and the tests must encode the formula, not a hardcoded 3000 seconds.

## Success Criteria (Summary)

- `npm test` runs both Vitest projects; ~24 tests pass (14 workers + ~10 jsdom).
- A branch where the abandoned-redirect threshold is loosened to `Infinity` fails the sabotage gate.
- A contributor can read `test-plan.md` §6.2 cold and add a new timer/hook test without reading the existing files.
