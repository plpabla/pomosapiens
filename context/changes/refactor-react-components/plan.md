# Refactor React Components Implementation Plan

## Overview

Pure refactor of the PomoSapiens React islands and the one Astro page carrying bulky logic
([dashboard.astro](../../../src/pages/dashboard.astro)). No schema, API, or behavior change. Two
workstreams from `research.md`: (A) extract the inline session tile into a composed React tree and slim the
dashboard page to a query + island; (F1–F4) de-duplicate the reusable pieces copy-pasted across islands
(fetch helper, shared types/time math, confirm button, CRUD managers), plus a confirmed in-scope **full internal
restructure** of `EnergyPicker` and `PresetManager`. Success = `lint + build + vitest + affected e2e` green
before and after every phase (visual + behavioral parity).

## Current State Analysis

- **`dashboard.astro`** ([dashboard.astro:1-209](../../../src/pages/dashboard.astro)) holds ~88 lines of
  frontmatter (RLS `sessions` query + 5 helpers: `modeLabel`, `formatDuration`, `getStatus`, `isRated`,
  `energyColorClass`) and ~80 lines of inline tile markup that mounts **three** islands per `<li>`:
  `LocalDateTime` (`client:only`), `AbandonButton` (`client:load`), `CompletedSessionActions` (`client:visible`).
- **Catalog-select duplication**: the topic+format fetch/filter/select block is verbatim in
  [EnergyPicker.tsx:92-115,198-235](../../../src/components/session/EnergyPicker.tsx) and
  [EditSessionDialog.tsx:62-83,182-224](../../../src/components/dashboard/EditSessionDialog.tsx) — same
  `NONE = "__none__"`, same `triggerClass`, same `archived_at === null` filter, redeclared `Topic`/`MaterialFormat`,
  duplicated `ENERGY_LEVELS`/`LEVELS`.
- **Managers**: [TopicManager.tsx](../../../src/components/topics/TopicManager.tsx) (266) and
  [MaterialFormatManager.tsx](../../../src/components/material-formats/MaterialFormatManager.tsx) (288) are ~90%
  identical — same `apiFetch`, same 11-`useState` CRUD block with optimistic update + rollback, same
  Add/Rename dialogs and archived section. Only the format manager splits Built-in (`owner_id === null`) / Yours.
  **Neither has a unit test** (only PresetManager does among managers).
- **Confirm buttons**: [AbandonButton.tsx](../../../src/components/dashboard/AbandonButton.tsx) (79) and
  [DeleteSessionButton.tsx](../../../src/components/dashboard/DeleteSessionButton.tsx) (86) are the same
  `idle→confirming→submitting` machine (DELETE → `window.location.reload()`); differ by labels + optional
  `onPhaseChange` (consumed by [CompletedSessionActions.tsx:37-39](../../../src/components/dashboard/CompletedSessionActions.tsx)).
- **Scattered network + math**: hand-rolled `fetch`+error-unwrap in ~7 islands; seconds↔minutes arithmetic in
  PresetManager (`toMin`), EditSessionDialog, ModePicker.
- **Delicate paths to preserve exactly**: EnergyPicker's two-stage audio-prime (lesson **L-02**) and its
  `useSyncExternalStore` SSR-safe last-mode store; the RLS-scoped SSR `sessions` query must stay in Astro
  frontmatter (arch.md §2, privacy NFR); `LocalDateTime` must stay `client:only` (UTC SSR on Cloudflare).

### Test net (the parity gate)

- **vitest unit** ([tests/unit/](../../../tests/unit/)): AbandonButton, DeleteSessionButton, CompletedSessionActions,
  EditSessionDialog, FocusRatingChart, EnergyPicker, ModePicker, PresetManager, SessionRunner*, timer*, schemas.
  **Gap**: TopicManager / MaterialFormatManager have no unit test.
- **integration** ([tests/integration/api/](../../../tests/integration/api/)): every API route.
- **e2e** ([tests/e2e/](../../../tests/e2e/)): `session-abandon`, `session-delete`, `session-edit`, `session-note`,
  `session-capture`, `session-access`, `focus-rating-chart` — exercises exactly the refactored surface.

