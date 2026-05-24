---
project: "PomoSapiens"
context_type: greenfield
created: 2026-05-21
updated: 2026-05-21
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "decision paralysis at session start + data captured but not synthesized"
    - topic: "primary persona"
      decision: "formal-education student (university / bootcamp / exam-prep)"
    - topic: "insight vs status quo"
      decision: "learning effectiveness is contextual (energy × time × format × focus), not durational — competitors track duration only"
    - topic: "auth model"
      decision: "OAuth-only via Google or GitHub; no email+password, no passwordless, no anonymous"
    - topic: "auth model (revised in phase 4)"
      decision: "OAuth (Google/GitHub) PLUS email+password registration; no passwordless, no anonymous"
    - topic: "roles"
      decision: "User (default) + Admin (out-of-band, for ops); no shared/peer roles in v1"
    - topic: "MVP scope"
      decision: "scope-down: v1 = session capture + simple history. Spotify, AI backgrounds, streaks, weekly AI report all deferred to v2+."
    - topic: "timeline"
      decision: "3 weeks after-hours, hard_deadline 2026-06-11"
  frs_drafted: 17
  quality_check_status: accepted
---

# PomoSapiens — Shape Notes

Seed: `idea-notes.md` (read in full at session start).

## Vision & Problem Statement

Conscious self-learners — primarily students in formal education (university, bootcamp, exam prep) — sit down to study and don't know which conditions actually produce learning. They already run Pomodoro timers and sometimes journal, so raw time data exists, but it sits unsynthesized: the student can't tell whether last Tuesday's two-hour video binge at 22:00 moved them forward or just felt like work. The cost is twofold — **decision paralysis at session start** (what should I study right now, given how I feel?) and **data captured but never turned into insight** (weeks of timers that never become "stop doing X on Thursday nights"). The downstream pain is wasted study weeks on material that won't stick, plus frustration that quietly erodes the habit.

The insight that makes PomoSapiens worth writing: **learning effectiveness is contextual, not durational.** Existing trackers (Toggl, Forest, RescueTime, Notion templates) record how long a session lasted. They do not correlate duration with the variables that actually determine retention — pre-session energy, time of day, material format (video / reading / writing code / drilling problems), topic, and self-reported focus quality. PomoSapiens captures those variables at the start and end of every session and surfaces the patterns the learner can't see by inspecting the raw log.

## User & Persona

**Primary persona — the formal-education student.** A university or bootcamp student (or an exam-prep self-studier in that life-stage) who is responsible for their own study plan across multiple subjects/courses, often with a finite deadline (semester, midterm, certification). They already use a Pomodoro timer or a similar focus-block tool because they care enough about their time to track it; they're not the casual user who needs convincing that focus matters. They reach for PomoSapiens at the moment of "I have 90 minutes before dinner — what do I open?" and again at the end of a study week when they want to know whether the week actually moved them.

## Access Control

Authentication offers **two paths in v1**: OAuth (Google or GitHub) **and** classic email + password registration / sign-in. Either path lands the student in the same dashboard; account-merging across paths is out of scope for v1 (each path produces a distinct account by default, surfaced as an Open Question if it becomes a real friction point). No passwordless magic-link path, no anonymous / local-only path in v1.

Two roles in v1:

- **User** — every signed-in student. Sees only their own sessions, ratings, dashboards, and AI reports. No visibility into other users' data, even aggregated.
- **Admin** — operational role for the project owner. Can view system-level diagnostics, inspect user records for support/debugging, and run maintenance tasks. Not a public role; assigned out-of-band (e.g., via a flag in the user record). Not exposed in normal UI.

There is no shared workspace, no peer/tutor read-access, and no team feature in v1. All access decisions reduce to "is this the session-owning user, or is this an admin?" — anything else 403s.

## Success Criteria

### Primary

- A signed-in student completes the full session-capture flow end-to-end: starts a session with topic + format + energy, runs the timer, rates focus (1–5) at the end, optionally adds a progress note, and sees that session appear in their own session history. This is the proof that v1 worked.

