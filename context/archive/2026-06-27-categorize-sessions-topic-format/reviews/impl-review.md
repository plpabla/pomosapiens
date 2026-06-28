<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-02 Categorize sessions by topic and material format

- **Plan**: [context/changes/categorize-sessions-topic-format/plan.md](../plan.md)
- **Scope**: Full plan (Phases 1-7)
- **Date**: 2026-06-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Dead placeholder Dialog at bottom of TopicManager

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: [src/components/topics/TopicManager.tsx:265-273](../../../../src/components/topics/TopicManager.tsx#L265-L273)
- **Detail**: A second `<Dialog>` is rendered at the bottom of the component with empty `DialogContent` and a "placeholder; per-row dialogs above handle it" comment. The `open` expression `(renameId !== null && !active.find((t) => t.id === renameId))` is unreachable in normal flow and the body is empty. The sister `MaterialFormatManager.tsx` is symmetric in every other way but has NO equivalent block — clearly stranded scaffolding from an earlier approach.
- **Fix**: Delete lines 265-273. Per-row dialogs at 183-227 handle rename fully.
- **Decision**: FIXED

### F2 — Initial-fetch error in EnergyPicker silently swallowed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: [src/components/session/EnergyPicker.tsx:40-48](../../../../src/components/session/EnergyPicker.tsx#L40-L48)
- **Detail**: The `useEffect` that loads topics + formats has no `.catch()`. If either fetch 500s (Supabase misconfigured, transient network), the dropdowns silently render with just the "No topic"/"No format" sentinel and the user has no indication. Both sister managers (`TopicManager`, `MaterialFormatManager`) set a `loadError` state; this picker does not, and it lives on the critical `/session/new` path.
- **Fix**: Add `.catch()` that sets a local `loadError`, render a small inline notice when set. Don't gate Start — pickers are optional, so degraded mode (no choices) is still usable.
- **Decision**: FIXED

### F3 — Unrelated GRANT statements bundled into archived_at migration

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: [supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql:19-35](../../../../supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql#L19-L35)
- **Detail**: The plan said "No RLS changes -- existing `*_update_own` policies cover archive. No data backfill." The shipped migration adds 9 GRANT statements on `topics`, `material_formats`, AND `sessions` for `authenticated`, `anon`, `service_role`, `postgres`. `sessions` wasn't in this slice's scope. Comments explain the intent (RLS can't deny if the role lacks table privilege), so this fixed a real bug discovered during impl — but it lives in a file whose name promises only `archived_at`. Future archaeology will be harder.
- **Fix**: Already shipped — leave as-is. Optionally add a follow-up migration with a cleaner filename so the GRANT story is findable, or record as a lesson about splitting unrelated DDL.
- **Decision**: SKIPPED

### F4 — Optimistic rename writes untrimmed value

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency (UI vs server)
- **Location**: [src/components/topics/TopicManager.tsx:81-83](../../../../src/components/topics/TopicManager.tsx#L81-L83) and [src/components/material-formats/MaterialFormatManager.tsx:85-87](../../../../src/components/material-formats/MaterialFormatManager.tsx#L85-L87)
- **Detail**: Optimistic update writes `renameName` raw into state. The Zod schema (`z.string().trim()`) trims server-side, so DB stores `"Foo"` but UI shows `"Foo "` until reload. Cosmetic, but breaks the "what you see is what you have" invariant.
- **Fix**: `renameName.trim()` at the optimistic apply site in both managers.
- **Decision**: FIXED

### F5 — cn() wrapping a single static class string

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: [src/components/material-formats/MaterialFormatManager.tsx:275-277](../../../../src/components/material-formats/MaterialFormatManager.tsx#L275-L277)
- **Detail**: `cn()` called with a single literal string — no conditionals, no merge needed. Inconsistent with line 200 in the same file which uses a bare `className` in the same context.
- **Fix**: Replace `className={cn("…")}` with `className="…"`.
- **Decision**: FIXED

## Notes on what passed

- L-01 two-layer column-scope holds on every new write endpoint (default-strip `z.object` + hand-picked `.insert/.update`; no `.passthrough()`, no `parsed.data` spread).
- Error contract uniform: `{ error: string }`, statuses 200/201/400/401/409/500. No 404, no `fieldErrors`.
- 23505 duplicate-name 409 implemented on POST + PATCH for both topics and material-formats.
- Cross-user PATCH + NULL-owner PATCH return 409 byte-identical with not-found on material-formats — the seeded-format-protection regression is present in `material-formats.update.test.ts`.
- Singular embed aliases (`topic:topics(name)`, `material_format:material_formats(name)`) on `dashboard.astro`.
- 3-tap budget preserved — Start gating untouched at `energy === null || submitting`.
- PROTECTED_ROUTES entries `"/topics"` and `"/formats"` correctly added without trailing slash (top-level pages, per plan's Key Discovery).
- Sentinel `__none__` pattern correctly implemented at the `onValueChange` boundary in `EnergyPicker`.
- pgTAP `plan(12)` bumped on both RLS files; all archived_at assertions present.
- `npm run lint` clean; `npm run build` clean.
