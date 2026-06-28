---
date: 2026-06-28T09:57:37Z
researcher: pawel
git_commit: af981f7fa65917d5ffe43c0557da59765f5dabbe
branch: test-sessions-ext
repository: plpabla/pomosapiens
topic: "Test plan refresh after S-02: ground picker-fetch risk + e2e categorization-wedge gap + §6.3 cookbook generalization"
tags: [research, test-plan, e2e, jsdom, categorize-sessions-topic-format, energy-picker]
status: complete
last_updated: 2026-06-28
last_updated_by: pawel
---

# Research: Test plan refresh 2026-06-28

**Date**: 2026-06-28T09:57:37Z
**Researcher**: pawel
**Git Commit**: af981f7fa65917d5ffe43c0557da59765f5dabbe
**Branch**: test-sessions-ext
**Repository**: plpabla/pomosapiens

## Research Question

Ground three bounded edits to [context/foundation/test-plan.md](../../foundation/test-plan.md) called out in [change.md](change.md):

1. Add §2 risk row: "Pre-session picker init fetch silently fails — student lands on degraded /session/new with no warning."
2. Extend §3 Phase 4 e2e scope to cover the categorization wedge end-to-end (topic + format → dashboard chip).
3. Rename §6.3 cookbook from "Adding a test for a new session API endpoint" to a generalized RLS-bearing user-owned-table guide; cite topics + material-formats tests as additional reference patterns.

