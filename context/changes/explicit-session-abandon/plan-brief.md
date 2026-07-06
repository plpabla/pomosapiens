# Explicit Session Abandon — Plan Brief

> Full plan: `context/changes/explicit-session-abandon/plan.md`

## What & Why

Add an "Abandon" button to dashboard history rows so a user can permanently remove an in-progress session (roadmap S-05). Research during planning found that S-05's originally-stated outcome — removing the time-based "abandoned" auto-detection — was already delivered in S-03 Phase 8; the only real gap left is the explicit delete affordance itself.

## Starting Point

`dashboard.astro` already shows any session with `ended_at IS NULL` as "In progress" regardless of age, and `/session/[id]` no longer redirects on a fixed age threshold (both landed in S-03). But there is no way to remove such a session — `sessions` has had no DELETE RLS policy since `20260601120000_drop_sessions_delete_policy.sql` made sessions immutable once written, and the dashboard has zero client-side interactivity today.

## Desired End State

Any in-progress row on the dashboard shows an "Abandon" button. Clicking it requires a second confirming click, then deletes the session permanently via a new `DELETE /api/sessions/:id` endpoint and reloads the page. Completed sessions show no Abandon control in this UI, but — per the decision below — the underlying DELETE capability is not restricted to in-progress sessions only.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Abandon mechanism | Hard DELETE, not "end with null rating" | User wants the row gone entirely, not recorded as a null-rated session | Plan (user answer) |
| DELETE RLS scope | Fully open (any owned row, ended or not) | User's explicit choice over scoping to in-progress-only | Plan (user answer, confirmed after flagging the S-07/immutability overlap) |
| Endpoint location | Add `DELETE` to existing `/api/sessions/[id].ts` | Matches the file's existing per-resource REST convention (already has `PATCH`) | Plan |
| Confirmation UX | Inline two-step button (Abandon → Confirm?) | On-brand styling, no native browser dialog, guards an irreversible action | Plan (user answer) |
| Component architecture | Small per-row island (`AbandonButton.tsx`), list stays Astro | Most surgical option — only hydrates what's actually interactive | Plan (user answer) |
| Post-delete UI update | Full page reload | Matches `SessionRunner`'s existing reload-driven state-transition pattern | Plan (user answer) |
| Age gating | None — always visible on any in-progress row | Directly matches lesson L-05's rejection of age-based heuristics for this exact case | Plan (user answer) |

## Scope

**In scope:**

- New DELETE RLS policy on `sessions` (fully open, owner-scoped) + pgTAP updates
- `DELETE /api/sessions/[id]` endpoint + integration tests
- `AbandonButton` React island + dashboard wiring + unit tests
- Doc sync: `arch.md` stale-guard correction, `lessons.md` L-06, `roadmap.md` S-07 overlap note
- `/10x-e2e` handoff for browser-level verification

**Out of scope:**

- Any change to `/session/[id].astro` or `access.ts` (untouched — already fixed in S-03)
- New schema columns or a distinct "abandoned" marker/label
- Editing a session's fields (duration, rating, topic, etc.) — remains S-07's job
- Age-based gating of the Abandon control

## Architecture / Approach

Bottom-up: RLS policy → API endpoint → UI island → docs → E2E handoff. No schema change; the only DB change is a single `CREATE POLICY` reinstating (with wider scope) a policy that was previously dropped.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database | Reinstated `sessions_delete_own` RLS policy + pgTAP test updates | Test-ordering: must not let the flipped assertion consume a fixture row later tests depend on |
| 2. API | `DELETE /api/sessions/[id]` + integration tests | Information-hiding contract must match the existing PATCH precedent (same 404 body for cross-user vs. not-found) |
| 3. UI | `AbandonButton` island + dashboard wiring | Must show only on in-progress rows, with no age gating |
| 4. Docs | `arch.md`/`lessons.md`/`roadmap.md` sync | Low risk — text-only edits |
| 5. E2E | `/10x-e2e`-driven browser verification | No existing spec regressions |

**Prerequisites:** None beyond the already-shipped S-01/S-03 baseline this extends.
**Estimated effort:** ~1 session across 5 phases (small file surface, no schema/data migration).

## Open Risks & Assumptions

- Fully-open DELETE reverses a previously deliberate, tested immutability guarantee. This was explicitly flagged and confirmed by the user during planning, including its overlap with roadmap item S-07.
- S-07 (`edit-delete-sessions`) will need re-scoping once this ships — its "delete" half is done; only "edit fields" remains.

## Success Criteria (Summary)

- A user can abandon an in-progress session from the dashboard in two clicks, with no age restriction.
- Completed sessions are unaffected in the UI; cross-user delete attempts are denied at the RLS layer.
- All automated suites (`npm run lint`, `npm test`, `npm run db:test`, `npm run build`) pass, plus a passing `/10x-e2e` handoff.
