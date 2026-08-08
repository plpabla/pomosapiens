# Review Agent in GitHub — Implementation Plan

## Overview

Integrate the `packages/review-agent` CLI into GitHub's CI/CD via a composite action, enabling automated code reviews on pull requests with PR comments, labels, and state-machine-based re-triggering. The agent exits with a `fail` verdict to gate CI builds; security is hardened against fork-PR code injection via `pull_request_target` with base-branch-only checkout; and local CLI usage remains unchanged.

## Current State Analysis

- **`packages/review-agent` CLI** (`review.ts` + `utils.ts` + `review-schema.ts`) is built for CI with stdin-diff input and JSON stdout output, but **currently exits 0 on valid JSON regardless of verdict**.
- **Existing workflows** (`.github/workflows/ci.yml`, `smoke.yml`) follow patterns: `setup-node@v4` + `.nvmrc` cache, step-level `env:` for secrets, `actions/checkout@v4` plain.
- **No composite actions** exist in the repo yet.
- **No CI wiring** for review-agent—the CLI has no GitHub integration, no label/comment posting, no state machine.

## Desired End State

1. **CLI gate semantics**: `review.ts` exits `1` if `verdict === "fail"`, `0` if `"pass"` (new exit path in addition to existing input/key/schema failure exits).
2. **Composite action** (`.github/actions/review-agent/action.yml`): encapsulates diff computation, agent invocation, comment posting, and label state machine. Secrets/vars passed as `inputs:` from calling workflow.
3. **PR workflow** (`.github/workflows/review.yml`): triggers on PR open/sync/reopen + manual `trigger-review` label; computes diff with markdown exclusion; invokes agent; posts comment with embedded SHA marker; manages labels (`review-agent-passed` / `review-agent-failed`).
4. **State machine**:
   - Skip re-run if `review-agent-passed` or `review-agent-failed` label exists.
   - User can re-trigger via `trigger-review` label (reads last-reviewed SHA from bot comment, diffs incrementally).
   - User can force full re-review by removing all review labels (re-computes diff vs. base branch).
5. **Fork security**: `pull_request_target` + base-branch checkout + safe diff via `git fetch` (never execute fork code).

### Key Discoveries:

- **Verdict in schema**: `review-schema.ts:42` defines `verdict: z.enum(["pass", "fail"])`, determined by LLM in `submit_review` tool args; CLI just outputs it. Exit logic gates on this field.
- **Last-review tracking**: Embed SHA marker in HTML comment (`<!-- review-agent: reviewed-sha=<sha> -->`), parse on re-trigger to compute incremental diff.
- **Fork-safe diff**: `git fetch origin pull/<number>/head:ref && git diff base...ref` reads PR diff without checking out fork code. Stays on base ref for all `npm`/`tsx` steps.
- **Empty diff handling**: Skip review if `git diff -- . ':!*.md'` produces no output (e.g., markdown-only PR).
- **Composite action constraints**: Cannot read `secrets`/`vars` directly; must pass as explicit `inputs:` from workflow. Every `run:` step must declare `shell:` explicitly.
- **Permissions**: Job requires `permissions: { contents: read, pull-requests: write }` (read for checkout, write for labels/comments).

## What We're NOT Doing

- Push-to-main triggers (dropped per decisions; only PR + label triggers).
- Test workflow (local testing only before ship).
- Durable state storage (SHA markers in comments are sufficient; no git tags, no database).
- Modifying `npm ci` lockfile behavior (stays in `packages/review-agent/` scope).
- Backfilling review history on old PRs.

## Implementation Approach

**Phase-ordered changes to preserve local usability:**

1. **Phase 1**: Update CLI exit semantics so local `git diff | npx tsx review.ts` still works but now exits 1 on fail verdict (backward-compatible for CI gates).
2. **Phase 2**: Build composite action (new `.github/actions/` directory, no changes to existing code).
3. **Phase 3**: Wire workflow trigger and orchestration (new `.github/workflows/review.yml`).
4. **Phase 4**: Manual verification of the agent in action (local diff testing, then dry-run on a test PR).

