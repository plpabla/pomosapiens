# Color Palette — Hero Design System

Derived from the **Focus Fuels Greatness** hero image. The palette is built around deep blacks, ember reds, and fiery oranges against a near-black background. Use it consistently to maintain the high-energy, dark-theme aesthetic.

---

## Background Colors

### `#0D0D0F` — Void Black

The true base. Use for the main page background, full-bleed sections, and the `<body>` background color. This is not pure black — it has a faint warm undertone that pairs naturally with the reds.

**Use when:** setting the overall page canvas, hero sections, dark overlays behind modals.

---

### `#1A0A08` — Deep Ember

A very dark red-black. Slightly warmer than Void Black, which creates natural depth layering without needing heavy shadows.

**Use when:** card backgrounds, sidebar panels, code blocks, any surface that needs to feel "raised" off the page background.

---

### `#2A1A18` — Charred Surface

A mid-dark brownish-red. Provides enough contrast against Deep Ember to be usable as a second-level surface.

**Use when:** hover backgrounds on list items or nav links, borders, dividers between sections, input field backgrounds.

---

### `#4A2020` — Dark Crimson

A noticeably tinted dark red. Creates subtle warmth without pulling full attention.

**Use when:** tinted card variants (e.g. a selected state, a featured item), subtle section backgrounds that should feel slightly warmer than default surfaces.

---

## Primary Action Colors (Red-Orange Ramp)

These three work as a **ramp** — use them together across default / hover / active states.

### `#C0190D` — Neon Red

The primary brand red. Bold, authoritative, clearly actionable.

**Use when:** primary CTA buttons (default state), active navigation indicator, underlines on important links, progress bar fill.

---

### `#E8320A` — Blaze Orange

One step brighter and more orange. Feels energized.

**Use when:** hover state on primary buttons, highlighted text, notification badges, icon accent fills.

---

### `#FF5722` — Spark

The brightest point in the ramp. Use sparingly — it draws the eye immediately.

**Use when:** tags and small badges ("NEW", "HOT"), active toggle indicator, a small decorative accent (e.g. animated spark/dot), keyboard shortcut highlights.

---

## Text Colors

### `#F5F0EB` — Off White

Warm, not clinical. Much easier to read on dark backgrounds than pure `#FFFFFF` and stays consistent with the image's warm tone.

**Use when:** all primary body text, headings, button labels, any text on dark backgrounds.

---

### `#3D3830` — Ash

A warm mid-gray. Use for anything secondary or supporting.

**Use when:** metadata (dates, read time), placeholder text in inputs, captions, helper text below form fields, disabled states.

---

## Accent Color

### `#2D5A1B` — Tomato Leaf

A deep forest green. Pulled from the character's stem — a small but intentional nod. Use very sparingly so it retains its accent value.

**Use when:** success states (form validation, checkmarks, completed steps), small decorative details where a non-red contrast is needed, "available" or "online" status indicators.

---

## Quick Reference

| Hex       | Name            | Primary Use                   |
| --------- | --------------- | ----------------------------- |
| `#0D0D0F` | Void Black      | Page background               |
| `#1A0A08` | Deep Ember      | Card / panel background       |
| `#2A1A18` | Charred Surface | Borders, hover states         |
| `#4A2020` | Dark Crimson    | Tinted surface variants       |
| `#C0190D` | Neon Red        | Primary CTA (default)         |
| `#E8320A` | Blaze Orange    | Primary CTA (hover)           |
| `#FF5722` | Spark           | Badges, tags, micro-accents   |
| `#F5F0EB` | Off White       | Primary text                  |
| `#3D3830` | Ash             | Secondary / muted text        |
| `#2D5A1B` | Tomato Leaf     | Success states, small accents |

---

## Layering Model

```
Page background     →  #0D0D0F
  └── Panel / card  →  #1A0A08
        └── Input / hover surface  →  #2A1A18
              └── Selected / featured card  →  #4A2020
```

Text sits on top of any of these — always use `#F5F0EB` for primary text and `#3D3830` for secondary text.

---

## Do's and Don'ts

**Do**

- Keep backgrounds within the dark stack — avoid any light surfaces.
- Use the red-orange ramp (Neon Red → Blaze Orange → Spark) for interactive states in order.
- Use Off White for text, never pure `#FFFFFF`.
- Use Tomato Leaf only for success/positive states.

**Don't**

- Don't mix the reds randomly — respect the default/hover/active hierarchy.
- Don't use Spark (`#FF5722`) for large areas; it overwhelms at scale.
- Don't place Ash text (`#3D3830`) on Deep Ember — contrast is insufficient for body copy.
- Don't add bright blues, purples, or cool grays — they break the warm dark-red aesthetic.
