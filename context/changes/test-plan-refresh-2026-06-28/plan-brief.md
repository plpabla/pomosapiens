# Test Plan Refresh 2026-06-28 -- Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-06-28/plan.md`
> Research: `context/changes/test-plan-refresh-2026-06-28/research.md`

## What & Why

Refresh `context/foundation/test-plan.md` to reflect post-S-02 reality, and
ship the regression gates the refreshed plan documents. The S-02 categorize-
sessions wedge introduced two latent gaps in the test base: (1) the
EnergyPicker's silent fetch-error path is on the pre-session critical path
but has zero automated coverage, and (2) the chip-render path that proves
S-02's user-visible promise (`/dashboard` shows the picked topic + format)
has no e2e gate. Both gaps will be re-exposed by S-03 (timer presets) and
S-04 (notes + chart), which will re-touch the same files.

## Starting Point

`test-plan.md` was last refreshed 2026-06-26 after Phase 4 (e2e) shipped.
The S-02 slice landed on `test-sessions-ext` on 2026-06-28 (commits up to
the merge at `af981f7`). The F2 picker-fetch fix already landed via commit
`24c718b` -- the research doc claimed F2 was still live in source, but git
history and a direct read of `EnergyPicker.tsx:39, 50-52, 128` show the
`.catch()` + `loadError` UI is on HEAD. So this plan locks in shipped
behavior; it does not have to write the fix itself.

## Desired End State

`tests/unit/session/EnergyPicker.test.tsx` exists and pins the F2-fixed
behavior. `tests/e2e/session-capture.spec.ts` clicks Topic + Material
format and asserts both chips appear on `/dashboard`. `test-plan.md` has a
new Risk #7 in §2 with the cast-lie pattern named in "Must challenge,"
§3 Phase 4 mentions the categorization wedge, §6.2 cites the new component-
mount + fetch-stub reference, §6.3 is generalized to "RLS-bearing user-
owned table endpoint" with a callout for system-seeded rows and four new
reference-test citations, and §8 freshness is bumped to 2026-06-28.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Plan scope | Doc + tests (no F2 fix needed) | Research mis-reported F2 status; git history shows fix is already merged via `24c718b`, so Phase 1 is just the gate. | Plan |
| F2 backport sourcing | Skipped -- already in HEAD | `git log --all -S "loadError"` surfaced the fix in `24c718b` six minutes before the research anchor commit. | Plan |
| Risk #7 "Must challenge" wording | Name the cast-lie pattern explicitly | S-03 + S-04 will add more fetch sites; surfacing the typed-but-untrue pattern pays forward. | Plan |
| §6.3 title | "RLS-bearing user-owned table endpoint" | Keeps title tight; seeded-default sub-pattern lives in the body with its own reference test. | Plan |
| E2E placement | Extend `session-capture.spec.ts`, no new spec | Categorization is the next stage of the same wedge; new spec would re-do auth + navigation for zero isolation benefit. | Research |
| Topic seeding strategy | New `insertTopic` helper; pick seeded `material_formats` row directly | Mirrors `insertSession` pattern at minimal cost; system-seeded format rows eliminate per-user format setup. | Research |
| Test file extension | `EnergyPicker.test.tsx` + widen `vitest.config.ts` glob to `*.test.{ts,tsx}` | One-line config widening unblocks all future component tests; idiomatic over forcing `.ts` extension on JSX-heavy files. | Plan |

## Scope

**In scope:**

- New `tests/unit/session/EnergyPicker.test.tsx` (jsdom regression gate)
- One-line `vitest.config.ts` include-glob widening
- New `tests/e2e/_fixtures/topics.ts` (`insertTopic` helper)
- Extension of `tests/e2e/session-capture.spec.ts` (~15 lines)
- Five surgical edits to `context/foundation/test-plan.md`

**Out of scope:**

