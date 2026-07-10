---
date: 2026-07-10T20:26:25+0200
researcher: pawel
git_commit: 463dcc082e44f7415d49205363334fc1ec3b10c1
branch: main
repository: PomoSapiens
topic: "Extractable React components and target structure for the session list/tile refactor"
tags: [research, codebase, dashboard, session-list, react-islands, astro-pages]
status: complete
last_updated: 2026-07-10
last_updated_by: pawel
last_updated_note: "Added cross-component extraction review of all remaining .tsx files (managers, confirm buttons, shared fetch/types)"
---

# Research: Extractable React components and target structure for `refactor-react-components`

**Date**: 2026-07-10T20:26:25+0200
**Researcher**: pawel
**Git Commit**: 463dcc082e44f7415d49205363334fc1ec3b10c1
**Branch**: main
**Repository**: PomoSapiens

## Research Question

For the `refactor-react-components` change: refactor the session list / session tile into a component
composed of reusable components, and slim the Astro pages so they contain only React components with no
extra bulky logic. **What components can be extracted, and what is the target structure?**

## Summary

There is exactly **one page with real "bulky logic"**: [dashboard.astro](src/pages/dashboard.astro).
It holds ~140 lines of frontmatter (a DB query plus five formatting/predicate helpers) and then renders the
entire **session tile inline in Astro markup** with three different React islands sprinkled inside each
`<li>` (`LocalDateTime` client:only, `AbandonButton` client:load, `CompletedSessionActions` client:visible).
Every other page ([session/new.astro](src/pages/session/new.astro), [session/[id].astro](src/pages/session/[id].astro),
[topics/index.astro](src/pages/topics/index.astro), [formats/index.astro](src/pages/formats/index.astro),
[presets.astro](src/pages/presets.astro)) is already the target shape: SSR guard/fetch in frontmatter, one
React island in the body.

So the refactor is really two independent workstreams:

1. **Extract a `SessionList` / `SessionTile` React component tree** out of `dashboard.astro`'s inline markup,
   moving the formatting helpers into a shared lib module. This is the change's headline ask.
2. **De-duplicate reusable pieces already copy-pasted across islands** — the topic+format load-and-select
   block is duplicated verbatim between [EnergyPicker.tsx](src/components/session/EnergyPicker.tsx) and
   [EditSessionDialog.tsx](src/components/dashboard/EditSessionDialog.tsx), and the energy-level constant,
   `triggerClass`, and `NONE` sentinel are triplicated. These are the "reusable components" the tile (and the
   two forms) should compose from.

The [auth/](src/components/auth/) folder is the reference pattern to imitate: `SignInForm` composes
`FormField` + `PasswordToggle` + `SubmitButton` + `ServerError`. The session tile and the two select-forms
have no equivalent decomposition yet.

## Detailed Findings

### 1. `dashboard.astro` — the one page carrying bulky logic

[dashboard.astro](src/pages/dashboard.astro) frontmatter (lines 1-88) contains everything that should move
out of the page:

- **Data query** (lines 44-62): the `sessions` select with the `topic:topics(name)` / `material_format:material_formats(name)`
  embed, `.eq("user_id")`, `.order`, `.limit(50)`. This *should stay* in the Astro frontmatter — it is
  server-side, cookie-scoped, RLS-enforced SSR data loading and must not move to a client island (moving it to
  the browser would leak the query behind a fetch and lose first-paint SSR). Keep it; just hand its typed
  result to a React island.
- **Formatting / predicate helpers that should move to a lib module**:
  - `modeLabel(mode)` → P1/P2/P3/∞ (lines 33-39)
  - `formatDuration(seconds)` → mm:ss (lines 64-68)
  - `getStatus(session)` → "done" | "in_progress" (lines 70-72)
  - `isRated(s)` type guard (lines 74-76)
  - `ratedSessions` derivation for the chart (lines 78-81)
  - `energyColorClass` map (lines 83-87)
- **Inline session-tile markup** (lines 126-203): the whole `<Card>` per `<li>` — datetime + energy badge row,
  duration + rating row, the topic/format/mode badge cluster, the note paragraph, and the conditional
  action island (`AbandonButton` vs `CompletedSessionActions`).