### Secondary

- A returning student opens their session-history view and recognizes at least one personal pattern in their own logged data — e.g. "evening sessions consistently score lower," "video lectures rate worse than coding," "Mondays after 22:00 are wasted." This is the leading indicator that the *contextual-data* insight is real, even before any AI synthesis lands.

### Guardrails

- **Session-start friction stays minimal.** Three taps maximum from the dashboard to a running timer (start → pick topic/format/energy → go). If pre-session capture becomes a chore, the student abandons before any data exists.
- **User data is private.** A student's session content (topic, notes, ratings) never appears in another user's view and is not forwarded to third-party analytics or marketing services without explicit user consent. Cross-user leakage of any field is a regression even if the primary flow works.
- **Timer survives short tab backgrounding / device sleep.** If a 25-minute session silently dies because the browser tab lost focus or the laptop slept for thirty seconds, the product breaks its core Pomodoro promise. The session must reconcile elapsed time on return.
- **First-session onboarding under 60 seconds.** From the OAuth click to a Pomodoro running for the first time. No mandatory profile setup, no settings tour gate.

## Product framing (frontmatter fields)

- `product_type: web-app` — runs in desktop and mobile browsers per the cross-browser NFRs.
- `target_scale.users: medium` — dozens to ~100 users in v1's beta window (coursemates, early adopters via personal channels).
- `target_scale.qps: low` — single-digit RPS at peak; web sessions are user-initiated and human-paced.
- `target_scale.data_volume: small` — a single user produces low single-digit MB / year of session metadata at typical study intensity.

> Socrates probe (target_scale): at 100× scale (~10k users), the per-user domain rule itself doesn't change because it operates on each student's own log. What would emerge are **anonymized cross-user benchmarks** — "students with similar topic mix typically rate 25–45 min focus blocks highest" — and quota/storage concerns. Neither is in v1 scope, but record as a v2+ direction.

## Timeline budget

- `mvp_weeks: 3`
- `hard_deadline: 2026-06-11` (three weeks from session date 2026-05-21)
- `after_hours_only: true`

## Non-Goals

### Functional non-goals (capabilities v1 explicitly does not provide)

- **No Spotify integration / embedded player.** Originally in idea-notes as a "stay in one window" feature; deferred. Adds a second OAuth scope, third-party player UI, and a category of bugs (playback stalls, account-disconnect flows) that distract from validating the contextual-data thesis.
- **No AI-generated animated backgrounds.** Originally in idea-notes; deferred. Real cost in v1 (image generation infrastructure, prompt UI, animation pipeline). Plain CSS / static backgrounds in v1.
- **No gamification — streaks, achievements, badges, leaderboards.** Originally in idea-notes; deferred. Cosmetic and habit-reinforcement features layered on top of the core capture loop; meaningless until the loop itself is shown to be sticky.
- **No shared workspace, peer view, or tutor read-access.** Single-user product. Mirrors the Phase-2 Access Control decision: every session belongs to exactly one student and is invisible to anyone else (excluding Admin for ops).
- **No long-break-after-4-Pomodoros / classic Pomodoro cycle.** A session is one focus phase + (optionally) one break phase per preset, not a chained four-cycle workflow. Mirrors FR-011.
- **No data export (CSV / JSON / shareable links).** Add when a real user asks for it. Premature in v1.

### Non-functional non-goals (quality dimensions v1 does not pursue)

- **No offline-first guarantee.** Connectivity is required to run a session, save data, and view history. Offline sync is genuine work (conflict resolution, queueing, retry) and isn't justified by the persona's behavior — university and bootcamp students study with internet available.
- **No multi-region SLA.** Single-region hosting is sufficient at the medium-scale target.
- **No compliance certification beyond baseline GDPR-style privacy.** No HIPAA, no SOC 2, no accessibility certification in v1 (basic WCAG-friendly markup is desirable but not certified).



