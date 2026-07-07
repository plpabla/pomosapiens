# Tab Title Live Timer Implementation Plan

## Overview

While a study session is running, reflect the live timer value in the browser tab title so the student can monitor progress from the OS taskbar / tab strip without switching focus to the app (FR-018). The title reverts to its default when the timer stops. Two attention affordances are layered on top for backgrounded tabs: a blinking "focus done" alert when the focus phase ends, and a blinking "break over" alert when the break ends (holding the auto-navigation until the user returns).

## Current State Analysis

- **Single integration point.** [`SessionRunner.tsx`](../../../src/components/session/SessionRunner.tsx) is the only React island (`client:load`) that owns every timer phase: running focus, running break, and the rating screen. It already derives `remaining` / `elapsed` (focus) and `breakRemaining` (break) each tick and formats them with a local `formatTime()` helper (`MM:SS`).
- **Timer values are already wall-clock-correct (L-03).** Both `useFocusTimer` and `useBreakTimer` recompute the displayed value from the server `started_at` anchor every tick and on `visibilitychange`. The tab title reuses these same values, so it stays correct across backgrounding for free -- no new timing logic.
- **Default title is `"Session"`.** [`session/[id].astro:49`](../../../src/pages/session/[id].astro#L49) renders `<Layout title="Session">`; `Layout.astro` sets `<title>{title}</title>`. `SessionRunner` mounts after the page title is set, so `document.title === "Session"` at hook mount.
- **All navigation away is a full page load.** Every exit from `SessionRunner` uses `window.location.assign(...)`, which reloads the destination and naturally resets the title. The only in-document title states to manage are: running focus, running break, the rating screen, and the post-break window before navigation.
- **Break completion auto-navigates today.** The `breakComplete` effect ([`SessionRunner.tsx:50-69`](../../../src/components/session/SessionRunner.tsx#L50-L69)) waits for the chime's `ended` event (5s fallback) then `window.location.assign("/dashboard")`. Phase 3 gates this so a break that ends on a **hidden** tab holds navigation until the user returns.
- **Test infra is ready.** `tests/unit/timer/` uses `renderHook` (`@testing-library/react`) + jsdom + `vi.useFakeTimers` + a `dispatchVisibilityChange` helper in `tests/unit/_setup`. A title hook is unit-testable with the same tooling.

## Desired End State

While the focus phase runs, the tab reads `⏱ MM:SS – PomoSapiens` (countdown for presets, elapsed for count-up). During a break it reads `🌴 MM:SS – PomoSapiens`. When the timer stops (natural end, early stop, or unmount) the title reverts to `Session`. If the focus phase ends while the tab is hidden, the title blinks `✅ Focus done!` ↔ `⏰ ⏰ ⏰` until the user refocuses the tab, then restores. If the break ends while the tab is hidden, the title blinks `Break over!` ↔ `⏰ ⏰ ⏰` and dashboard navigation is deferred until the user refocuses, then it navigates.

Verify: run a preset session, watch the tab countdown; switch tabs during focus and let it end -> the backgrounded tab blinks the focus-done alert; return -> it stops. Take a break, background the tab, let the break end -> blinks the break-over alert and does NOT navigate; return -> it stops blinking and lands on the dashboard.

### Key Discoveries:

- Reuse existing derived values (`SessionRunner.tsx:29`, `:39`) -- no new timers. Pattern to follow: L-03 (never decrement; derive from anchor) is already satisfied upstream.
- `formatTime` currently lives locally in `SessionRunner.tsx:15-20`; extract it so both the component and the new hook share one implementation.
- The "stop on refocus" behavior maps cleanly to a `visibilitychange` listener that checks `document.hidden`, mirroring the reconciliation listeners already in the timer hooks.

## What We're NOT Doing

- No favicon swap, no full-screen "focus done" banner (parked "visual chime fallback" idea in the roadmap).
- No Web Notifications API (separate parked item).
- No change to timer accuracy, audio priming, or session-save logic.
- No change to the VISIBLE break-completion path -- it keeps today's chime-wait-then-navigate behavior. Only the hidden-tab path defers navigation.
- No new backend, schema, routes, or API changes. Pure client-side.

## Implementation Approach

Introduce one focused hook, `useTabTitle`, that owns `document.title` for the lifetime of the session island. `SessionRunner` computes a small view-state each render (a plain title string while running, or an alert text pair when a phase ends) and hands it to the hook; the hook sets the title, runs the blink interval when the tab is hidden, listens for refocus, and restores the captured default title on unmount. Keeping all `document.title` writes in one hook guarantees a single cleanup path (the roadmap's one real risk: a stale title after unmount). `SessionRunner` owns all display strings (emoji, app name, alert wording); the hook stays generic and content-agnostic so it is trivially testable.

## Critical Implementation Details

- **Effect cleanup is the load-bearing invariant.** The hook must capture `document.title` once on mount and restore it in the mount effect's cleanup, so any unmount (navigation, route change, React teardown) reverts the tab. This is the single failure mode the roadmap flags.
- **Alert effect must key on primitive deps.** `SessionRunner` passes a fresh alert tuple each render; the blink effect must depend on the tuple's string values (`alert[0]`, `alert[1]`), not object identity, or it will restart the interval on every re-render.
- **Hidden-ness is evaluated at alert start.** The blink runs only if `document.hidden` is true when the alert state begins; if the tab is visible, the hook restores the default title and dismisses immediately. This makes early-stop (always triggered from a visible tab) never blink, which sidesteps the "'done' vs 'stopped early'" wording problem.
- **En-dash separator.** The running-title separator is a literal en dash (`–`, U+2013), per the chosen format. Not a hyphen, not an em dash.

## Phase 1: Core tab-title timer

### Overview

Extract `formatTime`, add the `useTabTitle` hook with plain-title + default-restore behavior, and wire the running focus / count-up / break titles. Delivers the FR-018 requirement; no alerts yet.

### Changes Required:

#### 1. Shared time formatter

**File**: `src/lib/timer/formatTime.ts` (new), `src/components/session/SessionRunner.tsx`

**Intent**: Move the local `MM:SS` formatter into a shared module so the component and the hook format identically. Update `SessionRunner` to import it and delete its local copy.

**Contract**: `export function formatTime(seconds: number): string` -- clamps negatives to 0, zero-pads minutes and seconds. Behavior identical to the current `SessionRunner.tsx:15-20`.

#### 2. `useTabTitle` hook (title + restore only)

**File**: `src/lib/timer/useTabTitle.ts` (new)

**Intent**: Own `document.title` for the session island. When given a title string, set it; when given none, restore the default. Capture the default on mount and restore on unmount.

**Contract**: `useTabTitle(input: { title: string | null }): void`. On mount, capture `document.title` into a ref and register a cleanup that restores it. An effect keyed on `title` sets `document.title = title ?? defaultRef.current`. (The `alert` capability is added in Phase 2; keep the input as an object so the signature extends without churn.)

#### 3. Wire running-state titles in `SessionRunner`

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Compute the running title string and pass it to `useTabTitle`. Focus and count-up use the `⏱` marker; break uses `🌴`. All other phases pass `title: null` (restore default).

**Contract**: While `phase === "running"`, `title = "⏱ " + formatTime(mode === "count_up" ? elapsed : remaining) + " – PomoSapiens"`. While `internalPhase === "running_break"`, `title = "🌴 " + formatTime(breakRemaining) + " – PomoSapiens"`. Otherwise `title = null`. Call `useTabTitle({ title })` unconditionally at the top level (hooks rule).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Unit tests pass: `npm test`
- New hook test asserts: running focus sets `⏱ MM:SS – PomoSapiens`; break sets `🌴 MM:SS – PomoSapiens`; `title: null` restores the captured default; unmount restores the default.

#### Manual Verification:

- Start a preset session -> tab shows `⏱` countdown ticking each second.
- Start a count-up session -> tab shows `⏱` elapsed time counting up.
- Take a break -> tab shows `🌴` break countdown.
- Let focus end / stop early / navigate away -> tab title returns to `Session` (no stale time).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Focus-done blink alert

### Overview

Extend `useTabTitle` with a blink-on-hidden alert, and drive it from the rating screen so a backgrounded tab flashes when the focus phase ends.

### Changes Required:

#### 1. Add alert capability to `useTabTitle`

**File**: `src/lib/timer/useTabTitle.ts`

**Intent**: When given an alert text pair, blink the title between the two strings while the tab is hidden, stop and restore on refocus, and call an optional dismiss callback. When the tab is already visible at alert start, restore the default and dismiss immediately (no blink).

**Contract**: Extend input to `{ title: string | null; alert?: readonly [string, string] | null; onAlertDismiss?: () => void }`. When `alert` is set it takes precedence over `title`. Route `onAlertDismiss` through a ref so it stays out of the effect deps. The blink effect keys on `alert?.[0]` / `alert?.[1]` (primitive deps), not object identity.

```ts
useEffect(() => {
  if (!alert) return;
  const [a, b] = alert;
  if (!document.hidden) {
    document.title = defaultRef.current;
    onDismissRef.current?.();
    return;
  }
  let showFirst = false;
  document.title = a;
  const id = setInterval(() => {
    showFirst = !showFirst;
    document.title = showFirst ? b : a;
  }, 1000);
  const onVis = () => {
    if (document.hidden) return;
    clearInterval(id);
    document.title = defaultRef.current;
    document.removeEventListener("visibilitychange", onVis);
    onDismissRef.current?.();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVis);
  };
}, [alert?.[0], alert?.[1]]);
```

#### 2. Drive the focus-done alert from `SessionRunner`

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: When the rating screen is showing (focus phase ended, break not started), pass the focus-done alert text. No dismiss callback -- refocus just restores the title; the rating screen stays put.

**Contract**: Define `const FOCUS_DONE = ["✅ Focus done!", "⏰ ⏰ ⏰"] as const`. When `phase === "rating" && internalPhase === "rating"` (and break not complete), pass `alert: FOCUS_DONE` with `title: null`. The hook's visible-branch handles the "focus ended while watching" case by restoring the default immediately.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Hook test asserts: alert while `document.hidden` toggles the title between the two strings across `setInterval` ticks; `visibilitychange` to visible clears the interval, restores the default, and fires `onAlertDismiss`; alert while visible restores the default and fires `onAlertDismiss` without blinking.
- Lint passes: `npm run lint`

#### Manual Verification:

- Start a short preset, switch to another tab, let focus end -> the backgrounded tab blinks `✅ Focus done!` ↔ `⏰ ⏰ ⏰`.
- Return to the tab -> blinking stops, title restores to `Session`, rating screen is shown.
- Let focus end while watching the tab -> no blink; rating screen shows and title is `Session`.
- Stop early (always from a visible tab) -> no blink.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Break-done blink alert

### Overview

Reuse the alert mechanism for break completion: if the break ends while the tab is hidden, blink a "break over" alert and hold the dashboard navigation until the user returns. The visible-tab break-completion path is unchanged.

### Changes Required:

#### 1. Capture hidden-ness at break completion

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: Record whether the tab was hidden at the moment the break completed, so the navigation path can branch. Set it in the `useBreakTimer` `onComplete` callback alongside `setBreakComplete(true)`.

**Contract**: Add state `const [breakDoneWhileHidden, setBreakDoneWhileHidden] = useState(false)`. In `onComplete`, set `setBreakDoneWhileHidden(document.hidden)` before/with `setBreakComplete(true)`.

#### 2. Gate the existing auto-navigate effect

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: The existing chime-wait-then-navigate effect ([`:50-69`](../../../src/components/session/SessionRunner.tsx#L50-L69)) should run only for the visible-tab case; the hidden case navigates via the alert dismiss instead.

**Contract**: Early-return the existing effect when `breakDoneWhileHidden` is true (`if (breakDoneWhileHidden) return;`), leaving its visible-tab behavior otherwise identical.

#### 3. Drive the break-over alert

**File**: `src/components/session/SessionRunner.tsx`

**Intent**: When the break completed on a hidden tab, pass the break-over alert with a dismiss callback that navigates to the dashboard on refocus.

**Contract**: Define `const BREAK_OVER = ["Break over!", "⏰ ⏰ ⏰"] as const`. When `breakComplete && breakDoneWhileHidden`, pass `alert: BREAK_OVER` and `onAlertDismiss: () => window.location.assign("/dashboard")`. When `breakComplete && !breakDoneWhileHidden`, pass `title: null` (default) and let the gated effect from change #2 navigate. The hook's own visible-branch will not fire here because the alert is only passed when hidden.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- `SessionRunner` component test (jsdom, following `SessionRunner.break.test.tsx`) asserts: break completing while hidden does NOT immediately navigate and the title blinks; `visibilitychange` to visible then triggers `window.location.assign("/dashboard")`. Break completing while visible keeps the existing navigate-after-chime behavior.
- Lint passes: `npm run lint`

#### Manual Verification:

- Take a break, switch tabs, let the break end -> backgrounded tab blinks `Break over!` ↔ `⏰ ⏰ ⏰` and does NOT navigate.
- Return to the tab -> blinking stops and the app navigates to the dashboard.
- Take a break and stay on the tab -> break ends and navigates to the dashboard as it does today (chime finishes first).

**Implementation Note**: Pause for manual confirmation. This is the final phase.

---

## Testing Strategy

### Unit Tests:

- `tests/unit/timer/useTabTitle.test.ts` -- title set/restore, count-up vs focus formatting via `formatTime`, unmount restore, blink toggle while hidden, refocus stop + dismiss, visible-at-start immediate dismiss. Use `renderHook`, `vi.useFakeTimers`, and `dispatchVisibilityChange` from `tests/unit/_setup`.
- Extend or add a `SessionRunner` test for the break-done-while-hidden deferred-navigation path (mock `window.location.assign`, drive `document.hidden`).

### Integration / E2E:

- Not required for this slice. Tab-title assertions are awkward in Playwright and the risk is low (cosmetic, fail-safe). Covered by unit tests. (If desired later, a `page.title()` assertion could be added to an existing session-flow e2e spec.)

### Manual Testing Steps:

1. Preset session: confirm `⏱` countdown in the tab, ticking each second.
2. Count-up session: confirm `⏱` elapsed counting up.
3. Break: confirm `🌴` break countdown.
4. Background during focus end: confirm focus-done blink; refocus stops it and restores `Session`.
5. Background during break end: confirm break-over blink, no navigation; refocus stops it and navigates to the dashboard.
6. Early stop and plain navigation: confirm the title always returns to `Session`, never stale.

## Performance Considerations

Negligible. The title write piggybacks on the once-per-second re-render the timer already triggers. The blink uses a single 1s `setInterval` active only while a tab is hidden after a phase ends.

## Migration Notes

None. No data or schema changes.

## References

- Change identity: `context/changes/tab-title-timer/change.md`
- Roadmap slice: `context/foundation/roadmap.md` (S-06)
- PRD: FR-018 (tab title timer), FR-011 (visible countdown)
- Lesson: L-03 (timer resilience -- derive from anchor; already satisfied upstream)
- Integration point: `src/components/session/SessionRunner.tsx`
- Test patterns: `tests/unit/timer/useBreakTimer.test.ts`, `tests/unit/session/SessionRunner.break.test.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Core tab-title timer

#### Automated

- [x] 1.1 Type checking passes: `npm run lint`
- [x] 1.2 Unit tests pass: `npm test`
- [x] 1.3 Hook test asserts running focus / break titles, null-restore, and unmount-restore

#### Manual

- [ ] 1.4 Preset session shows `⏱` countdown ticking each second
- [ ] 1.5 Count-up session shows `⏱` elapsed counting up
- [ ] 1.6 Break shows `🌴` break countdown
- [ ] 1.7 Focus end / stop early / navigate restores title to `Session`

### Phase 2: Focus-done blink alert

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Hook test asserts blink-while-hidden, refocus stop+dismiss, and visible-at-start immediate dismiss
- [ ] 2.3 Lint passes: `npm run lint`

#### Manual

- [ ] 2.4 Backgrounded tab blinks `✅ Focus done!` ↔ `⏰ ⏰ ⏰` when focus ends
- [ ] 2.5 Refocus stops blinking and restores `Session`, rating screen shown
- [ ] 2.6 Focus end while watching / early stop -> no blink

### Phase 3: Break-done blink alert

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 SessionRunner test asserts hidden-break defers navigation + blinks; refocus navigates; visible-break unchanged
- [ ] 3.3 Lint passes: `npm run lint`

#### Manual

- [ ] 3.4 Backgrounded tab blinks `Break over!` ↔ `⏰ ⏰ ⏰` on break end, no navigation
- [ ] 3.5 Refocus stops blinking and navigates to the dashboard
- [ ] 3.6 Break ending on a visible tab navigates to the dashboard as before
