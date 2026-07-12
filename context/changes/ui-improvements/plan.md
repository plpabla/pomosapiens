# UI Improvements Bundle (S-12) Implementation Plan

## Overview

S-12 is a bundle of five small, independent cosmetic frontend changes with no schema, API, or route impact. Split into two phases: Phase 1 is the one change with real logic (the 🍅 time badge derived from actual duration); Phase 2 is the four trivial edits (stop-button wording, energy default, pre-session layout, clock size).

## Current State Analysis

- **History badge**: [SessionTags.tsx](../../../src/components/session/SessionTags.tsx) renders `modeLabel(session.timer_mode)` (`P1`/`P2`/`P3`/`∞`) as a chip alongside topic/format chips. `modeLabel` lives in [format.ts:1-7](../../../src/lib/session/format.ts). `SessionTags` currently receives `Pick<SessionListItem, "timer_mode" | "topic" | "material_format">` — no duration. Its parent `SessionTile` passes the whole `session` object, which already carries `duration_seconds` and `ended_at`.
- **Both history paths populate duration**: the signed-in dashboard SELECT ([dashboard.astro:23](../../../src/pages/dashboard.astro)) and the anon [localSessionList.ts:20-21](../../../src/lib/local/localSessionList.ts) both set `duration_seconds` (computed for count-up rows) and `ended_at` on `SessionListItem`. A single change in `SessionTags` covers both.
- **Stop button**: [SessionRunner.tsx:131-133](../../../src/components/session/SessionRunner.tsx) always renders "Stop early" during the running phase, regardless of `mode`.
- **Energy default**: `useState<EnergyLevel | null>(null)` in [EnergyPicker.tsx:11](../../../src/components/session/EnergyPicker.tsx) and [AnonSessionApp.tsx:41](../../../src/components/anon/AnonSessionApp.tsx) (whose `resetForm` at :65-70 also resets to `null`). The Start button is `disabled={energy === null || submitting}` in [SessionStartForm.tsx:62-64](../../../src/components/session/SessionStartForm.tsx).
- **Pre-session layout**: in `SessionStartForm`, order is `ModePicker` (the time-preset chips) → `EnergyLevelPicker` → topic/format selects → Start button.
- **Clock**: both the running-focus clock ([SessionRunner.tsx:129](../../../src/components/session/SessionRunner.tsx)) and the break clock (:143) use `text-7xl`.

### Key Discoveries:

- `modeLabel` has exactly one consumer (`SessionTags`) and no direct unit test — replacing its usage orphans it, so it should be removed ([format.ts:1-7](../../../src/lib/session/format.ts)).
- No e2e or unit test selects count-up mode and asserts the "Stop early" label — every `"Stop early"` assertion runs against the default (preset) mode, so the Phase 2 wording change does not touch existing e2e expectations.
- `SessionRunner.countup.test.tsx` does not assert the stop-button label at all — it's the natural home for a new "Stop"/"Stop early" assertion.
- `SessionStartForm.test.tsx` passes `energy` as a controlled prop (fixture sets `energy: null`); the mount default lives in the parent components, so the Phase 2 default change does not affect that test.

## Desired End State

- Session-history rows show `🍅` per 20 minutes of **actual** duration (floor, minimum 1) for every completed session, count-up included; in-progress rows show no time badge. `P1/P2/P3/∞` badges are gone.
- A count-up running session's stop control reads "Stop"; preset sessions still read "Stop early".
- The pre-session screen loads with "Medium" energy pre-selected and Start immediately enabled.
- The preset time-badge chips sit directly above the Start button.
- Both running clocks (focus and break) are noticeably larger and stay readable on narrow viewports.
- `npm run lint`, `npm test`, and the e2e suite pass.

## What We're NOT Doing