## Functional Requirements

### Authentication & profile

- FR-001: User can sign up / sign in via Google or GitHub OAuth. Priority: must-have
  > Socrates: Counter-argument: dual auth paths double the test/recovery surface. Resolution: kept; OAuth lowers friction for tech-savvy students and is the default expectation for modern web apps. Account-merging across paths is out-of-scope for v1 — see Open Questions.
- FR-002: User can sign up / sign in via email + password (with email-verification step on registration). Priority: must-have
  > Socrates: Counter-argument considered: "OAuth-only is enough." Resolution: kept; some students are wary of granting Google/GitHub access to a personal-data app, and email+password is a familiar fallback.
- FR-003: User can sign out of an active session. Priority: must-have
  > Socrates: Counter-argument: sign-out is implied infrastructure, not a domain FR. Resolution: kept; shared devices (university libraries, dorm desktops) make explicit sign-out a real user concern, not just plumbing.

### Timer configuration

- FR-004: User has three editable timer preset slots, each defining a focus duration and a break duration (defaults: 25 / 5, 45 / 10, 90 / 15 minutes). User can edit any slot's two durations. Priority: must-have
  > Socrates: Counter-argument: classic fixed 25/5 ships in a day; configurable adds settings, validation, persistence. Resolution: kept; the Phase-1 insight (learning effectiveness is contextual) depends on heterogeneous session shapes — drill, deep reading, code-writing each want different lengths, and forcing 25 min flattens the signal we exist to capture.
- FR-005: User can choose a count-up (open-ended) timer as an alternative to the three fixed presets. Priority: must-have
  > Socrates: Counter-argument: count-up is a different mental model from Pomodoro and could be v2. Resolution: kept; some study formats (writing essays, working through a problem set) genuinely don't fit a countdown and are real student use-cases.

### Session capture — pre-session (single screen)

All four pre-session pickers (topic, format, energy, timer mode) are presented on a **single** screen so that the dashboard → pick-screen → start traversal honors the ≤ 3-tap guardrail.

- FR-006: User can start a new study session from the dashboard, which opens the single pre-session pick screen. Priority: must-have
  > Socrates: Counter-argument: a dedicated pick screen is overhead vs. inline pickers on the dashboard. Resolution: kept; a dedicated screen makes the start-of-session moment explicit and avoids cluttering the dashboard for non-starting users.
- FR-007: User can pick a topic / category for the session before it starts, from their own managed topic list. Topic is **optional** at session start; empty by default. Priority: must-have (capability) / optional (per-session field)
  > Socrates: Counter-argument: 4 required pre-session fields = 4 chances to abandon. Resolution: topic demoted to optional with empty default; only energy is required (see FR-009). Trade-off: some sessions will lack topic data and won't contribute to per-topic analysis.
- FR-008: User can pick a material format for the session (video / reading / writing code / drilling problems / other) before it starts. Format is **optional** at session start; empty by default. Priority: must-have (capability) / optional (per-session field)
  > Socrates: Same counter-argument as FR-007. Resolution: format also demoted to optional; same trade-off.
- FR-009: User must record a one-click pre-session energy level (low / medium / high) before the timer can start. Priority: must-have
  > Socrates: Counter-argument: pre-session energy is the wrong moment — users know better post-session how they actually felt. Resolution: kept as required; pre-session energy is the load-bearing variable for the contextual-data thesis (it changes the meaning of every other captured field) and post-hoc self-report contaminates with the session's outcome.
- FR-010: User can pick which timer mode to run for this session (preset 1 / 2 / 3, or count-up). Mode is **optional** at session start — defaults to the user's most-recently-used mode (or preset 1 on first session). Priority: must-have (capability) / optional (per-session field)
  > Socrates: Same counter-argument as FR-007 / FR-008. Resolution: optional with last-used default; never blocks the start.

### Session timer

