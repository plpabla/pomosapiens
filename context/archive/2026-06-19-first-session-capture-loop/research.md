---
date: 2026-06-19T00:00:00Z
researcher: pawel
git_commit: e137a26e7f31f4a5b164cede9662564057708d32
branch: first-session-capture-loop
repository: pomosapiens
topic: "S-01 first session capture loop — data model gaps and existing surfaces"
tags: [research, codebase, sessions, dashboard, ui-surfaces, supabase, rls]
status: complete
last_updated: 2026-06-19
last_updated_by: pawel
---

# Research: S-01 first session capture loop — data model gaps and existing surfaces

**Date**: 2026-06-19
**Researcher**: pawel
**Git Commit**: e137a26e7f31f4a5b164cede9662564057708d32
**Branch**: first-session-capture-loop
**Repository**: pomosapiens

## Research Question

For the S-01 "First session capture loop" slice (north star — sign in → tap Start → pick energy → run 25/5 timer with audible focus→break cue → rate 1–5 or skip → see session at top of history), what are the **data model gaps** between F-01's shipped schema and S-01's needs, and what **existing surfaces** (pages, components, layouts, API patterns, middleware, lib helpers) does S-01 build on or extend?

Scope set by the user: data model gaps + existing surfaces. Explicitly **not** in scope: timer-resilience strategy, audio-cue choice, or any solutioning — those are `/10x-plan` decisions.

## Summary

**Data model: structurally zero gaps.** F-01 ([context/archive/2026-05-29-sessions-data-foundation/](../../archive/2026-05-29-sessions-data-foundation/)) shipped the `sessions` table with every column S-01 needs and every column S-02/S-03/S-04 will later non-null (`topic_id`, `material_format_id`, `timer_mode`, `note` are all nullable today). The S-01 insert path is fully provisioned: `user_id NOT NULL`, `started_at NOT NULL`, `energy_level NOT NULL` (enum `'low' | 'medium' | 'high'`). End-of-session is an UPDATE that may set `ended_at`, `focus_rating`, `note`. `duration_seconds` materialises automatically via a `GENERATED ALWAYS AS … STORED` column when `ended_at` is set ([supabase/migrations/20260531182506_sessions_data_foundation.sql:85-90](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85)). The history-list query lands on `sessions_user_started_at_idx` cheaply.

**Two non-structural data-layer constraints S-01 must respect:**

1. **No user-facing DELETE.** Migration [20260601120000_drop_sessions_delete_policy.sql](../../../supabase/migrations/20260601120000_drop_sessions_delete_policy.sql) dropped `sessions_delete_own` after F-01 archived; pgTAP test #4 in [rls_sessions.sql:47-55](../../../supabase/tests/rls_sessions.sql#L47) locks this. S-01 must not surface a delete affordance.
2. **UPDATE policy is wide.** RLS lets the owner mutate any column (only `WITH CHECK` on `user_id` is enforced — [migration:142-145](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L142)). S-01's API layer must self-discipline the column scope on end-of-session UPDATE (only `ended_at`, `focus_rating`, `note`). The impl-review noted this explicitly ([context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md:40](../../archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md)).

**Surfaces: substantial gaps to fill.** The codebase has a complete auth+landing surface but the authed app is **bare-bones**:

- `dashboard.astro` is a placeholder showing only the user email + sign-out link ([src/pages/dashboard.astro:1-6](../../../src/pages/dashboard.astro#L1)).
- **No** `/session/*` or `/history` pages.
- **No** timer / rating / history components — only auth components exist.
- **One** shadcn primitive present (`button`). S-01 will need card, label, input (textarea for note), and a radio-group or three-button picker for energy. Toast/dialog probably overkill at first.
- **No** audio asset in `public/`. S-01 needs to source a chime/bell for the focus→break cue (FR-011 / NFR "Audible focus→break cue").
- `src/middleware.ts` `PROTECTED_ROUTES` is `["/dashboard"]`; any new authed routes S-01 adds must be appended.

**Patterns S-01 must mirror are well-established:**

- Supabase typed client factory at [src/lib/supabase.ts](../../../src/lib/supabase.ts) returns `null` on missing env; every caller null-checks.
- Zod schemas live in [src/lib/schemas/](../../../src/lib/schemas/) (single file `auth.ts` today); add `session.ts`.
- API route convention: `export const prerender = false;`, `APIRoute` handler reading `context.locals.user` / `context.request` / `context.cookies` / `context.redirect`. [src/pages/api/auth/oauth.ts](../../../src/pages/api/auth/oauth.ts) is the cleanest reference.
- Existing auth API endpoints redirect; S-01's endpoints likely return JSON because the timer/rating UI will be React islands driving fetch, not native form posts.
- [src/lib/parse-request.ts](../../../src/lib/parse-request.ts) provides `parseFormData` / `parseJson` returning `ParseResult<T>`. **Auth routes do not currently use it** (they hand-extract from `formData()`); S-01 should be the first non-auth consumer.

## Detailed Findings

### 1. Data model: F-01 already provides every S-01 column

The shipped `public.sessions` table ([supabase/migrations/20260531182506_sessions_data_foundation.sql:80-102](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L80)):

```sql
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  duration_seconds integer GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NULL THEN NULL
         ELSE EXTRACT(EPOCH FROM (ended_at - started_at))::int END
  ) STORED,
  energy_level public.energy_level NOT NULL,
  focus_rating smallint NULL CHECK (focus_rating BETWEEN 1 AND 5),
  topic_id uuid NULL REFERENCES public.topics(id) ON DELETE SET NULL,
  material_format_id uuid NULL REFERENCES public.material_formats(id) ON DELETE SET NULL,
  timer_mode text NULL CHECK (
    timer_mode IS NULL OR timer_mode IN ('preset_1', 'preset_2', 'preset_3', 'count_up')
  ),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Per-column ownership and S-01's responsibility:

| Column                      | Nullable?              | S-01 writes?                                       | Owner of first non-null               |
| --------------------------- | ---------------------- | -------------------------------------------------- | ------------------------------------- |
| `id`                        | NO (default)           | DB default                                         | F-01                                  |
| `user_id`                   | NO                     | **INSERT** (from `context.locals.user.id`)         | **S-01**                              |
| `started_at`                | NO                     | **INSERT** (server-stored timestamp)               | **S-01**                              |
| `ended_at`                  | YES                    | **UPDATE at session end**                          | **S-01**                              |
| `duration_seconds`          | YES, **GENERATED**     | **never** — DB materialises it                     | F-01 (auto)                           |
| `energy_level`              | NO (enum)              | **INSERT** (only required pre-session field)       | **S-01**                              |
| `focus_rating`              | YES (CHECK 1–5)        | **UPDATE at session end** (or NULL = skip)         | **S-01**                              |
| `topic_id`                  | YES                    | leave NULL                                         | S-02                                  |
| `material_format_id`        | YES                    | leave NULL                                         | S-02                                  |
| `timer_mode`                | YES (CHECK)            | leave NULL in v1                                   | S-03                                  |
| `note`                      | YES                    | leave NULL (FR-014 = nice-to-have, mapped to S-04) | **S-01 may surface; S-04 owns chart** |
| `created_at` / `updated_at` | NO (default + trigger) | DB default; trigger bumps on UPDATE                | F-01                                  |

Rationale and decisions sourced from [context/archive/2026-05-29-sessions-data-foundation/plan.md](../../archive/2026-05-29-sessions-data-foundation/plan.md) and [plan-brief.md](../../archive/2026-05-29-sessions-data-foundation/plan-brief.md):

- **"Anticipating-but-nullable" column-set** — picked at plan time ([plan-brief.md:21](../../archive/2026-05-29-sessions-data-foundation/plan-brief.md)) to avoid three follow-on migrations on `sessions`.
- **`started_at` server-stored, `ended_at` nullable** keeps S-01's timer-resilience options open ([plan.md:34](../../archive/2026-05-29-sessions-data-foundation/plan.md)). S-01 may either INSERT at session start or at session end; F-01 supports both.
- **`note` column** is present today, but per roadmap [S-04 owns FR-014](../../foundation/roadmap.md). S-01's UI may or may not surface the note input — that is a planner call, but the column is ready either way.
- **`focus_rating` NULL = skip** ([plan.md:162](../../archive/2026-05-29-sessions-data-foundation/plan.md)). This matches FR-013 exactly.

Generated TS types ([src/db/database.types.ts:55-117](../../../src/db/database.types.ts#L55)) mirror this. Caveat: `Insert` and `Update` include `duration_seconds?: number | null` even though the DB rejects any non-null write — S-01 must treat the column as read-only in code. `energy_level` is correctly narrowed to `"low" | "medium" | "high"` ([database.types.ts:150](../../../src/db/database.types.ts#L150)). `timer_mode` is `string | null` and loses the CHECK vocabulary (irrelevant for S-01 since it stays NULL).

### 2. Data model: rules of engagement (RLS + immutability)

**INSERT requires `user_id = auth.uid()`** ([migration:138-140](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L138)). S-01's create endpoint reads `context.locals.user.id` (set by [src/middleware.ts:7-17](../../../src/middleware.ts#L7)) and supplies it explicitly.

**UPDATE works through the same RLS row scope** ([migration:142-145](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L142)), so writing `ended_at` / `focus_rating` / `note` against a session the user owns is allowed. The `set_updated_at()` trigger bumps `updated_at` on every UPDATE ([migration:16-24, 107-109](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L16)).

**DELETE is denied for users** — the original `sessions_delete_own` policy was dropped in [20260601120000_drop_sessions_delete_policy.sql](../../../supabase/migrations/20260601120000_drop_sessions_delete_policy.sql) after F-01's impl-review. pgTAP test #4 in [supabase/tests/rls_sessions.sql:47-55](../../../supabase/tests/rls_sessions.sql#L47) asserts a user cannot DELETE their own session. S-01 must not expose a delete affordance.

**UPDATE policy is wide** (no column scope at the DB layer). The impl-review explicitly accepted this ([context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md:36-43](../../archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md)): the UPDATE policy stays open; S-01's API/zod layer disciplines the column scope. The lesson the impl-review codified ("RLS policies must enforce business-rule immutability, not the UI") is referenced from the DELETE-drop migration ([20260601120000:4](../../../supabase/migrations/20260601120000_drop_sessions_delete_policy.sql#L4)) but **is not actually present in [context/foundation/lessons.md](../../foundation/lessons.md)** — a documentation drift worth knowing about but not blocking S-01.

**Topics and material_formats — what S-01 reads but doesn't surface:**

- `topics` ships **empty**; S-02 owns the first-row UX ([plan.md:42](../../archive/2026-05-29-sessions-data-foundation/plan.md)). S-01 does not surface a topic picker (FR-007 is mapped to S-02 per [roadmap:35](../../foundation/roadmap.md)).
- `material_formats` ships with 5 NULL-owner seeded rows: `Video`, `Reading`, `Writing code`, `Drilling problems`, `Other` ([migration:115-120](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L115)). They are visible via the `owner_id IS NULL OR owner_id = auth.uid()` SELECT policy. S-01 does **not** surface the picker (FR-008 is mapped to S-02). The seeds are warm and waiting.

**pgTAP coverage S-01 must not regress.** Three files at [supabase/tests/](../../../supabase/tests/), 27 assertions total. The critical S-01-adjacent ones:

- `rls_sessions.sql` #1 (own-row SELECT isolation), #4 (own-session DELETE denial = immutability), #5 (INSERT cannot claim another user's id), #6–#9 (anon denied everything).
- `rls_topics.sql` and `rls_material_formats.sql` cover default-row visibility and cross-user denial.

CI does **not** yet run `db:test` ([plan.md:422](../../archive/2026-05-29-sessions-data-foundation/plan.md)). S-01 is responsible for running `npm run db:test` locally before opening a PR, especially if it touches RLS in any way.

### 3. Existing UI surfaces — what's there

**Pages under [src/pages/](../../../src/pages/):**

| Path                                                                              | Purpose                                                                                                                         | Reuse for S-01?                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [src/pages/index.astro](../../../src/pages/index.astro)                           | Landing (S-00 done) — `Welcome.astro` hero + CTAs                                                                               | No                                                         |
| [src/pages/dashboard.astro](../../../src/pages/dashboard.astro)                   | Authed home — currently `{user.email}` + sign-out only ([src/pages/dashboard.astro:1-6](../../../src/pages/dashboard.astro#L1)) | **Yes — host the "Start session" CTA + history list here** |
| [src/pages/auth/signin.astro](../../../src/pages/auth/signin.astro)               | Sign-in                                                                                                                         | No                                                         |
| [src/pages/auth/signup.astro](../../../src/pages/auth/signup.astro)               | Sign-up                                                                                                                         | No                                                         |
| [src/pages/auth/confirm-email.astro](../../../src/pages/auth/confirm-email.astro) | Email confirmation                                                                                                              | No                                                         |

No `/session/*`, `/history`, or `/timer` route exists. S-01 must add them.

**Layout:**

[src/layouts/Layout.astro](../../../src/layouts/Layout.astro) — single base layout. Imports `global.css`, renders the config-status banners and a `<slot />`. **No nav, no header, no auth-aware shell.** [src/components/Topbar.astro](../../../src/components/Topbar.astro) exists with user email + Sign out + Dashboard link but is **not currently mounted in Layout.astro** (used directly by pages that import it). S-01 should treat the authed shell as a planner choice — extend Layout or mount Topbar inside dashboard.astro.

**Middleware ([src/middleware.ts](../../../src/middleware.ts)):**

```ts
const PROTECTED_ROUTES = ["/dashboard"];
const AUTHED_REDIRECTS: Record<string, string> = { "/": "/dashboard" };
```

Sets `context.locals.user` from `supabase.auth.getUser()`. Redirects unauth'd hits on `PROTECTED_ROUTES` to `/auth/signin`. S-01 must append the new authed routes it adds (likely `/session/new`, `/session/[id]`, plus `/history` if it splits history off the dashboard).

**Components ([src/components/](../../../src/components/)):**

- shadcn primitives ([src/components/ui/](../../../src/components/ui/)): only [button.tsx](../../../src/components/ui/button.tsx) is present (CVA variants, `asChild` via Radix Slot). `LibBadge.astro` is unrelated.
- Auth React components ([src/components/auth/](../../../src/components/auth/)): `SignInForm.tsx`, `SignUpForm.tsx`, `FormField.tsx`, `PasswordToggle.tsx`, `SubmitButton.tsx`, `ServerError.tsx`. The `SubmitButton` + `useFormStatus()` pattern is reusable.
- Astro components: `Welcome.astro`, `Topbar.astro`, `Banner.astro`.

**No timer, no rating widget, no session list, no card primitive.** Every session-loop UI element needs to be built.

**Styling baseline ([src/styles/global.css](../../../src/styles/global.css)):**

Tailwind 4 with the "Focus Fuels Greatness" palette wired as theme tokens (`--color-void`, `--color-ember`, `--color-charred`, `--color-crimson`, `--color-neon`, `--color-blaze`, `--color-spark`, `--color-off-white`, `--color-ash`, `--color-leaf`) and the standard shadcn `--primary` / `--secondary` / `--muted` / `--accent` / `--destructive` set on `:root` and `.dark`. A `@utility bg-cosmic` exists. S-01's surfaces can use token classes directly (`text-off-white`, `bg-ember`, etc.) and stay coherent with the landing page.

**Static assets ([public/](../../../public/)):**

`icon.png` (1.3 MB), `hero.png` (1.9 MB). **No audio.** S-01 needs to add a chime/bell asset for the focus→break cue. Permissive-license source (e.g., a CC0 chime) plus a `/public/audio/` directory will be the minimum.

### 4. Lib helpers and API conventions S-01 must mirror

**Supabase typed client ([src/lib/supabase.ts](../../../src/lib/supabase.ts)):**

```ts
export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    /* cookies */
  });
}
```

Three current callers ([src/pages/api/auth/signin.ts:9](../../../src/pages/api/auth/signin.ts#L9), [src/pages/api/auth/oauth.ts:7](../../../src/pages/api/auth/oauth.ts#L7), [src/middleware.ts:8](../../../src/middleware.ts#L8)) all use the same `createClient(context.request.headers, context.cookies)` + null-check pattern. S-01 follows this exactly.

**Zod schemas ([src/lib/schemas/](../../../src/lib/schemas/)):**

Today only `auth.ts` exists. The convention is `z.object()` + custom messages + `z.infer<>` type export:

```ts
export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type SignInPayload = z.infer<typeof signInSchema>;
```

S-01 adds (likely) `src/lib/schemas/session.ts` with a create-payload schema and an end-payload schema.

**Request parsing ([src/lib/parse-request.ts](../../../src/lib/parse-request.ts)):**

```ts
export type ParseResult<T> = { data: T; error: null } | { data: null; error: string };

