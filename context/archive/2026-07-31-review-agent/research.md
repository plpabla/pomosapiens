---
date: 2026-07-31T00:00:00+02:00
researcher: pawel
git_commit: 91b4053e1c171e60758008246ade33ac2460c558
branch: review-agent
repository: PomoSapiens
topic: "How to build the standalone code-review agent (stdin diff → structured output + cost)"
tags: [research, agent, openrouter, ai-sdk, zod, standalone-package, tsx]
status: complete
last_updated: 2026-07-31
last_updated_by: pawel
last_updated_note: "Locked SDK = @openrouter/agent (callModel); cost in stdout JSON; 0/1 rubric with 6 base + 4 project criteria + totalScore. Added callModel API specifics and a CI/CD readiness section."
---

# Research: How to tackle the `review-agent` change

**Date**: 2026-07-31T00:00:00+02:00
**Researcher**: pawel
**Git Commit**: 91b4053e1c171e60758008246ade33ac2460c558
**Branch**: review-agent
**Repository**: PomoSapiens

## Research Question

Build a review agent (see [change.md](change.md)): reads a `git diff` from **stdin**, returns **structured output** validated by **zod**, and **reports its cost per call**. It must be an **ESM module packaged as a separate package** — explicitly *not* under `src/` (it is not part of the Astro app). Example invocation:

```bash
git diff | npx tsx review.ts
```

Research the online docs (Context7) and mirror the course reference repo `przeprogramowani/agent-sdk-examples`.

## Summary

The reference repo is the blueprint for exactly this task — its `ai-sdk/review.ts` *is* a git-diff-to-structured-review agent. The recommended path:

