<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Editable Timer Presets and Count-Up Session Mode (S-03)

- **Plan**: context/changes/timer-presets/plan.md
- **Scope**: Phases 1-2 of 8
- **Date**: 2026-07-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | FAIL |

## Findings

### F1 -- Lint fails on Phase 2 test files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria / Pattern Consistency
- **Location**: tests/integration/api/user-presets.test.ts:9 / tests/unit/schemas/user-preset.test.ts:56
- **Detail**: `npm run lint` currently fails with 2 errors. Progress marks 2.1 (lint) as [x] at commit 4be6579 -- but the errors are in test files that were added in that same commit. `tests/integration/api/user-presets.test.ts:9` -- `Use an 'interface' instead of a 'type'` (`@typescript-eslint/consistent-type-definitions`). `tests/unit/schemas/user-preset.test.ts:56` -- Prettier formatting violation (inline object literal needs line breaks). Production code (schema, API endpoints, migration) is clean.
- **Fix**: Run `npm run lint:fix` -- both issues are auto-fixable. Re-run lint to confirm zero errors.
- **Decision**: FIXED

### F2 -- DELETE RLS policy added despite plan saying no DELETE

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM -- real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql:45-47
- **Detail**: The plan's "What We're NOT Doing" explicitly states "No DELETE -- three slots are permanent; only 'edit' is supported (no add/remove)." The migration created a `user_presets_delete_own` RLS policy. No corresponding DELETE endpoint exists in `[slot].ts`, so the policy is dead code today -- but it removes the schema-level friction that would slow a future developer from wiring up accidental deletion.
- **Fix A ⭐ Recommended**: Add a migration that drops `user_presets_delete_own`.
  - Strength: Keeps schema honest to the invariant; future devs need to consciously add the policy if they ever re-open the scope.
  - Tradeoff: One extra migration file.
  - Confidence: HIGH -- "no DELETE" was an explicit design decision.
  - Blind spot: If the policy was added intentionally as a safety valve for service_role ops, that rationale is undocumented.
- **Fix B**: Document the policy as intentional future-proofing with a comment in the migration and a plan addendum.
  - Strength: Zero DB migrations needed.
  - Tradeoff: "What We're NOT Doing" becomes misleading -- schema contradicts the stated constraint.
  - Confidence: MEDIUM -- only defensible if deletion is a known upcoming need.
  - Blind spot: None identified.
- **Decision**: FIXED via Fix A -- added supabase/migrations/20260701000000_drop_user_presets_delete_policy.sql

### F3 -- PUT endpoint returns blanket 500 on all Supabase errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/user-presets/[slot].ts:43-45
- **Detail**: All Supabase errors are returned as HTTP 500. If a DB CHECK constraint fires (SQLSTATE 23514 -- e.g., if Zod validation is bypassed), the client sees a 500 instead of a 400. The `src/pages/api/topics/index.ts` endpoint distinguishes SQLSTATE 23505 (conflict) and returns 409 -- setting precedent for mapping DB errors to appropriate HTTP codes.
- **Fix**: Add a branch before the blanket 500: `if (error.code === "23514") { return Response.json({ error: "Value out of allowed range" }, { status: 400 }); }`.
- **Decision**: FIXED

### F4 -- anon GRANT follows existing pattern but widens blast radius

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql:54
- **Detail**: The migration grants `SELECT, INSERT, UPDATE, DELETE` on `user_presets` to `anon`, matching the codebase-wide pattern (`sessions`, `topics`, `material_formats` all do the same in `20260627140018`). Intent is to let RLS be the sole gate -- `anon` has no matching policies. The pattern is internally consistent and covered by pgTAP tests 5-8. Worth noting: the grant is strictly unnecessary for correctness; any future accidental permissive anon policy would immediately expose data.
- **Fix**: Accept the pattern (no migration needed). Optionally add a comment explaining the codebase convention and why anon denial relies on RLS, not missing GRANTs.
- **Decision**: SKIPPED

### F5 -- RLS operand order inconsistent with sibling tables

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql:34,38,42,47
- **Detail**: All four RLS policies use `(SELECT auth.uid()) = user_id` (function left, column right). Every existing policy on sessions, topics, and material_formats uses `user_id = (SELECT auth.uid())` (column left, function right). Semantically identical; visually inconsistent when reviewing policies side-by-side in Supabase Studio.
- **Fix**: Flip to `user_id = (SELECT auth.uid())` in all four USING / WITH CHECK clauses via a corrective migration.
- **Decision**: FIXED -- added supabase/migrations/20260701000001_fix_user_presets_rls_operand_order.sql

### F6 -- `updateUserPresetSchema` name implies PATCH but semantics are PUT

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/schemas/user-preset.ts:3
- **Detail**: Schema is named `updateUserPresetSchema` but all fields are required (no `.partial()`). The endpoint is a PUT doing a full upsert -- both fields must be supplied. In REST convention "update" implies partial (PATCH). A reader may expect `.partial()` to exist.
- **Fix**: Rename to `putUserPresetSchema` (or `upsertUserPresetSchema`) and update the import in `[slot].ts`.
- **Decision**: FIXED -- renamed in user-preset.ts, [slot].ts, and user-preset.test.ts

### F7 -- pgTAP anon INSERT test omits error message assertion

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW -- quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/rls_user_presets.sql:72
- **Detail**: Test 6 (anon cannot insert) passes `NULL` as the expected error message to `throws_ok`, skipping the message check. `rls_sessions.sql` (the template this file mirrors) passes the full string `'new row violates row-level security policy for table "sessions"'`, making it a stronger assertion.
- **Fix**: Replace `NULL` with `'new row violates row-level security policy for table "user_presets"'`.
- **Decision**: FIXED
