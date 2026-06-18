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
- **No animations beyond hover state, no hero illustration.** Static cosmic gradient stays. PRD Non-Goal #3 forbids AI-generated animated backgrounds; this slice extends "no motion" as the default. Adding an illustration is a follow-up if you want one.
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

- [ ] 1.1 Lint passes: `npm run lint`
- [ ] 1.2 Build passes: `npm run build`
- [ ] 1.3 Format check passes: `npm run format`

#### Manual

- [ ] 1.4 Anonymous visit to `/` shows new hero copy, wedge-named cards, primary Sign Up button, secondary Sign In link
- [ ] 1.5 Tapping Sign Up routes to `/auth/signup`
- [ ] 1.6 Tapping the secondary Sign In link routes to `/auth/signin`
- [ ] 1.7 After signing in, visiting `/` redirects to `/dashboard` without flicker
- [ ] 1.8 After signing out, visiting `/` renders the landing page (no redirect)
- [ ] 1.9 Topbar renders correctly for the anonymous state on `/`
- [ ] 1.10 Cosmic-theme background and glassmorphic cards still render
- [ ] 1.11 Hero, CTAs, and cards render correctly on mobile (≤ sm breakpoint)
- [ ] 1.12 Browser DevTools console shows no errors
