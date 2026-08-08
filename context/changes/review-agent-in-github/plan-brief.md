# Review Agent in GitHub — Plan Brief

> Full plan: `context/changes/review-agent-in-github/plan.md`
> Research: `context/changes/review-agent-in-github/research.md`

## What & Why

Integrate `packages/review-agent` into GitHub's CI/CD via a composite action that automatically reviews PR code changes, posts results as PR comments with labels, and gates builds on failing reviews. The CLI is already built for this (stdin-diff-in, JSON-stdout) but needs one small exit-code fix; the real work is wrapping it in GitHub-safe orchestration.

## Starting Point

- **CLI exists**: `review.ts` + `review-schema.ts` + `utils.ts` are production-ready but exit `0` on valid JSON regardless of verdict—they need a `process.exit(1)` when verdict is `"fail"`.
- **No CI wiring**: No composite action, no workflows, no comment/label posting.
- **Existing patterns**: The repo's two workflows (`ci.yml`, `smoke.yml`) use `.nvmrc`-pinned Node, step-level `env:` for secrets, and `actions/checkout@v4` plain.

## Desired End State

After this plan:
1. **CLI exits with intent**: `npm run review` (or `npx tsx review.ts`) exits `1` on `verdict: fail`, `0` on `pass`.
2. **Composite action** encapsulates all GitHub logic: diff computation, agent invocation, comment posting, label state machine.
3. **PR workflow** triggers on PR open/sync/reopen + manual `trigger-review` label; gates builds on `verdict: fail`; manages labels (`review-agent-passed` / `review-agent-failed`).
4. **State machine**: Skip re-run if a result label exists; allow re-trigger via `trigger-review` label or label removal.
5. **Fork security**: Uses `pull_request_target` + base-branch-only checkout + safe diff via `git fetch` (never executes fork code).

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Exit semantics | CLI exits 1 on `fail` verdict | Gates CI builds; standard practice | Plan |
| Last-review tracking | Embed SHA in bot's HTML comment (`<!-- review-agent: reviewed-sha=<sha> -->`) | No external storage; comment-level scope; survives deploy | Research / Decisions |
| Empty-diff handling | Skip review if `git diff -- . ':!*.md'` is empty | Saves API cost on markdown-only PRs | Plan |
| Fork-PR security | `pull_request_target` + safe `git fetch` (never checkout fork code) | Provides secrets while preventing code injection | Research / Decisions |
| Label-removal re-trigger | Defer to next push/sync (not immediate re-run) | Simpler workflow logic; batches removals | Plan |
| Test approach | Local testing only (no test workflow) | Faster iteration; risk acceptable for this scope | Plan |
| Permissions | `{ contents: read, pull-requests: write }` | Minimal: read for checkout, write for labels/comments | Research / Decisions |
| Variables storage | GitHub Actions repo Variables (vars.*) + secrets | Can't read `vars`/`secrets` in composite action; pass as inputs instead | Research / Decisions |

## Scope

**In scope:**
- Exit-code gate in `review.ts`
- Composite action `.github/actions/review-agent/action.yml` with diff computation, agent invocation, comment/label orchestration
- Workflow `.github/workflows/review.yml` with PR triggers, state machine, permissions, secret/var wiring
- Manual testing of the integrated system
- Markdown-file exclusion from review (diff-time, not agent change)

**Out of scope:**
- Push-to-main triggers (dropped per decision)
- Test workflow (local testing sufficient)
- Durable state storage outside PR comments
- Backfilling review history on old PRs
- Changes to existing `.github/workflows/ci.yml` or `smoke.yml`

## Architecture / Approach

```
PR open/sync/reopen/labeled/unlabeled
    ↓
[Workflow guard: skip if result label exists, unless trigger-review]
    ↓
[Composite action: safe diff → agent → comment with marker → labels]
    ├─ git fetch (safe, no checkout)
    ├─ Compute diff: git diff base...head -- . ':!*.md'
    ├─ Skip if empty (no-op pass)
    ├─ Pipe to: npx tsx packages/review-agent/review.ts
    ├─ Parse verdict from JSON
    ├─ gh pr comment with embedded SHA marker
    └─ gh pr edit to add/remove labels
    ↓
[Exit 1 if fail verdict → PR check fails]
```

Secrets/vars flow: Workflow → Composite action inputs (since composite can't read `secrets`/`vars` context directly).

## Phases at a Glance

| Phase | Deliverable | Key Risk |
|-------|-------------|----------|
| 1. CLI gate | `review.ts` exits 1 on fail verdict | Misplaced exit logic breaks JSON output (mitigated: exit *after* console.log) |
| 2. Composite action | `.github/actions/review-agent/action.yml` with full orchestration | Fork-code injection if checkout isn't base-ref-only (mitigated: explicit `git fetch` + no ref override) |
| 3. PR workflow | `.github/workflows/review.yml` with triggers and state machine | Label state machine logic is complex; easy to skip re-run when shouldn't (mitigated: explicit `if:` conditions tested) |
| 4. Manual testing | Verified end-to-end on test PR | Requires GitHub access + real OpenRouter API call (mitigated: use affordable test diff) |

**Prerequisites:** 
- `OPENROUTER_API_KEY` secret configured in repo (manual, once)
- `OPENROUTER_MODEL` / `OPENROUTER_MAX_COST` repository variables configured (manual, once)
- Three labels created on repo: `review-agent-passed`, `review-agent-failed`, `trigger-review` (manual, once)

**Estimated effort:** ~2 sessions across 3–4 phases (Phase 1 is a 3-line change; Phase 2–3 are action + workflow definition; Phase 4 is testing).

## Open Risks & Assumptions

- **API cost on large diffs**: LLM token limits (not this code) are the constraint; `OPENROUTER_MAX_COST` is a safety valve.
- **Comment parsing fragility**: Marker search assumes bot's comments follow the format exactly; drift in comment body structure could break re-trigger (mitigated: simple regex, fail gracefully to full diff).
- **Label state machine edge cases**: Quick label removal/re-add cycles might race (mitigated: workflow is synchronous; GitHub serializes label events).

## Success Criteria (Summary)

- ✅ PR receives a comment with review results (pass or fail verdict + rationale).
- ✅ Correct labels applied; state machine skips re-run unless user overrides.
- ✅ CI build gates on fail verdict (PR checks show as failed).
- ✅ Fork PRs run safely without executing fork code.
