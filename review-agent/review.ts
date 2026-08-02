import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { OpenRouter, tool, stepCountIs, maxCost } from "@openrouter/agent";
import { CRITERIA, ReviewResult, REVIEWER_PROMPT } from "./review-schema.js";
import { readDiff } from "./utils.js";

config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env"), quiet: true });

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is not set.");
  process.exit(1);
}

const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5";
const maxCostDollars = Number(process.env.OPENROUTER_MAX_COST) || 0.5;

const diff = await readDiff();

const client = new OpenRouter({ apiKey });

const submitReview = tool({
  name: "submit_review",
  description: "Return the structured code review for the diff.",
  inputSchema: ReviewResult,
  execute: false,
});

const result = client.callModel({
  model,
  input: `Review this diff:\n\n${diff}`,
  instructions: REVIEWER_PROMPT,
  tools: [submitReview] as const,
  toolChoice: "required",
  temperature: 0,
  // Forced tool calls (toolChoice: "required") are incompatible with reasoning/thinking
  // mode on some providers (e.g. Qwen3, Claude extended thinking) — disable it so the
  // forced-tool-call pattern works regardless of which model OPENROUTER_MODEL points to.
  reasoning: { enabled: false },
  stopWhen: [stepCountIs(1), maxCost(maxCostDollars)],
  allowFinalResponse: false,
});

const [call] = await result.getToolCalls();
if (!call) {
  console.error("Model did not return a submit_review tool call.");
  process.exit(1);
}

let review: ReviewResult;
try {
  review = ReviewResult.parse(call.arguments);
} catch (error) {
  console.error("submit_review arguments failed schema validation:", error);
  process.exit(1);
}

const totalScore = CRITERIA.reduce((sum, key) => sum + review[key].score, 0);

const response = await result.getResponse();
const usage = response.usage;
const cost = {
  cost_usd: usage?.cost ?? null,
  input_tokens: usage?.inputTokens ?? null,
  output_tokens: usage?.outputTokens ?? null,
  model,
};

console.log(JSON.stringify({ review, totalScore, cost }, null, 2));
