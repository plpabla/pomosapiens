# Anonymous Session Capture (localStorage) Implementation Plan

## Overview

Let an unauthenticated visitor run the full S-01 capture loop (energy -> topic/format -> timer -> rating -> note) directly on `/`, persisted entirely to `localStorage`, with a read-only local history view (list + focus-rating chart) on the same page. No Supabase writes, no server-side rows. This is slice A of roadmap S-08; syncing local data into an account after sign-in/sign-up is explicitly split out as S-09 (`anonymous-session-sync`).

## Current State Analysis

From `frame.md` and `research.md` (both in this change folder), corroborated by direct reads of every file this plan touches:

- **`/` is already anon-only.** `src/middleware.ts:5-9` bounces authenticated visitors from `/` to `/dashboard` via `AUTHED_REDIRECTS`, and `/` is not in `PROTECTED_ROUTES`. With the chosen single-page client-side flow (no navigation between capture phases), **no middleware change is needed at all** -- the frame's expected middleware edit dissolves.
- **No persistence abstraction exists.** The capture loop's two write paths hardcode fetches: `src/lib/session/useSessionStart.ts:40-51` (POST `/api/sessions`, then `window.location.assign("/session/" + id)`) and `src/components/session/SessionRunner.tsx:89-109` (PATCH `/api/sessions/{id}`). `SessionRunner` also hardcodes `window.location.assign("/dashboard")` (3 places) and `"/session/new"` (1 place).
- **The presentational layer reuses cleanly.** `ModePicker`, `EnergyLevelPicker`, `TopicSelect`/`MaterialFormatSelect`, `FocusRating`, `SessionList`, `FocusRatingChart` are all pure props-in components with zero internal fetching. `EnergyPicker.tsx` is the authed island that composes the pickers and owns the fetch hooks (`useTopicsAndFormats`, presets GET).
- **`SessionTile.tsx:35-51`** renders `AbandonButton` (in-progress) and `CompletedSessionActions` (done), both of which call `/api/sessions/*` -- unusable against local rows.
- **`useLastMode.ts` is the localStorage precedent**: `useSyncExternalStore` + SSR-safe `getServerSnapshot` + try/catch fail-open + module-level listener set. It is scalar-only and has no cross-tab `storage`-event wiring.
- **Schema facts that shape the local mirror** (from all 8 migrations): `sessions.duration_seconds` is a GENERATED column (must be computed client-side, never stored-and-trusted); `topics`/`material_formats` carry `UNIQUE(owner_id, name)`; `material_formats` is server-seeded with 5 default rows (Video, Reading, Writing code, Drilling problems, Other) whose IDs are non-deterministic; `topics` ships empty by design; presets fall back to `DEFAULT_PRESETS` (`src/lib/timer/preset-defaults.ts`) per slot.
- **Test infrastructure**: vitest jsdom project includes `tests/unit/**/*.test.{ts,tsx}` (`vitest.config.ts:23-33`); every existing Playwright spec depends on an authenticated fixture (`tests/_fixtures/auth.ts`, `tests/e2e/_fixtures/auth.ts`) -- there is no signed-out fixture.
- **Architectural stance**: `context/foundation/arch.md:5` says "the server owns truth" -- this slice is the codebase's first deliberate exception, which is exactly why the persistence seam must be one shared injection point, not per-call-site branching (frame's top risk: silent divergence).

## Desired End State

An anonymous visitor lands on `/`, sees the existing hero plus a capture form, optionally creates a topic inline, picks mode/energy/topic/format, and starts a session. The timer runs on the same page (refresh-safe), the chime fires, they rate and note the session, and it appears in a read-only history list + chart below the form. All data lives in `localStorage`; the signed-in experience is byte-for-byte unchanged.

Verify by: `npm run lint`, `npm test`, `npm run build` all green; full existing e2e suite green (authed regression); new anonymous e2e spec green; manual walk-through of the anon loop including a mid-session page refresh.

### Key Discoveries:

