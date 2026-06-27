# S-02: Categorize sessions by topic and material format -- Plan Brief

> Full plan: `context/changes/categorize-sessions-topic-format/plan.md`
> Research: `context/changes/categorize-sessions-topic-format/research.md`

## What & Why

Ship S-02 from the roadmap: users can add / rename / archive their own topics on a management screen, optionally pick a topic and a material format on the pre-session screen, and see those categories on dashboard history rows. Categorization is the foundation for the retrospective-on-yesterday loop that follows in later slices; without it, sessions are an undifferentiated stream and the product's wedge (knowing what kind of work produced your best focus) doesn't land. Both new pre-session fields default to empty so the 3-tap budget from PRD survives.

## Starting Point

F-01 deliberately overshot: `sessions.topic_id` and `sessions.material_format_id` already exist as nullable FK columns, and the full `topics` + `material_formats` tables with per-user RLS are shipped. `material_formats` has 5 NULL-owner seeds (Video / Reading / Writing code / Drilling problems / Other); `topics` ships empty. S-01 wired the pre-session screen and dashboard but leaves both new FKs always null. The roadmap line about "additive schema changes on sessions" is stale -- F-01 already did that.

## Desired End State

A user can manage their own topic library at `/topics` (and custom material formats at `/formats`), pick either or both on the pre-session screen (or skip and still ship in 3 taps), and see the chosen topic + format on every history row. Archived topics and formats disappear from the picker but remain attached to past sessions so the dashboard never loses retrospective context. Seeded material formats stay visible to everyone and cannot be renamed or archived by any user.

## Key Decisions Made

| Decision                                          | Choice                                                            | Why (1 sentence)                                                                                              | Source |
| ------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| Archive semantics                                 | Hide from picker, keep on dashboard rows                          | Standard archive pattern -- preserves historical analytics without losing retrospective context.              | Plan   |
| Material formats: closed vocabulary or extensible | Extensible -- users can create / rename / archive their own       | F-01 already built the table for it; lets power users tag specialized work without bloating the closed list.  | Plan   |
| Material formats: archive surface                 | Add `archived_at` to `material_formats` symmetric with topics     | Asymmetric model (one archive, one delete) would be confusing; analytics on retired formats must stay intact. | Plan   |
| Topic picker UI                                   | shadcn `<Select>` dropdown                                        | Scales past the energy-style button group; cheaper install than combobox; sufficient for sub-30-item lists.   | Plan   |
| Management routes                                 | Two sibling pages: `/topics` and `/formats`                       | Clean separation, no tabs primitive to install, two Topbar entries is acceptable.                             | Plan   |
| Dashboard surface                                 | Small chip line below the date; hidden when both fields are null  | Visually consistent with the minimal row template; mobile-friendly; doesn't enlarge rows for older sessions.  | Plan   |
| Seeded-format protection                          | RLS-only (no app-layer `owner_id IS NOT NULL` guard)              | RLS UPDATE policy already blocks NULL-owner writes; avoids divergence with how cross-user denial is handled.  | Plan   |
| Pickers do not gate Start                         | Both default to "no selection"; only `energy_level` gates Start   | Required to preserve the 3-tap budget from PRD line 84.                                                       | Plan   |
| PATCH `/api/sessions/[id]` widening               | Do not widen -- topic / format are POST-only                      | Preserves the L-01 column-scope contract on the most-tested endpoint.                                         | Plan   |

## Scope

**In scope:**

- Migration adding `archived_at timestamptz NULL` to `topics` and `material_formats`, plus partial indexes
- pgTAP extensions for the new column + the seeded-row protection regression
- Widened POST `/api/sessions` accepting optional `topic_id` / `material_format_id`
- Topics CRUD API (POST, GET, PATCH for rename + archive) and `/topics` management page with empty state
- Material formats CRUD API (POST, GET, PATCH; cross-user and seeded-row PATCH collapse to 409) and `/formats` management page
- Two `<Select>` pickers added to the pre-session screen
- Dashboard `.select` widened with PostgREST embeds + chip line rendering
- Topbar links to `/topics` and `/formats`; `PROTECTED_ROUTES` entries for both
- Column-scope integration tests for each new write endpoint

