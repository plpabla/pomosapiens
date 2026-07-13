# Continue Session Past End (S-10) — Plan Brief

> Full plan: `context/changes/continue-session-past-end/plan.md`
> Research: `context/changes/continue-session-past-end/research.md`

## What & Why

When a preset focus session hits its scheduled end, the user is forced out of flow at an arbitrary boundary. This adds an **"I'm still working"** choice at focus-end that converts the running session to count-up **in place** — keeping the original `started_at` and elapsed — so the user can keep going and only stop when they're actually done.

## Starting Point

The timer derives time from a server anchor and lands on a rating screen at focus-end (with a chime). Count-up mode already exists (S-03), but `mode` is treated as immutable everywhere: it's set at session-creation time and threaded as a static prop through `SessionRunner` → `useFocusTimer`, with no server path to change it. S-10 is the first change to make mode mutable mid-session.

## Desired End State

A signed-in user at preset focus-end sees "I'm still working" next to the rating controls. Tapping it persists the mode flip, resumes a count-up timer from the correct elapsed time, and fires no chime on the eventual Stop. Closing and reopening the tab resumes the session as count-up. History shows the full elapsed total (already free via the GENERATED `duration_seconds` column).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Conversion mechanism | Atomic in-place UPDATE via `POST /api/sessions/[id]/continue` | Preserves `started_at` and id without a client-supplied-timestamp tampering vector; drop-and-replace is non-atomic and breaks reopen | Research |
| Trigger point | Focus-end of a preset session only | Fixed by change.md — not during running, not at break | Frame/change.md |
| Chime behavior | Chime at focus-end as today; none on the eventual Stop | Count-up's stop path never chimes; the risk is the inverse (re-fire), handled by flipping mode in the hook | Research |
| Planned-duration columns | Null them on conversion | Keeps the row consistent with the `count_up ⇒ null planned` invariant so no code sees an impossible state | Plan |
| Anon flow | Authenticated only; anon opts out with one prop | Smallest surface for the slice; `localPersistence` untouched | Plan |
| Affordance | A distinct "I'm still working" choice on the focus-end screen | Clean decision point; rating stays a single end-of-session event | Plan |
| Button copy | "I'm still working" | Matches change.md phrasing and the flow-state framing | Plan |
| Testing | Unit (hook) + endpoint; E2E optional follow-up | Covers the load-bearing state-machine and write-path risks fast | Plan |

## Scope

**In scope:** conversion endpoint + persistence method; reactive-`mode` refactor of `useFocusTimer` with a `continueAsCountUp()` action; "I'm still working" button on the focus-end screen; tab-title flip; reopen-after-conversion; anon opt-out.

**Out of scope:** anon/local-storage flow; "Continue" during running focus or at break-end; preserving origin preset as audit; any DB migration; changes to PATCH/PUT/DELETE contracts; E2E spec.

## Architecture / Approach

Server owns truth. The mode flip is persisted first (so S-11 reopen survives it), then the client flips its own reactive `mode`. Data flow: focus-end screen button → `SessionRunner` handler → `await remotePersistence.continueSession(id)` (atomic UPDATE: `timer_mode='count_up'`, `planned_*=NULL`, guarded by `ended_at IS NULL` + ownership) → `useFocusTimer.continueAsCountUp()` (reset fire snapshot, `phase→running`, no chime). Tab-title flips automatically once `mode` is reactive. No migration — `count_up` is an existing CHECK value and the update RLS already permits the owner's flip.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Server continue write path | Endpoint + `continueSession` persistence method | Column-scope discipline (L-01) — keep PATCH contract untouched |
| 2. Reactive-mode hook refactor | `useFocusTimer` holds `mode` as state + `continueAsCountUp()` | Chime re-fire / elapsed reset if the fire snapshot isn't reset correctly |
| 3. Focus-end affordance + UI wiring | Button, `SessionRunner` wiring, tab-title flip, anon opt-out | Persist-then-flip ordering; anon must not show the button |

**Prerequisites:** S-03 (count-up mode) and S-11 (reopen) already shipped; local Supabase running for the endpoint test.
**Estimated effort:** ~1-2 sessions across 3 phases.

## Open Risks & Assumptions

- The reactive-`mode` flip must not re-arm the preset fire branch — mitigated by gating on the reactive `mode` and leaving `firedRef` set.
- Persist-then-flip means a failed persist leaves the user on the focus-end screen with the session still a running preset server-side (consistent, recoverable).
- Reopen-after-conversion depends on the flip being persisted, not just client-side — covered by Phase 1 landing first.

## Success Criteria (Summary)

- A signed-in user can keep working past preset focus-end; the session counts up from preserved elapsed and records the full total.
- No chime fires on the converted session's Stop; the normal rating/save flow applies.
- Closing and reopening the tab resumes the session as count-up, not a countdown.
