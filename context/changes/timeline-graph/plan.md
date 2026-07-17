# Focus Timeline (S-14) Implementation Plan

## Overview

Build a new protected `/timeline` surface that renders the signed-in user's real sessions as a swimlane / Gantt-style grid: one row per day, sessions as absolutely-positioned blocks colored by topic or format, navigable at Day / Week / Month scales over a configurable hour-of-day axis. It supports independent topic/format legend filtering, pomodoro-pip dots for a secondary axis, focus/energy ratings (on-block badges in Day/Week, opacity shading in Month), a session-detail dialog, and per-category color customization (preset palette + HSV color wheel) persisted to `localStorage`.

The feature is the fifth "surface" (arch.md §2.2) reading the shared `sessions` domain data through its own SSR query, exactly like landing/capture/dashboard/management do today.

## Current State Analysis

- **Data model is ~90% ready.** `SessionListItem` (`src/lib/types.ts:1-43`) already carries `topic`, `material_format`, `focus_rating`, `energy_level`, `duration_seconds`, `started_at`, `ended_at`, `note`. Nullable fields (`duration_seconds`, `focus_rating`, `ended_at`) must be handled (in-progress + unrated sessions).
- **No `color` column** exists on `topics` or `material_formats` (`src/db/database.types.ts:42-68,139-146`). Per-category color is new state — and per the decisions below it lives in `localStorage`, not the DB.
- **No date/calendar utility** exists anywhere (`package.json` has no `date-fns`/`dayjs`/`luxon`). Day/week/month range math, ISO week numbers, Monday-start weeks, and adaptive tick spacing are hand-rolled from native `Date`/`Intl`.
- **Cloudflare Workers SSR runs UTC.** `LocalDateTime.tsx` (`src/components/dashboard/LocalDateTime.tsx:8-15,29-44`) already solves the SSR/CSR timezone mismatch with a `useSyncExternalStore` hydration gate. Every date-derived label on the timeline must use the same technique.
- **Four of six UI primitives exist** in `src/components/ui/` (`Card`, `Dialog`, `Select`, `Button`). Gaps: a toggle/switch control (cheap `npx shadcn@latest add`, Radix already transitively present via the `radix-ui` meta-package, `package.json:41`) and the HSV color wheel (no precedent — resolved by a small dependency, see decisions).
- **SSR + island precedent** is `dashboard.astro` (`src/pages/dashboard.astro:20-27,54,57`): Supabase-in-frontmatter query → props into a `client:load` island. `middleware.ts:4` gates via `PROTECTED_ROUTES` prefix match.
- **Reusable helpers**: `tomatoCount`, `formatDuration`, `getStatus`, `isRated`, `energyColorClass` (`src/lib/session/format.ts:1-24`); `collectionStore.ts` (`src/lib/local/collectionStore.ts`) — a generic versioned, SSR-safe, cross-tab `localStorage` collection store built during S-08.

## Desired End State

A signed-in user visits `/timeline` and sees their real focus history as a timeline. They can:

- Switch Day / Week / Month (default Week); navigate Prev / Next / Today; navigation is bounded to the range from their earliest session through the calendar period that contains today (the current week/month renders in full even where its future days are empty).
- Read each session as a positioned block over a configurable hour axis (default 6 AM–11 PM), colored by Topic (default) or Format, with pomodoro dots for the other axis.
- Filter topics and formats independently via legend chips (a session shows only when both its topic and format are enabled).
- Toggle Focus/Energy on-block badges (Day/Week) or single-metric opacity shading (Month).
- Click a block for a detail dialog; hover for a native tooltip.
- Recolor any topic/format via a preset palette or the HSV wheel; the choice persists across reloads (localStorage) and applies live to blocks, dots, badges, and the legend dot.
- Users with zero or few sessions see a friendly, non-broken empty/sparse state.

Verify: the page is reachable only when authenticated; scale/nav labels are correct across a timezone boundary; blocks land at the right x-position/width for their times; filters, ratings, and dialogs behave per spec; custom colors survive a reload.