- **SDK: Vercel AI SDK 6 (`ai@^6`) + `@openrouter/ai-sdk-provider`.** This is what the reference repo's OpenRouter examples use, and it is the concrete meaning of "OpenRouter Agent SDK" in this course's materials. It gives structured output (`Output.object({ schema })`), zod-native schemas (zod v4, the exact version PomoSapiens already uses), and per-call cost via `providerMetadata.openrouter.usage.cost` when the model is created with `usage: { include: true }`. There is a *different* standalone library also called "OpenRouter Agent" (`@openrouter/agent` / `callModel`); it is a viable alternative but is **not** what the reference repo uses — see [Decision 1](#decision-1--which-sdk).
- **Packaging: a standalone folder with its own `package.json`** (e.g. `review-agent/`), `"type": "module"`, its own isolated `node_modules`, run via `tsx` with **no build step** — mirroring the reference repo. Critically, it must be **excluded from the Astro app's `eslint .` and `astro check`** or it will break `npm run lint` / `npm run build` — see [Integration hazards](#integration-with-the-existing-repo-the-real-work).
- **Secrets:** `OPENROUTER_API_KEY` read from the environment by the provider automatically. Per the project's non-negotiable rule ([CLAUDE.md](../../../CLAUDE.md)), do not read it out of `.env` in code — request it as an env var; `dotenv` loading the key into `process.env` is fine.

The agent logic is ~40 lines. **The real work is the packaging boundary** so this second package does not pollute the Astro app's lint/typecheck/build.

## Detailed Findings

### The reference repo (`przeprogramowani/agent-sdk-examples`)

Single flat package (`name: agent-demo`, `"type": "module"`, **no** npm workspaces), run entirely through `tsx` with no compile step. It ships three parallel agent stacks: `anthropic/` (Claude Agent SDK), `ai-sdk/` (Vercel AI SDK 6 + OpenRouter), and `evals/` (promptfoo). The **`ai-sdk/` folder is the OpenRouter path and the one to mirror.**

`package.json` (relevant parts):

```jsonc
{
  "name": "agent-demo",
  "type": "module",
  "scripts": {
    "aisdk:review": "tsx ai-sdk/review.ts",
    "aisdk:cost":   "tsx ai-sdk/cost-report.ts"
  },
  "dependencies": {
    "@openrouter/ai-sdk-provider": "^2.9.0",
    "ai": "^6.0.199",
    "dotenv": "^17.4.2",
    "zod": "^4.4.3"          // ← identical to PomoSapiens' zod
  },
  "devDependencies": {
    "@types/node": "^25.9.2",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3"
  }
}
```

**`ai-sdk/review.ts`** — the whole agent, verbatim:

```typescript
import { ToolLoopAgent, Output, stepCountIs } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { REVIEWER_PROMPT, ReviewResult } from "../common/review-schema";
import { readDiff } from "./utils";

async function review(diff: string): Promise<ReviewResult> {
  const reviewer = new ToolLoopAgent({
    model: openrouter("z-ai/glm-5.1"),
    instructions: REVIEWER_PROMPT,
    tools: {},
    output: Output.object({ schema: ReviewResult }),
    stopWhen: stepCountIs(2),
  });

  const { output } = await reviewer.generate({
    prompt: `Zrecenzuj ten diff:\n\n${diff}`,
  });
  return output;
}

const diff = await readDiff();
console.log(JSON.stringify(await review(diff), null, 2));
```

Note: top-level `await` (allowed — ESM), no tools (`tools: {}`) so it is a single structured-generation call, not a real multi-step tool loop; `stepCountIs` just bounds it.

**`ai-sdk/utils.ts` — `readDiff()`** is the stdin pattern the change asks for. It reads piped stdin when present, else falls back to a sample file:

```typescript
// shape (paraphrased from the repo):
export async function readDiff(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8").trim();
  }
  return loadSampleDiff(); // reads data/sample-*.md, strips ``` fences
}
```

`!process.stdin.isTTY` is the "is something being piped in" check — this is what makes `git diff | npx tsx review.ts` work while still allowing a no-pipe dev run against a sample.

**`common/review-schema.ts` — the zod structured-output contract:**

```typescript
export const ReviewResult = z.object({
  criteria: ReviewCriteria,                         // six 1–10 integer scores + rationales
  verdict: z.enum(["pass", "fail"]).describe("Authoritative overall verdict for the change."),
  summary: z.string().describe("Markdown summary for a PR comment."),
});
export type ReviewResult = z.infer<typeof ReviewResult>;
```

`ReviewCriteria` scores six axes 1–10 with a rationale each: `implementationCorrectness`, `idiomaticity`, `complexity`, `testRiskCoverage`, `documentation`, `securitySafety`. Every field uses `.describe(...)` — those descriptions are fed to the model as the schema contract, so they are load-bearing, not comments. `REVIEWER_PROMPT` instructs the model to emit *only* the structured object.

### Cost reporting (the "report its cost" requirement)

Confirmed against `@openrouter/ai-sdk-provider` docs (Context7 `/openrouterteam/ai-sdk-provider`). Cost in USD/credits is **not** in the standard AI SDK `usage` object — it comes from OpenRouter provider metadata, and only if you opt in when constructing the model:

```typescript
const model = openrouter("z-ai/glm-5.1", { usage: { include: true } });

const result = await generateText({ model, prompt });

// standard token counts:
result.usage.inputTokens;
result.usage.outputTokens;

