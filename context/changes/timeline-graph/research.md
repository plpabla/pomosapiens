---
date: 2026-07-16T21:10:00+02:00
researcher: Claude
git_commit: f1d7b0dd0f350351addc608eee3c3cae87b141e1
branch: timeline-graph
repository: pomosapiens
topic: "Timeline graph (S-14) — architecture: functional component breakdown and fit into existing arch"
tags: [research, codebase, timeline-graph, architecture, dashboard, ui-components, data-model]
status: complete
last_updated: 2026-07-16
last_updated_by: Claude
---

# Research: Timeline graph (S-14) — architecture and functional component breakdown

**Date**: 2026-07-16T21:10:00+02:00
**Researcher**: Claude
**Git Commit**: f1d7b0dd0f350351addc608eee3c3cae87b141e1
**Branch**: timeline-graph
**Repository**: pomosapiens

## Refresh note (2026-07-16, re-verified at same commit `f1d7b0d`)

A second research pass (three parallel Explore agents: UI primitives, data model, page composition) re-verified this doc against the current working tree. **No source code has changed since the original pass** (HEAD is still `f1d7b0d`; the only working-tree changes are the `context/changes/timeline-graph/` docs). All original findings hold. Three refinements + one design change to note:

1. **`collectionStore` is array-shaped, not object-shaped.** `createCollectionStore<T>` stores `items` as `readonly T[]` and validates reads with `Array.isArray` (`collectionStore.ts:33`); a raw `{[categoryId]: hex}` object map would fail validation and read as `EMPTY`. Custom colors must be stored as an **array of `{ categoryId, hex }` entries** (with `T = { categoryId: string; hex: string }`), not a bare object map. This corrects §4's Option B phrasing below.
2. **The "Show" toggle group is a net-new UI pattern.** There is **no in-repo precedent for state-driven `variant` swapping** — every `variant=` usage is a static literal (`ConfirmActionButton.tsx` swaps *which* button renders, not a persistent button's variant). `button.tsx` does expose both `default` (`:12`) and `outline` (`:15-16`) variants and exports `buttonVariants` (`:50`). So the group is best hand-rolled as three `Button variant={active ? "default" : "outline"}` — a shadcn `toggle-group` is optional, not required. Only the Color-by **switch** genuinely needs a new primitive (`npx shadcn@latest add switch`).
3. **`@uiw/react-color` supersedes two earlier "build from scratch" items.** Its `Wheel` (circular hue/sat conic disc) replaces the hand-rolled pointer-drag disc, and its `ShadeSlider` (the HSV `v` channel) replaces the need for a shadcn `slider`. So neither the hand-rolled disc nor a shadcn `slider` is needed. Also confirmed: `tomatoCount` buckets at **1200 s = 20 min per pip, floored**, returning **0 for durations < 20 min** (10 min → 0, 25 → 1, 50 → 2, 90 → 4) — the design's "<20 min → single half dot" is therefore fully custom logic, not `tomatoCount`, and `duration_seconds` (`number | null`) must be null-coalesced before the call.

**Design change folded in (2026-07-16):** the toolbar's rating controls are now a single **"Show" toggle group of three buttons — Focus / Energy / Dots** — with no leading color dots on the labels. The new **Dots** toggle enables/disables the pomodoro secondary-color dots on session blocks; it is **hidden in Month view** (dots never render there), while Focus/Energy remain and the group label switches to "Shade by". All three buttons are `default` variant when active, `outline` when inactive. See `change.md` "Ratings & dots — the 'Show' toggle group" and "Secondary highlight (pomodoro dots)".

## Research Question

How should the timeline-graph page (S-14, full behavioral spec in `change.md`) be broken down into functional components, and how does it fit into the existing architecture (`context/foundation/arch.md`)? This is a new page; reuse existing libraries/components where possible rather than introducing new dependencies.

## Summary

The page fits cleanly into the existing "surface" pattern (arch.md §2.2): a new protected Astro page that SSR-fetches session rows via the same Supabase-in-frontmatter pattern as `dashboard.astro`, then mounts one large stateful React island. Of the six UI building blocks the design calls for, four map directly onto **existing shadcn primitives already in the codebase** (`Card`, `Dialog`, `Select`, `Button`); two have **no precedent at all** and are the real architectural risk: the toggle/switch controls (fixable with a low-cost `npx shadcn@latest add toggle-group switch` — the underlying Radix packages are already transitively installed) and the **HSV color wheel with pointer-drag math**, for which nothing exists anywhere in the repo or its dependencies — Recharts is a charting library and doesn't help here.

The data model is already 90% ready: `SessionListItem` (topic, format, focus, energy, duration, timestamps) is exactly what the timeline needs, but **no `color` column exists on `topics` or `material_formats`**, and **no date/calendar-math utility exists anywhere** (no `date-fns`/`dayjs`, only native `Date`/`Intl`) — day/week/month range math and ISO week labels need to be hand-rolled.

Two decisions are genuinely open and should be made before/at `/10x-plan`, not assumed by research:
1. **Real session data vs. the design's seeded sample data** (the imported design spec explicitly calls for fake generated data with no backend — this conflicts with arch.md's "server owns truth" stance).
2. **Where custom per-category colors persist** — a new DB column (fits "server owns truth" but needs a migration + API change) vs. `localStorage` only (fast, but stretches the one documented exception to that stance).

