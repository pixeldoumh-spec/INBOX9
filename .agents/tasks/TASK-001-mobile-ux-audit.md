# TASK-001 — Mobile UX + Browser Behavior Audit

**Status:** READY
**Owner:** Perplexity / Claude specialist agent
**Target:** INBOX9 customer-facing web app
**Priority:** High
**Scope:** Audit first; implementation only if separately approved through a PR.

## Objective

Independently audit the current INBOX9 web app for mobile usability and browser behavior. The goal is to identify concrete problems that prevent the app from feeling like a polished customer-facing marketplace on a phone.

## Inspect

Review the actual repository implementation, especially:

- marketplace/service catalog;
- 832-service rendering, search and category navigation;
- server selection / 11-server expansion panels;
- purchase review and confirmation flow;
- active numbers / activation tracking;
- orders/history;
- wallet and UPI recharge flow;
- navigation and responsive layout;
- dialogs, sheets, forms and sticky actions;
- loading, empty, error and success states.

## Evaluate

Check at minimum:

- 320px, 360px, 390px and 430px viewport behavior;
- tap-target size and spacing;
- horizontal overflow;
- fixed/sticky elements covering content;
- keyboard/form behavior;
- modal/sheet usability;
- text wrapping and truncation;
- scroll performance and unnecessary DOM work;
- initial rendering of the large service catalog;
- search/filter responsiveness;
- accessibility basics: focus visibility, labels, semantic controls and contrast;
- browser-console errors that can be reproduced from the repository.

## Deliverable

Create a GitHub issue or report with a prioritized table:

| Priority | Screen/component | Exact problem | Evidence/location | User impact | Recommended fix |
|---|---|---|---|---|---|

Use **P0** for blocking/broken behavior, **P1** for high-impact usability issues, **P2** for polish, and **P3** for optional improvements.

For every finding, give the exact file, selector, function, or component when possible. Do not invent behavior that cannot be supported by the repository or a reproducible test.

## Constraints

- Do not remove existing functionality.
- Do not change the synthetic inventory model.
- Do not introduce a hosting/deployment dependency.
- Do not rewrite the frontend framework or architecture for stylistic reasons.
- Do not modify `main` directly.
- If implementation is requested later, make a focused PR with tests.

## Completion criteria

The task is complete when the specialist provides:

1. a prioritized audit;
2. exact repository locations for findings;
3. reproducible evidence where possible;
4. recommended fixes separated from observations;
5. a proposed implementation order;
6. no unrelated code changes.
