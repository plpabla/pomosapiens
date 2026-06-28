# First Session Capture Loop — Plan Brief

> Full plan: `context/changes/first-session-capture-loop/plan.md`
> Research: `context/changes/first-session-capture-loop/research.md`

## What & Why

Build PomoSapiens' north-star wedge end-to-end: a signed-in student taps **Start session**, picks an energy level, runs a 25-minute focus timer with an audible focus→break cue, rates focus 1-5 or skips, and sees the new session at the top of a dashboard history list. This is the slice the roadmap calls the north star because every later slice only matters if this one works in real use: it's the smallest end-to-end flow that proves "contextual capture bound to a focus session" — the trait that, if removed, makes PomoSapiens a generic Pomodoro timer.

## Starting Point

F-01 already shipped the `sessions` table with per-user RLS and every column S-01 writes — no DB migration is needed (research §1, §6). The UI layer, however, is bare: `src/pages/dashboard.astro` is a 6-line placeholder; there is no `/session/*` route, no timer or rating or history component, only the `button` shadcn primitive, and no audio asset under `public/`. Auth, middleware, the typed Supabase client, the zod schema convention, and the API-route pattern are all in place; S-01 plugs into them.

## Desired End State

A signed-in student reaches a running 25/5 timer in ≤ 3 taps from the dashboard, completes the focus phase (or stops early), hears a clearly audible chime, rates 1-5 or taps Skip, and returns to the dashboard to see the just-saved session at the top of their history list. The timer's elapsed time is reconciled from a server-stored `started_at` so short tab backgrounding or device sleep does not desync it (NFR "Timer accuracy and resilience"). Cross-user isolation is preserved (NFR "Privacy"); no DELETE affordance is exposed.

## Key Decisions Made

| Decision                    | Choice                                                                                          | Why (1 sentence)                                                                                                  | Source   |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| Timer-resilience strategy   | Server-stored `started_at` + wall-clock reconcile (INSERT at session start)                     | Survives backgrounding/sleep/throttling/reload because the DB is the source of truth, directly satisfying the NFR | Plan     |
| Flow shape                  | `/session/new` → `/session/[id]` (timer + rating inline)                                        | Clean URLs anchor the resilient timer to a specific row; ≤ 3-tap Guardrail honored                                | Plan     |
| History placement           | Inline on the dashboard, SSR-fetched; no separate `/history`                                    | Keeps the authed app to 2 pages and lands "session at top of history" without an extra click                      | Plan     |
| Free-text note (FR-014)     | Defer to S-04                                                                                   | Roadmap maps FR-014 to S-04; keeps S-01 surface honest to "smallest end-to-end"                                   | Plan     |
| Authed shell                | Extend `Layout.astro` to auto-mount `Topbar` when `Astro.locals.user` is set                    | One source of truth for all current and future authed pages; eliminates per-page wiring                           | Plan     |
| Post-session rating UI      | Inline phase swap on `/session/[id]` (no modal, no extra route)                                 | Same React island already owns the session id; cleanest hand-off; no extra Radix dependency                       | Plan     |
| Energy picker control       | Three large labeled buttons (Low / Medium / High) using the existing `button` primitive         | One-tap pick; no new shadcn install; honors the 3-tap budget                                                      | Plan     |
| Audible-cue source          | Bundled short CC0 chime at `public/audio/chime.mp3`, primed on the Start tap (the user gesture) | Predictable cross-browser autoplay; the Start tap is the gesture the autoplay policy requires                     | Plan     |
| API endpoint shape          | `POST /api/sessions` + `PATCH /api/sessions/[id]`, JSON in / JSON out                           | Deliberate deviation from the auth-route redirect convention because React islands drive `fetch` with JSON        | Plan     |
| API column-scope discipline | endSessionSchema accepts only `focus_rating`; `ended_at` is server-set                          | Implements the F-01 impl-review rule that the wide UPDATE RLS policy expects from the call-site                   | Research |
| No new DB migration         | F-01 schema is sufficient                                                                       | F-01's "anticipating-but-nullable" column set covers every S-01 column                                            | Research |

## Scope

**In scope:**

- Dashboard rewrite: Start CTA + SSR-fetched history list + empty state
- Pre-session route `/session/new` with an energy picker (Low / Medium / High)
- Active session route `/session/[id]` with the wall-clock-reconciled countdown timer, audible focus-end chime, manual stop early, and inline 1-5 / Skip rating
- `POST /api/sessions` (create) and `PATCH /api/sessions/[id]` (end) with column-scope discipline
- `src/lib/schemas/session.ts` zod schemas
- `Layout.astro` extension to auto-mount Topbar for authed pages
- `card` shadcn primitive install
- CC0 chime asset under `public/audio/`
- Middleware: append `/session` to `PROTECTED_ROUTES`

**Out of scope:**

