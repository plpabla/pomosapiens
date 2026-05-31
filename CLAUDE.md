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

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