## Detailed Findings

### 1. Existing data model — mostly sufficient, no color column

`SessionListItem` (`src/lib/types.ts:1-43`) already carries everything the timeline's block rendering needs:

```ts
export type EnergyLevel = "low" | "medium" | "high";

export type SessionListItem = Pick<
  SessionRow,
  | "id" | "started_at" | "energy_level" | "duration_seconds" | "focus_rating"
  | "ended_at" | "timer_mode" | "note" | "topic_id" | "material_format_id"
> & {
  topic: { name: string } | null;
  material_format: { name: string } | null;
};
```

- `duration_seconds`, `focus_rating`, `ended_at`, `note` are nullable per the DB row — the timeline must handle in-progress (`ended_at === null`) and unrated (`focus_rating === null`, matching the design's "★ n/a" case) sessions.
- **No `color` column exists on `topics` or `material_formats`** (`src/db/database.types.ts:42-68` for `material_formats`, `:139-146` for `topics` — full column lists, neither has color). Per-category color is a genuinely new piece of state.
- `energy_level` is a Postgres enum, mirrored by the `EnergyLevel` string union — already mapped to a Tailwind class via `energyColorClass` in `src/lib/session/format.ts:20-24` (`high → text-spark`, `medium → text-blaze`, `low → text-ash`), a ready-made precedent for energy → color mapping (though the design wants richer per-category colors, not just three fixed energy shades).
- Reusable helpers in `src/lib/session/format.ts`: `tomatoCount()`, `formatDuration()`, `getStatus()`, `isRated()` — all directly applicable to the timeline's block rendering and detail dialog.

**`dashboard.astro`'s SSR query** (`src/pages/dashboard.astro:20-27`) is the query pattern to extend:

```ts
const { data, error } = await supabase
  .from("sessions")
  .select(
    "id, started_at, energy_level, duration_seconds, focus_rating, ended_at, timer_mode, note, topic_id, material_format_id, topic:topics(name), material_format:material_formats(name)",
  )
  .eq("user_id", user.id)
  .order("started_at", { ascending: false })
  .limit(50);
```

The `.limit(50)` won't work for a timeline that needs a full navigable range (the design spans ~115 days of sample data). At this product's scale (single user, RLS-scoped, no pagination anywhere in the app today) the simplest fit is an SSR fetch with a wider bound (or no limit) rather than introducing a new paginated `GET /api/sessions` endpoint — see Open Questions.

### 2. UI primitive inventory — four exist, two are gaps

`src/components/ui/` (shadcn "new-york" style, `components.json`: `baseColor: "neutral"`, `iconLibrary: "lucide"`) currently has: `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `textarea.tsx`.

Mapping the design's six building blocks onto this:

| Design need | Existing primitive | Gap |
|---|---|---|
| Toolbar: scale + hours `Select`s | `select.tsx` (wraps Radix `Select`) — direct reuse | — |
| Toolbar: prev/next/today | `button.tsx` — direct reuse | — |
| Toolbar: "Color by" switch | none | Add `npx shadcn@latest add switch` |
| "Show" toggle group (Focus / Energy / Dots) | none — hand-roll from `Button` | No precedent for state-driven `variant` swap; hand-roll three `Button variant={active ? "default" : "outline"}` (no `toggle-group` needed). See Refresh note. |
| Legend chips (colored dot + label, dim when filtered) | none, but trivially composed from `Button variant="ghost"` + a `<span>` dot | Custom composition, no primitive needed |
| Session detail dialog | `dialog.tsx` (wraps Radix `Dialog`, already used e.g. `src/components/dashboard/EditSessionDialog.tsx`) — direct reuse | Star rating display: no star-icon component exists (`FocusRating.tsx`/`RatingBadge.tsx` use dots/text `★`, not icons) — build from `lucide-react`'s `Star` |
| Color-palette dialog (6-col swatch grid) | `dialog.tsx` for the shell | Swatch grid is fully custom, no precedent |
| Color wheel (hue/sat disc + lightness slider) | none | Resolved by `@uiw/react-color`: `Wheel` (circular hue/sat conic disc) + `ShadeSlider` (HSV `v` = lightness) + `hsvaToHex`. Removes both the hand-rolled pointer-drag disc and a shadcn `slider`. See Refresh note. |

Important: `@radix-ui/react-toggle`, `-toggle-group`, and `-slider` are **already present in `node_modules`** transitively via the `radix-ui` meta-package dependency (`package.json:41`) but currently unused/unwrapped by any shadcn component file. Adding them via the shadcn CLI is a low-cost, zero-new-npm-dependency operation — it just generates the wrapper files, matching the existing `components.json` config automatically.

No color-picker, HSL/HSV conversion, or hex-math utility exists anywhere in `src/lib/`. The HSV wheel is the single riskiest, most novel piece of this feature — it is genuinely new code (trig-based angle/radius → hue/saturation math on pointer events), not a "wire up an existing thing" task. Given the instruction to "reuse existing libraries if possible," this is the one spot where reaching for a small dependency (e.g. a color-wheel React component) instead of hand-rolling might be worth a deliberate decision at `/10x-plan` time — the codebase currently has zero precedent either way.

**Recharts is not a fit for the timeline grid itself.** It's used today for a single categorical line chart (`FocusRatingChart.tsx`, mounted `client:only="react"` specifically because it needs real browser layout for `ResponsiveContainer`). The timeline is a custom swimlane/Gantt-style layout — absolutely-positioned blocks over a day-row grid — which Recharts has no chart type for. This should be built as plain CSS/DOM (percentage-based absolute positioning within each day row), not forced through a charting library.

### 3. Page composition and routing — direct precedent exists

`dashboard.astro` is the template to follow (`src/pages/dashboard.astro`):

```astro
import Layout from "@/layouts/Layout.astro";
import { createClient } from "@/lib/supabase";

const { user } = Astro.locals;
const supabase = createClient(Astro.request.headers, Astro.cookies);
// ... SSR query, then:
```
```
<FocusRatingChart sessions={ratedSessions} client:only="react" />
<SessionList sessions={sessions} error={dbError} client:load />
```

The page trusts `context.locals.user` (set by `middleware.ts` before the page runs) rather than re-checking auth itself; the `!user` branch is defense-in-depth only. A thinner variant exists at `src/pages/topics/index.astro` (`<TopicManager client:load />` with no SSR data fetch — the island does its own client-side fetch via `useCrudResource`) for cases where client-side fetching is preferred over SSR props.

For the timeline: given the whole page is one large interactive tree with heavy client-side date/filter state (not needing SSR for SEO or first-paint), **`client:load` on a single top-level island fed by an SSR-fetched `sessions` prop** (mirroring `dashboard.astro`'s `SessionList` island, not the chart's `client:only`) is the natural fit — no browser-only APIs are needed at mount time the way Recharts' `ResponsiveContainer` needs one.

**Routing/auth gating** — `middleware.ts:4`:
```ts
const PROTECTED_ROUTES = ["/dashboard", "/session/", "/topics", "/formats", "/presets"];
```
Matching is `startsWith`, not exact. Adding `"/timeline"` to this array (no trailing slash needed unless sub-routes like `/timeline/:id` are planned) gates the new page identically to `/dashboard`.

### 4. Color persistence — two real options, no forced precedent

**Option A — DB-backed** (`color` column on `topics` and `material_formats`): fits arch.md's "server owns truth for signed-in users" stance exactly, syncs across devices/browsers, but requires an additive migration (`supabase/migrations/`, RLS already covers per-owner writes at the row level — needs verifying the existing `PATCH` endpoints for topics/formats accept a new field) + `npm run db:types` regen + API schema changes in `src/lib/schemas/`.

**Option B — `localStorage`-only**, two existing patterns to build on:
- `useLastMode` (`src/lib/session/useLastMode.ts`) — the simplest precedent: one scalar key, fail-open reads/writes, no versioning, no cross-tab sync. Good fit for a single preference-shaped value.
- `collectionStore.ts` (`src/lib/local/collectionStore.ts`) — generic `createCollectionStore<T>({key, version})`, `useSyncExternalStore`-based, SSR-safe, versioned envelope, cross-tab `storage`-event sync, fail-open. Built for the anonymous-session mirror but generic enough to reuse for any `localStorage`-backed collection. **NB (see Refresh note):** it is **array-shaped** — `items` is `readonly T[]`, validated with `Array.isArray` (`:33`). Store custom colors as an array of `{ categoryId, hex }` entries, not a bare `{[categoryId]: hex}` object (which would fail validation and read as `EMPTY`).

Per arch.md §2.1, the *only* currently-documented exception to "server owns truth" for signed-in users is a single convenience key (last-used timer mode) — a full custom-color map is a larger exception than any existing precedent, though defensible as display preference rather than durable domain data. This is a product/architecture call, not something research should decide (see Open Questions).

`useCrudResource` (`src/lib/resource/useCrudResource.ts`) — the hook powering topic/format management — is **not** a fit for colors even under Option A: it's tightly coupled to `CrudItem = {id, name, archived_at}` with add/rename/archive/unarchive semantics. A colors resource would need a plain `fetchJson` PUT/PATCH call, not this hook.

### 5. Date/calendar math — nothing to reuse, must hand-roll

No date-range or ISO-week utility exists anywhere in `src/lib/` (only `src/lib/time.ts`'s `minutesFromSeconds`/`secondsFromMinutes`, unrelated). `package.json` confirms no date library dependency (`date-fns`/`dayjs`/`luxon`/`moment` all absent). Day/week/month navigation, ISO week numbers (`CW29`), and adaptive axis tick spacing (every 2h vs 3h) all need hand-rolled `Date`/`Intl` math — reasonable at this scope, but there is zero existing convention to lean on.

One important **cross-cutting precedent to reuse**: `LocalDateTime.tsx` (`src/components/dashboard/LocalDateTime.tsx:8-15, 29-44`) hydration-gates date rendering behind `useSyncExternalStore` specifically because the Cloudflare Workers SSR runtime is UTC and would otherwise produce an SSR/CSR mismatch against the visitor's local timezone. Every date-derived label on the timeline (day-of-week, "today" highlight, hour axis) needs the same treatment — this is a real gap the design spec doesn't mention and existing code has already solved once.

### 6. Sample-data generation — no seeded-RNG precedent

The imported design spec calls for a deterministic seeded RNG generating ~115 days of fake sessions with no backend. No seeded-RNG or deterministic-random utility exists anywhere in the repo (`Math.random()` usage elsewhere is only e2e test-fixture name suffixes). If the sample-data path is chosen, this is new, self-contained utility code (e.g. a small mulberry32-style PRNG) — low risk, no library needed.

## Proposed functional component breakdown

Mirroring arch.md §3's page/island/lib grouping:

```
src/pages/timeline.astro                          — new, protected route (middleware.ts + "/timeline")
  SSR: supabase query (sessions + topic/format join, extends dashboard.astro's pattern)
  mounts: <TimelineApp sessions={...} client:load />

src/components/timeline/                           — new directory, mirrors src/components/dashboard/
  TimelineApp.tsx        — top-level state container (scale, anchor date, colorBy,
                            hoursRange, topic/format filters, focus/energy toggle state,
                            custom colors) — plays the role AnonSessionApp plays for the
                            anonymous surface: one stateful orchestrator, dumb children below it
  Toolbar.tsx             — composes ScaleSelector, DateNav, ColorBySwitch, HoursRangeSelect,
                            RatingToggles (each a thin wrapper around shadcn Select/Button/
                            Toggle primitives)
  Legend.tsx              — TopicChips + FormatChips, each chip = Button(ghost) + color dot;
                            dot click opens ColorPaletteDialog
  TimeAxisHeader.tsx      — hour labels + gridlines, driven by lib/timeline/dateRange.ts
  DayRow.tsx              — one swimlane per visible day; renders SessionBlock children
                            positioned via lib/timeline/layout.ts
  SessionBlock.tsx        — absolutely-positioned block; fill/stripe/badges driven by
                            colorBy + rating-toggle state; click → SessionDetailDialog
  SessionDetailDialog.tsx — shadcn Dialog + lucide Star icons
  ColorPaletteDialog.tsx  — shadcn Dialog + custom 6-col swatch grid
  ColorWheelDialog.tsx    — nested shadcn Dialog + new Slider primitive + custom
                            pointer-drag hue/saturation disc (highest-risk, no precedent)

src/lib/timeline/                                  — new directory, mirrors src/lib/timer/ src/lib/session/
  dateRange.ts            — day/week/month range math, ISO week number, prev/next/today,
                            adaptive axis tick spacing (hand-rolled, no date lib)
  layout.ts               — session start/end time → horizontal %/position within hoursRange
  color.ts                — preset palette constants, hex/HSL conversion, stripe/badge
                            derived-color logic
  useTimelineColors.ts    — persistence hook (Option A: fetchJson PUT to a new endpoint;
                            Option B: collectionStore-based localStorage) — decision needed
  sampleData.ts            — only if the sample-data path is chosen: seeded RNG + generator
```

Reused as-is, no changes needed: `Card`, `Dialog`, `Select`, `Button` (`src/components/ui/`); `Layout.astro`; `tomatoCount`/`formatDuration`/`isRated`/`energyColorClass` (`src/lib/session/format.ts`); `middleware.ts` gating pattern; `LocalDateTime`'s hydration-gate pattern (as a technique, not a direct import).

New shadcn additions (zero new npm deps, Radix already transitively installed): `switch` (for the Color-by control). The "Show" group is hand-rolled from `Button`; the color wheel/lightness come from the `@uiw/react-color` dependency (so no shadcn `slider`, no `toggle-group`).

Genuinely new code with no in-repo precedent: HSV color-wheel pointer math, day/week/month date-range math, (conditionally) seeded-RNG sample data, (conditionally) a colors persistence endpoint.

## Code References

- `src/lib/types.ts:1-43` — `SessionListItem`, `EnergyLevel`, `Mode` — the domain vocabulary the timeline reads.
- `src/db/database.types.ts:42-68,139-146` — `material_formats`/`topics` column lists (no `color` column).
- `src/pages/dashboard.astro:20-27` — SSR session query pattern to extend.
- `src/pages/dashboard.astro:54,57` — `client:only="react"` vs `client:load` island-mounting precedent.
- `src/pages/topics/index.astro:6-9` — thinner page pattern (client-side fetch, no SSR props).
- `src/middleware.ts:4,30` — `PROTECTED_ROUTES` prefix-match gating.
- `src/components/dashboard/FocusRatingChart.tsx` — Recharts `client:only` precedent (not reusable for the timeline grid itself).
- `src/components/dashboard/FocusRatingChartTooltip.tsx:6-9,16-18,26-28` — custom-rendering + `tomatoCount`/`formatDuration` reuse precedent.
- `src/lib/session/format.ts:1-24` — `tomatoCount`, `formatDuration`, `getStatus`, `isRated`, `energyColorClass`.
- `src/components/dashboard/LocalDateTime.tsx:8-15,29-44` — SSR/CSR timezone-mismatch hydration-gate pattern (Cloudflare Workers SSR runs UTC).
- `src/lib/session/useLastMode.ts` — single-scalar `localStorage` preference precedent.
- `src/lib/local/collectionStore.ts:17-22,28-38,50-54,56-78` — generic versioned `localStorage` collection store, SSR-safe, cross-tab sync.
- `src/lib/resource/useCrudResource.ts:4-8,16` — CRUD hook shape, not reusable for a colors resource.
- `src/components/ui/` (`button.tsx`, `card.tsx`, `dialog.tsx`, `select.tsx`, `dropdown-menu.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`) — existing shadcn inventory.
- `components.json` — shadcn config (`style: new-york`, `baseColor: neutral`, `iconLibrary: lucide`) new components will match.
- `package.json:41` — `radix-ui` meta-package already provides `Toggle`/`ToggleGroup`/`Slider`/`Popover` transitively, unused today.

## Architecture Insights

- **The "surface" pattern from arch.md §2.2 extends cleanly to a fifth surface.** Timeline is not a variant of the dashboard or capture core — it's a new, independent surface reading the same `sessions` domain data through a new SSR query, exactly like the existing four (landing/capture/dashboard/management) each read the shared capture core differently.
- **Recharts' `client:only` pattern doesn't transfer.** The chart needs no SSR because it needs real DOM layout at mount. The timeline needs no SSR for a different reason — it's driven by heavy client-only interactive state (filters, toggles, dialogs) with no meaningful server-rendered first paint — so `client:load` (SessionList's pattern) fits better than `client:only` (FocusRatingChart's pattern).
- **The color-wheel and date-math pieces are where "reuse existing libraries" runs out.** Everything else in the design maps onto existing shadcn/Radix primitives or trivial compositions of them. These two are net-new engineering, not integration work, and should be scoped/estimated as such at `/10x-plan` time rather than assumed to be "just wire up an existing component."
- **Two decisions materially change the shape of this feature** and were explicitly left open by the roadmap (`roadmap.md` S-14 "Unknowns"): real data vs. sample data, and where colors persist. Research surfaces the trade-offs (above) but does not resolve them — both affect migration/API scope and should be locked at `/10x-plan`.

## Historical Context (from prior changes)

- `context/archive/2026-07-15-chart-tooltip-context/` (S-13) — the most recent precedent for extending an existing data-viz surface with new derived display logic (tooltip context from `SessionListItem` fields). Lesson L-08 from that change ("type checking gate must actually run the compiler") applies directly here too, since the timeline is heavy on `.tsx` prop-wiring across many new small components — a `/10x-plan` gate naming `astro check`/`tsc`, not just `eslint`/`build`, should be carried forward.
- `context/archive/2026-07-11-anonymous-sessions/` (S-08) — origin of `collectionStore.ts` and the `localStorage`-as-real-persistence-tier pattern; directly relevant to the color-persistence Option B trade-off above.
- `roadmap.md` S-14 entry (lines 279-291) — already flags both open decisions (real vs. sample data; where the view lives) as unresolved "Unknowns," and calls scope creep the primary risk, suggesting a possible split of "timeline core" from "color customization + month shading" if the calendar tightens.

## Related Research

None — this is the first research artifact for `timeline-graph`.

## Open Questions

1. **Real session data vs. the design's seeded sample data.** The imported design (`change.md`) explicitly specifies client-state-only sample data with no backend. This conflicts with arch.md's "server owns truth for signed-in users" stance and with the pattern every other slice (S-01 through S-13) follows. Recommendation to weigh at `/10x-plan`: build against real `SessionListItem` data from day one (empty-state UI for low session counts, per roadmap's own flagged risk of "how the timeline behaves at low session counts") rather than shipping a demo with fake data — but this is a product call, not an architecture-forced one.
2. **Where do custom per-topic/per-format colors live?** DB column (fits the stance, costs a migration + API surface) vs. `localStorage` (fast, but a bigger exception to "server owns truth" than the one documented precedent). Directly affects whether this slice touches `supabase/migrations/`, `src/lib/schemas/`, and the topics/formats API routes at all.
3. **Full-range fetch vs. a new filtered/paginated sessions endpoint.** At current scale (single-user RLS, no existing pagination anywhere) an unbounded or wide-bounded SSR fetch in `timeline.astro` is likely simplest, but should be confirmed against expected real session volumes before assuming `dashboard.astro`'s `.limit(50)` pattern can just be dropped.
4. **Color-wheel implementation: hand-roll vs. a small new dependency.** No precedent either way exists in the codebase; "reuse existing libraries" argues for hand-rolling (no new dependency) but the pointer-drag hue/saturation math is real, non-trivial, novel work — worth an explicit cost/benefit call rather than a default.