### Key Discoveries:

- `dashboard.astro:20-27` — SSR query pattern to extend (drop the `.limit(50)`, widen the bound).
- `LocalDateTime.tsx:8-15,29-44` — mandatory hydration-gate for every local-date label (Workers SSR = UTC). The design spec does not mention this; it is a real gap.
- `collectionStore.ts:17-22,28-38,50-54,56-78` — reuse for custom colors, but it is **array-shaped** (validates with `Array.isArray` at `:33`): store `{ categoryId, hex }` entries, not a bare object map (versioned, SSR-safe, cross-tab, fail-open).
- `format.ts:1-24` — `tomatoCount`/`formatDuration`/`isRated` apply directly to block dots + detail dialog.
- `@uiw/react-color` — `Wheel` (circular hue/sat conic disc; supports `angle={180}`, `direction="anticlockwise"`), `ShadeSlider` (brightness/`v`), `hsvaToHex` — matches the design's disc + lightness + preview spec exactly.
- L-08 (lessons.md) — the type-check gate must run `astro check`/`tsc`, not `eslint`/`build`. Baked into every phase below.

## What We're NOT Doing

- **No seeded sample data / no fake sessions.** The timeline reads real `SessionListItem` data from day one. The design's `mulberry32` RNG generator and its ~115-day fabricated dataset are explicitly out of scope.
- **No future-session rendering beyond the current period.** Navigation stops at the calendar period containing today; no infinite empty forward scroll.
- **No DB migration, no API changes, no new endpoint.** Colors persist to `localStorage`; sessions load via a single wide-bounded SSR fetch in `timeline.astro`. `supabase/migrations/`, `src/lib/schemas/`, and the topics/formats routes are untouched.
- **No pagination.** Single-user RLS scale; one SSR query.
- **No Recharts.** The grid is plain CSS/DOM absolute positioning, not a charting library.

## Implementation Approach

One large stateful island (`TimelineApp`) owns all view state (scale, anchor date, colorBy, hoursRange, topic/format filter sets, focus/energy toggle state, custom colors) and feeds dumb children — mirroring how `AnonSessionApp` orchestrates the anonymous surface. Pure logic lives in `src/lib/timeline/` (`dateRange.ts`, `layout.ts`, `color.ts`) and is unit-tested, because the hand-rolled date and layout math is the likeliest bug source. Phases 1-3 deliver a fully usable timeline; Phase 4 (color customization) is isolated and cuttable if the calendar tightens.

## Critical Implementation Details

- **Timezone hydration gate.** All day-bucketing, "today" detection, and hour-axis math must run against the *visitor's* local time, but the SSR pass runs in UTC. Follow `LocalDateTime`'s `useSyncExternalStore` pattern: render a stable placeholder (or the SSR-safe skeleton) until hydrated, then compute local-date-derived layout. Getting this wrong produces off-by-one-day rows and hydration warnings.
- **Navigation bound.** The latest navigable anchor is the period (day/week/month) containing *today*, not today itself: e.g. in Month, navigating to the current month shows the full month with future days empty. The earliest navigable anchor is the period containing the user's earliest session. Prev/Next clamp to `[earliestPeriod, currentPeriod]`.
- **Session-to-lane bucketing.** A session belongs to the day of its *local* `started_at`. Sessions crossing midnight are out of the design's scope (sessions are short; the spec lays them out within a single day) — bucket by start day and clamp the block's right edge to the axis end if `ended_at` spills past the visible hours.

## Phase 1: Scaffold, data & date math

### Overview

Stand up the route, the SSR data fetch, the date-math library, and the `TimelineApp` shell with working scale selection, bounded navigation, and an empty/sparse state — no grid rendering yet.

### Changes Required:

#### 1. Route + auth gating

**File**: `src/pages/timeline.astro` (new), `src/middleware.ts`

