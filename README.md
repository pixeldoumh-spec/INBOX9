# INBOX9

INBOX9 is an India-focused OTP marketplace with a mobile-first customer app backed by a stable Node/PostgreSQL API.

## Repository boundary

The repository contains the customer app, server/API, PostgreSQL migrations, authentication, wallet and UPI recharge controls, activation lifecycle, provider gateway, synthetic QA infrastructure, admin APIs, observability, CI, reconciliation, and deployment configuration.

The customer app lives under `/frontend` and is served by the same Node runtime. It calls the backend only through same-origin `/api/*` endpoints.

## Customer app

Implemented customer routes:

- `/login`
- `/register`
- `/apps`
- `/apps/service/:serviceId`
- `/buy`
- `/active`
- `/active/:activationId`
- `/wallet`
- `/notifications`
- `/support`
- `/account`

The Apps launcher renders the active 193-service catalog. Service logos use the committed HD artwork bundle where supplied assets are available, with deterministic text fallback for missing assets.

## Activation lifecycle

Customer flow:

```text
Apps / Buy
   ↓
Service detail
   ↓
Wallet balance check
   ↓
POST /api/activations
   ↓
Active activation
   ↓
number + OTP status polling
   ↓
Completed / Expired / Refunded / Cancelled
```

The frontend sends an idempotency key for every purchase request, invalidates wallet/activation queries after state changes, supports copy-to-clipboard, displays lifecycle-specific states, and exposes cancellation/refund results.

Production activation remains fail-closed until an approved real provider route is configured. The synthetic fulfillment engine is not exposed as production customer inventory.

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

The active service catalog contains 193 India (`IN`) / INR entries from the cleaned 2026-09-25 service list.

Service IDs are stable slugs (`svc-<slug>`) and do not depend on list position. Historical PostgreSQL service rows are preserved as inactive records when the catalog is replaced.

## Local development

Requirements: Node.js 22+.

```bash
npm run check
npm test
npm start
```

The server listens on `http://localhost:4173` by default.

Frontend build:

```bash
npm run build --prefix frontend
```

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
Customer app (/frontend)
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

`npm run virtualsms:preflight` performs purchase-blocked provider readiness checks. Customer routing remains disabled until provider credentials, India inventory, authorization, mappings, and canary controls are verified.
