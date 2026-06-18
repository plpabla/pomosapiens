---
project: PomoSapiens
platform: Cloudflare Workers
based_on: context/changes/deployment/platform-research.md
tech_stack: context/foundation/tech-stack.md
planned_at: 2026-05-27
scope: first production deploy (manual), CI/CD documented as follow-up
worker_name: pomo-sapiens
status: deployed (2026-05-27) — live at https://pomo-sapiens.p-blaszczy.workers.dev, version dd002261-81bb-4444-a563-5857b4451890
---

# Deploy Plan — PomoSapiens → Cloudflare Workers (first production deploy)

## Context

`platform-research.md` selected **Cloudflare Workers** as the MVP deployment platform, and `tech-stack.md` (`deployment_target: cloudflare-workers`) confirms it. The repo is already wired for it — `@astrojs/cloudflare` adapter, `output: "server"`, `wrangler.jsonc` with `nodejs_compat`, env schema in `astro.config.mjs`. The remaining gap is **operational, not architectural**: production runtime secrets are not yet set, and the app has never been deployed.

This plan produces the first production deploy via a manual `wrangler deploy`. Per the agreed scope, Cloudflare Workers Builds (native git auto-deploy) is **documented as a follow-up gate**, not executed here.

Two prerequisites from research are still open and gate the deploy:

- `[ ] secrets on prod` — `SUPABASE_URL` / `SUPABASE_KEY` not yet in Workers Secrets.
- [x] Worker `name` in `wrangler.jsonc` is still the starter default `10x-astro-starter` → **rename to `pomo-sapiens`** before first deploy, so the production URL is `pomo-sapiens.<subdomain>.workers.dev` from the start. Renaming after deploy creates a second Worker and orphans the old URL.

## Verified current state (repo inspection, 2026-05-27)

| Item                       | State                                                                                                                                                     | Note                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `astro.config.mjs`         | adapter `cloudflare()`, `output: "server"`, env schema declares both SUPABASE vars `context:"server" access:"secret" optional:true`                       | ✅ correct                                                               |
| `wrangler.jsonc`           | `main: @astrojs/cloudflare/entrypoints/server`, `compatibility_date: 2026-05-08`, `compatibility_flags: ["nodejs_compat"]`, `observability.enabled: true` | ✅ correct; `name` = `10x-astro-starter` → **rename**                    |
| `package.json`             | astro `^6.3.1`, `@astrojs/cloudflare` `^13.5.0`, wrangler `^4.95.0`; **no `deploy` script**                                                               | deploy is manual `npx wrangler deploy`                                   |
| `wrangler login`           | done (research)                                                                                                                                           | agent can deploy unattended                                              |
| Prod secrets               | not set                                                                                                                                                   | **blocks deploy**                                                        |
| `.dev.vars`                | missing                                                                                                                                                   | only affects local dev, not prod deploy                                  |
| `src/lib/supabase.ts`      | reads `SUPABASE_URL`/`SUPABASE_KEY` from `astro:env/server`, returns `null` if unset                                                                      | ⚠️ silent — see Assessment risk #2                                       |
| `.github/workflows/ci.yml` | triggers on `master`; default branch is `main`; lint+build only, no deploy                                                                                | ⚠️ branch mismatch — out of this plan's deploy scope, noted as follow-up |

## Plan

> **Execution order revised (2026-05-27):** Step 1 (set secrets) cannot run before the Worker exists — `wrangler secret put` / `secret list` fail with `Worker "pomo-sapiens" not found` until a first deploy creates it. Since both SUPABASE vars are `optional:true` in the env schema, secrets are moved to **after** the first deploy. **Revised order: Step 0 → Step 2 (build) → Step 3 (deploy, creates Worker) → Step 1 (set secrets, auto-rolls a new version) → Step 4 (smoke-test) → Step 5.** Step numbers below are kept as originally written; only the run order changed.

### Step 0 — Rename the Worker (one-line config edit) — ✅ DONE (2026-05-27)

- In `wrangler.jsonc`, change `"name": "10x-astro-starter"` → `"name": "pomo-sapiens"`.
- **Verify:** `npx wrangler deploy --dry-run` reports the worker name as `pomo-sapiens` and completes with no errors.
- **Result:** `wrangler.jsonc` line 3 confirmed `"name": "pomo-sapiens"` (rename already in place). Config rename verified by file inspection.
- **Note — `--dry-run` failed (expected):** `npx wrangler deploy --dry-run` errored with `The entry-point file at "@astrojs/cloudflare/entrypoints/server" was not found`. This is expected, not a config problem: the `main` entrypoint is generated into `./dist` by the Astro build, which hasn't run yet (that's Step 2). The dry-run / deploy only succeed post-build, so this verification effectively folds into Step 2 once `./dist` exists.

