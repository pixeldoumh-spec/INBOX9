# Issue 6 — Provider Calls Outside Database Locks

## Status
Complete in v0.8.5.

## Problem
The activation status path previously opened a PostgreSQL transaction and row lock before making a provider status request. Provider latency could therefore hold a database connection and activation row lock for the duration of external network I/O.

## Resolution
`api/_lib/activation-repository.js` now implements a two-phase read/sync workflow:

1. Read the activation snapshot without a transaction or row lock.
2. Call `provider.getActivation()` with no database transaction open.
3. If the provider returned an applicable state, open a short PostgreSQL transaction and lock the current activation row.
4. Only apply the provider result when the current activation is still `Active` and the provider state is one of `Active`, `Completed`, or `Expired`.
5. Ignore stale in-flight provider results when cancellation or another lifecycle operation has already changed the activation.
6. Restore inventory only when this update performs the actual `Active -> Expired` transition.

## Verification
- `npm test`: 23/23 passed.
- `npm run check`: passed.
- Added unit coverage for stale/terminal activation protection and unsupported/unchanged provider states.
- Live PostgreSQL verification remains an infrastructure gate because no PostgreSQL instance is provisioned in the current execution environment.
