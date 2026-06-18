# Landing Page Implementation Plan

## Overview

S-00 from the PomoSapiens roadmap. Replace the placeholder Welcome with PomoSapiens-specific landing copy that names the product wedge (contextual capture bound to focus sessions), re-weight the CTAs so Sign Up is the primary action, and add a symmetric `AUTHED_REDIRECTS` rule in middleware that sends signed-in visitors of `/` straight to `/dashboard`.

## Current State Analysis

- `src/pages/index.astro` is a thin wrapper that renders `<Welcome />` inside `<Layout>`.
- `src/components/Welcome.astro` already has the full visual scaffolding: cosmic-themed background (orbs + starfield), Topbar at top, gradient-text hero (`PomoSapiens` + `Coming soon!`), Sign In / Sign Up buttons, and a 3-column glassmorphic feature-card grid. The card copy is starter boilerplate ("Authentication Ready", "Modern Stack", "Developer Experience") — generic, not PomoSapiens-specific.
- `src/middleware.ts` resolves the current user, attaches to `context.locals.user`, and redirects unauthenticated requests for paths in `PROTECTED_ROUTES` to `/auth/signin`. No symmetric rule exists for authenticated visitors of `/`.
- `src/components/Topbar.astro` is auth-aware and renders correctly for both states. It remains the secondary nav for anonymous landing-page visitors.
- `public/` exists (contains `hero.png` + `icon.png`); no `src/assets/` directory yet.
- PRD wedge sentence (§Business Logic, line 134): "PomoSapiens treats every focus session as a data point and reveals to the student which combinations of pre-session context — energy, time of day, material format, topic — correlate with their own self-rated focus quality."
- Roadmap S-00 explicitly names scope creep as the real risk, not technical complexity.
- `context/foundation/lessons.md` is empty — no project priors to apply.

## Desired End State

- Anonymous visitor at `/` sees a wedge-naming hero (persona-direct claim + subhead about contextual capture), Sign Up as the primary filled CTA, Sign In as a smaller secondary link beneath, and three cards that name PomoSapiens-specific value (context capture, focus rating, own patterns).
- Authenticated visitor at `/` is redirected to `/dashboard` (HTTP 302) before page render.
- The existing visual treatment (cosmic gradient, glassmorphic cards, Topbar, gradient-text hero) is preserved. Copy and CTA hierarchy are the only deltas.

### Key Discoveries:

- Reuse `Welcome.astro` structure — only copy + CTA hierarchy change. Do NOT rebuild the cosmic-themed visual layer.
- Middleware extension is symmetric: an `AUTHED_REDIRECTS: Record<string, string>` map sitting next to `PROTECTED_ROUTES`, checked after `context.locals.user` is set, before the existing protected-route check fires.
- Use exact-path match (`pathname === "/"`), not `startsWith` — every path starts with `/`, so `startsWith` would redirect every authed request.

## What We're NOT Doing

- **No marketing extras.** No FAQ, testimonials, social proof, feature grid expansion, screenshots beyond the 3 value cards. Roadmap S-00 names this as the slice's real risk.
- **No analytics tracking.** No GA / Plausible / PostHog / tracking pixels / A/B-test scaffolding. PRD NFR "Privacy of session content" requires per-action consent — out of scope here.
- **No animations beyond hover state.** Static visual treatment only. PRD Non-Goal #3 forbids AI-generated animated backgrounds; this slice extends "no motion" as the default. (Phase 2 adds a static hero image + icon mark, pulled in from the previously-deferred imagery follow-up.)
- **No i18n / language switcher.** English copy only.
- **No refactor of `Welcome.astro` into `index.astro`.** Welcome is single-call-site, but the rewrite stays in place — surgical-changes principle.
- **No changes to auth flow, sign-up UX, `Topbar.astro`, or `Layout.astro`.**
- **No new unit / integration tests.** Content-only change; CI lint + build are the regression net.

## Implementation Approach

Single phase, three surgical edits:

1. Rewrite the content of `Welcome.astro` in place — new hero copy, new card copy, primary/secondary CTA hierarchy.
2. Extend `src/middleware.ts` with `AUTHED_REDIRECTS` map and apply it after user resolution, before `PROTECTED_ROUTES`.
3. Document the symmetric pattern in `CLAUDE.md` so future slices reach for the same primitive.

