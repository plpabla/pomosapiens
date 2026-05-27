---
project: PomoSapiens
researched_at: 2026-05-26
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 6 (SSR) + React 19
  runtime: Cloudflare workerd (edge), via @astrojs/cloudflare; Supabase as external auth + DB
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project is already wired to `@astrojs/cloudflare` + `wrangler` (`output: "server"`, `npx wrangler deploy`), so Cloudflare scores 5/5 on the agent-friendly criteria _and_ costs nothing to adopt — switching to any other platform means swapping the adapter for zero benefit. Its flat, predictable $5/mo tier (10M requests) avoids the usage-spike risk of Vercel/Netlify, and Cron Triggers on that tier cover the aspirational weekly-insights step without standing up a background-job system. The single correction needed: the stack frontmatter still says `cloudflare-pages`, but the current `@astrojs/cloudflare` adapter has dropped Pages support — **Workers is the only path**, which CLAUDE.md already reflects.

## Platform Comparison

| Platform               | CLI-first | Managed/Serverless | Agent docs | Stable deploy API | MCP/Integration    | Verdict |
| ---------------------- | --------- | ------------------ | ---------- | ----------------- | ------------------ | ------- |
| **Cloudflare Workers** | Pass      | Pass               | Pass       | Pass              | Pass               | **5/5** |
| **Netlify**            | Pass      | Pass               | Pass       | Pass              | Pass               | 5/5     |
| **Vercel**             | Pass      | Pass               | Pass       | Pass              | Partial (MCP beta) | ~4.5    |
| Railway                | Pass      | Pass               | Partial    | Pass              | Partial            | ~4      |
| Fly.io                 | Pass      | Partial            | Pass       | Pass              | Partial            | ~3.5    |
| Render                 | Partial   | Pass               | Partial    | Partial           | Fail               | ~3      |

Per-platform notes:

- **Cloudflare Workers** — `wrangler deploy / rollback / tail` gives the full operational loop from a terminal; runs on fully managed edge isolates (no OS surface to misconfigure); docs published as `llms.txt` + markdown on GitHub; deterministic deploy with versioned rollback; official Cloudflare MCP servers across Workers/observability. The only `Partial`-adjacent caveat is that its edge advantage is wasted on a single-region app whose data all lives in one Supabase region.
- **Netlify** — matches Cloudflare on all five criteria (official Netlify MCP server, first-class Astro support via `@astrojs/netlify`), but on-demand rendering runs as serverless Functions with cold starts (~800ms–1.5s after idle), and adopting it requires swapping the adapter. No flat-rate request bundle comparable to Workers' $5/10M.
- **Vercel** — excellent DX and Astro SSR support via `@astrojs/vercel`, but the platform is most differentiated for Next.js, the Vercel MCP is still beta (status checked 2026-05-26), and usage-based bandwidth/function billing can push a hobby project to $30–40/mo after a traffic spike. 10s function limit on free.
- **Railway** — strong DX, persistent Node process (`@astrojs/node`) which would suit a future always-on LLM worker, $5/mo hobby with usage credits — but usage-based cost is less predictable, docs are less agent-optimized, and a persistent process is more operational surface than this stateless MVP needs.
- **Fly.io** — `flyctl` is a clean CLI and persistent VMs suit long-lived processes, but it requires a Dockerfile and managed-VM operations (more to misconfigure), which contradicts the managed/low-surface preference for an MVP.
- **Render** — free static hosting spins down after 15 min idle (30–50s cold start), which would violate the PRD's 200ms-feedback guardrail; SSR needs a $7/mo web service; CLI/deploy-API and agent integration are the weakest of the pool.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Wins on every criterion and on the decisive fact that the codebase is already built for it. Flat predictable pricing, Cron Triggers for the weekly-insights stretch, Durable Objects available if persistent connections ever become a must-have (you flagged this as possible-future, not MVP). Single-region target means its edge reach is unused but harmless.

#### 2. Netlify