The tile currently mixes three hydration strategies inside one server-rendered card:
`LocalDateTime` (`client:only="react"`, lines 133-137), `AbandonButton` (`client:load`, line 184),
`CompletedSessionActions` (`client:visible`, lines 188-198). A React `SessionTile` island would consolidate
these into one hydration boundary.

### 2. Components that already exist (compose, don't recreate)

Under [src/components/dashboard/](src/components/dashboard/):

- [LocalDateTime.tsx](src/components/dashboard/LocalDateTime.tsx) — must stay `client:only` (SSR runs UTC on
  Cloudflare; see its own comment). A `SessionTile` island can render it as a plain child.
- [AbandonButton.tsx](src/components/dashboard/AbandonButton.tsx) — in-progress action.
- [CompletedSessionActions.tsx](src/components/dashboard/CompletedSessionActions.tsx) — composes
  `EditSessionDialog` + `DeleteSessionButton`; already a good small composition.
- [EditSessionDialog.tsx](src/components/dashboard/EditSessionDialog.tsx) — the fat one (288 lines).
- [DeleteSessionButton.tsx](src/components/dashboard/DeleteSessionButton.tsx)
- [FocusRatingChart.tsx](src/components/dashboard/FocusRatingChart.tsx) — already an island the page mounts.

Reference composition pattern under [src/components/auth/](src/components/auth/):
[FormField.tsx](src/components/auth/FormField.tsx), `PasswordToggle`, `SubmitButton`,
[ServerError.tsx](src/components/auth/ServerError.tsx) composed by
[SignInForm.tsx](src/components/auth/SignInForm.tsx) / `SignUpForm`. This is the target granularity.

### 3. Duplication that "reusable components" should absorb

**Topic + material-format load-and-select block — duplicated verbatim:**

- [EnergyPicker.tsx:92-115](src/components/session/EnergyPicker.tsx) (fetch + archived filter) and
  [EnergyPicker.tsx:198-235](src/components/session/EnergyPicker.tsx) (two `<Select>` blocks).
- [EditSessionDialog.tsx:62-83](src/components/dashboard/EditSessionDialog.tsx) (fetch + archived filter) and
  [EditSessionDialog.tsx:182-224](src/components/dashboard/EditSessionDialog.tsx) (two `<Select>` blocks).

Both:
- fetch `/api/topics` + `/api/material-formats` in a `Promise.all`,
- filter `archived_at === null`,
- declare identical `Topic` / `MaterialFormat` interfaces,
- use the same `NONE = "__none__"` sentinel,
- use the same `triggerClass = "w-full border-charred bg-ember text-off-white hover:bg-ember focus:ring-0"`,
- render the same "No topic" / "No format" placeholder Select pair.

Extraction candidates:
- `useTopicsAndFormats()` hook (owns the fetch + archived filter + `loadError`), or a small
  `src/lib/api/catalog.ts` fetcher.
- `<TopicSelect>` / `<MaterialFormatSelect>` (or one `<CatalogSelect>`) wrapping the shadcn `Select` with the
  `NONE` sentinel and shared trigger class.
- Shared `ENERGY_LEVELS` constant (currently `LEVELS` in EnergyPicker:45-49 and `ENERGY_LEVELS` in
  EditSessionDialog:38-42) and the `EnergyLevel` type (redeclared in at least 3 files).

**Focus-rating UI — three near-variants (lower-confidence extraction):**

- [EditSessionDialog.tsx:226-256](src/components/dashboard/EditSessionDialog.tsx) — small 1-5 buttons + Skip.
- [FocusRating.tsx:132-146](src/components/session/FocusRating.tsx) — large 1-5 buttons with pop animation.
- [FocusRating.tsx:77-84](src/components/session/FocusRating.tsx) — read-only 5-dot display.
- [dashboard.astro:147-151](src/pages/dashboard.astro) — `★ N / 5` text in the tile.

The interactive pickers differ enough (size, animation, submit-on-click vs staged state) that forcing one
component risks over-abstraction. The safe extraction is a **read-only `RatingDots` / `RatingBadge`** for the
tile and the saved-screen; leave the interactive pickers alone unless the plan explicitly wants them unified.

## Target structure (proposal)

