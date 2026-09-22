# TASK-002 — Synthetic Engine + Transaction Integrity Report

## Scope

Independent audit and hardening of the INBOX9 synthetic fulfillment engine, synthetic slot inventory, activation lifecycle, service stock accounting, expiration reconciliation, and conflict handling.

No external number/SMS provider behavior is introduced. INBOX9 remains synthetic-only.

## Contract established

`services.stock` represents currently available activation inventory for a service.

Lifecycle accounting is therefore:

| Activation transition | Synthetic slot | Service stock |
| --- | --- | --- |
| Creation / Active | Reserved | -1 |
| Completed | Released | +1 |
| Expired | Released | +1 |
| Refunded via cancellation | Released | +1 |
| Repeated terminal reconciliation | No additional release | No additional increment |

The guarded status transitions and the transaction boundary are the protection against double accounting.

## Findings and resolutions

### P1 — Completed activations did not restore service stock

**Confirmed and fixed.**

Creation decrements stock. Expiration and refund already restored stock, but the Active → Completed path released the synthetic slot without restoring stock.

The same omission existed in expiration reconciliation when a provider reported Completed.

The implementation now restores one stock unit for Completed and Expired terminal outcomes, and requires the corresponding synthetic reservation to exist before committing the terminal transition.

### P2 — Unused weaker random-slot helper

**Resolved.**

`randomSlotForServer()` used `Math.random()` while the active synthetic provider uses `crypto.randomInt()`. The helper is not referenced by the repository's current code path, so it was removed rather than retaining two different randomness standards.

### P2 — Reservation conflict coverage

**Improved.**

The test suite now verifies that the reservation layer surfaces `SYNTHETIC_SLOT_CONFLICT` when the database unique-gate returns no inserted row.

The existing migration remains the authoritative PostgreSQL concurrency gate through the partial unique index on `(service_id, slot_index)` for Reserved rows.

A live PostgreSQL concurrency stress test is still environment-dependent and should be run against a migrated integration database as part of deployment certification.

### P2 — Lifecycle invariant coverage

**Improved.**

A shared synthetic stock-contract helper and tests now explicitly cover:

- Completed → stock restored
- Expired → stock restored
- Active → no terminal restoration
- Refunded/Cancelled → handled by cancellation/refund path, not terminal-status helper

The production terminal paths now require a successful synthetic reservation release before committing the Completed/Expired transition.

## Positive findings

- Synthetic capacity is 5,000 slots per service and is partitioned into exactly 11 contiguous chunks.
- Six chunks contain 455 slots and five contain 454 slots.
- Server/slot ownership is validated before reservation insertion.
- Reserved synthetic slots are protected by a PostgreSQL partial unique index.
- Activation creation retries synthetic slot conflicts up to eight attempts.
- Provider status I/O occurs outside the lifecycle transaction and is followed by an authoritative locked re-check.
- Cancellation/refund and expiration transitions are guarded so repeated processing does not double-apply the terminal state.

## Files changed

- `api/_lib/synthetic-inventory-repository.js`
- `api/_lib/activation-repository.js`
- `api/_lib/provider-operations.js`
- `tests/synthetic-inventory.test.js`

## Remaining integration certification

The repository-level tests verify the contract without requiring a production database. A real PostgreSQL integration environment should additionally execute concurrent identical slot claims and assert exactly one Reserved row succeeds.

## Result

TASK-002 hardening is implemented on the dedicated branch. No production deployment configuration is required for these changes.


## Legacy compatibility guard

Terminal synthetic inventory release is required for current synthetic activations that carry the authoritative `engine=synthetic` + valid `slot` metadata. Historical/legacy activation rows without that metadata may not have a durable reservation; those rows must still be allowed to reach a terminal state rather than being blocked by a reservation assertion. The guarded transition remains the authority against duplicate stock restoration.