The cleanest serverless alternative — equal on criteria, official MCP, first-class Astro. The gap vs. Cloudflare: an adapter swap for no functional gain, serverless cold starts, and no flat-rate request tier. This is the platform to fall back to if Cloudflare's workerd runtime ever blocks a required dependency.

#### 3. Vercel

Best-in-class DX and solid Astro support, but its strengths are tuned for Next.js, its MCP is beta, and usage-based billing carries cost-spike risk that matters more than its DX edge given Cloudflare's DX is already good enough.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Pages-vs-Workers split-brain.** `tech-stack.md` frontmatter says `cloudflare-pages`, but the current `@astrojs/cloudflare` adapter dropped Pages support — Workers is the only path. `wrangler deploy` (Workers) and `wrangler pages deploy` (Pages) are **not interchangeable**; any CI/doc/script still referencing Pages breaks the deploy.
2. **workerd is not Node.** Workers run on V8 isolates, not Node. `@supabase/ssr` and any dependency assuming Node built-ins need `nodejs_compat`; a class of npm packages fail _only at runtime in the isolate_, never in a local Node test.
3. **CPU/duration limits bite the LLM stretch.** Free tier is 10ms CPU; even paid meters CPU-ms. Calling an LLM inline in an SSR route for weekly insights will hit timeouts — it must run via Cron Triggers + Queues/Durable Objects, primitives the team would need to learn.
4. **Dual local-secrets footgun.** CLAUDE.md documents `.env` (Node tooling) **and** `.dev.vars` (workerd) — two secret stores that drift, producing "works locally, fails in prod" surprises.
5. **Edge co-location illusion.** All dynamic data lives in single-region Supabase. From a global edge Worker, every auth/data call is a transcontinental round-trip to one region — "edge" adds a hop without latency benefit unless Hyperdrive is added.

### Pre-Mortem — How This Could Fail

The team shipped PomoSapiens on Cloudflare because the starter came pre-wired, and it carried the 3-week MVP fine. Six months later it's a mess. First crack: they kept the frontmatter's "Pages" mental model and pointed CI at `wrangler pages deploy`; when a feature needed a Workers-only binding, half the tooling didn't apply and a weekend vanished untangling Pages vs Workers config. Then weekly-insights landed — they called the LLM inline in an SSR route, hit Workers CPU/duration limits, and saw timeouts under real load; refactoring to Cron Triggers + Queues meant learning primitives they'd avoided. Meanwhile every Supabase auth check was a transcontinental hop from the edge to Supabase's single region, so "edge" bought nothing but cost a round-trip; p95 crept up and the 200ms-feedback guardrail slipped. A Node-only charting dependency failed at runtime in workerd with a cryptic error no local Node test caught. None were Cloudflare's fault — they were the price of treating an edge runtime like Node.

### Unknown Unknowns

- `astro dev` already runs the **workerd runtime via the adapter** — a separate `wrangler dev` / `wrangler pages dev` step is legacy for local fidelity in current `@astrojs/cloudflare`. Affects which Getting Started commands are correct.
- The project's own frontmatter (`cloudflare-pages`) is the stale artifact; CLAUDE.md already correctly says `npx wrangler deploy` (Workers). Correct the frontmatter to prevent future confusion.
- The free tier (100K req/day, 10ms CPU, **no Cron Triggers**) suffices for MVP, but the weekly-insights stretch _requires_ the $5 paid plan (Cron Triggers / Durable Objects) — budget for it the moment that feature lands.
- workerd npm-compatibility gaps surface at runtime, not build time — vet new dependencies against `nodejs_compat`, not just a successful `npm install`.
- "Going global later" is not free latency: with single-region Supabase you'd need Hyperdrive (extra setup) before the edge actually helps dynamic requests.

## Operational Story

