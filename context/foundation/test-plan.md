# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1-§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-26 (Phase 4 complete)

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

| Risk | What would prove protection                                                                                                                                                                                           | Must challenge                                                                         | Context `/10x-research` must ground                                                                                                                       | Likely cheapest layer                                                                                                                                                                                                                                                                           | Anti-pattern to avoid                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| #1   | Timer displays correct remaining time after a 60-second tab background; session saves with accurate duration after visibility-change reconcile                                                                        | "Timer works in manual testing therefore backgrounding is handled"                     | How `visibilitychange` fires across Chrome/Safari/Firefox; how `started_at` is server-stamped vs client-read; what the wall-clock reconcile formula is    | Vitest jsdom: simulate `visibilitychange` + mock `Date.now`                                                                                                                                                                                                                                     | Testing with real timers only; mocking the tick loop without testing the reconcile formula               |
| #2   | PATCH with extra columns returns 4xx; PATCH on an already-ended session returns 4xx; only the two expected fields mutate on a valid call                                                                              | "Happy-path PATCH works therefore edge cases are safe"                                 | How the end-session Zod schema is declared; whether `ended_at` is set server-side or client-supplied; how the once-only finalization guard is implemented | Integration via `@cloudflare/vitest-pool-workers`: POST session + PATCH with forbidden columns; POST + PATCH twice on same session                                                                                                                                                              | Testing only the successful rating path; asserting current output without an independent oracle          |
| #3   | Fetching own sessions returns only owned rows; PATCH another user's session ID returns 409 (intentionally indistinguishable from already-ended); SSR /session/[id] for another user's session redirects to /dashboard | "RLS is on so cross-user access is impossible"                                         | How the SSR ownership check is implemented; whether PATCH relies on RLS alone or also has an explicit caller-owns-session check                           | pgTAP (rls_sessions.sql) gates DB-layer access denial; API integration test (sessions.end.test.ts) pins 409 response shape and information-hiding at the API boundary -- not access-denial itself (RLS always fires at DB layer regardless of API guard); SSR redirect covered in e2e (Phase 4) | Treating pgTAP DB-layer coverage as full-stack coverage of the API boundary                              |
| #4   | Post-deploy session write + read-back succeeds in the production environment; `db:types` diff is clean after every migration is applied                                                                               | "Migration history command shows all applied"                                          | Whether CI runs `db:test` after apply; whether `db:types` output is committed and compared; what columns a minimal session INSERT requires                | Smoke test post-deploy (write + read session row); CI `db:types` diff gate                                                                                                                                                                                                                      | Relying solely on local `npm run db:test` as proof that the production schema is correct                 |
| #5   | GET /session/[id] for an already-ended session redirects to /dashboard; GET /session/[id] for a session with null `ended_at` older than the abandoned threshold also redirects                                        | "The guard exists in code therefore replay is impossible"                              | What the abandoned-session threshold is; whether S-05 changed it; how the SSR redirect logic detects ended vs abandoned state                             | Integration: mock SSR session fetch, assert redirect for ended + abandoned cases                                                                                                                                                                                                                | Testing only that a running session loads correctly without covering the ended and abandoned guard paths |
| #6   | Audio `.play()` is called at the focus to break transition; no unhandled rejection from the call                                                                                                                      | "It played in my browser during manual testing therefore autoplay handling is correct" | How the Audio ref is constructed; whether both Stage-1 and Stage-2 prime steps are in place; which browsers enforce the strictest autoplay policy         | Integration: mock the Audio API, assert `.play()` called at the correct transition; manual smoke on Safari                                                                                                                                                                                      | Asserting the audio file exists without verifying that `.play()` is actually invoked at the right moment |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                   | Goal (one line)                                                                                    | Risks covered | Test types                                             | Status      | Change folder                                   |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------ | ----------- | ----------------------------------------------- |
| 1   | Test runner bootstrap + session API contract | Set up Vitest; prove PATCH column-scope and cross-user API access at cheapest layer                | #2, #3        | Vitest (`@cloudflare/vitest-pool-workers`) integration | complete    | context/changes/testing-api-contract/           |
| 2   | Timer state machine + finalization guards    | Prove timer reconcile, stuck-open guards, and audio trigger without a full browser                 | #1, #5, #6    | Vitest (jsdom) integration                             | complete    | context/changes/testing-timer-sm/               |
| 3   | Production schema validation gate            | Establish post-deploy smoke test + `db:types` CI diff so schema mismatch fails before users hit it | #4            | smoke + schema diff                                    | complete    | context/changes/testing-schema-validation-gate/ |
| 4   | E2e on full session capture flow             | Lock the user-visible success criterion as a regression gate before each future slice              | cross-cutting | Playwright e2e                                         | complete    | context/changes/testing-e2e-session-capture-flow/ |

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
| post-deploy smoke (session write + read) | post-merge, before prod traffic | required (active)            | production schema mismatch                                  |
| `db:types` diff                          | CI on PR                        | required (active)            | generated types out of sync with actual schema              |
| Playwright e2e on session capture flow   | CI on PR                        | required (active)            | broken critical user path from dashboard to history         |
| post-edit hook                           | local (agent loop)              | recommended after §3 Phase 1 | regressions at edit time                                    |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD -- see §3 Phase N."