// OpenRouter cost + tokens (present only with usage.include):
const or = result.providerMetadata?.openrouter?.usage;
or?.cost;         // ← cost in credits (USD-equivalent)
or?.totalTokens;
or?.costDetails?.upstreamInferenceCost; // BYOK passthrough, if applicable
```

The reference `ai-sdk/cost-report.ts` does exactly this: an `onStepFinish` callback logs per-step `inputTokens`/`outputTokens`, then it reads `providerMetadata.openrouter.usage` and writes `{ cost_usd, usage, model }` to a JSON file. For this change, printing cost to **stderr** (so stdout stays clean structured JSON that can be piped onward) is the natural fit — `git diff | npx tsx review.ts > review.json` should still yield valid JSON, with cost visible in the terminal.

> **Gotcha:** the reference `ai-sdk/review.ts` above does *not* pass `usage: { include: true }`, so it cannot report cost as written. To satisfy this change's cost requirement, the model must be constructed with `{ usage: { include: true } }` and the call must return the full result (not just `output`) so `providerMetadata` is reachable. With `ToolLoopAgent.generate(...)` verify the result surface exposes `providerMetadata`/`totalUsage`; if it does not cleanly, use a plain `generateText`/`generateObject` call (which definitely does) instead of the agent wrapper. This is the one spot to nail down in the plan.

## Code References

- [context/changes/review-agent/change.md:10-19](change.md) — the change brief (stdin, zod structured output, per-call cost, standalone ESM package).
- [package.json:82-84](../../../package.json) — root `overrides.vite`; the app is `"type": "module"` with zod `^4.4.3` (matches the reference repo's zod).
- [eslint.config.js:12](../../../eslint.config.js) — `includeIgnoreFile(gitignorePath)`: eslint ignores whatever `.gitignore` ignores, but the new package's *source* must stay tracked, so it needs an **explicit** eslint `ignores` entry.
- [eslint.config.js:14-22](../../../eslint.config.js) — `projectService: true` + `strictTypeChecked`: typed lint rules run over every `.ts` the tsconfig sees; `no-console: "warn"` (line 23) would flag the agent's `console.log`.
- [tsconfig.json:3-4](../../../tsconfig.json) — `include: ["**/*"]`, `exclude: ["dist", "tests/integration"]`: a new top-level folder is type-checked by `astro check` unless added to `exclude`.
- [package.json:11-12](../../../package.json) — `lint`/`lint:fix` = `eslint .` (whole repo); [package.json:85-92](../../../package.json) — `lint-staged` runs `eslint --fix` on staged `*.{ts,tsx,astro}`, so the agent's files hit the pre-commit hook unless eslint-ignored.

## Architecture Insights

- **This change is deliberately outside the app's architecture.** [arch.md](../../foundation/arch.md) describes an Astro SSR + React islands + Supabase app; the review agent shares none of it — no `@/` alias, no middleware, no RLS, no Cloudflare runtime. It is a Node CLI script. Keeping it in its own folder-package with its own `node_modules` is what preserves that separation, and matches the change's "it is not part of a project" instruction.
- **No workspaces.** The reference repo is intentionally a single flat package, and the change says "separate package … not part of a project." An npm workspace would pull the agent into the root dependency graph, lint config, and `astro sync`. Prefer a self-contained folder with its own `package.json` + `npm install` run *inside* it. Nested `node_modules/` is already covered by [.gitignore:9](../../../.gitignore) (`node_modules/` matches at any depth).
- **stdout is a data channel.** Structured JSON on stdout, cost/diagnostics on stderr — keeps the tool composable (`| jq`, `> file`) the way `git diff |` implies.
- **zod parity.** The app is on zod v4 and so is the reference repo; the agent's schema will use the same major, so no version friction if code is ever shared (it should not be — keep it self-contained).

### Decision 1 — which SDK

The change note literally says "OpenRouter Agent SDK," which is genuinely ambiguous — there are two distinct libraries:

| | **A. Vercel AI SDK 6 + `@openrouter/ai-sdk-provider`** (recommended) | **B. `@openrouter/agent` (`callModel`)** |
|---|---|---|
| What the reference repo uses | ✅ Yes (`ai-sdk/`) | ❌ No |
| Structured output | `Output.object({ schema })` / `generateObject` | `output` extraction |
| zod tools | ✅ | ✅ `tool()` + zod |
| Cost per call | `providerMetadata.openrouter.usage.cost` (`usage.include`) | native cost accounting |
| Cost *limits* | via `stopWhen`/manual | built-in `maxCost(0.50)` helper |
| Context7 id | `/openrouterteam/ai-sdk-provider` (benchmark 87) | `/openrouterteam/typescript-agent` (benchmark 74) |

**Recommendation: A.** It is a 1:1 mirror of the course reference the user pointed at, uses the same zod major the repo already runs, and cleanly satisfies all three requirements (stdin / zod structured output / per-call cost). Option B's only real edge is the built-in `maxCost()` spend cap — not required here (we *report* cost, we don't *cap* it). This is the main thing to confirm with the user before planning.

### Decision 2 — folder name & location

Candidates: `review-agent/` (matches the change-id, clearest intent), `agent/`, or `tools/review/`. Recommend **`review-agent/`** at repo root. Whatever the name, it must be added to eslint `ignores` and tsconfig `exclude`.

## Integration with the existing repo (the real work)

The agent code is trivial; not breaking `npm run lint` and `npm run build` is the substance. A new top-level `review-agent/` folder will, by default, be swept into all of these:

1. **`astro check` / `npm run build`** — root [tsconfig.json](../../../tsconfig.json) has `include: ["**/*"]`. → Add `"review-agent"` to `exclude`. Give the package its **own** `tsconfig.json` so `tsx`/editor still type-check it in isolation.
2. **`npm run lint` (`eslint .`)** — typed rules + `no-console` would flag it. → Add an `ignores: ["review-agent/**"]` block in [eslint.config.js](../../../eslint.config.js). (Cannot rely on `includeIgnoreFile` — that would require gitignoring the source, which we do not want.)
3. **Pre-commit `lint-staged`** — runs `eslint --fix` on staged `*.ts`. Covered once the eslint `ignores` above is in place (eslint skips ignored files).
4. **Prettier** — `*.{json,css,md}` only for `.ts` it is not auto-run, but `npm run format` (`prettier --write .`) would touch it; harmless, optionally add to `.prettierignore`.
5. **Its own dependency install** — `cd review-agent && npm install`. Keeps `ai`, `@openrouter/ai-sdk-provider`, `tsx` out of the Astro app's `package.json` and Cloudflare build.
6. **Env** — provider auto-reads `process.env.OPENROUTER_API_KEY`. Locally: `dotenv` + a `review-agent/.env` (gitignore it), or export the var in the shell. Do **not** read the secret out of a file in code (project rule).

Proposed layout:

```
review-agent/
  package.json          # "type": "module", own deps, "review": "tsx review.ts"
  tsconfig.json         # isolated, strict
  review.ts             # readDiff → agent → JSON on stdout, cost on stderr
  review-schema.ts      # zod ReviewResult + reviewer prompt
  .env                  # OPENROUTER_API_KEY (gitignored)
  .gitignore            # node_modules, .env
