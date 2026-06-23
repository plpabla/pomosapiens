# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Astro dev, Cloudflare workerd runtime via `@astrojs/cloudflare`)
- `npm run build` — production SSR build
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint with type-checked rules (`strictTypeChecked` + `stylisticTypeChecked` + React + Astro + a11y)
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes `prettier-plugin-astro` + `prettier-plugin-tailwindcss`)
- `npx supabase start` / `npx supabase stop` — local Supabase stack (Docker required)
- `npx wrangler deploy` — deploy to Cloudflare Workers

Pre-commit (`.husky/`) runs `lint-staged`: `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`. Don't bypass with `--no-verify` — fix the underlying issue.

## Architecture

Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components, deployed to Cloudflare Workers.

### Rendering mode

Full SSR (`output: "server"` in `astro.config.mjs`). All pages are server-rendered by default. **API routes (`src/pages/api/**`) must export `const prerender = false;`** — see `@src/pages/api/auth/signin.ts` for the pattern. Without it the Cloudflare adapter will try to prerender and fail at build.

### Auth flow

- `@src/lib/supabase.ts` — creates a Supabase SSR client (`@supabase/ssr`) with cookie-based sessions. Reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server` (server-only secrets declared in `astro.config.mjs` `env.schema`). Returns `null` when env is unconfigured; callers must handle that case.
- `@src/middleware.ts` — runs on every request. Resolves the current user via Supabase and attaches it to `context.locals.user`. Redirects unauthenticated requests for paths in the `PROTECTED_ROUTES` array. Add new protected paths there. `AUTHED_REDIRECTS` is the symmetric counterpart — an exact-path map that sends signed-in visitors elsewhere (seeded with `/` → `/dashboard`); add authed-only redirects there.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Example protected page: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` → `./src/*` (tsconfig paths). Always use `@/` imports, not relative `../../`.
- **Astro vs React**: Astro components for static content/layout; React components only when interactivity is needed. No Next.js directives (`"use client"` etc.) — Astro decides hydration via `client:*` directives.
- **Tailwind class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Don't concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style. Install new ones with `npx shadcn@latest add <name>`. Aliases defined in `components.json`.
- **API routes**: uppercase `GET` / `POST` exports; validate request bodies with zod schemas living in `src/lib/schemas/` (see `@src/lib/schemas/auth.ts`). Parse with the helper in `@src/lib/parse-request.ts`.
- **Supabase migrations**: `supabase/migrations/` using filename format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React Compiler is enabled** (`eslint-plugin-react-compiler` set to error). Don't add manual `useMemo` / `useCallback` micro-optimizations — the compiler handles them.

### Environment

- Node.js v24.11.1 (`.nvmrc`).
- `SUPABASE_URL` / `SUPABASE_KEY` — copy `.env.example` → `.env` for Node tooling, and copy to `.dev.vars` for Cloudflare local dev. Both are gitignored.
- `SUPABASE_SERVICE_ROLE_KEY` — required for `npm test`; never read by app code or referenced in `astro.config.mjs` `env.schema`. Add to `.dev.vars` locally and to CI secrets for the test step.
- Local Supabase Studio: `http://localhost:54323` after `npx supabase start`. Project uses only the built-in `auth.users` table — no migrations required for auth.
- Production secrets: `npx wrangler secret put SUPABASE_URL` / `npx wrangler secret put SUPABASE_KEY`.

### CI

`.github/workflows/ci.yml` runs lint + build on push and PR to `master`. Requires `SUPABASE_URL` / `SUPABASE_KEY` repository secrets for the build step (Astro `astro:env` validates them at build).

### Database workflow

- `npm run db:start` / `npm run db:stop` — local Supabase stack (Docker required).
- `npm run db:reset` — drop and re-apply all migrations from `supabase/migrations/`.
- `npm run db:migrate:new <name>` — scaffold a new timestamped migration file. Filename format: `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables in the same migration (see "Supabase migrations" under Key conventions).
- `npm run db:types` — regenerate `src/db/database.types.ts` from the local DB schema. Re-run after every schema change and commit the output so CI's `lint + build` doesn't need a running Supabase to typecheck. The Supabase client in `src/lib/supabase.ts` is typed as `SupabaseClient<Database>` — the generated file is the source of that type.
- `npm run db:test` — run pgTAP suites under `supabase/tests/`, the cross-user RLS regression net required by the privacy NFR. One file per RLS-bearing table (e.g., `rls_sessions.sql`). Each file wraps its fixtures in `BEGIN … ROLLBACK` so it leaves no persistent state. **Local prerequisite before opening a PR** (not yet wired into CI).

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 1

Open Module 3 by producing a **durable, risk-first quality contract** before any test is written — then drive each rollout phase through the standard change chain.

```
PRD + roadmap + archive
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategy §1–§5 frozen + cookbook §6 grows)
        │
        ▼  (one rollout phase at a time, /clear between handoffs)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` is a **stateful orchestrator**, not a one-shot generator. On first run it writes the phased rollout to `context/foundation/test-plan.md`. On every subsequent run it re-derives state from on-disk artifacts and presents the next handoff. The lesson focus is **strategy and rollout sequencing, not configuration**. Hooks, MCP servers, and CI YAML are configured in later lessons of this module.

### Task Router - Where to start

| Skill                                               | Use it when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quality strategy as a rules-file (lesson focus)** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/10x-test-plan`                                    | You have a PRD (and ideally a roadmap and a few archived slices) and you are about to write the project's first tests, or you noticed that AI-generated tests are landing on helpers while critical flows go uncovered. First invocation runs discovery (PRD + roadmap + archive + hot-spot scan), a 5-question user interview, and a synthesis pass with a mandatory challenger check, then writes `test-plan.md` in `context/foundation/` with a risk map (5–7 failure scenarios), a phased rollout table, a stack table, a quality-gates table, a cookbook section (`§6`, fills in as phases ship), and a negative-space section (what we deliberately don't test). Subsequent invocations advance the rollout one handoff at a time. |
| `/10x-test-plan --status`                           | A `test-plan.md` already exists and you want a compact snapshot of where the rollout stands — which phases are `not started`, `change opened`, `researched`, `planned`, `implementing`, or `complete`, and what the next action is. Does no work; safe to run any time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/10x-test-plan --refresh`                          | A `test-plan.md` already exists and one of: a new top-3 risk surfaced from the roadmap or archive, a tool's `checked:` date is older than three months, the project's tech stack changed, or §7 negative-space no longer matches what the team believes. Opens a new `test-plan-refresh-<YYYY-MM-DD>` change folder rather than editing the guide in place.                                                                                                                                                                                                                                                                                                                                                                              |

### Rollout chain — what happens after the guide is written

The guide's §3 _Phased Rollout_ table is the orchestrator's state. For each non-`complete` row the orchestrator selects the next handoff based on which artifacts exist in `context/changes/<change-id>/`:

| State on disk                                | Next handoff                                                   | Status transitions to       |
| -------------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| change folder missing                        | `/10x-new <change-id>`                                         | `change opened`             |
| `change.md` only                             | `/10x-research` (with a risks-to-verify brief)                 | `researched`                |
| `+ research.md`                              | `/10x-plan` (with cost × signal + cookbook-update constraints) | `planned`                   |
| `+ plan.md` with pending `## Progress` items | `/10x-implement <change-id> phase <N>`                         | `implementing` / `complete` |
| `+ plan.md` fully `[x]`                      | Mark §3 row `complete`; loop to next pending row               | —                           |

