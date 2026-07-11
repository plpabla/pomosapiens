---
date: 2026-07-11T00:00:00-00:00
researcher: Claude Code
git_commit: ba0dacee81524104328b667631a1cc6e2c38521b
branch: anonymous-sessions
repository: pomosapiens
topic: "Anonymous session capture backed by localStorage (S-08, slice A only)"
tags: [research, codebase, anonymous-sessions, middleware, rls, capture-loop, localStorage]
status: complete
last_updated: 2026-07-11
last_updated_by: Claude Code
---

# Research: Anonymous session capture backed by localStorage (S-08, slice A only)

**Date**: 2026-07-11
**Researcher**: Claude Code
**Git Commit**: ba0dacee81524104328b667631a1cc6e2c38521b
**Branch**: anonymous-sessions
**Repository**: pomosapiens

## Research Question

Per `context/changes/anonymous-sessions/frame.md` (produced by `/10x-frame`), slice A of roadmap S-08 needs a plan for: letting an unauthenticated visitor run the existing S-01 capture loop (energy → timer → rating → note) end-to-end from `/`, with topic/material-format/preset selection (S-02/S-03), persisted entirely to `localStorage` across all four user-scoped tables (`sessions`, `topics`, `material_formats`, `user_presets`), and shown in a local, session-scoped history view mirroring the signed-in dashboard. No sync-to-account and no server-side row — that's split into S-09 (`anonymous-session-sync`).

This research answers the implementation-level questions `/10x-plan` needs but the frame brief intentionally left open: exactly where every current fetch/persistence call lives, the exact column-level shape of the four tables, exactly which gates (middleware, per-route auth checks, RLS) block an anonymous visitor today, and how much of the existing dashboard/history UI is reusable client-side.

## Summary

Four independent things currently make an anonymous capture loop impossible, and all four need to change together — this is not a single-file swap:

1. **`src/middleware.ts`** hard-redirects any request whose path starts with `/session/` (or `/dashboard`, `/topics`, `/formats`, `/presets`) to `/auth/signin` when `locals.user` is null, and separately forces `/` itself to redirect *authenticated* users to `/dashboard` — so today's `/` can never simultaneously be the anon capture entry point and the authed-redirect target without also editing `AUTHED_REDIRECTS`.
2. **Every API route** (`/api/sessions/*`, `/api/topics/*`, `/api/material-formats/*`, `/api/user-presets/*`) does its own `if (!context.locals.user) return 401` check, independent of middleware — these are unreachable for an anon visitor regardless of routing, and aren't meant to be reachable (slice A writes to localStorage, not these endpoints).
3. **RLS** on all four tables has zero `TO anon` policies (confirmed by reading every migration) — a stray `GRANT ... TO anon` exists on all four tables specifically as an intentional "let RLS itself deny, not a bare privilege error" test-coverage device, not a partial opening. There is no `signInAnonymously()` call anywhere in the codebase, so "anonymous visitor" today is simply `locals.user === null`, not a Supabase Auth anonymous session.
4. **Every persistence touchpoint in the capture loop calls `fetch`/`fetchJson` directly** — there is no repository/adapter seam. Six call sites would need to become swappable (Supabase vs. localStorage): `useSessionStart.ts:40` (create), `SessionRunner.tsx:93` (end + rate), `useCatalog.ts:19-22` (topics/formats read), `EnergyPicker.tsx:31` (presets read), `usePresetEditor.ts:23,68` (presets read/write), plus three dashboard-only mutation call sites (`AbandonButton`, `DeleteSessionButton`, `EditSessionDialog`) that are likely out of scope for slice A's *capture* path but relevant if the local history view offers the same actions.

On the positive side, the two presentational history components (`SessionList`, `FocusRatingChart`) are pure `props → JSX` with no internal fetching — they can be reused verbatim for a local history view as long as local data is shaped to match `SessionListItem` / the chart's minimal shape. And one existing localStorage precedent (`useLastMode.ts`) already establishes the SSR-safe, fail-open pattern to follow, though it's a single scalar, not a collection store.

## Detailed Findings

### 1. Auth-gating: three independent, stacked gates

