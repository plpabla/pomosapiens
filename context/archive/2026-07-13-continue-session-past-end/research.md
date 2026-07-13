---
date: 2026-07-13T20:09:12+0200
researcher: pawel
git_commit: da06d0047798ac1a71e994797111d301d2843a98
branch: continue-session-past-end
repository: PomoSapiens
topic: "Risk analysis: what could break when converting a running countdown (preset) session to count-up mid-flight"
tags: [research, codebase, timer, count-up, state-machine, risk, timer_mode]
status: complete
last_updated: 2026-07-13
last_updated_by: pawel
---

# Research: Risk of converting a running countdown session to count-up mid-flight (S-10)

**Date**: 2026-07-13T20:09:12+0200
**Researcher**: pawel
**Git Commit**: da06d0047798ac1a71e994797111d301d2843a98
**Branch**: continue-session-past-end
**Repository**: PomoSapiens

## Research Question

For the `continue-session-past-end` change (roadmap S-10): when a preset (countdown) focus phase reaches its scheduled end, the user can tap "Continue" / "I'm still working" and the session converts to count-up mode, preserving the original `started_at`. **What could break?** Focus is on risk — every place that assumes a session's timer mode is fixed for its lifetime.

## Summary

The timer itself is soundly built (wall-clock derivation from a server anchor, L-03 honored), and one thing the change.md worried about is **already free**: `duration_seconds` is a Postgres GENERATED column (`ended_at - started_at`), so a converted session records the correct total elapsed with zero duration-recomputation logic, and the 🍅 badge/duration in history are already mode-neutral.

The real hazards cluster around **one architectural fact: mode is treated as immutable everywhere.** S-03 explicitly declared *"No mode-change once a session has started. Mode is locked at POST time"* and *"`timer_mode` must be written at POST time, not patched later"* — and S-06 (tab title) and S-11 (reopen) both silently rely on that. S-10 is the first change to break that invariant. The concrete breakage surfaces are:

1. **No server write path for `timer_mode`** — PATCH is column-pinned to `{ended_at, focus_rating, note}` (L-01). Converting requires a new/extended write that flips `timer_mode → count_up` on an `ended_at IS NULL` row without violating L-01's column-scope discipline.
2. **`mode` is a static prop, not React state** — plumbed once from `session/[id].astro:45` into `SessionRunner` → `useFocusTimer`. It cannot flip mid-render today.
3. **The focus-end fire is a one-way latch** (`firedRef`) that flips `phase → "rating"` and stops the tick. There is no state representing "continued, now counting up."
4. **`stoppedAtMs` would truncate the duration** — for preset it is snapshotted to the boundary (`startedAtMs + focusSeconds*1000`); a converted session must instead stop at live `Date.now()`.
5. **A converted row violates the count_up ⇒ null-planned-durations invariant** that is enforced *only at INSERT* (`api/sessions/index.ts:25-30`) — the conversion path must re-null `planned_*` itself (or the invariant is explicitly relaxed to insert-time only).
6. **Reopen (S-11) and tab-title (S-06)** re-derive mode from the persisted `timer_mode`; unless the flip is persisted, a reload after conversion renders the session as a countdown again.

> **Not a risk (corrected):** the 2-hour PATCH plausibility window (`sessions/[id].ts:45`) checks `ended_at` against **now** (`[now-2h, now+5s]`), *not* `ended_at - started_at`. A count-up session snapshots `stoppedAtMs = Date.now()` at Stop, so `ended_at ≈ now` and it passes regardless of total elapsed. The window is a stale/forged-`ended_at` guard, never a duration cap; long count-up sessions save fine.

One framing correction from the code: the "auto focus→break transition" named in change.md is **not automatic** — the focus-end lands on the **rating screen**, and "Take a break" is a user choice there. The "Continue" affordance therefore belongs on that same focus-end surface.

## Detailed Findings

### A. Timer state machine (how countdown works, where it ends)

