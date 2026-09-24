# INBOX9 — Issue 3 Final Report

## Activation Idempotency

Status: COMPLETE
Version: 0.8.2

### Objective
Prevent duplicate activations and duplicate wallet debits caused by double-clicks, HTTP retries, or replayed requests.

### Production contract
Persistent activation creation requires an `Idempotency-Key` header.
The key is scoped to the authenticated user and is bound to a request fingerprint containing `serviceId`.

### Durable state
`activation_idempotency` stores:
- user id
- idempotency key
- request hash
- Processing / Completed / Failed state
- activation id
- original JSON response
- failure code/message
- timestamps and 24-hour expiry

The `(user_id, idempotency_key)` primary key prevents concurrent duplicate claims.

### Request outcomes
- First request: `201` and normal activation response.
- Completed replay: original `201` response with `X-Idempotent-Replay: true`.
- Same key, different request: `409 IDEMPOTENCY_KEY_REUSED`.
- Same key while processing: `409 IDEMPOTENCY_IN_PROGRESS` + `Retry-After: 2`.
- Safely compensated failures become `Failed` and may be retried with the same key.
- Provider compensation uncertainty keeps the key in `Processing`, preventing a duplicate purchase until reconciliation/manual action.

### Frontend behavior
The browser creates one stable key per logical purchase and stores it in the user's scoped demo state until the server confirms the result. Double-clicks are locally coalesced; a network retry reuses the same key.

### Cleanup
Completed/Failed records expire after 24 hours and are removed by the existing protected reconciliation cron. Processing records are retained so an uncertain provider operation cannot be duplicated silently.

### Verification
- `npm test`: 14/14 passed
- `npm run check`: passed
- Local HTTP smoke: same key returned the identical activation id and wallet balance, with `X-Idempotent-Replay: true` on the replay.

### Infrastructure caveat
Live PostgreSQL behavior still requires a provisioned PostgreSQL instance. The repository contains the migration and runtime implementation but this execution environment does not provide a live production database.