## Critical Implementation Details

- **Redirect ordering.** The `AUTHED_REDIRECTS` lookup must run after `context.locals.user` is set but before the `PROTECTED_ROUTES` check — otherwise an authed visitor of a future authed-only redirect target could collide with protection logic.
- **Exact-path matching.** Use `AUTHED_REDIRECTS[context.url.pathname]` lookup, not `Object.keys(...).some(startsWith)`. Subpath matching on `/` would redirect every authed request.

## Asset Storage Reference

S-00 does not add any graphics. If a future slice or revision adds imagery, use these locations:

- **`public/`** — static files served as-is at the root URL. Use for: favicons, OG images (`/og-image.png`), social-share cards, any file referenced as a URL string from HTML or CSS. Already contains `hero.png` and `icon.png`.
- **`src/assets/`** (create when needed) — images that benefit from Astro's built-in image optimization. Import the file and render via `<Image src={...} alt="..." />` from `astro:assets` for automatic responsive `srcset`, modern format conversion (WebP/AVIF), and width/height inference. Use for: hero illustrations, photographs, anything where served size matters.

Pick `public/` when the asset is referenced by URL string; pick `src/assets/` + `<Image>` when the asset is imported and rendered as a component.

---

## Phase 1: Landing page + authed-visitor redirect

### Overview

Rewrite Welcome's hero, cards, and CTA hierarchy; add the `AUTHED_REDIRECTS` map to middleware; document the new routing primitive in CLAUDE.md.

### Changes Required:

#### 1. Landing copy rewrite (hero + cards + CTAs)

**File**: `src/components/Welcome.astro`

**Intent**: Replace the placeholder hero text and the 3 boilerplate feature cards with PomoSapiens-specific copy that names the wedge, and re-weight the CTAs so Sign Up is primary (filled purple button) and Sign In is a smaller secondary link beneath. Keep the cosmic background, Topbar, layout grid, and glassmorphic card classes untouched.

**Contract**:

