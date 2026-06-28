<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test Runner Bootstrap + Session API Contract

- **Plan**: context/changes/testing-api-contract/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation (triaged 2026-06-23: F1 fixed, F2 fixed, F3 fixed, F4 skipped, F5 fixed)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Summary

The plan landed cleanly. Files match the plan, secrets are correctly scoped (`SUPABASE_SERVICE_ROLE_KEY` never declared in `astro.config.mjs` `env.schema`; only read in `tests/_fixtures/{auth,db}.ts`), CI gate is wired (test step exposes the three secrets), the cookbook is filled, and `npm run lint` + `npm run build` both pass green. The two extra files outside the plan's file list (`tests/tsconfig.json`, `eslint.config.js` astro `parserOptions` block) are justifiable scaffolding to make the tests typecheck and lint.

The substantive findings are about **test signal quality**: the regression gates are weaker than their names claim. Progress notes 2.3 and 3.3 honestly disclose this, but the public surface (test names, `test-plan.md §6.1` cookbook, `lessons.md` L-01) still advertises the original gating story. Future contributors reading those surfaces cold will believe the gates are stronger than they are.

## Findings

### F1 — L-01 column-scope test does not fail under its named sabotage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality / Success Criteria
- **Location**: tests/integration/api/sessions.end.test.ts:33-62 (plus context/foundation/test-plan.md §6.1 reference)
- **Detail**: Test name "silently strips columns outside the contract (regression gate for L-01)" advertises this as the canonical L-01 template (plan.md:156, 178; test-plan.md §6.1). Progress 2.3 (plan.md:383) admits the planned sabotage (`.update({ended_at, focus_rating})` → `.update(parsed.data)`) does NOT trip the test because `endSessionSchema` is plain `z.object()` and Zod's default-strip removes `user_id`/`energy_level`/`note` before they ever reach `.update()`. The two `.update()` forms are observationally identical today. The test still pins real columns (user_id stays owner's, energy_level unchanged, note absent) so it would catch an explicit widening like `.update({ ended_at, focus_rating, energy_level: parsed.data.energy_level })` — but it does not gate the named refactor it claims to gate. The cookbook in test-plan.md §6.1 points future contributors at this exact test as the canonical L-01 pattern, propagating the gap.
- **Fix A ⭐ Recommended**: Add a second column-scope test where the sabotage actually trips — extend `endSessionSchema` with an extra writable-looking field (e.g. `note: z.string().optional()`) in a throwaway sabotage branch, or author a test that PATCHes a permissive-schema body and asserts the row's `energy_level` is unchanged. Update L-01 in lessons.md to mention the Zod-strip dependency (today's column-immutability is two-layer: Zod strips unknown keys + hand-picked `.update()` for known keys); update test-plan.md §6.3 to note the gap.
  - Strength: Makes the sabotage actually fail and codifies the dependency in L-01 so the next `.update(parsed.data)` refactor is properly gated.
  - Tradeoff: Two new lines in lessons.md + one test edit; minor follow-up against a closed-out phase.
  - Confidence: HIGH — the gap is documented in Progress; only the public surface (test name, §6.1, L-01) lags behind.
  - Blind spot: None significant — security risk is small today because Zod-strip does cover it, but signal-quality debt compounds.
- **Fix B**: Accept and rename — change test name from "regression gate for L-01" to "PATCH ignores extra body keys", remove the L-01 claim from §6.1 cookbook, and document in §6.3 that column-scope discipline relies on Zod-strip + hand-picked update together.
  - Strength: No new tests; honest naming.
  - Tradeoff: Loses the "named gate" property the test plan claims in §2 row #2.
  - Confidence: MEDIUM — depends on whether the named-gate property is load-bearing.
  - Blind spot: Reviewers reading §6.1 cold may still over-interpret unless §6.3 is explicit.
- **Decision**: FIXED via Fix A -- renamed test to "column-scope: extra body keys stripped by Zod and only declared columns written (regression gate for L-01)"; added two-layer comment in test; updated L-01 in lessons.md; updated test-plan.md §6.1 reference test name and §6.3 with two-layer guarantee note.

