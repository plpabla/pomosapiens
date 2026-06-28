# Production schema validation gate — Plan Brief

> Full plan: `context/changes/testing-schema-validation-gate/plan.md`
> Research: `context/changes/testing-schema-validation-gate/research.md`

## What & Why

Phase 3 of the test-plan rollout (Risk #4). Add a post-deploy GitHub Actions workflow that runs two schema gates against the **live production** Supabase project after every Cloudflare Workers Builds deploy: a `db:types` production-schema diff and a session-write/read-back smoke test. The failure mode this prevents has already happened on this project — a migration not applied to production causes session saves to silently fail in prod even though local tests pass.

## Starting Point

Today the `.github/workflows/ci.yml` job runs lint + build + Vitest on push/PR; it never calls `db:test`, `db:types`, or any production check. `src/db/database.types.ts` is committed and used as the TypeScript ground truth but is never verified against the live schema. Deployment is owned by Cloudflare Workers Builds (Cloudflare's native Git integration), not by GitHub Actions — CI finishes before the deploy completes.

## Desired End State

After every successful production deploy, a dedicated `smoke.yml` workflow auto-fires (via a Cloudflare deploy-success webhook → GitHub `repository_dispatch`) and runs two gates: `supabase gen types --project-id` against the production project diffed against the committed types file, then a Node script that performs INSERT + SELECT + DELETE of a synthetic session row owned by a pre-seeded smoke user. Either gate failing leaves the workflow red; default GitHub notifications surface it.

## Key Decisions Made

| Decision                 | Choice                                                     | Why (1 sentence)                                                                                                           | Source   |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| `db:types` diff strategy | Strategy C — production schema diff (`--project-id`)       | Only strategy that catches "migration committed but not applied to production," which is exactly Risk #4.                  | Research |
| Smoke trigger mechanism  | Cloudflare webhook → GitHub `repository_dispatch`          | Deploy ownership stays with Cloudflare; no `CLOUDFLARE_API_TOKEN` needed in the repo.                                      | Research |
| Both gates' location     | One workflow (`.github/workflows/smoke.yml`)               | Both must run post-deploy against the production schema; collapsing them avoids redundant secrets and runners.             | Research |
| Smoke script runtime     | Standalone Node ESM (`scripts/smoke-session-write.mjs`)    | No Workers runtime needed for Supabase REST; no new dev dep; trivially runnable locally for debugging.                     | Plan     |
| Smoke INSERT identity    | Pre-seeded dedicated `smoke@…` auth user (`SMOKE_USER_ID`) | Sessions `user_id` has FK to `auth.users` — a sentinel UUID fails the FK; deterministic identity makes cleanup idempotent. | Plan     |
| Failure escalation       | Just red workflow (default GitHub notifications)           | Smallest viable scope; can layer auto-issue or rollback later if signal proves weak in practice.                           | Plan     |
| Operator setup docs      | Phase 0 runbook + CLAUDE.md pointer                        | Survives `/10x-archive`; future schema-related changes have one stable place to reference.                                 | Plan     |

## Scope

**In scope:**

- `.github/workflows/smoke.yml` — new workflow, both schema gates, `workflow_dispatch` + `repository_dispatch` triggers
- `scripts/smoke-session-write.mjs` — Node ESM smoke script, idempotent
- `package.json` — new `test:smoke` script for local debugging
- `context/changes/testing-schema-validation-gate/runbook.md` — operator manual-setup runbook
- `CLAUDE.md` — one-line pointer to the runbook
- `context/foundation/test-plan.md` — §3 status bump (Phase 3 complete), §5 gates to "active", new §6.6 cookbook entry

**Out of scope:**

- Adding `CLOUDFLARE_API_TOKEN` or moving deploy ownership to GitHub Actions
- Automated `wrangler rollback` on smoke failure
- Auto-opening GitHub issues on failure
- Running `npm run db:test` (pgTAP) in CI (stays local pre-PR per test-plan §5)
- Adding `tsx` / `ts-node` devDependencies
- Strategy A (git-presence) or Strategy B (local Supabase in CI) for the types diff

## Architecture / Approach

```
push to main
  → Cloudflare Workers Builds: build + deploy  (unchanged)
       → "Deployment Success" notification webhook
            → POST https://api.github.com/repos/<owner>/<repo>/dispatches
                 → GitHub Actions smoke.yml (on: repository_dispatch)
                      1. supabase gen types --project-id $SUPABASE_PROJECT_REF > /tmp/types_from_prod.ts
                      2. diff src/db/database.types.ts /tmp/types_from_prod.ts        (db:types diff gate)
                      3. node scripts/smoke-session-write.mjs                          (smoke gate)
```

The smoke script's sequence is idempotent: DELETE-by-user_id (cleanup leftovers), INSERT minimal session row, SELECT round-trip, DELETE-by-id. Service-role credentials bypass RLS for both write and cleanup. Total runtime budget ~60s.

## Phases at a Glance

| Phase                                       | What it delivers                                                                          | Key risk                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1. Operator runbook & prerequisites         | `runbook.md` + CLAUDE.md pointer; all 4 secrets, smoke user, and Cloudflare webhook ready | Operator misses a manual step — caught at Phase 2 manual trigger before any auto-fire           |
| 2. Smoke script + smoke.yml (manual-only)   | `scripts/smoke-session-write.mjs` + workflow with `workflow_dispatch` only                | Smoke script logic broken — caught by manual dry-run plus intentional drift test before Phase 3 |
| 3. Webhook activation + first auto-run      | `repository_dispatch` trigger added; Cloudflare webhook fires real run end-to-end         | Webhook header / PAT scope misconfigured — caught immediately on first real deploy              |
| 4. Test-plan §5 status bump + cookbook §6.6 | `test-plan.md` reflects active gates; cookbook entry for future RLS-bearing tables        | None significant — docs-only closeout mirroring `test-timer-sm` p5                              |

**Prerequisites:** Supabase Personal Access Token (operator-generated); production project ref (Supabase dashboard); dedicated smoke auth user in prod (service-role create); GitHub PAT with `repo` scope (for the Cloudflare → GitHub Dispatches webhook). All documented in Phase 1 runbook.

**Estimated effort:** ~1 session across 4 phases. Phase 1 is docs (~20 min writing + operator's manual work in parallel). Phase 2 is the bulk of the code (~30-45 min). Phase 3 is one YAML edit + dashboard work (~15 min + waiting on a real deploy). Phase 4 is small docs edits (~15 min).

## Open Risks & Assumptions

- **Assumption:** Cloudflare Workers Builds reliably fires the "Deployment Success" notification webhook within seconds of deploy completion. If timing is unreliable, the smoke run could race against the just-deployed Worker — mitigated by the fact that the schema gate doesn't hit the Worker itself, only Supabase.
- **Assumption:** `supabase gen types --project-id <ref>` produces byte-identical output to `supabase gen types --local` when the schemas match. Any deterministic formatting drift would create false positives. If observed, the plan would need a normalization step (e.g. `prettier --parser typescript`) — deferred until proven necessary.
- **Risk:** A flaky Supabase REST call could cause sporadic smoke failures. Acceptable for v1; if observed in practice, a single retry per Supabase call is the smallest mitigation.
- **Risk:** The dedicated smoke user lives in prod `auth.users` indefinitely. Cost: one synthetic row. Mitigation: clearly labelled email so anyone reading the user list understands it.

## Success Criteria (Summary)

- Every successful Cloudflare production deploy is followed within ~60s by a green `smoke.yml` workflow run that proves (a) `src/db/database.types.ts` matches the live production schema exactly, and (b) a minimal session INSERT + SELECT round-trips on the live production database.
- Any drift in the committed types file vs production schema, or any structural failure that breaks a minimal session write, turns the workflow red immediately — visible without watching the Actions tab via default GitHub notifications.
- No leftover smoke rows exist in production `public.sessions` after a successful run.