### 6.1 Adding a Vitest Workers integration test (API route)

- **Location**: `tests/integration/api/<route>.test.ts` -- one file per route group (e.g. `sessions.create.test.ts` for POST `/api/sessions`, `sessions.end.test.ts` for PATCH `/api/sessions/[id]`).
- **Pattern**:
  1. Import `SELF` from `cloudflare:test`.
  2. In `beforeAll`, call `setupTwoUsers()` from `tests/_fixtures/auth.ts` to provision two ephemeral Supabase users and obtain their session cookies. Store the returned `cookieFor` function and `cleanup`.
  3. In `afterAll`, call `cleanup()` to delete both users (cascades session rows via FK).
  4. Each test fires requests via `SELF.fetch(url, { method, headers: { Cookie: cookieFor(user.id), "Content-Type": "application/json" }, body: JSON.stringify({...}) })`.
  5. For "no mutation" assertions (cross-user, column-scope), use `readSession(id)` from `tests/_fixtures/db.ts` -- it reads the row via the service-role client, bypassing RLS.
- **Reference test**: `tests/integration/api/sessions.end.test.ts` -- specifically the `"column-scope: extra body keys stripped by Zod and only declared columns written (regression gate for L-01)"` test as the canonical template for column-scope regression gates.
- **Run locally**: `npm test` (all files); `npm test -- tests/integration/api/<file>.test.ts` (single file); `npx vitest` (watch mode).

### 6.2 Adding a Vitest jsdom integration test (timer or component logic)

- **Location**: `tests/unit/<concern>/<name>.test.ts` -- pure unit tests live alongside concern (e.g. `tests/unit/timer/useFocusTimer.test.ts`, `tests/unit/session/resolveSessionPageAccess.test.ts`). One file per hook or pure function.
- **Pattern**:
  1. Import `vi`, `describe`, `it`, `expect`, `beforeEach`, `afterEach` from `vitest`.
  2. For hook tests: import `renderHook`, `act` from `@testing-library/react`.
  3. For tests touching Date / setTimeout: `beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','Date','queueMicrotask'] }))`; `afterEach(() => vi.useRealTimers())`.
  4. For visibilitychange: use `dispatchVisibilityChange('hidden')` / `dispatchVisibilityChange('visible')` from `tests/unit/_setup.ts`.
  5. For audio: use `stubAudioGlobal()` from `tests/unit/_setup.ts`; access mock instances via the returned `instances` array; call `restore()` in `afterEach`.
  6. Always wrap timer advances and event dispatches in `act(() => ...)` when testing hooks.
- **Reference test**: `tests/unit/timer/useFocusTimer.test.ts` -- specifically the "reconciles after tab background" test as the canonical L-03 regression gate template.
- **Run locally**: `npm test` (both projects); `npm test -- tests/unit/...` (jsdom only by include filter); `npx vitest --project jsdom` (jsdom project watch mode).

### 6.3 Adding a test for a new session API endpoint

Any endpoint that writes to `public.sessions` (or any RLS-bearing table with a wide UPDATE policy) must follow the column-scope discipline from L-01:

- **Endpoint rule**: hand-pick columns in `.update({...})` or `.insert({...})` -- never spread `parsed.data` into a write call.
- **Test rule**: the test file MUST include a regression test that sends a request body containing forbidden columns (`user_id`, or any column outside the declared write set) and asserts via `readSession(id)` (service-role read-back) that those columns were not mutated on the stored row.
- **Two-layer guarantee**: column-scope relies on two independent guards -- (1) Zod's default-strip (non-passthrough `z.object()`) discards unknown body keys before they reach `parsed.data`; (2) the hand-picked write set in `.update({...})` pins which columns are touched. A regression test catches the combined failure (schema widened to accept a protected column AND endpoint spreads `parsed.data`). It does NOT trip on a pure `.update(parsed.data)` refactor alone while the schema only defines the intended write columns -- because in that state `parsed.data` equals the hand-picked set. Document both layers in any new column-scope test comment.
- **Reference tests**:
  - POST column-scope: `tests/integration/api/sessions.create.test.ts` -- `"server-stamps user_id from the session, ignoring the request body (regression gate for L-01)"`.
  - PATCH column-scope: `tests/integration/api/sessions.end.test.ts` -- `"column-scope: extra body keys stripped by Zod and only declared columns written (regression gate for L-01)"`.
