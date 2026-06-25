---
date: 2026-06-24T00:00:00+02:00
researcher: pawel
git_commit: 64ac4060d0433837dab6d8579a5d5c901e429bd2
branch: testing-schema-validation-gate
repository: PomoSapiens
topic: "Production schema validation gate (test-plan Phase 3)"
tags: [research, schema-validation, ci, smoke-test, supabase, db-types, sessions]
status: complete
last_updated: 2026-06-24
last_updated_by: pawel
---

# Research: Production schema validation gate (test-plan Phase 3)

**Date**: 2026-06-24
**Researcher**: pawel
**Git Commit**: 64ac4060d0433837dab6d8579a5d5c901e429bd2
**Branch**: testing-schema-validation-gate
**Repository**: PomoSapiens

## Research Question

Ground the four questions from `context/changes/testing-schema-validation-gate/change.md`:

1. Does CI currently run `db:test` after migrations are applied?
2. Does CI compare the `db:types` output against what is committed?
3. What columns does a minimal session INSERT require?
4. What deploy mechanism is in use, and where does a post-deploy smoke test fit?

## Summary

**Zero schema validation automation exists today.** CI runs lint + build + Vitest; it never calls
`db:test`, `db:types`, or any diff command. The committed `src/db/database.types.ts` is the
TypeScript ground truth but is never verified against a live schema in CI. Deployment is handled by
Cloudflare Workers Builds (not GitHub Actions), which creates a timing gap: CI runs before deploy,
so a post-deploy smoke test cannot live in the current CI job without restructuring. The
`SUPABASE_SERVICE_ROLE_KEY` is already a CI secret, making it available for both the smoke test and
cleanup. A minimal session INSERT requires exactly three columns: `user_id`, `energy_level`, and
`started_at`.

## Detailed Findings

### 1. Current CI pipeline -- what runs and what does not

**File**: [.github/workflows/ci.yml](.github/workflows/ci.yml)

Current steps (35 lines total):

| Step | Command | Notes |
|------|---------|-------|
| checkout | `actions/checkout@v4` | |
| node setup | `actions/setup-node@v4` | reads `.nvmrc` |
| install | `npm ci` | |
| lint | `npm run lint` | |
| build | `npm run build` | needs `SUPABASE_URL` + `SUPABASE_KEY` secrets |
| write .dev.vars | `printf ...` | writes all 3 Supabase secrets for the Workers pool |
| test | `npm test` | Vitest (Workers integration + jsdom); needs all 3 secrets |

**What is NOT in CI:**

| Check | Status | Consequence |
|-------|--------|-------------|
| `npm run db:test` | **absent** | pgTAP RLS tests never run in CI |
| `npm run db:types` | **absent** | no check that generated types stay in sync |
| schema diff | **absent** | no gate catches `src/db/database.types.ts` drifting from production |
| post-deploy smoke | **absent** | nothing verifies production schema after deploy |

