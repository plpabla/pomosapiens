---
change_id: test-plan-refresh-2026-06-28
title: Test plan refresh 2026 06 28
status: archived
created: 2026-06-28
updated: 2026-07-01
archived_at: 2026-07-01T14:41:10Z
---

## Notes

Refresh of context/foundation/test-plan.md after slice S-02
(categorize-sessions-topic-format) landed.

Scope (small, bounded — do NOT re-do the whole plan):

1. Add one new risk row to §2 covering pre-session picker fetch
   resilience. Anchor evidence:
   - Impl-review F2 of S-02 (silent fetch error swallow in
     src/components/session/EnergyPicker.tsx:40-48)
   - The picker is now on the critical pre-session path (S-01
     guardrail: 3-tap budget) and will be extended again by S-03
     (timer presets) and S-04 (notes + chart)
     Failure scenario: "Pre-session picker init fetch silently
     fails — student lands on degraded /session/new with no warning,
     may skip a category they intended to log."
     Impact: Medium. Likelihood: Medium (Supabase outages, network
     blips, future schema-typo regressions). Cheapest layer: jsdom
     integration on the picker mount path; backport F2 fix as the
     first response.

2. Extend §3 Phase 4 e2e scope (or add a new spec) to cover the
   categorization wedge end-to-end:
   - pick a topic on /session/new
   - pick a material format on /session/new
   - finish the session via "Stop early"
   - assert the chip line is visible on /dashboard with the
     selected topic + format names
     This is the user-visible promise of S-02. Currently NO automated
     gate covers it — integration tests prove the API writes the FKs,
     but nothing proves the picker → save → render path. S-03 and S-04
     both touch EnergyPicker.tsx and dashboard.astro and could break
     this silently. One extra spec (or ~10-line extension of
     tests/e2e/session-capture.spec.ts) is the cheapest signal.

3. Rename §6.3 cookbook from "Adding a test for a new session API
   endpoint" to a generalized RLS-bearing user-owned table endpoint
   guide. Cite the topics/material-formats tests as additional
   reference patterns. Cosmetic; improves discoverability for
   S-03/S-04.

Explicit non-goals for this refresh:

- Do NOT add e2e for /topics or /formats CRUD pages — integration
  - pgTAP already cover those layers. Adding browser-level CRUD
    tests is the "promoted to e2e because it feels safer" anti-pattern
    §1 principle #1 forbids.
- Do NOT add e2e for archived-topic-still-on-history — single
  conditional render; integration on the dashboard SSR query is
  cheaper.
- Do NOT rewrite §1 (Strategy) or §5 (Quality Gates).
- Do NOT touch the §3 statuses of phases 1-4 (they remain complete).

## Epilogue addendum (commit 2bb4a6c -- discovered scope)

The epilogue commit ("close out plan") bundled several changes outside
the plan's "Changes Required" scope. All are non-breaking and
documentation/tooling only:

- `context/foundation/arch.md` (new, 496 lines) -- full system architecture
  document authored alongside the plan close-out. Substantive; bypassed
  the plan/research/review pipeline but adds real value. Treat as a
  foundation artifact going forward, not as part of this change's scope.
- `src/db/database.types.ts` -- minor reformatting (semicolons, line joins).
- `context/foundation/lessons.md` -- incidental edits.
- `.github/workflows/ci.yml` -- EOF newline normalisation.
- ~10 archive-folder doc touches.

Code and test behaviour is unaffected by all of the above.
