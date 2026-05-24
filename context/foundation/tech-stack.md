---
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
---

## Why this stack

A solo, after-hours developer shipping a 3-week MVP for a formal-education student persona, with required auth (federated identity + email/password) and an aspirational weekly synthesized-insights step held in scope when picking the stack. The recommended default for `(web, js)` is the 10x Astro Starter — Astro + React + TypeScript + Tailwind + bundled database/auth/storage + edge runtime — which clears all four agent-friendly gates (typed, convention-based, popular in training data, well documented) and gets auth + persistence working without integration glue. Cloudflare Pages is the starter's first deployment default and matches the medium-scale, low-QPS, small-data profile in PRD frontmatter. CI runs on GitHub Actions with auto-deploy on merge — the standard solo / small-team flow. `has_ai` is set because the v1 stretch goal (weekly insights) needs LLM access; the edge runtime can host a weekly request-driven LLM call without standing up a background-job system, so `has_background_jobs` stays false. Payments and realtime are explicitly out of scope per PRD non-goals.

**Updated 2026-05-24**: Boundary validation uses Zod — explicit schemas at API-route inputs and external payloads, with a `parseFormData()` / `parseJson()` helper in `@src/lib/parse-request.ts` returning `{ data, error }`. Operationalizes the starter's TypeScript-first discipline at request boundaries; the existing `as string` casts in `@src/pages/api/auth/*.ts` are the migration target.
