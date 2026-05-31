# Sessions Data Foundation — Plan Brief

> Full plan: `context/changes/sessions-data-foundation/plan.md`

## What & Why

Land the first Supabase migration in PomoSapiens: `sessions`, `topics`, and `material_formats` tables with per-user RLS, plus the workflow (migration scripts, generated TypeScript types, pgTAP cross-user-isolation tests) every later slice (S-01..S-04) inherits. The roadmap names this slice's risk as regression-grade: "if RLS is wrong here, every later slice inherits the leak." This foundation absorbs the privacy NFR work once, in one place.

## Starting Point

`supabase/` contains only `config.toml` and `.gitignore` — no migrations, no app tables, only built-in `auth.users`. `@src/lib/supabase.ts` returns an untyped `SupabaseClient`. No test runner exists in the project. The Supabase CLI is already a devDependency; the migration tooling is one `npx supabase migration new` away.

## Desired End State

One migration applied, three tables visible in Studio with RLS enabled and 12 per-operation policies (4 ops × 3 tables) scoped to `authenticated`, five seeded `material_formats` defaults, three pgTAP test files proving cross-user isolation (`npm run db:test` green), a checked-in `src/db/database.types.ts`, and a typed `SupabaseClient<Database>` for every later slice to consume. The slice ships zero UI and zero API routes — S-01 is the first slice with user-visible behavior.

## Key Decisions Made

| Decision                          | Choice                                                                            | Why (1 sentence)                                                                                                  | Source |
| --------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| Column-set scope                  | Anticipating-but-nullable                                                         | Roadmap explicitly endorses "additive nullable columns are cheap"; avoids 3 follow-on migrations on `sessions`.   | Plan   |
| Constrained-value modeling        | Postgres enum for `energy_level`; lookup tables for `topics`/`material_formats`   | Energy is closed (3 values); topics/formats are per-user open sets with seeded NULL-owner defaults.               | Plan   |
| Time representation               | `started_at` + `ended_at` + computed `duration_seconds` (STORED)                  | Server-stored `started_at` keeps S-01's timer-resilience options open; generated col stays in sync automatically. | Plan   |
| Lookup ownership model            | NULL-owner defaults + per-user rows; RLS `owner_id IS NULL OR owner_id = uid()`   | Simplest mental model; no copy-on-write trigger; defaults stay in one place.                                      | Plan   |
| Primary keys                      | uuid (`gen_random_uuid()`)                                                        | Non-enumerable in any future URLs; matches the privacy NFR posture; ecosystem default.                            | Plan   |
| FK to `auth.users`                | `ON DELETE CASCADE`                                                               | Privacy-aligned: deleting a user wipes their data; no orphan rows holding session content.                        | Plan   |
| Admin access                      | Supabase Studio + service-role bypass; no policy                                  | PRD §Access Control: admin is "assigned out-of-band, not exposed in normal user-facing UI"; service role suffices.| Plan   |
| Realtime publication              | Excluded                                                                          | No FR demands cross-tab live sync; single-user product; smaller attack surface.                                   | Plan   |
| `updated_at`                      | Trigger-driven (`set_updated_at()` shared across tables)                          | Impossible to forget in app code; one source of truth for mutation timestamps.                                    | Plan   |
| Typegen                           | Generate and commit `src/db/database.types.ts`                                    | CI lint+build doesn't need a running Supabase; later slices import typed Row/Insert types directly.               | Plan   |
| Cross-user-leak verification      | pgTAP under `supabase/tests/` via `npm run db:test`                               | Supabase-native; CI-runnable; becomes the regression net every later slice extends.                               | Plan   |
| DB workflow scripts               | Full `db:start/stop/reset/migrate:new/types/test` set                             | One vocabulary; CLAUDE.md updated once; contributors and CI share the same commands.                              | Plan   |

## Scope

**In scope:**

- One migration: enum, trigger fn, three tables, RLS, indexes, seeds
- Three pgTAP test files asserting RLS isolation under two synthetic users + anon
- Six `db:*` npm scripts
- Generated and committed `src/db/database.types.ts`
- `createClient()` returns `SupabaseClient<Database> | null`
- CLAUDE.md Database Workflow section

**Out of scope:**

- All UI / API routes (S-01..S-04 own the user-facing layer)
- `user_profiles` / `presets` table (S-03's call)
- Topic seed rows (S-02's empty-state UX call)
- CI integration for `db:test` (local-only for v1)
- Realtime publication
- `is_admin` flag / admin-specific policies

## Architecture / Approach

One migration file containing the entire schema (DDL + RLS in the same file — no window where tables exist without policies). Lookup-table ownership uses `owner_id NULL` = seeded default visible to everyone, `owner_id = auth.uid()` = user-owned row. RLS policies use the `(SELECT auth.uid())` form to let Postgres cache the value per query. `sessions.duration_seconds` is a STORED generated column from `(ended_at - started_at)`; while a session is mid-run, it is NULL, supporting either S-01 timer-resilience strategy. Typegen runs locally via `npm run db:types`; the generated file is committed so CI doesn't need Docker.

## Phases at a Glance

| Phase                                       | What it delivers                                                     | Key risk                                                                |
| ------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Workflow scripts + scaffolding           | `db:*` npm scripts; empty `src/db/` + `supabase/tests/` dirs         | Forgetting `db:test` script means Phase 4's gate can't run              |
| 2. Schema DDL + seeds                       | Migration creates 3 tables + enum + trigger fn + indexes + seeds     | Computed `duration_seconds` semantics under NULL `ended_at`             |
| 3. RLS policies (same migration appended)   | 12 per-op policies + `ENABLE ROW LEVEL SECURITY` on all three        | `(SELECT auth.uid())` form vs bare `auth.uid()` — perf-grade            |
| 4. pgTAP cross-user isolation tests         | 3 test files proving 4-op × 3-role isolation matrix                  | pgTAP role-switching idiom under Supabase is non-obvious                |
| 5. TypeScript plumbing + final CLAUDE.md    | Committed `database.types.ts`; typed `SupabaseClient<Database>`      | Generated type file merge conflicts on parallel slice work              |

**Prerequisites:** Docker running locally (for `supabase start`); `supabase` CLI installed (already a devDep).
**Estimated effort:** ~1 working session (~3-5 hours) across the 5 phases; bulk of the time is writing the three pgTAP test files in Phase 4.

## Open Risks & Assumptions

- **Scope expansion beyond strict PRD on `material_format`** — PRD FR-008 treated material format as a closed 5-value vocabulary; this plan opens it to per-user additions via the lookup-table model (per the Q2 answer). Reversible by dropping INSERT/UPDATE/DELETE policies if S-02 chooses to constrain.
- **pgTAP role-switching idiom** — the `set_config('request.jwt.claims', ...) + SET LOCAL ROLE authenticated` pattern is correct under Supabase today but version-coupled; implementer should verify against current Supabase pgTAP docs before writing the first test.
- **CI does not yet run `db:test`** — RLS regressions can merge if a contributor skips local `db:test`. Mitigation: CLAUDE.md Database Workflow makes it a prerequisite.

## Success Criteria (Summary)

- `npm run db:reset && npm run db:test` from a clean checkout is green
- Two authenticated users cannot see each other's data via PostgREST (proven mechanically, not just manually)
- `npm run build` passes with a typed `SupabaseClient<Database>` returned from `createClient()`
