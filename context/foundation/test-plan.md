# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1-§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-21 (Phase 1 change opened)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost x signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ -- drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`
(excluding `node_modules`, `dist`, `build`, `context/`, `public/`).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact x likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ -- never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                       | Impact | Likelihood | Source (evidence -- not anchor)                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Timer state corrupted by tab background or device sleep -- student loses session data with no recovery path                   | High   | High       | Interview Q1; PRD NFR "timer accuracy and resilience"; PRD guardrail "timer survives short tab backgrounding"; S-01 plan: cited as "riskiest sub-piece"; hot-spot dir `src/components/session/` (3 commits/30d)                      |
| 2   | PATCH /api/sessions accepts columns outside its contract or can be called twice on an ended session -- session data corrupted | High   | High       | S-01 plan: column-scope discipline lives in API code only; RLS UPDATE policy intentionally wide; hot-spot dir `src/pages/api/sessions/` (2 commits/30d); zero JS test coverage on API layer                                          |
| 3   | Cross-user session data accessible via API or SSR -- privacy regression even if primary flow works                            | High   | Medium     | PRD NFR privacy ("cross-user leakage of any session field is a regression even if the primary flow works"); PRD Access Control; F-01 plan: wide UPDATE RLS; column-scope enforcement is API-code only                                |
| 4   | Production Supabase schema doesn't match local -- migration not applied, session saves fail in production                     | High   | Medium     | Interview Q2 (already happened on this project); roadmap S-02/S-03/S-04 (all add columns to sessions table)                                                                                                                          |
| 5   | Stuck-open session rows accumulate -- student replays rating on stale session or history shows misleading "in progress" state | Medium | High       | S-01 plan: abandoned-session guard and once-only finalization guard explicitly called out; roadmap S-05: opened specifically because threshold inconsistency discovered post-S-01; hot-spot dir `src/pages/session/` (2 commits/30d) |
| 6   | Audible focus to break cue silently blocked by browser autoplay policy -- student unaware the session ended                   | Medium | Medium     | PRD NFR "audible focus to break cue"; S-01 plan: two-stage prime implemented because Safari is strict; "verify on Chrome/Safari/Firefox" explicitly called out; hot-spot dir `src/components/session/` (3 commits/30d)               |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                    | Must challenge                                                                         | Context `/10x-research` must ground                                                                                                                       | Likely cheapest layer                                                                                                              | Anti-pattern to avoid                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| #1   | Timer displays correct remaining time after a 60-second tab background; session saves with accurate duration after visibility-change reconcile                                 | "Timer works in manual testing therefore backgrounding is handled"                     | How `visibilitychange` fires across Chrome/Safari/Firefox; how `started_at` is server-stamped vs client-read; what the wall-clock reconcile formula is    | Vitest jsdom: simulate `visibilitychange` + mock `Date.now`                                                                        | Testing with real timers only; mocking the tick loop without testing the reconcile formula               |
| #2   | PATCH with extra columns returns 4xx; PATCH on an already-ended session returns 4xx; only the two expected fields mutate on a valid call                                       | "Happy-path PATCH works therefore edge cases are safe"                                 | How the end-session Zod schema is declared; whether `ended_at` is set server-side or client-supplied; how the once-only finalization guard is implemented | Integration via `@cloudflare/vitest-pool-workers`: POST session + PATCH with forbidden columns; POST + PATCH twice on same session | Testing only the successful rating path; asserting current output without an independent oracle          |
| #3   | Fetching own sessions returns only owned rows; PATCH another user's session ID returns 403 or 404; SSR /session/[id] for another user's session redirects to /dashboard        | "RLS is on so cross-user access is impossible"                                         | How the SSR ownership check is implemented; whether PATCH relies on RLS alone or also has an explicit caller-owns-session check                           | pgTAP already covers DB read (rls_sessions.sql); integration test for cross-user PATCH; SSR redirect can be covered in e2e         | Treating pgTAP DB-layer coverage as full-stack coverage of the API boundary                              |
| #4   | Post-deploy session write + read-back succeeds in the production environment; `db:types` diff is clean after every migration is applied                                        | "Migration history command shows all applied"                                          | Whether CI runs `db:test` after apply; whether `db:types` output is committed and compared; what columns a minimal session INSERT requires                | Smoke test post-deploy (write + read session row); CI `db:types` diff gate                                                         | Relying solely on local `npm run db:test` as proof that the production schema is correct                 |
| #5   | GET /session/[id] for an already-ended session redirects to /dashboard; GET /session/[id] for a session with null `ended_at` older than the abandoned threshold also redirects | "The guard exists in code therefore replay is impossible"                              | What the abandoned-session threshold is; whether S-05 changed it; how the SSR redirect logic detects ended vs abandoned state                             | Integration: mock SSR session fetch, assert redirect for ended + abandoned cases                                                   | Testing only that a running session loads correctly without covering the ended and abandoned guard paths |
| #6   | Audio `.play()` is called at the focus to break transition; no unhandled rejection from the call                                                                               | "It played in my browser during manual testing therefore autoplay handling is correct" | How the Audio ref is constructed; whether both Stage-1 and Stage-2 prime steps are in place; which browsers enforce the strictest autoplay policy         | Integration: mock the Audio API, assert `.play()` called at the correct transition; manual smoke on Safari                         | Asserting the audio file exists without verifying that `.play()` is actually invoked at the right moment |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                   | Goal (one line)                                                                                    | Risks covered | Test types                                             | Status        | Change folder                         |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------ | ------------- | ------------------------------------- |
| 1   | Test runner bootstrap + session API contract | Set up Vitest; prove PATCH column-scope and cross-user API access at cheapest layer                | #2, #3        | Vitest (`@cloudflare/vitest-pool-workers`) integration | change opened | context/changes/testing-api-contract/ |
| 2   | Timer state machine + finalization guards    | Prove timer reconcile, stuck-open guards, and audio trigger without a full browser                 | #1, #5, #6    | Vitest (jsdom) integration                             | not started   | --                                    |
| 3   | Production schema validation gate            | Establish post-deploy smoke test + `db:types` CI diff so schema mismatch fails before users hit it | #4            | smoke + schema diff                                    | not started   | --                                    |
| 4   | E2e on full session capture flow             | Lock the user-visible success criterion as a regression gate before each future slice              | cross-cutting | Playwright e2e                                         | not started   | --                                    |

