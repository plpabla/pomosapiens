# Chart Tooltip Context — Plan Brief

> Full plan: `context/changes/chart-tooltip-context/plan.md`

## What & Why

The focus-rating chart's tooltip shows only the bare `focus_rating` number — data the user can already read off the axis. This change replaces it with a custom tooltip that surfaces meaningful per-session context (energy level, duration + 🍅 count, topic/format), following an imported Claude Design mockup.

## Starting Point

`FocusRatingChart` uses Recharts' default `<Tooltip>` and receives a narrowed `{ started_at, focus_rating }` projection built in `dashboard.astro`. All richer fields (`duration_seconds`, `energy_level`, `topic`, `material_format`) are already fetched by the dashboard query and already exist on `SessionListItem` — they're just thrown away by a `.map()` before reaching the chart.

## Desired End State

Hovering a chart point shows a card with three rows: a date + `N / 5` rating header, an energy pill next to a `40 min. 🍅🍅` duration/tomato line, and topic/material-format badges (omitted when the session has neither). Chart stays on Recharts.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Empty topic/format | Omit the badge row | Reuses `<SessionTags>`'s existing `null` return; no special-casing | Plan |
| 🍅 display | `40 min. 🍅🍅` (duration + repeated emoji) | Matches imported design | Design |
| Badges | Reuse `<SessionTags>` | Single source of truth, free null-handling | Plan |
| Energy pill | Reuse `<EnergyPill>` | Design's inline colors are exactly EnergyPill's `bg-*/15 text-*` tokens | Design |
| Data threading | Pass full session objects as chart data | Standard Recharts pattern; tooltip reads `payload[0].payload` | Plan |
| Scope | Build the full imported design (adds energy pill + duration beyond roadmap S-13 text) | User authored the design and asked to import it | Design |
| Testing | Widen existing fixtures, keep assertions | jsdom can't drive Recharts hover; tooltip content isn't reliably unit-testable | Plan |

## Scope

**In scope:** Widen `FocusRatingChart` prop; drop the `.map()` narrowing in `dashboard.astro`; add a custom Recharts tooltip reusing `EnergyPill` + `SessionTags` + `formatDuration`/`tomatoCount`; update chart test fixtures; update roadmap S-13 outcome text.

**Out of scope:** Query/schema/API changes; replacing Recharts; e2e hover test; "no topic" placeholder; empty-state behavior.

## Architecture / Approach

Frontend-only, single component. Full rated-session objects flow from `dashboard.astro` → `FocusRatingChart` (`<LineChart data={sessions}>`). A `CustomTooltip` reads the hovered session off `payload[0].payload` and composes three rows from existing presentational components. No new data plumbing.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Custom tooltip with session context | Widened prop + dashboard threading + custom tooltip + updated fixtures | Recharts tooltip prop typing under `strictTypeChecked`; tooltip contrast in dark theme |

**Prerequisites:** S-04 (the chart and its tooltip already exist).
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- Typing the Recharts `content` render prop against `strictTypeChecked` lint may need a minimal local prop interface rather than Recharts' generic `TooltipProps`.
- Tooltip content is not covered by automated tests (jsdom can't drive Recharts hover); relies on manual hover verification.
- The imported design widens S-13's documented outcome (adds energy pill + duration) — the roadmap S-13 outcome text is updated to match as part of this change.

## Success Criteria (Summary)

- Hovering a point shows date, rating, energy pill, duration/🍅, and (when present) topic/format badges.
- Sessions with no topic/format omit the badge row cleanly.
- `npm run lint`, `npx vitest run`, and `npm run build` all pass.
