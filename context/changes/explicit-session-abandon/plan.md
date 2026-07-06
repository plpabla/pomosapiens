# Explicit Session Abandon Implementation Plan

## Overview

Add a dashboard-level "Abandon" control (roadmap slice S-05) that lets a user permanently remove an in-progress session (one with `ended_at IS NULL`) from their history. This is the first user-facing use of a DELETE capability on `sessions`, which currently has no DELETE RLS policy at all (`20260601120000_drop_sessions_delete_policy.sql` — sessions were made immutable once written). Per user decision, the new DELETE policy is **fully open** (owner can delete any of their own sessions, ended or not), not scoped to in-progress rows only. This substantially delivers the "delete a session" half of roadmap item S-07 (`edit-delete-sessions`, currently proposed) ahead of schedule; S-07's remaining scope narrows to editing a logged session's fields.

## Current State Analysis

- **The roadmap's stated S-05 outcome is already half-shipped.** Its description ("any session without `ended_at` is shown as In progress regardless of age... `/session/[id]` no longer redirects based on a fixed age threshold... deep-work sessions >50min fully supported") was already delivered in S-03 Phase 8 (see roadmap.md:121, lessons.md L-05). Verified directly: [access.ts](src/lib/session/access.ts) has no age check — it only redirects on missing row or already-ended row; [dashboard.astro:69-71](src/pages/dashboard.astro#L69) already labels any row with `ended_at === null` as "In progress" regardless of age. `arch.md`'s "Stale-tab guard" note (line 393) describing a `2 * focusPresetSeconds` redirect is **stale documentation** — that code path no longer exists.
- The actual remaining gap is narrow: **no UI or endpoint exists to remove an in-progress session.** `dashboard.astro` is currently a pure Astro SSR page with zero client-side interactivity — no fetch calls, no hydrated islands on the list itself (only the separate `FocusRatingChart` island).
- `sessions` has no DELETE RLS policy for any role (`20260601120000_drop_sessions_delete_policy.sql:6` — `DROP POLICY IF EXISTS sessions_delete_own`). `supabase/tests/rls_sessions.sql` pins this as intentional: test 5 asserts "User A cannot delete their own session (immutability)" (lines 56-64), and test 4 asserts cross-user delete denial (lines 47-54, unaffected by this change).
- `PATCH /api/sessions/[id]` ([id].ts:13-59) is the only existing mutation route on this resource; it has no DELETE handler. Its `.is("ended_at", null)` one-shot-write guard and 409 information-hiding pattern (same response body for cross-user and already-ended) is the pattern to mirror for the new DELETE handler's own information-hiding contract.
- `src/components/ui/button.tsx` already has a `destructive` variant (`bg-destructive text-white ...`) — no new UI primitive needed for a "confirm deletion" affordance.
- Existing test conventions to follow: `tests/integration/api/sessions.end.test.ts` (SELF.fetch + `setupTwoUsers`/`readSession` fixtures, cross-user information-hiding assertions), `tests/unit/dashboard/FocusRatingChart.test.tsx` (React Testing Library for a dashboard component), `supabase/tests/rls_sessions.sql` (pgTAP, `BEGIN...ROLLBACK`, `plan(N)`).

## Desired End State

A user viewing the dashboard sees an "Abandon" button on any history row still in progress (`ended_at IS NULL`), regardless of how long ago it started. Clicking it requires a second confirming click (no native browser dialog); confirming sends a `DELETE` to `/api/sessions/:id`, which removes the row entirely (owner-only, any status) and returns 200. The page reloads and the row is gone from history. Sessions belonging to another user, or already deleted, cannot be deleted (404, same response shape either way). The `arch.md`/`lessons.md` docs and `roadmap.md`'s S-07 entry are updated to reflect the new capability and its overlap with S-07.

**Verification:** `npm run lint`, `npm test`, `npm run db:test`, and `npm run build` all pass; manual verification in the browser confirms the abandon flow end-to-end, including the confirm step and cross-tab-safe behavior.

### Key Discoveries:

