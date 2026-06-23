---
date: 2026-06-21T00:00:00+02:00
researcher: pawel
git_commit: 31d18f97096ac072cc6c50cecb2a80570123e4d7
branch: main
repository: plpabla/pomosapiens
topic: "Session API contract and cross-user protection -- evidence for Phase 1 test bootstrap"
tags: [research, sessions-api, rls, vitest, cloudflare-workers, risk-2, risk-3]
status: complete
last_updated: 2026-06-21
last_updated_by: pawel
---

# Research: Session API contract and cross-user protection -- evidence for Phase 1 test bootstrap

**Date**: 2026-06-21
**Researcher**: pawel
**Git Commit**: 31d18f97096ac072cc6c50cecb2a80570123e4d7
**Branch**: main
**Repository**: plpabla/pomosapiens

## Research Question

Phase 1 of `context/foundation/test-plan.md` -- "Test runner bootstrap + session API contract" -- needs concrete ground before `/10x-plan`. The test plan §2 names two failure scenarios it must cover at the cheapest layer:

- **Risk #2** -- PATCH /api/sessions accepts columns outside its contract or can be called twice on an ended session. Research must answer: how the end-session Zod schema is declared; whether `ended_at` is server-side or client-supplied; how the once-only finalization guard is implemented.
- **Risk #3** -- Cross-user session data accessible via API or SSR. Research must answer: how the SSR ownership check is implemented; whether PATCH relies on RLS alone or also has an explicit caller-owns-session check.

In addition, research must report on the current state of test infrastructure (Vitest / `@cloudflare/vitest-pool-workers` is not yet installed) and on the historical decisions that produced today's design.

## Summary

The PATCH session endpoint is correct **by construction, not by validation**. Its safety against column-scope abuse comes from a hand-picked `.update({ ended_at, focus_rating })` literal -- not from a strict Zod schema. `endSessionSchema` is permissive (extra keys silently stripped). A naive future refactor to `.update(parsed.data)` would silently widen the writable surface. **This is the single most important target for Phase 1 tests.**

The once-only finalization guard is implemented at the SQL level via `.is("ended_at", null) ... .maybeSingle()` and `!data -> 409`. The same response (409 "Session already ended or not found") is returned for both "already ended" and "wrong owner / non-existent id" -- intentional information-hiding, but it means **the test for cross-user PATCH must assert 409 + no mutation, not 403/404 as suggested in the test plan §2**. The discrepancy between the test plan's expected status (403/404) and the implementation's actual status (409) is itself a finding the tests should pin down.

Cross-user access protection is **defense-in-depth**: RLS on `public.sessions` denies cross-user UPDATE at the DB layer, and both the PATCH endpoint (`.eq("user_id", context.locals.user.id)`) and the SSR `/session/[id]` page (`.eq("user_id", user.id)`) add an explicit application-layer ownership filter. The pgTAP suite `supabase/tests/rls_sessions.sql` already covers DB-layer cross-user denial with 9 assertions, so Phase 1 API tests do not need to re-prove the DB layer -- they should prove the **API surface** (correct status code, no mutation) at the cheapest integration layer.

No test infrastructure exists today: no `vitest`, no `@cloudflare/vitest-pool-workers`, no `test` script in `package.json`, no test files in `src/` or at the repo root. Phase 1 bootstraps from zero. The Wrangler runtime config the test pool requires (`wrangler.jsonc` with `compatibility_date: "2026-05-08"`, `compatibility_flags: ["nodejs_compat"]`, `main: "@astrojs/cloudflare/entrypoints/server"`) is already present and is what the test pool's `cloudflareTest()` plugin will read.

## Detailed Findings

### Risk #2 -- PATCH contract: schema, `ended_at` origin, finalization guard