- Visual break-phase countdown after focus-end (chime is sufficient; defer to a later polish slice)
- Free-text session note (FR-014 → S-04)
- Topic / material-format pickers (FR-007 / FR-008 → S-02)
- Editable presets, count-up timer, mode picker (FR-004 / FR-005 / FR-010 → S-03)
- `GET /api/sessions` endpoint (dashboard reads via SSR)
- Any DELETE affordance (RLS denies; pgTAP locks it)
- Focus-rating chart (FR-016 → S-04)
- Unit / e2e test infrastructure (deferred to Module 3 test-plan rollout)
- DB migration (none needed)

## Architecture / Approach

```
/dashboard (Astro SSR)
    Topbar (auto via Layout)
    [Start session] → /session/new
    History list (SSR-fetched from sessions)

/session/new (Astro shell)
    <EnergyPicker client:load />          React island
        [Low] [Medium] [High]
        [Start] → primes Audio (user gesture)
                 → POST /api/sessions → 201 {id, started_at}
                 → window.location.assign(/session/<id>)

/session/[id] (Astro shell; SSR confirms ownership + not-ended)
    <SessionRunner client:load
                   sessionId
                   startedAtMs
                   focusSeconds={25*60} />
        phase: 'running' | 'rating' | 'submitting'
        running:  countdown from (focusSeconds - (Date.now() - startedAtMs)/1000)
                  visibilitychange recomputes from Date.now()
                  Stop early → 'rating' (no chime)
        focus-end: play chime → 'rating'
        rating:   [1][2][3][4][5]  [Skip]
                  → PATCH /api/sessions/[id] {focus_rating}
                  → window.location.assign('/dashboard')
```

Server-side: `src/middleware.ts` allowlists `/session/*`; `src/lib/supabase.ts` returns the typed client; `src/lib/parse-request.ts` validates JSON bodies; the existing `auth.users` + F-01 `sessions` table + per-user RLS handle ownership.

## Phases at a Glance

| Phase                                                   | What it delivers                                                                                                          | Key risk                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. Schemas + session API + middleware                   | `POST /api/sessions`, `PATCH /api/sessions/[id]`, zod schemas, `/session` added to `PROTECTED_ROUTES`                     | Column-scope discipline on PATCH must be tight (the API is the only enforcement layer) |
| 2. Authed shell + dashboard rewrite + shadcn primitives | `Layout.astro` auto-mounts Topbar; `dashboard.astro` becomes Start CTA + SSR history list + empty state; `card` installed | Topbar must not double-render on landing/auth pages                                    |
| 3. Pre-session screen                                   | `/session/new` page + `EnergyPicker` React island; on Start: prime audio + create session + navigate                      | Audio priming must happen inside the click handler, not a `useEffect`                  |
| 4. Active session page + timer + chime + rating         | `/session/[id]` page + `SessionRunner` island + CC0 chime asset; closes the write half of the loop                        | Timer must derive from wall clock (no `setInterval` countdown) to survive throttling   |
| 5. End-to-end verification + lessons sync               | Full lint + build + db:test gate; golden-path manual run; cross-browser spot-check; lessons appended                      | The 30-60 s tab-backgrounding test is the load-bearing NFR check                       |

**Prerequisites:** F-01 (`sessions-data-foundation`) is shipped and archived. The Supabase local stack runs via `npm run db:start` (Docker required). A CC0 chime needs to be sourced (Freesound / Pixabay) before Phase 4.

**Estimated effort:** ~3-4 sessions across 5 phases for a single developer working after-hours. Phase 4 is the largest single phase (timer state machine + audio + rating + ownership guards).

## Open Risks & Assumptions

- The CC0 chime asset must be sourced before Phase 4 lands; if no satisfactory CC0 chime is found, Web Audio synthesis is the documented fallback (the plan rejected it as primary but it remains a safety net).
- The audio-priming pattern (Start tap on `/session/new` priming an asset that plays on `/session/[id]`) crosses a navigation boundary. The assumption is that Safari/Chrome treat the document's "user has gestured" state as persistent across same-origin navigation; if a browser is strict, fall back to priming again at the top of `SessionRunner`'s first render with a muted `play()`/`pause()` (the page still loads in response to a click, which most browsers count).
- Mobile-Safari audio playback is the historically strictest case; if the chime is suppressed on a backgrounded mobile tab, that is acceptable for v1 (the PRD's NFR is about resilience of the timer, not unconditional audio playback while the tab is hidden).
- `lessons.md` is currently empty; F-01's "RLS enforces immutability, not UI" lesson is referenced by the DELETE-drop migration but never written down. Phase 5 has the opportunity to fix this drift if encountered.

## Success Criteria (Summary)

- A signed-in student completes a session end-to-end (Start → energy pick → 25-min focus → chime → rate or skip → sees session at top of history) — the PRD Primary success criterion.
- The timer survives a 30-60 s tab-backgrounding mid-session and reflects wall-clock elapsed on return — NFR + Guardrail "Timer survives short tab backgrounding".
- Cross-user isolation: a second user cannot view or end a first user's session — NFR "Privacy of session content".
