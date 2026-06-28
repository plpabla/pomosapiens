# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Non-negotiable rules

- do not try to read any passwords from .env files and similar. Request setting them as env variables and use those varaibles instead.

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

`.github/workflows/ci.yml` runs lint + build on push and PR to `master`. Requires `SUPABASE_URL` / `SUPABASE_KEY` repository secrets for the build step (Astro `astro:env` validates them at build). Post-deploy schema validation gates (smoke + db:types diff) are wired in `.github/workflows/smoke.yml` -- see `context/changes/testing-schema-validation-gate/runbook.md` for one-time operator setup.

### Database workflow

- `npm run db:start` / `npm run db:stop` — local Supabase stack (Docker required). Note: if Docker is not runnig, request starting it and only after getting confirmation from the user, continue.
- `npm run db:reset` — drop and re-apply all migrations from `supabase/migrations/`.
- `npm run db:migrate:new <name>` — scaffold a new timestamped migration file. Filename format: `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables in the same migration (see "Supabase migrations" under Key conventions).
- `npm run db:types` — regenerate `src/db/database.types.ts` from the local DB schema. Re-run after every schema change and commit the output so CI's `lint + build` doesn't need a running Supabase to typecheck. The Supabase client in `src/lib/supabase.ts` is typed as `SupabaseClient<Database>` — the generated file is the source of that type.
- `npm run db:test` — run pgTAP suites under `supabase/tests/`, the cross-user RLS regression net required by the privacy NFR. One file per RLS-bearing table (e.g., `rls_sessions.sql`). Each file wraps its fixtures in `BEGIN … ROLLBACK` so it leaves no persistent state. **Local prerequisite before opening a PR** (not yet wired into CI).
- `npm run test:e2e` — run all Playwright e2e specs (requires Supabase running and env vars set). First time: run `npx playwright install chromium` first.
- `npx playwright install chromium` — one-time browser setup after checkout; re-run after major `@playwright/test` version bumps.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