- `/` needs no middleware change -- `AUTHED_REDIRECTS` (`src/middleware.ts:5-9`) already makes it anon-only, and the single-page flow adds no new routes.
- Only 2 of the 4 "tables" need real localStorage stores (sessions, topics). With inline-topic-creation-only scope, material formats become a hardcoded 5-row constant with fixed IDs, and presets stay the existing `DEFAULT_PRESETS` constant.
- The persistence seam is exactly 2 write operations (create session, end session) plus navigation callbacks -- `useSessionStart.ts` and `SessionRunner.tsx` are the only files that must become injectable.
- `useFocusTimer`'s wall-clock derivation (lessons.md L-03) makes mid-session refresh resume free: re-mount the runner with the stored `started_at` and the elapsed time is correct; a stale in-progress preset session lands directly on the rating view, which is the right behavior with no age guard (per L-05).
- The e2e timer problem (25-minute default preset) is avoided by driving the "Stop early" path, which the runner already supports.

## What We're NOT Doing

- **No sync/merge into Supabase** on sign-in/sign-up -- that is S-09 (`anonymous-session-sync`), a separate change.
- **No edit/delete/abandon on local sessions** -- the local history view is read-only (list + chart only). Decided during planning.
- **No local management pages** -- `/topics`, `/formats`, `/presets` stay protected and authed-only. Anon gets inline topic creation in the capture form only; formats are the 5 fixed defaults; presets are the 3 fixed defaults, selectable but not editable.
- **No format creation, topic rename/archive** for anonymous users.
- **No changes to API routes, RLS, or migrations** -- the anon flow never touches the server.
- **No sign-up prompt/data-migration CTA** beyond the landing page's existing Sign Up button (S-09 will own any "keep your data" messaging).
- **No multi-tab locking or warnings** -- cross-tab `storage`-event refresh only; concurrent timers in two tabs are an accepted limitation (parity with the authed flow).

## Implementation Approach

Inject persistence at the island boundary instead of branching inside components. The authed islands (`EnergyPicker` on `/session/new`, `SessionRunner` on `/session/[id]`) keep their current behavior via default props/implementations backed by the existing fetch calls. A new anonymous island on `/` composes the same presentational components and the same `useSessionStart`/`SessionRunner` logic, but passes local-persistence implementations backed by two new localStorage collection stores (sessions, topics) that extend the `useLastMode` pattern to collections with a versioned envelope, a 200-item session cap, and cross-tab `storage`-event wiring.

Decision record (from planning session): entry point = `/` directly; history = read-only list + chart; IDs = client `crypto.randomUUID()` with local name-uniqueness for topics (mirroring `UNIQUE(owner_id, name)`); management surface = inline topic creation only; cap = newest 200 sessions; multi-tab = storage-event wiring, no UI warning.

## Critical Implementation Details

- **Timer & resume semantics (L-03, L-05)**: the anon runner must receive `startedAtMs` parsed from the stored row's `started_at` and let `useFocusTimer` derive elapsed/remaining from wall clock. On mount, if the local store has a session with `ended_at === null`, resume it (runner phase falls out naturally -- a preset session past its focus window shows the rating view). Do NOT add any age-based guard.
- **Audio prime (L-02)**: keep the existing muted-play prime inside `useSessionStart.handleSubmit` for the anon path too. Because the anon flow never navigates, the same-document user activation from the Start click carries to the chime directly -- do not remove the prime, and no page-B re-prime is needed.
- **SSR/hydration safety**: all localStorage reads go through `useSyncExternalStore` with a `getServerSnapshot` returning a fixed empty default, exactly like `useLastMode.ts` -- the island SSRs on Cloudflare Workers where `window` does not exist. Cache the parsed snapshot and invalidate on notify: `getSnapshot` must return referentially stable results between notifications or React loops.
- **`duration_seconds` is computed, never stored**: derive it from `started_at`/`ended_at` in the selector that builds `SessionListItem`s, mirroring the DB's GENERATED column semantics.
- **State sequencing on start**: write the local session row BEFORE transitioning the island to the runner phase, so a refresh between click and render still resumes correctly.

## Phase 1: Local Persistence Foundation

### Overview

Build the localStorage layer: a small shared collection-store helper plus `sessions` and `topics` stores, fixed local catalog constants, and selectors that produce the exact shapes the reusable components expect. Pure library code + unit tests; no UI changes.

### Changes Required:

#### 1. Shared collection store helper

**File**: `src/lib/local/collectionStore.ts` (new)

