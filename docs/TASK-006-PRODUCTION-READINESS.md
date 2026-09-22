# TASK-006 — System-wide Production Readiness Audit

## Scope
Audit performed against the consolidated main after TASK-002, TASK-003 and TASK-005.

Areas reviewed: authentication/session lifecycle, request guards, admin APIs, CSRF/same-origin controls, rate limiting, PostgreSQL connectivity/TLS, synthetic fulfillment, reconciliation, wallet/ledger accounting, admin auditability, deployment configuration and CI coverage.

## Confirmed findings and remediation

### P1 — Sensitive admin read routes lacked common security headers and rate limiting
Confirmed. Several admin GET endpoints relied on authentication but did not apply the repository's common no-store/security headers, request IDs and route-level rate limiting.

Fixed. Added common security headers/request IDs and rate limits to admin overview, users, services, activations, ledger, audit, providers, provider health and pending recharges endpoints.

### P1 — Wallet reconciliation write route lacked browser-origin and payload guards
Confirmed. POST /api/admin/wallet-reconciliation performed a privileged state-changing reconciliation operation without the same-origin guard, request body bound or route rate limiting used by other state-changing routes.

Fixed. Added rate limiting, production same-origin enforcement, payload size validation and common security headers.

### P1 — PostgreSQL SSL verification was disabled by default
Confirmed. SSL was enabled by default, but the pg configuration used rejectUnauthorized: false whenever no explicit CA was supplied.

Fixed. Certificate verification is now enabled by default. Private/self-signed deployments can provide DATABASE_SSL_CA. Explicitly setting DATABASE_SSL_REJECT_UNAUTHORIZED=false remains possible but is no longer the secure default.

### P2 — Login response disclosed account existence
Confirmed. Missing users received a distinct account-not-found response while wrong passwords returned invalid email or password.

Fixed. Both cases now return the generic invalid-credentials response.

### P2 — Reconciliation endpoint exposed unnecessary compatibility surface
Confirmed. The internal reconciliation endpoint accepted GET and supported an undocumented INTERNAL_CRON_SECRET fallback.

Fixed. The endpoint is POST-only and authenticates with CRON_SECRET, matching the repository's scheduled job script and deployment documentation.

## Positive controls re-verified
- Session tokens are opaque random values stored only as hashes.
- Sessions have bounded lifetime and per-user count.
- State-changing browser routes use rate limiting plus same-origin checks.
- Wallet mutations are transactional and ledger-backed.
- Recharge approval requires independently supplied amount and UTR evidence.
- Synthetic slot reservations use a durable PostgreSQL uniqueness gate.
- Synthetic terminal stock restoration is transactionally guarded.
- Provider I/O is kept outside lifecycle database locks.
- CI provisions PostgreSQL for wallet concurrency coverage.
- Health readiness checks production dependencies.

## Remaining release conditions
- Physical browser/device validation is still not represented by repository CI.
- Production backup/restore and disaster-recovery rehearsal remain deployment-level work.
- Error monitoring and operational metrics are not yet integrated.
- Real payment/provider integrations remain intentionally absent because INBOX9 is synthetic-only.

## Validation
TASK-006 adds focused regression tests plus the existing full repository suite. Release acceptance is based on the resulting GitHub Actions run rather than local-only assertions.
