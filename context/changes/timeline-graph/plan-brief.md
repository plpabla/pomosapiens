# Focus Timeline (S-14) — Plan Brief

> Full plan: `context/changes/timeline-graph/plan.md`
> Research: `context/changes/timeline-graph/research.md`
> Design spec: `context/changes/timeline-graph/change.md`

## What & Why

Build a new protected `/timeline` surface that renders the signed-in user's focus sessions as a navigable swimlane/Gantt grid — one row per day, sessions as colored blocks over an hour-of-day axis, at Day/Week/Month scales. It gives users a visual history of their focus work across topics and formats, the last of the roadmap's core surfaces (S-14).

## Starting Point

The app already has four "surfaces" (arch.md §2.2) reading shared `sessions` data. `SessionListItem` carries everything the timeline needs; `dashboard.astro` is the SSR-fetch + `client:load` island precedent; `Card`/`Dialog`/`Select`/`Button` exist. Missing: any date/calendar utility, a `color` column, toggle/switch + color-wheel primitives, and the Cloudflare-UTC timezone handling (solved once in `LocalDateTime.tsx`).

## Desired End State

A user opens `/timeline` and sees their real sessions as positioned blocks they can navigate (Day/Week/Month, bounded to their earliest session through the current period), filter (independent topic + format legend chips), rate-shade (focus/energy), inspect (detail dialog), and recolor (preset palette + HSV wheel, persisted locally). Empty/sparse accounts get a friendly state instead of a broken grid.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Data source | Real SSR sessions + empty-state UI | Matches "server owns truth" and every prior slice; no fake data to signed-in users | Plan |
| Scope | Phased, one plan (core 1-3, color customization 4) | Ships usable timeline early; isolates the risky wheel to a cuttable phase | Plan |
| Date range | Bounded: earliest session → current period | No infinite empty future; current week/month shows in full | Plan |
| Weeks | Monday-start; ISO week labels (`CW29`) | Matches design spec | Plan |
| Color persistence | `localStorage` via `collectionStore` (array of `{categoryId, hex}` entries — store is array-shaped) | Colors are display preference, not domain truth; zero migration/API cost | Plan / Research |
| Session fetch | Wide-bounded SSR fetch, no new endpoint | Single-user RLS scale; no pagination precedent to match | Plan |
| Color wheel | `@uiw/react-color` (`Wheel` + `ShadeSlider`) | Ships a real circular hue/sat disc + lightness matching the design; tiny; avoids novel pointer-math; `ShadeSlider` also removes need for a shadcn slider | Plan |
| "Show" toggle group | Focus / Energy / **Dots** as hand-rolled `Button` toggles (default active / outline inactive) | No precedent for `variant`-swap toggling; design wants plain toggle-buttons; Dots toggle gates block dots (hidden in Month) | Plan / Research |
| Empty state | Dedicated empty + sparse-aware rendering | Addresses roadmap's flagged low-session-count risk | Plan |
| Test depth | Unit-test pure lib math + `astro check`/`tsc` gate | Covers the error-prone hand-rolled date/layout/color math; honors L-08 | Plan |

## Scope

**In scope:** `/timeline` route + auth gating; SSR session fetch; hand-rolled date-range/layout/color libs; TimelineApp island + toolbar/legend/axis/day-rows/blocks; filtering; "Show" toggle group (Focus/Energy/Dots) with focus/energy badges + Month shading; detail dialog; preset palette + HSV wheel; localStorage color persistence; empty/sparse state.

**Out of scope:** seeded sample/fake data; future-session rendering beyond current period; DB migration / API changes / new endpoint; pagination; Recharts.

## Architecture / Approach

One stateful island `TimelineApp` owns all view state and feeds dumb children (`Toolbar`, `Legend`, `TimeAxisHeader`, `DayRow` → `SessionBlock`, dialogs), mirroring `AnonSessionApp`. Pure logic in `src/lib/timeline/` (`dateRange.ts`, `layout.ts`, `color.ts`, `useTimelineColors.ts`) is unit-tested. SSR fetch in `timeline.astro` feeds a `client:load` island. All date-derived rendering runs behind the `LocalDateTime` hydration gate (Workers SSR = UTC).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scaffold, data & date math | Route, SSR fetch, `dateRange.ts`, TimelineApp shell, nav, empty state | Hand-rolled ISO-week/nav math; timezone hydration correctness |
| 2. Grid rendering & layout | Axis header, day-row swimlanes, positioned blocks, dots, tooltip | `layout.ts` position/width accuracy; row-height/scale layout |
| 3. Filtering, ratings & detail dialog | Legend filtering, Color-by switch, "Show" group (Focus/Energy/Dots), detail dialog | Month single-channel shading state rules |
| 4. Color customization (cuttable) | Palette + HSV wheel, localStorage persistence, live recolor | New dependency integration; cross-tab persistence |

**Prerequisites:** local Supabase running with a seeded session history for manual testing; `npx shadcn@latest add switch` (Phase 3 — the Show group is hand-rolled from `Button`, no `toggle-group`); `@uiw/react-color` install (Phase 4).
**Estimated effort:** ~4 sessions across 4 phases; Phase 4 is deferrable.

## Open Risks & Assumptions

- Timezone hydration gate must be applied to *every* date-derived label — the design spec omits it; missing it causes off-by-one rows.
- Real accounts are sparse/empty at first run; the sparse rendering must read acceptably, not just the zero case.
- `localStorage` colors don't sync across devices — accepted as a display-preference trade-off.
- Sessions crossing midnight are assumed out of scope (bucket by local start day, clamp to axis end).

## Success Criteria (Summary)

- A logged-in user sees their real sessions correctly positioned and navigable across scales, timezone-correct.
- Filtering, ratings, and the detail dialog behave per the design spec in both Day/Week and Month.
- Custom colors persist across reloads and apply live to blocks, dots, badges, and legend.