**Intent**: One reusable factory for versioned localStorage collections so sessions and topics don't duplicate the subscribe/snapshot/fail-open machinery, extending the `useLastMode.ts` pattern from scalar to array.

**Contract**: `createCollectionStore<T>({ key, version })` returning `{ getItems(): readonly T[], setItems(next: T[]): void, subscribe(cb): () => void }`. Storage envelope is `{ v: 1, items: T[] }`; a missing key, JSON parse failure, or version mismatch yields `[]` (fail open, never throw). `subscribe` registers both the module-level same-tab listener set and a `window.addEventListener("storage", ...)` handler filtered to the store's key (cross-tab refresh). The snapshot returned by `getItems` must be cached and only re-read after a notification, so `useSyncExternalStore` sees stable references. Server snapshot is a shared frozen empty array.

#### 2. Local sessions store

**File**: `src/lib/local/localSessions.ts` (new)

**Intent**: The anon mirror of the `sessions` table: create/end/read operations plus a React hook, with the 200-item cap.

**Contract**: `LocalSession` type mirroring the columns the loop uses (`id, started_at, ended_at, energy_level, focus_rating, note, topic_id, material_format_id, timer_mode, planned_focus_seconds, planned_break_seconds` -- no stored `duration_seconds`). Key `pomosapiens.local.sessions`. Operations: `createLocalSession(input): LocalSession` (assigns `crypto.randomUUID()` and `started_at = new Date().toISOString()`, trims collection to newest 200 by `started_at` on write), `endLocalSession(id, { focus_rating, ended_at, note })`, `getInProgressSession(): LocalSession | null` (newest row with `ended_at === null`), and `useLocalSessions()` hook via `useSyncExternalStore`.

#### 3. Local topics store

**File**: `src/lib/local/localTopics.ts` (new)

**Intent**: The anon mirror of the `topics` table, empty by default (matching the server), with name-unique creation for the inline-create affordance.

**Contract**: rows shaped as `Topic` (`src/lib/types.ts:6-10`: `id, name, archived_at`). Key `pomosapiens.local.topics`. `createLocalTopic(name): Topic` trims the name, validates non-empty and max length against the existing zod topic schema's rules (`src/lib/schemas/topic.ts`), and rejects an exact-match duplicate name (mirrors `UNIQUE(owner_id, name)`) by throwing an `Error` with a user-facing message. `useLocalTopics()` hook.

#### 4. Local catalog constants

**File**: `src/lib/local/localCatalog.ts` (new)

**Intent**: Local equivalents of the server-seeded material formats and the preset fallbacks, with IDs stable across page loads so stored sessions' FK references stay valid.

**Contract**: `LOCAL_DEFAULT_FORMATS: MaterialFormat[]` -- 5 entries with the exact server-seed names (Video, Reading, Writing code, Drilling problems, Other), hardcoded fixed UUID literals as `id`, `owner_id: null`, `archived_at: null`. Presets are NOT redefined here -- the anon flow imports `DEFAULT_PRESETS` from `src/lib/timer/preset-defaults.ts` directly.

#### 5. History selector

**File**: `src/lib/local/localSessionList.ts` (new, or co-located in `localSessions.ts`)

**Intent**: Turn raw local rows into the `SessionListItem[]` shape `SessionList`/`FocusRatingChart` expect, including the name joins and computed duration.

**Contract**: `toSessionListItems(sessions, topics): SessionListItem[]` -- computes `duration_seconds` from `started_at`/`ended_at` (null while in progress), resolves `topic: { name } | null` from the topics store and `material_format: { name } | null` from `LOCAL_DEFAULT_FORMATS`, sorted by `started_at` descending (mirrors `dashboard.astro:26-27`).

#### 6. Unit tests

**File**: `tests/unit/local/*.test.ts` (new)

**Intent**: Pin the store contracts before any UI consumes them.

**Contract**: cover -- envelope round-trip and fail-open on corrupt/missing/version-mismatched data; 200-cap trim order (oldest dropped); duplicate topic name rejection and trim behavior; `getInProgressSession` selection; `toSessionListItems` duration computation, name joins, and ordering; cross-tab `storage`-event notification (dispatch a synthetic `StorageEvent` in jsdom).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking and lint pass: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- None (pure library code; behavior is exercised in Phases 3-4).