- **Preview deploys**: `wrangler versions upload` creates a preview version with a unique `*.workers.dev` preview URL (not promoted to production traffic); promote with `wrangler versions deploy`. PR-driven previews come from the Cloudflare GitHub integration / a CI step. Preview URLs are public by default — gate sensitive previews with Cloudflare Access if needed.
- **Secrets**: production secrets live in Workers Secrets (`npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY`), readable only via the dashboard/API to account members; local dev reads `.env` (Node tooling) and `.dev.vars` (workerd) — both gitignored. Rotate by re-running `wrangler secret put` and redeploying.
- **Rollback**: `wrangler rollback [version-id]` reverts to a prior deployed version in seconds; `wrangler deployments list` shows history. Caveat: Supabase schema migrations do **not** roll back with the Worker — a deploy that shipped a migration needs a separate Supabase migration revert.
- **Approval**: an agent may run `wrangler deploy`, `wrangler versions upload`, `wrangler tail`, and `wrangler rollback` unattended. Human-only: rotating the primary `SUPABASE_KEY`, dropping/altering Supabase tables, deleting the Worker or project, and changing the billing plan — done by hand in the respective dashboard.
- **Logs**: `wrangler tail` streams live request/console/exception logs (supports `--status`, `--search`, `--format json`; may sample under high volume). Persisted logs and analytics via Workers Logs / Logpush and the Cloudflare MCP observability server for structured agent queries.

## Risk Register

| Risk                                                                            | Source                              | Likelihood | Impact | Mitigation                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI / scripts still target Pages (`wrangler pages deploy`) and break             | Devil's advocate                    | M          | H      | Correct `tech-stack.md` frontmatter to `cloudflare-workers`; confirm `.github/workflows/ci.yml` and any deploy script use `wrangler deploy`; never mix Pages/Workers commands |
| npm dependency fails at runtime in workerd despite clean install                | Unknown unknowns / Devil's advocate | M          | M      | Ensure `nodejs_compat` is set; smoke-test each new dependency under `astro dev` (workerd), not just Node; prefer Workers-compatible libs                                      |
| Weekly-insights LLM call inline in SSR route hits CPU/duration limit            | Devil's advocate / Pre-mortem       | M          | H      | Run LLM synthesis via Cron Triggers + Queues/Durable Objects on the $5 paid plan, never inline in a request path                                                              |
| Local/prod secret drift between `.env` and `.dev.vars`                          | Devil's advocate                    | M          | M      | Keep `.dev.vars` in sync with `wrangler secret` list; document the two stores in onboarding; consider a single source script                                                  |
| Edge round-trips to single-region Supabase add latency, regress 200ms guardrail | Pre-mortem / Unknown unknowns       | L          | M      | Single-region MVP: pin Worker + Supabase to nearby regions; revisit Hyperdrive only if/when going global                                                                      |
| Weekly-insights stretch silently requires $5 plan (no Cron on free)             | Unknown unknowns                    | M          | L      | Plan for $5/mo Workers Paid when the insights feature lands; free tier covers core MVP                                                                                        |
| Supabase migration not reverted on Worker rollback                              | Research finding                    | L          | M      | Treat schema migrations as separate, forward-only changes; document manual Supabase revert alongside `wrangler rollback`                                                      |

## Prerequisites (manual, human-only setup)

These accounts and resources must exist before the agent can deploy. None can be created from a deploy script — set them up by hand once.

- [x] **Node.js v22.14.0** (matches `.nvmrc`).
      _How:_ install via `nvm install 22.14.0 && nvm use 22.14.0` (or `fnm`/`volta`), then `npm install` in the repo. Verify with `node -v`.
      Version 24.11.1 installed

- [x] **Cloudflare account** (free tier is enough for the core MVP).
      _How:_ sign up at https://dash.cloudflare.com/sign-up, verify email. Run `npx wrangler login` to link the local CLI. Upgrade to **Workers Paid ($5/mo)** only when the weekly-insights stretch lands (Cron Triggers / Durable Objects are not on the free tier).

- [/] **Supabase account + project** (external auth + database).
  _How:_ sign up at https://supabase.com, create a new project (pick a region close to your users — single-region per the PRD). From **Project Settings → API**, copy the **Project URL** (`SUPABASE_URL`) and the **anon public key** (`SUPABASE_KEY`). These feed both local dev (`.env` / `.dev.vars`) and prod (`wrangler secret put`).
  - [x] secrets in .env
  - [ ] secrets on prod

