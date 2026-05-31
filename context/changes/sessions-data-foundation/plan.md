# Sessions Data Foundation — Implementation Plan

## Overview

Land the first Supabase migration in the project: create `sessions`, `topics`, and `material_formats` tables with per-user RLS policies, plus the workflow (migration scripts, generated `Database` TypeScript types, pgTAP cross-user-isolation tests) that every later slice (S-01..S-04) inherits. The migration is anticipating-but-nullable — columns required by S-02/S-03/S-04 ship now as nullable so later slices add behavior without re-touching the table.

This is foundation work: zero user-visible UI, zero API routes. The acceptance test is that an authenticated user can persist and read back their own session rows, and no other user (nor `anon`) can see them — proven mechanically by `npm run db:test`.

## Current State Analysis

- `supabase/` contains only `config.toml` and `.gitignore`. No `supabase/migrations/` directory exists. No application tables; only built-in `auth.users` is in use. This is the project's first application schema.
- `@src/lib/supabase.ts` returns an untyped `SupabaseClient` (the generic parameter defaults to `any`), and `@src/env.d.ts` only declares `App.Locals.user`. There is no `Database` type — every later slice would either reach for `unknown` or pay the typegen integration tax later.
- `supabase` CLI v2.23.4 is already a devDependency; `supabase/config.toml` is present (so `supabase init` ran at some point). Local tooling is one `npx supabase migration new` away.
- No test runner exists in the project (`package.json` has no `test` script and no vitest/jest/playwright). Verification for this slice rides on lint, build, `supabase db reset`, and `supabase test db` (pgTAP) — not unit tests.
- `wrangler.jsonc` and CI exist and run `lint + build`; CI does not currently spin up Supabase. Adding `db:test` to CI is out of scope here.
- `supabase/config.toml` has `[realtime] enabled = true`. New tables are not added to `supabase_realtime` by default, so the realtime decision is "do nothing" (matches the choice to exclude).

## Desired End State

- `supabase/migrations/<ts>_sessions_data_foundation.sql` exists and applies cleanly via `npm run db:reset`.
- Three tables exist in `public`: `sessions`, `topics`, `material_formats`. RLS is enabled on all three. Each table has four per-operation policies scoped to the `authenticated` role; `anon` has no policy and is fully denied.
- `material_formats` is pre-seeded with five NULL-owner rows: Video, Reading, Writing code, Drilling problems, Other.
- `supabase/tests/rls_sessions.sql`, `rls_topics.sql`, `rls_material_formats.sql` exist and pass under `npm run db:test`. Each asserts: (a) the owning user can read/write their own rows; (b) a different authenticated user cannot SELECT/UPDATE/DELETE the first user's rows and cannot INSERT a row claiming another user's id; (c) `anon` cannot do anything.
- `src/db/database.types.ts` exists, is committed, and matches the migration's schema.
- `createClient()` in `src/lib/supabase.ts` returns `SupabaseClient<Database> | null`. Existing call sites (middleware, auth routes) still compile.
- `package.json` has `db:start`, `db:stop`, `db:reset`, `db:migrate:new`, `db:types`, `db:test` scripts.
- `CLAUDE.md` Database Workflow section names these commands and the pgTAP convention.

### Key Discoveries

- The roadmap names the column-set scope as the implementer's call at `/10x-plan` time (F-01 Unknowns). The decision in this plan: anticipating-but-nullable. Columns `topic_id`, `material_format_id`, `timer_mode`, `note` ship now as nullable; S-02/S-03/S-04 layer behavior on top.
- The PRD treated `material_format` as a closed 5-value vocabulary (FR-008). The user's input opens it to a per-user lookup table with seeded NULL-owner defaults. This is a deliberate scope expansion beyond strict PRD; logged in Open Risks below.
- Supabase's recommended RLS pattern wraps `auth.uid()` in a subquery — `(SELECT auth.uid())` — to let Postgres cache the result per query. The policies in this plan use that form.
- A Postgres `GENERATED ALWAYS AS (...) STORED` expression evaluates to NULL when any input is NULL. This lets `sessions.duration_seconds` be NULL while the session is mid-run (`ended_at IS NULL`) and materialize automatically when `ended_at` is set. The S-01 timer-resilience strategy can pick "insert at start" or "insert at end" without schema rework.
- pgTAP tests in `supabase/tests/*.sql` are the Supabase-native verification path. `supabase test db` runs them locally against the same migrations the production project applies — same SQL surface, same RLS shape.
- The PRD's "Admin" role (§Access Control) is satisfied in v1 by Supabase Studio running with the service-role JWT, which bypasses RLS. No admin-specific policy or `is_admin` flag is added in this slice.

