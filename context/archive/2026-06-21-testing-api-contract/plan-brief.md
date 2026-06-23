# Test Runner Bootstrap + Session API Contract -- Plan Brief

> Full plan: `context/changes/testing-api-contract/plan.md`
> Research: `context/changes/testing-api-contract/research.md`

## What & Why

Bootstrap Vitest with `@cloudflare/vitest-pool-workers` and author the first integration tests for this project, locking down the PATCH `/api/sessions/[id]` and POST `/api/sessions` contracts against column-scope abuse, finalization re-entry, and cross-user access. This is Phase 1 of the test-plan rollout; it covers risks #2 (PATCH contract) and #3 (cross-user API access) at the cheapest layer that gives real signal, and establishes the cookbook pattern every future API test will follow.

## Starting Point

Zero test infrastructure: no `vitest`, no test pool, no `test` script, no test files. The PATCH endpoint is "safe by literal" -- column-scope discipline lives in the hand-picked `.update({ ended_at, focus_rating })` chain, not in a strict Zod schema, so a future refactor to `.update(parsed.data)` would silently widen the writable surface. pgTAP covers DB-layer RLS denial; there is no API-boundary coverage today.

## Desired End State

`npm test` runs locally and in CI, executing 10 tests inside the Workers runtime against the actual Astro/Cloudflare entrypoint. The L-01 column-scope discipline, the once-only finalization guard, the 2-hour `ended_at` plausibility window, the cross-user 409 + no-mutation contract, and the POST `user_id` non-injection guarantee are all regression-protected. The test-plan cookbook (§6.1, §6.3) contains canonical patterns the next contributor can copy.

## Key Decisions Made

| Decision                                          | Choice                                                                                                       | Why (1 sentence)                                                                                                  | Source |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------ |
| Two-user auth fixture                             | Service-role admin API creates two users; `signInWithPassword` -> derive `@supabase/ssr` cookie -> `SELF.fetch()` | Exercises the same cookie-based `createServerClient` the endpoint reads, without coupling to `/api/auth/signin`.  | Plan   |
| Vitest config shape                               | Single `vitest.config.ts` with `test.projects` array (Workers project today, jsdom placeholder for Phase 2) | Vitest 4 canonical multi-environment pattern; Phase 2 appends an entry, no refactor.                              | Plan   |
| Test file layout                                  | `tests/integration/api/sessions.create.test.ts` + `sessions.end.test.ts` (one file per route group)          | Matches the cookbook §6.1 entry shape; keeps src/ free of `__tests__/` directories Astro/React Compiler must ignore. | Plan   |
| CI Supabase availability                          | Reuse existing `SUPABASE_URL`/`KEY` secrets + add `SUPABASE_SERVICE_ROLE_KEY`                                | Fastest CI (no container boot); single env-var addition; tests use unique randomUUID emails to avoid shared state. | Plan   |
| Test data isolation                               | Per-file `beforeAll` creates two users with random emails; `afterAll` deletes; FK cascade handles sessions   | Hermetic per file, parallel-safe; cascade means no per-test cleanup bookkeeping.                                  | Plan   |
| Plausibility window threshold disclosure          | Pin the current 2-hour API window in Phase 1 with a `TODO(risk #5)` comment                                  | Makes risk #5's Phase 2 fix deliberately break and update this test -- exactly the regression-gate behavior wanted. | Plan   |
| 409 information-hiding contract                   | Test 409 + no row mutation, **plus** a byte-identical-body assertion across cross-user and already-ended       | Pins the security-by-obscurity intent so a future refactor that distinguishes the failure modes trips deliberately. | Plan   |
| Test-plan cookbook + §2 wording update            | Fill §6.1 + §6.3 in this PR; correct §2 row #3 wording from "403/404" to "409"                              | Lesson contract: each phase ends by updating §6; §2 wording was researched-as-wrong and needs correcting.         | Plan   |

## Scope

**In scope:**

- Vitest 4 + `@cloudflare/vitest-pool-workers` + coverage-v8 install
- `vitest.config.ts` with `test.projects` (Workers project today, jsdom placeholder)
- `tests/_fixtures/auth.ts` (two-user service-role fixture) + `tests/_fixtures/db.ts` (service-role read helper)
- 10 tests: 5 PATCH + 3 POST + 2 cross-user PATCH
- `SUPABASE_SERVICE_ROLE_KEY` env var: `.env.example`, `.dev.vars` setup notes, CI secret
- `npm test` CI step
- `test-plan.md` §6.1, §6.3, §2 row #3, §3 row 1 updates

