<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-02 Categorize sessions by topic and material format

- **Plan**: context/changes/categorize-sessions-topic-format/plan.md
- **Mode**: Deep
- **Date**: 2026-06-27
- **Verdict**: REVISE
- **Findings**: 2 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding

8/8 paths ✓, 6/6 symbols ✓ (`createSessionSchema`, `endSessionSchema`, `PROTECTED_ROUTES`, `parseJson`, `sessions_update_own`, `material_formats_select_own_or_default`), brief↔plan ✓.

## Findings

### F1 — PROTECTED_ROUTES "/topics/" trailing slash won't protect /topics page itself

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §5, Phase 4 §4 (Key Discoveries also restates the rule)
- **Detail**: Plan applies the S-01 F5 trailing-slash rule to `/topics/` and `/formats/`, but that rule applied to `/session/` because the actual rendered pages are nested (`/session/new`, `/session/[id]`). For S-02 the management pages are top-level: `src/pages/topics/index.astro` serves at `/topics`. With middleware `PROTECTED_ROUTES.some(r => pathname.startsWith(r))`, `"/topics".startsWith("/topics/")` is false. A logged-out user visiting `/topics` is NOT redirected — manual verification 3.5 ("Logged-out visit to /topics redirects to signin") will fail. The existing `/dashboard` entry (no trailing slash) is the correct precedent.
- **Fix**: Append `"/topics"` and `"/formats"` (no trailing slash) to PROTECTED_ROUTES, matching the existing `/dashboard` entry. Remove the "trailing-slash rule" mention from Key Discoveries.
- **Decision**: FIXED — Phase 3 §5 and Phase 4 §4 now use `"/topics"` / `"/formats"`; Key Discoveries rewritten to explain when the trailing slash applies vs. not.

### F2 — GET /api/topics contract contradicts itself between Phase 3 and Phase 5

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2 vs. Phase 5 §2
- **Detail**: Phase 3 §2 says GET returns all topics including archived rows so the management page can render both sections; the picker uses "a separate query (see Phase 5)" — but Phase 3 never defines that separate query. Phase 5 §2 says "fetch the user's non-archived topics (`GET /api/topics?archived=false` -- the API already returns non-archived by default; archived rendering is purely a management-page concern)". The contradictions: (1) Phase 5 invents a query parameter Phase 3 doesn't list; (2) "returns non-archived by default" contradicts Phase 3's "filtering happens client-side on the management page"; (3) the symmetric material_formats endpoint stays consistent (one GET, client-side archived filter). The implementer is left guessing.
- **Fix A ⭐ Recommended**: Make GET /api/topics symmetric with GET /api/material-formats
  - Strength: GET returns all rows; both management page and picker filter client-side. Mirrors formats; Phase 3 contract already includes `archived_at`.
  - Tradeoff: Slightly larger payload on `/session/new` mount (negligible — small per-user row counts per plan's perf section).
  - Confidence: HIGH — matches material_formats handling already in plan.
  - Blind spot: Update Phase 5 §2 to drop the `?archived=false` mention and describe the client-side filter explicitly.
- **Fix B**: Add `?archived=false` query param to GET /api/topics
  - Strength: Smaller payload to picker; explicit server-side filter.
  - Tradeoff: Asymmetry with /api/material-formats; Phase 3 §2 needs a new bullet documenting the param and its default; more endpoint behavior to test.
  - Confidence: MEDIUM — adds endpoint surface without proportionate benefit at small row counts.
  - Blind spot: Default behavior choice (`archived=false` vs `archived=all`) shapes management-page request — must be pinned down.
- **Decision**: FIXED via Fix A — Phase 3 §2 contract simplified to a single shape (mirrors formats); Phase 5 §2 now describes client-side `archived_at IS NULL` filtering for both fetches.

### F3 — `<Select>` "no selection" representation unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 §2 + Critical Implementation Details §3
- **Detail**: Critical Implementation Details say "Send `null` (not omit the field, not empty string)". But shadcn `<Select>` (Radix) rejects empty-string `<SelectItem value="">` and warns on empty-string `value`. The plan never describes how the Select's string state maps to wire-format `null`.
- **Fix**: Specify the convention in Phase 5 §2 — e.g., use a sentinel `"__none__"` on the `<SelectItem>` for "No topic" / "No format", keep React state as `string | null` (translate sentinel → null), and send `state ?? null` in the POST body.
- **Decision**: FIXED — Critical Implementation Details §3 now spells out the Radix sentinel-value convention.

### F4 — Duplicate topic / format name collision returns generic 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §2-§3 (POST + PATCH /api/topics), Phase 4 §2-§3
- **Detail**: Both `topics` and `material_formats` have `UNIQUE (owner_id, name)` (20260531182506_sessions_data_foundation.sql:36, 62). Creating a topic with a name the user already has, or renaming to a collision, returns PG error 23505 — endpoint surfaces it as raw 500 via `error.message`. The plan handles FK-violation 500 on `/api/sessions` ("acceptable") but the duplicate-name path IS user-triggerable via the rename / add UI; user sees a Postgres error string.
- **Fix**: In POST/PATCH for topics and material-formats, detect Postgres unique violation (`error.code === "23505"`) and return 409 with `{ error: "A topic with that name already exists" }`. Add one integration test per endpoint covering the duplicate path.
- **Decision**: FIXED — Phase 3 §2/§3 and Phase 4 §2/§3 contracts now mandate the 23505→409 handler; Phase 3 §8 and Phase 4 §7 test intents extended with duplicate-name + rename-collision cases.

### F5 — Progress 6.8 has no corresponding success-criteria bullet in Phase 6 body

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 6 Success Criteria vs. Progress §Phase 6
- **Detail**: Progress entry `6.8 After merge + deploy: npm run db:types:prod produces no diff` exists, but Phase 6's Manual Verification section lists only 5 bullets (matching 6.3-6.7). The post-deploy step appears only in the Implementation Note at the bottom of Phase 6. Per `references/progress-format.md`, Progress mirrors Success Criteria 1:1.
- **Fix**: Add a sixth Manual Verification bullet to Phase 6: "After merge + deploy, `npm run db:types:prod` produces no diff (or commit the diff if any)" — keeps Progress 6.8 1:1 with a real success criterion.
- **Decision**: FIXED — Phase 6 Manual Verification now includes the post-deploy db:types:prod bullet; Implementation Note slimmed to reference it.
