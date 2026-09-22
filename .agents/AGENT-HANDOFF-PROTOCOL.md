# External-Agent Completion Handshake

The external agent may complete work outside ChatGPT's active session. Completion is not considered project-complete until the result is persisted to GitHub.

## Required completion handshake

For every assigned task, the specialist must do all of the following before reporting "complete" to the user:

1. Persist the audit/report in GitHub as a committed Markdown artifact or GitHub Issue comment.
2. If code was changed, push the task branch and open a PR against `main`.
3. If no code was changed, create or update the task's GitHub Issue with the final report.
4. Include the exact branch, commit SHA when available, PR/Issue number, changed files, and test/check results.
5. Mark the task status explicitly as `COMPLETE — HANDOFF READY`.
6. Never rely on a message in an external tool as the only copy of the completed work.

## Coordinator verification

ChatGPT should verify the GitHub artifact before treating the task as complete:

- Locate the reported PR/Issue.
- Verify the branch/commit exists.
- Read the actual report and/or diff.
- Check that scope matches the assigned task.
- Review evidence and tests independently.
- Record review findings in GitHub.

## Handoff status

Use this exact block in the final GitHub handoff:

```
STATUS: COMPLETE — HANDOFF READY
TASK: TASK-XXX
BRANCH: <branch>
COMMIT: <sha>
PR/ISSUE: <number>
REPORT: <path or issue comment>
TESTS: <commands/results>
CHANGED FILES: <list>
LIMITATIONS: <list>
```

A task is **not** complete for coordination purposes until this block is available in GitHub.

## Why this exists

An external agent can finish successfully while the coordinator cannot see the result. GitHub is the shared source of truth, so the handoff itself must be durable, discoverable, and independently reviewable.
