# INBOX9 Issue 7 — Durable Activation Expiration & Reconciliation

## Objective
Make activation expiry durable and independent of user page traffic. Expired activations are claimed by the internal reconciliation job, checked against the provider without holding PostgreSQL locks, and finalized exactly once.

## Lifecycle

```text
Active
  | expires_at <= NOW()
  v
ExpirationPending
  |
  +--> provider says Completed --> Completed
  |
  +--> provider says Expired ----> Expired + inventory release
  |
  +--> provider still Active ----> provider release/cancel
  |                                   |
  |                                   +--> success --> Expired + inventory release
  |                                   +--> failure --> retryable ExpirationPending
  |
  +--> provider/error -------------> retryable ExpirationPending
```

Expiration does not issue an automatic wallet refund. User cancellation/refund remains a separate lifecycle.

## Durability

`provider_operations.operation_type='status_sync'` is used as the durable claim for an expiration reconciliation attempt. A partial unique index prevents more than one pending status-sync operation for the same activation.

A crash after provider release but before DB finalization leaves the operation pending. A later cron run re-checks provider state and safely finalizes it.

## Concurrency

- Claim uses `FOR UPDATE SKIP LOCKED`.
- Provider I/O occurs outside DB transactions.
- Finalization uses a short transaction and locks only the operation/activation row.
- Only `ExpirationPending -> Expired` can restore inventory, preventing duplicate stock increments.
- A completed activation will not be overwritten by a stale expiration response.

## Scheduled worker

`/api/internal-provider-reconcile` now runs cancellation reconciliation, expiration reconciliation, idempotency cleanup, and wallet reconciliation. It remains protected by `CRON_SECRET` (with `INTERNAL_CRON_SECRET` retained as a local/manual compatibility fallback).
