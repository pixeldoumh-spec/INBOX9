# INBOX9 Issue 3 — Activation Idempotency

## Goal
Prevent network retries, double-clicks, and concurrent duplicate activation requests from creating more than one activation or wallet debit.

## Contract
Persistent activation creation requires an `Idempotency-Key` request header. The same authenticated user + key must be reused for a logical retry.

The request fingerprint includes the selected `serviceId`.

### Outcomes
- First request: normal `201` response.
- Same user + same key + same request after completion: original `201` response with `X-Idempotent-Replay: true`.
- Same key + different request: `409 IDEMPOTENCY_KEY_REUSED`.
- Same key while the first request is still processing: `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 2`.
- A safely failed/compensated request is marked `Failed` and may retry with the same key.

## Database
`activation_idempotency` stores the request hash, lifecycle state, activation id, and the original JSON response. The `(user_id, idempotency_key)` primary key provides the concurrency guard.

## Important failure boundary
The provider reservation occurs before the final activation transaction so database locks are not held across network calls. If the final transaction fails, the provider reservation is compensated. If compensation itself fails, the idempotency record remains `Processing` with `PROVIDER_COMPENSATION_PENDING` so the request cannot create a duplicate reservation through a retry.

## Frontend behavior
Each logical purchase gets a stable client-generated key stored with the user's demo state until the server confirms the purchase. Double-clicks are locally coalesced, while retries after a network error reuse the same key. This avoids turning a lost response into a second paid activation.


## Retention
Completed and safely failed idempotency records expire after 24 hours. The existing protected reconciliation cron cleans expired terminal records, while  records are retained so a crash cannot silently permit a duplicate purchase.
