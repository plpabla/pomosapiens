# Re-open a Running Session from the Dashboard (S-11) — Plan Brief

> Full plan: `context/changes/reopen-running-session/plan.md`

## What & Why

Add a "Resume" control to in-progress session rows on the dashboard so a user who closed the tab mid-session can get back into that exact session. Today the session URL holds a UUID with no other way to recover it once the page is closed — the dashboard only lets the user *see* a session is running or *abandon* it, never re-enter it.

## Starting Point

In-progress rows already render an Abandon button behind a `status === "in_progress" && !readOnly` gate ([SessionTile.tsx:33](src/components/session/SessionTile.tsx#L33)). The `/session/[id]` page, its ownership/ended-state guard (`resolveSessionPageAccess`), and `started_at`-based timer reconciliation all already exist and behave correctly for a reopen.

## Desired End State

Each in-progress dashboard row shows a **Resume** button beside its **Abandon** button (Resume on the left). Clicking it lands on `/session/[id]` with the running timer redrawn at the correct elapsed/remaining time. Completed rows show neither control; anonymous localStorage rows are unchanged; multiple in-progress rows each get their own Resume link.

## Key Decisions Made

| Decision            | Choice                                            | Why (1 sentence)                                                                 | Source |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Affordance          | Explicit "Resume" button (not whole-row clickable) | Discoverable, a11y-clean; same `role="button"` as Abandon, distinguished by name.| Plan   |
| Layout              | Side by side, Resume left / Abandon right          | Matches the requested mockup; keeps the two in-progress actions together.        | Plan   |
| Placement host      | Existing in-progress block in `SessionTile.tsx`   | Reuses the exact status/readonly gate already there — no new condition.          | Plan   |
| Anonymous sessions  | Excluded (signed-in only, behind `!readOnly`)     | Anonymous localStorage sessions have no `/session/[id]` page to resume into.     | Plan   |
| Reopen guard        | Reuse `resolveSessionPageAccess` as-is            | Already redirects ended/cross-user reopens to `/dashboard`; nothing to re-derive.| Plan   |
| Test coverage       | One e2e happy-path + completed-row guard          | Matches the abandon feature's test level; covers nav + guard, the real risks.    | Plan   |

## Scope

**In scope:** New `ResumeButton` button component; render it beside `AbandonButton` (Resume left) for in-progress signed-in rows; one e2e spec.

**Out of scope:** Schema/API/RLS changes; single-active-session guarantee; changes to `/session/[id]`, the access guard, or `SessionRunner`; anonymous-session resume; whole-row-clickable; unit tests.

## Architecture / Approach

Purely additive frontend. A presentational `<button>` (styled like the row actions, `onClick` navigates to `/session/{id}`) is rendered beside Abandon inside the existing in-progress action block; navigation reuses the existing server route + guard + timer reconciliation. No new data flow.

## Phases at a Glance

| Phase              | What it delivers                                      | Key risk                                              |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| 1. Resume control  | Resume link above Abandon on in-progress rows        | Rendering it outside the `!readOnly` gate (anon leak) |
| 2. E2E coverage    | Spec: happy path + completed-row guard               | Flaky locator/timing — mirror the abandon spec's waits |

**Prerequisites:** S-05 (in-progress row action pattern) — already shipped. Local Supabase running + env vars for the e2e phase.
**Estimated effort:** ~1 short session across 2 phases.

## Open Risks & Assumptions

- Assumes anonymous sessions genuinely have no server session page — if that changes later, Resume for anon becomes a separate slice.
- Both controls render as `role="button"`; their distinct accessible names ("Resume" vs "Abandon") keep e2e locators unambiguous.

## Success Criteria (Summary)

- From the dashboard, a user can re-enter a closed-tab in-progress session and see its timer running correctly.
- Completed rows never expose Resume; anonymous rows are unaffected.
- An e2e spec locks the navigation and the completed-row guard.
