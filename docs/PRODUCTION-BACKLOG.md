# Production Backlog

INBOX9 is currently synthetic-only. The checklist below distinguishes completed platform hardening from work required before any real upstream provider or real-payment integration.

## P0 — before any real external integration
- [x] PostgreSQL persistence for users, wallets, ledger, activations and synthetic inventory
- [x] Authentication/session management
- [x] Resource ownership checks
- [x] Idempotency for purchase/cancel operations
- [x] Server-authoritative wallet ledger with immutable entries
- [x] Synthetic activation state machine persisted transactionally
- [x] Rate limiting and production fail-closed behavior
- [x] Audit logging for financial/admin actions
- [x] Synthetic inventory concurrency guard
- [x] Production CSRF/same-origin controls on state-changing browser routes
- [x] Production database TLS verification defaults
- [x] Client-facing marketplace terminology cleanup
- [ ] Real payment webhook verification and settlement reconciliation
- [ ] Authorized external provider adapter with secret isolation
- [ ] Real SMS/number-provider compliance and operational controls

## P1 — beta/operations
- [x] Admin console
- [x] Synthetic provider health dashboard
- [x] Pricing and inventory controls
- [x] Background reconciliation jobs
- [x] Structured request IDs and failure logging
- [x] Automated unit/integration checks in CI
- [ ] Full browser/device E2E coverage
- [ ] Error monitoring/alerting integration
- [ ] Production metrics/trace dashboards
- [ ] Disaster-recovery rehearsal and restore verification

## P2 — scale
- [ ] Redis/cache layer beyond rate limiting
- [ ] Queue for high-volume provider polling/callback processing
- [ ] Multi-provider routing/failover
- [ ] Analytics
- [ ] Customer-support tooling

## TASK-006 observations
- The local dev-server mock path is intentionally non-production and should not be exposed as the production runtime.
- Real payments and real provider traffic remain explicitly out of scope for the synthetic-only release.
- Physical browser/device validation remains separate from repository CI.
