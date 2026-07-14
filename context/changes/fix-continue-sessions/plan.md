# Preserve break on continue + preset-carrying redirect after break — Implementation Plan

## Overview

Fix two coupled shortcomings of the `continue-session-past-end` slice:

1. **Preserve the break on continue.** Continuing a session ("I'm still working") currently nulls `planned_break_seconds`, so prolonging focus by 5 minutes silently costs the user their break. Keep the break.
2. **Preset-carrying redirect after break.** When a preset session's break completes, the user is dropped on `/dashboard`. Instead land them on `/session/new` pre-filled with the previous session's energy, topic, format, and time preset, so they flow straight into a same-settings next session.

## Current State Analysis

- **The break is blocked by two coupled gates, not just the nulled column.** The continue endpoint nulls `planned_break_seconds` ([continue.ts:23](src/pages/api/sessions/[id]/continue.ts#L23)); *and* `[id].astro` force-nulls `breakSeconds` whenever `timer_mode === "count_up"` ([session/[id].astro:46](src/pages/session/[id].astro#L46)); *and* `SessionRunner` suppresses "Take a break" when `mode === "count_up"` ([SessionRunner.tsx:186](src/components/session/SessionRunner.tsx#L186)). Continue flips the session to `count_up`, so all three must change together — un-nulling the column alone fixes nothing.
- **The `count_up ⇒ null planned` invariant is app-only, enforced at insert time.** No DB CHECK couples `timer_mode` to planned-column nullability; the rule lives in [api/sessions/index.ts:24-30](src/pages/api/sessions/index.ts#L24-L30). Relaxing it for the continue UPDATE persists fine.
- **`/session/new` has no prefill.** [session/new.astro](src/pages/session/new.astro) (7 lines) renders `<EnergyPicker>` and reads no query params. `EnergyPicker` seeds all form state from hardcoded defaults ([EnergyPicker.tsx:11-14](src/components/session/EnergyPicker.tsx#L11-L14)) and `mode` from `localStorage` via `useLastMode()`.
- **Break-completion navigation lives entirely in `SessionRunner.tsx`**, via the shared `onGoToDashboard` callback, at four sites: visible-tab completion ([:79,:86](src/components/session/SessionRunner.tsx#L79)), hidden-tab dismiss ([:106](src/components/session/SessionRunner.tsx#L106)), and the manual "End break" button ([:172](src/components/session/SessionRunner.tsx#L172)).
- **`[id].astro` selects `energy_level, planned_focus_seconds, planned_break_seconds, timer_mode`** but NOT `topic_id` or `material_format_id` ([session/[id].astro:23-28](src/pages/session/[id].astro#L23-L28)) — those two must be added to carry topic/format over.
- **`ModePicker` already renders a `count_up` chip** ([ModePicker.tsx:18](src/components/session/ModePicker.tsx#L18)), so a `mode=count_up` prefill value is valid and selectable.

## Desired End State

- Continuing a preset session keeps `planned_break_seconds`; after the continued (count-up) focus stops, the rating screen still offers "Take a break" and the break runs for the original preset's break duration.
- When any preset session's break completes (natural, hidden-tab, or manual "End break"), the user lands on `/session/new` pre-filled with the previous session's energy, topic, format, and time preset (chip pre-selected). The rating-screen "Go to dashboard" button still goes to `/dashboard`.
- Native count-up sessions and anonymous sessions are unchanged (still no break, no redirect).

**Verify:** `npm test` green (with updated `sessions.continue.test.ts`); manual walk of continue→break→`/session/new` and normal-preset→break→`/session/new`.

### Key Discoveries:

- The native-vs-continued distinction moves from `timer_mode` to the *data* (`planned_break_seconds` null vs non-null) — aligns with lesson **L-05** (drive break by explicit state, not by mode).
- `SessionRunner`'s in-flight continue lockout (`continuing` state, impl-review F1) must be preserved when touching `handleContinue`.
- Only `sessions.continue.test.ts` needs updating; `sessions.create.test.ts`'s count_up-consistency test is a create-time assertion and stays valid.

## What We're NOT Doing

- **Not preserving `planned_focus_seconds` on continue.** Because the prefill carries the time preset via `mode=<timer_mode>` (choice B), there is no consumer of a preserved focus column; we keep nulling it. (This deviates from research's option-A recommendation, intentionally.)
- **Not recovering the origin preset for continued sessions.** A continued session is `count_up`, so its post-break prefill selects **count-up mode**, not the pre-continue preset. Energy/topic/format still carry over.
- Not adding a DB CHECK for the invariant; it stays app-level, insert-time-only.
- Not changing anonymous sessions or native count-up sessions.
- Not adding an e2e spec for the redirect flow (integration + unit only).
- Not surfacing a "topic no longer exists" notice — stale topic/format silently falls back to "none".

## Implementation Approach

Two independent, independently-shippable phases. Phase 1 is a server + two client-derivation edits plus a test update. Phase 2 threads a new URL contract from `[id].astro` through a new `SessionRunner` callback to `new.astro` and `EnergyPicker`.

## Critical Implementation Details

- **Break-column preservation is by omission.** Removing `planned_break_seconds: null` from the continue `.update({...})` leaves the column untouched (Supabase writes only provided keys). Keep `planned_focus_seconds: null` and `timer_mode: "count_up"` in the update.
- **`onBreakComplete` default must preserve today's behavior.** Default it to `onGoToDashboard` so the anon island and any non-overriding caller still land on `/dashboard`. Only the authed `[id].astro` mount overrides it with the prefilled `/session/new` URL.
- **Stale topic/format reconciliation is gated on catalog load.** `EnergyPicker` seeds `topicId`/`materialFormatId` from the URL immediately, but must only reset a missing id to `null` *after* the catalog has loaded (topics/formats resolved), otherwise a legitimately-still-loading value would be wiped.

---

## Phase 1: Preserve the break on continue

### Overview

Keep `planned_break_seconds` through the continue flow and unblock the break in count-up mode, relaxing the `count_up ⇒ null planned` invariant to insert-time-only.

### Changes Required:

#### 1. Continue endpoint stops nulling the break

**File**: `src/pages/api/sessions/[id]/continue.ts`

**Intent**: Preserve the break duration when converting to count-up so the user keeps their break after prolonging focus.

**Contract**: In the `.update(...)` at line 23, drop the `planned_break_seconds: null` key (leave the column untouched); keep `timer_mode: "count_up"` and `planned_focus_seconds: null`. No body schema change (endpoint still takes only the path `id`).

#### 2. Derive `breakSeconds` regardless of mode

**File**: `src/pages/session/[id].astro`

**Intent**: Stop discarding the preserved break on page reload/reopen of a continued session.

**Contract**: Change line 46 to `const breakSeconds = data.planned_break_seconds ?? 0;` (remove the `mode === "count_up" ? null :` gate). Native count-up rows have a null column → resolves to `0` → still no break, so this stays safe.

#### 3. Loosen the `canTakeBreak` gate

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Show "Take a break" after a continued (count-up) session based on whether a break exists, not on the mode.

**Contract**: Change the `canTakeBreak` prop at line 186 to depend on `(breakSeconds ?? 0) > 0` alone (drop the `mode !== "count_up"` clause). Null-guard because the prop can be `null` from the anon derivation.

#### 4. Update the continue invariant test

**File**: `tests/integration/api/sessions.continue.test.ts`

**Intent**: Reflect the insert-time-only invariant — continue now preserves the break.

**Contract**: In the first test (currently "flips … and nulls both planned_* columns", lines 38-54): rename to reflect preserving the break; assert `row.planned_break_seconds` toBe `5 * 60` (from the fixture), keep `row.planned_focus_seconds` toBeNull and `row.timer_mode` toBe `"count_up"`. Leave the 409/ownership/401 tests unchanged. Do **not** touch `sessions.create.test.ts`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Continue integration tests pass: `npm test -- sessions.continue`
- Full test suite passes: `npm test`

#### Manual Verification:

- Start a preset session, click "I'm still working", stop the count-up, and confirm "Take a break" is offered and the break runs for the original preset's duration.
- Reload the continued session mid-way and confirm the break is still available afterward (not re-nulled).
- A native count-up session still offers no break.

**Implementation Note**: After Phase 1 and its automated verification pass, pause for manual confirmation before starting Phase 2.

---

## Phase 2: Preset-carrying redirect after break

### Overview

Retarget all preset break-completion paths to a `/session/new` URL pre-filled with the previous session's energy, topic, format, and time preset.

### Changes Required:

#### 1. Add an `onBreakComplete` callback to `SessionRunner`

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Route break-completion navigation through a dedicated callback so only that path is retargeted, leaving the rating-screen "Go to dashboard" and continue paths on `onGoToDashboard`.

**Contract**: Add `onBreakComplete?: () => void` to `Props`, defaulting to `onGoToDashboard`. Replace the `onGoToDashboard()` calls at the three break-complete sites (visible-tab `go()` / no-audio fallback ~[:79,:86](src/components/session/SessionRunner.tsx#L79), hidden-tab dismiss [:106](src/components/session/SessionRunner.tsx#L106)) and the manual "End break" button [:172](src/components/session/SessionRunner.tsx#L172) with `onBreakComplete()`. Preserve the `continuing` lockout and the audio-`ended` wait. The effect dependency array must include `onBreakComplete`.

#### 2. Build the prefill URL and pass it in `[id].astro`

**File**: `src/pages/session/[id].astro`

**Intent**: Supply the previous session's settings to the break-complete redirect.

**Contract**: Add `topic_id, material_format_id` to the `.select(...)` at line 25. Build `/session/new?energy=<energy_level>&mode=<timer_mode>` plus `&topic=<topic_id>` / `&format=<material_format_id>` only when non-null (use `URLSearchParams`). Pass an `onBreakComplete={() => window.location.assign(url)}` — as a `client:load` island prop this must be serializable, so pass the **string URL** as a prop (e.g. `breakCompleteHref`) and let `SessionRunner` build the closure, rather than passing a function from Astro. Adjust the `SessionRunner` prop shape accordingly (accept `breakCompleteHref?: string`; default `onBreakComplete` navigates there when provided, else falls back to `onGoToDashboard`).

#### 3. Read prefill params in `new.astro`

**File**: `src/pages/session/new.astro`

**Intent**: Forward URL params into the picker.

**Contract**: Read `Astro.url.searchParams` (`energy`, `topic`, `format`, `mode`) — the pattern in `auth/signin.astro:5` — and pass them as props to `EnergyPicker`.

#### 4. Prefill `EnergyPicker` from props

**File**: `src/components/session/EnergyPicker.tsx`

**Intent**: Seed the start form from the carried-over settings, falling back to current defaults.

**Contract**: Accept optional props `initialEnergy?`, `initialTopicId?`, `initialFormatId?`, `initialMode?` (all string | undefined from URL). Seed `energy` / `topicId` / `materialFormatId` `useState` from them (validating `initialEnergy` against `low|medium|high`, else `"medium"`). For mode: hold local `mode` state initialized from `initialMode` when it is a valid `Mode` (`preset_1|preset_2|preset_3|count_up`), else the `useLastMode()` value; call `persistMode` on change so the store stays in sync. Add an effect gated on catalog-loaded that resets `topicId`/`materialFormatId` to `null` if the id is absent from the fetched `topics`/`formats` (silent fall-back to "none").

### Success Criteria:

#### Automated Verification:

- Type checking + lint pass: `npm run lint`
- Full test suite passes: `npm test`
- Build passes: `npm run build`

#### Manual Verification:

- Finish a normal preset session, take the break, let it complete → lands on `/session/new` with energy, topic, format, and the same time-preset chip pre-selected.
- Same via the manual "End break" button → same prefilled `/session/new`.
- Continue a session, stop, take the break → lands on `/session/new` with energy/topic/format pre-filled and **count-up** mode selected.
- Delete the topic used by a prior session, then trigger the redirect → topic field falls back to "none" with no error; session still startable.
- Rating-screen "Go to dashboard" (declining the break) still goes to `/dashboard`.

**Implementation Note**: After Phase 2 and its automated verification pass, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- Mode/energy validation in `EnergyPicker` prefill (valid `Mode` honored, invalid/absent falls back to `useLastMode`/default) — if a lightweight unit seam exists; otherwise cover via the manual checks above.

### Integration Tests:

- `sessions.continue.test.ts`: continue preserves `planned_break_seconds`, nulls `planned_focus_seconds`, sets `count_up` (Phase 1).

### Manual Testing Steps:

1. Preset session → continue → stop → "Take a break" available and runs the original break duration.
2. Preset session → break completes → prefilled `/session/new` (energy/topic/format/preset chip).
3. Continued session → break completes → prefilled `/session/new` with count-up mode.
4. Deleted topic → redirect → falls back to "none", no error.
5. Native count-up session → no break, no redirect (regression).

## Migration Notes

None — no schema changes. The relaxed invariant produces rows with `timer_mode="count_up"` AND non-null `planned_break_seconds`; no DB CHECK blocks this, and reopen/reload read the row correctly.

## References

- Research: `context/changes/fix-continue-sessions/research.md`
- Prior slice: `context/archive/2026-07-13-continue-session-past-end/plan.md` (invariant + count-up rationale)
- Reopen re-derivation: `context/archive/2026-07-13-reopen-running-session/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Preserve the break on continue

#### Automated

- [x] 1.1 Type checking passes: `npm run lint`
- [x] 1.2 Continue integration tests pass: `npm test -- sessions.continue`
- [x] 1.3 Full test suite passes: `npm test`

#### Manual

- [x] 1.4 Continue → stop → "Take a break" offered and runs original break duration
- [x] 1.5 Reload continued session → break still available afterward
- [x] 1.6 Native count-up session still offers no break

### Phase 2: Preset-carrying redirect after break

#### Automated

- [ ] 2.1 Type checking + lint pass: `npm run lint`
- [ ] 2.2 Full test suite passes: `npm test`
- [ ] 2.3 Build passes: `npm run build`

#### Manual

- [ ] 2.4 Normal preset break completes → prefilled `/session/new` (energy/topic/format/preset chip)
- [ ] 2.5 Manual "End break" → same prefilled `/session/new`
- [ ] 2.6 Continued session break → prefilled `/session/new` with count-up mode
- [ ] 2.7 Deleted topic → falls back to "none", no error
- [ ] 2.8 Rating-screen "Go to dashboard" still goes to `/dashboard`
