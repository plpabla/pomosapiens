# Production schema validation gate (test-plan Phase 3) Implementation Plan

## Overview

Add a post-deploy GitHub Actions workflow that runs two schema gates against the live production Supabase project after every Cloudflare Workers Builds deploy: a `db:types` production-schema diff (Strategy C from research) and a session-write/read-back smoke test. The two gates collapse into one workflow because both require a post-deploy view of the production schema. Activation is via a Cloudflare deploy-success notification that posts to GitHub's `repository_dispatch` API.

## Current State Analysis

- `.github/workflows/ci.yml` runs lint + build + Vitest on push/PR to `main`; it never calls `db:test`, `db:types`, or any production schema check.
- Deployment is owned by Cloudflare Workers Builds (Cloudflare's native Git integration), not by GitHub Actions. CI finishes before the deploy completes, so a post-deploy check cannot live in `ci.yml`.
- `src/db/database.types.ts` is committed and used as the TypeScript source of truth (`SupabaseClient<Database>` in [src/lib/supabase.ts](src/lib/supabase.ts)), but is never verified against the live production schema.
- The minimum session INSERT requires three columns: `user_id`, `energy_level`, `started_at`. `user_id` is FK to `auth.users.id`, so a synthetic sentinel UUID alone cannot satisfy it.
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` already exist as CI repository secrets.
- No `tsx` / `ts-node` in `devDependencies`; the smoke script must run on plain `node` to avoid a new dependency for a single utility.

## Desired End State

After every successful production deploy:

1. GitHub Actions workflow `.github/workflows/smoke.yml` fires automatically (via Cloudflare webhook → `repository_dispatch`).
2. The workflow regenerates Supabase TypeScript types from the **production** project (`supabase gen types --project-id <ref>`) and diffs them against the committed `src/db/database.types.ts`. Any drift fails the gate.
3. The workflow runs `scripts/smoke-session-write.mjs`, which uses the service-role key to: (a) idempotently delete any leftover row for the dedicated smoke user, (b) INSERT a minimal session row, (c) SELECT it back, (d) DELETE it. Any failure fails the gate.
4. A failing run leaves the GitHub workflow red; default GitHub email notifications surface it.
5. `context/foundation/test-plan.md` §5 reflects that Phase 3 gates are active; §6 has a cookbook entry covering how to extend the smoke when a new critical RLS-bearing table arrives.

### Key Discoveries:

- Both gates must run **post-deploy**, so they collapse into a single workflow ([research.md §1, §4](context/changes/testing-schema-validation-gate/research.md)).
- Minimal session INSERT columns confirmed by [supabase/tests/rls_sessions.sql:12-14](supabase/tests/rls_sessions.sql#L12-L14) and [src/db/database.types.ts:71-85](src/db/database.types.ts#L71-L85).
- DELETE policy on `sessions` was dropped in [supabase/migrations/20260601120000_drop_sessions_delete_policy.sql](supabase/migrations/20260601120000_drop_sessions_delete_policy.sql); cleanup must use service role.
- Recent closeout pattern from `test-timer-sm` ([commit e76fd34](e76fd34)) — final phase bumps test-plan §5 status + adds cookbook entry; this plan mirrors that.

## What We're NOT Doing

- Not adding `CLOUDFLARE_API_TOKEN` to GitHub secrets or moving deploy ownership into Actions. Deploy stays with Cloudflare Workers Builds.
- Not implementing automated rollback (`wrangler rollback`) on smoke failure. Recovery is a human-driven response to the red workflow.
- Not opening GitHub issues automatically on failure. Default GitHub workflow-failure notifications are the escalation channel.
- Not adding `tsx` / `ts-node` as devDependencies. The smoke script is plain ESM JavaScript.
- Not running `npm run db:test` (pgTAP) in CI as part of this phase. pgTAP remains a local pre-PR gate per [test-plan.md §5](context/foundation/test-plan.md#L101).
- Not migrating the existing `ci.yml` job. The new workflow is additive.
- Not adding Strategy A (git-presence check) or Strategy B (local Supabase in CI) for the `db:types` diff. Both were rejected during research.

## Implementation Approach

Four phases, ordered so each is independently reviewable:

1. **Docs first** — capture every manual prerequisite in a runbook so the operator can prepare secrets and the Cloudflare webhook without blocking on the code review.
2. **Code next** — the smoke script + workflow YAML, with `workflow_dispatch` enabled so the operator can manually trigger a dry run against production before flipping auto-trigger on.
3. **Wire activation** — add `repository_dispatch`, configure the Cloudflare webhook, verify a real deploy fires the workflow end-to-end.
4. **Close out** — bump `test-plan.md` §5 ("required after §3 Phase 3" → active) and add §6.6 cookbook entry. Mirrors `test-timer-sm` p5.

## Critical Implementation Details

- **Cleanup ordering.** The smoke script must delete by `user_id = SMOKE_USER_ID` _before_ the INSERT, not only after. A crashed previous run can leave a row owned by the smoke user; without the pre-INSERT cleanup, the same row could survive across runs and skew the read-back assertion. The `--id` column has a server default (`gen_random_uuid()`) — the smoke script must capture the returned `id` from the INSERT to delete the exact row, not rely on a fixed UUID.
- **`supabase gen types` from production needs `SUPABASE_ACCESS_TOKEN` env var**, not a CLI flag. The Supabase CLI reads it from the environment.
- **Diff exit code.** Use `diff` (POSIX exit code 1 on mismatch fails the step) over `git diff` (which compares to working tree). The committed file is read from `src/db/database.types.ts` directly.
- **Workflow runner env.** `node` (>=20) is on `ubuntu-latest` by default; the smoke script uses `@supabase/supabase-js` from `node_modules` so `npm ci` must run first.

## Phase 1: Operator runbook & prerequisites

### Overview

Write the operator-facing runbook capturing every manual step that must happen outside the repo (Supabase access token, project ref retrieval, dedicated smoke user creation, GitHub secrets, Cloudflare deploy-success webhook). Add a one-line pointer from CLAUDE.md so future operators can find the runbook. No executable change in this phase — review-only docs.

### Changes Required:

#### 1. Operator runbook

**File**: `context/changes/testing-schema-validation-gate/runbook.md`

**Intent**: Capture every manual setup step in one canonical place that survives `/10x-archive`. Each step should be self-contained (dashboard path + what value to copy + which GitHub secret to paste into).

**Contract**: Markdown sections covering (a) Supabase Personal Access Token → `SUPABASE_ACCESS_TOKEN`, (b) Production Project Ref → `SUPABASE_PROJECT_REF`, (c) Dedicated smoke user creation in production auth.users → `SMOKE_USER_ID`, (d) Cloudflare "Deployment Success" notification webhook → GitHub Dispatches API, (e) verification checklist (one row per secret, confirming presence in GitHub repository settings). The smoke user is `smoke+schema-gate@<your-domain>` (no real mail delivery required; service-role create bypasses email confirmation).

#### 2. CLAUDE.md pointer

**File**: `CLAUDE.md`

**Intent**: Add a single line under the "CI" subsection pointing to the runbook, so future agents see it when reading project conventions.

**Contract**: New sentence after the existing `Requires SUPABASE_URL / SUPABASE_KEY repository secrets for the build step` line: `Post-deploy schema validation gates (smoke + db:types diff) are wired in .github/workflows/smoke.yml — see context/changes/testing-schema-validation-gate/runbook.md for one-time operator setup.` Once the change is archived this pointer should be updated to `context/archive/<archived-folder>/runbook.md` by the closeout step (or the archive command).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Markdown is valid (pre-commit Prettier pass): `npx prettier --check context/changes/testing-schema-validation-gate/runbook.md CLAUDE.md`

#### Manual Verification:

- Runbook is readable end-to-end with no unexplained jargon; an operator unfamiliar with the project can follow the steps.
- Each of the four required secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SMOKE_USER_ID`, and reused `SUPABASE_SERVICE_ROLE_KEY`) is named exactly as it will appear in the workflow YAML.
- CLAUDE.md pointer renders correctly in VSCode preview.
- Operator has completed the manual steps (4 secrets present in GitHub repo settings, 1 smoke user present in prod auth.users, 1 Cloudflare webhook configured) — gating Phase 2 verification.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the runbook has been executed (secrets + webhook + smoke user in place) before proceeding to Phase 2.

