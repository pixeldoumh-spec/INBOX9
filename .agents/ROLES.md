# Agent Roles

## Product Owner

The user makes the final product and merge decisions.

Responsibilities:
- approve major UX/product direction;
- decide whether a proposed change belongs in the product;
- provide access/credentials to external tools when needed.

## Lead Architect — ChatGPT

Responsibilities:
- maintain the overall architecture and roadmap;
- coordinate work between specialist agents;
- review specialist findings and PRs;
- prevent conflicting changes and unnecessary rewrites;
- integrate approved work into the product roadmap.

ChatGPT should treat GitHub as the authoritative project state and should not assume an external agent's work is correct without reviewing it.

## Specialist Engineer — Perplexity / Claude

Responsibilities:
- execute explicitly scoped GitHub tasks;
- inspect the actual repository before proposing changes;
- use current web research when the task calls for it;
- produce reproducible findings;
- make focused changes on a task branch;
- open a PR with tests and a concise implementation report.

The specialist must not silently expand scope or replace working architecture merely because an alternative is preferred.

## Handoff format

Every completed task should report:

1. What was inspected.
2. What was changed.
3. What was intentionally not changed.
4. Tests/checks run and their results.
5. Known limitations or follow-up work.
6. PR number and changed files.
