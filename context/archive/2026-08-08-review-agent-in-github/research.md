---
date: 2026-08-08T00:00:00+02:00
researcher: pawel
git_commit: 968b5255ed5191911c133f58f544d420f3941e95
branch: review-agent
repository: PomoSapiens (plpabla/pomosapiens)
topic: "Running review-agent in GitHub Actions via a composite action — gap analysis and mechanics"
tags: [research, codebase, review-agent, github-actions, composite-action, ci-cd]
status: complete
last_updated: 2026-08-08
last_updated_by: pawel
last_updated_note: "Added follow-up research resolving the five open questions; decisions recorded in change.md"
---

# Research: Running review-agent in GitHub Actions via a composite action

**Date**: 2026-08-08T00:00:00+02:00
**Researcher**: pawel
**Git Commit**: 968b5255ed5191911c133f58f544d420f3941e95
**Branch**: review-agent
**Repository**: PomoSapiens (plpabla/pomosapiens)

## Research Question

Three parts, from `change.md`:
1. Is anything missing from the current change description?
2. How do GitHub composite actions actually work — what's needed to build one?
3. Can the existing `packages/review-agent` CLI be reused as-is for this, or does it need to change?

## Summary

**The existing `review-agent` CLI is reusable almost as-is** — its stdin/stdout/exit-code contract was explicitly designed for CI (see [archived plan](#historical-context-from-prior-changes)). One real gap exists in the CLI itself: **it never fails the process on a `fail` verdict** — it exits 0 whenever the model returns valid JSON, verdict included. All the other CI logic (diff scoping, "since last review" tracking, PR comments, labels, the passed/failed/trigger-review label state machine, push-to-main handling) does **not exist yet** and lives entirely outside the CLI, in the composite action / workflow layer that this change introduces.

**Composite actions have two hard mechanical constraints** that directly affect the plan: (1) they cannot read the `secrets` or `vars` context directly — every secret/variable the action needs (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_MAX_COST`, a PR-write-capable token) must be threaded through as explicit `inputs:` from the calling workflow; (2) every `run:` step in a composite action must declare `shell:` explicitly (no default).

**The change description has five gaps** that will block planning until resolved (detailed below): no definition of what "push to main" review means without a PR to comment/label on; no mechanism specified for tracking "the last review" point for the `trigger-review` incremental-reuse case; no exit/gate semantics (the CLI's silent `verdict: fail` → exit 0 gap, above); no mention of fork-PR / `pull_request` vs `pull_request_target` security tradeoff, relevant even for a single-maintainer repo if outside contributions are ever expected; and no permissions statement (`pull-requests: write` is required on the job to add labels and post comments, and is not the default).

## Detailed Findings

### 1. What `change.md` currently specifies

`context/changes/review-agent-in-github/change.md:10-31`:
- Use `packages/review-agent` in CI via a **composite action**; keep local usability.
- API key via secret, other config via variables (explicit reminder to the planner not to forget this).
- Triggers: PR events, pushes to `main`, and manual trigger via a `trigger-review` label.
- Post-review: add a comment + a `review-agent-passed` / `review-agent-failed` label.
- Labels are created **manually** by the user on the repo (not provisioned by the change) — `review-agent-passed`, `review-agent-failed`, `trigger-review`.
- State machine: once a passed/failed label exists, don't re-run on subsequent PR activity *unless* the user adds `trigger-review` (→ review since last review) or removes all review labels (→ full review vs. target branch).
- Exclude all markdown files from review.

### 2. Gaps in the change description

1. **Push-to-main has no defined output target.** A `push` event to `main` has no associated PR — there's nothing to comment on or label. The spec says "triggered on PRs and pushes to main" but only defines the comment+label behavior in PR terms. Needs a decision: skip posting anything and just fail the Action run (visible in the Actions tab / notifications) on push, or look up the PR that was just merged (`gh pr list --search "<sha>"` / `gh api search/issues`) and comment there instead, or drop push-to-main from scope entirely. This is the single biggest open question — it changes the shape of the workflow's `push` job.

2. **No mechanism for "review since last review."** The `trigger-review` re-trigger path says "perform review from the last review," but nothing tracks *what* the last-reviewed commit was. Candidates: (a) parse the bot's own last PR comment for a hidden marker (`<!-- review-agent: reviewed-sha=<sha> -->`) and diff from there — no extra storage, but couples the workflow to comment-parsing; (b) a git ref/tag or `gh api` PR-level custom property; (c) simplest — always do a full diff vs. target branch, and treat `trigger-review` and "remove all labels" identically (drop the "incremental" distinction). Needs a decision before planning the diff-computation step.

3. **No gate/exit semantics — and the CLI doesn't provide them today.** `packages/review-agent/review.ts:53-72` prints the parsed `ReviewResult` (including `verdict: "fail"`) and exits 0 as long as the model produced valid schema-conforming JSON. There is no `process.exit(1)` path for a failing review — only for input/schema/API failures. A CI gate needs one of: the CLI itself exits non-zero on `verdict === "fail"`, or the workflow parses stdout with `jq` and fails the step explicitly. The archived `review-agent` research flagged this exact gap and deliberately deferred it ("Add gate semantics — print JSON exit 0 does not fail a build," `context/archive/2026-07-31-review-agent/research.md:355-356`) — it was never resolved because CI wiring was explicitly out of scope for that change.

4. **No permissions statement.** Adding labels and posting comments requires the job to declare `permissions: pull-requests: write` (`contents: read` for checkout) — this is not implied by "use a composite action" and isn't the default `GITHUB_TOKEN` scope on this repo's existing workflows (`.github/workflows/ci.yml` and `smoke.yml` declare no elevated PR permissions today; `smoke.yml` even explicitly pins `permissions: contents: read`).

5. **No statement on fork-PR handling.** Not necessarily a blocker for a single-maintainer repo, but worth a one-line decision in the plan: `pull_request` (safe default — no secrets for fork PRs, so the review step would simply fail/skip on external PRs) vs. `pull_request_target` (secrets available, but runs against the base branch's workflow file with the *fork's* code checked out unless carefully scoped — a real injection risk if ever opened to outside contributors).

### 3. How GitHub composite actions actually work

Confirmed against current GitHub Docs (fetched 2026-08-08):

- **Metadata file**: `action.yml` (or `action.yaml`) with `runs: { using: "composite", steps: [...] }`. Lives at a path, referenced by the caller as `uses: ./.github/actions/<name>` for a same-repo action (requires the repo already checked out at that path in the calling job) or `uses: OWNER/REPO@REF` for an external one.
- **Inputs**: declared under `inputs:` with `description`, `required`, `default`. Inside composite steps they're read either as `${{ inputs.<name> }}` in expression contexts or as `$INPUT_<NAME>` env vars in `run:` steps (GitHub auto-uppercases and prefixes).
- **Outputs**: map to a step's output, e.g. `outputs.value: ${{ steps.<id>.outputs.<name> }}`.
- **Every `run:` step must declare `shell:` explicitly** (e.g. `shell: bash`) — composite actions do not default this the way a normal workflow job does.
- **Secrets and vars are *not* automatically available inside a composite action.** This is the load-bearing constraint for this change: a composite action's steps cannot read `${{ secrets.X }}` or `${{ vars.X }}` directly (confirmed via GitHub community/docs discussions — "Vars context not accessible in composite action," and the documented pattern for secrets is identical). The calling workflow must pass them explicitly:
  ```yaml
  - uses: ./.github/actions/review-agent
    with:
      openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
      openrouter-model: ${{ vars.OPENROUTER_MODEL }}
  ```
  and the action's `action.yml` declares matching `inputs:`. This directly satisfies (and constrains the shape of) the change's own reminder — "API key will be passed as a secret along with configuration parameters as variables" — both must be wired as composite-action `inputs`, not read from context inside the action.
- **Trigger mechanics for the label-based manual trigger**: `on: pull_request: types: [opened, synchronize, reopened, labeled, unlabeled]`, filtered in the job/step with `if: github.event.action != 'labeled' || github.event.label.name == 'trigger-review'` (and the symmetric check for `unlabeled`). Needed because the default `pull_request` activity types are only `opened`, `synchronize`, `reopened` — `labeled`/`unlabeled` must be added explicitly to `types:` to fire on label changes at all.
- **GITHUB_TOKEN permissions**: least-privilege by default; must opt in with `permissions: pull-requests: write` at workflow or job level to add labels / post PR comments. Confirmed no repository-level toggle is needed beyond this workflow-level grant for same-repo (non-fork) PRs.
- **Forked PRs**: on plain `pull_request`, secrets are not passed to the runner and `GITHUB_TOKEN` is read-only — a fork-authored PR's review step would fail to authenticate to OpenRouter and to label/comment. `pull_request_target` restores both but runs against the base repo's workflow definition with fork code checked out, which is the classic "don't `npm ci && run fork code` under pull_request_target" injection trap if the checkout step ever executes untrusted code with secrets in scope.

### 4. What's reusable from `packages/review-agent` vs. what's new

**Reusable, no change needed:**
- `review.ts` / `utils.ts` / `review-schema.ts` core logic (`packages/review-agent/review.ts:1-72`) — stdin-diff-in, single-JSON-stdout, stderr-for-logs contract was purpose-built for this (`packages/review-agent/README.md:28-34`).
- Env-var configuration surface already matches "secret + variables": `OPENROUTER_API_KEY` (secret), `OPENROUTER_MODEL` / `OPENROUTER_MAX_COST` (variables) — `packages/review-agent/README.md:20-24`.
- Excluding markdown from review needs **no agent change at all** — it's a property of what diff gets piped in. The CI step composes the diff with a pathspec exclusion (e.g. `git diff <base>...<head> -- . ':!*.md'`) before piping to the CLI; the agent stays diff-content-agnostic.
- Local usability is preserved automatically as long as nothing GH-specific gets pushed into `review.ts` itself — the composite action's own `run:` steps (checkout diff-range computation, `gh pr comment`, `gh pr edit --add-label`) are the natural home for CI-only logic, keeping `git diff | npx tsx review.ts` unchanged.

**New, does not exist today:**
- Exit-code gate on `verdict` (either in the CLI or the composite action's post-processing step — see Gap 3).
- Diff-range computation per trigger type (full vs. target branch; incremental since last review; push-to-main range) — see Gap 2.
- PR comment posting and label add/remove orchestration (`gh pr comment`, `gh pr edit --add-label/--remove-label`).
- The label-state-machine conditional logic (skip re-review when a result label is already present, unless `trigger-review` or a label-removal event) — implemented as workflow-level `if:` conditions plus a step that inspects `github.event.pull_request.labels`.
- The `action.yml` composite action itself (new file, e.g. `.github/actions/review-agent/action.yml`), and one or two calling workflows (e.g. `.github/workflows/review.yml`) wiring triggers, permissions, and secrets/vars → inputs.
- `npm ci` step scoped to `packages/review-agent` (it's a standalone package with its own lockfile, isolated from the root install — same isolation the archived plan built in, `context/archive/2026-07-31-review-agent/plan.md:14-18`).

## Code References

- `context/changes/review-agent-in-github/change.md:10-31` — the change brief under review.
- `packages/review-agent/review.ts:1-72` — full CLI entrypoint; note the absence of any exit path keyed on `review.verdict`.
- `packages/review-agent/utils.ts:1-19` — `readDiff()`, stdin-only, fail-fast on empty (already CI-safe, no TTY-fallback hazard).
- `packages/review-agent/review-schema.ts:1-58` — `ReviewResult` schema and `CRITERIA`; `verdict` field is `"pass" | "fail"` at `review-schema.ts:42`.
- `packages/review-agent/README.md:28-34` — the documented output contract (stdout purity, stderr for logs, exit-code semantics as currently implemented — i.e., non-zero only for input/schema/key failures, not for a `fail` verdict).
- `.github/workflows/ci.yml:1-51` — existing workflow pattern for this repo (no elevated `permissions:`, `actions/checkout@v4` + `actions/setup-node@v4` + `.nvmrc`-pinned Node, secrets passed as job-step `env:`).
- `.github/workflows/smoke.yml:1-37` — existing pattern explicitly pinning `permissions: contents: read`; shows the repo's existing secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, etc.) are already passed as step `env:`, a directly analogous pattern for `OPENROUTER_API_KEY`.
- No `.github/actions/**` exists yet in this repo — this change introduces the first composite action.

## Architecture Insights

- The original `review-agent` change (`context/archive/2026-07-31-review-agent/`) was deliberately scoped to *not* include CI wiring, but was built with CI as the explicit "ultimate target" (`context/archive/2026-07-31-review-agent/research.md:343-345`) — the stdout/stderr/exit-code contract, env-var config, and standalone-package isolation (own `node_modules`, own `tsconfig.json`, excluded from root `eslint`/`tsconfig`) all exist *because* of that anticipated follow-up. This change is that follow-up.
- The repo's two existing workflows (`ci.yml`, `smoke.yml`) establish the local idioms to mirror: `.nvmrc`-pinned `setup-node`, secrets passed as step-level `env:` (not composite inputs, since neither workflow uses a composite action yet), and `permissions:` only pinned where needed (`smoke.yml`). The new workflow should follow the same secret-handling idiom, just routed through composite-action `inputs:` instead of direct step `env:`, since composite actions can't read `secrets`/`vars` contexts directly.
- Keeping GH-specific orchestration (comment/label/diff-range logic) out of `review.ts` and inside the composite action's `run:` steps is consistent with the original design intent recorded in the archived plan ("No GitHub Actions / CI wiring in this change... so the follow-up CI slice is drop-in," `context/archive/2026-07-31-review-agent/plan.md:53`) — the CLI was never meant to know about GitHub.

## Historical Context (from prior changes)

- `context/archive/2026-07-31-review-agent/plan.md` — original implementation plan for the CLI itself; §"What We're NOT Doing" explicitly excludes GitHub Actions wiring, forked-PR security design, and `gh pr comment` — all of which are exactly this change's scope.
- `context/archive/2026-07-31-review-agent/research.md:343-362` ("CI/CD readiness" section) — pre-identifies three of the same gaps this research independently found: explicit fail-fast input contract (resolved — stdin-only, no sample fallback), stdout purity (resolved), and gate semantics (**still unresolved** — Gap 3 above). Also flags forked-PR secrets and `npm ci` reproducibility as deferred-but-tracked concerns, matching Gap 5 above.

## Related Research

None yet under `context/changes/**` for this specific change beyond this document.

## Open Questions

All resolved 2026-08-08 (see `change.md` §Decisions for the authoritative record):

1. ~~Push-to-main~~ — **dropped**. PR-triggers and the `trigger-review` label only.
2. ~~"Last review" tracking~~ — **resolved**: read the SHA embedded in the bot's most recent PR comment (hidden HTML-comment marker), diff from there.
3. ~~Gate semantics~~ — **resolved**: `review.ts` itself exits `1` on `verdict === "fail"`, `0` on `"pass"` (new code, in addition to existing input/key/schema failure exits).
4. ~~Fork-PR support~~ — **resolved**: in scope. Use `pull_request_target`, with the mitigation that the workflow only ever checks out the base ref and treats the fork's contribution as inert diff text, never executes it.
5. ~~Variables location~~ — **resolved**: GitHub Actions repository Variables (`vars.*`), passed as composite-action inputs alongside the secret.

New follow-up open item from resolving #4: **the diff-computation step now has a non-negotiable security constraint** — it must fetch the PR head SHA and diff against it without ever checking it out as the working tree for anything that executes (`npm ci`, `tsx`, etc.). The plan must spell out the exact git commands (e.g. `git fetch origin <head-sha> && git diff <base>...<head-sha>` from a checkout that stays on the base ref) rather than the more obvious `actions/checkout` with `ref: <pr-head>`, which is the common `pull_request_target` foot-gun.
