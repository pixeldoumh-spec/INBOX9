# INBOX9 — Backend/API Foundation

INBOX9 is the backend foundation for an India-focused OTP marketplace. The customer frontend has been intentionally removed so a new frontend can be designed and implemented from scratch against the stable API.

## Repository boundary

The repository currently contains the server/API, PostgreSQL migrations, authentication, wallet and UPI recharge controls, activation lifecycle, provider gateway, synthetic QA infrastructure, admin APIs, observability, CI, reconciliation, and deployment configuration.

There is no customer frontend architecture in this repository:
- no browser application bundle
- no customer UI state/navigation layer
- no customer CSS shell
- no browser/device UI test harness

The root `/` endpoint serves only a minimal placeholder page. Replace it when building the new frontend.

## Backend surface

The Node runtime is `server.js`. It exposes:

- `/api/health`
- `/api/services`
- authentication/session/profile/recovery endpoints
- wallet and recharge endpoints
- activation and cancellation endpoints
- notifications and support endpoints
- admin operations and reconciliation endpoints
- payment webhook handling
- provider status/operations endpoints

The service catalog contains 832 India (`IN`) / INR entries.

## Local development

Requirements: Node.js 22+.

```bash
npm run check
npm test
npm start
```

The server listens on `http://localhost:4173` by default.

API lifecycle smoke:

```bash
npm run issue9:e2e
```

Synthetic inventory verification:

```bash
npm run synthetic:smoke
```

Staging-style runtime smoke:

```bash
npm run staging:smoke
```

## Architecture

```text
New frontend (to be built)
           │
           │ same-origin /api requests
           ▼
       server.js
           │
    ┌──────┼─────────────────────────┐
    ▼      ▼                         ▼
   Auth   Wallet / Payments       Activations
    │      │                         │
    └──────┴──────────┬──────────────┘
                       ▼
                  PostgreSQL
                       │
                       ▼
                Provider gateway
                   │       │
                   ▼       ▼
             Real provider  QA synthetic engine
```

Production runtime is explicitly configured for PostgreSQL. Synthetic fulfillment is reserved for non-production QA; production activation fails closed when a real provider route is not available.

## Wallet & UPI

Wallet balance and ledger state are PostgreSQL-authoritative. Recharge is manual UPI verification when enabled and configured. UTR submissions remain pending until authorized admin verification. No hardcoded payment destination is shipped.

## Admin and operations

Admin APIs require an account with database role `admin`. Reconciliation, provider operations, observability, and disaster-recovery workflows remain part of the repository.

## Provider readiness

`npm run virtualsms:preflight` performs the purchase-blocked provider readiness checks. Customer routing remains disabled until provider credentials, India inventory, authorization, mappings, and canary controls are verified.

## Building the new frontend

Start from the API contracts rather than adapting the removed UI. The frontend can be any stack and can be organized independently from the backend.

Useful first endpoints for discovery are:

```text
GET  /api/health
GET  /api/services
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
GET  /api/wallet
GET  /api/activations
POST /api/activations
```
