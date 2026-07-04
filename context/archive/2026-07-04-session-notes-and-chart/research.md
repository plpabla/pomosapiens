---
date: 2026-07-04T17:27:48+02:00
researcher: Claude Sonnet 5
git_commit: dc23870
branch: session-notes-and-chart
repository: pomosapiens
topic: "Best charting library for the S-04 focus-rating chart"
tags: [research, codebase, charting, recharts, visx, chartjs, S-04, session-notes-and-chart]
status: complete
last_updated: 2026-07-04
last_updated_by: Claude Sonnet 5
---

# Research: Best charting library for the S-04 focus-rating chart

**Date**: 2026-07-04T17:27:48+02:00
**Researcher**: Claude Sonnet 5
**Git Commit**: dc23870
**Branch**: session-notes-and-chart
**Repository**: pomosapiens

## Research Question

What is the best library to use for the focus-rating-over-time chart (roadmap slice S-04, FR-016)? Roadmap named four candidates and left the choice to the implementer at plan time: Recharts, visx, a Chart.js wrapper (`react-chartjs-2`), or hand-rolled SVG.

Scope agreed with the user before researching: compare only these four named candidates (not a broader library survey), and weigh **feature richness & polish** as the heaviest factor — this is a "one chart, not a dashboard" requirement (FR-016, must-have) on a solo-dev, 3-week MVP timeline.

## Summary

**Recommendation: Recharts.** It is the only one of the four that delivers built-in polish (tooltip, legend, responsive behavior, animation) *and* built-in accessibility (`accessibilityLayer`, on by default since v3.0 — ARIA role, keyboard nav, live-region tooltip) for ~15-20 lines of code. It has native React 19 peer-dep support (no `overrides` hack) and its `stroke`/`fill` props accept the project's existing `--chart-1..5` CSS custom properties out of the box (already scaffolded, unused, in `src/styles/global.css`).

The cost is a heavier dependency (~145 KB gzip, driven by hard `redux`/`immer`/`victory-vendor` deps baked into the architecture — not tree-shakeable) and one deviation from the project's current convention: every existing React island uses `client:load`, but Recharts' `ResponsiveContainer` needs real browser layout (`ResizeObserver`), so this island should use `client:only="react"` instead.

Chart.js (`react-chartjs-2`) is the runner-up on polish (equally fully-featured, smaller effective bundle when tree-shaken to ~30-45 KB gzip) but loses on the priority factor that matters most here: canvas output has **no built-in accessibility** at all (no DOM nodes for a screen reader to read), which cuts against the project's `eslint-plugin-jsx-a11y` posture, and canvas can't consume the theme's CSS variables directly (colors must be resolved to computed hex/rgb in JS on every theme toggle).

