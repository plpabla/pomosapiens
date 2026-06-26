---
change_id: testing-schema-validation-gate
title: Production schema validation gate (test-plan Phase 3)
status: impl_reviewed
created: 2026-06-24
updated: 2026-06-26
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Production schema validation gate".
Risks covered: #4 (Production Supabase schema doesn't match local -- migration not applied, session saves fail in production). Impact: High / Likelihood: Medium.
Test types planned: smoke + schema diff.
Risk response intent:

- #4: Prove that a post-deploy session write + read-back succeeds in the production environment AND that the `db:types` diff is clean after every migration is applied. Must NOT treat "migration history command shows all applied" as sufficient proof. Research must ground: whether CI currently runs `db:test` after apply, whether `db:types` output is committed and compared in CI, and what columns a minimal session INSERT requires. Likely cheapest layer: post-deploy smoke test (write + read session row) + CI `db:types` diff gate. Anti-pattern: relying solely on local `npm run db:test` as proof that the production schema is correct.