### F2 — Cross-user PATCH test produces no API-layer signal

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Success Criteria
- **Location**: tests/integration/api/sessions.end.test.ts:173-195 (vs plan.md:17, test-plan.md §2 row #3)
- **Detail**: Plan.md:17 promises: "This plan does NOT re-prove the DB layer; it proves the API boundary." Progress 3.3 (plan.md:396) admits removing `.eq("user_id", context.locals.user.id)` from `src/pages/api/sessions/[id].ts:45` does NOT make the cross-user test fail — RLS `sessions_update_own USING` blocks user B from seeing user A's row at the DB layer; PostgREST returns zero rows and the endpoint emits 409 via the `!data` branch regardless of the `.eq` guard. Risk #3's "cross-user PATCH returns 409 + no row mutation" is currently gated by `supabase/tests/rls_sessions.sql` alone, not by the new integration test. The information-hiding test at lines 197-250 IS signal-bearing (byte-identical JSON body is an API-only concern); only the cross-user-409 test at 173-195 is duplicate signal.
- **Fix ⭐ Recommended**: Annotate the test and update test-plan.md §2 row #3 to credit the actual signal source. Add a leading comment on the test block explaining it pins the _response shape_ at the API boundary (status + body) while DB-layer RLS pins the access-denial enforcement, with a cross-reference to `supabase/tests/rls_sessions.sql`. Update test-plan.md §2 row #3 evidence column to read "API integration pins 409 response shape and information-hiding; access-denial enforcement traced to pgTAP rls_sessions.sql".
  - Strength: Honest accounting in the test plan; future contributors won't assume the API guard is gated by Vitest.
  - Tradeoff: Minor doc churn against a closed-out phase.
  - Confidence: HIGH — Progress 3.3 already disclosed this.
  - Blind spot: If RLS policy is ever loosened, the test silently becomes signal-bearing — could be reassuring or confusing.
- **Decision**: FIXED -- added attribution comment to the cross-user test block; updated test-plan.md §2 row #3 "Likely cheapest layer" column to distinguish DB-layer access-denial (pgTAP) from API-boundary response-shape pinning (Vitest).

### F3 — Plausibility "future" sub-case has only 5s margin vs CLOCK_SKEW_MS

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: tests/integration/api/sessions.end.test.ts:101
- **Detail**: Endpoint allows `endedAtMs <= nowMs + 5_000ms` (`src/pages/api/sessions/[id].ts:11, 37`). Test sends `Date.now() + 10_000` expecting 400. Relative offset between test's `Date.now()` and Worker's `Date.now()` is 5s of margin. Under a slow CI runner (GitHub Actions cold start with `npm ci` + build queued) that margin could collapse and flip the test to 200. The "3 hours ago" sub-case isn't risky (-3h vs -2h boundary is huge).
- **Fix**: Bump the "future" offset from `10_000` to `60_000` (still semantically "future", margin against +5s window now 55s).
- **Decision**: FIXED -- bumped "future" offset from 10_000ms to 60_000ms (55s margin against the +5s endpoint window).

### F4 — L-01 in lessons.md omits the Zod-strip dependency

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency (rules-file integrity)
- **Location**: context/foundation/lessons.md:7-13
- **Detail**: L-01 reads: "RLS enforces row-level ownership; the endpoint enforces column-level immutability." Today the column-level immutability for _unknown_ body keys is enforced by Zod's default-strip on `z.object(...)`, not by the hand-picked `.update({ ended_at, focus_rating })`. A future contributor who switches `endSessionSchema` to `.passthrough()` or `z.looseObject` silently breaks L-01 _without_ touching the endpoint. The rule doesn't say so. Closely related to F1; fix together.
- **Fix**: Append one sentence to L-01: "This relies on the request schema being a non-passthrough `z.object(...)` — switching to `.passthrough()` would break column-scope without touching the endpoint."
- **Decision**: SKIPPED -- already resolved by F1 Fix A (L-01 updated with Zod-strip dependency paragraph).

### F5 — db.ts comment overstates singleton lifetime

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: tests/\_fixtures/db.ts:13 (comment)
- **Detail**: Comment says "Module-level singleton" but `@cloudflare/vitest-pool-workers` isolates each test file into its own Worker context, so it is per-file, not per-suite. Not a bug — just docs.
- **Fix**: Reword to "Per-file singleton (each test file gets its own Worker context under @cloudflare/vitest-pool-workers)."
- **Decision**: FIXED -- rewrote comment to "Per-file singleton (each test file gets its own Worker context under @cloudflare/vitest-pool-workers)."