## What We're NOT Doing

- **No API routes, no UI, no React components.** S-01 owns the dashboard "Start session" button, the pre-session screen, the timer, and the history list. F-01 only proves the persistence layer.
- **No `user_profiles` / `presets` table.** S-03 owns timer-preset state (DB column on a profiles table vs localStorage is its `/10x-plan`-time call). F-01 does not anticipate this.
- **No `topics` seed rows.** Generic topic defaults ("Math", "Coding") don't fit the formal-education persona's heterogeneous fields (a history major's topics ≠ a CS major's). The table ships empty; S-02 owns first-row UX.
- **No CI integration for `db:test`.** pgTAP requires Supabase running locally; wiring it into GitHub Actions needs Docker on the runner and a `supabase start` step — real work not justified for v1. Document `db:test` as a local prerequisite before opening a PR.
- **No realtime publication.** `sessions`, `topics`, `material_formats` are not added to `supabase_realtime`. S-01 satisfies "saved session is visible immediately" via optimistic UI or explicit refetch.
- **No soft-delete / archive column on `sessions`.** Sessions are immutable history once ended; `ON DELETE CASCADE` from `auth.users` handles the only deletion case v1 cares about. `topics` gets `archived_at` per FR-017 ("archive") in S-02, not here.
- **No admin policy / `is_admin` flag.** Admin in v1 = the project owner using Supabase Studio (service-role bypass).
- **No FK to `topics` / `material_formats` with strict cascade.** Sessions reference both with `ON DELETE SET NULL` — preserving the session row even if the topic/format is later deleted. (FR-017 specifies archive, not delete; the RLS policy still allows DELETE for the owner but the S-02 UI is expected not to surface it.)

## Implementation Approach

**Strategy**: write one migration file containing the entire schema (enum + trigger fn + three tables + RLS + indexes + seeds). RLS is enabled in the same migration as the DDL — there is never a window where a table exists without its policies. The work is split into five phases for verification cadence, but Phases 2 and 3 append to the same migration file (DDL first, then RLS appended at the bottom of the same file).

**Decision lineage** (from the planning Q&A):
| Decision | Choice | Source |
| --- | --- | --- |
| Column-set scope | Anticipating-but-nullable | Plan Q1 |
| Constrained-value modeling | Postgres enum for `energy_level`; lookup tables (`topics`, `material_formats`) with per-user `owner_id` + NULL-owner defaults | Plan Q2 |
| Time representation | `started_at` + `ended_at` + computed `duration_seconds` | Plan Q3 |
| Lookup ownership model | NULL-owner defaults + per-user rows | Plan Q4 |
| Primary keys | uuid (`gen_random_uuid()`) | Plan Q5 |
| FK to `auth.users` | `ON DELETE CASCADE` | Plan Q6 |
| Admin access | Supabase Studio + service role; no policy | Plan Q7 |
| Realtime | Excluded | Plan Q8 |
| `updated_at` | Trigger-driven | Plan Q9 |
| Typegen | Generate and check in | Plan Q10 |
| Cross-user-leak verification | pgTAP + `supabase test db` | Plan Q11 |
| DB workflow scripts | Full `db:*` set | Plan Q12 |

---

## Phase 1: Workflow scripts + scaffolding

### Overview

Establish the developer workflow before writing any schema: `db:*` npm scripts, empty `src/db/` and `supabase/tests/` directories, CLAUDE.md Database Workflow stub. Future phases use these commands.

### Changes Required

#### 1. npm scripts

**File**: `package.json`

**Intent**: Add six scripts wrapping the Supabase CLI so contributors and CI use one vocabulary. Each is a thin pass-through.

