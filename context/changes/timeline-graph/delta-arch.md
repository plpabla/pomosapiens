# PomoSapiens - Architecture Delta: timeline-graph (S-14)

## Overview

Adds a **fifth surface** (`/timeline`) that renders the signed-in user's real sessions as a swimlane / Gantt-style grid, navigable at Day / Week / Month scales. It reads the shared `sessions` domain data through its own SSR query and mounts one large stateful React island (`TimelineApp`), exactly like the existing four surfaces (landing / capture / dashboard / management) consume the capture core.

**No schema changes. No API changes. No new endpoint.** Sessions load via a single wide-bounded SSR fetch in `timeline.astro`; per-category colors persist to `localStorage` only. The change is almost entirely **additive** — a new page, a new component directory (`src/components/timeline/`), a new lib directory (`src/lib/timeline/`), one new shadcn primitive (`switch`), and one new npm dependency (`@uiw/react-color`). The only edit to existing code is a one-line addition to `middleware.ts`'s `PROTECTED_ROUTES`.

This is the first surface that is **not** built from the shared capture core — it reuses the domain vocabulary (`SessionListItem`, `format.ts` helpers) and infra patterns (SSR-query-into-island, hydration gate, `collectionStore`) but not the form/runner/tile components.

---

## Fundamental changes to the architecture

1. **A new read-only surface that never writes a session.** Unlike every prior slice, the timeline is pure visualization of existing rows. It touches neither the `SessionPersistence` port (§5), the timer state machine (§7), nor the capture flows (§6.1/6.2). It is the cleanest possible extension of the §2.2 "surface" pattern.

2. **First hand-rolled date/calendar math in the codebase.** No `date-fns`/`dayjs`/`luxon` exists; day/week/month range math, ISO week numbers (Monday-start, `CW29` labels), nav clamping, and adaptive axis ticks are new pure code in `src/lib/timeline/dateRange.ts`. This is net-new engineering with zero existing convention to lean on, and the likeliest bug source — hence it is unit-tested.

3. **`localStorage` gains a second signed-in use.** arch.md §2.1 documents exactly one signed-in `localStorage` key (last-used timer mode) as *the* exception to "server owns truth." The timeline adds a **second** exception: custom per-category colors. This is a deliberate, larger stretch of that stance — defensible as a display preference rather than durable domain data, but worth recording as a documented divergence. It reuses the existing `collectionStore` (`src/lib/local/collectionStore.ts`), so no new persistence infrastructure is introduced.

4. **First custom DOM-layout data-viz.** The existing chart (`FocusRatingChart`) uses Recharts; the timeline grid is deliberately **not** Recharts (no chart type fits a swimlane/Gantt). It is plain CSS/DOM percentage-based absolute positioning — a new visualization idiom in the repo.

---

## New components and modules

```
src/pages/timeline.astro                 — NEW protected route; SSR query (extends
                                            dashboard.astro's select, drops .limit(50)),
                                            mounts <TimelineApp client:load />

src/components/timeline/                  — NEW directory (mirrors src/components/dashboard/)
  TimelineApp.tsx        — top-level stateful island; owns scale, anchor, colorBy,
                           hoursRange, topic/format filter sets, Focus/Energy/Dots toggles,
                           custom colors. Orchestrator role AnonSessionApp plays for anon.
  TimelineEmptyState.tsx — zero-session friendly state (Card + Button)
  Toolbar (in TimelineApp) — Scale Select, Prev/Next/Today, Hours-range Selects,
                             Color-by switch, "Show" toggle group
  TimeAxisHeader.tsx     — hour labels + gridlines from dateRange.axisTicks
  DayRow.tsx             — one swimlane per visible day (heights: Day 120 / Week 60 / Month 22px)
  SessionBlock.tsx       — absolutely-positioned block; fill + pomodoro dots + badges + tooltip;
                           click → SessionDetailDialog
  Legend.tsx             — topic + format chips (Button ghost + color dot); AND-semantics filter;
                           dot opens ColorPaletteDialog (Phase 4)
  ShowToggles.tsx        — Focus / Energy / Dots buttons (variant swaps active/inactive)
  SessionDetailDialog.tsx— shadcn Dialog + lucide Star row
  ColorPaletteDialog.tsx — 6-col preset swatch grid (Phase 4)
  ColorWheelDialog.tsx   — nested Dialog: @uiw/react-color Wheel + ShadeSlider (Phase 4)

src/lib/timeline/                         — NEW directory (mirrors src/lib/timer/, src/lib/session/)
  dateRange.ts           — day/week/month ranges, ISO week, nav clamp, axis ticks (unit-tested)
  layout.ts              — session time → left%/width% within hoursRange, min-width floor,
                           in-progress end derivation, right-edge clamp, dot counts (unit-tested)
  color.ts               — 17-preset palette + default per-category color map + hex/HSL helpers
  useTimelineColors.ts   — collectionStore-backed color persistence, resolved (id)→hex lookup

src/components/ui/switch.tsx              — NEW shadcn primitive (Color-by switch); zero new npm dep
```

New shadcn primitive: `switch` (Radix already transitively present via the `radix-ui` meta-package, so zero new npm dependency). The "Show" group is **hand-rolled** from `Button variant={active ? "default" : "outline"}` — research found no in-repo precedent for state-driven `variant` swapping, and none is needed.

New npm dependency: `@uiw/react-color` (`Wheel`, `ShadeSlider`, `hsvaToHex`) — supplies the HSV wheel, replacing what would otherwise be the single riskiest hand-rolled piece (pointer-drag hue/saturation trig). Phase 4 only; cuttable.

