---
change_id: ui-improvements
title: UI improvements bundle: badges, stop wording, energy default, bigger clock
status: impl_reviewed
created: 2026-07-12
updated: 2026-07-12
archived_at: null
---

## Notes

S-12 from @context/foundation/roadmap.md

### Addendum (2026-07-12): unplanned commits on this branch

Three commits landed on `ui-improvements` after the plan's own close-out
(`1495cba chore(ui-improvements): close out plan (epilogue)`) and are **not**
described by `plan.md`, which only covers the five small S-12 cosmetic edits:

- `56b6682` feat: improve Session summary tiles
- `3842a14` refactor: Session tile composition
- `8089cad` fix(ui-improvements): remove phantom scrollbar on the pages

Together these ship a dashboard session-actions overhaul out of S-12's scope:
`DeleteSessionButton.tsx` removed in favor of `DeleteSessionDialog.tsx` +
`SessionActionsMenu.tsx`; `EditSessionDialog.tsx` gained a controlled/
uncontrolled dual-mode API; `AbandonButton.tsx`, `ConfirmActionButton.tsx`,
`CompletedSessionActions.tsx` reworked; `SessionTile.tsx` decomposed into
`DurationLabel.tsx`, `EnergyPill.tsx`, `SessionSummaryRow.tsx`,
`SessionTileCorner.tsx`; plus a `Layout.astro`/`dashboard.astro`/
`session/[id].astro`/`session/new.astro` layout fix. `plan.md` is accurate
for Phase 1+2 (S-12) only — it does not cover this work, and no separate
change-id documents it yet (flagged by `/10x-impl-review`, see
`reviews/impl-review.md` F2).