- [x] **Federated identity provider** (required by PRD FR-001 — e.g. Google).
      _How:_ in Google Cloud Console create an OAuth 2.0 Client ID, add Supabase's callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI, then paste the client ID/secret into **Supabase → Authentication → Providers → Google** and enable it. Email/password auth is enabled by default in Supabase; confirm email confirmations are on under **Authentication → Sign In / Providers**.

- [x] **GitHub repository** (for CI build and optional preview deploys).
      _How:_ push the repo to GitHub; the existing `.github/workflows/ci.yml` runs lint + build on PRs. Add `SUPABASE_URL` / `SUPABASE_KEY` as repository secrets (**Settings → Secrets and variables → Actions**) so the build step passes Astro's `astro:env` validation.

- [ ] _(Optional)_ **Custom domain** in Cloudflare.
      _How:_ add the domain as a Workers route or custom domain in the dashboard; TLS is provisioned automatically. Skip for MVP — the `*.workers.dev` URL is sufficient.

## Getting Started

The project is already configured for Cloudflare Workers — these steps verify and ship, they don't re-scaffold.

- [x] **Authenticate wrangler**: `npx wrangler login` (interactive browser auth; run via `! npx wrangler login` in this session if needed).
- [x] **Correct the stale frontmatter**: change `deployment_target: cloudflare-pages` → `cloudflare-workers` in `context/foundation/tech-stack.md` so no future step reaches for Pages commands. _(done 2026-05-26)_
- [ ] **Local dev with platform fidelity**: just run `npm run dev` — `@astrojs/cloudflare` already runs the workerd runtime, so a separate `wrangler dev` is not needed for fidelity. Put local secrets in `.dev.vars`.
- [ ] **Set production secrets**: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
- [ ] **Deploy**: `npm run build` then `npx wrangler deploy` (Workers — **not** `wrangler pages deploy`). Verify with `wrangler deployments list`; tail with `wrangler tail`; roll back with `wrangler rollback` if needed.

## CI/CD — Deploy on push to main

Deployment is automated through **Cloudflare Workers Builds** (Cloudflare's native Git integration, GA as of 2026) — **not** GitHub Actions. Every push or merge to the `main` branch triggers a Cloudflare-hosted build that builds and deploys the Worker to production automatically. No deploy workflow or API token lives in the repo.

**Division of labor:**

- **GitHub Actions** (`.github/workflows/ci.yml`, unchanged) stays as the **quality gate** — it runs `npm run lint` + `npm run build` on pull requests. It does not deploy.
- **Cloudflare Workers Builds** owns **build + deploy** on push/merge to `main`.

**One-time setup (manual, in the Cloudflare dashboard):**

- [ ] Workers & Pages → select the Worker → **Settings → Builds → Connect**, and authorize the GitHub repo.
- [ ] Set the **production branch** to `main` (it defaults to the repo's default branch).
- [ ] Build command: `npm run build`. Deploy command: `npx wrangler deploy` — the deploy command is what promotes the build to the Active Deployment; without it the build only uploads a version.
- [ ] Add build-time variables `SUPABASE_URL` / `SUPABASE_KEY` in the Builds settings (these feed Astro's `astro:env` validation during build). Runtime secrets are still set separately via `wrangler secret put` (see Operational Story → Secrets).
- [ ] _(Optional)_ enable **non-production branch builds** to get preview URLs and PR comments for feature branches.

**Result:** merge to `main` → Cloudflare builds → auto-deploys to production. Roll back with `wrangler rollback` if a deploy goes bad (see Operational Story → Rollback).

> Note: `ci.yml` currently triggers on `master`, but the repo's default branch is `main` — that workflow may not be firing. Left unchanged per request; worth correcting separately if the lint gate is meant to run.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- Production-scale architecture (multi-region, HA, DR)
