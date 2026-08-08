---
change_id: review-agent-in-github
title: Run the review agent in the CI/CD pipeline
status: impl_reviewed
created: 2026-08-08
updated: 2026-08-08
archived_at: null
---

## Notes

Use review-agent (`packages\review-agent`) in ci/cd pipeline. We are using github actions and **composite action** for that.
You can modify current agent to be used for CI/CD, but make sure I can still run it locally as well.

API key will be passed as a secret along with configuration parameters as variables (menition it in a plan so I won't forget to do it)

It should be triggered on PR's and pushes to main. It should be also possible to trigger it manually (by setting the label on PR)
After review, comment should be added along with a label.

On repo I'll create labels manually:

- `review-agent-passed` - add this label if review was passed
- `review-agent-failed` - add this label if review was failed
- `trigger-review` - when this label is added on PR, trigger review. After that, remove this label and add passed/failed one

Note: when `review-agent-passed` or `review-agent-failed` is present, do not trigger review on this PR on following requests. To re-run review, user can:

- add `trigger-review` label - in that case perform review from the last review
- remove all review labels - in that case perform full review (all changes vs target branch)

Note: **exclude from review all markdown files**

## Decisions (research follow-up, 2026-08-08)

Resolves the Open Questions in `research.md`.

- **Push-to-main trigger: dropped.** Only PR events (open/sync/reopen) and the `trigger-review` label trigger a review. No `on: push` handling.
- **"Review since last review": tracked via the PR comment thread.** ~~The review comment the bot posts must embed a hidden marker with the commit SHA it reviewed (e.g. `<!-- review-agent: reviewed-sha=<sha> -->`). On `trigger-review`, the workflow reads the most recent bot comment on the PR, extracts that SHA, and diffs `<that-sha>...<head>` instead of `<target-branch>...<head>`. No external storage needed.~~ **Dropped, 2026-08-08** — see "Update" below.
- **Gate/exit semantics: `review-agent` itself changes.** `packages/review-agent/review.ts` gets a new exit path: after printing the JSON to stdout, exit `1` if `review.verdict === "fail"`, exit `0` if `"pass"`. This is in addition to (not instead of) the existing non-zero exits for input/key/schema failures. Local CLI usage is unaffected — the JSON is still printed either way, only the process exit code changes.
- **Permissions: minimal explicit set — `permissions: { contents: read, pull-requests: write }`**, declared job-level on the new review workflow, overriding whatever the repo-wide default is. `contents: read` covers checkout; `pull-requests: write` is the single scope that covers reading a PR's existing comments/labels and posting comments/adding-removing labels on it (this is the standard, narrowest scope for PR-comment/label bots — it does *not* require the broader `issues: write`, which is only needed for non-PR issue operations). No other scopes are needed.
- **Variables location: GitHub Actions repository Variables** (Settings → Secrets and variables → Actions → Variables tab). `OPENROUTER_MODEL` / `OPENROUTER_MAX_COST` live there as `vars.*`; the calling workflow passes them alongside `secrets.OPENROUTER_API_KEY` as explicit `with:` inputs to the composite action (composite actions can't read `vars`/`secrets` context directly — see research.md §3).
- **Fork-PR support: in scope, via `pull_request_target`.** Trigger uses `pull_request_target` (not `pull_request`) so forked-repo PRs get secrets and a write-capable token. Security mitigation required: the workflow must never execute code checked out from the fork's HEAD ref. Checkout stays on the base ref (so `packages/review-agent`'s own source is always the trusted, base-branch version); the fork's contribution is only ever fetched as inert diff text (`git fetch` the PR head SHA, `git diff` against it, pipe as text) — never run as code. This is what keeps the trigger swap safe despite being a one-line change on the surface.

## Update (2026-08-08): dropped "review since last review"

The incremental-diff behavior on `trigger-review` (diffing from the SHA embedded in the bot's last comment instead of the target branch) turned out to be a bad idea in practice — reviews should always cover the *entire* PR diff vs. the target branch, not just what changed since the last review pass. Rationale: a partial re-review can miss issues introduced earlier in the PR that the last review already (incorrectly) passed, and it made review scope depend on comment history rather than actual code state.

Changes:

- `.github/actions/review-agent/action.yml`: removed the "Determine diff base" step (the `gh pr view` comment lookup + `reviewed-sha` regex parse). "Compute diff" now always runs `git diff origin/${{ github.base_ref }}...pr_head` regardless of trigger.
- Removed the now-unused `<!-- review-agent: reviewed-sha=<sha> --> ` marker from the posted PR comment, since nothing reads it anymore.
- `trigger-review` still works as a manual re-run trigger — it just always produces a full review now, same as removing all review labels.

Note (line 28 above, "add `trigger-review` label - in that case perform review from the last review") is superseded: both re-run paths (`trigger-review` and removing all labels) now behave identically — full review vs. target branch.
