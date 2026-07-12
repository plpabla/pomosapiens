# Anonymous Session Capture (localStorage) -- Plan Brief

> Full plan: `context/changes/anonymous-sessions/plan.md`
> Frame brief: `context/changes/anonymous-sessions/frame.md`
> Research: `context/changes/anonymous-sessions/research.md`

## What & Why

Let an unauthenticated visitor run the full capture loop (energy -> topic/format -> timer -> rating -> note) on `/`, persisted entirely to localStorage, with a read-only local history view. Per the frame brief, S-08 was split at a real architectural seam: this change is slice A (anonymous capture + local storage); reconciling that data into Supabase after sign-in is slice B (S-09, `anonymous-session-sync`), a separate change with its own upsert/idempotency design.

## Starting Point

The app is fully authed today: middleware redirects anon visitors off every app page, all four tables are RLS-denied to `anon`, and every capture-loop component calls `fetch` directly -- no persistence abstraction exists. The presentational layer, however, is already pure props-in, and `useLastMode.ts` provides the SSR-safe localStorage pattern to extend.

## Desired End State

An anonymous visitor lands on `/`, starts a session right there, gets the timer/chime/rating experience, and sees their history build below the form -- surviving page refreshes, all in the browser. The signed-in experience is byte-for-byte unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Slice boundary | Capture only; sync = S-09 | Merge/idempotency is independent design surface; bundling it invites the divergence risk the roadmap flagged | Frame |
| Local-data scope | All 4 tables mirrored | User explicitly broadened from "sessions" to all user-scoped data | Frame |
| Entry route | Reuse `/` directly | Matches roadmap outcome text; `/` is already anon-only via `AUTHED_REDIRECTS`, so no middleware change is needed | Plan |
| History scope | Read-only list + chart | Both components reuse verbatim; smallest surface for the first dual-backend slice | Plan |
| ID scheme | Client UUIDs + name-unique topics | Mirrors server schema (uuid PK + `UNIQUE(owner_id, name)`), giving S-09 the same reconciliation it needs anyway | Plan |
| Management surface | Inline topic creation only | Delivers "capture + tagging" without unprotecting `/topics`, `/formats`, `/presets`; formats/presets become fixed constants | Plan |
| Storage cap | Newest 200 sessions | One-line insurance against unbounded growth and pathological S-09 merges | Plan |
| Multi-tab | storage-event wiring, no warning | Few lines on a pattern already being built; concurrent timers accepted (parity with authed) | Plan |
| Seam design | Persistence injected at island boundary | One shared port (`createSession`/`endSession`) instead of branching six call sites | Research |

## Scope

**In scope:** localStorage stores for sessions + topics (versioned envelope, cap, cross-tab refresh); fixed local constants for the 5 default formats and 3 default presets; injectable persistence port with remote default; `SessionStartForm` extraction; anon island on `/` with inline topic creation and refresh-resume; read-only history (list + chart); unauthenticated e2e fixture + spec.

**Out of scope:** sync/merge to Supabase (S-09); edit/delete/abandon on local sessions; local management pages; format creation or preset editing for anon; any API/RLS/migration change; sign-up data-migration CTA; multi-tab locking.

## Architecture / Approach

The codebase's first dual-backend persistence path, kept from diverging by injection rather than branching: `useSessionStart` and `SessionRunner` gain a small `SessionPersistence` port (2 operations) plus navigation callbacks, with defaults preserving today's authed behavior exactly. A new `AnonSessionApp` island on `/` composes the same form/runner against a local implementation backed by two collection stores that extend the `useLastMode` pattern (SSR-safe `useSyncExternalStore`, fail-open, versioned `{v:1, items}` envelope, `storage`-event fan-out). Timer resume falls out of the existing wall-clock derivation (L-03); the audio prime survives because the anon flow never navigates (L-02).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Local persistence foundation | Stores + constants + selectors, unit-tested | Snapshot caching bugs -> React render loops |
| 2. Persistence seam refactor | Injectable port; authed path provably unchanged | Behavioral drift in authed flow (gated by full e2e suite) |
| 3. Anon capture on `/` | Full loop client-side with resume + inline topics | Phase-transition/resume edge cases on refresh |
| 4. Local history view | Read-only list + chart from local data | Shape mismatch vs. `SessionListItem` contract |
| 5. E2E fixture + spec | First signed-out coverage, full-loop spec | Timer flow in CI (mitigated via stop-early path) |

**Prerequisites:** none beyond local dev env (Supabase running only for the e2e suite).
**Estimated effort:** ~3-5 sessions across 5 phases; Phases 1-2 are the load-bearing half.

## Open Risks & Assumptions

- `arch.md`'s "server owns truth" stance gets its first exception -- consider an arch.md note during implementation.
- Assumes `crypto.randomUUID()` availability (secure context); dev/prod are HTTPS/localhost so this holds.
- Landing-page layout integration is left to implementer judgment (hero + capture form coexist); visual quality gate is manual.
- Local data left in browsers is inert if the feature is rolled back; S-09 must handle visitors whose cap already trimmed old sessions.

## Success Criteria (Summary)

- An anonymous visitor completes the full capture loop on `/` and sees their session in a read-only history that survives reloads.
- The signed-in experience is unchanged: full existing e2e suite green with zero spec edits.
- The new anonymous e2e spec locks the loop (capture, inline topic, resume, read-only history) in CI-runnable form.