visx and hand-rolled SVG are both SSR-clean and low-level, but neither offers any built-in tooltip/legend/animation/accessibility — all of that has to be hand-built (visx: ~100-150 LOC realistic estimate; hand-rolled SVG is the same order of effort minus visx's scale/axis helpers). Given the user's explicit priority on richness/polish over minimalism, these are the weakest fits, not the strongest — even though they're the "safest" choices if bundle size or SSR purity had been the priority instead.

## Detailed Findings

### Recharts

- Current version 3.9.x; `peerDependencies` already declare `"react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"` — no `overrides` needed for React 19.
- SSR: has an internal `Global.isSsr` guard so it won't crash server-side, but `ResponsiveContainer` can't resolve pixel dimensions on the server (long-standing open issue). Practical fix for an Astro island: `client:only="react"`, or a fixed-size container instead of `ResponsiveContainer`.
- Bundle: ~554 KB min / ~145 KB gzip (Bundlephobia, v3.9.1) — heavier than the "simple chart" use case suggests because `redux`, `@reduxjs/toolkit`, `immer`, `react-redux`, and `victory-vendor` are hard dependencies baked into the architecture, not optional/tree-shaken.
- Accessibility: `accessibilityLayer` on by default since v3.0 — `role="application"`, `tabIndex={0}`, arrow-key navigation between points, and an ARIA live-region tooltip. Materially ahead of the other three options.
- Code/nulls/theming: ~15-20 lines for `ResponsiveContainer > LineChart > CartesianGrid, XAxis, YAxis, Tooltip, Line`. Skipped ratings (`focus_rating: null`) create gaps automatically via `connectNulls={false}` (the default) — no manual data-splitting. `stroke`/`fill` accept any CSS value, confirmed to work with `var(--token)`.
- Polish: built-in animated tooltips, active-dot highlighting, legend, and animation (auto-disabled under SSR) — the library's main selling point.
- Gotcha: SSR + `ResponsiveContainer` (above) is the only real one; React 19 support has no open blockers in 3.x.

### visx

- All `@visx/*` packages are at v4.0.0 (monorepo lockstep). `@visx/shape`/`scale`/`axis` peer deps: `react`/`react-dom` `^18.0.0 || ^19.0.0` — no overrides needed. `@visx/xychart` additionally requires a hard peer on `@react-spring/web` even if animation is unused.
- SSR: primitives render plain SVG with no canvas/window access — SSR-clean, `client:load` would work fine (unlike Recharts/Chart.js).
- Bundle: building by hand from `@visx/shape` + `@visx/scale` + `@visx/axis` (+ shared `@visx/group`/`@visx/vendor`) is ~35-45 KB gzip combined. The higher-level `@visx/xychart` package alone is ~50 KB gzip and bundles axis/grid/tooltip/voronoi/react-spring — heavier than needed for one chart, and still not as fully finished as Recharts.
- Accessibility: zero out of the box. An `@visx/a11y` package is referenced in visx's own `MIGRATION.md` as "4.1 (coming soon)" but doesn't exist on npm yet — 100% manual today.
- Code/nulls/theming: realistic estimate ~100-150 LOC for axes + line + scatter dots + gap handling (`LinePath`'s `defined` accessor, same pattern as d3's `line.defined()`) + a basic tooltip, vs. ~20-30 for the Recharts equivalent. Theming via CSS vars works fine (plain SVG `stroke`/`fill`).
- Polish: none out of the box in the primitives — no free tooltip, responsive container, legend, or animation; `xychart` assembles these but still requires wiring.
- Gotcha: none Astro/Vite-specific beyond the react-spring peer weight on `xychart`.

### Chart.js + react-chartjs-2

- `chart.js@4.5.1` / `react-chartjs-2@5.3.1`; react-chartjs-2's peer deps already include `"react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"` — no overrides needed, added specifically in response to a React 19 compat issue.
- SSR: draws exclusively via the Canvas 2D API, which doesn't exist in a server-rendered DOM (Cloudflare Workers included) — `<Line>`/`<Scatter>` will throw or render nothing under SSR. Requires `client:only="react"`, not `client:load`/`client:visible` (both still do a first SSR pass).
- Bundle: full auto-registered `chart.js` is ~200 KB min / ~68 KB gzip (incl. `@kurkle/color`); registering only what a line/scatter time-series chart needs (`LineController`/`ScatterController`, `LineElement`, `PointElement`, `TimeScale`/`LinearScale`, `Tooltip`, `Legend`) brings this down to an estimated ~30-45 KB gzip. Both packages ship `sideEffects: false`.
- Accessibility: canvas content is invisible to screen readers by default — confirmed no built-in data-table fallback or ARIA live-region. Chart.js's own docs only recommend manually adding `role="img"`/`aria-label` to the `<canvas>`. Given the project's `jsx-a11y` linting, this is the weakest of the four on the very axis the codebase already cares about.
- Code/nulls/theming: ~30-50 lines for registration + `TimeScale` + line + gap handling. Nulls create gaps automatically (`spanGaps: false`, the default). Theming is the main friction: canvas can't read CSS variables at draw time — colors must be resolved via `getComputedStyle(...).getPropertyValue('--chart-1')` in JS and the chart re-rendered/updated on theme toggle, unlike the SVG-based options where `var(--chart-1)` just works as a prop value.
- Polish: fully-featured out of the box — animations, `ResizeObserver`-based responsive resizing, interactive tooltips, legends, time-scale formatting.
- Gotcha: same canvas/SSR constraint as above; must never import `chart.js` in `.astro` frontmatter/server code paths.

### Hand-rolled SVG

Not researched via Context7 (no library to look up) but assessed against the same codebase constraints as visx, which shares its rendering model:

- SSR-clean by construction (plain SVG), any hydration directive works.
- Zero bundle cost beyond whatever date/scale math is written by hand (no `d3-scale`/`d3-shape` dependency needed for a single linear time axis with ~1-5 rating values, though most implementations end up pulling in at least `d3-scale` for tick generation, converging toward visx's footprint).
- Same order of effort as visx (~100+ LOC) for axes, gridlines, gap-safe path generation, tooltip, and all accessibility — but without even visx's scale/axis helper components, so realistically more code for the same result, not less.
- Weakest fit given "feature richness & polish" is the stated priority — this option only wins if the priority were minimal dependencies/SSR purity instead.

### Codebase integration context

- `src/pages/dashboard.astro:10-18,36-49,92,108-166` renders history as a plain server-side Astro `<ul>` from a Supabase query typed via `Database["public"]["Tables"]["sessions"]["Row"]` — no React island today. A chart would be a new island inserted between the "History" heading (`:92`) and the list (`:108`).
- Every existing hydrated React component in this repo uses `client:load` — `src/pages/topics/index.astro:8`, `src/pages/presets.astro:8`, `src/pages/session/[id].astro:57`, `src/pages/session/new.astro:8`, `src/pages/formats/index.astro:8`, `src/pages/auth/signin.astro:16`, `src/pages/auth/signup.astro:16`. No `client:visible`/`client:only` precedent exists yet — either Recharts or Chart.js would be the first component in the codebase to need `client:only`.
- `src/db/database.types.ts:69-137` — `sessions.focus_rating: number | null` (`:75`, nullable, 1-5 by UI convention, no DB-level scale constraint), `started_at: string` (non-null), `ended_at: string | null`. A chart query needs `ended_at IS NOT NULL AND focus_rating IS NOT NULL`, ordered by `started_at`.
- `src/styles/global.css:40-44,74-78,112-116` already defines shadcn-style chart tokens `--chart-1` through `--chart-5` in OKLCH for both `:root` and `.dark`, exposed as Tailwind utilities `--color-chart-1..5` — scaffolded by the starter, currently unused anywhere in `src/`. Any SVG-based library (Recharts, visx, hand-rolled) can consume these directly as `stroke="var(--color-chart-1)"`; Chart.js cannot use them directly and must resolve them to computed values in JS.
- `context/foundation/color_palette.md` documents a separate hex-based, dark-only palette ("Focus Fuels Greatness") that is not reconciled with the OKLCH `--chart-*` tokens — worth flagging at plan time regardless of which library is chosen.
- No existing chart/graph/canvas/d3/recharts/visx/chart.js code anywhere in `src/` — this is a fully greenfield decision.
- `package.json:80-82` has one existing override (`vite: ^7.3.2`); none of the three libraries need a similar React-19 override since all three already declare `^19.0.0` peer support.

## Code References

- `src/pages/dashboard.astro:10-18` - sessions typed via `Database["public"]["Tables"]["sessions"]["Row"]`
- `src/pages/dashboard.astro:36-49` - Supabase session history query (frontmatter, server-side)
- `src/pages/dashboard.astro:92,108-166` - "History" heading and session `<ul>` — likely insertion point for the chart island
- `src/db/database.types.ts:69-137` - `sessions` table shape (`focus_rating`, `started_at`, `ended_at`, `duration_seconds`, `energy_level`)
- `src/styles/global.css:40-44,74-78,112-116` - pre-existing, unused `--chart-1..5` OKLCH tokens (`:root` and `.dark`)
- `context/foundation/color_palette.md` - separate hex-based dark-only palette, not reconciled with the OKLCH chart tokens
- `package.json:25-91` - dependencies, React 19.2.6, `overrides: { vite: "^7.3.2" }`
- `context/foundation/roadmap.md:124-134` - S-04 slice definition, the open chart-library question, and its "lowest-risk slice" framing
- `context/changes/session-notes-and-chart/change.md` - change identity stub (FR-014, FR-016; prerequisite S-01)

## Architecture Insights

- The project's React-island convention is uniformly `client:load`; this is the first feature where the chosen library's SSR limitations (Recharts' `ResponsiveContainer`, Chart.js's canvas) force a deviation to `client:only="react"`. This should be called out explicitly at plan time as a deliberate, scoped exception, not a silent drift from convention — worth a one-line note near the component, though not necessarily a new `lessons.md` entry unless it causes a real incident later.
- The starter already scaffolded shadcn-style `--chart-1..5` OKLCH tokens that no code consumes yet (`src/styles/global.css`). Picking an SVG-based library (Recharts or visx) lets the chart pick these up "for free" via `var(--color-chart-1)`, which a Canvas-based library (Chart.js) cannot do without a `getComputedStyle` resolution step repeated on every theme change.
- `eslint-plugin-jsx-a11y` is part of this repo's lint gate. A canvas-rendered chart (Chart.js) is structurally invisible to that lint category's intent (no DOM to check) and to actual screen readers, whereas the two SVG-based options can expose real, checkable DOM/ARIA structure — this is a substantive, not just stylistic, reason the "polish" priority favors Recharts' built-in `accessibilityLayer` over Chart.js's fully-manual approach.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md:133` — the chart-library question was deliberately left open at roadmap time ("Owner: implementer (decided at `/10x-plan` time). Block: no"), confirming this research is exactly the intended point in the workflow to resolve it.
- `context/foundation/roadmap.md:134` — S-04 is flagged as "the lowest-risk slice" and the one to thin or Park first if the calendar tightens (FR-014, the free-text note, is the only nice-to-have FR in v1) — the chart itself (FR-016) is must-have and not up for descoping.
- No prior `context/archive/**/` research or plan touches charting; this is the first exploration of the topic.

## Related Research

None yet — this is the first research artifact for `session-notes-and-chart`.

## Open Questions

- Whether to reconcile the hex-based `color_palette.md` palette with the OKLCH `--chart-1..5` tokens before or during this slice, or defer — affects which color source the chosen library's `Line`/`stroke` props should reference.
- Whether the chart should read from the same Supabase query already powering the history list (`dashboard.astro:36-49`) or a dedicated query/view — a plan-time decision, not resolved here.
- Exact Recharts bundle-size cost in the actual Cloudflare Worker output (client-side JS payload) wasn't measured directly in this project — only Bundlephobia's generic figure. Worth a quick real build-size check at implementation time if bundle budget becomes a concern.
