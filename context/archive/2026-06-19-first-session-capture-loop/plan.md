# S-01 First Session Capture Loop — Implementation Plan

## Overview

Build the north-star wedge end-to-end: a signed-in student taps **Start session** on the dashboard, picks an energy level on `/session/new`, runs a 25-minute focus timer on `/session/[id]` whose remaining time is reconciled from a server-stored `started_at` (so backgrounding/sleep doesn't kill it), hears an audible chime at focus-end, rates focus 1-5 or skips inline, and returns to the dashboard to see the new session at the top of their history list. F-01 already shipped the `sessions` table and per-user RLS; this slice is overwhelmingly a UI plus a thin server-side write path with one deliberate hardening (timer resilience).

## Current State Analysis

- **Data layer is ready.** `public.sessions` ships with every column S-01 writes (`user_id`, `started_at`, `energy_level` NOT NULL; `ended_at`, `focus_rating` nullable) and a `sessions_user_started_at_idx` that makes the dashboard history list cheap (`supabase/migrations/20260531182506_sessions_data_foundation.sql:80-104`). `duration_seconds` is `GENERATED ALWAYS AS … STORED` from `started_at` / `ended_at`. RLS allows INSERT only when `user_id = auth.uid()` and UPDATE on owned rows; DELETE was dropped post-archive (`supabase/migrations/20260601120000_drop_sessions_delete_policy.sql`) and pgTAP test #4 (`supabase/tests/rls_sessions.sql:47-55`) locks it.
- **UI layer is empty.** `src/pages/dashboard.astro` is a 6-line placeholder; no `/session/*` route, no timer / rating / history components; only the `button` shadcn primitive exists; no audio asset under `public/`.
- **Patterns are well-established.** `src/lib/supabase.ts` returns a typed `SupabaseClient<Database>` (or `null` if env is unset) — every caller null-checks. `src/lib/parse-request.ts` exposes `parseJson<T>` returning `ParseResult<T>`; auth routes don't use it yet — S-01 will be the first consumer. `src/lib/schemas/auth.ts` shows the zod convention. API routes follow `export const prerender = false; export const POST: APIRoute = …` (cleanest reference: `src/pages/api/auth/oauth.ts`). React islands hydrate with `client:load` (e.g. `src/pages/auth/signin.astro:16`). `src/middleware.ts` sets `context.locals.user` from Supabase and gates `PROTECTED_ROUTES` (`["/dashboard"]` today).

### Key Discoveries:

- **F-01's "anticipating-but-nullable" column-set means S-01 needs zero migrations** (`context/changes/first-session-capture-loop/research.md` §1; `context/archive/2026-05-29-sessions-data-foundation/plan-brief.md`).
- **UPDATE policy is wide; column-scope discipline lives in API code, not RLS** — F-01's impl-review accepted this split (`context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md:36-43`). S-01's `PATCH /api/sessions/[id]` validates payload to **only** `focus_rating` (nullable, 1-5) — `ended_at` is set server-side, not from the request.
- **`Topbar.astro` exists but is not mounted in `Layout.astro`** — `dashboard.astro` currently does not even render it (`src/pages/dashboard.astro:1-27`); landing/auth pages embed it directly. Extending `Layout.astro` to auto-mount `Topbar` when `Astro.locals.user` is set is the durable choice for S-02/S-03/S-04 too.
- **Generated TS types include `duration_seconds?: number | null` on `Insert` and `Update`** even though the DB rejects writes — treat as read-only in code (`src/db/database.types.ts:55-117`).
- **`material_formats` ships seeded** with five visible rows but **S-01 does not surface a picker** — S-02 owns it. `topic_id` and `material_format_id` stay NULL on S-01's INSERT.
- **The "Focus Fuels Greatness" palette is wired as theme tokens** (`src/styles/global.css`) — S-01 surfaces use `bg-cosmic`, `bg-ember`, `text-off-white`, `border-charred`, `text-blaze`, `text-spark`, etc.; no new color work.

## Desired End State

A signed-in user can:

1. Land on `/dashboard`, see the **Start session** CTA and (if they've logged any) a chronological history list with each session's started-at timestamp, energy level, duration, and focus rating (or "skipped").
2. Tap Start, land on `/session/new`, pick one of Low / Medium / High (the picker tap counts as the audio-priming user gesture), tap **Start**, and arrive on `/session/[id]` with the timer counting down from 25:00.
3. Continue using the laptop normally — switch tabs, lock the screen for 30 seconds, return — and see the timer's remaining time correctly reconciled from `started_at` against the wall clock.
4. Hear the chime at focus-end, see the inline rating view appear, tap 1-5 or **Skip**, return to `/dashboard`, and see the just-completed session at the top of the history list.
5. Optionally tap **Stop early** during the running phase; the rating view appears, and after rating, `duration_seconds` materializes from the actual elapsed time, not the nominal 25 minutes (FR-012).

Verifiable by `npm run lint && npm run build && npm run db:test` plus the manual run-through in Phase 5.

## What We're NOT Doing

- **No visual break-phase countdown.** FR-011 requires an audible cue at focus→break; PRD does not require a visible break timer. S-01 plays the chime, immediately transitions to the rating view, and finalizes the session row on rating commit. A break-countdown surface is deferred to a polish slice; pawel can elevate it if real use reveals friction.
- **No free-text note in S-01.** FR-014 is nice-to-have and roadmap maps it to S-04; the `note` column stays untouched on this slice's PATCH payload.
- **No topic / material-format pickers.** FR-007 / FR-008 → S-02. `topic_id` / `material_format_id` stay NULL.
- **No timer-mode picker; no preset editing.** Hard-coded `preset_1` (25/5). FR-004 / FR-005 / FR-010 → S-03. `timer_mode` column stays NULL (per `context/changes/first-session-capture-loop/research.md` §1).
- **No `GET /api/sessions` endpoint.** Dashboard reads sessions via SSR in `dashboard.astro` directly through the typed Supabase client. Cheap because of `sessions_user_started_at_idx`.
- **No DELETE affordance.** RLS already denies; pgTAP locks it.
- **No `auto:focus` chain (4-cycle Pomodoro).** Out of scope per PRD §Non-Goals.
- **No new DB migration.** F-01's schema is sufficient.
- **No analytics, no toast library, no global state library.** Local React state inside `SessionRunner` is enough.

## Implementation Approach

**Five phases**, each independently shippable in commit terms but only the last one closes the loop end-to-end:

1. **Schemas + session API + middleware** — pure server-side write path, verifiable via curl/pgTAP without any UI.
2. **Authed shell + dashboard rewrite + shadcn primitives** — visible delta on `/dashboard`; reads from F-01's data without depending on Phase 1 to write new rows (history shows empty state until Phase 4 lands).
3. **Pre-session screen** — `/session/new` with the energy picker; on submit calls Phase 1's `POST /api/sessions`, navigates to `/session/[id]` (which is built in Phase 4; in Phase 3 you can verify by navigating manually after a successful POST).
4. **Active session page + timer + chime + rating** — closes the write half of the loop (`PATCH /api/sessions/[id]`); the user can now run a complete session.
5. **End-to-end verification + lessons sync** — full manual run-through, including the resilience and skip-rating edge cases; harvest lessons from the slice.

The plan favors **server-stored `started_at` + wall-clock reconcile** for timer resilience: the `Date.now() - startedAtMs` calculation runs in the React island on every animation-frame tick _and_ on `visibilitychange`, deriving remaining time from a stable server-side anchor. This means INSERT happens at session start (a "running" row exists in the DB until the user rates) — acceptable since DELETE is denied; a never-rated row just stays as a NULL `ended_at`, NULL `focus_rating` row that the user can leave behind without harm.

## Critical Implementation Details

- **Audio autoplay policy (two-stage prime — both stages required).** Cross-document user-activation is not reliably carried across `window.location.assign` (Safari is strict, Chrome depends on MEI). The plan therefore primes audio **twice**:
  - **Stage 1 — same-document warm on `/session/new`'s Start click handler.** Before navigating, construct `new Audio('/audio/chime.mp3')`, set `muted = true`, call `.play()` then `.pause()` (resolved or rejected — warming the resource is still useful). This raises Chrome's MEI for the origin and primes the asset cache.
  - **Stage 2 — first-render warm on `SessionRunner` mount (load-bearing for Safari).** Inside `SessionRunner`'s first `useEffect`, construct the focus-end `Audio` reference _immediately_ and run the same muted `.play()` / `.pause()` warm-up. Because the document loaded in direct response to the Start click (same-origin navigation), most browsers — including Safari — count this as a "user-gesture-initiated load" and grant activation for the muted warm-up; the subsequent unmuted `.play()` at focus-end then succeeds on the _same_ document that received the gesture. Store the warmed `Audio` reference in a ref so focus-end calls `audioRef.current.play()` rather than constructing a new element.
  - **Verify on Chrome, Safari, Firefox** — Safari is the strictest. If even the Stage-2 prime is blocked on a target browser, the rating view still appears (the chime is fail-open via `.catch`) but the NFR is violated and the implementer must escalate.
- **Column-scope discipline on PATCH.** RLS allows the owner to mutate any column; the API layer enforces the slice rule. `endSessionSchema` accepts exactly two writable fields: `focus_rating` (1-5 or null for Skip) and `ended_at` (client-snapshotted ISO datetime at the phase-transition tick — see "FR-012 fidelity" below). Server validates `ended_at` is within `[now() - 2h, now() + 5s]` before writing; out-of-range → 400. No other columns are mutable from this endpoint. Combined with the `.is("ended_at", null)` only-if-still-running guard, the row is writable exactly once. This implements the lesson "RLS policies must enforce business-rule immutability, not the UI" that F-01's impl-review codified (research §2).
- **FR-012 fidelity — client-snapshotted `ended_at`.** `SessionRunner` captures `stoppedAtMs = Date.now()` at the moment of phase transition (focus-end auto OR Stop-early click), stashes it in component state, and sends it as `new Date(stoppedAtMs).toISOString()` in the rating PATCH. The user may take 10-60 s on the rating view; that delay must not pollute `duration_seconds` (FR-012: "the partial elapsed time is recorded as the session's actual duration"). The small trust delegation (client picks the timestamp the DB writes) is bounded by the server's plausibility window; the user can only cheat their own data.
- **Session-already-ended guard on `/session/[id]`.** When the page SSR-fetches the row, if `ended_at IS NOT NULL`, redirect to `/dashboard`. Prevents replay/double-rate of a completed session.
- **Abandoned-session guard on `/session/[id]`.** If `ended_at IS NULL` but `now() - started_at > 2 * focusSeconds` (the row was never finalised and the nominal focus window has long elapsed — clearly an abandoned tab from a previous session), redirect to `/dashboard` instead of mounting `SessionRunner`. Without this, a user who bookmarked `/session/<id>` and returns hours later would land on `SessionRunner` with `startedAtMs` in the deep past, the tick driver would compute `remaining` as massively negative, and the page would instantly flip to the rating phase — letting the user accidentally rate a stale session. Threshold `2 * focusSeconds` is a heuristic for the 25-min preset (≈ 50 minutes from start); S-03 should revisit when count-up / long presets land.
- **Cross-user / wrong-id guard.** The SSR fetch on `/session/[id]` MUST filter by `user_id = auth.uid()`. RLS would deny anyway, but an explicit check on the SSR side means we return 404 (redirect) instead of an empty result page.
- **`visibilitychange` reconciliation.** The `SessionRunner` island registers a `document.addEventListener("visibilitychange", …)` that, on `document.visibilityState === "visible"`, recomputes remaining from `Date.now() - startedAtMs`. If remaining ≤ 0, the focus phase has elapsed during the absence → trigger the focus-end transition (play chime + swap to rating view) immediately on return.
- **Default preset hard-coded.** A single module-level constant `FOCUS_PRESET_SECONDS = 25 * 60` lives in `src/components/session/SessionRunner.tsx` (or `src/lib/session-presets.ts` if Phase 3 also needs it). S-03 will replace this constant with a per-user-preset read.
- **No `setInterval` for state.** The timer uses `requestAnimationFrame` (or `setTimeout` chained on next tick) to recompute remaining from the wall clock; never decrements a local counter. This is what makes background-tab throttling irrelevant — when the tab unfreezes, the next frame recomputes from `Date.now()`.

## Phase 1: Schemas + session API + middleware

### Overview

Stand up the server-side write path: zod schemas, `POST /api/sessions`, `PATCH /api/sessions/[id]`, and the middleware allowlist. Verifiable with curl + pgTAP without any UI work.

### Changes Required:

#### 1. Session zod schemas

**File**: `src/lib/schemas/session.ts`

**Intent**: Express the two payload shapes the timer islands will send: a create-session payload (only `energy_level` required, the only pre-session field S-01 surfaces) and an end-session payload (only `focus_rating`, nullable for Skip). `ended_at` is intentionally not in either schema — the server sets it.

**Contract**: Export `createSessionSchema` (`{ energy_level: 'low' | 'medium' | 'high' }`) and `endSessionSchema` (`{ focus_rating: number | null, ended_at: string }` — `focus_rating` is integer 1-5 or null (Skip); `ended_at` is an ISO-8601 datetime string client-snapshotted at the moment of phase transition, validated by `z.iso.datetime()` for shape only). Both use `z.object()` + custom messages per `src/lib/schemas/auth.ts:3-11` convention. Export `CreateSessionPayload` and `EndSessionPayload` via `z.infer<>`. The `energy_level` literal union matches `Database["public"]["Enums"]["energy_level"]` (`src/db/database.types.ts:150`). Semantic plausibility of `ended_at` (against the server clock) is enforced by the endpoint, not the schema (see Phase 1 §3).

#### 2. Create-session endpoint

**File**: `src/pages/api/sessions/index.ts`

**Intent**: Authenticated POST that inserts a `sessions` row with `user_id = locals.user.id`, `started_at = now()` (server-set), `energy_level` from the request body, and every other column NULL. Returns `{ id, started_at }` for the client to navigate to `/session/[id]`.

**Contract**: `export const prerender = false; export const POST: APIRoute = async (context) => …`. Mirrors `src/pages/api/auth/oauth.ts` for the `prerender` + `APIRoute` shape and `src/middleware.ts:8` for the supabase null-check. Reads `context.locals.user` (return 401 JSON if missing — middleware should have redirected, but defense in depth). Calls `parseJson(context.request, createSessionSchema)` (`src/lib/parse-request.ts:23`). Inserts via `supabase.from("sessions").insert({ user_id, energy_level, started_at: new Date().toISOString() }).select("id, started_at").single()`. Returns `Response.json({ id, started_at }, { status: 201 })`; error path returns `Response.json({ error }, { status: 400 | 500 })`. This is the first non-auth API consumer of `parseJson` — set the convention for S-02+.

#### 3. End-session endpoint

**File**: `src/pages/api/sessions/[id].ts`

**Intent**: Authenticated PATCH that finalizes a running session — writes the client-snapshotted `ended_at` (captured at the phase-transition tick — focus-end or Stop-early — so `duration_seconds` reflects actual focus elapsed per FR-012, not rating-decision time) and `focus_rating` (null = Skip). Server validates `ended_at` for bounded plausibility; rejects implausible values. Enforces the column-scope discipline that the wide UPDATE RLS policy intentionally leaves to the API.

**Contract**: `export const prerender = false; export const PATCH: APIRoute = async (context) => …`. Reads `context.params.id` (UUID); reads body via `parseJson(context.request, endSessionSchema)`. **Server-side plausibility check on the client-supplied `ended_at`:** parse to a `Date`, then reject (400) unless `ended_at <= now() + 5_000ms` (clock-skew tolerance) AND `ended_at >= now() - 2 * 60 * 60 * 1000ms` (2-hour lower bound — keeps a stale-tab from backdating an abandoned session into the deep past). The DB-generated `duration_seconds = ended_at - started_at` then reflects actual focus-phase elapsed (FR-012). Then calls `supabase.from("sessions").update({ ended_at: validatedIsoString, focus_rating }).eq("id", id).eq("user_id", user.id).is("ended_at", null).select("id").maybeSingle()` — the `.eq("user_id", user.id)` is defense-in-depth alongside RLS; the **`.is("ended_at", null)` is the atomic only-if-still-running guard** that prevents double-rate / replay (stale tabs, double-taps, dev-curl replays). Use `.maybeSingle()` so a no-match returns `null` instead of erroring. Returns 200 + `Response.json({ ok: true })` on success; 400 on zod failure or plausibility rejection; **409 + `Response.json({ error: "Session already ended or not found" })` when the guard rejects** (no row updated); 401 if `locals.user` is missing. Document in a header comment that **`ended_at` is client-snapshotted at phase transition and server-validated for plausibility; `focus_rating` is the only other writable column; the row is writable only once** — this is the load-bearing discipline rule (see "Critical Implementation Details").

#### 4. Middleware route allowlist

**File**: `src/middleware.ts`

**Intent**: Add `/session/` to `PROTECTED_ROUTES` so the new pre-session screen and active-session page require sign-in. Since `PROTECTED_ROUTES.some(route => pathname.startsWith(route))` matches by prefix, a single `"/session/"` entry (with trailing slash) covers `/session/new` and `/session/[id]` without inadvertently matching a future `/sessions` or `/session-archive` route (F5 guard). Also extend `AUTHED_REDIRECTS` to send already-authed users away from the auth pages: `"/auth/signin": "/dashboard"` and `"/auth/signup": "/dashboard"`. This matches the symmetric intent of the constant (currently it sends authed visitors from `/` → `/dashboard`) and keeps the F6 Phase 2 verification claim ("auth pages don't show Topbar") clean — authed users never see the auth pages or the auto-mounted Topbar on them.

**Contract**: Update the `PROTECTED_ROUTES` constant from `["/dashboard"]` to `["/dashboard", "/session/"]`. Update `AUTHED_REDIRECTS` from `{ "/": "/dashboard" }` to `{ "/": "/dashboard", "/auth/signin": "/dashboard", "/auth/signup": "/dashboard" }`. Nothing else changes in the middleware — same `getUser` call, same redirect target. (`/auth/confirm-email` stays out of the map — confirming a fresh email from an authed session is still a legitimate flow.)

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- RLS regression suite passes: `npm run db:test` (3 files, 27 assertions — `rls_sessions.sql`, `rls_topics.sql`, `rls_material_formats.sql`)

#### Manual Verification:

- `curl -X POST http://localhost:4321/api/sessions` with a signed-in cookie + `{"energy_level":"medium"}` body returns 201 + `{ id, started_at }`; an unauthenticated curl gets redirected to `/auth/signin` (middleware).
- `curl -X PATCH http://localhost:4321/api/sessions/<id>` with `{"focus_rating":4}` returns 200; with `{"focus_rating":null}` (Skip case) returns 200; with `{"focus_rating":7}` returns 400 (zod CHECK).
- **Replay guard:** a second PATCH against the same `<id>` (now already-ended) returns **409**; the row's first-write `ended_at` and `focus_rating` are unchanged (verify in Studio).
- Inspect the row in Supabase Studio (`http://localhost:54323`): `started_at` is server-side timestamp; `ended_at` is set after PATCH; `duration_seconds` materialized via the generated column; `user_id` matches the caller.
- A PATCH with `{"focus_rating":3,"ended_at":"2020-01-01T00:00:00Z"}` is **rejected with 400** by the server-side plausibility check (`ended_at` falls outside `[now() - 2h, now() + 5s]`); the row's `ended_at` and `focus_rating` remain NULL (the only-if-still-running guard was not even reached).
- A PATCH with `{"focus_rating":3,"ended_at":"<valid-ISO-near-now>","unexpected_field":"x"}` is accepted (the extra field is silently stripped by zod); the row's `ended_at` equals the client value, not `now()`; `duration_seconds` materializes from `ended_at - started_at`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Authed shell + dashboard rewrite + shadcn primitives

### Overview

Make the dashboard real: install the `card` primitive, extend `Layout.astro` so any authed page auto-mounts the topbar, then rewrite `dashboard.astro` as a Start CTA above an SSR-fetched session history list. The dashboard reads sessions directly through the typed Supabase client — no `GET /api/sessions` endpoint.

### Changes Required:

#### 1. Install shadcn `card` primitive

**Command**: `npx shadcn@latest add card`

**Intent**: Adds `src/components/ui/card.tsx` with `Card`, `CardHeader`, `CardContent`, `CardFooter`. Used by both the history list rows in Phase 2 and the session screens in Phases 3 and 4.

**Contract**: Standard new-york-style shadcn card (per `components.json:3` `style: "new-york"`); aliases already set in `components.json`. No custom variants in this slice — defaults are fine and the palette in `global.css` handles the theme tokens.

#### 2. Auto-mount Topbar in Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Make `Layout.astro` the single source of truth for the authed shell. When `Astro.locals.user` is set, render `<Topbar />` above the page content; otherwise render nothing (landing/auth pages stay clean). This means every present and future authed page gets the topbar by just wrapping content in `<Layout>`.

**Contract**: Import `Topbar` from `@/components/Topbar.astro` at the top. After the `Banner` map and before `<slot />`, add `{Astro.locals.user && <Topbar />}`. No props change (existing `title?` prop stays). Verify `Topbar.astro` itself already reads `Astro.locals.user` (`src/components/Topbar.astro:5`) and renders the authed variant — no changes needed there. After this change, **remove** any explicit `<Topbar />` mount inside `dashboard.astro` (none today, but landing page may have one — check `src/pages/index.astro`; if Topbar is mounted there explicitly, leave it because the landing page is not authed and the Layout-mounted version won't render).

#### 3. Rewrite dashboard.astro

**File**: `src/pages/dashboard.astro`

**Intent**: Turn the placeholder into the authed entry point — a primary Start session CTA leading to `/session/new`, followed by the user's chronological session history (most recent first). When the user has no sessions yet, show an empty state encouraging them to start their first session. SSR-fetches via the typed Supabase client; no client island needed for read-only history.

**Contract**: Use `<Layout title="Dashboard">` (Topbar auto-mounts). In the frontmatter, call `createClient(Astro.request.headers, Astro.cookies)`; if null, render a banner saying Supabase is not configured (mirror auth-page pattern); else `supabase.from("sessions").select("id, started_at, energy_level, duration_seconds, focus_rating, ended_at").eq("user_id", user.id).order("started_at", { ascending: false }).limit(50)`. Type the response as the generated `Tables<"sessions">` row.

Markup outline (no code snippet; describe the structure):

- Outer `bg-cosmic min-h-screen p-4` container, max-width inner column.
- Top: an `<a href="/session/new">` rendered as the primary CTA (use the existing shadcn `Button` `asChild` pattern with the `bg-ember`/`bg-blaze` palette; mirror `Topbar.astro:19-22` styling for color tokens). Label: "Start session". Position prominently — this is the ≤ 3-tap path.
- Below: a heading "History" and either:
  - Empty state: a `Card` saying "No sessions yet. Start your first one above." in `text-ash`.
  - Or a list of `Card`s, each row showing: `started_at` formatted (e.g. `2026-06-19, 14:30` — use `Intl.DateTimeFormat`), energy level badge (Spark color for high, Blaze for medium, Charred-surface for low — small text label), duration / status (formatted `mm:ss` from `duration_seconds`; if `ended_at` is null and `now() - started_at <= 2 * 25 * 60 * 1000` show "in progress"; if `ended_at` is null and the row is older than that, show "Abandoned" in `text-ash` — F4 guard), focus rating (`★ 4 / 5` or "Skipped"; blank for "Abandoned" rows). No edit / delete affordance.

#### 4. Topbar palette check (no functional change)

**File**: `src/components/Topbar.astro`

**Intent**: Confirm the existing Topbar already renders correctly inside Layout's `<body>` (no extra container needed). The component already does the right thing with `Astro.locals.user` (see `src/components/Topbar.astro:5-49`); no changes expected. Listed here so the implementer knows to check, not edit.

**Contract**: Read-only verification step — visually confirm after the Layout change that Topbar appears on `/dashboard`, `/session/new`, `/session/[id]` and does NOT appear on `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Astro a11y rules pass for the new dashboard markup (covered by `npm run lint` via `eslint-plugin-astro` + `eslint-plugin-jsx-a11y`).

#### Manual Verification:

- `/dashboard` renders the Topbar (email + Sign out + Dashboard link) above the content for a signed-in user.
- A user with zero sessions sees the empty state, not an empty list.
- A user with sessions (insert a few via Studio for the test) sees them ordered by `started_at DESC`, with sensible formatting of energy / duration / rating.
- The Start session CTA is visually prominent (matches palette do's: Neon Red / Blaze ramp).
- Landing page `/` (signed out) does NOT show the Topbar; auth pages don't either (signed out by definition — signed-in users are now redirected by `AUTHED_REDIRECTS` per Phase 1 §4).
- `/auth/signin` still works after the Layout change — no double Topbar, no missing banner.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Pre-session screen

### Overview

Add `/session/new`, an Astro page that hosts the `EnergyPicker` React island. The user picks Low / Medium / High, taps Start, the island POSTs to `/api/sessions`, primes the audio element (the Start tap is the user gesture), and navigates to `/session/[id]`.

### Changes Required:

#### 1. Pre-session Astro page

**File**: `src/pages/session/new.astro`

**Intent**: Server-side shell around the React island. Reads `Astro.locals.user` (already guaranteed non-null by Phase 1's middleware addition), wraps the `EnergyPicker` island in `<Layout title="Start session">`.

**Contract**: Frontmatter: import `Layout`, import `EnergyPicker` from `@/components/session/EnergyPicker`. Render `<Layout title="Start session"><div class="bg-cosmic min-h-screen p-4"><EnergyPicker client:load /></div></Layout>`. No props; the island is self-contained.

#### 2. Energy picker React island

**File**: `src/components/session/EnergyPicker.tsx`

**Intent**: Three labeled buttons (Low / Medium / High) using the existing shadcn `Button` primitive. Until energy is picked, the Start button is disabled. On Start click: prime the audio element (no-op `play()` + immediate `pause()` to satisfy the user-gesture rule), `fetch("/api/sessions", { method: "POST", ... })` with the chosen energy, and on success `window.location.assign("/session/" + data.id)`. On error, surface inline (use the `ServerError` pattern from `src/components/auth/ServerError.tsx`).

**Contract**: Default-export a React component. Local state: `energy: 'low' | 'medium' | 'high' | null`, `submitting: boolean`, `error: string | null`. Render three energy `<Button>`s in a row (use the existing `button` variants; selected state styled via the palette — e.g. selected has `bg-blaze text-off-white`, unselected has `bg-ember border-charred`). Below: the Start `<Button>` disabled when `energy === null || submitting`. On submit, do the priming first (`const a = new Audio('/audio/chime.mp3'); a.muted = true; a.play().then(() => { a.pause(); a.muted = false; }).catch(() => {})` — muted play is reliably allowed even before gesture; this just warms the resource), then `fetch`. Use `client:load` so the island hydrates on first paint (per `src/pages/auth/signin.astro:16` pattern).

Accessibility: each energy button gets `aria-pressed={energy === level}` and a visible focus ring (via the existing `Button` variants). The Start button is the only `type="submit"` in the form.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint` (React-compiler + jsx-a11y enforced)

#### Manual Verification:

- Unauthenticated user hitting `/session/new` is redirected to `/auth/signin` (Phase 1 middleware).
- Three energy buttons render with proper selected-state styling; Start is disabled until one is chosen.
- Clicking Start with `medium` selected results in a row in `sessions` (verify in Studio): `user_id` correct, `energy_level = 'medium'`, `started_at` ≈ now, `ended_at` null, `focus_rating` null.
- Browser navigates to `/session/<the-new-id>` after a successful POST (the page itself is built in Phase 4 — for this phase, manually verify the URL changes and trust 404 / placeholder until Phase 4 lands).
- Network failure (kill the dev server briefly) shows an inline error and the Start button re-enables.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Active session page + timer + chime + rating

### Overview

The active-session page. SSR confirms the session exists, is owned by the user, and is not already ended. The `SessionRunner` React island runs the wall-clock-reconciled timer, plays the chime at focus-end, swaps to the inline rating view, PATCHes the session, and returns to `/dashboard`. Manual stop is supported. Skip is supported. The chime asset lands in `public/audio/chime.mp3`.

### Changes Required:

#### 1. Audible-cue asset

**File**: `public/audio/chime.mp3`

**Intent**: A short (~1-2 s) CC0-licensed chime/bell sound for the focus→break transition. Lightweight (target < 25 KB) so it bundles cheaply with the worker static assets and primes quickly.

**Contract**: MP3 format (broadest cross-browser support — Chrome, Safari, Firefox, Edge). Source: a CC0 chime/bell from Freesound.org or Pixabay (search "meditation chime CC0", "bell CC0", "tibetan bowl short CC0"). The asset's license note (CC0 / public domain + URL of source) should be added as a brief comment in the file's neighbor `public/audio/README.md` for attribution hygiene, even though CC0 doesn't require it.

#### 2. Active session Astro page

**File**: `src/pages/session/[id].astro`

**Intent**: SSR-fetches the session row by id, filtered by `user_id`. Redirects to `/dashboard` if not found or already ended (defense against URL-replay). Hands `id`, `startedAtMs`, and the focus preset to the `SessionRunner` island as props.

**Contract**: Frontmatter: `Astro.params.id` → string; `createClient` → null-check; `supabase.from("sessions").select("id, started_at, ended_at, energy_level").eq("id", id).eq("user_id", user.id).maybeSingle()`. If `error || !data` → `Astro.redirect("/dashboard")`. If `data.ended_at !== null` → `Astro.redirect("/dashboard")` (session already done; rating-replay is denied). **Abandoned-session guard:** compute `ageMs = Date.now() - new Date(data.started_at).getTime()`; if `ageMs > 2 * FOCUS_PRESET_SECONDS * 1000` → `Astro.redirect("/dashboard")` (the row is clearly stale; prevents the accidental-rating bug on a bookmarked URL revisited hours later). Else compute `startedAtMs = new Date(data.started_at).getTime()` and pass to `<SessionRunner sessionId={data.id} startedAtMs={startedAtMs} focusSeconds={25 * 60} client:load />`. Wrap in `<Layout title="Session">` (Topbar auto-mounts via Phase 2 Layout extension).

#### 3. Session runner React island

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: The load-bearing component. Manages the timer + rating phases with a small state machine, computes remaining time from `Date.now() - startedAtMs` (never decrements a local counter), reconciles on `visibilitychange`, plays the chime at focus-end, renders the rating view inline, PATCHes on commit, navigates to `/dashboard`. Manual stop transitions directly to rating with the actual elapsed duration recorded server-side (via `ended_at = now()`).

**Contract**: Props: `sessionId: string`, `startedAtMs: number`, `focusSeconds: number`. Local state: `phase: 'running' | 'rating' | 'submitting'`, `now: number` (updated by an animation loop), `stoppedAtMs: number | null` (the client snapshot of the phase-transition wall clock — see "FR-012 fidelity" rule in Critical Implementation Details), `error: string | null`. A `useRef<HTMLAudioElement | null>(null)` holds the focus-end chime element. **First-render audio re-prime (Stage 2 of the autoplay policy):** the first `useEffect` runs on mount, constructs `new Audio('/audio/chime.mp3')`, stores it in the ref, sets `muted = true`, and calls `.play().then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false; }).catch(() => { /* Safari edge — chime may fail open at focus-end */ })`. This re-acquires user-activation on the new document and is the load-bearing safeguard for Safari (where cross-navigation activation does not carry). Derived: `remaining = focusSeconds - Math.floor((now - startedAtMs) / 1000)`. The tick driver is a separate `useEffect` that schedules a `setTimeout(() => setNow(Date.now()), 1000)` chain — keep it simple; never use `setInterval` (the wall-clock recompute makes throttling harmless, but a `setTimeout` chain is the conventional shape). On every `setNow`, if `phase === 'running' && remaining <= 0`, transition to rating: **snapshot `stoppedAtMs` via `setStoppedAtMs(startedAtMs + focusSeconds * 1000)`** (use the nominal end-of-focus moment, not `Date.now()`, so a late `visibilitychange` recovery still records a clean `25:00` duration), play the chime via the warmed ref (`audioRef.current?.play().catch(() => { /* fail open */ })`), and `setPhase('rating')`. Additionally register `document.addEventListener('visibilitychange', …)` that on `visible` updates `setNow(Date.now())` immediately — same effect: if remaining ≤ 0 the next render flips to rating (and the snapshot rule above keeps the recorded duration honest).

Running-view markup: a large centered countdown display (mm:ss formatted from `remaining`), the energy level badge, and a single secondary "Stop early" button. Stop-early dispatches **`setStoppedAtMs(Date.now())`** (snapshot the actual stop wall-clock — the rating delay must not pollute `duration_seconds`, per FR-012) and `setPhase('rating')` without playing the chime (manual stop is silent — the cue is for the focus→break auto-transition only, per FR-011 wording).

Rating-view markup: heading "How was your focus?"; five large buttons labeled `1`, `2`, `3`, `4`, `5` (the existing `Button` primitive with the palette ramp); a separate "Skip" button below. On any of those clicks: `setPhase('submitting')`, then `fetch('/api/sessions/' + sessionId, { method: 'PATCH', body: JSON.stringify({ focus_rating: <1-5 | null>, ended_at: new Date(stoppedAtMs!).toISOString() }) })` — `stoppedAtMs` is guaranteed non-null at this point (set on the running→rating transition above). On success: `window.location.assign('/dashboard')`. On error: `setError(...)`, re-enable buttons (revert phase to `'rating'`).

Use `client:load` from the parent Astro page (the timer must start on first paint).

#### 4. Public audio note (optional, for attribution)

**File**: `public/audio/README.md`

**Intent**: One-line attribution + license note for the chime asset, even though CC0 does not require it.

**Contract**: Two or three lines: filename, source URL, license (CC0 / Public Domain). No further structure.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- The chime asset is present at the expected path: `test -f public/audio/chime.mp3` (or PowerShell `Test-Path public/audio/chime.mp3`).

#### Manual Verification:

- Starting a session and waiting through 25 minutes shows the timer counting down accurately; at 00:00 the chime plays clearly and the view swaps to the rating prompt.
- For dev iteration: temporarily reduce `focusSeconds` from `25 * 60` to e.g. 10 in the component prop default for the duration of testing (revert before commit) — confirm focus-end behavior in 10 s.
- Backgrounding the tab for 30+ seconds and returning: the displayed remaining time reflects wall-clock elapsed, not paused time. If the absence pushed remaining below zero, on return the view is already in the rating phase (and the chime played on focus event recovery, or was missed — known acceptable: browser may suppress audio while hidden).
- Locking the laptop briefly during a session and unlocking: same reconciliation behavior as backgrounding.
- Manual stop early (Stop button at 5:00 remaining): rating view appears immediately, no chime; **rate quickly then rate slowly (wait 30 s on the rating view before tapping)** — in both cases the row's `duration_seconds` ≈ `25*60 - 5*60 = 20*60 = 1200` (FR-012: actual focus elapsed, not inflated by rating-decision delay). This is the load-bearing test for Fix B's client-snapshot pattern.
- Tapping Skip on the rating view PATCHes with `focus_rating: null`; the dashboard history row shows "Skipped".
- Tapping `4` PATCHes with `focus_rating: 4`; the dashboard history row shows `★ 4 / 5` (or whatever the formatter renders).
- After the PATCH, `/dashboard` shows the new session at the top of the history list — no full reload of the dashboard data needed beyond the navigation itself (SSR fetches fresh on the next request).
- Hitting `/session/<id>` for a session that's already ended redirects to `/dashboard` (replay protection).
- Hitting `/session/<id>` with someone else's id (or a garbage UUID) redirects to `/dashboard`.
- **Abandoned-session guard:** insert a row directly in Studio with `started_at = now() - 60 minutes`, `ended_at = NULL`; navigate to that `/session/<id>` — redirects to `/dashboard` (no rating phase reached). Dashboard renders the same row as "Abandoned", not "in progress".
- Tested on the latest two versions of Chrome, Safari, and Firefox on desktop (NFR "Cross-browser support — desktop"); confirm the chime plays on each.
- Tested on the latest mobile Safari (iOS) and Chrome (Android) — full session run + chime audible (NFR "Mobile browser support").

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: End-to-end verification + lessons sync

### Overview

Run the golden path under the actual NFR/Guardrail conditions, confirm everything stitches together, and harvest any lessons worth recording in `context/foundation/lessons.md`. This phase has no production code changes — only verification, fix-forward, and lesson capture.

### Changes Required:

#### 1. Run the full quality gate

**Command**: `npm run lint && npm run build && npm run db:test`

**Intent**: Confirm the slice survives the full quality gate before opening the PR. F-01's impl-review noted CI does not yet run `db:test` — running it locally is the contract for slices that touch session data or RLS-adjacent code paths. S-01 doesn't touch RLS but still depends on it; run pgTAP to confirm no regression.

**Contract**: All three commands exit 0. Any failure blocks the phase.

#### 2. Golden-path manual run

**Intent**: One end-to-end pass through the loop the PRD's user story describes, performed as the persona (a logged-in student with no prior session history, then with one).

**Contract**: Verify in order:

- Sign in fresh (or use a clean test account).
- Hit `/dashboard`: empty-state history visible, Start CTA prominent.
- Tap Start → `/session/new` loads in well under 200 ms (NFR "User-perceived responsiveness").
- Pick Low → tap Start. Confirm: navigation to `/session/<id>` happens (≤ 3 taps from dashboard to running timer — Guardrail satisfied: tap 1 = Start session; tap 2 = energy Low; tap 3 = Start; counts as 3, edge of the budget).
- Time the chime: confirm it is "clearly audible" (NFR) at normal laptop volume.
- Tap `3` on the rating prompt → land on `/dashboard` with the just-completed session at the top.
- Confirm energy displayed = Low; rating = `★ 3 / 5`; duration formatted as `25:00` (or whatever the test focusSeconds yielded).

#### 3. Resilience verification

**Intent**: The single hardest NFR for this slice; verify explicitly rather than trusting the implementation.

**Contract**: Start a session; background the tab for 60 seconds; return; confirm timer reflects wall-clock elapsed (not paused). Repeat with screen-lock instead of tab-switch. Repeat with `chrome://throttling` or DevTools "Performance → 4x slowdown" to confirm the wall-clock recompute survives CPU throttling.

#### 4. Skip-rating and stop-early edge cases

**Intent**: Confirm the two non-golden paths preserve data integrity.

**Contract**: Start a session, Stop early at ~5s elapsed (use the dev `focusSeconds` override if still in place), tap Skip on the rating prompt. Confirm: row exists in `sessions` with `ended_at` ≈ now, `focus_rating` IS NULL, `duration_seconds` ≈ 5 (per the actual elapsed, not the nominal 1500). Confirm the dashboard renders "Skipped" not blank.

#### 5. Lessons sync

**File**: `context/foundation/lessons.md`

**Intent**: F-01's impl-review codified "RLS policies must enforce business-rule immutability, not the UI" but it never landed in `lessons.md` (research §2 flagged this drift). If the implementer encounters the same trap during S-01 (or any other recurring pattern emerges — e.g. the audio-priming user-gesture rule, the wall-clock-reconcile pattern), add it now.

**Contract**: Append-only addition to `context/foundation/lessons.md` using the existing convention. Candidates if encountered:

- The RLS+API column-scope-discipline rule from F-01 (overdue from research §2).
- "Audio playback requires a user-gesture prime on the same page; prime during the click handler that creates the session, not on the page where the audio fires."
- "Timers in browsers must derive remaining time from a stable server-side anchor (`started_at`) on every tick — never decrement a local counter — to survive backgrounding."

Skip if none of these surfaced during implementation in a way that recurs across slices.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npm run db:test` exits 0 (all 27 pgTAP assertions pass).

#### Manual Verification:

- Golden path: complete end-to-end run from dashboard → `/session/new` → energy pick → 25-min timer (or dev-shortened) → chime → rate → dashboard shows new row at top. Performed and confirmed.
- Resilience: 60 s tab backgrounding mid-session does not desync the timer; on return, displayed remaining = `focusSeconds - elapsedSeconds` ± 1 s.
- Manual stop early: the row's `duration_seconds` equals the actual elapsed seconds, not the nominal preset (FR-012).
- Skip rating: the row's `focus_rating` IS NULL; the dashboard renders "Skipped".
- Cross-browser desktop spot-check: golden path on Chrome + Safari + Firefox (NFR "Cross-browser support — desktop").
- Mobile spot-check: golden path on mobile Safari and Android Chrome (NFR "Mobile browser support").
- `Cross-user isolation`: with a second test user, hitting `/session/<id-of-user1's-session>` redirects to that user's `/dashboard` (their own), never reveals user 1's row (NFR "Privacy of session content").
- `lessons.md` either has the new lesson(s) appended or the implementer has documented in the PR description why none were captured.

**Implementation Note**: After completing this phase and all automated verification passes, the slice is ready for code-review and archival via `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

S-01 does not yet require dedicated unit-test files — the project's test infrastructure (Module 3) lands after this slice. The existing pgTAP suite (`supabase/tests/rls_sessions.sql`) is the cross-user-isolation safety net and must keep passing.

Where unit tests would land in a future Lesson-2 expansion: the `SessionRunner`'s state-machine transitions (running→rating on remaining≤0, manual-stop→rating, PATCH success→navigate), and the date-formatting helpers on the dashboard. Don't add them yet — wait for the test-plan rollout to specify the test layer + tool first.

### Integration Tests:

Not in scope for this slice. The closest existing layer is `db:test` (pgTAP). The S-01 phases verify the API endpoints by curl + Supabase Studio inspection — fine for the wedge slice; an e2e test (Playwright or similar) is a later module's job.

### Manual Testing Steps:

See per-phase Manual Verification sections; the consolidated checklist is Phase 5.

## Performance Considerations

- The dashboard's `select … from sessions where user_id = $1 order by started_at desc limit 50` lands on `sessions_user_started_at_idx`; cheap at any realistic v1 volume (small data, medium-scale users — see `prd.md` frontmatter).
- The timer recomputes remaining time at ~1 Hz; effectively free.
- The chime asset is ~25 KB; warm-cache after the first visit.
- No render-bound concerns: React Compiler is enabled (`eslint-plugin-react-compiler` is error-level per CLAUDE.md), so no manual `useMemo` / `useCallback`.

## Migration Notes

No migrations. F-01 already shipped the schema and RLS that S-01 needs. Generated TS types in `src/db/database.types.ts` are current — no `npm run db:types` regen needed.

If for any reason `src/db/database.types.ts` is regenerated during S-01 development, commit the result as a separate commit (per CLAUDE.md DB workflow) to keep the diff reviewable.

## References

- Related research: `context/changes/first-session-capture-loop/research.md`
- F-01 archive (data foundation): `context/archive/2026-05-29-sessions-data-foundation/plan.md`, `context/archive/2026-05-29-sessions-data-foundation/plan-brief.md`, `context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md`
- S-00 archive (landing page palette + Welcome / Topbar precedent): `context/archive/2026-06-18-landing-page/`
- PRD source: `context/foundation/prd.md` — US-01, FR-006, FR-009, FR-011, FR-012, FR-013, FR-015; NFRs "Timer accuracy and resilience", "User-perceived responsiveness", "Privacy of session content", "Audible focus → break cue"; Guardrail "≤ 3 taps to running timer".
- Roadmap: `context/foundation/roadmap.md:34, 81-93` (S-01 row + slice definition).
- Color palette: `context/foundation/color_palette.md`, applied via `src/styles/global.css`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schemas + session API + middleware

#### Automated

- [x] 1.1 Type checking passes: `npm run build`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 RLS regression suite passes: `npm run db:test`

#### Manual

- [x] 1.4 `curl POST /api/sessions` with valid body returns 201 + `{ id, started_at }`; unauthenticated curl is redirected
- [x] 1.5 `curl PATCH /api/sessions/<id>` accepts `{focus_rating:4}` and `{focus_rating:null}`; rejects `{focus_rating:7}` with 400
- [x] 1.6 Studio inspection confirms `started_at` server-set, `ended_at` set after PATCH, `duration_seconds` materialized, `user_id` correct
- [x] 1.7 PATCH with implausible `ended_at` (e.g., `"2020-01-01T00:00:00Z"`) is rejected 400; row unchanged
- [x] 1.8 PATCH with valid `ended_at` near `now()` is accepted; `duration_seconds = ended_at - started_at` materializes correctly; extra unknown fields are stripped
- [x] 1.9 Second PATCH against the same session-id returns 409; row's first-write `ended_at` and `focus_rating` remain unchanged (replay guard)

### Phase 2: Authed shell + dashboard rewrite + shadcn primitives

#### Automated

- [x] 2.1 Type checking passes: `npm run build`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Astro a11y rules pass for the new dashboard markup

#### Manual

- [x] 2.4 `/dashboard` renders the Topbar for a signed-in user
- [x] 2.5 Zero-session user sees the empty state; user with sessions sees them ordered by `started_at DESC`
- [x] 2.6 Start session CTA is visually prominent (palette do's)
- [x] 2.7 Landing `/` and `/auth/*` pages do NOT show the Topbar (signed-out); no double-mount; auth pages still work; an authed user hitting `/auth/signin` or `/auth/signup` is redirected to `/dashboard` (F6 guard)

### Phase 3: Pre-session screen

#### Automated

- [x] 3.1 Type checking passes: `npm run build` — acfc811
- [x] 3.2 Linting passes: `npm run lint` — acfc811

#### Manual

- [x] 3.3 Unauthenticated `/session/new` redirects to `/auth/signin`
- [x] 3.4 Three energy buttons render with selected state; Start disabled until one is picked
- [x] 3.5 Tapping Start with `medium` creates a row with correct `user_id`, `energy_level`, `started_at`; navigates to `/session/<id>`
- [x] 3.6 Network failure shows inline error and re-enables Start

### Phase 4: Active session page + timer + chime + rating

#### Automated

- [x] 4.1 Type checking passes: `npm run build` — 34587e3
- [x] 4.2 Linting passes: `npm run lint` — 34587e3
- [x] 4.3 Chime asset present at `public/audio/chime.mp3` — 34587e3

#### Manual

- [x] 4.4 25-minute (or dev-shortened) timer runs accurately; chime audible at focus-end; rating view appears
- [x] 4.5 Backgrounding tab for 30+ s and returning shows wall-clock-reconciled remaining time
- [x] 4.6 Screen-lock briefly during session preserves correct remaining time on unlock
- [x] 4.7 Manual stop early at 5:00 remaining: rating view appears (no chime); rating quickly vs. waiting 30 s before rating both yield `duration_seconds` ≈ 20\*60 (FR-012, client-snapshot pattern)
- [x] 4.8 Skip rating PATCHes `focus_rating: null`; dashboard row shows "Skipped"
- [x] 4.9 Rating 4 PATCHes `focus_rating: 4`; dashboard row shows `★ 4 / 5`
- [x] 4.10 After PATCH, `/dashboard` shows the new session at the top
- [x] 4.11 Hitting `/session/<id>` for an already-ended session redirects to `/dashboard`
- [x] 4.12 Hitting `/session/<id>` for a session not owned by the user redirects to `/dashboard`
- [x] 4.12a Hitting `/session/<id>` for an abandoned row (`started_at > 50 min ago`, `ended_at IS NULL`) redirects to `/dashboard`; dashboard renders the row as "Abandoned" (F4 guard)
- [-] 4.13 Cross-browser desktop spot-check (Chrome + Safari + Firefox) — golden path + chime
- [-] 4.14 Mobile spot-check (iOS Safari + Android Chrome) — golden path + chime

### Phase 5: End-to-end verification + lessons sync

#### Automated

- [x] 5.1 `npm run lint` exits 0 — 8a7b90e
- [x] 5.2 `npm run build` exits 0 — 8a7b90e
- [x] 5.3 `npm run db:test` exits 0 (all pgTAP assertions pass) — 8a7b90e

#### Manual

- [x] 5.4 Golden path complete end-to-end run, performed and confirmed — 8a7b90e
- [x] 5.5 60 s tab-backgrounding resilience verified mid-session — 8a7b90e
- [x] 5.6 Manual stop early records actual elapsed `duration_seconds` (FR-012) — 8a7b90e
- [x] 5.7 Skip-rating persists `focus_rating IS NULL`; dashboard renders "Skipped" — 8a7b90e
- [x] 5.8 Cross-browser desktop golden path passes on Chrome + Safari + Firefox — 8a7b90e
- [x] 5.9 Mobile golden path passes on iOS Safari + Android Chrome — 8a7b90e
- [x] 5.10 Cross-user isolation verified — second user cannot view first user's `/session/<id>` — 8a7b90e
- [x] 5.11 `lessons.md` either has new lesson(s) appended or the PR notes why none captured — 8a7b90e
