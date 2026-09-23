# Deployment & Operations

INBOX9 uses one Node HTTP runtime (server.js) locally and one Vercel catch-all API function in production. Public /api/* URLs remain stable while the implementation modules are kept out of Vercel's function discovery.

## Local development

Requirements: Node.js 22.x.

```bash
npm run check
npm test
npm start
```

The local server listens on port 4173 by default.

Basic checks:

```bash
curl http://localhost:4173/api/health
curl http://localhost:4173/api/services
```

For a full synthetic lifecycle smoke:

```bash
npm run staging:smoke
```

Without PostgreSQL, local development intentionally uses the mock session mode and in-memory synthetic activation lifecycle. This mode is not production.

## Hosting

Production requires:

- Node.js 22.x.
- Persistent PostgreSQL for account, wallet, activation and inventory state.
- Shared Redis-compatible rate limiting.
- HTTPS and a stable `APP_ORIGIN`.
- Secure environment variables.
- A configured `CRON_SECRET`.

Current production Vercel deployment uses the `Other` framework preset and a single `api/[...path].js` catch-all function to stay within the Vercel Hobby Serverless Function limit.

## Environment

Start from `.env.example` or `.env.staging.example`. Never commit real credentials.

Required production variables:

```text
NODE_ENV=production
INBOX9_RUNTIME_MODE=synthetic
DATABASE_URL=
DATABASE_SSL=true
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
APP_ORIGIN=https://your-production-origin.example
CRON_SECRET=<long-random-secret>
INBOX9_UPI_ID=<your-UPI-ID>
```

The current catalog/activation provider is intentionally synthetic QA infrastructure. It generates deterministic, non-routable test identities and six-digit OTPs; it is not a live telecom/SMS provider.

When `NODE_ENV=production` and `INBOX9_RUNTIME_MODE=synthetic` (the default when the variable is absent), Vercel can run the customer-facing synthetic flow without PostgreSQL or Upstash Redis. Authentication, wallet credits, and activation lifecycle are synthetic test state; Vercel serverless instances are not treated as a durable database. Synthetic accounts receive test credits only, and OTPs are generated locally after the configured 20-second delay. Set `INBOX9_RUNTIME_MODE=postgres` and provide the required persistent-production variables before enabling persistent account/wallet traffic.

## Reconciliation

Production reconciliation is scheduled natively by Vercel on a Hobby-compatible daily schedule:

```text
GET /api/cron/reconcile
Schedule: 0 3 * * *  (03:00 UTC daily)
Authorization: Bearer <CRON_SECRET>
```

Vercel Hobby permits daily Cron Jobs; more frequent schedules require a plan that supports them. The application does not depend on the cron for user-triggered cancellation or activation OTP polling: cancellation is synchronous and activation status is reconciled when the user polls it. The cron provides periodic cleanup, expiration reconciliation for abandoned activations, wallet reconciliation, and session cleanup. The existing authenticated POST form remains available for an external scheduler if tighter reconciliation cadence is required.

Vercel's cron configuration lives in `vercel.json`.

## Staging validation

For persistent staging:

1. Provision PostgreSQL and apply the migrations.
2. Run `npm run db:verify` and require `ok: true`.
3. Run `npm run staging:smoke`.
4. Run `npm run issue9:e2e` and `npm run synthetic:smoke`.
5. Confirm a synthetic activation reaches Completed and returns a six-digit OTP after 20 seconds.
6. Confirm the wallet debit/refund and activation state in PostgreSQL.

## Production readiness gate

Before real customer traffic:

1. Configure all production variables.
2. Confirm `/api/health` reports all required production dependencies ready.
3. Confirm Vercel deployment is `READY`.
4. Run `npm run check` and `npm test` in CI.
5. Run the E2E and synthetic smoke suite against staging.
6. Verify the Vercel Cron is active and that daily reconciliation logs show successful runs; use an external scheduler or a higher Vercel plan when sub-daily reconciliation is required.
7. Confirm the current provider mode is understood as synthetic, not live telecom fulfillment.