- F2 source change (already shipped in `24c718b`)
- E2E for `/topics` or `/formats` CRUD pages (integration + pgTAP cover them)
- E2E for archived-topic-still-on-history (single conditional render)
- Rewrites of §1 (Strategy) or §5 (Quality Gates)
- Status changes to §3 phases 1-4
- New `insertMaterialFormat` helper (use NULL-owner seeded rows directly)
- New §6.7 for system-seeded rows (stays in §6.3 body)

## Architecture / Approach

Three sequential phases, ordered so later phases can cite the artifacts
earlier phases produce. Phase 1 establishes a reusable jsdom pattern
(`vi.stubGlobal("fetch", ...)` + `@testing-library/react` `render`) that
future S-03/S-04 component tests inherit. Phase 2 reuses the existing
`setupTwoUsers` e2e fixture and adds one new helper file. Phase 3 is pure
prose: five edits to `test-plan.md` referencing the now-existing test files.

Pattern reuse is deliberate: `insertTopic` mirrors `insertSession`;
component-test scaffolding parallels existing `_setup.ts` helpers
(`stubAudioGlobal`, `dispatchVisibilityChange`); §6.3 generalization
documents an already-established L-01 convention rather than introducing
a new rule.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. jsdom EnergyPicker test | First `.tsx` component test in repo + glob widening + regression gate for Risk #7 | New pattern -- fetch-stub setup may need iteration; test could pass for the wrong reason (no degraded-mode assertion) |
| 2. E2E categorization extension | `insertTopic` helper + extended `session-capture.spec.ts` covering topic + format → chip line | shadcn Select locators are untested in this repo -- `combobox` role pattern may need adjustment if Radix wraps the trigger differently than expected |
| 3. `test-plan.md` refresh | Five doc edits: §2 row #7, §3 Phase 4 Goal, §6.2 reference, §6.3 generalization, §8 freshness | Prose-only -- main risk is missing a downstream reference (e.g. §5 Quality Gates referencing §6 sections by their old titles) |

**Prerequisites:** Local Supabase running (`npm run db:start`); Playwright
chromium installed (`npx playwright install chromium`);
`SUPABASE_SERVICE_ROLE_KEY` set for e2e and not committed.

**Estimated effort:** ~1 session across 3 phases (Phase 1: ~30 min,
Phase 2: ~45 min, Phase 3: ~30 min). Each phase has a deliberate-
revert/removal manual check that gates progression to the next.

## Open Risks & Assumptions

- **Assumption:** shadcn `Select` exposes `role="combobox"` on the trigger
  per Radix defaults. If the actual rendered role differs, Phase 2's
  locators need adjustment (`getByLabel("Topic")` as fallback).
- **Risk:** The jsdom test pins the *current* error message
  ("Could not load topics and formats.") -- a future copy-edit to that
  string would fail the test without there being a real regression.
  Mitigation: assert on a regex (`/Could not load topics and formats/i`),
  not exact text; tolerates minor copy edits.
- **Assumption:** The five `material_formats` seeded rows remain stable
  (Video / Reading / `Writing code` / Drilling problems / Other). If a
  future migration renames `Writing code`, Phase 2's e2e needs updating.
  The deliberate-removal check in Phase 2 catches this.
- **Risk:** Research's mis-reporting of F2 status suggests other research
  claims may be similarly stale. The plan addresses this by re-verifying
  every claim it cites (current EnergyPicker source, current
  session-capture spec, current `test-plan.md`) before locking phases.

## Success Criteria (Summary)

- A user trying to start a session on a degraded `/session/new` sees a
  visible load-error notice and can still pick energy + Start (uncategorized);
  any regression of this behavior fails CI before it ships.
- A user who picks a topic + material format and finishes a session sees
  both names as chips on their `/dashboard` history card; any regression
  in the picker → POST → SSR-embed → render path fails CI before it ships.
- `test-plan.md` accurately reflects current gates: every risk row maps
  to a shipped test or an explicit non-goal, with no stale "Phase 4
  complete" framing.
