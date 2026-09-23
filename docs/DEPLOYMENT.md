# Deployment & Operations

INBOX9 runs as one standalone Node.js 22 HTTP service. The same `server.js` serves the frontend and every `/api/*` route, so the application does not depend on a serverless platform adapter.

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

INBOX9 can run on any host that can execute Node.js 22 and expose an HTTP port.

The repository includes a Render Blueprint in `render.yaml` for a free Web Service deployment. Render's free service tier is intended for hobby/testing use and spins down after 15 minutes of inactivity; the next request can take about a minute to wake it. See the Render free-tier documentation for the current limits.

For an always-on zero-cost VM, Oracle Cloud's Always Free compute resources can host the same Node process directly. See Oracle's Always Free documentation for the current limits and account policies.

## Environment

Start from `.env.example` or `.env.staging.example`. Never commit real credentials.

Required production variables:

```text
NODE_ENV=production
INBOX9_RUNTIME_MODE=postgres
DATABASE_URL=<Supabase/PostgreSQL connection string>
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
APP_ORIGIN=https://your-public-host.example
CRON_SECRET=<long-random-secret>
INBOX9_ENABLE_RECHARGE=false
INBOX9_UPI_ID=
```

The current catalog/activation provider is intentionally synthetic QA infrastructure. It generates deterministic, non-routable test identities and six-digit OTPs; it is not a live telecom/SMS provider.

Production customer traffic should use `INBOX9_RUNTIME_MODE=postgres`. PostgreSQL is authoritative for accounts, sessions, wallets, recharges, activations, and order history. The synthetic provider remains the fulfillment engine and generates non-routable test numbers/OTPs.

Explicit `INBOX9_RUNTIME_MODE=synthetic` is reserved for controlled QA. In that mode, customer accounts start at ₹0.00, real UPI recharge is disabled, and browser storage is never the source of truth.

## Reconciliation

The reconciliation endpoint is host independent:

```text
POST /api/internal-provider-reconcile
Authorization: Bearer <CRON_SECRET>
```

The repository includes `.github/workflows/reconcile.yml`, which runs the authenticated POST once per day at 03:00 UTC and also supports manual execution.

Set these GitHub Actions repository secrets:

```text
INBOX9_CRON_URL=https://your-public-host.example/api/internal-provider-reconcile
INBOX9_CRON_SECRET=<same value as CRON_SECRET>
```

GitHub Free currently includes 2,000 hosted-runner minutes per month for private repositories, subject to the account plan allowance. The daily reconciliation job uses very little runner time.

## Free infrastructure

Supabase PostgreSQL is both the durable application store and the shared rate-limit store. This keeps the free Render deployment to one required stateful dependency instead of requiring a separate Redis service.

Supabase remains the PostgreSQL source of truth for this deployment.

## Staging validation

For persistent staging:

1. Provision PostgreSQL and apply the migrations.
2. Run `npm run db:verify` and require `ok: true`.
3. Run `npm run staging:smoke`.
4. Run `npm run issue9:e2e` and `npm run synthetic:smoke`.
5. Confirm a synthetic activation reaches Completed and returns a six-digit OTP after 20 seconds.
6. Confirm the wallet debit/refund and activation state in PostgreSQL.
7. Confirm `POST /api/internal-provider-reconcile` succeeds with the configured secret.

## Production readiness gate

Before real customer traffic:

1. Configure all production variables, including `INBOX9_RUNTIME_MODE=postgres`.
2. Confirm `/api/health` reports database reachability, PostgreSQL shared rate limiting, app origin, and cron configuration ready.
3. Confirm the active host deployment is healthy.
4. Run `npm run check` and `npm test` in CI.
5. Run the E2E and synthetic smoke suite against staging.
6. Verify the scheduled reconciliation workflow completes successfully.
7. Confirm the current provider mode is understood as synthetic, not live telecom fulfillment.
