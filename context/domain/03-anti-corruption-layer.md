---
title: PomoSapiens - Anti-Corruption Layer (Supabase seam)
created: 2026-07-28
type: refactor-plan
---

# PomoSapiens - Anti-Corruption Layer

> A **plan, not an implementation**. No production code is changed here. Every claim is cited to `file:line`
> and verified against the tree. The goal is to name the worst leaking external dependency, prove where it
> crosses layer boundaries, and design one domain-owned seam (an ACL) that becomes the *only* place that
> knows the dependency's shape.

---

## Step 0 - Discovered context

**Base documents read:**

- [context/foundation/tech-stack.md](../foundation/tech-stack.md) - the 10x Astro Starter with **"bundled database/auth/storage"** ([tech-stack.md:24](../foundation/tech-stack.md#L24)). The stack markets the DB/auth vendor as an interchangeable, batteries-included block, but **nowhere in the PRD is Supabase declared explicitly swappable** (a grep for swap/replace/vendor/portability over `prd.md` returns nothing). So the intent-vs-code signal is *soft*: the starter frames the vendor as a bundled commodity, yet the code welds it into every layer.
- [context/foundation/arch.md](../foundation/arch.md) - §8 already names a partial seam: *"One factory, typed `SupabaseClient<Database>`; returns `null` when unconfigured"* ([arch.md:574](../foundation/arch.md#L574)). That factory centralizes **client construction** but not **client usage**, **query shape**, **row types**, or **vendor error codes** - those still leak (Step 1).
- [context/domain/01-domain-distillation.md](01-domain-distillation.md) and [02-invariant-aggregate-refactor.md](02-invariant-aggregate-refactor.md) - prior docs in this series; this is `03`.

**Stack:** Astro 6 SSR + React 19 islands, Tailwind 4, deployed to Cloudflare Workers. Persistence + identity: **Supabase** (Postgres + RLS + Auth).

**External runtime dependencies (from [package.json](../../package.json)):** `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `recharts`, `@uiw/react-color`, `lucide-react`, `radix-ui`.

**Layers of code:** middleware (`src/middleware.ts`) → SSR pages (`src/pages/**/*.astro`) → API routes (`src/pages/api/**`) → request plumbing + domain vocabulary (`src/lib/**`) → generated DB types (`src/db/database.types.ts`) → client islands (`src/components/**`).

---

## Step 1 - Leaking dependencies identified

Three external deps were checked for boundary leakage. Files that "know" each dependency today:

### Candidate A - Supabase (`@supabase/*` + generated `Database` types)

Supabase leaks along **four distinct channels**, across five layers.

**Channel 1 - client construction / SDK calls** (`createClient`, `.from()`, `.auth.*`):

| File:line | Layer | Leak |
| --- | --- | --- |
| [src/lib/supabase.ts:1,10](../../src/lib/supabase.ts#L1) | plumbing | `createServerClient`, `parseCookieHeader`, `createServerClient<Database>` |
| [src/middleware.ts:2,17](../../src/middleware.ts#L2) | middleware | `createClient`, `supabase.auth.getUser()` |
| [src/pages/dashboard.astro:10,20](../../src/pages/dashboard.astro#L10) | SSR page | `.from("sessions").select(...)` |
| [src/pages/timeline.astro:8,18](../../src/pages/timeline.astro#L8) | SSR page | `.from("sessions").select(...)` |
| [src/pages/session/[id].astro:13,23](../../src/pages/session/[id].astro#L13) | SSR page | `.from("sessions").select(...)` |
| [src/pages/api/sessions/index.ts:32](../../src/pages/api/sessions/index.ts#L32) | API | `.from("sessions").insert(...)` |
| [src/pages/api/sessions/[id].ts:50,92,110,151](../../src/pages/api/sessions/%5Bid%5D.ts#L50) | API | four `.from("sessions")` calls |
| [src/pages/api/sessions/[id]/continue.ts:22](../../src/pages/api/sessions/%5Bid%5D/continue.ts#L22) | API | `.from("sessions")` |
| [src/pages/api/topics/index.ts:18,43](../../src/pages/api/topics/index.ts#L18) | API | `.from("topics")` |
| [src/pages/api/topics/[id].ts:34](../../src/pages/api/topics/%5Bid%5D.ts#L34) | API | `.from("topics")` |
| [src/pages/api/material-formats/index.ts:19,46](../../src/pages/api/material-formats/index.ts#L19) | API | `.from("material_formats")` |
| [src/pages/api/material-formats/[id].ts:34](../../src/pages/api/material-formats/%5Bid%5D.ts#L34) | API | `.from("material_formats")` |
| [src/pages/api/user-presets/index.ts:18](../../src/pages/api/user-presets/index.ts#L18) | API | `.from("user_presets")` |
| [src/pages/api/user-presets/[slot].ts:30](../../src/pages/api/user-presets/%5Bslot%5D.ts#L30) | API | `.from("user_presets")` |
| [src/pages/api/auth/{signin,signup,signout,oauth,callback}.ts:2](../../src/pages/api/auth/signin.ts#L2) | API | `createClient` + `supabase.auth.*` |

**Channel 2 - generated `Database` type coupling** (the schema shape reaches the UI):

- [src/lib/types.ts:1,25](../../src/lib/types.ts#L1) imports `Database` and derives the app's central view type from a raw table Row:
  ```ts
  type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];      // types.ts:25
  export type SessionListItem = Pick<SessionRow, "id" | "started_at" | ...> & {...};  // types.ts:27
  ```
- `@/lib/types` is then imported by **~25 client component/lib files** - e.g. [SessionList.tsx:3](../../src/components/session/SessionList.tsx#L3), [SessionTile.tsx:8](../../src/components/session/SessionTile.tsx#L8), [TimelineApp.tsx:14](../../src/components/timeline/TimelineApp.tsx#L14), [DayRow.tsx:6](../../src/components/timeline/DayRow.tsx#L6), [FocusRatingChartTooltip.tsx:4](../../src/components/dashboard/FocusRatingChartTooltip.tsx#L4), plus `src/lib/local/*` and `src/lib/timeline/*`. So the **Postgres column shape structurally reaches every history/timeline view**.
- [src/pages/api/topics/[id].ts:5,29](../../src/pages/api/topics/%5Bid%5D.ts#L5) and [src/pages/api/material-formats/[id].ts:5,29](../../src/pages/api/material-formats/%5Bid%5D.ts#L5) build update objects typed as the vendor's `TablesUpdate<"topics">` / `TablesUpdate<"material_formats">`.

> **Honest boundary note.** These are `import type` (erased at build), so this is a **design-time / structural** coupling, not a runtime client-bundle leak. The `@supabase/*` *runtime* imports are all server-side (plumbing + middleware + API + SSR frontmatter); the client talks to the server only over `fetch` (`src/lib/session/persistence.ts` imports domain types, never Supabase). So the classic "same SDK called on both sides of the client/server boundary" signal is **absent** - I am not going to claim it. The leak here is (a) the schema shape bleeding into UI types and (b) vendor query/error shapes duplicated across the server layers.

**Channel 3 - Postgres error taxonomy in the API layer** (handlers know raw SQLSTATE codes):

- `error.code === "23505"` (unique violation) hand-decoded in [topics/index.ts:49](../../src/pages/api/topics/index.ts#L49), [topics/[id].ts:42](../../src/pages/api/topics/%5Bid%5D.ts#L42), [material-formats/index.ts:52](../../src/pages/api/material-formats/index.ts#L52), [material-formats/[id].ts:42](../../src/pages/api/material-formats/%5Bid%5D.ts#L42).
- `error.code === "23514"` (check violation) in [user-presets/[slot].ts:44](../../src/pages/api/user-presets/%5Bslot%5D.ts#L44).
- Raw `error.message` from the driver forwarded into JSON responses in ~15 handlers (e.g. [sessions/index.ts:48](../../src/pages/api/sessions/index.ts#L48)).

**Channel 4 - duplicated query reconstruction** (the "shape of a SessionListItem read" rebuilt by hand):

- The **same PostgREST select string** is duplicated **verbatim** in two files:
  - [dashboard.astro:22-23](../../src/pages/dashboard.astro#L22)
  - [timeline.astro:20-22](../../src/pages/timeline.astro#L20)
  ```
  "id, started_at, energy_level, duration_seconds, focus_rating, ended_at, timer_mode, note,
   topic_id, material_format_id, topic:topics(name), material_format:material_formats(name)"
  ```
  A third, narrower variant lives in [session/[id].astro:25-27](../../src/pages/session/%5Bid%5D.astro#L25). Any column rename must be edited in every copy and kept in sync with `SessionListItem` by hand.

### Candidate B - `@uiw/react-color`

- [ColorWheelDialog.tsx:2](../../src/components/timeline/ColorWheelDialog.tsx#L2) (`Wheel`, `ShadeSlider`, `hsvaToHex`, `hexToHsva`, `HsvaColor`), [useTimelineColors.ts:2](../../src/lib/timeline/useTimelineColors.ts#L2) (`validHex`). **2 files, one layer (timeline client), one feature.** Contained.

### Candidate C - `recharts`

- [FocusRatingChart.tsx:1](../../src/components/dashboard/FocusRatingChart.tsx#L1) only, `client:only`. **1 file, isolated.** Not a leak.

---

## Step 2 - Classification and selection of #1

| Axis | Supabase | `@uiw/react-color` | `recharts` |
| --- | --- | --- | --- |
| Files / layers touched | **~28 files, 5 layers** | 2 files, 1 layer | 1 file, 1 layer |
| Type coupling into UI | **yes** (schema → `SessionListItem` → ~25 files) | no | no |
| Vendor error/query duplication | **yes** (SQLSTATE codes + select string x2) | no | no |
| Cost/risk to replace today | **high** (auth + persistence + RLS + types) | low | low |
| Declared interchangeable? | soft (starter "bundled" block; not PRD-locked) | no | no |

**Selection: Supabase is the #1 leak.** It is the only dependency that is (a) present in every server layer *and* (b) structurally reaches the client through generated types *and* (c) duplicates vendor query/error shapes across files. The other two are single-feature, single-layer, and already effectively contained. The remainder of this plan designs one ACL for the Supabase seam. `@uiw/react-color` and `recharts` need no action.

---

## Step 3 - Diagnosis

**3a. Duplication (verbatim).** The `sessions` read shape is reconstructed by hand in two pages:

```
dashboard.astro:22   .select("id, started_at, energy_level, duration_seconds, focus_rating, ended_at,
                               timer_mode, note, topic_id, material_format_id,
                               topic:topics(name), material_format:material_formats(name)")
timeline.astro:20    .select("id, started_at, energy_level, duration_seconds, focus_rating, ended_at,
                               timer_mode, note, topic_id, material_format_id,
                               topic:topics(name), material_format:material_formats(name)")
```
These two strings must stay byte-identical to each other *and* stay in sync with `SessionListItem` ([types.ts:27](../../src/lib/types.ts#L27)) - three sources of truth for one read, none of them enforcing the others.

**3b. Boundary leak - schema shape into the view layer.** `SessionListItem` is not a domain type; it is a `Pick` off the generated Postgres Row ([types.ts:25-27](../../src/lib/types.ts#L25)). It then flows into ~25 UI/lib files. A migration that renames or retypes a `sessions` column silently re-types the timeline and dashboard components. The UI depends on the database *physical schema*, not on a domain contract.

**3c. Boundary leak - vendor error taxonomy in handlers.** The API layer decodes Postgres SQLSTATE by hand ([topics/index.ts:49](../../src/pages/api/topics/index.ts#L49) `23505`, [user-presets/[slot].ts:44](../../src/pages/api/user-presets/%5Bslot%5D.ts#L44) `23514`) and forwards raw driver `error.message` to clients. "A topic with that name already exists" is a *domain* fact currently expressed as a magic Postgres constant, repeated in four files.

**3d. Intent vs. code.** arch.md advertises *"One factory ... returns null when unconfigured and all callers handle it"* ([arch.md:574](../foundation/arch.md#L574)). That is real but shallow: the factory hides *construction*, so every one of ~18 call sites still repeats `const supabase = createClient(...); if (!supabase) return 500;` and then speaks raw PostgREST. The stated intent ("one seam") is only met for wiring, not for the vendor's data/error contract.

---

## Step 4 - ACL design

Introduce a domain-owned data-access seam under **`src/lib/db/`**. Two ideas:

1. **Domain types stop deriving from `Database`.** `SessionListItem` becomes a hand-written domain contract; the *mapping* from the Postgres Row to it lives in one adapter file.
2. **A narrow repository port** per aggregate; the rest of the app depends on the port, never on `@supabase/*` or `@/db/database.types`.

### 4a. Domain value objects (no vendor dependency)

`src/lib/types.ts` - drop the `Database` import; define the shape the domain actually uses:

```ts
// src/lib/types.ts  (after)  -- ZERO import of @/db/database.types
export interface SessionListItem {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_level: EnergyLevel;
  duration_seconds: number | null;
  focus_rating: number | null;
  timer_mode: Mode;
  note: string | null;
  topic_id: string | null;
  material_format_id: string | null;
  topic: { name: string } | null;
  material_format: { name: string } | null;
}
```
The field list is identical to today's `Pick`, so no downstream UI file changes shape - only the *source* of the type changes from "Postgres Row" to "domain contract". A single mapper (4c) keeps them aligned, guarded by the type checker.

### 4b. The narrow port

```ts
// src/lib/db/ports.ts  -- domain-facing, vendor-free
export type RepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepoError };

export type RepoError =
  | { kind: "duplicate_name" }      // was Postgres 23505
  | { kind: "check_violation" }     // was Postgres 23514
  | { kind: "not_found" }
  | { kind: "unconfigured" }        // was createClient() === null
  | { kind: "unknown"; detail: string };

export interface SessionRepository {
  listForUser(userId: string, limit?: number): Promise<RepoResult<SessionListItem[]>>;
  getForRunner(id: string, userId: string): Promise<RepoResult<SessionRunnerRow | null>>;
  create(userId: string, input: CreateSessionInput): Promise<RepoResult<{ id: string; started_at: string }>>;
  end(id: string, userId: string, patch: EndSessionPatch): Promise<RepoResult<"updated" | "conflict">>;
  update(id: string, userId: string, patch: UpdateSessionPatch): Promise<RepoResult<"updated" | "conflict">>;
  continueAsCountUp(id: string, userId: string): Promise<RepoResult<"updated" | "conflict">>;
}
```
Sibling ports `CatalogRepository` (topics + material_formats: `list`, `create`, `rename`, `archive`), `PresetRepository`, and `AuthGateway` (`getUser`, `signInWithPassword`, `signUp`, `signOut`, `signInWithOAuth`, `exchangeCodeForSession`) follow the same shape. Callers depend only on these.

### 4c. The adapter (the ONLY vendor-aware file group)

```
src/lib/db/
  ports.ts            # interfaces + RepoResult/RepoError  (vendor-free)
  supabase/
    client.ts         # moved verbatim from src/lib/supabase.ts (createServerClient)
    columns.ts        # export const SESSION_LIST_COLUMNS = "id, started_at, ..."  (the ONE select string)
    errors.ts         # mapPgError(error): RepoError   -- 23505->duplicate_name, 23514->check_violation
    mappers.ts        # rowToSessionListItem(row): SessionListItem
    sessionRepo.ts    # implements SessionRepository via supabase.from("sessions")
    catalogRepo.ts    # implements CatalogRepository
    presetRepo.ts     # implements PresetRepository
    authGateway.ts    # implements AuthGateway via supabase.auth.*
    index.ts          # factory: makeRepositories(headers, cookies) -> { sessions, catalog, presets, auth } | null
```

Adapter pseudocode (error + query shape captured once):

```ts
// supabase/columns.ts
export const SESSION_LIST_COLUMNS =
  "id, started_at, energy_level, duration_seconds, focus_rating, ended_at, timer_mode, note, " +
  "topic_id, material_format_id, topic:topics(name), material_format:material_formats(name)";

// supabase/errors.ts
export function mapPgError(e: { code?: string; message: string }): RepoError {
  if (e.code === "23505") return { kind: "duplicate_name" };
  if (e.code === "23514") return { kind: "check_violation" };
  return { kind: "unknown", detail: e.message };
}

// supabase/sessionRepo.ts
async listForUser(userId, limit) {
  const q = this.sb.from("sessions").select(SESSION_LIST_COLUMNS)
             .eq("user_id", userId).order("started_at", { ascending: false });
  const { data, error } = limit ? await q.limit(limit) : await q;
  if (error) return { ok: false, error: mapPgError(error) };
  return { ok: true, value: data.map(rowToSessionListItem) };
}
```

Callers become vendor-free. Example - `dashboard.astro`:

```ts
const repos = makeRepositories(Astro.request.headers, Astro.cookies);
const res = repos ? await repos.sessions.listForUser(user.id, 50)
                  : { ok: false, error: { kind: "unconfigured" } } as const;
const sessions = res.ok ? res.value : [];
const dbError  = res.ok ? null : messageFor(res.error);   // domain->copy mapping, not error.message
```

Example - `topics/[id].ts` PATCH:

```ts
const res = await repos.catalog.rename("topics", id, user.id, parsed.data);
if (!res.ok && res.error.kind === "duplicate_name")
  return Response.json({ error: "A topic with that name already exists" }, { status: 409 });
```
The magic `23505` and the copy string now live in exactly one place each (`errors.ts` + a small message map).

---

## Step 5 - Proof of isolation + before/after

**Replacing Supabase after the ACL** touches only `src/lib/db/supabase/**` (+ `src/lib/db/index.ts` wiring). It does **not** touch:

- **Tables / RLS** - unchanged; `supabase/migrations/**` is orthogonal.
- **Wire contracts** - API JSON responses (`{ id, started_at }`, `{ ok: true }`, `{ error }`) are already hand-shaped in handlers and stay identical.
- **UI** - components import `SessionListItem` from `@/lib/types`, which no longer references the vendor. Zero component edits.
- **Domain vocabulary** - `EnergyLevel`, `Mode`, `SessionListItem` are vendor-free.

**Before → after (duplication):**

| Concern | Before | After |
| --- | --- | --- |
| `sessions` select string | 2 verbatim copies (dashboard.astro:22, timeline.astro:20) + 1 variant | one `SESSION_LIST_COLUMNS` constant |
| Postgres `23505` | 4 handlers | one `mapPgError` |
| `SessionListItem` type source | `Database["public"]["Tables"]["sessions"]["Row"]` | hand-written domain type + one mapper |
| `createClient(...) + null check` | ~18 call sites | one `makeRepositories()` factory |

**Before → after (the view layer):** UI receives ready-made domain data. `SessionList`/`TimelineApp` already take a `SessionListItem[]` prop - after the ACL that type is a *domain* contract, not a Postgres Row projection, so a column rename can no longer silently re-type the timeline.

**Contract questions resolved from the vendor's own docs (encode in the ACL, not the API layer):**

- **Unique-violation code** - Postgres/PostgREST surfaces unique violations as SQLSTATE `23505`; check violations as `23514`. These belong in `supabase/errors.ts`. If the vendor changes, only that file re-maps.
- **`.maybeSingle()` vs `.single()`** semantics (null vs. throw on zero rows) are a PostgREST concern; encapsulate the choice inside each repo method's return (`... | null`), so callers branch on domain state, not driver behavior.

---

## Step 6 - Verification and phased plan

**Success criterion (grep-checkable):** after the refactor,
```
grep -rE "@supabase/|@/db/database\.types|\.from\(|error\.code|createServerClient" src \
  | grep -v "src/lib/db/"
```
returns **nothing** (today it returns ~28 files across middleware, pages, and api).

**Files that know Supabase today → after:**

| Layer | Today | After |
| --- | --- | --- |
| plumbing | supabase.ts | `src/lib/db/supabase/client.ts` (moved) |
| middleware | middleware.ts (`.auth.getUser`) | `AuthGateway` port |
| SSR pages | dashboard / timeline / session/[id] | none (use `SessionRepository`) |
| API routes | ~14 files (`.from`, `error.code`, `TablesUpdate`) | none (use repos) |
| domain types | types.ts (`Database` import) | none (vendor-free) |
| **vendor-aware total** | **~28 files** | **`src/lib/db/supabase/**` only** |

**Phasing** (matches the project's per-change convention: one change folder under `context/changes/<id>/` with plan → implement → tests; keep each phase green and PR-sized):

1. **Phase 1 - types decoupling (zero behavior change).** Rewrite `SessionListItem` as a hand-written type ([types.ts:25-27](../../src/lib/types.ts#L25)); add a `rowToSessionListItem` mapper + `SESSION_LIST_COLUMNS`; point dashboard/timeline at the constant + mapper. Verify: `npm run lint`, `npm run build`, `npm test`, existing e2e for dashboard/timeline stay green.
2. **Phase 2 - `SessionRepository`.** Introduce the port + Supabase adapter; migrate `sessions` reads/writes (3 SSR pages + `api/sessions/*`) behind it. This is the largest leak surface. Verify: API-contract integration tests (`tests/integration/api`) unchanged; pgTAP RLS suites (`npm run db:test`) unaffected (RLS untouched).
3. **Phase 3 - `CatalogRepository` + `PresetRepository`.** Move `topics`/`material_formats`/`user_presets` handlers behind ports; centralize `23505`/`23514` in `mapPgError`; delete `TablesUpdate` imports.
4. **Phase 4 - `AuthGateway`.** Move `middleware.ts` + `api/auth/*` onto the gateway; retire `src/lib/supabase.ts` (now `src/lib/db/supabase/client.ts`). Run the grep gate above as the exit check.

**Tradeoff, stated honestly (simplicity-first).** A full four-port hexagon is more structure than a 3-week solo MVP strictly needs. If scope must shrink, **Phase 1 alone captures the highest-value, lowest-risk win** (kills the type coupling into ~25 UI files and the duplicated select string) and can ship independently; Phases 2-4 are the vendor-portability payoff and can wait until an actual second backend or vendor-migration pressure exists. Do not build the ports speculatively beyond what a phase needs.

---

## Summary

Supabase is PomoSapiens' worst-leaking dependency: it is present in five layers (~28 files) and leaks through four channels - SDK/`.from()` calls across middleware, SSR pages and API routes; the generated `Database` type structurally reaching ~25 UI files via `SessionListItem`; hand-decoded Postgres SQLSTATE codes (`23505`, `23514`) in the API layer; and a verbatim-duplicated PostgREST select string in `dashboard.astro` and `timeline.astro`. The existing "one factory" seam ([arch.md:574](../foundation/arch.md#L574)) hides construction only, so the vendor's data and error contracts still bleed everywhere. The fix is a domain-owned ACL under `src/lib/db/`: vendor-free repository ports plus a single Supabase adapter that owns the client, the one `SESSION_LIST_COLUMNS` constant, the row→domain mappers, and the SQLSTATE→domain-error map. After it, `SessionListItem` is a domain contract (not a Postgres Row projection), the UI is untouched by column renames, and swapping the backend touches only `src/lib/db/supabase/**` - grep-verifiable. The recommended, honest scope is to ship Phase 1 (type decoupling) first for the biggest low-risk win, and treat the remaining ports as portability insurance to add under real pressure rather than speculatively.
