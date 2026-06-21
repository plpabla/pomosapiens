# Test Runner Bootstrap + Session API Contract -- Implementation Plan

## Overview

Bootstrap Vitest with `@cloudflare/vitest-pool-workers` and author the first integration tests for this project, covering risk #2 (PATCH `/api/sessions/[id]` column-scope, once-only finalization, plausibility window) and risk #3 (cross-user API access). All 8 tests run inside the Workers runtime against the actual Astro/Cloudflare entrypoint via `SELF.fetch()`. The gate is wired into CI and the test-plan cookbook (§6.1, §6.3) is filled in so the next contributor adding an API test has a canonical pattern to follow.

## Current State Analysis

Zero test infrastructure exists. `package.json` has no `vitest`, no `@cloudflare/vitest-pool-workers`, no `test` script. The only test-shaped script today is `db:test` (pgTAP).

What is already in place that this plan builds on:

- **PATCH endpoint** at [src/pages/api/sessions/[id].ts:1-59](src/pages/api/sessions/[id].ts) -- self-gates on `context.locals.user`, parses with `endSessionSchema` (permissive, not `.strict()`), validates `ended_at` plausibility window `[now-2h, now+5s]`, and updates with a hand-picked `.update({ ended_at, focus_rating })` + `.eq("user_id", ...)` + `.is("ended_at", null)` chain. Returns 409 `{ error: "Session already ended or not found" }` for both cross-user and already-ended (intentional information-hiding).
- **POST endpoint** at [src/pages/api/sessions/index.ts:1-39](src/pages/api/sessions/index.ts) -- self-gates, parses with `createSessionSchema` (also permissive), server-stamps `user_id` and `started_at` in the `.insert({...})` literal.
- **Wrangler config** at [wrangler.jsonc:1-16](wrangler.jsonc) -- `main: "@astrojs/cloudflare/entrypoints/server"`, `compatibility_date: "2026-05-08"`, `compatibility_flags: ["nodejs_compat"]`. This is exactly what `@cloudflare/vitest-pool-workers` reads via the `cloudflareTest()` plugin.
- **Supabase client** at [src/lib/supabase.ts:6-25](src/lib/supabase.ts) -- `createServerClient` from `@supabase/ssr`, cookie-driven, reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server`. Returns `null` if env unset (tests need real env).
- **pgTAP coverage** at [supabase/tests/rls_sessions.sql](supabase/tests/rls_sessions.sql) -- 9 cross-user assertions at the DB layer. This plan does NOT re-prove the DB layer; it proves the API boundary.
- **CI** at [.github/workflows/ci.yml](.github/workflows/ci.yml) -- runs lint + build only; `SUPABASE_URL` / `SUPABASE_KEY` exposed as secrets to the build step.
- **L-01** in [context/foundation/lessons.md:7-11](context/foundation/lessons.md) -- "RLS + API column-scope discipline." The PATCH endpoint is the literal implementation. The column-scope test is the regression gate that pins this lesson.

Discrepancy worth flagging: test-plan §2 row #3 describes risk #3 protection as PATCH returning "403 or 404"; the implementation returns 409. Phase 4 corrects this wording.

## Desired End State

After this plan ships:

- `npm test` runs locally and in CI, executing 8 integration tests inside the Workers runtime; tests pass.
- The PATCH `/api/sessions/[id]` and POST `/api/sessions` contracts are pinned: column-scope, once-only finalization, plausibility window, cross-user 409 + no mutation, POST `user_id` non-injection, and 409 information-hiding are all regression-protected.
- `test-plan.md` §6.1 and §6.3 contain canonical "how to add a Vitest Workers test" patterns; §2 row #3 wording matches the implementation; §3 Phase 1 status is `complete`.
- The test plan's quality gate "Vitest Workers integration -- required after §3 Phase 1" is honored: `npm test` is a CI step.

Verification: a CI run on a branch with `.eq("user_id", ...)` removed from the PATCH endpoint must fail the cross-user test; a CI run with `.update({ ended_at, focus_rating })` swapped for `.update(parsed.data)` must fail the column-scope test.

### Key Discoveries:

- **`endSessionSchema` is permissive** ([src/lib/schemas/session.ts:9-17](src/lib/schemas/session.ts#L9-L17)) -- extra body keys silently stripped. Safe today only because `.update({...})` hand-picks columns. The column-scope test pins this and will fail loudly on any future refactor to `.update(parsed.data)`. **Primary footgun.**
- **`createSessionSchema` is also permissive** ([src/lib/schemas/session.ts:3-7](src/lib/schemas/session.ts#L3-L7)) -- same column-scope discipline applies to POST. A test that posts `{ energy_level: "medium", user_id: "<userB-id>" }` and asserts the created row's `user_id` is the caller's pins the server-stamping intent.
- **Once-only guard is SQL-level**, via `.is("ended_at", null).maybeSingle()` ([id].ts:41-48) -- `!data` returns 409. The literal implementation of L-01.
- **Cross-user and already-ended share one 409 body** -- intentional information-hiding ([id].ts:54-56). Tests assert byte-identical responses to lock the security contract.
- **No middleware gating on `/api/sessions/**`** -- [src/middleware.ts:4](src/middleware.ts#L4) `PROTECTED_ROUTES` excludes API paths; endpoints self-gate via `if (!context.locals.user) return 401`. The middleware still populates `context.locals.user` via `supabase.auth.getUser()`, so the cookie-driven `@supabase/ssr` client is the authoritative auth path under test.
- **`@cloudflare/vitest-pool-workers` canonical pattern** -- `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` Vite plugin; `SELF.fetch()` from `cloudflare:test` for full integration tests against the worker entrypoint; `env`, `fetchMock` also from `cloudflare:test`. Requires Vitest >= 4.1.
- **50-min SSR vs 2-hour API threshold inconsistency** is a known issue tracked as risk #5 (test-plan §2 row 5); Phase 1 pins the **current** 2-hour boundary as a regression gate so Phase 2's risk-#5 fix will deliberately update this test.

## What We're NOT Doing

- **Not adding jsdom / React component tests.** That is test-plan §3 Phase 2. The `vitest.config.ts` shape anticipates Phase 2 (commented placeholder) but Phase 2 owns the actual jsdom project.
- **Not re-proving DB-layer RLS denial.** `supabase/tests/rls_sessions.sql` already covers cross-user UPDATE/SELECT/DELETE at the DB layer with 9 assertions. Vitest tests prove the API boundary -- status codes, response bodies, no row mutation.
- **Not testing the SSR `/session/[id]` redirect cascade.** That is test-plan §3 Phase 4 (Playwright e2e).
- **Not reconciling the 50-min vs 2-hour threshold inconsistency.** That is risk #5 / Phase 2. Phase 1 pins the current behavior so Phase 2 has a regression target.
- **Not wiring the post-edit hook** (test-plan §5 "recommended after Phase 1"). Hooks, MCP servers, and CI YAML configuration are explicitly Module 3 Lesson 3+ scope per CLAUDE.md.
- **Not adding coverage thresholds.** Coverage is not in test-plan §5; can be added later if a quality gate requires it.
- **Not authoring tests for `/api/auth/*` endpoints.** Out of test-plan §2 risk scope; auth is vendor-tested per §7 negative space.

## Implementation Approach

Build infra and fixture first (Phase 1), then layer in PATCH tests (Phase 2), then POST + cross-user tests (Phase 3), then CI + cookbook (Phase 4). Each phase produces a runnable artifact that the next phase exercises.

**Auth fixture design:** A `tests/_fixtures/auth.ts` helper uses a service-role admin Supabase client (built from a new `SUPABASE_SERVICE_ROLE_KEY` env var) to create two users in `beforeAll` with unique `test-${randomUUID()}@example.com` emails, then calls `signInWithPassword` to obtain a Supabase access/refresh token pair, packs them into cookie header strings matching what `@supabase/ssr` writes (`sb-<projectref>-auth-token`), and exposes `cookieFor(userId): string` for tests to attach to `SELF.fetch()`. `afterAll` deletes both users via `admin.deleteUser`, which cascades to `public.sessions` rows via the FK. This exercises the same cookie-based `createServerClient` path the endpoint uses, without coupling to `/api/auth/signin`.

**Test layout:** `tests/integration/api/sessions.create.test.ts` (POST) and `tests/integration/api/sessions.end.test.ts` (PATCH). Two files keep §6 cookbook entries clean (one route per file).

**CI shape:** add `npm test` step to `.github/workflows/ci.yml` after lint and before build, with `SUPABASE_URL`, `SUPABASE_KEY`, and the new `SUPABASE_SERVICE_ROLE_KEY` exposed as secrets. The existing `SUPABASE_URL` / `SUPABASE_KEY` secrets are assumed writable (the user confirms before merging).

## Critical Implementation Details

- **The Supabase access-token cookie name is project-specific.** `@supabase/ssr` writes `sb-<projectref>-auth-token` where `<projectref>` is derived from the project URL. The fixture must read `SUPABASE_URL`, extract the projectref (subdomain before `.supabase.co`, or `localhost` for local), and construct the cookie name accordingly. Failing this means `createServerClient` in the endpoint sees no cookie and returns `null` user -> every test gets 401 instead of the expected status.
- **`maybeSingle()` returns `data: null` (not `error`) on zero rows.** The PATCH once-only guard relies on this: the second PATCH on the same id matches zero rows because `.is("ended_at", null)` excludes the now-ended row, so `data` is null and the endpoint returns 409. Tests must assert 409 on the second call, not 200 or 500.
- **`SUPABASE_SERVICE_ROLE_KEY` must never reach production.** It belongs in `.dev.vars` (gitignored), `.env.example` as a placeholder (no real value), and CI secrets. It must NOT be added to `astro.config.mjs` `env.schema` -- doing so would bake it into the production runtime. Tests read it directly via `process.env` / `import.meta.env` at fixture setup time inside the Workers test pool.

## Phase 1: Test Runner Bootstrap

### Overview

Install Vitest + the Workers pool, write the config, scaffold the test directory, add the `npm test` script, and build the two-user service-role auth fixture. A single placeholder test proves the runner boots and the fixture works end-to-end before any real tests are authored.

### Changes Required:

#### 1. Dev dependencies

**File**: `package.json`

**Intent**: Add the Vitest 4 toolchain and the Workers pool. No app code depends on these; they live in `devDependencies` only.

**Contract**: `devDependencies` gains `vitest@^4.1`, `@cloudflare/vitest-pool-workers@latest-stable`, `@vitest/coverage-v8@^4.1`. `scripts` gains `"test": "vitest run"` (CI-friendly default; watch mode via `npx vitest`).

#### 2. Vitest config

**File**: `vitest.config.ts` (new)

**Intent**: Single config using the Vitest 4 `test.projects` array, populated with one Workers project today and a commented placeholder for the Phase 2 jsdom project. The Workers project uses `cloudflareTest()` reading `wrangler.jsonc`.

**Contract**: Default export is a `defineConfig({ test: { projects: [...] } })`. The Workers project has `name: "workers"`, `include: ["tests/integration/api/**/*.test.ts"]`, and uses `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` as a plugin. A comment block names the Phase 2 jsdom project shape (`{ name: "jsdom", environment: "jsdom", include: ["tests/unit/**/*.test.ts"] }`) so Phase 2 has a clean append target.