## Desired End State

- `dashboard.astro` frontmatter contains only the `createClient` guard + the `sessions` select + the
  `ratedSessions` derivation; the body renders `FocusRatingChart` + one `SessionList` island. No helper
  functions, no inline tile markup.
- One `src/lib/api/fetchJson.ts`, one `src/lib/types.ts`, one `src/lib/time.ts`, one `src/lib/session/format.ts`,
  one `useCatalog` hook + `CatalogSelects`, one `ConfirmActionButton`, one `useCrudResource` — each with the
  copies deleted.
- `EnergyPicker` and `PresetManager` decomposed into sub-components + hooks with behavior byte-identical
  (L-02 + mode store + preset validation preserved).
- Every existing unit/integration/e2e test passes unchanged (except tests whose imports move, which are updated
  mechanically); two new characterization test files cover the previously-untested managers.

### Key Discoveries:

- SSR data must stay in frontmatter; the tile refactor moves *presentation* only
  ([research.md:188-191](research.md), arch.md §2).
- `CompletedSessionActions` depends on `DeleteSessionButton`'s `onPhaseChange` to hide Edit while deleting —
  `ConfirmActionButton` must keep that callback ([CompletedSessionActions.tsx:35-40](../../../src/components/dashboard/CompletedSessionActions.tsx)).
- EnergyPicker loads a **third** resource (user-presets) alongside topics/formats; `useCatalog` must not swallow
  the presets fetch ([EnergyPicker.tsx:92-115](../../../src/components/session/EnergyPicker.tsx)).
- MaterialFormat rows carry `owner_id`; the built-in/seeded split is real domain logic, not duplication —
  it stays in the format wrapper ([MaterialFormatManager.tsx:55-57](../../../src/components/material-formats/MaterialFormatManager.tsx)).
- React Compiler is on — no manual `useMemo`/`useCallback` in any extracted component
  ([research.md:195](research.md)).

## What We're NOT Doing

- No schema / migration / API-route / endpoint changes. No RLS changes.
- Not moving the `sessions` query out of Astro frontmatter (would regress SSR + privacy).
- Not changing `LocalDateTime`'s `client:only` directive.
- Not unifying the **interactive** focus-rating pickers (EditSessionDialog vs FocusRating) — only a read-only
  `RatingBadge` for the tile ([research.md:125-134,227-228](research.md)).
- Not touching already-clean islands: `SessionRunner` + its hooks, `FocusRatingChart`, `ModePicker`,
  `ServerError`, `SubmitButton`, `PasswordToggle`, `FormField` ([research.md:296-304](research.md)).
- Not changing any user-visible copy, styling, class strings, or DOM structure (parity is the hard bar).

## Implementation Approach