```

Invocation stays exactly as the change specifies: `git diff | npx tsx review-agent/review.ts` (or `cd review-agent && git -C .. diff | npm run review`).

## Open Questions

1. **SDK choice (blocking):** confirm Option A (Vercel AI SDK + OpenRouter provider, mirroring the reference repo) vs Option B (`@openrouter/agent` with built-in `maxCost`). Recommendation: A.
2. **Model:** reference uses `z-ai/glm-5.1`. Keep it, or pin a specific reviewer model? (Per global rules, for Claude-family models default to the latest capable Claude — but this runs on OpenRouter, so any of its 400+ models is fair game.)
3. **Review schema:** reuse the reference's six-criteria `ReviewResult` as-is, or tailor the rubric to PomoSapiens (e.g. add RLS/privacy-leak and timer-resilience axes, echoing lessons [L-01](../../foundation/lessons.md), [L-03](../../foundation/lessons.md))?
4. **Cost output channel:** stderr (keep stdout pure JSON) vs a `cost.json` sidecar like the reference. Recommendation: stderr.
5. **Language:** reference prompts are Polish; emit review in English or Polish?

## Related Research

- Reference repo: https://github.com/przeprogramowani/agent-sdk-examples (`ai-sdk/` folder)
- OpenRouter AI SDK provider docs (Context7 `/openrouterteam/ai-sdk-provider`, benchmark 87) — usage accounting / cost.
- OpenRouter standalone Agent SDK (Context7 `/openrouterteam/typescript-agent`) — the Option-B alternative.

## Follow-up Research 2026-07-31 — decisions locked, `@openrouter/agent` specifics

The user chose **against** the reference-repo mirror. Locked decisions:

| Question | Decision |
|---|---|
| SDK | **`@openrouter/agent`** (the standalone `callModel` SDK), *not* the Vercel AI SDK path |
| Cost output | **Bundle cost into the JSON on stdout** (not stderr, not a sidecar) |
| Rubric | Keep the **6 base criteria** and **add 4 project-specific ones**; change scoring from 1–10 to **0/1 (pass/fail) per criterion** |

This means the reference repo (`ai-sdk/review.ts`, `Output.object`, `providerMetadata.openrouter.usage`) is now only a **shape** reference for stdin + schema style. The SDK mechanics are different and are the ones below (Context7 `/openrouterteam/typescript-agent`).

### `callModel` — cost is native (satisfies "report its cost")

No `usage:{include:true}` flag is needed (that was the AI-SDK path). `callModel` returns a `ModelResult`; `getResponse()` exposes `usage` with `cost`:

```typescript
const result = client.callModel({ model: "...", input: "...", tools: [...] as const });
const response = await result.getResponse();
response.usage?.cost;          // USD (nullable)
response.usage?.inputTokens;
response.usage?.outputTokens;
response.finishReason;
```

`ModelResult` (`getResponse().usage`) shape: `{ inputTokens, outputTokens, cachedTokens?, cost? }`. Because cost lands here, bundling it into the output object is straightforward.

### Structured output — there is **no `Output.object` equivalent**

`@openrouter/agent`'s zod integration is for **tool** `inputSchema`/`outputSchema` and shared context — it does **not** expose a "final response must match this schema" primitive. To get a zod-validated `ReviewResult` back, the idiomatic pattern is a **forced tool call**:

```typescript
import { callModel } from "@openrouter/agent";
// one tool whose inputSchema IS the review schema; force the model to call it
const submitReview = {
  type: ToolType.Function,
  function: {
    name: "submit_review",
    description: "Return the structured code review.",
    inputSchema: ReviewResult,          // ← the zod schema
    // no execute → manual tool, we read the arguments off the tool call
  },
};

