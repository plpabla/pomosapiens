import { z } from "zod";

const Score = z.union([z.literal(0), z.literal(1)]).describe("0 = fail, 1 = pass");

const Criterion = z.object({
  score: Score,
  rationale: z.string().describe("One or two sentences explaining the score, citing the diff."),
});

export const ReviewResult = z.object({
  implementationCorrectness: Criterion.describe(
    "Score 1 if the diff does what it claims to do and does not introduce logic errors, off-by-one mistakes, or broken control flow. Score 0 if the change is incorrect or incomplete relative to its own intent.",
  ),
  idiomaticity: Criterion.describe(
    "Score 1 if the diff follows the codebase's existing conventions (naming, structure, framework idioms). Score 0 if it introduces a foreign pattern where an established one already exists.",
  ),
  complexity: Criterion.describe(
    "Score 1 if the diff is as simple as the problem allows — no speculative abstractions, no unrequested flexibility. Score 0 if it is overengineered relative to what was asked.",
  ),
  testRiskCoverage: Criterion.describe(
    "Score 1 if the diff carries appropriate test coverage for its risk (or genuinely needs none). Score 0 if a risky behavioral change ships without any corresponding test.",
  ),
  documentation: Criterion.describe(
    "Score 1 if comments/docs are added only where the WHY is non-obvious, and existing docs are updated when behavior they describe changes. Score 0 if load-bearing context is missing or stale docs were left behind.",
  ),
  securitySafety: Criterion.describe(
    "Score 1 if the diff avoids common vulnerability classes (injection, XSS, unsafe deserialization, secret leakage) and does not weaken an existing safeguard. Score 0 if it introduces or worsens such a risk.",
  ),
  rlsPrivacyIsolation: Criterion.describe(
    "This repo's Supabase tables rely on RLS for row-level ownership and on the API layer for column-level write scope (e.g. narrowing which columns a PATCH may touch, never widening a schema to `.passthrough()` or spreading `parsed.data` into `.update()`). Score 1 if the diff does not touch database access, RLS policies, or API write paths at all, OR if it touches them and preserves both layers with no cross-user data leak. Score 0 only if the diff weakens row ownership checks or widens the writable column set beyond what was requested.",
  ),
  timerResilience: Criterion.describe(
    "Any countdown/elapsed-time UI in this repo must derive remaining time from a stable server-anchored timestamp on every tick (`focusSeconds - Math.floor((Date.now() - startedAtMs) / 1000)`), never by decrementing a local counter, since background tabs throttle `setInterval`. Score 1 if the diff does not touch timer/countdown logic at all, OR if it touches it and follows the wall-clock-recompute pattern. Score 0 only if the diff introduces or keeps a decrementing local timer.",
  ),
  astroSsrBoundary: Criterion.describe(
    "This repo is an Astro SSR app: API routes under src/pages/api/** must export `const prerender = false;`, imports should use the `@/` alias rather than relative paths, and no secret/server-only value should reach client-side code. Score 1 if the diff does not touch API routes or the Astro/React boundary at all, OR if it touches them and respects these rules. Score 0 only if the diff omits `prerender = false` on a new API route, leaks a server secret to the client, or otherwise crosses the SSR boundary incorrectly.",
  ),
  zodBoundaryValidation: Criterion.describe(
    "API routes in this repo must validate request bodies with a zod schema and write only a hand-picked, explicit set of columns (never `.update(parsed.data)` after a schema that could admit protected columns). Score 1 if the diff does not touch API request handling at all, OR if it touches it and both the schema-strip and hand-picked-write-set layers hold. Score 0 only if the diff skips body validation or widens the write set beyond what was requested.",
  ),
  summary: z.string().describe("Markdown summary of the review, suitable for posting as a PR comment."),
  verdict: z.enum(["pass", "fail"]).describe("Overall pass/fail verdict for the diff as a whole."),
});

export type ReviewResult = z.infer<typeof ReviewResult>;

export const CRITERIA = [
  "implementationCorrectness",
  "idiomaticity",
  "complexity",
  "testRiskCoverage",
  "documentation",
  "securitySafety",
  "rlsPrivacyIsolation",
  "timerResilience",
  "astroSsrBoundary",
  "zodBoundaryValidation",
] as const;

export const REVIEWER_PROMPT = `You are a senior code reviewer for a production Astro 6 SSR application (React 19 islands, Supabase auth/RLS, Cloudflare Workers deployment).

You will be given a git diff. Review it against ten criteria, each scored 0 (fail) or 1 (pass):

1. Implementation correctness
2. Idiomaticity (matches existing codebase conventions)
3. Complexity (no more than the problem requires)
4. Test/risk coverage
5. Documentation (only where the WHY is non-obvious)
6. Security & safety

Four criteria are specific to known failure classes in this repository:

7. RLS + privacy isolation — Supabase RLS enforces row ownership, but API endpoints must independently narrow which columns are writable. A diff that does not touch database access or API write paths automatically passes this criterion.
8. Timer resilience — countdown/elapsed timers must derive remaining time from a stable server-anchored timestamp on every tick, never by decrementing a local counter. A diff that does not touch timer logic automatically passes this criterion.
9. Astro SSR boundary — API routes must declare \`prerender = false\`, use the \`@/\` import alias, and never leak server-only secrets to the client. A diff that does not touch API routes or the SSR boundary automatically passes this criterion.
10. Zod boundary validation — request bodies must be validated with zod and written through a hand-picked column set, never a raw \`.update(parsed.data)\`. A diff that does not touch API request handling automatically passes this criterion.

For each of the four project-specific criteria, if the diff never goes near that concern, score it 1 — do not penalize a diff for a risk it was never exposed to.

Respond only by calling the \`submit_review\` tool exactly once, with every field populated. Do not produce any prose response — the tool call is the only output.`;