**Contract**: New entries under `"scripts"`:
- `"db:start": "supabase start"`
- `"db:stop": "supabase stop"`
- `"db:reset": "supabase db reset"`
- `"db:migrate:new": "supabase migration new"`
- `"db:types": "supabase gen types typescript --local > src/db/database.types.ts"`
- `"db:test": "supabase test db"`

#### 2. Directory scaffolding

**File**: `src/db/.gitkeep`, `supabase/tests/.gitkeep`

**Intent**: Create the two directories Phase 2 and Phase 4 will populate, so they exist as commit-able entities now.

**Contract**: Two empty `.gitkeep` files (or any one-byte placeholder). `src/db/` will hold the generated types; `supabase/tests/` will hold pgTAP test files.

#### 3. CLAUDE.md Database Workflow stub

**File**: `CLAUDE.md`

**Intent**: Add a `### Database workflow` subsection under the existing `## Architecture` section, listing the new `db:*` commands and noting that pgTAP tests in `supabase/tests/` are the cross-user-isolation regression net. Stub now; Phase 5 finalizes once types are generated.

**Contract**: A new subsection (heading and ~6-line body) that names: `db:start`, `db:stop`, `db:reset`, `db:migrate:new`, `db:types`, `db:test`. Cross-references `supabase/tests/` as the RLS regression suite location.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run db:start` brings up Supabase locally (Docker required)
- `npm run db:test` exits 0 on an empty `supabase/tests/` directory
- `npm run db:stop` shuts down cleanly

#### Manual Verification

- Confirm Supabase Studio reachable at `http://localhost:54323` after `npm run db:start`
- Confirm `src/db/` and `supabase/tests/` directories exist in the working tree

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Schema DDL + seeds

### Overview

