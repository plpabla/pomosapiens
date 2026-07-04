<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Editable Timer Presets and Count-Up Session Mode (S-03)

- **Plan**: [context/changes/timer-presets/plan.md](context/changes/timer-presets/plan.md)
- **Scope**: Full plan (Phases 1–8 + Phase 9 bugfix). Phases 1–2 were reviewed separately in [impl-review-phase-1-2.md](context/changes/timer-presets/reviews/impl-review-phase-1-2.md) and its 7 findings are all decided; this review focuses on Phases 3–9 and does not re-open Phase 1–2 findings.
- **Date**: 2026-07-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

**Automated criteria verified locally:** `npm run lint` clean, `npm run build` succeeds, `npm test` = 110/110 pass. `db:test` and `test:e2e` not re-run in this session; per-phase Progress records their prior green runs at the commits noted in the plan.

**Plan adherence summary:** every planned change under Phases 3–8 exists and matches intent (see per-phase mapping in the drift sub-agent's evidence). The only wire deviation is the Phase 8 test file, which lives at [tests/unit/session/resolveSessionPageAccess.test.ts](tests/unit/session/resolveSessionPageAccess.test.ts) instead of the plan-named `src/lib/session/access.test.ts` — same coverage, different location. Phase 9 was an unplanned bugfix (`aaf5153` — `useSyncExternalStore` for the last-used mode) but is documented in the plan's Progress and is self-contained.

**Scope discipline:** no `user_profiles` table, no editable break-only mode, no mid-session preset edit affecting running sessions, no second chime asset, no FR-018 tab-title timer, no session note input, no chime on count-up `stopEarly()`, no legacy backfill. Clean.

**L-contract check:**
- L-01 holds — [src/pages/api/sessions/index.ts:32-45](src/pages/api/sessions/index.ts#L32-L45) hand-picks columns after the POST widening; PATCH surface unchanged.
- L-02 holds at the contract level — the same primed `audioRef` is used at focus-end ([src/lib/timer/useFocusTimer.ts:88](src/lib/timer/useFocusTimer.ts#L88), [:111](src/lib/timer/useFocusTimer.ts#L111)) and break-end ([src/lib/timer/useBreakTimer.ts:45-51](src/lib/timer/useBreakTimer.ts#L45-L51)), never a fresh `new Audio(src)` at fire time, with `.catch(() => {})` on every play call.
- L-03 holds — both hooks derive from `Date.now() - startedAtMs` on every `setTimeout` tick and on `visibilitychange`; the break countdown is correctly anchored to `breakStartedAtMs`, not `started_at`.

## Findings

### F1 — Break-navigate installs a listener + fallback timeout with no unmount cleanup

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: [src/components/session/SessionRunner.tsx:43-62](src/components/session/SessionRunner.tsx#L43-L62)
- **Detail**: The inline `onComplete` passed to `useBreakTimer` registers `audio.addEventListener("ended", go, { once: true })` and a `setTimeout(go, 5000)` fallback but never clears the `setTimeout` id or removes the "ended" listener. In practice `go` calls `window.location.assign("/dashboard")` which triggers a full navigation and the document is torn down — so real leak risk is small. The bigger smell is the callback lives in render-time closure inside a hook argument; a defensive cleanup + `useEffect`-driven lifecycle would age better as the component grows.
- **Fix**: Capture the timeout id, clear it and `removeEventListener("ended", go)` inside `go()`. Or, cleaner: hoist the wait-then-navigate into a `useEffect` gated on `internalPhase === "running_break"` completion, returning a cleanup that clears both.
- **Decision**: FIXED — hoisted into a `useEffect` gated on a new `breakComplete` state flag set from `onComplete`; cleanup clears the timeout and removes the "ended" listener on unmount.

### F2 — `localStorage` reads/writes are unguarded and can crash on hydration

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: [src/components/session/EnergyPicker.tsx:24-35](src/components/session/EnergyPicker.tsx#L24-L35)
- **Detail**: `getModeSnapshot` calls `localStorage.getItem` unconditionally and `persistMode` calls `setItem` unconditionally. `useSyncExternalStore` runs `getModeSnapshot` synchronously during hydration and on every re-render on the client. If localStorage is disabled by policy or the origin is opaque (Safari private mode still throws in some configurations, embedded webviews, storage-partitioned iframes), the store throws and the component crashes on hydration — the whole `/dashboard` start-flow blanks out. This mirrors the fail-open policy the codebase already uses for audio.
- **Fix**: Wrap both bodies in `try/catch`; on read failure return `"preset_1"`, on write failure swallow silently.
- **Decision**: FIXED — `getModeSnapshot`/`persistMode` wrapped in try/catch, failing open to `"preset_1"` on read and swallowing write failures.

### F3 — `useFocusTimer` missing single-fire guard against tick + visibility double play

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: [src/lib/timer/useFocusTimer.ts:86-92](src/lib/timer/useFocusTimer.ts#L86-L92), [:108-115](src/lib/timer/useFocusTimer.ts#L108-L115)
- **Detail**: `useBreakTimer` uses a `firedRef` to guarantee the chime + `onComplete` fire exactly once ([useBreakTimer.ts:45-51](src/lib/timer/useBreakTimer.ts#L45-L51)). `useFocusTimer` has no equivalent. Both the tick effect and the `visibilitychange` handler check `remaining <= 0` and independently call `audioRef.current?.play()` + `setPhase("rating")`. React batches state updates, but the two handlers can each read `stoppedAtMs === null` and both invoke `.play()` before the flip lands — Safari and Chrome will honor the second call and stack a second chime overlap. The rating-flip is idempotent; the double chime is the only user-visible side effect. Narrow race, but explicit.
- **Fix**: Add a `firedRef` in `useFocusTimer` mirroring `useBreakTimer`: guard both handlers so `.play()` and `setPhase("rating")` run at most once.
- **Decision**: FIXED — added `firedRef` guard checked/set in both the tick effect and the visibilitychange handler.

### F4 — `PresetManager` submits `NaN` when inputs are empty or non-numeric

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: [src/components/presets/PresetManager.tsx](src/components/presets/PresetManager.tsx)
- **Detail**: `parseInt(row.focusMin, 10) * 60` produces `NaN` for empty or non-numeric inputs. The Zod schema server-side rejects it with 400, so no data hits the DB — but the UX shows a generic server-error string instead of surfacing the invalid input inline. The button's `unchanged` gate does not stop this. The HTML `min={1}` / `max={240}` attributes are hints only; browsers don't block submit on them.
- **Fix**: Add a client-side check before POST: reject `Number.isNaN(focusSec) || focusSec < 60 || focusSec > 4*60*60` (same for break in its range) and render an inline validation message.
- **Decision**: FIXED — added client-side range checks in `handleSave` (matching the Zod bounds in `src/lib/schemas/user-preset.ts`) that set an inline row error and return before the PUT request.

### F5 — `useBreakTimer` initial `now` state can lag behind `breakStartedAtMs`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency (L-03 hygiene)
- **Location**: [src/lib/timer/useBreakTimer.ts:22, :37](src/lib/timer/useBreakTimer.ts#L22)
- **Detail**: `now` is initialised at mount with `useState(() => Date.now())`, but the hook mounts inside `SessionRunner` long before the user clicks "Take a break". By the time `breakStartedAtMs` is set, `now` can be seconds behind. The `Math.max(now, breakStartedAtMs)` clamp masks this in the render, and the first `setTimeout` tick corrects it a second later — but the pattern reads as a workaround rather than an invariant. Consistent with L-03 in intent; slightly noisy in code.
- **Fix**: In the first effect gated on `breakStartedAtMs !== null`, also `setNow(Date.now())` so the derived `remaining` matches the anchor from the first frame.
- **Decision**: SKIPPED — the literal fix conflicts with this repo's React Compiler purity rules (`Date.now()` cannot be called synchronously in an effect body — `react-hooks/set-state-in-effect` — nor during render via the "adjust state on prop change" pattern — "Cannot call impure function during render"). The existing `Math.max(now, breakStartedAtMs)` clamp already renders the correct `remaining` on the first frame; only the internal `now` state itself lags for one tick with no visible effect, self-correcting at the next `setTimeout` tick. Not worth suppressing the compiler rule for a cosmetic invariant.

### F6 — Phase 8 test file lives at a different path than the plan named

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: [tests/unit/session/resolveSessionPageAccess.test.ts](tests/unit/session/resolveSessionPageAccess.test.ts) (plan named `src/lib/session/access.test.ts`)
- **Detail**: Plan §Phase 8 Changes Required #4 named the file next to the source, but the actual test landed under `tests/unit/session/`. Coverage matches the plan (drops the >50-min redirect assertion, adds the 4-hour-old non-ended allow case). This looks like the repo settled on a co-located-vs-tests-tree convention after the plan was written; both are defensible. Not drift in intent, only in location.
- **Fix**: Accept the current location — it matches the sibling test tree under `tests/unit/session/`. No move needed unless the repo convention shifts.
- **Decision**: ACCEPTED — current location matches the repo's `tests/unit/` convention; no move needed.
