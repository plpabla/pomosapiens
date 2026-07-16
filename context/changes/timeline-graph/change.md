---
change_id: timeline-graph
title: Timeline graph of sessions with topic/format coloring and time-scale selection
status: implementing
created: 2026-07-16
updated: 2026-07-16
archived_at: null
---

## Notes

S-14 from @context/foundation/roadmap.md

Detailed design: use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/c7a42c1a-1314-493d-9fa3-fcba8df8462e?file=Focus+Timeline+Dashboard.dc.html

Requirements below were extracted from the imported design file `Focus Timeline Dashboard.dc.html`.

### Page layout & structure

- Standalone single-page dashboard: "Focus Timeline" heading + subtitle "Session history across topics and formats".
- Centered content, max width 1440px, dark PomoSapiens theme, generous padding.
- Four stacked sections, each a `Card`:
  1. **Toolbar** — scale selector, date navigation, "Color by" switch, visible-hours range selector, "Show" toggle group (Focus / Energy / Dots).
  2. **Legend** — Topic chips and Format chips (with per-chip color dots).
  3. **Timeline** — hour axis header + one swimlane row per day; horizontally scrollable (min-width ~820px) on narrow screens.
  4. **Dialogs** (overlay) — session detail, color palette, color wheel.

### Sample data (generated)

- Realistic generated sample data, produced by a **deterministic seeded RNG** (fixed seed → stable layout across renders). No backend; data lives in component state.
- Date span: ~75 days in the past to ~40 days in the future relative to today.
- Per-day session count: weekdays 1–3 sessions, weekends 0–1.
- Sessions laid out sequentially through the day starting ~8–10 AM, with 0.5–2h gaps; a session is dropped if it would end after 10 PM.
- Duration drawn from {25, 30, 45, 50, 60, 90} minutes.
- Each session carries: topic, format, start/end time, duration, focus (nullable, see Ratings), energy, and a topic-specific note (from a per-topic notes bank).

### Time axis & swimlanes

- Horizontal time-of-day axis with a **configurable visible-hours range** (start / end), chosen via a "Hours" pair of selectors in the toolbar; **default 6 AM–11 PM** (domain 6:00–23:00). Start options span 12 AM up to the hour before the current end; end options span the hour after the current start up to 11 PM (start must stay below end).
- Axis header labels and faint vertical grid lines adapt to the range span: marks every **3 hours when the span is wider than 12 h, otherwise every 2 hours**, always including the range endpoints (e.g. at the 6 AM–11 PM default: 6 AM, 9 AM, 12 PM, 3 PM, 6 PM, 9 PM, 11 PM).
- Left label column (fixed ~76px): day-of-week + date. In week/day it stacks weekday over date; in month it renders compact (narrow weekday initial + date on one line).
- One row per day. Row height varies by scale: **Day 120px, Week 60px, Month 22px**.
- The row for **today** is accent-highlighted (orange) in the label column.
- Each session is an absolutely-positioned block; horizontal position and width map its start/end time onto the axis (with a small minimum width so very short sessions stay visible).

### Two independent categorical axes

- **Topic**: Project A, Math, Physics, Python (4). **Format**: Video, Reading, Programming (3). Each has a default color.
- Filter each axis independently via legend chips: clicking a chip's **label** toggles that value on/off; filtered-out chips dim (reduced opacity). A session shows only when both its topic and its format are enabled.
- **"Main color by" switch** (Topic / Format, default **Topic**): the chosen axis drives the block's fill color; the other axis is shown via pomodoro dots (see below).

### Secondary highlight (pomodoro dots)

