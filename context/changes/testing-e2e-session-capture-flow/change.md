---
change_id: testing-e2e-session-capture-flow
title: Playwright e2e regression for the full session capture flow
status: impl_reviewed
created: 2026-06-26
updated: 2026-06-26
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md:
"E2e on full session capture flow".

Risks covered: cross-cutting (all §2 risks; Phase 4 is the regression gate
for the user-visible end-to-end path that lower layers cannot cover together).

Test types planned: Playwright e2e.

Risk response intent:
- Cross-cutting / happy path: Prove the full session capture flow completes
  end-to-end -- authenticated user loads /dashboard, navigates to a new
  session, timer runs, focus rating is submitted, and a history entry appears.
  A Playwright regression on this path catches any broken slice in the chain
  (routing, SSR, API, DB) that unit/integration tests miss.
- Risk #3 (cross-user SSR redirect): SSR /session/[id] loaded under a
  different user's auth cookie redirects to /dashboard. This is the one #3
  assertion the pgTAP + API integration layer cannot cover (it requires a
  real SSR render with a real session cookie).
- Risk #5 (ended/abandoned session redirect): GET /session/[id] for an
  already-ended session redirects to /dashboard in a real browser context,
  not just in a mocked SSR integration test.