Anchor evidence: [src/components/session/EnergyPicker.tsx:40-48](../../../src/components/session/EnergyPicker.tsx#L40-L48), [tests/e2e/session-capture.spec.ts](../../../tests/e2e/session-capture.spec.ts), [src/pages/dashboard.astro](../../../src/pages/dashboard.astro), and impl-review F2 from the S-02 archive.

## Summary

All three refresh items are grounded by current source. Key findings:

- **F2 is still live in source.** The S-02 impl-review marked F2 "Decision: FIXED" but [src/components/session/EnergyPicker.tsx:40-48](../../../src/components/session/EnergyPicker.tsx#L40-L48) shows no `.catch()`, no `loadError` state, no UI fallback. The change.md correctly anchors a new test-plan risk on the unmerged fix.
- **Both /api/topics and /api/material-formats return 401/500 with `{ error: string }` on auth/RLS/Supabase failures.** The picker treats the JSON envelope as the success shape, so any non-200 response causes a runtime read of `topicsData.topics`/`formatsData.formats` against `undefined` — the `useEffect` rejects silently because there's no `.catch()`. Failure scenario is concrete, not hypothetical.
- **Cheapest layer for risk #7 is jsdom integration on picker mount.** Infrastructure is wired ([vitest.config.ts](../../../vitest.config.ts) jsdom project, [tests/unit/_setup.ts](../../../tests/unit/_setup.ts) helpers), but **no precedent yet for component-mount tests or fetch-stubbing in jsdom**. This is a new pattern.
- **E2E gap is real and cheap to close.** [tests/e2e/session-capture.spec.ts](../../../tests/e2e/session-capture.spec.ts) never touches the topic/format selects, and [src/pages/dashboard.astro:133-152](../../../src/pages/dashboard.astro#L133-L152) gates the chip line on `session.topic !== null || session.material_format !== null` — a render path with no automated gate today. Five system-seeded `material_formats` rows (Video / Reading / Writing code / Drilling problems / Other) are visible to every user via NULL-owner RLS, so the e2e can pick one without any per-user fixture work; topics ship empty so the topic side needs a seeded row.
- **§6.3 has four ready-to-cite reference files** for the generalization: `tests/integration/api/{topics,material-formats}.{create,update}.test.ts`. They already follow L-01 column-scope discipline (verified in the impl-review's "Notes on what passed").

## Detailed Findings

### Area 1 — Picker-fetch risk (new §2 row)

**Current behavior — silent failure path:**

[src/components/session/EnergyPicker.tsx:40-48](../../../src/components/session/EnergyPicker.tsx#L40-L48):

```tsx
useEffect(() => {
  void Promise.all([
    fetch("/api/topics").then((r) => r.json() as Promise<{ topics: Topic[] }>),
    fetch("/api/material-formats").then((r) => r.json() as Promise<{ formats: MaterialFormat[] }>),
  ]).then(([topicsData, formatsData]) => {
    setTopics(topicsData.topics.filter((t) => t.archived_at === null));
    setFormats(formatsData.formats.filter((f) => f.archived_at === null));
  });
}, []);
```

- No `.catch()` on the promise chain. No `loadError` state, no inline notice.
- The `as Promise<{ topics: Topic[] }>` cast lies on non-200: both API handlers return `{ error: string }` on 401 (unauthenticated) and 500 (Supabase misconfigured, RLS error, query error). See [src/pages/api/topics/index.ts:8-24](../../../src/pages/api/topics/index.ts#L8-L24) and [src/pages/api/material-formats/index.ts:8-27](../../../src/pages/api/material-formats/index.ts#L8-L27).
- On error, `topicsData.topics` is `undefined`, the `.filter` throws inside the `.then`, the rejection is swallowed by the floating `void`, and the dropdowns render as their initial empty state — "No topic" / "No format" only. The user has no way to tell the load failed.

**Sister components prove the pattern is wrong:**

The impl-review F2 ([context/archive/2026-06-27-categorize-sessions-topic-format/reviews/impl-review.md:33-41](../../archive/2026-06-27-categorize-sessions-topic-format/reviews/impl-review.md#L33-L41)) explicitly contrasts EnergyPicker against `TopicManager` and `MaterialFormatManager`, both of which set a `loadError` state. The picker was the outlier; the disposition was "FIXED" but the diff did not land on `main` (current `test-sessions-ext` HEAD `af981f7` still carries the unguarded `useEffect`). The change.md acknowledges this in step 1: "backport F2 fix as the first response."

**Critical-path multiplier:**

- Picker is mounted on [src/pages/session/new.astro](../../../src/pages/session/new.astro) as `<EnergyPicker client:load />` — the single pre-session route.
- S-01 PRD guardrail caps the pre-session journey at three taps; if the picker silently degrades, a user trying to log a topic they care about will instead start an uncategorized session and only notice on the dashboard.
- S-03 (editable timer presets) and S-04 (session notes + focus chart) will both extend pre-session UI; logical re-touches of EnergyPicker.tsx and dashboard.astro raise the chance a future change reshapes the fetch path. The risk is forward-loaded, not just a regression on S-02.

**Cheapest layer — jsdom integration on picker mount:**

- Vitest jsdom project is wired: [vitest.config.ts:28-32](../../../vitest.config.ts#L28-L32). `environment: "jsdom"`, `setupFiles` point at [tests/unit/_setup.ts](../../../tests/unit/_setup.ts), include glob covers `tests/unit/**/*.test.ts`.
- Existing helpers in `_setup.ts`: `dispatchVisibilityChange`, `stubAudioGlobal`, `createAudioMock` — no fetch-stubbing helper yet.
- Existing jsdom tests are hook/utility level only: `tests/unit/timer/{useFocusTimer,audio}.test.ts` and `tests/unit/session/resolveSessionPageAccess.test.ts`. **No precedent for a `.tsx` component-mount test.**
- Grep for `vi.stubGlobal('fetch'`, `global.fetch`, `vi.spyOn(globalThis, 'fetch')`, `msw` across `tests/unit/` returned zero matches. The fetch-mocking pattern is a fresh decision (likely `vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(...))` paired with `@testing-library/react`'s `render` + `findByText`).

**Likely test shape (for the §2 "cheapest layer" column):**

```ts
// tests/unit/session/EnergyPicker.test.tsx
// Stub fetch → resolve 500/network-error for /api/topics
// render(<EnergyPicker />); await waitFor(() => screen.getByText(/load failed/i))
// Assert the load-error UI is visible AND the dropdowns are still rendered
// (degraded mode is usable per F2 fix recommendation).
```

### Area 2 — E2E categorization-wedge gap (extend §3 Phase 4)

**Current spec coverage:**

[tests/e2e/session-capture.spec.ts:23-69](../../../tests/e2e/session-capture.spec.ts#L23-L69) walks dashboard → energy pick (Medium) → Start → Stop early → rate 4 → dashboard history card visible. **It never clicks the Topic or Material format select.** The dashboard assertion is `getByText("medium")` + `getByText("★ 4 / 5")`. No assertion on the chip line.

**Render target:**

[src/pages/dashboard.astro:133-152](../../../src/pages/dashboard.astro#L133-L152) — the chip line is gated:

```astro
{(session.topic !== null || session.material_format !== null) && (
  <div class="flex flex-wrap gap-1.5">
    {session.topic !== null && (<span ... title={session.topic.name}>{session.topic.name}</span>)}
    {session.material_format !== null && (<span ... title={session.material_format.name}>{session.material_format.name}</span>)}
  </div>
)}
```

A regression that breaks the join (e.g. `topic:topics(name)` embed alias rename), the picker's POST payload (`topic_id` / `material_format_id` keys), or the chip render block would all silently produce a session card with no chip line. Nothing automated catches that today.

**Fixture support for seeding:**

- [tests/e2e/_fixtures/](../../../tests/e2e/_fixtures/) currently contains `auth.ts` (re-export of `setupTwoUsers` / `seedAuthCookie`) and `sessions.ts` (`insertSession` via service-role client). **No `insertTopic` or `insertMaterialFormat` helper exists yet.**
- Migration [supabase/migrations/20260531182506_sessions_data_foundation.sql:115-120](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L115-L120) seeds five `material_formats` rows with `owner_id = NULL`: Video, Reading, Writing code, Drilling problems, Other. They are visible to every authenticated user via the `material_formats_select_own_or_default` RLS policy.
- `topics` table ships empty — see same migration's intent comment.

**Cheapest path to coverage:**

- Format: pick a system-seeded row (e.g. "Writing code") — zero fixture work.
- Topic: insert one row via service role in `beforeAll` — requires a new `insertTopic(userId, name)` helper modeled on [tests/e2e/_fixtures/sessions.ts](../../../tests/e2e/_fixtures/sessions.ts)'s `insertSession`. Roughly 10 lines.

**Playwright locators (no precedent in repo for shadcn Select):**

EnergyPicker uses shadcn `<Select>` over Radix. `SelectTrigger` has `aria-label="Topic"` / `aria-label="Material format"`; `SelectItem` renders with `role="option"`. Recommended pattern:

```ts
await page.getByRole("combobox", { name: "Topic" }).click();
await page.getByRole("option", { name: topicName }).click();
await page.getByRole("combobox", { name: "Material format" }).click();
await page.getByRole("option", { name: "Writing code" }).click();
```

Dashboard chip assertion is cheap and unambiguous — names render only inside the chip span, nowhere else on /dashboard:

```ts
await expect(page.getByText(topicName)).toBeVisible();
await expect(page.getByText("Writing code")).toBeVisible();
```

**Spec placement recommendation:**

Extend [tests/e2e/session-capture.spec.ts](../../../tests/e2e/session-capture.spec.ts) rather than add a sibling. The spec is already the "full session capture flow" gate; categorization is the next stage of the same wedge, not a separate concern. ~15 lines extra (insertTopic in `beforeAll`, two combobox interactions in the test body, two chip assertions before the final `getByText("★ 4 / 5")` check). Same fixture setup, same auth path. A separate spec would re-do the auth → /session/new walk for no isolation benefit.

### Area 3 — §6.3 cookbook generalization

Current §6.3 ([context/foundation/test-plan.md:140-150](../../foundation/test-plan.md#L140-L150)) is titled "Adding a test for a new session API endpoint" but reads as a generic L-01 column-scope guide. The rename to something like "Adding a test for a new RLS-bearing user-owned-table endpoint" is purely discoverability. Four already-shipped reference files extend the canonical reference set:

- [tests/integration/api/topics.create.test.ts](../../../tests/integration/api/topics.create.test.ts) — POST: "owner_id from body is ignored (L-01 regression)", 23505 duplicate-name 409, name-length cap.
- [tests/integration/api/topics.update.test.ts](../../../tests/integration/api/topics.update.test.ts) — PATCH: cross-user 409 byte-identical with not-found, archive/unarchive, rename collision 409.
- [tests/integration/api/material-formats.create.test.ts](../../../tests/integration/api/material-formats.create.test.ts) — POST: same L-01 pattern, name-length cap.
- [tests/integration/api/material-formats.update.test.ts](../../../tests/integration/api/material-formats.update.test.ts) — PATCH: includes the **seeded-format-protection** test (NULL-owner row PATCH returns 409). Worth calling out separately in the cookbook because that's a distinct invariant beyond cross-user.

The impl-review explicitly notes "L-01 two-layer column-scope holds on every new write endpoint; no `.passthrough()`, no `parsed.data` spread" ([context/archive/2026-06-27-categorize-sessions-topic-format/reviews/impl-review.md:75-76](../../archive/2026-06-27-categorize-sessions-topic-format/reviews/impl-review.md#L75-L76)) — meaning these files are pattern-compliant and safe to cite.

pgTAP siblings already exist and are referenced in §4 of the test plan: [supabase/tests/rls_topics.sql](../../../supabase/tests/rls_topics.sql), [supabase/tests/rls_material_formats.sql](../../../supabase/tests/rls_material_formats.sql).

### Area 4 — Forward-looking regression vectors

The change.md asserts S-03 + S-04 will both touch EnergyPicker.tsx and dashboard.astro. The roadmap does not name those files literally; the inference is logical:

- **S-03 ("Editable timer presets and count-up mode")** — adds preset selection somewhere on the pre-session screen (where EnergyPicker lives) and changes session-save logic. Roadmap entry: see [context/foundation/roadmap.md](../../foundation/roadmap.md) S-03 row.
- **S-04 ("Session notes + focus-rating chart")** — adds chart on history view (dashboard.astro) and a free-text field on session end. Roadmap entry: same file, S-04.

The picker-fetch risk and the e2e gap protect the same code surface against both upcoming slices. Both gates pay for themselves twice.

## Code References

- [src/components/session/EnergyPicker.tsx:40-48](../../../src/components/session/EnergyPicker.tsx#L40-L48) — silent-swallow `useEffect` (F2 anchor)
- [src/pages/session/new.astro](../../../src/pages/session/new.astro) — picker mount, `client:load`
- [src/pages/api/topics/index.ts:8-24](../../../src/pages/api/topics/index.ts#L8-L24) — GET handler; 401/500 response shapes
- [src/pages/api/material-formats/index.ts:8-27](../../../src/pages/api/material-formats/index.ts#L8-L27) — GET handler; 401/500 response shapes
- [src/pages/dashboard.astro:133-152](../../../src/pages/dashboard.astro#L133-L152) — chip render block
- [tests/e2e/session-capture.spec.ts:23-69](../../../tests/e2e/session-capture.spec.ts#L23-L69) — current e2e, no chip assertion
- [tests/e2e/_fixtures/sessions.ts](../../../tests/e2e/_fixtures/sessions.ts) — `insertSession` (pattern to copy for `insertTopic`)
- [tests/unit/_setup.ts](../../../tests/unit/_setup.ts) — jsdom helpers (no fetch helper yet)
- [vitest.config.ts:28-32](../../../vitest.config.ts#L28-L32) — jsdom project config
- [supabase/migrations/20260531182506_sessions_data_foundation.sql:115-120](../../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L115-L120) — five NULL-owner seeded material_formats
- [tests/integration/api/topics.create.test.ts](../../../tests/integration/api/topics.create.test.ts), [tests/integration/api/topics.update.test.ts](../../../tests/integration/api/topics.update.test.ts), [tests/integration/api/material-formats.create.test.ts](../../../tests/integration/api/material-formats.create.test.ts), [tests/integration/api/material-formats.update.test.ts](../../../tests/integration/api/material-formats.update.test.ts) — reference patterns for §6.3 generalization
- [supabase/tests/rls_topics.sql](../../../supabase/tests/rls_topics.sql), [supabase/tests/rls_material_formats.sql](../../../supabase/tests/rls_material_formats.sql) — pgTAP siblings

## Architecture Insights

- **API error contract is uniform.** All four user-owned-table endpoints return `{ error: string }` with statuses 200/201/400/401/409/500 — no 404, no `fieldErrors`. The picker's `r.json() as Promise<{ topics: Topic[] }>` cast is the only place this contract is broken at the consumer end. A jsdom test that mocks fetch to return `{ error: "Unauthorized" }` with status 401 is the exact reproduction of F2.
- **L-01 two-layer column-scope is universal.** Every new write endpoint (topics + material-formats) ships with default-strip `z.object` + hand-picked `.insert/.update`. The §6.3 generalization documents an already-established convention; it isn't proposing a new rule.
- **NULL-owner default rows are a deliberate fixture lever.** The five system-seeded material_formats let any e2e exercise the "user picked a format" path without per-user setup. Topics deliberately ship empty (no system defaults) — a stylistic choice that pushes "first-row UX" into S-02. Worth a comment in the e2e spec so a future contributor doesn't add seed topics by mistake.
- **The jsdom project has helpers for visibility + audio but not for network.** The L-02/L-03 lessons drove the existing helper set; L-01 didn't because integration-level fetch through `SELF.fetch` (Workers pool) covered it. Adding a component-mount + fetch-stub pattern is a new capability the §6.2 cookbook will need a row for once it lands.

## Historical Context (from prior changes)

- [context/archive/2026-06-27-categorize-sessions-topic-format/reviews/impl-review.md:33-41](../../archive/2026-06-27-categorize-sessions-topic-format/reviews/impl-review.md#L33-L41) — F2 finding text, marked `Decision: FIXED`. Current source contradicts the disposition; the change.md treats F2 as a still-open backport target.
- [context/archive/2026-06-27-categorize-sessions-topic-format/reviews/impl-review.md:73-79](../../archive/2026-06-27-categorize-sessions-topic-format/reviews/impl-review.md#L73-L79) — "Notes on what passed" confirms L-01 holds on all S-02 endpoints (greenlight for §6.3 reference citations).
- [context/archive/2026-06-21-testing-api-contract/](../../archive/2026-06-21-testing-api-contract/) — Phase 1 rollout. Original §6.3 was written here.
- [context/archive/2026-06-24-testing-schema-validation-gate/](../../archive/2026-06-24-testing-schema-validation-gate/) — Phase 3 rollout. Established post-deploy smoke + `db:types` diff gate.
- [context/archive/2026-06-26-testing-e2e-session-capture-flow/](../../archive/2026-06-26-testing-e2e-session-capture-flow/) — Phase 4 rollout. Wrote the session-capture.spec.ts being extended now.

## Related Research

- [context/archive/2026-06-27-categorize-sessions-topic-format/research.md](../../archive/2026-06-27-categorize-sessions-topic-format/research.md) — S-02 research; covers the topic/format schema, the `material_formats_select_own_or_default` RLS pattern, and the dashboard embed-alias choice that this refresh's e2e extension would gate.
- [context/archive/2026-06-26-testing-e2e-session-capture-flow/](../../archive/2026-06-26-testing-e2e-session-capture-flow/) — original e2e spec design; documents the locator rules now codified in §6.5.

## Open Questions

- **Does the picker fix the change.md asks us to "backport" exist anywhere in git history?** Worth a `git log --all -S "loadError" -- src/components/session/EnergyPicker.tsx` before the planning phase to see whether F2's FIXED diff exists on a stale branch we can cherry-pick — saves rewriting it.
- **Should the new §2 risk row's "must challenge" column call out the cast lie (`as Promise<{ topics: Topic[] }>`) explicitly?** That's the typed-but-untrue pattern most likely to recur in future fetch sites; surfacing it in the risk row could pay forward beyond this single fix.
- **§6.3 rename — does "user-owned table" cover the seeded-default case** ([material-formats.update.test.ts](../../../tests/integration/api/material-formats.update.test.ts) seeded-row PATCH 409)? The seeded rows are NOT user-owned (`owner_id IS NULL`) but flow through the same endpoint and share the same regression family. A title like "RLS-bearing user-owned (or system-seeded) table endpoint" is clearer but heavy; planning step should pick wording.
