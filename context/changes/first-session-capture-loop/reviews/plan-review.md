<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-01 First Session Capture Loop

- **Plan**: context/changes/first-session-capture-loop/plan.md
- **Mode**: Deep
- **Date**: 2026-06-19
- **Verdict**: REVISE
- **Findings**: 1 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓, 5/5 symbols ✓, brief↔plan ✓ — verified `sessions` table & columns, middleware `PROTECTED_ROUTES`, `parseJson`, `Layout`, `Topbar`, `dashboard`, `button` primitive, `energy_level` enum, Zod v4 (`^4.4.3`), shadcn new-york style. Internal consistency: Progress↔Phase block is well-formed (one heading per phase; numbering 1.1-5.11 matches Success Criteria bullets one-to-one).

## Findings

### F1 — Audio priming has no concrete fallback in Phase 4 SessionRunner

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 3 (EnergyPicker) + Phase 4 (SessionRunner) + "Critical Implementation Details" → "Audio autoplay policy"
- **Detail**: The plan primes Audio on `/session/new` (click handler creates an `HTMLAudioElement`, runs muted `.play()/.pause()`), then `window.location.assign('/session/<id>')`. A full navigation creates a new Document — user activation state does NOT reliably persist across cross-document navigation; Safari is strict and Chrome's behavior depends on Media Engagement Index. In Phase 4, `SessionRunner` constructs a *fresh* `Audio` at focus-end and calls `.play().catch(() => {})` — the catch swallows `NotAllowedError` silently, the rating view appears, and the audible-cue NFR ("clearly audible chime at focus→break") is quietly violated for any user whose browser didn't carry activation across the navigation. `plan-brief.md:109` acknowledges this exact risk and names the mitigation ("fall back to priming again at the top of `SessionRunner`'s first render with a muted `play()/pause()`"), but Phase 4's spec does not include it. The load-bearing NFR is left to chance.
- **Fix A ⭐ Recommended**: Re-prime in `SessionRunner` on mount
  - Strength: Codifies the brief's named mitigation; degrades gracefully on browsers that carried activation (no-op extra warm) and rescues those that didn't. The page itself loaded in response to a click, which most browsers count.
  - Tradeoff: One extra `Audio()` instance per session-start; trivial.
  - Confidence: HIGH — this is the well-known cross-navigation autoplay workaround, already named in plan-brief.
  - Blind spot: iOS Safari mobile may still suppress while hidden; that's noted as acceptable in plan-brief.
- **Fix B**: Surface a one-tap "Begin focus" affordance on `/session/[id]`
  - Strength: Iron-clad gesture on the same page that plays the chime.
  - Tradeoff: Adds a 4th tap, breaching the ≤ 3-tap Guardrail (US-01).
  - Confidence: HIGH — guaranteed to work but explicitly violates a named Guardrail.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — Stage-2 mount re-prime added to Phase 4 §3 SessionRunner contract; "Audio autoplay policy" detail rewritten as two-stage prime.

### F2 — PATCH /api/sessions/[id] has no "session not yet ended" guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 — End-session endpoint
- **Detail**: The endpoint runs `.update({ ended_at: now(), focus_rating }).eq("id", id).eq("user_id", user.id)` with no check that the row is still running. The Astro SSR guard on `/session/[id]` (redirects when `ended_at != null`) only helps on navigation; it does not stop two stale tabs, a fast double-tap that fires two PATCHes before navigation, or a replay from a bookmarked dev curl. Each PATCH unconditionally rewrites `ended_at` and `focus_rating`, silently overwriting prior values. The slice's column-scope-discipline rule was the whole reason the F-01 impl-review left UPDATE policy wide — the API is supposed to be the enforcement layer (research §2; plan's "Critical Implementation Details" #2). Phase 1 §3 misses one of the disciplines that scope implies: immutability of an already-ended session.
- **Fix**: Add `.is("ended_at", null)` to the update filter chain — atomic "only-if-still-running" check. The select-after-update returns no row when already ended → endpoint returns 409 (or 404). No pre-read, no race.
  - Strength: Single atomic write; no read-modify-write race; tiny code delta; matches the "API enforces column-scope" pattern the plan already commits to.
  - Tradeoff: Returns 4xx where the prior contract returned 200 — the rating UI's submit-error path already covers this (per Phase 4 spec).
  - Confidence: HIGH.
  - Blind spot: pgTAP coverage for this guard isn't in Phase 1's success criteria; worth adding to step 1.7 or the lesson-2 test-plan rollout.
- **Decision**: FIXED — `.is("ended_at", null)` added to PATCH update chain; endpoint now returns 409 on replay; manual-verification step 1.8 added.

