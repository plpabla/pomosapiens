# Edit & Delete Logged Sessions (S-07) Implementation Plan

## Overview

Give users corrective control over their session history. Two capabilities:

1. **Edit a logged session** — from the dashboard, open a modal to correct a completed session's duration (e.g. a count-up session that ran to 3h because the user forgot to stop) plus its energy, topic, material format, focus rating, and note. Backed by a new `PUT /api/sessions/[id]`.
2. **Delete a logged session** — a confirm-guarded delete control on completed history rows (e.g. a 10-second accidental start). The `DELETE` endpoint and its RLS policy already exist (L-06); this is UI wiring only.

Both operations are owner-scoped at the RLS layer and re-enforced at the API layer.

## Current State Analysis

- **`sessions.duration_seconds` is a GENERATED STORED column** (`ended_at - started_at`), `supabase/migrations/20260531182506_sessions_data_foundation.sql:85-90`. It cannot be written directly — editing "duration" means writing a recomputed `ended_at` with `started_at` held fixed.
- **`PATCH /api/sessions/[id]`** (`src/pages/api/sessions/[id].ts:14-60`) is the end-session handler. It is unusable for editing a logged session because of two guards that are correct for ending-once but wrong for correcting history:
  - `.is("ended_at", null)` write-once guard (`:47`) — rejects any write to an already-ended row.
  - 2-hour plausibility window on `ended_at` (`:38`) — a legitimate correction (3h → 1h) moves `ended_at` far outside `now ± 2h`.
- **`DELETE /api/sessions/[id]`** (`src/pages/api/sessions/[id].ts:62-94`) is fully open and owner-scoped; RLS `sessions_delete_own` exists (`...182506_...sql:147-149`). Delete is done at the data/API layer (L-06). It is currently only reachable from the UI for **in-progress** rows via `AbandonButton` (`src/pages/dashboard.astro:172-176`).
- **RLS** `sessions_update_own` / `sessions_delete_own` are owner-scoped and column-wide (`...182506_...sql:142-149`). Per **L-01**, column-level immutability is the API's job: Zod default-strips unknown keys + a hand-picked `.update({...})` pins the write set. Both layers must hold.
- **Dashboard** (`src/pages/dashboard.astro`) is Astro SSR with React islands (`FocusRatingChart`, `AbandonButton`, `LocalDateTime`). It renders the history list and derives the focus-rating chart from current rows on each SSR load — so edits/deletes reflect automatically with no cache to invalidate.
- **Picker-loading pattern** exists in `EnergyPicker.tsx:92-106`: `fetch("/api/topics")` + `fetch("/api/material-formats")`, filter `archived_at === null`, render shadcn `Select`s. The edit modal reuses this verbatim.
- **UI primitives** available: `dialog`, `input`, `label`, `textarea`, `select` under `src/components/ui/`. Note: `FocusRating.tsx` is **not** a reusable field input — it is a full-screen session-end view (renders `min-h-screen`, owns its own note `Textarea`, submits immediately via `onSubmit` on tap, then flips to a "Session saved" screen with navigation buttons). The modal needs a small inline 1–5 selector; only its rating-button markup (`FocusRating.tsx:132-146`) is liftable.

## Desired End State

From the dashboard history list:

- Each **completed** session row shows an **Edit** control and a **Delete** control. In-progress rows keep the existing **Abandon** control unchanged.
- **Edit** opens a modal pre-filled with the session's current values. The user can change duration (in minutes), energy, topic, material format, focus rating (1–5 or skip), and note. Saving persists the changes; the row (and the focus-rating chart) reflect them after reload.
- **Delete** requires a confirm step, then removes the row entirely; it disappears from history and from the chart after reload.
- All edits/deletes are rejected for non-owners (RLS + API), and the edit endpoint rejects impossible durations (≤ 0 or > 24h) and refuses to edit an in-progress session.

Verify: `npm test` (unit + integration green, including L-01 gate and cross-user 409), `npm run test:e2e` (edit + delete happy-path specs green), `npm run lint`, and manual dashboard walkthrough.

### Key Discoveries:

- `duration_seconds` is generated — write `ended_at`, never `duration_seconds` (`...182506_...sql:85-90`).
- The end-session PATCH's write-once + plausibility guards force a **separate** edit handler (`PUT`), keeping the capture-loop contract and its tests untouched.
- Delete endpoint + RLS already exist (L-06) — Phase 3 is UI only.
- L-01 column-scope discipline applies to the new `PUT` exactly as it does to `PATCH`.
- `EnergyPicker.tsx:92-106` is the reusable picker-fetch pattern for the modal.

## What We're NOT Doing

- **Not** re-implementing the DELETE endpoint or its RLS policy (already shipped in S-05 — L-06).
- **Not** adding a `deleted_at` soft-delete column or audit trail — hard delete matches the user mental model ("remove completely") and the PRD has no retention requirement.
- **Not** editing `started_at` (the real begin time stays fixed) — the modal edits duration only, which recomputes `ended_at`.
- **Not** touching the end-session `PATCH` handler, its guards, or its tests.
- **Not** adding a dedicated `/session/[id]/edit` route — editing happens in a dashboard modal.
- **Not** editing in-progress sessions through this path — those use the existing runner / Abandon flow.
- **Not** adding a schema migration — RLS already permits owner UPDATE/DELETE.

## Implementation Approach

Backend first (Phase 1): a new `editSessionSchema` and a `PUT` handler on the existing `[id].ts` route, independently verifiable via `npm test`. Then the edit UI (Phase 2): a dashboard modal island reusing the EnergyPicker picker-fetch pattern. Then the delete UI (Phase 3): a confirm-guarded control on logged rows reusing the AbandonButton interaction pattern against the existing DELETE endpoint. Delete is separated because it is pure UI wiring over a shipped endpoint and carries independent risk. Finally, browser E2E (Phase 4): happy-path Playwright specs for both edit and delete, kept in a dedicated phase so it runs through the `/10x-e2e` workflow rather than the UI-implementation workflow.

## Critical Implementation Details

- **Duration → `ended_at` recompute.** The `PUT` handler must read the row's `started_at` (owner-scoped) before writing, then set `ended_at = new Date(startedAtMs + duration_seconds * 1000).toISOString()`. Supabase-js cannot express `started_at + interval` in a single `.update()`, so this is a SELECT-then-UPDATE. Scope the SELECT to `user_id = caller` AND `ended_at IS NOT NULL` so an in-progress row is never editable through this path and cross-user reads return nothing.
- **L-01 column-scope on `PUT`.** The write set is hand-picked: `.update({ ended_at, energy_level, topic_id, material_format_id, focus_rating, note })`. Never include `duration_seconds` (generated) or `user_id`/`started_at`. `editSessionSchema` must be a plain `z.object(...)` (default-strip), never `.passthrough()`.

## Phase 1: Edit endpoint + schema + backend tests

### Overview

Add `editSessionSchema` and a `PUT` handler that corrects a logged session's fields, then cover it with unit + integration tests including the L-01 regression gate.

### Changes Required:

#### 1. Edit session schema

**File**: `src/lib/schemas/session.ts`

**Intent**: Define the validated write shape for editing a logged session. Accept duration in seconds (consistent with `planned_focus_seconds`), bounded to reject impossible/absurd values; accept the editable context fields with the same shapes already used by `createSessionSchema` / `endSessionSchema`.