## Critical Implementation Details

**Diff computation security**: On `pull_request_target`, the workflow must never check out the fork's HEAD. Instead, use:
```bash
git fetch origin pull/${{ github.event.number }}/head:pr_head
git diff origin/${{ github.base_ref }}...pr_head -- . ':!*.md'
```
The checkout step stays on base branch (default). The fork's contribution is only ever read as inert diff text piped to stdin of the agent.

**Hidden marker parsing**: When the `trigger-review` label is present, search the bot's most recent PR comment for `<!-- review-agent: reviewed-sha=<sha> -->`. If found, use that SHA; otherwise fall back to full diff vs. base branch.

**State machine**: Use conditional `if:` at workflow level. Example:
```yaml
if: |
  !contains(github.event.pull_request.labels.*.name, 'review-agent-passed') &&
  !contains(github.event.pull_request.labels.*.name, 'review-agent-failed') ||
  github.event.label.name == 'trigger-review'
```

---

## Phase 1: Update `review.ts` Exit Semantics

### Overview

Add exit code logic so the CLI exits `1` when `verdict === "fail"` (after printing JSON to stdout). This preserves the existing output contract while adding the gate behavior needed for CI.

### Changes Required:

#### 1. review.ts

**File**: `packages/review-agent/review.ts`

**Intent**: Add an exit path after JSON output that checks the verdict and exits with the appropriate code. The change is minimal: read `review.verdict` from the parsed result and call `process.exit()` accordingly.

**Contract**: After line 72 (the current `console.log(JSON.stringify(...))` call), add:
```typescript
process.exit(review.verdict === "fail" ? 1 : 0);
```
This ensures:
- Exit 0 if `review.verdict === "pass"`
- Exit 1 if `review.verdict === "fail"`
- Existing non-zero exits for input/key/schema failures remain unchanged (they throw before reaching this point)

### Success Criteria:

#### Automated Verification:

- TypeScript type-checking passes: `npm run lint` (repo root; should not break review-agent's own isolated checks)
- review-agent CLI still runs: `git diff | npx tsx packages/review-agent/review.ts` (use a test diff to verify)
- Verify exit codes locally: `git diff | npx tsx packages/review-agent/review.ts; echo "Exit code: $?"` returns 0 on pass, 1 on fail

#### Manual Verification:

- Run the CLI locally on a sample diff and confirm exit code matches verdict
- Confirm JSON output is still printed to stdout (before exit)
- Confirm no stderr clutter from the exit call

**Implementation Note**: After this phase passes local testing, it is backwards-compatible and ready to ship. The composite action will rely on this exit code.

---

## Phase 2: Create Composite Action

### Overview

Build `.github/actions/review-agent/action.yml` with the full logic for diff computation, agent invocation, comment posting, label management, and the state machine. This action encapsulates all GitHub-specific orchestration, keeping `review.ts` agnostic.

### Changes Required:

#### 1. Create action.yml

**File**: `.github/actions/review-agent/action.yml`

**Intent**: Define a reusable composite action that the main workflow will invoke. It handles:
- Receiving secrets/vars as inputs (since composite actions can't read `secrets`/`vars` context directly).
- Computing the diff (full vs. incremental based on label state).
- Piping diff to the agent.
- Parsing the verdict from stdout.
- Posting a PR comment with the embedded SHA marker.
- Adding/removing labels based on verdict.

**Contract**: The action must have:

**Inputs**:
- `openrouter-api-key` (string, required): Secret for OpenRouter API
- `openrouter-model` (string, default: `anthropic/claude-sonnet-5`): Model name
- `openrouter-max-cost` (string, default: `0.50`): Max cost in USD
- `github-token` (string, required): GITHUB_TOKEN for PR comment/label operations

**Outputs**:
- `verdict` (string): `"pass"` or `"fail"`
- `comment-id` (string): ID of the posted comment (for tracking)

**Environment Variables** (internal to steps):
- `OPENROUTER_API_KEY` (set from `openrouter-api-key` input)
- `OPENROUTER_MODEL` (set from `openrouter-model` input)
- `OPENROUTER_MAX_COST` (set from `openrouter-max-cost` input)

**Steps** (in order):
1. **Checkout base branch** — uses `actions/checkout@v4` (default: base ref, no ref override).
2. **Fetch PR head** — `git fetch origin pull/${{ github.event.number }}/head:pr_head` (safe for `pull_request_target`).
3. **Determine diff range**:
   - If `trigger-review` label is present: search bot's last comment for `<!-- review-agent: reviewed-sha=<sha> -->` marker; if found, use `<sha>...pr_head`; else fall back to `origin/${{ github.base_ref }}...pr_head`.
   - Otherwise (normal PR event): always use `origin/${{ github.base_ref }}...pr_head`.
4. **Compute diff** (excluding `.md` files):
   - `git diff <base>...<head> -- . ':!*.md' > diff.patch`
   - Check if diff is empty; if so, set verdict to `"pass"` (no code changes) and skip the agent.
5. **Run agent**:
   - `cat diff.patch | npx tsx packages/review-agent/review.ts > review-output.json`
   - Parse `review-output.json` and capture `verdict`.
   - If agent exits non-zero (input/key/schema failure), fail the step with an informative message.
6. **Post comment**:
   - Construct comment body with review results and embedded marker: `<!-- review-agent: reviewed-sha=${{ github.event.pull_request.head.sha }} -->`
   - `gh pr comment <number> --body "$comment_body"` (use `gh` CLI with `GITHUB_TOKEN`).
7. **Manage labels**:
   - If `verdict === "pass"`: `gh pr edit <number> --add-label review-agent-passed --remove-label review-agent-failed trigger-review`
   - If `verdict === "fail"`: `gh pr edit <number> --add-label review-agent-failed --remove-label review-agent-passed trigger-review`

### Success Criteria:

#### Automated Verification:

- Composite action YAML is valid: `yq eval . .github/actions/review-agent/action.yml` (or manual inspection for schema compliance)
- `npx tsx` is available in the runner's PATH (should be true via `setup-node` in parent workflow)
- `gh` CLI is available (built-in on GitHub's runners)

#### Manual Verification:

- Invoke the action in a workflow and inspect the logs to verify:
  - Diff is computed correctly (no fork code execution)
  - Agent is invoked and returns JSON
  - Comment is posted to the PR with the embedded marker
  - Labels are added/removed as expected
- Verify edge case: markdown-only PR (diff is empty) → comment posted with "no code changes" message, no agent invocation

**Implementation Note**: This action is reusable; it can be called from multiple workflows if needed in the future. Decouple it from trigger logic (the workflow handles when to call it).

---

## Phase 3: Create PR Workflow and Wire Triggers

### Overview

Create `.github/workflows/review.yml` that defines triggers (PR events + label), permissions, and the orchestration for calling the composite action. This workflow also implements the label state machine to skip re-runs when appropriate.

### Changes Required:

#### 1. review.yml workflow

**File**: `.github/workflows/review.yml`

**Intent**: Wire the PR triggers (open/sync/reopen/labeled/unlabeled), implement the state machine (skip re-run if result label exists unless user overrides), set permissions, pass secrets/vars to the composite action, and gate on exit code.

**Contract**: The workflow must:

**Triggers**: `on: pull_request: types: [opened, synchronize, reopened, labeled, unlabeled]`

**Permissions** (job-level):
```yaml
permissions:
  contents: read
  pull-requests: write
```

**Guard Logic** (via `if:` on the review job):
- Skip if both `review-agent-passed` AND `review-agent-failed` labels are absent OR if `trigger-review` label was just added OR if a review label was just removed.
- Pseudocode:
  ```
  if (no result label exists) OR (trigger-review label is present) then run
  else skip
  ```
  In YAML:
  ```yaml
  if: |
    (!contains(github.event.pull_request.labels.*.name, 'review-agent-passed') &&
     !contains(github.event.pull_request.labels.*.name, 'review-agent-failed')) ||
    github.event.label.name == 'trigger-review'
  ```

**Environment Variables** (passed to composite action via `with:`):
- `openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}`
- `openrouter-model: ${{ vars.OPENROUTER_MODEL }}`
- `openrouter-max-cost: ${{ vars.OPENROUTER_MAX_COST }}`
- `github-token: ${{ secrets.GITHUB_TOKEN }}`

**Gate on exit code**:
- The composite action's agent step will exit non-zero on `verdict: fail` (Phase 1).
- Workflow should NOT set `continue-on-error: true`; let the step fail and the job fail, making it visible in PR checks.
- GitHub PR status will show as "failed" if review failed; passing reviews show as "success".

**Steps** (job structure):
1. Checkout base branch (handled by composite action).
2. Setup Node + npm cache (use `.nvmrc`): same pattern as `ci.yml` and `smoke.yml`.
3. Invoke composite action: `uses: ./.github/actions/review-agent` with `with:` inputs for secrets/vars.
4. (Optional) Report results in job summary for visibility.

### Success Criteria:

#### Automated Verification:

- Workflow YAML is valid: `act -l` or `gh workflow view review.yml` (syntax check)
- Trigger types include all of `[opened, synchronize, reopened, labeled, unlabeled]`
- Permissions are declared at job level
- Secrets/vars are threaded correctly to composite action inputs
- Exit code logic is preserved (no `continue-on-error`)

#### Manual Verification:

- Create a test PR to a `review-agent` branch (or similar); verify:
  - Workflow triggers on PR open
  - Comment is posted with review results
  - Labels are added (pass or fail)
  - Re-opening the PR does NOT re-run review (state machine works)
  - Adding `trigger-review` label forces re-run
  - Removing all review labels forces full re-run
- Verify fork-PR handling (if possible):
  - Fork the repo, create a PR from the fork
  - Verify the review runs (secrets available via `pull_request_target`)
  - Verify no fork code is executed (diff is computed safely)

**Implementation Note**: After this phase, the CI/CD integration is complete. The workflow is the "entry point" users see; the composite action is the reusable, testable unit; the CLI is unchanged except for the exit-code gate.

---

## Phase 4: Manual Testing and Verification

### Overview

Test the integrated system locally (CLI + action + workflow) before shipping. Verify the full end-to-end flow: PR creation, agent invocation, comment posting, label management, and state machine.

### Changes Required:

None — this phase is verification only.

### Testing Steps:

1. **Local CLI verification** (Phase 1 follow-up):
   - Create a test diff file (e.g., a small code change).
   - Run: `cat test.diff | OPENROUTER_API_KEY=<key> npx tsx packages/review-agent/review.ts`
   - Verify JSON output and exit code (0 on pass, 1 on fail).

2. **Composite action dry-run**:
   - Test the action's bash steps locally (git diff logic, marker parsing, label management with `gh` CLI mocked).

3. **Full workflow test on test PR**:
   - Push a branch to trigger the workflow.
   - Verify:
     - Workflow runs and calls the composite action.
     - Comment is posted to the PR.
     - Labels are applied correctly.
     - Re-running the workflow (push again) is skipped if a result label exists.
     - Adding `trigger-review` label forces re-run.
   - Verify output: comment body includes review rationale and embedded SHA marker.

4. **Edge case testing**:
   - Markdown-only PR (should skip review, mark as passed).
   - Empty PR (no changes).
   - Fork PR (verify it runs without checkout-out fork code).

### Success Criteria:

#### Manual Verification:

- PR receives a comment with review results (✅ pass or ❌ fail).
- Label state machine works: no re-run unless `trigger-review` or labels removed.
- No unexpected errors in workflow logs.
- Fork PR (if tested) runs safely without executing fork code.
- Comment marker is present and parseable by re-runs.

---

## Testing Strategy

### Unit Testing:

- No new unit tests required. Existing review-agent tests (if any) pass; the exit-code addition is a pure pass-through.

### Integration Testing:

- Full workflow on a real PR (manual, see Phase 4).
- Test state machine transitions (first run → pass/fail → re-trigger → incremental review).

### Manual Testing Steps:

1. **Local**: `git diff | npx tsx packages/review-agent/review.ts` on various diffs, verify exit codes.
2. **Workflow**: Push to a test branch, trigger PR, observe comment/labels/state machine.
3. **Fork**: (If applicable) Fork the repo, create a PR, verify it runs without injecting fork code.

## Performance Considerations

- **API cost**: Controlled by `OPENROUTER_MAX_COST` variable; agent exits early if cost exceeds threshold (existing logic).
- **Diff size**: Excluding markdown files reduces noise; large diffs are still handled (LLM token limits are the constraint, not this workflow).
- **Re-run frequency**: State machine prevents redundant reviews unless explicitly triggered (saves API calls).

## Migration Notes

**Local CLI usage**: Unchanged. `git diff | npx tsx packages/review-agent/review.ts` still works exactly as before, but now exits `1` on fail verdict. No breaking changes for existing local workflows.

**Secrets setup** (one-time, manual operator step):
- Add `OPENROUTER_API_KEY` as a repository secret (Settings → Secrets and variables → Actions).
- Add `OPENROUTER_MODEL` and `OPENROUTER_MAX_COST` as repository variables (Settings → Secrets and variables → Variables).
- (These are passed to the workflow, then to the composite action.)

**Labels setup** (one-time, manual operator step):
- Create three labels on the repo:
  - `review-agent-passed`
  - `review-agent-failed`
  - `trigger-review`

## References

- Review agent CLI: `packages/review-agent/review.ts`
- Research: `context/changes/review-agent-in-github/research.md`
- Existing workflows: `.github/workflows/ci.yml`, `smoke.yml`
- GitHub composite action docs: https://docs.github.com/en/actions/creating-actions/creating-a-composite-action
- `gh pr comment` / `gh pr edit` docs: https://cli.github.com/manual/gh_pr_comment, `gh_pr_edit`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Update review.ts Exit Semantics

#### Automated

- [x] 1.1 TypeScript type-checking passes (`npm run lint`) — 116046d
- [x] 1.2 CLI runs and produces correct exit codes (0 on pass, 1 on fail) — 116046d

#### Manual

- [x] 1.3 Verify exit code behavior locally with sample diffs — 116046d
- [x] 1.4 Confirm JSON output is still printed before exit — 116046d

### Phase 2: Create Composite Action

#### Automated

- [x] 2.1 Composite action YAML is valid — b44d153
- [x] 2.2 `npx tsx` and `gh` CLI are available in runner — b44d153

#### Manual

- [ ] 2.3 Verify diff computation and agent invocation in logs
- [ ] 2.4 Verify comment is posted with embedded marker
- [ ] 2.5 Verify labels are added/removed correctly
- [ ] 2.6 Test markdown-only PR edge case

### Phase 3: Create PR Workflow

#### Automated

- [x] 3.1 Workflow YAML is valid
- [x] 3.2 Trigger types include all PR events and label events
- [x] 3.3 Permissions are declared correctly

#### Manual

- [ ] 3.4 Workflow triggers on PR open
- [ ] 3.5 State machine prevents re-run when result label exists
- [ ] 3.6 `trigger-review` label forces re-run
- [ ] 3.7 Removing all labels forces full re-review
- [ ] 3.8 Fork PR runs safely without executing fork code

### Phase 4: Manual Testing and Verification

#### Manual

- [ ] 4.1 Local CLI verification complete
- [ ] 4.2 Composite action dry-run passes
- [ ] 4.3 Full workflow test on test PR passes
- [ ] 4.4 Edge case testing (markdown, empty, fork) complete
