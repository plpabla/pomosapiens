# Playwright e2e regression for the full session capture flow — Plan Brief

> Full plan: `context/changes/testing-e2e-session-capture-flow/plan.md`

## What & Why

Add a Playwright e2e regression gate covering the user-visible session capture flow (dashboard → energy pick → timer → rate → history) plus three SSR-only redirect assertions (cross-user, ended, abandoned) that Vitest cannot reach. This is rollout Phase 4 of [test-plan.md §3](../../foundation/test-plan.md#3-phased-rollout) and the last layer before the e2e quality gate flips to `active` in §5.

## Starting Point

Phases 1-3 of the test rollout shipped Vitest workers integration, jsdom unit tests, and a post-deploy schema validation gate. The Playwright e2e layer is named in the stack but not installed — no `@playwright/test` dependency, no `tests/e2e/`, no CI job. The `setupTwoUsers` fixture from the integration tests is pure Node and can be reused directly from a Playwright runner.

## Desired End State

Four Playwright specs run in CI on every PR to `main`, blocking merge when the cross-cutting capture flow or the three SSR redirect paths break. The Phase 4 row in test-plan.md reads `complete`, the §5 e2e gate reads `required (active)`, and §6.5 cookbook documents the pattern for adding new e2e flows.

## Key Decisions Made

| Decision                        | Choice                                                      | Why (1 sentence)                                                                                            | Source |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| Timer speed-up                  | Click "Stop early" button                                   | Exercises the real SessionRunner state machine end-to-end without fixture special-casing.                   | Plan   |
| Browser matrix                  | Chromium only                                               | Cheapest signal for cross-cutting regression; matches workerd's V8 identity; Safari autoplay is out of scope. | Plan   |
| Scenario count                  | 4 (happy + #3 cross-user + #5 ended + #5 abandoned)         | Risk #5 has two SSR-only branches; abandoned redirect can only be proven in a real browser context.         | Plan   |
| User fixture                    | Per-spec `setupTwoUsers` + cleanup                          | Full isolation; supports parallel specs; mirrors the integration-test pattern verbatim.                     | Plan   |
| Web server                      | Playwright `webServer` runs `astro dev`                     | Uses the workerd-backed Astro dev runtime; no extra build step; supports `reuseExistingServer` locally.     | Plan   |
| CI placement                    | Separate `e2e:` job parallel to `ci:` in `ci.yml`           | Independent PR-check reporting; parallel execution keeps wall-time flat.                                    | Plan   |
| Gate timing                     | Required from the first green run, `retries: 0`             | Matches test-plan §5 stance; flake gets investigated, not papered over with auto-retry.                     | Plan   |

## Scope

**In scope:**
- `@playwright/test` install + `playwright.config.ts` (Chromium, webServer = `astro dev`)
- `tests/e2e/_fixtures/{auth,sessions}.ts` (auth cookie seeder + service-role insert helper)
- `tests/e2e/session-capture.spec.ts` (happy path via "Stop early")
- `tests/e2e/session-access.spec.ts` (three SSR redirect tests)
- Parallel `e2e:` CI job with Playwright browser cache
- test-plan.md §3/§5/§6.5 updates + CLAUDE.md command list update

**Out of scope:**
- Firefox / WebKit projects, visual regression, accessibility scans
- Audio assertions (L-02 stays manual)
- Timer-natural-completion test (would require 25 min)
- Unauth and invalid-uuid redirects (middleware-level, covered cheaper elsewhere)
- Playwright retries

## Architecture / Approach

```
Playwright spec
  └─ setupTwoUsers()  ──►  Supabase admin: create users + sign in
                            └─ returns sb-<ref>-auth-token=base64-<...> cookies
  └─ browser.newContext()
       └─ context.addCookies([{ name, value, domain: "localhost", ... }])
  └─ page.goto("/dashboard")  ──►  astro dev (workerd) ──►  middleware reads cookie ──►  authenticated SSR
```

Happy path drives the real UI (`getByRole` locators only — no Tailwind class selectors). SSR redirect specs use service-role inserts to set up rows with specific `started_at`/`ended_at` states, then assert the browser lands on `/dashboard` after `page.goto("/session/<id>")`.

## Phases at a Glance

| Phase                          | What it delivers                                          | Key risk                                                                  |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Test harness scaffolding    | Playwright installed; `npx playwright test --list` works  | webServer wiring against `astro dev` cold-start                           |
| 2. Auth fixture + happy path   | Cookie seeder + the cross-cutting flow spec               | Cookie domain/format mismatch breaks middleware authentication            |
| 3. SSR redirect specs          | Service-role insert helper + three SSR-only assertions    | Abandoned-threshold value drift if S-05 changes `2 × focusPresetSeconds`  |
| 4. CI gate + docs              | Parallel `e2e:` job, test-plan + CLAUDE.md updates        | Branch-protection update is a one-time operator step (named in Manual)    |

**Prerequisites:** Supabase remote project with `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` available locally and in CI secrets (already true — integration tests use the same).
**Estimated effort:** ~2 sessions across 4 phases. Each phase is independently mergeable; Phase 1 is ~15 min, Phases 2-3 are the bulk, Phase 4 is mostly YAML + docs.

## Open Risks & Assumptions

- The 2 × focusPresetSeconds abandoned boundary in [src/lib/session/access.ts:26](../../../src/lib/session/access.ts#L26) has a `TODO(S-05)` flag; if S-05 lands before this plan does, the Risk #5b spec needs to track the new boundary.
- `astro dev` cold-start under Playwright's `webServer.timeout` (60s) is comfortable today but degrades if dependencies grow — bump the timeout if needed.
- Remote Supabase rate limits on `auth.admin.createUser` aren't documented; four specs creating two users each (= 8 users per run) is well below any plausible limit but worth watching as the suite grows.

## Success Criteria (Summary)

- `npm run test:e2e` exits 0 locally with all four specs green
- CI `e2e:` job is required, parallel to `ci:`, and blocks merge on regression
- Breaking any of the four covered guards (column-scope, owner filter, ended redirect, abandoned threshold) fails the matching spec with a readable error
