---
title: PomoSapiens - Domain Distillation
created: 2026-07-28
type: domain-distillation
---

# PomoSapiens - Domain Distillation

> A map of the business domain distilled from source documents and verified against the code.
> This is a **map, not code**. Every claim is cited to `file:line`. Where a concept has no code home,
> it is annotated **NOT IN CODE**.

## Step 0 - Discovered project context

**Sources read (requirements / vision):**

- [idea-notes.md](../../idea-notes.md) - the original MVP brief (Polish). States the business goal: an "personal effectiveness auditor" that moves from a plain Pomodoro timer to understanding individual productivity patterns ([idea-notes.md:5](../../idea-notes.md#L5)).
- [context/foundation/prd.md](../foundation/prd.md) - the locked PRD (greenfield, 10 sections, FR-001..FR-018).
- [context/foundation/arch.md](../foundation/arch.md) - the current architecture snapshot (2026-07-16).
- [context/foundation/tech-stack.md](../foundation/tech-stack.md), [README.md](../../README.md) - stack and ops.
- `context/archive/` - 30+ closed change folders (the implemented feature history, S-01..S-14).

**Stack & where business logic lives** (from [arch.md:10-11](../foundation/arch.md#L10) and verified):

- Astro 6 SSR + React 19 islands, Tailwind 4, shadcn/ui, deployed to Cloudflare Workers.
- Persistence + identity: Supabase (Postgres + RLS + Auth, cookie SSR sessions).
- Domain logic is spread across four layers:
  - **Persistence / invariants**: `supabase/migrations/*.sql` (schema, CHECK, RLS).
  - **Request boundary**: `src/pages/api/**` (handlers) + `src/lib/schemas/*.ts` (zod).
  - **Client domain logic**: `src/lib/timer/`, `src/lib/session/`, `src/lib/local/`, `src/lib/timeline/`.
  - **View vocabulary**: `src/lib/types.ts` + generated `src/db/database.types.ts`.

**Limitation / caveat:** requirements documents are rich and current, so this distillation leans on them heavily.
The single most important finding (Step 4) is that the **core business rule has almost no code counterpart** -
the discovery is only possible *because* the documents are detailed.

---

## Step 1 - Ubiquitous Language

Each term: definition, source quote (`file:line`), and where it lives in code (or **NOT IN CODE**).

| Term | Definition | Source (doc) | Code home |
| --- | --- | --- | --- |
| **Session** | One timed focus block plus the context captured around it; the atomic unit of the product. | "PomoSapiens treats every focus session as a data point" [prd.md:139](../foundation/prd.md#L139) | `sessions` table [20260531182506_sessions_data_foundation.sql:80](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L80); type `SessionListItem` [types.ts:27](../../src/lib/types.ts#L27) |
| **Energy level** | Pre-session self-report low/medium/high; the *only required* pre-session field. | FR-009 "must record a one-tap pre-session energy level (low / medium / high)" [prd.md:92](../foundation/prd.md#L92) | enum `energy_level` [migration:10](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L10); `NOT NULL` [migration:91](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L91); schema [session.ts:4](../../src/lib/schemas/session.ts#L4) |
| **Material format** | The form of study (video / reading / writing code / drilling problems / other); optional per session. | FR-008 [prd.md:90](../foundation/prd.md#L90) | `material_formats` table + 5 seeded defaults [migration:115](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L115) |
| **Topic** | User-managed study category; optional per session, selected from own list. | FR-007 [prd.md:88](../foundation/prd.md#L88); FR-017 add/rename/archive [prd.md:120](../foundation/prd.md#L120) | `topics` table [migration:56](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L56) |
| **Focus rating** | Post-session quality self-report 1-5, or **skip**. | FR-013 "rate focus quality on a 1-5 scale, with an explicit 'skip'" [prd.md:106](../foundation/prd.md#L106) | `focus_rating smallint ... CHECK BETWEEN 1 AND 5`, NULL = skipped [migration:92](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L92); schema [session.ts:25](../../src/lib/schemas/session.ts#L25) |
| **Note** | Optional free-text on what was accomplished, max 500 chars. | FR-014 (nice-to-have) [prd.md:108](../foundation/prd.md#L108) | `note text NULL` [migration:99](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L99); 500-char cap [session.ts:35](../../src/lib/schemas/session.ts#L35) |
| **Timer mode** | Which timer runs: `preset_1/2/3` or `count_up`; optional, defaults to last-used. | FR-010 [prd.md:94](../foundation/prd.md#L94) | `Mode` type [types.ts:4](../../src/lib/types.ts#L4); DB CHECK [migration:95](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L95) |
| **Preset (slot)** | One of three editable focus+break duration pairs (defaults 25/5, 45/10, 90/15). | FR-004 [prd.md:77](../foundation/prd.md#L77) | `user_presets` table [20260630000000_user_presets_and_session_audit_cols.sql:9](../../supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql#L9); `Preset` type [types.ts:19](../../src/lib/types.ts#L19); defaults [preset-defaults.ts](../../src/lib/timer/preset-defaults.ts) |
| **Count-up (open-ended)** | Alternative to countdown presets; no planned durations, only Stop ends it. | FR-005 [prd.md:79](../foundation/prd.md#L79) | `mode === "count_up"` branches [useFocusTimer.ts:88](../../src/lib/timer/useFocusTimer.ts#L88) |
| **Planned focus/break seconds** | A *snapshot* of the chosen preset's durations copied onto the session row at start. | "planned_*_seconds are snapshots, not references" [arch.md:302](../foundation/arch.md#L302) | columns [20260630000000...:61-67](../../supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql#L61); snapshotted in [useSessionStart.ts:47](../../src/lib/session/useSessionStart.ts#L47) |
| **Duration (elapsed)** | Actual wall-clock focus time; recorded even when stopped early. | FR-012 "partial elapsed time is recorded as the session's actual duration" [prd.md:101](../foundation/prd.md#L101) | GENERATED column `duration_seconds` [migration:85](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85) |
| **In-progress vs done** | Lifecycle status, *derived* from `ended_at` (NULL = in progress). | "A session's lifecycle is written in ended_at ... Status is derived, never stored" [arch.md:304](../foundation/arch.md#L304) | [access.ts:14](../../src/lib/session/access.ts#L14) |
| **Continue / "I'm still working"** | Mid-flight conversion of a running preset session to count-up at focus-end. | S-10 [arch.md:481](../foundation/arch.md#L481) | [continue.ts:23](../../src/pages/api/sessions/[id]/continue.ts#L23); `continueAsCountUp()` [useFocusTimer.ts:137](../../src/lib/timer/useFocusTimer.ts#L137) |
| **Abandon** | Explicit delete of a session ("phone rang, did nothing"). | idea-notes "zadzwonil telefon i w sumie nic nie zrobilem" [idea-notes.md:33](../../idea-notes.md#L33) | hard `DELETE` [\[id\].ts:135](../../src/pages/api/sessions/[id].ts#L135) - no stored "abandoned" state |
| **Pattern / insight (contextual effectiveness)** | The correlation between pre-session context and self-rated focus - the product's reason to exist. | "reveals to the student which combinations of pre-session context ... correlate with their own self-rated focus quality" [prd.md:139](../foundation/prd.md#L139) | **PARTIAL** - only a single focus-rating-over-time chart `FocusRatingChart` + read-only timeline. No correlation/cross-tab model. See Step 4. |
| **Weekly synthesized insight (AI)** | LLM turns 7 days of data into actionable advice. | idea-notes [idea-notes.md:41-45](../../idea-notes.md#L41); Open Question 2 [prd.md:179](../foundation/prd.md#L179) | **NOT IN CODE** (deferred to v2) |
| **User / Admin** | Two roles; User sees only own data, Admin is an ops role. | Access Control [prd.md:151-156](../foundation/prd.md#L151) | User = RLS `auth.uid()` everywhere; **Admin NOT IN CODE** |
| **Anonymous visitor** | Unauthenticated user running the full loop against localStorage. | S-08 [arch.md:16](../foundation/arch.md#L16) | `localSessions` etc. [localSessions.ts](../../src/lib/local/localSessions.ts) - **contradicts PRD non-goal**, see Step 4 |
| **Timeline** | Read-only Day/Week/Month swimlane grid of sessions. | S-14 [arch.md:524](../foundation/arch.md#L524) | `src/lib/timeline/`, `/timeline` page |

---

## Step 2 - Subdomain classification (Core / Supporting / Generic)

Rdzen = what constitutes the product's competitive edge and reason to exist. Justified against the vision
and success criteria.

| Area | Category | Justification (tied to product goals) |
| --- | --- | --- |
| **Contextual effectiveness analytics** (correlating energy / time-of-day / format / topic with focus) | **CORE** | This *is* the product's insight: "learning effectiveness is contextual, not durational" [prd.md:24](../foundation/prd.md#L24). The Business Logic section [prd.md:139](../foundation/prd.md#L139) makes correlation the single load-bearing rule. Every other feature exists to feed it. |
| **Contextual session capture** (energy required, structured optional context, low-friction start) | **CORE** | The capture machinery "is shaped specifically to feed this rule with clean inputs while keeping the start-of-session friction at three taps" [prd.md:143](../foundation/prd.md#L143). The <=3-tap Guardrail [prd.md:42](../foundation/prd.md#L42) is a core differentiator, not plumbing. |
| **Pomodoro timer engine** (presets, count-up, break auto-transition, wall-clock resilience) | **SUPPORTING** | Necessary and non-trivial (timer-accuracy NFR [prd.md:134](../foundation/prd.md#L134)), but a means to capture heterogeneous session shapes, not the wedge. A student could get value from manual entry; the timer serves the data. |
| **Topic / material-format catalog management** | **SUPPORTING** | Required so per-topic analysis has clean keys (FR-017 exists *because* FR-007 chose "select from list" [prd.md:121](../foundation/prd.md#L121)). Structured lookup in service of the core, not itself differentiating. |
| **Session history & editing** (list, chart, edit/delete/abandon) | **SUPPORTING** | The raw-evidence layer the core sits on (FR-015 "the raw evidence layer the chart ... sits on top of" [prd.md:114](../foundation/prd.md#L114)). |
| **Weekly AI insights** | **CORE (aspirational / deferred)** | The eventual apex of the core rule ("Actionable Insights" [idea-notes.md:45](../../idea-notes.md#L45)), explicitly held out of v1 [prd.md:179](../foundation/prd.md#L179). |
| **Authentication & identity** | **GENERIC** | Federated + email/password (FR-001..003); solved by Supabase Auth. No product-specific logic. |
| **Access control / user isolation (RLS)** | **GENERIC (but a hard guardrail)** | Standard per-owner isolation; delegated to Postgres RLS. Generic mechanism, but the privacy NFR [prd.md:131](../foundation/prd.md#L131) makes correct application non-negotiable. |
| **Persistence tier (Postgres / localStorage port)** | **GENERIC** | The `SessionPersistence` port [arch.md:330](../foundation/arch.md#L330) is infrastructure; the anonymous mirror is a delivery choice, not domain. |

---

## Step 3 - Aggregate candidates and their invariants

For each candidate: the business rule that must always hold, its source, and whether code **enforces**,
**declares**, or **ignores** it.

### Candidate A - `Session` (aggregate root; the strongest candidate)

| Invariant | Source | Enforcement status |
| --- | --- | --- |
| Energy level is always present. | FR-009 [prd.md:92](../foundation/prd.md#L92) | **ENFORCED** (DB `NOT NULL` [migration:91](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L91) + zod required [session.ts:4](../../src/lib/schemas/session.ts#L4) + client guard `if (!energy) return` [useSessionStart.ts:21](../../src/lib/session/useSessionStart.ts#L21)). |
| A session is ended exactly once; a done session cannot be re-ended. | "Write-once end" [arch.md:480](../foundation/arch.md#L480) | **ENFORCED** (`.is("ended_at", null)` guard on PATCH -> 409 [\[id\].ts:54](../../src/pages/api/sessions/[id].ts#L54)). |
| Recorded duration = actual wall-clock (`ended_at - started_at`), incl. early stop. | FR-012 [prd.md:101](../foundation/prd.md#L101) | **ENFORCED** (GENERATED column [migration:85](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85); no app arithmetic). |
| Focus rating is 1-5 or NULL (skip); never 0 or 6. | FR-013 [prd.md:106](../foundation/prd.md#L106) | **ENFORCED** (DB CHECK [migration:92](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L92) + zod [session.ts:26](../../src/lib/schemas/session.ts#L26)). |
| `count_up` mode => both planned durations NULL; preset => both non-NULL. | "count_up => null planned invariant is app-maintained, not DB-enforced" [arch.md:302](../foundation/arch.md#L302) | **DECLARED, partially ENFORCED, deliberately relaxed.** POST rejects violations [sessions/index.ts:24-30](../../src/pages/api/sessions/index.ts#L24). But no DB CHECK, and `continue.ts` nulls only `planned_focus_seconds`, **preserving `planned_break_seconds`** [continue.ts:23](../../src/pages/api/sessions/[id]/continue.ts#L23) - so a converted count-up row can carry a non-null planned break by design ([arch.md:302](../foundation/arch.md#L302)). |
| `ended_at` must be plausible (within `[now-2h, now+5s]`) - clock-tamper guard. | "plausibility window" [arch.md:480](../foundation/arch.md#L480) | **ENFORCED** on PATCH only [\[id\].ts:45](../../src/pages/api/sessions/[id].ts#L45); intentionally *absent* on PUT edit [\[id\].ts:1-5](../../src/pages/api/sessions/[id].ts#L1). |
| Every write touches only a hand-picked column set (never `.update(parsed.data)`) - lesson L-01. | [arch.md:479](../foundation/arch.md#L479) | **ENFORCED** (explicit column objects at every write site). |
| A session belongs to exactly one user; never visible to another. | Privacy NFR [prd.md:131](../foundation/prd.md#L131) | **ENFORCED** (RLS per-op policies [migration:134-149](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L134) + `.eq("user_id", ...)` defence-in-depth; pgTAP `rls_sessions.sql`). |

### Candidate B - `UserPresets` (the 3-slot set as one aggregate)

| Invariant | Source | Enforcement status |
| --- | --- | --- |
| Exactly three slots (1,2,3) exist per user, logically always present. | FR-004 [prd.md:77](../foundation/prd.md#L77); "three slots always exist logically" [arch.md:311](../foundation/arch.md#L311) | **DECLARED** - slots are not seeded; defaults merged in app code (`preset-defaults.ts`), no DELETE policy so a persisted slot cannot vanish [arch.md:311](../foundation/arch.md#L311). Slot values constrained by DB `CHECK (slot IN (1,2,3))` + `UNIQUE(user_id, slot)` [20260630...:12-17](../../supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql#L12). |
| Focus 60..14400s; break 0..3600s. | FR-004 defaults [prd.md:77](../foundation/prd.md#L77) | **ENFORCED** (DB CHECK [20260630...:13-14](../../supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql#L13) + zod bounds mirror [session.ts:10-21](../../src/lib/schemas/session.ts#L10)). |

### Candidate C - `Topic` / `MaterialFormat` (catalog entities)

| Invariant | Source | Enforcement status |
| --- | --- | --- |
| Name is unique per owner (incl. seeded defaults distinct). | FR-017 [prd.md:120](../foundation/prd.md#L120) | **ENFORCED** (`UNIQUE(owner_id, name)` + partial unique index for NULL-owner [migration:36-43](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L36)). |
| Archive is soft (never hard-deleted); archived rows drop out of the picker. | FR-017 "archive" [prd.md:120](../foundation/prd.md#L120) | **ENFORCED** (`archived_at` column + partial active index [20260627140018...:5-17](../../supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql#L5)). |
| Deleting a topic/format must not destroy historical sessions. | Implied by history NFR | **ENFORCED** (`ON DELETE SET NULL` on both FKs [migration:93-94](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L93)). |

### Candidate D - `EffectivenessProfile` / `PatternView` (the core read-model)

| Invariant | Source | Enforcement status |
| --- | --- | --- |
| The system reveals how self-rated focus varies across pre-session context (energy x time-of-day x format x topic). | Business Logic [prd.md:139-141](../foundation/prd.md#L139) | **IGNORED / ABSENT.** No aggregate, service, or query computes cross-context correlation. Only `FocusRatingChart` (rating over time) and the read-only timeline exist. This is the core domain with **no code home** - see Step 4 & 5. |

---

## Step 4 - MODEL vs CODE divergences (the most valuable section)

| # | Document says X | Code does Y | Evidence |
| --- | --- | --- | --- |
| **D-1** | The product's *core rule* is contextual correlation: "which combinations of ... energy, time of day, material format, topic - correlate with their own self-rated focus quality" [prd.md:139](../foundation/prd.md#L139). | Code ships only a single **focus-rating-over-time** chart and a raw **timeline** grid. There is no correlation, cross-tab, or per-context aggregation anywhere. The core subdomain is effectively unbuilt. | `FocusRatingChart` (Recharts, rating vs time) [arch.md:629](../foundation/arch.md#L629); timeline is explicitly read-only history [arch.md:524](../foundation/arch.md#L524). No analytics module in `src/lib/`. |
| **D-2** | PRD Non-Goal: "**No non logged-in user scenario with utilization of localStorage** - Add as follow up" [prd.md:162](../foundation/prd.md#L162). | The anonymous localStorage capture loop is **fully shipped** (S-08): stores, port, `AnonSessionApp` on `/`. | [arch.md:16](../foundation/arch.md#L16); [localSessions.ts](../../src/lib/local/localSessions.ts). The PRD non-goal is now stale/contradicted. |
| **D-3** | Access Control defines an **Admin** role: "view system-level diagnostics, inspect user records ... run maintenance tasks" [prd.md:154](../foundation/prd.md#L154). | No admin role, flag, policy, or UI exists. Every access decision is `user_id = auth.uid()`. | RLS policies are `authenticated`-only, owner-scoped [migration:134-149](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L134). No `is_admin` column or admin route. |
| **D-4** | `count_up` sessions have **null planned durations** (invariant) [arch.md:302](../foundation/arch.md#L302). | After a mid-flight "continue", the row is `count_up` but **retains `planned_break_seconds`** - the invariant is deliberately relaxed to insert-time only. | POST enforces both-null [sessions/index.ts:24](../../src/pages/api/sessions/index.ts#L24); continue nulls only focus [continue.ts:23](../../src/pages/api/sessions/[id]/continue.ts#L23). Neither is DB-enforced (no CHECK). |
| **D-5** | `timer_mode` domain is exactly `{preset_1,preset_2,preset_3,count_up}` (FR-010) [prd.md:94](../foundation/prd.md#L94). | The DB column **also permits `NULL`** (`timer_mode IS NULL OR ...`) [migration:95](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L95), a legacy "anticipating-but-nullable" allowance [migration:3](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L3). App code never writes NULL, so the DB permits a state the domain forbids. | zod requires the enum [session.ts:9](../../src/lib/schemas/session.ts#L9); DB does not. |
| **D-6** | "Abandon" is a real domain action ("phone rang, did nothing" [idea-notes.md:33](../../idea-notes.md#L33); FR context). | There is **no stored "abandoned" state** - abandon is a hard `DELETE`, and status is a two-value derivation from `ended_at`. | `DELETE` handler [\[id\].ts:135](../../src/pages/api/sessions/[id].ts#L135); status derived [access.ts:14](../../src/lib/session/access.ts#L14). The signal FR-012 called "informative" [prd.md:102](../foundation/prd.md#L102) is discarded, not captured. |
| **D-7** | Per-category **color** is not in the domain narrative. | The timeline persists per-category colors, a genuine domain-adjacent preference, **only in localStorage** even for signed-in users [arch.md:305](../foundation/arch.md#L305). | Defensible (presentation, not durable domain), but it is a second "server owns truth" exception worth noting. |

---

## Step 5 - Refactor ranking (value x risk)

Value = how core the invariant is to the product. Risk = how weakly it is enforced today.

| Rank | Target | Value | Risk (enforcement gap) | Verdict |
| --- | --- | --- | --- | --- |
| **#1** | **Give the core domain a home: an `Effectiveness`/`PatternView` read-model** (D-1) | **Highest** - it is the entire product thesis [prd.md:139](../foundation/prd.md#L139). | **Total** - no code models it; the app is currently a capture tool + raw log, not the "effectiveness auditor" the vision promises. | **Build, not refactor.** The single most important gap. Everything already captured (energy, time-of-day, format, topic, rating, duration) is clean input waiting for this model. Start with per-context aggregation (e.g. median rating by energy x format) behind a query/service, then surface it. |
| #2 | **Move the `count_up => null planned` invariant into the DB** (D-4/D-5) | Medium - protects the integrity of the core's inputs. | High - app-only, already inconsistent across POST vs continue, and DB permits NULL `timer_mode`. | Refactor: add a DB CHECK expressing the real (relaxed) rule and tighten `timer_mode` to `NOT NULL`. Low effort, closes a silent drift path. |
| #3 | **Capture abandon as signal instead of deleting it** (D-6) | Medium - FR-012 calls abandoned sessions "themselves signal" [prd.md:102](../foundation/prd.md#L102). | Medium - the data is thrown away on DELETE. | Product decision first, then a soft-abandon state. Not urgent for v1 but relevant once #1 exists (abandon patterns are part of the insight). |
| #4 | **Reconcile stale PRD statements** (D-2 anonymous non-goal, D-3 admin) | Low (doc hygiene) | Low | Update the PRD: promote the anonymous path out of Non-Goals, and either implement or defer Admin explicitly. |

**#1 to refactor/build and why:** the `Session` aggregate is already well-guarded, so the domain's *risk* is
not in capture - it is that the **Core subdomain (contextual effectiveness analytics) has no aggregate, service,
or query in the codebase at all.** The product currently records excellent contextual data and then only draws a
rating-over-time line. Closing that gap is where the domain model and the code diverge most, and where the
product's stated value actually lives.

---

## Summary

This artifact distills PomoSapiens' domain from its PRD, original idea-notes, and architecture snapshot, then
verifies every concept against the running code with `file:line` citations. It builds an Ubiquitous Language table
(Session, energy level, material format, topic, focus rating, timer mode/preset, planned-duration snapshots,
derived duration, continue, abandon, pattern-insight), classifies subdomains (Core: contextual capture +
effectiveness analytics; Supporting: timer engine, catalogs, history; Generic: auth, RLS, persistence), and names
`Session` as the dominant aggregate with a set of largely well-enforced invariants (energy-always-present,
write-once end, generated duration, rating 1-5-or-skip, per-user isolation). The most valuable output is the
MODEL-vs-CODE divergence table: the **core business rule - revealing which contextual combinations correlate with
self-rated focus - has essentially no code counterpart**, the shipped anonymous localStorage path contradicts a
PRD non-goal, the Admin role is undefined in code, and the `count_up => null planned` invariant is app-only and
already relaxed. The headline conclusion: capture is solid, but the product's differentiating Core subdomain
(contextual effectiveness analytics) is unmodeled - that is the #1 place to invest, and it is a build, not a fix.