### Step 1 — Set production runtime secrets (human-supplied values, agent-run commands) — ✅ DONE (2026-05-27, RAN AFTER STEP 3)

> Reordered: runs after the first deploy (Step 3) creates the Worker. Setting a secret on the live Worker automatically rolls a new version that includes it.

- `npx wrangler secret put SUPABASE_URL`
- `npx wrangler secret put SUPABASE_KEY`
- Values come from `.env` (Supabase Project Settings → API: Project URL + anon public key). These are runtime secrets, separate from any CI build-time vars.
- **Verify:** `npx wrangler secret list` shows both `SUPABASE_URL` and `SUPABASE_KEY`.
- **Result:** both values read from local `.env` and piped to `wrangler secret put` (non-interactive; values never echoed). Both uploaded successfully; `wrangler secret list` confirms `SUPABASE_URL` + `SUPABASE_KEY` as `secret_text`. Setting the secrets auto-rolled a new Worker version.
- **Watch-item for smoke test:** `SUPABASE_KEY` value length is 46 chars — shorter than a classic Supabase anon JWT (~200+ chars), consistent with the newer `sb_publishable_…` key format. Step 4's `/dashboard`-redirect check is the positive signal that the key actually resolves at runtime; if auth misbehaves, re-check the `.env` key first.

### Step 2 — Production build — ✅ DONE (2026-05-27)

- `npm run build` (`astro build`). Astro's `astro:env` validates the env schema at build; the vars are `optional:true` so build won't fail if absent, but a clean build confirms the Cloudflare adapter output landed in `./dist`.
- **Verify:** build exits 0; `./dist` exists with the Worker entrypoint.
- **Result:** build exited 0 (server built in 17.48s, output `server`, adapter `@astrojs/cloudflare`). `./dist/{client,server}` present. Post-build `npx wrangler deploy --dry-run` now completes cleanly (1910 KiB upload, bindings SESSION/IMAGES/ASSETS resolved) — this also satisfies Step 0's deferred dry-run verification. One benign warning: `@astrojs/sitemap` skipped (no `site` option set) — out of deploy scope.

### Step 3 — Deploy to Workers (NOT Pages) — ✅ DONE (2026-05-27)

- `npx wrangler deploy` — **never `wrangler pages deploy`** (the two are not interchangeable; the `@astrojs/cloudflare` adapter dropped Pages support).
- **Verify:** command prints the deployed `*.workers.dev` URL and a version ID; `npx wrangler deployments list` shows the new active deployment.
- **Result:** Worker `pomo-sapiens` created and deployed. Live URL: **https://pomo-sapiens.p-blaszczy.workers.dev** . Active version ID: `4eccff65-9e95-4671-977e-ee3331aa0275`. A KV namespace `pomo-sapiens-session` (`26495bc31b7d448e82e563630afe64ba`) was auto-provisioned for the SESSION binding. Bindings resolved: SESSION, IMAGES, ASSETS. `wrangler deployments list` confirms the version active at 100%. (Secrets not yet set — auth will no-op until Step 1 runs next.)

### Step 4 — Smoke-test the live deploy — ✅ DONE (2026-05-27)