---

## Phase 2: Smoke script + smoke.yml workflow

### Overview

Implement the actual production checks: the standalone Node script that exercises a session write/read/delete, and the GitHub Actions workflow that runs both gates. In this phase the workflow is triggered only by `workflow_dispatch` (manual button in the Actions tab), so the operator can fire it on demand against the already-deployed production project for verification. Auto-trigger via Cloudflare webhook is deferred to Phase 3.

### Changes Required:

#### 1. Smoke script

**File**: `scripts/smoke-session-write.mjs`

**Intent**: A self-contained ESM Node script that proves the production sessions table accepts a minimal INSERT and returns the row via SELECT. Idempotent — safe to re-run after a crashed previous run. Exits non-zero on any failure. Plain JS so it runs on `node` directly without a transpile step.

**Contract**: Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMOKE_USER_ID` from `process.env`; throws on missing. Uses `@supabase/supabase-js` (already a dependency) with `createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })`. Sequence: (1) DELETE any pre-existing rows where `user_id = SMOKE_USER_ID` (idempotency); (2) INSERT one row with `{ user_id: SMOKE_USER_ID, energy_level: "medium", started_at: new Date().toISOString() }`, capturing the returned `id`; (3) SELECT the row by `id`, assert `user_id` + `energy_level` round-trip correctly; (4) DELETE that exact `id`. Any Supabase error response or assertion failure → `console.error(...)` + `process.exit(1)`. Success → `console.log("smoke OK")` + exit 0.

#### 2. Smoke workflow (manual-trigger version)

**File**: `.github/workflows/smoke.yml`

**Intent**: A standalone GitHub Actions workflow that runs both schema gates (`db:types` production diff + smoke script) against production. In this phase the only trigger is `workflow_dispatch` so it can be fired manually for verification.

**Contract**: `on: workflow_dispatch:` (only). One job `schema-validation` on `ubuntu-latest`. Steps: (a) `actions/checkout@v4`; (b) `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: npm`; (c) `npm ci`; (d) `supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > /tmp/types_from_prod.ts` with env `SUPABASE_ACCESS_TOKEN`; (e) `diff src/db/database.types.ts /tmp/types_from_prod.ts` (POSIX `diff`; non-zero exit fails the step); (f) `node scripts/smoke-session-write.mjs` with env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMOKE_USER_ID`. No further wrapping — a failing step turns the workflow red and that is the entire escalation mechanism per the locked decision.