- **Middleware prefix gate** (`src/middleware.ts:4`): `PROTECTED_ROUTES = ["/dashboard", "/session/", "/topics", "/formats", "/presets"]`, matched via `.some(route => pathname.startsWith(route))` (`src/middleware.ts:30`). Note the trailing slash on `"/session/"` — it matches `/session/new` and `/session/[id]` but not a bare `/session`.
- **Authed-redirect map** (`src/middleware.ts:5-9`): exact-pathname map `{ "/": "/dashboard", "/auth/signin": "/dashboard", "/auth/signup": "/dashboard" }`, checked *before* the protected-route check (`src/middleware.ts:23-28`). Today `/` always bounces authenticated visitors to `/dashboard` — so `/` currently only ever renders for anonymous visitors already, which is favorable for using it as the anon-capture entry point, but the map itself will need to stay in sync with whatever new anon routes are added.
- **`context.locals.user`** (`src/middleware.ts:11-21`): set via `supabase.auth.getUser()`; resolves to `null` both when there's no session cookie *and* when Supabase env vars are missing — these two cases are indistinguishable at this layer.
- **`/api/*` is not gated by middleware at all** — each of the ~10 API route handlers under `src/pages/api/{sessions,topics,material-formats,user-presets}/` does its own `if (!context.locals.user) return 401`. Since slice A's capture path is localStorage-only, these routes are simply not called by the anon flow (no change needed to them for slice A).
- **RLS**: `sessions`, `topics`, `material_formats`, `user_presets` each have exactly the CRUD-appropriate set of policies, every one scoped `TO authenticated` only (verified by reading all 8 migration files in full). No `CREATE POLICY ... TO anon` exists anywhere in the repo. Two migrations add `GRANT ... TO anon` at the table-grant level (`supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql:29-31`, `supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql:54`) with an explicit comment that this is so RLS denial (not a bare privilege error) is what's exercised — i.e., deliberately inert, not a half-open door.
- **Net implication for planning**: since slice A does not write to Supabase at all, RLS/API-route changes are **out of scope** for slice A — they only become relevant for S-09 (sync) or if a future slice wants Supabase-backed anonymous auth (`signInAnonymously()`, unused anywhere today). The only gate slice A must actually change is **middleware's `PROTECTED_ROUTES`/`AUTHED_REDIRECTS`**, by introducing a new, unprotected route (or by carving `/` itself into a dual-purpose page) for the anon capture UI.

### 2. Capture-loop persistence touchpoints (everything that currently calls `fetch`)

No existing repository/adapter abstraction exists in the codebase (confirmed: zero hits for "repository"/"adapter" under `src/`). Every component/hook calls `fetch` or the thin `fetchJson` helper (`src/lib/api/fetchJson.ts`) directly. The complete list of touchpoints a swappable-persistence design must cover:

| Touchpoint | File:line | Call | Notes |
|---|---|---|---|
| Create session | `src/lib/session/useSessionStart.ts:40-51` | `POST /api/sessions` via `fetchJson` | Body: `energy_level, topic_id, material_format_id, timer_mode, planned_focus_seconds, planned_break_seconds`. Returns `{id}` (also `started_at`, unused client-side); navigates to `/session/{id}`. |
| End + rate session | `src/components/session/SessionRunner.tsx:89-109` | `PATCH /api/sessions/{id}` via raw `fetch` | Body: `focus_rating, ended_at, note`. Only network call inside `SessionRunner` — no call on start, stop-early, or abandon from within this component. |
| Read topics + formats | `src/lib/session/useCatalog.ts:16-33` | `GET /api/topics`, `GET /api/material-formats` via `fetchJson`, parallel | Filters archived items client-side. Also reused by `EditSessionDialog.tsx:29` (post-hoc edit, likely out of slice-A scope). |
| Read presets (pre-session) | `src/components/session/EnergyPicker.tsx:31-42` | `GET /api/user-presets` via raw `fetch` | Falls back to `DEFAULT_PRESETS` (`src/lib/timer/preset-defaults.ts:1-5`) on failure/before load. |
| Read/write presets (editor) | `src/lib/session/usePresetEditor.ts:23` (GET), `:68-71` (PUT per slot) | via `fetchJson` | Preset *editing* is a separate settings feature; may be out of slice-A's minimum scope (roadmap Unknown: "do S-04/S-07-equivalents apply to anon sessions in v1?"). |
| Dashboard mutations (likely out of slice-A scope, but same endpoint family) | `AbandonButton.tsx:14-17` (DELETE), `DeleteSessionButton.tsx:18-21` (DELETE), `EditSessionDialog.tsx:51-63` (PUT) | via `fetchJson`/raw fetch | Relevant only if the local history view offers abandon/edit/delete actions in v1. |

