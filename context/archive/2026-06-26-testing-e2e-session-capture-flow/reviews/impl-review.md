<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Playwright e2e regression for the full session capture flow

- **Plan**: context/changes/testing-e2e-session-capture-flow/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | FAIL    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Unplanned pre-commit hook now runs the full e2e suite

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Scope Discipline
- **Location**: .husky/pre-commit:2
- **Detail**: Phase 4 added `npm run test:e2e` to the pre-commit hook (`.husky/pre-commit:1-4`). This is NOT in the plan, which only added the script + CI job and called out `reuseExistingServer: !process.env.CI` to keep local dev convenient. Consequences: (1) every commit boots `astro dev`, launches Chromium, creates 8+ ephemeral Supabase users, runs 5 specs — ~30-60s of wall-clock; (2) commits fail when Supabase is not running locally; (3) CLAUDE.md frames `npm run test:e2e` as a deliberate action with explicit setup — promoting it to pre-commit contradicts that framing and the test-plan §4 layering model (e2e belongs in CI or pre-push, not per-commit).
- **Fix A ⭐ Recommended**: Revert the e2e line in `.husky/pre-commit`.
  - Strength: Restores fast commits; e2e is already required in CI per Phase 4. Pre-commit and CI shouldn't redundantly do the same multi-second check.
  - Tradeoff: E2e regressions surface 1-2 min later (on push, via CI) instead of at commit time.
  - Confidence: HIGH — pre-push or CI is the standard layer for e2e across this project's other gates.
  - Blind spot: User may want this on purpose. Worth asking before reverting.
- **Fix B**: Keep but move to pre-push (or document in plan).
  - Strength: Preserves local fast-feedback intent without punishing every commit.
  - Tradeoff: Requires installing a pre-push hook (not in repo today) or updating the plan + CLAUDE.md to legitimize the pre-commit choice.
  - Confidence: MEDIUM — needs new hook plumbing.
  - Blind spot: Haven't confirmed devs run `db:start` before committing.
- **Decision**: FIXED via Fix A — removed `npm run test:e2e` from `.husky/pre-commit`.

### F2 — Unplanned `tests/e2e/seed.spec.ts`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/seed.spec.ts
- **Detail**: Plan listed only `session-capture.spec.ts` (Phase 2) and `session-access.spec.ts` (Phase 3). Actual spec count is 5 across 3 files — `seed.spec.ts` is a /10x-e2e "quality lever exemplar" not in the plan. The capture + access specs reference it as a `Seed:` header comment. It calls `setupTwoUsers()` inside the test (not `beforeAll`), adding ~1-2s overhead per run.
- **Fix**: Document seed.spec.ts in the plan as a Phase-2 addendum or delete it.
- **Decision**: FIXED — added Phase 2 §4 addendum to plan.md documenting `tests/e2e/seed.spec.ts` as the quality-lever exemplar.

### F3 — `reporter: "github"` likely prevents the failure-artifact upload

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: playwright.config.ts:10, .github/workflows/ci.yml:69-74
- **Detail**: Plan contract was `reporter: process.env.CI ? "github" : "list"` and a CI artifact upload of `playwright-report/`. Both shipped as written. But the `github` reporter does NOT generate HTML output — it only emits inline GitHub annotations. With no other reporter configured, Playwright will not populate `playwright-report/`, so `actions/upload-artifact@v4` on failure either uploads nothing or fails with "No files were found". Phase 4 manual item 4.3 ("Playwright HTML report uploads on a deliberate failure") is marked `[x]` but the config as-written cannot satisfy it.
- **Fix A ⭐ Recommended**: Use the html reporter alongside github in CI.
  - Strength: One-line change: `reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list"`. Restores the intent of artifact upload.
  - Tradeoff: Minor.
  - Confidence: HIGH — standard Playwright pattern; matches the plan's manual-verification intent.
  - Blind spot: None significant.
- **Fix B**: Drop the upload step and the manual-verification item.
  - Strength: Honest about the chosen reporter; less moving parts.
  - Tradeoff: Loses post-mortem artifacts when CI fails — debugging flakes will be harder, which violates the "required from day one" stance.
  - Confidence: MEDIUM.
  - Blind spot: Might be revisited later anyway when the first real CI flake hits.
- **Decision**: FIXED via Fix A — `playwright.config.ts:10` now uses `[["github"], ["html", { open: "never" }]]` in CI.

### F4 — `--pass-with-no-tests` masks accidental test-discovery failures

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package.json:22
- **Detail**: Plan contract: `"test:e2e": "playwright test"`. Actual: `node --env-file-if-exists=.env --env-file-if-exists=.dev.vars node_modules/@playwright/test/cli.js test --pass-with-no-tests`. The `--env-file-if-exists` part is a reasonable adaptation (fixture needs SUPABASE_SERVICE_ROLE_KEY from `.dev.vars`). But `--pass-with-no-tests` was useful only during Phase 1 (the placeholder); now that real specs exist, the flag turns any future spec-glob mismatch or `testDir` typo into a silent green CI run — defeating the "required from day one" gate.
- **Fix**: Drop `--pass-with-no-tests` from the script; keep `--env-file-if-exists`.
- **Decision**: FIXED — removed `--pass-with-no-tests` from `package.json:22`.

### F5 — `waitForLoadState("networkidle")` is the discouraged anti-pattern

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/session-capture.spec.ts:35
- **Detail**: CLAUDE.md's e2e section: "Never `page.waitForTimeout()`. Wait for state: `toBeVisible()`, `waitForURL()`, `waitForResponse()`." The spec uses `await page.waitForLoadState("networkidle")` to wait for hydration, then immediately follows with `expect(...).toBeEnabled()` which IS the right state-based wait. `networkidle` is redundant and Playwright's own docs flag it as flaky in apps with long-polling.
- **Fix**: Remove the `networkidle` line — the subsequent `toBeEnabled()` assertion already waits for React hydration.
- **Decision**: SKIPPED — tried removing the `networkidle` wait but the spec failed without it (the subsequent `toBeEnabled()` was not sufficient to cover React hydration in this flow). Reverted; line kept at `tests/e2e/session-capture.spec.ts:35`. No lesson recorded — the anti-pattern guidance does not hold for this case.

### F6 — `change.md` status still reads `implementing`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-e2e-session-capture-flow/change.md:4
- **Detail**: All 4 phases are fully checked in Progress. Change file still shows `status: implementing`.
- **Fix**: This review will set `status: impl_reviewed` on save.
- **Decision**: FIXED — `change.md:4` already reads `status: impl_reviewed`.

### F7 — Cookbook §6.5 import example diverges from the actual specs

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md:164
- **Detail**: Cookbook §6.5 instructs new specs to import `setupTwoUsers` from `"../../_fixtures/auth"` (the integration path) and `seedAuthCookie` from `"./_fixtures/auth"`. The actual specs import BOTH from `"./_fixtures/auth"` (the e2e re-export at `tests/e2e/_fixtures/auth.ts:3`). Two paths for the same symbol invites bit-rot.
- **Fix**: Update §6.5 to import both symbols from `"./_fixtures/auth"`.
- **Decision**: FIXED — `context/foundation/test-plan.md:164` now imports `setupTwoUsers` and `seedAuthCookie` from `"./_fixtures/auth"`.