```
src/components/session/
  SessionList.tsx        # island: takes sessions[] prop, maps to SessionTile; owns empty/error state
  SessionTile.tsx        # one card; composes the pieces below + the action slot
  SessionTileMeta.tsx    # LocalDateTime + energy badge row        (or keep inline in SessionTile)
  SessionTags.tsx        # mode / topic / material-format badge cluster
  RatingBadge.tsx        # read-only "★ N / 5" | "Skipped" (+ optional dots)
  CatalogSelects.tsx     # <TopicSelect>/<MaterialFormatSelect> reused by EnergyPicker + EditSessionDialog

src/lib/session/
  format.ts              # modeLabel, formatDuration, getStatus, isRated, energyColorClass, ENERGY_LEVELS, EnergyLevel
  useCatalog.ts          # useTopicsAndFormats() hook (fetch + archived filter)   [or src/lib/api/catalog.ts]
```

Resulting `dashboard.astro`:

```astro
---
// frontmatter keeps ONLY: createClient guard + the sessions select + ratedSessions derivation
---
<Layout title="Dashboard">
  <div class="bg-cosmic min-h-screen p-4">
    <div class="mx-auto max-w-2xl">
      <DashboardHeader />                              <!-- or keep the two <a> links inline -->
      <FocusRatingChart sessions={ratedSessions} client:only="react" />
      <SessionList sessions={sessions} error={dbError} client:load />
    </div>
  </div>
</Layout>
```

Key decision for the plan: **`SessionList` as one `client:load` island receiving `sessions` as a prop.**
Astro serializes the SSR-fetched array into the island props, so first paint is still server-rendered and the
RLS-scoped query stays in the frontmatter. `LocalDateTime` stays `client:only` *inside* the island (nested
directives are fine). This satisfies "page contains only React components, no bulky logic" without regressing
SSR or the UTC-timezone constraint.

## Code References

- `src/pages/dashboard.astro:33-88` — helpers + query to relocate
- `src/pages/dashboard.astro:126-203` — inline session tile to extract into `SessionTile`
- `src/components/session/EnergyPicker.tsx:92-115,198-235` — duplicated catalog fetch + selects
- `src/components/dashboard/EditSessionDialog.tsx:62-83,182-224` — duplicated catalog fetch + selects
- `src/components/dashboard/CompletedSessionActions.tsx:18-43` — existing good composition to mirror
- `src/components/auth/SignInForm.tsx:42-85` — reference composition pattern
- `src/components/auth/FormField.tsx` — reference reusable-field granularity
- `src/components/dashboard/LocalDateTime.tsx:14-25` — must remain client:only (UTC SSR)

## Architecture Insights

- **SSR data must stay in frontmatter.** [arch.md](context/foundation/arch.md) §2 pins that Astro renders
  statically and React hydrates only where interactive. The refactor moves *presentation*, not *data loading*,
  into React. The dashboard query is cookie/RLS-scoped server work — passing its result as an island prop is
  the idiomatic Astro pattern and keeps the privacy NFR intact.
- **`@/` imports only**, `cn()` for class merging, shadcn primitives in `src/components/ui/` — all extractions
  must follow these (CLAUDE.md Key conventions). New shared class strings (`triggerClass`) belong in the
  reusable Select wrapper, not re-inlined.
- **React Compiler is on** — do not add `useMemo`/`useCallback` in the extracted components.
- **Hydration directives are per-island and nestable.** Consolidating the tile's three islands into one
  `SessionList` boundary is a net reduction in hydration entry points; `LocalDateTime` keeps `client:only`
  as a child.
- **This is a pure refactor** — no schema, API, or behavior change. Success criterion is
  visual+behavioral parity (lint/build green, e2e specs still pass), which makes it a good
  "tests pass before and after" loop.

## Historical Context (from prior changes)

- The session tile grew additively across slices: S-02 added the topic/format badges, S-03 the
  `modeLabel` P1/P2/P3/∞ badges, S-04 the note line + chart, S-05 the `AbandonButton`, S-07 the
  `CompletedSessionActions` (edit/delete). See [roadmap.md](context/foundation/roadmap.md) §Slices — no single
  slice ever owned the tile as a component, which is why the markup accreted inline in `dashboard.astro`.
