---
project: PomoSapiens
version: 1
status: draft
created: 2026-05-28
updated: 2026-07-15
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

| ID   | Change ID                          | Outcome (user can …)                                                                                                                | Prerequisites | PRD refs                                              | Status      |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------- | ----------- |
| S-00 | `landing-page`                     | see a landing page with value prop and sign-up CTA                                                                                  | —             | — (US-01 acquisition surface)                         | done        |
| F-01 | `sessions-data-foundation`         | (foundation) sessions data model with per-user RLS                                                                                  | —             | NFR (privacy), Access Control                         | done        |
| S-01 | `first-session-capture-loop`       | log first energy-gated session end-to-end and see it in history                                                                     | F-01          | US-01, FR-006, FR-009, FR-011, FR-012, FR-013, FR-015 | done        |
| S-02 | `categorize-sessions-topic-format` | manage topics and tag each session with topic + material format                                                                     | S-01          | FR-007, FR-008, FR-017                                | done        |
| S-03 | `timer-presets-and-modes`          | edit the three preset slots and choose count-up vs preset per session                                                               | S-01          | FR-004, FR-005, FR-010                                | done        |
| S-04 | `session-notes-and-chart`          | add a free-text note to a session and view a focus-rating chart over time                                                           | S-01          | FR-014, FR-016                                        | done        |
| S-05 | `explicit-session-abandon`         | abandon an in-progress session explicitly via a dashboard button                                                                    | S-01          | FR-012 (extends stop-early to dashboard level)        | done        |
| S-06 | `tab-title-timer`                  | see the live timer countdown in the browser tab title while a session is running                                                    | S-01          | FR-018                                                | done        |
| S-07 | `edit-delete-sessions`             | edit a logged session's duration/fields or delete an accidental session entirely                                                    | S-01          | — (gap; extends FR-015 history list)                  | done        |
| S-08 | `anonymous-sessions`               | start and complete a focus session without signing in, with topic/format/preset tagging, saved locally in-browser                   | S-01          | — (PRD §Non-Goals, flagged "Add as follow up")        | done        |
| S-09 | `anonymous-session-sync`           | have locally-stored anonymous sessions, topics, formats, and presets merged into their account after signing in/up                  | S-08          | — (PRD §Non-Goals, flagged "Add as follow up")        | not started |
| S-10 | `continue-session-past-end`        | choose to keep working past a session's scheduled end, converting it to count-up without losing the original start time             | S-03          | — (gap; extends FR-011, FR-005)                       | done        |
| S-11 | `reopen-running-session`           | return to an in-progress session from the dashboard after its tab/window was closed                                                 | S-05          | — (gap; extends FR-015)                               | done        |
| S-12 | `ui-improvements`                  | see accurate 🍅 time badges, correct stop-button wording, a pre-selected energy default, relocated badges, and a bigger timer clock | S-03          | — (cosmetic; no FR)                                   | done        |
| S-13 | `chart-tooltip-context`            | see 🍅 count and topic/format badges in the focus-rating chart tooltip instead of just the raw rating number                       | S-04          | — (gap; extends FR-016)                              | not started |

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
- **Note (2026-07-06):** Post-rating flow now shows a "Session saved" confirmation screen (rating dots, note recap) with three follow-up actions — start a new session, take a break, or go to dashboard — replacing the old immediate-redirect / silent "Take a break?" offer. Implemented ad hoc from an imported Claude Design file (`FocusRating` component), not sequenced through `/10x-plan`; e2e specs updated in place.

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
- **Status:** done

### S-03: Editable timer presets and count-up mode

- **Outcome:** User can edit the focus and break durations of each of the three preset slots (defaults 25 / 5, 45 / 10, 90 / 15), pick a count-up timer as a fourth option, and choose which mode runs for the current session (defaults to last-used).
- **Change ID:** `timer-presets-and-modes`
- **PRD refs:** FR-004 (three editable preset slots), FR-005 (count-up alternative), FR-010 (timer mode picker, optional w/ last-used default).
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:**
  - Preset-state storage — DB column on a `user_profiles` table, or localStorage? — Owner: implementer (decided at `/10x-plan` time). Block: no.
