# 25-Specialist Review & Change Assignment

This is a structured 25-track engineering review. It is not a claim that 25 separate autonomous developers executed code independently; the work was consolidated into one implementation pass.

| Agent | Specialty | Necessary change | Status |
|---|---|---|---|
| 01 | Product architecture | Separate demo/mock mode from production provider boundary | Done |
| 02 | UX research | Preserve fast marketplace flow while reducing ambiguity around mock mode | Done |
| 03 | Visual design | Normalize component/class structure and responsive layout | Done |
| 04 | Frontend architecture | Move browser state to a single state model with persistence | Done |
| 05 | Accessibility | Keyboard focus, labels, buttons, mobile navigation | Done |
| 06 | Frontend security | HTML escaping and removal of inline event-handler dependence | Done |
| 07 | API design | Separate Node API runtime from local development server | Done |
| 08 | Server validation | Validate service IDs and request size | Done |
| 09 | Money correctness | Represent INR prices as paise integers | Done |
| 10 | Activation lifecycle | Define reserve / active / completed / expired / refunded states | Done |
| 11 | Idempotency | Reserve/cancel idempotency boundary documented for production | Planned |
| 12 | Authentication | Production auth boundary documented; demo account remains local | Planned |
| 13 | Authorization | Production ownership checks required on activation mutations | Planned |
| 14 | Wallet | Keep wallet changes server authoritative; remove fake payment mutation | Done |
| 15 | Payment integration | Payment provider webhook/reconciliation boundary | Planned |
| 16 | Provider integration | Adapter interface for authorized upstream APIs only | Done |
| 17 | Persistence | Production database abstraction/migration plan | Planned |
| 18 | Observability | Health endpoint + deployment logging boundary | Done |
| 19 | Security headers | Add baseline browser hardening headers | Done |
| 20 | Abuse prevention | Rate limiting / quotas required before real traffic | Planned |
| 21 | Testing | Node syntax + API smoke + lifecycle tests | Done |
| 22 | deployment platform | deployment-agnostic public directory + /api Functions | Done |
| 23 | Performance | Avoid unnecessary dependencies and render only active panel on tick | Done |
| 24 | Documentation | Setup, provider contract, security, deployment docs | Done |
| 25 | Release engineering | Pre-deploy checklist and explicit mock-only gate | Done |

## Highest-priority remaining work before a real-money / real-provider launch

1. Persistent database and migrations.
2. Real authentication and authorization.
3. Server-side wallet ledger and payment webhooks.
4. Provider adapter with an authorized provider API.
5. Idempotency keys and concurrency controls.
6. Rate limiting, abuse controls and audit logs.
7. Production monitoring and alerting.
8. End-to-end browser test suite.

## Deployment gate

The app is suitable for **mock/demo deployment** after the local checks pass. It is **not** a declaration that the real-number / real-money production system is ready. Real provider credentials must remain server-side and provider use must be authorized.
