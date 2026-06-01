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

### Database workflow

- `npm run db:start` / `npm run db:stop` — local Supabase stack (Docker required).
- `npm run db:reset` — drop and re-apply all migrations from `supabase/migrations/`.
- `npm run db:migrate:new <name>` — scaffold a new timestamped migration file. Filename format: `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables in the same migration (see "Supabase migrations" under Key conventions).
- `npm run db:types` — regenerate `src/db/database.types.ts` from the local DB schema. Re-run after every schema change and commit the output so CI's `lint + build` doesn't need a running Supabase to typecheck. The Supabase client in `src/lib/supabase.ts` is typed as `SupabaseClient<Database>` — the generated file is the source of that type.
- `npm run db:test` — run pgTAP suites under `supabase/tests/`, the cross-user RLS regression net required by the privacy NFR. One file per RLS-bearing table (e.g., `rls_sessions.sql`). Each file wraps its fixtures in `BEGIN … ROLLBACK` so it leaves no persistent state. **Local prerequisite before opening a PR** (not yet wired into CI).

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
