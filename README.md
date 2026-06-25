# PomoSapiens

Hosted: https://pomo-sapiens.com/

## Database migrations

Local schema lives in `supabase/migrations/`. Production is a separate Supabase project; the committed `src/db/database.types.ts` is the TypeScript source of truth and **must match production** (CI's smoke gate enforces this via `diff`).

### Adding a migration

1. Scaffold the migration:
   ```bash
   npm run db:migrate:new <short_description>
   ```
2. Edit the new SQL file under `supabase/migrations/`. Enable RLS on any new table in the same migration.
3. Apply locally and verify:
   ```bash
   npm run db:reset
   npm run db:types    # regenerate types from LOCAL for in-progress dev
   ```
4. Use the new types/columns in code; iterate until happy.
5. Push the migration to production:
   ```bash
   npx supabase db push
   ```
6. Regenerate the committed types from production:
   ```powershell
   $env:SUPABASE_PROJECT_REF = "<prod-ref>"
   $env:SUPABASE_ACCESS_TOKEN = "<personal-access-token>"
   npm run db:types:prod
   ```
7. Commit the migration + regenerated `src/db/database.types.ts` together.

### Why two `db:types` scripts

- `db:types` -> reads from **local** Supabase. Fast, offline, reflects your in-progress migration work. Use during development.
- `db:types:prod` -> reads from **production** via the Management API. Slower (network call), requires `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN`. Use **only** when finalizing a PR -- this is what the CI smoke gate compares against.

The production read is metadata-only (no queries against your data, no locks); safe to run as often as needed.

## Bumping the pinned Supabase CLI version

CI and `db:types:prod` are pinned to the same Supabase CLI version so type generation output is deterministic. CLI upgrades are an explicit PR, not a silent failure.

To bump:

1. Update both files to the new version in one PR:
   - `.github/workflows/smoke.yml` -> `version: <new>` under `supabase/setup-cli@v1`
   - `scripts/gen-types-prod.mjs` -> `CLI_VERSION = "<new>"`
2. Regenerate the committed types with the new CLI:
   ```bash
   npm run db:types:prod
   ```
3. Commit the two config changes + regenerated `src/db/database.types.ts` together.
4. Merge -- CI's diff gate passes because both sides now use the new version.

Get the latest CLI version from https://github.com/supabase/cli/releases.