- FR-011: User can run the chosen timer with a visible countdown (or count-up). If a preset with a break component is chosen, the session transitions automatically from focus → break when the focus phase ends, accompanied by a clearly audible sound effect to mark the transition. No long-break-after-4-cycles rule. Priority: must-have
  > Socrates: Counter-argument: auto-transition adds timer-state-machine complexity. Resolution: kept; auto-transition with a sound cue preserves Pomodoro UX without requiring the student to watch the screen, which is the whole point of a focus timer. State machine is core, not optional.
- FR-012: User can manually stop a session early; the partial elapsed time is recorded as the session's actual duration. Priority: must-have
  > Socrates: Counter-argument: simpler to discard early-stopped sessions. Resolution: kept; abandoned sessions are themselves signal — repeatedly stopping at minute 10 of a 25-min preset is informative about energy/material/format fit.

### Session capture — post-session

- FR-013: User is prompted at the end of the focus phase to rate focus quality on a 1–5 scale, with an explicit "skip" option alongside the scale. Priority: must-have
  > Socrates: Counter-argument: post-focus-block rating is fatigue-prone; students will tap '3' to escape. Resolution: kept; ratings are the only direct quality signal we have, but a "skip" option preserves data integrity by letting fatigued users decline rather than poisoning the rating distribution with escape-taps.
- FR-014: User can add an optional free-text note about what they accomplished in the session. Priority: nice-to-have
  > Socrates: Counter-argument: notes inflate post-session and most users skip them. Resolution: kept as nice-to-have; the few users who do leave notes provide rich qualitative data, but ship without them in v1 if the focus screen becomes cluttered.

### History & review

- FR-015: User can view a chronological list of their past sessions, each showing topic (if set), format (if set), energy, duration, focus rating (if not skipped), and (if present) note. Priority: must-have
  > Socrates: Counter-argument: history is just a log; users won't review it without a hook. Resolution: kept; the list is the raw evidence layer the chart (FR-016) and any future AI report sit on top of — without it, individual session debugging is impossible.
- FR-016: User can view a simple chart of focus-rating over time (one chart, not a full dashboard). Priority: must-have
  > Socrates: Counter-argument: with no AI report in v1, will students actually open the chart? Resolution: kept; the Secondary success criterion ("student recognizes one personal pattern") depends on having a chart, not just a list — a list reads as a log, a chart reads as a finding.

### Topic management

- FR-017: User can manage their own set of topics / categories — add, rename, archive. Priority: must-have
  > Socrates: Counter-argument: full add/rename/archive CRUD is more screen than a free-text field, and with 3 weeks every half-day matters. Resolution: kept; pre-managed topics are required by FR-007's "select from list" decision, and full CRUD is ~half a day of work — much less than the data-quality cost of unbounded free-text topic strings.

## User Stories

### US-01: Student completes a first study session

- **Given** a returning user signed in to PomoSapiens (they may or may not have topics on their list)
- **When** they tap "Start session" on the dashboard, land on the single pre-session pick screen, tap one of the three energy levels (the only required field), optionally pick a topic / format / timer mode, and tap "Start"
- **Then** the timer begins counting (≤ 3 taps from dashboard to running timer, per Guardrail); when the focus phase ends, an audible cue plays and the student is prompted to rate focus 1–5 (or tap "skip") and optionally jot a note; the saved session appears at the top of their session-history list immediately

#### Acceptance Criteria

- Energy is the only required pre-session field; topic, format, and timer mode are optional with sensible defaults (last-used for timer mode; empty for topic and format)
- Focus-rating prompt appears immediately when the focus phase ends; the student may submit a rating OR tap "skip"; either action saves the session
- The free-text note field is explicitly optional — empty submit is allowed
- An audible sound effect plays at the focus → break transition for sessions whose timer mode has a break component
- Saved session is visible in the history list within the same in-app navigation (no page reload required)
- If the user manually stops a session before the focus phase ends, they are still prompted to rate (or skip); the recorded duration is the actual elapsed time, not the preset's nominal duration

