# Timer State Machine + Finalization Guards -- Implementation Plan

## Overview

Phase 2 of the testing rollout (test-plan §3 row 2). Build the cheapest-layer regression net for risks #1 (timer reconcile across tab background / device sleep), #5 (stuck-open SSR redirect cascade), and #6 (audio chime at focus-end), without paying for a full browser. Production code is refactored to make the three units pure-testable: `useFocusTimer` is lifted out of `SessionRunner` and `resolveSessionPageAccess` is lifted out of `session/[id].astro`. The 50-min SSR vs 2-hour API threshold inconsistency is **pinned as-is** with `TODO(S-05)` markers -- S-05 (`explicit-session-abandon`) owns the actual reconciliation.

## Current State Analysis

Phase 1 of the rollout shipped 14 Vitest integration tests against the API layer using the `workers` project in `vitest.config.ts`. The `jsdom` project is reserved as a commented placeholder ([vitest.config.ts:23-30](vitest.config.ts#L23-L30)) and has zero active tests today. Cookbook §6.2 is `TBD -- see §3 Phase 2`.

What is already in place that this plan builds on:

- **SessionRunner.tsx** at [src/components/session/SessionRunner.tsx:20-130](src/components/session/SessionRunner.tsx) -- single component owning three concerns inline: 1s setTimeout chain with wall-clock derive ([:54-74](src/components/session/SessionRunner.tsx#L54-L74)), `visibilitychange` reconcile with the same formula ([:78-97](src/components/session/SessionRunner.tsx#L78-L97)), and two-stage muted-audio prime + unmuted `.play()` at focus-end ([:31-51](src/components/session/SessionRunner.tsx#L31-L51) + [:64](src/components/session/SessionRunner.tsx#L64)).
- **session/[id].astro** at [src/pages/session/[id].astro:6-44](src/pages/session/[id].astro) -- SSR frontmatter with five redirect paths: missing id, missing supabase client, missing user, row-not-found-or-cross-user (via `.eq("user_id", user.id)` + maybeSingle), already-ended (`data.ended_at !== null`), and abandoned (`ageMs > 2 * FOCUS_PRESET_SECONDS * 1000` = 50 min). `FOCUS_PRESET_SECONDS = 25 * 60` is declared inline.
- **L-02** at [context/foundation/lessons.md:17-25](context/foundation/lessons.md#L17-L25) -- audio prime contract (muted play/pause on mount; fail-open `.catch(() => {})` on unmuted play).
- **L-03** at [context/foundation/lessons.md:29-39](context/foundation/lessons.md#L29-L39) -- timer resilience: derive remaining from `Date.now() - startedAtMs`, never decrement; setTimeout chain (not setInterval); recompute on every visibilitychange.
- **Vitest config** at [vitest.config.ts:4-32](vitest.config.ts) -- single Workers project today; commented jsdom placeholder ready to populate.
- **Phase 1 cookbook §6.1, §6.3** in [context/foundation/test-plan.md:115-142](context/foundation/test-plan.md#L115-L142) -- canonical Workers integration test patterns; §6.2 is the next placeholder this PR fills.

Known threshold inconsistency (test-plan §2 row #5): `[id].astro` redirects at 50 min while `PATCH /api/sessions/[id]` accepts `ended_at` up to 2h old. Roadmap S-05 (`explicit-session-abandon`) is scoped to remove the time-based auto-abandon entirely. This plan does NOT reconcile -- it pins both boundaries so S-05 has a regression target.

## Desired End State

After this plan ships:

- `npm test` runs both projects (workers + jsdom); ~10 new jsdom tests pass alongside the 14 existing workers tests, all green in CI.
- `useFocusTimer` hook is the single owner of the timer state machine; SessionRunner is a thin render-only shell that consumes it. Tests exercise the hook via `renderHook` from `@testing-library/react`.
- `resolveSessionPageAccess(row, nowMs, focusPresetSeconds)` is a pure function in `src/lib/session/access.ts`; `session/[id].astro` calls it instead of inlining the redirect rules. Pure-function tests cover all branches.
- Audio chime contract (L-02) is locked: Stage-2 muted prime is asserted at mount; unmuted `.play()` is asserted at focus-end; both are fail-open.
- Cookbook §6.2 is filled with the canonical jsdom integration pattern derived from this PR; §3 row 2 status is `complete`; §8 freshness ledger date is bumped.
- Single required sabotage gate: loosening the abandoned threshold in `resolveSessionPageAccess` to `Infinity` MUST fail the abandoned-redirect test.

Verification: a CI run on a branch where the visibilitychange effect is removed must fail the reconcile test; a branch where the Stage-2 prime is removed must fail the audio prime test; a branch where the abandoned threshold is widened to `Infinity` must fail the abandoned-redirect test.

### Key Discoveries:

- **L-03's wall-clock derive is testable as a pure expression** -- `remaining = focusSeconds - Math.floor((Date.now() - startedAtMs) / 1000)`. The state machine wrapping it is the part with effects; isolating those effects in a hook is the cheapest path to coverage.
- **jsdom does NOT fire `visibilitychange` automatically** when `document.visibilityState` or `document.hidden` are reassigned. Tests must `Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })` then `document.dispatchEvent(new Event('visibilitychange'))` to drive the listener.
- **`vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','Date'] })`** keeps `Date.now()` and `setTimeout` on the same controlled clock. `vi.advanceTimersByTime(ms)` advances both, so the L-03 derive formula works deterministically without real time.
- **jsdom's `HTMLAudioElement` is hollow** -- `.play()` is a stub that returns `undefined` in some jsdom versions. Stubbing the global `Audio` constructor with a factory returning a mock object (`{ play, pause, muted, currentTime, src, load }`) is the only reliable path.
- **`session/[id].astro` uses `Astro.redirect`** -- a side-effect on the Astro request object. Extracting the decision logic to a pure function that returns a discriminated `{ kind: 'redirect', to } | { kind: 'allow', startedAtMs }` keeps the `.astro` file as a thin orchestrator and makes the decision unit-testable without rendering Astro.
- **The 50-min threshold is anchored to `2 * FOCUS_PRESET_SECONDS`** -- doubling the focus preset. If a future slice changes the focus preset, the abandoned threshold moves with it. The test must encode the **formula** (not a hardcoded 3000 seconds) so it stays correct under refactor.
- **React Compiler is enabled project-wide** ([CLAUDE.md](CLAUDE.md) Key conventions) -- no manual `useMemo` / `useCallback` in the new hook; the compiler handles memoization.
- **`@testing-library/react` v16+** is required for React 19 compatibility; `@testing-library/jest-dom` provides the matchers expected by §6.2's reference test (`toBeInTheDocument`, etc.).

## What We're NOT Doing

- **Not reconciling the 50-min SSR vs 2-hour API threshold inconsistency.** That is S-05 (`explicit-session-abandon`). This plan locks the current behavior as a regression target.
- **Not testing through `session/[id].astro` itself.** The `.astro` file becomes a thin caller of `resolveSessionPageAccess`; tests target the pure function. Astro frontmatter testing is e2e (Phase 4).
- **Not adding Playwright or any e2e infrastructure.** That is test-plan §3 Phase 4.
- **Not asserting `no play() on stop-early` or `cleanup on unmount` for audio.** Risk #6 scope was scoped to "both prime + fire" -- the full transition matrix is over-investment for v1.
- **Not testing the cross-browser autoplay behavior in any automated way.** Browser autoplay variance is uncoverable in jsdom; the manual Safari smoke remains the only signal.
- **Not adding additional sabotage gates beyond the abandoned-threshold one.** The reconcile and audio-prime regressions are caught by the positive assertions themselves; the user-confirmed sabotage requirement is the abandoned-threshold one.
- **Not extracting EnergyPicker or other session components.** Out of scope -- this phase concerns only the timer state machine and SSR redirect cascade.
- **Not changing `vitest.config.ts` workers project shape.** Only the jsdom project is added.

## Implementation Approach

Refactor first, test second. Phase 1 lifts the timer state machine into `useFocusTimer` and the redirect rules into `resolveSessionPageAccess`, leaving SessionRunner and `[id].astro` thin orchestrators. Phase 1 ships a green build without any new tests -- proving the refactor is behavior-preserving via manual smoke. Phases 2-4 then add tests against the new pure surfaces. Phase 5 closes the rollout phase: cookbook §6.2 is filled and §3 row 2 flips to `complete`.

Test layout mirrors §6.1's cookbook style:
- `tests/unit/timer/useFocusTimer.test.ts` -- risk #1
- `tests/unit/session/resolveSessionPageAccess.test.ts` -- risk #5
- `tests/unit/timer/audio.test.ts` -- risk #6 (kept in `timer/` because audio is part of the timer concern)

The Vitest projects array gains a second entry: `name: "jsdom", environment: "jsdom", include: ["tests/unit/**/*.test.ts"], setupFiles: ["./tests/unit/_setup.ts"]`. The setup file installs `@testing-library/jest-dom` matchers and exports common helpers (Audio constructor stub factory, dispatchVisibilityChange).

## Critical Implementation Details

- **Fake-timer scope.** `vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','Date','queueMicrotask'] })` -- `queueMicrotask` is included because `.then(() => { audio.pause(); ... })` on the muted prime resolves through a microtask; tests asserting "prime completed before user input" need it on the same controlled clock. `vi.useRealTimers()` runs in `afterEach`.
- **React `act()` boundaries.** `renderHook` calls into `useFocusTimer` must wrap state-changing operations (`vi.advanceTimersByTime`, manual `visibilitychange` dispatch) in `act()` -- React 19 + RTL emits noisy warnings otherwise. The hook's tick callback updates state, so the timer advance and the visibility dispatch both need `act` wrapping.
- **Visibility-change dispatch.** Tests must reassign `document.visibilityState` (and `document.hidden`) on the document via `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })`, then `document.dispatchEvent(new Event('visibilitychange'))`. Reset both in `afterEach`. Without the defineProperty step, the listener sees the default `'visible'` regardless of what the test "set."
- **Audio constructor stub lifetime.** The stub is installed in a `beforeEach` (`vi.stubGlobal('Audio', ...)`); the per-call mock instances are tracked in a `const audioInstances: AudioMock[] = []` array reset in the same hook. `afterEach` calls `vi.unstubAllGlobals()`. This is the only way the test can distinguish "the prime instance's play()" from "the fire-time instance's play()" when the same hook constructs both.
- **`focusPresetSeconds` is an input.** The hook takes `focusSeconds` as a prop already; the redirect-decider takes `focusPresetSeconds` similarly. Neither function reads the constant directly; tests inject any value and assertions stay pinned to the formula, not to 25 minutes.

## Phase 1: Vitest jsdom Project + Production Refactors

### Overview

Install the jsdom test stack, scaffold the second Vitest project, and lift `useFocusTimer` + `resolveSessionPageAccess` out of their host files. No tests in this phase -- just compilable refactors that pass manual smoke against the dev server. This phase exists separately so Phase 2-4 author tests against a stable surface.

### Changes Required:

#### 1. Dev dependencies

**File**: `package.json`

**Intent**: Add `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, and `@testing-library/dom` (peer) as devDependencies. No app code depends on these.

**Contract**: `devDependencies` gains `jsdom@^25`, `@testing-library/react@^16`, `@testing-library/jest-dom@^6`, `@testing-library/dom@^10`. The existing `test` script is unchanged (`vitest run` continues to run both projects).

#### 2. Vitest jsdom project

**File**: `vitest.config.ts`

**Intent**: Replace the commented placeholder block with a real second projects entry for jsdom.

**Contract**: The `projects` array gains a second object: `{ test: { name: "jsdom", environment: "jsdom", include: ["tests/unit/**/*.test.ts"], setupFiles: ["./tests/unit/_setup.ts"] } }`. The Workers project is untouched. The `onUnhandledError` filter remains shared at the top level.

#### 3. jsdom test setup file

**File**: `tests/unit/_setup.ts` (new)

**Intent**: Install `@testing-library/jest-dom` matchers globally and export shared test helpers (`createAudioMock`, `dispatchVisibilityChange`).

**Contract**: Imports `@testing-library/jest-dom/vitest`. Exports `createAudioMock(): AudioMock` -- factory returning `{ play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), muted: false, currentTime: 0, src: '', load: vi.fn() }`. Exports `dispatchVisibilityChange(state: 'visible' | 'hidden'): void` -- uses `Object.defineProperty` on `document.visibilityState` and `document.hidden`, then dispatches the event. Exports a `stubAudioGlobal(): { instances: AudioMock[]; restore: () => void }` helper for installing/cleanup of the global `Audio` constructor stub.

#### 4. Extract useFocusTimer hook

**File**: `src/lib/timer/useFocusTimer.ts` (new); `src/components/session/SessionRunner.tsx` (modified)

**Intent**: Move the three timer-related useEffects + their state out of SessionRunner into a hook. SessionRunner becomes a render-only component consuming `{ phase, remaining, stopEarly }` plus the rating/submit logic which stays in the component.

**Contract**:
- `useFocusTimer({ startedAtMs, focusSeconds }): { phase: 'running' | 'rating'; remaining: number; stoppedAtMs: number | null; stopEarly: () => void }` -- the hook owns the `phase`, `now`, `stoppedAtMs` state; the setTimeout tick effect; the visibilitychange effect; and the audio prime + fire effects. The audio Audio instance is encapsulated inside the hook (refs).
- SessionRunner now: calls `useFocusTimer(...)`, narrows on `phase`, renders the running view or the rating view (rating logic / `handleRate` / `error` stays in the component since it's tied to the fetch contract, not the timer).
- The hook does NOT export the audio ref -- L-02's prime + fire are an internal contract of the hook.
- The Stage-2 muted prime and the focus-end `.play()` invocation both live inside the hook; the cleanup on unmount still runs.

The hook file has a leading 2-line comment naming L-03 and L-02 as the lessons it enforces.

#### 5. Extract resolveSessionPageAccess

**File**: `src/lib/session/access.ts` (new); `src/pages/session/[id].astro` (modified)

**Intent**: Lift the row-existence, ended-state, and abandoned-age checks out of the `.astro` frontmatter into a pure decider. The `.astro` file still owns the auth check, the Supabase fetch, and the actual `Astro.redirect()` calls -- the decider returns a discriminated result.

**Contract**:
- `resolveSessionPageAccess({ row, nowMs, focusPresetSeconds }): { kind: 'redirect'; to: '/dashboard' } | { kind: 'allow'; startedAtMs: number }` where `row: { id: string; started_at: string; ended_at: string | null; energy_level: string } | null`. Logic: row null -> redirect; `row.ended_at !== null` -> redirect; `nowMs - new Date(row.started_at).getTime() > 2 * focusPresetSeconds * 1000` -> redirect; otherwise `{ kind: 'allow', startedAtMs: new Date(row.started_at).getTime() }`.
- `[id].astro` frontmatter now: keeps the `if (!id)`, `if (!supabase)`, `if (!user)` checks; performs the supabase select; calls `resolveSessionPageAccess({ row: data, nowMs: Date.now(), focusPresetSeconds: FOCUS_PRESET_SECONDS })`; switches on the result kind to either `Astro.redirect("/dashboard")` or read `startedAtMs` from the allow branch.
- `FOCUS_PRESET_SECONDS = 25 * 60` stays declared in the `.astro` file -- it's part of the page contract, not the decider.

A leading 2-line comment in `access.ts` names the threshold inconsistency (`TODO(S-05): the 2*focusPresetSeconds boundary will be removed by roadmap S-05; tests pin current behavior`).

### Success Criteria:

#### Automated Verification:

- `npm install` completes cleanly; `package.json` has the four new dev deps.
- `npm test` exits 0 (existing 14 workers tests still pass; no new tests yet).
- `npm run lint` passes on the two new files and the modified SessionRunner + [id].astro.
- `npm run build` still passes.

#### Manual Verification:

- `npm run dev`; sign in; start a session; verify timer counts down, visibility-switch reconciles correctly, chime fires at focus-end (or fails open), rating submits. The refactor is invisible to the user.
- Manual confirmation: tab background for 30s; on return, remaining time is correct (L-03 reconcile still works).
- Manual confirmation: visit `/session/<id>` for an already-ended session (via DB); redirects to dashboard.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human that the refactor is behavior-preserving before authoring tests in Phase 2.

---

## Phase 2: Timer Tests (Risk #1)

### Overview

Author the jsdom tests against `useFocusTimer` using `renderHook` + fake timers + faked Date. Cover the four risk-#1 scenarios: tick decrements remaining, tick at focus-end snapshots `stoppedAtMs` and flips to rating, visibilitychange reconciles drift, visibilitychange after hidden-elapsed flips to rating with the nominal end time.

### Changes Required:

#### 1. Timer test suite

**File**: `tests/unit/timer/useFocusTimer.test.ts` (new)

**Intent**: Pin the L-03 wall-clock-derive contract and the visibilitychange reconcile path. Each test starts from `Date.now() = startedAtMs` via `vi.setSystemTime`; the hook is rendered with `focusSeconds: 60` (short enough to be readable, large enough to test mid-run state).

**Contract**:

- `describe("useFocusTimer (risk #1: timer reconcile)")` containing four `it` blocks:
  - `it("ticks remaining down once per second")` -- `vi.advanceTimersByTime(3000)`; assert `result.current.remaining === 57`; `phase === 'running'`.
  - `it("snapshots stoppedAtMs and flips to rating when focus elapses")` -- `vi.advanceTimersByTime(60_000)`; assert `phase === 'rating'`; `stoppedAtMs === startedAtMs + 60_000`. Comment cites L-03: "stoppedAtMs is the **nominal** end time, not Date.now() at the moment the tick fired -- protects duration_seconds from rating-screen latency."
  - `it("reconciles after tab background: visibilitychange visible computes remaining from wall clock")` -- `vi.advanceTimersByTime(5_000)` (5s in); dispatch hidden; `vi.advanceTimersByTime(30_000)` (25s of hidden elapsed wall-clock); dispatch visible; assert `remaining === 60 - 35 = 25` immediately (not 55 -- this would be the broken decrement-only behavior).
  - `it("flips to rating on visibilitychange visible if focus elapsed while hidden")` -- dispatch hidden; `vi.advanceTimersByTime(70_000)` (focus + 10s); dispatch visible; assert `phase === 'rating'`; `stoppedAtMs === startedAtMs + 60_000` (the nominal end, not `startedAtMs + 70_000`).

A leading file comment names L-03 and the cheapest-layer guidance from test-plan §2 row #1.

#### 2. Stop-early coverage

**File**: `tests/unit/timer/useFocusTimer.test.ts` (same file)

**Intent**: One additional test pins `stopEarly()` semantics so a regression in the stop-early path doesn't slip through.

**Contract**: `it("stopEarly snapshots Date.now() and flips to rating")` -- `vi.advanceTimersByTime(20_000)`; `act(() => result.current.stopEarly())`; assert `phase === 'rating'`; `stoppedAtMs === startedAtMs + 20_000` (actual elapsed, NOT the nominal end -- the L-03 + FR-012 contract for stop-early).

### Success Criteria:

#### Automated Verification:

- [ ] `npm test -- tests/unit/timer/useFocusTimer.test.ts` exits 0 with five tests passing.
- [ ] `npm run lint` passes on the new file.
- [ ] `npm test` (both projects) exits 0 with 14 workers + 5 jsdom = 19 total tests passing.

#### Manual Verification:

- Run the suite three times in a row; no flakiness from microtask race conditions.

**Implementation Note**: After Phase 2's automated verification passes, pause for manual confirmation that fake-timer + visibilitychange interaction is stable before continuing.

---

## Phase 3: Stuck-Open SSR Guard Tests (Risk #5)

### Overview

Pure unit tests on `resolveSessionPageAccess`. No jsdom-specific APIs needed -- the function is pure -- but the test still lives in `tests/unit/` because it shares the jsdom project's lighter setup. Covers all redirect branches plus the allow branch. **Includes the one required sabotage gate.**

### Changes Required:

#### 1. SSR redirect-decider tests

**File**: `tests/unit/session/resolveSessionPageAccess.test.ts` (new)

**Intent**: Pin the four redirect branches and the allow branch using the `2 * focusPresetSeconds` formula, not a hardcoded boundary.

**Contract**:

- `describe("resolveSessionPageAccess (risk #5: stuck-open SSR guard)")` containing five `it` blocks. Each test constructs a row via a small `makeRow(overrides)` helper at the top of the file; `focusPresetSeconds` is held at 1500 (25 * 60) for clarity but referenced via a `const FOCUS = 1500` so the boundary formula is visible.
  - `it("redirects when row is null (not found or cross-user)")` -- `resolveSessionPageAccess({ row: null, nowMs: 0, focusPresetSeconds: FOCUS })` -> `{ kind: 'redirect', to: '/dashboard' }`.
  - `it("redirects when ended_at is non-null (already-ended replay guard)")` -- row with `ended_at: '2026-06-23T10:00:00Z'`, started_at recent; expect redirect.
  - `it("redirects when started_at is older than 2 * focusPresetSeconds (abandoned guard) -- TODO(S-05)")` -- `nowMs - startedMs = 2 * FOCUS * 1000 + 1`; expect redirect. Leading comment: `// TODO(S-05): boundary will be removed by roadmap S-05 (explicit abandon). This test pins current 50-min behavior as a regression target until S-05 ships.`
  - `it("allows when started_at is exactly at the abandoned boundary")` -- `nowMs - startedMs = 2 * FOCUS * 1000`; expect `{ kind: 'allow', startedAtMs }`. (Boundary is `>`, not `>=`, per the source.)
  - `it("allows valid running session and returns startedAtMs")` -- row with `ended_at: null` and `started_at` 5 minutes ago; expect `{ kind: 'allow', startedAtMs: <epoch> }`.

A leading file comment cites test-plan §2 row #5 and names the threshold inconsistency the suite intentionally locks.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test -- tests/unit/session/resolveSessionPageAccess.test.ts` exits 0 with five tests passing.
- [ ] `npm run lint` passes.
- [ ] **Required sabotage gate**: change the threshold in `resolveSessionPageAccess` from `2 * focusPresetSeconds * 1000` to `Infinity`; `npm test` fails the abandoned-guard test with a clear message; revert.

#### Manual Verification:

- Re-read the boundary test cases; confirm the formula (not a hardcoded constant) is what's being asserted.

**Implementation Note**: After Phase 3 passes including the sabotage check, pause for manual confirmation that the regression net actually trips before adding the audio coverage in Phase 4.

---

## Phase 4: Audio Tests (Risk #6)

### Overview

Two tests that lock the L-02 contract: Stage-2 muted prime on mount; `.play()` invoked at the focus-end transition; both fail-open. Global `Audio` constructor stubbed via the helper from `tests/unit/_setup.ts`.

### Changes Required:

#### 1. Audio test suite

**File**: `tests/unit/timer/audio.test.ts` (new)

**Intent**: Render `useFocusTimer` with the global `Audio` stub installed; assert the prime sequence on mount and the fire on focus-end. Use the `stubAudioGlobal` helper from setup so each test gets a fresh `instances` array.

**Contract**:

- `describe("useFocusTimer audio (risk #6: chime at focus-end -- L-02)")` containing two `it` blocks:
  - `it("Stage-2 prime: muted play() then pause() on mount")` -- render the hook; flush microtasks (`await vi.runAllTimersAsync()` or `await Promise.resolve()` chain); read `instances[0]`; assert `instances[0].muted` was set to `true` then to `false`; `instances[0].play` was called twice (once muted, once at fire-time would be later -- here only the prime call); `instances[0].pause` was called once.
  - `it("fires audio.play() at focus-end transition and is fail-open if the promise rejects")` -- render with `focusSeconds: 5`; override `instances[0].play` to `vi.fn().mockRejectedValue(new Error('autoplay blocked'))`; `vi.advanceTimersByTime(5_000)`; assert `instances[0].play` was called at the focus-end transition AND `phase === 'rating'` despite the rejection (fail-open contract).

A leading comment names L-02 and the cheapest-layer guidance from test-plan §2 row #6.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test -- tests/unit/timer/audio.test.ts` exits 0 with two tests passing.
- [ ] `npm run lint` passes.
- [ ] `npm test` (both projects) exits 0 with 14 workers + ~10 jsdom = ~24 total tests passing.

#### Manual Verification:

- Re-run the suite three times; assert no `vi.stubGlobal` leak across files (each test starts fresh).
- Manual Safari smoke (test-plan §2 row #6 explicitly calls this out): start a session, run for the focus duration, confirm the chime fires. Tests cannot cover real-browser autoplay variance.

**Implementation Note**: After Phase 4 passes, pause for manual confirmation that the Safari smoke still works before closing out the rollout phase.

---

## Phase 5: Cookbook §6.2 + Test-Plan Status Bump

### Overview

Fill the §6.2 placeholder with the canonical jsdom integration pattern from this PR, bump §3 row 2 to `complete`, and update the §8 freshness ledger.

### Changes Required:

#### 1. Test plan cookbook §6.2

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `§6.2 Adding a Vitest jsdom integration test (timer or component logic)` placeholder with a canonical pattern derived from the three test files this PR adds.

**Contract**: §6.2 section becomes:
- **Location**: `tests/unit/<concern>/<name>.test.ts` -- pure unit tests live alongside concern (e.g. `tests/unit/timer/useFocusTimer.test.ts`, `tests/unit/session/resolveSessionPageAccess.test.ts`). One file per hook or pure function.
- **Pattern**:
  1. Import `vi`, `describe`, `it`, `expect`, `beforeEach`, `afterEach` from `vitest`.
  2. For hook tests: import `renderHook`, `act` from `@testing-library/react`.
  3. For tests touching Date / setTimeout: `beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','Date','queueMicrotask'] }))`; `afterEach(() => vi.useRealTimers())`.
  4. For visibilitychange: use `dispatchVisibilityChange('hidden')` / `dispatchVisibilityChange('visible')` from `tests/unit/_setup.ts`.
  5. For audio: use `stubAudioGlobal()` from `tests/unit/_setup.ts`; access mock instances via the returned `instances` array; call `restore()` in `afterEach`.
  6. Always wrap timer advances and event dispatches in `act(() => ...)` when testing hooks.
- **Reference test**: `tests/unit/timer/useFocusTimer.test.ts` -- specifically the "reconciles after tab background" test as the canonical L-03 regression gate template.
- **Run locally**: `npm test` (both projects); `npm test -- tests/unit/...` (jsdom only by include filter); `npx vitest --project jsdom` (jsdom project watch mode).

#### 2. Test plan §3 status bump

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 2 complete in the rollout table.

**Contract**: §3 row 2 (`Timer state machine + finalization guards`) `Status` column changes from `change opened` to `complete`. The `Last updated:` line at the top of the file bumps to the merge date.

#### 3. Test plan §8 freshness ledger

**File**: `context/foundation/test-plan.md`

**Intent**: Update the strategy / stack-verified dates to reflect the Phase 2 review.

**Contract**: §8 first bullet updates from `2026-06-21` to the merge date. Stack-versions line gets a sub-line: `- @testing-library/react, @testing-library/jest-dom, jsdom: <merge date>` if not already present.

### Success Criteria:

#### Automated Verification:

- [ ] `git diff context/foundation/test-plan.md` shows only the §6.2 fill-in, §3 row 2 status, "Last updated" line, and §8 freshness ledger edits -- no other §1-§5 or §7 changes.

#### Manual Verification:

- Re-read `test-plan.md` §6.2 cold -- can a contributor unfamiliar with the jsdom test files add a new timer/hook test from these instructions alone?
- Re-read §3; Phase 3 (Production schema validation gate) is the next pending phase and the orchestrator handoff is clear.

**Implementation Note**: After Phase 5 lands, run `/10x-archive test-timer-sm` to close out the change folder.

---

## Testing Strategy

This plan IS the testing strategy for risks #1, #5, #6. The tests live in `tests/unit/` and run under the new `jsdom` Vitest project. There are no e2e tests in this phase -- the cheapest signal for the risks at hand is hook + pure-function level.

### Manual Testing Steps:

1. **Local boot**: clone branch -> `npm install` -> `npm test` -- confirm both projects run; 14 workers + ~10 jsdom = ~24 tests pass.
2. **Behavior preservation check**: `npm run dev`; start a session; verify timer counts down, tab-background recovery is correct, chime fires (or fails open). The refactor must be invisible.
3. **Risk #1 sabotage**: comment out the visibilitychange effect in `useFocusTimer`; `npm test` -> reconcile test fails; revert.
4. **Risk #5 required sabotage**: change the abandoned threshold in `resolveSessionPageAccess` to `Infinity`; `npm test` -> abandoned-guard test fails; revert. **This sabotage is the only required gate.**
5. **Risk #6 sabotage**: delete the Stage-2 muted prime block in `useFocusTimer`; `npm test` -> prime test fails; revert.
6. **Safari smoke**: manual session run in Safari; chime fires at focus-end (or fails silently without breaking the rating screen).

## Performance Considerations

The jsdom suite is fast: 10 tests, all pure (no network, no I/O), fake-timer-driven. Expected walltime: <2 seconds total. The full suite (workers + jsdom) stays well under the 60-second future-flag threshold called out in Phase 1's perf notes.

## Migration Notes

No data migration. No schema changes. No production runtime behavior changes -- the two refactors (`useFocusTimer`, `resolveSessionPageAccess`) are behavior-preserving by construction. Manual smoke in Phase 1 is the verification.

## References

- Test plan strategy: [context/foundation/test-plan.md](context/foundation/test-plan.md) §1-§5
- Test plan §2 row #1, #5, #6 risk response guidance (the partial frame for this phase): [context/foundation/test-plan.md:53-59](context/foundation/test-plan.md#L53-L59)
- L-02 (audio prime): [context/foundation/lessons.md:17-25](context/foundation/lessons.md#L17-L25)
- L-03 (timer reconcile): [context/foundation/lessons.md:29-39](context/foundation/lessons.md#L29-L39)
- SessionRunner (refactor target): [src/components/session/SessionRunner.tsx](src/components/session/SessionRunner.tsx)
- session/[id].astro (refactor target): [src/pages/session/[id].astro](src/pages/session/[id].astro)
- Vitest config (project to extend): [vitest.config.ts](vitest.config.ts)
- Phase 1 reference plan: [context/archive/2026-06-21-testing-api-contract/plan.md](context/archive/2026-06-21-testing-api-contract/plan.md)
- Roadmap S-05 (will reconcile the threshold inconsistency this phase locks): [context/foundation/roadmap.md:136-148](context/foundation/roadmap.md#L136-L148)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` -- <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest jsdom Project + Production Refactors

#### Automated

- [x] 1.1 `npm install` completes cleanly; `package.json` has the four new dev deps -- 06490d4
- [x] 1.2 `npm test` exits 0 (existing 14 workers tests still pass; no new tests yet) -- 06490d4
- [x] 1.3 `npm run lint` passes on the two new files and the modified SessionRunner + [id].astro -- 06490d4
- [x] 1.4 `npm run build` still passes -- 06490d4

#### Manual

- [x] 1.5 Manual session run: timer counts down, visibility-switch reconciles, chime fires, rating submits -- refactor is invisible -- 06490d4
- [x] 1.6 Tab-background recovery: 30s background then return -- remaining time is correct -- 06490d4
- [x] 1.7 Already-ended session URL redirects to dashboard -- 06490d4

### Phase 2: Timer Tests (Risk #1)

#### Automated

- [x] 2.1 `npm test -- tests/unit/timer/useFocusTimer.test.ts` exits 0 with five tests passing
- [x] 2.2 `npm run lint` passes on the new file
- [x] 2.3 `npm test` (both projects) exits 0 with 14 workers + 5 jsdom = 19 total tests passing

#### Manual

- [x] 2.4 Run the suite three times in a row; no flakiness from microtask races

### Phase 3: Stuck-Open SSR Guard Tests (Risk #5)

#### Automated

- [ ] 3.1 `npm test -- tests/unit/session/resolveSessionPageAccess.test.ts` exits 0 with five tests passing
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 Required sabotage gate: threshold loosened to `Infinity` makes the abandoned-guard test fail; revert

#### Manual

- [ ] 3.4 Re-read boundary tests; confirm the formula (not a hardcoded constant) is what's being asserted

### Phase 4: Audio Tests (Risk #6)

#### Automated

- [ ] 4.1 `npm test -- tests/unit/timer/audio.test.ts` exits 0 with two tests passing
- [ ] 4.2 `npm run lint` passes
- [ ] 4.3 `npm test` (both projects) exits 0 with all ~24 tests passing

#### Manual

- [ ] 4.4 Run suite three times; no `vi.stubGlobal` leak across files
- [ ] 4.5 Safari smoke: chime fires (or fails open) at focus-end in real Safari

### Phase 5: Cookbook §6.2 + Test-Plan Status Bump

#### Automated

- [ ] 5.1 `git diff context/foundation/test-plan.md` shows only the §6.2, §3 row 2 status, "Last updated", and §8 ledger edits

#### Manual

- [ ] 5.2 Re-read §6.2 cold; a contributor can add a new timer/hook test from the instructions alone
- [ ] 5.3 Re-read §3; Phase 3 of the rollout (Production schema validation gate) is the next clear handoff
