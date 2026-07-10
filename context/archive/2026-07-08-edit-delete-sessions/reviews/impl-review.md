<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit & Delete Logged Sessions (S-07)

- **Plan**: context/changes/edit-delete-sessions/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Date**: 2026-07-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Edit dialog keeps unsaved edits after cancel-then-reopen

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability/UX)
- **Location**: src/components/dashboard/EditSessionDialog.tsx:117
- **Detail**: Form state (`minutes`, `energy`, `topicId`, `note`, `rating`, `error`) is seeded from props via `useState` and is never reset when the dialog closes without saving. The island stays mounted (only a successful save reloads the page), so: open → edit a field → dismiss via X/escape/overlay → reopen shows the edited-but-unsaved values, not the session's real stored data. The save path is clean (it reloads); only the cancel path drifts. A user who abandons an edit and reopens sees stale, misleading values.
- **Fix**: In `onOpenChange`, when transitioning to closed reset the field state (and `error`) back to the prop-derived defaults — or key the inner form on `open` so it remounts fresh each time.
  - Strength: Removes the stale-state trap entirely; matches the "modal reflects current row" intent stated in the Phase 2 contract.
  - Tradeoff: A few lines; must reset every field + the `durationDirty` bit consistently.
  - Confidence: HIGH — standard controlled-dialog reset; the component owns all its state locally.
  - Blind spot: None significant.
- **Decision**: FIXED — reset form state (minutes, durationDirty, energy, topicId, materialFormatId, rating, note, error) to prop-derived defaults in a new `handleOpenChange`, called on Dialog's `onOpenChange`.

### F2 — Unplanned edits to `session-abandon` / `session-capture` e2e specs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/e2e/session-abandon.spec.ts, tests/e2e/session-capture.spec.ts (commit 79d4fe2)
- **Detail**: Two pre-existing e2e specs outside this feature's surface were modified in a "fix hydration-race flakes" commit. The plan's "What We're NOT Doing" did not list these. Investigation confirms the changes are benign test-infra stabilization causally triggered by this feature: adding the two new concurrent Phase-4 specs raised parallel-worker CPU contention that surfaced pre-existing hydration-race flakes. abandon wraps the Abandon click in the same `expect(...).toPass()` retry the new specs use; capture only bumps a state-based timeout to 10s. No business-logic or behavioral change. This is scope-adjacent, not scope creep — flagged for the record.
- **Fix**: Document the flake-fix in the plan as a one-line addendum (why two unrelated specs changed) so a future reviewer isn't surprised. No code change needed.
  - Strength: Keeps the plan the source of truth; the work is already committed and correct.
  - Tradeoff: None material.
  - Confidence: HIGH — change is minimal and understood.
  - Blind spot: None significant.
- **Decision**: FIXED — added an addendum note to plan.md's Phase 4 section explaining the flake-fix.

### F3 — `topic_id` / `material_format_id` FK ownership not validated server-side

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Security)
- **Location**: src/pages/api/sessions/[id].ts:112-116 (PUT); mirrors pre-existing POST at src/pages/api/sessions/index.ts:38-39
- **Detail**: The PUT writes `topic_id` / `material_format_id` straight from the request body without checking the referenced row belongs to (or is a NULL-owner default visible to) the caller. RLS on `sessions` does not cover the FK target, and the DB FK only checks existence — so a user could point their own session at another user's topic/format UUID. Impact is low: the dashboard join runs under the caller's RLS, so a foreign topic resolves to `null` and never renders (no data leak), leaving only a dangling cross-user reference. It is also consistent with the already-shipped POST path, so it is not a regression introduced here.
- **Fix**: Either validate ownership of `topic_id` / `material_format_id` server-side before the update, or accept the current behavior and document that read-side RLS neutralizes exposure. Not blocking; if fixed, fix POST too for consistency.
- **Decision**: DISMISSED — already tracked as a parked backlog item in `context/foundation/roadmap.md:229` ("Server-side ownership validation of `topic_id` / `material_format_id` on session writes"), which covers both POST and PUT together, outside MVP. No further action here.

### F4 — Picker fetch does not check `res.ok` and latches `loaded` on first failure

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency (Reliability)
- **Location**: src/components/dashboard/EditSessionDialog.tsx:62-78
- **Detail**: `fetch("/api/topics").then(r => r.json())` never checks `r.ok`; an error response surfaces only incidentally when `.filter(...)` throws into `.catch`. `loaded` latches to `true` in `finally`, so a transient failure on first open is never retried on later opens (page reload required). Both behaviors are copied verbatim from the sibling `EnergyPicker.tsx:92-106`, so this is a consistency-preserving note rather than a new defect — the form still degrades gracefully (it submits with the original `topicId`/`materialFormatId` preserved).
- **Fix**: Optionally check `res.ok` before parsing and allow retry on reopen — but only worth doing if `EnergyPicker` is fixed in the same pass, to keep the pattern uniform.
- **Decision**: FIXED — both `EditSessionDialog.tsx` and `EnergyPicker.tsx` (`src/components/session/EnergyPicker.tsx`) now throw on non-`ok` responses before parsing JSON. In `EditSessionDialog`, `loaded` is only latched to `true` on success, so a failed fetch retries automatically on the next dialog open.
