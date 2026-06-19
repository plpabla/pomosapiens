# Landing Page — Plan Brief

> Full plan: `context/changes/landing-page/plan.md`

## What & Why

S-00 from the roadmap — replace the placeholder landing page with PomoSapiens-specific copy that names the product wedge (contextual capture bound to each focus session) and funnels visitors toward Sign Up. The landing page is the acquisition surface that feeds US-01; today it shows starter boilerplate ("Coming soon!" + 3 generic "modern stack" cards) that does not communicate why a student would pick PomoSapiens over any other Pomodoro app.

## Starting Point

`src/pages/index.astro` renders `<Welcome />` inside `<Layout>`. `Welcome.astro` already carries the full visual scaffolding (cosmic background, gradient hero text, Sign In / Sign Up buttons, 3-card glassmorphic grid) — only the copy is starter-boilerplate. Middleware protects `/dashboard` but does not redirect authenticated visitors away from `/`.

## Desired End State

Anonymous visitors at `/` see a persona-direct headline (e.g. "Learn which study conditions actually work for you"), a subhead naming pre-session context capture, a primary Sign Up CTA with a smaller secondary Sign In link, and 3 wedge-aligned cards (context capture, focus rating, own patterns). Authenticated visitors of `/` are redirected to `/dashboard` before page render.

## Key Decisions Made

| Decision                   | Choice                                                              | Why (1 sentence)                                                                        | Source |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| Hero angle                 | Persona-direct claim                                                | Names the persona's pain (decision paralysis at session start); matches PRD Vision tone | Plan   |
| Below-hero layout          | 3 wedge-specific cards                                              | Reuses the existing glassmorphic card grid — zero structural work, only copy changes    | Plan   |
| CTA hierarchy              | Sign Up primary, Sign In secondary text link                        | Landing is the acquisition surface; new visitors should be funneled to Sign Up          | Plan   |
| Authed-`/` redirect        | Middleware `AUTHED_REDIRECTS` map (`/`→`/dashboard`)                | Mirrors the existing `PROTECTED_ROUTES` pattern; symmetric primitive for future routes  | Plan   |
| Scope freeze               | Marketing extras + analytics tracking explicitly out                | Matches the roadmap's named risk and PRD privacy NFR                                    | Plan   |
| Animations / illustrations | No motion beyond hover, no hero illustration in v1                  | PRD Non-Goal #3 forbids AI-generated animations; static cosmic theme remains            | Plan   |
| `Welcome.astro` vs inline  | Edit `Welcome.astro` in place                                       | Surgical-changes principle; single-call-site refactor not justified by this slice       | Plan   |
| Graphic asset locations    | `public/` for URL-referenced; `src/assets/` for `<Image>`-optimized | Astro convention; S-00 ships no images but documents the pattern for follow-ups         | Plan   |

## Scope

**In scope:**

- Rewrite `src/components/Welcome.astro` hero + card copy + CTA hierarchy
- Add `AUTHED_REDIRECTS` map and redirect logic to `src/middleware.ts`
- One-sentence `CLAUDE.md` note documenting the new routing primitive

**Out of scope:**

- Marketing extras (FAQ, testimonials, social proof, screenshots beyond the 3 value cards)
- Analytics tracking, telemetry, A/B testing
- Animations, illustrations, AI-generated visuals
- i18n / language switcher
- Refactoring `Welcome.astro` into `index.astro`
- Changes to auth flow, `Topbar.astro`, or `Layout.astro`

## Architecture / Approach

One Astro component edit + one middleware extension. The middleware change adds a 3-line lookup in a symmetric position to `PROTECTED_ROUTES`. The Astro page is fully SSR — no client-side hydration, no React islands, no client JS added. Graphics, if added later, follow Astro's two-bucket convention (`public/` for URL-referenced, `src/assets/` for `<Image>`-optimized).

## Phases at a Glance

| Phase                                     | What it delivers                                                                                               | Key risk                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Landing page + authed-visitor redirect | Wedge-named landing page, primary Sign Up funnel, `AUTHED_REDIRECTS` middleware, one-sentence `CLAUDE.md` note | Scope creep — adding a marketing surface, analytics, or illustration would break the freeze |

**Prerequisites:** None. F-01 is independent (DB-only); auth is already shipped per Baseline.
**Estimated effort:** One session (1-2 hours) for copy + middleware + manual verification.

## Open Risks & Assumptions

- Final hero copy and exact card wording are the implementer's call within the contract (persona-direct claim, ~5-9 words; subhead 25-40 words naming context capture). The plan does not lock the exact words.
- Inline-SVG icon swaps stay inline SVG — no new icon library dependency.

## Success Criteria (Summary)

- A first-time visitor at `/` immediately understands that PomoSapiens is for context-capturing focus sessions, not generic Pomodoro
- Sign Up is the obvious primary action; Sign In is reachable but de-emphasized
- A signed-in visitor of `/` never sees the landing page — they land on `/dashboard`