Build bottom-up so every consumer has its primitive before it is refactored: shared `fetchJson` → shared
`types`/`time` → shared `useCatalog`/`CatalogSelects` → `ConfirmActionButton` → `useCrudResource` (managers) →
dashboard tile → EnergyPicker → PresetManager. One branch (`refactor-react-components`), one PR, each phase
independently verified and committed as a rollback point with a manual-parity pause. The two phases with no
existing coverage of their risk (F1 managers, EnergyPicker's audio/mode paths) get **characterization tests
written first**, turning them into red→green loops.

## Critical Implementation Details

- **L-02 audio prime (Phase 7)** — the two-stage muted `.play()/.pause()` warm-up and the "store warmed Audio
  in a ref, never construct at fire time" rule must survive the `useSessionStart` extraction verbatim; the
  chime stays fail-open (`.catch(() => {})`). Do not "clean up" this sequence.
- **Mode store (Phase 7)** — the `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` triad exists
  to avoid an SSR/client hydration mismatch (`getServerSnapshot` returns `"preset_1"`). Extracting it into
  `useLastMode` must keep `getServerSnapshot` — a `useState` lazy-init would reintroduce the mismatch.
- **`ConfirmActionButton` phase callback (Phase 4)** — emit `onPhaseChange` on every phase transition (the
  current `DeleteSessionButton` uses a `useEffect` on `phase`); `CompletedSessionActions` relies on it firing
  for `confirming` (not just `submitting`) to hide the Edit button.
- **Optimistic rollback parity (Phase 5)** — `useCrudResource`'s rename/archive/unarchive must snapshot the
  previous list, apply optimistically, and restore the snapshot on error, exactly as the managers do today;
  `handleAdd` is append-on-success (not optimistic). Characterization tests pin this before the refactor.

## Phase 1: F3 — `fetchJson` shared helper

### Overview

Promote one typed fetch-and-unwrap helper and delete the per-island copies.

### Changes Required:

#### 1. New helper

**File**: `src/lib/api/fetchJson.ts`

**Intent**: One helper that does the repeated `fetch → if (!res.ok) unwrap {error} → throw Error(body.error ?? fallback)`
and returns the parsed JSON. Mirrors the managers' existing `apiFetch`.

**Contract**: `fetchJson<T>(url: string, init?: { method?: string; body?: unknown; fallbackError?: string }): Promise<T>`.
Sets `Content-Type: application/json` and `JSON.stringify`s `body` only when `body` is provided. On `!res.ok`,
parses the body with `.catch(() => ({}))` and throws `new Error(body.error ?? fallbackError ?? "Request failed")`.
Returns the parsed JSON typed as `T`.

#### 2. Adopt in islands

**Files**: `TopicManager.tsx`, `MaterialFormatManager.tsx` (replace `apiFetch`), `EnergyPicker.tsx`,
`EditSessionDialog.tsx`, `AbandonButton.tsx`, `DeleteSessionButton.tsx`, `PresetManager.tsx`.

**Intent**: Replace each hand-rolled fetch+unwrap with `fetchJson`. Preserve each call site's exact error
fallback string and success behavior (e.g. `window.location.reload()`, `window.location.assign`).

**Contract**: Each island imports `fetchJson` from `@/lib/api/fetchJson`; the local `apiFetch` definitions are
deleted. GET-then-`.json()` reads that don't throw on `!res.ok` today (the managers' initial load, EnergyPicker's
load) may keep their current shape or adopt `fetchJson` — match existing error semantics, do not newly throw
where the code currently sets a `loadError`.

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Unit tests pass: `npm test`
- [ ] Affected e2e pass: `npm run test:e2e -- session-abandon session-delete session-edit session-capture`

#### Manual Verification:

- [ ] Add/rename/archive a topic and a format; start a session; abandon and delete a session — all succeed and
      error toasts still show the same messages on a forced failure.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: F4 — shared types + time math

### Overview

Centralize the domain types and the seconds↔minutes conversion redeclared across islands.

### Changes Required:

#### 1. Shared types

**File**: `src/lib/types.ts`

**Intent**: Single home for the domain shapes redeclared across EnergyPicker, EditSessionDialog, both managers,
ModePicker, PresetManager.

**Contract**: Export `EnergyLevel` (`"low" | "medium" | "high"`), `Mode`
(`"preset_1" | "preset_2" | "preset_3" | "count_up"`), and interfaces `Topic`, `MaterialFormat`
(includes `owner_id: string | null`), `Preset` (`slot: 1|2|3; focus_seconds; break_seconds`). Field names must
match the current inline declarations exactly so no call site changes shape.

#### 2. Time helpers

**File**: `src/lib/time.ts`

**Intent**: Replace scattered `Math.round(sec/60)` and `min*60` arithmetic.

**Contract**: `minutesFromSeconds(seconds: number): number` (rounds) and `secondsFromMinutes(minutes: number): number`.
Adopt where the arithmetic currently appears (PresetManager `toMin`, EditSessionDialog duration, ModePicker).
Preserve exact rounding behavior (`Math.round`).

#### 3. Adopt across islands

**Files**: EnergyPicker, EditSessionDialog, TopicManager, MaterialFormatManager, ModePicker, PresetManager.

**Intent**: Import the shared types/helpers; delete the local `interface`/`type` redeclarations and inline math.