- Hero `<h1>`: persona-direct claim, ~5-9 words. Keep the existing gradient-text class chain.
- Hero subhead `<p>`: 1-2 sentences naming pre-session context capture (energy, time of day, material format, topic) bound to each focus session. ~25-40 words.
- CTA block: one primary `<a href="/auth/signup">` styled as the existing filled purple button. Below it, a smaller `<a href="/auth/signin">` text link with helper copy ("Already have an account? Sign in").
- 3 cards in the existing grid, suggested mapping (final wording is implementer's call within tight scope):
  - Card 1 — pre-session context capture (FR-006 / FR-007 / FR-008 / FR-009)
  - Card 2 — focus rating after each session (FR-013, secondary success criterion)
  - Card 3 — patterns in your own log (FR-015 / FR-016)
- Inline SVG icons inside cards may be swapped for icons more representative of each card's intent — still inline SVG, no new dependencies.
- File stays English-only. No new imports beyond what's already there (Topbar).

#### 2. Authed-visitor redirect

**File**: `src/middleware.ts`

**Intent**: Add a symmetric `AUTHED_REDIRECTS` map so signed-in visitors of `/` are redirected to `/dashboard` before any other routing rule fires. Pattern mirrors the existing `PROTECTED_ROUTES` design so future auth-aware redirects plug in here.

**Contract**:

- New top-level const `AUTHED_REDIRECTS: Record<string, string> = { "/": "/dashboard" }`.
- After `context.locals.user` is assigned and before the `PROTECTED_ROUTES` check, look up `AUTHED_REDIRECTS[context.url.pathname]`. If `context.locals.user` is set AND the lookup yields a target, return `context.redirect(target)`.
- Exact-path match; no `startsWith`.

#### 3. Document the symmetric routing primitive

**File**: `CLAUDE.md`

**Intent**: In the "Auth flow" section's `src/middleware.ts` bullet, add a single sentence noting that `AUTHED_REDIRECTS` is the symmetric counterpart to `PROTECTED_ROUTES` for authed-only redirects, with `/` → `/dashboard` as the seed entry.

**Contract**: Append one short sentence to the existing middleware bullet. No new section, no rewriting of unrelated docs.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Format check passes: `npm run format`

#### Manual Verification:

- Anonymous visit to `/` shows new hero copy, wedge-named cards, primary Sign Up button, secondary Sign In link
- Tapping Sign Up routes to `/auth/signup`
- Tapping the secondary Sign In link routes to `/auth/signin`
- After signing in via existing flow, visiting `/` redirects to `/dashboard` without flicker
- After signing out, visiting `/` renders the landing page (no redirect)
- Topbar renders correctly for the anonymous state on `/`
- Cosmic-theme background (orbs, starfield) and glassmorphic cards still render
- Hero, CTAs, and cards render correctly on mobile (≤ sm breakpoint) with no horizontal overflow
- Browser DevTools console shows no errors

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the plan complete.

---

## Phase 2: Hero image + Topbar icon mark

### Overview

Pull the previously-deferred imagery into S-00. Use `hero.png` as a full-bleed background behind the existing cosmic gradient on the landing page, and `icon.png` as a small mark next to the wordmark in `Topbar.astro`. Both assets move from `public/` to `src/assets/` and render via Astro's `<Image>` so we ship optimized responsive variants instead of 2 MB / 1.3 MB raw PNGs.

### Changes Required:

#### 1. Move PNG assets into the optimization pipeline

**Files**: `public/hero.png` → `src/assets/hero.png`, `public/icon.png` → `src/assets/icon.png`

**Intent**: Astro's `astro:assets` only optimizes files imported from inside `src/`. Anything in `public/` ships as-is. Moving them unlocks responsive `srcset` + modern format conversion (WebP/AVIF) and width/height inference.

**Contract**:

- Create `src/assets/` directory.
- Move the two PNG files; do not duplicate. Delete the originals from `public/`.
- Do not rename. File paths used in imports stay predictable.

#### 2. Hero image as full-bleed background in Welcome.astro

**File**: `src/components/Welcome.astro`

**Intent**: Render `hero.png` as a full-bleed background behind the hero text and cards, layered under the existing cosmic orbs + starfield so the image reads as part of the cosmic theme rather than replacing it. Low opacity keeps text legibility intact.

**Contract**:

- Import `import heroImage from "@/assets/hero.png";` and `import { Image } from "astro:assets";`.
- Render the `<Image>` absolutely positioned across the full container, behind orbs/starfield (lower `z-index` than the existing decorative layers, still above the base gradient).
- Use `loading="eager"` (above-the-fold), explicit `alt=""` (decorative), and a class chain that gives `object-cover` + reduced opacity (e.g., `opacity-30` or `opacity-40`) so it tints rather than dominates.
- Hero text contrast on the gradient header text + card text must remain readable on the darkest portion of the image. If not, drop opacity further; do not change text colors.

#### 3. Icon mark in Topbar.astro

**File**: `src/components/Topbar.astro`

**Intent**: Display `icon.png` at the left of the topbar as the product mark — small (e.g., 28-32px square), no text label change.

**Contract**:

- Import `import iconImage from "@/assets/icon.png";` and `import { Image } from "astro:assets";`.
- Render the `<Image>` with explicit width/height (e.g., 28x28 or 32x32), `alt="PomoSapiens"`, `class="rounded"` (optional aesthetic).
- Place the icon to the left of the existing `{user.email}` / "Not signed in" span. Wrap that side in a `flex items-center gap-2` if not already grouped, so the icon and the text sit side-by-side.
- Keep the topbar's existing layout (`justify-between`) intact — icon + text on the left, auth controls on the right.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build` (verify Astro's image optimizer processes both assets without errors)
- Format check passes: `npm run format`

#### Manual Verification:

- Landing page `/` renders the hero PNG as a full-bleed background, behind orbs/starfield, beneath the hero text and cards
- Hero headline, subhead, primary CTA, and secondary link remain legible against the image (no contrast regression)
- Topbar shows the icon mark to the left of "Not signed in" / user email
- DevTools Network tab: `/` request loads a WebP or AVIF variant of `hero.png` (not the raw 2 MB PNG)
- Topbar layout still works on mobile (≤ sm breakpoint) — icon + text on the left, auth links on the right, no overflow
- `public/hero.png` and `public/icon.png` are gone; `src/assets/hero.png` and `src/assets/icon.png` exist
- Browser DevTools console shows no errors (broken image, 404, layout shift warnings)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before marking the plan complete.

