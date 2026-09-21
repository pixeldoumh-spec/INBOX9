# Production Backlog

## P0 — blocking
- [ ] PostgreSQL persistence for users, wallets, ledger, activations, SMS events and orders
- [ ] Authentication/session management
- [ ] Resource ownership checks
- [ ] Idempotency for purchase/cancel/payment operations
- [ ] Server-authoritative wallet ledger with immutable entries
- [ ] Payment webhook verification and reconciliation
- [ ] Authorized provider adapter with secret isolation
- [ ] Activation state machine persisted transactionally
- [ ] Rate limiting and abuse controls
- [ ] Audit logging

## P1 — beta
- [ ] Admin console
- [ ] Provider health/balance dashboard
- [ ] Pricing and margin controls
- [ ] Background reconciliation jobs
- [ ] Structured logging and request IDs
- [ ] API integration tests
- [ ] E2E browser tests
- [ ] Error monitoring

## P2 — scale
- [ ] Redis/cache layer
- [ ] Queue for provider polling/callback processing
- [ ] Multi-provider routing/failover
- [ ] Analytics
- [ ] Customer support tooling

## Senior review fix — Step 1
- [x] PostgreSQL service price/stock/availability is authoritative at purchase time.
- [x] Activation charges use the locked service row.
- [x] Static catalog is fallback/seed only when DB is unavailable.
