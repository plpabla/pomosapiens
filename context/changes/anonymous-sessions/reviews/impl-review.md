<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Anonymous Session Capture (localStorage)

- **Plan**: context/changes/anonymous-sessions/plan.md
- **Scope**: All 5 phases (full-plan review)
- **Date**: 2026-07-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated success criteria re-run for this review: `npm run lint` ✓, `npm test` ✓ (281/281), `npm run build` ✓. E2E (5.1-5.3) relied on recorded Progress checkmarks (not re-run — needs live Supabase + browsers); the spec was read directly (see F2).

## Findings

### F1 — Landing-page feature cards removed against explicit "keep" instruction

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/Welcome.astro (diff removes lines ~63-135)
- **Detail**: Phase 3 change #4's Contract said "Hero heading, copy, feature cards, and the Sign Up CTA remain." The implementation inserted `<AnonSessionApp client:load />` and replaced the "Work in Progress" badge (both as planned), but also **deleted all three feature cards** ("Capture context…", "Rate the session honestly", "See your own patterns") — 84 lines removed. Heading, copy, and Sign Up CTA were correctly kept. This is a reasonable product call (a live capture form supersedes marketing cards), but it deviates from the plan's stated intent without a documented decision.
- **Fix A ⭐ Recommended**: Accept the removal; update the Phase 3 #4 contract note to record that feature cards were dropped in favor of the live capture island.
  - Strength: The working form in the hero delivers the value the cards only described; keeping both would push the Sign Up CTA far down the page.
  - Tradeoff: First-time anon visitors lose the marketing framing the cards provided.
  - Confidence: HIGH — the diff is clean and the island genuinely replaces the cards' role.
  - Blind spot: No stakeholder sign-off on the landing-page redesign is recorded.
- **Fix B**: Restore the three feature cards below the capture island.
  - Strength: Honors the plan contract verbatim; retains marketing copy.
  - Tradeoff: Longer landing page; cards partly redundant with the live form now above them.
  - Confidence: MEDIUM — depends on the intended landing-page priority (convert vs. explain).
- **Decision**: FIXED (Fix A — plan's Phase 3 #4 updated with post-hoc implementation note documenting the feature-card removal)

### F2 — E2E spec covers 1 of the 4 scenarios the plan specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/e2e/anonymous-capture.spec.ts:10-42
- **Detail**: Phase 5 change #2's Contract enumerated four scenarios: (1) full loop **with inline topic creation + note + read-only history-row assertion**, (2) **reload persistence**, (3) **mid-session refresh resume**, (4) **duplicate topic name rejected inline**. The implemented spec has a single test: energy → Start → Stop early → rate → Go to dashboard → start a second session. None of the four planned assertions are present at the browser level — no inline topic, no note, no history-row check, no reload, no mid-session-refresh resume, no duplicate rejection. Criteria 5.1/5.2 pass literally ("the spec passes"), which is why they were checked, but the anon slice's highest-value integration behaviors (refresh-resume, persistence-across-reload, read-only history, cross-tab) are not locked by e2e. Much of this logic is covered by unit tests (`tests/unit/anon/*`, `tests/unit/local/*`), but refresh-resume and persistence-across-reload are exactly the behaviors unit tests approximate rather than exercise end-to-end.
- **Fix A ⭐ Recommended**: Extend the spec to the four planned scenarios (drive inline topic + note + history assertions via role/label locators, add a reload test, add a mid-session-refresh-resume test via the stop-early path, add a duplicate-topic test).
  - Strength: Locks the resume/persistence/read-only-history behaviors that are the whole point of the localStorage slice and that unit tests cannot fully exercise; matches the plan's own Phase 5 contract.
  - Tradeoff: More e2e runtime; the mid-session-refresh assertion is timing-sensitive (mitigated by asserting on the resumed runner view, not a specific remaining time).
  - Confidence: HIGH — the fixtures (`newAnonPage`, `clearLocalStorage`) and stop-early path already exist to support all four.
  - Blind spot: Cross-tab storage-event coverage may need a second page/context and could be flaky; consider leaving that one to unit-level.
- **Fix B**: Accept current coverage; annotate Phase 5 as an intentional descope, relying on unit tests for topic/persistence logic.
  - Strength: No further work; unit suite already asserts most store/selector logic.
  - Tradeoff: No browser-level guard for refresh-resume, reload persistence, or read-only history rendering — the integration seams most likely to regress.
  - Confidence: MEDIUM — depends on how much you trust unit coverage to stand in for the browser.
- **Decision**: FIXED (Fix A — extended tests/e2e/anonymous-capture.spec.ts to 4 tests covering all planned scenarios: inline topic + note + read-only history-row assertions + reload persistence combined, mid-session-refresh-resume, duplicate-topic rejection. Verified via deliberate-break on the resume logic; full e2e suite (14/14) and lint pass.)

### F3 — Unplanned edits to shared components (CatalogSelects, FocusRating) on the authed path

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/session/CatalogSelects.tsx, src/components/session/FocusRating.tsx
- **Detail**: Two files not named in the plan changed. (a) `CatalogSelects` now early-returns from `onValueChange` when `v === ""` — a defensive fix for a synthetic empty value Radix emits when a controlled select points at a freshly-created, never-opened item (exactly the inline-topic-auto-select case). (b) `FocusRating` gained a `fullHeight?` prop (forwarded from `SessionRunner`) to drop `min-h-screen` when the runner is embedded in the hero island rather than filling a standalone page. Both are legitimate support for planned Phase 2/3 work and both touch components the authed flow also uses; the authed regression net (existing e2e + unit suites) is green, and select values are always UUIDs so the `""` guard never fires on the authed path.
- **Fix**: No code change needed; add a one-line note to the plan recording these two incidental shared-component edits so a future reviewer doesn't read them as untracked drift.
- **Decision**: FIXED (added "Incidental shared-component edits (post-hoc)" note to plan's Phase 3 #4)

### F4 — collectionStore write path lacks the try/catch its cited precedent uses

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/local/collectionStore.ts:61-63
- **Detail**: `setItems` calls `localStorage.setItem(...)` unguarded, whereas the precedent it extends (`useLastMode.ts` `persistMode`) wraps `setItem` in try/catch and fails open. The read path here *is* guarded (lines 29-37). In practice the unguarded write is caught by every caller (`useSessionStart.handleSubmit`, `SessionRunner.submitRating`, `InlineTopicCreate.handleConfirm`) and surfaced as error UI — which actually *satisfies* the plan's storage-blocked manual criterion (Phase 3, 3.8: "surfaces an error message rather than crashing"). Note that silently failing open here (as the scalar precedent does) would be *worse*: a session would appear to start but never persist, vanishing on refresh. So the divergence is defensible; the inconsistency is only that the reasoning isn't recorded.
- **Fix**: Leave the behavior as-is (surfacing the error is correct for session writes); optionally add a one-line comment on `setItems` explaining why it intentionally throws-to-caller unlike the scalar `persistMode` precedent.
- **Decision**: FIXED (added explanatory comment to `setItems` in collectionStore.ts:61-65)