- **Risk:** Count-up timer mode changes session-save logic (no nominal preset duration to compare against); ensure FR-012's "actual elapsed time" rule from S-01 still holds. The state machine S-01 establishes is the load-bearing piece this slice extends -- regression risk on timer resilience is real. The S-05 time-based access-guard removal (50-min redirect in `session/[id].astro` + "abandoned" label in `dashboard.astro`) was folded into S-03 Phase 8 so count-up sessions of any length survive tab reload.
- **Status:** done

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
- **Status:** done

### S-05: Explicit session abandonment

- **Outcome:** User can abandon an in-progress session by tapping an "Abandon" button on the dashboard history row. Time-based auto-detection of "abandoned" sessions is removed; any session without an `ended_at` is shown as "In progress" regardless of age, and the `/session/[id]` page no longer redirects based on a fixed age threshold. Deep-work sessions longer than 50 minutes (the S-01 heuristic) are fully supported.
- **Change ID:** `explicit-session-abandon`
- **PRD refs:** FR-012 (extends the stop-early concept from the session page to a dashboard-level control for sessions the user navigated away from). No new PRD FR -- the gap was discovered in S-01 impl-review F3 (threshold inconsistency between page, dashboard, and API).
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - ~~What happens to the API's 2-hour lower-bound plausibility check on `ended_at` once the 50-min threshold is removed?~~ Resolved in S-03 Phase 8: the 2-hour PATCH window guards stale-tab backdating (`ended_at ≈ now`), not session duration -- any session length PATCHes cleanly. The 50-min redirect was removed; the PATCH guard is unchanged.
  - Does the "Abandon" action call the existing PATCH `/api/sessions/[id]` with `focus_rating: null` (treating abandon as "skip rating"), or does it need a separate endpoint / a new `abandoned` column? Decide at plan time.
- **Risk:** Small surface -- three files touched (dashboard.astro, session/[id].astro, possibly api/sessions/[id].ts). No schema change required. Primary risk is forgetting the abandoned-guard in `[id].astro` and breaking replay-protection behavior for already-ended sessions; keep that guard untouched.
- **Status:** done

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
- **Status:** done

### S-07: Edit and delete logged sessions

- **Outcome:** User can delete a logged session from the history list (e.g. a 10-second session started by accident) so it is removed completely from history and from any future focus-rating aggregates. User can also edit a logged session's duration and other captured fields (e.g. correct a count-up session that ran to 3h because the user forgot to stop the clock down to the ~1h that was actually worked). Edits and deletes are scoped to the session's owner via RLS.
- **Change ID:** `edit-delete-sessions`
- **PRD refs:** No new PRD FR — extends FR-015 (history list) with corrective controls. Gap discovered from real use: count-up mode (FR-005) and accidental session starts (FR-006) both produce history rows the user cannot currently fix.
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Which fields are editable — just `ended_at` / duration, or also energy / topic / material format / focus rating / note? Minimum useful set is duration; everything else is cheap once the edit screen exists. Decide at plan time.
  - Hard delete vs soft delete (`deleted_at` flag). Hard delete is simpler and matches user mental model ("remove completely from that list"); soft delete preserves audit trail. PRD has no retention requirement. Decide at plan time.
  - Edit UI surface — inline on the dashboard row, a modal, or a dedicated `/session/[id]/edit` page? The existing `/session/[id]` page is the natural host.
  - Whether editing `ended_at` must re-validate against the API's plausibility window (see S-05 unknown) — a corrective edit may legitimately set `ended_at` to a value far from `now()`.
- **Risk:** Small surface — one or two routes (PATCH and DELETE on `/api/sessions/[id]`; PATCH likely already exists from S-01's focus-rating flow) plus a row-level UI affordance. Primary risk is forgetting that mutations must enforce ownership at the RLS layer, not just at the API layer — the privacy NFR (cross-user leakage) explicitly covers this. Secondary risk: deletion cascading to anything that aggregates sessions (focus-rating chart in S-04) — if S-04 has shipped first, verify the chart re-derives cleanly from current rows. **Scope note (post-S-05):** the `DELETE /api/sessions/[id]` endpoint and the owner-scoped `sessions_delete_own` RLS policy already exist (added by S-05's explicit-abandon flow, fully open — not scoped to in-progress rows). S-07's remaining scope is editing a logged session's fields only; do not re-implement delete.
- **Status:** done

### S-08: Anonymous / not-signed-in session capture (localStorage-backed)