- Running timer is `SessionRunner.tsx`, driven by `useFocusTimer.ts`. Time is derived, never decremented — L-03 genuinely honored:
  - `remaining = focusSeconds - Math.floor((now - startedAtMs) / 1000)` ([useFocusTimer.ts:132](src/lib/timer/useFocusTimer.ts#L132)); `elapsed = Math.max(0, Math.floor((now - startedAtMs)/1000))` ([:133](src/lib/timer/useFocusTimer.ts#L133)).
  - Tick is a `setTimeout` chain, not `setInterval` ([:82-95](src/lib/timer/useFocusTimer.ts#L82-L95)); reconciles on `visibilitychange` ([:104-125](src/lib/timer/useFocusTimer.ts#L104-L125)).
- **Focus-end condition**: `remaining <= 0 && !firedRef.current` at [useFocusTimer.ts:86-94](src/lib/timer/useFocusTimer.ts#L86-L94) (tick) and [:111-118](src/lib/timer/useFocusTimer.ts#L111-L118) (visibility). At fire: snapshots `stoppedAtMs = startedAtMs + focusSeconds*1000`, plays the chime, flips `phase → "rating"`. `firedRef` ([:29](src/lib/timer/useFocusTimer.ts#L29)) is a one-way single-fire latch (added by S-03 impl-review finding F3).
- **There is no auto focus→break transition in the timer.** Focus-end → rating screen (`FocusRating`, [SessionRunner.tsx:162-175](src/components/session/SessionRunner.tsx#L162-L175)); "Take a break" is user-initiated there ([:168-171](src/components/session/SessionRunner.tsx#L168-L171)), starting a separate `useBreakTimer.ts`.

### B. Count-up mode today (the target state)

- Discriminator is a two-value `mode: "preset" | "count_up"` prop ([SessionRunner.tsx:16](src/components/session/SessionRunner.tsx#L16), [useFocusTimer.ts:7](src/lib/timer/useFocusTimer.ts#L7)) — the three DB presets are folded to `"preset"` at [session/[id].astro:45](src/pages/session/[id].astro#L45) and [AnonSessionApp.tsx:28](src/components/anon/AnonSessionApp.tsx#L28).
- Count-up differences: displays `elapsed` not `remaining` ([SessionRunner.tsx:123](src/components/session/SessionRunner.tsx#L123)); button "Stop" vs "Stop early" ([:134](src/components/session/SessionRunner.tsx#L134)); no break ([:166](src/components/session/SessionRunner.tsx#L166)); **never fires the end chime** — `if (mode === "count_up") return;` at [useFocusTimer.ts:85](src/lib/timer/useFocusTimer.ts#L85) and [:109](src/lib/timer/useFocusTimer.ts#L109). Count-up ends only via `stopEarly()` → `stoppedAtMs = Date.now()`, no chime ([:127-130](src/lib/timer/useFocusTimer.ts#L127-L130)).

### C. Persistence — the good news and the write-path gap

- **Duration is GENERATED, mode-agnostic** — `duration_seconds integer GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (ended_at - started_at))::int) STORED` ([20260531182506_sessions_data_foundation.sql:85-90](supabase/migrations/20260531182506_sessions_data_foundation.sql#L85-L90)). No recomputation on conversion; history 🍅/duration already read this ([format.ts:1-8](src/lib/session/format.ts#L1-L8), [DurationLabel.tsx](src/components/session/DurationLabel.tsx)).
- **`count_up` is already a legal `timer_mode`** — CHECK whitelist `preset_1|preset_2|preset_3|count_up` ([sessions_data_foundation.sql:95-98](supabase/migrations/20260531182506_sessions_data_foundation.sql#L95-L98)). **No migration needed**, only a write path.
- **RLS permits the update** — `sessions_update_own` scopes only on `user_id = auth.uid()`, no column restriction and no `ended_at IS NULL` clause ([sessions_data_foundation.sql:142-145](supabase/migrations/20260531182506_sessions_data_foundation.sql#L142-L145)). The DB will allow the owner to flip `timer_mode` on a running row.
- **But no endpoint or schema exposes it.** PATCH pins `{ended_at, focus_rating, note}` guarded by `.is("ended_at", null)` ([sessions/[id].ts:49-56](src/pages/api/sessions/[id].ts#L49-L56)); `endSessionSchema` has no `timer_mode` field ([schemas/session.ts:24-39](src/lib/schemas/session.ts#L24-L39)); PUT only touches already-ended rows. A mid-flight conversion has **no server path today** (L-01 column-scope must be respected when adding one).
- **DB does not enforce count_up ⇒ null planned durations** — that invariant lives only in the POST handler ([api/sessions/index.ts:24-30](src/pages/api/sessions/index.ts#L24-L30)). A converted row could legitimately hold `timer_mode='count_up'` with non-null `planned_focus_seconds/planned_break_seconds` — a state no current code produces; the conversion path must re-null them itself.

### D. Downstream mode-fixity assumptions (the re-check list from change.md)

- **Tab title (S-06)** — `getRunningTabTitle` branches `mode === "count_up" ? elapsed : remaining` ([tabTitle.ts:12](src/lib/timer/tabTitle.ts#L12)), fed a static `mode` prop ([SessionRunner.tsx:90](src/components/session/SessionRunner.tsx#L90)). Until `mode` flips, the title keeps showing `remaining` — which goes negative past the boundary. Must flip at conversion.
- **Reopen (S-11)** — `ResumeButton` just navigates to `/session/[id]` ([ResumeButton.tsx:13-14](src/components/dashboard/ResumeButton.tsx#L13-L14)); the page re-derives mode from the persisted row ([session/[id].astro:44-46](src/pages/session/[id].astro#L44-L46)). If the flip is not persisted, a reload after conversion renders a countdown again with the original nominal duration. Anon mirror: [AnonSessionApp.tsx:27-36](src/components/anon/AnonSessionApp.tsx#L27-L36).
- **Abandon (S-05)** — hard DELETE, fully mode-agnostic ([AbandonButton.tsx:15-22](src/components/dashboard/AbandonButton.tsx#L15-L22), [sessions/[id].ts:135-167](src/pages/api/sessions/[id].ts#L135-L167)). A converted session abandons cleanly; **no risk here.**
- **Access guard** — `resolveSessionPageAccess` gates only on `ended_at`, no age heuristic; the former 50-min redirect is confirmed removed ([access.ts:1,12-18](src/lib/session/access.ts#L1-L18), L-05). A long converted session survives reload. **No risk here.**
- **History/dashboard** — selects `timer_mode` ([dashboard.astro:23](src/pages/dashboard.astro#L23)) but tiles never render it; duration/badge come from `duration_seconds`. **No visual risk**, but no count-up indicator either (per change.md, badge should reflect final total — automatic).

### E. Chime behavior (per change.md decisions)

change.md resolves: chime fires at focus-end as today; when the user later Stops the converted count-up session, **no chime**. This is largely inherent: `stopEarly()` never plays the chime ([useFocusTimer.ts:127-130](src/lib/timer/useFocusTimer.ts#L127-L130)), and count-up's `remaining <= 0` auto-fire is already gated off ([:85,:109](src/lib/timer/useFocusTimer.ts#L85)). The risk is the inverse: if the conversion leaves `mode === "preset"` anywhere in the hook, the armed `remaining <= 0` branch could re-fire the chime. The Continue branch must both flip `mode → count_up` **and** respect/neutralize `firedRef` so it neither re-fires nor blocks the new counting-up loop.

## Code References

- `src/lib/timer/useFocusTimer.ts:85,109` - count_up gates on the focus-end fire (chime suppression)
- `src/lib/timer/useFocusTimer.ts:86-94,111-118` - focus-end fire sites (`remaining <= 0 && !firedRef.current`)
- `src/lib/timer/useFocusTimer.ts:127-130` - `stopEarly()`, `stoppedAtMs = Date.now()`, no chime
- `src/components/session/SessionRunner.tsx:16,123,134,166` - `mode` prop and its branches
- `src/pages/session/[id].astro:44-46` - mode/focusSeconds/breakSeconds derivation (the "lock-in" point)
- `src/pages/api/sessions/[id].ts:49-56` - PATCH column-pinned write set (L-01), write-once `.is("ended_at", null)`
- `src/pages/api/sessions/[id].ts:45` - `ended_at`-vs-now plausibility window (NOT a duration cap; not a risk for count-up)
- `src/pages/api/sessions/index.ts:24-30` - count_up ⇒ null planned durations invariant (INSERT-only)
- `src/lib/schemas/session.ts:9,24-39` - timer_mode enum; endSessionSchema has no timer_mode
- `supabase/migrations/20260531182506_sessions_data_foundation.sql:85-90,95-98,142-145` - generated duration, timer_mode CHECK, update RLS
- `src/lib/timer/tabTitle.ts:12` - tab-title mode branch
- `src/components/anon/AnonSessionApp.tsx:27-36` - anon mode derivation mirror

## Architecture Insights

- **Mode is modeled as an immutable creation-time property** end to end: a `timer_mode` column set at POST, re-derived to a boolean `mode` exactly once at each entry point, threaded as a static prop, and never mutated. S-10 is the first change to make it mutable mid-lifetime. This is the single load-bearing conflict.
- **Server owns truth; client state is thin.** For the flip to survive a reload/reopen it must be persisted to the row — an in-flight-only client flip is not enough given S-11's reopen path.
- **The generated `duration_seconds` column is the reason the persistence side is nearly free** — the schema was deliberately made "duration-agnostic" in F-01/S-03, which pays off exactly here.
- **L-01 column-scope discipline is the guardrail to respect** when adding the `timer_mode` write: widen the schema and update-set only for the intended column, keep the `.is("ended_at", null)` write-once semantics for the conversion (or a purpose-built endpoint).

## Historical Context (from prior changes)

- `context/archive/2026-06-28-timer-presets/plan.md:41` - **"No mode-change once a session has started. Mode is locked at POST time."** (the invariant S-10 overturns)
- `context/archive/2026-06-28-timer-presets/research.md:172` - "`timer_mode` must be written at POST time, not patched later." + do not widen the PATCH write-set
- `context/archive/2026-06-28-timer-presets/reviews/impl-review.md:54-62` - F3: `firedRef` single-fire guard added to the exact focus-end transition S-10 hooks into
- `context/archive/2026-07-07-tab-title-timer/plan.md:77` - tab title branches on `mode === "count_up"` (must flip at conversion)
- `context/archive/2026-07-13-reopen-running-session/plan.md:10-11,29-31` - reopen delegates entirely to persisted `timer_mode`; no anticipation of a post-creation mode change
- `context/foundation/lessons.md` - L-01 (column-scope), L-02 (audio prime decoupled from fire time), L-03 (anchor-derive), L-05 (no age guards under open-ended modes)
- `context/foundation/roadmap.md:232` - the S-10 hazard statement naming save logic / abandon / tab-title as the re-check surfaces

## Related Research

- `context/archive/2026-06-28-timer-presets/research.md` - count-up mode design (duration-agnostic schema, no auto-end, no chime on stop)

## Recommended approach: flip mode in place (not drop-and-replace)

A "drop the running row and POST a fresh count-up session" approach was considered and **rejected**:

- **`started_at` cannot be preserved without a worse write hole.** `POST /api/sessions` hardcodes `started_at = now()` ([index.ts:34-43](src/pages/api/sessions/index.ts#L34-L43)); keeping the original start would require a client-supplied `started_at`, a broad tampering vector (arbitrary backdated durations) far worse than flipping one enum.
- **Non-atomic → data loss.** DELETE + POST are two un-transacted HTTP calls; a failure between them loses the session (violates the "timer must survive" guardrail). Reordering to POST-then-DELETE trades loss for a transient duplicate row.
- **Identity churn.** A new id kills the current `/session/[oldId]` page (forces a redirect) and breaks the stable-URL assumption S-11 reopen relies on; also discards the original row's `created_at`/audit.

**Chosen direction:** a single atomic UPDATE via a dedicated endpoint, e.g. `POST /api/sessions/[id]/continue`:

```sql
UPDATE sessions SET timer_mode = 'count_up' [, planned_focus_seconds = NULL, planned_break_seconds = NULL]
WHERE id = :id AND user_id = auth.uid() AND ended_at IS NULL
```

- Leaves the rating PATCH write-once contract (L-01) untouched — conversion is its own narrowly-scoped write.
- `ended_at IS NULL` guard → converts only a still-running session (replay-safe). `count_up` is already a legal CHECK value and RLS `sessions_update_own` already permits the owner's update; no migration needed.
- No `started_at` override, id/FKs/`started_at` preserved, `duration_seconds` stays correct automatically.
- Does **not** remove the client-side work (Open Questions below) — the browser is still mid-flight either way.

## Open Questions

1. **Null vs keep `planned_focus/break_seconds` on the converted row.** Nulling keeps the row consistent with the POST invariant (`count_up ⇒ null`); keeping them preserves "started as preset_2 (90/15)" as audit and is harmless to count-up rendering (`focusSeconds` is only read for the ignored countdown). Lean: null them unless history should show the origin preset — in which case relax the invariant to insert-time only, explicitly.
2. **Client state refactor**: `mode` must become reactive in `SessionRunner`/`useFocusTimer`, and `phase` needs a path from the focus-end surface back to a running-count-up state without re-firing the chime (`firedRef` handling). Confirm the effect dependency arrays ([useFocusTimer.ts:100,125](src/lib/timer/useFocusTimer.ts#L100)) react to a `mode` change.
3. **Anon parity**: does S-10 apply to the anon/local-storage flow ([AnonSessionApp.tsx](src/components/anon/AnonSessionApp.tsx)) too, or authenticated only? The mode-derivation mirror there would need the same flip.
</content>
</invoke>