**Components with no persistence of their own** (safe to reuse untouched, only their data source changes): `FocusRating.tsx` (pure `onSubmit(rating, note)` prop, no fetch — `:10`), `CatalogSelects.tsx` (`TopicSelect`/`MaterialFormatSelect`, pure props), `ModePicker.tsx` (pure props), `EnergyLevelPicker.tsx` (pure props, energy levels are a hardcoded constant, never fetched).

**Existing localStorage precedent**: `src/lib/session/useLastMode.ts` (42 lines) — the *only* current localStorage usage in the app. Pattern to reuse: `useSyncExternalStore` with an SSR-safe `getServerSnapshot` returning a fixed default (avoids hydration mismatch, since the server has no `window`), all reads/writes wrapped in `try/catch` fail-open (private-browsing safety), and a module-level listener `Set` to fan out change notifications within a tab (localStorage has no native same-tab change event). This is single-scalar, not a collection store — the session-history store will need to extend this pattern to arrays/records.

**Design implication**: given six distinct touchpoints across four files/hooks, a single shared storage-strategy abstraction (e.g. `createSession`, `endSession`, `getCatalog`, `getPresets`) selected by auth state is strongly preferable to branching each call site individually — this mirrors the frame brief's Hypothesis 4 finding almost exactly, now with the full call-site inventory needed to scope the refactor.

### 3. Exact schema shape for the four localStorage-mirrored tables

Full column/constraint/RLS detail extracted from all 8 files in `supabase/migrations/` (chronological): `20260531182506_sessions_data_foundation.sql`, `20260601120000_drop_sessions_delete_policy.sql`, `20260627140018_add_archived_at_to_topics_and_formats.sql`, `20260630000000_user_presets_and_session_audit_cols.sql`, `20260701000000_drop_user_presets_delete_policy.sql`, `20260701000001_fix_user_presets_rls_operand_order.sql`, `20260704055820_timer-presets.sql` (empty/no-op), `20260706120000_add_sessions_delete_policy.sql`.

- **`sessions`**: `id, user_id, started_at, ended_at, duration_seconds (GENERATED, computed from started_at/ended_at — must be computed client-side in localStorage too, not stored-and-trusted), energy_level (enum low|medium|high), focus_rating (1-5, nullable), topic_id (FK, nullable, ON DELETE SET NULL), material_format_id (FK, nullable, ON DELETE SET NULL), timer_mode (preset_1|preset_2|preset_3|count_up, nullable), note (nullable), planned_focus_seconds (60-14400, nullable), planned_break_seconds (0-3600, nullable), created_at, updated_at`.
- **`topics`**: `id, owner_id (nullable), name, created_at, updated_at, archived_at (nullable)`. `UNIQUE(owner_id, name)` plus a partial unique index on `(name) WHERE owner_id IS NULL` for the default-row slot. **Ships empty — no seeded default topics** (explicit migration comment: "topics: per-user lookup; ships empty, S-02 owns first-row UX").
- **`material_formats`**: same shape as `topics` plus the same partial-unique pattern. **Seeded with 5 default rows** (`owner_id = NULL`): Video, Reading, Writing code, Drilling problems, Other (`20260531182506_sessions_data_foundation.sql:115-120`) — IDs are non-deterministic (`gen_random_uuid()` default), only the 5 names + `owner_id = NULL` are guaranteed. **A local visitor needs a hardcoded local equivalent of these 5 default rows**, since there's no server seed to read from.
- **`user_presets`**: `id, user_id, slot (1|2|3, UNIQUE(user_id, slot)), focus_seconds (60-14400), break_seconds (0-3600), created_at, updated_at`. **No DB seed** — defaults live in app code (`src/lib/timer/preset-defaults.ts:1-5`: slot 1 = 25/5 min, slot 2 = 45/10, slot 3 = 90/15) and `GET /api/user-presets` merges DB rows over these per-slot. For a single anonymous visitor this collapses to "at most one local row per slot number (1-3), falling back to `DEFAULT_PRESETS` per-slot when absent" — exactly mirroring the existing merge behavior.
- **Zod schemas** (`src/lib/schemas/{session,topic,material-format,user-preset}.ts`) already define the validation rules the API enforces server-side (field names, min/max bounds, nullability) — reusing these same schemas (or a client-safe subset) for localStorage writes keeps the local shape consistent with what S-09's sync will eventually need to reconcile against.
- **Generated types** (`src/db/database.types.ts:42-194`) give the exact `Row`/`Insert`/`Update` TS shapes to mirror; app-level hand-written types in `src/lib/types.ts` (`Topic`, `MaterialFormat`, `Preset`, `SessionListItem`, `EnergyLevel`, `Mode`) are the client-facing shapes already used by `SessionList`/`FocusRatingChart` — matching these exactly is what makes those two components reusable as-is.