**Out of scope:**

- Post-session editing of topic / material_format (sessions stay immutable)
- Sorting, filtering, search, or pagination on the management pages
- Inline "Add your first topic" CTA on the pre-session screen
- Seeded topics (none -- empty-state CTA covers it)
- Combobox / search-as-you-type topic picker
- Playwright e2e coverage (test-plan §7 does not require it for S-02)
- Dashboard row redesign beyond appending a chip line

## Architecture / Approach

Layered, additive:

```
Migration  →  pgTAP + types regen
       ↓
POST /api/sessions widened (accepts optional FKs)
       ↓
Topics API + /topics page  (independently usable)
       ↓
Material Formats API + /formats page  (independently usable)
       ↓
Pre-session screen pickers  (now has data to pick from)
       ↓
Dashboard chips  (read-side polish)
```

Two write contracts get widened (POST `/api/sessions`) or created (POST + PATCH for topics and material_formats). All follow the L-01 column-scope two-layer rule: zod default-strip + hand-picked `.insert / .update`. Dashboard reads remain direct from Supabase in Astro frontmatter -- the PostgREST embed `topic:topics(name), material_format:material_formats(name)` keeps it to one round-trip. Seeded material formats are protected by RLS UPDATE policy alone; the app layer does not duplicate the check.

## Phases at a Glance

| Phase                                     | What it delivers                                                                | Key risk                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1. Schema + RLS tests + types             | `archived_at` columns, partial indexes, pgTAP coverage, regenerated types       | Forgetting `npm run db:types:prod` post-deploy breaks the smoke `diff` gate                           |
| 2. Widen POST `/api/sessions`             | Endpoint accepts optional `topic_id` / `material_format_id`                     | Accidentally spreading `parsed.data` into `.insert` (L-01 layer 2 break) -- hand-pick                 |
| 3. Topic customization end-to-end         | Topics CRUD API + `/topics` page with empty state + Topbar nav                  | Modal + Dialog primitives need `node_modules/.vite/` reset after shadcn install (L-04)                |
| 4. Material format customization end-to-end | Material formats CRUD API (seeded-row protection) + `/formats` page + nav     | Forgetting to omit Rename / Archive affordances on seeded rows in the UI -- RLS denies but UX is ugly |
| 5. Pre-session pickers                    | Two `<Select>`s on `/session/new` wired to the widened POST                     | Accidentally gating Start on topic / format breaks the 3-tap budget                                   |
| 6. Dashboard surface                      | PostgREST embeds + conditional chip line                                        | Long topic names breaking row layout -- truncation + `title` attr handles it                          |

**Prerequisites:** S-01 (capture loop) shipped; local Supabase running; `.dev.vars` has `SUPABASE_SERVICE_ROLE_KEY` for integration tests.

**Estimated effort:** ~3-4 sessions across 6 phases (Phase 1 is small; Phase 3 and Phase 4 are the heavy lifts -- each needs a management page with modal CRUD; Phases 2, 5, 6 are quick).

## Open Risks & Assumptions

- Bogus topic_id / material_format_id in the POST body returns a generic 500 from the FK violation. Acceptable for v1 because the only writers are first-party UI components that emit known ids; if a future client emits unknown ids, this needs a 400 path.
- The chip line on dashboard might wrap awkwardly on very narrow viewports. Manual mobile-width testing is the gate; no responsive layout test in CI.
- Custom material formats may proliferate over time. v1 has no merge / cleanup tooling; if a user adds 30 one-off formats, the picker gets long. Revisit when a real user hits this.

## Success Criteria (Summary)

- A fresh-account user can: create a topic, archive it (it leaves the picker but stays on history), create a custom material format, ship a session with both fields set, and see them as chips on the dashboard -- in under 5 minutes.
- A user who skips both pickers can still ship a session in 3 taps from the dashboard.
- No user can rename, archive, or otherwise mutate a seeded material format or another user's topic / format (verified by pgTAP + integration tests + manual DevTools forging).
