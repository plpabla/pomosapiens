---
change_id: review-agent
title: Review agent
status: impl_reviewed
created: 2026-07-31
updated: 2026-08-02
archived_at: null
---

## Notes

Create a review agent using OpenRouter Agent SDK.
Input for the agent would be passed as stdin, response should be a structured output (use zod for schema).
Each call should report its cost.

Example call:
git diff | npx tsx review.ts

Review agent should be ESM module. Do not place it in `src` directory - it is not part of a project. It should be a separate package. Check in documentation how to do it.
