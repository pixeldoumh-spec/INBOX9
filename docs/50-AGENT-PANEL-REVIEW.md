# INBOX9 — 50-Agent Engineering Panel Review

## Team-lead decision

The panel reviewed the current MVP as a complex full-stack product and treated the current implementation as a demo foundation, not as production-ready payment/number infrastructure.

## Panel composition

1. Principal architect — system boundaries
2. Staff frontend engineer — UI architecture
3. Staff backend engineer — API architecture
4. Full-stack engineer — end-to-end flow
5. React specialist — component/state model
6. JavaScript specialist — browser correctness
7. TypeScript specialist — type-safety roadmap
8. CSS/UI engineer — responsive system
9. UX researcher — purchase funnel
10. Accessibility engineer — WCAG
11. Mobile web engineer — Android/mobile UX
12. API designer — REST semantics
13. Serverless engineer — Node API runtime
14. Node.js engineer — runtime correctness
15. PostgreSQL engineer — persistence model
16. Data-model engineer — entities/relationships
17. Transaction engineer — wallet ledger
18. Payments engineer — checkout/webhooks
19. Authentication engineer — sessions
20. Authorization engineer — ownership/RBAC
21. Security engineer — threat model
22. Application-security engineer — injection/XSS
23. Abuse-prevention engineer — rate limits/quotas
24. Privacy engineer — data minimization
25. Secrets engineer — credential handling
26. Provider-integration engineer — adapter boundary
27. Realtime engineer — activation updates
28. State-machine engineer — lifecycle correctness
29. Idempotency engineer — duplicate requests
30. Reliability engineer — failure modes
31. Observability engineer — logs/metrics
32. QA lead — acceptance testing
33. Test automation engineer — regression tests
34. Browser compatibility engineer — client support
35. Performance engineer — latency/bundle
36. Caching engineer — cache strategy
37. DevOps engineer — CI/CD
38. deployment engineer — production config
39. Database migration engineer — schema evolution
40. Backup/recovery engineer — durability
41. SRE — availability/incident response
42. Documentation engineer — developer docs
43. Product engineer — feature prioritization
44. Growth UX engineer — conversion without dark patterns
45. Admin-console engineer — operations tooling
46. FinOps engineer — provider/payment cost controls
47. Release engineer — release gates
48. Code-review lead — maintainability
49. Compliance reviewer — authorized-use boundaries
50. Team lead — consolidation and final decisions

## Findings

### P0 — must fix before any real traffic

- Browser localStorage must never be the source of truth for money, orders, or activation ownership.
- Mock in-memory state must not be presented as production persistence.
- Real provider credentials must remain server-side.
- Every paid action needs authentication, authorization, idempotency, and a durable transaction record.
- Wallet refunds must be ledger operations, not client-side balance increments.
- Provider callbacks/polling need durable activation state and reconciliation.

### P1 — required before public beta

- PostgreSQL persistence and migrations.
- Session authentication and user ownership checks.
- Server-authoritative wallet ledger.
- Payment provider + webhook reconciliation.
- Rate limits per user/IP/provider.
- Audit log for wallet and activation events.
- Structured error responses.
- API request IDs and observability.
- Automated API integration tests.
- Admin service/pricing/availability controls.
- Provider health and balance monitoring.

### P2 — product hardening

- Better service icons/branding without copying third-party trademarks/assets.
- Skeleton/loading states.
- Empty/error/retry states.
- Pagination for order history.
- Service availability freshness timestamps.
- Search/filter URL state.
- Better mobile table/card conversion.
- Account/security settings.
- Exportable transaction history.

## Changes applied in this review

- Added a deployment-agnostic `GET /api/activations/:id` function.
- Added a server-only provider adapter contract.
- Fixed package scripts so `dev` and `start` point to the same local preview server.
- Added this 50-agent review and implementation roadmap.
- Preserved the mock provider so no real SMS traffic is enabled by accident.

## Next implementation sprint

1. PostgreSQL schema + repository layer.
2. Authentication/session layer.
3. Server-side wallet ledger.
4. Activation persistence + state machine.
5. Provider adapter implementation for an authorized provider.
6. Idempotency keys and rate limiting.
7. Payment integration and webhook reconciliation.
8. Admin dashboard.
9. Integration/e2e tests.
10. CI + deployment platform preview deployment.

## Release rule

Do not connect a real number provider or real-money wallet until all P0 controls pass automated tests and the production environment has durable persistence, authentication, authorization, reconciliation and monitoring.