const result = client.callModel({
  model: "...",
  input: `Review this diff:\n\n${diff}`,
  tools: [submitReview] as const,
  toolChoice: "required",               // ← force the structured emission
});

const [call] = await result.getToolCalls();
const review = call.arguments;          // structured object matching ReviewResult
```

- **Plan must pin:** whether `getToolCalls()[0].arguments` is already zod-parsed or needs an explicit `ReviewResult.parse(call.arguments)` (safest: parse it ourselves — keeps validation guaranteed regardless of SDK internals).
- **Alternative** (fallback if forced-tool-call is awkward): `callModel` spreads unknown fields (`...apiRequest`) straight to the OpenRouter API, so an OpenRouter-native `response_format: { type: "json_schema", json_schema: … }` (built from `z.toJSONSchema(ReviewResult)`) is a pass-through option — but then *we* parse the text back through zod. Prefer the forced-tool-call path; keep this as plan-B.
- **Client bootstrap to pin in the plan:** docs show both `callModel(client, {...})` (function form) and `client.callModel({...})` (method form). The `client` is an OpenRouter core client; the plan must nail the exact constructor/import and that it reads `OPENROUTER_API_KEY` from env (not from a file — project rule).

### Revised schema shape (0/1 rubric, cost in output)

```typescript
const Score = z.union([z.literal(0), z.literal(1)]); // 0 = fail, 1 = pass
const Criterion = z.object({ score: Score, rationale: z.string() });

