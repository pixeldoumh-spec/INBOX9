# INBOX9 Post-Audit Hardening — v0.8.9

## Completed

1. **Vercel Cron authentication and plan-safe scheduling**
   - `/api/internal-provider-reconcile` accepts the Vercel `Authorization: Bearer <CRON_SECRET>` form.
   - `INTERNAL_CRON_SECRET` remains a manual/local compatibility fallback.
   - Constant-time comparison is used after length validation.
   - The default Vercel config no longer registers an every-minute cron that would fail on Hobby. A portable GitHub Actions reconciler runs every five minutes; Pro/Enterprise can use a Vercel Cron instead.

2. **Activation status polling protection**
   - `GET /api/activations/:id` now uses shared rate limiting when Redis is configured.
   - Rate-limit scope combines client IP with a hashed user/activation scope.
   - The activation-list endpoint is also scoped and rate-limited.

3. **Durable order history**
   - The frontend now hydrates Orders from persisted `/api/activations` data instead of treating localStorage as the source of truth.
   - Active numbers are derived from lifecycle state.
   - Terminal activations leave the Active screen while remaining visible in Orders.

4. **Atomic financial audit trail**
   - Recharge approve/reject/flag operations now insert their audit event inside the same PostgreSQL transaction as the financial/recharge state change.
   - The old post-transaction duplicate audit write was removed.

5. **Production readiness health**
   - Production health now requires shared rate limiting, `APP_ORIGIN`, and the Vercel `CRON_SECRET` in addition to reachable PostgreSQL.
   - Health reports whether a legacy manual cron fallback is present.

6. **PostgreSQL TLS option**
   - `DATABASE_SSL_CA` can now be supplied to enable strict CA verification.
   - Existing managed-database behavior remains compatible when no CA bundle is supplied.

7. **CI baseline**
   - Added GitHub Actions CI running syntax validation, unit/integration tests, the local Issue 9 E2E suite, and a basic secret-pattern scan.

8. **Documentation cleanup**
   - Deployment docs now reference `dev-server.js`, `CRON_SECRET`, and the current staging gate.

## Validation

- `npm test` — 37/37 passed
- `npm run check` — passed
- `npm run issue9:e2e` — passed

## Still requires real infrastructure

These items are intentionally not marked as passed because they require external infrastructure/credentials:

- Staging PostgreSQL concurrency certification
- Vercel deployment and real Cron invocation
- Authorized real provider sandbox/integration
- Automated bank/UPI reconciliation feed
- Backup/restore drill against the real production database
- Production penetration test

## Release

Version: `0.8.9`


Shelex is intentionally not a production activation provider; see `docs/PROVIDER-SHELEX-ASSESSMENT.md`.
