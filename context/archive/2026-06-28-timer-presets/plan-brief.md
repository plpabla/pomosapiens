# Editable Timer Presets and Count-Up Mode (S-03) — Plan Brief

> Full plan: [context/changes/timer-presets/plan.md](context/changes/timer-presets/plan.md)
> Research: [context/changes/timer-presets/research.md](context/changes/timer-presets/research.md)

## What & Why

Ship FR-004 (three editable focus+break preset slots, defaults 25/5, 45/10, 90/15), FR-005 (count-up timer as a fourth mode), and FR-010 (per-session mode picker defaulting to last-used). Also close the long-deferred FR-011 break-phase gap and absorb S-05's removal of the 50-min time-based access guard, which would otherwise force-kill long count-up sessions on tab reload.

## Starting Point

The DB schema is already mostly ready: `sessions.timer_mode` was shipped in F-01 with `count_up` already whitelisted in the CHECK, and `duration_seconds` is GENERATED — so "actual elapsed wall time" works for any mode for free. The timer hook itself is hardcoded to 25 min in three sites, has no break phase, and the page-level access guard at [src/lib/session/access.ts:26](src/lib/session/access.ts#L26) force-redirects any non-ended session older than 50 min. No per-user persistent state exists today (no `user_profiles`, no `localStorage`).

## Desired End State

A user can edit three preset slots on a new `/presets` page (persists across devices), choose mode at start from a four-chip strip above the energy picker (last-used pre-selected via `localStorage`), and run either a preset focus → rating → opt-in break countdown loop or an unbounded count-up session that ends only on Stop. The dashboard shows a mode badge per row, and the 50-min force-redirect is gone so deep-work sessions of any length survive reloads.

## Key Decisions Made

| Decision                                  | Choice                                                                            | Why (1 sentence)                                                                                              | Source   |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| Preset storage                            | DB table `user_presets` (per-user rows, lazy server-merged defaults)              | Survives device switch, RLS-tested template from S-02, no SSR hydration race                                  | Plan     |
| Last-used mode storage                    | `localStorage` only (key: `pomosapiens.last_mode`)                                | Avoids an extra DB write on every Start; default-on-loss is acceptable; trivial to implement                  | Plan     |
| Per-session duration snapshot             | Add `planned_focus_seconds` + `planned_break_seconds` to `sessions` (nullable)    | Durable audit trail; unblocks S-04's "planned vs actual" chart; immune to retroactive preset edits            | Plan     |
| 50-min access guard                       | Fold S-05 forward — remove the time-based guard entirely in this slice            | Cleaner end state than a mode-aware branch; count-up sessions of any length work; one less S-05 task          | Plan     |
| Break-phase visibility                    | Ship the opt-in break countdown after rating (Yes / Skip card)                    | Closes the long-deferred FR-011 gap now that both durations are first-class; user picks at peak recall        | Plan     |
| Break timing                              | Rate first, then offer break (opt-in)                                             | Rating happens at peak recall; break becomes opt-in rather than mandatory dead time                           | Plan     |
| Count-up render                           | Elapsed mm:ss + persistent Stop only (no auto-flip, no chime)                     | Minimal new UI; matches user-in-control semantics; reuses Stop pathway                                        | Plan     |
| Chime on count-up stop                    | No chime                                                                          | Avoids conflating "time's up" with "I stopped"; user knows they ended it                                      | Plan     |
| Mode picker UX                            | Compact four-chip strip above EnergyPicker on dashboard                           | Preserves 3-tap guardrail (last-used pre-selected), discoverable, no extra page                               | Plan     |

## Scope

**In scope:**
- New `user_presets` table + per-user RLS + pgTAP suite
- New `planned_focus_seconds` / `planned_break_seconds` audit columns on `sessions`
- `GET /api/user-presets` + `PUT /api/user-presets/[slot]` endpoints
- `/presets` management page (mirrors `TopicManager` shape)
- Timer hook extended with `mode: "preset" | "count_up"` and an opt-in break sub-hook
- Mode picker UI + `localStorage` last-used persistence + POST widening
- Dashboard mode badge
- Removal of the 50-min time-based access guard

**Out of scope:**
- No `user_profiles` table
- No mid-session mode change
- No backfill of `timer_mode` / `planned_*_seconds` on legacy rows
- No FR-018 tab-title timer (S-06)
- No session note input (S-04)
- No S-05 abandon button (only the time-based guard is folded forward)
- No add/remove/archive for preset slots (three slots, always present)

## Architecture / Approach

Vertical, end-to-end slice in 8 phases. The riskiest piece (the load-bearing timer hook) is split into three small phases so each ships behavior-preserving before adding the next axis: (1) parameterise focus duration, (2) add count-up arm, (3) add break sub-hook. The schema and CRUD ship first to unblock everything; mode-picker + POST widening + dashboard badge land together because they're tightly coupled by the discriminator; the access-guard removal is independent and last.

Data flow on start: `EnergyPicker` reads `/api/user-presets` + last-used from `localStorage` → user picks mode + energy + topic + format → POST includes `timer_mode` + `planned_focus_seconds` + `planned_break_seconds` (snapshotted from chosen preset; null for count-up) → `/session/[id]` SSRs the row, passes `focusSeconds`, `breakSeconds`, `mode` to `SessionRunner` → `useFocusTimer` runs focus (preset) or count-up; on rating, `SessionRunner` either navigates immediately or shows the break-offer card → `useBreakTimer` runs the optional break with the same primed `audioRef`.

## Phases at a Glance

| Phase                                                                | What it delivers                                                                          | Key risk                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Schema + audit columns                                            | `user_presets` table, RLS, pgTAP; nullable `planned_*_seconds` on sessions                | RLS gap on the new table; types drift                                    |
| 2. Preset CRUD API                                                   | `GET /api/user-presets` (lazy-merged) + `PUT /api/user-presets/[slot]` + Zod              | L-01 column-scope drift in PUT                                           |
| 3. Preset management page                                            | `/presets` Astro + `PresetManager.tsx`                                                    | Off-by-one in minute↔second conversions                                  |
| 4. Timer hook refactor (preset path)                                 | Replace hardcoded 25-min literal with `planned_focus_seconds` from row; no UX change      | Behavior regression in the load-bearing wall-clock derive (L-03)         |
| 5. Timer hook — count-up arm                                         | `mode: "count_up"` disables auto-flip + chime; renders `elapsed`                          | Accidentally chiming count-up; race between visibility reconcile + mode  |
| 6. Timer hook — opt-in break-phase                                   | After rating, "Take a break?" card → break countdown + end chime, all client-side         | Audio prime contract (L-02) breakage on the second chime site            |
| 7. Mode picker + POST widening + dashboard badge                     | Four-chip strip above EnergyPicker; `localStorage` last-used; POST writes new columns     | L-01 break (spreading `parsed.data`) lets through a protected field      |
| 8. Fold S-05 forward — remove 50-min access guard                    | `access.ts` no longer redirects on age; dashboard "Abandoned" label gone                  | Test pinning the 50-min behavior needs replacement; documentation drift  |

**Prerequisites:** Local Supabase running for migrations + pgTAP; `npx playwright install chromium` if not done; SUPABASE env vars set.

**Estimated effort:** ~3 sessions across the 8 phases (Phase 1 + 2 in one, 3 + 4 + 5 in one, 6 + 7 + 8 in one) for a focused implementer. Solo-dev cadence.

## Open Risks & Assumptions

- **Assumption: the L-02 primed `audioRef` can fire the break-end chime correctly.** L-02 says the prime contract is decoupled from fire time, but only the focus-end fire path has been observed in production. Manual Safari smoke (Phase 6) is the verification.
- **Assumption: removing the 50-min guard does not regress any S-01 stale-tab protection that mattered.** Research suggests the guard was a duration cap, not a tamper guard (the 2-h PATCH window is the real tamper guard). The replaced unit test pins the new "any age is in_progress" behavior.
- **Risk: `localStorage` last-used persistence introduces a brand-new pattern.** Hydration-mismatch surface is small (the picker is below the fold and pre-selection mismatch is invisible during the read), but worth a manual no-flicker check.
- **Risk: the 8 `- [ ]` items in Phase 7 are the densest single-phase load.** Consider splitting into 7a (POST widening + Zod + badge) and 7b (ModePicker UI + localStorage) at implement time if scope feels heavy. The split was deferred during planning because the picker, POST body, and badge share the mode enum vocabulary.

## Success Criteria (Summary)

- User can edit any of three preset slots on `/presets`, and the change persists across devices and reloads.
- User can start either a preset session (focus → rating → opt-in break → done) or a count-up session (elapsed → Stop → rating → done), and the dashboard reflects which mode each row used.
- A count-up session of any length (e.g. >60 min) survives a tab reload and resumes correctly.