**Intent**: New protected page mirroring `dashboard.astro`: read `Astro.locals.user`, run a Supabase SSR query for the user's sessions, mount `<TimelineApp sessions={...} client:load />`. Add `"/timeline"` to `PROTECTED_ROUTES`.

**Contract**: SSR query extends `dashboard.astro:20-27`'s select string (same joined columns) but **drops `.limit(50)`** in favor of a wide bound (all of the user's sessions, or a generous `.gte("started_at", <~365d ago>)` — choose the simplest that returns a full navigable history at current scale). Passes a `SessionListItem[]` prop. `middleware.ts:4` array gains `"/timeline"`.

#### 2. Date-range math library

**File**: `src/lib/timeline/dateRange.ts` (new)

**Intent**: Hand-rolled day/week/month range computation, ISO week number + label, Monday-start weeks, prev/next/today navigation clamped to `[earliestSessionPeriod, currentPeriod]`, and adaptive axis tick generation.

**Contract**: Pure functions over `Date` + a `Scale = "day" | "week" | "month"` union. Key exports: range start/end for a scale+anchor; `isoWeek(date)` → `{ week: number, label: string }` (e.g. `"CW29"`); range label formatter per scale (Day full weekday+date, Week `"CW29 · Jul 13 – Jul 19, 2026"`, Month `"July 2026"`); `clampAnchor(anchor, scale, earliest, today)`; `axisTicks(hoursRange)` returning tick hours (every 3h when span > 12h else every 2h, always including endpoints). All computed in local time (callers pass already-localized `Date`s).

#### 3. TimelineApp shell + view state

**File**: `src/components/timeline/TimelineApp.tsx` (new)

**Intent**: Top-level stateful island. Holds scale (default `"week"`), anchor date, and (stubs for later phases) colorBy/hoursRange/filters/toggles/colors. Renders a `Card`-based toolbar with a scale `Select`, Prev/Next/Today `Button`s, and the range label. Buckets sessions by local start day; computes `earliest` from the session set. Shows empty/sparse state.

**Contract**: Props `{ sessions: SessionListItem[] }`. Uses the `LocalDateTime` hydration-gate technique for anything time-derived. Toolbar composed from existing `Select`/`Button`/`Card`. Delegates date math to `dateRange.ts`.

#### 4. Empty / sparse state

**File**: `src/components/timeline/TimelineEmptyState.tsx` (new)

**Intent**: Friendly message + CTA when the user has zero sessions; the grid itself (Phase 2) must also render acceptably when non-zero but sparse.

**Contract**: Rendered by `TimelineApp` when `sessions.length === 0`. Reuses `Card` + `Button` (link to `/` or capture flow).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- `dateRange.ts` unit tests pass (ISO week numbers across year boundaries, Monday-start weeks, DST-safe range math, nav clamping at both bounds, tick generation for 2h/3h spans): `npm test`

#### Manual Verification:

- `/timeline` redirects to sign-in when logged out; renders when logged in.
- Scale selector switches Day/Week/Month; range label matches spec format for each.
- Prev/Next/Today navigate correctly and clamp (can't go past the current period, can't go before the earliest session).
- With a browser TZ far from UTC, day labels and "today" are correct (no off-by-one, no hydration warning).
- Zero-session account shows the empty state, not a blank/broken page.

**Implementation Note**: After automated verification passes, pause for human confirmation of manual testing before Phase 2.

---

## Phase 2: Grid rendering & layout

### Overview

Render the actual timeline: hour-axis header, per-day swimlanes, and positioned session blocks with pomodoro dots and hover tooltips.

### Changes Required:

#### 1. Layout math library

**File**: `src/lib/timeline/layout.ts` (new)

**Intent**: Map a session's local start/end time onto the horizontal axis within the active `hoursRange`, returning left% + width%, with a minimum width so very short sessions stay visible, and right-edge clamping when a session spills past the visible hours.

