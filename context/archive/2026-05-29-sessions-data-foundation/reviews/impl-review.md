<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sessions Data Foundation — table + per-user RLS

- **Plan**: context/changes/sessions-data-foundation/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-05-31
- **Verdict**: APPROVED (one benign scope leak)
- **Findings**: 0 critical · 1 warning · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned eslint ignore for generated types

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:73
- **Detail**: Phase 5 added `{ ignores: ["src/db/database.types.ts"] }` to the ESLint flat config. Not listed in the plan. The change is necessary — without it, the next regeneration of `database.types.ts` would trip `strictTypeChecked` rules and break `npm run lint` (success criterion 5.2). The work is correct; the plan was silent on it.
- **Fix**: Note the ignore in the plan epilogue (one bullet under Phase 5) so future contributors don't wonder where it came from. Treat as a documentation gap, not a code change.
- **Decision**: FIXED (plan.md Phase 5 §5 added)

### F2 — sessions UPDATE/DELETE policy broader than immutability intent

- **Severity**: 📎 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260531182506_sessions_data_foundation.sql:142-149
- **Detail**: The plan §"What We're NOT Doing" L47 acknowledges this explicitly — "the RLS policy still allows DELETE for the owner but the S-02 UI is expected not to surface it" — and the UPDATE policy lets a user mutate any column (WITH CHECK only guards the user_id-stays-with-owner invariant). PRD says sessions are immutable history. The gate is the UI, not the DB. A user with their JWT + curl can DELETE or rewrite any of their own sessions today. Implementation matches plan — flagging the pattern, not the code.
- **Fix**: Accept for v1 (consistent with the plan's documented stance) and consider recording the pattern as a lesson — "RLS UPDATE/DELETE policies should narrow scope when business-rule immutability matters; UI gating is not a security boundary against API-savvy users".
- **Decision**: FIXED + ACCEPTED-AS-RULE: lessons.md "RLS policies must enforce business-rule immutability, not the UI" + follow-up migration 20260601120000_drop_sessions_delete_policy.sql drops sessions_delete_own (DELETE-only narrowing; UPDATE policy unchanged per user call)

### F3 — Migration not idempotent on partial re-apply

- **Severity**: 📎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/migrations/20260531182506_sessions_data_foundation.sql:10, 30, 56, 80
- **Detail**: `CREATE TYPE energy_level …`, `CREATE TABLE`, `CREATE TRIGGER` have no `IF NOT EXISTS` / `DROP … IF EXISTS` guards. `db:reset` rebuilds from empty so this works today. Forward-only migration semantics mean the file ships once. The trigger function uses `CREATE OR REPLACE` already — good. Low-impact today; could bite if anyone ever needs to re-run portions of this file out of band.
- **Fix**: Leave as-is. Supabase migration files are forward-only; retrofitting idempotency adds noise without clear benefit.
- **Decision**: SKIPPED

### F4 — pgTAP fixtures depend on auth.users accepting near-empty rows

- **Severity**: 📎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/tests/rls_sessions.sql:8-10, rls_topics.sql:8-10, rls_material_formats.sql:9-11
- **Detail**: Tests insert into `auth.users` with `(id)` only, relying on every other column accepting NULL/defaults. Works against current local Supabase. A future Supabase CLI update that tightens NOT NULL on `email` (or similar) would silently break the test suite — and since CI doesn't run `db:test` yet, the break wouldn't surface until the next contributor runs it locally.
- **Fix**: Accept as-is; revisit when a Supabase CLI upgrade breaks the fixture (an explicit failure is a better forcing function than premature hardening here).
- **Decision**: SKIPPED
