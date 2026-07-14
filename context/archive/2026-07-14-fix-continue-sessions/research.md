---
date: 2026-07-14T18:21:31+0200
researcher: pawel
git_commit: 54e580c5c4ec4eb20746d200e373d1d741005d29
branch: continue-session-past-end
repository: PomoSapiens
topic: "Preserve break time when continuing a session; redirect to /session/new with prior presets after break (preset mode)"
tags: [research, codebase, continue-session, break-timer, presets, session-new, redirect]
status: complete
last_updated: 2026-07-14
last_updated_by: pawel
---

# Research: Preserve break on continue + preset-carrying redirect after break

**Date**: 2026-07-14T18:21:31+0200
**Researcher**: pawel
**Git Commit**: 54e580c5c4ec4eb20746d200e373d1d741005d29
**Branch**: continue-session-past-end
**Repository**: PomoSapiens

## Research Question

From `change.md`, two related asks:

1. **Preserve the break on continue.** The `continue-session-past-end` slice sets `planned_focus_seconds` and `planned_break_seconds` to `NULL` when the user continues a session. This means prolonging the focus by e.g. 5 minutes costs the user their break. It should instead keep the break.
2. **Preset-carrying redirect after break.** In preset mode, after the break completes, the user should land on `/session/new` pre-filled with the previous session's values (time preset, energy level, topic, format) -- not on `/dashboard`.

## Summary

Both asks are achievable with small, surgical edits, but each requires **coordinated changes across more than one seam** because the current design has two hard couplings:

- **Coupling 1 (`count_up ⇒ no break`).** Break-taking is gated on `mode !== "count_up"` at [SessionRunner.tsx:186](src/components/session/SessionRunner.tsx#L186), and `breakSeconds` is force-nulled whenever `timer_mode === "count_up"` at [session/[id].astro:46](src/pages/session/[id].astro#L46). Because continue flips the session to `count_up`, **the break is blocked by these two gates even if the DB column is preserved.** Nulling the column in [continue.ts:23](src/pages/api/sessions/[id]/continue.ts#L23) is therefore not the only thing to change -- and by itself, un-nulling it fixes nothing.
- **Coupling 2 (`/session/new` has no prefill).** `/session/new` reads no query params and seeds all form state from hardcoded defaults ([EnergyPicker.tsx:11-14](src/components/session/EnergyPicker.tsx#L11-L14)). There is no existing "repeat last session" mechanism to reuse.

Key historical nuance: **the break disappearing was never a deliberate product decision.** The `continue-session-past-end` plan nulled `planned_break_seconds` only to uphold an app-level invariant (`count_up ⇒ null planned durations`), and the break vanishing is a *side-effect* of the one-way switch to count-up mode -- not a considered trade-off (see Historical Context). This makes "preserve the break" a correction of an unintended consequence, not a reversal of a decision.

## Detailed Findings

### Part 1 — Preserving the break on continue

#### The continue flow, end to end
- Trigger: "I'm still working" button in [FocusRating.tsx:133-141](src/components/session/FocusRating.tsx#L133-L141), shown only when `canContinue`.
- Gated at mount: `canContinue={canContinue && mode === "preset"}` ([SessionRunner.tsx:187](src/components/session/SessionRunner.tsx#L187)).
- Click → `handleContinue` ([SessionRunner.tsx:111-123](src/components/session/SessionRunner.tsx#L111-L123)): calls `persistContinue()` (POST `/api/sessions/{id}/continue`, [persistence.ts:44-49](src/lib/session/persistence.ts#L44-L49)) then `continueAsCountUp()`.
- `continueAsCountUp` ([useFocusTimer.ts:137-141](src/lib/session/useFocusTimer.ts#L137-L141)): sets `mode="count_up"`, `stoppedAtMs=null`, `phase="running"`. `startedAtMs` is untouched, so elapsed keeps counting from the original start (this is the actual product goal).

#### Where the break is blocked (the real functional gates)
1. **[SessionRunner.tsx:186](src/components/session/SessionRunner.tsx#L186)** — `canTakeBreak={mode !== "count_up" && breakSeconds !== null && breakSeconds > 0}`. After `continueAsCountUp()`, the live `mode` is `"count_up"`, so "Take a break" is suppressed **in the same client session** even though the `breakSeconds` prop still holds the original value in memory.
2. **[session/[id].astro:46](src/pages/session/[id].astro#L46)** — `breakSeconds = mode === "count_up" ? null : (planned_break_seconds ?? 0)`. On a **page reload after continue** (row now has `timer_mode="count_up"`), this force-nulls the break even if the column were preserved, discarding it again. Same pattern in [AnonSessionApp.tsx:34](src/components/anon/AnonSessionApp.tsx#L34) (anon cannot continue -- `canContinue={false}` -- so it's out of scope but shares the coupled shape).

#### The break timer itself does not read `planned_break_seconds`
- [useBreakTimer.ts:4-9](src/lib/timer/useBreakTimer.ts#L4-L9) consumes a non-nullable `breakSeconds: number` + `breakStartedAtMs: number | null`. The nullable column is coalesced upstream at [SessionRunner.tsx:63](src/components/session/SessionRunner.tsx#L63) (`breakSeconds ?? 0`). So the fix lives entirely in the gates/derivations above, not in the timer hook.
- Break start: user clicks "Take a break" → `breakStartedAtMs = Date.now()`, phase → `running_break` ([SessionRunner.tsx:191-194](src/components/session/SessionRunner.tsx#L191-L194)).

#### Schema / DB — nullability is permissive, invariant is app-only
- `planned_focus_seconds`, `planned_break_seconds` = `number | null`; `timer_mode` = `string | null` ([database.types.ts:79-82](src/db/database.types.ts#L79-L82), Insert `:96-99`, Update `:113-116`).
- No DB CHECK couples `timer_mode` to planned-column nullability (migration `20260630000000`, per-column range checks only). The `count_up ⇒ null` rule is enforced **only** in app code at create time ([api/sessions/index.ts:24-30](src/pages/api/sessions/index.ts#L24-L30)).
- **No zod body schema for the continue endpoint** — [continue.ts](src/pages/api/sessions/[id]/continue.ts) takes only the path `id`, no body. So preserving the break means simply not writing `planned_break_seconds: null` in the `.update(...)`.

#### Minimal correct fix (Part 1)
Three coordinated edits:
1. In [continue.ts:23](src/pages/api/sessions/[id]/continue.ts#L23): stop nulling `planned_break_seconds` (keep `planned_focus_seconds` nulling -- count-up ignores planned focus, [useFocusTimer.ts:88,112](src/lib/session/useFocusTimer.ts#L88)).
2. In [session/[id].astro:46](src/pages/session/[id].astro#L46): derive `breakSeconds` from `planned_break_seconds` **regardless of mode** (a native count-up session has the column null → still resolves to 0/no break, so this stays safe).
3. In [SessionRunner.tsx:186](src/components/session/SessionRunner.tsx#L186): loosen the gate to rely on `breakSeconds > 0` alone (drop the `mode !== "count_up"` clause; native count-up has `breakSeconds` null/0 so it stays excluded).

**Invariant note:** This deliberately produces rows with `timer_mode="count_up"` AND non-null `planned_break_seconds` -- a state the documented `count_up ⇒ null` invariant says shouldn't exist. Continue does not run the create-time validator and no DB CHECK blocks it, so it will persist fine, but tests asserting the invariant may need updating (`tests/integration/api/sessions.continue.test.ts`, `tests/integration/api/sessions.create.test.ts`). The invariant itself would need to be re-scoped to "insert-time only" (a possibility the original plan explicitly flagged -- see Historical Context).

### Part 2 — Preset-carrying redirect after break (preset mode)

#### Current post-break landing = `/dashboard`
Default nav callback: [SessionRunner.tsx:41-43](src/components/session/SessionRunner.tsx#L41-L43) (`onGoToDashboard = () => window.location.assign("/dashboard")`). Break completion calls it in **three** places, all in `SessionRunner.tsx`:
- Visible-tab completion: [SessionRunner.tsx:74-94](src/components/session/SessionRunner.tsx#L74-L94) (after chime `ended` or 5s fallback).
- Hidden-tab completion: [SessionRunner.tsx:103-108](src/components/session/SessionRunner.tsx#L103-L108) (fires on tab-title alert dismiss).
- "End break" manual early-exit: [SessionRunner.tsx:169-177](src/components/session/SessionRunner.tsx#L169-L177).

The break-timer hook only sets `breakComplete` flags ([SessionRunner.tsx:65-68](src/components/session/SessionRunner.tsx#L65-L68) wiring [useBreakTimer.ts:50,75](src/lib/timer/useBreakTimer.ts#L50)); **all navigation lives in `SessionRunner.tsx`.**

`onGoToDashboard` is **shared** across break-complete, the rating-screen "go to dashboard" action, and "End break". To retarget only the break-complete path, introduce a distinct `onBreakComplete` callback rather than overriding `onGoToDashboard` globally. `[id].astro` currently mounts `SessionRunner` with no nav overrides ([session/[id].astro:51-59](src/pages/session/[id].astro#L51-L59)), so it uses defaults.

Breaks are already preset-only (`canTakeBreak` requires `breakSeconds > 0`, and count-up nulls it), so the redirect change is inherently scoped to preset mode without an extra branch.

#### `/session/new` has no prefill today
- [session/new.astro](src/pages/session/new.astro) (7 lines) just renders `<EnergyPicker client:load />`, reads no query params.
- State owner [EnergyPicker.tsx](src/components/session/EnergyPicker.tsx) seeds from **hardcoded defaults**: `energy="medium"` ([:11](src/components/session/EnergyPicker.tsx#L11)), `topicId=null` ([:13](src/components/session/EnergyPicker.tsx#L13)), `materialFormatId=null` ([:14](src/components/session/EnergyPicker.tsx#L14)), `presets` from `/api/user-presets` ([:22-34](src/components/session/EnergyPicker.tsx#L22-L34)), `mode` from `localStorage` via `useLastMode()` ([:20](src/components/session/EnergyPicker.tsx#L20), [useLastMode.ts:17-23](src/lib/session/useLastMode.ts#L17-L23)).
- **No existing repeat/prefill mechanism** anywhere in the session-start flow (repo-wide search for `searchParams`/`URLSearchParams`/`location.search`/`Astro.url` hit only auth pages + Topbar).

#### The four fields to carry over
From `createSessionSchema` ([session.ts:3-22](src/lib/schemas/session.ts#L3-L22)) and [types.ts](src/lib/types.ts):

| Ask | Field | Type / values |
|---|---|---|
| Energy level | `energy_level` | enum `low \| medium \| high` (required) |
| Topic | `topic_id` | UUID, nullable |
| Format | `material_format_id` | UUID, nullable |
| Time preset | `timer_mode` | enum `preset_1 \| preset_2 \| preset_3 \| count_up` |

Carry the **slot** (`preset_N`), not raw seconds -- that keeps it "the same preset" even if the user later edits that slot's minutes. `ModePicker` highlights by matching `preset_${p.slot}` ([ModePicker.tsx:15](src/components/session/ModePicker.tsx#L15)), so a `preset_N` value selects the right chip as long as the slot exists. Note `SessionRunner` only knows the collapsed `mode: "preset" | "count_up"` ([session/[id].astro:45](src/pages/session/[id].astro#L45)) -- build the prefill from the **row's `timer_mode`**, not the SessionRunner prop.

All four fields exist on the sessions row ([database.types.ts:70-86](src/db/database.types.ts#L70-L86)).

#### Data-availability gap
[session/[id].astro:23-28](src/pages/session/[id].astro#L23-L28) already selects `energy_level, planned_focus_seconds, planned_break_seconds, timer_mode` but **NOT** `topic_id` or `material_format_id`. Those two must be **added to the select** to carry topic/format over.

#### Cleanest injection seam = query params (no extra fetch)
All four values are already in hand at redirect time. Build `/session/new?energy=<lvl>&topic=<uuid>&format=<uuid>&mode=preset_N`, then:
- [session/new.astro](src/pages/session/new.astro) reads `Astro.url.searchParams` (the pattern already used in `signin.astro:5`/`signup.astro:5`) and passes them as props.
- [EnergyPicker.tsx:11-14,20](src/components/session/EnergyPicker.tsx#L11-L20) accepts optional initial-value props, seeding `useState` from them with fallback to current defaults.

The alternative (fetch the last session on `/session/new`) is a heavier round-trip and unnecessary since the data is available at redirect time.

## Code References

- `src/pages/api/sessions/[id]/continue.ts:23` — the `.update({ ..., planned_break_seconds: null })` to change (stop nulling break).
- `src/components/session/SessionRunner.tsx:186` — `canTakeBreak` gate on `mode !== "count_up"` (loosen).
- `src/pages/session/[id].astro:46` — `breakSeconds` force-nulled when `count_up` (derive from column regardless of mode).
- `src/pages/session/[id].astro:23-28` — session select; add `topic_id`, `material_format_id`.
- `src/pages/session/[id].astro:51-59` — SessionRunner mount point; inject `onBreakComplete`.
- `src/components/session/SessionRunner.tsx:41-43,74-94,103-108,169-177` — dashboard nav callback + the break-complete call sites.
- `src/components/session/EnergyPicker.tsx:11-34` — hardcoded form defaults; the prefill seam.
- `src/pages/session/new.astro` — 7-line page; add `Astro.url.searchParams` read.
- `src/lib/schemas/session.ts:3-22` — field types/values for the carried-over fields.
- `src/components/session/ModePicker.tsx:15` — `preset_${p.slot}` chip matching.
- `src/lib/timer/preset-defaults.ts:1-5` — 25/5, 45/10, 90/15 focus/break pairing.

## Architecture Insights

- **`planned_*_seconds` are snapshots, not FKs** (`arch.md:282`): copied onto the row at POST time so editing a preset slot never rewrites past sessions. This is why carrying `preset_N` (the slot) vs raw seconds is a real semantic choice for the prefill.
- **`count_up ⇒ null planned` is an app-maintained invariant, not DB-enforced** (`arch.md:282`, [api/sessions/index.ts:24-30](src/pages/api/sessions/index.ts#L24-L30)). Preserving the break on continue intentionally relaxes it to insert-time-only.
- **The session state machine** (`arch.md:499-527`): `running → rating → saved → (running_break, preset+positive break only) → end`. The "Take a break" edge is `arch.md:516` gated to preset + positive breakSeconds. Continue's one-way flip to count-up removes that edge -- which is exactly the behavior this change reverses for the break.
- **Nav is via injected callbacks** (`arch.md:528`: `onGoToDashboard`, `onStartNewSession`, `persistEnd`), which is what lets the anon island reuse the machine. Adding `onBreakComplete` fits this pattern.
- **Energy/topic/format are session-capture fields, not preset-slot fields** (`arch.md:9,233-249`). `user_presets` store only slot + focus/break seconds. So carrying them over must come from the previous *session row*, not from a preset.

## Historical Context (from prior changes)

From `context/archive/2026-07-13-continue-session-past-end/`:

- **Nulling the break was invariant-driven, not UX-driven.** `plan.md:15`: "`count_up ⇒ null planned durations` is an INSERT-only invariant ...; the conversion path must re-null the planned columns itself to keep the row in a state existing code expects." `plan-brief.md:25`: "Planned-duration columns → Null them on conversion → Keeps the row consistent with the `count_up ⇒ null planned` invariant."
- **Preserving planned columns was considered — but only as *origin-preset audit*, and rejected on that framing.** `research.md:136` (Open Question 1): "Nulling keeps the row consistent... keeping them preserves 'started as preset_2 (90/15)' as audit... Lean: null them unless history should show the origin preset -- in which case relax the invariant to insert-time only, explicitly." `plan.md:42` ("What We're NOT Doing"): "Not preserving the origin preset."
- **"Give the user a break after continuing" was never separately weighed.** The break's disappearance falls out of the mode switch; no doc discusses it as a UX trade-off. So this change corrects an unintended consequence.
- **After a continued session there is currently no break at all**, and the "saved" screen offers new-session/dashboard (`arch.md:437`, `change.md:14`, `research.md:56`). Conversion is one-way (`arch.md:524`).
- **`reopen-running-session` (S-11) dependency:** reopen re-derives mode from the persisted `timer_mode` (`reopen plan.md:10-11`), which is why the continue flip is persisted server-side. Any change to what continue persists (keeping the break column) is picked up correctly by reopen since it reads the row -- but this is exactly why edit #2 ([id].astro:46) is required: reload/reopen must not re-null the break.
- **Prior fix in the continue flow:** impl-review F1 (FIXED) added an in-flight lockout so a rating click can't race the continue UPDATE (`impl-review.md:31-39`). Preserve that lockout when editing `handleContinue`.

## Related Research

- `context/archive/2026-07-13-continue-session-past-end/research.md` — original continue-past-end exploration (the invariant + count-up rationale).
- `context/archive/2026-07-13-reopen-running-session/plan.md` — resume/reopen re-derivation from persisted row.

## Relevant Lessons (context/foundation/lessons.md)

- **L-05** (time-based guards break under open-ended modes) — reinforces that the break should be driven by explicit state (`breakSeconds > 0`), not by `timer_mode`.
- **L-03** (derive remaining from server anchor) — the break timer already follows this; no change needed there.
- **L-01** (RLS + API column-scope discipline) — continue endpoint's `.update()` is hand-picked; keep the write set explicit when removing the `planned_break_seconds: null`.
- **L-07** (extract sibling controls) — if the redirect adds a new post-break control, prefer a small composition component.

## Open Questions — RESOLVED (user, 2026-07-14)

1. **Manual "End break" also redirects to `/session/new`.** RESOLVED: yes. Both natural break completion AND the manual "End break" ([SessionRunner.tsx:169-177](src/components/session/SessionRunner.tsx#L169-L177)) route to the new `onBreakComplete` callback → `/session/new` (all three break-exit sites already converge on one callback).

2. **Invariant re-scoping — CONFIRMED.** Relax `count_up ⇒ null planned` to *insert-time only*. Continue preserves the planned columns; update the invariant tests (`tests/integration/api/sessions.continue.test.ts`, `sessions.create.test.ts`) accordingly.

3. **Break-after-count-up with preset time — CONFIRMED it works with no extra logic.** After a continued (`count_up`) session stops, the rating screen offers "Take a break" and the break runs for the original preset's break duration. This is delivered by the Part 1 fix (preserve `planned_break_seconds` + derive `breakSeconds` regardless of mode at [session/[id].astro:46](src/pages/session/[id].astro#L46) + loosen the gate to `breakSeconds > 0` at [SessionRunner.tsx:186](src/components/session/SessionRunner.tsx#L186)). The break timer consumes `breakSeconds` directly ([SessionRunner.tsx:63](src/components/session/SessionRunner.tsx#L63)); no new break-duration logic is needed. The in-memory (no-reload) path also works because `[id].astro` already computed a non-null `breakSeconds` prop from the still-preset row at page load.

4. **Prefill the last session's focus preset for a continued session — CONFIRMED not challenging; pass it.** Decision: pass the last session's focus preset; fall back to the existing default if unrecoverable. Two independent recovery paths exist:
   - **localStorage:** `last_mode` is written at session *start* ([useLastMode.ts:27-36](src/lib/session/useLastMode.ts#L27-L36)) and continue never rewrites it, so it still holds the origin `preset_N`. `EnergyPicker` already defaults `mode` from `useLastMode()` — omitting `mode` from the redirect URL recovers the slot for free.
   - **Server-authoritative (recommended):** since we relax the invariant, **preserve `planned_focus_seconds` on continue too** (symmetric with the break). Then pass it in the redirect and let `EnergyPicker` map `planned_focus_seconds` → slot after its presets fetch; no match (preset edited/deleted) → fall back to default. Chosen for robustness (survives cleared storage).

   Energy/topic/format are always on the row and never nulled, so they carry over trivially for *every* session (add `topic_id`, `material_format_id` to the [session/[id].astro:23-28](src/pages/session/[id].astro#L23-L28) select).

## Native count-up sessions are unaffected (regression check)

A session that *starts* as count-up (`useSessionStart.ts:39` → `selectedPreset = null` → both planned columns null) keeps getting **no break**, exactly as today:

- `continue.ts` never runs on it — continue is gated to `mode === "preset"` ([SessionRunner.tsx:187](src/components/session/SessionRunner.tsx#L187)).
- New [session/[id].astro:46](src/pages/session/[id].astro#L46) derivation: `planned_break_seconds` null → `?? 0` → `breakSeconds = 0`.
- Loosened gate `breakSeconds > 0` → `0 > 0` false → no break (same result as today's `mode !== "count_up" && …`).
- `onBreakComplete` redirect never fires (no break reached).

**Design point:** after this change the native-vs-continued distinction is carried by the *data* (`planned_break_seconds` null vs non-null), not by `timer_mode` — which is why dropping the `mode !== "count_up"` clause is safe (aligns with L-05).

Two invariants this relies on, both already true:
1. **Create-time invariant stays.** [api/sessions/index.ts:25-26](src/pages/api/sessions/index.ts#L25-L26) still rejects a `count_up` *insert* with non-null planned columns; only the continue UPDATE is relaxed. Native count-up is still born with null planned columns.
2. **Anon unchanged.** Shared gate; [AnonSessionApp.tsx:34](src/components/anon/AnonSessionApp.tsx#L34) still nulls `breakSeconds` for count-up and anon can't continue ([:94](src/components/anon/AnonSessionApp.tsx#L94)) → no break.

Implementation note: null-guard the loosened gate, e.g. `(breakSeconds ?? 0) > 0`, since the prop can be `null` from the anon derivation.

## Consolidated fix shape (post-resolution)

**Part 1 — preserve the break on continue** (3 edits + invariant relaxation):
- [continue.ts:23](src/pages/api/sessions/[id]/continue.ts#L23): stop nulling `planned_break_seconds` **and** `planned_focus_seconds` (preserve both; keep `timer_mode: "count_up"`).
- [session/[id].astro:46](src/pages/session/[id].astro#L46): derive `breakSeconds` from `planned_break_seconds` regardless of mode.
- [SessionRunner.tsx:186](src/components/session/SessionRunner.tsx#L186): gate the break on `breakSeconds > 0` alone.
- Update invariant tests to insert-time-only.

**Part 2 — preset-carrying redirect after break** (preset mode):
- Add `onBreakComplete` prop to `SessionRunner`; use it at the three break-exit sites ([:79](src/components/session/SessionRunner.tsx#L79), [:86](src/components/session/SessionRunner.tsx#L86), [:106](src/components/session/SessionRunner.tsx#L106), and the manual "End break" [:172](src/components/session/SessionRunner.tsx#L172)); default preserves current `/dashboard` behavior.
- [session/[id].astro:23-28](src/pages/session/[id].astro#L23-L28): add `topic_id`, `material_format_id` to the select; build `/session/new?energy=…&topic=…&format=…&focus=<planned_focus_seconds>` (or `mode=preset_N` for non-continued rows) and pass into `onBreakComplete`.
- [session/new.astro](src/pages/session/new.astro): read `Astro.url.searchParams`, pass as props.
- [EnergyPicker.tsx:11-20](src/components/session/EnergyPicker.tsx#L11-L20): accept optional initial-value props (energy, topic, format, focus/mode), seed `useState` from them with fallback to current defaults; map a `focus`-seconds param → preset slot after the presets fetch.