#### 3. Local-run convenience (optional but recommended)

**File**: `package.json`

**Intent**: Make local debugging of the smoke script trivial by adding a `test:smoke` npm script. The script reads the same env vars as CI (operator can `set` them in PowerShell or `export` in bash).

**Contract**: Add to `"scripts"`: `"test:smoke": "node scripts/smoke-session-write.mjs"`. No new dependency. Document in the runbook that `SMOKE_USER_ID` and `SUPABASE_SERVICE_ROLE_KEY` must be set locally before running.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- TypeScript build still passes: `npm run build`
- Existing test suite passes (no regression): `npm test`
- New script can be executed locally with environment set: `npm run test:smoke` exits 0
- Workflow YAML is syntactically valid (GitHub renders it in the Actions tab without parse errors)

#### Manual Verification:

> **Note**: GitHub's `workflow_dispatch` API requires the workflow file to be on the default branch (`main`). The "Run workflow" button and `gh workflow run` both return HTTP 404 until the file is merged. Merge this PR to `main` before performing the steps below.

- `workflow_dispatch` button is visible on the Actions tab for `smoke.yml` after merging to `main`.
- Manual trigger against the current production deploy completes green: both `diff` and the smoke script pass; total runtime under 60 seconds.
- After a successful run, querying production sessions filtered by `user_id = SMOKE_USER_ID` returns zero rows (cleanup verified).
- Intentional drift verification: temporarily edit `src/db/database.types.ts` (e.g. add a `// drift` comment line), commit, push to `main`, manual-trigger — the workflow fails on the `diff` step. Revert before proceeding to Phase 3.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual workflow_dispatch run completes green and the drift test fails as expected, before proceeding to Phase 3.