## 4. Stack

The classic test base for this project. Recommendations are grounded in
local manifests/configs plus the MCP/tools exposed in the current session.

| Layer                     | Tool                                       | Version                         | Notes                                                                                                                                           |
| ------------------------- | ------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| integration (Workers)     | Vitest + `@cloudflare/vitest-pool-workers` | Vitest >=4.1 (pool requirement) | Uses `cloudflareTest()` plugin reading `wrangler.jsonc`; Cloudflare-recommended for API route tests inside Workers runtime; checked: 2026-06-21 |
| integration (React/jsdom) | Vitest (jsdom pool)                        | >=4.1 (same install)            | Separate Vitest project config for component + timer logic tests; jsdom simulates `visibilitychange`, `document.hidden`, Audio API              |
| e2e                       | Playwright                                 | latest stable                   | Full-browser session capture flow; covers SSR redirect assertions                                                                               |
| DB layer                  | pgTAP via `supabase test db`               | bundled                         | Already wired (`supabase/tests/rls_sessions.sql` + rls_material_formats, rls_topics); covers cross-user read/write at DB level                  |
| accessibility             | none yet                                   | --                              | Not required for v1 per PRD non-goals; add if requirements change                                                                               |

**Stack grounding tools (current session):**

- Docs: Context7 available
- Search: Exa.ai (`mcp__exa__web_search_exa`) -- verified `@cloudflare/vitest-pool-workers` setup (Vitest >=4.1, `cloudflareTest()` plugin, `wrangler.jsonc` compat, official Cloudflare recommendation); checked: 2026-06-21
- Runtime/browser: none -- no Playwright MCP or browser automation tool in session; checked: 2026-06-21
- Provider/platform: Google Drive MCP available (not quality-gate relevant); no GitHub/Cloudflare/Supabase MCP in session; `gh cli` installed; checked: 2026-06-21

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.

