# Tab Title Live Timer — Plan Brief

> Full plan: `context/changes/tab-title-timer/plan.md`

## What & Why

While a session runs, show the live timer in the browser tab title so a student can monitor progress from the OS taskbar or a tab strip without switching back to the app (FR-018). Two attention cues are layered on for backgrounded tabs: a blinking alert when the focus phase ends, and a blinking alert when the break ends.

## Starting Point

`SessionRunner.tsx` is the single React island that owns all timer phases and already derives wall-clock-correct time values each tick (focus `remaining`/`elapsed`, `breakRemaining`). The page default title is `Session`; all exits are full-page navigations. Break completion currently auto-navigates to the dashboard after the chime.

## Desired End State

Tab reads `⏱ MM:SS – PomoSapiens` during focus/count-up and `☕ MM:SS – PomoSapiens` during break, reverting to `Session` when the timer stops. If focus ends on a hidden tab, the title blinks `✅ Focus done!` ↔ `⏰ ⏰ ⏰` until refocus. If the break ends on a hidden tab, the title blinks `Break over!` ↔ `⏰ ⏰ ⏰` and dashboard navigation is held until the user returns.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Focus title format | `⏱ MM:SS – PomoSapiens` (time first) | Time stays visible when a narrow tab truncates; emoji makes it scannable. | Plan |
| Break label | Distinct `☕` marker | Lets the student tell focus vs break from the taskbar alone. | Plan |
| Count-up display | Same `⏱` style, elapsed | Consistent with the on-screen count-up; the growing number reads naturally. | Plan |
| Focus-end (visible) | Restore default immediately | The rating screen is not a timed phase; no stale countdown. | Plan |
| Focus-end (hidden) | Blink until refocus | The alert exists to pull the user back; once looking, it stops. | Plan |
| Break-end (hidden) | Blink + hold navigation until refocus | The alert persists until the user returns, then lands them on the dashboard. | Plan |
| Break-end (visible) | Unchanged (chime-wait then navigate) | Preserve today's happy-path behavior. | Plan |
| Architecture | One `useTabTitle` hook owns `document.title` | Single cleanup path kills the only real risk (stale title on unmount). | Plan |

## Scope

**In scope:** live tab-title timer (focus, break, count-up); revert on stop/unmount; focus-done blink alert; break-done blink alert with deferred navigation while hidden; unit tests.

**Out of scope:** favicon swap, full-screen banner, Web Notifications; any backend/schema/route/API change; changes to timer accuracy, audio priming, or session-save; the visible-tab break-completion path.

## Architecture / Approach

Add `useTabTitle` (in `src/lib/timer/`, alongside `useFocusTimer`/`useBreakTimer`). `SessionRunner` computes a small view-state each render -- a plain title string while running, or an alert text pair when a phase ends -- and passes it to the hook. The hook sets `document.title`, runs a 1s blink interval only while the tab is hidden, listens for `visibilitychange` to stop and restore on refocus, fires an optional dismiss callback (used by the break path to navigate), and restores the captured default title on unmount. `formatTime` is extracted to a shared module so the component and hook format identically. All display strings live in `SessionRunner`; the hook stays generic and testable.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Core tab-title timer | `useTabTitle` + running focus/break/count-up titles + revert on stop/unmount (FR-018) | Effect cleanup leaving a stale title |
| 2. Focus-done blink alert | Blink `✅ Focus done!` on a hidden tab; stop on refocus | Interval keyed on object identity restarting every render |
| 3. Break-done blink alert | Blink `Break over!` on a hidden tab; defer dashboard nav until refocus | Branching the existing break-complete navigation cleanly |

**Prerequisites:** S-01 (session capture loop) -- already implemented.
**Estimated effort:** ~1 session across 3 small phases; pure client-side.

## Open Risks & Assumptions

- Assumes `document.title === "Session"` at hook mount (set by `Layout` before the island hydrates) -- captured dynamically, so a title change would still be honored.
- Blink alert relies on `document.hidden` / `visibilitychange`; if a browser never reports hidden, the alert simply never blinks (fail-safe, cosmetic).
- Worst-case failure is a stale time string in the tab -- no data loss or privacy impact (per FR-018 fail-safe note).

## Success Criteria (Summary)

- Running tab shows the correct live countdown/elapsed with the right marker, and always reverts to `Session` when the timer stops or the user leaves.
- A focus phase ending on a backgrounded tab visibly blinks and stops when the user returns.
- A break ending on a backgrounded tab blinks and holds navigation until the user returns, then lands on the dashboard.