---

## Phase 3: Webhook activation + first auto-run

### Overview

Flip the smoke workflow from manual-only to auto-triggered by Cloudflare deploy-success notifications. Configure the Cloudflare webhook per the runbook so a real production deploy fires the GitHub `repository_dispatch` event. Verify by causing a deploy (no-op commit on `main` or an existing PR merge) and observing the workflow auto-run.

### Changes Required:

#### 1. Switch to push-to-main trigger + 5 min wait

**File**: `.github/workflows/smoke.yml`

**Intent**: Auto-trigger the smoke after every push to `main` (including PR merges). A 5-minute sleep gives Cloudflare Workers Builds time to finish the deploy before the gates run. Keep `workflow_dispatch` so manual runs remain possible.

**Contract**: Replace `repository_dispatch` with `push: branches: [main]` in the `on:` block. Add a `sleep 300` step as the first step in the job. No Cloudflare dashboard action required -- Cloudflare Workers Builds does not support simple deploy-success webhooks without a Queue + consumer Worker intermediary.

> **Note:** The original plan used `repository_dispatch` triggered by a Cloudflare webhook. Cloudflare's actual notification system requires a Cloudflare Queue + consumer Worker intermediary, making it impractical. The push-to-main + delay approach is equivalent in practice.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Workflow YAML still parses (visible in Actions tab without errors)

#### Manual Verification:

- A no-op commit pushed to `main` (or the merge of this change's PR) triggers Cloudflare Workers Builds; on deploy success, the Cloudflare notification fires and the smoke workflow appears in the Actions tab as a `repository_dispatch` run.
- The auto-triggered run completes green within ~60s.
- Workflow run logs show both steps (db:types diff + smoke script) executed.
- After the auto-run, querying production sessions filtered by `SMOKE_USER_ID` returns zero rows.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that a real deploy auto-triggered the workflow end-to-end before proceeding to Phase 4.

---

## Phase 4: Test-plan §5 status bump + cookbook §6.6

### Overview

Reflect the now-active Phase 3 gates in the canonical test plan and add the cookbook entry future contributors will read when adding a new RLS-bearing critical table. Mirrors the closeout pattern from `test-timer-sm` p5 ([commit e76fd34](e76fd34)).

### Changes Required:

#### 1. Test-plan §5 status bump

**File**: `context/foundation/test-plan.md`

**Intent**: Move the two §5 gates from forward-looking ("required after §3 Phase 3") to active. Move §3 row 3 Status from `change opened` to `complete`. Update Last-updated header.

**Contract**: In §3 table row 3, change Status cell to `complete`. In §5 table, change the `Required?` cell for `post-deploy smoke (session write + read)` and `db:types diff` rows from `required after §3 Phase 3` to `required (active)`. Update the "Last updated" line at the top of the file to today's date with the parenthetical "(Phase 3 complete)".

#### 2. Cookbook §6.6 entry

**File**: `context/foundation/test-plan.md`

**Intent**: Document how the smoke gate is extended when a future RLS-bearing table needs production-write coverage. Keep it short — the singleton smoke script is small enough to follow by reading it.

**Contract**: New `### 6.6 Extending the production smoke gate (new critical RLS-bearing table)` subsection after §6.5. Sections: **Location** (`scripts/smoke-session-write.mjs` and `.github/workflows/smoke.yml`), **When to extend** (only if a new table is critical-path AND has RLS-gated writes from end-user requests AND would not be caught by the `db:types` diff alone — i.e. structural failure modes beyond schema drift), **Pattern** (add a new step to `smoke.yml` invoking a sibling script `scripts/smoke-<table>-write.mjs` following the same idempotency-DELETE / INSERT / SELECT / DELETE shape; reuse `SMOKE_USER_ID` if rows belong to a user, otherwise add a `SMOKE_<TABLE>_KEY` secret per the runbook), **Anti-pattern** (do not extend the existing `smoke-session-write.mjs` to cover multiple tables — keeps failure attribution clean).

#### 3. Change folder status bump

**File**: `context/changes/testing-schema-validation-gate/change.md`

**Intent**: Reflect that the plan is implemented and ready for archive.

**Contract**: Frontmatter `status: implemented`, `updated: <today>`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Prettier passes: `npx prettier --check context/foundation/test-plan.md context/changes/testing-schema-validation-gate/change.md`
- Markdown links resolve (no dead anchors introduced)

#### Manual Verification:

- `context/foundation/test-plan.md` §3 row 3 Status reads `complete`.
- `context/foundation/test-plan.md` §5 shows both gates as `required (active)`.
- §6.6 cookbook entry is consistent in style with §6.1-§6.5.
- A reader unfamiliar with the change can read §6.6 and §5 alone and understand what's protected.
- `change.md` reads `status: implemented` and is ready for `/10x-archive`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the test-plan reads coherently end-to-end before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- No new unit tests. The smoke script's only logic is sequencing Supabase REST calls; its assertion _is_ the gate. Unit-testing it with mocked Supabase would test the mock.

### Integration Tests:

- The smoke script itself IS the integration test. It runs against the live production project. There is no lower-cost layer that gives the signal Risk #4 demands.

### Manual Testing Steps:

1. **Phase 2 manual dry run**: trigger `smoke.yml` via Actions → "Run workflow"; expect green within 60s.
2. **Phase 2 drift verification**: temporarily edit `src/db/database.types.ts` (add `// drift` comment), commit on a branch, manual-trigger the workflow → expect failure on the `diff` step. Revert.
3. **Phase 3 end-to-end**: push a trivial commit to `main` (or merge the change PR) → Cloudflare deploys → workflow auto-fires → green within ~60s of deploy completion.
4. **Phase 3 cleanup audit**: after the auto-run, query `SELECT * FROM public.sessions WHERE user_id = '<SMOKE_USER_ID>'` via Supabase Studio → expect zero rows.

## Performance Considerations

- Workflow total runtime budget: ~60 seconds. `actions/setup-node` cached install dominates (~20-30s); `npm ci` (~20s); both gates (~5s each).
- Smoke script issues at most four Supabase REST calls per run. Negligible production load.
- `supabase gen types --project-id` calls the Supabase Management API; one call per workflow run.
- No load on production from the smoke gate beyond one INSERT, one SELECT, one DELETE per deploy.

## Migration Notes

No data migration. One persistent artifact in production: the dedicated smoke auth user created during Phase 1 runbook execution. It stays in `auth.users` for the lifetime of this gate.

## References

- Research: [context/changes/testing-schema-validation-gate/research.md](context/changes/testing-schema-validation-gate/research.md)
- Change identity: [context/changes/testing-schema-validation-gate/change.md](context/changes/testing-schema-validation-gate/change.md)
- Test plan (Phase 3 row + Risk #4 + §5 gates): [context/foundation/test-plan.md](context/foundation/test-plan.md)
- Prior phase closeout pattern (cookbook + status bump): [context/archive/2026-06-23-test-timer-sm/plan.md](context/archive/2026-06-23-test-timer-sm/plan.md)
- Service-role fixture (reference for smoke script shape): [tests/\_fixtures/db.ts](tests/_fixtures/db.ts)
- Sessions schema: [supabase/migrations/20260531182506_sessions_data_foundation.sql](supabase/migrations/20260531182506_sessions_data_foundation.sql)
- Current CI workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Operator runbook & prerequisites

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Markdown is valid (pre-commit Prettier pass): `npx prettier --check context/changes/testing-schema-validation-gate/runbook.md CLAUDE.md`

#### Manual

- [x] 1.3 Runbook is readable end-to-end with no unexplained jargon; an operator unfamiliar with the project can follow the steps — 2d4676c
- [x] 1.4 Each of the four required secrets is named exactly as it will appear in the workflow YAML — 2d4676c
- [x] 1.5 CLAUDE.md pointer renders correctly in VSCode preview — 2d4676c
- [x] 1.6 Operator has completed the manual steps (4 secrets present in GitHub, 1 smoke user in prod auth.users, 1 Cloudflare webhook configured) — 2d4676c

> **NOTE:** Runbook step 5 (Cloudflare deploy-success webhook) is deferred -- it requires `smoke.yml` with `repository_dispatch: types: [cloudflare-deploy-success]` (Phase 3) to be merged before it can be executed. Execution is tracked as item 3.7 below.

### Phase 2: Smoke script + smoke.yml workflow

#### Automated

- [x] 2.1 Lint passes: `npm run lint`
- [x] 2.2 TypeScript build still passes: `npm run build`
- [x] 2.3 Existing test suite passes (no regression): `npm test`
- [x] 2.4 New script can be executed locally with environment set: `npm run test:smoke` exits 0
- [x] 2.5 Workflow YAML is syntactically valid (GitHub renders it in the Actions tab without parse errors)

#### Manual

- [x] 2.6 `workflow_dispatch` button is visible on the Actions tab for `smoke.yml` after merging to `main`
- [x] 2.7 Manual trigger against current production deploy completes green in under 60 seconds
- [x] 2.8 After a successful run, production sessions filtered by `SMOKE_USER_ID` returns zero rows
- [x] 2.9 Intentional drift verification: edited types file makes the workflow fail on the `diff` step; reverted before merging

### Phase 3: Webhook activation + first auto-run

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 074b390
- [x] 3.2 Workflow YAML still parses (visible in Actions tab without errors) — 074b390

#### Manual

- [ ] 3.3 Merge of this change's PR triggers Cloudflare deploy + the smoke workflow appears in Actions as a `push` run (after ~5 min wait step)
- [ ] 3.4 Auto-triggered run completes green within ~6 min of the push
- [ ] 3.5 Workflow run logs show both steps (db:types diff + smoke script) executed
- [ ] 3.6 After the auto-run, production sessions filtered by `SMOKE_USER_ID` returns zero rows
- [x] 3.7 Cloudflare webhook activation -- superseded: push-to-main + sleep 300 used instead (Cloudflare has no simple deploy webhook) — 074b390

### Phase 4: Test-plan §5 status bump + cookbook §6.6

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Prettier passes on the edited markdown files
- [ ] 4.3 Markdown links resolve (no dead anchors introduced)

#### Manual

- [ ] 4.4 `context/foundation/test-plan.md` §3 row 3 Status reads `complete`
- [ ] 4.5 `context/foundation/test-plan.md` §5 shows both gates as `required (active)`
- [ ] 4.6 §6.6 cookbook entry is consistent in style with §6.1-§6.5
- [ ] 4.7 `change.md` reads `status: implemented` and is ready for `/10x-archive`