Create the migration file with enum, trigger function, three tables (with triggers, indexes, computed `duration_seconds`), and the five seeded `material_formats` rows. **RLS is NOT yet enabled** — Phase 3 appends that block to the same file.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/<ts>_sessions_data_foundation.sql` — use the current UTC timestamp via `npm run db:migrate:new sessions_data_foundation`.

**Intent**: Define the full schema for F-01. Append-only across Phase 2 and Phase 3; one file lands in git when the work is complete.

**Contract**: The file declares, in order:

1. **Enum type** — `CREATE TYPE public.energy_level AS ENUM ('low', 'medium', 'high');`
2. **Trigger function** — `public.set_updated_at()`, language plpgsql, sets `NEW.updated_at = now()` and returns `NEW`. Idempotent (`CREATE OR REPLACE FUNCTION`).
3. **`public.material_formats`** table:
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `owner_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE` (NULL = seeded default, visible to everyone)
   - `name text NOT NULL`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `updated_at timestamptz NOT NULL DEFAULT now()`
   - UNIQUE constraint on `(owner_id, name)` — case-sensitive; the NULL-owner partial uniqueness needs a `UNIQUE INDEX ... WHERE owner_id IS NULL` companion to enforce uniqueness of defaults.
   - `BEFORE UPDATE` trigger calling `set_updated_at()`.
4. **`public.topics`** table — same shape as `material_formats` (id, owner_id, name, created_at, updated_at, trigger, uniqueness). No seed rows.
5. **`public.sessions`** table:
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
   - `started_at timestamptz NOT NULL`
   - `ended_at timestamptz NULL`
   - `duration_seconds integer GENERATED ALWAYS AS (CASE WHEN ended_at IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (ended_at - started_at))::int END) STORED`
   - `energy_level public.energy_level NOT NULL`
   - `focus_rating smallint NULL CHECK (focus_rating BETWEEN 1 AND 5)` (NULL = skip per FR-013)
   - `topic_id uuid NULL REFERENCES public.topics(id) ON DELETE SET NULL`
   - `material_format_id uuid NULL REFERENCES public.material_formats(id) ON DELETE SET NULL`
   - `timer_mode text NULL CHECK (timer_mode IS NULL OR timer_mode IN ('preset_1', 'preset_2', 'preset_3', 'count_up'))` (NULL until S-03 wires it)
   - `note text NULL`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `updated_at timestamptz NOT NULL DEFAULT now()`
   - `BEFORE UPDATE` trigger calling `set_updated_at()`.
6. **Indexes**:
   - `CREATE INDEX ON public.sessions (user_id, started_at DESC)` — backs the FR-015 history list query.
   - `CREATE INDEX ON public.topics (owner_id)` — backs the per-user topic picker.
   - `CREATE INDEX ON public.material_formats (owner_id)` — same.
7. **Seed inserts** for `material_formats` — five rows with `owner_id = NULL`: `('Video')`, `('Reading')`, `('Writing code')`, `('Drilling problems')`, `('Other')`.

### Success Criteria

#### Automated Verification

- `npm run db:reset` applies the migration without errors
- `npm run lint` still passes (no app-side changes yet)
- `psql -h localhost -p 54322 -U postgres -d postgres -c "\dt public.*"` lists the three tables
- `psql ... -c "SELECT count(*) FROM public.material_formats WHERE owner_id IS NULL"` returns 5

#### Manual Verification

- In Supabase Studio: three tables visible under `public`; computed `duration_seconds` column on `sessions` is marked as generated
- Insert a row into `sessions` via Studio (as service role) with `started_at` and no `ended_at` — `duration_seconds` is NULL; set `ended_at` via UPDATE — `duration_seconds` populates

**Implementation Note**: pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: RLS policies (appended to the same migration)

### Overview

Append `ENABLE ROW LEVEL SECURITY` plus 12 policies (4 ops × 3 tables) to the migration file from Phase 2. After this phase, the migration is the final form that ships to production; the file does not change again.

### Changes Required

#### 1. RLS block appended to the Phase 2 migration

**File**: `supabase/migrations/<ts>_sessions_data_foundation.sql` (the same file).

**Intent**: Lock down all three tables with granular per-operation, per-role policies. `authenticated` users can read+write only their own rows (or NULL-owner default rows on the lookup tables). `anon` has no policy and is implicitly fully denied.

**Contract**: Append in order:

1. `ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;` + 4 policies for `authenticated`:
   - `sessions_select_own`: `FOR SELECT USING (user_id = (SELECT auth.uid()))`
   - `sessions_insert_own`: `FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()))`
   - `sessions_update_own`: `FOR UPDATE USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))`
   - `sessions_delete_own`: `FOR DELETE USING (user_id = (SELECT auth.uid()))`
2. `ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;` + 4 policies for `authenticated`:
   - `topics_select_own_or_default`: `FOR SELECT USING (owner_id IS NULL OR owner_id = (SELECT auth.uid()))`
   - `topics_insert_own`: `FOR INSERT WITH CHECK (owner_id = (SELECT auth.uid()))`
   - `topics_update_own`: `FOR UPDATE USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()))`
   - `topics_delete_own`: `FOR DELETE USING (owner_id = (SELECT auth.uid()))`
3. `ALTER TABLE public.material_formats ENABLE ROW LEVEL SECURITY;` + 4 policies for `authenticated` (mirror `topics`'s shape, substituting the table name).

Every `CREATE POLICY` includes `TO authenticated` explicitly — no implicit `TO public`. The `anon` role gets no policy and is therefore fully denied. The `(SELECT auth.uid())` form is required (Supabase performance-recommended pattern).

### Success Criteria

#### Automated Verification

- `npm run db:reset` re-applies cleanly with the appended block
- `psql ... -c "SELECT tablename, COUNT(*) FROM pg_policies WHERE schemaname='public' GROUP BY tablename"` returns 4 policies for each of the three tables (12 total)
- `psql ... -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('sessions','topics','material_formats')"` returns `relrowsecurity = true` for all three

#### Manual Verification

- In Supabase Studio (which uses service role and bypasses RLS), all rows still visible
- Via the REST endpoint (`http://localhost:54321/rest/v1/sessions`) with no `Authorization` header, response is empty / 401-equivalent
- Same endpoint with an `Authorization: Bearer <user A anon token>` returns only User A's rows (empty after fresh reset)

**Implementation Note**: pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: pgTAP cross-user isolation tests

### Overview

Write the regression net for the privacy NFR. Three test files under `supabase/tests/`, each asserting that User A cannot read or write User B's rows and that `anon` cannot do anything.

### Changes Required

#### 1. pgTAP test for `sessions`

