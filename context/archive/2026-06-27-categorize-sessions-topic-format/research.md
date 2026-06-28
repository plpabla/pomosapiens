---
date: 2026-06-27T00:00:00Z
researcher: pawel
git_commit: c70fc0b6884c4f08f6d3abd2b2482fb002827e56
branch: categorize-sessions-topic-format
repository: pomosapiens
topic: "S-02 -- Categorize sessions by topic and material format (full slice landscape)"
tags: [research, codebase, sessions, topics, material-formats, rls, pre-session, dashboard]
status: complete
last_updated: 2026-06-27
last_updated_by: pawel
---

# Research: S-02 -- Categorize sessions by topic and material format

**Date**: 2026-06-27
**Researcher**: pawel
**Git Commit**: c70fc0b6884c4f08f6d3abd2b2482fb002827e56
**Branch**: categorize-sessions-topic-format
**Repository**: pomosapiens

## Research Question

Map the full landscape S-02 will touch -- current sessions schema/RLS, pre-session screen, dashboard history rendering, API patterns, zod schema patterns -- so the planner can extend everything without rediscovery.

S-02 from [roadmap.md:97-108](../../foundation/roadmap.md#L97-L108):

> User can add / rename / archive their own topics on a management screen, pick a topic on the pre-session screen, and pick a material format (video / reading / writing code / drilling problems / other) for the session. Both fields remain optional and default to empty.
>
> PRD refs: FR-007 (topic picker), FR-008 (material format picker), FR-017 (topic add/rename/archive).

## Summary

**The schema is already done.** F-01 deliberately shipped `topic_id` and `material_format_id` as nullable FK columns on `sessions`, plus full `topics` and `material_formats` tables with per-user RLS. The roadmap entry that says S-02 needs "Additive schema changes on `sessions` (`topic_id` FK, `material_format` column)" ([roadmap.md:107](../../foundation/roadmap.md#L107)) is **stale** -- it predates F-01's scope expansion. Don't write that migration.

S-02 is therefore three smaller pieces:

1. **One small migration** -- add `archived_at timestamptz NULL` to `public.topics` (per FR-017 "archive"; explicitly deferred from F-01 -- [F-01 plan.md:45](../../archive/2026-05-29-sessions-data-foundation/plan.md#L45)). Extend [supabase/tests/rls_topics.sql](../../../supabase/tests/rls_topics.sql) accordingly.
2. **Backend** -- widen [createSessionSchema](../../../src/lib/schemas/session.ts#L3-L7) to accept optional `topic_id` and `material_format_id`; extend the hand-picked `.insert({...})` in [src/pages/api/sessions/index.ts:22-30](../../../src/pages/api/sessions/index.ts#L22-L30); build a topics CRUD API (`/api/topics` POST/GET; `/api/topics/[id]` PATCH for rename + archive). **Do not** widen `endSessionSchema` -- topic/format are pre-session inputs, not post-session edits; this preserves the L-01 contract on PATCH.
3. **Frontend** -- add two optional pickers to [EnergyPicker.tsx](../../../src/components/session/EnergyPicker.tsx) (or rename to a composite `PreSessionScreen.tsx`); extend the dashboard SSR `.select` ([dashboard.astro:26-31](../../../src/pages/dashboard.astro#L26-L31)) with PostgREST embeds `topics(name), material_formats(name)` and surface in the row template; add a `/topics` management page (probably with an empty-state -- `topics` ships empty by design); update [middleware.ts PROTECTED_ROUTES](../../../src/middleware.ts) with `"/topics/"` (trailing slash, per S-01 plan-review F5).

The 3-tap guardrail ([prd.md:42](../../foundation/prd.md#L42)) stays intact: both new pickers live on the existing single pre-session screen and default to empty, so a user who skips them still hits "Start" as tap 3.

## Detailed Findings

### A. Schema -- already largely in place

#### Sessions table ([supabase/migrations/20260531182506_sessions_data_foundation.sql:80-102](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L80-L102))

```sql
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  duration_seconds integer GENERATED ALWAYS AS (...) STORED,
  energy_level public.energy_level NOT NULL,
  focus_rating smallint NULL CHECK (focus_rating BETWEEN 1 AND 5),
  topic_id uuid NULL REFERENCES public.topics(id) ON DELETE SET NULL,
  material_format_id uuid NULL REFERENCES public.material_formats(id) ON DELETE SET NULL,
  timer_mode text NULL CHECK (...),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- `topic_id` and `material_format_id` are present and nullable.
- `ON DELETE SET NULL` -- sessions outlive their topic/format if either is deleted.
- RLS DELETE on sessions was **dropped** in [migrations/20260601120000_drop_sessions_delete_policy.sql](../../../supabase/migrations/20260601120000_drop_sessions_delete_policy.sql) (sessions are immutable post-creation).

#### Topics table ([same migration:56-74](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L56-L74))

Shape (paraphrased from generated types -- [src/db/database.types.ts:129-152](../../../src/db/database.types.ts#L129-L152)):

```
public.topics:
  id           uuid PK
  owner_id     uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE
  name         text NOT NULL
  created_at   timestamptz default now()
  updated_at   timestamptz default now() (trigger-updated)
```

RLS (lines 151-170 of the F-01 migration):

```sql
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY topics_select_own_or_default ON public.topics
  FOR SELECT TO authenticated
  USING (owner_id IS NULL OR owner_id = (SELECT auth.uid()));

CREATE POLICY topics_insert_own ON public.topics
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY topics_update_own ON public.topics
  FOR UPDATE TO authenticated
  USING  (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY topics_delete_own ON public.topics
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));
```

- `(SELECT auth.uid())` form is non-negotiable (Supabase performance-recommended).
- Default-visibility pattern (`owner_id IS NULL OR owner_id = ...`) exists; topics ships **empty** -- no seeded defaults -- per [F-01 plan.md:41-42](../../archive/2026-05-29-sessions-data-foundation/plan.md#L41-L42). The pattern is in place if S-02 ever wants seeded defaults.

#### Material formats table ([same migration:30-50](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L30-L50))

Identical shape and RLS pattern to topics. Seeded with **5 NULL-owner rows**: Video, Reading, Writing code, Drilling problems, Other ([F-01 plan.md:42](../../archive/2026-05-29-sessions-data-foundation/plan.md#L42)). Visible to all authenticated users via the default-visibility policy.

**Design choice F-01 made beyond strict PRD**: material_format is a lookup table (extensible per-user), not a closed enum. PRD FR-008 reads as closed-vocab; F-01 intentionally opened it ([F-01 plan.md:419](../../archive/2026-05-29-sessions-data-foundation/plan.md#L419)). S-02 must decide whether to expose "add custom format" UI; recommend deferring -- ship picker reading the 5 seeded rows only.

#### Generated types ([src/db/database.types.ts](../../../src/db/database.types.ts))

Already includes `topic_id`, `material_format_id` (nullable) on the sessions Row/Insert/Update types ([lines 66-128](../../../src/db/database.types.ts#L66-L128)) and the full `topics` / `material_formats` types ([lines 42-65, 129-152](../../../src/db/database.types.ts#L42-L65)). Re-run `npm run db:types` after the S-02 migration (when `archived_at` lands).

#### What S-02 needs from schema: add `archived_at` to topics

- F-01 explicitly handed this forward: "`topics` gets `archived_at` per FR-017 ("archive") in S-02, not here." ([F-01 plan.md:45](../../archive/2026-05-29-sessions-data-foundation/plan.md#L45))
- Open semantics question from [roadmap.md:106](../../foundation/roadmap.md#L106): "does an archived topic stay attached to historical sessions but hide from the picker?" -- strongly implied yes. Resolve at plan time.
- Migration shape: `ALTER TABLE public.topics ADD COLUMN archived_at timestamptz NULL;` plus a partial index on `(owner_id) WHERE archived_at IS NULL` for picker queries.
- No RLS change required (archive is a mutation of an owned row -- already covered by `topics_update_own`).

### B. RLS test pattern ([supabase/tests/](../../../supabase/tests/))

Three files exist: `rls_sessions.sql`, `rls_topics.sql`, `rls_material_formats.sql`. Each wraps in `BEGIN ... ROLLBACK`, uses two test users, impersonates via `set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated`, asserts cross-user denial + anon zero-rows.

Representative test (rls_sessions.sql, summary):

- `plan(9)` declares 9 assertions
- INSERT two users with one session each (as service role)
- Switch to user A's JWT, assert SELECT count = 1
- Assert UPDATE/DELETE of user B's row affects 0 rows (CTE + count)
- Assert INSERT with spoofed user_id throws `42501`
- Switch to anon, assert SELECT count = 0 + all writes denied

**S-02 task**: extend `rls_topics.sql` (don't create new file) when `archived_at` lands. Add assertions: user can SELECT their own archived topics, user can UPDATE `archived_at` on own topic, user B cannot. Run `npm run db:test` locally before PR -- **not yet in CI** ([test-plan.md:101-104](../../foundation/test-plan.md)).

### C. API conventions

#### POST /api/sessions ([src/pages/api/sessions/index.ts](../../../src/pages/api/sessions/index.ts))

```ts
export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }
  const parsed = await parseJson(context.request, createSessionSchema);
  if (!parsed.data) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: context.locals.user.id,
      energy_level: parsed.data.energy_level,
      started_at: new Date().toISOString(),
    })
    .select("id, started_at")
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ id: data.id, started_at: data.started_at }, { status: 201 });
};
```

- Skeleton: `prerender = false` → 401 guard → 500 guard on `createClient` → `parseJson(req, schema)` → 400 if `!parsed.data` → hand-picked `.insert({...})` (NEVER spread `parsed.data` -- L-01) → 500 on Supabase error → success JSON.
- `user_id` is server-stamped, never read from body.
- S-02 widens the `.insert({...})` to include `topic_id: parsed.data.topic_id ?? null, material_format_id: parsed.data.material_format_id ?? null`.

#### PATCH /api/sessions/[id] ([src/pages/api/sessions/[id].ts:13-59](../../../src/pages/api/sessions/[id].ts#L13-L59))

- Already locked by L-01: schema is `endSessionSchema` (focus_rating + ended_at only); `.update({ ended_at, focus_rating })` hand-picks; `.is("ended_at", null)` enforces write-once.
- **Do not widen.** S-02 sets topic/material_format on POST only. If post-session editing is requested later, add a separate endpoint rather than mixing concerns.
- Cross-user denial collapsed into 409 (byte-identical body) -- the info-hiding contract is tested ([sessions.end.test.ts:208-261](../../../tests/integration/api/sessions.end.test.ts)).

#### Zod schemas ([src/lib/schemas/session.ts](../../../src/lib/schemas/session.ts))

```ts
export const createSessionSchema = z.object({
  energy_level: z.enum(["low", "medium", "high"], {
    message: "energy_level must be low, medium, or high",
  }),
});

export const endSessionSchema = z.object({
  focus_rating: z.number().int().min(1, "...").max(5, "...").nullable(),
  ended_at: z.iso.datetime({ message: "ended_at must be a valid ISO-8601 datetime" }),
});
```

- Plain `z.object(...)` -- default-strip of unknown keys is **layer 1 of L-01**. Never switch to `.passthrough()`.
- Error message format: `<field>: <message>` (built in [parse-request.ts:5-9](../../../src/lib/parse-request.ts#L5-L9)).
- S-02 additions:
  - Widen `createSessionSchema` with `topic_id: z.uuid().optional().nullable()` and `material_format_id: z.uuid().optional().nullable()`.
  - New `src/lib/schemas/topic.ts` exporting `createTopicSchema = z.object({ name: z.string().trim().min(1).max(100) })` and `updateTopicSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), archived_at: z.iso.datetime().nullable().optional() })`.

#### parse-request helper ([src/lib/parse-request.ts](../../../src/lib/parse-request.ts))

```ts
export type ParseResult<T> = { data: T; error: null } | { data: null; error: string };
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>>;
```

JSON-parse failure → `{ data: null, error: "Invalid JSON body" }`. Zod failure → field-prefixed message.

#### Error response convention

All endpoints respond `{ error: string }` (no `fieldErrors`). Status codes used: 200, 201, 400, 401, 409, 500. **No 403, no 404** -- access-denial collapses into 409 to hide existence.

#### Middleware ([src/middleware.ts](../../../src/middleware.ts))

```ts
const PROTECTED_ROUTES = ["/dashboard", "/session/"];
```

- Prefix match via `startsWith`. **Use trailing slash** for new routes (e.g., `"/topics/"`) per [S-01 plan-review F5](../../archive/2026-06-19-first-session-capture-loop/reviews/plan-review.md) -- avoids greedy matches like `/topics-archive`.
- API routes are NOT covered -- they self-gate with `if (!context.locals.user) return 401` (the JSON-401 pattern; redirects would break fetch callers).
- `context.locals.user` is always set (to `null` when supabase unconfigured), so handlers can rely on the null-check.

### D. Frontend

#### Pre-session screen ([src/pages/session/new.astro](../../../src/pages/session/new.astro) + [src/components/session/EnergyPicker.tsx](../../../src/components/session/EnergyPicker.tsx))

- Page is a thin Astro shell (`<Layout> { <EnergyPicker client:load /> }`).
- `EnergyPicker.tsx` is a React island holding all form state, three energy buttons (`<Button type="button" aria-pressed={...} className={cn(...)}>`), submit handler that primes audio (L-02) and POSTs `{ energy_level }` to `/api/sessions`, then `window.location.assign("/session/" + data.id)`.
- Selected-state styling pattern: `bg-blaze text-off-white border-blaze` (active) vs `bg-ember text-off-white border-charred` (inactive).
- **S-02 composition**: add two more pickers in the same form, BETWEEN the energy row and the submit button. Use the same `aria-pressed` + `cn()` idiom. Keep submit button enabled when only energy is set; both new pickers are optional.
- **3-tap budget** ([prd.md:84](../../foundation/prd.md#L84), [S-01 plan.md:347-349](../../archive/2026-06-19-first-session-capture-loop/plan.md#L347-L349)): tap 1 = "Start session" link; tap 2 = energy button; tap 3 = "Start" button. Adding two optional pickers must NOT make picking them mandatory -- a user can tap 1 → 2 → 3 and ship NULLs.

#### Dashboard history ([src/pages/dashboard.astro:26-31, 99-130](../../../src/pages/dashboard.astro#L26-L31))

Direct SSR Supabase select (not via API):

```ts
const { data, error } = await supabase
  .from("sessions")
  .select("id, started_at, energy_level, duration_seconds, focus_rating, ended_at")
  .eq("user_id", user.id)
  .order("started_at", { ascending: false })
  .limit(50);
