# review-agent

Standalone CLI that reviews a `git diff` with an LLM and prints one JSON document to stdout. Not part of the Astro app — self-contained package, excluded from the repo's lint/typecheck/build (see [context/changes/review-agent/plan.md](../context/changes/review-agent/plan.md)).

## Install

```bash
cd review-agent
npm install
```

## Run

```bash
git diff | npx tsx review-agent/review.ts
```

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | — | Read from `process.env`, never from a file in code. |
| `OPENROUTER_MODEL` | no | `anthropic/claude-sonnet-5` | Any OpenRouter model id. |
| `OPENROUTER_MAX_COST` | no | `0.5` | USD cap for a single review call (`stopWhen: maxCost(...)`). |

Copy `.env.example` to `.env` for local runs (gitignored); the agent loads `review-agent/.env` automatically regardless of your current working directory.

## Output contract (CI-readiness)

- **stdout** carries exactly one JSON document: `{ review, totalScore, cost }`. Nothing else is ever written there.
- **stderr** carries all logs, warnings, and errors.
- **Exit code** is non-zero on: empty/missing stdin diff, missing `OPENROUTER_API_KEY`, no `submit_review` tool call, or a schema-validation failure. Exit code is `0` only when a valid review was produced and printed.

These three properties (explicit input, stdout-purity, exit-code gate semantics) are what let a future CI workflow pipe this command's output straight into `jq` and gate a merge on it, with no changes to the agent itself.
