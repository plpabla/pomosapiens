# PomoSapiens - Architecture Delta: fix-continue-sessions

## Overview

This change relaxes the `timer_mode="count_up" ⇒ null planned_*` invariant from an edit-time rule to insert-time-only, then adds preset-carrying navigation to break completion. **No schema changes.** The changes touch the session persistence seam, timer state machine, and the break-completion flow; anonymous sessions and auth are unaffected.

---

## Affected Architecture Sections

### 1. Session Persistence Seam (§5)

**Current state:** `SessionRunner` accepts `persistEnd` and `persistContinue` callbacks for persistence, but has no control over break-completion navigation — it always calls `onGoToDashboard`.

**Delta:**

- Add `onBreakComplete?: () => void` callback to `SessionRunner` props, defaulting to `onGoToDashboard` for backward compatibility.
- Replace the three `onGoToDashboard()` calls at break-completion sites (visible-tab go, hidden-tab dismiss, manual "End break" button) with `onBreakComplete()`.
- The callback enables the anon island (§6.2) to continue landing on the form via the default, while the authed island can override it to redirect to a prefilled `/session/new`.

**Impact on the port diagram (§5):**
```
SessionRunner (updated)
├── persistEnd prop (unchanged)
├── persistContinue prop (unchanged)
├── canContinue prop (unchanged)
├── onGoToDashboard prop (unchanged, used for rating-screen "Go to dashboard")
├── onStartNewSession prop (unchanged)
└── onBreakComplete? prop (NEW) — routes break-completion navigation
```

---

### 2. Timer State Machine (§7)

**Current state:**
- Break-completion `running_break → [*]` transition always navigates via `onGoToDashboard`.
- Chime fires at break-end, then navigation happens.

**Delta:**
- The transition now calls `onBreakComplete()` instead, unlocking preset-carrying redirect in authed context.
- The sequence remains: chime → wait for audio → navigate (via `onBreakComplete()`).
- State machine logic is unchanged; only the exit callback differs.

**Updated diagram line (§7):**
```
running_break --> [*] : break reaches 0 (chime, navigate via onBreakComplete)
running_break --> [*] : End break (manual, navigate via onBreakComplete)
```

---

### 3. End-to-End Flows (§6)

#### 6.1 (Capture flow — signed-in)

**Additions at break-end:**
- After PATCH `/api/sessions/:id` succeeds and break completes, `SessionRunner.onBreakComplete()` is called.
- In authed context, this URL-navigates to `/session/new?energy=<energy>&mode=<mode>&topic=<topic>&format=<format>` (preset-carrying redirect).
- The rating-screen "Go to dashboard" button still uses `onGoToDashboard` (unchanged).

**New substeps:**
```
opt break completes naturally or user clicks "End break"
  SR->>SR: chime
  SR->>SR: onBreakComplete() called
  (in authed context: navigate to /session/new with prefilled params)
end
```

#### 6.2 (Anonymous capture on `/`)

**No change.** The default `onBreakComplete` behavior (delegate to `onGoToDashboard`) keeps anonymous breaks exiting to the form.

#### 6.3 (History management on the dashboard)

**No change.**

#### 6.4 (Auth)

**No change.**

---

### 4. Module Map (§3)

#### 3.1 (Pages and islands)

**New data flow:**
- `session/[id].astro` now selects `topic_id, material_format_id` in addition to `energy_level, timer_mode, planned_*_seconds`.
- `session/[id].astro` builds a prefill URL query string and passes it as `breakCompleteHref` prop to `SessionRunner`.
- `session/new.astro` now reads `Astro.url.searchParams` for prefill (`energy`, `topic`, `format`, `mode`) and passes them to `EnergyPicker`.

**Updated flows:**
```
sessId[session/[id].astro] 
  ├── SELECT topic_id, material_format_id (NEW)
  ├── build prefill URL query (NEW)
  └── pass breakCompleteHref to SessionRunner (NEW)

sessNew[session/new.astro]
  ├── read Astro.url.searchParams (NEW)
  └── pass prefill params to EnergyPicker (NEW)
```

#### 3.2 (Client islands and shared logic)

**New prefill logic in EnergyPicker:**
- Accept optional props: `initialEnergy?`, `initialTopicId?`, `initialFormatId?`, `initialMode?` (strings from URL).
- Seed form state from prefill values, falling back to defaults / `useLastMode()`.
- After catalog load, silently reset missing `topicId` / `materialFormatId` to `null` (stale topics/formats fall back to "none").

**SessionRunner change:**
- Accept `breakCompleteHref?: string` prop.
- Build `onBreakComplete` closure: if `breakCompleteHref` provided, `() => window.location.assign(breakCompleteHref)`; else fall back to `onGoToDashboard`.
- Include `onBreakComplete` in the effect dependency array.

---

### 5. Domain Model (§4)

**No schema changes.** The invariant `timer_mode="count_up" ⇒ null planned_*` becomes insert-time-only (no DB CHECK added). Rows can now have `timer_mode="count_up"` AND non-null `planned_break_seconds` after a continue POST; reopen queries read the row correctly (no migrations needed).

---

## Summary of Unaffected Areas

- **Auth flow (§6.4)**: No changes.
- **Anonymous path (§6.2)**: Behavior unchanged; default `onBreakComplete` callback preserves landing on the form.
- **RLS / Authorization**: No changes; API endpoints unchanged in scope.
- **Database schema / migrations**: No changes.
- **Deployment shape (§9)**: No changes.
- **Roadmap (§10)**: Within scope of S-10 / S-11 continuation.

---

## Key Architectural Invariants Preserved

1. **Server owns truth**: Prefill carries snapshot data from the previous session (energy, topic, format, mode); the form always reads fresh from `/api/topics`, `/api/material-formats`, `/api/user-presets` on mount, so stale or deleted catalog items are reconciled against current state.
2. **Full SSR page navigation**: Break-completion redirect is a full navigation to `/session/new`, not a client-side state swap. The new page SSR-renders the form with prefill params applied.
3. **Two-stage audio prime**: Unchanged; break chime still fires from the primed `audioRef`, and the new page re-primes for its own session.
4. **Wall-clock derivation**: The prefilled form's mode can be count-up, but derivation rules remain unchanged.

---

## Testing Surface

- **Unit/integration**: Update `sessions.continue.test.ts` to assert `planned_break_seconds` is preserved (Phase 1).
- **Manual verification** (§6.1, 6.2): Continue → break → prefilled redirect; native count-up still no break.
- **E2E** (not added per plan): Playwright spec covering the full continue → break → prefilled `/session/new` flow could validate the redirect URL and form pre-selection, but is out of scope.