**File**: `supabase/tests/rls_sessions.sql`

**Intent**: Prove the four `sessions` policies behave correctly under two synthetic authenticated users and the anonymous role.

**Contract**: A pgTAP-style SQL script that:
- Creates two test users via `auth.users` (with arbitrary UUIDs, e.g., `'00000000-0000-0000-0000-000000000001'` and `'...0002'`)
- Inserts one session per user (as service role) to seed data
- Switches role to `authenticated` and impersonates User A by setting `request.jwt.claims` (the pgTAP idiom is to set the local config); asserts:
  - `SELECT` returns only User A's row
  - `UPDATE` of User B's row affects 0 rows
  - `DELETE` of User B's row affects 0 rows
  - `INSERT` with `user_id = <User B>` raises (RLS WITH CHECK violation)
- Switches role to `anon`; asserts all four operations are denied/return empty
- Final `SELECT * FROM finish();` to emit the TAP summary

The role-switching idiom for pgTAP under Supabase is non-obvious (you set `request.jwt.claims` via `set_config` inside a transaction and then `SET ROLE authenticated`). Implementer should reference the Supabase pgTAP docs for the exact incantation. Example snippet:

```sql
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
```

#### 2. pgTAP test for `topics`

**File**: `supabase/tests/rls_topics.sql`

**Intent**: Prove `topics` policies behave correctly, including the NULL-owner default-row semantics.

**Contract**: Same shape as `rls_sessions.sql`, plus extra assertions:
- A NULL-owner row inserted (as service role) is visible to both User A and User B under `SELECT` (the "default visible to everyone" branch of the policy)
- Neither User A nor User B can `UPDATE` or `DELETE` the NULL-owner row (it has no `owner_id` matching their `auth.uid()`)
- `anon` cannot SELECT the NULL-owner row either (no policy applies to `anon` role)

#### 3. pgTAP test for `material_formats`

**File**: `supabase/tests/rls_material_formats.sql`

**Intent**: Same shape as `rls_topics.sql`. The seeded defaults from Phase 2 are the NULL-owner rows under test.

**Contract**: Same assertions as `rls_topics.sql`. Additionally: confirm the five seeded rows are visible to both authenticated users.

### Success Criteria

#### Automated Verification

- `npm run db:test` runs and reports all assertions passing
- Each test file's `finish()` summary shows no failed tests
- Adding a deliberately bad policy (e.g., temporarily removing `WITH CHECK` from `sessions_insert_own`) causes the relevant test to fail — verify the regression net actually catches regressions

#### Manual Verification

- Read the test files end-to-end and confirm assertions cover the four operations × three tables × three roles (User A, User B, anon) matrix the privacy NFR requires
- Confirm that the test files do not leave persistent state (each runs in a transaction that is rolled back, per the pgTAP convention `BEGIN; ... ROLLBACK;`)

**Implementation Note**: pause for manual confirmation before proceeding to Phase 5.

---

## Phase 5: TypeScript plumbing + final CLAUDE.md

### Overview

Generate the `Database` type, commit it, type the Supabase client returned by `createClient()`, and finalize the CLAUDE.md Database Workflow section.

### Changes Required

#### 1. Generate and commit `Database` types

**File**: `src/db/database.types.ts` (generated; committed)

**Intent**: Run `npm run db:types` to produce the typed schema definition. Commit the output so CI's `lint + build` doesn't need a running Supabase to typecheck.

**Contract**: A file exporting a `Database` type matching the schema from Phases 2–3. The file is generator-output; do not hand-edit. Re-running `npm run db:types` after schema changes regenerates the file.

#### 2. Type the Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Replace the untyped `createServerClient` return type with `SupabaseClient<Database>` so all callers get typed query results.

**Contract**: Import `Database` from `@/db/database.types`. The exported `createClient(...)` function's return type becomes `SupabaseClient<Database> | null`. Pass `<Database>` as the generic to `createServerClient`. No behavioral change.

#### 3. Type `App.Locals` for downstream callers (optional sanity check)

**File**: `src/env.d.ts`

**Intent**: Already only declares `user`. No change needed unless a later slice wants the client on `locals`; that's S-01's call.

**Contract**: No change in this phase.