**Out of scope:**

- jsdom / React component tests (test-plan §3 Phase 2)
- Re-proving DB-layer RLS denial (`supabase/tests/rls_sessions.sql` already covers it)
- SSR `/session/[id]` redirect cascade (test-plan §3 Phase 4 Playwright)
- 50-min vs 2-hour threshold reconciliation (risk #5 / Phase 2)
- Post-edit hook wiring (Module 3 Lesson 3+)
- Coverage thresholds (not a test-plan §5 gate)
- `/api/auth/*` endpoint tests (test-plan §7 negative space)

## Architecture / Approach

Vitest 4 boots a Workers project via `@cloudflare/vitest-pool-workers`. The `cloudflareTest()` plugin reads `wrangler.jsonc`, which points `main` at `@astrojs/cloudflare/entrypoints/server` -- the same entry-point production serves. Tests import `SELF` from `cloudflare:test` and call `SELF.fetch(url, { method, headers: { Cookie: cookieFor(user.id) }, body })` to send real HTTP requests through the Astro entry-point. The auth fixture provisions two users via Supabase's admin API (service-role), signs each in to mint Supabase tokens, and packs them into the cookie format `@supabase/ssr` expects so the endpoint's `createServerClient` reads them as authenticated. A separate service-role read helper performs assertion read-backs that bypass RLS, proving "no row mutation" claims independently of the API surface under test.

## Phases at a Glance

| Phase                                            | What it delivers                                                                                            | Key risk                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Test runner bootstrap                         | Vitest installed + config + two-user fixture + placeholder smoke test green                                  | Cookie format derivation: `@supabase/ssr` uses `sb-<projectref>-auth-token`; getting projectref wrong -> every test 401s |
| 2. PATCH contract tests (risk #2)                | 5 tests: column-scope (L-01 gate), once-only 409, plausibility window, schema, 401                          | Plausibility window boundary churn when risk #5 lands -- mitigated by `TODO(risk #5)` comment            |
| 3. POST contract + cross-user tests (risks #2, #3) | 3 POST + 2 cross-user PATCH; total 10 tests across two files; placeholder smoke deleted                     | Test flakiness if tokens expire mid-run -- mitigated by fixture being per-file (not per-suite)           |
| 4. CI wiring + test-plan cookbook update         | `npm test` in CI; §6.1 + §6.3 filled; §2 row #3 corrected to "409"; §3 row 1 marked complete                | `SUPABASE_SERVICE_ROLE_KEY` not added to repo secrets -> CI fails; user confirms before merge            |

**Prerequisites:**

- `SUPABASE_SERVICE_ROLE_KEY` available locally (in `.dev.vars`).
- Local Supabase running (`npx supabase start`) or a hosted dev project for local runs.
- Existing CI secrets `SUPABASE_URL` / `SUPABASE_KEY` confirmed to point at a writable Supabase (user-confirmable before merge).

**Estimated effort:** ~2-3 sessions, one per phase pair (1+2, then 3+4), with `/clear` between.

## Open Risks & Assumptions

- **Existing CI Supabase secrets are writable.** This plan assumes the repo's `SUPABASE_URL` / `SUPABASE_KEY` point at a real Supabase project that allows writes (not a build-only stub). If they don't, Phase 4 needs to add a dedicated test project. **User confirms before merge.**
- **Cookie format derivation is the riskiest implementation detail.** `@supabase/ssr` v0.10 uses `sb-<projectref>-auth-token`; the fixture must parse `SUPABASE_URL` correctly to derive `<projectref>`. The placeholder smoke test in Phase 1 catches a 401 cascade immediately if the format is wrong.
- **Service-role key isolation.** This plan deliberately does NOT add `SUPABASE_SERVICE_ROLE_KEY` to `astro.config.mjs` `env.schema`, ensuring it cannot be read by app code at runtime. The implementer must respect this boundary.

## Success Criteria (Summary)

- `npm test` exits 0 locally and in CI with 10 tests green.
- Sabotage checks fail loudly: substituting `.update(parsed.data)` for the hand-picked PATCH literal trips the column-scope test; removing `.eq("user_id", ...)` trips the cross-user test; using `parsed.data.user_id` on POST trips the injection test.
- `test-plan.md` §6.1 + §6.3 read clean: a contributor can add a new API test from these instructions alone.