**Contract**: `@/` imports only. No behavioral change — pure de-duplication.

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Unit tests pass: `npm test`
- [ ] Affected e2e pass: `npm run test:e2e -- session-capture session-edit`

#### Manual Verification:

- [ ] Preset durations still display/save with identical minute values; session-edit duration round-trips.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Catalog primitives — `useCatalog` + `CatalogSelects`

### Overview

Kill the verbatim topic+format load-and-select duplication shared by EnergyPicker and EditSessionDialog.

### Changes Required:

#### 1. Catalog hook

**File**: `src/lib/session/useCatalog.ts`

**Intent**: Owns the topics+formats fetch, the `archived_at === null` filter, and a `loadError`. Reused by
EnergyPicker and EditSessionDialog.

**Contract**: `useTopicsAndFormats(options?: { enabled?: boolean }): { topics: Topic[]; formats: MaterialFormat[]; loadError: string | null }`.
Fetches `/api/topics` + `/api/material-formats` in a `Promise.all` via `fetchJson`, filters archived out, sets
`loadError` to `"Could not load topics and formats."` on failure. `enabled` supports EditSessionDialog's
"load only when the dialog opens" gate (default `true`). EnergyPicker keeps its **separate** user-presets fetch.

#### 2. Catalog select components + constants

**File**: `src/components/session/CatalogSelects.tsx`

**Intent**: Presentational `TopicSelect` / `MaterialFormatSelect` wrapping the shadcn `Select` with the shared
`NONE` sentinel and `triggerClass`, plus the shared `ENERGY_LEVELS` constant.

**Contract**: `TopicSelect({ value, onChange, topics, id?, ariaLabel? })` and the format equivalent — render the
existing markup (placeholder "No topic"/"No format", `NONE` option, `triggerClass`). Export
`ENERGY_LEVELS: { value: EnergyLevel; label: string }[]` and the `NONE`/`triggerClass` constants. DOM output and
class strings must be identical to today's inline selects (parity).

#### 3. Adopt

**Files**: [EditSessionDialog.tsx](../../../src/components/dashboard/EditSessionDialog.tsx),
[EnergyPicker.tsx](../../../src/components/session/EnergyPicker.tsx).

**Intent**: Replace the duplicated fetch blocks with `useTopicsAndFormats` and the duplicated `<Select>` pairs
with `TopicSelect`/`MaterialFormatSelect`; use the shared `ENERGY_LEVELS`. EnergyPicker's presets fetch and
EditSessionDialog's open-gated load semantics are preserved.

**Contract**: No change to props, submitted payloads, or rendered DOM.

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Unit tests pass: `npm test` (EnergyPicker + EditSessionDialog suites unchanged)
- [ ] Affected e2e pass: `npm run test:e2e -- session-capture session-edit`

#### Manual Verification:

- [ ] Topic/format dropdowns in both the start-session screen and the edit dialog show the same options,
      placeholders, and "No topic/format" entries; selecting/clearing round-trips on save.
- [ ] A forced catalog-load failure shows "Could not load topics and formats." in both consumers.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: F2 — `ConfirmActionButton`

### Overview

Merge the two identical 3-phase confirm buttons into one.

### Changes Required:

#### 1. Shared confirm button

**File**: `src/components/dashboard/ConfirmActionButton.tsx`

**Intent**: One `idle→confirming→submitting` button that runs an async `onConfirm`, shows a `ServerError` on
failure, and reports phase transitions.

**Contract**:
`ConfirmActionButton({ label, confirmingLabel?, pendingLabel, onConfirm, onPhaseChange? })` where
`onConfirm: () => Promise<void>` performs the request and (on success) the caller's side effect
(`window.location.reload()`). Preserves the exact markup: idle outline button → destructive "Confirm?" +
ghost "Cancel", `{submitting ? pendingLabel : "Confirm?"}`, right-aligned `ServerError`. Fires `onPhaseChange`
on **every** transition (idle/confirming/submitting).

#### 2. Rewire call sites

