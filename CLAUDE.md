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
- `@src/middleware.ts` — runs on every request. Resolves the current user via Supabase and attaches it to `context.locals.user`. Redirects unauthenticated requests for paths in the `PROTECTED_ROUTES` array. Add new protected paths there.
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
- Local Supabase Studio: `http://localhost:54323` after `npx supabase start`. Project uses only the built-in `auth.users` table — no migrations required for auth.
- Production secrets: `npx wrangler secret put SUPABASE_URL` / `npx wrangler secret put SUPABASE_KEY`.

### CI

`.github/workflows/ci.yml` runs lint + build on push and PR to `master`. Requires `SUPABASE_URL` / `SUPABASE_KEY` repository secrets for the build step (Astro `astro:env` validates them at build).

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
