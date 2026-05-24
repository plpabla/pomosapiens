---
bootstrapped_at: 2026-05-21T19:03:18Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: pomo-sapiens
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: pomo-sapiens
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

A solo, after-hours developer shipping a 3-week MVP for a formal-education student persona, with required auth (federated identity + email/password) and an aspirational weekly synthesized-insights step held in scope when picking the stack. The recommended default for `(web, js)` is the 10x Astro Starter — Astro + React + TypeScript + Tailwind + bundled database/auth/storage + edge runtime — which clears all four agent-friendly gates (typed, convention-based, popular in training data, well documented) and gets auth + persistence working without integration glue. Cloudflare Pages is the starter's first deployment default and matches the medium-scale, low-QPS, small-data profile in PRD frontmatter. CI runs on GitHub Actions with auto-deploy on merge — the standard solo / small-team flow. `has_ai` is set because the v1 stretch goal (weekly insights) needs LLM access; the edge runtime can host a weekly request-driven LLM call without standing up a background-job system, so `has_background_jobs` stays false. Payments and realtime are explicitly out of scope per PRD non-goals.

## Pre-scaffold verification

| Signal       | Value                                                          | Severity | Notes                                                                                                                  |
| ------------ | -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| npm package  | not run                                                        | n/a      | cmd_template starts with `git clone` — no npm CLI is invoked at scaffold time, so no package version to read           |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17      | fresh    | from card.docs_url; fetched via unauthenticated `curl` to `api.github.com` (gh CLI was not authenticated in this env)  |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20 (19 silent, 1 sidelined as `.scaffold` sibling)
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold
**.gitignore handling**: moved silently (no pre-existing `.gitignore` in cwd, so no append-merge needed)
**.bootstrap-scaffold cleanup**: deleted (empty after move-up)

### Move-up detail

Silently moved into cwd:

- `.env.example`
- `.github/`
- `.gitignore`
- `.husky/`
- `.nvmrc`
- `.prettierrc.json`
- `.vscode/`
- `README.md`
- `astro.config.mjs`
- `components.json`
- `eslint.config.js`
- `node_modules/` (773 packages installed during `npm install`)
- `package-lock.json`
- `package.json`
- `public/`
- `src/`
- `supabase/`
- `tsconfig.json`
- `wrangler.jsonc`

Sidelined as `.scaffold` sibling:

- `CLAUDE.md` → `CLAUDE.md.scaffold` (cwd already had a `CLAUDE.md` from the 10xDevs Module 1 Lesson 3 context — preserved verbatim per the conflict matrix; diff against `CLAUDE.md.scaffold` to see what the starter shipped)

Dropped (per `context/**` rule): none — the scaffold tree did not carry a `context/` directory.

Pre-cloned `.git/` was deleted before move-up so the upstream starter history does not leak into this project.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 — the two direct findings (`@astrojs/check`, `wrangler`) are both moderate; the single HIGH (`devalue`) is transitive.

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** (transitive, range `5.6.3 - 5.8.0`) — GHSA-77vg-94rm-hx3p "Svelte devalue: DoS via sparse array deserialization" (CVSS 7.5, CWE-770). Pulled in via the Astro language server chain. `fixAvailable: true`.

#### MODERATE findings

- **@astrojs/check** (direct, `>=0.9.3`) — vulnerable via `@astrojs/language-server`. Fix requires `@astrojs/check@0.9.2` (a semver-major downgrade).
- **@astrojs/language-server** (transitive) — vulnerable via `volar-service-yaml`. Affects `@astrojs/check`.
- **@cloudflare/vite-plugin** (transitive, range `<=0.0.0-fff677e35 || 0.0.7 - 1.37.2`) — vulnerable via `miniflare`, `wrangler`, `ws`. `fixAvailable: true`.
- **miniflare** (transitive, range `<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260518.0`) — vulnerable via `ws`. Affects `@cloudflare/vite-plugin`, `wrangler`. `fixAvailable: true`.
- **volar-service-yaml** (transitive, `<=0.0.70`) — vulnerable via `yaml-language-server`. Affects `@astrojs/language-server`.
- **wrangler** (direct, range `<=0.0.0-kickoff-demo || 3.108.0 - 4.93.0`) — vulnerable via `miniflare`. Affects `@cloudflare/vite-plugin`. `fixAvailable: true`.
- **ws** (transitive, range `8.0.0 - 8.20.0`) — GHSA-58qx-3vcg-4xpx "ws: Uninitialized memory disclosure" (CVSS 4.4, CWE-908). `fixAvailable: true`.
- **yaml** (transitive, range `2.0.0 - 2.8.2`) — GHSA-48c2-rrv3-qjmp "yaml is vulnerable to Stack Overflow via deeply nested YAML collections" (CVSS 4.3, CWE-674). Affects `yaml-language-server`.
- **yaml-language-server** (transitive) — vulnerable via `yaml`. Affects `volar-service-yaml`.

#### LOW / INFO findings

None.

### Audit metadata

- Total dependencies installed: 895 (prod 430, dev 316, optional 131, peer 24).
- `npm audit` exit code: 1 (informational — non-zero is expected when advisories exist; bootstrapper does not gate on this).
- Remediation hint (from `npm audit`): `npm audit fix` for non-breaking fixes; `npm audit fix --force` for the `@astrojs/check` major downgrade chain. Bootstrapper does NOT run either — the user decides.

## Hints recorded but not acted on

| Hint                       | Value                  |
| -------------------------- | ---------------------- |
| bootstrapper_confidence    | first-class            |
| quality_override           | false                  |
| path_taken                 | standard               |
| self_check_answers         | null                   |
| team_size                  | solo                   |
| deployment_target          | cloudflare-pages       |
| ci_provider                | github-actions         |
| ci_default_flow            | auto-deploy-on-merge   |
| has_auth                   | true                   |
| has_payments               | false                  |
| has_realtime               | false                  |
| has_ai                     | true                   |
| has_background_jobs        | false                  |

These hints were carried through from the hand-off but bootstrapper v1 does not act on them (no CI scaffolding, no auth wiring, no feature-flag-driven template branching). They are recorded here for the future M1L4 ("Memory Architecture") skill to consume.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` (the 10xDevs lesson copy) and decide which guidance to merge — `diff CLAUDE.md CLAUDE.md.scaffold`.
- Address audit findings per your project's risk tolerance — the single HIGH (`devalue`) is transitive and has `fixAvailable: true`; the two direct moderates (`@astrojs/check`, `wrangler`) can be updated via `npm audit fix` (note the `@astrojs/check` fix is a semver-major downgrade).
- Copy `.env.example` to `.env` and fill in the Supabase + Cloudflare secrets before running `npm run dev`.
