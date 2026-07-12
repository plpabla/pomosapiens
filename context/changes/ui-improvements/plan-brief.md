# UI Improvements Bundle (S-12) — Plan Brief

> Full plan: `context/changes/ui-improvements/plan.md`

## What & Why

S-12 bundles five small cosmetic UI polish changes promoted from the Parked list: accurate 🍅 time badges in history, correct stop-button wording for count-up, a pre-selected energy default, the time badges relocated above Start, and a bigger running clock. Pure frontend, no schema or API impact.

## Starting Point

The history badge shows `P1/P2/P3/∞` (which preset ran) via `modeLabel` in `SessionTags`; the running stop button always says "Stop early"; the energy picker starts unselected (Start disabled until a pick); the preset chips sit at the top of the pre-session form; and both running clocks are `text-7xl`.

## Desired End State

History rows show one 🍅 per full 20 min of actual worked time for completed sessions of 20 min or more (count-up included); sessions under 20 min show no time badge; count-up sessions say "Stop"; the pre-session screen opens with Medium pre-selected and Start ready; the time chips sit just above Start; and the clocks are noticeably larger while staying readable on mobile.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| 🍅 count math | Floor, no minimum | A 🍅 means a full 20 min was truly earned; sessions under 20 min show no badge at all | Plan |
| Count-up / in-progress badge | 🍅 for all done rows (incl. count-up); no badge in-progress | Uniform and honest; count-up finally shows real duration instead of a bare ∞ | Plan |
| Energy default | Medium pre-selected, Start immediately enabled | Fewest taps to a running timer; FR-009 still satisfied (a value is always sent) | Plan |
| Clock size | Both clocks to a large responsive size (~text-8xl/9xl) | Focus and break stay visually consistent; responsive class avoids mobile overflow | Plan |
| Phasing | Phase 1 = 🍅 badge (has logic); Phase 2 = the other four | Only the badge has branching behavior worth isolating and unit-testing | Plan |

## Scope

**In scope:** `format.ts` (tomato helper, drop `modeLabel`), `SessionTags.tsx`, `SessionRunner.tsx`, `EnergyPicker.tsx`, `AnonSessionApp.tsx`, `SessionStartForm.tsx`, and the associated unit tests.

**Out of scope:** schema/API/routes; live in-progress tomato badge; changing count-up's identity beyond the history badge; FR-009 changes beyond a default.

## Architecture / Approach

`SessionTags` already sits inside `SessionTile`, which passes the full session object carrying `duration_seconds` and `ended_at`. Both the signed-in (`dashboard.astro` SELECT) and anonymous (`localSessionList.ts`) paths populate those fields, so a single edit in `SessionTags` + one helper in `format.ts` covers both surfaces. The other four changes are one-to-two-line edits in their respective components.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. 🍅 badge | Tomato count from actual duration, done-only, both history paths | Getting the done-vs-in-progress gating and count-up duration right |
| 2. Wording/default/layout/clock | Stop label, Medium default, chip relocation, bigger clocks | A stray unit test asserting unselected-energy or a disabled Start at mount |

**Prerequisites:** none beyond S-03 (already done).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes no e2e selects count-up + asserts "Stop early" — verified against current specs (all such assertions run on preset default).
- Assumes `modeLabel` has no direct unit test — verified; removing it is safe.
- Responsive clock class must be checked on a real narrow viewport to confirm the MM:SS string doesn't wrap.

## Success Criteria (Summary)

- Completed history rows ≥20 min (incl. count-up) show correct floored 🍅 counts; sub-20-min and in-progress rows show none.
- Count-up running session reads "Stop"; preset reads "Stop early".
- Pre-session screen opens with Medium selected, Start enabled, time chips above Start; clocks larger without mobile overflow.
