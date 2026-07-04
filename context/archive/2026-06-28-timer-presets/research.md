---
date: 2026-06-28T00:00:00+02:00
researcher: pawel
git_commit: 51e61ec37cb1ee9d4fa1e5a3125effefd21bf8c5
branch: main
repository: plpabla/pomosapiens
topic: "Editable timer presets and count-up session mode (S-03)"
tags: [research, codebase, timer, presets, count-up, sessions, S-03]
status: complete
last_updated: 2026-06-28
last_updated_by: pawel
---

# Research: Editable timer presets and count-up session mode (S-03)

**Date**: 2026-06-28
**Researcher**: pawel
**Git Commit**: 51e61ec37cb1ee9d4fa1e5a3125effefd21bf8c5
**Branch**: main
**Repository**: plpabla/pomosapiens

## Research Question

S-03 from [roadmap.md](context/foundation/roadmap.md#L110-L120) adds: (a) three editable timer preset slots with focus + break durations (defaults 25/5, 45/10, 90/15 min), (b) a count-up timer mode as a fourth option, and (c) a per-session mode picker that defaults to last-used. Research scope (per `/10x-research` clarification): **comprehensive deep dive** focused on the **current timer + session state machine** and the **count-up impact** on session-save logic, the FR-012 "actual elapsed time" rule, and the audio chime path.

## Summary

**The schema is already mostly ready.** [supabase/migrations/20260531182506_sessions_data_foundation.sql:95-97](supabase/migrations/20260531182506_sessions_data_foundation.sql#L95-L97) shipped `timer_mode text NULL CHECK (... IN ('preset_1','preset_2','preset_3','count_up'))` in F-01 as anticipating-but-nullable, and `duration_seconds` is a GENERATED column computed from `ended_at - started_at` ([:85-90](supabase/migrations/20260531182506_sessions_data_foundation.sql#L85-L90)), i.e. already "actual elapsed wall time". Nobody writes `timer_mode` today.

**The timer state machine is countdown-only and hardcoded to 25 minutes.** [src/lib/timer/useFocusTimer.ts](src/lib/timer/useFocusTimer.ts) takes a fixed `focusSeconds` prop, derives `remaining` from wall-clock (L-03), and auto-flips `phase: "running" → "rating"` when `remaining <= 0`. There is **no break phase implemented in code** today, despite the FR-011 spec and the 25/5 defaults — the chime fires and we jump straight to rating. `FOCUS_PRESET_SECONDS = 25 * 60` is duplicated as a literal in three places ([dashboard.astro:20](src/pages/dashboard.astro#L20), [session/[id].astro:34](src/pages/session/[id].astro#L34), and threaded as a parameter into [src/lib/session/access.ts](src/lib/session/access.ts)).

**Count-up has six concrete impact points.** Most disruptive: the auto-flip useEffects in `useFocusTimer.ts` (both the tick and the visibilitychange handler assume `focusSeconds` is finite); the access guard at [src/lib/session/access.ts:26](src/lib/session/access.ts#L26) (`nowMs - startedAtMs > 2 * focusPresetSeconds * 1000`, i.e. 50 min) will **force-kill** any count-up session that survives a tab reload after 50 minutes. Least disruptive: the FR-012 elapsed-time rule and the rating-prompt-on-manual-stop path are already correct and reusable.

**No per-user preferences table exists.** S-03 introduces the first persistent per-user state in the project. No `user_profiles`, no `localStorage` use anywhere in `src/`. The S-02 (`topics` / `material_formats`) precedent gives a strong template for a user-owned CRUD table, RLS shape, and management page.

## Detailed Findings

### A. Current timer + session state

#### A.1 Hardcoded preset duration (three sites, no shared constant)

The focus duration is the literal `25 * 60` in three places, with no shared module:

- [src/pages/session/[id].astro:34](src/pages/session/[id].astro#L34) — `const FOCUS_PRESET_SECONDS = 25 * 60;`, passed to `<SessionRunner focusSeconds={FOCUS_PRESET_SECONDS} />`
- [src/pages/dashboard.astro:20](src/pages/dashboard.astro#L20) — same constant, used only for `ABANDONED_THRESHOLD_MS = 2 * FOCUS_PRESET_SECONDS * 1000` (50-min in-progress/abandoned classification)
- [src/lib/session/access.ts:13-31](src/lib/session/access.ts#L13-L31) — receives `focusPresetSeconds` as a parameter and gates session-page access on `nowMs - startedAtMs > 2 * focusPresetSeconds * 1000`

**Break duration does not exist in code at all.** No `BREAK_PRESET_SECONDS`, no `5 * 60`, no break phase logic. The S-01 plan deferred a visible break countdown; the implementation flips straight from `running → rating`.

#### A.2 Session DB schema (already S-03-friendly in shape)

Table `public.sessions` ([src/db/database.types.ts:69-130](src/db/database.types.ts#L69-L130), migration [20260531182506_sessions_data_foundation.sql:80-102](supabase/migrations/20260531182506_sessions_data_foundation.sql#L80-L102)):

| Column | Type | Nullable | Default | Written by |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | DB |
| `user_id` | uuid | no | — | POST `/api/sessions` (server: `context.locals.user.id`) |
| `started_at` | timestamptz | no | — | POST (server `new Date().toISOString()`) |
| `ended_at` | timestamptz | yes | NULL | PATCH (client snapshot) |
| `duration_seconds` | int | yes | **GENERATED** from `(ended_at - started_at)` | DB-computed |
| `energy_level` | enum `low\|medium\|high` | no | — | POST (client body) |
| `focus_rating` | smallint CHECK 1-5 | yes | NULL | PATCH (client body) |
| `topic_id` | uuid FK→topics | yes | NULL | POST (S-02) |
| `material_format_id` | uuid FK→material_formats | yes | NULL | POST (S-02) |
| `timer_mode` | text CHECK IN ('preset_1','preset_2','preset_3','count_up') | yes | NULL | **nobody writes it today** |
| `note` | text | yes | NULL | nobody (deferred to S-04) |
| `created_at`, `updated_at` | timestamptz | no | `now()` | DB + `set_updated_at` trigger |

Key observations:
- `timer_mode` CHECK whitelist is **locked**: changing identifiers requires a migration.
- There is **no `focus_duration_seconds` / `break_duration_seconds` column** on sessions. The schema is duration-agnostic; `duration_seconds` is the actual elapsed wall time.
- No `user_profiles` / `user_preferences` / `user_settings` table exists in any migration.

#### A.3 POST /api/sessions (start)

[src/pages/api/sessions/index.ts:23-32](src/pages/api/sessions/index.ts#L23-L32) hand-picks: `user_id, energy_level, started_at = now(), topic_id, material_format_id`. Zod schema [src/lib/schemas/session.ts:3-9](src/lib/schemas/session.ts#L3-L9) accepts only `energy_level + topic_id + material_format_id`. No spread (L-01 column-scope). Returns `{ id, started_at }` with 201.

#### A.4 Running timer (the load-bearing piece)

Page [src/pages/session/[id].astro](src/pages/session/[id].astro) SSRs, selects `id, started_at, ended_at, energy_level` ([:25](src/pages/session/[id].astro#L25)), computes `startedAtMs` via `resolveSessionPageAccess` ([:34-49](src/pages/session/[id].astro#L34-L49)), then mounts [src/components/session/SessionRunner.tsx:19](src/components/session/SessionRunner.tsx#L19) with `client:load`.

[src/lib/timer/useFocusTimer.ts](src/lib/timer/useFocusTimer.ts):

- Exposes `phase: "running" | "rating"` ([:10](src/lib/timer/useFocusTimer.ts#L10)). **No break phase.**
- `remaining = focusSeconds - Math.floor((now - startedAtMs) / 1000)` ([:97](src/lib/timer/useFocusTimer.ts#L97)) — derived from wall-clock per L-03, never decremented; uses a `setTimeout` chain, not `setInterval` ([:51](src/lib/timer/useFocusTimer.ts#L51)).
- `visibilitychange` reconciliation ([:71-90](src/lib/timer/useFocusTimer.ts#L71-L90)) re-derives on tab return.
- **Auto-flip path 1 (tick):** [:54-61](src/lib/timer/useFocusTimer.ts#L54-L61) — when `remaining <= 0`, sets `stoppedAtMs = startedAtMs + focusSeconds * 1000` (nominal end), plays chime, phase = `"rating"`.
- **Auto-flip path 2 (visibility return):** [:72-90](src/lib/timer/useFocusTimer.ts#L72-L90) — same calc on tab return.
- **Manual stop:** `stopEarly()` at [:92-95](src/lib/timer/useFocusTimer.ts#L92-L95) sets `stoppedAtMs = Date.now()` (true wall-clock), phase = `"rating"`. Triggered by the "Stop early" button in [SessionRunner.tsx:56](src/components/session/SessionRunner.tsx#L56).
- **Chime (L-02 two-stage prime):** Stage 1 in [src/components/session/EnergyPicker.tsx](src/components/session/EnergyPicker.tsx) (Start handler); Stage 2 in `useFocusTimer.ts:23-45` (mount-time prime, stored in `audioRef`); invoked at [:57](src/lib/timer/useFocusTimer.ts#L57) and [:79](src/lib/timer/useFocusTimer.ts#L79) with fail-open `.catch(() => {})`.

[src/components/session/SessionRunner.tsx](src/components/session/SessionRunner.tsx):

- [:51-60](src/components/session/SessionRunner.tsx#L51-L60) — render branches on `phase === "running"` to show `formatTime(remaining)` + Stop button.
- [:23-49](src/components/session/SessionRunner.tsx#L23-L49) — `handleRate(rating | null)` PATCHes `{ ended_at: new Date(stoppedAtMs).toISOString(), focus_rating: rating }` and navigates to `/dashboard`.
- [:64-89](src/components/session/SessionRunner.tsx#L64-L89) — 1-5 buttons + Skip rating UI.

#### A.5 PATCH /api/sessions/[id] (end)

[src/pages/api/sessions/[id].ts](src/pages/api/sessions/[id].ts):

- Schema [src/lib/schemas/session.ts:11-19](src/lib/schemas/session.ts#L11-L19) accepts only `focus_rating` (int 1-5 or null) + `ended_at` (ISO datetime). L-01 enforced.
- Writable columns ([:43](src/pages/api/sessions/[id].ts#L43)): `.update({ ended_at: endedAtIso, focus_rating })` only. `.eq("id", id).eq("user_id", ...).is("ended_at", null)` ensures write-once. 0 rows → 409 (byte-identical with not-found, per cross-user denial pattern).
- **Plausibility check** verbatim ([:10-11, 37-39](src/pages/api/sessions/[id].ts#L10-L39)):
  ```ts
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const CLOCK_SKEW_MS = 5_000;
  if (endedAtMs > nowMs + CLOCK_SKEW_MS || endedAtMs < nowMs - TWO_HOURS_MS) {
    return Response.json({ error: "ended_at is outside the plausible range" }, { status: 400 });
  }
  ```
  This is **anchored to `nowMs`, not `started_at`**. It bounds the lag between client-reported `ended_at` and server clock at PATCH time, not session duration. A 4-hour count-up session that PATCHes immediately passes fine.

#### A.6 Dashboard render of duration

[src/pages/dashboard.astro:119-123](src/pages/dashboard.astro#L119-L123) renders `formatDuration(session.duration_seconds)` ([:57-61](src/pages/dashboard.astro#L57-L61) for the helper) for done sessions — i.e. **actual elapsed time from the DB generated column**, never a nominal preset. `timer_mode` is **not in the SELECT projection** ([:33-34](src/pages/dashboard.astro#L33-L34)), so no mode badge today.

#### A.7 No per-user preference state today

Grep across `src/**` and `supabase/**` for `localStorage|user_profiles|user_preferences|preferences|last_used|preset` returns zero matches other than the three `FOCUS_PRESET_SECONDS` constants and the `access.ts` S-05 TODO. [EnergyPicker.tsx:31-39](src/components/session/EnergyPicker.tsx#L31-L39) resets all picker state on every mount — no persistence today even for energy/topic.

### B. Count-up timer impact (ranked, most disruptive → least)

#### B.1 Timer state machine (highest impact)

Both auto-flip useEffects ([useFocusTimer.ts:54-61](src/lib/timer/useFocusTimer.ts#L54-L61) and [:72-90](src/lib/timer/useFocusTimer.ts#L72-L90)) and the render branch ([SessionRunner.tsx:54](src/components/session/SessionRunner.tsx#L54)) assume `focusSeconds` is finite. For count-up:

- `remaining` is meaningless — render needs to show `elapsed = Math.floor((now - startedAtMs) / 1000)` (positive, unbounded).
- Auto-flip pathway must be **fully disabled** — no chime, no auto-transition to rating. Only `stopEarly()` can end the session.
- Likely needs a `mode: "preset" | "count_up"` prop threaded into the hook + conditional rendering, OR a parallel `useCountUpTimer` hook that shares the wall-clock derive and the L-02 audio prime.
- Risk of regressing L-03 (wall-clock derive) or L-02 (chime prime) is real — both are load-bearing.

#### B.2 Access guard force-kills count-up sessions at 50 min (CRITICAL)

[src/lib/session/access.ts:26](src/lib/session/access.ts#L26) redirects to `/dashboard` if `nowMs - startedAtMs > 2 * focusPresetSeconds * 1000`. With the current 25-min preset constant, that's 50 minutes. **A count-up session that the user resumes after 50 minutes (e.g. tab reload during a 2-hour deep-work block) will be force-killed.** This guard must be either (a) made mode-aware (skip for `count_up`) or (b) replaced now (S-05 was scheduled to remove it, but S-03 hits it first). The TODO at [access.ts:1](src/lib/session/access.ts#L1) already notes S-05 will remove it.

#### B.3 Last-used mode persistence (no prior art)

FR-010 requires "defaults to last-used mode (or preset 1 on first session)". Zero existing pattern in the codebase. Decision pending (see Open Questions §1).

#### B.4 Dashboard display of mode (small but visible)

Today `timer_mode` is not SELECTed in [dashboard.astro:33-34](src/pages/dashboard.astro#L33-L34) and there's no badge. A count-up session would render identically to a preset session (just an actual-elapsed duration string). Likely additions: extend SELECT to include `timer_mode`, add an icon/badge in the row.

#### B.5 POST /api/sessions (narrow widening)

Add `timer_mode` to [createSessionSchema](src/lib/schemas/session.ts#L3-L9) and to the hand-picked `.insert()` in [index.ts:25-32](src/pages/api/sessions/index.ts#L25-L32). The `timer_mode` column already exists with `count_up` whitelisted, so no migration is needed *for the discriminator*. Whether per-preset focus/break durations also need to be persisted on the session row (for replay/audit) is a separate decision — currently the DB only stores actual `duration_seconds`.

#### B.6 FR-012 elapsed-time rule and rating-prompt path (already correct)

`duration_seconds` is GENERATED from `(ended_at - started_at)` and rendered straight from there ([dashboard.astro:119-123](src/pages/dashboard.astro#L119-L123)). `stopEarly()` already snapshots `Date.now()` and routes through the same rating UI as auto-completion ([SessionRunner.tsx:23-49](src/components/session/SessionRunner.tsx#L23-L49)). Count-up reuses these verbatim.

#### B.7 PATCH plausibility window (tolerant)

The 2-hour bound is on PATCH-vs-now lag, not on session duration. Count-up sessions of any length PATCH cleanly so long as the user clicks "Stop" close to the actual end-time. Same risk that already exists for preset mode (user closes tab and re-PATCHes much later) — no new exposure.

### C. Preset storage decision (open)

Two viable paths; S-03 must pick at `/10x-plan` time.

**Option 1 — DB table (`user_presets` or `user_settings`).** Strongest precedent in the codebase: S-02 added `topics` and `material_formats` as user-owned tables with NULL-owner seeded defaults and per-row RLS ([context/archive/2026-06-27-categorize-sessions-topic-format/plan.md](context/archive/2026-06-27-categorize-sessions-topic-format/plan.md), see RLS pattern in [arch.md:185-190](context/foundation/arch.md#L185-L190)). Survives device switch; auditable; consistent with the 4-quality-gates story. Cost: ~one migration, CRUD endpoints, a small management page, RLS tests.

**Option 2 — localStorage.** Cheaper; no migration. Loses presets on device switch / cleared storage; introduces SSR-vs-client hydration race (Astro SSRs the start page; presets would have to be read client-side or default-rendered then replaced). No prior localStorage use in the project — a new pattern.

Roadmap explicitly lists this as an open question for plan time ([roadmap.md:118-119](context/foundation/roadmap.md#L118-L119)). The "last-used mode" sub-question (FR-010) is a separate axis: it could be in the same store as the presets, or scoped to localStorage even if presets are DB-backed.

### D. Historical constraints S-03 must respect

From prior shipped slices (F-01, S-01, S-02) and [lessons.md](context/foundation/lessons.md):

1. **`timer_mode` CHECK constraint locked** to `('preset_1','preset_2','preset_3','count_up')` ([migration:95-97](supabase/migrations/20260531182506_sessions_data_foundation.sql#L95-L97)). Adding a mode requires a migration + CHECK update.
2. **Sessions immutability post-end.** `.is("ended_at", null)` in PATCH is load-bearing ([api/sessions/[id].ts:43](src/pages/api/sessions/[id].ts#L43)). Do not widen the PATCH write-set. `timer_mode` must be written at POST time, not patched later.
3. **L-01 two-layer column-scope.** Zod default-strip + hand-picked `.insert()`/`.update()`. Regression test must catch the combined failure (schema widened to a protected column AND endpoint spreads `parsed.data`).
4. **L-02 two-stage audio prime.** Stage 1 in EnergyPicker click handler; Stage 2 in `useFocusTimer` mount. Always invoke the warmed `audioRef.current` — never `new Audio(src)` at fire time. Fail-open `.catch(() => {})`. The prime contract does not depend on a scheduled fire time, so count-up can reuse it (if a stop-chime is desired).
5. **L-03 wall-clock derive.** `setTimeout` chain (not `setInterval`) + `visibilitychange` reconcile. Any count-up branch must keep this — derive `elapsed`, never decrement.
6. **`duration_seconds` is GENERATED.** Cannot store a "nominal preset duration" there. If S-03 wants to surface "scheduled 45 min" vs "actually 38 min" separately on the history row, a new column is required.
7. **3-tap guardrail.** Start → energy → Start is the floor. Per-session mode picker must default to last-used and not block the fast path ([PRD:84](context/foundation/prd.md#L84) and S-01 guardrail).
8. **Cross-user denial = 409 byte-identical with not-found.** The S-02 / S-01 endpoint contract ([api/sessions/[id].ts:54-56](src/pages/api/sessions/[id].ts#L54-L56)). New preset endpoints must follow the same shape.

## Code References

- [src/pages/api/sessions/index.ts:23-32](src/pages/api/sessions/index.ts#L23-L32) — POST insert (hand-picked columns, L-01).
- [src/pages/api/sessions/[id].ts:10-43](src/pages/api/sessions/[id].ts#L10-L43) — PATCH plausibility window + write-once update.
- [src/lib/schemas/session.ts:3-19](src/lib/schemas/session.ts#L3-L19) — Zod schemas for create + end (default-strip).
- [src/lib/timer/useFocusTimer.ts](src/lib/timer/useFocusTimer.ts) — full timer hook; wall-clock derive at :97, auto-flips at :54-61 and :72-90, stopEarly at :92-95, audio prime at :23-45.
- [src/components/session/SessionRunner.tsx:23-89](src/components/session/SessionRunner.tsx#L23-L89) — rating PATCH + render branches.
- [src/components/session/EnergyPicker.tsx](src/components/session/EnergyPicker.tsx) — Stage-1 audio prime + pre-session pickers (energy/topic/format).
- [src/pages/session/[id].astro:34](src/pages/session/[id].astro#L34) — `FOCUS_PRESET_SECONDS = 25 * 60` (site 1).
- [src/pages/dashboard.astro:20](src/pages/dashboard.astro#L20) — `FOCUS_PRESET_SECONDS = 25 * 60` (site 2); dashboard rendering at :117-124.
- [src/lib/session/access.ts:13-31](src/lib/session/access.ts#L13-L31) — access guard threading `focusPresetSeconds` (site 3); TODO(S-05) at :1.
- [src/db/database.types.ts:69-130](src/db/database.types.ts#L69-L130) — `sessions` row shape (includes `timer_mode: string | null`).
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:80-102](supabase/migrations/20260531182506_sessions_data_foundation.sql#L80-L102) — sessions table + GENERATED `duration_seconds` + `timer_mode` CHECK.
- [src/pages/api/topics/index.ts](src/pages/api/topics/index.ts), [src/pages/api/topics/[id].ts](src/pages/api/topics/[id].ts), [src/components/topics/TopicManager.tsx](src/components/topics/TopicManager.tsx) — S-02 user-owned CRUD template.

## Architecture Insights

- **The shape of S-03 is largely pre-decided at the DB level.** F-01 anticipated S-03 by shipping `timer_mode` as a nullable column with the count-up identifier already whitelisted. The "expensive" schema decision was already made; S-03 only needs to start writing it (plus optionally add per-preset duration storage).
- **The chime contract is intentionally decoupled from scheduled fire time.** Stage-2 prime warms a resource; the resource is then played on whatever event. Count-up's lack of a scheduled fire does not break the L-02 contract — it just changes who calls `.play()`.
- **The 2-hour PATCH window is a tampering guard, not a duration guard.** This is a quiet load-bearing distinction: S-03 reviewers might intuit "long sessions break the 2h check" and try to widen it. They shouldn't — the rule is correct as-is for any session length.
- **The 50-min access guard IS a duration guard** that S-03 must address before count-up ships. Either patch it (mode-aware skip for `count_up`) or fold S-05's removal forward.
- **`duration_seconds` GENERATED column = "no client trust on elapsed".** The dashboard's actual-elapsed display is a property of the schema, not of the front-end. Count-up inherits this for free.
- **No per-user state precedent.** S-03 is the first slice to introduce persistent user preferences. The S-02 user-owned CRUD pattern is a strong template if DB storage is chosen.

## Historical Context (from prior changes)

- [context/archive/2026-05-29-sessions-data-foundation/plan.md:164-169](context/archive/2026-05-29-sessions-data-foundation/plan.md#L164-L169) — F-01 explicitly anticipates `timer_mode` and `note` as nullable columns for S-03/S-04.
- [context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md:36-43](context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md#L36-L43) — original wording of L-01 two-layer column-scope discipline.
- [context/archive/2026-06-19-first-session-capture-loop/plan.md:34-44, 70](context/archive/2026-06-19-first-session-capture-loop/plan.md#L34-L44) — S-01 "Not doing": presets, modes, count-up explicitly deferred to S-03; `FOCUS_PRESET_SECONDS` constant introduced as a single-place hold-point for S-03 to replace.
- [context/archive/2026-06-19-first-session-capture-loop/reviews/plan-review.md:90](context/archive/2026-06-19-first-session-capture-loop/reviews/plan-review.md#L90) — "A future 'long meditation' or count-up preset (S-03) may need to revisit the threshold" (the 50-min/2h check pair).
- [context/archive/2026-06-19-first-session-capture-loop/reviews/impl-review.md:52-60](context/archive/2026-06-19-first-session-capture-loop/reviews/impl-review.md#L52-L60) — explicit-abandon flow (S-05) is the planned replacement for the time-based access guard.
- [context/archive/2026-06-27-categorize-sessions-topic-format/plan.md](context/archive/2026-06-27-categorize-sessions-topic-format/plan.md) — S-02 user-owned CRUD blueprint (migration → pgTAP → types → API widening → CRUD page → picker → dashboard surface).
- [context/foundation/arch.md:393](context/foundation/arch.md#L393) — stale-tab guard is the in-place stand-in for S-05's explicit-abandon.
- [context/foundation/roadmap.md:118-120, 145-146](context/foundation/roadmap.md#L118-L120) — S-03 outcome / risk / unknowns and S-05's 2-hour-bound question.

## Related Research

- F-01 research: [context/archive/2026-05-29-sessions-data-foundation/research.md](context/archive/2026-05-29-sessions-data-foundation/research.md) (sessions schema + RLS)
- S-01 research: [context/archive/2026-06-19-first-session-capture-loop/research.md](context/archive/2026-06-19-first-session-capture-loop/research.md) (timer + rating loop, audio prime)
- S-02 research: [context/archive/2026-06-27-categorize-sessions-topic-format/research.md](context/archive/2026-06-27-categorize-sessions-topic-format/research.md) (user-owned CRUD pattern)

## Open Questions

1. **Preset storage** — DB table (e.g. `user_presets` with NULL-owner seeded 25/5, 45/10, 90/15 rows + per-user RLS) vs localStorage. Roadmap defers to plan time. Recommended bias: DB (matches S-02 precedent, survives device switch, RLS already understood). Decide at `/10x-plan`.
2. **Last-used mode storage** — same store as presets, or always localStorage? Cheaper to keep "last-used" in localStorage even with DB-backed presets (avoids an extra UPDATE on every session start). Decide at `/10x-plan`.
3. **Per-session duration audit columns** — does the `sessions` row need a `planned_focus_seconds` / `planned_break_seconds` snapshot to distinguish "scheduled 45" from "actually 38" in history, or is `timer_mode` + actual `duration_seconds` sufficient? Roadmap is silent. Decide at `/10x-plan` (likely yes if the chart in S-04 wants to plot "expected vs actual").
4. **Access-guard fix for count-up** — patch [access.ts](src/lib/session/access.ts) to skip for `count_up`, or fold S-05 forward and remove the time-based guard entirely as part of S-03? The latter is cleaner but expands S-03 scope.
5. **Break phase visibility** — FR-011 says "auto focus→break with audible cue", but S-01 shipped focus → rating directly (no break countdown). Does S-03 finally implement the break phase (it has both durations now), or stay with the S-01 shortcut? PRD reads as expecting break to be visible; if so, the state machine grows `running_focus → running_break → rating` and the chime fires twice. Decide at `/10x-plan`.
6. **Chime on count-up stop** — should the chime fire on manual `stopEarly()` for count-up sessions (signal "session captured")? L-02 prime supports it; UX call.