Each handoff is a **STOP point**. The orchestrator copies the next command to the clipboard, asks the user to `/clear` and run it, then exits. Re-invoke `/10x-test-plan` (no arguments) to advance.

### Risk-first prioritization rules

- Risks are **failure scenarios in user / business terms**, not test names. "Logged-out user reaches paid content via stale token" is a risk; "test the login form" is not.
- 5 to 7 risks. Fewer is too coarse; more makes prioritization useless.
- Impact and likelihood are user/business ratings, not technical complexity.
- Every risk traces to a source: PRD section, archived slice, roadmap entry, Phase 2 interview question, hot-spot **directory** with churn count, or a tech-stack constraint. No invented risks.
- **Signal, not knowledge.** §2 cites _evidence that raised the risk_, never a file as "where the failure lives." File:line anchors, function names, schema names, and module names are forbidden in §2 — they belong in `/10x-research`'s output, produced per rollout phase against current code. The plan is a QA spec; it is not a code audit.
- Coverage is not the metric. **Risk coverage** is the metric.

### Dual-layer mapping rules

- Classic layer first: the cheapest test that gives a real signal wins. Promote to e2e only when no cheaper layer covers the risk.
- AI-native layer second, and only where it adds signal classic tests do not give cheaply.
- Every AI-native row has a **"When NOT to use"** line. If you cannot write one, drop the row.
- Every tool name carries a `checked: <YYYY-MM-DD>` date. Tool names are examples of the category, not endorsements.
- Both layers must be non-empty in the final guide if the project warrants them. Classic-only is a 2020 plan; AI-native-only is hype. AI-native phases are not mandatory — include them only when the brief justified them under cost × signal.

### Quality gates rules

- Required gates (lint, typecheck, unit+integration, e2e on critical flows) must map to actual CI steps. If a required gate is not yet wired, mark it as `required after §3 Phase <N>` and let the named rollout phase wire it.
- Post-edit hook is **recommended local**, not a CI substitute.
- Multimodal visual review is **selective**, applied to 1–3 critical screens, not to every page.
- Vision-driven fallback (Anthropic Computer Use or OpenAI CUA) is reserved for DOM-unreachable surfaces; expensive per action.

### Cookbook patterns (§6) — fills in over time

`test-plan.md` is both a phased strategy and a **growing cookbook**. §6 starts as placeholders (`TBD — see §3 Phase <N>`) and fills in incrementally — each rollout phase's plan ends with a sub-phase that updates the relevant §6 entry (location, naming, reference test, run command). After Module 3 completes, §6 becomes the canonical answer to "how do I add a test for X in this project?" — and is what `/10x-tdd` reads in Lesson 2.

### Lesson boundaries

- Do not write test code. That is Lesson 2 (`/10x-tdd` and unit-test authoring).
- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch or write GitHub Actions YAML. The guide names gates; configuration is owned by Module 1 Lesson 5 and Module 2 Lesson 5.
- Do not benchmark multimodal models. Cite criteria (cost, latency, agent-friendliness), never a ranking.
- Do not read the codebase for knowledge (call graphs, schemas, "which file owns this failure"). That is `/10x-research`'s job, per rollout phase.

### Paths used by this lesson

- `context/foundation/test-plan.md` — the quality contract produced and maintained by `/10x-test-plan`
- `context/foundation/prd.md` — primary risk source
- `context/foundation/roadmap.md` — likelihood weighting
- `context/foundation/tech-stack.md` — stack input (when present)
- `context/archive/<change-id>/plan.md` — implemented risk surface
- `context/changes/<change-id>/` — per-rollout-phase change folder (one per row in §3)

<!-- END @przeprogramowani/10x-cli -->
