# Refactor React Components — Plan Brief

> Full plan: `context/changes/refactor-react-components/plan.md`
> Research: `context/changes/refactor-react-components/research.md`

## What & Why

Pure refactor of the React islands and the one Astro page with bulky logic (`dashboard.astro`). The session
tile grew inline across slices and never became a component; several islands copy-paste the same fetch helper,
domain types, catalog selects, confirm button, and CRUD manager. We extract these into reusable pieces so the
dashboard page carries only a query + a React island, and future cosmetic tweaks (🍅 badges, bigger counter)
become one-file changes.

## Starting Point

`dashboard.astro` has ~88 lines of frontmatter (RLS query + 5 helpers) and ~80 lines of inline tile markup
mounting three separate islands per row. Every other page is already the target shape. The two topic/format
managers are ~90% identical (and untested at the unit level); Abandon/Delete buttons are the same state machine;
catalog selects and domain types are duplicated across EnergyPicker + EditSessionDialog. A dense unit +
integration + e2e suite covers most of the refactored surface.

## Desired End State

`dashboard.astro` frontmatter is just the guard + `sessions` select + `ratedSessions`; the body renders a
`SessionList` island. Shared modules exist for fetch, types, time, tile formatting, catalog selects, the confirm
button, and CRUD; all copies are deleted. `EnergyPicker` and `PresetManager` are decomposed into
sub-components/hooks with byte-identical behavior. Every existing test passes; the two untested managers gain
characterization tests.

## Key Decisions Made

| Decision                          | Choice                                                              | Why                                                                 | Source   |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | -------- |
| Scope (A + F1–F4 in one change)   | All bundled here                                                    | change.md scope section already committed to it                     | Change   |
| Sequencing                        | F3→F4→catalog→F2→F1→A→EnergyPicker→PresetManager                    | Build primitives before their consumers                             | Change/Plan |
| Delivery                          | One branch, phased, checkpoint per phase, one PR                   | Each phase is a safe rollback point; catches F1 breaks early        | Plan     |
| Tile split granularity            | SessionList + SessionTile + shared SessionTags + read-only RatingBadge | Matches research; avoids over-splitting the header                  | Research/Plan |
| F1 manager safety                 | Characterization unit tests BEFORE the merge                       | Managers are untested; optimistic-rollback logic is the real risk   | Plan     |
| Verify bar per phase              | lint + build + vitest + affected e2e                               | Exercises real hydration/behavior, not just types                   | Plan     |
| EnergyPicker/PresetManager        | **Full internal restructure** (incl. audio-prime + mode store)     | Reaffirmed in-scope by the owner; decomposition is behavior-preserving | Plan     |
| Rating pickers                    | Do NOT unify interactive ones; extract read-only RatingBadge only  | They differ in size/animation/submit semantics                      | Research |

## Scope

**In scope:** dashboard tile extraction (A); `fetchJson` (F3); shared types + time (F4); `useCatalog` +
`CatalogSelects`; `ConfirmActionButton` (F2); `useCrudResource` + row/dialog components (F1); full restructure of
EnergyPicker and PresetManager.

**Out of scope:** any schema/API/RLS/behavior change; moving the SSR `sessions` query out of frontmatter;
changing `LocalDateTime` hydration; unifying interactive rating pickers; touching already-clean islands
(SessionRunner, FocusRatingChart, ModePicker, auth/*).

## Architecture / Approach

Bottom-up: shared `fetchJson` → shared `types`/`time` → shared `useCatalog`/`CatalogSelects` →
`ConfirmActionButton` → `useCrudResource` managers → dashboard `SessionList`/`SessionTile` tree → EnergyPicker
→ PresetManager. Presentation moves into React; the RLS-scoped query stays server-side and is passed to the
island as a prop (SSR first paint + privacy preserved). Consolidating the tile's three islands into one
`SessionList` boundary is a net reduction in hydration entry points.

## Phases at a Glance

| Phase                          | What it delivers                                  | Key risk                                          |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------- |
| 1. F3 fetchJson                | One fetch helper, ~7 copies deleted               | Preserving each site's error-fallback semantics   |
| 2. F4 types + time             | `types.ts` + `time.ts`, redeclarations removed    | Exact rounding parity                             |
| 3. Catalog primitives          | `useCatalog` + `CatalogSelects`                    | EnergyPicker's 3rd (presets) fetch must survive   |
| 4. F2 ConfirmActionButton      | Merged confirm button                             | `onPhaseChange` firing on all phases              |
| 5. F1 useCrudResource          | Managers collapsed ~555→~300 lines                | Optimistic-rollback parity (untested → char tests)|
| 6. A dashboard tile            | SessionList/Tile/Tags/RatingBadge, slim page      | DOM/class parity + SSR first paint                |
| 7. EnergyPicker restructure    | useSessionStart + useLastMode + EnergyLevelPicker | L-02 audio prime + SSR-safe mode store            |
| 8. PresetManager restructure   | PresetRow + editor hook                            | Validation-bound + disabled-state parity          |

**Prerequisites:** local Supabase running + env vars for e2e; `npx playwright install chromium` once.
**Estimated effort:** ~3–4 sessions across 8 checkpointed phases (F1 and Phase 7 are the heaviest).

## Open Risks & Assumptions

- F1 and EnergyPicker's audio/mode paths are the highest-risk; both are gated by characterization tests written
  first, but audio autoplay (L-02) is browser-sensitive and only partly unit-testable.
- Parity is judged by the existing test suite + manual verification; any DOM/class drift in the tile would be a
  regression the specs might not fully catch — manual visual check per phase is required.
- Phases 7–8 (EnergyPicker/PresetManager full restructure) are confirmed in-scope. They are the heaviest and
  touch the delicate L-02 audio prime and the SSR-safe mode store, so the plan constrains them to
  behavior-preserving decomposition with characterization tests written first.

## Success Criteria (Summary)

- Dashboard, start-session, managers, and presets pages behave and render identically to today.
- `lint + build + vitest + affected e2e` green after every phase; full suite green before the PR.
- No schema/API change; duplicated code (managers, confirm buttons, catalog selects, fetch, types) is gone.