```

Row template renders date + energy (color-coded) + duration/status + rating.

**S-02 changes**:

- Widen `.select` to embed FKs via PostgREST: `"id, started_at, energy_level, duration_seconds, focus_rating, ended_at, topic:topics(name), material_format:material_formats(name)"`. The FK names are unambiguous (only one FK per join in the schema).
- The `SessionRow` `Pick<>` type widens accordingly -- nested select returns `topic: { name: string } | null` shape; the `Database` type from `db:types` after migration will give correct typing.
- Surface topic name + material_format name in the row -- design TBD (e.g., a small chip line under the date).

#### Topic management page (new)

- Route: `/topics` (or `/topics/index.astro`). PRD doesn't lock the path. Recommend `/topics` -- shorter, easier to reach from Topbar.
- Add `<a href="/topics">Topics</a>` to [src/components/Topbar.astro:19-22](../../../src/components/Topbar.astro#L19-L22) (sibling of Dashboard link).
- Add `"/topics/"` to `PROTECTED_ROUTES` (trailing slash).
- Empty state is mandatory -- `topics` ships with zero rows. Copy + "Add your first topic" CTA. ([F-01 plan.md:42, 421](../../archive/2026-05-29-sessions-data-foundation/plan.md#L42))
- CRUD UI: list of topics, "Add" button → modal, per-row "Rename" + "Archive" actions. Archived topics shown under a collapsible section (or hidden by default with toggle).
- Likely needs new shadcn primitives: `input`, `label`, `dialog`. After install, **delete `node_modules/.vite/` and restart dev** -- L-04 bites here.

#### Existing shadcn components ([src/components/ui/](../../../src/components/ui/))

Present: `button.tsx`, `card.tsx` only.

Missing (S-02 will likely need): `input`, `label`, `dialog`, plus one of `select` / `combobox` / `radio-group` for the topic picker. Recommend:

- **Topic picker**: `select` (or custom button-group like energy if topic count is small).
- **Material format picker**: button-group mirroring energy (only 5 fixed options, fits the existing visual pattern).
- **Topic CRUD modal**: `dialog` + `input` + `label`.

Install with `npx shadcn@latest add <name>`.

### E. Tests

#### Infrastructure

- **Vitest + @cloudflare/vitest-pool-workers** for API integration tests ([tests/integration/api/](../../../tests/integration/api/)). Dispatch via `SELF.fetch`.
- **Vitest jsdom-ish** for unit tests ([tests/unit/](../../../tests/unit/)).
- **Playwright** for e2e ([tests/e2e/](../../../tests/e2e/)).
- **pgTAP** for RLS ([supabase/tests/](../../../supabase/tests/)). Local pre-PR gate.
- Fixtures: [tests/\_fixtures/auth.ts](../../../tests/_fixtures/auth.ts) `setupTwoUsers()`, [tests/\_fixtures/db.ts](../../../tests/_fixtures/db.ts) `readSession(id)` via service role.

#### S-02 test requirements (binding per [test-plan.md §6.3](../../foundation/test-plan.md))

1. **Column-scope regression** on widened POST `/api/sessions`: extra body keys (`user_id`, `note`, etc.) stripped; `topic_id` and `material_format_id` land correctly. Extend [tests/integration/api/sessions.create.test.ts](../../../tests/integration/api/sessions.create.test.ts) -- the existing "server-stamps user_id" test ([line 21-38](../../../tests/integration/api/sessions.create.test.ts#L21-L38)) is the template.
2. **Column-scope regression** on new POST `/api/topics`: `owner_id` from body ignored; `name` lands.
3. **pgTAP extension** of `rls_topics.sql` if `archived_at` is added: assertions for `archived_at` SELECT/UPDATE per owner.
4. **Cross-user denial** on PATCH `/api/topics/[id]`: 409 byte-identical with not-found case.
5. Add `readTopic(id)` helper to [tests/\_fixtures/db.ts](../../../tests/_fixtures/db.ts) for ground-truth assertions.

#### Tests explicitly NOT required ([test-plan.md §7](../../foundation/test-plan.md))

- No Tailwind class assertions.
- No responsive-layout / mobile snapshots (PRD allows topic-list management to be desktop-first -- [prd.md:133](../../foundation/prd.md#L133)).
- No e2e is required by the test plan; if added, follow `/10x-e2e` skill + seed pattern.

### F. Post-deploy considerations

#### Smoke gate ([context/archive/2026-06-24-testing-schema-validation-gate/](../../archive/2026-06-24-testing-schema-validation-gate/))

- `smoke.yml` runs (a) session-write smoke + (b) `db:types diff` after every deploy.
- **db:types workflow for S-02**:
  1. Write `<timestamp>_add_topics_archived_at.sql` under `supabase/migrations/`.
  2. `npm run db:reset` locally; verify schema; run `npm run db:test`.
  3. After merging + deploy, run `npm run db:types:prod` (uses [scripts/gen-types-prod.mjs](../../../scripts/gen-types-prod.mjs)) -- **NOT** `npm run db:types` -- to avoid CLI-version formatting drift breaking the diff gate ([archive runbook §7](../../archive/2026-06-24-testing-schema-validation-gate/runbook.md)).
  4. Commit regenerated `src/db/database.types.ts`.
- The smoke insert script only writes `{ user_id, energy_level, started_at }` -- still works because new columns are nullable.

## Code References

### Schema layer

- [supabase/migrations/20260531182506_sessions_data_foundation.sql:80-102](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L80-L102) -- sessions CREATE TABLE (topic_id + material_format_id already present)
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:56-74](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L56-L74) -- topics CREATE TABLE
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:30-50](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L30-L50) -- material_formats CREATE TABLE + seed
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:151-191](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L151-L191) -- RLS policies for topics + material_formats
- [supabase/migrations/20260601120000_drop_sessions_delete_policy.sql](../../../supabase/migrations/20260601120000_drop_sessions_delete_policy.sql) -- sessions immutability
- [src/db/database.types.ts:66-152](../../../src/db/database.types.ts#L66-L152) -- generated types include all S-02 fields already

### API layer

- [src/pages/api/sessions/index.ts:8-38](../../../src/pages/api/sessions/index.ts#L8-L38) -- POST sessions (skeleton to extend)
- [src/pages/api/sessions/[id].ts:13-59](../../../src/pages/api/sessions/[id].ts#L13-L59) -- PATCH sessions (do NOT widen)
- [src/lib/schemas/session.ts:3-17](../../../src/lib/schemas/session.ts#L3-L17) -- createSessionSchema (widen here) + endSessionSchema (leave alone)
- [src/lib/parse-request.ts](../../../src/lib/parse-request.ts) -- ParseResult<T>, parseJson, parseFormData
- [src/lib/supabase.ts](../../../src/lib/supabase.ts) -- SupabaseClient<Database> | null factory
- [src/middleware.ts](../../../src/middleware.ts) -- PROTECTED_ROUTES (add "/topics/")

### Frontend layer

- [src/pages/session/new.astro:1-10](../../../src/pages/session/new.astro#L1-L10) -- pre-session page shell
- [src/components/session/EnergyPicker.tsx:59-95](../../../src/components/session/EnergyPicker.tsx#L59-L95) -- form JSX + submit handler (extend)
- [src/pages/dashboard.astro:26-31](../../../src/pages/dashboard.astro#L26-L31) -- sessions SSR select (widen with PostgREST embeds)
- [src/pages/dashboard.astro:99-130](../../../src/pages/dashboard.astro#L99-L130) -- row template (add topic + material chips)
- [src/components/Topbar.astro:19-22](../../../src/components/Topbar.astro#L19-L22) -- add Topics nav link
- [src/components/ui/](../../../src/components/ui/) -- button.tsx, card.tsx present; needs input, label, dialog (and possibly select)
- [src/lib/utils.ts:4-6](../../../src/lib/utils.ts#L4-L6) -- cn() for class merging

### Tests

- [supabase/tests/rls_topics.sql](../../../supabase/tests/rls_topics.sql) -- extend for archived_at
- [supabase/tests/rls_sessions.sql](../../../supabase/tests/rls_sessions.sql) -- template
- [tests/integration/api/sessions.create.test.ts:21-38](../../../tests/integration/api/sessions.create.test.ts#L21-L38) -- column-scope regression template (server-stamps user_id)
- [tests/integration/api/sessions.end.test.ts:39-68](../../../tests/integration/api/sessions.end.test.ts#L39-L68) -- L-01 PATCH column-scope template
- [tests/\_fixtures/auth.ts](../../../tests/_fixtures/auth.ts) -- setupTwoUsers()
- [tests/\_fixtures/db.ts](../../../tests/_fixtures/db.ts) -- service-role helpers (add readTopic)

## Architecture Insights

- **Schema-anticipating-S-02** -- F-01 was deliberately wide so S-02 wouldn't need to ALTER `sessions`. The roadmap line claiming additive sessions schema changes is stale; verify with the planner before they write a migration.
- **Lookup-with-NULL-owner pattern** -- both `topics` and `material_formats` use `owner_id IS NULL` for defaults visible to everyone. Material formats use it (5 seeds); topics could (none seeded). The pattern is established if S-02 ever wants seeded topic defaults.
- **L-01 column-scope two-layer** is the single most binding rule. It hits every new write endpoint S-02 adds (POST topics, PATCH topic rename/archive) and the widened POST sessions. The schema layer (default-strip on `z.object`) and the API layer (hand-picked `.insert/.update`) must both hold.
- **Sessions immutability** ([20260601120000_drop_sessions_delete_policy.sql](../../../supabase/migrations/20260601120000_drop_sessions_delete_policy.sql)) plus PATCH's `.is("ended_at", null)` write-once guard. Topic/format MUST be set at POST time -- adding them to PATCH would invite a column-scope regression on the most-tested endpoint.
- **Direct-Supabase-from-Astro** -- the dashboard reads sessions directly from Supabase in the page frontmatter, not via `GET /api/sessions`. PostgREST embeds (`topics(name), material_formats(name)`) keep it to one round-trip with full RLS.
- **3-tap guardrail is at the edge** -- S-01 already counted 3 taps end-to-end. S-02's two new pickers MUST default to "skip", or the guardrail breaks.

## Historical Context (from prior changes)

### F-01 (sessions foundation) -- [context/archive/2026-05-29-sessions-data-foundation/](../../archive/2026-05-29-sessions-data-foundation/)

- [plan.md:5](../../archive/2026-05-29-sessions-data-foundation/plan.md#L5) -- "anticipating-but-nullable" design rationale
- [plan.md:41-42](../../archive/2026-05-29-sessions-data-foundation/plan.md#L41-L42) -- topics ships empty; S-02 owns empty-state
- [plan.md:45](../../archive/2026-05-29-sessions-data-foundation/plan.md#L45) -- `archived_at` deferred to S-02
- [plan.md:46-47](../../archive/2026-05-29-sessions-data-foundation/plan.md#L46-L47) -- DELETE RLS dropped; sessions immutable
- [plan.md:419](../../archive/2026-05-29-sessions-data-foundation/plan.md#L419) -- material_format made extensible (scope expansion beyond PRD)
- [reviews/impl-review.md:36-43](../../archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md#L36-L43) -- L-01 origin

### S-01 (capture loop) -- [context/archive/2026-06-19-first-session-capture-loop/](../../archive/2026-06-19-first-session-capture-loop/)

- [plan.md:347-349](../../archive/2026-06-19-first-session-capture-loop/plan.md#L347-L349) -- 3-tap count (energy at tap 2, Start at tap 3)
- [plan.md:221-228](../../archive/2026-06-19-first-session-capture-loop/plan.md#L221-L228) -- EnergyPicker pattern S-02 extends
- [plan.md:155](../../archive/2026-06-19-first-session-capture-loop/plan.md#L155) -- Topbar auto-mounted in Layout.astro for authed users
- [reviews/plan-review.md F5](../../archive/2026-06-19-first-session-capture-loop/reviews/plan-review.md) -- PROTECTED_ROUTES trailing-slash rule
- [research.md:273](../../archive/2026-06-19-first-session-capture-loop/research.md#L273) -- topic_id / material_format_id stay NULL in S-01

### Testing Phase 1 -- [context/archive/2026-06-21-testing-api-contract/](../../archive/2026-06-21-testing-api-contract/)

- [reviews/impl-review.md:29-46](../../archive/2026-06-21-testing-api-contract/reviews/impl-review.md#L29-L46) -- L-01 regression test mechanics + known signal gap

### Testing Phase 3 -- [context/archive/2026-06-24-testing-schema-validation-gate/](../../archive/2026-06-24-testing-schema-validation-gate/)

- [runbook.md](../../archive/2026-06-24-testing-schema-validation-gate/runbook.md) -- `db:types:prod` vs `db:types` to keep smoke `diff` gate green

### Lessons -- [context/foundation/lessons.md](../../foundation/lessons.md)

- **L-01** binds every S-02 write endpoint (POST/PATCH topics; widened POST sessions). Schema default-strip + hand-picked `.insert/.update` -- two layers, both required.
- **L-04** likely triggers after `npx shadcn add <name>` -- delete `node_modules/.vite/` if SSR hook errors appear.
- L-02 (audio) and L-03 (timer resilience) don't apply -- S-02 touches neither.

## Open Questions

1. **Topic archive semantics**: archived topics stay attached to historical sessions but hide from the picker -- confirm. From [roadmap.md:106](../../foundation/roadmap.md#L106), strongly implied but not explicit in PRD. Recommend: yes, that's the standard archive pattern. Picker query becomes `WHERE owner_id = auth.uid() AND archived_at IS NULL ORDER BY name`.
2. **Custom material formats**: F-01 made the table extensible, but PRD FR-008 reads as closed-vocab (5 fixed values). Recommend ship S-02 with the 5 seeded formats only; defer "add custom format" UI until a real-user request.
3. **Topic picker UI when list is large**: button-group (energy pattern) breaks at ~10+ topics. Recommend `select` for v1 -- simpler than combobox; revisit if a user has 30+ topics.
4. **`/topics` vs `/settings/topics`**: PRD doesn't lock. Recommend `/topics` (shorter, top-level nav slot makes sense as topic management is core, not buried in settings).
5. **First-topic-required nudge?** PRD says topic is optional, but if `topics` is empty the picker is degenerate. Recommend a soft prompt on first session: "Add a topic to make this session searchable" (link to `/topics`), but don't gate Start.
6. **`updated_at` trigger on topics for rename**: confirm the existing trigger ([migration:13-24](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L13-L24) `public.set_updated_at()`) is bound to `public.topics` -- it should be from F-01.

## Related Research

- [context/archive/2026-05-29-sessions-data-foundation/research.md](../../archive/2026-05-29-sessions-data-foundation/research.md) -- pre-F-01 schema research
- [context/archive/2026-06-19-first-session-capture-loop/research.md](../../archive/2026-06-19-first-session-capture-loop/research.md) -- pre-S-01 frontend + API research
- [context/foundation/test-plan.md](../../foundation/test-plan.md) §6.3, §6.4, §7 -- binding test rules for S-02
- [context/foundation/lessons.md](../../foundation/lessons.md) -- L-01, L-04 apply