**Implementation Note**: After completing this phase and all automated verification passes, proceed directly (no manual gate) -- but keep the `## Progress` section updated.

---

## Phase 2: Persistence Seam Refactor (Authed Behavior Unchanged)

### Overview

Make the two hardcoded write paths and the start-form JSX injectable so Phase 3 can reuse them against localStorage. Every default preserves current authed behavior exactly; this phase must be a no-op for signed-in users.

### Changes Required:

#### 1. Session persistence port

**File**: `src/lib/session/persistence.ts` (new)

**Intent**: Name the seam: the two operations both backends must provide, plus the remote implementation extracted verbatim from today's call sites.

**Contract**: this is the signature contract Phases 3 depends on --

```ts
export interface SessionPersistence {
  createSession(input: CreateSessionInput): Promise<{ id: string; startedAtMs: number }>;
  endSession(id: string, args: { focus_rating: number | null; ended_at: string; note: string | null }): Promise<void>;
}
```

`CreateSessionInput` carries the exact POST body fields from `useSessionStart.ts:43-49` (`energy_level, topic_id, material_format_id, timer_mode, planned_focus_seconds, planned_break_seconds`). `remotePersistence` implements `createSession` with the existing `fetchJson` POST (returning `startedAtMs: Date.now()` is NOT acceptable -- the remote path navigates away and never uses it; return the parsed `started_at` if present, else `Date.now()`, and document that only the local path consumes it) and `endSession` with the existing PATCH body from `SessionRunner.tsx:93-101` including its error-message extraction.

#### 2. Inject persistence into the start hook

**File**: `src/lib/session/useSessionStart.ts`

**Intent**: Replace the inlined `fetchJson` POST + `window.location.assign` with the port plus an `onStarted` callback, keeping the audio prime in place.

**Contract**: `Params` gains `persistence: SessionPersistence` and `onStarted(result: { id: string; startedAtMs: number }): void`. `EnergyPicker` (the only current caller) passes `remotePersistence` and an `onStarted` that does today's `window.location.assign("/session/" + id)`. The audio-prime block stays exactly where it is (same user-gesture tick).

#### 3. Inject end-persistence and navigation into the runner

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Let the caller supply how a rating is persisted and where "dashboard"/"new session" go, with defaults preserving today's behavior so `/session/[id].astro` needs no changes beyond (at most) explicit props.

**Contract**: new optional props -- `persistEnd?: (args: { focus_rating: number | null; ended_at: string; note: string | null }) => Promise<void>` (default: current PATCH via `remotePersistence.endSession(sessionId, ...)`), `onGoToDashboard?: () => void` (default: `window.location.assign("/dashboard")` -- used in all 3 current call sites), `onStartNewSession?: () => void` (default: `window.location.assign("/session/new")`). `submitRating` keeps its `stoppedAtMs` guard and error-state handling, delegating the network part to `persistEnd`.

#### 4. Extract the start form

**File**: `src/components/session/SessionStartForm.tsx` (new), `src/components/session/EnergyPicker.tsx`

**Intent**: Pull the pure form JSX (mode picker, energy picker, topic/format selects, error display, submit button) out of `EnergyPicker` so the anon island can render the identical form without inheriting the authed fetch hooks. `EnergyPicker` becomes a thin authed wrapper: its hooks (`useTopicsAndFormats`, presets GET, `useLastMode`, `useSessionStart`) stay, feeding the extracted form.

**Contract**: `SessionStartForm` is pure props-in: `{ presets, topics, formats, mode, onModeChange, energy, onEnergyChange, topicId, onTopicChange, materialFormatId, onFormatChange, loadError, submitError, submitting, onSubmit, topicSlot? }`. `topicSlot` (optional ReactNode rendered adjacent to `TopicSelect`) is the extension point Phase 3 uses for inline topic creation -- authed callers omit it. Also remove `EnergyPicker`'s local duplicate `DEFAULT_PRESETS` array in favor of the canonical `src/lib/timer/preset-defaults.ts` import (it duplicates the same values today; this change is required anyway since the file is being reworked).

### Success Criteria:

#### Automated Verification:

- Lint and typecheck pass: `npm run lint`
- Unit tests pass: `npm test`
- Production build succeeds: `npm run build`
- Full existing e2e suite passes unchanged (authed regression net): `npm run test:e2e`

#### Manual Verification:

