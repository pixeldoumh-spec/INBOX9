# Step 1 — PostgreSQL Service Source of Truth

## Goal
Make PostgreSQL authoritative for every runtime service configuration controlled by administrators.

## Fixed
- Activation purchase now re-reads and locks the service row before charging the user.
- Runtime charge uses `services.price_paise`, not the static JSON/catalog price.
- Runtime currency/country/name also come from PostgreSQL.
- Service active state and stock are checked from PostgreSQL.
- `api/services` already serves active persisted services when PostgreSQL is enabled.
- Static catalog remains only the development fallback / seed source when no database is configured.

## Concurrency model
Provider reservation happens outside the DB transaction. The purchase transaction then locks the service row with `FOR UPDATE` and applies the authoritative price and stock. If the service changed or became unavailable while the provider reservation was in flight, the transaction fails and provider cancellation is attempted as compensation.

## Regression guard
`tests/runtime-service-source.test.js` prevents the old `service.pricePaise` charge path from returning.

## Verification
Run:

```bash
npm run check
npm test
```

A live PostgreSQL test remains an infrastructure requirement because this development environment does not have a managed PostgreSQL instance provisioned.