#### 4. Finalize CLAUDE.md Database Workflow section

**File**: `CLAUDE.md`

**Intent**: Replace the Phase-1 stub with a complete section that names every `db:*` command, the migration filename convention (already in CLAUDE.md, cross-link), the pgTAP convention (tests live in `supabase/tests/*.sql`, one file per RLS-bearing table, run via `npm run db:test`), and the typegen convention (re-run `npm run db:types` after any schema change; commit the regenerated file).

**Contract**: A final ~15-line `### Database workflow` subsection. References the FR / NFR provenance (cross-user-isolation tests required by the privacy NFR).

### Success Criteria

#### Automated Verification

- `npm run db:types` runs and produces a non-empty `src/db/database.types.ts`
- `npm run lint` passes
- `npm run build` passes (TypeScript strict mode resolves `Database['public']['Tables']['sessions']['Row']` correctly)
- `git status` shows `src/db/database.types.ts` as a new tracked file
- A spot-check import in any `.ts` file: `import type { Database } from '@/db/database.types'; type SessionRow = Database['public']['Tables']['sessions']['Row'];` compiles

#### Manual Verification

- Open `src/db/database.types.ts` and confirm the three tables, the enum, and the policies are reflected
- Read the finalized CLAUDE.md Database Workflow section and confirm a fresh contributor could understand the migration / typegen / pgTAP flow from it alone

**Implementation Note**: this is the last phase; after manual verification, the slice is ready for commit and PR.

---

## Testing Strategy

### Unit / SQL Tests (pgTAP — the only automated test layer this slice adds)

- `supabase/tests/rls_sessions.sql` — 4 ops × 3 roles (User A, User B, anon) = 12 assertions, plus 1 negative INSERT test → ~13 assertions.
- `supabase/tests/rls_topics.sql` — same 12 + NULL-owner default visibility assertions for both users + anon-cannot-read-NULL-owner → ~16 assertions.
- `supabase/tests/rls_material_formats.sql` — same as topics + the five seed rows are visible to both users → ~17 assertions.

### Integration tests

Not applicable in this slice — no API endpoints, no end-to-end paths. S-01 introduces the first integration surface.

### Manual Testing Steps

1. `npm run db:start && npm run db:reset && npm run db:test` — full local cycle; all pgTAP assertions pass.
2. Open Supabase Studio at `http://localhost:54323`; confirm the three tables, RLS enabled, 4 policies each, 5 seed rows in `material_formats`.
3. Curl PostgREST as `anon` (`curl http://localhost:54321/rest/v1/sessions` with the anon key) — expect empty array (no policy applies to anon, so RLS denies; PostgREST returns 200 with empty array, NOT 401).
4. Sign up two test users via the existing auth UI; in Studio (service role) insert one session per user; confirm via PostgREST with each user's JWT that they see only their own row.

## Performance Considerations

- `(user_id, started_at DESC)` index on `sessions` directly serves the FR-015 history list query. Without it, that query becomes a full table scan as session volume grows.
- The `(SELECT auth.uid())` policy form is required for Postgres to cache the value per query — without the `SELECT`, the function is called per row. This is the documented Supabase performance pattern and is non-negotiable.
- Computed `duration_seconds` is STORED (not VIRTUAL), trading ~4 bytes per row for query-time speed. Acceptable at the medium-scale target in the PRD.

## Migration Notes

This is the first application migration; there is no prior data to migrate. Forward-only: a rollback path is not required (production Supabase will not see this migration until the first deploy after merge). If a problem is found post-deploy, fix-forward with an additive migration.

## References

- Roadmap row: `context/foundation/roadmap.md` §F-01
- PRD: `context/foundation/prd.md` — NFR "Privacy of session content"; §Access Control; FR-007..FR-017
- Existing Supabase client: `src/lib/supabase.ts`
- Existing middleware (auth pattern): `src/middleware.ts`
- Existing config: `supabase/config.toml`, `astro.config.mjs`
- CLAUDE.md "Supabase migrations" line — names the filename format and the RLS expectation this plan honors

## Open Risks & Assumptions