- The age-based access guard S-05 was originally scoped to remove is already gone (S-03 Phase 8) — this plan does **not** touch `access.ts` or `session/[id].astro`.
- No schema/column change is needed — `sessions` already has every column required; this is purely an RLS policy + one endpoint + one UI island.
- Reinstating `sessions_delete_own` (identical shape to the original policy dropped in `20260601120000`) is the correct migration — same policy name, same `(SELECT auth.uid())` predicate form used by every other table's per-op policy in `20260531182506_sessions_data_foundation.sql:147-149`.

## What We're NOT Doing

- No changes to `/session/[id].astro` or `access.ts` — the abandon control is dashboard-only, per the roadmap slice title.
- No new schema columns — reuses the existing `sessions` table as-is.
- No distinction in the database or UI between "abandoned" and any other reason a session might be deleted — a deleted row is simply gone, matching the "fully open" DELETE decision.
- No scoping of DELETE to `ended_at IS NULL` — completed/rated sessions are deletable too, by design (this is the deliberate S-07 overlap).
- No editing of a session's fields (duration, energy, topic, rating, note) — that remains S-07's scope.
- No age-based gating of the Abandon button — matches lesson L-05's explicit rejection of age heuristics for this exact scenario.

## Implementation Approach

Bottom-up: reinstate the DB-layer capability first (RLS + pgTAP, since this is the highest-risk layer to get wrong per the privacy NFR), then the API endpoint that depends on it, then the UI that calls the endpoint, then sync the documentation that described the old (now-reversed) invariant, then hand off browser-level verification to `/10x-e2e`.

## Critical Implementation Details

**pgTAP test ordering.** `rls_sessions.sql`'s existing test 5 currently deletes (attempts to delete) the same fixture row (`aaaaaaaa-...-000000000001`) that the later "as anon" block (tests 7-10) also targets. Once test 5's assertion flips to "delete succeeds," that row must not be consumed by test 5, or the later anon-denial assertions against it (tests 9-10) would trivially pass because the row no longer exists, not because RLS denies anon — silently weakening the test's meaning. The fix is to `INSERT` a **third**, throwaway row scoped to User A specifically for test 5's positive-delete assertion, leaving the original fixture row (`aaaaaaaa-...`) intact for the anon-block tests that follow.

## Phase 1: Database — reinstate DELETE RLS policy + pgTAP updates

### Overview