**Contract**: Pure functions. `blockPosition(session, hoursRange)` → `{ left: number, width: number }` in percent. Handles `ended_at === null` (in-progress: derive an end from `started_at + duration_seconds`, else clamp to axis end). Enforces a min-width floor. Also exports pomodoro-dot count wiring: `tomatoCount` from `format.ts` buckets at **20 min/pip, floored, and returns 0 for durations < 20 min**, so `duration_seconds` (`number | null`) must be null-coalesced before the call, and the design's **<20-min single half-dot is custom logic** (not `tomatoCount`, which would yield 0 dots).

#### 2. Hour-axis header

**File**: `src/components/timeline/TimeAxisHeader.tsx` (new), Hours-range selectors in `Toolbar`

**Intent**: Render hour labels + faint vertical gridlines from `axisTicks(hoursRange)`; add the "Hours" start/end `Select` pair to the toolbar (default 6 AM–11 PM; start options 12 AM..hour-before-end, end options hour-after-start..11 PM, start < end).

**Contract**: Driven by `dateRange.axisTicks`. Hours range is `TimelineApp` state `{ start: number, end: number }`. Labels formatted via `Intl`/12h. Grid marks align to the same percent scale `layout.ts` uses.

#### 3. Day rows + session blocks

**File**: `src/components/timeline/DayRow.tsx` (new), `src/components/timeline/SessionBlock.tsx` (new)

**Intent**: One `DayRow` per visible day with a fixed ~76px left label column (weekday+date; compact single-line in Month) and a relative track holding absolutely-positioned `SessionBlock`s. Row heights: Day 120px, Week 60px, Month 22px. Today's row label is accent-highlighted (orange). Each `SessionBlock` positions via `layout.ts`, fills with the main-axis default color (topic by default), renders pomodoro dots (Day/Week only, width > 4%), and sets a native `title` tooltip (topic · format · time · focus · energy). Horizontal scroll wrapper (min-width ~820px).

**Contract**: `DayRow` props `{ date, sessions, scale, hoursRange, ... }`. `SessionBlock` props `{ session, position, scale, ... }`. Pomodoro dots: 9px round, dual box-shadow ring per spec, `left:5px/top:4px`, 3px gap; <20 min → single conic-gradient half dot over `rgba(0,0,0,0.35)`. Default per-category colors come from `color.ts` constants (introduced here as a static default map; live customization is Phase 4).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- `layout.ts` unit tests pass (left%/width% for known times, min-width floor, in-progress end derivation, right-edge clamp, dot counts for {10,25,50,90} min): `npm test`

#### Manual Verification:

- Blocks land at the visually correct x-position and width for their times against the axis labels.
- Row heights change per scale; today's row is highlighted.
- Pomodoro dots appear only in Day/Week and only on wide-enough blocks; <20-min sessions show a single half dot.
- Narrow screen scrolls horizontally; axis and rows stay aligned.
- Hover tooltip summarizes the session.

**Implementation Note**: Pause for human confirmation after automated verification before Phase 3.

---

## Phase 3: Filtering, ratings & detail dialog

### Overview

Add the legend with independent topic/format filtering, the Color-by switch with secondary-axis dots, focus/energy rating display (badges in Day/Week, opacity shading in Month), and the session detail dialog.

### Changes Required:

#### 1. Toggle primitive (Color-by switch only)

**File**: `src/components/ui/switch.tsx` (via `npx shadcn@latest add switch`)

**Intent**: Generate the shadcn `switch` wrapper for the Color-by (Topic/Format) control only. Zero new npm deps (Radix already transitively installed). **The "Show" group needs no primitive** — research found no in-repo precedent for state-driven `variant` swapping, and the design specifies plain toggle-buttons, so it is hand-rolled as three `Button variant={active ? "default" : "outline"}` (no `toggle-group`).

**Contract**: `switch.tsx` matches existing `components.json` (new-york, neutral, lucide). After install, delete `node_modules/.vite/` and restart dev if SSR hook errors appear (L-04). `button.tsx` already exposes `default` + `outline` variants used by the Show group.

#### 2. Legend + filtering

**File**: `src/components/timeline/Legend.tsx` (new)

