# Chart Tooltip Context Implementation Plan

## Overview

The focus-rating chart on the dashboard currently shows only the bare `focus_rating` number in its tooltip (Recharts' default). This change replaces that default tooltip with a custom renderer that reproduces the imported Claude Design mockup (`FocusRatingChart tooltip enhancement`): a date + rating header, an energy-level pill, a duration + 🍅 line, and topic/material-format badges. The chart stays on Recharts; only the tooltip content and the data threaded into the chart change.

## Current State Analysis

- [`FocusRatingChart.tsx`](../../../src/components/dashboard/FocusRatingChart.tsx) takes a **narrowed** prop `sessions: { started_at: string; focus_rating: number }[]` and renders a Recharts `<LineChart>` with the default `<Tooltip>` (styled via `contentStyle`/`labelStyle`/`itemStyle`). The default tooltip shows the date label and the `focus_rating` series value only.
- [`dashboard.astro:35-38`](../../../src/pages/dashboard.astro#L35-L38) narrows the query result before passing it in: `sessions.filter(isRated).map((s) => ({ started_at: s.started_at, focus_rating: s.focus_rating })).reverse()`. The `.map()` throws away every field the new tooltip needs.
- The Supabase query at [`dashboard.astro:23`](../../../src/pages/dashboard.astro#L23) already selects `duration_seconds, energy_level, topic:topics(name), material_format:material_formats(name)` — all fields the tooltip needs are already fetched.
- [`SessionListItem`](../../../src/lib/types.ts#L27-L42) already carries `duration_seconds`, `energy_level`, `topic`, and `material_format`. `isRated` narrows `focus_rating` to non-null.
- All rendering primitives already exist:
  - [`tomatoCount(durationSeconds)`](../../../src/lib/session/format.ts#L1-L3) — floor(seconds / 1200).
  - [`formatDuration(seconds)`](../../../src/lib/session/format.ts#L5-L8) — `"N min."`.
  - [`EnergyPill`](../../../src/components/session/EnergyPill.tsx) — colored uppercase pill; its `bg-spark/15 text-spark` / `bg-blaze/15 text-blaze` / `bg-ash/15 text-ash` classes are the exact tokens the design mock reproduced inline.
  - [`SessionTags`](../../../src/components/session/SessionTags.tsx) — renders topic/material badges (`bg-charred`, truncate `max-w-[10rem]`) and returns `null` when both are absent.
- [`FocusRatingChart.test.tsx`](../../../tests/unit/dashboard/FocusRatingChart.test.tsx) has 3 tests that build sessions with only `{ started_at, focus_rating }`; widening the prop type will require updating these fixtures.

## Desired End State

Hovering a point on the focus-rating chart shows a tooltip card containing, top to bottom:

1. **Header row** (space-between): the session date (`formatTick`, e.g. `Jul 02`) on the left, the focus rating as `4 / 5` on the right.
2. **Energy + tomatoes row**: the `<EnergyPill>` for the session's energy level, followed by `40 min. 🍅🍅` (formatted duration + one 🍅 per `tomatoCount`).
3. **Badges row** (only when the session has a topic and/or material format): `<SessionTags>` badges. Omitted entirely when both are absent.

Verify by running the dashboard, hovering chart points, and confirming a session with topic+format shows all three rows and a session with neither omits the badge row.

### Key Discoveries:

- The Recharts custom-tooltip contract: `<Tooltip content={<CustomTooltip />} />` receives `{ active, payload }`; the full data row for the hovered point is `payload[0].payload`. Passing whole session objects as the chart's `data` (instead of the narrowed shape) makes every field available with no side lookup. See Recharts `Tooltip` `content` render-prop.
- `<Line dataKey="focus_rating" />` continues to work unchanged when the data rows are full session objects — Recharts reads only the `dataKey` for the line.
- Reusing `<EnergyPill>` and `<SessionTags>` inside the tooltip keeps a single source of truth for those visuals; both are plain presentational React components with no client-only concerns.

## What We're NOT Doing

- Not changing the Supabase query, schema, API routes, or any server code — all needed fields are already fetched.
- Not replacing Recharts or hand-rolling an SVG chart (the design mock's SVG is only a Claude Design rendering artifact).
- Not adding an e2e hover test or extracting the tooltip renderer purely for unit testing — Recharts renders the tooltip only on hover, which jsdom does not drive reliably. Automated coverage stays at the prop/render level.
- Not adding a "no topic/format" placeholder — the badge row is omitted when both are absent (via `<SessionTags>`'s existing `null` return).
- Not touching the empty-state (`< 2` rated sessions) behavior.

## Implementation Approach

Single phase. Widen the chart's prop type to a session subset carrying the fields the tooltip needs, stop narrowing in `dashboard.astro`, add a `CustomTooltip` component inside `FocusRatingChart.tsx` that reads the hovered session off the Recharts payload and composes the three rows from reused components, wire it via `<Tooltip content={...} />`, then update the existing test fixtures to the widened shape. Finally, update the roadmap S-13 outcome text so it reflects that the tooltip also shows the energy pill and duration.

## Phase 1: Custom tooltip with session context

### Overview

Thread full session data into the chart and replace the default Recharts tooltip with the custom card from the imported design.

### Changes Required:

#### 1. Widen the chart prop type

**File**: `src/components/dashboard/FocusRatingChart.tsx`

**Intent**: The chart must receive the extra fields the tooltip renders. Widen `FocusRatingChartProps.sessions` from `{ started_at, focus_rating }` to the subset of `SessionListItem` the tooltip needs.

**Contract**: `sessions: Pick<SessionListItem, "started_at" | "focus_rating" | "duration_seconds" | "energy_level" | "topic" | "material_format">[]` (import `SessionListItem` from `@/lib/types`). `focus_rating` is non-null here because the dashboard only passes `isRated` sessions. The existing empty-state check (`sessions.length < 2`) and `<LineChart data={sessions}>` / `<Line dataKey="focus_rating">` are unchanged.

#### 2. Add the custom tooltip renderer

**File**: `src/components/dashboard/FocusRatingChart.tsx`

**Intent**: Render the design's three-row card. Add a `CustomTooltip` component (same file) that Recharts calls with the hovered payload, and pass it via `<Tooltip content={<CustomTooltip />} />` replacing the current default `<Tooltip>` and its `contentStyle`/`labelStyle`/`itemStyle` props.

**Contract**: `CustomTooltip({ active, payload }: TooltipProps)` returns `null` unless `active && payload?.length`. Reads the session via `payload[0].payload`. Composes:
- Header: `formatTick(session.started_at)` and `` `${session.focus_rating} / 5` ``.
- Row 2: `<EnergyPill energyLevel={session.energy_level} />` + `` `${formatDuration(session.duration_seconds)} ${tomatoDisplay}`.trim() ``, where `tomatoDisplay` is `"🍅".repeat(tomatoCount(...))` capped at 4 tomatoes plus a trailing `…` when the count is 5 or more (amendment, see `change.md`).
- Row 3: `<SessionTags session={session} />` (returns `null` when no topic/format, so no extra guard needed).

Card styling reuses the design's tokens (`bg-card`, `border-charred`, `rounded`, shadow, `min-w-[140px]`). Import `EnergyPill`, `SessionTags`, `formatDuration`, `tomatoCount`. Type the props with Recharts' tooltip prop type (or a minimal local interface reading `payload[0].payload` as the session subset) to satisfy `strictTypeChecked`.

#### 3. Stop narrowing session data in the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Pass the full rated-session objects (not the 2-field projection) so the chart can render the tooltip.

**Contract**: Replace `ratedSessions` derivation with `sessions.filter(isRated).reverse()` — drop the `.map(...)` projection. The value passed to `<FocusRatingChart sessions={ratedSessions} />` now matches the widened prop type. `isRated` already narrows `focus_rating` to non-null.

#### 4. Update chart test fixtures

**File**: `tests/unit/dashboard/FocusRatingChart.test.tsx`

**Intent**: The existing fixtures use the old 2-field shape and will no longer typecheck against the widened prop. Extend them to the new shape; keep the same three assertions (empty state at 0 and 1 sessions, chart renders at 2+).

**Contract**: Each fixture session gains `duration_seconds`, `energy_level`, `topic`, and `material_format` (mix of present/null across fixtures so the widened shape is exercised). Assertions unchanged.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Unit tests pass: `npx vitest run tests/unit/dashboard/FocusRatingChart.test.tsx`
- Full unit suite passes: `npx vitest run`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Hovering a chart point shows the date + `N / 5` header, the energy pill, and the `N min. 🍅…` line.
- A session with topic and/or material format shows the badge row; a session with neither omits it.
- Tooltip colors/readability are correct in the app's dark theme (card background, foreground text, badge contrast).
- No regression in the empty-state message for fewer than 2 rated sessions.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that hover behavior and styling look right before considering the change done.

---

## Testing Strategy

### Unit Tests:

- Existing `FocusRatingChart.test.tsx` assertions (empty state, chart render) kept, fixtures widened to the new prop shape.
- No new unit test for tooltip content: Recharts renders the tooltip only on hover, which jsdom does not drive reliably (decision confirmed during planning).

### Manual Testing Steps:

1. Sign in, open `/dashboard` with at least 2 rated sessions.
2. Hover each point; confirm the three-row layout and correct per-session values.
3. Confirm a session with no topic and no format omits the badge row.
4. Confirm dark-theme readability of the card and badges.

## References

- Imported design: Claude Design project `FocusRatingChart tooltip enhancement` (`d82dc74f-bf99-4df8-a04a-39380afc6d54`), file `FocusRatingChart.dc.html`.
- Roadmap slice: `context/foundation/roadmap.md` S-13 (`chart-tooltip-context`).
- Reused components: `src/components/session/EnergyPill.tsx`, `src/components/session/SessionTags.tsx`; helpers `src/lib/session/format.ts`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Custom tooltip with session context

#### Automated

- [x] 1.1 Type checking passes: `npm run lint` — f8a8b91
- [x] 1.2 Chart unit test passes: `npx vitest run tests/unit/dashboard/FocusRatingChart.test.tsx` — f8a8b91
- [x] 1.3 Full unit suite passes: `npx vitest run` — f8a8b91
- [x] 1.4 Production build succeeds: `npm run build` — f8a8b91

#### Manual

- [x] 1.5 Tooltip shows date + rating header, energy pill, and duration/🍅 line on hover — f8a8b91
- [x] 1.6 Badge row shows when topic/format present, omitted when both absent — f8a8b91
- [x] 1.7 Dark-theme readability of card and badges is correct — f8a8b91
- [x] 1.8 No regression in the empty-state message for fewer than 2 rated sessions — f8a8b91
