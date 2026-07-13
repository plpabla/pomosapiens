# Re-open a Running Session from the Dashboard (S-11) Implementation Plan

## Overview

Add a **Resume** control to every in-progress session row on the dashboard, placed next to the existing Abandon button (Resume on the left, Abandon on the right). Tapping it navigates the user back to that session's `/session/[id]` page, where the existing load-time reconciliation redraws the running timer from `started_at`. Today, once a session's tab/window is closed its UUID is lost and the dashboard only lets the user _see_ that a session is running or _abandon_ it — there is no way back into it. This slice closes that gap with one additive UI element; the route, guards, ownership enforcement, and timer-resilience it depends on already exist.

## Current State Analysis

- **In-progress rows already have a gated action block.** [SessionTile.tsx:33](src/components/session/SessionTile.tsx#L33) renders `<AbandonButton sessionId={session.id} />` when `status === "in_progress" && !readOnly`. The Resume control belongs in that exact same block, so status/readonly gating is already solved.
- **The reopen target already works correctly.** [session/[id].astro](src/pages/session/[id].astro) loads the row scoped by `.eq("id", id).eq("user_id", user.id).maybeSingle()`, then calls `resolveSessionPageAccess` ([access.ts](src/lib/session/access.ts)): a non-ended, owned session is _allowed_; an ended session or a `null` row (cross-user or missing → RLS/ownership) _redirects to `/dashboard`_. No age guard remains (removed per lessons L-05). This is precisely the behavior S-11 needs — reopening only ever lands on a live, owned session; anything else bounces to the dashboard.
- **Timer redraw is free.** [SessionRunner.tsx](src/components/session/SessionRunner.tsx) derives elapsed/remaining from `startedAtMs` on mount and on `visibilitychange` (lessons L-03), so a reopened session shows the correct time with zero new logic.
- **A mirror test exists.** [session-abandon.spec.ts](tests/e2e/session-abandon.spec.ts) is the shape to copy: seed an in-progress + a completed session, assert control presence/absence by role+name, drive the action, assert the resulting navigation/state. Fixtures: `tests/e2e/_fixtures/auth.ts` (`setupTwoUsers`, `seedAuthCookie`, `cookieFor`) and `tests/e2e/_fixtures/sessions.ts` (`insertSession`).
- **Anonymous sessions are out of scope.** The `readOnly` prop flags anonymous/localStorage rows; those have no `/session/[id]` server page, so Resume stays behind the existing `!readOnly` gate (same as Abandon).

## Desired End State

On `/dashboard`, each in-progress session row (any row with `ended_at === null`, signed-in view) shows a **Resume** control next to its **Abandon** control, Resume on the left. Clicking Resume navigates to that session's `/session/[id]` page and the running timer renders with correct elapsed/remaining time. Completed/rated rows show neither control. Anonymous (localStorage) rows are unchanged. Multiple in-progress rows each get their own independent Resume control. Verified by an e2e spec that drives the happy path and asserts the completed-row guard.

### Key Discoveries:

- In-progress action gating already lives at [SessionTile.tsx:33](src/components/session/SessionTile.tsx#L33) — reuse the same condition, don't add a new one.
- `resolveSessionPageAccess` ([access.ts:12](src/lib/session/access.ts#L12)) already redirects ended/cross-user reopens to `/dashboard` — reuse it, do not re-derive any guard.
- `AbandonButton` ([AbandonButton.tsx](src/components/dashboard/AbandonButton.tsx)) is the styling/structure reference; it wraps `ConfirmActionButton` with `fullWidth`. Resume performs a plain navigation (no confirm, no API call), so it is a `<button>` whose `onClick` navigates — matching Abandon's `role="button"` rather than being a link.
- Both controls render as `<button>` (role `button`); their distinct accessible names ("Resume" vs "Abandon") keep the e2e locators unambiguous.
- The two controls sit side by side in a flex row (Resume left, Abandon right). Abandon currently uses `ConfirmActionButton` with `fullWidth`; laying them out horizontally means each takes an equal share of the row width rather than one full-width column.

## What We're NOT Doing

- No schema, migration, API route, or RLS change (roadmap confirms ownership is already enforced by RLS + the page query).
- No single-active-session guarantee — multiple in-progress sessions remain possible, each with its own Resume control (roadmap S-11 unknown, resolved: not in scope).
- No change to `/session/[id]`, `access.ts`, `SessionRunner`, or the abandoned/ended guards — they already do the right thing.
- No Resume for anonymous/localStorage sessions (no server page exists to resume into).
- No whole-row-clickable behavior — an explicit Resume button only.
- No unit/component test — coverage is the single e2e spec.

## Implementation Approach

Introduce a small `ResumeButton` presentational component (a `<button>`, styled consistently with `AbandonButton`, whose `onClick` navigates to `/session/${sessionId}`), and render it beside `AbandonButton` (Resume left, Abandon right) inside the existing `status === "in_progress" && !readOnly` block in `SessionTile`, wrapping both in a flex row. Then add one e2e spec mirroring `session-abandon.spec.ts` to lock the happy path and the completed-row guard.

## Phase 1: Resume control

### Overview

Add the Resume affordance to in-progress dashboard rows, above the existing Abandon button, signed-in rows only.

### Changes Required:

#### 1. Resume button component

**File**: `src/components/dashboard/ResumeButton.tsx` (new)

**Intent**: A presentational navigation control that takes the user to the in-progress session's page. No API call, no confirm step — a `<button>` whose click navigates. Mirror the visual weight of the Abandon control so the two sit cleanly side by side.

**Contract**: Default export `ResumeButton({ sessionId }: { sessionId: string })` rendering a `<button type="button">` with accessible name "Resume" (role `button`) whose `onClick` navigates to `/session/${sessionId}` (e.g. `window.location.assign(...)`). Styled consistently with the row's action buttons; sized to sit next to Abandon (not full-width). Use `cn()` from `@/lib/utils` for class composition per repo convention.

#### 2. Render Resume beside Abandon in the in-progress block

**File**: `src/components/session/SessionTile.tsx`

**Intent**: Show the Resume control to the left of the Abandon control for in-progress, non-readonly rows. Reuse the existing gating condition — do not introduce a second one.

**Contract**: Within the existing `{status === "in_progress" && !readOnly && (...)}` block at [SessionTile.tsx:33](src/components/session/SessionTile.tsx#L33), wrap `<ResumeButton sessionId={session.id} />` and `<AbandonButton sessionId={session.id} />` in a horizontal flex row with Resume first (left) and Abandon second (right), each taking an equal share of the width. Add the `ResumeButton` import.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- On `/dashboard` with an in-progress session, a "Resume" control appears to the left of the "Abandon" control on that row.
- Clicking "Resume" navigates to `/session/[id]` and the running timer renders with the correct elapsed/remaining time.
- A completed/rated row shows neither "Resume" nor "Abandon".
- With two in-progress rows, each shows its own "Resume" control linking to its own session.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: E2E coverage

### Overview

Add one Playwright spec that verifies the Resume happy path and the completed-row guard, mirroring the abandon spec.

### Changes Required:

#### 1. Resume e2e spec

**File**: `tests/e2e/session-resume.spec.ts` (new)

**Intent**: Prove end-to-end that an in-progress row's Resume control navigates into that session's running-timer page, and that completed rows expose no Resume control. This covers the two real risks: correct navigation and correct guarding.

**Contract**: One `test(...)` following [session-abandon.spec.ts](tests/e2e/session-abandon.spec.ts): use `setupTwoUsers` + `seedAuthCookie` (from `./_fixtures/auth`) and `insertSession` (from `./_fixtures/sessions`) to seed one completed/rated session and one in-progress session (`ended_at` null) for user A. Assert `getByRole("button", { name: "Resume" })` has count 1 on the dashboard (the completed row exposes no Resume). Click Resume, `waitForURL(/\/session\//)`, and assert the running-timer UI is visible (a stable role/text locator from `SessionRunner`, not a CSS selector). Use unique per-run identifiers and the fixture's `cleanup()` in a `finally` block, per the repo's test-independence rule. Wait on state (`toBeVisible`, `waitForURL`), never `waitForTimeout`.

### Success Criteria:

#### Automated Verification:

- The new spec passes: `npm run test:e2e -- session-resume` (requires local Supabase running + env vars set)
- Full e2e suite still green: `npm run test:e2e`
- Linting passes: `npm run lint`

#### Manual Verification:

- The spec fails if the Resume link is removed from `SessionTile` (guards against silent deletion) — confirm by a quick local check.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None. The change is a single presentational link; the e2e spec covers the behavior that can actually regress (navigation + guard).

### Integration Tests:

- Covered by the e2e spec: dashboard render → Resume click → `/session/[id]` running-timer render, plus completed-row absence.

### Manual Testing Steps:

1. Start a session, then navigate back to `/dashboard` (simulating a closed/reopened tab) — the in-progress row shows Resume above Abandon.
2. Click Resume — land on `/session/[id]` with the timer running and showing correct elapsed/remaining time.
3. Complete/rate a session — confirm its row shows no Resume/Abandon.
4. Start a second session — confirm each in-progress row has its own Resume linking to the correct session id.

## Performance Considerations

None. A static link adds no runtime cost.

## Migration Notes

None. No data or schema changes; existing in-progress rows immediately gain the Resume control on next dashboard render.

## References

- Roadmap slice: `context/foundation/roadmap.md` S-11
- Mirror test: `tests/e2e/session-abandon.spec.ts`
- Reopen target + guard: `src/pages/session/[id].astro`, `src/lib/session/access.ts:12`
- Action-block host: `src/components/session/SessionTile.tsx:33`
- Timer resilience (why reopen redraws correctly): lessons L-03; audio prime caveat on refresh: L-02

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Resume control

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 7bdb912
- [x] 1.2 Production build passes: `npm run build` — 7bdb912

#### Manual

- [x] 1.3 In-progress row shows "Resume" to the left of "Abandon" — 7bdb912
- [x] 1.4 Clicking "Resume" navigates to `/session/[id]` with the running timer at correct elapsed/remaining time — 7bdb912
- [x] 1.5 Completed/rated row shows neither "Resume" nor "Abandon" — 7bdb912
- [x] 1.6 Two in-progress rows each show their own "Resume" linking to their own session — 7bdb912

### Phase 2: E2E coverage

#### Automated

- [x] 2.1 New spec passes: `npm run test:e2e -- session-resume` — 196d938
- [x] 2.2 Full e2e suite still green: `npm run test:e2e` — 196d938
- [x] 2.3 Linting passes: `npm run lint` — 196d938

#### Manual

- [x] 2.4 Spec fails if the Resume link is removed from `SessionTile` (silent-deletion guard) — 196d938
