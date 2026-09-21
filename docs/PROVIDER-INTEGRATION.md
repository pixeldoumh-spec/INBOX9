# Provider Integration Contract

INBOX9 keeps all upstream number-provider integrations behind a server-only adapter boundary.

```text
Browser
  ↓
INBOX9 API
  ↓
Provider Router
  ↓
Provider Adapter
  ↓
Authorized upstream API
```

## Adapter

```js
createProviderAdapter({
  listServices,
  reserveNumber,
  getActivation,
  cancelActivation,
  health
})
```

The adapter returns normalized activations containing:

```json
{
  "providerActivationId": "...",
  "number": "+91 ...",
  "status": "Active",
  "otp": null,
  "createdAt": 0,
  "expiresAt": 0,
  "metadata": {}
}
```

## Routing

Providers are stored in PostgreSQL and service routes are ordered by priority. The API selects the first active route for a service.

The current production-safe development route is:

`all services → INBOX9 Mock Provider`

No real provider credentials are included in the repository.

## Transaction boundary

Reservation is attempted before the wallet/database transaction so an upstream network call does not hold database locks. If persistence fails after reservation, INBOX9 calls the provider cancellation operation as compensation.

Cancellation similarly requires a successful provider cancellation before issuing the wallet refund.

## Production requirements

Before activating any real adapter:

- provider API must be authorized for the intended use
- credentials must be server-side environment secrets
- provider rate limits must be respected
- requests need idempotency keys where supported
- provider errors must be normalized
- provider health must be monitored
- audit logs must record lifecycle transitions
- financial actions must remain inside INBOX9's authoritative wallet ledger