- Signed-in capture loop is behaviorally identical: start from `/session/new`, run, stop early, rate with note, land on `/dashboard`, entry appears.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the authed flow is unchanged before proceeding.

---

## Phase 3: Anonymous Capture Flow on `/`

### Overview

The new anon island: compose `SessionStartForm` + `SessionRunner` against local persistence with client-side phase transitions, inline topic creation, and refresh-resume. Mount it on the landing page.

### Changes Required:

#### 1. Local persistence implementation

**File**: `src/lib/local/localPersistence.ts` (new)

**Intent**: The `SessionPersistence` implementation backed by Phase 1's stores.

**Contract**: `createSession` calls `createLocalSession` and returns `{ id, startedAtMs: Date.parse(row.started_at) }`; `endSession` calls `endLocalSession`. Both resolve synchronously-wrapped-in-Promise; failures (storage unavailable) reject with a user-facing message that `useSessionStart`/`SessionRunner` already surface via their existing error states.

#### 2. Anonymous capture island

**File**: `src/components/anon/AnonSessionApp.tsx` (new)

**Intent**: The single `client:load` island orchestrating the anon experience: picker phase vs. runner phase, driven by whether the local store has an in-progress session.

**Contract**: on mount (via `useLocalSessions` + `getInProgressSession`), an in-progress row renders `SessionRunner` with `sessionId`, `startedAtMs` parsed from the stored `started_at`, `focusSeconds`/`mode`/`breakSeconds` derived from the stored row exactly as `session/[id].astro:44-46` derives them (`planned_focus_seconds ?? 25*60`; `timer_mode === "count_up"` -> count_up mode with null break). Otherwise it renders `SessionStartForm` fed by: `DEFAULT_PRESETS`, `useLocalTopics()`, `LOCAL_DEFAULT_FORMATS`, `useLastMode()` (shared with authed -- same key is fine), and `useSessionStart` wired with `localPersistence` and an `onStarted` that flips the island into the runner phase (no navigation). Runner callbacks: `persistEnd` -> `localPersistence.endSession`; `onGoToDashboard` and `onStartNewSession` both return the island to the picker phase (history sits below on the same page); state must reset so a new capture starts clean. The session row is written before the phase flips (see Critical Implementation Details).

#### 3. Inline topic creation

**File**: `src/components/anon/InlineTopicCreate.tsx` (new)

**Intent**: The `topicSlot` content: a minimal affordance (e.g. small "New topic" button revealing an input + confirm) that calls `createLocalTopic` and selects the created topic.

**Contract**: props `{ onCreated(topic: Topic): void }`; surfaces `createLocalTopic`'s duplicate/validation error inline (reuse the `ServerError` presentation used elsewhere in the form); on success calls `onCreated` so `AnonSessionApp` sets `topicId` to the new id.

#### 4. Mount on the landing page

**File**: `src/components/Welcome.astro`

**Intent**: Insert the anon capture island into the existing hero layout so the landing page delivers immediate value while keeping the sign-up path. Hero heading, copy, feature cards, and the Sign Up CTA remain.