---

## Interactions with the existing system

### Reused as-is (no changes)
- **`middleware.ts` gating** — the only existing-code edit: `"/timeline"` appended to `PROTECTED_ROUTES` (prefix-match, §8). Gates the page identically to `/dashboard`.
- **SSR-query-into-island pattern** (§2.2, §3.1) — `dashboard.astro:20-27` is the template: Supabase-in-frontmatter SELECT (same joined columns) → plain rows as a `client:load` island prop. The timeline **drops `.limit(50)`** for a wide bound (all/last-~365d of the user's sessions) to feed a full navigable history.
- **Domain vocabulary** (§4, §8) — `SessionListItem` is ~90% ready; the timeline consumes `topic`, `material_format`, `focus_rating`, `energy_level`, `duration_seconds`, `started_at`, `ended_at`, `note` unchanged. Nullable `duration_seconds` / `focus_rating` / `ended_at` (in-progress + unrated) must be handled.
- **`format.ts` helpers** (§8) — `tomatoCount`, `formatDuration`, `isRated` apply directly to block dots and the detail dialog.
- **`collectionStore`** (§4 "anonymous mirror", §8) — reused verbatim for custom colors. **It is array-shaped** (`readonly T[]`, validated with `Array.isArray`): colors must be stored as `{ categoryId, hex }[]` entries, not a bare `{[id]: hex}` object map (which fails validation and reads empty).
- **`LocalDateTime` hydration-gate technique** (§8, Cross-cutting) — reused as a *pattern*, not a direct import (see risks).
- **shadcn/Radix, `cn()`, `Layout.astro`, `Card`/`Dialog`/`Select`/`Button`** — standard primitives, direct reuse.

### Untouched by this change
- **Session persistence seam (§5)** — the timeline never creates/ends/continues a session.
- **Timer state machine (§7)** and **capture flows (§6.1, §6.2)** — no interaction.
- **Domain model / migrations (§4)** — no `color` column, no migration, no `db:types` regen.
- **API routes + schemas (§3.3, §8)** — `src/pages/api/**`, `src/lib/schemas/`, `parse-request.ts` all untouched.
- **RLS / authorization (§4, §8)** — the wide SSR SELECT rides the same `.eq("user_id", ...)` + RLS as `dashboard.astro`; no new policy surface.
- **Auth (§6.4)**, **anonymous path (§6.2)**, **deployment (§9)** — no change. (The timeline is authenticated-only; anonymous visitors are gated out by `PROTECTED_ROUTES`.)

---

## Key risks & implementation awareness

1. **Timezone hydration gate is mandatory and the design spec omits it.** Cloudflare Workers SSR runs UTC; all day-bucketing, "today" detection, and hour-axis math must run against the *visitor's* local time. Every date-derived label must follow `LocalDateTime`'s `useSyncExternalStore` gate (stable placeholder until hydrated). Getting this wrong produces off-by-one-day rows and hydration warnings — the single highest-likelihood defect on this feature.

2. **Hand-rolled date math is the primary bug surface.** ISO week numbers across year boundaries, Monday-start weeks, DST-safe range math, and nav clamping at both bounds (`[earliestSessionPeriod, currentPeriod]`) are subtle. These must be unit-tested in `dateRange.ts` before UI is trusted.

3. **Navigation bound is a period, not a day.** The latest navigable anchor is the *period containing today* (the current week/month renders in full with future days empty), not today itself. Prev/Next clamp to `[earliest, currentPeriod]`. Easy to implement as "today" and get subtly wrong.

4. **`tomatoCount` returns 0 for <20 min and needs null-coalescing.** It buckets at 20 min/pip floored; `duration_seconds` (`number | null`) must be `?? 0`-guarded before the call, and the design's "<20-min single half-dot" is **custom logic**, not `tomatoCount` (which yields 0 dots there). A direct call on a null duration or an assumption that it produces the half-dot will misrender.

5. **`collectionStore` is array-shaped (color persistence).** Store `{ categoryId, hex }` entries, not an object map — the `Array.isArray` validation silently reads a bare object as empty (colors would appear to never persist). This is the most likely Phase 4 trap.

6. **Second signed-in `localStorage` exception.** Recording custom colors client-only diverges from "server owns truth" more than the one documented precedent. It is a deliberate product call (cuttable Phase 4), but arch.md §2.1 should eventually note the second exception when this closes.

7. **shadcn `switch` install may need a Vite-cache clear (L-04).** After `npx shadcn@latest add switch`, delete `node_modules/.vite/` and restart dev if SSR hook errors appear.

8. **Type-check gate must run `astro check`/`tsc`, not `eslint`/`build` (L-08).** This feature is heavy on `.tsx` prop-wiring across many small new components; a lint/build-only gate would miss type drift. Baked into every phase's success criteria.

9. **Scope creep is the flagged product risk.** Phases 1-3 deliver a fully usable timeline; Phase 4 (color palette + HSV wheel + persistence) is self-contained and explicitly cuttable if the calendar tightens — the natural cut line if pressure appears.

---

## Map back to the roadmap (§10)

- **S-14** (`timeline-graph`) — the fifth surface. Reads existing `sessions` domain data through a new wide-bounded SSR query; no schema/API/persistence-seam/timer changes. Deliberately excludes the design's seeded sample-data RNG (reads real data from day one), future-session rendering beyond the current period, pagination, and Recharts.