- Open `https://pomo-sapiens.<subdomain>.workers.dev/` — landing page renders (SSR).
- Hit a protected route `/dashboard` unauthenticated → expect redirect to `/auth/signin` (confirms middleware + Supabase client initialized, i.e. secrets are wired, not silently `null`).
- **Result:** all checks pass against `https://pomo-sapiens.p-blaszczy.workers.dev`:
  - `GET /` → **200** (SSR landing renders).
  - `GET /dashboard` (unauth) → **302 → /auth/signin** (middleware runs).
  - `GET /auth/signin` → **200**.
  - **Stronger secrets-resolved proof:** `POST /api/auth/signin` with dummy creds (and a matching `Origin` header to pass Astro's CSRF check) → **302 → /auth/signin?error=Invalid login credentials**. This is a _real Supabase auth rejection_, not the `Supabase is not configured` no-op path — so the 46-char publishable `SUPABASE_KEY` resolves at runtime and the request reaches Supabase. Watch-item from Step 1 closed positively.
  - **CSRF note:** a POST without an `Origin` header returns **403** (Astro's built-in `checkOrigin`). Expected; real browser form submits send `Origin` automatically.
  - `wrangler tail` during the click-through: both auth POSTs logged as `Ok`, **no unhandled exceptions**, no `nodejs_compat` runtime failures.
- Exercise the auth path (sign-in page loads, `astro:env/server` resolved Supabase — no 500s).
- `npx wrangler tail` while clicking through — watch for runtime exceptions, especially `nodejs_compat`-related failures that only surface in workerd, not local Node.
- **Verify:** landing + auth pages return 200, `/dashboard` redirects correctly, `wrangler tail` shows no unhandled exceptions.

### Step 5 — Record rollback handle — ✅ DONE (2026-05-27)

- Note the active version ID from `wrangler deployments list`. Rollback if needed: `npx wrangler rollback [version-id]` (seconds).
- **Caveat:** Supabase schema migrations do NOT roll back with the Worker — they are forward-only and reverted separately in Supabase.
- **Result — current LIVE version (fully configured): `dd002261-81bb-4444-a563-5857b4451890`** (Source: `Secret Change`, created 2026-05-27T14:05:21Z). This is the version to keep; it includes both secrets. Earlier versions this session: `4eccff65-…` (first code deploy, pre-secrets), `5446fddd-…`, plus an intermediate secret-set version — all pre-secret or partial, so rolling back to them would lose the configured key. The meaningful rollback target for a _future_ bad deploy is whatever the last-known-good is at that time; today's known-good handle is **`dd002261-81bb-4444-a563-5857b4451890`**. Rollback command: `npx wrangler rollback dd002261-81bb-4444-a563-5857b4451890`.

## Assessment (anti-bias carry-over from research)

Risks the plan actively guards against, each tied to its source lens:

1. **Pages-vs-Workers split-brain** (Devil's advocate). Mitigated: Step 3 mandates `wrangler deploy`, explicitly forbids `pages deploy`. Step 0 dry-run catches config drift before a live mutation.
2. **Secrets silently missing → app degrades, not crashes** (Research finding). `supabase.ts` returns `null` when vars are unset, so a deploy with no secrets would _look_ fine but every auth call would no-op. Mitigated: Step 1 sets secrets before deploy; Step 4's `/dashboard`-redirect check is the positive signal that secrets actually resolved at runtime.
3. **workerd ≠ Node — npm deps fail only at runtime** (Unknown unknowns). `nodejs_compat` is already set. Mitigated: Step 4 runs `wrangler tail` against the live isolate, the only place these surface.
4. **Edge round-trips to single-region Supabase** (Pre-mortem). Out of scope for first deploy; acceptable for MVP. Revisit Hyperdrive only if going global.
5. **Weekly-insights LLM inline in SSR hits CPU limits** (Devil's advocate / Pre-mortem). Not in this deploy (feature not built). Flagged for when it lands: Cron Triggers + Queues on the $5 plan, never inline.

**Approval boundary:** Steps 0–5 are agent-runnable. Human-only (not in this plan): rotating the primary `SUPABASE_KEY`, altering/dropping Supabase tables, deleting the Worker, changing the billing plan.

## Out of scope (documented follow-ups, not executed here)

- **CI branch mismatch** — ✅ FIXED (`ci.yml` now triggers on `main`).

## CI/CD runbook — Cloudflare Workers Builds (manual, dashboard-only)

> Chosen path (2026-05-27): **Cloudflare Workers Builds** (Option B), deploy-on-push to `main`. This is dashboard clickops + GitHub OAuth — it cannot be scripted in-repo, so it's a manual runbook for the operator. GitHub Actions (`ci.yml`) stays as the PR lint/build check.

**Gating note:** Workers Builds runs its own build Cloudflare-side and does NOT read GitHub Actions status — the two run independently. To honor "deploy only if lint+build pass," fold lint into the Cloudflare build command (below) so a lint failure fails the build and skips the deploy.

Steps:

1. Cloudflare Dashboard → **Workers & Pages → `pomo-sapiens` → Settings → Build** → **Connect** to Git.
2. Authorize GitHub, select this repository.
3. **Production branch:** `main`.
4. **Build command:** `npm run lint && npm run build` (the `&& lint` is what enforces the gate within Workers Builds).
5. **Deploy command:** `npx wrangler deploy` (NOT `pages deploy`).
6. **Root directory:** `/` (default).
7. **Build-time environment variables:** add `SUPABASE_URL` and `SUPABASE_KEY` (Astro's `astro:env` validates them at build). These are _build-time_ vars — separate from the _runtime_ Worker Secrets already set in Step 1, which persist independently.
8. Save → next push/merge to `main` triggers a build → deploy. Optionally disable non-production-branch builds (or enable PR preview builds) per preference.

**Verify:** push a trivial commit to `main` → Workers Builds shows a green build → `wrangler deployments list` shows a new version with Source ≠ `Upload`.

- **`.dev.vars`** — local-dev only; create by copying `.env` if running `npm run dev` against workerd. Does not affect production deploy.
- **Custom domain, multi-region/HA, Docker** — explicitly out of MVP scope.

## Verification summary (end-to-end)

Deploy is successful when: `wrangler deployments list` shows `pomo-sapiens` active with a version ID; the live `*.workers.dev` URL serves the SSR landing page (200); unauthenticated `/dashboard` redirects to `/auth/signin`; and `wrangler tail` shows no unhandled exceptions during a click-through of landing + auth pages. Rollback handle (version ID) recorded for instant `wrangler rollback`.