- No schema, migration, API, or route changes.
- No live/partial tomato badge on in-progress rows (badge appears only once a session is done).
- No change to the count-up mode's identity elsewhere (the `∞` symbol is dropped only from the history badge; `ModePicker`'s "Count-up" chip label is untouched).
- No change to FR-009 semantics beyond pre-selecting a default — energy is still always sent.

## Implementation Approach

Two phases. Phase 1 isolates the only change with branching logic (duration → tomato count, done-vs-in-progress gating) so its behavior can be unit-tested on its own. Phase 2 batches the four one-to-two-line edits. Each phase ends green on lint + unit + e2e.

---

## Phase 1: 🍅 time badge in session history

### Overview

Replace the `P1/P2/P3/∞` mode badge with a tomato count derived from a session's actual duration, shown only for completed sessions.

### Changes Required:

#### 1. Tomato helper

**File**: `src/lib/session/format.ts`

**Intent**: Add a helper that converts an actual duration into a tomato count, and remove the now-unused `modeLabel`.

**Contract**: `tomatoCount(durationSeconds: number): number` returning `Math.floor(durationSeconds / 1200)` (1200 = 20 min) — sessions under 20 min return `0`. Delete `modeLabel` (its sole consumer is updated below; no direct test exists).

#### 2. Badge rendering

**File**: `src/components/session/SessionTile.tsx` (tomato text), `src/components/session/SessionTags.tsx` (unchanged scope, mode label removed)

**Intent**: Show `🍅` as plain text next to the duration/time readout for completed sessions instead of the mode label; render nothing time-related for in-progress sessions. `SessionTags` keeps only the topic/format chips — the tomato badge does not live there and is not chip-styled (design revision: originally planned as a `SessionTags` chip; moved next to the time text as plain text per manual review).

**Contract**: In `SessionTile`, compute `tomatoes = status === "done" && duration_seconds != null ? tomatoCount(duration_seconds) : 0` and append `` `${"🍅".repeat(tomatoes)}` `` (only when `tomatoes > 0`) inside the same `<span>` as the duration/"In progress" text — plain text, no `bg-charred` chip wrapper. `SessionTags`' `Props` `Pick` narrows to `"topic" | "material_format"` only (drop `timer_mode`, `duration_seconds`, `ended_at`); its early-return guard reverts to `topic === null && material_format === null`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Unit tests pass: `npm test`
- New unit test covers `tomatoCount` boundaries (e.g. 300s→0, 1199s→0, 1200s→1, 2400s→2, 5400s→4) and `SessionTile` tomato-text rendering (done ≥20min → 🍅 text next to duration, not chip-styled; done <20min → no time badge; in-progress → no time badge); `SessionTags` rendering pared down to topic/format chips only

#### Manual Verification:

- Signed-in dashboard history shows correct 🍅 counts for real completed sessions of varying lengths, count-up included
- Anonymous history (localStorage) shows the same 🍅 badges
- Completed sessions under 20 min show no time badge; in-progress rows show no time badge (only the "In progress" text)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: stop wording, energy default, layout, clock size

### Overview

Four independent one-to-two-line cosmetic edits.

### Changes Required:

#### 1. Stop-button wording

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: A count-up session has no fixed duration, so "early" is meaningless — its stop control should read "Stop".

**Contract**: Running-phase button label becomes `mode === "count_up" ? "Stop" : "Stop early"` (line ~132).

#### 2. Bigger clocks

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Enlarge both running clocks (focus and break) responsively so they stay readable on small screens.

**Contract**: Replace `text-7xl` on both clock `<div>`s (lines ~129 and ~143) with a larger responsive size (e.g. `text-8xl sm:text-9xl`). Both clocks change together.

#### 3. Energy default (signed-in)

**File**: `src/components/session/EnergyPicker.tsx`

**Intent**: Pre-select "Medium" so Start is immediately actionable.

**Contract**: Initialize the energy state to `"medium"` instead of `null`.

#### 4. Energy default (anonymous)

**File**: `src/components/anon/AnonSessionApp.tsx`

