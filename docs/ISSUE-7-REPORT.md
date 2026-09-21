# INBOX9 — Issue 7 Report

## Status
**COMPLETE**

## Objective
Make activation expiration durable and independent of user traffic. The system must detect expired activations on a schedule, check the provider without holding database locks, finalize state exactly once, restore inventory exactly once, and retry failures safely.

## Implemented

### 1. ExpirationPending state
Expired activations are claimed into `ExpirationPending` before provider I/O. This prevents a user cancellation/refund path from racing with the expiry worker after the local expiry deadline has been reached.

### 2. Durable reconciliation claim
`provider_operations` with `operation_type='status_sync'` is used as the durable claim for an expiration check. A partial unique index prevents multiple pending status-sync operations for the same activation.

### 3. Provider I/O outside transactions
The worker first claims work in a short transaction, releases the database connection, and then calls the provider adapter. The provider network request never holds a PostgreSQL row lock.

### 4. Provider result handling
- Provider `Completed` -> activation `Completed`, preserving OTP when provided.
- Provider `Expired` -> activation `Expired` and service stock is restored exactly once.
- Provider `Active` after the INBOX9 expiration deadline -> provider release/cancel is attempted. Success -> activation `Expired` and stock is restored; no wallet refund is issued for passive expiration.
- Provider errors/unsupported states -> durable operation marked `Failed`; activation remains `ExpirationPending` for a later retry.

### 5. Crash recovery
If the function crashes after provider release but before final DB commit, the durable pending status-sync operation remains. A later cron run rechecks provider state and safely completes the activation transition.

### 6. Concurrency safety
`FOR UPDATE SKIP LOCKED` is used to claim due activations. Finalization locks only the operation/activation during the short DB transaction. A guarded `ExpirationPending -> Expired` transition prevents duplicate stock increments.

### 7. Scheduled execution
The existing scheduled job endpoint `/api/internal-provider-reconcile` now runs:
- pending user/provider cancellations
- expiring activation reconciliation
- activation idempotency cleanup
- wallet reconciliation

The endpoint remains protected by `CRON_SECRET` (with `INTERNAL_CRON_SECRET` retained as a local/manual compatibility fallback).

## Important business rule
Expiration is not the same as user cancellation. Expiration releases inventory but does **not** automatically refund the user's wallet. Refunds remain tied to the explicit cancellation lifecycle.

## Verification

```text
npm run check
PASS

npm test
28 / 28 PASS

npm run staging:smoke
PASS
76 services
India / INR
health OK
```

## Infrastructure limitation
A live PostgreSQL/managed-provider run is still required before production certification because this execution environment does not have the production database/provider credentials. The implementation is ready for that external infrastructure gate.