**End-session Zod schema -- permissive, not strict.**
`endSessionSchema` lives in [src/lib/schemas/session.ts:9-17](src/lib/schemas/session.ts#L9-L17):

```ts
export const endSessionSchema = z.object({
  focus_rating: z.number().int().min(1, ...).max(5, ...).nullable(),
  ended_at: z.iso.datetime({ message: "ended_at must be a valid ISO-8601 datetime" }),
});
```

It is **not** `.strict()`. Zod's default behavior is to strip unknown keys, so a body like `{ focus_rating: 4, ended_at: "...", user_id: "victim-uuid", energy_level: "low" }` parses successfully and the extras are silently dropped from `parsed.data`. This is **safe today only because** the PATCH endpoint hand-picks the columns it writes to the DB (see below). If a future refactor changes `.update({ ended_at, focus_rating })` to `.update(parsed.data)`, the schema will not stop column-scope abuse.

**Test must assert**: `{ extra_col: "x" }` is accepted (200) -- and that the `extra_col` value never appears on the row. This is the column-scope test the plan §2 calls for.

**`ended_at` is client-supplied, server-validated.**
[src/pages/api/sessions/[id].ts:33-39](src/pages/api/sessions/%5Bid%5D.ts#L33-L39):

```ts
const { focus_rating, ended_at: endedAtIso } = parsed.data;
const endedAtMs = new Date(endedAtIso).getTime();
const nowMs = Date.now();

if (endedAtMs > nowMs + CLOCK_SKEW_MS || endedAtMs < nowMs - TWO_HOURS_MS) {
  return Response.json({ error: "ended_at is outside the plausible range" }, { status: 400 });
}
```

`CLOCK_SKEW_MS = 5_000`, `TWO_HOURS_MS = 7_200_000`. The plausibility window is `[now - 2h, now + 5s]`. This is the "client-snapshotted at phase transition and server-validated for plausibility" pattern called out in the file-header comment. The 2-hour past bound is the abandoned-session backstop.

**Test must assert**: `ended_at = now + 1h` -> 400; `ended_at = now - 3h` -> 400; `ended_at = now` -> 200 (or 409 on second call).

**Once-only finalization guard -- SQL-level, not application-level.**
[src/pages/api/sessions/[id].ts:41-56](src/pages/api/sessions/%5Bid%5D.ts#L41-L56):

```ts
const { data, error } = await supabase
  .from("sessions")
  .update({ ended_at: endedAtIso, focus_rating })
  .eq("id", id)
  .eq("user_id", context.locals.user.id)
  .is("ended_at", null)
  .select("id")
  .maybeSingle();

if (error) { return Response.json({ error: error.message }, { status: 500 }); }
if (!data) { return Response.json({ error: "Session already ended or not found" }, { status: 409 }); }
return Response.json({ ok: true }, { status: 200 });
```

The `.is("ended_at", null)` clause means the UPDATE matches **zero rows on the second call** (since the first call set `ended_at` to non-null). `.maybeSingle()` returns `data: null` instead of an error when zero rows are returned. `!data -> 409` is the once-only enforcement. **This is the literal implementation of L-01** (`context/foundation/lessons.md:9` -- `.is("ended_at", null)` makes the row writable exactly once).

**Note on 409 ambiguity**: the same `{ error: "Session already ended or not found" }` response is returned for two distinct conditions:
1. Wrong owner / non-existent id (`.eq("user_id", ...)` excludes the row).
2. Already ended (`.is("ended_at", null)` excludes the row).

This is intentional information-hiding (don't tell an attacker whether the id is valid-but-owned-by-someone-else). It means the Phase 1 test for cross-user PATCH must assert **409 + no row mutation**, not 403/404 as suggested in test-plan §2. The plan's wording is loose; the implementation's choice is deliberate.

**Test must assert**: PATCH same session twice -> first 200, second 409; PATCH another user's session id -> 409 and **the target row's `ended_at` stays NULL** (the second assertion is what proves no mutation slipped through under the 409).

**Response shape on success/failure** -- [src/pages/api/sessions/[id].ts:14-58](src/pages/api/sessions/%5Bid%5D.ts#L14-L58):
- 401 `{ error: "Unauthorized" }` -- no user in locals.
- 400 `{ error: "Missing session id" }` -- empty `[id]` route param.
- 400 `{ error: <zod issue> }` -- schema parse failure (uses [parse-request.ts:5-9](src/lib/parse-request.ts#L5-L9) `formatIssue` -> `"focus_rating: focus_rating must be between 1 and 5"`).
- 400 `{ error: "ended_at is outside the plausible range" }` -- plausibility window violation.
- 500 `{ error: "Supabase is not configured" }` -- env unset (relevant in CI without secrets).
- 500 `{ error: <db error message> }` -- DB-level failure (rare; constraints would surface here).
- 409 `{ error: "Session already ended or not found" }` -- guard mismatch (any reason).
- 200 `{ ok: true }` -- success.

### Risk #3 -- Cross-user protection: API + SSR + RLS layers

**PATCH endpoint -- defense-in-depth.**
The update chain at [src/pages/api/sessions/[id].ts:41-48](src/pages/api/sessions/%5Bid%5D.ts#L41-L48) includes both `.eq("user_id", context.locals.user.id)` (application layer) **and** runs through a Supabase client that issues `authenticated`-role queries against `sessions_update_own` RLS policy (DB layer). Either layer alone would suffice; both together is the defense-in-depth pattern from L-01.

**SSR `/session/[id]` page -- application-layer ownership filter + redirect cascade.**
[src/pages/session/[id].astro:22-41](src/pages/session/%5Bid%5D.astro#L22-L41):

```astro
const { data, error } = await supabase
  .from("sessions")
  .select("id, started_at, ended_at, energy_level")
  .eq("id", id)
  .eq("user_id", user.id)
  .maybeSingle();

if (error || !data) { return Astro.redirect("/dashboard"); }
if (data.ended_at !== null) { return Astro.redirect("/dashboard"); }

const FOCUS_PRESET_SECONDS = 25 * 60;
const ageMs = Date.now() - new Date(data.started_at).getTime();
if (ageMs > 2 * FOCUS_PRESET_SECONDS * 1000) {
  return Astro.redirect("/dashboard");
}
```

Three guard layers feed the same `/dashboard` redirect:
1. No row visible (wrong owner, deleted, never existed, or RLS-blocked) -> redirect.
2. Already ended (`ended_at !== null`) -> redirect.
3. Abandoned (`ageMs > 50 min` -- note: 2 * FOCUS_PRESET_SECONDS = 50 min, while the PATCH plausibility window uses 2 hours).

**The 50-min vs 2-hour threshold inconsistency is a known issue** noted in [context/archive/2026-06-19-first-session-capture-loop/plan.md](context/archive/2026-06-19-first-session-capture-loop/plan.md) and explicitly deferred to S-05 (test-plan §2 row #5). It is **out of scope for Phase 1** (Phase 1 covers risks #2 and #3, not #5) but should be noted for Phase 2.

**Middleware does not protect `/api/sessions/**`.**
[src/middleware.ts:4](src/middleware.ts#L4):

```ts
const PROTECTED_ROUTES = ["/dashboard", "/session/"];
```

`/api/sessions/**` is intentionally absent. The endpoints self-gate via the `if (!context.locals.user) return 401` pattern at [src/pages/api/sessions/[id].ts:14-16](src/pages/api/sessions/%5Bid%5D.ts#L14-L16) and [src/pages/api/sessions/index.ts:9-11](src/pages/api/sessions/index.ts#L9-L11). The middleware still populates `context.locals.user` for every request via `supabase.auth.getUser()` at [src/middleware.ts:14-21](src/middleware.ts#L14-L21), so the API only needs the null-check.

**Test must assert**: unauthenticated PATCH -> 401 (no cookie); authenticated PATCH as user B on user A's session id -> 409 + user A's row unchanged.

**RLS policies -- row-scoped, deliberately column-wide.**
[supabase/migrations/20260531182506_sessions_data_foundation.sql:132-145](supabase/migrations/20260531182506_sessions_data_foundation.sql#L132-L145):

```sql
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_select_own ON public.sessions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY sessions_insert_own ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY sessions_update_own ON public.sessions FOR UPDATE TO authenticated
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
```

The UPDATE policy enforces `user_id = auth.uid()` but **does not constrain which columns can be written**. Column-scope is the API layer's job -- exactly L-01. The DELETE policy was later removed:

[supabase/migrations/20260601120000_drop_sessions_delete_policy.sql:1-6](supabase/migrations/20260601120000_drop_sessions_delete_policy.sql#L1-L6):

```sql
DROP POLICY IF EXISTS sessions_delete_own ON public.sessions;
```

The PRD treats sessions as immutable history. Owner-side DELETE via REST is now denied; only `auth.users` cascade can remove a row.

**Existing pgTAP coverage -- 9 cross-user assertions at DB layer.**
[supabase/tests/rls_sessions.sql:1-105](supabase/tests/rls_sessions.sql#L1-L105) covers, for `sessions`:
- User A sees only their own row (count = 1).
- User A cannot UPDATE user B's row (CTE returning rows -> 0).
- User A cannot DELETE user B's row (0).
- User A cannot DELETE their own row (immutability, 0).
- User A cannot INSERT claiming user B's `user_id` (`42501` WITH CHECK violation).
- `anon` sees 0 sessions.
- `anon` cannot INSERT (42501).
- `anon` cannot UPDATE (0).
- `anon` cannot DELETE (0).

Phase 1 Vitest tests **do not need to re-prove** the DB layer -- they should prove the **API boundary**: that the endpoint returns the right status, mutates the right columns, and never leaks data across users.

### POST `/api/sessions` -- contract reference for the Vitest setup helper

Phase 1 tests need to create a session to then PATCH. The POST endpoint is the canonical creator.

[src/pages/api/sessions/index.ts:23-37](src/pages/api/sessions/index.ts#L23-L37):

```ts
const { data, error } = await supabase
  .from("sessions")
  .insert({
    user_id: context.locals.user.id,
    energy_level: parsed.data.energy_level,
    started_at: new Date().toISOString(),
  })
  .select("id, started_at")
  .single();

if (error) { return Response.json({ error: error.message }, { status: 500 }); }
return Response.json({ id: data.id, started_at: data.started_at }, { status: 201 });
```

Body schema: `{ energy_level: "low" | "medium" | "high" }` -- [src/lib/schemas/session.ts:3-7](src/lib/schemas/session.ts#L3-L7). Server stamps `user_id` from session and `started_at = new Date().toISOString()`. Response: `{ id, started_at }` with 201.

**Note**: the POST schema is also not `.strict()`. Same column-scope discipline applies -- the `.insert()` literal hand-picks columns. Same future-refactor footgun. **This is worth a Phase 1 test too**: POST with `{ energy_level: "medium", user_id: "victim-uuid" }` and assert the created row's `user_id` is the **caller**, not the body value.

### Test infrastructure -- current state is zero

No Vitest, no test pool, no test files. [package.json:5-20](package.json#L5-L20) `scripts` block has no `test` entry; the only test-shaped script is `"db:test": "supabase test db"` for pgTAP. [package.json:21-64](package.json#L21-L64) has no `vitest`, no `@cloudflare/vitest-pool-workers`, no `@vitest/*`, no `jsdom`, no `happy-dom`, no `msw`.

Wrangler config is in place and is what the test pool needs to read: [wrangler.jsonc:1-16](wrangler.jsonc#L1-L16):

```jsonc
{
  "name": "pomo-sapiens",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "compatibility_date": "2026-05-08",
  "compatibility_flags": ["nodejs_compat"],
  // ...
}
```

`compatibility_date` is recent (well above the pool's minimum), and `nodejs_compat` is set -- both are prerequisites for `@cloudflare/vitest-pool-workers` >= the version pinned in test-plan §4 (Vitest >= 4.1).

The `parseJson` helper at [src/lib/parse-request.ts:23-37](src/lib/parse-request.ts#L23-L37) is the shared body-parser the API tests will hit. Its error-shape is `{ data: null, error: "<field>: <message>" }`; the API surfaces this as `{ error: <string> }` with 400.

## Code References

- [src/lib/schemas/session.ts:9-17](src/lib/schemas/session.ts#L9-L17) -- `endSessionSchema` is permissive (not `.strict()`); extra keys silently stripped. **Primary footgun.**
- [src/lib/schemas/session.ts:3-7](src/lib/schemas/session.ts#L3-L7) -- `createSessionSchema` (POST), same shape, same footgun.
- [src/pages/api/sessions/[id].ts:14-16](src/pages/api/sessions/%5Bid%5D.ts#L14-L16) -- 401 self-gate.
- [src/pages/api/sessions/[id].ts:33-39](src/pages/api/sessions/%5Bid%5D.ts#L33-L39) -- client-supplied `ended_at` + plausibility window `[now-2h, now+5s]`.
- [src/pages/api/sessions/[id].ts:41-48](src/pages/api/sessions/%5Bid%5D.ts#L41-L48) -- hand-picked `.update({ ended_at, focus_rating })` + double `.eq` filter + `.is("ended_at", null)` once-only guard.
- [src/pages/api/sessions/[id].ts:54-56](src/pages/api/sessions/%5Bid%5D.ts#L54-L56) -- 409 with intentionally ambiguous message.
- [src/pages/api/sessions/index.ts:23-37](src/pages/api/sessions/index.ts#L23-L37) -- POST insert literal: server-stamped `user_id` + `started_at`.
- [src/pages/session/[id].astro:22-41](src/pages/session/%5Bid%5D.astro#L22-L41) -- SSR ownership filter + ended/abandoned redirect cascade.
- [src/middleware.ts:4](src/middleware.ts#L4) -- `PROTECTED_ROUTES` does **not** include `/api/sessions/`; endpoints self-gate.
- [src/lib/parse-request.ts:23-37](src/lib/parse-request.ts#L23-L37) -- `parseJson` helper; error shape `{ data, error }`.
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:132-145](supabase/migrations/20260531182506_sessions_data_foundation.sql#L132-L145) -- RLS policies on `sessions` (row-scoped, column-wide).
- [supabase/migrations/20260601120000_drop_sessions_delete_policy.sql:1-6](supabase/migrations/20260601120000_drop_sessions_delete_policy.sql#L1-L6) -- DELETE policy dropped (immutability).
- [supabase/tests/rls_sessions.sql:1-105](supabase/tests/rls_sessions.sql#L1-L105) -- 9 pgTAP assertions for cross-user denial.
- [wrangler.jsonc:1-16](wrangler.jsonc#L1-L16) -- runtime config the test pool reads.
- [package.json:5-20](package.json#L5-L20) -- no `test` script today.

## Architecture Insights

- **Two-layer ownership pattern**: every owner-scoped data access has both an RLS check and an application-layer `.eq("user_id", ...)` filter. The application layer is the **statable** layer -- it produces the HTTP status code the client sees; RLS is the safety net.
- **Column-scope is API-code-only**: RLS deliberately does not enumerate writable columns. The hand-picked `.update({...})` / `.insert({...})` literal is the single point of column-scope truth. This is L-01.
- **Information-hiding 409**: cross-user PATCH and already-ended PATCH return the same response. Attackers cannot use status discrimination to enumerate session ids belonging to other users.
- **Client-snapshotted timestamps + server-validated plausibility**: pattern from the timer-resilience design (L-03). `ended_at` is captured on the client at the phase transition (the moment audibly perceptible to the user) and only sanity-checked server-side. This is intentional and out of Phase 1's scope to change.
- **No middleware gating on `/api/*`**: API endpoints are responsible for their own 401. Middleware still populates `context.locals.user`, so endpoints just null-check.
- **Test boundary discipline**: pgTAP covers the DB layer; Phase 1 Vitest must cover the API boundary; Playwright (Phase 4) will cover the SSR redirect cascade. Each layer tests its layer.
- **Test infrastructure is intentionally absent**: this is a green-field bootstrap. No prior choices to undo; no pre-existing config file to align with.

## Historical Context (from prior changes)

- [context/foundation/lessons.md:9](context/foundation/lessons.md#L9) -- **L-01: RLS + API column-scope discipline.** Codifies that wide UPDATE RLS policies must be narrowed by the API layer with hand-picked `.update({...})`, and that `.is("ended_at", null)` makes the row writable exactly once. The PATCH endpoint **is the literal implementation** of L-01.
- [context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md](context/archive/2026-05-29-sessions-data-foundation/reviews/impl-review.md) -- finding F2 ("sessions UPDATE/DELETE policy broader than immutability intent") was accepted as design after team discussion: keep the policy wide, enforce immutability in API code. The subsequent `drop_sessions_delete_policy` migration partially walked that back for DELETE only.
- [context/archive/2026-06-19-first-session-capture-loop/plan.md](context/archive/2026-06-19-first-session-capture-loop/plan.md) -- the PATCH endpoint design (`.eq("user_id", user.id).is("ended_at", null).select("id").maybeSingle()`) was specified here in Phase 3 (API surface). The SSR cross-user redirect was specified in Phase 2 (server-load).
- [context/archive/2026-06-19-first-session-capture-loop/plan.md](context/archive/2026-06-19-first-session-capture-loop/plan.md) -- the 50-min SSR threshold vs 2-hour API threshold inconsistency was noted post-implementation and explicitly deferred to S-05 (now risk #5 in the test plan). Phase 1 should not change either threshold; it should pin the **current** behavior so Phase 5 can change it deliberately.

## Phase 1 Test Targets (what the upcoming Vitest tests should assert)

Synthesized from the findings above. The `/10x-plan` step that follows will turn these into a test file structure under `tests/integration/api/`.

**Risk #2 protection -- PATCH column-scope and once-only finalization:**

1. **Column-scope: extra columns silently stripped, no mutation outside contract.** PATCH with `{ focus_rating: 4, ended_at: "<now>", user_id: "<some-uuid>", energy_level: "high", note: "x" }` -> 200 + row's `user_id`, `energy_level`, `note` unchanged. Pins the current "safe by literal" behavior; will fail loudly if a future refactor changes `.update({...})` to `.update(parsed.data)`.
2. **Once-only: second PATCH returns 409.** POST session -> PATCH valid -> 200. Re-PATCH same id -> 409 with body `{ error: "Session already ended or not found" }`. Row's `ended_at` and `focus_rating` from first call unchanged after second call.
3. **Plausibility window: `ended_at` outside `[now-2h, now+5s]` returns 400.** Three sub-cases: future (`now + 10s` -> 400), far past (`now - 3h` -> 400), boundary OK (`now - 1h` -> 200).
4. **Schema: missing `ended_at` -> 400 with field-named message; `focus_rating > 5` -> 400; `focus_rating = null` -> 200 (PRD allows nullable rating).**
5. **Unauthenticated PATCH -> 401.** No cookie set.

**Risk #3 protection -- cross-user API access:**

6. **Cross-user PATCH returns 409 + no mutation on target row.** User A creates session sA. User B attempts PATCH sA. Response: 409. Read-back of sA as user A: `ended_at` still NULL, `focus_rating` still NULL.
7. **POST cannot inject `user_id`.** User A POSTs `{ energy_level: "medium", user_id: "<user-B-id>" }`. Created row's `user_id` is user A's id, not the body value.

**Out of Phase 1 scope (covered elsewhere or deferred):**

- DB-layer cross-user denial -- already covered by `supabase/tests/rls_sessions.sql`.
- SSR `/session/[id]` redirect for cross-user / ended / abandoned -- belongs to Phase 4 (Playwright e2e) per test-plan §3.
- 50-min vs 2-hour threshold reconciliation -- belongs to risk #5 / Phase 2.

## Test Runner Bootstrap (infrastructure summary for `/10x-plan`)

What needs to be added by Phase 1's implementation step:

- `vitest`, `@cloudflare/vitest-pool-workers` (>= the version that supports `cloudflareTest()` reading `wrangler.jsonc`), `@vitest/coverage-v8` -- dev dependencies. Test-plan §4 pins **Vitest >= 4.1**.
- `vitest.config.ts` (or `vitest.workspace.ts` if Phase 2's jsdom project is anticipated) referencing the Workers pool plugin.
- `tests/integration/api/` directory (or equivalent -- final path is a Phase 1 plan decision).
- `package.json` `"test"` script.
- A fixture / helper that creates **two authenticated Supabase clients** for user A and user B. The challenge: `createClient` in [src/lib/supabase.ts](src/lib/supabase.ts) reads cookies via the `@supabase/ssr` server client. Tests must either (a) drive auth through the same signin endpoint and capture cookies, or (b) construct service-role inserts into `auth.users` (mirroring the pgTAP setup) and stub `context.locals.user` directly.
- CI wiring -- test-plan §5 lists "Vitest Workers integration" as **required after §3 Phase 1**, so the `npm run test` step should be added to `.github/workflows/ci.yml` in the same PR.

These are scoping inputs for `/10x-plan`; this research does not prescribe the test file layout, the fixture strategy, or the CI wiring.

## Related Research

None yet -- this is the first research artifact for the testing-api-contract change.

## Open Questions

1. **Auth fixture strategy** -- driving real signin (cookie capture) vs. direct `auth.users` insert + `context.locals.user` stub. Both work inside the Workers pool; the cookie-capture path tests one more layer of the stack but is slower. `/10x-plan` should pick one.
2. **Supabase availability in CI** -- the test pool needs `SUPABASE_URL` / `SUPABASE_KEY` against a live (local or hosted) Postgres for any test that actually round-trips to the DB. CI currently exposes these as secrets for build; do they cover a writable DB, or is a `services:` block (local supabase container) needed in `ci.yml`? Out of scope for research; flag for `/10x-plan`.
3. **`db:types` drift** -- Phase 1 modifies no schema, but the bootstrap PR will touch `package.json`. Confirm CI's `db:types` diff gate (test-plan §5, "required after §3 Phase 3") does not yet exist, so this PR will not be blocked by it.
4. **Threshold inconsistency disclosure** -- the 50-min SSR / 2-hour API gap should be tested as the current behavior in Phase 1 (so risk #5's fix in Phase 2 has a regression target) **or** explicitly skipped and left to Phase 2. `/10x-plan` decision.
