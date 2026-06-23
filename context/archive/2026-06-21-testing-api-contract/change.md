---
change_id: testing-api-contract
title: Test runner bootstrap and session API contract
status: archived
created: 2026-06-21
updated: 2026-06-23
archived_at: 2026-06-23T18:47:58Z
---

## Notes

Phase 1 of the test-plan.md phased rollout. Goal: set up Vitest with `@cloudflare/vitest-pool-workers` and prove PATCH column-scope discipline and cross-user API access at the cheapest layer. Covers risks #2 (PATCH contract) and #3 (cross-user session access) from the risk map.
