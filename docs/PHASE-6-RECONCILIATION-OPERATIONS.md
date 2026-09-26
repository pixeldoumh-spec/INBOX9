# Phase 6 — Provider Reconciliation & Operations

Phase 6 makes provider lifecycle reconciliation observable, single-flight, and safe to retry.

## Reconciliation journal

Every scheduled reconciliation gets a durable `provider_reconciliation_runs` record. Per-operation outcomes are recorded in `provider_reconciliation_events`. A partial failure leaves the run marked `Failed` instead of silently appearing successful.

A unique partial index permits only one `Running` reconciliation at a time, preventing overlapping cron runs from racing the same provider operations.

## Provider operation recovery

Existing cancellation and expiration reconciliation remains authoritative for provider I/O. Phase 6 adds a backlog query for provider operations that remain `Pending` for more than ten minutes. These are surfaced to admin rather than being auto-forced into a terminal state.

This is intentional: a timeout or unknown provider response must never be treated as proof that an external allocation was cancelled or never created.

## Expiration and refunds

Expiration is not a wallet refund. Refunds occur only after a confirmed cancellation operation. Terminal expiration/completion releases synthetic inventory through the existing guarded path.

## Admin operations

The admin provider endpoint now exposes:

- recent reconciliation runs;
- recent reconciliation events;
- unresolved provider-operation backlog;
- provider route circuit health;
- provider route attempts;
- the external-routing production gate.

Customer APIs do not expose this operational data.

## Production state

External provider routing remains disabled by default. Phase 6 does not activate Receive-SMS.io, SMS24.me, SMS Verification Number, or any other public/shared inbox source for customer fulfillment.
