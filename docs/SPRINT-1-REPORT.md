# Sprint 1 — PostgreSQL + Persistent Activation Backend

## Status
Implementation complete; production database execution requires `DATABASE_URL` and the `pg` dependency installed by the deployment environment.

## Delivered
- PostgreSQL schema migration `db/migrations/001_initial.sql`.
- Deterministic seed for the 76 India services.
- `services` and `activations` tables with constraints and indexes.
- Lazy PostgreSQL pool in `api/_lib/db.js`.
- Transaction helper with BEGIN/COMMIT/ROLLBACK.
- Persistent activation repository with row locking.
- Persistent activation state transitions for mock OTP completion and expiry.
- Persistent cancellation/refund amount recording.
- Persistent service catalog reads when `DATABASE_URL` is configured.
- Mock mode remains available locally when no database URL exists.
- `npm run db:migrate` migration command.

## Persistence contract

```text
POST /api/activations
  -> validate service
  -> DB transaction
  -> INSERT activation
  -> return persisted activation

GET /api/activations/:id
  -> transaction
  -> SELECT ... FOR UPDATE
  -> reconcile mock OTP / expiry
  -> return persisted state

POST /api/activations/:id/cancel
  -> transaction
  -> SELECT ... FOR UPDATE
  -> Active => Refunded + refund_paise
  -> return persisted state
```

## Verification
- `npm run check` — PASS.
- `npm test` — PASS (2/2).
- Migration syntax/seed sanity — PASS; 76 service rows generated.
- A live PostgreSQL integration test could not be executed in this build environment because no local PostgreSQL server is available and package installation for `pg` timed out. The production package declares `pg` and the deployment environment will install it.

## Sprint 1 acceptance
- [x] Persistent schema defined.
- [x] Activation state no longer depends on process memory when `DATABASE_URL` is configured.
- [x] Database transactions used for create/read-transition/cancel.
- [x] Row locking protects activation mutation races.
- [x] Service catalog has a database seed.
- [x] Server restart persistence is supported by architecture.
- [ ] Live DB integration verification — requires provisioned PostgreSQL.
- [ ] User ownership/authorization — Sprint 2.
- [ ] Financial wallet ledger — Sprint 3.
