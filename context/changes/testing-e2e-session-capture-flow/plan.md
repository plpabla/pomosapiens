# Playwright e2e regression for the full session capture flow — Implementation Plan

## Overview

Add Playwright as the cross-cutting regression gate for the user-visible session capture path — dashboard → /session/new → energy pick → timer → rate → return to history — plus three SSR-only redirect assertions (Risk #3 cross-user, Risk #5a ended, Risk #5b abandoned) that the existing Vitest layers cannot reach. The suite reuses the integration-test auth fixture (`setupTwoUsers`) to provision real Supabase users, drives the SSR app via `astro dev`, runs Chromium-only, and lands as a required CI job from the first green run.

## Current State Analysis

- **Playwright is named in the stack but not installed.** [context/foundation/test-plan.md:83](context/foundation/test-plan.md#L83) lists Playwright "latest stable" as the e2e tool, and §5 names the gate as required after Phase 4. `package.json` has no `@playwright/test` dependency.
- **Reusable auth fixture already exists.** [tests/_fixtures/auth.ts](tests/_fixtures/auth.ts) is pure Node (no `cloudflare:test` imports, no Workers-specific APIs). `setupTwoUsers()` creates two ephemeral Supabase users via the service role, signs them in, and returns cookie values in the exact `sb-<projectref>-auth-token=base64-<...>` format that `@supabase/ssr` decodes server-side. Same fixture file can be imported from a Node-based Playwright runner.
- **Service-role insert helper exists for reads.** [tests/_fixtures/db.ts](tests/_fixtures/db.ts) wraps `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` and exposes `readSession`. No insert helper yet; Phase 3 needs one to set up ended and abandoned session rows.
- **SSR redirect logic is centralized.** [src/pages/session/[id].astro:23-39](src/pages/session/%5Bid%5D.astro#L23-L39) does the owner filter (`.eq("user_id", user.id)`) and then delegates to [src/lib/session/access.ts](src/lib/session/access.ts) for ended/abandoned. Risk #3 redirect fires from the `.maybeSingle()` returning null when the row's user_id doesn't match; Risk #5a from `ended_at !== null`; Risk #5b from `nowMs - startedAtMs > 2 * focusPresetSeconds * 1000` (50 min for the 25-min preset).
- **Happy path is reachable via "Stop early".** [src/components/session/SessionRunner.tsx:55-58](src/components/session/SessionRunner.tsx#L55-L58) exposes a real `Stop early` button that transitions the SessionRunner to the rating phase without waiting 25 minutes. The DB row gets `duration_seconds ≈ 1` and a real `focus_rating` — exercises POST /api/sessions, the SSR access guard, the timer hook mount, the state machine transition, PATCH /api/sessions/[id], and the post-rating dashboard navigation.
- **CI already wires Supabase secrets.** [.github/workflows/ci.yml](.github/workflows/ci.yml) sets `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for the build + npm test steps and writes them into `.dev.vars`. The e2e job can mirror this.
- **`astro dev` is the Astro+Cloudflare workerd dev runtime.** Default port 4321. The middleware ([src/middleware.ts](src/middleware.ts)) resolves the Supabase client from cookies on every request — injecting a cookie via `context.addCookies()` is the only thing needed for an authenticated browser context.
- **Test directory convention.** Vitest projects live under `tests/integration/` and `tests/unit/`. New e2e directory mirrors as `tests/e2e/`. `tests/tsconfig.json` ([tests/tsconfig.json](tests/tsconfig.json)) is shared across all test projects today.

## Desired End State

When this plan is complete:

- `npm run test:e2e` runs four Playwright specs against `astro dev` and exits 0.
- The CI `e2e:` job runs on every push/PR to `main` parallel to the existing `ci:` job; both must pass for merge.
- A failing session capture flow (broken POST /api/sessions, broken SessionRunner mount, broken PATCH /api/sessions/[id], broken history list rendering) blocks merge.
- A cross-user `/session/[id]` access regression blocks merge (Risk #3 SSR slice).
- An ended-session or abandoned-session redirect regression blocks merge (Risk #5 SSR slice).
- `context/foundation/test-plan.md` §3 Phase 4 status reads `complete`; §5 Playwright gate reads active; §6.5 cookbook section is filled in with the e2e pattern.
- `CLAUDE.md` Commands section documents `npm run test:e2e` and `npx playwright install`.

### Key Discoveries:

- `setupTwoUsers` from [tests/_fixtures/auth.ts](tests/_fixtures/auth.ts) returns cookie strings parseable as Playwright `Cookie` objects (name=value with name = `sb-<projectref>-auth-token`, value = `base64-<base64url-JSON>`) — minimal adapter needed.
- The Supabase `auth_token` cookie format must be set with `domain: "localhost"`, `path: "/"`, `httpOnly: false`, `sameSite: "Lax"`. The middleware reads cookies before any other gate, so seeding once per `BrowserContext` covers the whole spec.
- "Stop early" emits `stoppedAtMs` from `useFocusTimer` ([src/lib/timer/useFocusTimer.ts]) and the rating-screen submit uses that value as `ended_at` — same code path that production hits when a user actually stops early. The DB plausibility window for `ended_at` (TWO_HOURS_MS before and CLOCK_SKEW_MS after now, [src/pages/api/sessions/[id].ts:10-11](src/pages/api/sessions/%5Bid%5D.ts#L10-L11)) easily passes for a stopped-immediately session.
- The abandoned-threshold scenario must insert a row with `started_at = now - 51 minutes` (just over 2 × 25 min). The session row's `ended_at` stays null; the redirect triggers from the wall-clock threshold alone, not from any column transition.
- `astro dev` cold-start is ~3-5s; Playwright's `webServer.timeout` defaults to 60s — comfortable margin.
- The integration auth fixture creates users in parallel with `crypto.randomUUID()` emails — collision-free even under parallel spec execution.

## What We're NOT Doing

- **No audio assertions in e2e.** L-02 (Safari autoplay) stays a manual smoke; the chime trigger is unit-tested in `tests/unit/timer/` already.
- **No Firefox or WebKit projects** in `playwright.config.ts`. Chromium-only per scope decision; matches Cloudflare workerd's V8 identity for the SSR side.
- **No visual regression / screenshot tests.** §7 of test-plan calls out Tailwind class snapshots as deliberately untested.
- **No tests for the EnergyPicker validation states, button disabled states, or per-energy-level coverage.** Component-level concerns belong in jsdom; e2e proves the cross-cutting flow once with `energy_level: "medium"`.
- **No tests for unauthenticated `/session/[id]` → /auth/signin redirect** or invalid-uuid redirect. Middleware-level redirects don't need a real browser — they're better as unit tests on middleware + `resolveSessionPageAccess`.
- **No timer-natural-completion test.** Waiting 25 minutes is out of scope; the timer reconcile logic is pinned by `tests/unit/timer/useFocusTimer.test.ts` already.
- **No retry config** in Playwright. Required-from-day-one with `retries: 0` per scope decision — flake gets investigated, not papered over.
- **No new Playwright fixtures or test-runner extensions** (e.g., custom `test.extend`). Plain `test.beforeAll` / `test.afterAll` matches the existing Vitest spec style.

## Implementation Approach

Four sequential phases, each independently mergeable:

1. **Phase 1 (harness)** installs Playwright and proves `npx playwright test --list` works against a webServer-launched `astro dev`. No specs.
2. **Phase 2 (happy path)** adds the auth helper that adapts `setupTwoUsers` into Playwright cookies and lands the single most-important regression — the cross-cutting capture flow.
3. **Phase 3 (SSR redirects)** adds the service-role session-insert helper and the three SSR-only assertions.
4. **Phase 4 (gate + docs)** wires the CI job and closes out the test-plan documentation. Required-gate status flips after the first green run on `main`.

Each phase ships with `npm run test:e2e` green locally before its merge; Phase 4 adds the CI enforcement.

## Critical Implementation Details

- **Cookie domain must be `localhost` (not the Supabase URL hostname).** The integration tests pass the cookie via an HTTP header, where domain doesn't matter; Playwright's `context.addCookies()` requires explicit domain + path. The cookie name still derives from the Supabase project ref (e.g. `sb-<ref>-auth-token`) — only the `domain` field changes between the two consumers.
- **`focus_rating` must be 1-5 or null on the rating screen.** Sending integers outside this range fails Zod validation at the PATCH layer; the test should click a real `[1..5]` button to stay on the happy path.
- **The abandoned-threshold scenario depends on the 2 × focusPreset boundary in [src/lib/session/access.ts:26](src/lib/session/access.ts#L26).** That file has a `TODO(S-05)` noting the boundary will change. The e2e back-date should be expressed as `now - (2 * 25 * 60 + 60) * 1000 ms` (50 min + 1 min slack), referencing the same focusPresetSeconds the page uses, so the test moves together when S-05 ships.
- **Playwright `webServer.reuseExistingServer` must be `!process.env.CI`.** In CI we always launch a fresh server. Locally, devs running `npm run dev` in another terminal should be able to re-run e2e instantly without port conflicts.
- **`astro sync` runs in `postinstall`** ([package.json:10](package.json#L10)). After installing Playwright the postinstall fires; no additional sync needed.

---

## Phase 1: Test harness scaffolding

### Overview

Install `@playwright/test`, write `playwright.config.ts`, add the `npm run test:e2e` script, update `.gitignore` for Playwright output directories. No specs yet. Phase exits green when `npx playwright test --list` returns successfully and `npm run dev` boots through the webServer config.

### Changes Required:

#### 1. Playwright dependency

**File**: `package.json`

**Intent**: Add `@playwright/test` to `devDependencies` so the runner and types are available locally and in CI.

**Contract**: `@playwright/test` at latest stable (^1.x). Add `"test:e2e": "playwright test"` to `scripts`. No other dependency or script changes.

#### 2. Playwright configuration

**File**: `playwright.config.ts` (new, at project root)

**Intent**: Single Chromium project, webServer launches `npm run dev`, tests live under `tests/e2e/`. Required-from-day-one means `retries: 0` and no `fullyParallel` shortcuts that mask order-dependence.

**Contract**: Exports `defineConfig({ ... })` with these fields:
- `testDir: "./tests/e2e"`
- `timeout: 30_000`, `expect: { timeout: 5_000 }`
- `fullyParallel: true`
- `forbidOnly: !!process.env.CI`
- `retries: 0`
- `reporter: process.env.CI ? "github" : "list"`
- `use: { baseURL: "http://localhost:4321", trace: "on-first-retry" }`
- `projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]`
- `webServer: { command: "npm run dev", url: "http://localhost:4321", reuseExistingServer: !process.env.CI, timeout: 60_000 }`

#### 3. tsconfig coverage for e2e

**File**: `tests/tsconfig.json`

**Intent**: Existing config already globs `**/*.ts` so e2e files compile under the same tsconfig — no edit needed. Verify by running `npx tsc --noEmit -p tests/tsconfig.json` after harness scaffolding.

**Contract**: No file change. If lint or typecheck complains about `playwright.config.ts` being unmatched, add it to `include` in the root `tsconfig.json` (not `tests/tsconfig.json`).

#### 4. Gitignore updates

**File**: `.gitignore`

**Intent**: Ignore Playwright's default output directories so traces and HTML reports never get committed.

**Contract**: Append a `# playwright` block adding:
- `test-results/`
- `playwright-report/`
- `blob-report/`
- `/playwright/.cache/`

#### 5. tests/e2e directory placeholder

**File**: `tests/e2e/.gitkeep` (new)

**Intent**: Create the directory so `testDir` resolves before any spec exists. Phase 2 will replace this with the first real spec.

**Contract**: Empty file.

### Success Criteria:

#### Automated Verification:

- `npm install` runs clean
- `npx playwright install chromium` succeeds
- `npx playwright test --list` exits 0 (no tests is acceptable at this phase)
- `npm run lint` passes
- `npm run build` passes
- `npx tsc --noEmit -p tests/tsconfig.json` passes

#### Manual Verification:

- `npm run test:e2e` starts `astro dev` via webServer and exits cleanly with "0 tests run"
- A second terminal running `npm run dev` does not block a third terminal's `npm run test:e2e` (reuseExistingServer flag)

---

## Phase 2: Auth fixture + happy-path spec

### Overview

Build the Playwright-side auth adapter that lifts cookie values from the existing `setupTwoUsers` helper into a `BrowserContext`, then write the single happy-path spec covering the full session capture flow.

### Changes Required:

#### 1. E2E auth helper

**File**: `tests/e2e/_fixtures/auth.ts` (new)

**Intent**: Re-export `setupTwoUsers` and add `cookieToPlaywright(cookieHeader)` that parses a `sb-<ref>-auth-token=base64-<...>` string and returns a Playwright `Cookie` object with `domain: "localhost"`, `path: "/"`, `httpOnly: false`, `sameSite: "Lax"`, `expires: -1`. Also add `seedAuthCookie(context, cookieHeader)` that calls `context.addCookies([cookieToPlaywright(cookieHeader)])`.

**Contract**:
- `import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";` and re-export.
- Exported function signatures:
  - `cookieToPlaywright(cookieHeader: string): { name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax"; expires: number }`
  - `seedAuthCookie(context: BrowserContext, cookieHeader: string): Promise<void>`
- No new env reads; `setupTwoUsers` already validates `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.

#### 2. Happy-path spec

**File**: `tests/e2e/session-capture.spec.ts` (new)

**Intent**: One `test.describe` block, one `test()` covering the full flow. Seeds User A's cookie, navigates `/dashboard`, clicks "Start session", picks "Medium", clicks "Start", waits for the timer view, clicks "Stop early", clicks rating "4", asserts redirect back to `/dashboard`, asserts the new session card is visible with energy "medium" and rating "★ 4 / 5".

**Contract**:
- `beforeAll`: `fixture = await setupTwoUsers();`
- `afterAll`: `await fixture.cleanup();`
- Inside the test: create a fresh `context` with `browser.newContext()`, call `seedAuthCookie(context, fixture.cookieFor(fixture.userA.id))`, then `page = await context.newPage()` and drive the flow.
- Use semantic locators (`page.getByRole("link", { name: "Start session" })`, `page.getByRole("button", { name: "Medium" })`, `page.getByRole("button", { name: "Start" })`, `page.getByRole("button", { name: "Stop early" })`, `page.getByRole("button", { name: "4" })`). Never CSS selectors that depend on Tailwind classes.
- After rating click, `await page.waitForURL("**/dashboard")`.
- History assertion: locate the first `<li>` inside the History section and verify visible text includes "MEDIUM" (uppercase per dashboard's CSS class but the DOM text is the literal "medium" — the assertion should use `getByText("medium", { exact: false })` or the rating star pattern `★ 4 / 5`).

#### 3. Drop the placeholder

**File**: `tests/e2e/.gitkeep`

**Intent**: Delete now that a real spec exists.

**Contract**: File removed.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e` runs and passes the happy-path spec
- `npm run lint` passes (no unused imports, no `any` casts)
- `npx tsc --noEmit -p tests/tsconfig.json` passes

#### Manual Verification:

- The same spec passes against `npm run dev` running in a separate terminal (reuseExistingServer path)
- A deliberate one-line break in PATCH /api/sessions/[id] (e.g., comment out the `.is("ended_at", null)` guard's effect) fails the spec with a readable error pointing at the rating step or dashboard navigation

---

## Phase 3: SSR redirect specs

### Overview

Add the service-role session-insert helper and three SSR-only assertions: Risk #3 (cross-user access), Risk #5a (ended session), Risk #5b (abandoned session).

### Changes Required:

#### 1. Service-role session insert helper

**File**: `tests/e2e/_fixtures/sessions.ts` (new)

**Intent**: Wrap `@supabase/supabase-js` with the service role and expose `insertSession({ userId, startedAt, endedAt, energyLevel })` returning the inserted row's `id`. Bypasses RLS (intentional — we are setting up SSR fixtures, not testing the API). Mirrors the read-side pattern in [tests/_fixtures/db.ts](tests/_fixtures/db.ts).

**Contract**:
- Exported: `insertSession(args: { userId: string; startedAt: Date | string; endedAt?: Date | string | null; energyLevel?: "low"|"medium"|"high"; focusRating?: number | null }): Promise<{ id: string }>`.
- Defaults: `endedAt = null`, `energyLevel = "medium"`, `focusRating = null`.
- Reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `process.env`; throws if either is missing.
- Single insert into `public.sessions`, `.select("id").single()`, returns `{ id }`.

#### 2. SSR access spec

**File**: `tests/e2e/session-access.spec.ts` (new)

**Intent**: Three `test()` cases under one `describe`. Shared `fixture = setupTwoUsers()` in beforeAll; per-test cookie seeding and per-test inserted rows (cleanup cascades via user deletion in afterAll).

**Contract** — three tests:

1. `"Risk #3: User B navigating to User A's session URL is redirected to /dashboard"`:
   - Insert a running session owned by User A (no `endedAt`, `startedAt` = now).
   - Seed User B's cookie, navigate to `/session/<insertedId>`.
   - Assert `page.url()` ends with `/dashboard` (redirect happened SSR-side, no client navigation).

2. `"Risk #5a: opening an already-ended session redirects to /dashboard"`:
   - Insert a session owned by User A with `endedAt` = now and `focusRating` = 3.
   - Seed User A's cookie, navigate to `/session/<insertedId>`.
   - Assert `page.url()` ends with `/dashboard`.

3. `"Risk #5b: opening an abandoned session (older than 2 × focus preset) redirects to /dashboard"`:
   - Define `const FOCUS_PRESET_SECONDS = 25 * 60` at top of file (mirrors the value pinned in the SSR page).
   - Insert a session owned by User A with `startedAt = new Date(Date.now() - (2 * FOCUS_PRESET_SECONDS + 60) * 1000)`, `endedAt: null`.
   - Seed User A's cookie, navigate to `/session/<insertedId>`.
   - Assert `page.url()` ends with `/dashboard`.

Each test uses a fresh `BrowserContext` (no cookie bleed across tests). Use `page.waitForURL("**/dashboard")` rather than asserting on the immediate `page.goto` return — the redirect is server-side but the URL bar update is the safe signal.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e` passes all four specs (happy path + three SSR tests)
- `npm run lint` passes
- `npx tsc --noEmit -p tests/tsconfig.json` passes
- Total e2e run time under 60s on a typical dev machine (target — investigate if it grows past that)

#### Manual Verification:

- Deliberately break the SSR owner filter (replace `.eq("user_id", user.id)` with `.eq("user_id", user.id).or("user_id.is.null")` or similar widening) — the Risk #3 spec fails
- Deliberately remove the `row.ended_at !== null` redirect in `resolveSessionPageAccess` — the Risk #5a spec fails
- Deliberately raise the threshold in `access.ts` to `10 * focusPresetSeconds` — the Risk #5b spec fails

---

## Phase 4: CI gate + docs update

### Overview

Wire the Playwright job into CI parallel to the existing `ci:` job, then update test-plan.md (Phase 4 status, gate active, cookbook §6.5) and CLAUDE.md commands.

### Changes Required:

#### 1. CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Add an `e2e:` job parallel to the existing `ci:` job. Both must pass on every push and PR to `main`. Cache the Playwright browsers between runs to keep CI under 5 min.

**Contract**: New job `e2e:` with:
- `runs-on: ubuntu-latest`
- Steps: checkout, setup-node (uses `.nvmrc`, `cache: npm`), `npm ci`.
- Playwright browsers cache step using `actions/cache@v4`, key: `${{ runner.os }}-playwright-${{ hashFiles('package-lock.json') }}`, path: `~/.cache/ms-playwright`.
- `npx playwright install --with-deps chromium` (skipped if cache hit — use `if:` on `steps.playwright-cache.outputs.cache-hit != 'true'`; always run `--with-deps` for system libs).
- Write `.dev.vars` step identical to existing `ci:` job (same env block).
- `npm run test:e2e` step with env: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CI: true`.
- On failure, `actions/upload-artifact@v4` with the `playwright-report/` directory.

#### 2. Mark Phase 4 complete in test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Bump §3 Phase 4 status from `change opened` to `complete`. Bump §5 Playwright gate from `required after §3 Phase 4` to `required (active)`. Update the document's `Last updated:` line.

**Contract**: Three targeted edits, no other section changes.

#### 3. Fill in cookbook §6.5

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD -- see §3 Phase 4` placeholder with the realized pattern — location convention, fixture composition, "Stop early" pattern for the happy path, service-role insert pattern for SSR scenarios, run command.

**Contract**: §6.5 reads as a mirror of §6.1/§6.2: Location, Pattern (numbered steps), Reference test, Run locally. Specifically:
- Location: `tests/e2e/<flow>.spec.ts` — one spec per cross-cutting flow.
- Pattern: import `setupTwoUsers` + `seedAuthCookie` from `tests/e2e/_fixtures/auth.ts`; for SSR scenarios, import `insertSession` from `tests/e2e/_fixtures/sessions.ts`; new `BrowserContext` per test; use semantic locators only (no Tailwind class selectors).
- Reference tests: `tests/e2e/session-capture.spec.ts` (happy path with "Stop early"), `tests/e2e/session-access.spec.ts` (three SSR redirects).
- Run locally: `npm run test:e2e`; first time also `npx playwright install chromium`.

#### 4. CLAUDE.md command list

**File**: `CLAUDE.md`

**Intent**: Add `npm run test:e2e` to the Commands section with a one-line description and a note about `npx playwright install chromium` for first-time setup.

**Contract**: Add two lines to the `## Commands` bullet list, immediately after `npm run db:test`.

### Success Criteria:

#### Automated Verification:

- CI workflow validates locally: `gh workflow view ci.yml` (or `act -l`) parses without error
- First push to a feature branch shows the `e2e:` job running in PR checks
- Playwright HTML report uploads on a deliberate failure (verify with one failing spec, then revert)
- `npm run lint` and `npm run build` still pass

#### Manual Verification:

- Open a PR; both `ci:` and `e2e:` checks are required and both pass on a clean branch
- After this change merges to `main`, branch-protection rules in the repo's Settings are updated to require the `e2e` check (operator step, one-time)
- test-plan.md and CLAUDE.md changes render correctly in GitHub

---

## Testing Strategy

### Unit / integration tests:

- No new unit tests required. All four e2e specs cover end-to-end behavior; the underlying components and APIs already have unit/integration coverage from Phases 1-3.

### E2E tests (this plan):

- Four specs across two files; cumulative wall-clock ~30-45s locally, target <90s in CI cold.

### Manual testing steps:

1. Run `npm run test:e2e` locally — all four specs green.
2. Stop Supabase locally (or unset env vars) and run again — should fail with a clear "SUPABASE_URL must be set" error from the fixture, not a Playwright timeout.
3. Open a PR; confirm both CI jobs are required and both pass.
4. Break each guard once (column-scope, owner filter, ended redirect, abandoned threshold) and confirm the right spec fails with a readable error.

## Performance Considerations

- Per-spec `setupTwoUsers` creates two Supabase users serially → ~1-2s overhead per spec; four specs ≈ 4-8s of fixture cost. Acceptable for now; revisit if e2e count crosses ~10 specs.
- Playwright browser cache in CI keeps the cold-start under 30s after the first run.

## Migration Notes

- No data migration. The e2e suite uses ephemeral users that delete themselves in `afterAll`.
- One-time operator step: after this plan merges, enable the `e2e` check as a required status check in the repo's branch-protection rules for `main`.

## References

- Change file: [context/changes/testing-e2e-session-capture-flow/change.md](context/changes/testing-e2e-session-capture-flow/change.md)
- Test plan: [context/foundation/test-plan.md](context/foundation/test-plan.md) — Phase 4 row in §3; e2e gate in §5; §6.5 cookbook placeholder.
- Existing auth fixture: [tests/_fixtures/auth.ts](tests/_fixtures/auth.ts)
- Existing db read fixture: [tests/_fixtures/db.ts](tests/_fixtures/db.ts)
- SSR access logic: [src/pages/session/[id].astro](src/pages/session/%5Bid%5D.astro), [src/lib/session/access.ts](src/lib/session/access.ts)
- Session runner (Stop early): [src/components/session/SessionRunner.tsx:55-58](src/components/session/SessionRunner.tsx#L55-L58)
- API endpoints: [src/pages/api/sessions/index.ts](src/pages/api/sessions/index.ts), [src/pages/api/sessions/[id].ts](src/pages/api/sessions/%5Bid%5D.ts)
- CI workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml)
- Lessons: L-01 (column-scope), L-02 (audio prime), L-03 (timer reconcile) in [context/foundation/lessons.md](context/foundation/lessons.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test harness scaffolding

#### Automated

- [x] 1.1 `npm install` runs clean — 15ad259
- [x] 1.2 `npx playwright install chromium` succeeds — 15ad259
- [x] 1.3 `npx playwright test --list` exits 0 — 15ad259
- [x] 1.4 `npm run lint` passes — 15ad259
- [x] 1.5 `npm run build` passes — 15ad259
- [x] 1.6 `npx tsc --noEmit -p tests/tsconfig.json` passes — 15ad259

#### Manual

- [x] 1.7 `npm run test:e2e` starts astro dev via webServer and exits cleanly with "0 tests run" — 15ad259
- [x] 1.8 `npm run dev` in a separate terminal does not block a third-terminal `npm run test:e2e` — 15ad259

### Phase 2: Auth fixture + happy-path spec

#### Automated

- [x] 2.1 `npm run test:e2e` passes the happy-path spec — 026ec4a
- [x] 2.2 `npm run lint` passes — 026ec4a
- [x] 2.3 `npx tsc --noEmit -p tests/tsconfig.json` passes — 026ec4a

#### Manual

- [x] 2.4 Spec passes against `npm run dev` in a separate terminal (reuseExistingServer path) — 026ec4a
- [x] 2.5 Breaking PATCH /api/sessions/[id] fails the spec with a readable error — 026ec4a

### Phase 3: SSR redirect specs

#### Automated

- [x] 3.1 `npm run test:e2e` passes all four specs — 94d14c3
- [x] 3.2 `npm run lint` passes — 94d14c3
- [x] 3.3 `npx tsc --noEmit -p tests/tsconfig.json` passes — 94d14c3
- [x] 3.4 Total e2e run under 60s locally — 94d14c3

#### Manual

- [x] 3.5 Widening the SSR owner filter fails the Risk #3 spec — 94d14c3
- [x] 3.6 Removing the ended-session redirect fails the Risk #5a spec — 94d14c3
- [x] 3.7 Raising the abandoned threshold fails the Risk #5b spec — 94d14c3

### Phase 4: CI gate + docs update

#### Automated

- [x] 4.1 CI workflow parses without error
- [x] 4.2 e2e job appears in PR checks on first feature-branch push
- [x] 4.3 Playwright HTML report uploads on a deliberate failure
- [x] 4.4 `npm run lint` and `npm run build` pass

#### Manual

- [ ] 4.5 Both ci and e2e jobs are required and pass on a clean PR
- [ ] 4.6 Branch-protection rule updated to require e2e check (one-time operator step)
- [ ] 4.7 test-plan.md and CLAUDE.md changes render correctly