**Files**: `AbandonButton.tsx` → thin wrapper (`label="Abandon"`, `pendingLabel="Abandoning..."`,
`onConfirm` = DELETE + reload), or replace its usage directly in the tile;
`DeleteSessionButton.tsx` → thin wrapper (`label="Delete"`, `pendingLabel="Deleting..."`, passes `onPhaseChange`
through). [CompletedSessionActions.tsx](../../../src/components/dashboard/CompletedSessionActions.tsx) keeps
using the delete wrapper's `onPhaseChange`.

**Intent**: Collapse both buttons onto `ConfirmActionButton` with the DELETE-and-reload `onConfirm`, keeping
labels and the `onPhaseChange` contract identical.

**Contract**: Existing AbandonButton / DeleteSessionButton unit tests pass unchanged (keep the wrapper component
names + props, or update imports if the tile calls `ConfirmActionButton` directly — decide to keep wrappers so
tests and the Phase 6 tile stay stable).

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Unit tests pass: `npm test` (AbandonButton, DeleteSessionButton, CompletedSessionActions suites)
- [ ] Affected e2e pass: `npm run test:e2e -- session-abandon session-delete`

#### Manual Verification:

- [ ] Abandon flow (in-progress tile) and delete flow (completed tile) both show idle→Confirm?→pending, reload
      on success, and error message on forced failure; Edit button hides while deleting.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 5.

---

## Phase 5: F1 — CRUD managers (`useCrudResource`)

### Overview

Collapse the ~90% duplication between TopicManager and MaterialFormatManager. Highest-risk phase — write
characterization tests first.

### Changes Required:

#### 1. Characterization tests (FIRST)

**Files**: `tests/unit/topics/TopicManager.test.tsx`, `tests/unit/material-formats/MaterialFormatManager.test.tsx`.

**Intent**: Pin current behavior before refactoring: load error, add (append on success), rename (optimistic +
rollback on failure), archive/unarchive (optimistic + rollback), show/hide archived, and the format manager's
Built-in/Yours split. Mock `fetch`.

**Contract**: Tests assert against accessible roles/text (Add button, Rename dialog, Archive/Unarchive, archived
toggle count) and the optimistic-then-rollback list state on a rejected request. These must pass against the
**current** managers before any extraction.

#### 2. Shared CRUD hook + presentational pieces

**Files**: `src/lib/resource/useCrudResource.ts`, `src/components/resource/CatalogRow.tsx`,
`AddEntityDialog.tsx`, `RenameDialog.tsx`, `ArchivedSection.tsx`.

**Intent**: `useCrudResource` owns load + add + rename + archive + unarchive with the optimistic-update +
rollback pattern; the presentational components render the shared Add dialog, per-row Rename dialog + Archive
button, and the show/hide-archived block.

**Contract**:
`useCrudResource<T extends { id: string; name: string; archived_at: string | null }>({ endpoint, entityNoun })`
returns `{ items, loadError, actionError, add, rename, archive, unarchive, ... }` mirroring the current handlers
(append-on-success add; snapshot+rollback for rename/archive/unarchive; error strings parameterized by
`entityNoun`). `CatalogRow`/`RenameDialog`/`AddEntityDialog`/`ArchivedSection` take the item + callbacks and
render markup byte-identical to today.

#### 3. Thin wrappers

**Files**: `TopicManager.tsx`, `MaterialFormatManager.tsx`.

**Intent**: Reduce each to a thin layout wrapper over the hook + presentational pieces. Topics render one active
list; formats keep the Built-in (`owner_id === null`) / Yours (`owner_id !== null && archived_at === null`) split
locally.

**Contract**: Same exported component names/signatures (`TopicManager`, `MaterialFormatManager`), same rendered
DOM. The characterization tests from step 1 pass unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] Characterization tests pass against current managers, then still pass after refactor: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Affected e2e pass: `npm run test:e2e` (topics/formats covered via manual + any existing specs)

#### Manual Verification:

- [ ] Topics page: add, rename, archive, unarchive, show/hide archived all behave identically; a forced failure
      rolls the optimistic change back and shows the error.
- [ ] Formats page: Built-in list is read-only (no rename/archive), Yours list is editable, archived section
      works; same rollback behavior.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 6.

---

## Phase 6: A — dashboard session tile