- Each session block shows pomodoro-pip dots representing its duration, absolutely positioned top-left of the block (`left: 5px, top: 4px`, 3px gap between dots).
- Duration mapping: sessions **≥ 20 min** → `floor(duration / 20)` full dots, one per completed 20-min slot, no partial remainder. Sessions **< 20 min** → a single dot, half-filled via a conic-gradient pie at 180° over a dim base (`rgba(0,0,0,0.35)`), so they never read as a full pomodoro.
- Color = secondary axis: dots use whichever axis is **not** the "Main color by" selection — block fill = main axis color, dots = the other axis's color (format dots when main is Topic, topic dots when main is Format).
- Dots inherit live custom colors from the palette/color-wheel, same as blocks.
- Dots render only when: the **Dots** toggle in the "Show" group is active, the block is wide enough (**width > 4%** of the axis), and the view is **Day/Week** (never in the compact Month view — where the Dots toggle is hidden entirely).
- Each dot is 9px, fully round, with a dual ring for legibility on any block color: `box-shadow: 0 0 0 1.5px rgba(0,0,0,0.35), 0 0 0 2.5px rgba(255,255,255,0.4)`.
- The old top-stripe accent (colored top border) is removed; blocks no longer render a `border-top` for the secondary axis.

### Time scale & navigation

- Day / Week / Month scale selector; default **Week**.
- Prev (‹) / Next (›) shift the anchor by one day / week / month; **Today** resets to the current date.
- Range label adapts to scale:
  - **Day**: full weekday + date (e.g. "Monday, Jul 16, 2026").
  - **Week**: ISO calendar week + span (e.g. "CW29 · Jul 13 – Jul 19, 2026"); weeks start Monday.
  - **Month**: month + year (e.g. "July 2026").

### Ratings & dots — the "Show" toggle group

- **Focus** 1–5 (can be missing/unrated on a session). **Energy** 1–3 → Low / Medium / High (always present).
- **Focus**, **Energy**, and **Dots** are a single toggle-button **group** (matching toggle-button style), **no leading color dots on the labels**. Each button is the **`default` variant when active, `outline` when inactive**.
  - **Dots** toggles the pomodoro secondary-color dots on session blocks (see "Secondary highlight" above).
  - The **Dots** button is **hidden in Month view** (dots never render there); Focus/Energy remain.
  - The group label reads **"Show"** in Day/Week and **"Shade by"** in Month.
- **Day/Week** — both toggles independent, both can be on:
  - When on and the block is wide enough (roughly >4% of the axis), ratings render as on-block badges: **focus ★N bottom-left**, **energy L/M/H bottom-right**.
  - Unrated focus shows **★ n/a** (dimmed) and the block gets a **dashed outline** — but only while Focus is active.
- **Month** — brightness is a single channel, so only **one** metric can shade at a time:
  - Block opacity encodes the active metric (higher rating → brighter; focus scaled over 1–5, energy over 1–3).
  - Clicking one metric activates it and turns the other off; clicking the active one turns it off (no shading). Entering Month with both on auto-drops Energy (keeps Focus).
  - Unrated-focus sessions are left at **full brightness** (not shaded to the darkest step); they still get the dashed outline when Focus is active.
  - No dots and no badges in Month.

### Interactions

- **Click** a session → detail **dialog**: title "Topic · Format", full date, time range, duration (minutes), Focus (filled stars `★★☆☆☆ 2 / 5` or "Not rated"), Energy (Low/Medium/High), and Notes.
- **Hover** a session → native tooltip summarizing topic · format · time range · focus · energy.

### Color customization

- Each topic/format legend chip has a clickable **color dot** that opens a color-palette dialog ("Color · {name}", "Choose a preset or open the color wheel").
- Palette: a 6-column grid of **17 curated, well-separated presets** (Orange, Red, Crimson, Rose, Pink, Fuchsia, Violet, Indigo, Blue, Sky, Cyan, Teal, Emerald, Green, Lime, Gold, Amber). Clicking a preset applies it immediately and **keeps the dialog open**; the active swatch is outlined.
- An **18th cell** shows a rainbow conic gradient with a pencil (✎) icon → opens a **color-wheel** sub-dialog.
- Color wheel: hue/saturation disc (drag to pick — angle = hue, distance from center = saturation, with a live position marker) + a **Lightness** slider + a live preview swatch + a **Done** button. Done applies and closes both dialogs.
- Custom colors apply **live everywhere** the category appears: blocks, pomodoro dots, badges, and the legend dot.

### Design

- PomoSapiens dark design system throughout, built from its components: `Card`, `Dialog` (`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`), `Button` (default/outline/ghost variants, icon/sm sizes), and `Select` (`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`).
- Orange (`#ff5722` / accent) is the highlight color (today's row, Focus dot, active states).
