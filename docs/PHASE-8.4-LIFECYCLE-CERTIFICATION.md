# Phase 8.4 — Controlled Provider Lifecycle Certification

Phase 8.4 establishes the lifecycle certification boundary for authorized providers.

## Lifecycle contract

1. Preflight verifies credentials, live India catalog, exact service mapping, live price, reported stock, and provider health.
2. Synthetic lifecycle certification is non-billable and exercises reserve, activation polling, cancellation/refund, and cleanup.
3. External lifecycle certification is explicitly opt-in through a server-side feature flag and an exact confirmation token.
4. External canaries enforce a configurable maximum provider price and bounded polling interval.
5. A lifecycle is certified only when reserve succeeds and the provider reaches a terminal completed/cancelled/refunded outcome with clean internal reconciliation.
6. OTP values are never written to certification evidence.
7. Provider activation IDs are retained only as operational references.

## Provider-specific behavior

ASMS.ai documents reserve → poll with automatic refund when an unfilled order remains open; its documented REST interface does not provide a cancel endpoint in the current API docs. PVAPins documents reserve → poll through REST and does not document a REST cancellation operation. SMS Verification Number documents getNumber → getStatus → setStatus, including an explicit cancel state. These differences are represented by adapter capabilities rather than hidden fallbacks.

## Production gate

External routing remains disabled by default. A successful lifecycle certification is now surfaced in the Phase 7 readiness snapshot and is required for external production activation.

The deployed default is `INBOX9_RUN_BILLABLE_PROVIDER_CANARY=false`.

Running the external canary is intentionally not performed automatically by deployment because the reservation call spends provider balance. The framework requires explicit server configuration and confirmation.

Public/shared SMS sources remain outside customer fulfillment.