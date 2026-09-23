# Deployment & Operations

INBOX9 uses one Node HTTP runtime (server.js) locally and one Vercel catch-all API function in production. Public /api/* URLs remain stable while the implementation modules are kept out of Vercel's function discovery.

## Local development

Requirements: Node.js 22+.

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

- Node.js 22+.
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

## Reconciliation

Production reconciliation is now scheduled natively by Vercel:

```text
GET /api/cron/reconcile
Schedule: */5 * * * *
Authorization: Bearer <CRON_SECRET>
```

The handler only accepts this GET form when Vercel supplies its cron schedule header, or the existing authenticated POST form for an external scheduler. The old GitHub Actions scheduler was removed because its required repository secrets were not configured.

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
6. Verify the Vercel Cron is active and that reconciliation logs show successful runs.
7. Confirm the current provider mode is understood as synthetic, not live telecom fulfillment.
