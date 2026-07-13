# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

---

## L-01: RLS + API column-scope discipline

Wide UPDATE RLS policies (owner can mutate any column) must be narrowed by the API layer, not by the schema. RLS enforces row-level ownership; the endpoint enforces column-level immutability (e.g. only `focus_rating` and `ended_at` are writable on `PATCH /api/sessions/[id]`; all other columns are set server-side or are generated). An `.is("ended_at", null)` guard in the query makes the row writable exactly once.

Column-scope is two-layer: (1) Zod's default-strip on `z.object(...)` discards unknown body keys before they reach `parsed.data`; (2) the hand-picked `.update({ ended_at, focus_rating })` pins the write set. Switching the schema to `.passthrough()` breaks layer 1; switching the endpoint to `.update(parsed.data)` after widening the schema breaks layer 2. Both layers must hold. A regression test should catch the combined failure (schema widened to include a protected column AND endpoint spreads `parsed.data`) -- it will not trip on a pure `.update(parsed.data)` swap alone while the schema only defines the intended write columns.

**Source:** F-01 impl-review (`context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md:36-43`); codified during S-01.

---

## L-02: Audio autoplay requires a same-document user-gesture prime

Browsers (especially Safari) do not carry user-activation across navigations. To reliably play audio on page B after a click on page A:

- **On page A's click handler** -- construct `new Audio(src)`, set `muted = true`, call `.play().then(() => { a.pause(); a.muted = false; }).catch(() => {})`. This warms the asset cache and raises Chrome's MEI for the origin.
- **On page B's first `useEffect`** -- repeat the muted `.play()/.pause()` warm-up immediately on mount. Most browsers count a same-origin navigation initiated by a user gesture as a "user-gesture-initiated load" and grant activation for this step. Store the warmed `Audio` in a ref; call `.play()` on that ref later (never construct a new element at fire time).

Failing to prime on page B means Safari will silently block the unmuted `.play()` even though page A primed it. The chime must be fail-open (`.catch(() => {})`) -- the rating view must still appear even if the chime is blocked.

**Source:** S-01 Phase 4 audio autoplay policy (plan §Critical Implementation Details).

---

## L-03: Timer resilience -- derive remaining from server anchor, never decrement

Browser `setInterval` / `setTimeout` are throttled in background tabs and paused during screen-lock. A timer that decrements a local counter will desync on every tab-switch. The correct pattern:

```ts
const remaining = focusSeconds - Math.floor((Date.now() - startedAtMs) / 1000);
```

Run this on every `setTimeout` tick (1 s chain, not `setInterval`) and on every `visibilitychange` to `visible`. `startedAtMs` comes from the server-stored `started_at`; it is stable across the lifetime of the session. The wall-clock recompute means CPU throttling and tab freezing are completely harmless -- the next tick after unfreeze derives the correct remaining time from the real elapsed wall time.

**Source:** S-01 Phase 4 timer implementation (plan §Critical Implementation Details).

---

## L-04: Vite deps_ssr cache can go stale after npm install mid-session

When `npm install` runs during development (e.g. `npx shadcn add <component>`), Vite's pre-bundled SSR dependency cache (`node_modules/.vite/deps_ssr/`) can become inconsistent with the updated `node_modules`. This manifests as cryptic SSR hook errors (e.g. `Cannot read properties of null (reading 'useHostTransitionStatus')` from `useFormStatus`) that do not reproduce in a production build. Fix: delete `node_modules/.vite/` and restart the dev server.

**Source:** S-01 Phase 5 -- cache stale after `npx shadcn add card` in Phase 2.

---

## L-05: Time-based access guards couple to session duration and break under open-ended modes

A guard of the form "redirect if session age > N \* focusPresetSeconds" silently assumes a fixed nominal duration. It breaks the moment any feature removes or loosens that assumption (count-up mode, deep-work sessions, user-editable presets). The guard provides no safety once the duration is variable -- it either cuts short legitimate sessions or lets abandoned ones through.

Prefer explicit state transitions: the `/session/[id]` page should allow any non-ended session (null `ended_at`) regardless of age, and the only guards that belong there are ownership (cross-user redirect) and ended-state (replay-protection redirect). Age-based heuristics for "abandoned" belong in UI labels, not in access control -- and even those should be driven by an explicit user action once one exists.

**Source:** S-03 Phase 8 -- 50-min redirect in `session/[id].astro` and "Abandoned" label in `dashboard.astro` folded out when count-up mode made fixed-duration assumptions invalid.

---

## L-06: Sessions immutability was deliberately narrowed to support explicit user-initiated delete

`sessions` had no `DELETE` policy at all (`20260601120000_drop_sessions_delete_policy.sql`) -- "sessions are immutable history once written" was an intentional business rule, pinned by a pgTAP test asserting delete is denied. S-05's explicit-abandon flow reversed this: `20260706120000_add_sessions_delete_policy.sql` reinstates `sessions_delete_own`, fully open (owner can delete any of their own sessions, in progress or already ended), not scoped to in-progress rows only.

If you encounter the old immutability RLS test or its accompanying comment and are tempted to "fix" a failing delete back to denial, don't -- the reversal was deliberate and user-confirmed, not a regression. This same DELETE capability also substantially delivers S-07 (`edit-delete-sessions`)'s delete half; S-07's remaining scope is narrowed to editing a session's fields only.

**Source:** S-05 `explicit-session-abandon` (`context/changes/explicit-session-abandon/change.md`, `plan.md`).

---

## L-07: Extract sibling controls into a composition component

React component composition, especially tile/row-style components with conditional action blocks (e.g. `SessionTile`, `dashboard/*`). Host components accumulate ad-hoc conditional JSX blocks bundling multiple sibling controls, becoming hard to read and test as more controls are added.

Build compositions of small, reusable components. When a component accumulates conditional UI blocks bundling multiple sibling controls (e.g. Resume + Abandon buttons), extract that block into its own named composition component (e.g. `InProgressSessionActions`) with minimal props, mirroring existing precedent (e.g. `CompletedSessionActions.tsx`).

**Applies to:** plan, implement, impl-review, plan-review

**Source:** `reopen-running-session` Phase 1 -- `SessionTile` grew a second in-progress control (Resume beside Abandon); extracted into `InProgressSessionActions.tsx`, mirroring `dashboard/CompletedSessionActions.tsx`.