---

## Phase 3: Apply Focus Fuels Greatness color palette globally

### Overview

Replace the inherited cosmic purple/blue/pink palette with the warm dark red/ember palette defined in `context/foundation/color_palette.md`. Wire the palette into `src/styles/global.css` as Tailwind 4 `@theme` tokens AND as the shadcn semantic CSS variables (`--primary`, `--background`, etc.), then sweep every component that hardcoded `blue-*`/`purple-*`/`pink-*`/`indigo-*` utilities. Shadcn primitives (`Button`, etc.) pick up the new palette automatically through the CSS variables; only the components with hardcoded utilities need direct edits.

### Changes Required:

#### 1. Define palette tokens + map shadcn variables — `src/styles/global.css`

**Intent**: Single source of truth for the palette. New `@theme` tokens expose `bg-void`, `bg-ember`, `bg-charred`, `bg-crimson`, `bg-neon`, `bg-blaze`, `bg-spark`, `text-off-white`, `text-ash`, `bg-leaf` (and matching `text-*`, `border-*` utilities). Shadcn variables remap to palette so `Button` variants pick up the new theme automatically.

**Contract**:

- Add a new `@theme` block (separate from the existing `@theme inline`) declaring the 10 palette tokens with hex values straight from `color_palette.md`.
- Update the `:root` block: map `--background` → Void Black, `--foreground` → Off White, `--card` → Deep Ember, `--card-foreground` → Off White, `--primary` → Neon Red, `--primary-foreground` → Off White, `--secondary` → Charred Surface, `--secondary-foreground` → Off White, `--muted` → Charred Surface, `--muted-foreground` → Ash, `--accent` → Blaze Orange, `--accent-foreground` → Off White, `--destructive` → Spark, `--border` → Charred Surface, `--input` → Charred Surface, `--ring` → Blaze Orange, `--popover` → Deep Ember, `--popover-foreground` → Off White.
- Replace the `bg-cosmic` utility: gradient from Void Black → Deep Ember → Void Black (vertical), maintaining the layered dark feel.
- Leave the `.dark` variant block intact (the site is effectively dark-first; `.dark` overrides stay but are no longer the active theme). Keep `--chart-*` and `--sidebar-*` as-is; they're not used by current screens.

#### 2. Sweep cosmic-purple references in landing surfaces