This directly informs the roadmap's own listed Unknown: "local key/ID scheme for topics/material_formats/presets (name-keyed vs. client-generated UUID) — decided here because it directly determines the merge algorithm S-09 will need." The existing schema's `UNIQUE(owner_id, name)` + partial-unique-on-NULL-owner pattern for topics/material_formats suggests name-keying (or at least name-uniqueness-checking) is the natural fit for the local store too, since that's what S-09's merge will have to reconcile against regardless.

### 4. History view reuse

- `dashboard.astro:20-32` does an SSR Supabase query (`sessions` joined with `topic:topics(name)`, `material_format:material_formats(name)`, scoped to `user_id`, ordered desc, limit 50) and passes the result as `sessions` prop into `SessionList` (`client:load`, line 60) and a derived `ratedSessions` (filtered/reversed for chronological order) into `FocusRatingChart` (`client:only="react"`, line 57).
- **`SessionList.tsx`** and **`FocusRatingChart.tsx`** are both pure `props → JSX` with zero internal fetching — confirmed by reading both in full. They can be reused verbatim for a local history view, fed by an array built from localStorage, as long as it matches `SessionListItem` (`src/lib/types.ts:27-42`) and the chart's minimal `{started_at, focus_rating}[]` shape respectively.
- **Caveat**: `SessionTile.tsx` (rendered per-row inside `SessionList`) includes `AbandonButton` and `CompletedSessionActions`, which call `/api/sessions/*` — these would need to be swapped, stubbed, or omitted for a local-only session view, since there's no server-side row to mutate. This bears on the roadmap's own Unknown: "do S-04 (notes/chart) and S-07 (edit/delete) apply to anonymous sessions in v1, or is this slice capture + tagging + basic history only?" — the chart reuses cleanly either way, but edit/delete/abandon actions on local sessions are a separate design decision (localStorage mutation vs. omitted entirely for v1).
- `context/foundation/arch.md:5` states the current architectural stance explicitly: "the server owns truth, the React islands own only the interactive UX" — slice A is a deliberate, first-of-its-kind exception to this stance and should be called out as such in the plan, since arch.md documents no client-only data-loading path today.

### 5. Testing implications

