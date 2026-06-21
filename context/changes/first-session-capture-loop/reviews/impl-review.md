<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01 First Session Capture Loop

- **Plan**: context/changes/first-session-capture-loop/plan.md
- **Scope**: All 5 phases (full plan)
- **Date**: 2026-06-19
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Lessons honored: L-01 (column-scope), L-02 (two-stage audio prime), L-03 (server-anchor timer). No deviations.

Automated verification re-run on this branch:
- `npm run lint` — PASS (HEAD)
- `npm run build` — PASS (HEAD)
- `npm run db:test` — trusted from commit 8a7b90e (Docker stack not running at review time)

## Findings

### F1 — Chime asset is ~11× the planned size budget

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: public/audio/chime.mp3
- **Detail**: Plan §"Critical Implementation Details" and §"Performance Considerations" budget the chime at "~25 KB" / "target < 25 KB" so it bundles cheaply with worker static assets and primes quickly. The shipped file is 269,582 bytes (~263 KB) — confirmed via `wc -c`. Functionally still works; concretely inflates Cloudflare worker static-asset payload and slows the Stage-2 prime fetch in src/components/session/SessionRunner.tsx:32. Commit `2ae0a72 update chime` shows the swap was intentional.
- **Fix**: Re-encode to mono ~64 kbps (or shorten to ~1 s) to land near 20-30 KB, or amend the plan/lessons to record the revised budget so the target isn't silently abandoned.
- **Decision**: PENDING

### F2 — Dashboard markup skips the installed shadcn Card primitive

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard.astro:88-131
- **Detail**: Phase 2 §1 installed src/components/ui/card.tsx specifically so the dashboard history rows could use `Card` / `CardHeader` / `CardContent`. The implementation renders raw `<div>`s with matching Tailwind tokens instead; visually identical, but the Card primitive sits unused on the dashboard. Likely the intentional palette work from S-00 made raw divs sufficient and `Card` got skipped — worth a deliberate decision rather than silent drift.
- **Fix**: Either swap the divs for `Card` to honor the plan, or note explicitly in the plan/follow-ups that raw divs were preferred (so the install isn't questioned later).
- **Decision**: PENDING

### F3 — "Abandoned" threshold differs between page (50 min) and API (2 h)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/pages/session/[id].astro:37-41 vs src/pages/api/sessions/[id].ts:10-39
- **Detail**: `[id].astro` redirects to /dashboard once `now - started_at` exceeds `2 * FOCUS_PRESET_SECONDS * 1000` (50 min), the same threshold dashboard.astro uses to render "Abandoned". The PATCH endpoint accepts any `ended_at` within a 2-hour lower bound. A row the dashboard already labels "Abandoned" can therefore still be ended via a hand-crafted PATCH (RLS keeps this scoped to the owner; not exploitable, just an internal inconsistency). Two thresholds means two opinions on what "abandoned" means.
- **Fix**: Promote the threshold to a shared constant in src/lib/ (e.g. `ABANDONED_AGE_MS`) and import it in `[id].astro`, `dashboard.astro`, and the API. The plan called the 50 min number a heuristic for the 25-min preset -- keep the single definition somewhere S-03 can swap when long presets land.
- **Decision**: SKIPPED -- redesigned as S-05 (explicit-session-abandon). Time-based auto-detection of "abandoned" is the wrong model; deep work sessions can run 2+ hours. S-05 removes the time threshold entirely and replaces it with an explicit "Abandon" button on the dashboard. See context/foundation/roadmap.md §S-05.

### F4 — Chime README claims CC BY 4.0 but plan called for CC0

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: public/audio/README.md
- **Detail**: Plan Phase 4 §1 calls for "a short CC0-licensed chime/bell" sourced from Freesound/Pixabay. The shipped README attributes "Free Sounds Library" under CC BY 4.0. CC BY 4.0 requires attribution — the README provides it, so legally clean — but the license deviates from the stated intent and the README lacks the specific source URL for the track itself.
- **Fix**: Either swap in a true CC0 sample (then trim the attribution requirements), or update plan/lessons to allow CC BY 4.0 with attribution and add the source URL line so the attribution is complete.
- **Decision**: FIXED -- updated public/audio/README.md with the track title, direct source URL (https://www.freesoundslibrary.com/dinner-bell-sound/), and CC BY 4.0 license line. Attribution is now complete.

### F5 — Chime AudioElement leaks on SessionRunner unmount

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/session/SessionRunner.tsx:31-45
- **Detail**: The Stage-2 prime effect constructs `new Audio(...)`, stores it in `audioRef.current`, and runs the muted warm-up. The effect returns no cleanup, so on unmount (e.g. user clicks Sign out mid-session, or React 19 strict-mode double-invokes) the HTMLAudioElement and its decoded buffer linger until GC. Low impact in production but worth a cleanup line.
- **Fix**: Add return `() => { audio.pause(); audio.src = ""; audio.load(); audioRef.current = null; }` to the mount effect.
- **Decision**: FIXED -- cleanup return added to the Stage-2 prime useEffect in SessionRunner.tsx.

### F6 — visibilitychange handler can fire with a stale `phase`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/session/SessionRunner.tsx:72-91
- **Detail**: The visibility effect closure captures `phase`; it re-subscribes when `phase` changes. If `handleStopEarly` runs and a `visibilitychange` is dispatched in the same task before React commits and re-attaches the listener, the old closure would still see `phase === "running"` and overwrite `stoppedAtMs` with the nominal end-of-focus moment — wiping out the actual stop time the user just captured. Extremely unlikely in practice (requires tab-switch in the same tick as the Stop click), but FR-012 fidelity is the load-bearing rule the slice exists to protect.
- **Fix**: Guard inside the handler on `stoppedAtMs === null` rather than `phase === "running"`. The "running" check then becomes redundant with state and immune to the stale-closure window.
- **Decision**: FIXED -- guard changed from `phase === "running"` to `stoppedAtMs === null`; dependency array updated from `[phase, ...]` to `[stoppedAtMs, ...]` in SessionRunner.tsx.