export async function parseFormData<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>>;
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>>;
```

Error format is `"<field>: <message>"` (first issue only). **The auth routes don't use this yet** — they hand-extract from `formData()`. S-01 should be the first consumer of `parseJson` since the timer/rating React islands will drive `fetch` with JSON bodies.

**API route shape ([src/pages/api/auth/oauth.ts](../../../src/pages/api/auth/oauth.ts) is the cleanest reference):**

```ts
export const prerender = false;
export const GET: APIRoute = async (context) => {
  /* ... */
};
```

- `prerender = false` is mandatory for API routes under the Cloudflare adapter.
- Read user id from `context.locals.user` (set by middleware).
- Auth routes redirect on success/failure; **S-01's endpoints should return JSON** because React islands will drive them via `fetch`. This is a small deliberate deviation from the auth convention.

**React island wiring:**

The current pattern in [src/pages/auth/signin.astro:16](../../../src/pages/auth/signin.astro#L16) uses `client:load`:

```astro
<SignInForm serverError={error} client:load />
```

S-01's timer almost certainly wants `client:load` (the timer must run on first paint). The pre-session picker can be `client:load` too. The history list, if split out, may be `client:visible` since it's below the fold.

### 5. Surface and asset gaps S-01 will need to fill

**Pages** (new, all under `PROTECTED_ROUTES`):

- `/session/new` — pre-session pick screen (energy required; timer-mode/topic/format optional per PRD, but S-01 only surfaces energy + likely defaults timer to preset_1 25/5).
- `/session/[id]` — active timer page (focus → audible cue → break) and post-session rating prompt.
- Optionally `/history` — separate route or inline on dashboard. The roadmap is silent; planner call. The dashboard read of recent sessions is the cheaper option.

**Dashboard rewrite:**
[src/pages/dashboard.astro](../../../src/pages/dashboard.astro) is currently 6 lines (`{user.email}` + sign-out link). S-01 turns this into the authed entry point: "Start session" CTA (FR-006) + the history list (FR-015).

**Middleware update:**
Append new routes to `PROTECTED_ROUTES` in [src/middleware.ts](../../../src/middleware.ts).

**API endpoints (new):**

- `POST /api/sessions` — create a session (zod schema: `energy_level` required; `started_at` server-set). Returns the new session id.
- `PATCH /api/sessions/[id]` — end a session (zod schema: `ended_at`, optional `focus_rating`, optional `note`). The endpoint must restrict the column scope itself; RLS does not.
- `GET /api/sessions` — list (planner may instead read sessions server-side in `dashboard.astro`; both options are open since the index on `(user_id, started_at DESC)` makes it cheap either way).

**Zod schemas (new):**
[src/lib/schemas/session.ts](../../../src/lib/schemas/session.ts) — create + end payload schemas.

**shadcn primitives to add** (via `npx shadcn@latest add <name>`):

- `card` — pre-session, timer, rating, history rows.
- `label` + `input` — note textarea, possibly the rating fallback.
- (Optional) `dialog` — if the rating prompt overlays the timer; otherwise inline.

**Components to build:**

- A pre-session screen React island (energy picker; FR-009).
- A timer React island (countdown + auto focus→break + audible cue + manual stop; FR-011, FR-012).
- A post-session rating widget (1–5 + Skip; FR-013).
- A history list (FR-015 minimal shape — energy, duration, rating; later slices add topic/format/note/chart).

**Audio asset:**
A short focus→break chime under [public/audio/](../../../public/) (file does not exist today). Note: browsers block autoplay before user gesture — the "Start session" tap counts as the gesture, so playback at focus-end works if the audio element is created/primed at session start. (Strategy = planner call; this research only flags the asset gap.)

### 6. Constraints checklist S-01 must respect

From F-01's data layer (each citation in earlier sections):

1. INSERTs must supply `user_id` (= `auth.uid()`), `started_at`, `energy_level`. Everything else stays NULL on first insert.
2. Never write `duration_seconds` (DB rejects; TS type is misleadingly permissive).
3. End-of-session UPDATE may touch `ended_at`, `focus_rating`, `note`. Do **not** mutate `user_id`, `started_at`, `energy_level` — RLS allows it, but the impl-review accepted that the API layer carries this discipline.
4. No user-facing DELETE; no "remove this session" UI. Account deletion cascades from `auth.users`, which is the only path.
5. `focus_rating` must satisfy CHECK `BETWEEN 1 AND 5` (or NULL = skip).
6. `timer_mode` stays NULL in S-01 (S-03 owns it).
7. `topic_id` / `material_format_id` stay NULL (S-02 owns them, even though the seeded `material_formats` rows are visible today).
8. Run `npm run db:test` locally before PR. CI does not run pgTAP yet ([F-01 plan.md:422](../../archive/2026-05-29-sessions-data-foundation/plan.md)).
9. The `set_updated_at()` trigger fires on every UPDATE — fine, but the planner should know that `updated_at` will not equal `created_at` for any rated/completed session.

## Code References

Data model:

- [supabase/migrations/20260531182506_sessions_data_foundation.sql:80-102](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L80) — `sessions` table definition.
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:85-90](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85) — `duration_seconds` generated column.
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:104-105](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L104) — `sessions_user_started_at_idx` (backs the history list).
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:115-120](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L115) — `material_formats` 5-row seed.
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:130-149](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L130) — `sessions` RLS policies (SELECT/INSERT/UPDATE).
- [supabase/migrations/20260601120000_drop_sessions_delete_policy.sql](../../../supabase/migrations/20260601120000_drop_sessions_delete_policy.sql) — DELETE policy dropped post-archive.
- [supabase/tests/rls_sessions.sql:47-55](../../../supabase/tests/rls_sessions.sql#L47) — pgTAP own-session-DELETE-denied assertion (test #4).
- [src/db/database.types.ts:55-117](../../../src/db/database.types.ts#L55) — generated `sessions` Row / Insert / Update.
- [src/db/database.types.ts:150](../../../src/db/database.types.ts#L150) — `energy_level` enum.

Surfaces and patterns:

- [src/pages/dashboard.astro:1-6](../../../src/pages/dashboard.astro#L1) — current dashboard placeholder S-01 will rewrite.
- [src/middleware.ts:7-17](../../../src/middleware.ts#L7) — middleware that sets `context.locals.user`; `PROTECTED_ROUTES` array to extend.
- [src/lib/supabase.ts](../../../src/lib/supabase.ts) — typed client factory; null-on-missing-env pattern.
- [src/lib/parse-request.ts](../../../src/lib/parse-request.ts) — `parseJson` / `parseFormData` + `ParseResult<T>` discriminated union.
- [src/lib/schemas/auth.ts](../../../src/lib/schemas/auth.ts) — zod schema convention to mirror.
- [src/pages/api/auth/oauth.ts](../../../src/pages/api/auth/oauth.ts) — cleanest existing API-route shape (`prerender = false` + `APIRoute` + supabase null-check).
- [src/pages/auth/signin.astro:16](../../../src/pages/auth/signin.astro#L16) — `client:load` React island directive.
- [src/components/ui/button.tsx](../../../src/components/ui/button.tsx) — only shadcn primitive present today.
- [src/styles/global.css](../../../src/styles/global.css) — palette tokens available to S-01 surfaces.

## Architecture Insights

**The wedge is data-layer-ready; the wedge is UI-layer-empty.** Every PRD claim about contextual capture (energy, focus rating, server-stored elapsed) already has a column and an index. What's missing is everything visible: the picker, the timer, the rating prompt, the list. S-01 is overwhelmingly a UI slice with a thin server-side write path.

**F-01's "anticipating-but-nullable" strategy pays off here.** S-01 does not need a migration. S-02/S-03 each get a single-column NOT-NULL-by-convention surface to add, not a schema change. This is exactly the property [F-01 plan-brief.md:21](../../archive/2026-05-29-sessions-data-foundation/plan-brief.md) was designed for.

**The "API returns JSON, not redirects" deviation is small and necessary.** Existing auth endpoints redirect because they're driven by native `<form>` posts. The timer/rating widget will be a React island calling `fetch` and updating local state on success — JSON responses are the right shape. The same `createClient` + `parseJson` + `context.locals.user` pattern applies; only the response envelope changes.

**Immutability is in two places: the DB (DELETE denied) and the API code (UPDATE column discipline).** The impl-review made this split explicit. S-01's `PATCH /api/sessions/[id]` schema should accept only `ended_at`, `focus_rating`, `note` — that's the discipline the wide UPDATE policy expects from the call-site.

**The `duration_seconds` design lets S-01 pick its insert-time freely.** If S-01 inserts at session start, `duration_seconds` is NULL until the end-of-session UPDATE sets `ended_at`. If S-01 inserts at session end, both go in atomically. Both work; both are auditable. The roadmap's "timer-resilience strategy" unknown ([roadmap:89](../../foundation/roadmap.md)) is closely tied to this choice.

**The Topbar / authed-shell gap is a planner call.** Currently `dashboard.astro` doesn't import `Topbar.astro`. S-01 should either mount the topbar in dashboard.astro directly or extend `Layout.astro` to be auth-aware. Either is fine; the second affects every authed page (including future `/session/*`), so it's the more durable choice.

## Historical Context (from prior changes)

**F-01 archive — [context/archive/2026-05-29-sessions-data-foundation/](../../archive/2026-05-29-sessions-data-foundation/):**

- [plan-brief.md](../../archive/2026-05-29-sessions-data-foundation/plan-brief.md) — decision matrix: anticipating-but-nullable, server-stored `started_at`, closed `energy_level` enum, partial unique index on NULL-owner lookup rows, no admin policy, no Realtime.
- [plan.md](../../archive/2026-05-29-sessions-data-foundation/plan.md) — 5-phase implementation including the rationale for `topic_id` / `material_format_id` / `timer_mode` / `note` nullability and `topics` shipping empty.
- [reviews/impl-review.md](../../archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md) — F2 finding led to the post-archive DELETE-policy drop migration; F1 was the eslint-ignore for generated types. Both resolved.

**Landing page archive — [context/archive/2026-06-18-landing-page/](../../archive/2026-06-18-landing-page/):**

- Not directly load-bearing for S-01, but it established the "Focus Fuels Greatness" palette in [global.css](../../../src/styles/global.css) and the `Welcome.astro` / `Topbar.astro` precedent. S-01 inherits the visual system.

**Documentation drift to flag:** [context/foundation/lessons.md](../../foundation/lessons.md) is currently empty even though F-01's impl-review and the DELETE-drop migration both reference the lesson "RLS policies must enforce business-rule immutability, not the UI". Not blocking for S-01 — the rule is encoded in the DB and tests — but worth surfacing during S-01's own lesson harvest.

## Related Research

None yet. This is the first research artifact under [context/changes/first-session-capture-loop/](.).

## Open Questions

Carried from the roadmap S-01 entry ([roadmap:89-91](../../foundation/roadmap.md)) and surfaced here for the planner:

1. **Timer-resilience strategy.** Server-stored `started_at` + reconcile-from-wall-clock on return, OR client-side timestamp + `visibilitychange` listener? F-01 supports both via `started_at NOT NULL` and `ended_at NULL` while running. Owner: implementer at `/10x-plan` time.
2. **Audible cue strategy.** Which chime, which file format, where to source it (CC0 / public domain), how to prime the audio element so browsers don't block autoplay at focus-end. Owner: implementer.
3. **History view: separate route or inline on dashboard?** PRD/roadmap is silent; the index makes either cheap. The dashboard-inline option keeps the authed app to two pages (dashboard + active session), which favors the Guardrail "≤ 3 taps to running timer." Owner: planner.
4. **Authed shell: mount Topbar in dashboard.astro, or extend Layout.astro to be auth-aware?** Affects every future authed page (S-02/S-03/S-04). Planner call.
5. **Free-text note in S-01 or deferred to S-04?** Roadmap maps FR-014 nominally to S-04, but the schema column is ready and the post-session screen exists in S-01. Including it costs ~one textarea + a few characters of zod; excluding it keeps S-01's surface honest to "north star, smallest end-to-end." Planner call.