- Every existing Playwright e2e spec (`tests/e2e/*.spec.ts`, 8 spec files) depends on `setupTwoUsers()` + `seedAuthCookie()` (`tests/_fixtures/auth.ts`) — a real Supabase Auth user plus a directly-injected `sb-<ref>-auth-token` cookie. **There is no existing anonymous/signed-out fixture anywhere in the test suite.**
- `tests/e2e/seed.spec.ts` is documented as the exemplar pattern all other specs model; `tests/e2e/session-capture.spec.ts` is the closest analog to what an anonymous-capture e2e test would need to cover (full loop: dashboard/entry → energy/topic/format pick → timer → stop/rate → history), but it seeds/asserts via direct DB inserts (`insertSession`, `insertTopic`), which has no equivalent for a localStorage-only flow — an anonymous test would need `page.evaluate(() => localStorage...)` or to drive the UI directly for both setup and assertions.
- This is a genuinely new fixture pattern to build (unauthenticated `browser.newContext()`, no cookie), not an extension of the existing one — worth flagging as its own plan phase rather than assuming it folds into existing spec patterns.

## Code References

- `src/middleware.ts:4-33` — `PROTECTED_ROUTES`, `AUTHED_REDIRECTS`, gating logic, `locals.user` population
- `src/pages/index.astro`, `src/components/Welcome.astro` — current landing page, purely static, no islands
- `src/pages/session/new.astro`, `src/pages/session/[id].astro`, `src/pages/dashboard.astro` — existing authed pages and their own server-side auth/ownership checks
- `src/lib/session/useSessionStart.ts:5-51` — session-create hook, POST call, mode/preset resolution
- `src/components/session/SessionRunner.tsx:10-158` — timer runner, PATCH call at `:89-109`, `useFocusTimer`/`useBreakTimer` (no network calls)
- `src/components/session/FocusRating.tsx:9-60` — pure `onSubmit` prop, no fetch
- `src/lib/session/useCatalog.ts:5-36` — topics/formats fetch hook
- `src/components/session/CatalogSelects.tsx`, `src/components/session/ModePicker.tsx`, `src/components/session/EnergyLevelPicker.tsx` — pure presentational pickers
- `src/lib/session/usePresetEditor.ts` — preset read/write hook
- `src/lib/timer/preset-defaults.ts:1-5` — `DEFAULT_PRESETS` fallback values
- `src/lib/api/fetchJson.ts` — the only shared fetch helper (not a persistence abstraction)
- `src/lib/resource/useCrudResource.ts` — generic CRUD hook (closest thing to a swappable-endpoint pattern, still REST-hardwired)
- `src/pages/api/sessions/index.ts`, `src/pages/api/sessions/[id].ts`, `src/pages/api/topics/{index,[id]}.ts`, `src/pages/api/material-formats/{index,[id]}.ts`, `src/pages/api/user-presets/{index,[slot]}.ts` — all current API routes (out of scope for slice A's write path)
- `src/lib/schemas/{session,topic,material-format,user-preset}.ts` — zod validation schemas defining exact field rules
- `src/db/database.types.ts:42-194` — generated Row/Insert/Update types for all 4 tables
- `src/lib/types.ts` — hand-written client-facing types (`Topic`, `MaterialFormat`, `Preset`, `SessionListItem`, `EnergyLevel`, `Mode`)
- `src/lib/session/useLastMode.ts` — only existing localStorage precedent (SSR-safe, fail-open pattern)
- `src/components/session/SessionList.tsx`, `src/components/session/SessionTile.tsx`, `src/components/dashboard/FocusRatingChart.tsx` — reusable presentational history components
- `supabase/migrations/20260531182506_sessions_data_foundation.sql` — base schema, RLS, seeded material_formats
- `supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql` — archived_at columns, anon grants (inert)
- `supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql`, `20260701000000_drop_user_presets_delete_policy.sql`, `20260701000001_fix_user_presets_rls_operand_order.sql` — user_presets schema/RLS evolution
- `supabase/migrations/20260601120000_drop_sessions_delete_policy.sql`, `20260706120000_add_sessions_delete_policy.sql` — sessions delete-policy history (abandon feature)
- `tests/_fixtures/auth.ts`, `tests/e2e/_fixtures/auth.ts` — existing authed-only e2e fixture pattern
- `tests/e2e/seed.spec.ts`, `tests/e2e/session-capture.spec.ts` — exemplar and closest-analog e2e specs
- `context/foundation/arch.md:5` — "server owns truth" architectural stance slice A deviates from

## Architecture Insights

- **Layered gating, but only one layer is in scope for slice A.** Middleware, per-route API auth checks, and RLS are three independent enforcement points. Slice A only needs to touch middleware (new unprotected route / `AUTHED_REDIRECTS` adjustment) because it never calls the Supabase-backed API or DB at all — RLS/API changes belong to a future Supabase-anonymous-auth effort, not this slice.
- **No persistence abstraction exists today** — every component calls `fetch` directly. This is a real gap the plan must close (a small storage-strategy interface, selected by auth state) rather than a refactor to avoid; the six touchpoints enumerated above are the complete inventory.
- **The presentational layer is already decoupled from data-fetching** (`SessionList`, `FocusRatingChart`, `CatalogSelects`, `ModePicker`, `EnergyLevelPicker`, `FocusRating` are all pure props-in). This is the reason reuse for the local history view and pickers is low-risk — the risk is entirely in the hooks that fetch/mutate, not the rendering.
- **`useLastMode.ts` is the load-bearing precedent** for how localStorage should be touched safely in this SSR (Astro + Cloudflare Workers) context: `useSyncExternalStore` + SSR-safe snapshot + try/catch fail-open + in-tab listener fan-out. Any new local store (sessions, topics, formats, presets) should follow this same shape, extended from scalar to collection.
- **Seed-data asymmetry between topics and material_formats is a real design decision, not an oversight**: material_formats ships with 5 named defaults server-side; topics ships empty. A local mirror needs to hardcode the same 5 material-format defaults (names only, since IDs aren't stable) but can leave local topics empty exactly as the server does.

## Historical Context (from prior changes)

- `context/changes/anonymous-sessions/frame.md` — the `/10x-frame` output that produced this change's scope split. All five of its hypotheses (auth-gating is non-trivial; local-data scope is 4 tables not 1; sync is materially harder and belongs in S-09; the capture loop has one clean seam (`FocusRating`) and one that needs refactoring (`SessionRunner`/`useSessionStart`); the history view needs its own client-only path) are corroborated in full by this research pass, with the exact file:line inventory now filled in.
- `context/foundation/roadmap.md:184-198` (S-08) and `:200-214` (S-09) — the two-slice split, S-08's four listed Unknowns (does S-04/S-07 apply to anon sessions; multi-tab consistency; storage cleanup/cap; local key/ID scheme), and S-09's prerequisite relationship on S-08's local-data shape.
- `context/foundation/shape-notes.md:46` (referenced in frame.md, not re-read here) — "no anonymous / local-only path in v1" was an explicit v1 scoping decision now being revisited as a follow-up, consistent with the PRD's "Add as follow up" flag rather than a permanent non-goal.

## Related Research

- `context/changes/anonymous-sessions/frame.md` — framing brief this research builds on directly.

## Open Questions

These map to the roadmap's own listed Unknowns for S-08 and remain for `/10x-plan` to resolve (not research questions — implementer/product decisions):

1. Do S-04 (notes/chart) and S-07 (edit/delete/abandon) equivalents apply to anonymous sessions in v1, or is slice A capture + tagging + basic (read-only) history only? This determines whether `SessionTile`'s `AbandonButton`/`CompletedSessionActions` need local-storage-backed equivalents or should be omitted for anon sessions.
2. Local key/ID scheme for topics/material_formats/presets — name-keyed (matching the server's `UNIQUE(owner_id, name)` convention) vs. client-generated UUID. This is called out as the single decision most likely to affect S-09's merge algorithm.
3. Storage cleanup/cap — does local session history grow unbounded, or is there a cap (e.g., last N sessions), given `localStorage`'s ~5-10MB per-origin limit?
4. Multi-tab/multi-device consistency — accepted as a known limitation of localStorage, or does the UI need an explicit warning?
5. Exact new-route design for the anon capture entry point — reuse `/` (today's landing page) directly, or a new sibling route — and the corresponding `PROTECTED_ROUTES`/`AUTHED_REDIRECTS` edits in `src/middleware.ts`. The frame brief intentionally deferred this mechanism choice to `/10x-plan`; this research confirms it is a `src/middleware.ts` edit plus new page/island work, not a deeper architectural blocker.