**Files**: `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: Replace all `blue-*` / `purple-*` / `pink-*` / `indigo-*` utilities with palette tokens. Preserve layout and structure.

**Contract**:

- Welcome.astro hero gradient: switch `from-blue-200 via-purple-200 to-pink-200` → palette ramp (e.g., `from-[var(--color-off-white)] via-[var(--color-blaze)] to-[var(--color-spark)]` or named tokens `from-off-white via-blaze to-spark`).
- Welcome.astro cosmic orbs: swap `bg-purple-500/20`, `bg-blue-500/15`, `bg-indigo-400/10` → palette equivalents (Neon Red / Blaze Orange / Spark at the same opacities).
- Welcome.astro subhead + card body text `text-blue-100/70` and `text-blue-100/60` → palette text tokens. Use `text-off-white/70` for hero subhead, `text-ash` for card body (per palette guidance: Ash for secondary text, but verify contrast on Deep Ember card surfaces — fall back to `text-off-white/60` if contrast is insufficient per palette "Don't").
- Welcome.astro primary CTA `bg-purple-600 hover:bg-purple-500` → `bg-neon hover:bg-blaze` (default → hover ramp per palette).
- Welcome.astro secondary link `text-purple-200` → `text-spark` (small accent, fits the badge use).
- Welcome.astro card surfaces `bg-white/5 border-white/10` → `bg-ember border-charred`; SVG icon `text-purple-300` → `text-blaze`.
- Topbar.astro container `bg-white/5 border-white/10 text-white/80` → `bg-ember border-charred text-off-white/80`; `text-blue-100/70` → `text-ash`; link `text-purple-300 hover:text-purple-100` → `text-blaze hover:text-spark`.

#### 3. Sweep cosmic-purple references in auth surfaces

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/pages/dashboard.astro`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/FormField.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/SubmitButton.tsx`

**Intent**: Same sweep applied to the auth flow and dashboard. Keep behavior identical; only colors change.

**Contract**:

- Auth page wrappers (signin/signup/confirm-email): `bg-white/10 border-white/10` → `bg-ember border-charred`; `from-blue-200 to-purple-200` heading gradient → `from-off-white to-blaze`; helper text `text-blue-100/60` → `text-ash`; helper link `text-purple-300` → `text-blaze`.
- Dashboard: same wrapper treatment; sign-out button `bg-white/10 border-white/20 hover:bg-white/20` → `bg-charred border-charred hover:bg-crimson`.
- `SignInForm.tsx` divider: `border-white/20` → `border-charred`; `text-blue-100/40` → `text-ash`; Google button `border-white/20 bg-white/5 hover:bg-white/10 text-white` → `border-charred bg-ember hover:bg-charred text-off-white`. **Do NOT change the four `<path fill="#...">` hex colors inside the Google `<svg>` — those are Google's brand colors and must stay.**
- `SignUpForm.tsx` `text-blue-100/50` hint → `text-ash`.
- `FormField.tsx`: `bg-white/10` input → `bg-charred`; `text-white placeholder-white/40` → `text-off-white placeholder-ash`; `text-blue-100/80` label → `text-off-white/80`; focus ring `focus:ring-red-400` (error) → `focus:ring-spark`, `focus:ring-purple-400` (default) → `focus:ring-blaze`; `border-red-400/60` (error) → `border-spark`; `border-white/20` → `border-charred`; error text `text-red-300` → `text-spark`.
- `PasswordToggle.tsx`: `text-white/40 hover:text-white/70` → `text-ash hover:text-off-white`.
- `SubmitButton.tsx`: `bg-purple-600 hover:bg-purple-500` → `bg-neon hover:bg-blaze`; spinner `border-white/30 border-t-white` → `border-off-white/30 border-t-off-white`; `text-white` → `text-off-white`.

#### 4. Tomato Leaf accent — wire success path

**File**: `src/components/auth/ServerError.tsx` (Read to assess; if it already shows errors only, leave it alone — palette says Tomato Leaf is for success states.)

**Intent**: No new component, but verify that the existing error component uses palette tokens. Success-path wiring (Tomato Leaf for checkmarks) is intentionally deferred to a follow-up — no current screen has a success indicator that would benefit from it.

**Contract**:

- Read `ServerError.tsx`. If it uses `red-*` Tailwind utilities, swap to palette tokens (`text-spark`, `bg-ember`, `border-spark/40`, etc.) — same sweep as elsewhere.
- Do NOT add a new "success" component. Tomato Leaf stays dormant until a screen needs it.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Format check passes: `npm run format`
- Grep gate: `rg "(blue|purple|indigo|pink)-[0-9]+" src/` returns no hits inside Tailwind utility class strings (false positives in inline SVG `fill="#..."` brand colors are allowed and expected, e.g. Google logo).

#### Manual Verification:

- Landing `/` renders with the new palette: dark warm background, off-white text, neon-red primary CTA, no visible blue/purple/pink anywhere
- Hero headline gradient reads as off-white → orange/red (not blue → purple → pink)
- Cosmic orbs read as warm reds/oranges (not cool purples/blues), still as soft glows
- Hover state on primary CTA visibly shifts to Blaze Orange (lighter, more saturated than default Neon Red)
- Topbar: ember surface, charred border, off-white text, blaze-orange links
- Sign in / Sign up / Confirm email pages all render in the new palette consistently with the landing page
- Dashboard renders in the new palette
- Form fields: charred background, off-white text, blaze focus ring, spark for error states
- Submit button: neon red default, blaze on hover
- Google "Continue with" button still shows the official Google logo colors (not retinted)
- DevTools console clean

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before marking the plan complete.

---

## Testing Strategy

### Unit Tests:

- None. Content-only change to a static Astro page + a 3-line middleware extension. Existing CI gates (lint, build, typecheck) catch the only regressions that matter (syntax, type, broken imports). No business logic touched.

### Integration Tests:

- None, same reasoning.

### Manual Testing Steps:

1. `npm run dev`, visit `/` while signed out — verify hero copy, card copy, primary CTA, secondary link.
2. Sign up via the primary CTA — verify flow works.
3. Sign in via the secondary link — verify flow works.
4. Once signed in, manually visit `/` — expect redirect to `/dashboard`.
5. Sign out — verify `/` renders again as the landing page.
6. DevTools → throttle to slow-3G, reload `/` — verify the page is still usable, no layout shift cascade.
7. DevTools → mobile viewport (375px) — verify no horizontal scroll, CTAs stack, cards collapse to single column.

## Performance Considerations

SSR HTML page with one auth check (already running for every request via middleware). The `AUTHED_REDIRECTS` lookup is O(1). No new bundle weight, no new client JS, no new fonts.

## Migration Notes

None. Content-only change to one component + a 3-line middleware extension.

## References

- Roadmap S-00: `context/foundation/roadmap.md` lines 68-79
- PRD §Business Logic wedge sentence: `context/foundation/prd.md` line 134
- PRD §Vision & Problem Statement: `context/foundation/prd.md` lines 20-24
- Existing landing component: `src/components/Welcome.astro`
- Existing middleware pattern: `src/middleware.ts` (PROTECTED_ROUTES)
- CLAUDE.md "Auth flow" section (target of doc tweak)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Landing page + authed-visitor redirect

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — c43b190
- [x] 1.2 Build passes: `npm run build` — c43b190
- [x] 1.3 Format check passes: `npm run format` — c43b190

#### Manual

- [x] 1.4 Anonymous visit to `/` shows new hero copy, wedge-named cards, primary Sign Up button, secondary Sign In link — c43b190
- [x] 1.5 Tapping Sign Up routes to `/auth/signup` — c43b190
- [x] 1.6 Tapping the secondary Sign In link routes to `/auth/signin` — c43b190
- [x] 1.7 After signing in, visiting `/` redirects to `/dashboard` without flicker — c43b190
- [x] 1.8 After signing out, visiting `/` renders the landing page (no redirect) — c43b190
- [x] 1.9 Topbar renders correctly for the anonymous state on `/` — c43b190
- [x] 1.10 Cosmic-theme background and glassmorphic cards still render — c43b190
- [x] 1.11 Hero, CTAs, and cards render correctly on mobile (≤ sm breakpoint) — c43b190
- [x] 1.12 Browser DevTools console shows no errors — c43b190

### Phase 2: Hero image + Topbar icon mark

#### Automated

- [x] 2.1 Lint passes: `npm run lint`
- [x] 2.2 Build passes: `npm run build`
- [x] 2.3 Format check passes: `npm run format`

#### Manual

- [x] 2.4 Landing page renders hero PNG as full-bleed background behind orbs/starfield
- [x] 2.5 Hero headline, subhead, and CTAs remain legible against the image
- [x] 2.6 Topbar shows icon mark to the left of the email / "Not signed in" label
- [x] 2.7 DevTools Network shows a WebP/AVIF variant served for the hero image (not raw PNG)
- [x] 2.8 Topbar layout works on mobile (icon + text left, auth links right, no overflow)
- [x] 2.9 `public/hero.png` and `public/icon.png` removed; `src/assets/hero.png` and `src/assets/icon.png` present
- [x] 2.10 Browser DevTools console shows no errors

### Phase 3: Apply Focus Fuels Greatness color palette globally

#### Automated

- [x] 3.1 Lint passes: `npm run lint`
- [x] 3.2 Build passes: `npm run build`
- [x] 3.3 Format check passes: `npm run format`
- [x] 3.4 Grep gate: no `blue-N/purple-N/indigo-N/pink-N` utilities in src/ (Google brand SVG hex fills allowed)

#### Manual

- [x] 3.5 Landing `/` renders new palette; no visible blue/purple/pink anywhere
- [x] 3.6 Hero headline gradient reads off-white → orange/red
- [x] 3.7 Cosmic orbs read as warm reds/oranges, still soft glows
- [x] 3.8 Primary CTA hover shifts Neon Red → Blaze Orange
- [x] 3.9 Topbar matches new palette
- [x] 3.10 Sign in / Sign up / Confirm email pages all use the new palette consistently
- [x] 3.11 Dashboard uses the new palette
- [x] 3.12 Form fields, error state, submit button colors match palette
- [x] 3.13 Google "Continue with" logo retains its official brand colors
- [x] 3.14 DevTools console clean
