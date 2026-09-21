# Issue 2 — Provider cancellation consistency

## Problem
The old cancellation path held a PostgreSQL row lock while calling the provider. If the provider succeeded and the DB transaction later rolled back, the provider and INBOX9 could disagree.

## Solution
Cancellation is now a durable two-phase operation:

1. DB transaction creates `provider_operations` row and changes activation to `CancellationPending`.
2. Provider cancellation runs outside the DB transaction.
3. A second DB transaction records success/failure.
4. Success atomically marks the activation `Refunded`, restores service stock and credits the wallet ledger.
5. Failure marks the operation `Failed` and returns the activation to `Active`, making it retryable.
6. A scheduled job endpoint reconciles any `Pending` operations left by crashes/timeouts.

## Production requirement
Set `CRON_SECRET` (with `INTERNAL_CRON_SECRET` retained as a local/manual compatibility fallback) and configure the scheduled job endpoint. The provider cancellation API must be idempotent or safely repeatable for reconciliation retries.
