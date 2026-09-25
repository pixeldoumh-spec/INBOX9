# INBOX9 — India OTP Marketplace

India-focused OTP marketplace with a persistent customer platform and provider-routing architecture. Synthetic numbers/OTPs are internal QA tooling only.

## Current release

`v0.8.15` — persistent customer state with PostgreSQL-backed accounts/wallet/orders and a server-side synthetic fulfillment engine.

- 832 supplied India service catalog entries.
- Responsive customer marketplace, active-number, orders and wallet screens.
- Customer UI hides synthetic infrastructure such as server partitions and slot ranges.
- One Node runtime (`server.js`) serves the browser and mounts the existing API modules.
- Provider gateway with normalized fulfillment lifecycle, timeouts, error normalization and health checks.
- Synthetic inventory remains isolated for non-production QA; production customer activation fails closed when no real provider route is available.
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

Full synthetic lifecycle smoke:

```bash
npm run staging:smoke
```

## Architecture

```text
Browser UI
   │
   └── same-origin /api calls
           │
           ▼
       server.js
           │
           ├── auth / wallet / activation route modules
           │
           ▼
   PostgreSQL (persistent staging/production)
           │
           ▼
     Provider router
       │        │
       ▼        ▼
   Real provider  QA synthetic engine
```

Production is explicitly configured as `postgres`. Persistent customer traffic uses PostgreSQL as the source of truth. Synthetic mode is reserved for non-production QA and never grants a starting wallet balance or exposes a payment destination.

## Wallet & UPI Recharge

Wallets start at ₹0.00. Recharge is manual UPI verification only when `INBOX9_ENABLE_RECHARGE=true`, `DATABASE_URL` is configured, and `INBOX9_UPI_ID` is explicitly supplied. UTR submission remains Pending until an authorized admin approves it. No hardcoded UPI destination or QR asset is shipped in the repository.

PostgreSQL is authoritative for wallet balance, ledger entries, recharge requests, and activation purchases. Activation purchases debit the wallet atomically; cancellations credit refunds atomically.

## Admin Operations

The admin control center is available only to accounts whose database role is `admin`.

For a local admin preview only, set `INBOX9_LOCAL_ADMIN_EMAIL` to the exact email you will use to sign in. This development-only override is ignored when `NODE_ENV=production`.

## Synthetic fulfillment

All 832 catalog services use the internal synthetic engine. It creates up to 5,000 synthetic slots per service and deterministic six-digit OTPs. These are generated locally for the INBOX9 lifecycle and do not originate from real telecom numbers or external SMS providers.

Customer-facing screens intentionally do not expose the internal 11-server partitioning or slot ranges.

## Certification

- `npm run check` — syntax validation
- `npm test` — automated test suite, including runtime/API wiring
- `npm run issue9:e2e` — local end-to-end and concurrency certification
- `npm run synthetic:smoke` — 832-service / 5,000-slot synthetic inventory verification
- `npm run staging:smoke` — register → catalog → activation → 20-second OTP lifecycle smoke


### VirtualSMS canary

`npm run virtualsms:preflight` is the local purchase-blocked provider readiness check. The manual GitHub Actions workflow `.github/workflows/virtualsms-preflight.yml` provides the same verification using GitHub Actions Secrets and never permits a purchase operation. Run `inventory` first; use `canary-ready` only after written resale authorization and explicit service mappings are configured. Customer routing remains disabled until the provider account, India inventory, authorization, mappings and canary settings are verified.
