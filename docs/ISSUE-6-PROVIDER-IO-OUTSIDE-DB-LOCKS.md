# Issue 6 — Provider I/O Outside Database Locks

## Problem
The activation status path previously opened a PostgreSQL transaction and row lock before calling the provider. Slow provider I/O could therefore hold a database connection and row lock for the duration of the network request.

## Resolution
`getActivation()` now uses a two-phase workflow:

1. Read the activation snapshot without a transaction or row lock.
2. Call the provider outside any open database transaction.
3. Open a short transaction and lock the current activation row.
4. Apply the provider result only when the current activation is still `Active` and the result is an allowed polling state (`Active`, `Completed`, or `Expired`).
5. Ignore stale provider results if cancellation or another lifecycle operation won the race.
6. Restore service inventory only on the actual `Active -> Expired` transition performed by this update.

## Result
Provider latency no longer holds PostgreSQL row locks, while the final state update remains serialized and race-safe.
