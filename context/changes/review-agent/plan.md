# Review Agent Implementation Plan

## Overview

Build a standalone code-review agent: a self-contained ESM package (`review-agent/` at repo root, **not** under `src/`, not part of the Astro app) that reads a `git diff` from stdin, calls an LLM through the `@openrouter/agent` SDK, and prints a **single JSON document to stdout** containing a zod-validated review (10 criteria scored 0/1), a computed `totalScore` (max 10), and the call's cost. Invocation:

```bash
git diff | npx tsx review-agent/review.ts
```

## Current State Analysis

- **No agent exists.** The repo is an Astro 6 SSR app (React islands, Supabase, Cloudflare Workers). The review agent shares none of that architecture — no `@/` alias, no middleware, no RLS, no Cloudflare runtime. It is a plain Node CLI script. See [research.md](research.md) "Architecture Insights".
- **The integration hazard is real, not hypothetical.** A new top-level folder is, by default, swept into three repo-wide gates:
  - `astro check` / `npm run build` — root [tsconfig.json:3](../../../tsconfig.json#L3) has `include: ["**/*"]`, so every `.ts` under the repo is type-checked.
  - `npm run lint` (`eslint .`) — [eslint.config.js:15](../../../eslint.config.js#L15) applies `strictTypeChecked` typed rules to every `.ts` the tsconfig sees, and [eslint.config.js:23](../../../eslint.config.js#L23) `no-console: "warn"` would flag the agent's `console.log`.
  - Pre-commit `lint-staged` — runs `eslint --fix` on staged `*.ts` (skips once eslint ignores the folder).
- **eslint ignores are the mechanism, not `.gitignore`.** [eslint.config.js:98](../../../eslint.config.js#L98) uses `includeIgnoreFile(gitignorePath)`, so eslint ignores whatever `.gitignore` ignores — but the agent's *source* must stay tracked, so it needs an **explicit** `ignores: ["review-agent/**"]` entry (mirroring the existing `{ ignores: ["src/db/database.types.ts", ".claude/**"] }` at [eslint.config.js:99](../../../eslint.config.js#L99)).
- **zod parity.** The app is on zod v4 (`^4.4.3`); the agent's own `package.json` will pin the same major, so schemas read the same. The code stays self-contained regardless.
- **SDK mechanics are locked** (research follow-up 2026-07-31): `@openrouter/agent` (`callModel`) + `@openrouter/sdk` (`OpenRouter` client), structured output via a **forced tool call**, native cost on `getResponse().usage.cost`. See [research.md](research.md) "Follow-up Research".

### Key Discoveries:

- Client bootstrap: `import OpenRouter from "@openrouter/sdk"` + `import { callModel, tool, maxCost } from "@openrouter/agent"`; `new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })` (Context7 `/openrouterteam/typescript-agent`).
- `toolChoice: "required"` is **not** interpreted by the SDK — it passes straight through to the OpenRouter API via the `...apiRequest` rest spread ([call-model.ts](https://github.com/openrouterteam/typescript-agent) line 107/117). This makes a forced-tool-call structured-output pattern work.
- Cost is native: `(await result.getResponse()).usage?.cost` (nullable), alongside `.inputTokens` / `.outputTokens`. No `usage: { include: true }` flag (that was the Vercel-AI-SDK path we did **not** take).
- Cost cap: `stopWhen: maxCost(dollars)` is a first-class stop condition helper.
- Tool-call arguments: `getToolCalls()` returns `ParsedToolCall<Tool>[]`; we read `[0].arguments` and **parse it ourselves** through `ReviewResult.parse(...)` so validation is guaranteed regardless of SDK internals.
- `readDiff` is Node-native (stdin via `!process.stdin.isTTY`) — no SDK dependency.

## Desired End State

Running `git diff | npx tsx review-agent/review.ts` (with `OPENROUTER_API_KEY` in the environment) prints exactly one JSON document to **stdout**:

```jsonc
{
  "review": { /* ReviewResult: 10 scored criteria + verdict + summary */ },
  "totalScore": 8,          // sum of the 10 criteria (computed, not model-emitted)
  "cost": { "cost_usd": 0.0123, "input_tokens": 1234, "output_tokens": 567, "model": "..." }
}
```

All progress/diagnostics go to **stderr**, so `git diff | npx tsx review-agent/review.ts > review.json` yields valid JSON. An **empty diff exits non-zero** with a stderr message. Crucially, `npm run lint` and `npm run build` at the repo root still pass with the new folder present.

### Verification of end state:

- `git diff | npx tsx review-agent/review.ts | jq .` parses and shows the three top-level keys.
- `echo "" | npx tsx review-agent/review.ts; echo $?` → non-zero, with a stderr error, no JSON on stdout.
- `npm run lint` and `npm run build` (repo root) exit 0 with `review-agent/` present.

## What We're NOT Doing

- **No GitHub Actions / CI wiring in this change.** We build the CLI and bake in the three CI-readiness contracts (explicit fail-fast input, stdout-purity, exit-code gate semantics) so the follow-up CI slice is drop-in, but no `.github/workflows/*` file, no `gh pr comment`, no forked-PR / `pull_request_target` security design here.
- **No npm workspace.** The package stays a flat, self-contained folder with its own `node_modules` — it must not enter the root dependency graph, lint config, or `astro sync`.
- **No Vercel AI SDK path** (`ai`, `@openrouter/ai-sdk-provider`, `Output.object`). That is only a shape reference now.
- **No sample-diff fallback.** The reference repo's no-pipe fallback to a sample file is deliberately dropped (not selected) — empty stdin is a hard error, so CI's no-TTY path can never silently review nothing.
- **No model-emitted total.** `totalScore` is derived by us; the model never sums.
- **No reading secrets from files in app/agent code.** The API key comes from `process.env.OPENROUTER_API_KEY` (project non-negotiable rule).

## Implementation Approach

Three phases, gated so the repo-isolation risk is proven before any agent logic is written:

1. **Scaffold the package and prove isolation** — the folder exists (with a trivial stub) and `npm run lint` + `npm run build` still pass. This de-risks the "breaks the whole repo" hazard first.
2. **Define the schema + prompt contract** — the zod `ReviewResult` and the English reviewer prompt, in isolation, type-checked by the package's own tsconfig.
3. **Wire the agent core** — stdin → forced-tool-call `callModel` (temperature 0, `maxCost` cap) → self-parse → assemble the single stdout JSON, with guards, exit codes, and a package README.

Cost/determinism guards confirmed with the user: **temperature 0**, **fail-fast on empty diff**, and a **max-cost cap read from an env var, defaulting to 0.5 USD**.

## Critical Implementation Details

**Forced-tool-call loop bounding.** With a manual tool (no `execute`) and `toolChoice: "required"`, the model emits the `submit_review` tool call on its first turn and there is nothing to execute. Bound the loop so it stops right after that emission (`stopWhen: [stepCountIs(1), maxCost(cap)]` or equivalent) and read the arguments off `getToolCalls()[0]`. Do not `allowFinalResponse` — we want the tool arguments, not a follow-up text turn. This ordering is the one non-obvious mechanic; the rest is plumbing.

**`.describe()` strings are the contract, not comments.** Every field's `.describe(...)` on the zod schema is serialized into the tool's `inputSchema` and fed to the model as its instructions. They are load-bearing. The four project-specific criteria need descriptions that explicitly tell the model to score `1` (pass) when the diff does not touch that concern — otherwise it will spuriously fail diffs that never went near RLS or the timer.

## Phase 1: Package Scaffold + Repo Isolation

### Overview

Create the `review-agent/` folder as a self-contained ESM package and make every repo-wide gate ignore it, proving `npm run lint` and `npm run build` still pass before any real code exists.

### Changes Required:

#### 1. Package manifest

**File**: `review-agent/package.json`

**Intent**: Declare the standalone ESM package with its own dependencies and a run script, isolated from the root package. Mirrors the reference repo's flat single-package shape.

**Contract**: `{ "name": "review-agent", "private": true, "type": "module", "scripts": { "review": "tsx review.ts" } }`. Dependencies: `@openrouter/sdk`, `@openrouter/agent`, `zod` (pin the same v4 major the app uses, `^4.4.3`), `dotenv`. devDependencies: `tsx`, `typescript`, `@types/node`. Run `npm install` **inside** `review-agent/` so its `node_modules` and `package-lock.json` are local; commit the lockfile for reproducible installs.

#### 2. Isolated TypeScript config

**File**: `review-agent/tsconfig.json`

**Intent**: Give the package its own strict type-checking in isolation so `tsx` and the editor still catch errors, without the app's tsconfig reaching in.

**Contract**: Standalone strict config (`"strict": true`, ESM module resolution suitable for `tsx`/Node — `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2022"` or later, `"types": ["node"]`). Do **not** extend the root `astro/tsconfigs/strict`. `include: ["*.ts"]`.

#### 3. Exclude from the app's type-check

**File**: `tsconfig.json` (root)

**Intent**: Stop `astro check` / `npm run build` from type-checking the agent package.

**Contract**: Add `"review-agent"` to the existing `exclude` array ([tsconfig.json:4](../../../tsconfig.json#L4)), alongside `"dist"` and `"tests/integration"`.

#### 4. Exclude from repo lint

**File**: `eslint.config.js` (root)

**Intent**: Stop `eslint .` (and thus pre-commit `lint-staged`) from applying typed rules + `no-console` to the agent.

**Contract**: Extend the existing global ignores block at [eslint.config.js:99](../../../eslint.config.js#L99) to include `"review-agent/**"` (i.e. `{ ignores: ["src/db/database.types.ts", ".claude/**", "review-agent/**"] }`). Cannot rely on `includeIgnoreFile` since the source stays git-tracked.

#### 5. Package-local ignores

**File**: `review-agent/.gitignore` and (root) `.prettierignore`

**Intent**: Keep the package's `node_modules` and local `.env` out of git, and keep `npm run format` from rewriting agent files.

**Contract**: `review-agent/.gitignore` lists `node_modules/` and `.env`. Add `review-agent/` to the root `.prettierignore` (create the file if absent). Note: root [.gitignore](../../../.gitignore) already matches nested `node_modules/` at any depth, so the package-local entry is belt-and-suspenders for `.env`.

#### 6. Stub entrypoint

**File**: `review-agent/review.ts`

**Intent**: A trivial placeholder so the folder is non-empty and the isolation can be verified before real logic lands.

**Contract**: A minimal ESM file (e.g. `console.log("review-agent stub")` or an empty top-level statement). Replaced in Phase 3.

### Success Criteria:

#### Automated Verification:

- Dependencies install inside the package: `cd review-agent && npm install` exits 0 and produces `review-agent/package-lock.json`.
- Repo lint still passes with the folder present: `npm run lint` (root) exits 0.
- Repo build still passes with the folder present: `npm run build` (root) exits 0.
- The package type-checks in isolation: `cd review-agent && npx tsc --noEmit` exits 0.

#### Manual Verification:

- `git status` shows `review-agent/` source files tracked but `review-agent/node_modules` and `review-agent/.env` untracked.
- Staging and committing a change under `review-agent/` does not trip the `lint-staged` pre-commit hook on those files.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Review Schema + Reviewer Prompt

### Overview

Define the zod `ReviewResult` (6 base + 4 project-specific criteria, scored 0/1) and the English reviewer prompt, with `.describe()` contracts that guide the model — in isolation, before wiring the SDK.

### Changes Required:

#### 1. Review schema

**File**: `review-agent/review-schema.ts`

**Intent**: The single source of truth for the structured output the model must produce, and the derived-total helper. Ten criteria, each `{ score: 0|1, rationale: string }`, plus `verdict` and a markdown `summary`.

**Contract**: Export `ReviewResult` (zod object) and its inferred type. Shape (per [research.md](research.md#L288)):

```typescript
const Score = z.union([z.literal(0), z.literal(1)]); // 0 = fail, 1 = pass
const Criterion = z.object({ score: Score, rationale: z.string() });

const ReviewResult = z.object({
  // 6 base:
  implementationCorrectness: Criterion,
  idiomaticity: Criterion,
  complexity: Criterion,
  testRiskCoverage: Criterion,
  documentation: Criterion,
  securitySafety: Criterion,
  // 4 project-specific:
  rlsPrivacyIsolation: Criterion,   // L-01/L-06: RLS + API column-scope, no cross-user leak
  timerResilience: Criterion,       // L-03: derive remaining from server anchor, never decrement
  astroSsrBoundary: Criterion,      // API routes prerender=false, @/ imports, no client-side secrets
  zodBoundaryValidation: Criterion, // L-01: validate bodies, hand-picked write sets, no .update(parsed.data)
  verdict: z.enum(["pass", "fail"]),
  summary: z.string(),
});
```

Every field carries a `.describe(...)` in **English**. The four project criteria descriptions **must** instruct the model to score `1` when the diff does not touch that concern (see Critical Implementation Details). Also export `const CRITERIA = [...] as const` (the 10 keys) for the `totalScore` reducer used in Phase 3. `totalScore` is **not** a schema field — it is computed after parsing.

#### 2. Reviewer prompt

**File**: `review-agent/review-schema.ts` (same file) or `review-agent/prompt.ts`

**Intent**: The system/instructions prompt that tells the model to act as a senior reviewer of this repo and emit its verdict **only** by calling the `submit_review` tool.

**Contract**: Export `REVIEWER_PROMPT` (string), English. It states the reviewer role, references the repo's known failure classes (RLS/privacy, timer resilience, Astro SSR boundary, zod boundary validation) as the rationale for the four project axes, and instructs the model to call `submit_review` exactly once with all fields populated. No prose output.

### Success Criteria:

#### Automated Verification:

- Schema module type-checks in isolation: `cd review-agent && npx tsc --noEmit` exits 0.
- Schema round-trips: a quick `tsx` snippet parsing a hand-written valid object with `ReviewResult.parse(...)` succeeds and rejects an object with an out-of-range score.

#### Manual Verification:

- The 10 `.describe()` strings read as a coherent rubric; the four project-criteria descriptions clearly say "score 1 if the diff does not touch this".
- `REVIEWER_PROMPT` reads as English, names the four project concerns, and forbids prose output.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Agent Core + Output Contract + Docs

### Overview

Wire stdin → forced-tool-call `callModel` → self-parse → assemble the single stdout JSON, with the confirmed guards (temperature 0, fail-fast empty diff, env-driven max-cost cap), correct exit codes, and a package README documenting invocation, env vars, and the CI-readiness contract.

### Changes Required:

#### 1. stdin reader

**File**: `review-agent/utils.ts`

**Intent**: Read the piped diff from stdin; **fail fast** (exit non-zero, stderr message) if the diff is empty. No sample fallback.

**Contract**: Export `async function readDiff(): Promise<string>`. Reads stdin via the `!process.stdin.isTTY` + async-iterate-chunks pattern, `.trim()`s. If the result is empty (or stdin is a TTY with nothing piped), it must cause a non-zero exit with a clear stderr message — either throw a typed error the entrypoint maps to `process.exitCode = 1`, or `console.error` + `process.exit(1)`. Never return an empty string that reaches the model.

#### 2. Agent entrypoint

**File**: `review-agent/review.ts` (replaces the Phase 1 stub)

**Intent**: The whole agent — bootstrap the client, force the structured review via a manual tool, parse it ourselves, compute `totalScore`, and print the single JSON document to stdout with cost bundled in. All diagnostics to stderr.

**Contract**:
- Load env via `dotenv` (`import "dotenv/config"`), then bootstrap: `new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })`. If the key is missing, fail fast to stderr with a non-zero exit.
- Model id from `process.env.OPENROUTER_MODEL` with a strong default (confirm current OpenRouter availability at implementation time).
- Define one manual `tool({ name: "submit_review", description, inputSchema: ReviewResult })` with **no** `execute`.
- `callModel(client, { model, input: \`Review this diff:\n\n${diff}\`, instructions: REVIEWER_PROMPT, tools: [submitReview] as const, toolChoice: "required", temperature: 0, stopWhen: [stepCountIs(1), maxCost(Number(process.env.OPENROUTER_MAX_COST) || 0.5)] })`.
- Read `const [call] = await result.getToolCalls();` then `const review = ReviewResult.parse(call.arguments);` (parse ourselves — do not trust SDK internals). If no tool call or parse fails, exit non-zero to stderr.
- Compute `const totalScore = CRITERIA.reduce((s, k) => s + review[k].score, 0);`.
- Read cost: `const { usage } = await result.getResponse();` → assemble `cost = { cost_usd: usage?.cost, input_tokens: usage?.inputTokens, output_tokens: usage?.outputTokens, model }`.
- Emit **exactly one** `console.log(JSON.stringify({ review, totalScore, cost }, null, 2))` — the only stdout write in the whole program. Everything else (`console.error`) goes to stderr.

**Note on ordering**: bound the loop to a single step so the forced tool call is the terminal event (see Critical Implementation Details). Confirm at implementation time whether `getToolCalls()[0].arguments` is a plain object (it is passed to `ReviewResult.parse` either way).

#### 3. Package README + env contract

**File**: `review-agent/README.md`

**Intent**: Document how to run the agent, the required/optional env vars, and the stdout-purity + exit-code contract so the future CI slice is drop-in.

**Contract**: Sections: (a) install (`cd review-agent && npm install`); (b) run (`git diff | npx tsx review-agent/review.ts`); (c) env vars — `OPENROUTER_API_KEY` (required), `OPENROUTER_MODEL` (optional, default noted), `OPENROUTER_MAX_COST` (optional, default `0.5`); (d) output contract — single JSON on stdout `{ review, totalScore, cost }`, all logs on stderr, non-zero exit on empty diff / missing key / parse failure. State that these three properties (explicit input, stdout-purity, exit codes) are the CI-readiness contract.

#### 4. Env example

**File**: `review-agent/.env.example`

**Intent**: Show the env vars without committing secrets.

**Contract**: `OPENROUTER_API_KEY=`, `OPENROUTER_MODEL=` (with the default in a comment), `OPENROUTER_MAX_COST=0.5`. The real `.env` is gitignored (Phase 1).

### Success Criteria:

#### Automated Verification:

- Entrypoint type-checks in isolation: `cd review-agent && npx tsc --noEmit` exits 0.
- Empty-diff fail-fast: `echo "" | npx tsx review-agent/review.ts; echo $?` prints a non-zero code, an error on stderr, and no JSON on stdout.
- Repo gates still green: `npm run lint` and `npm run build` (root) exit 0.
- stdout purity: `git diff | npx tsx review-agent/review.ts > out.json 2>err.log && jq . out.json` succeeds (valid single JSON), with cost/diagnostics only in `err.log`.

#### Manual Verification:

- With a real `OPENROUTER_API_KEY`, `git diff | npx tsx review-agent/review.ts | jq .` shows `review` (10 scored criteria + verdict + summary), a `totalScore` matching the sum of the 10 scores, and a non-null `cost.cost_usd`.
- Re-running the same diff twice yields the same verdict (temperature 0 determinism).
- Setting `OPENROUTER_MAX_COST` very low on a large diff triggers the cap without crashing the output assembly.
- The four project criteria score `1` on a diff that does not touch RLS / timers / SSR boundary / zod validation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit-ish checks (via `tsx` snippets):

- `ReviewResult.parse(...)` accepts a valid 10-criteria object and rejects a score of `2` or a missing criterion.
- `totalScore` reducer sums to the expected value for a known object.

### Integration (manual, needs a real key):

- End-to-end run against a real `git diff`, verifying the three-key output and cost presence.
- Empty-diff and missing-key fail-fast paths.
- Determinism across two runs.

### Manual Testing Steps:

1. `cd review-agent && npm install`.
2. From repo root, with `OPENROUTER_API_KEY` exported: `git diff HEAD~1 | npx tsx review-agent/review.ts | jq .`.
3. Confirm `totalScore` equals the sum of the ten `score` fields.
4. `echo "" | npx tsx review-agent/review.ts; echo $?` → non-zero.
5. Run `npm run lint` and `npm run build` at root → both green.

## Performance Considerations

Single LLM call per invocation; latency and cost are dominated by the model and diff size. The `maxCost` cap (default 0.5 USD) is the runaway-spend guard; temperature 0 keeps output reproducible. Very large diffs risk context-window overflow — the cost cap bounds spend but not tokens; a token/size guard is out of scope for this change (noted for the future CI slice).

## Migration Notes

None — additive. No app code, schema, or migration is touched. The only edits to existing files are three isolation entries: root `tsconfig.json` `exclude`, root `eslint.config.js` `ignores`, and root `.prettierignore`.

## References

- Research: [context/changes/review-agent/research.md](research.md)
- Change brief: [context/changes/review-agent/change.md](change.md)
- SDK docs: Context7 `/openrouterteam/typescript-agent` (callModel, tool, maxCost, getToolCalls, getResponse)
- Lessons grounding the 4 project criteria: [lessons.md L-01](../../foundation/lessons.md), [L-03](../../foundation/lessons.md), [L-06](../../foundation/lessons.md)
- Isolation anchors: [eslint.config.js:99](../../../eslint.config.js#L99), [tsconfig.json:4](../../../tsconfig.json#L4)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Package Scaffold + Repo Isolation

#### Automated

- [x] 1.1 Dependencies install inside the package (`cd review-agent && npm install`, produces lockfile) — 5243804
- [x] 1.2 Repo lint still passes: `npm run lint` (root) exits 0 — 5243804
- [x] 1.3 Repo build still passes: `npm run build` (root) exits 0 — 5243804
- [x] 1.4 Package type-checks in isolation: `cd review-agent && npx tsc --noEmit` exits 0 — 5243804

#### Manual

- [x] 1.5 `git status` shows source tracked, `node_modules`/`.env` untracked — 5243804
- [x] 1.6 Committing under `review-agent/` does not trip the `lint-staged` hook on those files — 5243804

### Phase 2: Review Schema + Reviewer Prompt

#### Automated

- [x] 2.1 Schema module type-checks in isolation: `cd review-agent && npx tsc --noEmit` exits 0 — 3bc14b6
- [x] 2.2 Schema round-trips: valid object parses, out-of-range score rejected — 3bc14b6

#### Manual

- [x] 2.3 The 10 `.describe()` strings read as a coherent rubric; project-criteria say "score 1 if untouched" — 3bc14b6
- [x] 2.4 `REVIEWER_PROMPT` is English, names the four concerns, forbids prose output — 3bc14b6

### Phase 3: Agent Core + Output Contract + Docs

#### Automated

- [x] 3.1 Entrypoint type-checks in isolation: `cd review-agent && npx tsc --noEmit` exits 0 — c52d4f8
- [x] 3.2 Empty-diff fail-fast: non-zero exit, stderr error, no stdout JSON — c52d4f8
- [x] 3.3 Repo gates still green: `npm run lint` and `npm run build` (root) exit 0 — c52d4f8
- [x] 3.4 stdout purity: piped run yields valid single JSON; cost/diagnostics only on stderr — c52d4f8

#### Manual

- [x] 3.5 Real-key run: `review` + matching `totalScore` + non-null `cost.cost_usd` — c52d4f8
- [x] 3.6 Determinism: same diff twice yields same verdict (temperature 0) — c52d4f8
- [x] 3.7 Low `OPENROUTER_MAX_COST` on a large diff triggers the cap without breaking output — c52d4f8
- [x] 3.8 Project criteria score 1 on a diff not touching RLS/timers/SSR/zod — c52d4f8
