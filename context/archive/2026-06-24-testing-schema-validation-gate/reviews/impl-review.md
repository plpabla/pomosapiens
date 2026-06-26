<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Production schema validation gate (test-plan Phase 3)

- **Plan**: context/changes/testing-schema-validation-gate/plan.md
- **Scope**: All 4 phases (full plan review)
- **Date**: 2026-06-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 3 warnings · 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Supabase CLI version mismatch between local and CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/smoke.yml:20 + package.json:70
- **Detail**: Workflow pins supabase CLI to 2.108.0 but `package.json` devDependency is `"supabase": "^2.23.4"`. Local CLI is currently 2.98.2 (verified via `npx supabase --version`). The local `db:types` script uses the local CLI; the CI diff gate uses 2.108.0. If the two CLI versions emit different formatting, the gate fails on a no-op CLI upgrade -- a spurious red. Today the gate passes only because committed types were generated via the new `db:types:prod` helper, also pinned to 2.108.0. A teammate running `npm run db:types` against a local DB and committing the output would unknowingly desync.
- **Fix**: Pin the devDependency to the same minor as the workflow (`"supabase": "2.108.0"` or `"~2.108.0"`) and document in the runbook that `db:types` and `db:types:prod` must agree on CLI major/minor.
  - Strength: Removes a class of spurious failures; ensures the diff gate measures schema drift, not CLI drift.
  - Tradeoff: Manual coordination required whenever the workflow CLI version is bumped.
  - Confidence: HIGH — version mismatch is observable today.
  - Blind spot: Whether 2.98.2 and 2.108.0 actually emit identical output for the current schema (not directly tested; gate passing is circumstantial).
- **Decision**: FIXED — pinned `supabase` devDep to `2.108.0`; added §7 to runbook documenting CLI version sync.

### F2 — Unplanned `gen-types-prod.mjs` helper + `db:types:prod` script

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/gen-types-prod.mjs + package.json:19
- **Detail**: The plan's "What We're NOT Doing" list says the smoke script is plain ESM and adds nothing else. `gen-types-prod.mjs` was added without being mentioned in any phase's "Changes Required". It is, in practice, the helper the operator uses to regenerate the committed types from production to match the workflow output (see F1). Useful, but it crossed the planned scope line without an addendum.
- **Fix**: Document the helper in a Phase 4 addendum to plan.md (single bullet under §Critical Implementation Details explaining "committed types must be regenerated via `npm run db:types:prod` to match the workflow CLI").
- **Decision**: FIXED — addendum bullet added to plan.md §Critical Implementation Details.

### F3 — Phase 1 success criterion 1.2 marked passed but prettier fails today

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-schema-validation-gate/runbook.md:91-97
- **Detail**: Progress item 1.2 (`npx prettier --check context/changes/testing-schema-validation-gate/runbook.md CLAUDE.md`) is marked `[x]`. Running it now prints `[warn] Code style issues found` on runbook.md -- a trailing space-padding mismatch in the verification table. Likely cause: Phase 3 edits to §5 and the verification table broke column alignment and the gate wasn't re-run after the edit.
- **Fix**: `npx prettier --write context/changes/testing-schema-validation-gate/runbook.md` and commit. No content change, only padding.
- **Decision**: FIXED — `npx prettier --check runbook.md CLAUDE.md` now passes (formatting was already brought back into compliance by the F1 §7 addition).

### F4 — Phase 3 pivoted from repository_dispatch to push: branches

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .github/workflows/smoke.yml:3-6
- **Detail**: Plan §Desired End State and Phase 3 originally described a Cloudflare webhook → `repository_dispatch` trigger. Implementation pivoted to `push: branches: [main]` with an in-flight plan note explaining Cloudflare requires a Queue + consumer Worker intermediary. Item 3.7 is marked "superseded". The pivot is rationalized; the test-plan §5 gate is still "active". The trigger mechanism differs from the original spec, so "post-deploy" is now "post-push" -- smoke races the Cloudflare deploy, but smoke gates Supabase directly (not the Worker), so the race is harmless.
- **Fix**: None. Deviation is well-documented in plan and runbook. Revisit only if a future smoke step starts depending on the deployed Worker.
- **Decision**: ACCEPTED — pivot is well-documented; no change required.

### F5 — Workflow has no explicit `permissions:` block

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: .github/workflows/smoke.yml:1-7
- **Detail**: smoke.yml uses the default `GITHUB_TOKEN` scope, which is broader than this workflow needs -- it only reads the repo and calls Supabase APIs with its own secrets. A least-privilege `permissions: contents: read` would shrink blast radius if a step ever pulled a compromised action.
- **Fix**: Add `permissions: { contents: read }` at the workflow level (immediately under `on:`).
- **Decision**: FIXED — added `permissions: contents: read` block to smoke.yml.
