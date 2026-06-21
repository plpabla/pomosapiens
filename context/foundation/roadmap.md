---
project: PomoSapiens
version: 1
status: draft
created: 2026-05-28
updated: 2026-06-21
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: PomoSapiens

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline (2026-05-28).
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

PomoSapiens captures what existing Pomodoro trackers miss: pre-session context (energy, time of day, material format, topic) and a post-session focus rating tied to each timed study block. The product wedge — the one trait that, if removed, makes the product a generic Pomodoro timer — is **contextual capture bound to a focus session**, so a formal-education student can later see which study conditions actually correlate with their own self-rated focus. v1 ships the capture loop plus a simple history view; synthesized weekly insights are explicitly deferred (PRD Open Question #2).

## North star

**S-01: User logs first energy-gated session end-to-end (default preset, history visible)** — the smallest end-to-end flow that proves the wedge, placed as early as Prerequisites allow because every later slice only matters if this works.

> "North star" here means the smallest end-to-end flow whose successful delivery would prove the wedge in real use; everything else is sequenced relative to it.

## At a glance

| ID   | Change ID                          | Outcome (user can …)                                                             | Prerequisites | PRD refs                                              | Status   |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------- | -------- |
| S-00 | `landing-page`                     | see a landing page with value prop and sign-up CTA                               | —             | — (US-01 acquisition surface)                         | done     |
| F-01 | `sessions-data-foundation`         | (foundation) sessions data model with per-user RLS                               | —             | NFR (privacy), Access Control                         | done     |
| S-01 | `first-session-capture-loop`       | log first energy-gated session end-to-end and see it in history                  | F-01          | US-01, FR-006, FR-009, FR-011, FR-012, FR-013, FR-015 | done     |
| S-02 | `categorize-sessions-topic-format` | manage topics and tag each session with topic + material format                  | S-01          | FR-007, FR-008, FR-017                                | proposed |
| S-03 | `timer-presets-and-modes`          | edit the three preset slots and choose count-up vs preset per session            | S-01          | FR-004, FR-005, FR-010                                | proposed |
| S-04 | `session-notes-and-chart`          | add a free-text note to a session and view a focus-rating chart over time        | S-01          | FR-014, FR-016                                        | proposed |
| S-05 | `explicit-session-abandon`         | abandon an in-progress session explicitly via a dashboard button                 | S-01          | FR-012 (extends stop-early to dashboard level)        | proposed |
| S-06 | `tab-title-timer`                  | see the live timer countdown in the browser tab title while a session is running | S-01          | FR-018                                                | proposed |

## Baseline

What's already in place in the codebase as of 2026-05-28 (auto-researched + user-confirmed). Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + Tailwind 4 + shadcn/ui wired; pages: `src/pages/index.astro`, `src/pages/dashboard.astro` (auth-gated), `src/pages/auth/{signin,signup,confirm-email}.astro`.
- **Backend / API:** present — Astro SSR (`output: "server"`); zod validation via `src/lib/schemas/auth.ts` and `src/lib/parse-request.ts` (`parseFormData()` / `parseJson()` returning `ParseResult<T>`). Five auth routes under `src/pages/api/auth/`.
- **Data:** partial — Supabase SSR client at `src/lib/supabase.ts`; **no application tables yet** (`supabase/migrations/` absent, only built-in `auth.users` used); no RLS policies (no app tables to protect). This is the only gap F-01 fills.
- **Auth:** present — Supabase Auth cookie-sessioned; Google OAuth wired (`/api/auth/oauth.ts` + `/api/auth/callback.ts`); email+password with verification redirect to `/auth/confirm-email`; sign-out endpoint; route-level middleware (`src/middleware.ts`) protects `/dashboard`. **Covers FR-001 (federated identity), FR-002 (email + password w/ verification), FR-003 (sign-out)** — no slice re-implements these.
- **Deploy / infra:** present — `@astrojs/cloudflare` adapter; `wrangler.jsonc` populated; GitHub Actions CI runs lint + build with `SUPABASE_*` secrets. Auto-deploy on merge to `main` is wired via Cloudflare Workers' GitHub integration (not via a workflow job).
- **Observability:** absent — no logger, no Sentry / Datadog / OTel. Cloudflare's built-in `observability.enabled` in `wrangler.jsonc` is the v1 floor; no app-level structured logging or error tracking. No NFR demands more in v1, so no Foundation opens here.

## Foundations

### F-01: Sessions data foundation

- **Outcome:** (foundation) `sessions` table exists with per-user RLS; an authenticated student can persist and read back their own session rows, and no other user can see them.
- **Change ID:** `sessions-data-foundation`
- **PRD refs:** NFR "Privacy of session content" ("Cross-user leakage of any session field is a regression even if the primary flow works"); Access Control ("All access decisions reduce to 'is this the session-owning user, or is this an admin?'").
- **Unlocks:** S-01 (no session can be saved without this), and by transitive prereq S-02 / S-03 / S-04 (all read or extend the sessions row). Reduces the privacy-leak risk that would otherwise have to be retrofitted under deadline pressure.
- **Prerequisites:** —
- **Parallel with:** S-00 (pure DB work vs pure frontend — no shared files)
- **Blockers:** —
- **Unknowns:**
  - Minimum sessions column set that supports S-01 plus S-02/S-03/S-04 without painful follow-on migrations — Owner: implementer (decided at `/10x-plan` time). Block: no — additive nullable columns are cheap.
- **Risk:** Sequenced first because every slice depends on session persistence; if RLS is wrong here, every later slice inherits the leak. Investing in this layer (the one investment area `speed` does NOT trade away) is cheaper here than retrofitting after S-01 ships.
- **Status:** done

## Slices

### S-00: Landing page

- **Outcome:** A first-time visitor to `/` sees a hero explaining the wedge (energy-gated focus sessions with contextual capture bound to each session) and taps a primary CTA that routes to `/auth/signup`. Replaces the placeholder `src/pages/index.astro`. Authenticated visitors are redirected to `/dashboard`.
- **Change ID:** `landing-page`
- **PRD refs:** — no direct FR. Serves as the acquisition surface that feeds US-01's sign-up path (FR-001 / FR-002 already shipped per Baseline).
- **Prerequisites:** —
- **Parallel with:** F-01 (no shared files; frontend-only vs DB-only)
- **Blockers:** —
- **Unknowns:**
  - Final hero copy and visual treatment (illustration vs screenshot vs blank slate) — Owner: project author (decided at `/10x-plan` time). Block: no.
- **Risk:** Lowest-risk slice — pure frontend, no data, no auth changes. The real risk is **scope creep**: over-investing in marketing polish (feature grids, FAQs, animations, analytics) before S-01 validates the wedge. Hold the line at hero + value prop + CTA. S-00 is **not** the north star — S-01 remains the slice that proves the wedge; S-00 only opens the front door.
- **Status:** done

### S-01: First session capture loop

- **Outcome:** User can sign in, tap "Start session" on the dashboard, pick an energy level (only required field), run a default 25 / 5 timer through focus → break with an audible cue, rate focus 1–5 or skip at the end, and see the saved session at the top of their history list.
- **Change ID:** `first-session-capture-loop`
- **PRD refs:** US-01; FR-006 (start session → pre-session screen), FR-009 (energy required), FR-011 (countdown + auto focus→break + audible cue), FR-012 (manual stop early), FR-013 (rate 1–5 or skip), FR-015 (history list — basic shape, fields added by later slices); NFR "Timer accuracy and resilience", NFR "User-perceived responsiveness", Guardrail "≤ 3 taps to running timer".
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Timer-resilience strategy — server-stored `started_at` + reconcile-on-return from wall clock, OR client-side timestamp + `visibilitychange` listener? — Owner: implementer (decided at `/10x-plan` time). Block: no.
  - Audible-cue strategy — which sound, and how to handle browsers that block autoplay before user interaction? — Owner: implementer. Block: no.
- **Risk:** This is the north star — the smallest end-to-end flow that proves the wedge. The riskiest sub-piece is timer resilience (NFR + Guardrail "timer survives short tab backgrounding"); if that breaks, the product breaks even with everything else working.
- **Status:** done

### S-02: Categorize sessions by topic and material format

- **Outcome:** User can add / rename / archive their own topics on a management screen, pick a topic on the pre-session screen, and pick a material format (video / reading / writing code / drilling problems / other) for the session. Both fields remain optional and default to empty.
- **Change ID:** `categorize-sessions-topic-format`
- **PRD refs:** FR-007 (topic picker, optional per session), FR-008 (material format picker, optional per session), FR-017 (topic add / rename / archive).
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Topic archive semantics — does an archived topic stay attached to historical sessions but hide from the picker? Strongly implied by PRD but not explicit. — Owner: project author. Block: no.
- **Risk:** Additive schema changes on `sessions` (`topic_id` FK, `material_format` column) plus a new `topics` table with its own RLS. If executed in parallel with S-03 or S-04, coordinate migration ordering — additive migrations on the same table from concurrent slices can conflict.
- **Status:** proposed

### S-03: Editable timer presets and count-up mode

- **Outcome:** User can edit the focus and break durations of each of the three preset slots (defaults 25 / 5, 45 / 10, 90 / 15), pick a count-up timer as a fourth option, and choose which mode runs for the current session (defaults to last-used).
- **Change ID:** `timer-presets-and-modes`
- **PRD refs:** FR-004 (three editable preset slots), FR-005 (count-up alternative), FR-010 (timer mode picker, optional w/ last-used default).
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:**
  - Preset-state storage — DB column on a `user_profiles` table, or localStorage? — Owner: implementer (decided at `/10x-plan` time). Block: no.
- **Risk:** Count-up timer mode changes session-save logic (no nominal preset duration to compare against); ensure FR-012's "actual elapsed time" rule from S-01 still holds. The state machine S-01 establishes is the load-bearing piece this slice extends — regression risk on timer resilience is real.
- **Status:** proposed

### S-04: Session notes and focus-rating chart

- **Outcome:** User can add an optional free-text note to a session at the end (or skip it) and see a chart of focus-rating over time on the history view, alongside the existing session list.
- **Change ID:** `session-notes-and-chart`
- **PRD refs:** FR-014 (free-text note, nice-to-have), FR-016 (focus-rating chart). Advances Secondary Success Criterion (returning student recognizes a pattern in their own logged data).
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Chart library choice on Astro + React 19 (Recharts, visx, Chart.js wrapper, hand-rolled SVG)? — Owner: implementer (decided at `/10x-plan` time). Block: no.
- **Risk:** Lowest-risk slice. The chart needs enough sessions to be meaningful, so v1 value scales with log depth — PRD acknowledges this in the Secondary criterion phrasing ("leading indicator"). If the calendar tightens, this is the slice to thin (drop FR-014 — it's the only nice-to-have FR in v1) or Park.
- **Status:** proposed

### S-05: Explicit session abandonment

- **Outcome:** User can abandon an in-progress session by tapping an "Abandon" button on the dashboard history row. Time-based auto-detection of "abandoned" sessions is removed; any session without an `ended_at` is shown as "In progress" regardless of age, and the `/session/[id]` page no longer redirects based on a fixed age threshold. Deep-work sessions longer than 50 minutes (the S-01 heuristic) are fully supported.
- **Change ID:** `explicit-session-abandon`
- **PRD refs:** FR-012 (extends the stop-early concept from the session page to a dashboard-level control for sessions the user navigated away from). No new PRD FR -- the gap was discovered in S-01 impl-review F3 (threshold inconsistency between page, dashboard, and API).
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - What happens to the API's 2-hour lower-bound plausibility check on `ended_at` once the 50-min threshold is removed? The plausibility window guards against stale-tab backdating, not session duration -- `ended_at = now()` always passes regardless of how long the session ran. Low risk; verify at plan time.
  - Does the "Abandon" action call the existing PATCH `/api/sessions/[id]` with `focus_rating: null` (treating abandon as "skip rating"), or does it need a separate endpoint / a new `abandoned` column? Decide at plan time.
- **Risk:** Small surface -- three files touched (dashboard.astro, session/[id].astro, possibly api/sessions/[id].ts). No schema change required. Primary risk is forgetting the abandoned-guard in `[id].astro` and breaking replay-protection behavior for already-ended sessions; keep that guard untouched.

### S-06: Tab title live timer

- **Outcome:** User sees the current timer value (countdown for preset sessions, count-up for open-ended sessions) reflected in the browser tab title while a session is active, so they can monitor time from the OS taskbar or a tab strip without switching focus to the app.
- **Change ID:** `tab-title-timer`
- **PRD refs:** FR-018 (tab title timer, nice-to-have), FR-011 (visible countdown -- parent timer capability this extends).
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** --
- **Unknowns:**
  - Title format while running -- e.g. `[25:00] PomoSapiens` vs `Focus 25:00 | PomoSapiens` -- and whether to show a distinct label during the break phase. -- Owner: project author. Block: no.
  - Whether the title restores to its default value on session end, on early stop (FR-012), and on page navigation away from the timer. -- Owner: implementer. Block: no.
- **Risk:** Pure client-side work (document.title updated in a React useEffect inside the running timer component). The only realistic failure mode is forgetting to clean up the effect on unmount, leaving a stale time string in the tab after the session ends. No backend changes; no new schema; no new routes.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                                         | Ready for `/10x-plan` | Notes                                 |
| ---------- | ---------------------------------- | ------------------------------------------------------------- | --------------------- | ------------------------------------- |
| S-00       | `landing-page`                     | Landing page — hero + value prop + sign-up CTA                | yes                   | Independent of F-01; can ship first   |
| F-01       | `sessions-data-foundation`         | Sessions data foundation — table + per-user RLS               | yes                   | Implemented                           |
| S-01       | `first-session-capture-loop`       | First end-to-end session capture loop (north star)            | no                    | Waits on F-01                         |
| S-02       | `categorize-sessions-topic-format` | Topic management plus per-session topic and material format   | no                    | Waits on S-01                         |
| S-03       | `timer-presets-and-modes`          | Editable timer presets, count-up, and per-session mode picker | no                    | Waits on S-01                         |
| S-04       | `session-notes-and-chart`          | Session notes plus focus-rating chart                         | no                    | Waits on S-01                         |
| S-05       | `explicit-session-abandon`         | Explicit abandon button; remove time-based auto-abandon       | no                    | Waits on S-01; parallel with S-02/3/4 |
| S-06       | `tab-title-timer`                  | Tab title shows live timer while session is running           | no                    | Waits on S-01                         |

## Open Roadmap Questions

1. **Account-merging across auth paths.** A student who first signs up via Google OAuth and later via email + password (or vice versa) ends up with two distinct accounts and split session history. Owner: project author. Block: no — v1 ships either way, but resolution affects eventual support burden.
2. **Weekly synthesized-insights report — aspirational stretch for v1.** PRD held this open rather than locking it as a non-goal; ship only if calendar permits after S-01..S-04 land. Owner: project author. Block: no.

## Parked

- **Anonymous / not-signed-in scenario backed by localStorage** — Why parked: PRD §Non-Goals — marked "Add as follow up"; v1 requires sign-in for every session. A real follow-up candidate once the signed-in capture loop validates the wedge, but not in the 3-week MVP scope.
- **Spotify / third-party music-streaming integration** — Why parked: PRD §Non-Goals — adds OAuth scope, third-party player UI, and a category of bugs that would distract from validating the contextual-data insight.
- **AI-generated animated backgrounds** — Why parked: PRD §Non-Goals — real cost in v1 (image generation, prompt UI, animation pipeline); plain static backgrounds in v1.
- **Gamification (streaks, achievements, badges, leaderboards)** — Why parked: PRD §Non-Goals — cosmetic and habit-reinforcement features, meaningless until the core capture loop is shown to be sticky.
- **Shared workspace / peer view / tutor read-access** — Why parked: PRD §Non-Goals — single-user product in v1; every session belongs to one student.
- **Long-break-after-4-Pomodoros cycle** — Why parked: PRD §Non-Goals — a session is one focus phase + (optionally) one break per preset, not a chained four-cycle workflow.
- **Data export (CSV / JSON / shareable links)** — Why parked: PRD §Non-Goals — add when a real user asks for it.
- **Offline-first guarantee** — Why parked: PRD §Non-Goals — connectivity required; offline sync is genuine work not justified by the persona.
- **Multi-region availability SLA** — Why parked: PRD §Non-Goals — single-region operation is sufficient at the medium-scale target.
- **Compliance certification beyond baseline privacy hygiene** — Why parked: PRD §Non-Goals — no HIPAA, no SOC 2, no formal accessibility certification in v1.
- **Admin user-facing UI** — Why parked: Access Control describes the Admin role conceptually ("not exposed in normal user-facing UI"; "assigned out-of-band"). No FR demands v1 admin tooling — the project owner inspects user records via Supabase Studio.
- **Account-merging UI** — Why parked: Open Roadmap Question #1; defer until real-user friction surfaces.
- **Contiue timer** - when session is closed, user can click "I'm still working" and the counter continues - it helps to protect the flow state. Why parked: It is an extension of MVP

## Done

- **F-01: (foundation) sessions data model with per-user RLS** — Archived 2026-06-02 → `context/archive/2026-05-29-sessions-data-foundation/`. Lesson: —.
- **S-00: A first-time visitor to `/` sees a hero explaining the wedge (energy-gated focus sessions with contextual capture bound to each session) and taps a primary CTA that routes to `/auth/signup`. Replaces the placeholder `src/pages/index.astro`. Authenticated visitors are redirected to `/dashboard`.** — Archived 2026-06-19 → `context/archive/2026-06-18-landing-page/`. Lesson: —.
- **S-01: User can sign in, tap "Start session" on the dashboard, pick an energy level (only required field), run a default 25 / 5 timer through focus → break with an audible cue, rate focus 1–5 or skip at the end, and see the saved session at the top of their history list.** — Archived 2026-06-21 → `context/archive/2026-06-19-first-session-capture-loop/`. Lesson: —.