### Overview

The headline ask: extract the inline tile into a composed React tree, move helpers to a lib module, slim the
Astro page.

### Changes Required:

#### 1. Format helpers

**File**: `src/lib/session/format.ts`

**Intent**: Home for the frontmatter helpers so the page carries no logic.

**Contract**: Export `modeLabel(mode: Mode | string | null): string | null` (P1/P2/P3/∞), `formatDuration(seconds): string`
(mm:ss, zero-padded), `getStatus(session): "done" | "in_progress"`, `isRated` type guard, and the
`energyColorClass` map. Behavior identical to [dashboard.astro:33-87](../../../src/pages/dashboard.astro).

#### 2. Tile component tree

**Files**: `src/components/session/SessionList.tsx`, `SessionTile.tsx`, `SessionTags.tsx`, `RatingBadge.tsx`.

**Intent**: `SessionList` is the `client:load` island taking `sessions: SessionListItem[]` + `error` prop; owns
empty/error state and maps to `SessionTile`. `SessionTile` composes the two header rows + `SessionTags`
(mode/topic/format badge cluster) + `RatingBadge` (read-only `★ N / 5` | `Skipped`) + the action slot
(`AbandonButton` for in-progress, `CompletedSessionActions` for done). `LocalDateTime` renders nested with its
`client:only` behavior preserved (inside the island it's a normal child component).

**Contract**: The `SessionListItem` type moves to a shared location (or `src/lib/types.ts`) so both the Astro
page and the island import it. Rendered DOM, class strings, badge truncation (`max-w-[10rem] truncate`,
`title=`), and conditional rendering must match [dashboard.astro:123-206](../../../src/pages/dashboard.astro)
exactly.

#### 3. Slim the page

**File**: `src/pages/dashboard.astro`

**Intent**: Frontmatter keeps only the `createClient` guard, the `sessions` select, and the `ratedSessions`
derivation; body renders the header links, `FocusRatingChart`, and `<SessionList sessions={sessions} error={dbError} client:load />`.

**Contract**: The RLS query stays in frontmatter unchanged. `FocusRatingChart` stays `client:only`. No helper
functions remain in the page. First paint remains server-rendered (island receives the serialized array).

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Unit tests pass: `npm test`
- [ ] Affected e2e pass: `npm run test:e2e -- session-abandon session-delete session-edit session-note focus-rating-chart`

#### Manual Verification:

- [ ] Dashboard renders identically: datetime + energy row, duration + rating row, mode/topic/format badges,
      note line, and the correct action (Abandon vs Edit/Delete) per session state.
- [ ] Empty state and DB-error state render as before; first paint is server-rendered (no flash of empty list).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 7.

---

## Phase 7: EnergyPicker full internal restructure

### Overview

Confirmed in-scope full decomposition, including the delicate audio-prime and mode-store paths — behavior
preserved exactly. Characterization tests first.

### Changes Required:

#### 1. Characterization tests (FIRST)

**File**: extend `tests/unit/session/EnergyPicker.test.tsx`.

**Intent**: Pin the behaviors not obviously covered: audio-prime is attempted on submit and is fail-open (does
not block navigation on `.play()` rejection); last-mode is read via the store and persisted on change; the
submitted payload (energy, topic/format ids, `timer_mode`, `planned_focus/break_seconds` from the selected
preset or nulls for count_up) is unchanged.

**Contract**: Mock `Audio`, `localStorage`, and `fetch`; assert payload shape and that a rejected audio prime
still submits. Pass against the current component first.

#### 2. Extract hooks + sub-component

**Files**: `src/lib/session/useSessionStart.ts` (or co-located hook), `src/lib/session/useLastMode.ts`,
`src/components/session/EnergyLevelPicker.tsx`.

**Intent**: `useSessionStart` owns the submit handler including the two-stage audio prime and the POST/navigate;
`useLastMode` owns the `useSyncExternalStore` last-mode store; `EnergyLevelPicker` renders the energy button row.
EnergyPicker becomes a composition of `ModePicker` + `EnergyLevelPicker` + `TopicSelect`/`MaterialFormatSelect`
(from Phase 3) + the submit button.

**Contract**: **L-02 preserved** — construct `new Audio`, muted `.play().then(pause).catch()`, store warmed
audio in a ref, never construct at fire time, chime fail-open. **Mode store preserved** — `useLastMode` keeps
`subscribe`/`getSnapshot`/`getServerSnapshot` (returns `"preset_1"` on server). No change to the POST payload or
navigation target.

### Success Criteria:

#### Automated Verification:

- [ ] Characterization tests pass before and after the refactor: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Affected e2e pass: `npm run test:e2e -- session-capture`

#### Manual Verification:

- [ ] Start-session screen behaves identically: mode persists across reloads, energy selection, topic/format
      selects, Start posts and navigates to `/session/:id`; the chime plays on the session page (audio prime
      intact) and the screen still works with audio blocked.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 8.

---

## Phase 8: PresetManager full internal restructure

### Overview

Decompose the preset editor; use the Phase 2 time helpers. Existing unit test is the safety net; extend it for
the paths it doesn't cover.

### Changes Required:

#### 1. Extend characterization coverage (FIRST)

**File**: extend `tests/unit/presets/PresetManager.test.tsx`.

**Intent**: Pin validation bounds (focus 1–240 min, break 0–60 min), the unchanged-row disabled state, optimistic
success update, and per-row error on failure — before restructuring.

**Contract**: Assert the exact validation error strings and that Save is disabled when a row is unchanged. Pass
against the current component first.

#### 2. Decompose

**Files**: `src/components/presets/PresetRow.tsx` + a `usePresetEditor` hook (co-located or `src/lib/session/`).

**Intent**: `PresetRow` renders one preset's focus/break inputs + Save; the hook owns row state, validation,
save, and the presets fetch/load. Use `minutesFromSeconds`/`secondsFromMinutes` from Phase 2 in place of `toMin`
and the inline `parseInt(...) * 60`.

**Contract**: Same validation bounds and error strings, same `unchanged` disabled logic, same PUT payload
(`focus_seconds`, `break_seconds`) to `/api/user-presets/:slot`, same rendered DOM.

### Success Criteria:

#### Automated Verification:

- [ ] Extended tests pass before and after refactor: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Affected e2e pass: `npm run test:e2e` (presets covered manually + existing specs)

#### Manual Verification:

- [ ] Presets page: editing focus/break, validation errors, disabled-when-unchanged, and save all behave
      identically.

**Implementation Note**: After automated verification passes, pause for final manual confirmation. Then run the
full suite (`npm test` + `npm run test:e2e`) once before opening the PR.

---

## Testing Strategy

### Unit Tests:

- Existing suites are the primary parity net; keep them green at every phase (update only imports that move).
- New characterization files: `TopicManager`, `MaterialFormatManager` (Phase 5); extensions to `EnergyPicker`
  (Phase 7) and `PresetManager` (Phase 8) covering audio-prime fail-open, mode persistence, and preset validation.
- Optionally add small unit tests for `fetchJson`, `time.ts`, and `format.ts` (pure functions, cheap).

### Integration Tests:

- No API change — existing `tests/integration/api/*` must pass unchanged.

### Manual Testing Steps:

1. Dashboard tile: verify each row's datetime/energy/duration/rating/badges/note and the correct action button.
2. Start-session: mode persistence, energy/topic/format, chime on the session page.
3. Managers: add/rename/archive/unarchive with a forced-failure rollback; format Built-in read-only.
4. Presets: validation bounds and save.

## Performance Considerations

Net reduction in hydration entry points on the dashboard (three islands per tile → one `SessionList` island
boundary). No new client-side data fetching. React Compiler handles memoization — do not add `useMemo`/`useCallback`.

## Migration Notes

None — no data or schema changes. Each phase is a self-contained commit and a rollback point on one branch.

## References

- Research: [context/changes/refactor-react-components/research.md](research.md)
- Change identity/scope: [context/changes/refactor-react-components/change.md](change.md)
- Reference composition pattern: [SignInForm.tsx](../../../src/components/auth/SignInForm.tsx),
  [FormField.tsx](../../../src/components/auth/FormField.tsx)
- Lessons: L-02 (audio prime), L-03 (timer) — [context/foundation/lessons.md](../../foundation/lessons.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: F3 — fetchJson shared helper

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 272d385
- [x] 1.2 Build passes: `npm run build` — 272d385
- [x] 1.3 Unit tests pass: `npm test` — 272d385
- [x] 1.4 Affected e2e pass (abandon/delete/edit/capture) — 272d385

#### Manual

- [x] 1.5 CRUD + start/abandon/delete succeed; error messages unchanged on forced failure — 272d385

### Phase 2: F4 — shared types + time math

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 452939c
- [x] 2.2 Build passes: `npm run build` — 452939c
- [x] 2.3 Unit tests pass: `npm test` — 452939c
- [x] 2.4 Affected e2e pass (capture/edit) — session-edit green; session-capture fails identically pre- and post-refactor (confirmed against baseline 272d385), pre-existing env/timing flake unrelated to Phase 2 — 452939c

#### Manual

- [x] 2.5 Preset minutes + edit duration round-trip identically — 452939c

### Phase 3: Catalog primitives — useCatalog + CatalogSelects

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — e2945df
- [x] 3.2 Build passes: `npm run build` — e2945df
- [x] 3.3 Unit tests pass: `npm test` — e2945df
- [x] 3.4 Affected e2e pass (capture/edit) — e2945df

#### Manual

- [x] 3.5 Dropdowns + placeholders identical in both consumers; load-error message identical — e2945df

### Phase 4: F2 — ConfirmActionButton

#### Automated

- [x] 4.1 Lint passes: `npm run lint` — c850a0f
- [x] 4.2 Build passes: `npm run build` — c850a0f
- [x] 4.3 Unit tests pass: `npm test` — c850a0f
- [x] 4.4 Affected e2e pass (abandon/delete) — c850a0f

#### Manual

- [x] 4.5 Abandon + delete phases, reload, error, Edit-hides-while-deleting all identical — c850a0f

### Phase 5: F1 — CRUD managers (useCrudResource)

#### Automated

- [x] 5.1 Characterization tests pass pre- and post-refactor: `npm test` — fc2842f
- [x] 5.2 Lint passes: `npm run lint` — fc2842f
- [x] 5.3 Build passes: `npm run build` — fc2842f
- [x] 5.4 Affected e2e pass — fc2842f

#### Manual

- [x] 5.5 Topics + formats CRUD with rollback identical; format Built-in read-only — fc2842f

### Phase 6: A — dashboard session tile

#### Automated

- [x] 6.1 Lint passes: `npm run lint` — 4deafc2
- [x] 6.2 Build passes: `npm run build` — 4deafc2
- [x] 6.3 Unit tests pass: `npm test` — 4deafc2
- [x] 6.4 Affected e2e pass (abandon/delete/edit/note/chart) — 4deafc2

#### Manual

- [x] 6.5 Tile renders identically; empty + DB-error states; SSR first paint intact — 4deafc2

### Phase 7: EnergyPicker full internal restructure

#### Automated

- [x] 7.1 Characterization tests pass pre- and post-refactor: `npm test` — ec8b86e
- [x] 7.2 Lint passes: `npm run lint` — ec8b86e
- [x] 7.3 Build passes: `npm run build` — ec8b86e
- [x] 7.4 Affected e2e pass (capture) — ec8b86e

#### Manual

- [x] 7.5 Mode persistence, selects, Start/navigate, chime on session page, audio-blocked fallback all identical — ec8b86e

### Phase 8: PresetManager full internal restructure

#### Automated

- [x] 8.1 Extended tests pass pre- and post-refactor: `npm test` — 83c422a
- [x] 8.2 Lint passes: `npm run lint` — 83c422a
- [x] 8.3 Build passes: `npm run build` — 83c422a
- [x] 8.4 Affected e2e pass; full suite green before PR — 83c422a

#### Manual

- [x] 8.5 Preset editing, validation, disabled-when-unchanged, save all identical — 83c422a