- **Schema validation pattern**: assert the field-named error prefix (`/^<field>:/`) from `parseJson` -- this catches schema-shape drift if a field's Zod path changes. Example: `expect(body).toMatch(/^focus_rating:/)` for a `focus_rating` validation failure.

### 6.4 Adding a pgTAP test for a new RLS-bearing table

- **Location**: `supabase/tests/rls_<table>.sql`
- **Pattern**: two-user fixture wrapped in `BEGIN ... ROLLBACK`; test read
  isolation, cross-user update denial, delete denial if immutable.
- **Reference test**: `supabase/tests/rls_sessions.sql`
- **Run locally**: `npm run db:test`

### 6.5 Adding a Playwright e2e test (critical user flow)

- **Location**: `tests/e2e/<flow>.spec.ts` -- one spec per cross-cutting user flow. SSR-only redirect assertions can share a spec file when they cover the same resource (e.g. `session-access.spec.ts` for all `/session/[id]` redirect guards).
- **Pattern**:
  1. `import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";` -- both symbols come from the e2e re-export at `tests/e2e/_fixtures/auth.ts`. `setupTwoUsers` provisions two ephemeral Supabase users; `seedAuthCookie(context, cookieHeader)` loads the auth cookie into a Playwright `BrowserContext`.
  2. For SSR redirect scenarios, also `import { insertSession } from "./_fixtures/sessions";` -- inserts a row via the service role, bypassing RLS, to seed pre-existing session state.
  3. In `beforeAll`: `fixture = await setupTwoUsers();`. In `afterAll`: `await fixture.cleanup();` (cascades session rows via FK).
  4. Create a fresh `BrowserContext` per test with `browser.newContext()`, call `seedAuthCookie(context, fixture.cookieFor(userId))`, then `page = await context.newPage()`.
  5. Use semantic locators only: `getByRole`, `getByLabel`, `getByText`. Never CSS class selectors, XPath, or DOM structure selectors.
  6. For happy-path flows, use `page.getByRole("button", { name: "Stop early" })` to exit the timer without waiting the full preset -- this exercises the same code path as a natural end-of-session.
  7. Wait for state, never for time: `await page.waitForURL("**/dashboard")`, `await expect(el).toBeVisible()`. Never `page.waitForTimeout()`.
- **Reference tests**:
  - `tests/e2e/session-capture.spec.ts` -- happy path: dashboard -> start session -> energy pick -> timer -> stop early -> rate (4) -> back to dashboard with history entry visible.
  - `tests/e2e/session-access.spec.ts` -- three SSR redirect guards: cross-user (Risk #3), ended session (Risk #5a), abandoned session (Risk #5b).
- **Run locally**: `npm run test:e2e`. First time after checkout: `npx playwright install chromium` first.

### 6.6 Extending the production smoke gate (new critical RLS-bearing table)

- **Location**: `scripts/smoke-session-write.mjs` (reference implementation) and `.github/workflows/smoke.yml` (CI wiring).
- **When to extend**: Only if all three conditions hold: (1) the new table is critical-path (a write failure would break the core user flow), (2) it has RLS-gated writes from end-user requests, AND (3) its failure mode would NOT be caught by the `db:types` diff alone -- i.e. it has runtime failure modes beyond schema drift (missing policy, broken FK, wrong default).
- **Pattern**:
  1. Create a sibling script `scripts/smoke-<table>-write.mjs` following the same idempotency shape: DELETE any pre-existing rows for the smoke identity, INSERT a minimal row capturing the returned `id`, SELECT back by `id` and assert key fields round-trip, DELETE by `id`. Exit non-zero on any error.
  2. Reuse `SMOKE_USER_ID` if the new table has a `user_id` FK to `auth.users`. If the table uses a different ownership key, add a dedicated `SMOKE_<TABLE>_KEY` secret and document it in the runbook (see `context/changes/testing-schema-validation-gate/runbook.md`).
  3. Add a new step in `.github/workflows/smoke.yml` after the existing `node scripts/smoke-session-write.mjs` step, passing the same env block plus any table-specific secrets.
- **Anti-pattern**: Do not extend the existing `smoke-session-write.mjs` to cover multiple tables. One script per table keeps failure attribution clean -- a failing smoke step names exactly which table's write path broke.

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

- Strategy (§1-§5) last reviewed: 2026-06-24
- Stack versions last verified: 2026-06-24
  - @testing-library/react, @testing-library/jest-dom, jsdom: 2026-06-24
- AI-native tool references last verified: n/a (no AI-native layer in this rollout)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