const ReviewResult = z.object({
  // 6 base (from the reference rubric, rescored 0/1):
  implementationCorrectness: Criterion,
  idiomaticity: Criterion,
  complexity: Criterion,
  testRiskCoverage: Criterion,
  documentation: Criterion,
  securitySafety: Criterion,
  // 4 project-specific (proposed — grounded in lessons/arch, confirm in plan):
  rlsPrivacyIsolation: Criterion,   // L-01/L-06 + cross-user privacy NFR: no leak, RLS + API column-scope
  timerResilience: Criterion,       // L-03: wall-clock derivation, never decrement a local counter
  astroSsrBoundary: Criterion,      // API routes prerender=false, @/ imports, no secrets client-side
  zodBoundaryValidation: Criterion, // L-01 layers: validate bodies, hand-picked write sets, no .update(parsed.data)
  verdict: z.enum(["pass", "fail"]),
  summary: z.string().describe("Markdown summary for a PR comment."),
});
```

**Total score (max 10):** the sum of the 10 criteria scores. Compute it **ourselves** after `ReviewResult.parse(...)` — do **not** ask the model to sum (LLMs miscount, and a model-emitted total could disagree with the per-criterion scores). It is a derived field, so it is *not* part of the zod schema the model fills; we add it when assembling the output:

```typescript
const CRITERIA = [
  "implementationCorrectness", "idiomaticity", "complexity", "testRiskCoverage",
  "documentation", "securitySafety", "rlsPrivacyIsolation", "timerResilience",
  "astroSsrBoundary", "zodBoundaryValidation",
] as const;                                   // 10 criteria
const totalScore = CRITERIA.reduce((sum, k) => sum + review[k].score, 0); // 0..10
```

Final agent output on **stdout** bundles the total (shown next to the review points) and cost:

```jsonc
{
  "review": { /* ReviewResult: the 10 scored criteria + verdict + summary */ },
  "totalScore": 8,          // sum of the 10 criteria, max 10 (computed, not model-emitted)
  "cost": { "cost_usd": 0.0123, "input_tokens": 1234, "output_tokens": 567, "model": "..." }
}
```

The four project criteria are **proposals** for the plan to confirm (Open Question 3 is now: which 4?). stdin (`readDiff`) is unchanged — Node-native, no SDK dependency. Packaging/lint/tsconfig isolation from [Integration hazards](#integration-with-the-existing-repo-the-real-work) is unaffected by the SDK swap and still stands.

### Open Questions still to resolve before/in `/10x-plan`

1. Exact `@openrouter/agent` client bootstrap + package name for the OpenRouter core client (pin the import).
2. Confirm `getToolCalls()[0].arguments` typing/parsing (decide to always `ReviewResult.parse(...)` ourselves).
3. Which **4** project-specific criteria (the four proposed above vs. others).
4. Model choice (reference used `z-ai/glm-5.1`; any OpenRouter model works).
5. Prompt language (English vs. Polish).

## CI/CD readiness (GitHub Actions — the ultimate target)

The stdin-driven CLI is step one; the goal is running this agent in GitHub Actions on PRs (post the review as a PR comment and/or gate the merge). Assessed against that: **most locked decisions are CI-friendly** — `OPENROUTER_API_KEY` from env drops into a GH secret; the markdown `summary` feeds `gh pr comment`; the JSON output (0/1 scores + `verdict` + `totalScore`) gives both a gate signal and granular data; and choosing `@openrouter/agent` keeps `stopWhen`/cost-limit helpers available for a per-run cost cap on large PRs.

**Three decisions to bake into the plan now** (retrofitting them later is the annoying rework):

1. **Input contract must be explicit + fail-fast — do not let stdin-fallback-to-sample be the only path.**
   `readDiff()` branches on `!process.stdin.isTTY`. In CI **there is no TTY**, so that branch is always taken; an empty/unwired pipe can hang on EOF or silently review nothing/the sample. Plan requirement: accept the diff explicitly (arg/env — e.g. a file path or a `git diff <base>...<head>` range), **exit non-zero on an empty diff**, and keep stdin only as the local-dev convenience. The sample fallback must be dev-only, never reachable in CI.

2. **stdout must be exactly one JSON document; everything else goes to stderr.**
   Cost-in-stdout (the chosen design) is CI-friendly *only* if stdout stays pure — one stray `console.log` breaks the workflow's `jq` parse. Pin "stdout = single JSON, all logs/progress/diagnostics → stderr" as a non-negotiable. (Aligns with eslint-ignoring the package, since the repo's `no-console` rule would otherwise fire.)

3. **Add gate semantics — "print JSON, exit 0" does not fail a build.**
   Decide between: (a) the agent sets a **non-zero exit code** when the review fails, or (b) the workflow reads `verdict`/`totalScore` via `jq` and fails the step. Also a **policy** choice: gate on the model's non-deterministic `verdict`, or on a **deterministic rule over the 0/1 scores** (e.g. fail if `securitySafety === 0` or `totalScore < 8`). Recommendation: deterministic rule over scores — a merge gate shouldn't flip on model mood. The granular 0/1 design exists precisely to enable this.

**Not obstacles — defer to the CI-integration slice, but keep in view:**
- **Forked-PR secrets:** `pull_request` from forks can't read `OPENROUTER_API_KEY`; `pull_request_target` can but runs against untrusted PR code — a workflow-security design concern, not an agent concern.
- **`npm ci` reproducibility:** commit the standalone package's `package-lock.json` so CI installs are pinned.
- **Determinism:** consider `temperature: 0` so re-runs don't churn the verdict.
- **Diff-size / cost guard:** cap large-PR runs via `stopWhen`/cost limit to avoid runaway spend or context-window overflow.