| Gate                                     | Where                           | Required?                    | Catches                                                     |
| ---------------------------------------- | ------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| lint + typecheck                         | local + CI                      | required (already wired)     | syntactic / type drift                                      |
| pgTAP DB tests                           | local + manual pre-PR           | required (already wired)     | cross-user RLS regressions at DB layer                      |
| Vitest Workers integration               | local + CI                      | required after §3 Phase 1    | PATCH contract drift, cross-user API regressions            |
| Vitest jsdom integration                 | local + CI                      | required after §3 Phase 2    | timer reconcile regressions, finalization guard regressions |
| post-deploy smoke (session write + read) | post-merge, before prod traffic | required after §3 Phase 3    | production schema mismatch                                  |
| `db:types` diff                          | CI on PR                        | required after §3 Phase 3    | generated types out of sync with actual schema              |
| Playwright e2e on session capture flow   | CI on PR                        | required after §3 Phase 4    | broken critical user path from dashboard to history         |
| post-edit hook                           | local (agent loop)              | recommended after §3 Phase 1 | regressions at edit time                                    |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD -- see §3 Phase N."

### 6.1 Adding a Vitest Workers integration test (API route)

TBD -- see §3 Phase 1 for the PATCH column-scope and cross-user session
access patterns.

### 6.2 Adding a Vitest jsdom integration test (timer or component logic)

TBD -- see §3 Phase 2 for the visibilitychange reconcile and audio trigger
patterns.

### 6.3 Adding a test for a new session API endpoint

TBD -- see §3 Phase 1 for the POST + PATCH session endpoint pattern (Zod
schema validation, ownership check, once-only finalization guard).

### 6.4 Adding a pgTAP test for a new RLS-bearing table

- **Location**: `supabase/tests/rls_<table>.sql`
- **Pattern**: two-user fixture wrapped in `BEGIN ... ROLLBACK`; test read
  isolation, cross-user update denial, delete denial if immutable.
- **Reference test**: `supabase/tests/rls_sessions.sql`
- **Run locally**: `npm run db:test`

### 6.5 Adding a Playwright e2e test (critical user flow)

TBD -- see §3 Phase 4 for the full session capture flow pattern (dashboard
to pre-session to timer to rate to history visible).

## 7. What We Deliberately Don't Test

Exclusions agreed during the Phase 2 interview (Q5). Future contributors
should respect these unless the underlying assumption changes.

- **Landing page** -- static content with no branching logic; visual regression maintenance cost exceeds signal. Re-evaluate if the page gains conditional rendering or business logic. (Source: interview Q5.)
- **Generated TypeScript types (`src/db/database.types.ts`)** -- produced by `npm run db:types` from the live schema; `db:types` is the test. Re-evaluate if we switch type generators. (Source: interview Q5.)
- **Tailwind class names and CSS styling** -- changes frequently; snapshot tests on class strings would break on every design iteration and catch nothing real. Re-evaluate if a strict design-system token contract is adopted. (Source: interview Q5.)
- **Third-party auth providers (Google OAuth flow, Supabase email verification flow)** -- vendor-tested; our surface is the callback handler and session cookie, which e2e covers indirectly. Re-evaluate if a custom auth layer is written. (Source: interview Q5.)
- **Responsiveness and mobile layout** -- not a v1 optimization target per PRD non-goals; no screen-size assertions in the test suite. Re-evaluate at the first PRD mention of a specific mobile breakpoint requirement. (Source: interview Q5.)
- **Performance benchmarks** -- medium-scale, low-QPS per PRD frontmatter; no latency SLA demands a benchmark gate. Re-evaluate if an SLA is added. (Source: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1-§5) last reviewed: 2026-06-21
- Stack versions last verified: 2026-06-21
- AI-native tool references last verified: n/a (no AI-native layer in this rollout)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