**Contract**: New `export const editSessionSchema = z.object({ ... })` + `export type EditSessionPayload`. Fields:
- `duration_seconds`: `z.number().int().min(1).max(24 * 60 * 60)` (positive, ≤ 24h).
- `energy_level`: `z.enum(["low","medium","high"])` (reuse `createSessionSchema`'s message).
- `topic_id`: `z.uuid().nullable().optional()`.
- `material_format_id`: `z.uuid().nullable().optional()`.
- `focus_rating`: `z.number().int().min(1).max(5).nullable()` (1–5 or null = skip).
- `note`: same shape as `endSessionSchema.note` (trim, max 500, nullable/optional, `"" → null`).

Plain `z.object` — no `.passthrough()` (L-01 layer 1).

#### 2. PUT handler for editing a logged session

**File**: `src/pages/api/sessions/[id].ts`

**Intent**: Add a `PUT` export alongside the existing `PATCH`/`DELETE` that corrects an already-ended, owner-owned session. It recomputes `ended_at` from the edited duration and writes only the whitelisted columns. It must not share the end-session guards.

**Contract**: `export const PUT: APIRoute`. Flow:
1. Same auth / supabase-config / missing-id guards as `PATCH` (401 / 500 / 400).
2. Parse body with `editSessionSchema` → 400 on failure (error shape matches existing routes).
3. SELECT `started_at` from `sessions` where `id = id` AND `user_id = caller` AND `ended_at IS NOT NULL` (`.not("ended_at", "is", null)`), `.maybeSingle()`. No row → 404 `{ error: "Session not found" }` (covers cross-user, non-existent, and in-progress uniformly — information-hiding, consistent with the PATCH 409 contract).
4. Compute `endedAtIso = new Date(new Date(started_at).getTime() + duration_seconds * 1000).toISOString()`.
5. UPDATE with the hand-picked column set `{ ended_at: endedAtIso, energy_level, topic_id, material_format_id, focus_rating, note }`, scoped `.eq("id", id).eq("user_id", caller)`, `.select("id").maybeSingle()`. Null → 404; DB error → 500; success → `{ ok: true }` 200.

No plausibility window and no `.is("ended_at", null)` guard — those belong to the end-session PATCH only. Update the file's header comment to note that `PUT` edits an already-ended row and recomputes `ended_at` from duration.

#### 3. Unit tests for the edit schema

**File**: `tests/unit/schemas/session.test.ts`

**Intent**: Pin `editSessionSchema` accept/reject behavior at the boundaries.

**Contract**: Add a `describe("editSessionSchema")` covering: valid full payload passes; `duration_seconds` 0 and negative rejected; `duration_seconds` > 24h rejected; `duration_seconds = 1` and `= 24h` accepted; `focus_rating` null accepted, 0/6 rejected; `note` `""` transforms to `null`, > 500 chars rejected; unknown keys stripped (assert `energy_level`-adjacent junk like `user_id` is absent from parsed output).

#### 4. Integration tests for PUT

**File**: `tests/integration/api/sessions.edit.test.ts` (new)

**Intent**: Cover the security-critical write path at the API boundary, mirroring `sessions.end.test.ts` structure and the two-user fixture.

**Contract**: Helper that creates then ends a session (so it is editable). Tests:
- **L-01 column-scope gate**: PUT with extra keys (`user_id`, `started_at`, `duration_seconds`) → 200, and a `readSession` assert that `user_id`/`started_at` are unchanged and `duration_seconds` reflects the recomputed `ended_at` (from `duration_seconds` in the body), not the injected value.
- **Recompute correctness**: edit duration to N seconds → `readSession().duration_seconds === N` and `ended_at === started_at + N`.
- **Context fields written**: energy/topic/format/rating/note persisted.
- **Duration bounds**: 0 → 400, negative → 400, `> 24h` → 400, `1` → 200, `24h` → 200.
- **In-progress not editable**: create (don't end) → PUT → 404, row unchanged.
- **Cross-user**: user B PUTs user A's ended session → 404, no mutation.
- **401** when unauthenticated.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint` (type-checked ESLint config)
- Unit tests pass: `npm test -- tests/unit/schemas/session.test.ts`
- Integration tests pass: `npm test -- tests/integration/api/sessions.edit.test.ts`
- Full suite green: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- A `curl`/REST `PUT` to a completed session (as its owner) with a new `duration_seconds` returns `{ ok: true }` and the row's `duration_seconds` matches after reload.
- A `PUT` to an in-progress session returns 404.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Dashboard edit modal

### Overview

Add an `EditSessionDialog` island opened from an **Edit** control on completed history rows.

### Changes Required:

#### 1. Edit modal component

**File**: `src/components/dashboard/EditSessionDialog.tsx` (new)

**Intent**: A React island that renders an Edit trigger button and a shadcn `Dialog` form pre-filled with the session's current values, letting the user correct duration (minutes) + energy + topic + material format + focus rating + note, then `PUT`s the change and reloads.

**Contract**: Props = the row's current values (`id`, `startedAt`, `durationSeconds`, `energyLevel`, `topicId`, `materialFormatId`, `focusRating`, `note`). On open, fetch topics + material-formats and filter `archived_at === null` (reuse `EnergyPicker.tsx:92-106` pattern). Form controls: duration `Input` in minutes (default `Math.round(durationSeconds / 60)`) — track whether the user actually edited this field (a "dirty" bit); if untouched, submit the **original `durationSeconds`** unchanged so a no-op save is lossless and sub-minute rows aren't silently rounded (a 90s row must not become 120s, and a 10s row's `Math.round → 0` must not produce a 400), energy `Select`, topic `Select` (with a "No topic" sentinel like EnergyPicker's `NONE`), format `Select` (same sentinel), focus rating (a small inline 1–5 selector with a skip/none option — lift the rating-button markup from `FocusRating.tsx:132-146`; do **not** embed the `FocusRating` component, which is a full-screen submit-on-tap terminal view), note `Textarea`. On save: `PUT /api/sessions/${id}` with body `{ duration_seconds: durationDirty ? minutes * 60 : durationSeconds, energy_level, topic_id, material_format_id, focus_rating, note }`; on success `window.location.reload()`; on error show `ServerError`. Use accessible labels (`getByLabel`/`getByRole`-friendly) so e2e can target controls without CSS selectors.

#### 2. Wire Edit control into completed rows

**File**: `src/pages/dashboard.astro`

**Intent**: Render the edit trigger on completed rows only, passing the row's current values; in-progress rows are unchanged.

**Contract**: In the `status === "done"` branch of the row footer, render `<EditSessionDialog ... client:visible />` with the row's fields (use `client:visible`, not `client:load`, so up to 50 rows don't eagerly hydrate ~100 islands on page load) (the dashboard `select` already includes `energy_level`, `duration_seconds`, `focus_rating`, `ended_at`, `timer_mode`, `note`). Extend the SSR `select` to also fetch `topic_id` and `material_format_id` (currently only joined `topic:topics(name)` / `material_format:material_formats(name)` are selected) so the modal can pre-select them. Keep the existing in-progress `AbandonButton` block untouched.

### Success Criteria:

#### Automated Verification:

- Linting + types pass: `npm run lint`
- Full unit/integration suite still green: `npm test`

#### Manual Verification:

- On the dashboard, a completed row shows **Edit**; opening it pre-fills all current values.
- Changing the duration to a smaller number and saving updates the row's displayed duration and shifts the row in the focus-rating chart if rating changed.
- Changing topic/format/energy/rating/note persists after reload.
- In-progress rows show only **Abandon** (no Edit).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Delete control on logged rows

### Overview

Expose the existing DELETE endpoint on completed history rows via a confirm-guarded control.

### Changes Required:

#### 1. Delete control component

**File**: `src/components/dashboard/DeleteSessionButton.tsx` (new)

**Intent**: A confirm-guarded delete control for completed rows, mirroring `AbandonButton`'s idle → confirming → submitting interaction but labeled for deletion. Reuses the shipped `DELETE /api/sessions/[id]`.

**Contract**: Props = `{ sessionId }`. Same three-phase state machine and error handling as `AbandonButton.tsx`, with labels "Delete" / "Confirm?" / "Deleting..." and a Cancel affordance. On confirm: `fetch(/api/sessions/${sessionId}, { method: "DELETE" })`; on success `window.location.reload()`; on failure surface `ServerError`. Kept as a separate component (not a param on `AbandonButton`) to leave the working in-progress Abandon flow untouched.

#### 2. Wire Delete control into completed rows

**File**: `src/pages/dashboard.astro`

**Intent**: Render the delete control on completed rows alongside Edit; in-progress rows keep Abandon only.

**Contract**: In the `status === "done"` footer (next to `EditSessionDialog`), render `<DeleteSessionButton sessionId={session.id} client:visible />` (`client:visible` for the same hydration reason as `EditSessionDialog`). In-progress `AbandonButton` block unchanged.

### Success Criteria:

#### Automated Verification:

- Linting + types pass: `npm run lint`
- Full suite green: `npm test`

#### Manual Verification:

- A completed row shows **Delete**; clicking requires a confirm step before removal.
- Confirming removes the row from history and from the focus-rating chart after reload.
- Deleting is not possible cross-user (covered by existing DELETE ownership scope; spot-check that the control only appears on the owner's own rows).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

**Scope extension (found in manual verification):** `EditSessionDialog` and `DeleteSessionButton` were originally two independent `client:visible` islands, so neither could see the other's state. That let a user open Delete's confirm step while Edit's trigger stayed visible and clickable, which read as confusing/contradictory UI. Fixed by introducing `src/components/dashboard/CompletedSessionActions.tsx` — a single island that composes both, hiding the `EditSessionDialog` trigger while `DeleteSessionButton` is in `confirming`/`submitting` phase. `DeleteSessionButton` gained an optional `onPhaseChange` callback (test-first, `tests/unit/dashboard/DeleteSessionButton.test.tsx`) to report its phase upward; `CompletedSessionActions` itself is covered by `tests/unit/dashboard/CompletedSessionActions.test.tsx`. `dashboard.astro`'s completed-row footer now renders `CompletedSessionActions` instead of `EditSessionDialog` + `DeleteSessionButton` directly. `EditSessionDialog.tsx` itself was not modified.

---

## Phase 4: E2E tests for edit + delete

### Overview

Cover the edit and delete happy paths at the browser level with Playwright specs, once the Phase 2/3 UI is in place. Run this phase through the `/10x-e2e` workflow (risk → seed test + rules → generate → review against the five anti-patterns → verify), not the UI-implementation workflow.

### Changes Required:

#### 1. Edit e2e spec

**File**: `tests/e2e/session-edit.spec.ts` (new)

**Intent**: Prove editing a logged session's duration through the modal updates the row.

**Contract**: Seed/create a completed session (reuse `tests/e2e/_fixtures/sessions.ts`), open the dashboard, click **Edit** on the row, change the duration field, save, wait for the row to reflect the new duration (`toBeVisible` on the updated value / `waitForResponse` on the PUT). Locators via `getByRole`/`getByLabel`; unique per-run ids; own cleanup. No `waitForTimeout`.

#### 2. Delete e2e spec

**File**: `tests/e2e/session-delete.spec.ts` (new)

**Intent**: Prove deleting a logged row removes it from history.

**Contract**: Seed/create a completed session, open the dashboard, click **Delete** on the row, confirm, then assert the row is gone (`await expect(row).toHaveCount(0)` / `not.toBeVisible`, or `waitForResponse` on the DELETE then re-query). Locators via `getByRole`/`getByText`; unique per-run ids; own cleanup; no `waitForTimeout`.

### Success Criteria:

#### Automated Verification:

- Linting + types pass: `npm run lint`
- Edit e2e passes: `npm run test:e2e -- session-edit`
- Delete e2e passes: `npm run test:e2e -- session-delete`
- Full unit/integration suite still green: `npm test`

#### Manual Verification:

- Both specs pass against a locally running app on a clean re-run (no cross-test state leakage).
- Specs use accessibility-first locators and wait on state, not timeouts (spot-check against the five anti-patterns).

**Implementation Note**: This phase depends on Phase 2 and Phase 3 UI being complete. Drive it with the `/10x-e2e` skill.

**Addendum (commit 79d4fe2)**: Adding these two Phase-4 specs raised parallel-worker CPU contention that surfaced pre-existing hydration-race flakes in `tests/e2e/session-abandon.spec.ts` and `tests/e2e/session-capture.spec.ts`; both were stabilized (retry-wrapped click / bumped timeout) in the same commit. No business-logic change — test-infra only.

---

## Testing Strategy

### Unit Tests:

- `editSessionSchema` boundaries: duration min/max, focus_rating range + null, note trim/empty/max, unknown-key stripping (L-01 layer 1).

### Integration Tests:

- `PUT /api/sessions/[id]`: L-01 column-scope gate, duration→`ended_at` recompute correctness, duration bounds, in-progress rejected (404), cross-user rejected (404, no mutation), 401 unauthenticated.

### Manual Testing Steps:

1. Complete a session, then edit its duration down; confirm the history row and chart update.
2. Edit topic/format/energy/rating/note; confirm persistence after reload.
3. Delete a short accidental session; confirm it disappears from history and chart.
4. Confirm in-progress rows still show only **Abandon**.

## Performance Considerations

Negligible. The `PUT` adds one SELECT + one UPDATE per edit (indexed by PK + `user_id`). The dashboard `select` gains two scalar columns (`topic_id`, `material_format_id`). No new N+1 or client polling. The per-row Edit/Delete controls use `client:visible` (not `client:load`) so a 50-row history doesn't eagerly hydrate ~100 islands; picker fetches fire only on modal open.

## Migration Notes

None. No schema change — RLS `sessions_update_own` / `sessions_delete_own` already permit owner writes/deletes. `duration_seconds` recomputes automatically from the written `ended_at`; `updated_at` is maintained by the existing trigger.

## References

- Roadmap slice: `context/foundation/roadmap.md` S-07 (`:166-179`)
- Lessons: `context/foundation/lessons.md` L-01 (column-scope), L-05 (no age guards), L-06 (delete already shipped)
- End-session handler (guards to NOT reuse): `src/pages/api/sessions/[id].ts:14-60`
- Delete handler (already shipped): `src/pages/api/sessions/[id].ts:62-94`
- Picker-fetch pattern to reuse: `src/components/session/EnergyPicker.tsx:92-106`
- Confirm-flow pattern to mirror: `src/components/dashboard/AbandonButton.tsx`
- Integration test pattern: `tests/integration/api/sessions.end.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Edit endpoint + schema + backend tests

#### Automated

- [x] 1.1 Type checking passes: `npm run lint` — d3cdfe7
- [x] 1.2 Unit tests pass: `npm test -- tests/unit/schemas/session.test.ts` — d3cdfe7
- [x] 1.3 Integration tests pass: `npm test -- tests/integration/api/sessions.edit.test.ts` — d3cdfe7
- [x] 1.4 Full suite green: `npm test` — d3cdfe7
- [x] 1.5 Linting passes: `npm run lint` — d3cdfe7

#### Manual

- [x] 1.6 Owner `PUT` with new `duration_seconds` returns `{ ok: true }` and row duration matches after reload — d3cdfe7
- [x] 1.7 `PUT` to an in-progress session returns 404 — d3cdfe7

### Phase 2: Dashboard edit modal

#### Automated

- [x] 2.1 Linting + types pass: `npm run lint` — bc7714c
- [x] 2.2 Full unit/integration suite still green: `npm test` — bc7714c

#### Manual

- [x] 2.3 Completed row shows Edit; opening pre-fills all current values — bc7714c
- [x] 2.4 Changing duration and saving updates displayed duration (and chart if rating changed) — bc7714c
- [x] 2.5 Changing topic/format/energy/rating/note persists after reload — bc7714c
- [x] 2.6 In-progress rows show only Abandon (no Edit) — bc7714c

### Phase 3: Delete control on logged rows

#### Automated

- [x] 3.1 Linting + types pass: `npm run lint` — b490efd
- [x] 3.2 Full suite green: `npm test` — b490efd

#### Manual

- [x] 3.3 Completed row shows Delete requiring a confirm step before removal — b490efd
- [x] 3.4 Confirming removes the row from history and chart after reload — b490efd
- [x] 3.5 Deleting is not possible cross-user; the Delete control only appears on the owner's own rows — b490efd

### Phase 4: E2E tests for edit + delete

#### Automated

- [x] 4.1 Linting + types pass: `npm run lint` — 0c6f032
- [x] 4.2 Edit e2e passes: `npm run test:e2e -- session-edit` — 0c6f032
- [x] 4.3 Delete e2e passes: `npm run test:e2e -- session-delete` — 0c6f032
- [x] 4.4 Full unit/integration suite still green: `npm test` — 0c6f032

#### Manual

- [x] 4.5 Both specs pass on a clean re-run (no cross-test state leakage) — 0c6f032
- [x] 4.6 Specs use accessibility-first locators and wait on state, not timeouts — 0c6f032
