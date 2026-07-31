---
title: PomoSapiens - Invariant Guardian Aggregate Refactor Plan
created: 2026-07-28
type: refactor-plan
---

# PomoSapiens - Invariant Guardian Aggregate Refactor Plan

> A **plan**, not an implementation. No production code is changed here. Every claim is cited to `file:line`
> and verified against the running code. Where the plan proposes new names, they are marked **NEW**.
> Companion to [01-domain-distillation.md](01-domain-distillation.md); this document narrows in on one
> invariant and designs the aggregate that should own it.

---

## Step 0 - Discovered context

**Requirement sources read:** [prd.md](../foundation/prd.md) (locked, FR-001..FR-018), [arch.md](../foundation/arch.md)
(architecture snapshot 2026-07-16), [roadmap.md](../foundation/roadmap.md) (S-00..S-14, all shipped except S-09),
[lessons.md](../foundation/lessons.md) (L-01..L-08, the closest thing this project has to a contract registry).

**Stack and where business logic lives:** Astro 6 SSR + React 19 islands on Cloudflare Workers; Supabase
(Postgres + RLS + Auth). Domain rules are spread across four layers, and critically across **two persistence
backends**:

- **Persistence / DB invariants**: `supabase/migrations/*.sql` (schema, CHECK, RLS, generated columns).
- **Request boundary (signed-in)**: `src/pages/api/**` handlers + `src/lib/schemas/*.ts` zod schemas.
- **Client domain logic**: `src/lib/timer/`, `src/lib/session/`, and the second backend `src/lib/local/`.
- **The anonymous path is a full second persistence tier**, not a cache: an unauthenticated visitor runs
  the whole capture loop against `localStorage` ([arch.md:16](../foundation/arch.md#L16)). Every domain rule
  therefore has to hold in *two* places, or it does not hold.

---

## Step 1 - Business invariants (identification)

Rules that MUST always be true in this domain, pulled from the documents AND the code, each cited.

| # | Invariant (must always hold) | Source |
| --- | --- | --- |
| **INV-1** | A session belongs to exactly one user and is never visible to another. | Privacy NFR [prd.md:131](../foundation/prd.md#L131); Access Control [prd.md:156](../foundation/prd.md#L156) |
| **INV-2** | Energy level is always present on a session (only required pre-session field). | FR-009 [prd.md:92](../foundation/prd.md#L92) |
| **INV-3** | A session is **ended exactly once**: it moves from in-progress (`ended_at` NULL) to ended (non-NULL) one time; a done session cannot be re-ended or un-ended. | "Write-once end" [arch.md:480](../foundation/arch.md#L480); L-01 [lessons.md:9](../foundation/lessons.md#L9) |
| **INV-4** | The recorded duration is the **actual wall-clock elapsed time** (`ended_at - started_at`), even on early stop, and is therefore non-negative. | FR-012 [prd.md:101](../foundation/prd.md#L101); US-01 AC [prd.md:62](../foundation/prd.md#L62) |
| **INV-5** | The **end write is atomic** with rating + note capture (one transition seals the data point). | "rating -> saved ... PATCH / local write succeeds" [arch.md:548](../foundation/arch.md#L548) |
| **INV-6** | Focus rating is 1..5 or NULL (skip); never 0, 6, or fractional. | FR-013 [prd.md:106](../foundation/prd.md#L106) |
| **INV-7** | `ended_at` is plausible (not clock-tampered far into future/past). | "plausibility window" [arch.md:480](../foundation/arch.md#L480) |
| **INV-8** | `count_up` mode => planned durations NULL at insert; preset => both non-NULL. | [arch.md:302](../foundation/arch.md#L302) |
| **INV-9** | Timer mode is one of `{preset_1, preset_2, preset_3, count_up}`. | FR-010 [prd.md:94](../foundation/prd.md#L94) |
| **INV-10** | A mid-flight "continue" only converts a **still-running** preset session to count-up. | S-10 [arch.md:481](../foundation/arch.md#L481) |

---

## Step 2 - Classification and selection of #1

Each invariant scored on three axes: **(a) coreness** (to the product's reason to exist), **(b) spread**
(how many layers/files it lives in), **(c) enforcement** (really enforced / merely declared / violable).

| # | (a) Core? | (b) Spread | (c) Enforcement | Notes |
| --- | --- | --- | --- | --- |
| INV-1 | Highest (privacy is a hard guardrail) | DB + API + tests | **Strong.** RLS per-op policies [migration:134-149](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L134) + `.eq("user_id")` + pgTAP net. | Core but the *best*-guarded rule. Not a refactor target. |
| INV-2 | High (energy is the load-bearing input) | DB + zod + client | **Strong** on remote (`NOT NULL` [migration:91](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L91) + zod [session.ts:4](../../src/lib/schemas/session.ts#L4)). | Solid server-side. |
| INV-3 | **Highest** (seals each data point) | **6+ sites** (see Step 3) | **Inconsistent.** Enforced on remote PATCH [\[id\].ts:54](../../src/pages/api/sessions/[id].ts#L54); **absent on the anonymous path** [localSessions.ts:47](../../src/lib/local/localSessions.ts#L47); **no DB constraint**. | **STRONGEST CANDIDATE.** |
| INV-4 | High | DB generated col | **Strong** on remote (GENERATED [migration:85](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85)); **derived in JS, unguarded** on anon. | Rides on INV-3's transition. |
| INV-5 | High | API + local store | Remote: one `UPDATE` [\[id\].ts:51](../../src/pages/api/sessions/[id].ts#L51). Anon: one `setItems` [localSessions.ts:51](../../src/lib/local/localSessions.ts#L51). | Atomic by construction, unmodeled. |
| INV-6 | Medium-high | DB + zod + local | Strong remote (CHECK [migration:92](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L92) + zod [session.ts:26](../../src/lib/schemas/session.ts#L26)); **no range check on anon** [localSessions.ts:49](../../src/lib/local/localSessions.ts#L49). | Rides on INV-3's write. |
| INV-7 | Medium | API only | PATCH-only [\[id\].ts:45](../../src/pages/api/sessions/[id].ts#L45); absent on PUT (by design) and on anon. | Guard for INV-3. |
| INV-8 | Medium | API only | POST rejects [index.ts:24-30](../../src/pages/api/sessions/index.ts#L24); **no DB CHECK**, relaxed by continue [continue.ts:23](../../src/pages/api/sessions/[id]/continue.ts#L23). | Already covered as #2 in [01](01-domain-distillation.md). |
| INV-9 | Medium | DB + zod | zod enum [session.ts:9](../../src/lib/schemas/session.ts#L9); DB also permits NULL [migration:95](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L95). | Minor drift. |
| INV-10 | Medium | API + client | continue guard [continue.ts:26](../../src/pages/api/sessions/[id]/continue.ts#L26). | Narrow. |

### Selected #1: INV-3 (with INV-4, INV-5, INV-6, INV-7 as its dependents)

**Chosen invariant, stated precisely:**

> **A session's end is a single, write-once, terminal transition that produces a valid data point.**
> A session is created in-progress (`ended_at` = NULL) and transitions to ended (`ended_at` set) **exactly
> once**. That single transition is **atomic** with capturing the focus rating and note; it yields a
> **non-negative actual-elapsed duration** and a rating that is **1..5 or skip**. No path may end a session
> twice, revert an ended session to in-progress, backdate `ended_at` implausibly, or write an out-of-range
> rating.

**Why it is the most core AND most weakly enforced (the intersection the brief asks for):**

- **Most core.** The Session is the atomic unit of the entire product: "PomoSapiens treats every focus session
  as a data point" [prd.md:139](../foundation/prd.md#L139). The north star is literally "log first ... session
  end-to-end" [roadmap.md:24](../foundation/roadmap.md#L24). Every analytic the product promises (the Core
  subdomain in [01](01-domain-distillation.md)) is only as trustworthy as the end-transition that seals each
  point. A double-end, a resurrected session, or a fabricated duration silently corrupts the exact inputs the
  product exists to reason over.

- **Most weakly / inconsistently enforced.** This is the gap [01](01-domain-distillation.md) marked "ENFORCED"
  because it audited only the signed-in path. Widening the lens to **both backends** shows the invariant is:
  1. **Enforced by scattered discipline, not a modeled owner, on the remote path.** The rule survives only
     because four unrelated mechanisms happen to line up: the PATCH `.is("ended_at", null)` filter
     [\[id\].ts:54](../../src/pages/api/sessions/[id].ts#L54), the plausibility window
     [\[id\].ts:45](../../src/pages/api/sessions/[id].ts#L45), the generated `duration_seconds` column
     [migration:85](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85), and zod bounds.
     Lesson L-01 [lessons.md:9](../foundation/lessons.md#L9) exists precisely because this is a *discipline to
     remember at every endpoint*, not a guarantee a single object provides.
  2. **Completely unguarded on the anonymous path.** `endLocalSession`
     [localSessions.ts:47-52](../../src/lib/local/localSessions.ts#L47) overwrites *any* row - already-ended
     included - with no `ended_at IS NULL` check, no plausibility window, and no rating-range check
     [localSessions.ts:49](../../src/lib/local/localSessions.ts#L49). The **only** thing preventing a double-end
     for an anonymous visitor is the client `SessionRunner` phase state - **the UI is the sole guard**
     (see Step 3).
  3. **Not enforced by any DB constraint.** The RLS UPDATE policy checks only `user_id`
     [migration:142-145](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L142); it happily
     lets an already-ended row's `ended_at` be overwritten. The write-once property is an *application filter*,
     revocable by any future code path or a `service_role` call. There is no CHECK that `ended_at >= started_at`.
  4. **Smeared across 6+ sites** (Step 3), with one path (PUT) deliberately opting out and another (local)
     silently opting out.

INV-1 (privacy) is more core in the abstract, but it is the *best*-enforced rule in the system, so it fails the
"weakest-enforced" half of the selection test. INV-3 is the unique invariant that is simultaneously top-tier core
and genuinely violable today. **It is selected.**

---

## Step 3 - Diagnosis: where the rule lives today

The end-transition rule (INV-3 + dependents) is scattered across these sites. "Guard present" means the site
actually enforces write-once / validity; "guard absent" means it relies on something else.

| # | Site | What it does | Guard status |
| --- | --- | --- | --- |
| G-1 | `PATCH /api/sessions/[id]` [\[id\].ts:49-56](../../src/pages/api/sessions/[id].ts#L49) | End a signed-in session: single `UPDATE` of `{ended_at, focus_rating, note}` filtered `.is("ended_at", null)`; 409 if no row. | **Present** (write-once + atomic). Plausibility at [\[id\].ts:45](../../src/pages/api/sessions/[id].ts#L45). |
| G-2 | `POST /api/sessions/[id]/continue` [continue.ts:21-28](../../src/pages/api/sessions/[id]/continue.ts#L21) | Convert running preset -> count_up, filtered `.is("ended_at", null)`. | **Present** (INV-10). |
| G-3 | `PUT /api/sessions/[id]` [\[id\].ts:69-133](../../src/pages/api/sessions/[id].ts#L69) | Edit an already-ended row; recomputes `ended_at` from edited duration. | **Deliberately no write-once/plausibility** [\[id\].ts:1-5](../../src/pages/api/sessions/[id].ts#L1) - edits an ended row on purpose. Re-validates duration >= 1 via zod [session.ts:42](../../src/lib/schemas/session.ts#L42). |
| G-4 | `endLocalSession` (anonymous) [localSessions.ts:47-52](../../src/lib/local/localSessions.ts#L47) | End an anonymous session by mapping over items and overwriting the matching id. | **Absent.** No `ended_at IS NULL` check, no plausibility, no rating range. Overwrites an ended row silently. |
| G-5 | `SessionRunner.submitRating` [SessionRunner.tsx:136-151](../../src/components/session/SessionRunner.tsx#L136) | Client end: bails if `stoppedAtMs === null`, else calls `persistEnd`. | **UI-only.** This `if` is the *sole* guard on the anon path (G-4 adds none). |
| G-6 | `resolveSessionPageAccess` [access.ts:12-18](../../src/lib/session/access.ts#L12) | Redirects `/session/[id]` if row missing or already ended. | Read-side derivation of the same status; not a write guard. |
| G-7 | `dashboard.astro` SELECT [dashboard.astro:23](../../src/pages/dashboard.astro#L23) | Reads `ended_at`; row status ("In progress" vs "Done") derived client-side. | Read-side; must agree with the write rule but does not enforce it. |

**Failure modes this scattering permits today:**

1. **Anonymous double-end / resurrection.** Nothing but React state stops `endLocalSession` from being called
   twice, or on an already-ended row, silently rewriting rating, note, and `ended_at`. A stale second tab firing
   `endSession` re-seals the point with different data. **The client is the only strażnik** (G-4 + G-5).
2. **Out-of-range anonymous rating.** `endLocalSession(id, { focus_rating })` accepts any `number`
   [localSessions.ts:49](../../src/lib/local/localSessions.ts#L49); no `1..5` bound mirrors the server CHECK
   (INV-6 violable for anon).
3. **Silent divergence, not fail-fast.** The remote path *fails loud* on a second end (409, G-1); the anonymous
   path *swallows and proceeds* - it just overwrites. Same domain rule, opposite failure behavior. This is the
   "error is swallowed instead of stopping the operation" anti-pattern the brief targets.
4. **No server-of-record guarantee.** Even on the remote path, write-once is an app filter, not a constraint;
   a future endpoint that forgets `.is("ended_at", null)` (the exact L-01 hazard) re-opens the hole with zero
   test coverage unless someone remembers the discipline.

---

## Step 4 - Guardian aggregate design

**Goal:** make **one** object the single place the end-transition is enforced, so both backends route through
it and neither the client nor a future endpoint can be the sole guard. This is a **refactor** (introduce a
domain seam over existing behavior), not a rewrite: the remote path keeps its DB write, the anon path keeps
localStorage - they just stop each re-deciding the rule.

### 4.1 The aggregate root: `FocusSession` (NEW)

A pure, backend-agnostic domain object in `src/lib/domain/focusSession.ts` (**NEW**). It holds the session's
state and exposes **transition methods with preconditions**. Illegal transitions throw **named domain errors**
(they never silently mutate).

```
// src/lib/domain/focusSession.ts   (NEW - pseudocode, not final)

type SessionStatus = "in_progress" | "ended";

class FocusSession {
  readonly id: string;
  readonly userId: string | null;        // null = anonymous
  readonly startedAtMs: number;
  private endedAtMs: number | null;
  private energy: EnergyLevel;            // INV-2 checked at construction
  private timerMode: Mode;                // INV-9
  private plannedFocusSeconds: number | null;
  private plannedBreakSeconds: number | null;
  private focusRating: number | null;
  private note: string | null;

  get status(): SessionStatus { return this.endedAtMs === null ? "in_progress" : "ended"; }

  // ---- the guarded transition (INV-3 + INV-4 + INV-5 + INV-6 + INV-7) ----
  end({ endedAtMs, focusRating, note, nowMs }): void {
    if (this.status === "ended")            throw new SessionAlreadyEndedError(this.id);   // INV-3
    if (endedAtMs < this.startedAtMs)       throw new NegativeDurationError(this.id);      // INV-4
    if (!isPlausibleEnd(endedAtMs, nowMs))  throw new ImplausibleEndTimeError(this.id);    // INV-7
    if (focusRating !== null && !(focusRating >= 1 && focusRating <= 5 && Number.isInteger(focusRating)))
                                            throw new InvalidFocusRatingError(focusRating); // INV-6
    // atomic in-memory transition; the repository persists the whole object once (INV-5)
    this.endedAtMs = endedAtMs;
    this.focusRating = focusRating;
    this.note = normalizeNote(note);        // "" -> null, trim, 500 cap
  }

  // ---- mid-flight conversion (INV-10) ----
  continueAsCountUp(): void {
    if (this.status === "ended")            throw new SessionAlreadyEndedError(this.id);
    if (this.timerMode === "count_up")      throw new NotAPresetSessionError(this.id);
    this.timerMode = "count_up";
    this.plannedFocusSeconds = null;        // planned_break preserved by design (INV-8 relaxed, arch.md:302)
  }

  // ---- corrective edit of an already-ended row (the PUT path) ----
  edit({ durationSeconds, energy, topicId, materialFormatId, focusRating, note }): void {
    if (this.status !== "ended")            throw new CannotEditRunningSessionError(this.id);
    if (durationSeconds < 1 || durationSeconds > 24*3600) throw new InvalidDurationError(durationSeconds);
    this.endedAtMs = this.startedAtMs + durationSeconds * 1000;   // started_at held fixed
    // ... assign validated fields
  }

  toSnapshot(): FocusSessionSnapshot { /* plain data for the repository */ }
  static fromSnapshot(s: FocusSessionSnapshot): FocusSession { /* rehydrate + re-check INV-2, INV-9 */ }
}
```

**Named domain errors** (**NEW**, `src/lib/domain/errors.ts`): `SessionAlreadyEndedError`,
`NegativeDurationError`, `ImplausibleEndTimeError`, `InvalidFocusRatingError`, `NotAPresetSessionError`,
`CannotEditRunningSessionError`, `InvalidDurationError`. Each carries a stable `code` string for HTTP mapping.
**None log-and-continue** - they abort the operation (fail-fast, per the brief's constraint).

### 4.2 The repository: `SessionRepository` (NEW port over the existing seam)

The project already has a persistence port, `SessionPersistence`
[persistence.ts:19-23](../../src/lib/session/persistence.ts#L19), but it is a **CRUD-shaped** port
(`createSession` / `endSession`), so each caller still hands it a pre-decided write. The refactor **narrows it
to an aggregate-shaped repository**: load the aggregate, let the aggregate decide, save the aggregate.

```
// src/lib/domain/sessionRepository.ts   (NEW)
interface SessionRepository {
  load(id: string): Promise<FocusSession | null>;   // null => not found / not owned
  save(session: FocusSession): Promise<void>;        // persists the whole snapshot
}
```

- **`SupabaseSessionRepository`** (**NEW**, wraps today's remote calls): `load` = the existing owner-scoped
  SELECT ([\[id\].ts:91-97](../../src/pages/api/sessions/[id].ts#L91) generalized); `save` translates the
  aggregate's dirty transition into the **same hand-picked column write** L-01 mandates
  [lessons.md:9](../foundation/lessons.md#L9) - `{ended_at, focus_rating, note}` for an end,
  `{timer_mode, planned_focus_seconds}` for a continue. RLS + `.eq("user_id")` stay exactly as-is.
- **`LocalSessionRepository`** (**NEW**, wraps `localSessions.ts`): `load` reads the item by id; `save` writes
  the snapshot back. Because the *aggregate* already ran `end()`'s preconditions, `endLocalSession`'s silent
  overwrite (G-4) is replaced by a guarded save - **the anonymous path inherits write-once for free**, closing
  the largest hole with no UI change.

**Atomicity (INV-5).** Both `save` implementations persist the end in a **single** operation: the Supabase repo
in one `UPDATE ... WHERE id AND user_id AND ended_at IS NULL` (the DB filter remains as defence-in-depth even
though the aggregate already checked), the local repo in one `setItems`. No partial end state is observable.
The write-once DB filter is kept as suspenders; the aggregate is the belt.

### 4.3 Thin routes / islands (execution moves off the client)

The API route shrinks to **parse -> load -> call method -> save -> map error**:

```
// PATCH /api/sessions/[id]   (AFTER)
const parsed = parseJson(req, endSessionSchema);          // shape only
const session = await repo.load(id);                       // owner-scoped
if (!session) return 404;
try {
  session.end({ ...parsed.data, nowMs: Date.now() });     // ALL invariants here
  await repo.save(session);                                // single write
  return 200;
} catch (e) {
  return mapDomainErrorToResponse(e);                      // SessionAlreadyEndedError -> 409, InvalidFocusRating -> 400, ...
}
```

For the anonymous island, the same `FocusSession.end()` runs client-side against `LocalSessionRepository`, so
the rule is **identical code on both paths**. The `SessionRunner.submitRating` UI guard
[SessionRunner.tsx:137](../../src/components/session/SessionRunner.tsx#L137) stays as a UX affordance, but it is
**no longer the only guard** - a double submit now throws `SessionAlreadyEndedError` from the aggregate instead
of silently overwriting.

---

## Step 5 - Before/after, phased plan, tests

### 5.1 Before / after per site

| Site | Before | After |
| --- | --- | --- |
| G-1 PATCH | Route inlines write-once filter + plausibility + column pick. | Route calls `session.end(...)`; DB `.is("ended_at", null)` kept as defence-in-depth. |
| G-2 continue | Route inlines the count_up conversion. | Route calls `session.continueAsCountUp()`; same DB guard retained. |
| G-3 PUT | Route inlines "must be ended" + duration recompute. | Route calls `session.edit(...)`; same DB scoping retained. |
| G-4 `endLocalSession` | **Unguarded overwrite** of any row. | Replaced by `LocalSessionRepository.save` after `session.end(...)` - **write-once + rating range now enforced for anon**. |
| G-5 `submitRating` | `if (stoppedAtMs === null) return;` is the sole anon guard. | Same UI check, but the aggregate is now authoritative; double-end throws instead of overwriting. |
| G-6 `access.ts` | Derives status independently. | Unchanged (read-side); optionally reuse `FocusSession.status`. |
| G-7 dashboard SELECT | Derives status independently. | Unchanged (read-side). |

### 5.2 Phased refactor plan

The project has a test-first discipline (Vitest unit + `tests/integration/api` + pgTAP + Playwright,
[arch.md:586](../foundation/arch.md#L586)); phases that add a domain rule go **test-first**.

1. **Phase 1 - `FocusSession` + errors (test-first).** Write unit tests for every transition (Step 5.3) against
   the not-yet-existing aggregate, then implement `focusSession.ts` + `errors.ts` until green. No production
   wiring yet. **Verify:** `npm run test` (unit) green; `astro check` (per L-08 [lessons.md:84](../foundation/lessons.md#L84)) clean.
2. **Phase 2 - `SessionRepository` + two adapters.** Implement `SupabaseSessionRepository` and
   `LocalSessionRepository`. **Verify:** existing `tests/integration/api` for PATCH/PUT/continue still green with
   the route unchanged internally but delegating; pgTAP RLS suite unchanged.
3. **Phase 3 - Rewire the three routes** (PATCH, PUT, continue) to parse -> load -> method -> save, add
   `mapDomainErrorToResponse`. **Verify:** integration tests assert 409 on double-end, 400 on bad rating - same
   HTTP contract as today (no client change).
4. **Phase 4 - Rewire the anonymous island** to end via `FocusSession` + `LocalSessionRepository`; delete the
   unguarded `endLocalSession` overwrite. **Verify:** new anon unit test for double-end (Step 5.3 T-7) green;
   Playwright anon fixture still passes the capture loop.
5. **Phase 5 (optional hardening, DB) - add the constraint the invariant deserves.** A trigger or partial
   guarantee that `ended_at` cannot be rewritten once set on the server-of-record, and a CHECK
   `ended_at IS NULL OR ended_at >= started_at`. **Verify:** pgTAP asserts a second `UPDATE` of `ended_at` is
   rejected at the DB layer (closes failure mode 4). Keep the L-06 delete policy intact
   [lessons.md:62](../foundation/lessons.md#L62).

Phases 1-4 are behavior-preserving on the remote path (same HTTP contract) and behavior-*fixing* on the anon
path (double-end now fails fast). Phase 5 is the only schema change and can ship independently.

### 5.3 Test cases for the invariant (legal + illegal transitions)

Unit (aggregate) - the load-bearing set:

- **T-1 (legal):** in-progress `end(valid)` -> status `ended`, duration = `ended - started`.
- **T-2 (illegal, INV-3):** `end()` on an already-ended session -> throws `SessionAlreadyEndedError`.
- **T-3 (illegal, INV-4):** `end(endedAtMs < startedAtMs)` -> throws `NegativeDurationError`.
- **T-4 (illegal, INV-7):** `end(endedAtMs)` far in past/future -> throws `ImplausibleEndTimeError`.
- **T-5 (illegal, INV-6):** `end(focusRating = 0 | 6 | 2.5)` -> throws `InvalidFocusRatingError`; `null` (skip) is legal.
- **T-6 (legal, INV-10):** `continueAsCountUp()` on running preset -> mode `count_up`, `plannedFocus` null, `plannedBreak` preserved.
- **T-7 (illegal, INV-10):** `continueAsCountUp()` on an ended session -> `SessionAlreadyEndedError`; on a count_up session -> `NotAPresetSessionError`.
- **T-8 (illegal, edit):** `edit()` on a running session -> `CannotEditRunningSessionError`; `edit(duration<1)` -> `InvalidDurationError`.

Integration (API, both must keep today's contract):

- **T-9:** double `PATCH` -> second returns **409** (unchanged from G-1).
- **T-10:** `PATCH` with `focus_rating = 7` -> **400**.

Anonymous (unit, the newly-closed hole):

- **T-11:** calling the anon end twice on one local row -> second throws `SessionAlreadyEndedError`, the stored
  row is **not** rewritten (today it silently is, G-4).

### 5.4 Load-bearing names to register

This project uses [lessons.md](../foundation/lessons.md) as its append-only contract register. On landing this
refactor, add an entry (proposed **L-09**) pinning:

- `FocusSession` is the **single** owner of the session end-transition; routes and islands must go
  **load -> method -> save**, never re-implement write-once/plausibility/rating checks inline.
- `SessionRepository` (`load` / `save`) supersedes ad-hoc `endSession` writes; both the Supabase and Local
  adapters must route ends through `FocusSession.end()`.
- The DB `.is("ended_at", null)` filter and (Phase 5) the CHECK/trigger are **defence-in-depth**, not the
  primary guard - do not remove them, but do not rely on them as the only guard either (the L-01 hazard).
- Named errors (`SessionAlreadyEndedError`, ...) map to HTTP in one place (`mapDomainErrorToResponse`); adding a
  transition means adding an error + a mapping, not a new inline `if` in a route.

---

## Summary

PomoSapiens' domain rules must hold across two persistence backends - the signed-in Postgres path and the
anonymous localStorage path - and the one invariant that is simultaneously most core to the product and most
weakly enforced is the **session end-transition**: a session must end exactly once, atomically with its rating
and note, yielding a non-negative actual-elapsed duration and a 1..5-or-skip rating. On the signed-in path this
rule survives only as scattered discipline (a PATCH `.is("ended_at", null)` filter, a plausibility window, a
generated column, and zod bounds - the very discipline lesson L-01 exists to remember), while on the anonymous
path it is enforced by **nothing but the React UI**: `endLocalSession` overwrites any row, ended or not, with no
write-once, plausibility, or rating check, so the client is the sole guard and a double-end silently corrupts a
data point instead of failing fast. The prior distillation marked these invariants "ENFORCED" because it audited
only the server path; widening to both backends reveals the gap. The fix is a refactor, not a rewrite: introduce
a pure `FocusSession` aggregate whose `end()` / `continueAsCountUp()` / `edit()` methods carry the preconditions
and throw named domain errors, and a `SessionRepository` port (Supabase + Local adapters) so both backends load,
transition, and save through the same guard - shrinking every route to parse -> load -> method -> save -> map
error and moving enforcement off the client. The plan is phased test-first (aggregate, repository, route rewire,
anonymous rewire, optional DB constraint), keeps the existing HTTP contract and RLS defence-in-depth intact, and
registers the new load-bearing names (`FocusSession`, `SessionRepository`, the domain errors) in the project's
lessons register as proposed L-09.
