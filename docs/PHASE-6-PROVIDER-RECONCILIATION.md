# Phase 6 — Provider Reconciliation & Operations

Phase 6 makes provider reconciliation an auditable operational process instead of an opaque retry loop.

## Reconciliation journal

Every protected reconciliation invocation creates a `provider_reconciliation_runs` record and records individual outcomes in `provider_reconciliation_events`.

The journal captures:

- run status and counts;
- provider operation/activation references;
- success, failure, retryable and manual-review outcomes;
- provider status and provider activation ID;
- bounded error information;
- orphan allocation evidence.

## Orphan allocation protection

An activation is flagged for manual review when it has a provider activation ID but its provider is missing or inactive while the customer-facing activation is still live/pending. Phase 6 does **not** guess whether such an upstream allocation should be cancelled or refunded.

That is deliberate: an uncertain upstream allocation must not be double-cancelled or refunded without evidence.

## Existing lifecycle reconciliation retained

The existing two-phase cancellation and expiration reconciliation remains the source of truth:

1. claim the operation in PostgreSQL;
2. perform provider I/O outside the DB transaction;
3. re-lock and apply only the still-valid lifecycle transition;
4. release synthetic inventory exactly once;
5. record failure/retry state when provider confirmation is unavailable.

Phase 6 adds evidence and operational visibility around that flow; it does not weaken the existing safety guards.

## Admin visibility

The existing admin provider-operations endpoint supports the reconciliation view:

`GET /api/admin/provider-operations?view=reconciliation`

It remains admin-authenticated and rate-limited.

## Production state

External routing remains disabled by the Phase 5 production guard. Phase 6 does not enable third-party allocation automatically.

## Verification baseline

At deployment time the production database must show:

- reconciliation journal tables present;
- zero open orphan allocations unless explicitly accepted for manual review;
- no unexpected pending provider operations;
- GitHub release/test/recovery gates green;
- Render health endpoint returning HTTP 200.