- **Outcome:** A visitor who has not signed in can start and complete a focus session (energy pick, timer, rating, optional note) directly from `/` without authentication, including topic/material-format tagging (S-02) and timer preset selection (S-03) — all backed by a local equivalent of those tables rather than Supabase. The session, plus any topics/formats/presets the visitor creates or edits, is persisted entirely in the browser's localStorage and shown in a local, session-scoped history view mirroring the signed-in dashboard. No server-side row is created and no synchronization to an account happens in this slice — that is split out to S-09.
- **Change ID:** `anonymous-sessions`
- **PRD refs:** PRD §Non-Goals — "Anonymous / not-signed-in scenario backed by localStorage" was flagged "Add as follow up" rather than a permanent non-goal. No FR currently covers this; extends US-01's capture loop (FR-006, FR-009, FR-011, FR-012, FR-013) to a non-authenticated context.
- **Prerequisites:** S-01 (reuses the timer/energy/rating state machine)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Do S-04 (notes/chart) and S-07 (edit/delete) apply to anonymous sessions in v1, or is this slice capture + tagging (topics/formats/presets) + basic history only? — Owner: project author. Block: no.
  - Multi-tab / multi-device consistency: localStorage is per-browser — accepted limitation, or does the UI need to warn about it? — Owner: implementer. Block: no.
  - Storage cleanup: does local history grow unbounded, or is there a cap (e.g., last N sessions)? — Owner: implementer. Block: no.
  - Local key/ID scheme for topics/material_formats/presets (name-keyed vs. client-generated UUID) — decided here because it directly determines the merge algorithm S-09 will need. — Owner: implementer (decided at `/10x-plan` time). Block: no.
- **Risk:** Introduces a second persistence path (localStorage) parallel to the Supabase-backed one, now spanning four tables (sessions, topics, material_formats, user_presets) instead of one, doubling the places state can live and diverge. The main hazard is silent drift between the two paths — e.g., a history or chart component that only reads from Supabase and quietly ignores anonymous sessions. Migrate-on-signup was split out to S-09 specifically to keep this slice's scope to capture + local persistence only (see `context/changes/anonymous-sessions/frame.md` for the full reframing rationale).
- **Status:** done

### S-09: Sync locally-stored anonymous data into account on sign-in/sign-up

