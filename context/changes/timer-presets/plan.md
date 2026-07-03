# Editable Timer Presets and Count-Up Session Mode (S-03) — Implementation Plan

## Overview

Ship FR-004 (three editable focus+break preset slots, defaults 25/5, 45/10, 90/15), FR-005 (count-up timer as a fourth mode), and FR-010 (per-session mode picker defaulting to last-used). Adopt the S-02 user-owned CRUD template for preset storage; persist last-used mode in `localStorage`; snapshot the chosen preset's durations onto the session row at start time so history is auditable even if the preset is later edited. Implement the opt-in break phase the PRD has been asking for (FR-011). Absorb S-05's removal of the 50-min time-based access guard, which would otherwise force-kill long count-up sessions on tab reload.

## Current State Analysis

(Synthesised from `research.md`; load-bearing facts only.)

- **Timer is countdown-only and hardcoded to 25 min** at three sites. `useFocusTimer` ([src/lib/timer/useFocusTimer.ts:97](src/lib/timer/useFocusTimer.ts#L97)) takes `focusSeconds`, derives `remaining` from wall-clock per L-03, and auto-flips `running → rating` on `remaining <= 0`. Break phase is **not implemented** in code.
- **`sessions.timer_mode` column already exists** with `count_up` whitelisted in the CHECK constraint ([migration:95-97](supabase/migrations/20260531182506_sessions_data_foundation.sql#L95-L97)); nobody writes it today. `duration_seconds` is GENERATED from `(ended_at - started_at)` — already actual wall-clock per FR-012.
- **50-min access guard** at [src/lib/session/access.ts:26](src/lib/session/access.ts#L26) would force-kill any count-up session resumed after 50 min.
- **No per-user preference state exists** today. No `user_profiles`, no `localStorage` use in `src/`. S-02 (`topics`, `material_formats`) is the only user-owned-CRUD template.
- **PATCH plausibility window** is `nowMs ± 2h`, **not** session duration. Any session length PATCHes cleanly so long as `ended_at ≈ now`.

## Desired End State

- A user can open `/presets`, see three preset slots (focus + break minutes per slot), edit any of them, and the change persists across devices.
- On the dashboard a four-chip mode strip sits above the energy/topic/format pickers (`P1 25/5`, `P2 45/10`, `P3 90/15`, `Count-up`), pre-selected to last-used (defaults to `preset_1` on first session).
- Starting a session with a preset: focus countdown runs → chime → rating UI → after rating, a "Take a 5-min break?" card → Yes runs the break countdown with end chime → "Done"; Skip navigates straight to `/dashboard`.
- Starting a session in count-up mode: elapsed mm:ss counts up; only "Stop" ends it (no chime); routes to rating → no break offer → `/dashboard`.
- `sessions` rows store `timer_mode`, `planned_focus_seconds`, `planned_break_seconds` (last two NULL for count-up), and the dashboard row shows a small mode badge.
- The 50-min access guard is gone; any in-flight session age is supported.

**Verification:** `npm run build`, `npm run lint`, `npm run db:test`, `npm run test:e2e` all pass; a manual smoke covers (1) editing a preset, (2) preset session with break, (3) count-up session over 60 min that survives a tab reload, (4) last-used mode is remembered.

### Key Discoveries

- F-01 already shipped `timer_mode` with `count_up` whitelisted — no migration to widen the CHECK ([migration:95-97](supabase/migrations/20260531182506_sessions_data_foundation.sql#L95-L97)).
- `duration_seconds` is GENERATED — count-up gets actual elapsed for free.
- The 2-hour PATCH window is a tampering guard (PATCH-vs-now lag), not a duration cap; long sessions PATCH fine.
- The L-02 audio prime is decoupled from any scheduled fire time, so the same primed `audioRef` can fire either at focus-end (preset) or at break-end (break phase) without re-priming.
- The S-02 user-owned CRUD pattern ([src/pages/api/topics/index.ts](src/pages/api/topics/index.ts), [src/components/topics/TopicManager.tsx](src/components/topics/TopicManager.tsx), [supabase/tests/rls_topics.sql](supabase/tests/rls_topics.sql)) is a tight template for `user_presets`.

## What We're NOT Doing

- **No `user_profiles` table.** Last-used mode lives in `localStorage`; presets live in their own table.
- **No editable break-only mode** ("just take a 5-min break, no focus first"). Break only appears after a preset focus session.
- **No mid-session preset edit.** Editing a preset on `/presets` does not retroactively change planned durations on already-started sessions (that's the point of the audit columns).
- **No mode-change once a session has started.** Mode is locked at POST time.
- **No replacement of the L-02 chime asset / no second chime sound.** Both focus-end and break-end use the same chime.
- **No archive / soft-delete for presets.** Three slots, always present; only "edit" is supported (no add/remove).
- **No FR-018 tab-title timer** (that's S-06).
- **No session note input** (S-04).
- **No chime on count-up `stopEarly()`** (per design call).
- **No backfill of `timer_mode` / `planned_*_seconds` on legacy rows.** They stay NULL; dashboard renders "—" for missing mode badges.

## Implementation Approach

Vertical slices with the riskiest piece (the timer hook) split into three independently-shippable phases. Schema lands first to unblock everything downstream. The preset CRUD ships before the dashboard ever needs presets, so we can build the management UI without races. Timer changes go preset-first (no behavior change for end users), then count-up, then break-phase. Mode picker + POST widening + dashboard badge land together because they're tightly coupled by the discriminator. The S-05 fold-forward is last and independent.

## Critical Implementation Details

- **L-03 must hold.** Every timer phase (focus countdown, count-up, break countdown) derives elapsed/remaining from `Date.now() - startedAtMs` on each `setTimeout` tick + `visibilitychange`. Never `setInterval`, never decrement a local counter. The break countdown's anchor is the `breakStartedAtMs` snapshot taken when the user clicks "Yes, take a break" (not `started_at`).
- **L-02 must hold across the new chime sites.** A single `audioRef` is primed on mount (Stage 2). It fires at preset focus-end and at break-end. Do not call `new Audio(src)` at fire time; always play the warmed ref. Fail-open `.catch(() => {})`.
- **L-01 must hold across the widened POST/PATCH surfaces.** Zod's default-strip + hand-picked `.insert()` / `.update()`. The PATCH write-set stays exactly `{ ended_at, focus_rating }`; `timer_mode` / `planned_*_seconds` are POST-only. Regression test must catch the combined failure (schema widened to a protected column AND endpoint spreads `parsed.data`).
- **Break is purely client-side state.** No DB writes during the break offer or break countdown. The session is already PATCHed at rating time. Navigation away during break loses nothing.
- **localStorage key:** `pomosapiens.last_mode`. Values: `"preset_1" | "preset_2" | "preset_3" | "count_up"`. Read once on dashboard mount; written on POST success. Hydration safety: SSR renders with `preset_1` default; client effect overwrites once read.
- **Lazy seed for user_presets.** GET coalesces server-side: any missing slot is merged with the hardcoded default values (25/5, 45/10, 90/15) before responding. PUT does an upsert keyed on `(user_id, slot)`. No "seed on signup" path — keeps the auth flow untouched.

## Phase 1: Schema — `user_presets` table + sessions audit columns

### Overview

One migration: create `public.user_presets` (per-user rows for slots 1/2/3, focus+break durations) and add nullable `planned_focus_seconds` / `planned_break_seconds` columns to `public.sessions`. Regenerate types. Add a pgTAP suite for the new table's RLS.

### Changes Required

#### 1. Migration

**File**: `supabase/migrations/<ts>_user_presets_and_session_audit_cols.sql`

**Intent**: Create the user-owned preset table with RLS mirroring the topics/material_formats pattern, and widen `sessions` with two nullable audit columns so history can distinguish "planned 45 min" from "actually 38 min" without coupling to live preset values.

**Contract**:

- `CREATE TABLE public.user_presets (id uuid pk default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, slot smallint NOT NULL CHECK (slot IN (1,2,3)), focus_seconds integer NOT NULL CHECK (focus_seconds BETWEEN 60 AND 4*60*60), break_seconds integer NOT NULL CHECK (break_seconds BETWEEN 0 AND 60*60), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, slot))`. No NULL-owner defaults — defaults live in app code; the API merges them server-side on GET.
- Index: `CREATE INDEX user_presets_user_id_idx ON public.user_presets (user_id)`.
- Trigger: `CREATE TRIGGER user_presets_set_updated_at BEFORE UPDATE ... EXECUTE FUNCTION public.set_updated_at()` (reuse existing function from F-01).
- RLS on; four per-operation policies scoped to `authenticated`, all using `(SELECT auth.uid()) = user_id` for USING/WITH CHECK. No NULL-owner read clause (presets are strictly per-user). `anon` denied by default.
- Grants: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presets TO authenticated, anon; GRANT ALL ... TO service_role, postgres;` (mirrors the pattern from `20260627140018_*`).
- `ALTER TABLE public.sessions ADD COLUMN planned_focus_seconds integer NULL CHECK (planned_focus_seconds IS NULL OR planned_focus_seconds BETWEEN 60 AND 4*60*60)`; same shape for `planned_break_seconds` with range `0..60*60`.

#### 2. Regenerated DB types

**File**: `src/db/database.types.ts`

**Intent**: Bring TypeScript in sync so `npm run lint` and the Supabase client type check the new table and columns.

**Contract**: Output of `npm run db:types` after running `npm run db:reset` against the new migration. The diff should add a `user_presets` Tables entry (Row/Insert/Update triples) and add `planned_focus_seconds: number | null` and `planned_break_seconds: number | null` to `sessions.Row`/`Insert`/`Update`.

#### 3. pgTAP suite

**File**: `supabase/tests/rls_user_presets.sql`

**Intent**: Cross-user RLS regression net required by the privacy NFR; one file per RLS-bearing table.

**Contract**: `BEGIN ... ROLLBACK` envelope (no persistent state). Mirrors `rls_topics.sql`'s shape — two test users, plan(N), set `request.jwt.claims` + `SET LOCAL ROLE authenticated`. Coverage: (a) user A reads only own rows, (b) user A cannot UPDATE user B's row, (c) user A cannot DELETE user B's row, (d) user A cannot INSERT with user B's `user_id` (throws 42501), (e) `anon` is fully denied SELECT/INSERT/UPDATE/DELETE, (f) CHECK constraints reject out-of-range `focus_seconds` / `break_seconds` and invalid `slot`.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npm run db:reset`
- Types regenerate without drift: `npm run db:types` (working tree clean after)
- pgTAP passes: `npm run db:test`
- Type check + lint pass: `npm run lint`

#### Manual Verification

- Local Supabase Studio shows `user_presets` table with the four policies enabled.
- `sessions` row shows the two new nullable columns.
- Inserting a row with `slot = 4` is rejected at the DB layer.

**Implementation Note**: Pause after Phase 1 for confirmation the migration + types diff look right before building any API on top.

---

## Phase 2: Preset CRUD API + Zod schemas

### Overview

Add `GET /api/user-presets` (returns three slots, server-merged with defaults) and `PUT /api/user-presets/[slot]` (upsert one slot's focus+break durations). No DELETE — three slots are permanent. Zod schemas in `src/lib/schemas/`. Both endpoints follow the cross-user-denial = 409-byte-identical pattern from S-02.

### Changes Required

#### 1. Zod schema

**File**: `src/lib/schemas/user-preset.ts`

**Intent**: Pin the write surface so L-01's default-strip layer holds when the endpoint hand-picks columns.

**Contract**: `updateUserPresetSchema = z.object({ focus_seconds: z.number().int().min(60).max(4*60*60), break_seconds: z.number().int().min(0).max(60*60) })`. Export inferred type. No `slot` field — slot is in the URL.

#### 2. Default presets constant

**File**: `src/lib/timer/preset-defaults.ts`

**Intent**: Single source of truth for the three default presets, consumed by GET coalescing, the timer hook fallback, and the mode-picker labels.

**Contract**: `export const DEFAULT_PRESETS: readonly { slot: 1 | 2 | 3; focus_seconds: number; break_seconds: number }[] = [{slot:1, focus_seconds:25*60, break_seconds:5*60}, {slot:2, focus_seconds:45*60, break_seconds:10*60}, {slot:3, focus_seconds:90*60, break_seconds:15*60}]`.

#### 3. GET endpoint

**File**: `src/pages/api/user-presets/index.ts`

**Intent**: Return all three slots for the current user; merge defaults for any missing slot so the client always sees `[slot1, slot2, slot3]`.

**Contract**: `prerender = false`. `GET` returns `{ presets: [{slot, focus_seconds, break_seconds}, ...3] }` with 200, or 401 unauthorized. Selects `slot, focus_seconds, break_seconds` from `user_presets` filtered by `user_id`. Server-side merge: for any `slot in {1,2,3}` without a row, fill from `DEFAULT_PRESETS`. Order by `slot ASC`.

#### 4. PUT endpoint

**File**: `src/pages/api/user-presets/[slot].ts`

**Intent**: Upsert a single slot. Slot is in the path; body carries the two durations only.

**Contract**: `prerender = false`. `PUT` parses slot from URL (must be `"1" | "2" | "3"`, else 400). Parses body with `updateUserPresetSchema`. Uses Supabase `.upsert({ user_id, slot, focus_seconds, break_seconds }, { onConflict: 'user_id,slot' })` then `.select(...).single()`. Returns the updated row with 200. RLS enforces ownership; no `eq("user_id", ...)` needed for filtering since RLS scopes the query, but the WITH CHECK on the insert path requires `user_id` in the payload.

### Success Criteria

#### Automated Verification

- Lint + type check pass: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- `curl GET /api/user-presets` as a signed-in user returns three slots with defaults on a fresh account.
- `curl PUT /api/user-presets/2` with `{focus_seconds: 50*60, break_seconds: 10*60}` returns 200 and the next GET reflects the change.
- `PUT /api/user-presets/4` returns 400 (invalid slot).
- `PUT /api/user-presets/1` with `focus_seconds: 30` returns 400 (below minimum).
- Unauthenticated `GET /api/user-presets` returns 401.

**Implementation Note**: Pause after Phase 2 for a manual `curl` smoke before moving to the management UI.

---

## Phase 3: Preset management page

### Overview

New `/presets` Astro page hosting a React `PresetManager` component (mirrors `TopicManager` shape). Three rows, each with focus and break inputs (in minutes for UX, converted to seconds on PUT). Inline save per row; optimistic update with rollback on error.

### Changes Required

#### 1. PresetManager component

**File**: `src/components/presets/PresetManager.tsx`

**Intent**: Render three preset rows with editable focus/break inputs and per-row Save. Read once on mount; PUT on Save; surface server validation errors inline.

**Contract**: Default-exported React component. Fetches `/api/user-presets` on mount. Renders three rows with shadcn `Input` (number, min=1, max=240 for focus minutes; min=0, max=60 for break minutes) + `Button` Save per row. Save button disabled when nothing changed for that row or when submitting. On PUT failure shows `<ServerError />` per row. Converts minutes ↔ seconds at the component boundary; nothing else sees minutes.

#### 2. Presets Astro page

**File**: `src/pages/presets.astro`

**Intent**: Auth-gated shell that mounts `PresetManager`.

**Contract**: SSRs with `Layout`; uses `Astro.locals.user` (redirect to `/auth/signin` if absent). Mounts `<PresetManager client:load />`. Mirrors `src/pages/topics/index.astro` structure.

#### 3. Middleware protected-routes entry

**File**: `src/middleware.ts`

**Intent**: Make `/presets` an authenticated route alongside `/dashboard`, `/topics`, `/formats`.

**Contract**: Add `"/presets"` to the existing `PROTECTED_ROUTES` array.

#### 4. Dashboard nav link

**File**: `src/pages/dashboard.astro`

**Intent**: Discoverable entry point to the new page from the only place users actually land.

**Contract**: Add a small "Manage presets" link in the dashboard header area near the existing Start session button or the topics/formats links (if those exist there — match the convention used for `/topics`).

### Success Criteria

#### Automated Verification

- Lint + type check pass: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Signed-in user can open `/presets`, see three rows with defaults, edit slot 2, click Save, reload, and the change persists.
- Submitting `focus_seconds = 0` shows a validation error in the row, no other row state lost.
- Unauthenticated visit to `/presets` redirects to `/auth/signin`.

**Implementation Note**: Pause after Phase 3 — the preset write path is now end-to-end testable in the browser before we touch the timer.

---

## Phase 4: Timer hook refactor — parameterise focus duration end-to-end (preset path, no behavior change)

### Overview

Refactor without adding modes or break yet: thread the focus duration from the DB through to `useFocusTimer` so the 25-minute literal disappears from `src/pages/session/[id].astro`. End-user behavior is identical (still 25 min for new sessions because the POST hasn't been widened yet — that's Phase 7); this phase de-risks the data plumbing in isolation.

### Changes Required

#### 1. Session detail page reads planned focus duration from row

**File**: `src/pages/session/[id].astro`

**Intent**: Replace the hardcoded `FOCUS_PRESET_SECONDS = 25 * 60` literal with the value from the session row, falling back to the 25-min default for legacy rows that have NULL.

**Contract**: Extend the SELECT projection to include `planned_focus_seconds`. Compute `const focusSeconds = data.planned_focus_seconds ?? 25 * 60`. Pass `focusSeconds` to `<SessionRunner focusSeconds={focusSeconds} ... />`. Keep `resolveSessionPageAccess` call unchanged (Phase 8 removes the guard entirely; until then the 25-min default keeps current behavior).

#### 2. (No changes to `useFocusTimer.ts` in this phase.)

The hook already accepts `focusSeconds` as a prop. Only the call site changes.

### Success Criteria

#### Automated Verification

- Lint + type check pass: `npm run lint`
- Build succeeds: `npm run build`
- Existing e2e specs still pass: `npm run test:e2e`

#### Manual Verification

- A new session (still 25 min via default) behaves identically to before — focus countdown, chime, rating, dashboard.
- A row manually edited in Studio to `planned_focus_seconds = 60` runs as a 60-second focus session.

**Implementation Note**: Pause after Phase 4 — confirm the data plumbing works on a manually-doctored row before adding mode complexity.

---

## Phase 5: Timer hook — count-up mode arm

### Overview

Add `mode: "preset" | "count_up"` to the hook. For `"count_up"`: disable both auto-flip useEffects (no chime, no transition to rating), and expose `elapsed` (positive, unbounded) instead of `remaining`. The render branch in `SessionRunner` switches on mode to show count-up vs countdown. Stop button still works in both modes.

### Changes Required

#### 1. Hook signature + behavior

**File**: `src/lib/timer/useFocusTimer.ts`

**Intent**: Add a mode discriminator that disables the auto-flip path for count-up while preserving the L-03 wall-clock derive and the L-02 audio prime for the preset path.

**Contract**: New prop `mode: "preset" | "count_up"`. Return value adds `elapsed: number` (always derived as `Math.max(0, Math.floor((now - startedAtMs) / 1000))`). When `mode === "count_up"`: both `useEffect` blocks that auto-flip on `remaining <= 0` early-return without firing the chime or calling `setPhase("rating")`. The Stage 2 audio prime still runs (cheap, harmless). `stopEarly()` sets `stoppedAtMs = Date.now()` and `phase = "rating"` for both modes — the rating path is unchanged. `remaining` is still computed but is meaningless for count-up (consumers should read `elapsed`).

#### 2. SessionRunner render branch + prop threading

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Show `elapsed` for count-up and `remaining` for preset; pass the mode through.

**Contract**: New prop `mode: "preset" | "count_up"`. Pass to `useFocusTimer`. In the running branch, render `formatTime(mode === "count_up" ? elapsed : remaining)`. Label flips between "Focus session" (preset) and "Count-up session" (count_up). Stop button label and behavior unchanged.

#### 3. Session detail page threads mode

**File**: `src/pages/session/[id].astro`

**Intent**: Pass the session's recorded `timer_mode` to `SessionRunner`; default to `"preset"` for legacy NULL rows.

**Contract**: Extend SELECT to include `timer_mode`. Compute `const mode = data.timer_mode === "count_up" ? "count_up" : "preset"`. Pass `mode` to `<SessionRunner />`.

### Success Criteria

#### Automated Verification

- Lint + type check pass: `npm run lint`
- Build succeeds: `npm run build`
- Existing e2e specs still pass: `npm run test:e2e`

#### Manual Verification

- A row manually edited in Studio to `timer_mode = 'count_up'` runs as a count-up session that does not auto-flip; only "Stop" ends it. Manual-stopping routes to rating; rating PATCH stores actual elapsed `duration_seconds` correctly.
- A preset session still chimes and auto-flips to rating as before.

**Implementation Note**: Pause after Phase 5 to confirm both modes render correctly off a doctored row. Phase 7 will wire the UI to choose mode at start.

---

## Phase 6: Timer hook — opt-in break-phase after rating

### Overview

After the rating PATCH succeeds for a **preset** session with a non-NULL `planned_break_seconds`, show a "Take a break?" card with Yes / Skip. Yes runs a client-only break countdown using the same wall-clock derive + same primed `audioRef` for the end chime; navigates to `/dashboard` on completion or on user-cancel. Skip navigates immediately. Count-up sessions skip the offer entirely. Break is purely client state — no DB writes.

### Changes Required

#### 1. Break sub-hook

**File**: `src/lib/timer/useBreakTimer.ts`

**Intent**: Mirror the L-03 wall-clock derive for the break countdown; reuse the parent component's `audioRef` for the end chime.

**Contract**: `useBreakTimer({ breakStartedAtMs: number | null, breakSeconds: number, audioRef: RefObject<HTMLAudioElement | null>, onComplete: () => void }) => { remaining: number, cancel: () => void }`. When `breakStartedAtMs === null`, the hook is dormant. When set, runs the same `setTimeout` chain + `visibilitychange` reconciliation as `useFocusTimer`. On `remaining <= 0`, plays the chime via `audioRef.current?.play().catch(() => {})` and calls `onComplete()` once. `cancel()` calls `onComplete()` without playing.

#### 2. SessionRunner — break offer + break running phases

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: After a successful rating PATCH, branch on mode + presence of `breakSeconds` to either navigate immediately (count_up, or breakSeconds <= 0, or after the break) or render the break offer card.

**Contract**: New props `breakSeconds: number | null` (null for count_up; >0 for preset; planned_break_seconds value). New internal phase enum: `"running" | "rating" | "break_offer" | "running_break"`. After successful PATCH: if `mode === "count_up" || breakSeconds === null || breakSeconds <= 0`, navigate to `/dashboard` (current behavior). Else `setPhase("break_offer")`. `break_offer` renders two buttons: "Take a break" (sets `breakStartedAtMs = Date.now()`, `setPhase("running_break")`) and "Skip" (navigates). `running_break` renders `formatTime(breakRemaining)` + "End break" button (calls `cancel`). The audio ref from `useFocusTimer`'s mount-time Stage-2 prime is passed to `useBreakTimer`; `useFocusTimer` exposes it via the return value (new field `audioRef`) so the break can fire the same primed chime.

#### 3. useFocusTimer — expose audioRef

**File**: `src/lib/timer/useFocusTimer.ts`

**Intent**: Surface the primed ref so the break sub-hook can fire the same chime without re-priming (L-02 prime contract is decoupled from fire site).

**Contract**: Return `audioRef` in the result object (the existing internal ref, no new construction).

#### 4. Session detail page passes breakSeconds

**File**: `src/pages/session/[id].astro`

**Intent**: Thread `planned_break_seconds` to `SessionRunner`.

**Contract**: Extend SELECT to include `planned_break_seconds`. Compute `const breakSeconds = data.timer_mode === "count_up" ? null : (data.planned_break_seconds ?? 0)`. Pass `breakSeconds` to `<SessionRunner />`.

### Success Criteria

#### Automated Verification

- Lint + type check pass: `npm run lint`
- Build succeeds: `npm run build`
- Existing e2e specs still pass: `npm run test:e2e`

#### Manual Verification

- Preset session (doctored row with `planned_break_seconds = 60`): focus ends → chime → rating → after rating, break offer appears → Yes runs 60s countdown → chime fires → navigates to `/dashboard`.
- Same flow but Skip on the offer: navigates immediately, no countdown.
- "End break" mid-countdown navigates immediately, no chime.
- Count-up doctored row: rating → navigates to `/dashboard` (no break offer).
- Tab-switching during break does not desync — return reconciles via `visibilitychange`.

**Implementation Note**: Pause after Phase 6 — the timer surface is now complete; what's left is wiring the user choice of mode.

---

## Phase 7: Mode picker + start-flow wiring (UI + POST widening + dashboard badge)

### Overview

Add the mode strip above `EnergyPicker`, default-select from `localStorage.pomosapiens.last_mode`. Pass the chosen mode through the Start handler. Widen the POST endpoint and Zod schema to accept `timer_mode` + `planned_focus_seconds` + `planned_break_seconds`. EnergyPicker fetches `/api/user-presets` once to know the durations for the three preset chips. Dashboard SELECT picks up `timer_mode` and renders a small badge per row.

### Changes Required

#### 1. ModePicker component

**File**: `src/components/session/ModePicker.tsx`

**Intent**: Compact four-chip selector showing slot labels (`P1 25/5`, `P2 45/10`, `P3 90/15`, `Count-up`) using actual user preset values, with the last-used pre-selected.

**Contract**: Props: `presets: { slot: 1|2|3; focus_seconds: number; break_seconds: number }[]`, `value: "preset_1"|"preset_2"|"preset_3"|"count_up"`, `onChange: (mode) => void`. Renders four `Button` chips styled like the energy buttons; `aria-pressed` set on the chosen one. Labels for preset chips show focus/break in minutes (`P1 ${focus}/${break}`). No internal state.

#### 2. EnergyPicker — integrate mode picker, presets fetch, last-used persistence, POST widening

**File**: `src/components/session/EnergyPicker.tsx`

**Intent**: Become the orchestrator for the full start flow: load presets alongside topics/formats, restore last-used mode from `localStorage`, render the mode strip, and include the mode + planned durations in the POST body. Persist last-used on success.

**Contract**: New state: `presets` (set from `/api/user-presets`), `mode` (init from `localStorage.getItem("pomosapiens.last_mode") || "preset_1"` inside a `useEffect` to avoid SSR mismatch — SSR sees `"preset_1"`, client hydration may overwrite). Extend the existing `Promise.all` to also fetch `/api/user-presets`. Render `<ModePicker presets={presets} value={mode} onChange={setMode} />` above the energy buttons. In `handleSubmit`, compute `const selectedPreset = mode === "count_up" ? null : presets.find(p => \`preset\_${p.slot}\` === mode)`. Include in POST body: `timer_mode: mode, planned_focus_seconds: selectedPreset?.focus_seconds ?? null, planned_break_seconds: selectedPreset?.break_seconds ?? null`. On POST success, `localStorage.setItem("pomosapiens.last_mode", mode)` before navigating.

#### 3. Zod schema — widen createSessionSchema

**File**: `src/lib/schemas/session.ts`

**Intent**: Accept the three new fields with strict types so L-01's default-strip layer continues to gate the write surface.

**Contract**: Extend `createSessionSchema` with `timer_mode: z.enum(["preset_1", "preset_2", "preset_3", "count_up"])` (required, no default — caller must send it) and `planned_focus_seconds: z.number().int().min(60).max(4*60*60).nullable()` and `planned_break_seconds: z.number().int().min(0).max(60*60).nullable()`. **`endSessionSchema` is NOT widened.** PATCH continues to accept only `focus_rating` + `ended_at`.

#### 4. POST endpoint — write the new columns (L-01 hand-pick)

**File**: `src/pages/api/sessions/index.ts`

**Intent**: Pass the three new fields into the existing hand-picked `.insert(...)` call. Continue not to spread `parsed.data`.

**Contract**: Add `timer_mode: parsed.data.timer_mode, planned_focus_seconds: parsed.data.planned_focus_seconds, planned_break_seconds: parsed.data.planned_break_seconds` to the existing `.insert({...})` literal. Add a server-side consistency check: if `timer_mode === "count_up"` then both `planned_*_seconds` must be `null`; if `timer_mode` is a preset then both must be non-null. Return 400 on violation. (This guards against a malicious client sending mismatched values that the dashboard would then mis-render.)

#### 5. Dashboard — surface timer_mode badge

**File**: `src/pages/dashboard.astro`

**Intent**: Extend the SELECT projection and add a small mode badge in each row.

**Contract**: Add `timer_mode` to the SELECT string. Add a helper `function modeLabel(mode: string | null): string | null` returning `"P1" / "P2" / "P3" / "∞"` or `null`. In the row render, when `modeLabel(...) !== null`, render an extra `<span class="bg-charred ...">` badge in the existing tag row alongside topic/format. Legacy NULL rows render no badge.

### Success Criteria

#### Automated Verification

- Lint + type check pass: `npm run lint`
- Build succeeds: `npm run build`
- `npm run test:e2e` — existing specs still pass (start a default-mode session).
- **New regression test (Vitest or e2e):** POSTing `{energy_level, timer_mode: "count_up", planned_focus_seconds: 25*60, planned_break_seconds: 5*60}` returns 400 (consistency check). POSTing without `timer_mode` returns 400 (Zod). POSTing `{energy_level, focus_rating: 5, timer_mode: "preset_1", ...}` (attempting to slip a protected `focus_rating` into the POST) succeeds but the row's `focus_rating` is NULL (L-01 hand-pick proof).

#### Manual Verification

- Dashboard shows the four-chip mode strip; defaults to `preset_1` on first visit; after starting a `preset_2` session, dashboard reloads with `preset_2` pre-selected.
- Count-up session: choose Count-up, Start, count-up timer runs, Stop after >60s, rate, navigate to dashboard, badge shows `∞` (or whichever label) on the row.
- Preset session with edited preset: edit slot 2 to 1-min focus / 30-sec break on `/presets`, start a `preset_2` session from the dashboard, focus ends in ~1 min, rating, break offer for 30s, chime, dashboard.
- Editing slot 2 to a different value mid-stream does NOT change the already-running session (planned\_\* snapshotted at POST).

**Implementation Note**: Pause after Phase 7 — the feature is end-user complete except for the access-guard removal. Verify the 3-tap guardrail still holds (Start with all defaults = three clicks: energy + Start, no extra friction).

---

## Phase 8: Fold S-05 forward — remove the 50-min access guard

### Overview

Drop the time-based redirect in `resolveSessionPageAccess`. Adjust the dashboard's `getStatus` to classify any row without `ended_at` as `"in_progress"` regardless of age (no more `"abandoned"`). Remove the unused `FOCUS_PRESET_SECONDS` constants from both call sites. Update the roadmap to mark S-05's relevant question closed (and the slice partially absorbed). Add a lesson if a new pattern emerged.

### Changes Required

#### 1. Access guard — remove time-based branch

**File**: `src/lib/session/access.ts`

**Intent**: Strip the 50-min force-redirect. Any non-ended row owned by the user is `"allow"`.

**Contract**: Drop the `if (nowMs - startedAtMs > 2 * focusPresetSeconds * 1000) ...` block and the `focusPresetSeconds` parameter from the function signature. Also drop `nowMs` if it becomes unused. Update the `TODO(S-05)` comment to "S-03 fold-forward: time-based abandon removed. Any non-ended session is in progress." Existing redirects for `row === null` and `row.ended_at !== null` stay.

#### 2. Session detail page — drop the constant

**File**: `src/pages/session/[id].astro`

**Intent**: Stop passing the now-removed parameter.

**Contract**: Remove the local `FOCUS_PRESET_SECONDS` literal and the `focusPresetSeconds` argument to `resolveSessionPageAccess`. (Phase 4 already replaced the focusSeconds wire with the row value.)

#### 3. Dashboard — drop "abandoned", drop the constant

**File**: `src/pages/dashboard.astro`

**Intent**: Time-based abandon is gone. Non-ended → `"in_progress"`. Remove dead constants.

**Contract**: Delete `FOCUS_PRESET_SECONDS` and `ABANDONED_THRESHOLD_MS`. Simplify `getStatus` to: `return session.ended_at !== null ? "done" : "in_progress"`. Remove the `: "Abandoned"` branch from the row render.

#### 4. Existing access tests

**File**: `src/lib/session/access.test.ts` (if it exists) and/or e2e specs that pin the 50-min behavior

**Intent**: Replace the regression test for the time-based redirect with a test that asserts a 4-hour-old non-ended session is allowed.

**Contract**: Drop tests that assert redirect on `>50 min`. Add (or modify) a test that asserts `resolveSessionPageAccess({ row: <4h-old non-ended>, nowMs })` returns `{ kind: "allow", startedAtMs }`.

#### 5. Roadmap update

**File**: `context/foundation/roadmap.md`

**Intent**: Reflect that S-05's time-based guard removal landed in S-03. Mark S-05's first unknown as resolved (or amend S-05's scope to "abandon button" only).

**Contract**: Under S-05 §Unknowns, strike the question about the 2-hour bound (it's still relevant — confirm in plan time it remains the right guard for PATCH-vs-now lag). Note in S-03's §Risk that the 50-min guard removal was absorbed. Status change is not required (S-05's status remains `proposed` — only the abandon button is outstanding).

#### 6. (Optional) Lessons update

**File**: `context/foundation/lessons.md`

**Intent**: Capture L-05 if a non-obvious rule emerged — e.g. "Time-based access guards are duration-coupled and fold under any feature that breaks the duration assumption (count-up, deep work). Prefer explicit user actions for state transitions."

**Contract**: Append-only register. Add only if the rule is recurring and surprising; otherwise skip. (Author judgement at implement time.)

### Success Criteria

#### Automated Verification

- Lint + type check pass: `npm run lint`
- Build succeeds: `npm run build`
- All tests pass: `npm run test`, `npm run db:test`, `npm run test:e2e`
- No remaining references to `FOCUS_PRESET_SECONDS` or `ABANDONED_THRESHOLD_MS`: `rg "FOCUS_PRESET_SECONDS|ABANDONED_THRESHOLD_MS" src/` returns nothing.

#### Manual Verification

- A session started 2 hours ago and left running is still accessible at `/session/<id>` (no redirect to `/dashboard`).
- Dashboard shows it as "In progress", not "Abandoned".
- A count-up session of >60 min, started, tab closed, reopened: page resumes the count-up correctly.

**Implementation Note**: Pause after Phase 8 — final manual smoke covers a long count-up session through reload to confirm the access-guard fix.

---

## Testing Strategy

### Unit Tests

- `resolveSessionPageAccess` after Phase 8: non-ended row always allowed; ended row always redirected; null row always redirected.
- `useFocusTimer` (count-up mode): no chime, no auto-flip, `elapsed` increases monotonically per second.
- `useBreakTimer`: chimes once at end; `cancel` suppresses chime; visibility reconcile derives `remaining` from wall clock.
- Zod schemas: `createSessionSchema` rejects missing `timer_mode`, accepts count-up with null durations, rejects out-of-range durations.

### Integration / pgTAP Tests

- `rls_user_presets.sql`: 4 RLS operations × 2 users + `anon` denied + CHECK constraints.
- Update `rls_sessions.sql` if its INSERT fixtures now require the new columns (they're nullable, so should not).
- L-01 regression test (Vitest): POST with a protected column in the body succeeds but doesn't persist it.

### Manual Testing Steps

1. **Preset edit + persistence**: edit slot 2 to `50/10` on `/presets`, reload, value persists. Sign out + back in, value still persists (cross-session, server-stored).
2. **Default count-up smoke**: pick Count-up, Start, wait 90s, Stop, rate 4, see dashboard row with `∞` badge and duration ~01:30.
3. **Long count-up survives reload**: pick Count-up, Start, leave for 60+ min, refresh tab, count-up resumes with correct elapsed (post Phase 8 only — pre-Phase-8 would force-redirect).
4. **Break flow**: preset 1, Start, wait 25 min (or doctor `planned_focus_seconds = 60` in Studio for fast iteration), focus chime, rate, Take a break, break runs, chime, dashboard.
5. **Last-used mode**: start preset 3, complete or abandon, dashboard reloads with preset 3 pre-selected on the mode strip.
6. **3-tap guardrail**: from a fresh visit with last-used = preset_1, click energy + Start = 2 clicks, mode picker pre-set. Confirms no added friction.
7. **L-02 chime on break-end on Safari**: confirm break chime fires after user-gesture-primed page (rating click counts as same-document user-activation feed for the break-end audio).
8. **Tab switching during break**: Take a break, switch tabs for 30s, switch back, break timer shows correct remaining.

## Performance Considerations

- `GET /api/user-presets` adds one query on each session start (alongside the existing topics + formats fetches in `EnergyPicker`). Three rows max; negligible.
- The new `user_presets_user_id_idx` covers the single SELECT pattern.
- `sessions` audit columns add two nullable integers per row; storage delta negligible.
- The break sub-hook adds a second `setTimeout` chain only during the break (≤60 min). No background tick when idle (dormant when `breakStartedAtMs === null`).
- `localStorage` read on dashboard mount is synchronous and cheap; one write per session start.

## Migration Notes

- **Legacy sessions** stay readable: `timer_mode`, `planned_focus_seconds`, `planned_break_seconds` are all nullable. Dashboard renders no badge for NULL mode and `planned_focus_seconds ?? 25*60` falls back to the historical default in the session detail page if anyone reopens an unfinished legacy row (post-Phase-8 they can).
- **No data backfill.** Past sessions reported "25-min focus, ?-break" before; the absence of audit columns reflects that we never knew.
- **Migration is forward-compatible with S-04 chart.** `planned_focus_seconds` vs `duration_seconds` is exactly the "expected vs actual" axis a future chart can plot.
- **Rollback:** Phases 1–7 are additive; if Phase 8 needs to revert, restore the time-based guard branch and the `FOCUS_PRESET_SECONDS` constants — schema is unaffected.

## References

- Research: [context/changes/timer-presets/research.md](context/changes/timer-presets/research.md)
- Roadmap entry: [context/foundation/roadmap.md:110-120](context/foundation/roadmap.md#L110-L120)
- S-02 CRUD template: [context/archive/2026-06-27-categorize-sessions-topic-format/plan.md](context/archive/2026-06-27-categorize-sessions-topic-format/plan.md)
- S-01 timer + audio prime: [context/archive/2026-06-19-first-session-capture-loop/plan.md](context/archive/2026-06-19-first-session-capture-loop/plan.md)
- L-01 (column-scope), L-02 (audio prime), L-03 (wall-clock derive): [context/foundation/lessons.md](context/foundation/lessons.md)
- F-01 schema: [supabase/migrations/20260531182506_sessions_data_foundation.sql](supabase/migrations/20260531182506_sessions_data_foundation.sql)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema — user_presets table + sessions audit columns

#### Automated

- [x] 1.1 Migration applies cleanly: `npm run db:reset` — e1b378d
- [x] 1.2 Types regenerate without drift: `npm run db:types` (working tree clean after) — e1b378d
- [x] 1.3 pgTAP passes: `npm run db:test` — e1b378d
- [x] 1.4 Type check + lint pass: `npm run lint` — e1b378d

#### Manual

- [x] 1.5 Local Supabase Studio shows `user_presets` table with the four policies enabled — e1b378d
- [x] 1.6 `sessions` row shows the two new nullable columns — e1b378d
- [x] 1.7 Inserting a row with `slot = 4` is rejected at the DB layer — e1b378d

### Phase 2: Preset CRUD API + Zod schemas

#### Automated

- [x] 2.1 Lint + type check pass: `npm run lint` — 4be6579
- [x] 2.2 Build succeeds: `npm run build` — 4be6579

#### Manual

- [x] 2.3 GET /api/user-presets returns three default slots on a fresh account — 4be6579
- [x] 2.4 PUT /api/user-presets/2 updates and persists across GET — 4be6579
- [x] 2.5 PUT /api/user-presets/4 returns 400 — 4be6579
- [x] 2.6 PUT /api/user-presets/1 with focus_seconds=30 returns 400 — 4be6579
- [x] 2.7 Unauthenticated GET returns 401 — 4be6579

### Phase 3: Preset management page

#### Automated

- [x] 3.1 Lint + type check pass: `npm run lint` — ed04db5
- [x] 3.2 Build succeeds: `npm run build` — ed04db5

#### Manual

- [x] 3.3 Signed-in user can open /presets, edit slot 2, save, reload, change persists — ed04db5
- [x] 3.4 focus_seconds=0 shows inline validation error without losing other rows — ed04db5
- [x] 3.5 Unauthenticated /presets redirects to /auth/signin — ed04db5

### Phase 4: Timer hook refactor — parameterise focus duration end-to-end

#### Automated

- [x] 4.1 Lint + type check pass: `npm run lint` — de5a1a3
- [x] 4.2 Build succeeds: `npm run build` — de5a1a3
- [x] 4.3 Existing e2e specs still pass: `npm run test:e2e` — de5a1a3

#### Manual

- [x] 4.4 New 25-min session behaves identically (focus, chime, rating, dashboard) — de5a1a3
- [x] 4.5 Doctored row with planned_focus_seconds=60 runs as 60-second focus — de5a1a3

### Phase 5: Timer hook — count-up mode arm

#### Automated

- [x] 5.1 Lint + type check pass: `npm run lint` — c1075ea
- [x] 5.2 Build succeeds: `npm run build` — c1075ea
- [x] 5.3 Existing e2e specs still pass: `npm run test:e2e` — c1075ea

#### Manual

- [x] 5.4 Doctored count-up row does not auto-flip; Stop ends it; PATCH stores actual elapsed — c1075ea
- [x] 5.5 Preset session still chimes and auto-flips — c1075ea

### Phase 6: Timer hook — opt-in break-phase after rating

#### Automated

- [x] 6.1 Lint + type check pass: `npm run lint` - 85483a3
- [x] 6.2 Build succeeds: `npm run build` - 85483a3
- [x] 6.3 Existing e2e specs still pass: `npm run test:e2e` - 85483a3

#### Manual

- [x] 6.4 Preset doctored with planned_break_seconds=60: rating → break offer → Yes → 60s countdown → chime → /dashboard - 85483a3
- [x] 6.5 Skip on the offer navigates immediately - 85483a3
- [x] 6.6 End-break mid-countdown navigates immediately, no chime - 85483a3
- [x] 6.7 Count-up: no break offer after rating - 85483a3
- [x] 6.8 Tab-switching during break reconciles via visibilitychange - 85483a3

### Phase 7: Mode picker + start-flow wiring

#### Automated

- [x] 7.1 Lint + type check pass: `npm run lint`
- [x] 7.2 Build succeeds: `npm run build`
- [x] 7.3 e2e specs pass: `npm run test:e2e`
- [x] 7.4 New regression: POST with mismatched timer*mode + planned*\* returns 400
- [x] 7.5 New regression: POST without timer_mode returns 400
- [x] 7.6 L-01 regression: POST with a protected column in body does not persist it

#### Manual

- [ ] 7.7 Four-chip mode strip renders; defaults to preset_1 on first visit
- [ ] 7.8 After preset_2 session, dashboard reload pre-selects preset_2
- [ ] 7.9 Count-up end-to-end with badge on dashboard row
- [ ] 7.10 Edited preset (slot 2 → 1min/30sec) runs correctly; mid-flight preset edit does not affect running session
- [ ] 7.11 3-tap guardrail holds (energy + Start, no extra friction with default mode)

### Phase 8: Fold S-05 forward — remove the 50-min access guard

#### Automated

- [ ] 8.1 Lint + type check pass: `npm run lint`
- [ ] 8.2 Build succeeds: `npm run build`
- [ ] 8.3 All tests pass: `npm run test`, `npm run db:test`, `npm run test:e2e`
- [ ] 8.4 No remaining references to FOCUS_PRESET_SECONDS / ABANDONED_THRESHOLD_MS in src/

#### Manual

- [ ] 8.5 2-hour-old non-ended session still accessible at /session/<id>
- [ ] 8.6 Dashboard shows it as "In progress" (no "Abandoned" label remaining)
- [ ] 8.7 Long count-up session of >60 min survives a tab close + reopen

### Phase 9: Bugfixes

- [x] 9.1. GIVEN `/session/new` page visited WHEN I click on `P2` chip THEN `P1` chip highlight is off
