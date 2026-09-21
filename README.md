# INBOX9 — India OTP Marketplace

India-only OTP marketplace powered by an internal synthetic number and OTP engine.

## Current release

- 76 supplied India service catalog entries.
- Responsive marketplace, active-number, orders, wallet and API screens.
- LocalStorage-backed demo session state.
- Vercel-compatible /api functions.
- Single internal synthetic fulfillment engine for numbers and OTP lifecycle.
- Synthetic inventory is presented as 11 server chunks per service (5,000 slots total: ten 455-slot chunks plus one 450-slot chunk). Selecting a server constrains synthetic slot allocation to that chunk.
- Security headers, integer paise pricing, payload limits and accessibility improvements.
- 25-track engineering review documented in docs/25-AGENT-REVIEW.md.

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
   Internal Synthetic Engine
          │
          └── synthetic number/OTP lifecycle

Production persistence, auth, wallet ledger and rate limits use PostgreSQL/Redis and are not faked in production.
```

## Vercel

Import the repository root into Vercel. The frontend is in `public/`; API routes are in `api/`. See `docs/DEPLOYMENT.md`.

Vercel environment variables must be used for database, cache, session, cron, and application secrets; never commit secrets.

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

### Local admin preview

For a local development preview only, set `INBOX9_LOCAL_ADMIN_EMAIL` to the exact email you will use to sign in. This development-only override is ignored when `NODE_ENV=production`.

## Recent hardening

- Issue 1: PostgreSQL is the runtime source of truth for service configuration.
- Issue 2: Activation lifecycle uses durable reconciliation.
- Issue 3: Activation creation uses durable idempotency keys to prevent duplicate purchases.
- Issues 6–9: provider I/O boundaries, expiration reconciliation, session lifecycle hardening, and E2E/concurrency certification are implemented.

## Current release

`v0.8.13` — synthetic-only fulfillment engine and external-provider removal, with server-chunked synthetic inventory.

## Synthetic fulfillment

All 76 catalog services use the internal synthetic engine. It creates up to 5,000 synthetic slots per service and deterministic six-digit OTPs. These are generated locally for the INBOX9 lifecycle and do not originate from real telecom numbers or external SMS providers.

## Certification

- `npm run check` — syntax validation
- `npm test` — automated test suite
- `npm run issue9:e2e` — local end-to-end and concurrency certification
- `npm run synthetic:smoke` — 76-service / 5,000-slot synthetic inventory verification
