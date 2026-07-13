# Continue Session Past End (S-10) Implementation Plan

## Overview

When a preset (countdown) focus phase reaches its scheduled end, the user currently lands on the focus-end / rating surface with the end-of-focus chime. This change adds an **"I'm still working"** choice on that surface. Choosing it converts the running session to **count-up mode in place** — the session keeps its original `started_at` and total elapsed, keeps counting up from where it was, and fires no chime when the user eventually Stops. The normal rating/note/history flow then applies at the final Stop.

Conversion is a single atomic server UPDATE via a dedicated endpoint, plus a reactive-`mode` refactor of the timer hook so the running UI can flip mid-flight. Authenticated sessions only for this slice.

## Current State Analysis

- **Focus-end is not automatic.** The timer's `remaining <= 0` fire (for preset) snapshots `stoppedAtMs` to the boundary, plays the chime, and flips `phase → "rating"` — landing on the `FocusRating` screen where "Take a break" / rate / skip are user choices ([useFocusTimer.ts:86-94](src/lib/timer/useFocusTimer.ts#L86-L94), [SessionRunner.tsx:162-175](src/components/session/SessionRunner.tsx#L162-L175)). This rating screen is the surface the "I'm still working" choice belongs on.
- **Mode is immutable everywhere.** `mode: "preset" | "count_up"` is derived once from the persisted `timer_mode` at the page entry point ([session/[id].astro:44-46](src/pages/session/[id].astro#L44-L46)) and threaded as a **static prop** through `SessionRunner` → `useFocusTimer`. S-03 declared "mode is locked at POST time"; S-06 (tab title) and S-11 (reopen) silently rely on that. S-10 is the first change to make mode mutable mid-lifetime — the single load-bearing conflict.
- **Persistence side is nearly free.** `duration_seconds` is a Postgres GENERATED column (`ended_at - started_at`), `count_up` is already a legal `timer_mode` CHECK value, and the update RLS (`sessions_update_own`) scopes only on `user_id` — no migration needed, only a write path ([research.md:60-62](context/changes/continue-session-past-end/research.md#L60-L62)).
- **No server write path for `timer_mode`.** PATCH is column-pinned to `{ended_at, focus_rating, note}` and guarded write-once by `.is("ended_at", null)` ([sessions/[id].ts:49-56](src/pages/api/sessions/[id].ts#L49-L56)); `endSessionSchema` has no `timer_mode`. A mid-flight conversion has no endpoint today.
- **`count_up ⇒ null planned durations` is an INSERT-only invariant** ([api/sessions/index.ts:24-30](src/pages/api/sessions/index.ts#L24-L30)); the DB does not enforce it. The conversion path must re-null the planned columns itself to keep the row in a state existing code expects.
- **Downstream mode-fixity, from research §D:** tab-title branches on `mode` and would show a negative `remaining` past the boundary until mode flips ([tabTitle.ts:12](src/lib/timer/tabTitle.ts#L12)); reopen (S-11) re-derives mode from the persisted row, so the flip must be persisted or a reload renders a countdown again ([session/[id].astro:44-46](src/pages/session/[id].astro#L44-L46)). Abandon (S-05) and the access guard are mode-agnostic — no risk.

## Desired End State

A signed-in user running a preset session reaches focus-end, hears the chime as today, and sees an **"I'm still working"** button on the focus-end screen alongside the rate/skip path. Tapping it:

- persists `timer_mode = 'count_up'` (and nulls `planned_focus_seconds` / `planned_break_seconds`) on the still-running row via `POST /api/sessions/[id]/continue`;
- returns the UI to a running timer that now **counts up** from the original `started_at` with total elapsed preserved, no chime re-fire, "Stop" button wording, and a tab title showing elapsed;
- survives a tab close + reopen (the reopened page re-derives `count_up` from the persisted row and resumes counting up).

At the eventual Stop, the normal rating/note/save flow runs with no chime, and history shows the final count-up total (via the existing GENERATED `duration_seconds`).

Verify: unit test proves `continueAsCountUp()` resumes running and keeps elapsed advancing from `startedAtMs` without re-firing the chime; endpoint test proves the flip + null + guards; manual click-through incl. reopen-after-conversion.

### Key Discoveries:

- Focus-end surface is `FocusRating`'s rating screen, reached via `SessionRunner`'s default return ([SessionRunner.tsx:162-175](src/components/session/SessionRunner.tsx#L162-L175)).
- `count_up` never fires focus-end — the fire is gated off at [useFocusTimer.ts:85,109](src/lib/timer/useFocusTimer.ts#L85). So once converted, the "I'm still working" choice can never reappear, and no chime can re-fire, as long as `mode` is actually flipped to `count_up` in the hook.
- `firedRef` is a one-way single-fire latch ([useFocusTimer.ts:29](src/lib/timer/useFocusTimer.ts#L29)); leaving it `true` after conversion is harmless because the count-up branch short-circuits before the fire check.
- The tick and visibility effects already list `mode` and `phase` in their dependency arrays ([useFocusTimer.ts:100,125](src/lib/timer/useFocusTimer.ts#L100)), so flipping both restarts the tick loop in the count-up branch with no extra wiring.
- Research settled the approach: atomic in-place UPDATE, **not** drop-and-replace (which would need a client-supplied `started_at` tampering vector and be non-atomic) — [research.md:114-132](context/changes/continue-session-past-end/research.md#L114-L132).

## What We're NOT Doing

- **Not** supporting the anonymous / local-storage flow (`AnonSessionApp`) this slice — authenticated only. `AnonSessionApp` opts out with one prop; `localPersistence` is not extended.
- **Not** offering "Continue" during the running focus phase, at break-end, or on break sessions — focus-end of a preset session only (per change.md).
- **Not** preserving the origin preset — `planned_*` are nulled on conversion (no audit of "started as preset_2").
- **Not** adding a DB migration, trigger, or `WITH CHECK` — the CHECK/RLS already permit the flip; the invariant is maintained by the write handler.
- **Not** widening the PATCH write-set or touching the rating/PUT/DELETE contracts (L-01 stays intact) — conversion is its own narrowly-scoped endpoint.
- **Not** adding an E2E spec this slice (optional follow-up bullet in Testing Strategy).

## Implementation Approach

Server owns truth, client state stays thin. The flip must be persisted so S-11 reopen survives it, so the server write lands first (Phase 1). The client can then flip its own reactive `mode` after a successful persist. The hook refactor (Phase 2) is pure state-machine logic — `mode` becomes hook state initialized from the incoming prop, with a `continueAsCountUp()` action that resets the fire snapshot and returns to `running` — and is unit-tested in isolation. The UI wiring (Phase 3) consumes the hook's effective mode and the new action, adds the button, and opts the anon flow out.

## Critical Implementation Details

- **State sequencing on continue:** persist first, flip client second. `SessionRunner`'s continue handler must `await persistContinue()` and only on success call the hook's `continueAsCountUp()`. On failure, surface the error and stay on the focus-end screen (the session is still a running preset server-side, consistent with the un-flipped client).
- **No chime re-fire:** `continueAsCountUp()` must set `mode → "count_up"` (so the fire branch is gated off) and `phase → "running"`, and reset `stoppedAtMs → null`. `firedRef` may stay `true` — the count-up gate short-circuits before it is read. Elapsed is derived from the unchanged `startedAtMs`, so total time is preserved with no arithmetic.

## Phase 1: Server continue write path

### Overview

Add the atomic conversion endpoint and the client persistence method that calls it. No request body, no schema, no migration.

### Changes Required:

#### 1. Continue endpoint

**File**: `src/pages/api/sessions/[id]/continue.ts` (new)

**Intent**: A dedicated `POST` that atomically converts a still-running session owned by the caller to count-up, nulling the planned-duration columns to preserve the `count_up ⇒ null planned` invariant. Keeps the PATCH write-once contract untouched.

**Contract**: `export const prerender = false;` + `export const POST: APIRoute`. Mirrors the auth / supabase / `id` guards of the PATCH handler in [sessions/[id].ts:21-34](src/pages/api/sessions/[id].ts#L21-L34) (401 unauthorized, 500 unconfigured, 400 missing id). No body parsing. Single update:

```
supabase.from("sessions")
  .update({ timer_mode: "count_up", planned_focus_seconds: null, planned_break_seconds: null })
  .eq("id", id).eq("user_id", user.id).is("ended_at", null)
  .select("id").maybeSingle()
```

Returns `{ ok: true }` 200 on a matched row; `{ error: "Session already ended or not found" }` 409 when `data` is null (mirrors the PATCH 409 semantics). 500 on a supabase error.

#### 2. Remote persistence method

**File**: `src/lib/session/persistence.ts`

**Intent**: Add a `continueSession(id)` method the client calls to hit the new endpoint, mirroring `endSession`'s `fetchJson` shape.

**Contract**: Add `continueSession(id: string): Promise<void>` to the `SessionPersistence` interface as an **optional** member (so `localPersistence` is not forced to implement it this slice), and implement it on `remotePersistence` as a `POST` to `/api/sessions/${id}/continue` with no body and `fallbackError: "Failed to continue session"`.

### Success Criteria:

#### Automated Verification:

- Endpoint test: converting a running preset row flips `timer_mode` to `count_up` and nulls both `planned_*` columns.
- Endpoint test: an already-ended row (`ended_at` non-null) returns 409 and is left unchanged.
- Endpoint test: a row owned by another user is not converted (ownership scoping holds).
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `POST /api/sessions/[id]/continue` on a live running session (via devtools/curl with session cookie) returns 200 and the row shows `count_up` with null planned columns in Supabase Studio.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Reactive-mode hook refactor

### Overview

Make `mode` mutable inside `useFocusTimer` and add the `continueAsCountUp()` action that resumes the timer counting up without re-firing the chime. Pure state-machine change, unit-tested in isolation; no UI change yet.

### Changes Required:

#### 1. `useFocusTimer` reactive mode + continue action

**File**: `src/lib/timer/useFocusTimer.ts`

**Intent**: Hold `mode` as internal state initialized from the `mode` option, expose the effective `mode` and a `continueAsCountUp()` action in the result, so the running UI can convert a preset session mid-flight. Preserve elapsed and suppress any chime re-fire.

**Contract**: `UseFocusTimerResult` gains `mode: "preset" | "count_up"` and `continueAsCountUp: () => void`. `mode` becomes `useState` seeded from the option (a change in the incoming option need not be reconciled — conversion is the only mutation path). `continueAsCountUp()` sets `mode → "count_up"`, `stoppedAtMs → null`, `phase → "running"`; leaves `firedRef` as-is. The existing tick/visibility fire branches remain gated by `if (mode === "count_up") return;`, which now reads the reactive mode.

### Success Criteria:

#### Automated Verification:

- Unit test: after a preset focus-end fire, calling `continueAsCountUp()` sets `phase` back to `running`, `mode` to `count_up`, and `elapsed` continues advancing from `startedAtMs` (total preserved, not reset).
- Unit test: after `continueAsCountUp()`, advancing the clock past a further boundary does **not** call `audio.play()` again (no chime re-fire).
- Unit tests for existing `useFocusTimer` behavior still pass (preset fire, count-up stop, visibility reconcile).
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- None (pure logic; covered by unit tests).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Focus-end affordance + UI wiring

### Overview

Surface the "I'm still working" button on the focus-end screen, wire it through `SessionRunner` to the persistence method and the hook action, flip the tab title via the now-reactive mode, and opt the anon flow out.

### Changes Required:

#### 1. Focus-end "I'm still working" button

**File**: `src/components/session/FocusRating.tsx`

**Intent**: Add a prominent "I'm still working" button on the rating screen (the focus-end surface) that, when available, lets the user keep working instead of rating. Rating remains the single end-of-session event.

**Contract**: Add props `canContinue: boolean` and `onContinue: () => void`. Render an "I'm still working" `Button` above the rating controls only when `canContinue`. Its click calls `onContinue` (does not submit a rating). No change to the "saved" screen.

#### 2. `SessionRunner` wiring

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Read the effective `mode` from the hook (not the prop) for all display branches, add a `persistContinue` callback prop + a `canContinue` gate, and handle the continue action (persist first, flip client on success).

**Contract**: Destructure `mode` and `continueAsCountUp` from `useFocusTimer`. Add props `persistContinue?: () => Promise<void>` (default `() => remotePersistence.continueSession(sessionId)`) and `canContinue?: boolean` (default `true`). Replace prop-`mode` reads at [SessionRunner.tsx:90,123,124,134,166](src/components/session/SessionRunner.tsx#L90) with the hook's `mode`. Pass `FocusRating` `canContinue={canContinue && mode === "preset"}` and an `onContinue` handler that `await`s `persistContinue()` then calls `continueAsCountUp()`, setting `error` and staying on the focus-end screen on failure. `getRunningTabTitle` already receives `mode` — it now gets the reactive value and flips automatically.

#### 3. Anon opt-out

**File**: `src/components/anon/AnonSessionApp.tsx`

**Intent**: Keep the anonymous flow out of this slice.

**Contract**: Pass `canContinue={false}` to the `SessionRunner` at [AnonSessionApp.tsx:86-98](src/components/anon/AnonSessionApp.tsx#L86-L98). No other anon change; `localPersistence` untouched.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Signed-in preset session: at focus-end the chime plays and "I'm still working" appears alongside the rating controls.
- Tapping it returns to a running timer that counts **up** from the correct elapsed (not reset to 0), shows "Stop", and the tab title shows elapsed (not a negative countdown).
- Stopping the converted session plays **no** chime and lands on the normal rating screen; saving records the full elapsed duration in history.
- Closing the tab mid count-up and reopening from the dashboard resumes a count-up session (not a countdown) from the correct elapsed.
- The anon landing-page session shows **no** "I'm still working" button at focus-end.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `useFocusTimer` `continueAsCountUp()`: resumes `running`, flips `mode`, preserves elapsed from `startedAtMs`, no chime re-fire (Phase 2).
- Existing `useFocusTimer` suites remain green (preset fire, count-up stop, visibility reconcile).

### Integration Tests:

- `POST /api/sessions/[id]/continue`: happy-path flip + null planned; 409 on already-ended; ownership scoping (Phase 1).

### Manual Testing Steps:

1. Start a signed-in preset session with a short focus, let it reach focus-end.
2. Confirm chime + "I'm still working" button; tap it; confirm count-up resumes from correct elapsed with "Stop".
3. Let it run a bit, close the tab, reopen from dashboard; confirm it resumes as count-up from correct elapsed.
4. Stop; confirm no chime, normal rating, and history shows the full elapsed total.
5. Repeat focus-end on the anon landing page; confirm no "I'm still working" button.

### Optional follow-up (not this slice):

- Playwright E2E driving focus-end → Continue → count-up → Stop → saved, mirroring S-11's coverage.

## Migration Notes

None. No schema change — `count_up` is an existing `timer_mode` CHECK value, `duration_seconds` is GENERATED, and update RLS already permits the owner's flip.

## References

- Research: `context/changes/continue-session-past-end/research.md`
- Chosen approach (flip in place, not drop-and-replace): [research.md:114-132](context/changes/continue-session-past-end/research.md#L114-L132)
- Focus-end fire / chime gates: [useFocusTimer.ts:85-94,109-118](src/lib/timer/useFocusTimer.ts#L85-L118)
- PATCH contract to leave intact (L-01): [sessions/[id].ts:49-56](src/pages/api/sessions/[id].ts#L49-L56)
- INSERT-only `count_up ⇒ null planned` invariant: [api/sessions/index.ts:24-30](src/pages/api/sessions/index.ts#L24-L30)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server continue write path

#### Automated

- [x] 1.1 Endpoint test: running preset row flips to count_up and nulls both planned_* columns — 352a736
- [x] 1.2 Endpoint test: already-ended row returns 409 and is unchanged — 352a736
- [x] 1.3 Endpoint test: another user's row is not converted (ownership scoping) — 352a736
- [x] 1.4 Type checking passes: `npm run build` — 352a736
- [x] 1.5 Linting passes: `npm run lint` — 352a736

#### Manual

- [x] 1.6 POST on a live running session returns 200; row shows count_up + null planned in Studio — 352a736

### Phase 2: Reactive-mode hook refactor

#### Automated

- [x] 2.1 Unit test: continueAsCountUp resumes running, flips mode, elapsed advances from startedAtMs — 2abd181
- [x] 2.2 Unit test: no chime re-fire after continueAsCountUp — 2abd181
- [x] 2.3 Existing useFocusTimer suites still pass — 2abd181
- [x] 2.4 Type checking passes: `npm run build` — 2abd181
- [x] 2.5 Linting passes: `npm run lint` — 2abd181

### Phase 3: Focus-end affordance + UI wiring

#### Automated

- [x] 3.1 Type checking passes: `npm run build`
- [x] 3.2 Linting passes: `npm run lint`

#### Manual

- [x] 3.3 Focus-end shows chime + "I'm still working" alongside rating controls
- [x] 3.4 Tapping resumes count-up from correct elapsed, "Stop" wording, tab title shows elapsed
- [x] 3.5 Stopping converted session plays no chime; history records full elapsed total
- [x] 3.6 Close + reopen mid count-up resumes as count-up from correct elapsed
- [x] 3.7 Anon landing-page session shows no "I'm still working" button