### F3 — Manual-stop duration captures rating-decision time, contradicting FR-012

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 4 — `SessionRunner` stop-early + PATCH; "Critical Implementation Details" → "Column-scope discipline on PATCH"
- **Detail**: Plan says `ended_at` is server-set on the rating PATCH (good for column discipline). Consequence: `ended_at = now()` at rating-commit time, not at the Stop-early click or focus-end transition. The user may sit on the rating screen for 10-60 s deciding. `duration_seconds` therefore includes the rating-decision window, not the focus phase. PRD FR-012: "the partial elapsed time is recorded as the session's actual duration." Phase 4 manual-verification 4.7 even asserts `duration_seconds ≈ 25*60 - 5*60 = 1200` after Stop-early at 5:00 — only true if the user rates instantly. Worse, the same drift inflates *every* completed session's `duration_seconds` by the rating delay. Future S-04 focus-rating chart will see noisy durations.
- **Fix A ⭐ Recommended**: Two-step PATCH — first marks `ended_at` on phase transition (focus-end auto OR Stop-early click); second PATCH carries `focus_rating` only.
  - Strength: `duration_seconds` reflects actual focus elapsed (FR-012 honored); rating delay no longer pollutes the metric; column-scope rule extends naturally (each PATCH carries exactly one column).
  - Tradeoff: Two network calls instead of one; `SessionRunner` state machine grows a `phase: 'ended-pending-rating'` state.
  - Confidence: MEDIUM — clean shape, but doubles failure modes (first PATCH succeeds, second fails → row is ended with NULL `focus_rating`, indistinguishable from Skip).
  - Blind spot: How to distinguish "skipped" from "first PATCH succeeded, second never fired" — could keep a transient client flag, or accept the equivalence.
- **Fix B**: Snapshot `stopped_at` client-side, send in PATCH body, server validates `stopped_at > started_at && stopped_at <= now()` and uses it for `ended_at`.
  - Strength: Single PATCH; column-scope discipline preserved at the zod schema by validation rules.
  - Tradeoff: Client controls a timestamp the DB writes — small trust delegation. Mitigated by server-side range check.
  - Confidence: HIGH on the mechanism, MEDIUM on whether it violates the spirit of "ended_at is server-set, never from request" rule the plan codifies.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B — `endSessionSchema` extended with `ended_at: z.iso.datetime()`; PATCH endpoint validates `ended_at ∈ [now()-2h, now()+5s]`; `SessionRunner` snapshots `stoppedAtMs` at phase transition (focus-end uses nominal end; Stop-early uses `Date.now()`) and ships it in the PATCH body; "Column-scope discipline" and new "FR-012 fidelity" rules updated in Critical Implementation Details; Phase 1 verification steps 1.7/1.8/1.9 and Phase 4 step 4.7 reflect the new contract.

### F4 — Abandoned sessions never resolve; dashboard shows perpetual "in progress"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 — `/session/[id]` redirect logic; Phase 2 — dashboard history list "in progress" rendering
- **Detail**: Plan inserts at session start ("a running row exists in the DB until the user rates"). DELETE is denied (RLS + pgTAP). If the user closes the tab mid-session and never returns, the row sits forever as `ended_at IS NULL, focus_rating IS NULL`. Two consequences: (1) Dashboard history shows "in progress" for that row — a label that ceases to be true the moment the user navigated away. Multiple abandoned sessions accumulate. (2) The `/session/[id]` Astro guard only redirects when `data.ended_at !== null`. So if the user bookmarks the URL and returns hours/days later, `SessionRunner` mounts with `startedAtMs` in the deep past, computes remaining = massively negative, and immediately flips to rating phase — letting the user accidentally rate a stale session whose actual focus phase is long lost. The chime even fires on the visibilitychange path.
- **Fix**: At minimum, on `/session/[id]` SSR also redirect when `now() - started_at > 2 * focusSeconds` (session is clearly abandoned). Phase 2's history list filter shows abandoned-running rows as "Abandoned" rather than "in progress" once a similar threshold passes. Honors the spirit of "abandon-and-move-on" while preventing the accidental-rating bug.
  - Strength: Two small predicate additions; no schema change.
  - Tradeoff: Picks a heuristic threshold (2× focus) — arbitrary but reasonable for the 25-min preset.
  - Confidence: HIGH on the mechanism; MEDIUM on the chosen threshold.
  - Blind spot: A future "long meditation" or count-up preset (S-03) may need to revisit the threshold.
- **Decision**: FIXED — added "Abandoned-session guard" to Critical Implementation Details; Phase 4 `/session/[id]` SSR now redirects when `now() - started_at > 2 * focusSeconds`; Phase 2 dashboard list labels stale-NULL rows as "Abandoned"; manual verification 4.12a added.

### F5 — PROTECTED_ROUTES "/session" prefix is greedier than intended

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 — Middleware route allowlist
- **Detail**: `PROTECTED_ROUTES.some(r => pathname.startsWith(r))` with `"/session"` matches `/session/new`, `/session/<id>` (intended) — also `/sessions`, `/session-archive`, etc. (unintended; none exist today but might later). The brief named the precise URLs.
- **Fix**: Use `"/session/"` (trailing slash) so only nested paths match.
- **Decision**: FIXED — Phase 1 §4 now writes `"/session/"`.

### F6 — Layout-auto-mount makes Topbar appear on /auth/* for already-signed-in users

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 — Auto-mount Topbar in Layout; Phase 2 Manual Verification (last bullet)
- **Detail**: `AUTHED_REDIRECTS` only maps `/` → `/dashboard`; auth pages are NOT in the map. An already-authed user landing on `/auth/signin` (stale link, bookmark) will see the Topbar auto-mount (their email + Sign out + Dashboard link). Phase 2's verification ("auth pages don't [show Topbar] either") is only true for signed-out users.
- **Fix**: Either (a) extend `AUTHED_REDIRECTS` to send authed users away from `/auth/signin` and `/auth/signup` (matches the symmetric intent of the constant), or (b) clarify the verification step to say "auth pages (signed out) don't show the Topbar". (a) is strictly cleaner.
- **Decision**: FIXED via option (a) — Phase 1 §4 extends `AUTHED_REDIRECTS` with `/auth/signin` and `/auth/signup` → `/dashboard`; `/auth/confirm-email` intentionally left out; Phase 2 verification 2.7 updated.