- **Scope expansion beyond strict PRD on `material_format`.** PRD FR-008 treated material format as a closed 5-value vocabulary. This plan opens it to per-user additions via the lookup-table model. Assumption: this expansion was intentional (the user explicitly chose lookup-tables-with-owner_id in Plan Q2). If S-02 later wants to constrain back to PRD, doing so is additive (drop INSERT/UPDATE/DELETE policies for the table).
- **pgTAP role-switching idiom**: The `set_config('request.jwt.claims', ...) + SET LOCAL ROLE authenticated` pattern is correct under Supabase but evolves with `@supabase/ssr` and pgTAP versions. Implementer should verify against the current Supabase pgTAP docs before writing the first test. If the idiom proves brittle, fall back to a one-shot SQL verification script (Q11 fallback).
- **`topics` ships empty.** S-02 owns the empty-state UX. If S-02 wants seeded topic defaults, it's an additive migration — not a regression.
- **CI does not yet run `db:test`.** A contributor could merge a PR that breaks RLS isolation if they don't run `db:test` locally. Mitigation: CLAUDE.md Database Workflow section makes `npm run db:test` a local prerequisite, and the PR template (future work) can add a checkbox.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Workflow scripts + scaffolding

#### Automated

- [x] 1.1 `npm run lint` passes — 39704d8
- [x] 1.2 `npm run db:start` brings up Supabase locally (Docker required) — 39704d8
- [x] 1.3 `npm run db:test` exits 0 on an empty `supabase/tests/` directory — 39704d8
- [x] 1.4 `npm run db:stop` shuts down cleanly — 39704d8

#### Manual

- [x] 1.5 Supabase Studio reachable at `http://localhost:54323` after `npm run db:start` — 39704d8
- [x] 1.6 `src/db/` and `supabase/tests/` directories exist in the working tree — 39704d8

### Phase 2: Schema DDL + seeds

#### Automated

- [x] 2.1 `npm run db:reset` applies the migration without errors — 575acbd
- [x] 2.2 `npm run lint` still passes — 575acbd
- [x] 2.3 `psql ... "\dt public.*"` lists the three tables — 575acbd
- [x] 2.4 `psql ... "SELECT count(*) FROM public.material_formats WHERE owner_id IS NULL"` returns 5 — 575acbd

#### Manual

- [x] 2.5 Three tables visible in Studio; `duration_seconds` column on `sessions` is marked generated — 575acbd
- [x] 2.6 Insert/UPDATE round-trip on `sessions` shows `duration_seconds` populating when `ended_at` is set — 575acbd

### Phase 3: RLS policies

#### Automated

- [x] 3.1 `npm run db:reset` re-applies cleanly with the appended block
- [x] 3.2 `pg_policies` query returns 4 policies for each of the three tables (12 total)
- [x] 3.3 `pg_class.relrowsecurity = true` for all three tables

#### Manual

- [x] 3.4 Studio (service role) still shows all rows
- [x] 3.5 PostgREST as `anon` returns empty for `/rest/v1/sessions`
- [x] 3.6 PostgREST as a signed-in user returns only that user's rows

### Phase 4: pgTAP cross-user isolation tests

#### Automated

- [ ] 4.1 `npm run db:test` reports all assertions passing
- [ ] 4.2 No failed tests in any `finish()` summary
- [ ] 4.3 Deliberately breaking one policy causes the corresponding test to fail (regression-net spot check, then revert)

#### Manual

- [ ] 4.4 Test files cover the 4 ops × 3 tables × 3 roles matrix
- [ ] 4.5 Test files leave no persistent state (BEGIN/ROLLBACK convention honored)

### Phase 5: TypeScript plumbing + final CLAUDE.md

#### Automated

- [ ] 5.1 `npm run db:types` produces a non-empty `src/db/database.types.ts`
- [ ] 5.2 `npm run lint` passes
- [ ] 5.3 `npm run build` passes
- [ ] 5.4 `src/db/database.types.ts` is a new tracked file in `git status`
- [ ] 5.5 Spot-check import of `Database['public']['Tables']['sessions']['Row']` compiles

#### Manual

- [ ] 5.6 `src/db/database.types.ts` reflects the three tables and the enum
- [ ] 5.7 Finalized CLAUDE.md Database Workflow section is sufficient for a fresh contributor