**Contract**: `<AnonSessionApp client:load />` placed prominently within the hero section (implementer's layout judgment; the "Work in Progress - stay tuned!" badge should give way to the live capture form). The island container must also host the Phase 4 history below the form.

### Success Criteria:

#### Automated Verification:

- Lint and typecheck pass: `npm run lint`
- Unit tests pass: `npm test`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Anonymous visit to `/` shows the capture form; full loop works: create topic inline, pick energy/format/mode, start, timer runs, stop early, chime plays, rate + note saves.
- Mid-session page refresh resumes the running timer with correct remaining time.
- Duplicate inline topic name shows an inline error, does not create a row.
- Signed-in visit to `/` still redirects to `/dashboard`.
- Private-browsing mode (storage blocked): form still renders; starting a session surfaces an error message rather than crashing.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation of the loop above before proceeding.

---

## Phase 4: Local History View

### Overview

Read-only history on `/` below the capture form: the dashboard's list + chart fed from localStorage, with mutation actions hidden.

### Changes Required:

#### 1. Read-only mode for the session list

**Files**: `src/components/session/SessionList.tsx`, `src/components/session/SessionTile.tsx`

**Intent**: Let the list render without the server-backed action buttons.

**Contract**: `SessionList` gains optional `readOnly?: boolean` (default `false`) forwarded to `SessionTile`, which skips rendering `AbandonButton` and `CompletedSessionActions` when set. Dashboard usage is untouched (prop omitted).

#### 2. Anonymous history section

**File**: `src/components/anon/AnonSessionApp.tsx` (extends Phase 3 component)

**Intent**: Render history beneath the capture form from the same `useLocalSessions` subscription, mirroring the dashboard's derivations.

**Contract**: `toSessionListItems(...)` output into `<SessionList readOnly sessions={...} error={null} />`; chart input derived exactly as `dashboard.astro:35-38` (rated only via `isRated` from `src/lib/session/format`, mapped to `{ started_at, focus_rating }`, reversed to chronological) into `<FocusRatingChart sessions={...} />`. Section renders only when at least one local session exists (the landing page should not show an empty "History" block to a first-time visitor); `SessionList`'s own empty state is therefore not shown on `/`.

### Success Criteria:

#### Automated Verification:

- Lint and typecheck pass: `npm run lint`
- Unit tests pass: `npm test`
- Production build succeeds: `npm run build`

#### Manual Verification:

- After completing a session, history shows the entry with duration, energy color, rating badge, topic/format tags, and note -- with no abandon/edit/delete controls.
- Chart appears once at least one rated session exists and grows chronologically.
- A second tab on `/` reflects a session completed in the first tab after the write (storage-event refresh).
- Signed-in dashboard tiles still show their action buttons (readOnly default off).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 5: E2E -- Anonymous Fixture and Spec

### Overview

First signed-out e2e coverage: a fixture guaranteeing a clean unauthenticated context and a spec driving the full anon loop through the UI (no DB seeding possible or needed).

### Changes Required:

#### 1. Anonymous fixture

**File**: `tests/e2e/_fixtures/anon.ts` (new)

**Intent**: Provide a browser context with no auth cookie and empty localStorage, sidestepping the `setupTwoUsers`/`seedAuthCookie` machinery entirely.

**Contract**: helper (e.g. `newAnonPage(browser)`) returning a page from a fresh `browser.newContext()` -- fresh contexts have no cookies/storage by construction; include a `clearLocalStorage(page)` helper for specs that revisit `/` within one test. Follow the documentation style of the existing fixture files.

#### 2. Anonymous capture spec

**File**: `tests/e2e/anonymous-capture.spec.ts` (new)

**Intent**: Lock the whole slice: capture loop, inline topic creation, persistence across reload, read-only history.

**Contract**: per the project's `/10x-e2e` rules (role/label/text locators, no `waitForTimeout`, unique timestamp-suffixed names, self-contained tests). Scenarios: (1) full loop -- visit `/`, create a uniquely-named topic inline, select it + a format + energy, start, assert timer visible, click "Stop early", rate + note, assert the history row (topic tag, note, rating) with no abandon/edit/delete controls; (2) reload persistence -- after (1)'s flow completes, `page.reload()` and assert the history row is still present; (3) mid-session refresh -- start a session, reload, assert the running timer view resumed (not the picker); (4) duplicate topic name rejected inline. Cleanup is per-context (fresh context per test), so no cross-test state.

### Success Criteria:

#### Automated Verification:

- New spec passes: `npm run test:e2e -- anonymous-capture`
- Full suite passes (authed + anon): `npm run test:e2e`
- Lint passes: `npm run lint`

#### Manual Verification:

- None beyond Phase 3/4 checks (this phase automates them).

---

## Testing Strategy

### Unit Tests (`tests/unit/local/`):

- Collection store: envelope versioning, fail-open on corrupt data, snapshot stability, storage-event notification.
- Sessions store: create/end round-trip, 200-cap trim, in-progress selection.
- Topics store: name trim, duplicate rejection, schema-bounds validation.
- Selector: duration computation, topic/format name joins, descending order.

### Integration/E2E:

- Existing suite = authed regression net for the Phase 2 seam refactor (must stay green with zero spec edits).
- New `anonymous-capture.spec.ts` covers the anon loop end-to-end via the stop-early path.

### Manual Testing Steps:

1. Anon full loop on `/` including inline topic creation and note.
2. Refresh mid-session -> timer resumes with correct remaining time.
3. Private-browsing/storage-blocked visit -> graceful error, no crash.
4. Two tabs -> second tab's history updates after first tab completes a session.
5. Sign in -> `/` redirects to `/dashboard`; authed loop unchanged; dashboard tiles keep action buttons.

## Performance Considerations

Local reads are synchronous and tiny (<= 200 sessions, ~60KB worst case, far under the ~5MB origin limit). The only care point is `useSyncExternalStore` snapshot caching (see Critical Implementation Details) to avoid re-parse-per-render. React Compiler handles memoization; do not add manual `useMemo`.

## Migration Notes

The `{ v: 1, items }` envelope plus client-UUID ids and name-unique topics are deliberately shaped for S-09 (`anonymous-session-sync`): the merge will upsert topics/formats by name (remapping local UUIDs to server ids) and insert sessions with remapped FKs. Nothing in this slice writes to Supabase, so rollback is deleting the island mount and the `src/lib/local/` modules; local keys left in visitors' browsers are inert.

## References

- Frame brief: `context/changes/anonymous-sessions/frame.md`
- Research: `context/changes/anonymous-sessions/research.md`
- Roadmap slice: `context/foundation/roadmap.md:183-197` (S-08), `:200-214` (S-09)
- Pattern precedents: `src/lib/session/useLastMode.ts` (localStorage), `src/pages/dashboard.astro:20-38` (history derivations), `src/pages/session/[id].astro:44-46` (runner prop derivation)
- Lessons applied: L-02 (audio prime), L-03 (wall-clock timer), L-05 (no age-based guards)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` -- <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Local Persistence Foundation

#### Automated

- [x] 1.1 Unit tests pass: `npm test` -- b730dc5
- [x] 1.2 Type checking and lint pass: `npm run lint` -- b730dc5
- [x] 1.3 Production build succeeds: `npm run build` -- b730dc5

### Phase 2: Persistence Seam Refactor (Authed Behavior Unchanged)

#### Automated

- [x] 2.1 Lint and typecheck pass: `npm run lint` -- 4c4be1d
- [x] 2.2 Unit tests pass: `npm test` -- 4c4be1d
- [x] 2.3 Production build succeeds: `npm run build` -- 4c4be1d
- [x] 2.4 Full existing e2e suite passes unchanged: `npm run test:e2e` -- 4c4be1d

#### Manual

- [x] 2.5 Signed-in capture loop behaviorally identical (start -> run -> stop early -> rate -> dashboard) -- 4c4be1d

### Phase 3: Anonymous Capture Flow on `/`

#### Automated

- [x] 3.1 Lint and typecheck pass: `npm run lint` -- 73989a3
- [x] 3.2 Unit tests pass: `npm test` -- 73989a3
- [x] 3.3 Production build succeeds: `npm run build` -- 73989a3

#### Manual

- [x] 3.4 Anon full loop works on `/` (inline topic, energy/format/mode, start, stop early, chime, rate + note) -- 73989a3
- [x] 3.5 Mid-session refresh resumes the running timer -- 73989a3
- [x] 3.6 Duplicate inline topic name shows inline error -- 73989a3
- [x] 3.7 Signed-in visit to `/` still redirects to `/dashboard` -- 73989a3
- [x] 3.8 Storage-blocked visit degrades gracefully (error message, no crash) -- 73989a3

### Phase 4: Local History View

#### Automated

- [x] 4.1 Lint and typecheck pass: `npm run lint` -- 2296869
- [x] 4.2 Unit tests pass: `npm test` -- 2296869
- [x] 4.3 Production build succeeds: `npm run build` -- 2296869

#### Manual

- [x] 4.4 History entry renders complete and read-only (no abandon/edit/delete) -- 2296869
- [x] 4.5 Chart appears with rated sessions, chronological -- 2296869
- [x] 4.6 Second tab reflects completed session via storage event -- 2296869
- [x] 4.7 Signed-in dashboard tiles still show action buttons -- 2296869

### Phase 5: E2E -- Anonymous Fixture and Spec

#### Automated

- [ ] 5.1 New spec passes: `npm run test:e2e -- anonymous-capture`
- [ ] 5.2 Full suite passes: `npm run test:e2e`
- [ ] 5.3 Lint passes: `npm run lint`