## Business Logic

**PomoSapiens treats every focus session as a data point and reveals to the student which combinations of pre-session context — energy, time of day, material format, topic — correlate with their own self-rated focus quality, so they can plan future sessions around the conditions that demonstrably work for them.**

The inputs to this rule are everything captured around a single session: the pre-session energy level (always present), optional topic and material format, the timer mode actually run, the day-of-week and time-of-day at which the focus phase ran, the elapsed duration of the focus phase, and the student's post-session focus rating (1–5 or "skip"). The output is a pattern view that lets the student see, across their own log, how their reported focus varies as those inputs change — most simply as a chart of focus-rating over time (FR-016), and more richly in future iterations as cross-tabs (e.g. "low-energy + video → median rating 2"; "high-energy + writing-code → median rating 4") and eventually an LLM-synthesized weekly report.

The student encounters the rule's output in the history view: a session list (FR-015) for raw evidence, and a focus-rating chart (FR-016) for the first visible pattern. The rule's *capture machinery* — pre-session energy as the only required field (FR-009), topic / format / mode as optional but structured (FR-007 / FR-008 / FR-010), focus rating with a skip option (FR-013) — is shaped specifically to feed this rule with clean inputs while keeping the start-of-session friction at three taps.

What the rule explicitly is NOT in v1: it is not a recommendation engine ("study X next"), it is not a prescriptive coach, and it does not infer causation. It surfaces correlations the student can interpret. AI-synthesized weekly insights (a step toward recommendation) are a deferred v2 capability.

## Non-Functional Requirements

- **User-perceived responsiveness.** The timer's visible counter updates within 200 ms of the user's "Start" tap, and routine in-app interactions (changing topics, opening history, switching tabs within the app) feel instant — there is no visible wait beyond a brief progress indicator for any non-trivial operation.
- **Privacy of session content.** A student's session content (topics, notes, focus ratings, energy levels, durations) never appears in another user's view and is not forwarded to third-party analytics, advertising, or marketing services without explicit per-action user consent. Cross-user leakage of any session field is a regression, even if the primary flow works.
- **Cross-browser support — desktop.** The product remains usable on the latest two major versions of the four mainstream desktop browsers (Chrome, Firefox, Safari, Edge). "Usable" means: OAuth + email+password sign-in succeed; the pre-session screen, the running timer, the post-session capture, and the history view all function without visual breakage or feature loss.
- **Mobile browser support.** The product is usable on the latest two major versions of the dominant mobile browsers (mobile Safari on iOS, Chrome on Android). The mobile envelope covers running a session (start → timer → rate → save) and viewing session history; timer-preset editing and topic-list management are tolerable on mobile but optimized for desktop.

## Open Questions (running)

1. **Account-merging across auth paths.** A student who first signs up via Google and later via email+password (or vice versa) ends up with two distinct accounts and split session history. Resolution path / owner: TBD. Block: no (v1 ships either way), but surface in PRD.
2. **Weekly AI / LLM report — aspirational for v1.** Phase-3 scope-down deferred this to v2; in Phase-6 the user chose not to lock it as a non-goal either. Ship-if-time-permits stretch. Owner: project author. Block: no.

## Quality cross-check

Run at end of Phase 7 (2026-05-21). All gates passed:

- Access Control — present (OAuth + email/password; User + Admin roles).
- Business Logic — present; one-sentence rule locked; explicitly not empty-CRUD.
- Project artifacts — present (this file with valid frontmatter checkpoint).
- Timeline-cost — within the default 3-week envelope; no extended-timeline acknowledgment required.
- Non-Goals — present; 6 functional + 3 non-functional non-goals.
- Preserved behavior — n/a (greenfield).

`quality_check_status: accepted`. No gaps to mirror into PRD's `## Open Questions` from this cross-check (the two Open Questions above were captured during normal phase flow, not as gate failures).