- The parked "UI improvements" list ([roadmap.md:220-226](context/foundation/roadmap.md)) wants to replace the
  P1/P2/P3/∞ badges with 🍅 tomatoes and make the counter bigger — extracting `SessionTags` / `RatingBadge`
  now makes those future cosmetic swaps one-file changes.

## Related Research

- [context/foundation/arch.md](context/foundation/arch.md) — module map (§2), component list (§4), the
  capture-session flow (§5) that `SessionRunner`/`EnergyPicker` implement.

## Open Questions

1. **Granularity of the tile split** — one `SessionTile` with inline rows, or fully split into
   `SessionTileMeta` + `SessionTags` + `RatingBadge`? Recommend a single `SessionTile` plus a shared
   `SessionTags` and a read-only `RatingBadge`; avoid splitting the two-line header until a second consumer
   appears (simplicity-first).
2. **Catalog reuse shape** — a `useTopicsAndFormats()` hook vs a plain `fetchCatalog()` in `src/lib/api/`.
   The hook is nicer for the two islands; the plan should pick one and apply it to both EnergyPicker and
   EditSessionDialog in the same change to actually kill the duplication.
3. **Should the interactive rating picker be unified** across `EditSessionDialog` and `FocusRating`? Leaning
   no (they differ in size/animation/submit semantics) — extract only the read-only display.
4. **Scope fence** — is `EnergyPicker` in scope, or is this strictly the dashboard tile? The change note says
   "session list or session tile", so EnergyPicker's dedup is *adjacent*. Recommend including only the shared
   `CatalogSelects`/`useCatalog` extraction (which EnergyPicker consumes) and not otherwise restructuring
   EnergyPicker.

## Follow-up Research 2026-07-10 — extraction review of the remaining .tsx files

Reviewed every remaining island beyond the dashboard tile. Ranked by payoff. The first two are larger wins
than the tile refactor itself.

### F1. `TopicManager` vs `MaterialFormatManager` — ~90% duplicated (biggest win)

[TopicManager.tsx](src/components/topics/TopicManager.tsx) (266 lines) and
[MaterialFormatManager.tsx](src/components/material-formats/MaterialFormatManager.tsx) (289 lines) are almost
line-for-line the same. Shared, verbatim:

- the `apiFetch(url, method, body)` helper ([TopicManager.tsx:14-23](src/components/topics/TopicManager.tsx) ≡
  [MaterialFormatManager.tsx:15-24](src/components/material-formats/MaterialFormatManager.tsx)) — identical.
- the entire CRUD state block: 11 `useState`s + `handleAdd` / `handleRename` (optimistic + rollback) /
  `handleArchive` / `handleUnarchive`. Only the entity noun, the endpoint (`/api/topics` vs
  `/api/material-formats`), and the error strings differ.
- the Add dialog, the per-row Rename dialog (name Input + Enter-to-save + `ServerError`), and the
  "Show/Hide archived (N)" section — identical markup.

Only real difference: `MaterialFormatManager` splits its list into a **Built-in (seeded, `owner_id === null`)**
section plus a **Yours** section, whereas topics have one active list.

Extraction (balanced — shared logic + shared rows, per-manager layout kept to avoid over-genericizing):
- `useCrudResource<T>({ endpoint })` hook — owns load, add, rename, archive, unarchive with the optimistic
  update + rollback pattern. Both managers call it.
- `<CatalogRow>` (name + Rename/Archive buttons) and `<RenameDialog>` / `<AddEntityDialog>` presentational
  components.
- `<ArchivedSection items renderRow>` for the show/hide-archived block.
- Keep two thin `TopicManager` / `MaterialFormatManager` wrappers (the built-in split lives only in the
  format one). This collapses ~555 lines to roughly ~300 without forcing a single mega-component.

### F2. `AbandonButton` vs `DeleteSessionButton` — same 3-phase confirm button

[AbandonButton.tsx](src/components/dashboard/AbandonButton.tsx) (79 lines) and
[DeleteSessionButton.tsx](src/components/dashboard/DeleteSessionButton.tsx) (86 lines) are the same
`idle → confirming → submitting` machine that fires `DELETE /api/sessions/:id` then `window.location.reload()`.
Differences are cosmetic: labels ("Abandon" vs "Delete", "Abandoning…" vs "Deleting…") and `DeleteSessionButton`
exposes an `onPhaseChange` callback.