**Intent**: Topic chips and Format chips, each a `Button variant="ghost"` + a color dot + label. Clicking a chip's label toggles that value; filtered-out chips dim (reduced opacity). A session renders only when both its topic and format are enabled (AND semantics). The color dot (Phase 4) opens the palette dialog.

**Contract**: `TimelineApp` owns `Set<topicId>` / `Set<formatId>` enabled sets (default all-on). `SessionBlock` visibility gates on both. Dot colors read from the color map (default in Phase 3, live in Phase 4).

#### 3. Color-by switch + secondary dots

**File**: `Toolbar` (Color-by control), `SessionBlock.tsx`

**Intent**: "Main color by" switch (Topic / Format, default Topic) drives the block fill; the *other* axis drives the pomodoro-dot color. Removes any top-stripe accent (blocks render no `border-top`).

**Contract**: `colorBy: "topic" | "format"` in `TimelineApp` state. Block fill = main-axis color; dots = other-axis color. Both read the same color map so Phase 4 customization flows through unchanged.

#### 4. "Show" toggle group (Focus / Energy / Dots)

**File**: `src/components/timeline/ShowToggles.tsx` (new), `SessionBlock.tsx`

**Intent**: A single button group of three toggles — **Focus, Energy, Dots** — matching toggle-button style, **no leading color dots on the labels**. Each button renders as the shadcn `Button` `default` variant when active, `outline` when inactive. Group label "Show" in Day/Week, "Shade by" in Month.
- **Dots** toggles the pomodoro secondary-color dots on blocks (the dots wired in Phase 2). The **Dots button is hidden entirely in Month** (dots never render there); Focus/Energy remain.
- **Day/Week ratings**: when Focus/Energy on and block wide enough (>4%), render focus `★N` bottom-left and energy `L/M/H` bottom-right; unrated focus → `★ n/a` dimmed + dashed block outline (only while Focus active).
- **Month**: single-channel opacity shading (only one of Focus/Energy shades at a time; activating one deactivates the other; entering Month with both on drops Energy; unrated-focus stays full brightness but still dashed when Focus active); no dots/badges in Month.

**Contract**: `TimelineApp` holds `{ focusOn: boolean, energyOn: boolean, dotsOn: boolean }` (dots default on). The Month mutual-exclusion rule (Focus/Energy) is enforced on scale change and on toggle; `dotsOn` is ignored in Month. `SessionBlock` gates dot rendering on `dotsOn && Day/Week && width>4%`. Focus scaled 1–5, energy 1–3 → opacity. `isRated` from `format.ts` distinguishes unrated. See §Toggle primitive note under Change #1 for whether this uses `ToggleGroup` or plain variant-swapping `Button`s.

#### 5. Session detail dialog

**File**: `src/components/timeline/SessionDetailDialog.tsx` (new)

**Intent**: Click a block → `Dialog` titled "Topic · Format" showing full date, time range, duration (min), Focus (filled `lucide` `Star`s `★★☆☆☆ 2 / 5` or "Not rated"), Energy (Low/Medium/High), and Notes.

**Contract**: Reuses `dialog.tsx` (as `EditSessionDialog.tsx` does). Star row built from `lucide-react` `Star` (filled/outline). `formatDuration`/`isRated` from `format.ts`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Existing tests still pass: `npm test`

#### Manual Verification:

- Toggling a topic or format chip filters blocks (AND across the two axes); dimmed chips read as off.
- Color-by switch swaps block fill vs. dot color axes.
- Day/Week: focus/energy badges show on wide blocks; unrated focus shows `★ n/a` + dashed outline only when Focus is on.
- Month: only one metric shades at a time; entering Month with both on drops Energy; unrated-focus stays full-bright + dashed.
- Clicking a block opens the correct detail dialog; hover tooltip still works.

**Implementation Note**: Pause for human confirmation after automated verification before Phase 4.

---

## Phase 4: Color customization (cuttable)

### Overview

