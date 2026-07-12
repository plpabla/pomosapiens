# Frame Brief: Anonymous session capture backed by localStorage

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Roadmap slice S-08 (`context/foundation/roadmap.md:183-197`) is queued `not started`.
It exists because the PRD flagged "no non-logged-in user scenario with
localStorage" as *"Add as follow up"* rather than a permanent non-goal
(`prd.md:162`), and was promoted from parked topic to slice on 2026-07-11
(`roadmap.md:212`). The slice as written already lists 4 unresolved unknowns
and names its own top risk: a second persistence path that can silently
diverge from the Supabase-backed one (`roadmap.md:192-196`).

## Initial Framing (preserved)

- **User's stated cause or approach** (as written in the roadmap slice):
  Treat this as one slice — reuse S-01's capture loop (energy → timer →
  rating → note) for an unauthenticated visitor on `/`, write the result to
  `localStorage` instead of Supabase, show it in a local history view
  "mirroring the signed-in dashboard." No server-side row created. Scope of
  "local data" implied by the outcome text: sessions only.
- **User's proposed direction**: Scaffold `anonymous-sessions` as a change and
  take it to `/10x-plan`.
- **Pre-dispatch narrowing** (from interview): The leading concern is *how to
  provide access to currently-protected pages for anon vs. logged-in users*.
  The user also broadened local-data scope beyond "sessions" to include
  **topics, formats, and presets** — "all data can be stored locally." They
  additionally want a synchronization path (local → Supabase merge on login)
  *assessed for effort*, explicitly open to deferring it as its own slice if
  it's a big change. And, when asked directly, the user confirmed this may
  need **splitting into multiple slices** rather than shipping as one.

## Dimension Map

1. **Auth-gating / routing mechanism** — `src/middleware.ts:4` blanket-matches
   `/session/` in `PROTECTED_ROUTES`, redirecting anonymous visitors before
   the capture UI ever renders. Any anon-capture flow needs a route that
   isn't blanket-protected. ← user's stated leading concern
2. **Local-data scope (which tables get a local mirror)** — original outcome
   text only mentions "sessions"; user's answer expands this to
   sessions + topics + material_formats + user_presets, i.e. all 4 app
   tables, not 1.
3. **Sync-on-login / migrate-on-signup** — a local visitor later signs up or
   signs in; local data needs to reconcile with their new Supabase rows (or
   not). Flagged by both the roadmap's own Unknown #1 and the user's request
   to assess effort separately.
4. **Persistence-swap seam inside the existing capture loop** — where in the
   S-01 code a second (local) write path would plug in without duplicating
   the timer/energy/rating logic.
5. **Mirrored history view** — whether the anonymous history view can reuse
   the signed-in dashboard's rendering path or needs its own (SSR vs.
   client-only data source).

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **1. Auth-gating is a real, non-trivial architectural change, not a toggle** | `src/middleware.ts:4,29-33` — `PROTECTED_ROUTES` includes `"/session/"`, matched via `.startsWith`, covering both `/session/new` and `/session/[id]`. DB-level RLS independently denies `anon` on every table: `sessions`, `topics`, `material_formats` policies are all scoped `TO authenticated` with zero `anon` policies (`supabase/migrations/20260531182506_...sql:130-191`); `user_presets` RLS is likewise `authenticated`-only even though it has stray `GRANT ... TO anon` table grants that RLS still blocks (`20260630000000_...sql:30-54`). `context/foundation/arch.md:189`: *"anon role: no policies => fully denied."* This is two independent gates (middleware + RLS) that both assume "protected == authenticated," confirmed also by `shape-notes.md:46`: *"no anonymous / local-only path in v1"* was a deliberate v1 shaping decision. | **STRONG** |
| **2. Local-data scope is genuinely 4 tables, not 1, and each has real constraints a naive localStorage clone would miss** | `material_formats` and `topics` both carry `UNIQUE (owner_id, name)` plus a partial unique index for the `owner_id IS NULL` default rows (`20260531182506_...sql:36-43,62-67`) — meaning even the *default* material formats ("Video", "Reading", etc., seeded at `20260531182506_...sql:115-120`) exist only as server rows; a local-only visitor has no such seed unless the app ships a hardcoded local equivalent. `user_presets` has a `UNIQUE(user_id, slot)` constraint (`20260630000000_...sql:9-18`). None of this is mentioned in the roadmap slice's outcome text, which only names "sessions." | **STRONG** |
| **3. Sync-on-login is materially harder than "loop and POST" and merits separate effort-assessment / its own slice** | The unique constraints above mean a merge can't blindly re-create topics/formats — it must upsert-by-name to avoid `UNIQUE(owner_id, name)` violations, and map a local session's format reference to the *existing* seeded default row (`owner_id IS NULL`) rather than creating a duplicate. Sessions have no natural dedupe key, so a merge triggered twice (e.g., re-login, multi-tab) risks duplicate inserts unless the client marks synced sessions and clears them. This is real design surface (upsert strategy + idempotency), not a loop. | **STRONG** |
| **4. The existing capture loop has one clean seam and one seam that needs refactoring for dual persistence** | `FocusRating` already takes `onSubmit(rating, note) => Promise<void>` as a prop and knows nothing about HTTP (`FocusRating.tsx:10`) — a ready seam. But `SessionRunner.submitRating` inlines a `fetch(PATCH /api/sessions/{id})` call directly (`SessionRunner.tsx:89-109`), and `useSessionStart`'s `handleSubmit` hardcodes the `POST /api/sessions` fetch (`useSessionStart.ts:13-60`) rather than accepting an injectable save function. Reusing the loop for local-only writes requires extracting these two hardcoded fetches behind a swappable persistence interface — exactly the divergence risk the roadmap slice already named (`roadmap.md:196`). | **STRONG** |
| **5. Mirrored history view needs its own client-only path, not literal reuse of the dashboard component tree** | `dashboard.astro:20-32` does an SSR Supabase `SELECT` and passes server-fetched `sessions` as props into `SessionList` (`client:load`) and `FocusRatingChart` (`client:only="react"`) (`dashboard.astro:57,60`). An anonymous visitor has no SSR-fetchable rows (data lives in the browser). The *components* (`SessionList`, `FocusRatingChart`) may be reusable if fed local data client-side, but the *data-loading path* cannot be shared as-is. | **STRONG** (moderate weight — presentation-layer, lower risk than 1-4) |