#### 3. Test directory + placeholder test

**File**: `tests/integration/api/_smoke.test.ts` (new -- deleted at end of Phase 1)

**Intent**: A single `expect(1+1).toBe(2)` test that also imports `SELF` from `cloudflare:test` to verify the pool boots and the `cloudflare:test` module resolves. Confirms `npm test` works green before any real tests land.

**Contract**: One `describe`, one `it`, asserts `SELF.fetch("http://example.com/").status` is defined (any number is fine -- the assertion proves the worker runtime is up). Deleted at the end of Phase 1 after Phase 2's first real test passes.

#### 4. Service-role env wiring

**File**: `.env.example`, `.dev.vars` (gitignored -- documented in setup notes), CLAUDE.md "Environment" section

**Intent**: Document `SUPABASE_SERVICE_ROLE_KEY` as a new local + CI env var, used only by tests, never by app code.

**Contract**: `.env.example` adds `SUPABASE_SERVICE_ROLE_KEY=` (empty value, comment explains it's for tests only). CLAUDE.md "Environment" section gains one line: "`SUPABASE_SERVICE_ROLE_KEY` -- required for `npm test`; never read by app code or referenced in `astro.config.mjs` `env.schema`." The `astro.config.mjs` `env.schema` is NOT modified -- this is the safety boundary preventing the service-role key from being baked into the production runtime.

#### 5. Two-user auth fixture

**File**: `tests/_fixtures/auth.ts` (new)

**Intent**: Provision two ephemeral users via the Supabase admin API in `beforeAll`, sign each in to obtain a session, derive the cookie string `@supabase/ssr` expects, and expose `cookieFor(userId)` so each test can `SELF.fetch(url, { headers: { Cookie: cookieFor(userA.id) } })`. Clean up in `afterAll` via `admin.deleteUser`, relying on FK cascade for any session rows.

**Contract**: Exports `setupTwoUsers(): Promise<{ userA: TestUser; userB: TestUser; cookieFor: (userId: string) => string; cleanup: () => Promise<void> }>` where `TestUser` is `{ id: string; email: string; password: string }`. Internally constructs a service-role `supabase-js` client (NOT the SSR client), creates users with `admin.createUser({ email, password, email_confirm: true })`, signs each in with `signInWithPassword` to get access + refresh tokens, then builds a cookie string of the form `sb-<projectref>-auth-token=<base64-encoded-token-pair>` matching the `@supabase/ssr` v0.10 cookie format. Cookie projectref is parsed from `SUPABASE_URL`. Provides defensive teardown: `cleanup()` is idempotent and swallows individual deletion failures (logs them) so a partial cleanup doesn't fail the suite.

A short header comment explains the cookie-format derivation -- this is the only non-obvious piece in the fixture and a future reader needs to know why we encode tokens by hand instead of using a helper.

### Success Criteria:

#### Automated Verification:

- `npm install` completes cleanly; `package.json` has the three new dev deps.
- `npm test` exits 0 with the placeholder test passing.
- `npm run lint` passes (no errors in `vitest.config.ts`, `tests/_fixtures/auth.ts`, or the placeholder test).
- `npm run build` still passes (no accidental coupling of test config into the build).

#### Manual Verification:

- `SUPABASE_SERVICE_ROLE_KEY` added to local `.dev.vars`; `npm test` boots the Workers pool, the fixture creates two users in Supabase Studio (`http://localhost:54323` for local) and removes them after the run.
- Run `npm test -- --reporter=verbose` and observe `[workers]` project name in output -- confirms the pool config is read.
- Open Supabase Studio, confirm no `test-${uuid}@example.com` users remain after a clean run.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the fixture round-trips against a real Supabase before proceeding to Phase 2.

---

## Phase 2: PATCH Contract Tests (Risk #2)

### Overview

Five tests that pin the PATCH `/api/sessions/[id]` contract: column-scope, once-only finalization, plausibility window, schema validation, unauthenticated. Each test creates a fresh session via the POST endpoint (using the fixture's cookie), then exercises PATCH. The column-scope test is the regression gate for L-01.

### Changes Required:

#### 1. PATCH test suite

**File**: `tests/integration/api/sessions.end.test.ts` (new)

**Intent**: Author the five PATCH tests listed in research §"Phase 1 Test Targets". Each test starts from a freshly-POSTed session belonging to user A, then sends a PATCH via `SELF.fetch()` with `cookieFor(userA.id)`. Read-back assertions use a service-role read of the row (not a GET endpoint -- no GET exists yet) to verify no unintended mutation.

**Contract**:

- `describe("PATCH /api/sessions/[id]")` containing five `it` blocks:
  - `it("silently strips columns outside the contract (regression gate for L-01)")` -- POST a session; PATCH `{ focus_rating: 4, ended_at: <now-ISO>, user_id: "<garbage-uuid>", energy_level: "high", note: "x" }`; assert response is 200 `{ ok: true }`; read row via service-role; assert `ended_at` and `focus_rating` updated, **and** `user_id` is userA's id (not the garbage), `energy_level` unchanged (still "low" from POST default), no `note` column exists. **One failing assertion if `.update(parsed.data)` is ever substituted.**
  - `it("returns 409 on second PATCH to the same session")` -- POST -> PATCH valid -> 200 -> PATCH again with new `ended_at` -> 409 `{ error: "Session already ended or not found" }`. Read row; assert `focus_rating` is the first call's value, not the second.
  - `it("rejects ended_at outside the plausibility window")` -- three sub-cases via `it.each`: `now + 10_000ms` -> 400, `now - 3 * 60 * 60 * 1000` -> 400, `now - 60 * 60 * 1000` -> 200. A leading comment `// TODO(risk #5): the 2h window may change when risk #5 reconciles the 50-min SSR threshold; update boundary values intentionally.`
  - `it("validates request body shape")` -- three sub-cases via `it.each`: missing `ended_at` -> 400 with body matching `/^ended_at:/`, `focus_rating: 6` -> 400 with body matching `/^focus_rating:/`, `focus_rating: null` -> 200 (PRD allows nullable).
  - `it("returns 401 when unauthenticated")` -- PATCH any session id without a `Cookie` header -> 401 `{ error: "Unauthorized" }`. Asserts the self-gate works.

A small helper `createSession(cookie): Promise<{ id, started_at }>` lives at the top of the file (POSTs and returns the parsed body) -- not extracted to `_fixtures/` yet because Phase 3 will move it there if the POST test file ends up wanting a shared helper.

#### 2. Service-role read helper

**File**: `tests/_fixtures/db.ts` (new)

**Intent**: A test-only read helper that uses the same service-role client built by the auth fixture to fetch a row by id, bypassing RLS. Tests use this to assert "no mutation happened" on rows they don't own (cross-user case in Phase 3).

**Contract**: Exports `readSession(id: string): Promise<SessionRow>` where `SessionRow` mirrors the `public.sessions` table columns relevant to tests (`id`, `user_id`, `started_at`, `ended_at`, `energy_level`, `focus_rating`). Constructs the service-role client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` once per file (module-level singleton).

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/integration/api/sessions.end.test.ts` exits 0 with five tests passing.
- `npm run lint` passes on the new files.
- Sabotage check: change `.update({ ended_at, focus_rating })` -> `.update(parsed.data)` in [src/pages/api/sessions/[id].ts:43](src/pages/api/sessions/[id].ts#L43); `npm test` fails the column-scope test with a clear message; revert.

#### Manual Verification:

- Run the suite three times in a row; no orphaned users in Supabase Studio after each run.
- Inspect the test output for the plausibility window sub-cases; confirm the boundary values match the test plan's expected behavior.

**Implementation Note**: After Phase 2's automated verification passes (including the sabotage check), pause for manual confirmation that the column-scope regression gate behaves as expected before proceeding to Phase 3.

---

## Phase 3: POST Contract + Cross-User Tests (Risks #2, #3)

### Overview

Add the POST `/api/sessions` `user_id` injection test (risk #2 -- column-scope on the create path) and the two cross-user PATCH tests (risk #3): cross-user 409 + no mutation, and the information-hiding assertion (cross-user 409 body byte-identical to already-ended 409 body).

### Changes Required:

#### 1. POST test suite

**File**: `tests/integration/api/sessions.create.test.ts` (new)

**Intent**: Pin the POST contract: server-stamped `user_id` (caller, not body), server-stamped `started_at`, response shape `{ id, started_at }` with 201.

**Contract**:

- `describe("POST /api/sessions")` containing three `it` blocks:
  - `it("server-stamps user_id from the session, ignoring the request body (regression gate for L-01)")` -- POST `{ energy_level: "medium", user_id: userB.id }` with `cookieFor(userA.id)`; assert 201; read row via service-role; assert `user_id === userA.id`. **Failing assertion if `.insert({ user_id: context.locals.user.id })` is ever changed to `.insert({ user_id: parsed.data.user_id })` or `.insert(parsed.data)`.**
  - `it("validates energy_level enum")` -- POST `{ energy_level: "extreme" }` -> 400 with body matching `/^energy_level:/`.
  - `it("returns 401 when unauthenticated")` -- POST without cookie -> 401.

#### 2. Cross-user PATCH tests

**File**: `tests/integration/api/sessions.end.test.ts` (extend Phase 2 file)

**Intent**: Two new `it` blocks at the bottom of the file (or in a nested `describe("cross-user", ...)`): the cross-user 409 with no mutation, and the information-hiding contract.

**Contract**:

- `it("returns 409 + no row mutation when user B PATCHes user A's session")` -- user A POSTs sA; user B PATCHes sA with valid body and `cookieFor(userB.id)`; assert response 409 `{ error: "Session already ended or not found" }`; service-role read of sA; assert `ended_at` is still `null`, `focus_rating` is still `null`.
- `it("returns byte-identical 409 body for cross-user vs already-ended (information-hiding contract)")` -- user A POSTs sA, PATCHes valid -> 200. User B PATCHes sA -> 409 (cross-user). User A PATCHes sA again -> 409 (already-ended). Assert `crossUserResponse.status === alreadyEndedResponse.status` and `JSON.stringify(crossUserBody) === JSON.stringify(alreadyEndedBody)`. Leading comment cites the intentional information-hiding ([src/pages/api/sessions/[id].ts:54-56](src/pages/api/sessions/[id].ts#L54-L56)) so a future contributor who wants to distinguish the two failure modes understands what they're breaking.

#### 3. Delete the placeholder smoke test

**File**: `tests/integration/api/_smoke.test.ts` (delete)

**Intent**: Remove the Phase 1 placeholder now that real tests cover the same boot-the-pool guarantee.

**Contract**: File no longer exists.

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0 with 10 tests across two files (5 PATCH from Phase 2 + 3 POST + 2 cross-user PATCH added in Phase 3). All green.
- `npm run lint` passes.
- Sabotage check #1: remove `.eq("user_id", context.locals.user.id)` from [src/pages/api/sessions/[id].ts:45](src/pages/api/sessions/[id].ts#L45); cross-user test fails with the target row's `ended_at` no longer null; revert.
- Sabotage check #2: change `.insert({ user_id: context.locals.user.id, ... })` -> `.insert({ user_id: parsed.data.user_id ?? context.locals.user.id, ... })` in [src/pages/api/sessions/index.ts:25](src/pages/api/sessions/index.ts#L25); POST injection test fails; revert.

#### Manual Verification:

- Run the full suite three times; confirm no test flakiness (tokens don't expire mid-run; users clean up).
- Open Supabase Studio after a run; confirm no leftover `test-${uuid}@example.com` users.

**Implementation Note**: After Phase 3 verification passes, pause for manual confirmation that the full suite is reliable locally before adding the CI step in Phase 4.

---

## Phase 4: CI Wiring + Test-Plan Cookbook Update

### Overview

Add `npm test` to CI with the `SUPABASE_SERVICE_ROLE_KEY` secret, fill in `test-plan.md` §6.1 and §6.3 cookbook entries with the canonical Workers integration pattern this PR establishes, correct §2 row #3 wording from "403 or 404" to "409", and bump §3 row 1 status to `complete`.

### Changes Required:

#### 1. CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Add a `npm test` step after `npm run lint` and before `npm run build`. Expose `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the test step.

**Contract**: A new `- run: npm test` step with an `env:` block listing the three secrets. Order: checkout -> setup-node -> npm ci -> lint -> test -> build. Build already has `SUPABASE_URL` / `SUPABASE_KEY` and remains unchanged. A new repo secret `SUPABASE_SERVICE_ROLE_KEY` must be added by the user (documented in the PR description).

#### 2. Test plan cookbook -- §6.1

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `§6.1 Adding a Vitest Workers integration test (API route)` placeholder with a canonical pattern derived from this PR's actual test files.

**Contract**: §6.1 section becomes:
- **Location**: `tests/integration/api/<route>.test.ts` (one file per route group, e.g. `sessions.create.test.ts` for POST, `sessions.end.test.ts` for PATCH).
- **Pattern**: import `SELF` from `cloudflare:test`; use `setupTwoUsers()` from `tests/_fixtures/auth.ts` in `beforeAll`; cleanup in `afterAll`; each test sends `SELF.fetch(url, { method, headers: { Cookie: cookieFor(user.id), "Content-Type": "application/json" }, body: JSON.stringify(...) })`; use `readSession(id)` from `tests/_fixtures/db.ts` for service-role read-back when asserting "no mutation".
- **Reference test**: `tests/integration/api/sessions.end.test.ts` -- particularly the "silently strips columns outside the contract" test as the L-01 regression gate template.
- **Run locally**: `npm test` (or `npm test -- tests/integration/api/<file>.test.ts` for a single file; `npx vitest` for watch mode).

#### 3. Test plan cookbook -- §6.3

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `§6.3 Adding a test for a new session API endpoint` placeholder. This section captures the project-specific column-scope discipline pattern.

**Contract**: §6.3 section becomes:
- When adding a new endpoint that writes to `public.sessions` (or any RLS-bearing table with a wide UPDATE policy), the endpoint MUST hand-pick columns in `.update({...})` or `.insert({...})` (per L-01); the test file MUST include a regression test that POSTs / PATCHes with the body containing forbidden columns (`user_id`, columns from the schema not in the write set) and asserts via service-role read-back that those columns were not mutated.
- Reference: `tests/integration/api/sessions.create.test.ts` "server-stamps user_id" test and `tests/integration/api/sessions.end.test.ts` "silently strips columns" test.
- Schema validation tests should assert the field-named error message (`/^<field>:/`) from `parseJson` -- this catches schema-shape drift if the field's path changes.

#### 4. Test plan §2 wording correction

**File**: `context/foundation/test-plan.md`

**Intent**: Correct §2 row #3 ("Risk Response Guidance" table, "What would prove protection" column) from `PATCH another user's session ID returns 403 or 404` to `PATCH another user's session ID returns 409 (intentionally indistinguishable from already-ended)`.

**Contract**: One-line edit in the table cell at §2 risk #3. No other §2 content changes.

#### 5. Test plan §3 status bump

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 1 complete now that the rollout has shipped.

**Contract**: §3 row 1 `Status` column changes from `change opened` to `complete`. `Last updated:` line at the top of the file bumps to the merge date.

#### 6. Change folder status

**File**: `context/changes/testing-api-contract/change.md`

**Intent**: Mark the change implemented per `/10x-implement` convention (the implement skill normally handles this; documenting here for completeness in case the planner-implementer chain misses it).

**Contract**: `status: planned` (already set by `/10x-plan`); `/10x-implement` will bump to `implemented` after Phase 4 lands.

### Success Criteria:

#### Automated Verification:

- CI run on the PR branch passes: lint -> test (8 tests green) -> build.
- `git diff context/foundation/test-plan.md` shows only the §6.1, §6.3, §2 row #3, §3 row 1 status, and "Last updated" line edits -- no other §1-§5 changes.

#### Manual Verification:

- User confirms `SUPABASE_SERVICE_ROLE_KEY` is added to the repo's GitHub Actions secrets before the PR is merged.
- User confirms the existing `SUPABASE_URL` / `SUPABASE_KEY` secrets point at a writable Supabase project (not a build-only stub).
- Re-read `test-plan.md` §6.1 + §6.3 cold -- can a contributor unfamiliar with the test files add a new API test from these instructions alone?

**Implementation Note**: After Phase 4 verification passes and the user confirms the CI secret is added, the gate `Vitest Workers integration -- required after §3 Phase 1` is honored.

---

## Testing Strategy

This plan IS the testing strategy for risks #2 and #3. The tests live in `tests/integration/api/`; the suite is run by `npm test` locally and in CI. There are no unit tests in Phase 1 -- the cheapest signal for the risks at hand is integration-layer at the API boundary.

### Manual Testing Steps:

1. **Local boot**: clone branch -> `npm install` -> populate `.dev.vars` with `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` -> `npx supabase start` -> `npm test` -> confirm 8 tests pass.
2. **L-01 sabotage**: edit `[src/pages/api/sessions/[id].ts:43](src/pages/api/sessions/[id].ts#L43)` to `.update(parsed.data)`; `npm test` -> column-scope test fails with a useful message; revert.
3. **Cross-user sabotage**: remove `.eq("user_id", context.locals.user.id)` from `[src/pages/api/sessions/[id].ts:45](src/pages/api/sessions/[id].ts#L45)`; `npm test` -> cross-user test fails (`ended_at` is no longer null after the cross-user PATCH); revert.
4. **POST injection sabotage**: edit `[src/pages/api/sessions/index.ts:25](src/pages/api/sessions/index.ts#L25)` to use `parsed.data.user_id ?? context.locals.user.id`; `npm test` -> POST injection test fails; revert.
5. **Studio cleanup check**: after a full suite run, open Supabase Studio -> `auth.users` table -> confirm no `test-${uuid}@example.com` users remain.

## Performance Considerations

Test suite walltime is bounded by Supabase round-trips: 2 user creates + 2 signins in `beforeAll` per file, ~8 POST/PATCH calls per file, 2 user deletes in `afterAll` per file. Expected: 8-15 seconds per file, 20-30 seconds total for the two files. Acceptable for a CI gate. If the suite grows past ~60 seconds in the future, consider sharing the two-user fixture across files via a Vitest global setup.

## Migration Notes

No data migration. No schema changes. No production runtime changes. The only environment change is the new `SUPABASE_SERVICE_ROLE_KEY` secret, which is test-only by construction (never declared in `astro.config.mjs` `env.schema`, so it cannot be read by app code at runtime).

## References

- Research: [context/changes/testing-api-contract/research.md](context/changes/testing-api-contract/research.md)
- Test plan strategy: [context/foundation/test-plan.md](context/foundation/test-plan.md) §1-§5
- L-01 (RLS + API column-scope discipline): [context/foundation/lessons.md:7-11](context/foundation/lessons.md#L7-L11)
- PATCH endpoint contract: [src/pages/api/sessions/[id].ts](src/pages/api/sessions/[id].ts)
- POST endpoint contract: [src/pages/api/sessions/index.ts](src/pages/api/sessions/index.ts)
- pgTAP DB-layer baseline: [supabase/tests/rls_sessions.sql](supabase/tests/rls_sessions.sql)
- Wrangler runtime config (read by the test pool): [wrangler.jsonc](wrangler.jsonc)
- Prior PATCH endpoint plan: [context/archive/2026-06-19-first-session-capture-loop/plan.md](context/archive/2026-06-19-first-session-capture-loop/plan.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` -- <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test Runner Bootstrap

#### Automated

- [x] 1.1 `npm install` completes cleanly; `package.json` has the three new dev deps -- 16d6e69
- [x] 1.2 `npm test` exits 0 with the placeholder test passing -- 16d6e69
- [x] 1.3 `npm run lint` passes (no errors in `vitest.config.ts`, `tests/_fixtures/auth.ts`, or the placeholder test) -- 16d6e69
- [x] 1.4 `npm run build` still passes (no accidental coupling of test config into the build) -- 16d6e69

#### Manual

- [x] 1.5 `SUPABASE_SERVICE_ROLE_KEY` added to local `.dev.vars`; fixture creates two users in Supabase Studio and removes them after the run -- 16d6e69
- [x] 1.6 `npm test -- --reporter=verbose` shows `[workers]` project name -- confirms the pool config is read -- 16d6e69
- [x] 1.7 Supabase Studio shows no leftover `test-${uuid}@example.com` users after a clean run -- 16d6e69

### Phase 2: PATCH Contract Tests

#### Automated

- [x] 2.1 `npm test -- tests/integration/api/sessions.end.test.ts` exits 0 with five tests passing — 148f95c
- [x] 2.2 `npm run lint` passes on the new files — 148f95c
- [x] 2.3 Sabotage check: `.update({ ended_at, focus_rating })` -> `.update(parsed.data)` makes the column-scope test fail; revert -- NOTE: test did NOT fail because `endSessionSchema` strips unknown keys (Zod default); `.update(parsed.data)` == `.update({ ended_at, focus_rating })` today. Gate catches explicit column additions to `.update()` but not schema-permissive refactors. — 148f95c

#### Manual

- [x] 2.4 Run the suite three times in a row; no orphaned users in Supabase Studio — 148f95c
- [x] 2.5 Inspect plausibility window sub-cases; boundary values match the test plan's expected behavior — 148f95c

### Phase 3: POST Contract + Cross-User Tests

#### Automated

- [ ] 3.1 `npm test` exits 0 with all 10 tests across two files passing (5 PATCH + 3 POST + 2 cross-user PATCH)
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 Sabotage check #1: removing `.eq("user_id", context.locals.user.id)` from PATCH makes the cross-user test fail; revert
- [ ] 3.4 Sabotage check #2: changing POST `.insert(...)` to use `parsed.data.user_id` makes the POST injection test fail; revert

#### Manual

- [ ] 3.5 Run the full suite three times; no flakiness
- [ ] 3.6 Supabase Studio shows no leftover users after each run

### Phase 4: CI Wiring + Test-Plan Cookbook Update

#### Automated

- [ ] 4.1 CI run on the PR branch passes: lint -> test (10 tests green) -> build
- [ ] 4.2 `git diff context/foundation/test-plan.md` shows only the §6.1, §6.3, §2 row #3, §3 row 1 status, and "Last updated" edits

#### Manual

- [ ] 4.3 User confirms `SUPABASE_SERVICE_ROLE_KEY` is added to the repo's GitHub Actions secrets
- [ ] 4.4 User confirms existing `SUPABASE_URL` / `SUPABASE_KEY` secrets point at a writable Supabase project
- [ ] 4.5 Re-read `test-plan.md` §6.1 + §6.3 cold; a contributor can add a new API test from these instructions alone