Add the preset palette + HSV color wheel and persist custom per-category colors to `localStorage`, applied live everywhere. This phase is self-contained and may be deferred without affecting Phases 1-3.

### Changes Required:

#### 1. Color dependency + library

**File**: `@uiw/react-color` (add dep), `src/lib/timeline/color.ts` (new/extended)

**Intent**: Add `@uiw/react-color` for the wheel. Extend `color.ts` with the 17-preset palette constants (Orange..Amber, 6-col grid) and any hex/HSL derivation helpers used by badges/dots.

**Contract**: `color.ts` exports the preset list and default per-category color map (already referenced by Phases 2-3). Wheel uses `Wheel` + `ShadeSlider` + `hsvaToHex` from `@uiw/react-color`.

#### 2. Persistence hook

**File**: `src/lib/timeline/useTimelineColors.ts` (new)

**Intent**: Custom per-category colors persisted via the existing `collectionStore` pattern (versioned, SSR-safe, cross-tab, fail-open). Reads merge over `color.ts` defaults into a resolved lookup.

**Contract**: Built on `createCollectionStore` (`collectionStore.ts:17-22`). **`collectionStore` is array-shaped** (`readonly T[]`, validated with `Array.isArray` at `:33`), so store colors as `T = { categoryId: string; hex: string }` **entries**, not a bare `{[categoryId]: hex}` object (which would fail validation and read as empty). The hook returns a resolved `(categoryId) => hex` lookup (entries merged over defaults) + a setter. `TimelineApp` threads the lookup into blocks/dots/badges/legend (all already reading a color lookup from Phase 3).

#### 3. Palette + wheel dialogs

**File**: `src/components/timeline/ColorPaletteDialog.tsx` (new), `src/components/timeline/ColorWheelDialog.tsx` (new)

**Intent**: Palette dialog "Color · {name}" = 6-col grid of the 17 presets (click applies immediately, dialog stays open, active swatch outlined) + an 18th rainbow-conic cell with a ✎ pencil that opens the wheel sub-dialog. Wheel dialog = `Wheel` (hue/sat disc) + `ShadeSlider` (lightness) + live preview swatch + Done (applies + closes both). Legend color dots open the palette dialog.

**Contract**: Nested `Dialog`s. `Wheel color={hex}` (or hsva) + `onChange`, `ShadeSlider hsva onChange`, preview via `hsvaToHex`. On apply, call the `useTimelineColors` setter → live update everywhere. Orange `#ff5722` accent for active states.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- `color.ts` unit tests pass (preset integrity, hex/HSL derivations): `npm test`

#### Manual Verification:

- Clicking a legend dot opens the palette; picking a preset recolors blocks/dots/badges/legend live and keeps the dialog open.
- The rainbow cell opens the wheel; dragging the disc + lightness slider updates the preview; Done applies and closes.
- Custom colors survive a full page reload and appear in a second tab (cross-tab sync).
- Removing/clearing localStorage falls back to default colors without error.

**Implementation Note**: Pause for human confirmation after automated verification.

---

## Testing Strategy

### Unit Tests:

- `dateRange.ts` — ISO week numbers (incl. year-boundary weeks), Monday-start week ranges, day/week/month range endpoints, nav clamping at earliest + current bounds, adaptive tick generation (2h vs 3h, endpoints included).
- `layout.ts` — left%/width% for known times within a range, min-width floor, in-progress end derivation, right-edge clamp past visible hours, pomodoro-dot counts for {10, 25, 50, 90} min.
- `color.ts` — preset list integrity, hex/HSL derivation helpers.

### Integration / Manual Testing Steps:

1. Log out → hit `/timeline` → redirected to sign-in. Log in → renders.
2. Set browser TZ to e.g. UTC+12 and UTC-10; confirm "today" and day labels are correct in both.
3. Navigate Day/Week/Month to the current period and to the earliest session; confirm clamping.
4. Verify block positions against axis labels; toggle Hours range; confirm re-layout.
5. Filter chips (both axes), Color-by switch, focus/energy toggles in Day/Week and Month.
6. Open a detail dialog; hover a block.
7. Recolor a topic via preset and via wheel; reload; confirm persistence + cross-tab.
8. Zero-session and sparse accounts render cleanly.