Re-add the DELETE policy on `sessions` (fully open, owner-scoped) and update the pgTAP suite to assert the new behavior without weakening the unrelated anon/cross-user assertions later in the same file.

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/20260706120000_add_sessions_delete_policy.sql` (new)

**Intent**: Reinstate owner-scoped DELETE on `sessions`, reversing `20260601120000_drop_sessions_delete_policy.sql` now that an explicit, user-initiated delete flow exists (S-05). Comment the file to explain the reversal and point at this change for context, mirroring the explanatory-comment convention the drop migration itself used.

**Contract**: Re-create `sessions_delete_own` exactly as it was defined in `20260531182506_sessions_data_foundation.sql:147-149` — `FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()))`. No scoping by `ended_at` (fully open per decision).

#### 2. pgTAP test updates

**File**: `supabase/tests/rls_sessions.sql`

**Intent**: Flip test 5 from "immutability" to "owner can delete," per Critical Implementation Details above; leave every other test (including test 4's cross-user delete denial) unchanged since cross-user denial still holds.

**Contract**: In test 5 (lines 56-64), insert a new row `('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', now(), 'medium')` immediately before the assertion, then change the `DELETE ... WHERE id = 'aaaaaaaa-...'` target to the new row's id, and change the expected count from `0` to `1` with an updated label (e.g. `'user A can delete their own session (explicit abandon)'`). Update the comment above it (currently references the dropped policy) to reflect the reinstated policy. `plan(10)` stays unchanged — no new assertions are added, one is modified.

### Success Criteria:

#### Automated Verification:

- pgTAP RLS tests pass: `npm run db:test`
- Migration applies cleanly on a fresh local DB: `npm run db:reset`

#### Manual Verification:

- None required for this phase — no UI change yet.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: API — DELETE endpoint + integration tests

### Overview

Add a `DELETE` handler to the existing per-session API route, following the same auth/ownership/information-hiding pattern already established by its `PATCH` handler.

### Changes Required:

#### 1. DELETE handler

**File**: `src/pages/api/sessions/[id].ts`

**Intent**: Delete the caller's own session row by id, any status. Mirror the existing `PATCH` handler's structure (auth check, client check, id check) and its cross-user information-hiding contract (same 404 body whether the id belongs to another user or doesn't exist/was already deleted).

**Contract**: `export const DELETE: APIRoute = async (context) => { ... }`. Same `401`/`500`/`400` guards as `PATCH`. Query: `.from("sessions").delete().eq("id", id).eq("user_id", context.locals.user.id).select("id").maybeSingle()`. If `error`, `500`. If `!data`, `404` with `{ error: "Session not found" }` (same body regardless of cause, matching the `PATCH` handler's existing information-hiding precedent at line 55). If `data`, `200 { ok: true }`. Update the file's header comment (lines 1-2) to note the new DELETE capability alongside the existing PATCH description.

#### 2. Integration tests

**File**: `tests/integration/api/sessions.delete.test.ts` (new)

**Intent**: Cover ownership enforcement, the information-hiding contract, and that deletion works regardless of session status (in-progress or already-ended) — the last point is the explicit regression gate for the "fully open" decision, since a future reader might assume the old `ended_at IS NULL` immutability rule still applies.

**Contract**: Mirror `sessions.end.test.ts`'s `describe`/fixture setup (`setupTwoUsers`, a local `createSession` helper). Cases: (a) owner deletes their own in-progress session → `200`, row no longer readable; (b) owner deletes their own already-ended session → `200` (explicit fully-open regression gate); (c) user B attempts to delete user A's session → `404`, row untouched; (d) deleting a nonexistent id → `404`, byte-identical body to case (c) (information-hiding contract, mirroring the existing PATCH test at `sessions.end.test.ts:251-304`); (e) unauthenticated request → `401`. Case (a)/(b) need a way to assert the row is gone without `readSession`'s `.single()` throwing on a missing row — add a `sessionExists(id): Promise<boolean>` helper to `tests/_fixtures/db.ts` using `.maybeSingle()` for this purpose.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Integration tests pass: `npm test -- tests/integration/api/sessions.delete.test.ts`
- Full test suite passes: `npm test`

#### Manual Verification:

- None required for this phase — no UI change yet.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: UI — Abandon button + dashboard wiring

### Overview

Add a small, per-row React island that renders the Abandon control only for in-progress sessions, with an inline two-step confirm before calling the new DELETE endpoint.

### Changes Required:

#### 1. AbandonButton component

**File**: `src/components/dashboard/AbandonButton.tsx` (new)

**Intent**: A minimal client island with three states — idle ("Abandon"), confirming ("Confirm?" + "Cancel"), submitting (disabled, DELETE in flight). On success, reload the page (matching `SessionRunner`'s existing `window.location.assign`/reload-driven state-transition pattern rather than introducing client-side list mutation). On failure, show an inline error via the existing `ServerError` component and return to idle so the user can retry.

**Contract**: Props: `{ sessionId: string }`. Idle state renders `<Button variant="outline" size="sm">Abandon</Button>`. Confirming/submitting state renders a `destructive` "Confirm?" button (disabled + relabeled "Abandoning..." while submitting) plus a `ghost` "Cancel" button that returns to idle, plus `<ServerError message={error} />`. Confirm click calls `fetch(\`/api/sessions/${sessionId}\`, { method: "DELETE" })`; on `!res.ok`, parse `{ error }` from the body (same fallback pattern as `SessionRunner.handleRate`) and surface it; on success, `window.location.reload()`.

#### 2. Dashboard wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Render `AbandonButton` for rows where `status === "in_progress"` only, regardless of the row's age (no age gating, per decision).

**Contract**: Import `AbandonButton` from `@/components/dashboard/AbandonButton`. Inside the per-session `<Card>` (after the existing status line, `:135-140`), add `{status === "in_progress" && (<div class="flex justify-end"><AbandonButton sessionId={session.id} client:load /></div>)}`. `session.id` is already selected by the existing query (`:39`) and present on `SessionListItem` via the `Pick<...>` (`:13-16`) — no query or type change needed.

#### 3. Component unit tests

**File**: `tests/unit/dashboard/AbandonButton.test.tsx` (new)

**Intent**: Cover the three-state flow and both fetch outcomes, following `FocusRatingChart.test.tsx`'s React Testing Library conventions.

**Contract**: Mock `global.fetch`. Cases: renders "Abandon" initially; clicking it shows "Confirm?" and "Cancel"; clicking "Cancel" returns to "Abandon"; clicking "Confirm?" calls `fetch` with `method: "DELETE"` and the correct URL; on a mocked failed response, shows the error message from the body and returns to the idle "Abandon" state (not left stuck on "Confirm?"); on a mocked successful response, `window.location.reload` is called (mock `window.location.reload` per jsdom convention used elsewhere in the test suite, or assert via a spy).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass: `npm test -- tests/unit/dashboard`
- Full test suite passes: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- On the dashboard, an in-progress session (start one and navigate back to `/dashboard` without finishing it) shows an "Abandon" button; a completed session does not.
- Clicking "Abandon" shows "Confirm?"/"Cancel" without firing the delete yet; clicking "Cancel" reverts to "Abandon" with no network call.
- Clicking "Confirm?" removes the session from history after reload.
- An in-progress session started seconds ago also shows "Abandon" immediately (no age gating).
- A deep-work / count-up session left running well past 50 minutes still shows correctly as "In progress" with a working Abandon button (regression check that S-03's fix still holds).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 4.

---

## Phase 4: Documentation sync

### Overview

Correct the stale architecture note this change makes obsolete, record the reversed-immutability decision as a lesson, and flag the S-07 scope overlap in the roadmap so a future S-07 implementer doesn't duplicate the delete work.

### Changes Required:

#### 1. Architecture snapshot

**File**: `context/foundation/arch.md`

**Intent**: Replace the now-inaccurate "Stale-tab guard" bullet (line 393, describes a redirect that no longer exists post-S-03) with a description of the actual explicit-abandon flow this change adds; update the RLS posture note (line 187, "sessions are immutable history once written") to reflect the reinstated, fully-open DELETE policy.

**Contract**: Section 5 invariants list and Section 3 RLS posture bullet, both text-only edits — no diagram changes required.

#### 2. Lessons register

**File**: `context/foundation/lessons.md`

**Intent**: Record why the immutability decision (originally driven by a documented business rule, enforced via `20260601120000_drop_sessions_delete_policy.sql` and pinned by a pgTAP test) was deliberately reversed, so a future contributor doesn't "fix" this DELETE policy back to denial without realizing it was intentional this time.

**Contract**: Append `L-06` following the existing lesson format (numbered, **Source:** line citing this change's `change.md`/`plan.md`), stating: sessions immutability was narrowed from "no delete, ever" to "owner can delete any of their own sessions" to support S-05's explicit abandon flow, and that this was a deliberate, user-confirmed decision that also substantially delivers S-07's delete scope.

#### 3. Roadmap sync

**File**: `context/foundation/roadmap.md`

**Intent**: Flag the S-07 (`edit-delete-sessions`, line 164-178) scope reduction so its future implementer knows the delete endpoint/RLS already exists.

**Contract**: Add a note to S-07's "Risk" bullet (line 177) stating that the DELETE endpoint and RLS policy now exist (from S-05) and that S-07's remaining scope is editing a session's fields only, not deleting one.

### Success Criteria:

#### Automated Verification:

- Prettier formatting passes on changed markdown: `npx prettier --check context/foundation/arch.md context/foundation/lessons.md context/foundation/roadmap.md`

#### Manual Verification:

- A reader of `arch.md` section 5 no longer sees a reference to a redirect guard that doesn't exist in the code.
- A reader of `roadmap.md`'s S-07 entry understands the delete half of its scope is already done.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 5.

---

## Phase 5: E2E verification

### Overview

Hand off to `/10x-e2e` to drive the new browser-level abandon flow and confirm no regression to the existing session-access/session-capture specs.

### Changes Required:

#### 1. E2E coverage

**File**: `tests/e2e/` (new spec(s), authored by `/10x-e2e`)

**Intent**: Per `CLAUDE.md`, E2E test generation for this plan goes through the `/10x-e2e` skill, not hand-written here.

**Contract**: Risks to cover: (1) starting a session, navigating back to the dashboard without finishing it, and abandoning it via the two-step confirm removes it from history; (2) a completed/rated session has no Abandon control; (3) `tests/e2e/session-access.spec.ts` and `tests/e2e/session-capture.spec.ts` still pass unmodified.

### Success Criteria:

#### Automated Verification:

- Existing E2E suite passes unmodified: `npm run test:e2e -- session-access.spec.ts session-capture.spec.ts`
- New E2E spec(s) generated by `/10x-e2e` pass: `npm run test:e2e`

#### Manual Verification:

- Review the `/10x-e2e`-generated spec(s) against the five anti-patterns (per the skill) before merging.

**Implementation Note**: This phase is driven by `/10x-e2e`, not `/10x-implement` — invoke it directly once Phases 1-4 are merged.

---

## Phase 6: Production deploy

### Overview

Apply the Phase 1 migration (`sessions_delete_own`) to the production Supabase project, and only then deploy the app code (Phases 2-3) that depends on it. This is operator work executed locally against prod, not CI. Unlike a column-adding migration, this one is RLS-only and does not change `database.types.ts`, so it is **not** gated by the `.github/workflows/smoke.yml` types-diff step. The real ordering risk is different: nothing auto-deploys the app on merge (`npx wrangler deploy` is manual per `CLAUDE.md`), but if the Phase 2/3 code is deployed to prod before this migration is pushed, the live `DELETE /api/sessions/[id]` endpoint would silently 404 for every caller (RLS blocks the delete with 0 rows affected; the endpoint reads that as not-found, not as a permissions error).

### Prerequisites

- Operator has `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` available locally (same values as the GitHub Actions secrets, per the [testing-schema-validation-gate runbook](../../archive/2026-06-24-testing-schema-validation-gate/runbook.md) sections 1-2).
- Operator is logged into the Supabase CLI (`npx supabase login`, or `SUPABASE_ACCESS_TOKEN` exported).
- Phases 1-4 are merged to `main`.

### Changes Required:

#### 1. Link the local CLI to the prod project (one-time per machine)

**Command**: `npx supabase link --project-ref <prod-ref>`

**Intent**: Tell the local CLI which remote project subsequent `db push` commands target. Idempotent — safe to re-run; skip if a prior change already linked this machine.

#### 2. Push the migration to prod

**Command**: `npx supabase db push`

**Intent**: Apply `supabase/migrations/20260706120000_add_sessions_delete_policy.sql` to the production database. Additive (a single `CREATE POLICY`), so zero-downtime and safe to run while the existing app is live.

**Contract**: The CLI prints the pending migration filename and asks for confirmation. Confirm. Operator-only step; no file changes in the repo.

#### 3. Reconcile committed types (verification only)

**Command**: `npm run db:types:prod`

**Intent**: Confirm the RLS-only migration produced no schema/type drift, per the README's guidance to run this "only when finalizing a PR."

**Contract**: Expect **zero diff** — this migration touches only a policy, not a column or table. If a diff appears, it is unrelated drift (e.g. CLI version mismatch) and must be investigated before deploying the app, not committed blindly.

#### 4. Deploy the app

**Command**: `npx wrangler deploy`

**Intent**: Ship the Phase 2/3 code (DELETE endpoint + Abandon button) now that prod has the RLS policy it depends on.

**Contract**: Must run strictly after step 2 confirms the migration is live on prod — this is the load-bearing ordering constraint for this phase.

### Success Criteria:

#### Automated Verification:

- `npm run db:types:prod` produces no diff against the committed `src/db/database.types.ts`

#### Manual Verification:

- In Supabase Studio for the **production** project, confirm the `sessions_delete_own` DELETE policy exists on `public.sessions`.
- After deploy, on the live site, start a session, abandon it, and confirm it disappears from `/dashboard` (real end-to-end prod smoke of the new flow).

**Implementation Note**: Steps 6.1-6.3 happen BEFORE step 6.4 (`wrangler deploy`). Do not deploy the app first — see the ordering risk in the Overview.

---

## Testing Strategy

### Unit Tests:

- `AbandonButton` three-state flow (idle → confirming → submitting), both fetch outcomes — `tests/unit/dashboard/AbandonButton.test.tsx`.

### Integration Tests:

- `DELETE /api/sessions/[id]` ownership enforcement, information-hiding contract, and status-agnostic deletion (in-progress and already-ended both succeed) — `tests/integration/api/sessions.delete.test.ts`.

### Manual Testing Steps:

1. Start a session, navigate to `/dashboard` without finishing it, confirm "Abandon" appears and works end-to-end (two clicks, row disappears after reload).
2. Confirm a completed session shows no Abandon control.
3. Confirm "Cancel" after clicking "Abandon" makes no network call and reverts the button.
4. Confirm a session abandoned by user B's account is unaffected when viewed/attempted by user A (via API, not exposed in UI cross-user).
5. Confirm a count-up/deep-work session running past 50 minutes still shows "In progress" with a working Abandon button (S-03 regression check).

## Migration Notes

One new migration (`20260706120000_add_sessions_delete_policy.sql`) reversing part of `20260601120000_drop_sessions_delete_policy.sql`. No data migration needed — this only changes RLS, not schema or existing rows. `npm run db:reset` re-applies all migrations in order and is the verification step for Phase 1.

Prod deploy is Phase 6: `npx supabase db push` to prod, BEFORE running `npx wrangler deploy` for the Phase 2/3 app code. Unlike a column-adding migration, this one won't turn the smoke workflow's types-diff step red if forgotten — but forgetting it means the live DELETE endpoint 404s for everyone until the migration is pushed.

## References

- Related roadmap slice: `context/foundation/roadmap.md:137-148` (S-05), `:164-178` (S-07 overlap)
- Lesson L-05 (age-based guards): `context/foundation/lessons.md:52-58`
- Original DELETE policy definition: `supabase/migrations/20260531182506_sessions_data_foundation.sql:147-149`
- Policy drop being partially reversed: `supabase/migrations/20260601120000_drop_sessions_delete_policy.sql`
- PATCH handler pattern to mirror: `src/pages/api/sessions/[id].ts`
- Information-hiding precedent: `tests/integration/api/sessions.end.test.ts:251-304`
- Access guard (untouched by this change): `src/lib/session/access.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database — reinstate DELETE RLS policy + pgTAP updates

#### Automated

- [x] 1.1 pgTAP RLS tests pass: `npm run db:test` — 0781191
- [x] 1.2 Migration applies cleanly on a fresh local DB: `npm run db:reset` — 0781191

### Phase 2: API — DELETE endpoint + integration tests

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 0129feb
- [x] 2.2 Integration tests pass: `npm test -- tests/integration/api/sessions.delete.test.ts` — 0129feb
- [x] 2.3 Full test suite passes: `npm test` — 0129feb

### Phase 3: UI — Abandon button + dashboard wiring

#### Automated

- [x] 3.1 Lint passes: `npm run lint`
- [x] 3.2 Unit tests pass: `npm test -- tests/unit/dashboard`
- [x] 3.3 Full test suite passes: `npm test`
- [x] 3.4 Build succeeds: `npm run build`

#### Manual

- [ ] 3.5 In-progress session shows Abandon; completed session does not
- [ ] 3.6 Confirm/Cancel two-step flow works with no premature network call
- [ ] 3.7 Confirming removes the session from history after reload
- [ ] 3.8 No age gating — freshly started session shows Abandon immediately
- [ ] 3.9 Deep-work/count-up session past 50 min still shows correctly (S-03 regression check)

### Phase 4: Documentation sync

#### Automated

- [ ] 4.1 Prettier check passes: `npx prettier --check context/foundation/arch.md context/foundation/lessons.md context/foundation/roadmap.md`

#### Manual

- [ ] 4.2 arch.md no longer references the removed stale-tab redirect guard
- [ ] 4.3 roadmap.md S-07 entry reflects the delete-scope overlap

### Phase 5: E2E verification

#### Automated

- [ ] 5.1 Existing E2E suite passes unmodified: `npm run test:e2e -- session-access.spec.ts session-capture.spec.ts`
- [ ] 5.2 New `/10x-e2e`-generated spec(s) pass: `npm run test:e2e`

#### Manual

- [ ] 5.3 Generated spec(s) reviewed against the five anti-patterns

### Phase 6: Production deploy

#### Automated

- [ ] 6.1 `npm run db:types:prod` produces no diff against committed `database.types.ts`

#### Manual

- [ ] 6.2 `sessions_delete_own` DELETE policy confirmed in prod Supabase Studio
- [ ] 6.3 Migration pushed to prod (`npx supabase db push`) BEFORE `npx wrangler deploy`
- [ ] 6.4 Live prod smoke: abandon a real session on the deployed site, confirm it disappears from `/dashboard`