- **Outcome:** A visitor who has been using S-08's anonymous, localStorage-backed capture and later signs up or signs in has their local sessions, topics, material formats, and presets merged into their Supabase-backed account — without creating duplicate topics/formats (respecting the existing `UNIQUE (owner_id, name)` constraint) and without re-importing sessions already synced on a prior login.
- **Change ID:** `anonymous-session-sync`
- **PRD refs:** PRD §Non-Goals — "Anonymous / not-signed-in scenario backed by localStorage" ("Add as follow up"); extends S-08 rather than a distinct FR.
- **Prerequisites:** S-08 (the local data shape and key scheme must be settled before a merge/idempotency design can be built against it)
- **Parallel with:** —
- **Blockers:** S-08 (cannot start the merge design until S-08's local storage shape is implemented)
- **Unknowns:**
  - Upsert-by-name strategy for topics/material_formats: local rows must map onto existing seeded defaults (`owner_id IS NULL`) rather than creating duplicates, and newly-created local topics/formats must upsert against the user's existing named rows post-signup. — Owner: implementer (decided at `/10x-plan` time). Block: no.
  - Idempotency: guarding against duplicate session inserts if the merge runs more than once (re-login, multiple tabs, retried request). — Owner: implementer. Block: no.
  - Merge trigger: automatic and silent on every sign-in, or an explicit user-facing action (e.g. "Import your local sessions?" confirmation)? — Owner: project author. Block: no.
  - Overall effort assessment — this slice was split out of S-08 specifically so its cost could be sized independently; if it proves large, it can stay in Parked with no impact on S-08's shipped value. — Owner: project author. Block: no.
- **Risk:** This is the harder half of what was originally scoped as one S-08 slice — reconciling two persistence backends after the fact, guarding against unique-constraint violations and duplicate imports on the merge path. If effort assessment at `/10x-plan` time shows this is disproportionately costly relative to its value, it is safe to leave parked: S-08 already ships a complete, functional anonymous experience without it.
- **Status:** not started

### S-10: Continue session past its scheduled end

- **Outcome:** When a preset session reaches its scheduled end (focus phase completes and the auto focus→break transition, or the timer, would normally fire), the user can tap "I'm still working" / "Continue" instead of stopping. The session converts to count-up mode and keeps running from its original `started_at` (elapsed time is preserved, not reset), so the user is not forced out of flow state at an arbitrary preset boundary. When they eventually do stop, the normal end-of-session flow (rating, note, history) applies as usual, and the session is recorded as having run in count-up mode for its total elapsed duration.
- **Change ID:** `continue-session-past-end`
- **PRD refs:** No new PRD FR — extends FR-011 (auto focus→break transition) and FR-005 (count-up mode, delivered by S-03). Gap identified from real use, tracked in Parked ("Contiue timer" / "Continue focus") before promotion.
- **Prerequisites:** S-03 (count-up mode must exist — this slice converts a running preset session into one)
- **Parallel with:** S-02, S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Trigger point — does "Continue" appear only at the moment the focus phase would auto-transition to break, or also at break-end, or as a persistent option throughout the running timer? — Owner: project author. Block: no.
  - Whether the audible end-of-focus cue (S-01) still fires when "Continue" is available, so the decision point is noticeable. — Owner: implementer. Block: no.
  - History / dashboard display — how a session that started as a preset and converted to count-up mid-flight should be labeled (e.g. does the 🍅 badge / duration display reflect the original preset or the final count-up total?). — Owner: implementer (decided at `/10x-plan` time). Block: no.
  - Whether "Continue" is offered on break-phase end too, or focus-phase end only. — Owner: project author. Block: no.
- **Risk:** Touches the core timer state machine established in S-01 and extended by S-03's count-up mode. The main hazard is a session's `timer_mode` changing mid-flight — any code that assumes a session's mode is fixed for its lifetime (e.g. save logic, S-05's abandon flow, S-06's tab-title timer) needs re-checking against this new transition. Must not break the existing auto focus→break transition or explicit stop-early/abandon paths for sessions that don't use "Continue".
- **Status:** done

### S-11: Re-open a running session from the dashboard

- **Outcome:** A dashboard row for an in-progress session (no `ended_at`) shows a "Resume" control that takes the user back to that session's `/session/[id]` page, correctly redrawing the running timer via S-01's `started_at`-based reconciliation. Today, once the session tab/window is closed, its UUID is lost and the dashboard only lets the user see that a session is running or abandon it — there is no way back into it. Ended sessions are unaffected; this only adds a control to in-progress rows.
- **Change ID:** `reopen-running-session`
- **PRD refs:** No new PRD FR — extends FR-015 (history list) with a dashboard-level control for in-progress sessions, in the same spirit as S-05's abandon button. Gap discovered from real use: session URLs contain a UUID with no other way to recover it once the page is closed.
- **Prerequisites:** S-05 (established the dashboard's row-level control pattern for in-progress sessions and the abandoned-guard on `/session/[id]`)
- **Parallel with:** S-02, S-04, S-06, S-07, S-10 (coordinate with S-10 if both touch `session/[id].astro` in the same window)
- **Blockers:** —
- **Unknowns:**
  - UI affordance — a "Resume" link/button on the row, or making the whole in-progress row clickable? — Owner: implementer. Block: no.
  - Nothing in v1 prevents multiple in-progress sessions existing at once (no single-active-session guarantee); this slice does not add that guarantee, so each in-progress row gets its own independent "Resume" link. — Owner: project author. Block: no.
  - Whether reopening needs any additional state check beyond what S-01's load-time reconciliation and S-05's abandoned-guard already provide. — Owner: implementer. Block: no.
- **Risk:** Small, additive UI change — one new link on dashboard rows, reusing the existing `/session/[id]` route and S-01's timer-resilience reconciliation to redraw elapsed/remaining time correctly on reopen. Primary risk is ownership and state correctness: the link must only ever navigate to sessions the current user owns (already enforced by RLS) and must not resurrect an abandoned or already-ended session's running-timer UI — reuse S-05's abandoned-guard on `/session/[id]` rather than re-deriving it.
- **Status:** done

### S-12: UI improvements bundle

- **Outcome:** User sees five small polish changes bundled together: session-history badges show actual time as 🍅 (one per 20 min) instead of P1/P2/P3/∞; the stop control on a count-up session reads "Stop" instead of "Stop early" (there's no "early" without a fixed duration); the pre-session energy picker defaults to "Medium" instead of requiring an explicit pick; the time badges sit directly above the "Start" button; and the running-timer clock face is noticeably bigger.
- **Change ID:** `ui-improvements`
- **PRD refs:** — no direct FR; cosmetic polish bundle promoted from Parked ("UI improvements") 2026-07-12.
- **Prerequisites:** S-03 (preset badges and count-up stop-button wording were established there)
- **Parallel with:** S-09, S-10, S-11
- **Blockers:** —
- **Unknowns:**
  - Whether defaulting energy to "Medium" changes the "energy required" behavior (FR-009) now that a value is always pre-selected, or whether the user must still actively confirm it. — Owner: project author. Block: no.
  - How the 🍅 time badge renders for count-up (∞) sessions — keep the ∞ symbol, or show a running tomato count? — Owner: implementer. Block: no.
- **Risk:** Five independent, low-risk cosmetic changes with no schema or API impact — pure frontend. The only coordination risk is touching the same files (`dashboard.astro`, `session/[id].astro`) as S-10 / S-11 if picked up in the same window.
- **Status:** done

### S-13: Focus-rating chart tooltip shows meaningful context

- **Outcome:** User hovers a point on the focus-rating chart (`FocusRatingChart`, `src/components/dashboard/FocusRatingChart.tsx`) and sees, alongside the focus rating already shown, the session's energy level, duration, 🍅 count, and its topic/material-format badges (when present) — instead of just the bare `focus_rating` number.
- **Change ID:** `chart-tooltip-context`
- **PRD refs:** No new PRD FR — extends FR-016 (focus-rating chart, delivered by S-04). Gap promoted from Parked ("Graph tooltip showing meaningful data") 2026-07-15.
- **Prerequisites:** S-04 (the chart and its tooltip must exist to extend)
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:**
  - Whether sessions with no topic/format (both optional per S-02) should omit those badge rows entirely from the tooltip, or show an explicit "no topic" placeholder. — Owner: project author. Block: no.
- **Risk:** Small, additive, frontend-only slice. `SessionListItem` (`src/lib/types.ts`) already carries `topic`, `material_format`, and `duration_seconds`, and `tomatoCount()` (`src/lib/session/format.ts`) already derives the 🍅 count from duration — reused by `DurationLabel.tsx`. The work is: thread the extra fields through the `sessions` prop into `FocusRatingChart` (currently narrowed to `{ started_at, focus_rating }`) and swap Recharts' default `Tooltip` for a custom `content` renderer. No schema or API change.
- **Status:** not started

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                                                                         | Ready for `/10x-plan` | Notes                                                                                                           |
| ---------- | ---------------------------------- | --------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| S-00       | `landing-page`                     | Landing page — hero + value prop + sign-up CTA                                                | yes                   | Implemented                                                                                                     |
| F-01       | `sessions-data-foundation`         | Sessions data foundation — table + per-user RLS                                               | yes                   | Implemented                                                                                                     |
| S-01       | `first-session-capture-loop`       | First end-to-end session capture loop (north star)                                            | no                    | Implemented                                                                                                     |
| S-02       | `categorize-sessions-topic-format` | Topic management plus per-session topic and material format                                   | no                    | Implemented                                                                                                     |
| S-03       | `timer-presets-and-modes`          | Editable timer presets, count-up, and per-session mode picker                                 | no                    | Implemented                                                                                                     |
| S-04       | `session-notes-and-chart`          | Session notes plus focus-rating chart                                                         | no                    | Implemented                                                                                                     |
| S-05       | `explicit-session-abandon`         | Explicit abandon button; remove time-based auto-abandon                                       | no                    | Implemented                                                                                                     |
| S-06       | `tab-title-timer`                  | Tab title shows live timer while session is running                                           | no                    | Implemented                                                                                                     |
| S-07       | `edit-delete-sessions`             | Edit a logged session's fields or delete it from history                                      | no                    | Implemented                                                                                                     |
| S-08       | `anonymous-sessions`               | Anonymous session capture backed by localStorage (sessions, topics, formats, presets)         | no                    | Implemented                                                                                                     |
| S-09       | `anonymous-session-sync`           | Merge anonymous local data into account on sign-in/sign-up                                    | no                    | Split out of original S-08 scope via `/10x-frame` 2026-07-11; see `context/changes/anonymous-sessions/frame.md` |
| S-10       | `continue-session-past-end`        | Continue past a session's scheduled end, converting it to count-up                            | no                    | Promoted from Parked ("Contiue timer" / "Continue focus") 2026-07-12                                            |
| S-11       | `reopen-running-session`           | Resume an in-progress session from the dashboard                                              | no                    | Promoted from Parked ("Re-open running session from a dashboard") 2026-07-12                                    |
| S-12       | `ui-improvements`                  | UI improvements bundle — time badges, stop-button wording, energy default, layout, clock size | no                    | Promoted from Parked ("UI improvements") 2026-07-12                                                             |
| S-13       | `chart-tooltip-context`            | Focus-rating chart tooltip shows 🍅 count and topic/format badges                             | no                    | Promoted from Parked ("Graph tooltip showing meaningful data") 2026-07-15                                       |

## Open Roadmap Questions

1. **Account-merging across auth paths.** A student who first signs up via Google OAuth and later via email + password (or vice versa) ends up with two distinct accounts and split session history. Owner: project author. Block: no — v1 ships either way, but resolution affects eventual support burden.
2. **Weekly synthesized-insights report — aspirational stretch for v1.** PRD held this open rather than locking it as a non-goal; ship only if calendar permits after S-01..S-04 land. Owner: project author. Block: no.

## Parked

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
- **Account deletion (GDPR right to erasure)** — User can permanently delete their account and all associated data (sessions, topics, profile) from within the app, satisfying GDPR Art. 17. Why parked: requires a hard-delete or anonymisation cascade across all user-owned tables, a confirmation UX with a mandatory re-auth step, and a Supabase Auth user deletion call -- non-trivial work that has no impact on the MVP capture loop. Revisit once the product has real users who may invoke their erasure right.
- **Web Notifications API fallback for focus-end chime** — request `Notification.requestPermission()` inside the "Start session" click and, if granted, fire a system notification at focus-end alongside (or instead of) the `<audio>` chime. Motivation: when the user refreshes the session page mid-session, the reloaded document has no transient user activation and browsers block unmuted `<audio>.play()` at fire-time -- so the chime is silent even though the timer works. A Notification does not require gesture at fire-time and survives refresh, tab-switch, and minimised windows. Why parked: MVP already ships an audible chime on the happy path (no refresh); the refresh-without-interaction hole is real but narrow. Revisit after MVP to close it. Also consider pairing with a purely-visual fallback (S-06 tab-title timer + favicon swap + full-screen "Focus done" banner) that requires no permission.
  Another option to consider is to show popup on the page after refresh - it will request user' interaction and unlocks chime (right?)
- **Server-side ownership validation of `topic_id` / `material_format_id` on session writes** — the session write schemas (`createSessionSchema`, and the planned `editSessionSchema` for S-07) validate `topic_id` / `material_format_id` as well-formed UUIDs only, not that the referenced topic/format belongs to the caller. Postgres FK checks bypass RLS, so a user could associate their own session with another user's topic/format UUID (they still can't read that row's name via RLS, so the leak is narrow). Fix would add an owner-scoped existence check (or a trigger/RLS `WITH CHECK`) on both write paths — `POST /api/sessions` and `PUT /api/sessions/[id]`. Why parked: pre-existing behavior shared by the create path, not introduced by S-07; the privacy impact is limited (no cross-user data is readable). Surfaced during the S-07 (`edit-delete-sessions`) plan review; tighten across both write paths together, outside MVP.
- **Add session manually** it is possible that user wants to track also "unplanned" session - he just started timer on his stopwatch and jumped into deep work. when he is done, he realized he was working for 1h and really wants to add this to his dashboard - why don't we allow that? He can add a session with its start time, duration and other fields and this entry will be visible on a dashboard.
- **Timeline graph** shows focus session on a timeline. Add dynamic coloring based on topic or format. Place focus / energy rating (checkboxes to enable/disable it on the view). Define time scale (day, week, month) and range (e.g. January, March, CW22)
- **Summary statistics** - total time spend in given project. Weekly summary in a table

## Done

- **F-01: (foundation) sessions data model with per-user RLS** — Archived 2026-06-02 → `context/archive/2026-05-29-sessions-data-foundation/`. Lesson: —.
- **S-00: A first-time visitor to `/` sees a hero explaining the wedge (energy-gated focus sessions with contextual capture bound to each session) and taps a primary CTA that routes to `/auth/signup`. Replaces the placeholder `src/pages/index.astro`. Authenticated visitors are redirected to `/dashboard`.** — Archived 2026-06-19 → `context/archive/2026-06-18-landing-page/`. Lesson: —.
- **S-01: User can sign in, tap "Start session" on the dashboard, pick an energy level (only required field), run a default 25 / 5 timer through focus → break with an audible cue, rate focus 1–5 or skip at the end, and see the saved session at the top of their history list.** — Archived 2026-06-21 → `context/archive/2026-06-19-first-session-capture-loop/`. Lesson: —.
- **S-02: manage topics and tag each session with topic + material format** — Archived 2026-06-28 → `context/archive/2026-06-27-categorize-sessions-topic-format/`. Lesson: —.
- **S-03: edit the three preset slots and choose count-up vs preset per session** — Archived 2026-07-04 → `context/archive/2026-06-28-timer-presets/`. Lesson: —.
- **S-04: User can add an optional free-text note to a session at the end (or skip it) and see a chart of focus-rating over time on the history view, alongside the existing session list.** — Archived 2026-07-04 → `context/archive/2026-07-04-session-notes-and-chart/`. Lesson: —.
- **S-05: abandon an in-progress session explicitly via a dashboard button** — Archived 2026-07-07 → `context/archive/2026-07-06-explicit-session-abandon/`. Lesson: —.
- **S-06: see the live timer countdown in the browser tab title while a session is running** — Archived 2026-07-07 → `context/archive/2026-07-07-tab-title-timer/`. Lesson: —.
- **S-07: User can delete a logged session from the history list (e.g. a 10-second session started by accident) so it is removed completely from history and from any future focus-rating aggregates. User can also edit a logged session's duration and other captured fields (e.g. correct a count-up session that ran to 3h because the user forgot to stop the clock down to the ~1h that was actually worked). Edits and deletes are scoped to the session's owner via RLS.** — Archived 2026-07-10 → `context/archive/2026-07-08-edit-delete-sessions/`. Lesson: —.
- **S-08: A visitor who has not signed in can start and complete a focus session (energy pick, timer, rating, optional note) directly from `/` without authentication, including topic/material-format tagging (S-02) and timer preset selection (S-03) — all backed by a local equivalent of those tables rather than Supabase. The session, plus any topics/formats/presets the visitor creates or edits, is persisted entirely in the browser's localStorage and shown in a local, session-scoped history view mirroring the signed-in dashboard. No server-side row is created and no synchronization to an account happens in this slice — that is split out to S-09.** — Archived 2026-07-12 → `context/archive/2026-07-11-anonymous-sessions/`. Lesson: —.
- **S-12: User sees five small polish changes bundled together: session-history badges show actual time as 🍅 (one per 20 min) instead of P1/P2/P3/∞; the stop control on a count-up session reads "Stop" instead of "Stop early" (there's no "early" without a fixed duration); the pre-session energy picker defaults to "Medium" instead of requiring an explicit pick; the time badges sit directly above the "Start" button; and the running-timer clock face is noticeably bigger.** — Archived 2026-07-12 → `context/archive/2026-07-12-ui-improvements/`. Lesson: —.
- **S-11: A dashboard row for an in-progress session (no `ended_at`) shows a "Resume" control that takes the user back to that session's `/session/[id]` page, correctly redrawing the running timer via S-01's `started_at`-based reconciliation. Today, once the session tab/window is closed, its UUID is lost and the dashboard only lets the user see that a session is running or abandon it — there is no way back into it. Ended sessions are unaffected; this only adds a control to in-progress rows.** — Archived 2026-07-13 → `context/archive/2026-07-13-reopen-running-session/`. Lesson: —.
- **S-10: When a preset session reaches its scheduled end (focus phase completes and the auto focus→break transition, or the timer, would normally fire), the user can tap "I'm still working" / "Continue" instead of stopping. The session converts to count-up mode and keeps running from its original `started_at` (elapsed time is preserved, not reset), so the user is not forced out of flow state at an arbitrary preset boundary. When they eventually do stop, the normal end-of-session flow (rating, note, history) applies as usual, and the session is recorded as having run in count-up mode for its total elapsed duration.** — Archived 2026-07-13 → `context/archive/2026-07-13-continue-session-past-end/`. Lesson: —.
