# INBOX9 — India OTP Marketplace

India-only OTP marketplace UI with a **mock activation backend** for development and testing.

## Current release

- 76 supplied India service catalog entries.
- Responsive marketplace, active-number, orders, wallet and API screens.
- LocalStorage-backed demo session state.
- Vercel-compatible `/api` functions.
- Provider adapter boundary for an authorized upstream provider.
- Security headers, integer paise pricing, payload limits and accessibility improvements.
- 25-track engineering review documented in `docs/25-AGENT-REVIEW.md`.

## Run locally

Requirements: Node.js 22+.

```bash
npm run check
npm test
npm start
```

Open `http://localhost:4173`.

## Architecture

```text
Browser UI
  ├── local demo state
  └── /api calls
          │
          ▼
   Vercel Node Functions
          │
          ▼
   ProviderAdapter boundary
          │
          └── authorized provider (future)

Production persistence, auth, wallet ledger and rate limits are intentionally separate and not faked in this MVP.
```

## Vercel

Import the repository root into Vercel. The frontend is in `public/`; API routes are in `api/`. See `docs/DEPLOYMENT.md`.

Vercel environment variables must be used for secrets; never commit provider keys.

## Safety / integration boundary

This repository does not automate interception of third-party verification flows. Real number and SMS functionality should only be added through provider APIs you are authorized to use, with server-side credentials and abuse controls.


## Sprint 3 — Wallet & UPI Recharge

Recharge is manual UPI verification: users pay to `8106204597@ptyes`, submit the UTR, and the wallet remains Pending until an authorized admin approves the request. Amounts are limited to ₹100–₹5,000. The supplied QR is served at `/payment-qr.jpg`.

When `DATABASE_URL` is configured, PostgreSQL is authoritative for wallet balance and ledger entries. Activation purchases debit the wallet atomically; cancellations credit a refund atomically.

To promote an existing user to admin in PostgreSQL:

```sql
UPDATE users SET role='admin' WHERE email='admin@example.com';
```

Admin recharge queue:
- `GET /api/admin/recharges`
- `POST /api/admin/recharges/:id` with `{ "decision": "approve" }` or `{ "decision": "reject", "reason": "..." }`

## Sprint 5 — Admin Operations

The admin control center is available only to accounts whose database role is `admin`.

Create an administrator after the first database-backed signup with:

```sql
UPDATE users SET role='admin' WHERE email='admin@example.com';
```

Production admin APIs require an authenticated session and the `admin` role. Administrative service changes, recharge approvals/rejections, and other operational actions are recorded in `audit_logs`.

### Local admin preview

For a local mock preview only, set `INBOX9_LOCAL_ADMIN_EMAIL` to the exact email you will use to sign in. This development-only override is ignored when `NODE_ENV=production`.

## Sprint 6 — Security & QA

Sprint 6 adds production security hardening: CSP/HSTS, request IDs, state-changing same-origin checks, endpoint rate limits, request-size validation, secure local password hashing, and security tests. Before production, set `APP_ORIGIN`, provision PostgreSQL, use a shared rate-limit store for multi-instance deployments, and run browser E2E against staging.


## Recent hardening
- Issue 1: PostgreSQL is the runtime source of truth for service configuration.
- Issue 2: Provider cancellation uses durable provider operations and reconciliation.
- Issue 3: Activation creation uses durable idempotency keys to prevent duplicate purchases.


## Current release
`v0.8.9` — durable activation expiration, scheduled reconciliation, and hardened account sessions.


## Sprint 8 — Session lifecycle hardening
Production authentication now supports: `POST /api/auth/logout-all`, `POST /api/auth/change-password`, session-version invalidation, a five-session default cap, 7-day absolute expiry, last-used tracking, and scheduled cleanup of expired sessions. Password changes invalidate every old session and transparently issue one fresh session to the device that changed the password.


## Certification
- `npm run check` — syntax validation
- `npm test` — automated test suite
- `npm run issue9:e2e` — local end-to-end and concurrency certification

## Provider note — Shelex

Shelex `free-otp-api` is integrated only as the `shelex-test` diagnostic adapter. It is not available for paid customer activations because its documented source model is public/shared SMS-testing numbers rather than exclusive number leases. Configure `SHELEX_TEST_BASE_URL` only for connectivity diagnostics.
