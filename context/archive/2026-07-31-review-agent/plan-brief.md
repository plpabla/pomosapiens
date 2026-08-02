# Review Agent — Plan Brief

> Full plan: `context/changes/review-agent/plan.md`
> Research: `context/changes/review-agent/research.md`

## What & Why

Build a standalone code-review agent: a self-contained ESM package that reads a `git diff` from stdin, calls an LLM via the `@openrouter/agent` SDK, and prints a single JSON document to stdout with a 10-criteria 0/1 rubric review, a computed `totalScore`, and the call's cost. The end goal is running it on PRs in CI — this change ships the CLI and makes it CI-ready without wiring the workflow yet.

## Starting Point

Nothing exists today. The repo is an Astro SSR + Supabase + Cloudflare app; the agent shares none of that architecture (it is a plain Node CLI script). The one real hazard is that a new top-level folder is, by default, swept into the repo's `eslint .`, `astro check`/`npm run build`, and pre-commit `lint-staged` — all of which would break unless the folder is explicitly excluded.

## Desired End State

`git diff | npx tsx review-agent/review.ts` (with `OPENROUTER_API_KEY` set) prints one JSON doc — `{ review, totalScore, cost }` — to stdout, all diagnostics to stderr, and exits non-zero on an empty diff. The repo's `npm run lint` and `npm run build` still pass with the new package present.

## Key Decisions Made

| Decision                | Choice                                                            | Why (1 sentence)                                                                 | Source   |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| SDK                     | `@openrouter/agent` (`callModel`) + `@openrouter/sdk` client     | The locked course-materials path; native cost, no `usage.include` flag needed.   | Research |
| Structured output       | Forced tool call (`toolChoice: "required"`, self-parse via zod)  | No `Output.object` equivalent in this SDK; forced tool + `ReviewResult.parse`.   | Research |
| Rubric                  | 6 base + 4 project criteria, scored 0/1; `totalScore` computed   | Project axes map to lessons L-01/L-03/L-06; we sum (LLMs miscount).              | Plan     |
| Project criteria        | rlsPrivacyIsolation, timerResilience, astroSsrBoundary, zodBoundaryValidation | Each targets a real, codified failure class in this repo.           | Plan     |
| Model                   | Env-configurable (`OPENROUTER_MODEL`), strong default, temp 0    | Swap per run in CI without code change; determinism for a future gate.           | Plan     |
| Language                | English                                                          | Matches codebase, comments, lessons; portable for PR comments/CI logs.           | Plan     |
| CI scope                | CLI now, CI-ready but not wired                                  | Focused/shippable; avoids forked-PR-secret design creeping in now.               | Plan     |
| Guards                  | temperature 0, fail-fast on empty diff, `maxCost` env cap (def. 0.5 USD) | Determinism + no silent no-op in CI + runaway-spend protection.          | Plan     |
| Packaging               | Flat self-contained folder, own `node_modules`, no workspace     | Keeps agent deps out of the Astro app's graph, lint, and Cloudflare build.       | Research |

## Scope

**In scope:** the `review-agent/` package (`package.json`, `tsconfig.json`, `review.ts`, `review-schema.ts`, `utils.ts`, `README.md`, `.env.example`, `.gitignore`); three root isolation edits (tsconfig `exclude`, eslint `ignores`, `.prettierignore`); stdin→JSON CLI with cost and guards.

**Out of scope:** any GitHub Actions workflow / `gh pr comment` / merge gate; npm workspaces; the Vercel AI SDK path; a sample-diff fallback; a token/diff-size guard; model-emitted totals.

## Architecture / Approach

A flat Node package at repo root, run via `tsx` with no build step. Data flow: `readDiff()` (stdin, fail-fast) → `callModel` with a single manual `submit_review` tool whose `inputSchema` is the zod `ReviewResult`, forced via `toolChoice: "required"` and bounded to one step → read `getToolCalls()[0].arguments`, `ReviewResult.parse(...)` it ourselves → compute `totalScore` → read cost from `getResponse().usage` → emit exactly one JSON doc on stdout. Isolation from the Astro app's lint/typecheck/build is achieved purely via the package's own configs plus three root-config exclusion entries.

## Phases at a Glance

| Phase                              | What it delivers                                              | Key risk                                                        |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| 1. Package scaffold + isolation    | Folder + configs; `npm run lint`/`build` still green         | Missing one exclusion silently breaks the repo's CI gates      |
| 2. Schema + reviewer prompt        | zod `ReviewResult` (10×0/1) + English prompt                 | `.describe()` contracts must tell the model to pass untouched project axes |
| 3. Agent core + output + docs      | stdin→forced-tool-call→single stdout JSON + guards + README  | Forced-tool-call loop bounding; keeping stdout to one JSON doc  |

**Prerequisites:** `OPENROUTER_API_KEY` available as an env var for manual verification; Node 24 (`.nvmrc`).
**Estimated effort:** ~1–2 sessions across 3 phases; the agent logic is small, the isolation and forced-tool-call plumbing carry the risk.

## Open Risks & Assumptions

- `getToolCalls()[0].arguments` shape/parsing is confirmed at implementation time; mitigated by always `ReviewResult.parse(...)`-ing it ourselves.
- Default model id must be re-checked against current OpenRouter availability when implementing.
- The `maxCost` cap bounds spend, not tokens — a very large diff could still overflow the context window (deferred to the CI slice).

## Success Criteria (Summary)

- `git diff | npx tsx review-agent/review.ts | jq .` yields one JSON doc with `review` (10 scored criteria + verdict + summary), a `totalScore` equal to the sum, and a non-null cost.
- Empty diff / missing key / parse failure all exit non-zero with stderr-only diagnostics.
- `npm run lint` and `npm run build` at repo root still pass with the package present.