**Intent**: Same default for the anon flow, including after a reset.

**Contract**: Initialize energy state to `"medium"` (line ~41) and have `resetForm` (lines ~65-70) reset to `"medium"` rather than `null`.

#### 5. Pre-session layout

**File**: `src/components/session/SessionStartForm.tsx`

**Intent**: Move the preset time-badge chips directly above the Start button.

**Contract**: Relocate the `<ModePicker>` element so it renders immediately before the Start `<Button>` (after the topic/format select block), instead of at the top of the form.

#### 6. Test updates

**File**: `tests/unit/session/SessionRunner.countup.test.tsx` (+ any assertion that pins an initially-unselected energy or a disabled-at-mount Start button)

**Intent**: Add coverage for the count-up "Stop" label; update any test that assumes energy starts unselected.

**Contract**: Add an assertion that count-up mode renders a "Stop" button (and that preset mode still renders "Stop early"). Grep the unit suite for a Start-disabled-at-mount or all-energy-unpressed assertion and update it to reflect the Medium default; no e2e change is expected (verified: no e2e asserts "Stop early" on count-up).

### Success Criteria:

#### Automated Verification:

- Type checking / linting passes: `npm run lint`
- Unit tests pass: `npm test`
- E2E suite passes: `npm run test:e2e`

#### Manual Verification:

- Count-up running session shows "Stop"; preset session shows "Stop early"
- Both clocks are visibly larger and do not overflow on a narrow (mobile) viewport
- Pre-session screen loads with Medium highlighted and Start enabled; changing energy still works
- The preset time-badge chips render directly above the Start button

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human.

---

## Testing Strategy

### Unit Tests:

- `tomatoCount` boundary values (floor, min-1 behavior)
- `SessionTags`: done-preset, done-count-up, and in-progress rendering
- `SessionRunner`: count-up "Stop" vs preset "Stop early" label

### Manual Testing Steps:

1. Complete sessions of ~5, 25, 45, and 90 minutes (and one count-up) → verify 🍅 counts are 1, 1, 2, 4 and the count-up matches its elapsed time.
2. Start an in-progress session, view the dashboard → no time badge on that row.
3. Start a count-up session → button reads "Stop"; start a preset session → "Stop early".
4. Load the pre-session screen → Medium highlighted, Start enabled, time chips above Start.
5. Shrink the viewport to mobile width during a running session → clock stays on one line.

## References

- Roadmap slice S-12: `context/foundation/roadmap.md` (§S-12)
- Preset badges / count-up origin: `context/archive/2026-06-28-timer-presets/plan.md`
- Component refactor that centralized the helpers: `context/archive/2026-07-10-refactor-react-components/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: 🍅 time badge in session history

#### Automated

- [x] 1.1 Type checking passes: `npm run lint`
- [x] 1.2 Unit tests pass: `npm test`
- [x] 1.3 New unit test covers `tomatoCount` boundaries and `SessionTags` rendering (done ≥20min / done <20min / in-progress)

#### Manual

- [x] 1.4 Signed-in dashboard shows correct 🍅 counts across varying lengths incl. count-up
- [x] 1.5 Anonymous history shows the same 🍅 badges
- [x] 1.6 Completed sessions under 20 min and in-progress rows show no time badge

### Phase 2: stop wording, energy default, layout, clock size

#### Automated

- [ ] 2.1 Type checking / linting passes: `npm run lint`
- [ ] 2.2 Unit tests pass: `npm test`
- [ ] 2.3 E2E suite passes: `npm run test:e2e`

#### Manual

- [ ] 2.4 Count-up shows "Stop"; preset shows "Stop early"
- [ ] 2.5 Both clocks larger and no overflow on narrow viewport
- [ ] 2.6 Pre-session loads with Medium highlighted and Start enabled; changing energy works
- [ ] 2.7 Time-badge chips render directly above the Start button
