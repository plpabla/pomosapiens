# S-02: Categorize sessions by topic and material format -- Implementation Plan

## Overview

Ship S-02 from [roadmap.md](../../foundation/roadmap.md#L97-L108): users can add / rename / archive their own topics on a management screen, optionally pick a topic and a material format on the pre-session screen, and see those categories surfaced on dashboard history rows. Material formats are user-extensible (per F-01's design choice); 5 seeded defaults (Video, Reading, Writing code, Drilling problems, Other) stay visible to everyone and are not user-archivable. Both pre-session pickers default to empty so the 3-tap budget ([prd.md:84](../../foundation/prd.md#L84)) is preserved.

## Current State Analysis

**Schema is largely done.** F-01 deliberately shipped the columns S-02 needs:

- [sessions.topic_id](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L80-L102) and `sessions.material_format_id` are present, nullable, `ON DELETE SET NULL`.
- [topics](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L56-L74) and [material_formats](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L30-L50) tables exist with per-user RLS using `(SELECT auth.uid())`, and the lookup-with-NULL-owner default-visibility pattern works.
- material_formats ships with 5 NULL-owner seeds. topics ships **empty**.
- [src/db/database.types.ts](../../../src/db/database.types.ts#L66-L152) already types all FK fields.

**Missing for S-02**: `archived_at` on `topics` (F-01 explicitly deferred -- [F-01 plan.md:45](../../archive/2026-05-29-sessions-data-foundation/plan.md#L45)) and symmetrically on `material_formats`; a widened POST `/api/sessions`; a topics CRUD API; a material-formats CRUD API (user-owned rows only); pre-session pickers; dashboard chips; `/topics` and `/formats` management pages; Topbar nav.

**Roadmap entry is stale**: [roadmap.md:107](../../foundation/roadmap.md#L107) describes additive schema changes on `sessions` that F-01 already shipped. Don't write that migration.

## Desired End State

After this plan lands and is deployed:

- A signed-in user can visit `/topics`, see an empty state, add a topic ("Algorithms"), rename it, and archive it. Archived topics disappear from the picker but remain attached to past sessions on the dashboard.
- The same is true on `/formats` for user-created formats. The 5 seeded formats are visible to everyone, not editable, not archivable.
- On `/session/new`, the user sees the existing energy buttons, then a Topic dropdown (with non-archived topics + a no-topic default), then a Material format dropdown (seeded formats + the user's own non-archived formats + a no-format default). They can ignore both and still tap Start as the third tap.
- Dashboard history rows show topic + format as a small chip line below the date when either is set; the line is omitted when both are null.
- pgTAP coverage on `topics` and `material_formats` includes the new `archived_at` column. Column-scope integration tests cover the widened POST `/api/sessions` and every new write endpoint. `npm run db:test`, `npm run lint`, and `npm run build` pass.

### Key Discoveries:

- **L-01 column-scope two-layer** ([lessons.md L-01](../../foundation/lessons.md), [F-01 impl-review.md:36-43](../../archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md#L36-L43)) -- schema default-strip on `z.object` + hand-picked `.insert / .update`. Binds every new write endpoint in this slice plus the widened POST sessions. Both layers required.
- **Sessions immutability** -- DELETE RLS dropped ([20260601120000_drop_sessions_delete_policy.sql](../../../supabase/migrations/20260601120000_drop_sessions_delete_policy.sql)); PATCH uses `.is("ended_at", null)` for write-once ([sessions/[id].ts:46](../../../src/pages/api/sessions/[id].ts#L46)). Topic / material_format are POST-only inputs; do NOT widen `endSessionSchema` or PATCH `/api/sessions/[id]`.
- **3-tap guardrail** ([prd.md:84](../../foundation/prd.md#L84), [S-01 plan.md:347-349](../../archive/2026-06-19-first-session-capture-loop/plan.md#L347-L349)) -- tap 1 link → tap 2 energy → tap 3 Start. Both new pickers MUST default to "no selection" so a fast user still ships in 3 taps.
- **PROTECTED_ROUTES entries for top-level pages** -- `/topics` and `/formats` are top-level pages with no nested routes (unlike `/session/` which only has `/session/new` and `/session/[id]`). Add them as `"/topics"` / `"/formats"` (no trailing slash), matching the existing `/dashboard` entry. The S-01 F5 trailing-slash rule applies only when the base path itself is NOT a rendered page; using `"/topics/"` here would skip protection for the actual `/topics` URL.
- **Error contract** -- all endpoints respond `{ error: string }` (no `fieldErrors`). Status codes used in this codebase: 200, 201, 400, 401, 409, 500. No 403, no 404 -- access-denial collapses into 409 byte-identical with not-found ([sessions.end.test.ts:208-261](../../../tests/integration/api/sessions.end.test.ts)).
- **Dashboard reads Supabase directly** from [dashboard.astro:26-31](../../../src/pages/dashboard.astro#L26-L31), not via API. Extend with PostgREST embeds; RLS still applies.
- **db:types after migration**: run locally with `npm run db:types`; after deploy, run `npm run db:types:prod` to avoid CLI-version drift breaking the smoke `diff` gate ([testing-schema-validation-gate runbook](../../archive/2026-06-24-testing-schema-validation-gate/runbook.md)).
- **shadcn install hazard L-04** ([lessons.md L-04](../../foundation/lessons.md)) -- after `npx shadcn add <name>`, delete `node_modules/.vite/` and restart dev before the next run.
- **RLS UPDATE policies already block seeded-format archival** -- `material_formats_update_own` uses `owner_id = (SELECT auth.uid())`, so a PATCH targeting a NULL-owner row affects 0 rows. No extra app-layer guard needed; the 0-row case naturally collapses to 409 the same way as cross-user denial.

## What We're NOT Doing

- Not widening PATCH `/api/sessions/[id]` or `endSessionSchema`. Topic and material_format are pre-session only.
- Not adding post-session editing of topic / material_format anywhere. If a user picks the wrong one, the session is what it is.
- Not seeding topics. `/topics` empty-state handles the first-run UX.
- Not making material_format seeds (Video / Reading / Writing code / Drilling problems / Other) editable, renamable, or archivable by users. They're protected by RLS already; the management page must not surface "rename" / "archive" affordances on them.
- Not adding a combobox / search-as-you-type picker. Plain shadcn Select for v1.
- Not changing dashboard row layout beyond appending a chip line. No new columns, no responsive redesign, no sort/filter.
- Not adding e2e Playwright coverage (test-plan §7 does not require it for S-02; if added later, use the `/10x-e2e` skill).
- Not adding a Vitest unit suite for the new schemas beyond what the column-scope integration tests already cover.
- Not seeding `archived_at` on existing rows -- the column is nullable, default null.
- Not adding pagination / search to `/topics` or `/formats`. v1 lists everything.
- Not building a "soft prompt to add your first topic" on `/session/new`. The Topic select with an empty list is itself the prompt; users can navigate to `/topics` from the Topbar.

## Implementation Approach

Seven phases, each independently verifiable:

1. Database first (migration + pgTAP + types).
2. Widen the existing POST `/api/sessions` -- smallest API change, smallest blast radius.
3. Topics customization end-to-end (API + management page + nav).
4. Material formats customization end-to-end (API with seeded-row protection + management page + nav).
5. Pre-session pickers wired to the now-stable APIs.
6. Dashboard chip surface.
7. Production deploy -- push migration to prod and regenerate committed types from prod so the smoke `diff` gate stays green on merge.

Topic + format customization come BEFORE pickers so a user testing manually has rows to pick from in phase 5. Dashboard comes last because it's a read-side polish that adds no behavior. Production deploy is split into its own phase because it has a strict ordering requirement (push migration BEFORE merge) and runs on the operator's machine, not in CI -- treating it as a phase makes that boundary visible instead of buried in a manual-verification bullet.

## Critical Implementation Details

- **Seeded-format protection is RLS-only.** The PATCH `/api/material-formats/[id]` route should NOT add an app-layer `owner_id IS NOT NULL` check -- it would create a divergence from how cross-user denial is handled elsewhere. Trust RLS: `WHERE id = :id AND owner_id = auth.uid()` (implicit via policy) returns 0 rows for both cross-user PATCH and NULL-owner PATCH; both collapse to 409.
- **PostgREST embed naming.** The dashboard `.select` uses the aliases `topic:topics(name)` and `material_format:material_formats(name)`. The aliases matter -- without them, the embedded objects would be keyed `topics` / `material_formats` (plural), which reads wrong on a single-row context.
- **Topic / format dropdowns use `null` for "no selection".** Send `null` (not omit the field, not empty string) so the server gets the same shape whether the user selected or skipped. The zod schema accepts `.nullable().optional()`; the `.insert({...})` writes `parsed.data.topic_id ?? null`. **Radix Select detail**: `<SelectItem>` rejects an empty-string `value`, so the "No topic" / "No format" item uses a sentinel string (`"__none__"`); React state is `string | null` and translates the sentinel to `null` at the `onValueChange` boundary; the POST body sends `topicId ?? null`.

## Phase 1: Schema migration + RLS tests + types regen

### Overview

Add `archived_at timestamptz NULL` to both `public.topics` and `public.material_formats`. Add partial indexes scoped to non-archived rows for picker queries. Extend pgTAP coverage. Regenerate `src/db/database.types.ts`.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql`

**Intent**: Add nullable `archived_at` to both lookup tables and create partial indexes on `(owner_id) WHERE archived_at IS NULL` for the picker hot path.

**Contract**: Two `ALTER TABLE ... ADD COLUMN archived_at timestamptz NULL;` statements and two `CREATE INDEX ... ON ... (owner_id) WHERE archived_at IS NULL;` statements. No RLS changes -- existing `*_update_own` policies cover archive (it's an UPDATE on an owned row). No data backfill -- column defaults null.

#### 2. Extend `rls_topics.sql`

**File**: `supabase/tests/rls_topics.sql`

**Intent**: Add assertions that owners can set / clear `archived_at` on their own topic, that cross-user `archived_at` UPDATE affects 0 rows, and that anon cannot UPDATE `archived_at`. Bump `plan(N)` accordingly.

**Contract**: 3 new assertions appended to the existing pattern (CTE + `RETURNING id` + `is(count(*)::int, ...)`). Re-use the existing User A / User B / anon scaffolding -- do not add new test users.

#### 3. Extend `rls_material_formats.sql`

**File**: `supabase/tests/rls_material_formats.sql`

**Intent**: Symmetric coverage to topics: owner can UPDATE `archived_at` on their own row; cross-user denial; **NULL-owner seeded row cannot have `archived_at` set** (this is the seeded-format-protection regression).

**Contract**: 3 new assertions added to the existing file's plan. The seeded-row assertion uses a CTE-counted UPDATE on one of the existing NULL-owner format ids; `is(count(*)::int, 0, ...)`.

#### 4. Regenerate types

**File**: `src/db/database.types.ts`

**Intent**: After applying the migration locally, run `npm run db:types` and commit the regenerated file. `topics` and `material_formats` Row / Insert / Update types gain `archived_at: string | null` (Insert / Update optional).

**Contract**: Mechanical regen -- do not hand-edit the file.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npm run db:reset`
- pgTAP suite passes: `npm run db:test`
- Types regen produces no other unintended diff: `npm run db:types` followed by a clean `git diff` on unrelated files
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- In Supabase Studio (`http://localhost:54323`), confirm `topics.archived_at` and `material_formats.archived_at` columns exist, are nullable, and have no default.
- Confirm the partial indexes exist via `\d+ public.topics` / `\d+ public.material_formats` (or Studio's index UI).
- Spot-check that a manual UPDATE on a NULL-owner format from a logged-in user account fails or is filtered out by RLS (via the SQL editor as an authenticated role).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the schema looks right in Studio before proceeding to API work.

---

## Phase 2: Widen POST `/api/sessions`

### Overview

Allow the existing session-creation endpoint to accept optional `topic_id` and `material_format_id`. Smallest possible API change. No other endpoint changes in this phase.

### Changes Required:

#### 1. Widen `createSessionSchema`

**File**: `src/lib/schemas/session.ts`

**Intent**: Add `topic_id` and `material_format_id` as optional, nullable UUIDs on `createSessionSchema`. Keep `endSessionSchema` untouched -- L-01 contract on PATCH must not change.

**Contract**:

```ts
export const createSessionSchema = z.object({
  energy_level: z.enum(["low", "medium", "high"], { message: "energy_level must be low, medium, or high" }),
  topic_id: z.uuid({ message: "topic_id must be a valid UUID" }).nullable().optional(),
  material_format_id: z.uuid({ message: "material_format_id must be a valid UUID" }).nullable().optional(),
});
```

Default-strip on `z.object` (L-01 layer 1) preserved.

#### 2. Extend POST `/api/sessions`

**File**: `src/pages/api/sessions/index.ts`

**Intent**: Pass the two new fields into the hand-picked `.insert({...})`. Do not spread `parsed.data`. Convert missing / undefined to explicit `null`.

**Contract**: Add `topic_id: parsed.data.topic_id ?? null` and `material_format_id: parsed.data.material_format_id ?? null` to the existing `.insert({...})` object. Everything else stays identical (skeleton at [sessions/index.ts:8-38](../../../src/pages/api/sessions/index.ts#L8-L38)).

#### 3. Integration tests

**File**: `tests/integration/api/sessions.create.test.ts`

**Intent**: Extend the existing column-scope template ([line 21-38](../../../tests/integration/api/sessions.create.test.ts#L21-L38)) with three new assertions: (a) `topic_id` from body lands on the row; (b) `material_format_id` from body lands on the row; (c) extra unknown keys (`note`, `focus_rating`, `ended_at`, spurious `user_id`) are stripped -- the existing server-stamps-user_id test already covers part of (c); add the others. Use `setupTwoUsers()` + `readSession(id)` fixtures.

**Contract**: New `it(...)` blocks under the existing `describe`. Each writes a real topic / format row (as service role) before POSTing.

### Success Criteria:

#### Automated Verification:

- All session.create integration tests pass: `npm run test -- sessions.create`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `curl`-equivalent POST to `/api/sessions` with `{ energy_level, topic_id, material_format_id }` returns 201 and the row in Studio has the FKs set.
- POST with bogus topic_id (valid UUID, no row) returns 500 with FK-violation (acceptable -- the topics CRUD UI will only emit known IDs); confirm the error is reasonable.
- POST with `topic_id` and `material_format_id` both omitted still returns 201 (back-compat with S-01 client).

##### Commands

**Prerequisites** (in order):

1. `npm run dev` running
2. Sign in at `http://localhost:4321/auth/signin`
3. DevTools -> Application -> Cookies -> copy the full value of `sb-localhost-auth-token`
4. In Studio (`http://localhost:54323`) run these two SQL queries and note the UUIDs:

```sql
-- get a seeded material_format id
SELECT id, name FROM material_formats WHERE owner_id IS NULL LIMIT 1;

-- create a topic for your user and get its id
-- replace <YOUR_USER_ID> with your id from auth.users table
INSERT INTO topics (owner_id, name)
VALUES ('<YOUR_USER_ID>', 'Manual test topic')
RETURNING id;
```

**Check 2.4** -- both FKs written to the row:

```powershell
# Replace the three <...> placeholders before running
$cookie  = "sb-localhost-auth-token=<PASTE_COOKIE_VALUE>"
$topicId = "<PASTE_TOPIC_UUID>"
$fmtId   = "<PASTE_FORMAT_UUID>"

# Pipe body via stdin (@-) -- avoids PowerShell 5.1 native-exe double-quote corruption.
# Cookie header works fine with curl.exe; Invoke-RestMethod silently drops it (restricted header).
$b24 = '{"energy_level":"medium","topic_id":"' + $topicId + '","material_format_id":"' + $fmtId + '"}'
$b24 | curl.exe -s -X POST http://localhost:4321/api/sessions -H "Cookie: $cookie" -H "Content-Type: application/json" --data-binary "@-"
# Expected: {"id":"...","started_at":"..."}  HTTP 201
# Verify in Studio: sessions row has topic_id and material_format_id set to the UUIDs above
```

**Check 2.5** -- bogus topic_id triggers FK violation:

```powershell
$b25 = '{"energy_level":"low","topic_id":"00000000-0000-0000-0000-000000000000"}'
$b25 | curl.exe -s -X POST http://localhost:4321/api/sessions -H "Cookie: $cookie" -H "Content-Type: application/json" --data-binary "@-"
# Expected: {"error":"..."} HTTP 500 mentioning FK violation or foreign key constraint
```

**Check 2.6** -- omitting FKs still returns 201 (back-compat):

```powershell
$b26 = '{"energy_level":"high"}'
$b26 | curl.exe -s -X POST http://localhost:4321/api/sessions -H "Cookie: $cookie" -H "Content-Type: application/json" --data-binary "@-"
# Expected: {"id":"...","started_at":"..."}  HTTP 201
# Verify in Studio: topic_id and material_format_id are NULL on this row
```

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the topic customization phase.

---

## Phase 3: Topic customization (API + `/topics` page)

### Overview

Build the topics CRUD API and the management page end-to-end. Empty state on the page is mandatory -- topics ships with zero rows.

### Changes Required:

#### 1. Topic zod schemas

**File**: `src/lib/schemas/topic.ts` (new)

**Intent**: Centralize topic write contracts.

**Contract**:

```ts
export const createTopicSchema = z.object({ name: z.string().trim().min(1, "name is required").max(100, "name too long") });
export const updateTopicSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100, "name too long").optional(),
  archived_at: z.iso.datetime({ message: "archived_at must be a valid ISO-8601 datetime" }).nullable().optional(),
});
```

`updateTopicSchema` covers both rename and archive (set `archived_at`) and unarchive (set null) on the same endpoint.

#### 2. POST + GET `/api/topics`

**File**: `src/pages/api/topics/index.ts` (new)

**Intent**: POST creates a topic owned by the current user. GET lists the current user's topics (non-archived) plus any NULL-owner default topics (none today). Follow the [sessions/index.ts](../../../src/pages/api/sessions/index.ts) skeleton verbatim: `prerender = false`, 401 guard, 500-on-no-supabase guard, `parseJson`, hand-picked `.insert({ owner_id: user.id, name })` -- never spread.

**Contract**: POST returns `{ id, name, archived_at: null }` 201. GET returns `{ topics: Array<{ id, name, archived_at }> }` 200 -- a single shape with no query parameters, mirroring `GET /api/material-formats`. Order GET by `name` ascending. Both the management page and the pre-session picker filter `archived_at IS NULL` client-side; the server returns everything the user owns. **Duplicate-name handling**: if Supabase returns `error.code === "23505"` (the `UNIQUE (owner_id, name)` index), respond `Response.json({ error: "A topic with that name already exists" }, { status: 409 })` instead of letting it surface as a generic 500.

#### 3. PATCH `/api/topics/[id]`

**File**: `src/pages/api/topics/[id].ts` (new)

**Intent**: Rename or archive (or unarchive) the user's own topic. Cross-user PATCH collapses to 409 byte-identical with not-found.

**Contract**: Follow the [sessions/[id].ts](../../../src/pages/api/sessions/[id].ts) skeleton: 401 → 500 → `parseJson(updateTopicSchema)` → `.update({ name?: ..., archived_at?: ... }).eq("id", id).eq("owner_id", user.id).select("id").maybeSingle()`. If `data` is null → `Response.json({ error: "Topic not found" }, { status: 409 })`. Reject empty body (both fields omitted) at the schema layer with a `.refine` that requires at least one of `name` / `archived_at`. **Duplicate-name handling**: a rename that collides with another of the user's own topics surfaces as `error.code === "23505"`; respond 409 with `{ error: "A topic with that name already exists" }` instead of a generic 500.

#### 4. Topbar nav link

**File**: `src/components/Topbar.astro`

**Intent**: Add `<a href="/topics">Topics</a>` as a sibling of the Dashboard link.

**Contract**: Same styling and ordering pattern as the existing Dashboard link at [Topbar.astro:19-22](../../../src/components/Topbar.astro#L19-L22).

#### 5. Add `"/topics/"` to `PROTECTED_ROUTES`

**File**: `src/middleware.ts`

**Intent**: Authenticated-only access to the management page.

**Contract**: Append `"/topics"` (no trailing slash, matching the existing `/dashboard` entry -- `/topics` is a top-level page) to the `PROTECTED_ROUTES` array.

#### 6. Install shadcn primitives

**Command (run once)**: `npx shadcn@latest add input label dialog`

**Intent**: Bring in the primitives the management page needs. Delete `node_modules/.vite/` and restart dev after the install (L-04).

**Contract**: Three new files under `src/components/ui/`. No other changes.

#### 7. `/topics` management page

**File**: `src/pages/topics/index.astro` (new) + supporting React island `src/components/topics/TopicManager.tsx` (new)

**Intent**: SSR page wrapped in `<Layout>` mounts a `<TopicManager client:load />` island. The island owns: list of topics (fetched via `GET /api/topics` on mount), Add button → `<Dialog>` with name `<Input>` + Save → `POST /api/topics`, per-row Rename (inline edit or dialog) → `PATCH /api/topics/[id]` with `{ name }`, per-row Archive button → `PATCH` with `{ archived_at: new Date().toISOString() }`, Unarchive on archived rows → `PATCH` with `{ archived_at: null }`. Empty state: heading + body copy + the Add button as primary CTA. Archived topics live in a collapsible section beneath active topics.

**Contract**: The island manages local state for the list, optimistically updates on PATCH, and reverts on error. Error messages render via the existing [`ServerError`](../../../src/components/auth/ServerError.tsx) pattern. Use `cn()` from [`@/lib/utils`](../../../src/lib/utils.ts) for class merging.

#### 8. Integration tests for topics API

**File**: `tests/integration/api/topics.create.test.ts` (new) and `tests/integration/api/topics.update.test.ts` (new)

**Intent**: Column-scope regression on POST: spurious `owner_id` in the body is ignored; `name` lands; over-long `name` (101 chars) → 400; empty body → 400; **duplicate name (POST a second topic with an already-used name for the same user) → 409**. Cross-user PATCH → 409 byte-identical with not-found. Archive flow: PATCH `{ archived_at: <iso> }` sets the column. Unarchive flow: PATCH `{ archived_at: null }` clears it. **Rename-collision PATCH (rename topic A to topic B's name for the same user) → 409.**

**Contract**: New files under `tests/integration/api/`, following the existing `sessions.create.test.ts` / `sessions.end.test.ts` structure. Use `setupTwoUsers()` + a new `readTopic(id)` helper added to `tests/_fixtures/db.ts`.

#### 9. `readTopic` fixture helper

**File**: `tests/_fixtures/db.ts`

**Intent**: Mirror the existing `readSession(id)` helper for ground-truth assertions.

**Contract**: `export async function readTopic(id: string): Promise<TopicsRow | null>` using the service-role client.

### Success Criteria:

#### Automated Verification:

- All topic integration tests pass: `npm run test -- topics`
- Existing tests still pass: `npm run test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Logged-out visit to `/topics` redirects to signin (via middleware).
- Logged-in fresh-account visit to `/topics` shows empty state with Add CTA.
- Add a topic, see it appear; rename it, see the updated name; archive it, see it move to archived section; unarchive, see it return to active.
- Try a second account: their `/topics` page is empty -- no leak from the first account.
- Topbar shows the Topics link on every authed page.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to material formats.

---

## Phase 4: Material format customization (API + `/formats` page)

### Overview

Same shape as Phase 3 for material formats, with two differences: (a) GET returns seeded NULL-owner rows AND the user's own rows, (b) seeded rows are not editable / archivable -- RLS already enforces this; the UI surfaces it by omitting affordances on seeded rows.

### Changes Required:

#### 1. Material format zod schemas

**File**: `src/lib/schemas/material-format.ts` (new)

**Intent**: Symmetric to topic schemas.

**Contract**: `createMaterialFormatSchema = z.object({ name: z.string().trim().min(1).max(100) })` and `updateMaterialFormatSchema` with optional `name` + optional nullable `archived_at`, plus a `.refine` requiring at least one field.

#### 2. POST + GET `/api/material-formats`

**File**: `src/pages/api/material-formats/index.ts` (new)

**Intent**: POST creates a user-owned format (mirrors topics POST). GET returns seeded NULL-owner rows AND the current user's rows -- the RLS select policy `material_formats_select_own_or_default` already does this for us.

**Contract**: GET returns `{ formats: Array<{ id, name, owner_id, archived_at }> }`. Include `owner_id` so the management page can distinguish seeded (null) from user-owned (current user) rows and gate affordances accordingly. Order by `name` ascending. **Duplicate-name handling on POST**: if Supabase returns `error.code === "23505"`, respond 409 with `{ error: "A format with that name already exists" }` instead of letting it surface as a generic 500.

#### 3. PATCH `/api/material-formats/[id]`

**File**: `src/pages/api/material-formats/[id].ts` (new)

**Intent**: Rename / archive / unarchive a user-owned format. PATCH on a seeded NULL-owner row → 409 (RLS UPDATE policy denies via `owner_id = (SELECT auth.uid())`, the `.update(...).select("id").maybeSingle()` returns null, which collapses to 409).

**Contract**: Skeleton identical to PATCH `/api/topics/[id]`, including the `23505 → 409 "A format with that name already exists"` duplicate-name handler for renames. No app-layer seeded-row guard -- trust RLS. Cross-user PATCH and NULL-owner PATCH BOTH return 409 with `{ error: "Material format not found" }` byte-identically.

#### 4. Add `"/formats/"` to `PROTECTED_ROUTES`

**File**: `src/middleware.ts`

**Intent**: Authenticated-only access to `/formats`.

**Contract**: Append `"/formats"` (no trailing slash, matching the existing `/dashboard` entry -- `/formats` is a top-level page) to the array.

#### 5. Topbar nav link

**File**: `src/components/Topbar.astro`

**Intent**: Add `<a href="/formats">Formats</a>` as a sibling of Topics.

**Contract**: Same pattern as the Topics link added in Phase 3.

#### 6. `/formats` management page

**File**: `src/pages/formats/index.astro` (new) + `src/components/material-formats/MaterialFormatManager.tsx` (new)

**Intent**: SSR page mounts `<MaterialFormatManager client:load />`. The island fetches `GET /api/material-formats`, splits the result into Seeded (owner_id null) and Yours (owner_id == current user id, non-archived) and Archived (owner_id == current user, archived). Seeded rows render as a non-interactive list (name + a "Built-in" badge -- no rename or archive affordances). The Add / Rename / Archive flow is identical to topics.

**Contract**: Re-use the modal + input + label primitives installed in Phase 3 -- do NOT re-install. The component does NOT need to know the current user id explicitly -- treat `owner_id IS NULL` as the seeded marker. Empty Yours section is fine (no empty-state CTA needed because seeded formats are always present); show a small helper line: "Most users stick with the built-ins. Add a custom format if none of them fit."

#### 7. Integration tests for material formats API

**File**: `tests/integration/api/material-formats.create.test.ts` (new) and `tests/integration/api/material-formats.update.test.ts` (new)

**Intent**: Column-scope regression on POST + cross-user PATCH 409 + seeded-row PATCH 409 (the seeded-format-protection regression test) + **duplicate-name POST 409** + **rename-collision PATCH 409**. Archive / unarchive happy paths.

**Contract**: Mirror the topics test files. Use one of the existing seeded format ids (read from DB in setup) for the seeded-row PATCH test. Add `readMaterialFormat(id)` to `tests/_fixtures/db.ts`.

### Success Criteria:

#### Automated Verification:

- All material-formats integration tests pass: `npm run test -- material-formats`
- Existing tests still pass: `npm run test`
- pgTAP still passes: `npm run db:test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Logged-out visit to `/formats` redirects to signin.
- Logged-in visit to `/formats` shows the 5 seeded rows as Built-in (no rename / archive), an empty Yours section, and the Add CTA.
- Add a custom format, rename it, archive it, unarchive it.
- Try to rename a seeded row via DevTools forging a PATCH -- response is 409, row unchanged in Studio.
- Second account does not see the first account's custom formats; both see the same 5 seeded rows.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before wiring the pickers.

---

## Phase 5: Pre-session screen pickers

### Overview

Add a Topic dropdown and a Material format dropdown to the existing pre-session form, between the energy row and the Start button. Both default to no selection.

### Changes Required:

#### 1. Install shadcn Select

**Command (run once)**: `npx shadcn@latest add select`

**Intent**: Bring in the Select primitive. Delete `node_modules/.vite/` and restart dev after install (L-04).

**Contract**: One new file at `src/components/ui/select.tsx`. No other changes.

#### 2. Extend `EnergyPicker.tsx` (consider renaming to `PreSessionForm.tsx`)

**File**: `src/components/session/EnergyPicker.tsx`

**Intent**: Hold local state for `topicId: string | null` and `materialFormatId: string | null`. On mount, fetch `GET /api/topics` and `GET /api/material-formats` (both return the user-visible rows with `archived_at`), then filter each response client-side to `archived_at IS NULL` before rendering. Render two `<Select>`s between the existing energy button row and the existing ServerError + Start button. Each has a "No topic" / "No format" first option. Include the two ids in the POST body (always send, as `null` when not selected). The submit handler logic, audio prime, and navigation stay untouched.

**Contract**: Two new fetches in a single `useEffect` (or one combined endpoint call if desired -- but the API surfaces separate endpoints). Selects use `aria-label` for accessibility. The Start button's disabled condition stays `energy === null || submitting` -- topic and format are optional, so they do not gate Start. Style the selects to match the dark theme (`bg-ember text-off-white border-charred` for the trigger; same family as the energy button inactive state).

**Critical**: when the user has never visited `/topics`, the topic list is empty. The Select still renders with just the "No topic" option. Do NOT show an inline link to `/topics` here -- the Topbar already exposes it; an inline nudge would clutter the 3-tap flow.

#### 3. Add `aria-label` regression check

**File**: existing test infrastructure -- no new file needed.

**Intent**: The form's existing test coverage is minimal; we are not adding Vitest unit coverage for this UI change (per test-plan §7, UI assertions on Tailwind classes are forbidden). Manual verification covers the picker behavior.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Existing session.create integration tests still pass (the POST shape is now strictly wider; sending the same body as before still works).

#### Manual Verification:

- Visit `/session/new` as a user with one topic and zero custom formats: see energy buttons, Topic select with "No topic" + "My Topic", Format select with "No format" + 5 seeded names. Start is disabled until energy is picked; topic / format do not gate Start.
- Tap "Start session" (tap 1) → tap energy (tap 2) → tap Start (tap 3). Total 3 taps; session lands with topic_id = null, material_format_id = null. Verify in Studio.
- Tap energy → pick a topic → pick a format → Start: session lands with both FKs set. Verify in Studio.
- Refresh the page, verify state is reset (no stale selection).
- Visit as a user with an archived topic: archived topic is NOT in the Select.

**Implementation Note**: After completing this phase, pause here for manual confirmation that the 3-tap budget is intact and the pickers feel right before dashboard surface work.

---

## Phase 6: Dashboard surface

### Overview

Widen the dashboard `.select` to embed topic and material format names, and render a chip line below the date on rows where either is set.

### Changes Required:

#### 1. Widen the SSR `.select`

**File**: `src/pages/dashboard.astro`

**Intent**: Pull topic and material format names alongside each session via PostgREST embeds.

**Contract**: Change the `.select(...)` argument at [dashboard.astro:28](../../../src/pages/dashboard.astro#L28) to:

```ts
.select("id, started_at, energy_level, duration_seconds, focus_rating, ended_at, topic:topics(name), material_format:material_formats(name)")
```

The aliases (`topic:`, `material_format:`) keep the embedded keys singular. RLS on `topics` and `material_formats` allows the user to see their own + NULL-owner rows -- which covers (a) seeded formats and (b) the user's own (including archived) topics and formats. So archived rows still surface their name on past sessions, satisfying the archive-keep-on-history decision.

#### 2. Widen the `SessionRow` Pick type

**File**: `src/pages/dashboard.astro`

**Intent**: Type the embedded objects.

**Contract**: Replace the `Pick<SessionRow, ...>` with a hand-typed shape that adds `topic: { name: string } | null; material_format: { name: string } | null;`. Reuse the existing `Pick<...>` for the scalar fields. The query result will conform when `database.types.ts` is regenerated from Phase 1.

#### 3. Render chip line

**File**: `src/pages/dashboard.astro` (template region around [line 105-126](../../../src/pages/dashboard.astro#L105-L126))

**Intent**: Below the existing date / energy line, render a third line of small chips for topic and format. Hide the line when both are null.

**Contract**: Conditional `{(session.topic !== null || session.material_format !== null) && ( ... )}` block that renders one or two small spans. Style as `bg-charred text-off-white/80 rounded px-2 py-0.5 text-xs`. Truncate long names with `max-w-[10rem] truncate` + `title={name}`. No new chip primitive -- inline spans only.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Dashboard renders sessions with topic + format chips on rows where they're set.
- Sessions with no topic / format render the original two lines (no extra empty chip row).
- A session whose topic was later archived still shows the topic name on its history row.
- Truncation works on a long topic name (test by manually inserting a 60-char topic via the management page and creating a session with it).
- Mobile width: chips wrap to a second line or truncate gracefully (no horizontal scroll on the row).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation. After human sign-off, proceed to Phase 7 (production deploy) BEFORE merging the PR -- the prod migration must land first so the smoke `diff` gate stays green on the merge commit.

---

## Phase 7: Production deploy

### Overview

Apply the Phase 1 migration to the production Supabase project and reconcile the committed `src/db/database.types.ts` against prod's actual schema BEFORE merging the PR. This is operator work executed locally against prod, not CI. Order matters: the `.github/workflows/smoke.yml` workflow auto-fires on push to `main` and runs `diff src/db/database.types.ts /tmp/types_from_prod.ts`; if prod doesn't have `archived_at` yet, the merge commit goes red.

The smoke script itself is NOT updated -- the new columns are nullable, the existing `{ user_id, energy_level, started_at }` insert keeps passing, and the `diff` gate already proves the columns exist on prod.

### Prerequisites

- Operator has the `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` env vars available locally (the same values held by GitHub Actions secrets per the [testing-schema-validation-gate runbook](../../archive/2026-06-24-testing-schema-validation-gate/runbook.md) sections 1-2).
- Operator is logged into the Supabase CLI (`npx supabase login`, or `SUPABASE_ACCESS_TOKEN` exported).
- Local repo is on the feature branch with all six prior phases merged into the branch and pushed to the PR.

### Changes Required:

#### 1. Link the local CLI to the prod project (one-time per machine)

**Command**: `npx supabase link --project-ref <prod-ref>`

**Intent**: Tell the local CLI which remote project subsequent `db push` commands target. Idempotent -- safe to re-run.

**Contract**: Operator-only step. No file changes. If a prior change already linked this machine, skip.

#### 2. Push the migration to prod

**Command**: `npx supabase db push`

**Intent**: Apply `supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql` to the production database. Additive + nullable, so zero-downtime and safe to run while the existing app code is still live.

**Contract**: The CLI prints the pending migration filename and asks for confirmation. Confirm. Operator-only step; no file changes in the repo.

#### 3. Regenerate committed types from prod

**Command**: `npm run db:types:prod`

**Intent**: Rewrite `src/db/database.types.ts` against the now-migrated prod schema using the pinned CLI version, so the smoke `diff` gate has zero output on the merge commit.

**Contract**: Most runs produce **no diff** versus the file Phase 1 already committed (local and prod schemas converge once the push completes). If there IS a diff -- e.g., differing index metadata, formatting drift from a CLI version mismatch -- inspect it. Drift in unrelated tables is a signal to investigate before merging, not to commit-and-hope. CLI-version drift is handled per the [runbook section 7](../../archive/2026-06-24-testing-schema-validation-gate/runbook.md).

#### 4. Commit any regen diff and push the branch

**Files**: `src/db/database.types.ts` (only if Phase 7.3 produced changes).

**Intent**: Keep the branch state synchronized with prod before merge.

**Contract**: One commit on the feature branch: `chore(db): sync types with prod after migration push`. If Phase 7.3 produced no diff, skip the commit.

### Success Criteria:

#### Automated Verification:

- `npm run db:types:prod` exits 0
- `git diff src/db/database.types.ts` is clean after regen + commit
- After merging the PR, the `Smoke` workflow run on the merge commit succeeds (both the `Diff types against committed file` step and the `Run session smoke test` step go green)

#### Manual Verification:

- In Supabase Studio for the **production** project, confirm `topics.archived_at` and `material_formats.archived_at` columns exist, are nullable, and have no default
- Confirm the partial indexes exist on prod (Studio's index UI or the SQL editor: `\d+ public.topics` / `\d+ public.material_formats`)
- After merge, visit `https://pomo-sapiens.com/topics` and `/formats` as a real account and run one smoke loop: add a topic, pick it on `/session/new`, verify it appears as a chip on `/dashboard`. End-to-end prod smoke.
- Confirm the smoke workflow's previous run (last green before this slice) and the post-merge run both show "smoke OK" in the `Run session smoke test` step

**Implementation Note**: Phase 7.1-7.3 happen on the feature branch BEFORE the PR is merged. Only after `db:types:prod` produces a clean diff (or the resulting commit is pushed) should the PR be merged. If the merge-commit smoke run goes red on the `diff` step, do NOT roll back the migration -- prod schema is already ahead and additive; instead, regenerate types from prod again, commit, and push a follow-up to `main`.

---

## Testing Strategy

### pgTAP (Phase 1):

- `archived_at` SELECT / UPDATE per owner on `topics`
- `archived_at` SELECT / UPDATE per owner on `material_formats`
- NULL-owner seeded `material_formats` row cannot be updated by any authenticated user

### Integration tests (Vitest + @cloudflare/vitest-pool-workers):

- POST `/api/sessions` widening: extra body keys stripped; `topic_id` / `material_format_id` land
- POST `/api/topics`: column-scope; `owner_id` from body ignored; name validation; empty body 400
- PATCH `/api/topics/[id]`: rename, archive, unarchive; cross-user PATCH 409 byte-identical with not-found
- POST `/api/material-formats`: column-scope
- PATCH `/api/material-formats/[id]`: rename, archive, unarchive; cross-user PATCH 409; **seeded-row PATCH 409 (regression test)**

### Manual testing steps:

1. Apply migration; verify `archived_at` columns and partial indexes in Studio.
2. Fresh-account walkthrough: `/topics` empty state → add → rename → archive → unarchive.
3. `/formats` walkthrough: see 5 seeded as Built-in → add custom → rename → archive → DevTools forge PATCH on seeded → 409.
4. `/session/new` 3-tap flow with both pickers ignored; verify NULL FKs in Studio.
5. `/session/new` full flow with both pickers used; verify FKs set in Studio.
6. Dashboard with mixed sessions (some with categories, some without); verify chip line conditional rendering.
7. Archive a topic, then visit dashboard -- the topic name still appears on its historical session row.
8. Cross-account check: second account's topics / custom formats are isolated; seeded formats shared.

## Performance Considerations

- Two new picker fetches on `/session/new` mount add ~2 round-trips. Both are tiny RLS-scoped queries (small result set per user, partial-index covered). No prefetch needed for v1.
- Dashboard `.select` adds two LEFT JOINs via PostgREST. With the existing `LIMIT 50`, this stays cheap.
- The partial indexes `(owner_id) WHERE archived_at IS NULL` cover the picker hot path; the unindexed full-table scan in the management page GET is fine because per-user row counts are small.

## Migration Notes

- Migration is additive and nullable -- zero-downtime, no backfill, safe to deploy without coordinating with the running S-01 traffic.
- The S-01 smoke insert script ([scripts/smoke-session-write.mjs](../../../scripts/smoke-session-write.mjs)) only writes `{ user_id, energy_level, started_at }` -- still works after this slice because the new columns are nullable. No smoke-script changes.
- Prod deploy is Phase 7: `npx supabase db push` to prod, then `npm run db:types:prod` to reconcile committed types, BEFORE merging the PR. The smoke `diff` gate auto-runs on push to `main` and requires prod and the committed `database.types.ts` to match exactly.

## References

- Research: [context/changes/categorize-sessions-topic-format/research.md](./research.md)
- Roadmap entry: [context/foundation/roadmap.md:97-108](../../foundation/roadmap.md#L97-L108) (Note: line 107's "additive sessions schema changes" is stale -- F-01 shipped them.)
- PRD refs: FR-007, FR-008, FR-017 ([context/foundation/prd.md](../../foundation/prd.md))
- Lessons: [L-01 column-scope, L-04 shadcn install](../../foundation/lessons.md)
- F-01 plan (schema rationale): [context/archive/2026-05-29-sessions-data-foundation/plan.md](../../archive/2026-05-29-sessions-data-foundation/plan.md)
- S-01 plan (EnergyPicker pattern, 3-tap budget, PROTECTED_ROUTES rule): [context/archive/2026-06-19-first-session-capture-loop/plan.md](../../archive/2026-06-19-first-session-capture-loop/plan.md)
- Testing schema-validation-gate runbook (db:types:prod): [context/archive/2026-06-24-testing-schema-validation-gate/runbook.md](../../archive/2026-06-24-testing-schema-validation-gate/runbook.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` -- <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema migration + RLS tests + types regen

#### Automated

- [x] 1.1 Migration applies cleanly: `npm run db:reset` -- 4b1c3b0
- [x] 1.2 pgTAP suite passes: `npm run db:test` -- 4b1c3b0
- [x] 1.3 Types regen produces no other unintended diff: `npm run db:types` followed by a clean `git diff` on unrelated files -- 4b1c3b0
- [x] 1.4 Lint passes: `npm run lint` -- 4b1c3b0
- [x] 1.5 Build passes: `npm run build` -- 4b1c3b0

#### Manual

- [x] 1.6 In Supabase Studio, confirm `topics.archived_at` and `material_formats.archived_at` columns exist, are nullable, and have no default -- 4b1c3b0
- [x] 1.7 Confirm the partial indexes exist via `\d+` or Studio's index UI -- 4b1c3b0
- [x] 1.8 Spot-check that a manual UPDATE on a NULL-owner format from a logged-in user account fails or is filtered out by RLS -- 4b1c3b0

### Phase 2: Widen POST `/api/sessions`

#### Automated

- [x] 2.1 All session.create integration tests pass: `npm run test -- sessions.create`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Build passes: `npm run build`

#### Manual

- [x] 2.4 POST to `/api/sessions` with `{ energy_level, topic_id, material_format_id }` returns 201 and the row in Studio has the FKs set
- [x] 2.5 POST with bogus topic_id (valid UUID, no row) returns 500 with FK-violation; confirm the error is reasonable
- [x] 2.6 POST with `topic_id` and `material_format_id` both omitted still returns 201

### Phase 3: Topic customization (API + `/topics` page)

#### Automated

- [ ] 3.1 All topic integration tests pass: `npm run test -- topics`
- [ ] 3.2 Existing tests still pass: `npm run test`
- [ ] 3.3 Lint passes: `npm run lint`
- [ ] 3.4 Build passes: `npm run build`

#### Manual

- [ ] 3.5 Logged-out visit to `/topics` redirects to signin
- [ ] 3.6 Logged-in fresh-account visit to `/topics` shows empty state with Add CTA
- [ ] 3.7 Add a topic, rename it, archive it, unarchive it -- full flow works
- [ ] 3.8 Second account's `/topics` page is empty -- no leak from the first account
- [ ] 3.9 Topbar shows the Topics link on every authed page

### Phase 4: Material format customization (API + `/formats` page)

#### Automated

- [ ] 4.1 All material-formats integration tests pass: `npm run test -- material-formats`
- [ ] 4.2 Existing tests still pass: `npm run test`
- [ ] 4.3 pgTAP still passes: `npm run db:test`
- [ ] 4.4 Lint passes: `npm run lint`
- [ ] 4.5 Build passes: `npm run build`

#### Manual

- [ ] 4.6 Logged-out visit to `/formats` redirects to signin
- [ ] 4.7 Logged-in visit shows 5 seeded rows as Built-in (no rename / archive affordance), empty Yours, Add CTA
- [ ] 4.8 Add a custom format, rename it, archive it, unarchive it -- full flow works
- [ ] 4.9 Forge a PATCH on a seeded row via DevTools -- response is 409, row unchanged in Studio
- [ ] 4.10 Second account does not see the first account's custom formats; both see the same 5 seeded rows

### Phase 5: Pre-session screen pickers

#### Automated

- [ ] 5.1 Build passes: `npm run build`
- [ ] 5.2 Lint passes: `npm run lint`
- [ ] 5.3 Existing session.create integration tests still pass

#### Manual

- [ ] 5.4 `/session/new` shows energy row, Topic select with "No topic" + user topics, Format select with "No format" + 5 seeded + user formats
- [ ] 5.5 3-tap flow with both pickers ignored: tap link, tap energy, tap Start -- 3 taps total; session lands with NULL FKs
- [ ] 5.6 Full flow with both pickers used: session lands with both FKs set
- [ ] 5.7 Page refresh resets state (no stale selection)
- [ ] 5.8 Archived topic is NOT in the Select

### Phase 6: Dashboard surface

#### Automated

- [ ] 6.1 Build passes: `npm run build`
- [ ] 6.2 Lint passes: `npm run lint`

#### Manual

- [ ] 6.3 Dashboard renders sessions with topic + format chips on rows where they're set
- [ ] 6.4 Sessions with no topic / format render the original two lines (no extra empty chip row)
- [ ] 6.5 A session whose topic was later archived still shows the topic name on its history row
- [ ] 6.6 Truncation works on a long topic name (test with a 60-char topic)
- [ ] 6.7 Mobile width: chips wrap or truncate gracefully (no horizontal scroll)

### Phase 7: Production deploy

#### Automated

- [ ] 7.1 `npm run db:types:prod` exits 0
- [ ] 7.2 `git diff src/db/database.types.ts` is clean after regen + commit
- [ ] 7.3 After merging the PR, the `Smoke` workflow run on the merge commit succeeds (both `Diff types against committed file` and `Run session smoke test` go green)

#### Manual

- [ ] 7.4 In Supabase Studio for the production project, confirm `topics.archived_at` and `material_formats.archived_at` columns exist, are nullable, and have no default
- [ ] 7.5 Confirm the partial indexes exist on prod
- [ ] 7.6 After merge, run an end-to-end prod loop on `https://pomo-sapiens.com`: add a topic on `/topics`, pick it on `/session/new`, verify the chip on `/dashboard`
- [ ] 7.7 Confirm `Run session smoke test` step shows "smoke OK" on the post-merge run