The workflow triggers on push and PR to `main` ([.github/workflows/ci.yml:3-7](.github/workflows/ci.yml#L3-L7)).

### 2. `db:types` -- the committed file and the generation script

**Committed file**: [src/db/database.types.ts](src/db/database.types.ts) -- tracked by git, not in
`.gitignore`. It is the TypeScript source of truth for all Supabase table types and is read by the
Supabase client typed as `SupabaseClient<Database>` ([src/lib/supabase.ts](src/lib/supabase.ts)).

**Generation script** ([package.json:18](package.json#L18)):
```
supabase gen types typescript --local > src/db/database.types.ts
```

The `--local` flag generates from a running local Supabase Docker stack. **This command cannot run
in CI as-is** -- CI has no Docker daemon and does not call `supabase start`. To generate against
the production schema, the Supabase CLI supports `--project-id <ref>` with a
`SUPABASE_ACCESS_TOKEN` env var, but that token is not in the current CI secrets.

**`db:types` diff strategy: resolved -- Strategy C (production schema diff).**

The only strategy that actually verifies the production database state. Strategies A and B validate
local consistency only; they cannot catch "migration written and committed but not applied to
production," which is exactly Risk #4.

| Strategy | How | Catches | CI cost | Extra secrets needed | Decision |
|----------|-----|---------|---------|---------------------|----------|
| A -- git-presence check | Fail CI if migration files changed but `database.types.ts` did not | Developer forgot to regenerate | ~0s | none | rejected -- local only |
| B -- local Supabase in CI | `supabase start` (Docker), `db:types`, `git diff --exit-code` | Types out of sync with local migrations | ~60-90s | none | rejected -- local only |
| **C -- production schema diff** | `supabase gen types --project-id <ref>` + diff against committed | **Types out of sync with production schema** | ~5s | `SUPABASE_ACCESS_TOKEN` | **chosen** |

**Timing constraint**: Strategy C must run **post-deploy** (after migrations have been applied to
production). Running it pre-merge would fail every PR that includes a migration -- the production
schema hasn't been updated yet. This means both the smoke test and the `db:types` diff belong in
the same post-deploy CI job.

**Command skeleton** (for the plan phase):
```bash
supabase gen types typescript --project-id <prod-ref> > /tmp/types_check.ts
diff src/db/database.types.ts /tmp/types_check.ts
```

**Prerequisites**:
- `SUPABASE_ACCESS_TOKEN` -- new repository secret (Supabase personal access token)
- Production project ref (20-char ID) -- available in Supabase dashboard under Project Settings;
  not currently stored in any tracked file

**Note**: the local Supabase `project_id` in [supabase/config.toml](supabase/config.toml) is
`10x-astro-starter` -- this is the local stack ID, not the production project ref.

### 3. Sessions table schema -- minimal INSERT columns

**Migrations**:
- [supabase/migrations/20260531182506_sessions_data_foundation.sql](supabase/migrations/20260531182506_sessions_data_foundation.sql) -- creates table with RLS
- [supabase/migrations/20260601120000_drop_sessions_delete_policy.sql](supabase/migrations/20260601120000_drop_sessions_delete_policy.sql) -- removes DELETE policy (sessions are immutable via RLS)

**Full column inventory**:

| Column | Type | NOT NULL | Source | Required in INSERT? |
|--------|------|----------|--------|---------------------|
| `id` | uuid | YES | `gen_random_uuid()` default | no |
| `user_id` | uuid | YES | caller | **yes** |
| `started_at` | timestamptz | YES | caller (API stamps `new Date()`) | **yes** |
| `energy_level` | `public.energy_level` enum | YES | caller (Zod validates) | **yes** |
| `ended_at` | timestamptz | NO | null default | no |
| `duration_seconds` | integer | NO | STORED generated column | no (auto) |
| `focus_rating` | smallint | NO | null default | no |
| `topic_id` | uuid | NO | null default | no |
| `material_format_id` | uuid | NO | null default | no |
| `timer_mode` | text | NO | null default | no |
| `note` | text | NO | null default | no |
| `created_at` | timestamptz | YES | `now()` default | no |
| `updated_at` | timestamptz | YES | `now()` default | no |

**Enum values** for `energy_level`: `'low'`, `'medium'`, `'high'`

**Minimal valid INSERT** (confirmed by pgTAP fixture at
[supabase/tests/rls_sessions.sql:12-14](supabase/tests/rls_sessions.sql#L12-L14)):
```sql
INSERT INTO public.sessions (id, user_id, started_at, energy_level)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        now(), 'medium');
```

**TypeScript Insert type** confirms the same ([src/db/database.types.ts:71-85](src/db/database.types.ts#L71-L85)):
required fields are `energy_level: string`, `started_at: string`, `user_id: string`.

**DELETE constraint**: the RLS DELETE policy was dropped in the second migration. Row-level DELETE
is now impossible for authenticated users. **Smoke test cleanup must use the service role key**
(bypasses RLS). `SUPABASE_SERVICE_ROLE_KEY` is already a CI secret
([.github/workflows/ci.yml:30](.github/workflows/ci.yml#L30)).

### 4. Deploy architecture and the smoke test timing gap

**Deploy mechanism** ([context/changes/deployment/platform-research.md:132-147](context/changes/deployment/platform-research.md#L132-L147)):

- **GitHub Actions CI** (`ci.yml`) is a quality gate only. It runs on PRs and pushes to `main`;
  it does NOT deploy.
- **Cloudflare Workers Builds** (Cloudflare's native Git integration) owns build + deploy. A push
  or merge to `main` triggers an automatic build + `npx wrangler deploy` on Cloudflare
  infrastructure. No deploy command or `CLOUDFLARE_API_TOKEN` lives in the repo today.

**The timing gap**: CI finishes before Cloudflare Workers Builds deploys. A post-deploy smoke test
cannot run in the current CI job because the production Worker is not yet running when CI exits.

**Options for triggering the smoke test** (decision for plan phase):

| Option | How | Complexity | Notes |
|--------|-----|------------|-------|
| A -- add `wrangler deploy` to CI | CI runs deploy + smoke in one job (on merge to `main` only) | Low | Needs `CLOUDFLARE_API_TOKEN` secret; displaces Cloudflare Workers Builds for deploy |
| B -- Cloudflare Workers Builds webhook | Cloudflare sends HTTP trigger after deploy; GitHub Actions `workflow_dispatch` or `repository_dispatch` runs smoke job | Medium | Needs webhook setup in Cloudflare dashboard |
| C -- separate scheduled smoke workflow | GitHub Actions `schedule` cron; runs smoke against production on a cadence | Low-medium | Not instant; a bad deploy survives until the next run |
| D -- smoke as part of CI test suite, targeting production endpoint | Add a `smoke` Vitest project that calls the production API | Low | Runs pre-deploy -- catches that the CURRENT production schema works, not the just-deployed one |

Option A is the cheapest path that gives true post-deploy coverage. It requires adding
`CLOUDFLARE_API_TOKEN` as a repository secret and splitting CI: PR jobs run lint + build + test
(no deploy); merge-to-main jobs run lint + build + test + deploy + smoke.

### 5. Existing test infrastructure Phase 3 builds on

**Phases 1 and 2 are complete** and their patterns are directly reusable:

- **Phase 1** ([context/archive/2026-06-21-testing-api-contract/](context/archive/2026-06-21-testing-api-contract/)):
  Vitest Workers integration test suite with `setupTwoUsers()` / `readSession()` fixtures. CI
  already runs these via `npm test`.

- **Phase 2** ([context/archive/2026-06-23-test-timer-sm/](context/archive/2026-06-23-test-timer-sm/)):
  Vitest jsdom unit test suite. Also runs via `npm test`.

For the smoke test, the relevant fixture is **service-role read-back** from Phase 1:
`readSession(id)` in [tests/_fixtures/db.ts](tests/_fixtures/db.ts) reads a row via the service
role client, bypassing RLS. The same pattern (service role INSERT + read-back + DELETE) applies to
the smoke test.

### 6. Historical context -- why Risk #4 exists

**Interview Q2** (cited in [context/foundation/test-plan.md:46](context/foundation/test-plan.md#L46)):
the schema mismatch failure mode has **already happened on this project** -- a migration was not
applied to production and session saves failed. This is the direct motivation for Phase 3.

**Roadmap pressure**: slices S-02, S-03, S-04 all add columns to the `sessions` table. Two
migrations exist today; more are coming. Without this gate, every future slice carries the same
schema mismatch risk.

## Code References

- [.github/workflows/ci.yml](ci.yml) -- full CI workflow (35 lines)
- [package.json:18](package.json#L18) -- `db:types` script
- [src/db/database.types.ts](src/db/database.types.ts) -- committed generated types file
- [supabase/migrations/20260531182506_sessions_data_foundation.sql](supabase/migrations/20260531182506_sessions_data_foundation.sql) -- sessions table DDL
- [supabase/migrations/20260601120000_drop_sessions_delete_policy.sql](supabase/migrations/20260601120000_drop_sessions_delete_policy.sql) -- drops DELETE policy
- [supabase/tests/rls_sessions.sql:12-14](supabase/tests/rls_sessions.sql#L12-L14) -- minimal INSERT fixture
- [src/lib/schemas/session.ts](src/lib/schemas/session.ts) -- `createSessionSchema` (Zod) for POST
- [src/pages/api/sessions/index.ts](src/pages/api/sessions/index.ts) -- POST /api/sessions endpoint
- [tests/_fixtures/db.ts](tests/_fixtures/db.ts) -- `readSession()` service-role fixture from Phase 1
- [context/changes/deployment/platform-research.md](context/changes/deployment/platform-research.md) -- deploy architecture details

## Architecture Insights

**Both gates are post-deploy -- they collapse into a single job.**

With Strategy C chosen for the `db:types` diff gate, both gates must run after production
migrations are applied. They are not independent layers but two checks in the same post-deploy job:

| Gate | Failure it catches | When to run | Key constraint |
|------|-------------------|-------------|----------------|
| `db:types` diff (Strategy C) | Migration NOT applied to production -- types file ahead of actual schema | Post-deploy | `SUPABASE_ACCESS_TOKEN` + production project ref |
| Post-deploy smoke | Schema applied but structurally broken -- session INSERT fails at runtime | Post-deploy | Credentials to write + read a real row; cleanup via service role |

This simplifies the architecture: one new CI job (triggered post-deploy) runs both checks in
sequence. If either fails, the deploy is flagged immediately and `wrangler rollback` is the
recovery path.

**Service role key is the right credential for the smoke test.** It bypasses RLS for INSERT,
SELECT, and DELETE. It is already in CI as `SUPABASE_SERVICE_ROLE_KEY`. The smoke INSERT should
use a clearly synthetic UUID (e.g. a known test sentinel like
`00000000-0000-0000-0000-000000000000`) so it can be identified and cleaned up if the test crashes
before the DELETE step. A separate cleanup/idempotency step should delete any row with that
sentinel ID before inserting, to handle leftover state from interrupted runs.

**The `db:types` file must not be in a "stale but valid" state.** Because TypeScript compilation
succeeds as long as the committed types don't conflict with actual usage, it is possible for the
types file to be "behind" a migration without breaking the build -- if new columns are nullable with
defaults, TypeScript won't notice. The diff gate is the only layer that catches this.

## Historical Context (from prior changes)

- [context/archive/2026-06-21-testing-api-contract/plan.md](context/archive/2026-06-21-testing-api-contract/plan.md) --
  Phase 1 test runner bootstrap; CI wiring for `npm test`; service-role fixture pattern
- [context/archive/2026-06-23-test-timer-sm/plan.md](context/archive/2026-06-23-test-timer-sm/plan.md) --
  Phase 2 jsdom test suite; `npm test` runs both Vitest projects
- [context/changes/deployment/platform-research.md](context/changes/deployment/platform-research.md) --
  deploy architecture: Cloudflare Workers Builds on push to `main`; CI is quality gate only

## Decisions Locked

- **`db:types` strategy**: Strategy C (production schema diff via `supabase gen types --project-id`).
- **Smoke test trigger**: Cloudflare Workers Builds webhook -> GitHub Actions `repository_dispatch`
  (deploy ownership stays with Cloudflare; no `CLOUDFLARE_API_TOKEN` needed in the repo).

## Architecture: post-deploy job via Cloudflare webhook

Cloudflare Workers Builds fires a deploy notification (webhook) after every successful production
deploy. That webhook POSTs to the GitHub API to trigger a `repository_dispatch` event, which kicks
off a dedicated `.github/workflows/smoke.yml` workflow containing both checks:

```
push to main
  -> Cloudflare Workers Builds: build + deploy  (unchanged)
       -> deploy notification webhook -> POST https://api.github.com/repos/<owner>/<repo>/dispatches
            -> GitHub Actions smoke.yml (on: repository_dispatch)
                 1. supabase gen types --project-id <ref>  (db:types diff)
                 2. diff src/db/database.types.ts /tmp/types_check.ts
                 3. smoke INSERT + read-back + DELETE  (session write + read)
```

**One-time manual setup** (in the Cloudflare dashboard):
- Workers & Pages -> Worker -> Settings -> Notifications -> "Deployment Success"
- Webhook URL: `https://api.github.com/repos/<owner>/<repo>/dispatches`
- Add header `Authorization: token <GITHUB_PAT>` and `Content-Type: application/json`
- Body: `{"event_type": "cloudflare-deploy-success"}`
- The PAT needs `repo` scope (to trigger `repository_dispatch`)

**New repository secrets required** (one-time manual, in GitHub Settings -> Secrets):

| Secret | Purpose |
|--------|---------|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token; lets Supabase CLI call the Management API for `gen types --project-id` |
| `SUPABASE_PROJECT_REF` | Production project ref (20-char ID from Supabase dashboard -> Project Settings) |

`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are already present and reused by the
smoke test.

## Open Questions

1. **Production project ref** -- must be retrieved from Supabase dashboard (Project Settings ->
   Reference ID). Stored as `SUPABASE_PROJECT_REF` repository secret. Not currently in any tracked
   file.

2. **`SUPABASE_ACCESS_TOKEN`** -- must be generated in Supabase dashboard (Account -> Access
   Tokens). Plan phase should include this as an explicit prerequisite step.

3. **Smoke test cleanup safety** -- if the DELETE step fails (e.g. network error mid-test), a
   sentinel row is left in production. Mitigation: idempotency step at the start of every smoke
   run that deletes any row with the sentinel UUID before inserting. Supabase REST API has no
   transactions; service-role DELETE is the only cleanup path.