## Narrowing Signals

- User's own answer directly named "access for currently protected pages" as
  the leading concern — matches Hypothesis 1, the strongest and most
  structural piece of evidence (two independent gates: middleware + RLS).
- User explicitly broadened scope to topics/formats/presets unprompted —
  confirms Hypothesis 2 before any code was shown to them.
- User asked for sync effort to be *assessed*, not assumed cheap, and
  pre-authorized deferring it — directly supports treating Hypothesis 3 as a
  separate slice rather than folding it into the first cut.
- When asked directly whether this might need splitting, user answered yes
  ("might need splitting... capture vs. migrate-on-signup vs. parity") —
  this is the user independently reaching the same conclusion the evidence
  points to, not the investigation talking them into it.

## Cross-System Convention

The project's own shaping record explicitly excluded "anonymous / local-only"
from v1 (`shape-notes.md:46`) and the auth/RLS system was built on a binary
"authenticated or fully denied" assumption everywhere (`arch.md:189`, every
migration's RLS block). There is no existing convention in this codebase for
a dual-backend (local vs. Supabase) persistence pattern — S-08 would be the
first. That raises rather than lowers the case for treating this as more than
one slice: introducing a wholly new pattern is exactly where scope creep and
silent divergence (the roadmap's own stated risk) are most likely if bundled
into a single change.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: S-08 is not one slice ("bolt
> localStorage onto the capture loop") but at least two, split at a real
> architectural seam — (A) let an unauthenticated visitor run the existing
> capture loop end-to-end against local storage covering all four
> user-scoped tables (sessions, topics, material_formats, user_presets), and
> (B) reconcile that local data into Supabase once the visitor signs up or
> signs in, which requires a non-trivial upsert/idempotency design distinct
> from slice A's concerns.

The original framing correctly identified the mechanism (localStorage) and
the reuse target (S-01's loop), but understated scope on two axes: which
tables need a local mirror, and how much independent design work the sync
path requires. Planning both as a single change risks exactly the failure
mode the roadmap slice already flagged as its top risk — a second
persistence path that silently diverges from the first, compounded here by
also being asked to design a merge/sync layer inside the same change.

## Confidence

**HIGH** — every dimension has file:line evidence from the current codebase
(routing, RLS policies, unique constraints, component seams), the project's
own shaping notes independently corroborate the "no anon path was ever
designed for" framing, and the user reached the same splitting conclusion
independently when asked directly.

## What Changes for /10x-plan

Plan **slice A first** (anonymous capture + local storage for
sessions/topics/formats/presets + local history view), scoped explicitly to
NOT include sync. Route the auth-gating question (which new route(s), how
middleware/RLS boundaries are threaded, how `SessionRunner`/`useSessionStart`
get their fetch calls made swappable) as /10x-plan's implementation-design
work — this brief intentionally does not choose that mechanism. Recommend
opening **slice B (sync-on-login)** as its own change-id once slice A's
local-storage shape is settled, since the merge/idempotency design depends on
what slice A actually stores locally (e.g., whether local topic/format
"IDs" are name-keyed or client-generated UUIDs materially changes the merge
algorithm).

## References

- Source files:
  - `src/middleware.ts:4,29-33`
  - `src/components/session/SessionRunner.tsx:89-109`
  - `src/lib/session/useSessionStart.ts:13-60`
  - `src/components/session/FocusRating.tsx:10`
  - `src/pages/dashboard.astro:20-32,57,60`
  - `supabase/migrations/20260531182506_sessions_data_foundation.sql:30-191`
  - `supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql:9-54`
  - `context/foundation/arch.md:189`
  - `context/foundation/shape-notes.md:46`
- Related planning docs: `context/foundation/roadmap.md:183-197,212`,
  `context/foundation/prd.md:162`
- Investigation: repo-wide Explore pass over the S-01 capture loop
  (components/hooks/persistence/auth-gating/dashboard/localStorage
  precedent), plus direct reads of all `supabase/migrations/*.sql`.
