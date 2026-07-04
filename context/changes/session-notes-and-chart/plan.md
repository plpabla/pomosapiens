# Session Notes and Focus-Rating Chart Implementation Plan

## Overview

Add an optional free-text note to session capture (FR-014) and a focus-rating-over-time chart to the dashboard (FR-016), per roadmap slice S-04. Both ship together in this change; FR-014 is the only nice-to-have FR in v1 and can be thinned later if needed, but is included here per the change scope.

## Current State Analysis

- The `sessions.note text NULL` column already exists in the database (migration `20260531182506_sessions_data_foundation.sql:99`), pre-provisioned for this slice, and is already present in `src/db/database.types.ts` (`Row`/`Insert`/`Update`). **No migration is needed to add the column.**
- The gap is entirely application-layer: `endSessionSchema` (`src/lib/schemas/session.ts:24-32`) doesn't accept `note`; `PATCH /api/sessions/[id]` (`src/pages/api/sessions/[id].ts:41-43`) hand-picks `.update({ ended_at, focus_rating })`, excluding it; `SessionRunner.tsx`'s rating screen (`src/components/session/SessionRunner.tsx:165-190`) has no input for it; `dashboard.astro`'s query (`:36-43`) and `SessionListItem` type (`:12-18`) don't select or render it.
- The one-shot `.is("ended_at", null)` write guard (`[id].ts:46`) means a session row is writable exactly once — the note must be submitted in the same PATCH call as the rating, not as a follow-up edit.
- [L-01](../../foundation/lessons.md) (RLS + API column-scope discipline) is directly implicated: widening the PATCH write set requires updating the zod schema and the hand-picked `.update()` object together. The existing regression test for L-01, `tests/integration/api/sessions.end.test.ts:44-73`, currently uses `note` itself as the "must stay null" protected-column probe — this test must be intentionally rewritten now that `note` becomes a legitimately writable column, using a different probe to keep the gate meaningful.
- `supabase/tests/rls_sessions.sql` already references `note` in its cross-user UPDATE-denial assertions (tests 2 and 8) — these keep passing unchanged. The gap is a missing **positive**-path assertion (own-user can update their own note).
- No chart library or chart component exists anywhere in `src/`. No shadcn `textarea` or `chart` component has been added yet (`src/components/ui/` currently has `button`, `card`, `dialog`, `input`, `label`, `select`).
- `src/styles/global.css` has unused shadcn-scaffolded OKLCH `--chart-1..5` tokens (`:40-44,74-78`) that don't match the project's actual "Focus Fuels Greatness" hex palette (`--color-blaze: #e8320a`, etc., defined in the same file's `@theme` block, `:6-18`).
- Every existing hydrated island in this codebase uses `client:load` (`session/[id].astro:57`, `topics/index.astro:8`, etc.) — none uses `client:only`.

## Desired End State

A student who finishes a session sees the existing 1–5 rating / Skip screen with an added optional note textarea; submitting either a rating or Skip saves the note (if any) in the same request. The session's note, if present, shows in its history card. The dashboard History section shows a line chart of focus rating over time, built from ended + rated sessions, using a color drawn from the project's actual hex palette; if fewer than 2 rated sessions exist, a friendly empty-state message shows instead of a chart.

**Verification:** `npm run lint`, `npm test`, `npm run db:test`, and `npm run build` all pass; manual verification in the browser confirms note entry/display and chart rendering (including the empty-state case).

### Key Discoveries:

- `sessions.note` column pre-exists — this plan is schema-free (`supabase/migrations/20260531182506_sessions_data_foundation.sql:99`).
- L-01 regression-gate test must be intentionally rewritten, not just left broken (`tests/integration/api/sessions.end.test.ts:44-73`).
- `supabase/tests/rls_sessions.sql:2` (`plan(9)`) already tests `note` in cross-user denial; needs a new positive-path assertion and a bumped plan count.
- `dashboard.astro`'s existing sessions query (`:36-43`) already selects `focus_rating` and `started_at` — the chart reuses this query's result (filtered + reversed), no second query needed.

## What We're NOT Doing

- No new database migration — the `note` column already exists.
- No reconciliation of the full OKLCH `--chart-1..5` token set with the hex palette — only a single new token for this one chart line.
- No edit-after-the-fact capability for notes or ratings — the one-shot write guard is existing architecture and stays as-is.
- No cross-tab/correlation views (energy × topic × rating, etc.) — FR-016 is explicitly "one chart, not a dashboard."
- No changes to `session/new.astro`, `EnergyPicker.tsx`, or `ModePicker.tsx` — those belong to session creation, not post-session capture.

## Implementation Approach

Ship the note (FR-014) end-to-end first — schema → API → UI → history display — since it's the smaller, self-contained change and directly touches the L-01-flagged test that must be fixed regardless. Then add the chart (FR-016) as an independent, net-new dashboard component. Finish with an `/10x-e2e` handoff to cover both new browser-level risks.

## Critical Implementation Details

**L-01 regression-gate rewrite.** `tests/integration/api/sessions.end.test.ts:44-73` currently sends `note: "x"` alongside `user_id` and `energy_level` as "garbage" keys and asserts all three are stripped/ignored. Once `note` is wired into the schema and the `.update()` call, this specific assertion (`expect(row.note).toBeNull()`) becomes wrong — `note` is now supposed to be written. The fix is to drop `note` from that test's garbage-key list (keeping `user_id` and `energy_level`, which remain genuinely protected) and add a new, separate test asserting `note` **is** written when present in the body. This preserves the L-01 gate's original intent (catching a schema-widened + `.update(parsed.data)` combined regression) without asserting behavior that's now intentionally different.

## Phase 1: Note field — schema, API, and tests

### Overview

Wire `note` into the write path for `PATCH /api/sessions/[id]`, and update the tests that currently assert it must stay null.

### Changes Required:

#### 1. Session schema

**File**: `src/lib/schemas/session.ts`

**Intent**: Accept an optional, nullable free-text note on session end, capped at 500 characters, with empty/whitespace-only input normalized to `null` so the DB doesn't accumulate blank strings.

**Contract**: Add a `note` field to `endSessionSchema`: `z.string().trim().max(500, "note must be at most 500 characters").nullable().optional().transform((v) => (v === "" ? null : v))`. `EndSessionPayload` (inferred type) picks up `note` automatically.

#### 2. PATCH handler

**File**: `src/pages/api/sessions/[id].ts`

**Intent**: Write the validated `note` in the same one-shot update as `ended_at`/`focus_rating`, and update the file's own header comment (currently states "focus_rating is the only other writable column").

**Contract**: Destructure `note` from `parsed.data` alongside the existing fields; add it to the `.update({ ended_at, focus_rating, note })` call (line 43). Update the header comment (lines 1–2) to reflect that `note` is now also writable.

#### 3. Column-scope regression test rewrite

**File**: `tests/integration/api/sessions.end.test.ts`

**Intent**: Keep the L-01 regression gate meaningful now that `note` is a legitimately writable column — see Critical Implementation Details above.

**Contract**: In the existing `it("column-scope: ...")` test (lines 44–73), remove `note: "x"` from the request body and the `expect(row.note).toBeNull()` assertion; keep `user_id`/`energy_level` as the garbage-key probes. Add a new `it(...)` test asserting a PATCH with `note: "some note"` results in `readSession(session.id).note === "some note"`, and another asserting omitting `note` from the body leaves it `null`.

#### 4. Schema unit tests

**File**: `tests/unit/schemas/session.test.ts`

**Intent**: Cover the new `note` validation rules directly at the schema level (max length, trim, empty-to-null).

**Contract**: Add a `describe("endSessionSchema", ...)` block (the file currently only tests `createSessionSchema`) with cases: accepts a valid note, rejects a note over 500 chars, trims surrounding whitespace, converts an empty/whitespace-only string to `null`, accepts `null`/omitted note.

#### 5. RLS positive-path test

**File**: `supabase/tests/rls_sessions.sql`

**Intent**: Add the missing positive-path assertion — a user can update their own session's note — alongside the existing cross-user denial assertions that already reference `note`.

**Contract**: Bump `SELECT plan(9);` (line 2) to `SELECT plan(10);`. Add a new assertion in the "As User A" block (after test 1, before the existing cross-user UPDATE-denial test) following the same `WITH upd AS (UPDATE ... RETURNING id) SELECT is(count(*)::int, 1, '...')` pattern used elsewhere in the file, targeting User A's own session (`aaaaaaaa-...-000000000001`).

### Success Criteria:

#### Automated Verification:

- Type checking / lint passes: `npm run lint`
- Unit tests pass: `npm test -- tests/unit/schemas/session.test.ts`
- Integration tests pass: `npm test -- tests/integration/api/sessions.end.test.ts`
- pgTAP RLS tests pass: `npm run db:test`
- Full test suite passes: `npm test`

#### Manual Verification:

- None required for this phase — behavior is not user-visible until Phase 2 adds the UI.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Note capture UI + history display

### Overview

Let the user type a note on the existing rating screen, and show it (per FR-015) on the dashboard history card.

### Changes Required:

#### 1. shadcn textarea component

**File**: `src/components/ui/textarea.tsx` (new, via CLI)

**Intent**: Install the shadcn "new-york" style `textarea` primitive, matching the existing `input.tsx`/`button.tsx` convention.

**Contract**: Run `npx shadcn@latest add textarea`. No manual edits expected beyond what the CLI generates.

#### 2. Note textarea in SessionRunner

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Add an optional note textarea to the existing "How was your focus?" screen (lines 165–190), submitted in the same PATCH call regardless of which rating (or Skip) is chosen.

**Contract**: Add `const [note, setNote] = useState("")` above the existing state declarations. Render a `Textarea` (labelled, e.g. "Add a note (optional)") between the heading (line 167) and the rating buttons (line 168). Thread `note.trim() === "" ? null : note.trim()` into the existing `handleRate` PATCH body (line 81-84) as the `note` field, sent for both numbered ratings and Skip.

#### 3. SessionRunner note tests

**File**: `tests/unit/session/SessionRunner.note.test.tsx` (new)

**Intent**: Cover the new textarea's presence and its inclusion in the PATCH body, following the existing `SessionRunner.*.test.tsx` mock-`useFocusTimer` pattern.

**Contract**: Mock `useFocusTimer` to return `phase: "rating"`-equivalent state (`stoppedAtMs` non-null) as the other `SessionRunner.*.test.tsx` files do; mock `fetch`; assert the textarea renders, typing into it and clicking a rating button sends `note` in the PATCH body, and an empty textarea sends `note: null`.

#### 4. Dashboard note display

**File**: `src/pages/dashboard.astro`

**Intent**: Select and render the note per FR-015 ("... and (if present) note").

**Contract**: Add `"note"` to the `.select(...)` string (line 39) and to the `SessionListItem` `Pick<...>` union (line 14). Render it conditionally inside the existing session `<Card>` (after the topic/format/mode chips block, lines 135–161) only when `session.note !== null`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass: `npm test -- tests/unit/session`
- Full test suite passes: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- Complete a session, type a note, submit a rating — note is saved and appears on the dashboard history card.
- Complete a session, leave the note blank, submit Skip — no note appears on the card, no error.
- Confirm the existing rating buttons and Skip still work unchanged (textarea doesn't interfere with layout or tab order).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: Focus-rating chart

### Overview

Add a new Recharts-based line chart of focus rating over time to the dashboard, reusing the existing sessions query.

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: Add Recharts as a dependency.

**Contract**: `npm install recharts`. No `overrides` needed (React 19 peer support already confirmed in research).

#### 2. Chart color token

**File**: `src/styles/global.css`

**Intent**: Give the chart's single data line a color drawn from the project's actual hex palette rather than the unused, generic OKLCH `--chart-1..5` tokens.

**Contract**: Add `--color-chart-focus: var(--color-blaze);` to the `@theme inline` block (near the existing `--color-chart-1..5` lines, `:112-116`), aliasing to the already-defined `--color-blaze: #e8320a` (`:13`).

#### 3. Chart component

**File**: `src/components/dashboard/FocusRatingChart.tsx` (new)

**Intent**: Render a Recharts `LineChart` of focus rating (y: 1–5) over session date (x), given a list of ended + rated sessions in chronological order. Show a friendly empty-state message instead of a chart when fewer than 2 data points are present.

**Contract**: Props: `sessions: { started_at: string; focus_rating: number }[]` (already-filtered, already-chronological — filtering/sorting happens in the caller, not this component). Structure: `ResponsiveContainer > LineChart > CartesianGrid, XAxis (dataKey started_at, formatted), YAxis (domain [1,5])`, `Line` with `stroke="var(--color-chart-focus)"`, `Tooltip`, no `Legend` (single series). When `sessions.length < 2`, render the empty-state message instead (e.g. "Rate a few sessions to see your focus trend") in a `Card`, matching the existing empty-history `Card` pattern in `dashboard.astro:102-104`.

#### 4. Dashboard integration

**File**: `src/pages/dashboard.astro`

**Intent**: Insert the chart between the "History" heading and the session list, deriving its input from the page's existing `sessions` query result (no second query).

**Contract**: After computing `sessions` (line 47), derive `const ratedSessions = sessions.filter((s) => s.ended_at !== null && s.focus_rating !== null).map(...).reverse()` (the existing query orders `started_at` descending; the chart needs chronological/ascending order — `reverse()` on the already-fetched array, not a new query). Render `<FocusRatingChart sessions={ratedSessions} client:only="react" />` between the `<h2>History</h2>` heading (line 92) and the `dbError`/empty-state/list blocks (starting line 94).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- Full test suite passes: `npm test`

#### Manual Verification:

- With 0 or 1 rated sessions, the dashboard shows the empty-state message, not a broken/empty chart.
- With 2+ rated sessions, the chart renders a line with correct rating values and chronological ordering (oldest on the left).
- Skipped-rating sessions and in-progress sessions do not appear as chart points or gaps.
- Chart line color visually matches the "Blaze Orange" tone used elsewhere in the dark UI (buttons, accents) — not a generic blue/purple.
- Chart is usable on both a desktop viewport and a mobile-width viewport (per the project's mobile-browser NFR).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 4.

---

## Phase 4: E2E verification

### Overview

Hand off to `/10x-e2e` to drive the two new browser-level risks (note capture end-to-end, chart rendering with real data) and confirm the existing session-capture flow test isn't broken by the new textarea.

### Changes Required:

#### 1. E2E coverage

**File**: `tests/e2e/` (new spec(s), authored by `/10x-e2e`)

**Intent**: Per `CLAUDE.md`, E2E test generation for this plan goes through the `/10x-e2e` skill (risk → seed test + rules → generate → review against anti-patterns → verify), not hand-written here.

**Contract**: Risks to cover: (1) a session ends with a note, and the note appears on the dashboard history card; (2) after 2+ rated sessions exist, the dashboard renders the focus-rating chart; (3) `tests/e2e/session-capture.spec.ts` still passes unmodified (the new textarea must not break its existing `getByRole` locators for the rating buttons/Skip).

### Success Criteria:

#### Automated Verification:

- Existing E2E suite passes unmodified: `npm run test:e2e -- session-capture.spec.ts`
- New E2E spec(s) generated by `/10x-e2e` pass: `npm run test:e2e`

#### Manual Verification:

- Review the `/10x-e2e`-generated spec(s) against the five anti-patterns (per the skill) before merging.

**Implementation Note**: This phase is driven by `/10x-e2e`, not `/10x-implement` — invoke it directly once Phases 1–3 are merged.

---

## Testing Strategy

### Unit Tests:

- `endSessionSchema` note validation (max length, trim, empty-to-null, nullable/optional) — `tests/unit/schemas/session.test.ts`.
- `SessionRunner` note textarea rendering and PATCH-body inclusion — `tests/unit/session/SessionRunner.note.test.tsx`.

### Integration Tests:

- `PATCH /api/sessions/[id]` writes `note` when present, leaves it `null` when omitted — `tests/integration/api/sessions.end.test.ts`.
- Rewritten L-01 column-scope regression test (drops `note` from the garbage-key probe, keeps `user_id`/`energy_level`).

### Manual Testing Steps:

1. Complete a session with a note and a rating — verify it saves and displays on the dashboard.
2. Complete a session with Skip and no note — verify no error, no note shown.
3. With 0–1 rated sessions, confirm the chart empty state.
4. With 2+ rated sessions (seed a few via the UI or fixtures), confirm the chart renders correctly ordered, correctly colored.
5. Resize to a mobile viewport and confirm the chart remains usable.

## Performance Considerations

Recharts adds ~145 KB gzip to the client bundle for the dashboard page only (loaded via `client:only="react"`, not on every page). No other page is affected. This was accepted as a tradeoff in the "Chart lib" decision — Recharts' built-in polish/accessibility outweighed the bundle cost for this one-chart use case.

## Migration Notes

None — the `note` column and its RLS policies already exist from `20260531182506_sessions_data_foundation.sql`.

## References

- Related research: `context/changes/session-notes-and-chart/research.md`
- Roadmap slice: `context/foundation/roadmap.md:124-135`
- PRD refs: `context/foundation/prd.md:108-116` (FR-014, FR-015, FR-016)
- L-01 lesson: `context/foundation/lessons.md:7-14`
- Column-scope precedent: `src/pages/api/sessions/[id].ts:41-48`
- Existing chart color tokens: `src/styles/global.css:40-44,74-78,112-116`
- Hex palette: `context/foundation/color_palette.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Note field — schema, API, and tests

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 729e64d
- [x] 1.2 Unit tests pass: `npm test -- tests/unit/schemas/session.test.ts` — 729e64d
- [x] 1.3 Integration tests pass: `npm test -- tests/integration/api/sessions.end.test.ts` — 729e64d
- [x] 1.4 pgTAP RLS tests pass: `npm run db:test` — 729e64d
- [x] 1.5 Full test suite passes: `npm test` — 729e64d

### Phase 2: Note capture UI + history display

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 8c862c5
- [x] 2.2 Unit tests pass: `npm test -- tests/unit/session` — 8c862c5
- [x] 2.3 Full test suite passes: `npm test` — 8c862c5
- [x] 2.4 Build succeeds: `npm run build` — 8c862c5

#### Manual

- [x] 2.5 Note saved and displayed on dashboard after rating — 8c862c5
- [x] 2.6 No note shown / no error after Skip with blank note — 8c862c5
- [x] 2.7 Existing rating/Skip buttons unaffected by textarea — 8c862c5

### Phase 3: Focus-rating chart

#### Automated

- [x] 3.1 Lint passes: `npm run lint`
- [x] 3.2 Build succeeds: `npm run build`
- [x] 3.3 Full test suite passes: `npm test`

#### Manual

- [x] 3.4 Empty state shown with 0-1 rated sessions
- [x] 3.5 Chart renders correctly with 2+ rated sessions, chronological order
- [x] 3.6 Skipped/in-progress sessions excluded from chart
- [x] 3.7 Chart color matches Blaze Orange, not generic OKLCH tokens
- [x] 3.8 Chart usable on mobile viewport

### Phase 4: E2E verification

#### Automated

- [ ] 4.1 Existing E2E suite passes unmodified: `npm run test:e2e -- session-capture.spec.ts`
- [ ] 4.2 New `/10x-e2e`-generated spec(s) pass: `npm run test:e2e`

#### Manual

- [ ] 4.3 Generated spec(s) reviewed against the five anti-patterns