## Performance Considerations

The wide-bounded SSR fetch returns more rows than any single view shows; acceptable at single-user scale. Block rendering is plain DOM absolute positioning — Month view (22px rows over many days) is the densest case; skip dots/badges there per spec keeps it light. No memoization micro-tuning (React Compiler is on).

## Migration Notes

None. No schema or API changes; colors are `localStorage`-only.

## References

- Related research: `context/changes/timeline-graph/research.md`
- Design spec: `context/changes/timeline-graph/change.md`
- SSR + island precedent: `src/pages/dashboard.astro:20-27,54,57`
- Timezone hydration gate: `src/components/dashboard/LocalDateTime.tsx:8-15,29-44`
- localStorage store: `src/lib/local/collectionStore.ts:17-22,28-38,50-54,56-78`
- Session helpers: `src/lib/session/format.ts:1-24`
- Auth gating: `src/middleware.ts:4`
- Color-wheel lib: `@uiw/react-color` (`Wheel`, `ShadeSlider`, `hsvaToHex`)
- Lessons: L-04 (Vite cache after shadcn add), L-08 (type-check gate must run `astro check`/`tsc`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Scaffold, data & date math

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — 4001270
- [x] 1.2 Linting passes: `npm run lint` — 4001270
- [x] 1.3 Build passes: `npm run build` — 4001270
- [x] 1.4 `dateRange.ts` unit tests pass: `npm test` — 4001270

#### Manual

- [x] 1.5 `/timeline` gated by auth (redirect logged out, render logged in) — 4001270
- [x] 1.6 Scale selector + range label correct per scale — 4001270
- [x] 1.7 Prev/Next/Today navigate and clamp at both bounds — 4001270
- [x] 1.8 Timezone-correct day labels + "today" (no off-by-one / hydration warning) — 4001270
- [x] 1.9 Zero-session account shows empty state — 4001270

### Phase 2: Grid rendering & layout

#### Automated

- [x] 2.1 Type checking passes: `npx astro check`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Build passes: `npm run build`
- [x] 2.4 `layout.ts` unit tests pass: `npm test`

#### Manual

- [ ] 2.5 Blocks positioned/sized correctly against axis
- [ ] 2.6 Row heights per scale; today's row highlighted
- [ ] 2.7 Pomodoro dots only Day/Week + wide blocks; <20-min half dot
- [ ] 2.8 Horizontal scroll keeps axis/rows aligned
- [ ] 2.9 Hover tooltip summarizes session

### Phase 3: Filtering, ratings & detail dialog

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Build passes: `npm run build`
- [ ] 3.4 Existing tests still pass: `npm test`

#### Manual

- [ ] 3.5 Topic/format chip filtering with AND semantics; dim = off
- [ ] 3.6 Color-by switch swaps fill vs. dot axes
- [ ] 3.7 "Show" group: Focus/Energy/Dots buttons render default-when-active / outline-when-inactive, no leading color dots
- [ ] 3.8 Dots toggle shows/hides block dots; Dots button hidden in Month
- [ ] 3.9 Day/Week focus/energy badges + unrated ★ n/a dashed outline
- [ ] 3.10 Month single-channel shading + both-on-drops-Energy + unrated full-bright
- [ ] 3.11 Detail dialog opens with correct content

### Phase 4: Color customization (cuttable)

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Build passes: `npm run build`
- [ ] 4.4 `color.ts` unit tests pass: `npm test`

#### Manual

- [ ] 4.5 Legend dot → palette; preset applies live, dialog stays open
- [ ] 4.6 Rainbow cell → wheel; disc + lightness update preview; Done applies/closes
- [ ] 4.7 Custom colors survive reload + sync cross-tab
- [ ] 4.8 Cleared localStorage falls back to defaults without error
