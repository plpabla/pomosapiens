# Test Plan Refresh 2026-06-28 Implementation Plan

## Overview

Lock the picker-fetch silent-failure protection as a regression gate, close
the categorization-wedge e2e gap, and refresh `context/foundation/test-plan.md`
to reflect the new gates. Scope is the three bounded edits called out in
`context/changes/test-plan-refresh-2026-06-28/change.md`, plus the small
amount of test infrastructure required to make those edits truthful.

## Current State Analysis

- **F2 fix already shipped.** Despite the change.md and research.md treating
  F2 as still-open and queuing a "backport," the picker fix landed on
  `test-sessions-ext` in commit `24c718b` ("chore: archive", 2026-06-28
  11:48 — six minutes before the research's anchor commit `af981f7`).
  `src/components/session/EnergyPicker.tsx:39, 50-52, 128` already has the
  `loadError` state, the `.catch()` handler, and the `<ServerError>` UI
  fallback. The research's "F2 is still live in source" claim was wrong;
  git history confirms the fix is on HEAD. **No source change is needed
  for Phase 1** — only the regression test that pins this behavior.
- **No jsdom component-mount precedent.** `tests/unit/_setup.ts` has
  visibility + audio helpers but no fetch-stub helper. Existing jsdom
  tests (`tests/unit/timer/useFocusTimer.test.ts`,
  `tests/unit/session/resolveSessionPageAccess.test.ts`) are
  hook/utility-level. `EnergyPicker.test.tsx` would be the first `.tsx`
  test file in the repo.
- **`vitest.config.ts:30` include glob is `*.test.ts`** — it does NOT
  match `.test.tsx`. Phase 1 must widen the glob (or use `.test.ts`).
  The widening is one-line and unblocks all future component tests.
- **`@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`,
  `@testing-library/jest-dom@6.9.1`, `jsdom@25.0.1`** are installed.
  `@testing-library/jest-dom/vitest` is already imported in
  `tests/unit/_setup.ts:1`. No new deps needed.
- **E2E spec has zero categorization coverage.** `tests/e2e/session-capture.spec.ts:23-69`
  walks dashboard → energy pick → start → stop early → rate, but never
  clicks the Topic or Material format select. Dashboard assertion is
  `getByText("medium")` + `getByText("★ 4 / 5")`; no chip-line assertion.
- **E2E fixtures lack `insertTopic`.** `tests/e2e/_fixtures/sessions.ts`
  has `insertSession` via service-role client; no sibling for topics or
  material_formats. Format-picking needs zero fixture work (five
  NULL-owner system rows seeded in migration `20260531182506` — `Video`,
  `Reading`, `Writing code`, `Drilling problems`, `Other` — visible to
  every user via RLS). Topics ship empty by design, so the new helper
  is required.
- **§6.3 cookbook is already pattern-compliant.** The four new
  integration test files (`tests/integration/api/topics.{create,update}.test.ts`,
  `tests/integration/api/material-formats.{create,update}.test.ts`)
  follow L-01 column-scope discipline per the S-02 impl-review. Safe to
  cite as additional reference patterns. The `material-formats.update.test.ts`
  seeded-format-protection test (NULL-owner row PATCH 409) is a distinct
  invariant beyond cross-user, worth a body callout.
- **`test-plan.md:9` "Last updated"** still reads `2026-06-26 (Phase 4
  complete)`. §8 freshness ledger lists `2026-06-24` for Strategy and
  Stack reviews. Both need bumping as part of the refresh.

## Desired End State

After this plan lands:

1. `tests/unit/session/EnergyPicker.test.tsx` exists; runs in the jsdom
   project; passes today (because F2 is fixed); would have failed against
   any pre-`24c718b` revision. The component-mount + fetch-stub pattern
   is documented in `_setup.ts` (or co-located in the test) for future
   reuse by S-03 and S-04.
2. `tests/e2e/_fixtures/topics.ts` exists with `insertTopic({ userId, name })`.
   `tests/e2e/session-capture.spec.ts` seeds one topic in `beforeAll`,
   picks topic + format ("Writing code") in the test body, and asserts
   both names appear on `/dashboard` before the existing rating
   assertion. The chip-render path at
   `src/pages/dashboard.astro:133-152` now has automated regression
   coverage.
3. `context/foundation/test-plan.md` reflects the new gates:
   - §2 has risk row #7 covering pre-session picker fetch failure, with
     the cast-lie pattern named in "Must challenge."
   - §3 Phase 4 row's "Goal" mentions the categorization wedge.
   - §6.2 cookbook cites the new EnergyPicker test as the canonical
     component-mount + fetch-stub template.
   - §6.3 retitled to "Adding a test for a new RLS-bearing user-owned
     table endpoint," with a body callout for the seeded-default
     sub-pattern citing `material-formats.update.test.ts`. The reference
     list grows to include all four new integration test files.
   - §8 freshness ledger bumped to `2026-06-28`.

Verify by: `npm test -- tests/unit/session/EnergyPicker.test.tsx` green;
`npm run test:e2e -- tests/e2e/session-capture.spec.ts` green; manual
read of `test-plan.md` shows all five doc changes landed and reads
coherently.

### Key Discoveries

- F2 fix in `src/components/session/EnergyPicker.tsx:39, 50-52, 128` was
  shipped via `24c718b`; research's claim that F2 was unfixed is stale.
- `vitest.config.ts:30` glob is literal `.test.ts` — must widen for
  `.test.tsx` to be discovered.
- `@testing-library/jest-dom/vitest` is already imported globally in
  `tests/unit/_setup.ts:1`; new component tests inherit `toBeVisible`,
  `toBeInTheDocument`, etc. without extra setup.
- `public.topics` (DDL at `supabase/migrations/20260531182506_sessions_data_foundation.sql:56-63`):
  required columns are `owner_id` + `name`; `archived_at` is nullable
  and defaults to NULL (column added in
  `20260627140018_add_archived_at_to_topics_and_formats.sql`).
- Five NULL-owner `material_formats` rows are visible to every
  authenticated user via the `material_formats_select_own_or_default`
  RLS policy — pick `Writing code` in the e2e and skip per-user
  seeding entirely.

## What We're NOT Doing

- **No F2 source change.** The fix is already in source via `24c718b`;
  Phase 1 is the regression gate, not the fix.
- **No e2e for `/topics` or `/formats` CRUD pages.** Integration + pgTAP
  already cover those layers (change.md explicit non-goal).
- **No e2e for archived-topic-still-on-history.** Single conditional
  render; integration on the dashboard SSR query is cheaper (change.md
  explicit non-goal).
- **No rewrites of §1 (Strategy) or §5 (Quality Gates).** Out of scope.
- **No status changes to §3 phases 1-4.** They remain `complete`.
- **No `material_formats` fixture helper.** System-seeded rows make
  per-user seeding unnecessary for the e2e.
- **No new §6.7 for system-seeded rows.** Sub-pattern stays in §6.3's
  body per the title-wording decision.

## Implementation Approach

Three phases, ordered so that each later phase can cite the artifacts
the earlier one produced:

1. **Phase 1 (jsdom):** Establish the component-mount + fetch-stub
   pattern. Outcome is one passing test file plus a one-line config
   widening. Smallest possible footprint that creates a reusable
   capability.
2. **Phase 2 (e2e):** Add `insertTopic` helper, extend
   `session-capture.spec.ts`. Reuses the existing `setupTwoUsers`
   fixture and auth path; no new spec file.
3. **Phase 3 (docs):** Apply five edits to `test-plan.md` referencing
   the now-existing test files. Pure prose; no code touched.

Phase 3 must be last because §6.2 and §6.3 reference the test files
created in Phases 1-2.

## Phase 1: jsdom EnergyPicker regression test

### Overview

Add the first `.tsx` component-mount test in the repo. Pin F2's
shipped behavior so any future regression that removes `.catch()`,
`loadError`, or the `<ServerError>` render fails CI. Make the
test-file extension widening so subsequent component tests
(EnergyPicker variants for S-03/S-04, plus future pickers) are
discovered without further config edits.

### Changes Required

#### 1. Widen jsdom include glob

**File**: `vitest.config.ts`

**Intent**: Allow `.test.tsx` files under `tests/unit/**` to be
discovered by the jsdom project. Without this, the new
`EnergyPicker.test.tsx` is silently skipped.

**Contract**: The jsdom project's `test.include` array changes from
`["tests/unit/**/*.test.ts"]` to `["tests/unit/**/*.test.{ts,tsx}"]`.
Workers project unchanged.

#### 2. New regression test file

**File**: `tests/unit/session/EnergyPicker.test.tsx`

**Intent**: Mount `<EnergyPicker />` with `fetch` stubbed to fail the
picker-init call; assert the load-error UI is visible and the form is
still rendered (degraded but usable). The test exists to lock in the
behavior shipped in `24c718b` — if a future refactor drops the
`.catch()`, this test fails before the regression reaches users.
Provide two cases: a network rejection and a 500 response with the
real `{ error: string }` envelope. Both must surface the load-error
notice with text matching `/Could not load topics and formats/i`. The
energy buttons and Start button must still render (degraded-but-
usable acceptance criterion from the F2 disposition).

**Contract**: Default export of `EnergyPicker` from
`@/components/session/EnergyPicker` rendered via
`@testing-library/react`'s `render`. `fetch` stubbed via
`vi.stubGlobal("fetch", vi.fn().mockRejectedValue(...))` for the
rejection case and `vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }))`
for the 500/401 case. Each case in its own `it()` block with a fresh
`beforeEach` stub install + `afterEach` `vi.unstubAllGlobals()`. Test
assertions use `findByText(/Could not load topics and formats/i)`
(awaits the `setLoadError` state flush) and
`getByRole("button", { name: "Medium" })` (proves degraded mode).

**Why component-mount + fetch-stub here, not integration:** the bug
class is "fetch path swallows an error before it reaches UI" — that
is purely a client-side render concern. An integration test against
the API would not exercise the `useEffect` `.catch()` or the
`<ServerError>` render block; it would only re-prove the API returns
401/500. Cost x signal #1 from §1 of the test plan.

### Success Criteria

#### Automated Verification

- `npm test -- tests/unit/session/EnergyPicker.test.tsx` exits 0 with
  both rejection and 401 cases passing
- `npm test` full suite still exits 0 (no regression on existing
  jsdom or workers tests)
- `npm run lint` passes (the new `.tsx` file is covered by the
  existing eslint config that already lints `src/**/*.tsx`)
- Glob widening proves out: a deliberate `.test.tsx` rename of any
  existing test (or this new file) shows up in `vitest --reporter=verbose`
  output

#### Manual Verification

- Confirm the test would fail against pre-`24c718b` source: temporarily
  revert `EnergyPicker.tsx` to the pre-fix state (`git show 24c718b^:src/components/session/EnergyPicker.tsx > /tmp/pre-fix.tsx`,
  swap, rerun, restore). The test must fail with a clear error before
  the swap is restored. Discard the temporary swap.

**Implementation Note**: After Phase 1's automated verification passes,
pause for manual confirmation of the deliberate-revert check before
starting Phase 2. The check is the only proof that the test actually
gates against regression rather than passing by coincidence.

---

## Phase 2: E2E categorization-wedge extension

### Overview

Close the chip-render path coverage gap. The user-visible promise of
S-02 — pick a topic + format, see them on the dashboard history card
— currently has zero automated coverage. S-03 and S-04 will both
re-touch `EnergyPicker.tsx` and `dashboard.astro`; this gate protects
them too.

### Changes Required

#### 1. New `insertTopic` e2e fixture helper

**File**: `tests/e2e/_fixtures/topics.ts`

**Intent**: Mirror the `insertSession` pattern from
`tests/e2e/_fixtures/sessions.ts`. Provide one async function that
inserts a single topic row via the service-role client (bypassing
RLS, since this is fixture setup — not API testing), returning the
inserted `id`. The helper takes `userId` and `name`; `archived_at`
defaults to NULL via the table default. Surface clear error messages
on insert failure so test setup failures are diagnosable.

**Contract**: `export async function insertTopic(args: { userId: string; name: string }): Promise<{ id: string }>`.
Internally calls the same `buildServiceRoleClient()` helper pattern
as `sessions.ts` (extract into `_fixtures/client.ts` only if duplication
becomes painful — for now, copy the 9-line buildServiceRoleClient
function; one duplicated helper is cheaper than a premature
abstraction). Throws `new Error(\`insertTopic: ${error.message}\`)`
on Supabase error.

#### 2. Extend `session-capture.spec.ts` to cover the categorization wedge

**File**: `tests/e2e/session-capture.spec.ts`

**Intent**: Add four new actions to the existing happy-path test
(no new spec): in `beforeAll`, seed a uniquely-named topic for User
A so parallel/repeated runs don't collide on the `(owner_id, name)`
unique constraint; in the test body, after the Medium energy
click and before "Start," open the Topic combobox and pick the
seeded topic, then open the Material format combobox and pick the
seeded `Writing code` row; after the dashboard reload, assert both
the topic name and `Writing code` appear before the existing
`★ 4 / 5` assertion. Add a brief comment that `material_formats`
seeded rows are deliberate and `topics` ship empty by design
(prevents a future contributor from seeding default topics by
mistake — flagged in research's Architecture Insights).

**Contract**: New imports — `insertTopic` from `./_fixtures/topics`.
Topic name format: `e2e-topic-${Date.now()}` to keep parallel runs
isolated. Locators per research's recommendation:
`page.getByRole("combobox", { name: "Topic" })`,
`page.getByRole("option", { name: <topicName> })`, same for
"Material format" / "Writing code". Dashboard assertions:
`await expect(page.getByText(topicName)).toBeVisible();`
`await expect(page.getByText("Writing code")).toBeVisible();`
placed before the existing `★ 4 / 5` line. No cleanup needed for
the topic row — `cleanup()` cascades user deletion which cascades
the topic via FK.

### Success Criteria

#### Automated Verification

- `npm run test:e2e -- tests/e2e/session-capture.spec.ts` exits 0
- `npm run test:e2e` full suite still exits 0 (no regression in
  `session-access.spec.ts` or other specs)
- `npm run lint` passes (new `.ts` files covered by existing config)
- TypeScript build clean: `npm run build` exits 0 (catches any type
  drift in the fixture helper)

#### Manual Verification

- Read the extended spec end-to-end: locator names match real
  `aria-label` values on the rendered Select triggers (`Topic` /
  `Material format` per `EnergyPicker.tsx:136, 155`)
- Confirm the chip line on `/dashboard` actually shows both names
  during a manual run (open browser headed mode if needed:
  `npx playwright test tests/e2e/session-capture.spec.ts --headed`)
- Verify deliberate-removal check: temporarily comment out the
  chip render block at `dashboard.astro:133-152` and confirm the
  extended e2e fails with a clear "expected `Writing code` to be
  visible" message before restoring.

**Implementation Note**: Pause for manual confirmation of the
deliberate-removal check before Phase 3.

---

## Phase 3: `test-plan.md` refresh

### Overview

Document the now-shipped gates. Five surgical edits to
`context/foundation/test-plan.md`. Pure prose work; no code touched.

### Changes Required

#### 1. Add risk row #7 to §2 Risk Map

**File**: `context/foundation/test-plan.md`

**Intent**: Append one new row to the §2 risk table covering the
pre-session picker fetch silent-failure scenario. Add the matching
row to the §2 Risk Response Guidance table immediately below. The
"Must challenge" cell must call out the cast-lie pattern explicitly
(per the answered planning question) so future fetch sites in S-03
and S-04 inherit the warning. Cite Phase 4 (e2e) impl-review F2 and
the EnergyPicker's pre-session critical-path role as the evidence
column.

**Contract**: New row in the §2 Risk Map table:
`| 7 | Pre-session picker init fetch silently fails -- student lands on degraded /session/new with no warning, may skip a category they intended to log | Medium | Medium | Impl-review F2 (archive 2026-06-27-categorize-sessions-topic-format); EnergyPicker is on the S-01 3-tap pre-session critical path; S-03 + S-04 will re-touch the same component |`.
New row in the Risk Response Guidance table:
"What would prove protection" = "Picker mount with a failing fetch
shows a visible load-error notice AND the energy buttons remain
clickable (degraded but usable)";
"Must challenge" = "The TypeScript cast on `fetch().then()` looks
safe — `as Promise<{ topics: Topic[] }>` lies when the API returns
the `{ error: string }` envelope on 401/500; the runtime read of
`.topics` throws inside the `.then` and the floating `void` swallows
it. Any future fetch site that copies this cast pattern recreates
the bug.";
"Context `/10x-research` must ground" = "Where the picker is mounted
(currently `src/pages/session/new.astro`); the API error envelope
shape; whether any sister component already has a `loadError`
pattern to mirror";
"Likely cheapest layer" = "Vitest jsdom: `render(<EnergyPicker />)`
with `vi.stubGlobal('fetch', ...)` returning a rejected promise or a
non-ok Response; assert load-error UI";
"Anti-pattern to avoid" = "Promoting to e2e because the failure feels
user-facing — a jsdom component test exercises the exact render
path; e2e adds no signal here."

#### 2. Update §3 Phase 4 row to reflect wider e2e scope

**File**: `context/foundation/test-plan.md`

**Intent**: The Phase 4 "Goal" column currently reads "Lock the
user-visible success criterion as a regression gate before each
future slice." After this refresh, the e2e spec also covers
categorization. Update the Goal cell to name the categorization
wedge explicitly so the rollout table reflects current coverage.
Do not change the Status (it remains `complete`) — Phase 4 was
shipped; the extension lives within the same gate.

**Contract**: Phase 4 Goal cell changes to: "Lock the user-visible
success criterion (start → run → rate → history, including topic +
material-format chips) as a regression gate before each future
slice." No other Phase 4 column changes.

#### 3. Extend §6.2 with the component-mount + fetch-stub reference

**File**: `context/foundation/test-plan.md`

**Intent**: §6.2 currently lists `useFocusTimer.test.ts` as the sole
reference test ("L-03 regression gate template"). Add a second
"Reference test" bullet citing
`tests/unit/session/EnergyPicker.test.tsx` as the canonical pattern
for component-mount + fetch-stub. Add a one-line "Pattern" addendum
noting `vi.stubGlobal("fetch", ...)` and
`@testing-library/react`'s `render` / `findByText` as the standard
toolset (matches what Phase 1 lands).

**Contract**: New bullet under existing "Reference test" line:
"`tests/unit/session/EnergyPicker.test.tsx` -- canonical
component-mount + fetch-stub pattern; covers the picker silent-
failure regression (Risk #7)." Pattern section gets a new
numbered step (between current step 5 and step 6, or as a new
step 7): "For component-mount + fetch-stub tests: `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(...)))` in `beforeEach`; `vi.unstubAllGlobals()` in `afterEach`; render via `@testing-library/react`'s `render`; assert async state changes with `findByText` / `findByRole`."

#### 4. Rename §6.3 + add seeded-default callout + extend reference list

**File**: `context/foundation/test-plan.md`

**Intent**: Apply the title-wording decision: "Adding a test for a
new RLS-bearing user-owned table endpoint." Keep the title tight;
document the seeded-default sub-pattern in the body. Extend the
reference-tests bullet list with the four new integration test
files. Add a body paragraph naming the seeded-row PATCH 409
invariant and pointing at `material-formats.update.test.ts` as the
reference. Update the opening sentence so it no longer reads
"sessions"-specific.

**Contract**: §6.3 heading changes from "Adding a test for a new
session API endpoint" to "Adding a test for a new RLS-bearing
user-owned table endpoint." Opening sentence changes from "Any
endpoint that writes to `public.sessions` (or any RLS-bearing
table with a wide UPDATE policy)..." to "Any endpoint that writes
to a user-owned, RLS-bearing table (e.g. `public.sessions`,
`public.topics`, `public.material_formats`)...". Reference tests
list grows from two bullets to six (existing two + four new):
- POST column-scope: `tests/integration/api/topics.create.test.ts`
- POST column-scope: `tests/integration/api/material-formats.create.test.ts`
- PATCH column-scope: `tests/integration/api/topics.update.test.ts`
- PATCH column-scope: `tests/integration/api/material-formats.update.test.ts`
New paragraph after the "Two-layer guarantee" block:
"**System-seeded default rows.** Some user-owned tables ship rows
with `owner_id IS NULL` that every authenticated user can SELECT but
nobody can mutate (see `material_formats` migration `20260531182506`).
Endpoints serving these tables must enforce a NULL-owner protection:
PATCH or DELETE on a seeded row returns 409 (byte-identical with
the cross-user-conflict shape). Reference test:
`tests/integration/api/material-formats.update.test.ts` --
seeded-format-protection case."

#### 5. Bump freshness metadata

**File**: `context/foundation/test-plan.md`

**Intent**: Update the two freshness anchors: the file-top "Last
updated" line and the §8 ledger entries. Reflect that Strategy was
re-reviewed during this refresh (the §2 row addition counts as a
review; if no strategy text changed beyond the new row, the
sentence should say so).

**Contract**: Top of file (line 9): `> Last updated: 2026-06-26 (Phase 4 complete)`
becomes `> Last updated: 2026-06-28 (Risk #7 added; Phase 4 e2e extended for categorization wedge)`.
§8 ledger: `Strategy (§1-§5) last reviewed: 2026-06-24` becomes
`2026-06-28`; Stack versions line stays at `2026-06-24` (no stack
changes in this refresh — only the test-base capability grew).

### Success Criteria

#### Automated Verification

- `npm run format` exits 0 with `test-plan.md` formatted (prettier
  on `*.md` per lint-staged config)
- `git diff context/foundation/test-plan.md` shows changes in exactly
  five regions: §2 (one new risk row + one new guidance row); §3 row 4
  Goal cell; §6.2 (one new bullet + one new pattern step); §6.3
  (heading + opening + reference list + new paragraph); top of file
  + §8 (freshness)
- Markdown table syntax stays valid: all new rows have the right
  pipe count; no broken alignment

#### Manual Verification

- Re-read `test-plan.md` top-to-bottom: the five changes integrate
  with the surrounding prose (no orphaned references, no contradictions
  with §1 principles)
- The "Must challenge" cell for Risk #7 explicitly names the cast-lie
  pattern (per the planning decision)
- §6.3 reference list cites all four new integration test files with
  correct paths
- The §3 Phase 4 Status column still reads `complete`
- The freshness line at the top and §8 both show `2026-06-28`

**Implementation Note**: After Phase 3 verification, pause for a final
manual confirmation that the refreshed `test-plan.md` reads coherently
before closing the change.

---

## Testing Strategy

### Unit Tests

- `EnergyPicker.test.tsx` — two cases (network rejection, 401 with
  error envelope); each asserts load-error UI visible + form still
  rendered. Counts as both the first `.tsx` component test in the
  repo and the regression gate for Risk #7.

### Integration Tests

- No new integration tests in this plan. The four S-02 integration
  test files (cited in Phase 3's §6.3 update) already exist; this
  plan only references them.

### Manual Testing Steps

1. After Phase 1: run the deliberate-revert check described in Phase 1
   Manual Verification. Test must fail against pre-`24c718b` source.
2. After Phase 2: run the deliberate-removal check described in Phase 2
   Manual Verification. E2E must fail when the chip render block is
   commented out.
3. After Phase 3: re-read the full `test-plan.md` and confirm
   coherence (no orphaned references, table syntax intact, no
   contradictions with §1 principles).

## Performance Considerations

None. New jsdom test runs in <1s. E2E extension adds ~3-5s to one
existing spec; well within current CI budget.

## Migration Notes

None. No schema changes, no breaking API changes, no data backfill.

## References

- Change brief: `context/changes/test-plan-refresh-2026-06-28/change.md`
- Research: `context/changes/test-plan-refresh-2026-06-28/research.md`
- F2 fix commit (already merged): `24c718b` ("chore: archive")
- S-02 archive (anchor for §6.3 reference tests): `context/archive/2026-06-27-categorize-sessions-topic-format/`
- Phase 4 e2e archive: `context/archive/2026-06-26-testing-e2e-session-capture-flow/`
- Current `test-plan.md`: `context/foundation/test-plan.md`
- jsdom config: `vitest.config.ts:23-33`
- jsdom helpers: `tests/unit/_setup.ts`
- E2E happy path: `tests/e2e/session-capture.spec.ts`
- E2E session fixture (pattern source): `tests/e2e/_fixtures/sessions.ts`
- `public.topics` DDL: `supabase/migrations/20260531182506_sessions_data_foundation.sql:56-63`
- `archived_at` migration: `supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql`
- Chip render block: `src/pages/dashboard.astro:133-152`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` -- <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: jsdom EnergyPicker regression test

#### Automated

- [x] 1.1 `npm test -- tests/unit/session/EnergyPicker.test.tsx` exits 0 with both rejection and 401 cases passing
- [x] 1.2 `npm test` full suite still exits 0 (no regression on existing jsdom or workers tests)
- [x] 1.3 `npm run lint` passes
- [x] 1.4 Glob widening proves out: a `.test.tsx` file appears in `vitest --reporter=verbose` output

#### Manual

- [x] 1.5 Deliberate-revert check: test fails against pre-`24c718b` `EnergyPicker.tsx`

### Phase 2: E2E categorization-wedge extension

#### Automated

- [ ] 2.1 `npm run test:e2e -- tests/e2e/session-capture.spec.ts` exits 0
- [ ] 2.2 `npm run test:e2e` full suite still exits 0
- [ ] 2.3 `npm run lint` passes
- [ ] 2.4 `npm run build` exits 0

#### Manual

- [ ] 2.5 Locator names match real `aria-label` values on the rendered Select triggers
- [ ] 2.6 Chip line on `/dashboard` shows both names during a manual headed run
- [ ] 2.7 Deliberate-removal check: e2e fails when `dashboard.astro:133-152` chip block is commented out

### Phase 3: `test-plan.md` refresh

#### Automated

- [ ] 3.1 `npm run format` exits 0 with `test-plan.md` formatted
- [ ] 3.2 `git diff context/foundation/test-plan.md` shows changes in exactly the five intended regions
- [ ] 3.3 Markdown table syntax stays valid

#### Manual

- [ ] 3.4 `test-plan.md` re-read top-to-bottom: five changes integrate coherently
- [ ] 3.5 Risk #7 "Must challenge" cell names the cast-lie pattern
- [ ] 3.6 §6.3 reference list cites all four new integration test files
- [ ] 3.7 §3 Phase 4 Status column still reads `complete`
- [ ] 3.8 Freshness line and §8 both show `2026-06-28`
