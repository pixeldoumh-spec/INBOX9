# INBOX9 Multi-Agent Collaboration

This directory defines how independent engineering agents collaborate on INBOX9 through GitHub.

## Source of truth

GitHub is the shared source of truth. Agents communicate through Issues, Pull Requests, review comments, and committed artifacts.

## Roles

- **Product Owner — user:** final approval for product direction and merges.
- **Lead Architect — ChatGPT:** owns architecture, integration decisions, UX direction, review, and final technical coordination.
- **Specialist Engineer — Perplexity/Claude:** performs bounded audits, research, implementation tasks, and PRs assigned through GitHub.

## Safety rules

1. Never push speculative changes directly to `main` for an assigned engineering task.
2. Work from a dedicated branch and open a PR against `main`.
3. Keep each task narrowly scoped.
4. Do not rewrite unrelated files or architecture.
5. Preserve the synthetic-only fulfillment model and existing core functionality.
6. Run the repository checks relevant to the changed area before opening a PR.
7. Report assumptions, limitations, test results, and files changed in the PR.
8. ChatGPT reviews specialist PRs before merge unless the user explicitly chooses another process.

## Task lifecycle

`ISSUE → CLAIM → BRANCH → IMPLEMENT/AUDIT → TEST → PR → REVIEW → APPROVE/CHANGES → MERGE`

## Current task

See `tasks/TASK-001-mobile-ux-audit.md`.
