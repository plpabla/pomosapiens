# Edit & Delete Logged Sessions (S-07) — Plan Brief

> Full plan: `context/changes/edit-delete-sessions/plan.md`

## What & Why

Give users corrective control over their session history. Count-up mode and accidental starts both produce history rows the user currently cannot fix: a session that ran to 3h because they forgot to stop, or a 10-second session started by accident. This adds **edit** (correct a logged session's duration + fields) and surfaces **delete** (remove a junk row) on the dashboard.

## Starting Point

The `sessions` table, its RLS, and the `DELETE /api/sessions/[id]` endpoint already exist (delete + its RLS shipped in S-05, per lesson L-06). The dashboard shows a history list, but delete is only reachable for **in-progress** rows (via `AbandonButton`), and there is no way to edit a completed session at all. The end-session `PATCH` handler cannot be reused for editing — its write-once guard and 2h plausibility window are correct for ending-once but wrong for correcting history.

## Desired End State

Each completed history row has an **Edit** control (opens a modal pre-filled with the session's values: duration in minutes, energy, topic, material format, focus rating, note) and a confirm-guarded **Delete** control. Saving an edit or confirming a delete updates the history list and the focus-rating chart after reload. In-progress rows are unchanged (Abandon only). All operations are owner-scoped and reject impossible durations.

## Key Decisions Made

| Decision                | Choice                                                  | Why (1 sentence)                                                                                     | Source |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| Editable field set      | Duration + energy, topic, format, rating, note          | One coherent "correct this session" screen; every captured field is fixable.                         | Plan   |
| Duration edit model     | Edit minutes → server recomputes `ended_at`             | Matches user mental model, keeps real `started_at` fixed; `duration_seconds` is a generated column.  | Plan   |
| Edit UI surface         | Modal on the dashboard                                  | Stays in context, no navigation; reuses EnergyPicker's picker-fetch pattern.                         | Plan   |
| Edit write path         | New `PUT /api/sessions/[id]`                            | Clean separation — leaves the end-session `PATCH` contract and its tests untouched (L-01/L-05).      | Plan   |
| Edit validation         | Bounded positive duration (≥1s, ≤24h)                   | Blocks impossible values while allowing any legitimate historical correction; no "near now" window.  | Plan   |
| Delete affordance       | Confirm-guarded control on logged rows (own component)  | Reuses shipped DELETE endpoint + AbandonButton's confirm UX; guards against accidental history loss. | Plan   |
| Testing depth           | Integration + unit + happy-path e2e                     | Matches existing sessions test depth; L-01 regression gate travels with the new write path.          | Plan   |

## Scope

**In scope:** `editSessionSchema`; `PUT /api/sessions/[id]`; `EditSessionDialog` modal; `DeleteSessionButton`; dashboard wiring for completed rows; unit + integration + e2e tests.

**Out of scope:** re-implementing DELETE/RLS (done); soft-delete/audit trail; editing `started_at`; a dedicated edit route; editing in-progress sessions; any schema migration.

## Architecture / Approach

New `PUT` handler on the existing `[id].ts` route: SELECT the row's `started_at` (owner-scoped, `ended_at IS NOT NULL`), recompute `ended_at = started_at + duration`, then UPDATE a **hand-picked column set** (L-01) — never writing the generated `duration_seconds`. The dashboard renders an `EditSessionDialog` island (reusing `EnergyPicker`'s topic/format fetch) and a `DeleteSessionButton` (mirroring `AbandonButton`) on completed rows only.

## Phases at a Glance

| Phase                                   | What it delivers                                | Key risk                                                        |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| 1. Edit endpoint + schema + backend tests | `PUT` + `editSessionSchema`, unit + integration | Column-scope slip (L-01) or writing generated `duration_seconds` |
| 2. Edit modal + edit e2e                | Dashboard edit dialog                           | Pre-fill/persist correctness across six fields                  |
| 3. Delete control + delete e2e          | Confirm-guarded delete on logged rows           | Accidental deletion; only UI wiring (endpoint shipped)          |

**Prerequisites:** S-01 (shipped). DELETE endpoint + RLS already present.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- The focus-rating chart re-derives from current rows on each SSR load, so edits/deletes reflect with no cache to invalidate — verify visually after the first edit/delete.
- L-01 column-scope must be re-established on the new `PUT` (the existing `PATCH` gate does not cover it) — the integration suite includes a dedicated gate.
- 24h duration cap is a generous but arbitrary bound; revisit if a legitimate longer correction is ever needed.

## Success Criteria (Summary)

- A user can correct a completed session's duration (and other fields) from the dashboard and see history + chart update.
- A user can delete an accidental logged session with a confirm step; it disappears from history and chart.
- Non-owners cannot edit or delete; impossible durations are rejected — proven by integration tests and the L-01 gate.