Extract one `<ConfirmActionButton label confirmingLabel pendingLabel onConfirm onPhaseChange? />`. Both
call sites shrink to a few props. This is a clean, low-risk merge.

### F3. Ad-hoc `fetch` + error unwrap — repeated in ~7 islands (shared helper)

The pattern `const res = await fetch(...); if (!res.ok) { const body = await res.json().catch(()=>({})); throw new Error(body.error ?? "…") }`
is hand-rolled in [EnergyPicker.tsx:140-159](src/components/session/EnergyPicker.tsx),
[EditSessionDialog.tsx:94-112](src/components/dashboard/EditSessionDialog.tsx),
[AbandonButton.tsx:18-24](src/components/dashboard/AbandonButton.tsx),
[DeleteSessionButton.tsx:25-31](src/components/dashboard/DeleteSessionButton.tsx),
[PresetManager.tsx:75-81](src/components/presets/PresetManager.tsx), plus the `apiFetch` copies in both
managers. Promote one `fetchJson(url, { method, body })` to `src/lib/api/fetchJson.ts` (the managers' `apiFetch`
is already exactly this) and delete the copies.

### F4. Redeclared domain types + minute/second math (shared module)

- `Topic`, `MaterialFormat`, `Preset`, `EnergyLevel`, `Mode` are redeclared across EnergyPicker,
  EditSessionDialog, both managers, ModePicker, PresetManager. Centralize in `src/lib/types.ts` (or derive from
  `src/db/database.types.ts`).
- seconds↔minutes conversion recurs: `toMin` ([PresetManager.tsx:20-22](src/components/presets/PresetManager.tsx)),
  `Math.round(durationSeconds/60)` (EditSessionDialog:51), `Math.round(p.focus_seconds/60)` (ModePicker:22).
  A `minutesFromSeconds` / `secondsFromMinutes` pair in `src/lib/time.ts` removes the scattered arithmetic.

### Already clean — leave alone (avoid over-refactoring)

- [SessionRunner.tsx](src/components/session/SessionRunner.tsx) — already decomposed into `useFocusTimer` /
  `useBreakTimer` / `useTabTitle` hooks + `FocusRating`. Well factored; don't touch.
- [FocusRatingChart.tsx](src/components/dashboard/FocusRatingChart.tsx),
  [ModePicker.tsx](src/components/session/ModePicker.tsx),
  [ServerError.tsx](src/components/auth/ServerError.tsx), [SubmitButton.tsx](src/components/auth/SubmitButton.tsx),
  [PasswordToggle.tsx](src/components/auth/PasswordToggle.tsx), [FormField.tsx](src/components/auth/FormField.tsx)
  — already small, single-purpose, reusable. These are the *target* granularity, not candidates.

### Suggested sequencing / scope note

F1–F4 are logically **separate from the dashboard-tile refactor** — they touch topics/formats/presets/action
buttons, not the session list. Recommend treating them as their own change (or explicit phases) rather than
smuggling them into `refactor-react-components`, per the surgical-changes rule. If bundled, order:
F3 (`fetchJson`) → F4 (types/time) → F2 (`ConfirmActionButton`) → F1 (`useCrudResource` + rows), because each
later item builds on the shared primitives from the earlier ones. F1 is the highest payoff; F3 is the cheapest.

| ID | Extraction | Files collapsed | Payoff | Risk |
| -- | ---------- | --------------- | ------ | ---- |
| F1 | `useCrudResource` + `CatalogRow`/`AddEntityDialog`/`RenameDialog`/`ArchivedSection` | TopicManager + MaterialFormatManager (~555 → ~300 lines) | High | Med (optimistic-update parity, built-in split) |
| F2 | `ConfirmActionButton` | AbandonButton + DeleteSessionButton | Med | Low |
| F3 | `fetchJson` | ~7 islands | Med | Low |
| F4 | `src/lib/types.ts` + `src/lib/time.ts` | ~6 islands | Low-Med | Low |
</content>
</invoke>
