# Preserve break on continue + preset-carrying redirect — Plan Brief

> Full plan: `context/changes/fix-continue-sessions/plan.md`
> Research: `context/changes/fix-continue-sessions/research.md`

## What & Why

Continuing a session ("I'm still working") currently nulls the break, so prolonging focus by 5 minutes silently costs the user their break — an unintended side-effect of the count-up conversion, never a deliberate decision. And when a preset break completes, the user is dropped on `/dashboard` instead of being able to flow into a same-settings next session. Fix both.

## Starting Point

The `continue-session-past-end` slice flips a continued session to `count_up` and nulls `planned_focus_seconds` + `planned_break_seconds` to uphold an app-only `count_up ⇒ null planned` invariant. Two extra gates (`[id].astro:46`, `SessionRunner.tsx:186`) further block the break whenever mode is count-up. `/session/new` reads no query params and seeds the start form from hardcoded defaults.

## Desired End State

Continuing keeps the break: after a continued focus stops, "Take a break" is still offered and runs the original preset's break duration. When any preset session's break completes (natural, hidden-tab, or manual "End break"), the user lands on `/session/new` pre-filled with the prior session's energy, topic, format, and time preset. Native count-up and anonymous sessions are unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Preserve the break | Stop nulling `planned_break_seconds` on continue | Corrects an unintended consequence, not a real trade-off | Research |
| Invariant scope | Relax `count_up ⇒ null planned` to **insert-time only** | Continue UPDATE is exempt; create still enforces it | Research |
| Time-preset encoding in redirect | Pass `mode=<timer_mode>` (choice B) | Simplest; `ModePicker` already renders a `count_up` chip | Plan |
| Focus column on continue | Keep nulling `planned_focus_seconds` | Choice B needs no preserved focus, so don't preserve it | Plan |
| Continued-session prefill | Selects **count-up** mode (not origin preset) | Falls out of choice B; energy/topic/format still carry over | Plan |
| Stale topic/format | Silently fall back to "none" | No dead-end; matches today's null default | Plan |
| Redirect scope | **All** preset breaks → `/session/new` | Matches change.md's "for using preset mode, after the break" | Plan |
| Test depth | Integration + unit, no new e2e; only `continue.test.ts` changes | `create.test.ts` invariant is create-time and stays valid | Plan |

## Scope

**In scope:** preserve break on continue; unblock break in count-up; retarget all preset break-completion to a prefilled `/session/new`; update `sessions.continue.test.ts`.

**Out of scope:** preserving `planned_focus_seconds`; recovering the origin preset for continued sessions; DB CHECK for the invariant; anon/native-count-up behavior; e2e for the redirect; a "topic deleted" notice.

## Architecture / Approach

Phase 1 is three coordinated edits (continue endpoint, `[id].astro` derivation, `SessionRunner` gate) plus a test update — the break becomes data-driven (`planned_break_seconds` null vs non-null) rather than mode-driven (L-05). Phase 2 threads a URL contract from `[id].astro` (which builds `/session/new?energy&topic&format&mode` and passes a `breakCompleteHref` prop) through a new `onBreakComplete` callback in `SessionRunner`, into `new.astro` (reads `Astro.url.searchParams`) and `EnergyPicker` (optional prefill props, catalog-gated stale-id fallback).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Preserve break on continue | Break survives continue + count-up | Invariant relaxation must not break other reads of the row |
| 2. Preset-carrying redirect | Break end → prefilled `/session/new` | Passing nav across the Astro→React island boundary (pass a string href, not a function) |

**Prerequisites:** local Supabase running for `npm test` (`SUPABASE_SERVICE_ROLE_KEY` set).
**Estimated effort:** ~1-2 sessions across 2 phases.

## Open Risks & Assumptions

- Rows with `count_up` + non-null `planned_break_seconds` now exist; verified nothing besides the (relaxed) invariant test asserts against that combination.
- The island boundary requires passing the redirect target as a serializable string href, not a closure.

## Success Criteria (Summary)

- Continuing a preset session keeps the break; the break runs after count-up stops.
- Every preset break completion lands on a prefilled `/session/new`; the rating-screen "Go to dashboard" still goes to `/dashboard`.
- Native count-up and anonymous sessions unchanged; `npm test` green.
